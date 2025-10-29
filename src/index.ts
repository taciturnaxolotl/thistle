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
import indexHTML from "./pages/index.html";
import settingsHTML from "./pages/settings.html";

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

const server = Bun.serve({
	port: 3000,
	routes: {
		"/": indexHTML,
		"/settings": settingsHTML,
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
				} catch (_) {
					return Response.json({ error: "Login failed" }, { status: 500 });
				}
			},
		},
		"/api/auth/logout": {
			POST: (req) => {
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
						is_current: s.id === sessionId,
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
		"/api/auth/delete-account": {
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
	},
	development: {
		hmr: true,
		console: true,
	},
});

console.log(`🪻 Thistle running at http://localhost:${server.port}`);
