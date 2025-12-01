import db from "./db/schema";
import {
	authenticateUser,
	cleanupExpiredSessions,
	consumeEmailChangeToken,
	consumePasswordResetToken,
	createEmailChangeToken,
	createEmailVerificationToken,
	createPasswordResetToken,
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
	getUserByEmail,
	getUserBySession,
	getUserSessionsForUser,
	getVerificationCodeSentAt,
	isEmailVerified,
	type UserRole,
	updateUserAvatar,
	updateUserEmail,
	updateUserEmailAddress,
	updateUserName,
	updateUserPassword,
	updateUserRole,
	verifyEmailChangeToken,
	verifyEmailCode,
	verifyEmailToken,
	verifyPasswordResetToken,
} from "./lib/auth";
import {
	addToWaitlist,
	createClass,
	createMeetingTime,
	deleteClass,
	deleteMeetingTime,
	deleteWaitlistEntry,
	enrollUserInClass,
	getAllWaitlistEntries,
	getClassById,
	getClassesForUser,
	getClassMembers,
	getClassSections,
	getMeetingById,
	getMeetingTimesForClass,
	getTranscriptionsForClass,
	getUserSection,
	isUserEnrolledInClass,
	joinClass,
	removeUserFromClass,
	searchClassesByCourseCode,
	toggleClassArchive,
	updateMeetingTime,
	createClassSection,
} from "./lib/classes";
import { sendEmail } from "./lib/email";
import {
	emailChangeTemplate,
	passwordResetTemplate,
	verifyEmailTemplate,
} from "./lib/email-templates";
import { AuthErrors, handleError, ValidationErrors } from "./lib/errors";
import {
	hasActiveSubscription,
	requireAdmin,
	requireAuth,
	requireSubscription,
} from "./lib/middleware";
import {
	createAuthenticationOptions,
	createRegistrationOptions,
	deletePasskey,
	getPasskeysForUser,
	updatePasskeyName,
	verifyAndAuthenticatePasskey,
	verifyAndCreatePasskey,
} from "./lib/passkey";
import { clearRateLimit, enforceRateLimit } from "./lib/rate-limit";
import { getTranscriptVTT } from "./lib/transcript-storage";
import {
	MAX_FILE_SIZE,
	TranscriptionEventEmitter,
	type TranscriptionUpdate,
	WhisperServiceManager,
} from "./lib/transcription";
import {
	validateClassId,
	validateCourseCode,
	validateCourseName,
	validateEmail,
	validateName,
	validatePasswordHash,
	validateSemester,
	validateYear,
} from "./lib/validation";
import adminHTML from "./pages/admin.html";
import checkoutHTML from "./pages/checkout.html";
import classHTML from "./pages/class.html";
import classesHTML from "./pages/classes.html";
import indexHTML from "./pages/index.html";
import resetPasswordHTML from "./pages/reset-password.html";
import settingsHTML from "./pages/settings.html";
import transcribeHTML from "./pages/transcribe.html";

// Validate required environment variables at startup
function validateEnvVars() {
	const required = [
		"POLAR_ORGANIZATION_ID",
		"POLAR_PRODUCT_ID",
		"POLAR_SUCCESS_URL",
		"POLAR_WEBHOOK_SECRET",
		"MAILCHANNELS_API_KEY",
		"DKIM_PRIVATE_KEY",
		"LLM_API_KEY",
		"LLM_API_BASE_URL",
		"LLM_MODEL",
	];

	const missing = required.filter((key) => !process.env[key]);

	if (missing.length > 0) {
		console.error(
			`[Startup] Missing required environment variables: ${missing.join(", ")}`,
		);
		console.error("[Startup] Please check your .env file");
		process.exit(1);
	}

	// Validate ORIGIN is set for production
	if (!process.env.ORIGIN) {
		console.warn(
			"[Startup] ORIGIN not set, defaulting to http://localhost:3000",
		);
		console.warn("[Startup] Set ORIGIN in production for correct email links");
	}

	console.log("[Startup] Environment variable validation passed");
}

validateEnvVars();

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

// Clean up expired sessions every 15 minutes
const sessionCleanupInterval = setInterval(
	cleanupExpiredSessions,
	15 * 60 * 1000,
);

// Helper function to sync user subscriptions from Polar
async function syncUserSubscriptionsFromPolar(
	userId: number,
	email: string,
): Promise<void> {
	// Skip Polar sync in test mode
	if (
		process.env.NODE_ENV === "test" ||
		process.env.SKIP_POLAR_SYNC === "true"
	) {
		return;
	}

	try {
		const { polar } = await import("./lib/polar");

		// Search for customer by email (validated at startup)
		const customers = await polar.customers.list({
			organizationId: process.env.POLAR_ORGANIZATION_ID as string,
			query: email,
		});

		if (!customers.result.items || customers.result.items.length === 0) {
			console.log(`[Sync] No Polar customer found for ${email}`);
			return;
		}

		const customer = customers.result.items[0];

		// Get all subscriptions for this customer
		const subscriptions = await polar.subscriptions.list({
			customerId: customer.id,
		});

		if (
			!subscriptions.result.items ||
			subscriptions.result.items.length === 0
		) {
			console.log(`[Sync] No subscriptions found for customer ${customer.id}`);
			return;
		}

		// Filter to only active/trialing/past_due subscriptions (not canceled/expired)
		const currentSubscriptions = subscriptions.result.items.filter(
			(sub) =>
				sub.status === "active" ||
				sub.status === "trialing" ||
				sub.status === "past_due",
		);

		if (currentSubscriptions.length === 0) {
			console.log(
				`[Sync] No current subscriptions found for customer ${customer.id}`,
			);
			return;
		}

		// Update each current subscription in the database
		for (const subscription of currentSubscriptions) {
			db.run(
				`INSERT INTO subscriptions (id, user_id, customer_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET
				   user_id = excluded.user_id,
				   status = excluded.status,
				   current_period_start = excluded.current_period_start,
				   current_period_end = excluded.current_period_end,
				   cancel_at_period_end = excluded.cancel_at_period_end,
				   canceled_at = excluded.canceled_at,
				   updated_at = excluded.updated_at`,
				[
					subscription.id,
					userId,
					subscription.customerId,
					subscription.status,
					subscription.currentPeriodStart
						? Math.floor(
								new Date(subscription.currentPeriodStart).getTime() / 1000,
							)
						: null,
					subscription.currentPeriodEnd
						? Math.floor(
								new Date(subscription.currentPeriodEnd).getTime() / 1000,
							)
						: null,
					subscription.cancelAtPeriodEnd ? 1 : 0,
					subscription.canceledAt
						? Math.floor(new Date(subscription.canceledAt).getTime() / 1000)
						: null,
					Math.floor(Date.now() / 1000),
				],
			);
		}

		console.log(
			`[Sync] Linked ${currentSubscriptions.length} current subscription(s) to user ${userId} (${email})`,
		);
	} catch (error) {
		console.error(
			`[Sync] Failed to sync subscriptions for ${email}:`,
			error instanceof Error ? error.message : "Unknown error",
		);
		// Don't throw - registration should succeed even if sync fails
	}
}

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
const syncInterval = setInterval(
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

// Clean up stale files hourly
const fileCleanupInterval = setInterval(
	() => whisperService.cleanupStaleFiles(),
	60 * 60 * 1000, // 1 hour
);

const server = Bun.serve({
	port:
		process.env.NODE_ENV === "test"
			? 3001
			: process.env.PORT
				? Number.parseInt(process.env.PORT, 10)
				: 3000,
	idleTimeout: 120, // 120 seconds for SSE connections
	routes: {
		"/": indexHTML,
		"/admin": adminHTML,
		"/checkout": checkoutHTML,
		"/settings": settingsHTML,
		"/reset-password": resetPasswordHTML,
		"/transcribe": transcribeHTML,
		"/classes": classesHTML,
		"/classes/*": classHTML,
		"/apple-touch-icon.png": Bun.file("./public/favicon/apple-touch-icon.png"),
		"/favicon-32x32.png": Bun.file("./public/favicon/favicon-32x32.png"),
		"/favicon-16x16.png": Bun.file("./public/favicon/favicon-16x16.png"),
		"/site.webmanifest": Bun.file("./public/favicon/site.webmanifest"),
		"/favicon.ico": Bun.file("./public/favicon/favicon.ico"),
		"/api/auth/register": {
			POST: async (req) => {
				try {
					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "register", {
						ip: { max: 5, windowSeconds: 30 * 60 },
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
					// Validate password format (client-side hashed PBKDF2)
					const passwordValidation = validatePasswordHash(password);
					if (!passwordValidation.valid) {
						return Response.json(
							{ error: passwordValidation.error },
							{ status: 400 },
						);
					}
					const user = await createUser(email, password, name);

					// Send verification email - MUST succeed for registration to complete
					const { code, token, sentAt } = createEmailVerificationToken(user.id);

					try {
						await sendEmail({
							to: user.email,
							subject: "Verify your email - Thistle",
							html: verifyEmailTemplate({
								name: user.name,
								code,
								token,
							}),
						});
					} catch (err) {
						console.error("[Email] Failed to send verification email:", err);
						// Rollback user creation - direct DB delete since user was just created
						db.run("DELETE FROM email_verification_tokens WHERE user_id = ?", [
							user.id,
						]);
						db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
						db.run("DELETE FROM users WHERE id = ?", [user.id]);
						return Response.json(
							{
								error:
									"Failed to send verification email. Please try again later.",
							},
							{ status: 500 },
						);
					}

					// Attempt to sync existing Polar subscriptions (after email succeeds)
					syncUserSubscriptionsFromPolar(user.id, user.email).catch(() => {
						// Silent fail - don't block registration
					});

					// Clear rate limits on successful registration
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					clearRateLimit("register", email, ipAddress);

					// Return success but indicate email verification is needed
					// Don't create session yet - they need to verify first
					return Response.json(
						{
							user: { id: user.id, email: user.email },
							email_verification_required: true,
							verification_code_sent_at: sentAt,
						},
						{ status: 201 },
					);
				} catch (err: unknown) {
					const error = err as { message?: string };
					if (error.message?.includes("UNIQUE constraint failed")) {
						return Response.json(
							{ error: "Email already registered" },
							{ status: 409 },
						);
					}
					console.error("[Auth] Registration error:", err);
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
						ip: { max: 10, windowSeconds: 5 * 60 },
						account: { max: 5, windowSeconds: 5 * 60, email },
					});
					if (rateLimitError) return rateLimitError;

					// Validate password format (client-side hashed PBKDF2)
					const passwordValidation = validatePasswordHash(password);
					if (!passwordValidation.valid) {
						return Response.json(
							{ error: passwordValidation.error },
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

					// Clear rate limits on successful authentication
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					clearRateLimit("login", email, ipAddress);

					// Check if email is verified
					if (!isEmailVerified(user.id)) {
						let codeSentAt = getVerificationCodeSentAt(user.id);

						// If no verification code exists, auto-send one
						if (!codeSentAt) {
							const { code, token, sentAt } = createEmailVerificationToken(
								user.id,
							);
							codeSentAt = sentAt;

							try {
								await sendEmail({
									to: user.email,
									subject: "Verify your email - Thistle",
									html: verifyEmailTemplate({
										name: user.name,
										code,
										token,
									}),
								});
							} catch (err) {
								console.error(
									"[Email] Failed to send verification email on login:",
									err,
								);
								// Don't fail login - just return null timestamp so client can try resend
								codeSentAt = null;
							}
						}

						return Response.json(
							{
								user: { id: user.id, email: user.email },
								email_verification_required: true,
								verification_code_sent_at: codeSentAt,
							},
							{ status: 200 },
						);
					}

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
				} catch (error) {
					console.error("[Auth] Login error:", error);
					return Response.json({ error: "Login failed" }, { status: 500 });
				}
			},
		},
		"/api/auth/verify-email": {
			GET: async (req) => {
				try {
					const url = new URL(req.url);
					const token = url.searchParams.get("token");

					if (!token) {
						return Response.redirect("/", 302);
					}

					const result = verifyEmailToken(token);

					if (!result) {
						return Response.redirect("/", 302);
					}

					// Create session for the verified user
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					const userAgent = req.headers.get("user-agent") ?? "unknown";
					const sessionId = createSession(result.userId, ipAddress, userAgent);

					// Redirect to classes with session cookie
					return new Response(null, {
						status: 302,
						headers: {
							Location: "/classes",
							"Set-Cookie": `session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
						},
					});
				} catch (error) {
					console.error("[Email] Verification error:", error);
					return Response.redirect("/", 302);
				}
			},
			POST: async (req) => {
				try {
					const body = await req.json();
					const { email, code } = body;

					if (!email || !code) {
						return Response.json(
							{ error: "Email and verification code required" },
							{ status: 400 },
						);
					}

					// Get user by email
					const user = getUserByEmail(email);
					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					// Check if already verified
					if (isEmailVerified(user.id)) {
						return Response.json(
							{ error: "Email already verified" },
							{ status: 400 },
						);
					}

					const success = verifyEmailCode(user.id, code);

					if (!success) {
						return Response.json(
							{ error: "Invalid or expired verification code" },
							{ status: 400 },
						);
					}

					// Create session after successful verification
					const ipAddress =
						req.headers.get("x-forwarded-for") ??
						req.headers.get("x-real-ip") ??
						"unknown";
					const userAgent = req.headers.get("user-agent") ?? "unknown";
					const sessionId = createSession(user.id, ipAddress, userAgent);

					return Response.json(
						{
							success: true,
							message: "Email verified successfully",
							email_verified: true,
							user: { id: user.id, email: user.email },
						},
						{
							headers: {
								"Set-Cookie": `session=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
							},
						},
					);
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/auth/resend-verification": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "resend-verification", {
						account: { max: 3, windowSeconds: 60 * 60, email: user.email },
					});
					if (rateLimitError) return rateLimitError;

					// Check if already verified
					if (isEmailVerified(user.id)) {
						return Response.json(
							{ error: "Email already verified" },
							{ status: 400 },
						);
					}

					// Generate new code and send email
					const { code, token } = createEmailVerificationToken(user.id);

					await sendEmail({
						to: user.email,
						subject: "Verify your email - Thistle",
						html: verifyEmailTemplate({
							name: user.name,
							code,
							token,
						}),
					});

					return Response.json({
						success: true,
						message: "Verification email sent",
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/auth/resend-verification-code": {
			POST: async (req) => {
				try {
					const body = await req.json();
					const { email } = body;

					if (!email) {
						return Response.json({ error: "Email required" }, { status: 400 });
					}

					// Rate limiting by email
					const rateLimitError = enforceRateLimit(
						req,
						"resend-verification-code",
						{
							account: { max: 3, windowSeconds: 5 * 60, email },
						},
					);
					if (rateLimitError) return rateLimitError;

					// Get user by email
					const user = getUserByEmail(email);
					if (!user) {
						// Don't reveal if user exists
						return Response.json({
							success: true,
							message:
								"If an account exists with that email, a verification code has been sent",
						});
					}

					// Check if already verified
					if (isEmailVerified(user.id)) {
						return Response.json(
							{ error: "Email already verified" },
							{ status: 400 },
						);
					}

					// Generate new code and send email
					const { code, token, sentAt } = createEmailVerificationToken(user.id);

					await sendEmail({
						to: user.email,
						subject: "Verify your email - Thistle",
						html: verifyEmailTemplate({
							name: user.name,
							code,
							token,
						}),
					});

					return Response.json({
						success: true,
						message: "Verification code sent",
						verification_code_sent_at: sentAt,
					});
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/auth/forgot-password": {
			POST: async (req) => {
				try {
					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "forgot-password", {
						ip: { max: 5, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { email } = body;

					if (!email) {
						return Response.json({ error: "Email required" }, { status: 400 });
					}

					// Always return success to prevent email enumeration
					const user = getUserByEmail(email);
					if (user) {
						const origin = process.env.ORIGIN || "http://localhost:3000";
						const resetToken = createPasswordResetToken(user.id);
						const resetLink = `${origin}/reset-password?token=${resetToken}`;

						await sendEmail({
							to: user.email,
							subject: "Reset your password - Thistle",
							html: passwordResetTemplate({
								name: user.name,
								resetLink,
							}),
						}).catch((err) => {
							console.error("[Email] Failed to send password reset:", err);
						});
					}

					return Response.json({
						success: true,
						message:
							"If an account exists with that email, a password reset link has been sent",
					});
				} catch (error) {
					console.error("[Email] Forgot password error:", error);
					return Response.json(
						{ error: "Failed to process request" },
						{ status: 500 },
					);
				}
			},
		},
		"/api/auth/reset-password": {
			GET: async (req) => {
				try {
					const url = new URL(req.url);
					const token = url.searchParams.get("token");

					if (!token) {
						return Response.json({ error: "Token required" }, { status: 400 });
					}

					const userId = verifyPasswordResetToken(token);
					if (!userId) {
						return Response.json(
							{ error: "Invalid or expired reset token" },
							{ status: 400 },
						);
					}

					// Get user's email for client-side password hashing
					const user = db
						.query<{ email: string }, [number]>(
							"SELECT email FROM users WHERE id = ?",
						)
						.get(userId);

					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					return Response.json({ email: user.email });
				} catch (error) {
					console.error("[Email] Get reset token info error:", error);
					return Response.json(
						{ error: "Failed to verify token" },
						{ status: 500 },
					);
				}
			},
			POST: async (req) => {
				try {
					const body = await req.json();
					const { token, password } = body;

					if (!token || !password) {
						return Response.json(
							{ error: "Token and password required" },
							{ status: 400 },
						);
					}

					// Validate password format (client-side hashed PBKDF2)
					const passwordValidation = validatePasswordHash(password);
					if (!passwordValidation.valid) {
						return Response.json(
							{ error: passwordValidation.error },
							{ status: 400 },
						);
					}

					const userId = verifyPasswordResetToken(token);
					if (!userId) {
						return Response.json(
							{ error: "Invalid or expired reset token" },
							{ status: 400 },
						);
					}

					// Update password and consume token
					await updateUserPassword(userId, password);
					consumePasswordResetToken(token);

					return Response.json({
						success: true,
						message: "Password reset successfully",
					});
				} catch (error) {
					console.error("[Email] Reset password error:", error);
					return Response.json(
						{ error: "Failed to reset password" },
						{ status: 500 },
					);
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
				try {
					const user = requireAuth(req);

					// Check subscription status
					const subscription = db
						.query<{ status: string }, [number]>(
							"SELECT status FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due') ORDER BY created_at DESC LIMIT 1",
						)
						.get(user.id);

					// Get notification preferences
					const prefs = db
						.query<{ email_notifications_enabled: number }, [number]>(
							"SELECT email_notifications_enabled FROM users WHERE id = ?",
						)
						.get(user.id);

					return Response.json({
						email: user.email,
						name: user.name,
						avatar: user.avatar,
						created_at: user.created_at,
						role: user.role,
						has_subscription: !!subscription,
						email_verified: isEmailVerified(user.id),
						email_notifications_enabled:
							prefs?.email_notifications_enabled === 1,
					});
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/passkeys/register/options": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					const rateLimitError = enforceRateLimit(
						req,
						"passkey-register-options",
						{
							ip: { max: 10, windowSeconds: 5 * 60 },
						},
					);
					if (rateLimitError) return rateLimitError;

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

					const rateLimitError = enforceRateLimit(
						req,
						"passkey-register-verify",
						{
							ip: { max: 10, windowSeconds: 5 * 60 },
						},
					);
					if (rateLimitError) return rateLimitError;

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
					const rateLimitError = enforceRateLimit(req, "passkey-auth-options", {
						ip: { max: 10, windowSeconds: 5 * 60 },
					});
					if (rateLimitError) return rateLimitError;

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
					const rateLimitError = enforceRateLimit(req, "passkey-auth-verify", {
						ip: { max: 10, windowSeconds: 5 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { response: credentialResponse, challenge } = body;

					const result = await verifyAndAuthenticatePasskey(
						credentialResponse,
						challenge,
					);

					if ("error" in result) {
						return new Response(JSON.stringify({ error: result.error }), {
							status: 401,
						});
					}

					const { user } = result;

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

					const rateLimitError = enforceRateLimit(req, "passkey-update", {
						ip: { max: 10, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { name } = body;
					const passkeyId = req.params.id;

					if (!name) {
						return Response.json({ error: "Name required" }, { status: 400 });
					}

					updatePasskeyName(passkeyId, user.id, name);
					return new Response(null, { status: 204 });
				} catch (err) {
					return handleError(err);
				}
			},
			DELETE: async (req) => {
				try {
					const user = requireAuth(req);

					const rateLimitError = enforceRateLimit(req, "passkey-delete", {
						ip: { max: 10, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const passkeyId = req.params.id;
					deletePasskey(passkeyId, user.id);
					return new Response(null, { status: 204 });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/sessions": {
			GET: (req) => {
				try {
					const sessionId = getSessionFromRequest(req);
					if (!sessionId) {
						return Response.json(
							{ error: "Not authenticated" },
							{ status: 401 },
						);
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
							is_current: s.id === sessionId,
						})),
					});
				} catch (err) {
					return handleError(err);
				}
			},
			DELETE: async (req) => {
				try {
					const currentSessionId = getSessionFromRequest(req);
					if (!currentSessionId) {
						return Response.json(
							{ error: "Not authenticated" },
							{ status: 401 },
						);
					}
					const user = getUserBySession(currentSessionId);
					if (!user) {
						return Response.json({ error: "Invalid session" }, { status: 401 });
					}

					const rateLimitError = enforceRateLimit(req, "delete-session", {
						ip: { max: 20, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const targetSessionId = body.sessionId;
					if (!targetSessionId) {
						return Response.json(
							{ error: "Session ID required" },
							{ status: 400 },
						);
					}
					// Prevent deleting current session
					if (targetSessionId === currentSessionId) {
						return Response.json(
							{ error: "Cannot kill current session. Use logout instead." },
							{ status: 400 },
						);
					}
					// Verify the session belongs to the user
					const targetSession = getSession(targetSessionId);
					if (!targetSession || targetSession.user_id !== user.id) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}
					deleteSession(targetSessionId);
					return new Response(null, { status: 204 });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user": {
			DELETE: async (req) => {
				try {
					const user = requireAuth(req);

					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "delete-user", {
						ip: { max: 3, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					await deleteUser(user.id);
					return new Response(null, {
						status: 204,
						headers: {
							"Set-Cookie":
								"session=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax",
						},
					});
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user/email": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);

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

					// Check if email is already in use
					const existingUser = getUserByEmail(email);
					if (existingUser) {
						return Response.json(
							{ error: "Email already in use" },
							{ status: 409 },
						);
					}

					try {
						// Create email change token
						const token = createEmailChangeToken(user.id, email);

						// Send verification email to the CURRENT address
						const origin = process.env.ORIGIN || "http://localhost:3000";
						const verifyUrl = `${origin}/api/user/email/verify?token=${token}`;

						await sendEmail({
							to: user.email,
							subject: "Verify your email change",
							html: emailChangeTemplate({
								name: user.name,
								currentEmail: user.email,
								newEmail: email,
								verifyLink: verifyUrl,
							}),
						});

						return Response.json({
							success: true,
							message: `Verification email sent to ${user.email}`,
							pendingEmail: email,
						});
					} catch (error) {
						console.error(
							"[Email] Failed to send email change verification:",
							error,
						);
						return Response.json(
							{ error: "Failed to send verification email" },
							{ status: 500 },
						);
					}
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user/email/verify": {
			GET: async (req) => {
				try {
					const url = new URL(req.url);
					const token = url.searchParams.get("token");

					if (!token) {
						return Response.redirect(
							"/settings?tab=account&error=invalid-token",
							302,
						);
					}

					const result = verifyEmailChangeToken(token);

					if (!result) {
						return Response.redirect(
							"/settings?tab=account&error=expired-token",
							302,
						);
					}

					// Update the user's email
					updateUserEmail(result.userId, result.newEmail);

					// Consume the token
					consumeEmailChangeToken(token);

					// Redirect to settings with success message
					return Response.redirect(
						"/settings?tab=account&success=email-changed",
						302,
					);
				} catch (error) {
					console.error("[Email] Email change verification error:", error);
					return Response.redirect(
						"/settings?tab=account&error=verification-failed",
						302,
					);
				}
			},
		},
		"/api/user/password": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);

					// Rate limiting
					const rateLimitError = enforceRateLimit(req, "update-password", {
						ip: { max: 5, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { password } = body;
					if (!password) {
						return Response.json(
							{ error: "Password required" },
							{ status: 400 },
						);
					}
					// Validate password format (client-side hashed PBKDF2)
					const passwordValidation = validatePasswordHash(password);
					if (!passwordValidation.valid) {
						return Response.json(
							{ error: passwordValidation.error },
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
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user/name": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);

					const rateLimitError = enforceRateLimit(req, "update-name", {
						ip: { max: 10, windowSeconds: 5 * 60 },
					});
					if (rateLimitError) return rateLimitError;

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
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user/avatar": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);

					const rateLimitError = enforceRateLimit(req, "update-avatar", {
						ip: { max: 10, windowSeconds: 5 * 60 },
					});
					if (rateLimitError) return rateLimitError;

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
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/user/notifications": {
			PUT: async (req) => {
				try {
					const user = requireAuth(req);

					const rateLimitError = enforceRateLimit(req, "update-notifications", {
						ip: { max: 10, windowSeconds: 5 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const body = await req.json();
					const { email_notifications_enabled } = body;
					if (typeof email_notifications_enabled !== "boolean") {
						return Response.json(
							{ error: "email_notifications_enabled must be a boolean" },
							{ status: 400 },
						);
					}
					try {
						db.run(
							"UPDATE users SET email_notifications_enabled = ? WHERE id = ?",
							[email_notifications_enabled ? 1 : 0, user.id],
						);
						return Response.json({ success: true });
					} catch {
						return Response.json(
							{ error: "Failed to update notification settings" },
							{ status: 500 },
						);
					}
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/billing/checkout": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					const { polar } = await import("./lib/polar");

					// Validated at startup
					const productId = process.env.POLAR_PRODUCT_ID as string;
					const successUrl =
						process.env.POLAR_SUCCESS_URL || "http://localhost:3000";

					const checkout = await polar.checkouts.create({
						products: [productId],
						successUrl,
						customerEmail: user.email,
						customerName: user.name ?? undefined,
						metadata: {
							userId: user.id.toString(),
						},
					});

					return Response.json({ url: checkout.url });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/billing/subscription": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);

					// Get subscription from database
					const subscription = db
						.query<
							{
								id: string;
								status: string;
								current_period_start: number | null;
								current_period_end: number | null;
								cancel_at_period_end: number;
								canceled_at: number | null;
							},
							[number]
						>(
							"SELECT id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
						)
						.get(user.id);

					if (!subscription) {
						return Response.json({ subscription: null });
					}

					return Response.json({ subscription });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/billing/portal": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);

					const { polar } = await import("./lib/polar");

					// Get subscription to find customer ID
					const subscription = db
						.query<
							{
								customer_id: string;
							},
							[number]
						>(
							"SELECT customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
						)
						.get(user.id);

					if (!subscription || !subscription.customer_id) {
						return Response.json(
							{ error: "No subscription found" },
							{ status: 404 },
						);
					}

					// Create customer portal session
					const session = await polar.customerSessions.create({
						customerId: subscription.customer_id,
					});

					return Response.json({ url: session.customerPortalUrl });
				} catch (err) {
					return handleError(err);
				}
			},
		},
		"/api/webhooks/polar": {
			POST: async (req) => {
				const { validateEvent } = await import("@polar-sh/sdk/webhooks");

				// Get raw body as string
				const rawBody = await req.text();
				const headers = Object.fromEntries(req.headers.entries());

				// Validate webhook signature (validated at startup)
				const webhookSecret = process.env.POLAR_WEBHOOK_SECRET as string;
				let event: ReturnType<typeof validateEvent>;
				try {
					event = validateEvent(rawBody, headers, webhookSecret);
				} catch (error) {
					// Validation failed - log but return generic response
					console.error("[Webhook] Signature validation failed:", error);
					return Response.json({ error: "Invalid webhook" }, { status: 400 });
				}

				console.log(`[Webhook] Received event: ${event.type}`);

				// Handle different event types
				try {
					switch (event.type) {
						case "subscription.updated": {
							const { id, status, customerId, metadata } = event.data;
							const userId = metadata?.userId
								? Number.parseInt(metadata.userId as string, 10)
								: null;

							if (!userId) {
								console.warn("[Webhook] No userId in subscription metadata");
								break;
							}

							// Upsert subscription
							db.run(
								`INSERT INTO subscriptions (id, user_id, customer_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
								 VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
								 ON CONFLICT(id) DO UPDATE SET
								   status = excluded.status,
								   current_period_start = excluded.current_period_start,
								   current_period_end = excluded.current_period_end,
								   cancel_at_period_end = excluded.cancel_at_period_end,
								   canceled_at = excluded.canceled_at,
								   updated_at = strftime('%s', 'now')`,
								[
									id,
									userId,
									customerId,
									status,
									event.data.currentPeriodStart
										? Math.floor(
												new Date(event.data.currentPeriodStart).getTime() /
													1000,
											)
										: null,
									event.data.currentPeriodEnd
										? Math.floor(
												new Date(event.data.currentPeriodEnd).getTime() / 1000,
											)
										: null,
									event.data.cancelAtPeriodEnd ? 1 : 0,
									event.data.canceledAt
										? Math.floor(
												new Date(event.data.canceledAt).getTime() / 1000,
											)
										: null,
								],
							);

							console.log(
								`[Webhook] Updated subscription ${id} for user ${userId}`,
							);
							break;
						}

						default:
							console.log(`[Webhook] Unhandled event type: ${event.type}`);
					}

					return Response.json({ received: true });
				} catch (error) {
					// Processing failed - log with detail but return generic response
					console.error("[Webhook] Event processing failed:", error);
					return Response.json({ error: "Invalid webhook" }, { status: 400 });
				}
			},
		},
		"/api/transcriptions/:id/stream": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const transcriptionId = req.params.id;
					// Verify ownership
					const transcription = db
						.query<
							{
								id: string;
								user_id: number;
								class_id: string | null;
								status: string;
							},
							[string]
						>(
							"SELECT id, user_id, class_id, status FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Check access permissions
					const isOwner = transcription.user_id === user.id;
					const isAdmin = user.role === "admin";
					let isClassMember = false;

					// If transcription belongs to a class, check enrollment
					if (transcription.class_id) {
						isClassMember = isUserEnrolledInClass(
							user.id,
							transcription.class_id,
						);
					}

					// Allow access if: owner, admin, or enrolled in the class
					if (!isOwner && !isAdmin && !isClassMember) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}

					// Require subscription only if accessing own transcription (not class)
					if (
						isOwner &&
						!transcription.class_id &&
						!isAdmin &&
						!hasActiveSubscription(user.id)
					) {
						throw AuthErrors.subscriptionRequired();
					}
					// Event-driven SSE stream with reconnection support
					const stream = new ReadableStream({
						async start(controller) {
							// Track this stream for graceful shutdown
							activeSSEStreams.add(controller);

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
								activeSSEStreams.delete(controller);
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
									activeSSEStreams.delete(controller);
									controller.close();
								}
							};
							transcriptionEvents.on(transcriptionId, updateHandler);
							// Cleanup on client disconnect
							return () => {
								isClosed = true;
								clearInterval(heartbeatInterval);
								transcriptionEvents.off(transcriptionId, updateHandler);
								activeSSEStreams.delete(controller);
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
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/health": {
			GET: async () => {
				const health = {
					status: "healthy",
					timestamp: new Date().toISOString(),
					services: {
						database: false,
						whisper: false,
						storage: false,
					},
					details: {} as Record<string, unknown>,
				};

				// Check database
				try {
					db.query("SELECT 1").get();
					health.services.database = true;
				} catch (error) {
					health.status = "unhealthy";
					health.details.databaseError =
						error instanceof Error ? error.message : String(error);
				}

				// Check Whisper service
				try {
					const whisperHealthy = await whisperService.checkHealth();
					health.services.whisper = whisperHealthy;
					if (!whisperHealthy) {
						health.status = "degraded";
						health.details.whisperNote = "Whisper service unavailable";
					}
				} catch (error) {
					health.status = "degraded";
					health.details.whisperError =
						error instanceof Error ? error.message : String(error);
				}

				// Check storage (uploads and transcripts directories)
				try {
					const fs = await import("node:fs/promises");
					const uploadsExists = await fs
						.access("./uploads")
						.then(() => true)
						.catch(() => false);
					const transcriptsExists = await fs
						.access("./transcripts")
						.then(() => true)
						.catch(() => false);
					health.services.storage = uploadsExists && transcriptsExists;
					if (!health.services.storage) {
						health.status = "unhealthy";
						health.details.storageNote = `Missing directories: ${[
							!uploadsExists && "uploads",
							!transcriptsExists && "transcripts",
						]
							.filter(Boolean)
							.join(", ")}`;
					}
				} catch (error) {
					health.status = "unhealthy";
					health.details.storageError =
						error instanceof Error ? error.message : String(error);
				}

				const statusCode = health.status === "healthy" ? 200 : 503;
				return Response.json(health, { status: statusCode });
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
								class_id: string | null;
								filename: string;
								original_filename: string;
								status: string;
								progress: number;
								created_at: number;
							},
							[string]
						>(
							"SELECT id, user_id, class_id, filename, original_filename, status, progress, created_at FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Check access permissions
					const isOwner = transcription.user_id === user.id;
					const isAdmin = user.role === "admin";
					let isClassMember = false;

					// If transcription belongs to a class, check enrollment
					if (transcription.class_id) {
						isClassMember = isUserEnrolledInClass(
							user.id,
							transcription.class_id,
						);
					}

					// Allow access if: owner, admin, or enrolled in the class
					if (!isOwner && !isAdmin && !isClassMember) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}

					// Require subscription only if accessing own transcription (not class)
					if (
						isOwner &&
						!transcription.class_id &&
						!isAdmin &&
						!hasActiveSubscription(user.id)
					) {
						throw AuthErrors.subscriptionRequired();
					}

					if (transcription.status !== "completed") {
						return Response.json(
							{ error: "Transcription not completed yet" },
							{ status: 409 },
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
								class_id: string | null;
								filename: string;
								status: string;
							},
							[string]
						>(
							"SELECT id, user_id, class_id, filename, status FROM transcriptions WHERE id = ?",
						)
						.get(transcriptionId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Check access permissions
					const isOwner = transcription.user_id === user.id;
					const isAdmin = user.role === "admin";
					let isClassMember = false;

					// If transcription belongs to a class, check enrollment
					if (transcription.class_id) {
						isClassMember = isUserEnrolledInClass(
							user.id,
							transcription.class_id,
						);
					}

					// Allow access if: owner, admin, or enrolled in the class
					if (!isOwner && !isAdmin && !isClassMember) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}

					// Require subscription only if accessing own transcription (not class)
					if (
						isOwner &&
						!transcription.class_id &&
						!isAdmin &&
						!hasActiveSubscription(user.id)
					) {
						throw AuthErrors.subscriptionRequired();
					}

					// For pending recordings, audio file exists even though transcription isn't complete
					// Allow audio access for pending and completed statuses
					if (
						transcription.status !== "completed" &&
						transcription.status !== "pending"
					) {
						return Response.json(
							{ error: "Audio not available yet" },
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
					const user = requireSubscription(req);
					const url = new URL(req.url);

					// Parse pagination params
					const limit = Math.min(
						Number.parseInt(url.searchParams.get("limit") || "50", 10),
						100,
					);
					const cursorParam = url.searchParams.get("cursor");

					let transcriptions: Array<{
						id: string;
						filename: string;
						original_filename: string;
						class_id: string | null;
						status: string;
						progress: number;
						created_at: number;
					}>;

					if (cursorParam) {
						// Decode cursor
						const { decodeCursor } = await import("./lib/cursor");
						const parts = decodeCursor(cursorParam);

						if (parts.length !== 2) {
							return Response.json(
								{ error: "Invalid cursor format" },
								{ status: 400 },
							);
						}

						const cursorTime = Number.parseInt(parts[0] || "", 10);
						const id = parts[1] || "";

						if (Number.isNaN(cursorTime) || !id) {
							return Response.json(
								{ error: "Invalid cursor format" },
								{ status: 400 },
							);
						}

						transcriptions = db
							.query<
								{
									id: string;
									filename: string;
									original_filename: string;
									class_id: string | null;
									status: string;
									progress: number;
									created_at: number;
								},
								[number, number, string, number]
							>(
								`SELECT id, filename, original_filename, class_id, status, progress, created_at 
								FROM transcriptions 
								WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
								ORDER BY created_at DESC, id DESC 
								LIMIT ?`,
							)
							.all(user.id, cursorTime, cursorTime, id, limit + 1);
					} else {
						transcriptions = db
							.query<
								{
									id: string;
									filename: string;
									original_filename: string;
									class_id: string | null;
									status: string;
									progress: number;
									created_at: number;
								},
								[number, number]
							>(
								`SELECT id, filename, original_filename, class_id, status, progress, created_at 
								FROM transcriptions 
								WHERE user_id = ? 
								ORDER BY created_at DESC, id DESC 
								LIMIT ?`,
							)
							.all(user.id, limit + 1);
					}

					// Check if there are more results
					const hasMore = transcriptions.length > limit;
					if (hasMore) {
						transcriptions.pop(); // Remove extra item
					}

					// Build next cursor
					let nextCursor: string | null = null;
					if (hasMore && transcriptions.length > 0) {
						const { encodeCursor } = await import("./lib/cursor");
						const last = transcriptions[transcriptions.length - 1];
						if (last) {
							nextCursor = encodeCursor([last.created_at.toString(), last.id]);
						}
					}

					// Load transcripts from files for completed jobs
					const jobs = await Promise.all(
						transcriptions.map(async (t) => {
							return {
								id: t.id,
								filename: t.original_filename,
								class_id: t.class_id,
								status: t.status,
								progress: t.progress,
								created_at: t.created_at,
							};
						}),
					);

					return Response.json({
						jobs,
						pagination: {
							limit,
							hasMore,
							nextCursor,
						},
					});
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					const user = requireSubscription(req);

					const rateLimitError = enforceRateLimit(req, "upload-transcription", {
						ip: { max: 20, windowSeconds: 60 * 60 },
					});
					if (rateLimitError) return rateLimitError;

					const formData = await req.formData();
					const file = formData.get("audio") as File;
					const classId = formData.get("class_id") as string | null;
					const meetingTimeId = formData.get("meeting_time_id") as
						| string
						| null;
					const sectionId = formData.get("section_id") as string | null;

					if (!file) throw ValidationErrors.missingField("audio");

					// If class_id provided, verify user is enrolled (or admin)
					if (classId) {
						const enrolled = isUserEnrolledInClass(user.id, classId);
						if (!enrolled && user.role !== "admin") {
							return Response.json(
								{ error: "Not enrolled in this class" },
								{ status: 403 },
							);
						}

						// Verify class exists
						const classInfo = getClassById(classId);
						if (!classInfo) {
							return Response.json(
								{ error: "Class not found" },
								{ status: 404 },
							);
						}

						// Check if class is archived
						if (classInfo.archived) {
							return Response.json(
								{ error: "Cannot upload to archived class" },
								{ status: 400 },
							);
						}
					}

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
						throw ValidationErrors.fileTooLarge("100MB");
					}

					// Generate unique filename
					const transcriptionId = crypto.randomUUID();
					const filename = `${transcriptionId}.${fileExtension}`;

					// Save file to disk
					const uploadDir = "./uploads";
					await Bun.write(`${uploadDir}/${filename}`, file);

					// Create database record
					db.run(
						"INSERT INTO transcriptions (id, user_id, class_id, meeting_time_id, section_id, filename, original_filename, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
						[
							transcriptionId,
							user.id,
							classId,
							meetingTimeId,
							sectionId,
							filename,
							file.name,
							"pending",
						],
					);

					// Don't auto-start transcription - admin will select recordings
					// whisperService.startTranscription(transcriptionId, filename);

					return Response.json(
						{
							id: transcriptionId,
							message: "Upload successful",
						},
						{ status: 201 },
					);
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/transcriptions": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const url = new URL(req.url);

					const limit = Math.min(
						Number.parseInt(url.searchParams.get("limit") || "50", 10),
						100,
					);
					const cursor = url.searchParams.get("cursor") || undefined;

					const result = getAllTranscriptions(limit, cursor);
					return Response.json(result.data); // Return just the array for now, can add pagination UI later
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/users": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const url = new URL(req.url);

					const limit = Math.min(
						Number.parseInt(url.searchParams.get("limit") || "50", 10),
						100,
					);
					const cursor = url.searchParams.get("cursor") || undefined;

					const result = getAllUsersWithStats(limit, cursor);
					return Response.json(result.data); // Return just the array for now, can add pagination UI later
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/classes": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const classes = getClassesForUser(0, true); // Admin sees all classes
					return Response.json({ classes });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/waitlist": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const waitlist = getAllWaitlistEntries();
					return Response.json({ waitlist });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/admin/waitlist/:id": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const id = req.params.id;
					deleteWaitlistEntry(id);
					return new Response(null, { status: 204 });
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
					return new Response(null, { status: 204 });
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
					await deleteUser(userId);
					return new Response(null, { status: 204 });
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
		"/api/admin/users/:id/subscription": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					const body = await req.json();
					const { subscriptionId } = body as { subscriptionId: string };

					if (!subscriptionId) {
						return Response.json(
							{ error: "Subscription ID required" },
							{ status: 400 },
						);
					}

					try {
						const { polar } = await import("./lib/polar");
						await polar.subscriptions.revoke({ id: subscriptionId });
						return Response.json({
							success: true,
							message: "Subscription revoked successfully",
						});
					} catch (error) {
						console.error(
							`[Admin] Failed to revoke subscription ${subscriptionId}:`,
							error,
						);
						return Response.json(
							{
								error:
									error instanceof Error
										? error.message
										: "Failed to revoke subscription",
							},
							{ status: 500 },
						);
					}
				} catch (error) {
					return handleError(error);
				}
			},
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					// Get user email
					const user = db
						.query<{ email: string }, [number]>(
							"SELECT email FROM users WHERE id = ?",
						)
						.get(userId);

					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					try {
						await syncUserSubscriptionsFromPolar(userId, user.email);
						return Response.json({
							success: true,
							message: "Subscription synced successfully",
						});
					} catch (error) {
						console.error(
							`[Admin] Failed to sync subscription for user ${userId}:`,
							error,
						);
						return Response.json(
							{
								error:
									error instanceof Error
										? error.message
										: "Failed to sync subscription",
							},
							{ status: 500 },
						);
					}
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
		"/api/admin/users/:id/password-reset": {
			POST: async (req) => {
				try {
					requireAdmin(req);
					const userId = Number.parseInt(req.params.id, 10);
					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					// Get user details
					const user = db
						.query<
							{ id: number; email: string; name: string | null },
							[number]
						>("SELECT id, email, name FROM users WHERE id = ?")
						.get(userId);

					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					// Create password reset token
					const origin = process.env.ORIGIN || "http://localhost:3000";
					const resetToken = createPasswordResetToken(user.id);
					const resetLink = `${origin}/reset-password?token=${resetToken}`;

					// Send password reset email
					await sendEmail({
						to: user.email,
						subject: "Reset your password - Thistle",
						html: passwordResetTemplate({
							name: user.name,
							resetLink,
						}),
					});

					return Response.json({
						success: true,
						message: "Password reset email sent",
					});
				} catch (error) {
					console.error("[Admin] Password reset error:", error);
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
					return new Response(null, { status: 204 });
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

					const nameValidation = validateName(name);
					if (!nameValidation.valid) {
						return Response.json(
							{ error: nameValidation.error },
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
					const { email, skipVerification } = body as {
						email: string;
						skipVerification?: boolean;
					};

					const emailValidation = validateEmail(email);
					if (!emailValidation.valid) {
						return Response.json(
							{ error: emailValidation.error },
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
							{ status: 409 },
						);
					}

					if (skipVerification) {
						// Admin override: change email immediately without verification
						updateUserEmailAddress(userId, email);
						return Response.json({
							success: true,
							message: "Email updated immediately (verification skipped)",
						});
					}

					// Get user's current email
					const user = db
						.query<{ email: string; name: string | null }, [number]>(
							"SELECT email, name FROM users WHERE id = ?",
						)
						.get(userId);

					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					// Send verification email to user's current email
					try {
						const token = createEmailChangeToken(userId, email);
						const origin = process.env.ORIGIN || "http://localhost:3000";
						const verifyUrl = `${origin}/api/user/email/verify?token=${token}`;

						await sendEmail({
							to: user.email,
							subject: "Verify your email change",
							html: emailChangeTemplate({
								name: user.name,
								currentEmail: user.email,
								newEmail: email,
								verifyLink: verifyUrl,
							}),
						});

						return Response.json({
							success: true,
							message: `Verification email sent to ${user.email}`,
							pendingEmail: email,
						});
					} catch (emailError) {
						console.error(
							"[Admin] Failed to send email change verification:",
							emailError,
						);
						return Response.json(
							{ error: "Failed to send verification email" },
							{ status: 500 },
						);
					}
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
					return new Response(null, { status: 204 });
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

					return new Response(null, { status: 204 });
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
		"/api/classes": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const url = new URL(req.url);

					const limit = Math.min(
						Number.parseInt(url.searchParams.get("limit") || "50", 10),
						100,
					);
					const cursor = url.searchParams.get("cursor") || undefined;

					const result = getClassesForUser(
						user.id,
						user.role === "admin",
						limit,
						cursor,
					);

					// Group by semester/year for all users
					const grouped: Record<
						string,
						Array<{
							id: string;
							course_code: string;
							name: string;
							professor: string;
							semester: string;
							year: number;
							archived: boolean;
						}>
					> = {};

					for (const cls of result.data) {
						const key = `${cls.semester} ${cls.year}`;
						if (!grouped[key]) {
							grouped[key] = [];
						}
						grouped[key]?.push({
							id: cls.id,
							course_code: cls.course_code,
							name: cls.name,
							professor: cls.professor,
							semester: cls.semester,
							year: cls.year,
							archived: cls.archived,
						});
					}

					return Response.json({
						classes: grouped,
						pagination: result.pagination,
					});
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					requireAdmin(req);
					const body = await req.json();
					const {
						course_code,
						name,
						professor,
						semester,
						year,
						meeting_times,
					} = body;

					// Validate all required fields
					const courseCodeValidation = validateCourseCode(course_code);
					if (!courseCodeValidation.valid) {
						return Response.json(
							{ error: courseCodeValidation.error },
							{ status: 400 },
						);
					}

					const nameValidation = validateCourseName(name);
					if (!nameValidation.valid) {
						return Response.json(
							{ error: nameValidation.error },
							{ status: 400 },
						);
					}

					const professorValidation = validateName(professor, "Professor name");
					if (!professorValidation.valid) {
						return Response.json(
							{ error: professorValidation.error },
							{ status: 400 },
						);
					}

					const semesterValidation = validateSemester(semester);
					if (!semesterValidation.valid) {
						return Response.json(
							{ error: semesterValidation.error },
							{ status: 400 },
						);
					}

					const yearValidation = validateYear(year);
					if (!yearValidation.valid) {
						return Response.json(
							{ error: yearValidation.error },
							{ status: 400 },
						);
					}

					const newClass = createClass({
						course_code,
						name,
						professor,
						semester,
						year,
						meeting_times,
						sections: body.sections,
					});

					return Response.json(newClass, { status: 201 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/search": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const url = new URL(req.url);
					const query = url.searchParams.get("q");

					if (!query) {
						return Response.json({ classes: [] });
					}

					const classes = searchClassesByCourseCode(query);

					// Get user's enrolled classes to mark them
					const enrolledClassIds = db
						.query<{ class_id: string }, [number]>(
							"SELECT class_id FROM class_members WHERE user_id = ?",
						)
						.all(user.id)
						.map((row) => row.class_id);

					// Add is_enrolled flag and sections to each class
					const classesWithEnrollment = classes.map((cls) => ({
						...cls,
						is_enrolled: enrolledClassIds.includes(cls.id),
						sections: getClassSections(cls.id),
					}));

					return Response.json({ classes: classesWithEnrollment });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/join": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);
					const body = await req.json();
					const classId = body.class_id;
					const sectionId = body.section_id || null;

					const classIdValidation = validateClassId(classId);
					if (!classIdValidation.valid) {
						return Response.json(
							{ error: classIdValidation.error },
							{ status: 400 },
						);
					}

					const result = joinClass(classId, user.id, sectionId);

					if (!result.success) {
						return Response.json({ error: result.error }, { status: 400 });
					}

					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/waitlist": {
			POST: async (req) => {
				try {
					const user = requireAuth(req);
					const body = await req.json();

					const {
						courseCode,
						courseName,
						professor,
						semester,
						year,
						additionalInfo,
						meetingTimes,
					} = body;

					// Validate all required fields
					const courseCodeValidation = validateCourseCode(courseCode);
					if (!courseCodeValidation.valid) {
						return Response.json(
							{ error: courseCodeValidation.error },
							{ status: 400 },
						);
					}

					const nameValidation = validateCourseName(courseName);
					if (!nameValidation.valid) {
						return Response.json(
							{ error: nameValidation.error },
							{ status: 400 },
						);
					}

					const professorValidation = validateName(professor, "Professor name");
					if (!professorValidation.valid) {
						return Response.json(
							{ error: professorValidation.error },
							{ status: 400 },
						);
					}

					const semesterValidation = validateSemester(semester);
					if (!semesterValidation.valid) {
						return Response.json(
							{ error: semesterValidation.error },
							{ status: 400 },
						);
					}

					const yearValidation = validateYear(
						typeof year === "string" ? Number.parseInt(year, 10) : year,
					);
					if (!yearValidation.valid) {
						return Response.json(
							{ error: yearValidation.error },
							{ status: 400 },
						);
					}

					const id = addToWaitlist(
						user.id,
						courseCode,
						courseName,
						professor,
						semester,
						Number.parseInt(year, 10),
						additionalInfo || null,
						meetingTimes || null,
					);

					return Response.json({ success: true, id }, { status: 201 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const classId = req.params.id;

					const classInfo = getClassById(classId);
					if (!classInfo) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					// Check enrollment or admin
					const isEnrolled = isUserEnrolledInClass(user.id, classId);
					if (!isEnrolled && user.role !== "admin") {
						return Response.json(
							{ error: "Not enrolled in this class" },
							{ status: 403 },
						);
					}

					const meetingTimes = getMeetingTimesForClass(classId);
					const sections = getClassSections(classId);
					const transcriptions = getTranscriptionsForClass(classId);
					const userSection = getUserSection(user.id, classId);

					return Response.json({
						class: classInfo,
						meetingTimes,
						sections,
						userSection,
						transcriptions,
					});
				} catch (error) {
					return handleError(error);
				}
			},
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;

					// Verify class exists
					const existingClass = getClassById(classId);
					if (!existingClass) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					deleteClass(classId);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id/archive": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;
					const body = await req.json();
					const { archived } = body;

					if (typeof archived !== "boolean") {
						return Response.json(
							{ error: "archived must be a boolean" },
							{ status: 400 },
						);
					}

					// Verify class exists
					const existingClass = getClassById(classId);
					if (!existingClass) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					toggleClassArchive(classId, archived);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id/members": {
			GET: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;

					const members = getClassMembers(classId);
					return Response.json({ members });
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;
					const body = await req.json();
					const { email } = body;

					if (!email) {
						return Response.json({ error: "Email required" }, { status: 400 });
					}

					// Verify class exists
					const existingClass = getClassById(classId);
					if (!existingClass) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					const user = getUserByEmail(email);
					if (!user) {
						return Response.json({ error: "User not found" }, { status: 404 });
					}

					enrollUserInClass(user.id, classId);
					return new Response(null, { status: 201 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id/members/:userId": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;
					const userId = Number.parseInt(req.params.userId, 10);

					if (Number.isNaN(userId)) {
						return Response.json({ error: "Invalid user ID" }, { status: 400 });
					}

					// Verify class exists
					const existingClass = getClassById(classId);
					if (!existingClass) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					removeUserFromClass(userId, classId);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id/meetings": {
			GET: async (req) => {
				try {
					const user = requireAuth(req);
					const classId = req.params.id;

					// Check enrollment or admin
					const isEnrolled = isUserEnrolledInClass(user.id, classId);
					if (!isEnrolled && user.role !== "admin") {
						return Response.json(
							{ error: "Not enrolled in this class" },
							{ status: 403 },
						);
					}

					const meetingTimes = getMeetingTimesForClass(classId);
					return Response.json({ meetings: meetingTimes });
				} catch (error) {
					return handleError(error);
				}
			},
			POST: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;
					const body = await req.json();
					const { label } = body;

					if (!label) {
						return Response.json({ error: "Label required" }, { status: 400 });
					}

					// Verify class exists
					const existingClass = getClassById(classId);
					if (!existingClass) {
						return Response.json({ error: "Class not found" }, { status: 404 });
					}

					const meetingTime = createMeetingTime(classId, label);
					return Response.json(meetingTime, { status: 201 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:id/sections": {
			POST: async (req) => {
				try {
					requireAdmin(req);
					const classId = req.params.id;
					const body = await req.json();
					const { section_number } = body;

					if (!section_number) {
						return Response.json({ error: "Section number required" }, { status: 400 });
					}

					const section = createClassSection(classId, section_number);
					return Response.json(section);
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/classes/:classId/sections/:sectionId": {
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const sectionId = req.params.sectionId;

					// Check if any students are in this section
					const studentsInSection = db
						.query<{ count: number }, [string]>(
							"SELECT COUNT(*) as count FROM class_members WHERE section_id = ?",
						)
						.get(sectionId);

					if (studentsInSection && studentsInSection.count > 0) {
						return Response.json(
							{ error: "Cannot delete section with enrolled students" },
							{ status: 400 },
						);
					}

					db.run("DELETE FROM class_sections WHERE id = ?", [sectionId]);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/meetings/:id": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const meetingId = req.params.id;
					const body = await req.json();
					const { label } = body;

					if (!label) {
						return Response.json({ error: "Label required" }, { status: 400 });
					}

					// Verify meeting exists
					const existingMeeting = getMeetingById(meetingId);
					if (!existingMeeting) {
						return Response.json(
							{ error: "Meeting not found" },
							{ status: 404 },
						);
					}

					updateMeetingTime(meetingId, label);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
			DELETE: async (req) => {
				try {
					requireAdmin(req);
					const meetingId = req.params.id;

					// Verify meeting exists
					const existingMeeting = getMeetingById(meetingId);
					if (!existingMeeting) {
						return Response.json(
							{ error: "Meeting not found" },
							{ status: 404 },
						);
					}

					deleteMeetingTime(meetingId);
					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
		"/api/transcripts/:id/select": {
			PUT: async (req) => {
				try {
					requireAdmin(req);
					const transcriptId = req.params.id;

					// Check if transcription exists and get its current status
					const transcription = db
						.query<{ filename: string; status: string }, [string]>(
							"SELECT filename, status FROM transcriptions WHERE id = ?",
						)
						.get(transcriptId);

					if (!transcription) {
						return Response.json(
							{ error: "Transcription not found" },
							{ status: 404 },
						);
					}

					// Validate that status is appropriate for selection (e.g., 'uploading' or 'pending')
					const validStatuses = ["uploading", "pending", "failed"];
					if (!validStatuses.includes(transcription.status)) {
						return Response.json(
							{
								error: `Cannot select transcription with status: ${transcription.status}`,
							},
							{ status: 400 },
						);
					}

					// Update status to 'selected' and start transcription
					db.run("UPDATE transcriptions SET status = ? WHERE id = ?", [
						"selected",
						transcriptId,
					]);

					whisperService.startTranscription(
						transcriptId,
						transcription.filename,
					);

					return new Response(null, { status: 204 });
				} catch (error) {
					return handleError(error);
				}
			},
		},
	},
	development: process.env.NODE_ENV === "dev",
	fetch(req, server) {
		const response = server.fetch(req);

		// Add security headers to all responses
		if (response instanceof Response) {
			const headers = new Headers(response.headers);
			headers.set("Permissions-Policy", "interest-cohort=()");
			headers.set("X-Content-Type-Options", "nosniff");
			headers.set("X-Frame-Options", "DENY");
			headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

			// Set CSP that allows inline styles with unsafe-inline (needed for Lit components)
			// and script-src 'self' for bundled scripts
			headers.set(
				"Content-Security-Policy",
				"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://hostedboringavatars.vercel.app; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none';",
			);

			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		return response;
	},
});
console.log(`🪻 Thistle running at http://localhost:${server.port}`);

// Track active SSE streams for graceful shutdown
const activeSSEStreams = new Set<ReadableStreamDefaultController>();

// Graceful shutdown handler
let isShuttingDown = false;

async function shutdown(signal: string) {
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log(`\n${signal} received, starting graceful shutdown...`);

	// 1. Stop accepting new requests
	console.log("[Shutdown] Closing server...");
	server.stop();

	// 2. Close all active SSE streams (safe to kill - sync will handle reconnection)
	console.log(
		`[Shutdown] Closing ${activeSSEStreams.size} active SSE streams...`,
	);
	for (const controller of activeSSEStreams) {
		try {
			controller.close();
		} catch {
			// Already closed
		}
	}
	activeSSEStreams.clear();

	// 3. Stop transcription service (closes streams to Murmur)
	whisperService.stop();

	// 4. Stop cleanup intervals
	console.log("[Shutdown] Stopping cleanup intervals...");
	clearInterval(sessionCleanupInterval);
	clearInterval(syncInterval);
	clearInterval(fileCleanupInterval);

	// 5. Close database connections
	console.log("[Shutdown] Closing database...");
	db.close();

	console.log("[Shutdown] Complete");
	process.exit(0);
}

// Register shutdown handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
