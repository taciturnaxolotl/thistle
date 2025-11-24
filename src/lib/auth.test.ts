import { expect, test } from "bun:test";
import db from "../db/schema";
import {
	createSession,
	deleteSession,
	getSession,
	getSessionFromRequest,
} from "./auth";

test("createSession generates UUID and stores in database", () => {
	const userId = 1;
	const ipAddress = "192.168.1.1";
	const userAgent = "Mozilla/5.0";

	const sessionId = createSession(userId, ipAddress, userAgent);

	// UUID format
	expect(sessionId).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	);

	// Verify stored in database
	const session = getSession(sessionId);
	expect(session).not.toBeNull();
	expect(session?.user_id).toBe(userId);
	expect(session?.ip_address).toBe(ipAddress);
	expect(session?.user_agent).toBe(userAgent);

	// Cleanup
	deleteSession(sessionId);
});

test("getSession returns null for expired session", () => {
	const userId = 1;
	const sessionId = createSession(userId);

	// Manually set expiration to past
	db.run("UPDATE sessions SET expires_at = ? WHERE id = ?", [
		Math.floor(Date.now() / 1000) - 1000,
		sessionId,
	]);

	const session = getSession(sessionId);
	expect(session).toBeNull();

	// Cleanup
	deleteSession(sessionId);
});

test("getSession returns null for non-existent session", () => {
	const session = getSession("non-existent-session-id");
	expect(session).toBeNull();
});

test("deleteSession removes session from database", () => {
	const userId = 1;
	const sessionId = createSession(userId);

	const sessionBefore = getSession(sessionId);
	expect(sessionBefore).not.toBeNull();

	deleteSession(sessionId);

	const sessionAfter = getSession(sessionId);
	expect(sessionAfter).toBeNull();
});

test("getSessionFromRequest extracts session from cookie", () => {
	const sessionId = "test-session-id";
	const req = new Request("http://localhost", {
		headers: {
			cookie: `session=${sessionId}; other=value`,
		},
	});

	const extracted = getSessionFromRequest(req);
	expect(extracted).toBe(sessionId);
});

test("getSessionFromRequest returns null when no cookie", () => {
	const req = new Request("http://localhost");

	const extracted = getSessionFromRequest(req);
	expect(extracted).toBeNull();
});

test("getSessionFromRequest returns null when session cookie missing", () => {
	const req = new Request("http://localhost", {
		headers: {
			cookie: "other=value; foo=bar",
		},
	});

	const extracted = getSessionFromRequest(req);
	expect(extracted).toBeNull();
});

test("prevents directory traversal in session IDs", () => {
	const maliciousIds = [
		"../../../etc/passwd",
		"..\\..\\..\\windows\\system32",
		"test/../../../secret",
		"/etc/passwd",
		"C:\\Windows\\System32",
	];

	for (const id of maliciousIds) {
		const session = getSession(id);
		expect(session).toBeNull();
	}
});

test("prevents SQL injection in session lookup", () => {
	const maliciousIds = [
		"' OR '1'='1",
		"'; DROP TABLE sessions; --",
		"1' UNION SELECT * FROM users --",
		"test' OR 1=1 --",
	];

	for (const id of maliciousIds) {
		// Should not throw or return unexpected data
		const session = getSession(id);
		expect(session).toBeNull();
	}

	// Verify sessions table still exists
	const result = db.query("SELECT COUNT(*) as count FROM sessions").get() as {
		count: number;
	};
	expect(typeof result.count).toBe("number");
});

test("enforces maximum session limit per user", () => {
	const userId = 999;

	// Clean up any existing sessions for this user
	db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);

	// Create 11 sessions (limit is 10)
	const sessionIds: string[] = [];
	for (let i = 0; i < 11; i++) {
		const sessionId = createSession(userId, `192.168.1.${i}`, `Agent ${i}`);
		sessionIds.push(sessionId);
	}

	// Count total sessions for user
	const sessionCount = db
		.query<{ count: number }, [number]>(
			"SELECT COUNT(*) as count FROM sessions WHERE user_id = ?",
		)
		.get(userId);

	expect(sessionCount?.count).toBe(10);

	// First session should be deleted (oldest)
	const firstSession = getSession(sessionIds[0]);
	expect(firstSession).toBeNull();

	// Last session should exist (newest)
	const lastSession = getSession(sessionIds[10]);
	expect(lastSession).not.toBeNull();

	// Cleanup
	db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
});
