import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { hashPasswordClient } from "./lib/client-auth";
import type { Subprocess } from "bun";

// Test server configuration
const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB_PATH = "./thistle.test.db";

// Test server process
let serverProcess: Subprocess | null = null;

beforeAll(async () => {
	// Clean up any existing test database
	try {
		await import("node:fs/promises").then((fs) => fs.unlink(TEST_DB_PATH));
	} catch {
		// Ignore if doesn't exist
	}

	// Start test server as subprocess
	serverProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
		env: {
			...process.env,
			NODE_ENV: "test",
			PORT: TEST_PORT.toString(),
			SKIP_EMAILS: "true",
			SKIP_POLAR_SYNC: "true",
			// Dummy env vars to pass startup validation (won't be used due to SKIP_EMAILS/SKIP_POLAR_SYNC)
			MAILCHANNELS_API_KEY: "test-key",
			DKIM_PRIVATE_KEY: "test-key",
			LLM_API_KEY: "test-key",
			LLM_API_BASE_URL: "https://test.com",
			LLM_MODEL: "test-model",
			POLAR_ACCESS_TOKEN: "test-token",
			POLAR_ORGANIZATION_ID: "test-org",
			POLAR_PRODUCT_ID: "test-product",
			POLAR_SUCCESS_URL: "http://localhost:3001/success",
			POLAR_WEBHOOK_SECRET: "test-webhook-secret",
			ORIGIN: "http://localhost:3001",
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	// Log server output for debugging
	const stdoutReader = serverProcess.stdout.getReader();
	const stderrReader = serverProcess.stderr.getReader();
	const decoder = new TextDecoder();
	
	(async () => {
		try {
			while (true) {
				const { value, done } = await stdoutReader.read();
				if (done) break;
				const text = decoder.decode(value);
				console.log("[SERVER OUT]", text.trim());
			}
		} catch {}
	})();
	
	(async () => {
		try {
			while (true) {
				const { value, done } = await stderrReader.read();
				if (done) break;
				const text = decoder.decode(value);
				console.error("[SERVER ERR]", text.trim());
			}
		} catch {}
	})();

	// Wait for server to be ready
	let retries = 30;
	let ready = false;
	while (retries > 0 && !ready) {
		try {
			const response = await fetch(`${BASE_URL}/api/health`, {
				signal: AbortSignal.timeout(1000),
			});
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			// Server not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
		retries--;
	}

	if (!ready) {
		throw new Error("Test server failed to start within 15 seconds");
	}

	console.log(`✓ Test server running on port ${TEST_PORT}`);
});

afterAll(async () => {
	// Kill test server
	if (serverProcess) {
		serverProcess.kill();
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// Clean up test database
	try {
		await import("node:fs/promises").then((fs) => fs.unlink(TEST_DB_PATH));
	} catch {
		// Ignore if doesn't exist
	}

	console.log("✓ Test server stopped and test database cleaned up");
});

// Test user credentials
const TEST_USER = {
	email: "test@example.com",
	password: "TestPassword123!",
	name: "Test User",
};

const TEST_ADMIN = {
	email: "admin@example.com",
	password: "AdminPassword123!",
	name: "Admin User",
};

const TEST_USER_2 = {
	email: "test2@example.com",
	password: "TestPassword456!",
	name: "Test User 2",
};

// Helper to hash passwords like the client would
async function clientHashPassword(
	email: string,
	password: string,
): Promise<string> {
	return await hashPasswordClient(password, email);
}

// Helper to extract session cookie
function extractSessionCookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) throw new Error("No set-cookie header found");
	const match = setCookie.match(/session=([^;]+)/);
	if (!match) throw new Error("No session cookie found in set-cookie header");
	return match[1];
}

// Helper to make authenticated requests
function authRequest(
	url: string,
	sessionCookie: string,
	options: RequestInit = {},
): Promise<Response> {
	return fetch(url, {
		...options,
		headers: {
			...options.headers,
			Cookie: `session=${sessionCookie}`,
		},
	});
}

// All tests run against a fresh database, no cleanup needed

describe("API Endpoints - Authentication", () => {
	describe("POST /api/auth/register", () => {
		test("should register a new user successfully", async () => {
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);

			const response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
					name: TEST_USER.name,
				}),
			});

			if (response.status !== 200) {
				const error = await response.json();
				console.error("Registration failed:", response.status, error);
			}

			expect(response.status).toBe(200);
			
			// Extract session before consuming response body
			const sessionCookie = extractSessionCookie(response);
			
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(TEST_USER.email);
			expect(sessionCookie).toBeTruthy();
		});

		test("should reject registration with missing email", async () => {
			const response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					password: "hashedpassword123456",
				}),
			});

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Email and password required");
		});

		test(
			"should reject registration with invalid password format",
			async () => {
				const response = await fetch(`${BASE_URL}/api/auth/register`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: TEST_USER.email,
						password: "short",
					}),
				});

				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.error).toBe("Invalid password format");
			},
		);

		test("should reject duplicate email registration", async () => {
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);

			// First registration
			await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
					name: TEST_USER.name,
				}),
			});

			// Duplicate registration
			const response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
					name: TEST_USER.name,
				}),
			});

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Email already registered");
		});

		test("should enforce rate limiting on registration", async () => {
			const hashedPassword = await clientHashPassword(
				"test@example.com",
				"password",
			);

			// Make registration attempts until rate limit is hit (limit is 5 per hour)
			let rateLimitHit = false;
			for (let i = 0; i < 10; i++) {
				const response = await fetch(`${BASE_URL}/api/auth/register`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: `test${i}@example.com`,
						password: hashedPassword,
					}),
				});

				if (response.status === 429) {
					rateLimitHit = true;
					break;
				}
			}

			// Verify that rate limiting was triggered
			expect(rateLimitHit).toBe(true);
		});
	});

	describe("POST /api/auth/login", () => {
		test("should login successfully with valid credentials", async () => {
			// Register user first
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
					name: TEST_USER.name,
				}),
			});

			// Login
			const response = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(TEST_USER.email);
			expect(extractSessionCookie(response)).toBeTruthy();
		});

		test("should reject login with invalid credentials", async () => {
			// Register user first
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});

			// Login with wrong password
			const wrongPassword = await clientHashPassword(
				TEST_USER.email,
				"WrongPassword123!",
			);
			const response = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: wrongPassword,
				}),
			});

			expect(response.status).toBe(401);
			const data = await response.json();
			expect(data.error).toBe("Invalid email or password");
		});

		test("should reject login with missing fields", async () => {
			const response = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
				}),
			});

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Email and password required");
		});

		test("should enforce rate limiting on login attempts", async () => {
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);

			// Make 11 login attempts (limit is 10 per 15 minutes per IP)
			let rateLimitHit = false;
			for (let i = 0; i < 11; i++) {
				const response = await fetch(`${BASE_URL}/api/auth/login`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: TEST_USER.email,
						password: hashedPassword,
					}),
				});

				if (response.status === 429) {
					rateLimitHit = true;
					break;
				}
			}

			// Verify that rate limiting was triggered
			expect(rateLimitHit).toBe(true);
		});
	});

	describe("POST /api/auth/logout", () => {
		test("should logout successfully", async () => {
			// Register and login
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const loginResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(loginResponse);

			// Logout
			const response = await authRequest(
				`${BASE_URL}/api/auth/logout`,
				sessionCookie,
				{
					method: "POST",
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify cookie is cleared
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toContain("Max-Age=0");
		});

		test("should logout even without valid session", async () => {
			const response = await fetch(`${BASE_URL}/api/auth/logout`, {
				method: "POST",
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});
	});

	describe("GET /api/auth/me", () => {
		test(
			"should return current user info when authenticated",
			async () => {
				// Register user
				const hashedPassword = await clientHashPassword(
					TEST_USER.email,
					TEST_USER.password,
				);
				const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: TEST_USER.email,
						password: hashedPassword,
						name: TEST_USER.name,
					}),
				});
				const sessionCookie = extractSessionCookie(registerResponse);

				// Get current user
				const response = await authRequest(
					`${BASE_URL}/api/auth/me`,
					sessionCookie,
				);

				expect(response.status).toBe(200);
				const data = await response.json();
				expect(data.email).toBe(TEST_USER.email);
				expect(data.name).toBe(TEST_USER.name);
				expect(data.role).toBeDefined();
			},
		);

		test("should return 401 when not authenticated", async () => {
			const response = await fetch(`${BASE_URL}/api/auth/me`);

			expect(response.status).toBe(401);
			const data = await response.json();
			expect(data.error).toBe("Not authenticated");
		});

		test("should return 401 with invalid session", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/auth/me`,
				"invalid-session",
			);

			expect(response.status).toBe(401);
			const data = await response.json();
			expect(data.error).toBe("Invalid session");
		});
	});
});

describe("API Endpoints - Session Management", () => {
	describe("GET /api/sessions", () => {
		test("should return user sessions", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Get sessions
			const response = await authRequest(
				`${BASE_URL}/api/sessions`,
				sessionCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.sessions).toBeDefined();
			expect(data.sessions.length).toBeGreaterThan(0);
			expect(data.sessions[0]).toHaveProperty("id");
			expect(data.sessions[0]).toHaveProperty("ip_address");
			expect(data.sessions[0]).toHaveProperty("user_agent");
		});

		test("should require authentication", async () => {
			const response = await fetch(`${BASE_URL}/api/sessions`);

			expect(response.status).toBe(401);
		});
	});

	describe("DELETE /api/sessions", () => {
		test("should delete specific session", async () => {
			// Register user and create multiple sessions
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const session1Response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const session1Cookie = extractSessionCookie(session1Response);

			const session2Response = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const session2Cookie = extractSessionCookie(session2Response);

			// Get sessions list
			const sessionsResponse = await authRequest(
				`${BASE_URL}/api/sessions`,
				session1Cookie,
			);
			const sessionsData = await sessionsResponse.json();
			const targetSessionId = sessionsData.sessions.find(
				(s: { id: string }) => s.id === session2Cookie,
			)?.id;

			// Delete session 2
			const response = await authRequest(
				`${BASE_URL}/api/sessions`,
				session1Cookie,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId: targetSessionId }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify session 2 is deleted
			const verifyResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				session2Cookie,
			);
			expect(verifyResponse.status).toBe(401);
		});

		test("should not delete another user's session", async () => {
			// Register two users
			const hashedPassword1 = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const user1Response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword1,
				}),
			});
			const user1Cookie = extractSessionCookie(user1Response);

			const hashedPassword2 = await clientHashPassword(
				TEST_USER_2.email,
				TEST_USER_2.password,
			);
			const user2Response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER_2.email,
					password: hashedPassword2,
				}),
			});
			const user2Cookie = extractSessionCookie(user2Response);

			// Try to delete user2's session using user1's credentials
			const response = await authRequest(
				`${BASE_URL}/api/sessions`,
				user1Cookie,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId: user2Cookie }),
				},
			);

			expect(response.status).toBe(404);
		});

		test("should not delete current session", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Try to delete own current session
			const response = await authRequest(
				`${BASE_URL}/api/sessions`,
				sessionCookie,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId: sessionCookie }),
				},
			);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain("Cannot kill current session");
		});
	});
});

describe("API Endpoints - User Management", () => {
	describe("DELETE /api/user", () => {
		test("should delete user account", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Delete account
			const response = await authRequest(
				`${BASE_URL}/api/user`,
				sessionCookie,
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify user is deleted
			const verifyResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				sessionCookie,
			);
			expect(verifyResponse.status).toBe(401);
		});

		test("should require authentication", async () => {
			const response = await fetch(`${BASE_URL}/api/user`, {
				method: "DELETE",
			});

			expect(response.status).toBe(401);
		});
	});

	describe("PUT /api/user/email", () => {
		test("should update user email", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Update email
			const newEmail = "newemail@example.com";
			const response = await authRequest(
				`${BASE_URL}/api/user/email`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: newEmail }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify email updated
			const meResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				sessionCookie,
			);
			const meData = await meResponse.json();
			expect(meData.email).toBe(newEmail);
		});

		test("should reject duplicate email", async () => {
			// Register two users
			const hashedPassword1 = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword1,
				}),
			});

			const hashedPassword2 = await clientHashPassword(
				TEST_USER_2.email,
				TEST_USER_2.password,
			);
			const user2Response = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER_2.email,
					password: hashedPassword2,
				}),
			});
			const user2Cookie = extractSessionCookie(user2Response);

			// Try to update user2's email to user1's email
			const response = await authRequest(
				`${BASE_URL}/api/user/email`,
				user2Cookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: TEST_USER.email }),
				},
			);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Email already in use");
		});
	});

	describe("PUT /api/user/password", () => {
		test("should update user password", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Update password
			const newPassword = await clientHashPassword(
				TEST_USER.email,
				"NewPassword123!",
			);
			const response = await authRequest(
				`${BASE_URL}/api/user/password`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ password: newPassword }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify can login with new password
			const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: newPassword,
				}),
			});
			expect(loginResponse.status).toBe(200);
		});

		test("should reject invalid password format", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Try to update with invalid format
			const response = await authRequest(
				`${BASE_URL}/api/user/password`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ password: "short" }),
				},
			);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Invalid password format");
		});
	});

	describe("PUT /api/user/name", () => {
		test("should update user name", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
					name: TEST_USER.name,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Update name
			const newName = "Updated Name";
			const response = await authRequest(
				`${BASE_URL}/api/user/name`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: newName }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify name updated
			const meResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				sessionCookie,
			);
			const meData = await meResponse.json();
			expect(meData.name).toBe(newName);
		});

		test("should reject missing name", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			const response = await authRequest(
				`${BASE_URL}/api/user/name`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);

			expect(response.status).toBe(400);
		});
	});

	describe("PUT /api/user/avatar", () => {
		test("should update user avatar", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Update avatar
			const newAvatar = "👨‍💻";
			const response = await authRequest(
				`${BASE_URL}/api/user/avatar`,
				sessionCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ avatar: newAvatar }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify avatar updated
			const meResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				sessionCookie,
			);
			const meData = await meResponse.json();
			expect(meData.avatar).toBe(newAvatar);
		});
	});
});

describe("API Endpoints - Health", () => {
	describe("GET /api/health", () => {
		test(
			"should return service health status with details",
			async () => {
				const response = await fetch(`${BASE_URL}/api/health`);

				expect(response.status).toBe(200);
				const data = await response.json();
				expect(data).toHaveProperty("status");
				expect(data).toHaveProperty("timestamp");
				expect(data).toHaveProperty("services");
				expect(data.services).toHaveProperty("database");
				expect(data.services).toHaveProperty("whisper");
				expect(data.services).toHaveProperty("storage");
			},
		);
	});
});

describe("API Endpoints - Transcriptions", () => {
	describe("GET /api/transcriptions", () => {
		test("should return user transcriptions", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Get transcriptions
			const response = await authRequest(
				`${BASE_URL}/api/transcriptions`,
				sessionCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.jobs).toBeDefined();
			expect(Array.isArray(data.jobs)).toBe(true);
		});

		test("should require authentication", async () => {
			const response = await fetch(`${BASE_URL}/api/transcriptions`);

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/transcriptions", () => {
		test("should upload audio file and start transcription", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Create a test audio file
			const audioBlob = new Blob(["fake audio data"], { type: "audio/mp3" });
			const formData = new FormData();
			formData.append("audio", audioBlob, "test.mp3");
			formData.append("class_name", "Test Class");

			// Upload
			const response = await authRequest(
				`${BASE_URL}/api/transcriptions`,
				sessionCookie,
				{
					method: "POST",
					body: formData,
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.id).toBeDefined();
			expect(data.message).toContain("Upload successful");
		});

		test("should reject non-audio files", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Try to upload non-audio file
			const textBlob = new Blob(["text file"], { type: "text/plain" });
			const formData = new FormData();
			formData.append("audio", textBlob, "test.txt");

			const response = await authRequest(
				`${BASE_URL}/api/transcriptions`,
				sessionCookie,
				{
					method: "POST",
					body: formData,
				},
			);

			expect(response.status).toBe(400);
		});

		test("should reject files exceeding size limit", async () => {
			// Register user
			const hashedPassword = await clientHashPassword(
				TEST_USER.email,
				TEST_USER.password,
			);
			const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					password: hashedPassword,
				}),
			});
			const sessionCookie = extractSessionCookie(registerResponse);

			// Create a file larger than 100MB (the actual limit)
			const largeBlob = new Blob([new ArrayBuffer(101 * 1024 * 1024)], {
				type: "audio/mp3",
			});
			const formData = new FormData();
			formData.append("audio", largeBlob, "large.mp3");

			const response = await authRequest(
				`${BASE_URL}/api/transcriptions`,
				sessionCookie,
				{
					method: "POST",
					body: formData,
				},
			);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain("File size must be less than");
		});

		test("should require authentication", async () => {
			const audioBlob = new Blob(["fake audio data"], { type: "audio/mp3" });
			const formData = new FormData();
			formData.append("audio", audioBlob, "test.mp3");

			const response = await fetch(`${BASE_URL}/api/transcriptions`, {
				method: "POST",
				body: formData,
			});

			expect(response.status).toBe(401);
		});
	});
});

describe("API Endpoints - Admin", () => {
	let adminCookie: string;
	let userCookie: string;
	let userId: number;

	beforeEach(async () => {

		// Create admin user
		const adminHash = await clientHashPassword(
			TEST_ADMIN.email,
			TEST_ADMIN.password,
		);
		const adminResponse = await fetch(`${BASE_URL}/api/auth/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: TEST_ADMIN.email,
				password: adminHash,
				name: TEST_ADMIN.name,
			}),
		});
		adminCookie = extractSessionCookie(adminResponse);

		// Manually set admin role in database
		db.run("UPDATE users SET role = 'admin' WHERE email = ?", [
			TEST_ADMIN.email,
		]);

		// Create regular user
		const userHash = await clientHashPassword(
			TEST_USER.email,
			TEST_USER.password,
		);
		const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: TEST_USER.email,
				password: userHash,
				name: TEST_USER.name,
			}),
		});
		userCookie = extractSessionCookie(userResponse);

		// Get user ID
		const userIdResult = db
			.query<{ id: number }, [string]>("SELECT id FROM users WHERE email = ?")
			.get(TEST_USER.email);
		userId = userIdResult?.id;
	});

	describe("GET /api/admin/users", () => {
		test("should return all users for admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users`,
				adminCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data.length).toBeGreaterThan(0);
		});

		test("should reject non-admin users", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users`,
				userCookie,
			);

			expect(response.status).toBe(403);
		});

		test("should require authentication", async () => {
			const response = await fetch(`${BASE_URL}/api/admin/users`);

			expect(response.status).toBe(401);
		});
	});

	describe("GET /api/admin/transcriptions", () => {
		test("should return all transcriptions for admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/transcriptions`,
				adminCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
		});

		test("should reject non-admin users", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/transcriptions`,
				userCookie,
			);

			expect(response.status).toBe(403);
		});
	});

	describe("DELETE /api/admin/users/:id", () => {
		test("should delete user as admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}`,
				adminCookie,
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify user is deleted
			const verifyResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				userCookie,
			);
			expect(verifyResponse.status).toBe(401);
		});

		test("should reject non-admin users", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}`,
				userCookie,
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(403);
		});
	});

	describe("PUT /api/admin/users/:id/role", () => {
		test("should update user role as admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/role`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: "admin" }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify role updated
			const meResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				userCookie,
			);
			const meData = await meResponse.json();
			expect(meData.role).toBe("admin");
		});

		test("should reject invalid roles", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/role`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: "superadmin" }),
				},
			);

			expect(response.status).toBe(400);
		});
	});

	describe("GET /api/admin/users/:id/details", () => {
		test("should return user details for admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/details`,
				adminCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.id).toBe(userId);
			expect(data.email).toBe(TEST_USER.email);
			expect(data).toHaveProperty("passkeys");
			expect(data).toHaveProperty("sessions");
		});

		test("should reject non-admin users", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/details`,
				userCookie,
			);

			expect(response.status).toBe(403);
		});
	});

	describe("PUT /api/admin/users/:id/name", () => {
		test("should update user name as admin", async () => {
			const newName = "Admin Updated Name";
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/name`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: newName }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});

		test("should reject empty names", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/name`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "" }),
				},
			);

			expect(response.status).toBe(400);
		});
	});

	describe("PUT /api/admin/users/:id/email", () => {
		test("should update user email as admin", async () => {
			const newEmail = "newemail@admin.com";
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/email`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: newEmail }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});

		test("should reject duplicate emails", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/email`,
				adminCookie,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: TEST_ADMIN.email }),
				},
			);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Email already in use");
		});
	});

	describe("GET /api/admin/users/:id/sessions", () => {
		test("should return user sessions as admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/sessions`,
				adminCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
		});
	});

	describe("DELETE /api/admin/users/:id/sessions", () => {
		test("should delete all user sessions as admin", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/admin/users/${userId}/sessions`,
				adminCookie,
				{
					method: "DELETE",
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);

			// Verify sessions are deleted
			const verifyResponse = await authRequest(
				`${BASE_URL}/api/auth/me`,
				userCookie,
			);
			expect(verifyResponse.status).toBe(401);
		});
	});
});

describe("API Endpoints - Passkeys", () => {
	let sessionCookie: string;

	beforeEach(async () => {

		// Register user
		const hashedPassword = await clientHashPassword(
			TEST_USER.email,
			TEST_USER.password,
		);
		const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: TEST_USER.email,
				password: hashedPassword,
			}),
		});
		sessionCookie = extractSessionCookie(registerResponse);
	});

	describe("GET /api/passkeys", () => {
		test("should return user passkeys", async () => {
			const response = await authRequest(
				`${BASE_URL}/api/passkeys`,
				sessionCookie,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.passkeys).toBeDefined();
			expect(Array.isArray(data.passkeys)).toBe(true);
		});

		test("should require authentication", async () => {
			const response = await fetch(`${BASE_URL}/api/passkeys`);

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/passkeys/register/options", () => {
		test(
			"should return registration options for authenticated user",
			async () => {
				const response = await authRequest(
					`${BASE_URL}/api/passkeys/register/options`,
					sessionCookie,
					{
						method: "POST",
					},
				);

				expect(response.status).toBe(200);
				const data = await response.json();
				expect(data).toHaveProperty("challenge");
				expect(data).toHaveProperty("rp");
				expect(data).toHaveProperty("user");
			},
		);

		test("should require authentication", async () => {
			const response = await fetch(
				`${BASE_URL}/api/passkeys/register/options`,
				{
					method: "POST",
				},
			);

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/passkeys/authenticate/options", () => {
		test("should return authentication options for email", async () => {
			const response = await fetch(
				`${BASE_URL}/api/passkeys/authenticate/options`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: TEST_USER.email }),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toHaveProperty("challenge");
		});

		test("should handle non-existent email", async () => {
			const response = await fetch(
				`${BASE_URL}/api/passkeys/authenticate/options`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: "nonexistent@example.com" }),
				},
			);

			// Should still return options for privacy (don't leak user existence)
			expect([200, 404]).toContain(response.status);
		});
	});
});
