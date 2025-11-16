import db from "./db/schema";
import {
	authenticateUser,
	cleanupExpiredSessions,
	createSession,
	createUser,
	deleteAllUserSessions,
	deleteSession,
	deleteSessionById,
	deleteTranscription,
	deleteUser,
	getAllTranscriptions,
	getAllUsersWithStats,
	getSession,
	getSessionFromRequest,
	getSessionsForUser,
	getUserBySession,
	getUserSessionsForUser,
	type UserRole,
	updateUserAvatar,
	updateUserEmail,
	updateUserEmailAddress,
	updateUserName,
	updateUserPassword,
	updateUserRole,
} from "./lib/auth";
import { handleError, ValidationErrors } from "./lib/errors";
import { requireAdmin, requireAuth } from "./lib/middleware";
import {
	createAuthenticationOptions,
	createRegistrationOptions,
	deletePasskey,
	getPasskeysForUser,
	updatePasskeyName,
	verifyAndAuthenticatePasskey,
	verifyAndCreatePasskey,
} from "./lib/passkey";
import { enforceRateLimit } from "./lib/rate-limit";
import { getTranscriptVTT } from "./lib/transcript-storage";
import {
	MAX_FILE_SIZE,
	TranscriptionEventEmitter,
	type TranscriptionUpdate,
	WhisperServiceManager,
} from "./lib/transcription";
import adminHTML from "./pages/admin.html";
import classHTML from "./pages/class.html";
import classesHTML from "./pages/classes.html";
import indexHTML from "./pages/index.html";
import settingsHTML from "./pages/settings.html";
import transcribeHTML from "./pages/transcribe.html";

// Environment variables
const WHISPER_SERVICE_URL =
	process.env.WHISPER_SERVICE_URL || "http://localhost:8000";

// Create uploads and transcripts directories if they don't exist
await Bun.write("./uploads/.gitkeep", "");
await Bun.write("./transcripts/.gitkeep", "");

// Initialize transcription system
console.log(
	`[Transcription] Connecting to Murmur at ${WHISPER_SERVICE_URL}...`,
);
const transcriptionEvents = new TranscriptionEventEmitter();
const whisperService = new WhisperServiceManager(
	WHISPER_SERVICE_URL,
	db,
	transcriptionEvents,
);

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Sync with Whisper DB on startup
try {
	await whisperService.syncWithWhisper();
	console.log("[Transcription] Successfully connected to Murmur");
} catch (error) {
	console.warn(
		"[Transcription] Murmur unavailable at startup:",
		error instanceof Error ? error.message : "Unknown error",
	);
}

// Periodic sync every 5 minutes as backup (SSE handles real-time updates)
setInterval(
	async () => {
		try {
			await whisperService.syncWithWhisper();
		} catch (error) {
			console.warn(
				"[Sync] Failed to sync with Murmur:",
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	},
	5 * 60 * 1000,
);

// Clean up stale files daily
setInterval(() => whisperService.cleanupStaleFiles(), 24 * 60 * 60 * 1000);

const server = Bun.serve({
	port: 3000,
	idleTimeout: 120, // 120 seconds for SSE connections
	routes: {
		"/": indexHTML,
		"/admin": adminHTML,
		"/settings": settingsHTML,
		"/transcribe": transcribeHTML,
		"/classes": classesHTML,
		"/class/:className": classHTML,
		"/api/auth/register": {
			POST: async (req) => {
				try {
					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "register", {
						ip: { max: 5, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { email, password, name } = body;
					if (!email || !password) {
						return Response.json(
							{ error: "Email and password required" },
							{ status: 400 },
						);
					}
					// Password is client-side hashed (PBKDF2), should be 64 char hex
					if (password.length !== 64 || !/^[0-9a-f]+$/.test(password)) {
						return Response.json(
							{ error: "Invalid password format" },
							{ status: 400 },
						);
					}
					const user = await createUser(email, password, name);
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					const userAgent = req.headers.get("user-agent") ?? "unknown";
					const sessionId = createSession(user.id, ipAddress, userAgent);
					return Response.json(
						{ user: { id: user.id, email: user.email } },
						{
							headers: {
								"Set-Cookie": `session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
							},
						},
					);
				} catch (err: unknown) {
					const error = err as { message?: string };
					if (error.message?.includes("UNIQUE constraint failed")) {
						return Response.json(
							{ error: "Email already registered" },
							{ status: 400 },
						);
					}
					return Response.json(
						{ error: "Registration failed" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/auth/login": {
			POST: async (req) => {
				try {
					const body = await req.json();
					const { email, password } = body;
					if (!email || !password) {
						return Response.json(
							{ error: "Email and password required" },
							{ status: 400 },
						);
					}

					// Rate limiting: Per IP and per account
					const rateLimitError = enforceRateLimit(req, "login", {
						ip: { max: 10, windowSeconds: 15 * 60 },
						account: { max: 5, windowSeconds: 15 * 60, email },
					});
					if (rateLimitError) return rateLimitError;

					// Password is client-side hashed (PBKDF2), should be 64 char hex
					if (password.length !== 64 || !/^[0-9a-f]+$/.test(password)) {
						return Response.json(
							{ error: "Invalid password format" },
							{ status: 400 },
						);
					}
					const user = await authenticateUser(email, password);
					if (!user) {
						return Response.json(
							{ error: "Invalid email or password" },
							{ status: 401 },
						);
					}
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					const userAgent = req.headers.get("user-agent") ?? "unknown";
					const sessionId = createSession(user.id, ipAddress, userAgent);
					return Response.json(
						{ user: { id: user.id, email: user.email } },
						{
							headers: {
								"Set-Cookie": `session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
							},
						},
					);
				} catch {
					return Response.json({ error: "Login failed" }, { status: 500 });
				}
			},
		},
		"/api/auth/logout": {
			POST: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (sessionId) {
					deleteSession(sessionId);
				}
				return Response.json(
					{ success: true },
					{
						headers: {
							"Set-Cookie":
								"session=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax",
						},
					},
				);
			},
		},
		"/api/auth/me": {
			GET: (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				return Response.json({
					email: user.email,
					name: user.name,
					avatar: user.avatar,
					created_at: user.created_at,
					role: user.role,
				});
			},
		},
		"/api/passkeys/register/options": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);
					const options = await createRegistrationOptions(user);
					return Response.json(options);
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys/register/verify": {
			POST: async (req) => {
				try {
					const _user = requireAuth(req);
					const body = await req.json();
					const { response: credentialResponse, challenge, name } = body;

					const passkey = await verifyAndCreatePasskey(
						credentialResponse,
						challenge,
						name,
					);

					return Response.json({
						success: true,
						passkey: {
							id: passkey.id,
							name: passkey.name,
							created_at: passkey.created_at,
						},
					});
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys/authenticate/options": {
			POST: async (req) => {
				try {
					const body = await req.json();
					const { email } = body;

					const options = await createAuthenticationOptions(email);
					return Response.json(options);
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys/authenticate/verify": {
			POST: async (req) => {
				try {
					const body = await req.json();
					const { response: credentialResponse, challenge } = body;

					const { user } = await verifyAndAuthenticatePasskey(
						credentialResponse,
						challenge,
					);

					// Create session
					const ipAddress =
						req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
						req.headers.get("x-real-ip") ||
						"unknown";
					const userAgent = req.headers.get("user-agent") || "unknown";
					const sessionId = createSession(user.id, ipAddress, userAgent);

					return Response.json(
						{
							email: user.email,
							name: user.name,
							avatar: user.avatar,
							created_at: user.created_at,
							role: user.role,
						},
						{
							headers: {
								"Set-Cookie": `session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
							},
						},
					);
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const passkeys = getPasskeysForUser(user.id);
					return Response.json({
						passkeys: passkeys.map((p) => ({
							id: p.id,
							name: p.name,
							created_at: p.created_at,
							last_used_at: p.last_used_at,
						})),
					});
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys/:id": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);
					const body = await req.json();
					const { name } = body;
					const passkeyId = req.params.id;

					if (!name) {
						return Response.json({ error: "Name required" }, { status: 400 });
					}

					updatePasskeyName(passkeyId, user.id, name);
					return Response.json({ success: true });
				} catch (err) {
					return handleError(err);
				}
			},
			DELETE: async (req) => {
				try {
					const user = requireAuth(req);
					const passkeyId = req.params.id;
					deletePasskey(passkeyId, user.id);
					return Response.json({ success: true });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/sessions": {
			GET: (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				const sessions = getUserSessionsForUser(user.id);
				return Response.json({
					sessions: sessions.map((s) => ({
						id: s.id,
						ip_address: s.ip_address,
						user_agent: s.user_agent,
						created_at: s.created_at,
						expires_at: s.expires_at,
					})),
				});
			},
			DELETE: async (req) => {
				const currentSessionId = getSessionFromRequest(req);
				if (!currentSessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(currentSessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				const body = await req.json();
				const targetSessionId = body.sessionId;
				if (!targetSessionId) {
					return Response.json(
						{ error: "Session ID required" },
						{ status: 400 },
					);
				}
				// Verify the session belongs to the user
				const targetSession = getSession(targetSessionId);
				if (!targetSession || targetSession.user_id !== user.id) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}
				deleteSession(targetSessionId);
				return Response.json({ success: true });
			},
		},
		"/api/user": {
			DELETE: (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}

				// Rate limiting
				const rateLimitError = enforceRateLimit(req, "delete-user", {
					ip: { max: 3, windowSeconds: 60 * 60 },
				});
				if (rateLimitError) return rateLimitError;

				deleteUser(user.id);
				return Response.json(
					{ success: true },
					{
						headers: {
							"Set-Cookie":
								"session=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax",
						},
					},
				);
			},
		},
		"/api/user/email": {
			PUT: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}

				// Rate limiting
				const rateLimitError = enforceRateLimit(req, "update-email", {
					ip: { max: 5, windowSeconds: 60 * 60 },
				});
				if (rateLimitError) return rateLimitError;

				const body = await req.json();
				const { email } = body;
				if (!email) {
					return Response.json({ error: "Email required" }, { status: 400 });
				}
				try {
					updateUserEmail(user.id, email);
					return Response.json({ success: true });
				} catch (err: unknown) {
					const error = err as { message?: string };
					if (error.message?.includes("UNIQUE constraint failed")) {
						return Response.json(
							{ error: "Email already in use" },
							{ status: 400 },
						);
					}
					return Response.json(
						{ error: "Failed to update email" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/user/password": {
			PUT: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}

				// Rate limiting
				const rateLimitError = enforceRateLimit(req, "update-password", {
					ip: { max: 5, windowSeconds: 60 * 60 },
				});
				if (rateLimitError) return rateLimitError;

				const body = await req.json();
				const { password } = body;
				if (!password) {
					return Response.json({ error: "Password required" }, { status: 400 });
				}
				// Password is client-side hashed (PBKDF2), should be 64 char hex
				if (password.length !== 64 || !/^[0-9a-f]+$/.test(password)) {
					return Response.json(
						{ error: "Invalid password format" },
						{ status: 400 },
					);
				}
				try {
					await updateUserPassword(user.id, password);
					return Response.json({ success: true });
				} catch {
					return Response.json(
						{ error: "Failed to update password" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/user/name": {
			PUT: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				const body = await req.json();
				const { name } = body;
				if (!name) {
					return Response.json({ error: "Name required" }, { status: 400 });
				}
				try {
					updateUserName(user.id, name);
					return Response.json({ success: true });
				} catch {
					return Response.json(
						{ error: "Failed to update name" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/user/avatar": {
			PUT: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				const body = await req.json();
				const { avatar } = body;
				if (!avatar) {
					return Response.json({ error: "Avatar required" }, { status: 400 });
				}
				try {
					updateUserAvatar(user.id, avatar);
					return Response.json({ success: true });
				} catch {
					return Response.json(
						{ error: "Failed to update avatar" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/transcriptions/:id/stream": {
			GET: async (req) => {
				const sessionId = getSessionFromRequest(req);
				if (!sessionId) {
					return Response.json({ error: "Not authenticated" }, { status: 401 });
				}
				const user = getUserBySession(sessionId);
				if (!user) {
					return Response.json({ error: "Invalid session" }, { status: 401 });
				}
				const transcriptionId = req.params.id;
				// Verify ownership
				const transcription = db
					.query<{ id: string; user_id: number; status: string }, [string]>(
						"SELECT id, user_id, status FROM transcriptions WHERE id = ?",
					)
					.get(transcriptionId);
				if (!transcription || transcription.user_id !== user.id) {
					return Response.json(
						{ error: "Transcription not found" },
						{ status: 404 },
					);
				}
				// Event-driven SSE stream with reconnection support
				const stream = new ReadableStream({
					async start(controller) {
						const encoder = new TextEncoder();
						let isClosed = false;
						let lastEventId = Math.floor(Date.now() / 1000);

						const sendEvent = (data: Partial<TranscriptionUpdate>) => {
							if (isClosed) return;
							try {
								// Send event ID for reconnection support
								lastEventId = Math.floor(Date.now() / 1000);
								controller.enqueue(
									encoder.encode(
										`id: ${lastEventId}\nevent: update\ndata: ${JSON.stringify(data)}\n\n`,
									),
								);
							} catch {
								// Controller already closed (client disconnected)
								isClosed = true;
							}
						};

						const sendHeartbeat = () => {
							if (isClosed) return;
							try {
								controller.enqueue(encoder.encode(": heartbeat\n\n"));
							} catch {
								isClosed = true;
							}
						};
						// Send initial state from DB and file
						const current = db
							.query<
								{
									status: string;
									progress: number;
								},
								[string]
							>("SELECT status, progress FROM transcriptions WHERE id = ?")
							.get(transcriptionId);
						if (current) {
							sendEvent({
								status: current.status as TranscriptionUpdate["status"],
								progress: current.progress,
							});
						}
						// If already complete, close immediately
						if (
							current?.status === "completed" ||
							current?.status === "failed"
						) {
							isClosed = true;
							controller.close();
							return;
						}
						// Send heartbeats every 2.5 seconds to keep connection alive
						const heartbeatInterval = setInterval(sendHeartbeat, 2500);

						// Subscribe to EventEmitter for live updates
						const updateHandler = (data: TranscriptionUpdate) => {
							if (isClosed) return;

							// Only send changed fields to save bandwidth
							const payload: Partial<TranscriptionUpdate> = {
								status: data.status,
								progress: data.progress,
							};

							if (data.transcript !== undefined) {
								payload.transcript = data.transcript;
							}
							if (data.error_message !== undefined) {
								payload.error_message = data.error_message;
							}

							sendEvent(payload);

							// Close stream when done
							if (data.status === "completed" || data.status === "failed") {
								isClosed = true;
								clearInterval(heartbeatInterval);
								transcriptionEvents.off(transcriptionId, updateHandler);
								controller.close();
							}
						};
						transcriptionEvents.on(transcriptionId, updateHandler);
						// Cleanup on client disconnect
						return () => {
							isClosed = true;
							clearInterval(heartbeatInterval);
							transcriptionEvents.off(transcriptionId, updateHandler);
						};
					},
				});
				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		},
		"/api/transcriptions/health": {
			GET: async () => {
				const isHealthy = await whisperService.checkHealth();
				return Response.json({ available: isHealthy });
			},
		},
		"/api/transcriptions/:id": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const transcriptionId = req.params.id;

					// Verify ownership or admin
					const transcription = db
						.query<
							{
								id: string;
								user_id: number;
								filename: string;
								original_filename: string;
								status: string;
								progress: number;
								created_at: number;
							},
							[string]
						>(
							"SELECT id, user_id, filename, original_filename, status, progress, created_at FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Allow access if user owns it or is admin
					if (transcription.user_id !== user.id && user.role !== "admin") {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					if (transcription.status !== "completed") {
						return Response.json(
							{ error: "Transcription not completed yet" },
							{ status: 400 },
						);
					}

					// Get format from query parameter
					const url = new URL(req.url);
					const format = url.searchParams.get("format");

					// Return WebVTT format if requested
					if (format === "vtt") {
						const vttContent = await getTranscriptVTT(transcriptionId);

						if (!vttContent) {
							return Response.json(
								{ error: "VTT transcript not available" },
								{ status: 404 },
							);
						}

						return new Response(vttContent, {
							headers: {
								"Content-Type": "text/vtt",
								"Content-Disposition": `attachment; filename="${transcription.original_filename}.vtt"`,
							},
						});
					}

					// return info on transcript
					const transcript = {
						id: transcription.id,
						filename: transcription.original_filename,
						status: transcription.status,
						progress: transcription.progress,
						created_at: transcription.created_at,
					};
					return new Response(JSON.stringify(transcript), {
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/transcriptions/:id/audio": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const transcriptionId = req.params.id;

					// Verify ownership or admin
					const transcription = db
						.query<
							{
								id: string;
								user_id: number;
								filename: string;
								status: string;
							},
							[string]
						>(
							"SELECT id, user_id, filename, status FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Allow access if user owns it or is admin
					if (transcription.user_id !== user.id && user.role !== "admin") {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					if (transcription.status !== "completed") {
						return Response.json(
							{ error: "Transcription not completed yet" },
							{ status: 400 },
						);
					}

					// Serve the audio file with range request support
					const filePath = `./uploads/${transcription.filename}`;
					const file = Bun.file(filePath);

					if (!(await file.exists())) {
						return Response.json(
							{ error: "Audio file not found" },
							{ status: 404 },
						);
					}

					const fileSize = file.size;
					const range = req.headers.get("range");

					// Handle range requests for seeking
					if (range) {
						const parts = range.replace(/bytes=/, "").split("-");
						const start = Number.parseInt(parts[0] || "0", 10);
						const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
						const chunkSize = end - start + 1;

						const fileSlice = file.slice(start, end + 1);

						return new Response(fileSlice, {
							status: 206,
							headers: {
								"Content-Range": `bytes ${start}-${end}/${fileSize}`,
								"Accept-Ranges": "bytes",
								"Content-Length": chunkSize.toString(),
								"Content-Type": file.type || "audio/mpeg",
							},
						});
					}

					// No range request, send entire file
					return new Response(file, {
						headers: {
							"Content-Type": file.type || "audio/mpeg",
							"Accept-Ranges": "bytes",
							"Content-Length": fileSize.toString(),
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/transcriptions": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);

					const transcriptions = db
						.query<
							{
								id: string;
								filename: string;
								original_filename: string;
								class_name: string | null;
								status: string;
								progress: number;
								created_at: number;
							},
							[number]
						>(
							"SELECT id, filename, original_filename, class_name, status, progress, created_at FROM transcriptions WHERE user_id = ? ORDER BY created_at DESC",
						)
						.all(user.id);

					// Load transcripts from files for completed jobs
					const jobs = await Promise.all(
						transcriptions.map(async (t) => {
							return {
								id: t.id,
								filename: t.original_filename,
								class_name: t.class_name,
								status: t.status,
								progress: t.progress,
								created_at: t.created_at,
							};
						}),
					);

					return Response.json({ jobs });
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					const formData = await req.formData();
					const file = formData.get("audio") as File;
					const className = formData.get("class_name") as string | null;

					if (!file) throw ValidationErrors.missingField("audio");

					// Validate file type
					const fileExtension = file.name.split(".").pop()?.toLowerCase();
					const allowedExtensions = [
						"mp3",
						"wav",
						"m4a",
						"aac",
						"ogg",
						"webm",
						"flac",
						"mp4",
					];
					const isAudioType =
						file.type.startsWith("audio/") || file.type === "video/mp4";
					const isAudioExtension =
						fileExtension && allowedExtensions.includes(fileExtension);

					if (!isAudioType && !isAudioExtension) {
						throw ValidationErrors.unsupportedFileType(
							"MP3, WAV, M4A, AAC, OGG, WebM, FLAC",
						);
					}

					if (file.size > MAX_FILE_SIZE) {
						throw ValidationErrors.fileTooLarge("25MB");
					}

					// Generate unique filename
					const transcriptionId = crypto.randomUUID();
					const filename = `${transcriptionId}.${fileExtension}`;

					// Save file to disk
					const uploadDir = "./uploads";
					await Bun.write(`${uploadDir}/${filename}`, file);

					// Create database record with optional class_name
					if (className?.trim()) {
						db.run(
							"INSERT INTO transcriptions (id, user_id, filename, original_filename, class_name, status) VALUES (?, ?, ?, ?, ?, ?)",
							[
								transcriptionId,
								user.id,
								filename,
								file.name,
								className.trim(),
								"uploading",
							],
						);
					} else {
						db.run(
							"INSERT INTO transcriptions (id, user_id, filename, original_filename, status) VALUES (?, ?, ?, ?, ?)",
							[transcriptionId, user.id, filename, file.name, "uploading"],
						);
					}

					// Start transcription in background
					whisperService.startTranscription(transcriptionId, filename);

					return Response.json({
						id: transcriptionId,
						message: "Upload successful, transcription started",
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/transcriptions": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const transcriptions = getAllTranscriptions();
					return Response.json(transcriptions);
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const users = getAllUsersWithStats();
					return Response.json(users);
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/transcriptions/:id": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const transcriptionId = req.params.id;
					deleteTranscription(transcriptionId);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}
					deleteUser(userId);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/role": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const body = await req.json();
					const { role } = body as { role: UserRole };

					if (!role || (role !== "user" && role !== "admin")) {
						return Response.json(
							{ error: "Invalid role. Must be 'user' or 'admin'" },
							{ status: 400 },
						);
					}

					updateUserRole(userId, role);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/details": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const user = db
						.query<
							{
								id: number;
								email: string;
								name: string | null;
								avatar: string;
								created_at: number;
								role: UserRole;
								password_hash: string | null;
								last_login: number | null;
							},
							[number]
						>(
							"SELECT id, email, name, avatar, created_at, role, password_hash, last_login FROM users WHERE id = ?",
						)
						.get(userId);

					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					const passkeys = getPasskeysForUser(userId);
					const sessions = getSessionsForUser(userId);

					// Get transcription count
					const transcriptionCount =
						db
							.query<{ count: number }, [number]>(
								"SELECT COUNT(*) as count FROM transcriptions WHERE user_id = ?",
							)
							.get(userId)?.count ?? 0;

					return Response.json({
						id: user.id,
						email: user.email,
						name: user.name,
						avatar: user.avatar,
						created_at: user.created_at,
						role: user.role,
						last_login: user.last_login,
						hasPassword: !!user.password_hash,
						transcriptionCount,
						passkeys: passkeys.map((pk) => ({
							id: pk.id,
							name: pk.name,
							created_at: pk.created_at,
							last_used_at: pk.last_used_at,
						})),
						sessions: sessions.map((s) => ({
							id: s.id,
							ip_address: s.ip_address,
							user_agent: s.user_agent,
							created_at: s.created_at,
							expires_at: s.expires_at,
						})),
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/password": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const body = await req.json();
					const { password } = body as { password: string };

					if (!password || password.length < 8) {
						return Response.json(
							{ error: "Password must be at least 8 characters" },
							{ status: 400 },
						);
					}

					await updateUserPassword(userId, password);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/passkeys/:passkeyId": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const { passkeyId } = req.params;
					deletePasskey(passkeyId, userId);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/name": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const body = await req.json();
					const { name } = body as { name: string };

					if (!name || name.trim().length === 0) {
						return Response.json(
							{ error: "Name cannot be empty" },
							{ status: 400 },
						);
					}

					updateUserName(userId, name.trim());
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/email": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const body = await req.json();
					const { email } = body as { email: string };

					if (!email || !email.includes("@")) {
						return Response.json(
							{ error: "Invalid email address" },
							{ status: 400 },
						);
					}

					// Check if email already exists
					const existing = db
						.query<{ id: number }, [string, number]>(
							"SELECT id FROM users WHERE email = ? AND id != ?",
						)
						.get(email, userId);

					if (existing) {
						return Response.json(
							{ error: "Email already in use" },
							{ status: 400 },
						);
					}

					updateUserEmailAddress(userId, email);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/sessions": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const sessions = getSessionsForUser(userId);
					return Response.json(sessions);
				} catch (error) {
					return handleError(error);
				}
			},
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					deleteAllUserSessions(userId);
					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users/:id/sessions/:sessionId": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const { sessionId } = req.params;
					const success = deleteSessionById(sessionId, userId);

					if (!success) {
						return Response.json(
							{ error: "Session not found" },
							{ status: 404 },
						);
					}

					return Response.json({ success: true });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/transcriptions/:id/details": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const transcriptionId = req.params.id;

					const transcription = db
						.query<
							{
								id: string;
								original_filename: string;
								status: string;
								created_at: number;
								updated_at: number;
								error_message: string | null;
								user_id: number;
							},
							[string]
						>(
							"SELECT id, original_filename, status, created_at, updated_at, error_message, user_id FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					const user = db
						.query<{ email: string; name: string | null }, [number]>(
							"SELECT email, name FROM users WHERE id = ?",
						)
						.get(transcription.user_id);

					return Response.json({
						id: transcription.id,
						original_filename: transcription.original_filename,
						status: transcription.status,
						created_at: transcription.created_at,
						completed_at: transcription.updated_at,
						error_message: transcription.error_message,
						user_id: transcription.user_id,
						user_email: user?.email || "Unknown",
						user_name: user?.name || null,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
	},
	development: {
		hmr: true,
		console: true,
	},
});
console.log(`🪻 Thistle running at http://localhost:${server.port}`);
