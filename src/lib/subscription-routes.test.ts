import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import db from "../db/schema";
import { createSession, createUser } from "./auth";

describe("subscription-protected routes", () => {
	let testUserId: number;
	let sessionCookie: string;

	beforeEach(async () => {
		// Create test user
		const user = await createUser(
			`test-${Date.now()}@example.com`,
			"0".repeat(64),
			"Test User",
		);
		testUserId = user.id;
		const sessionId = createSession(testUserId, "127.0.0.1", "test");
		sessionCookie = `session=${sessionId}`;
	});

	afterEach(() => {
		// Cleanup
		db.run("DELETE FROM users WHERE id = ?", [testUserId]);
		db.run("DELETE FROM subscriptions WHERE user_id = ?", [testUserId]);
	});

	test("GET /api/transcriptions requires subscription", async () => {
		const response = await fetch("http://localhost:3000/api/transcriptions", {
			headers: { Cookie: sessionCookie },
		});

		expect(response.status).toBe(403);
		const data = await response.json();
		expect(data.error).toContain("subscription");
	});

	test("GET /api/transcriptions succeeds with active subscription", async () => {
		// Add subscription
		db.run(
			"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
			["test-sub", testUserId, "test-customer", "active"],
		);

		const response = await fetch("http://localhost:3000/api/transcriptions", {
			headers: { Cookie: sessionCookie },
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.jobs).toBeDefined();
	});

	test("GET /api/transcriptions succeeds for admin without subscription", async () => {
		// Make user admin
		db.run("UPDATE users SET role = ? WHERE id = ?", ["admin", testUserId]);

		const response = await fetch("http://localhost:3000/api/transcriptions", {
			headers: { Cookie: sessionCookie },
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.jobs).toBeDefined();
	});

	test("POST /api/transcriptions requires subscription", async () => {
		const formData = new FormData();
		const file = new File(["test"], "test.mp3", { type: "audio/mpeg" });
		formData.append("audio", file);

		const response = await fetch("http://localhost:3000/api/transcriptions", {
			method: "POST",
			headers: { Cookie: sessionCookie },
			body: formData,
		});

		expect(response.status).toBe(403);
		const data = await response.json();
		expect(data.error).toContain("subscription");
	});

	test("/api/auth/me includes subscription status", async () => {
		const response = await fetch("http://localhost:3000/api/auth/me", {
			headers: { Cookie: sessionCookie },
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.has_subscription).toBe(false);

		// Add subscription
		db.run(
			"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
			["test-sub", testUserId, "test-customer", "active"],
		);

		const response2 = await fetch("http://localhost:3000/api/auth/me", {
			headers: { Cookie: sessionCookie },
		});

		expect(response2.status).toBe(200);
		const data2 = await response2.json();
		expect(data2.has_subscription).toBe(true);
	});
});
