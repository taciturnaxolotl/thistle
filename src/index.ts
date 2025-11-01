import db from "./db/schema";
import {
	authenticateUser,
	cleanupExpiredSessions,
	createSession,
	createUser,
	deleteSession,
	deleteUser,
	getSession,
	getSessionFromRequest,
	getUserBySession,
	getUserSessionsForUser,
	updateUserAvatar,
	updateUserEmail,
	updateUserName,
	updateUserPassword,
} from "./lib/auth";
import { handleError, ValidationErrors } from "./lib/errors";
import { requireAuth } from "./lib/middleware";
import {
	MAX_FILE_SIZE,
	TranscriptionEventEmitter,
	type TranscriptionUpdate,
	WhisperServiceManager,
} from "./lib/transcription";
import indexHTML from "./pages/index.html";
import settingsHTML from "./pages/settings.html";
import transcribeHTML from "./pages/transcribe.html";

// Environment variables
const WHISPER_SERVICE_URL =
	process.env.WHISPER_SERVICE_URL || "http://localhost:8000";

// Create uploads directory if it doesn't exist
await Bun.write("./uploads/.gitkeep", "");

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
setInterval(() => whisperService.syncWithWhisper(), 5 * 60 * 1000);

// Clean up stale files daily
setInterval(() => whisperService.cleanupStaleFiles(), 24 * 60 * 60 * 1000);

const server = Bun.serve({
	port: 3000,
	idleTimeout: 120, // 120 seconds for SSE connections
	routes: {
		"/": indexHTML,
		"/settings": settingsHTML,
		"/transcribe": transcribeHTML,
		"/api/auth/register": {
			POST: async (req) => {
				try {
					const body = await req.json();
					const { email, password, name } = body;
					if (!email || !password) {
						return Response.json(
							{ error: "Email and password required" },
							{ status: 400 },
						);
					}
					if (password.length < 8) {
						return Response.json(
							{ error: "Password must be at least 8 characters" },
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
								"Set-Cookie": `session=${sessionId}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
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
								"Set-Cookie": `session=${sessionId}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
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
								"session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
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
				});
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
				deleteUser(user.id);
				return Response.json(
					{ success: true },
					{
						headers: {
							"Set-Cookie":
								"session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
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
				const body = await req.json();
				const { password } = body;
				if (!password) {
					return Response.json({ error: "Password required" }, { status: 400 });
				}
				if (password.length < 8) {
					return Response.json(
						{ error: "Password must be at least 8 characters" },
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
			GET: (req) => {
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
					start(controller) {
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
						// Send initial state from DB
						const current = db
							.query<
								{
									status: string;
									progress: number;
									transcript: string | null;
								},
								[string]
							>(
								"SELECT status, progress, transcript FROM transcriptions WHERE id = ?",
							)
							.get(transcriptionId);
						if (current) {
							sendEvent({
								status: current.status as TranscriptionUpdate["status"],
								progress: current.progress,
								transcript: current.transcript || undefined,
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
		"/api/transcriptions": {
			GET: (req) => {
				try {
					const user = requireAuth(req);

					const transcriptions = db
						.query<
							{
								id: string;
								filename: string;
								original_filename: string;
								status: string;
								progress: number;
								transcript: string | null;
								created_at: number;
							},
							[number]
						>(
							"SELECT id, filename, original_filename, status, progress, transcript, created_at FROM transcriptions WHERE user_id = ? ORDER BY created_at DESC",
						)
						.all(user.id);

					return Response.json({
						jobs: transcriptions.map((t) => ({
							id: t.id,
							filename: t.original_filename,
							status: t.status,
							progress: t.progress,
							transcript: t.transcript,
							created_at: t.created_at,
						})),
					});
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					const formData = await req.formData();
					const file = formData.get("audio") as File;

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

					// Create database record
					db.run(
						"INSERT INTO transcriptions (id, user_id, filename, original_filename, status) VALUES (?, ?, ?, ?, ?)",
						[transcriptionId, user.id, filename, file.name, "uploading"],
					);

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
	},
	development: {
		hmr: true,
		console: true,
	},
});
console.log(`🪻 Thistle running at http://localhost:${server.port}`);
