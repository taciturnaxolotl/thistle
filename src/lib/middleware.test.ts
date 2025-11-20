import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import db from "../db/schema";
import { createSession, createUser } from "./auth";
import { AppError } from "./errors";
import { hasActiveSubscription, requireSubscription } from "./middleware";

describe("middleware", () => {
	let testUserId: number;
	let sessionId: string;

	beforeEach(async () => {
		// Create test user
		const user = await createUser(
			`test-${Date.now()}@example.com`,
			"0".repeat(64),
			"Test User",
		);
		testUserId = user.id;
		sessionId = createSession(testUserId, "127.0.0.1", "test");
	});

	afterEach(() => {
		// Cleanup
		db.run("DELETE FROM users WHERE id = ?", [testUserId]);
		db.run("DELETE FROM subscriptions WHERE user_id = ?", [testUserId]);
	});

	describe("hasActiveSubscription", () => {
		test("returns false when user has no subscription", () => {
			expect(hasActiveSubscription(testUserId)).toBe(false);
		});

		test("returns true when user has active subscription", () => {
			db.run(
				"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
				["test-sub-1", testUserId, "test-customer", "active"],
			);

			expect(hasActiveSubscription(testUserId)).toBe(true);
		});

		test("returns true when user has trialing subscription", () => {
			db.run(
				"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
				["test-sub-2", testUserId, "test-customer", "trialing"],
			);

			expect(hasActiveSubscription(testUserId)).toBe(true);
		});

		test("returns false when user has canceled subscription", () => {
			db.run(
				"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
				["test-sub-3", testUserId, "test-customer", "canceled"],
			);

			expect(hasActiveSubscription(testUserId)).toBe(false);
		});
	});

	describe("requireSubscription", () => {
		test("throws AppError when user has no subscription", () => {
			const req = new Request("http://localhost/api/test", {
				headers: {
					Cookie: `session=${sessionId}`,
				},
			});

			try {
				requireSubscription(req);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error instanceof AppError).toBe(true);
				if (error instanceof AppError) {
					expect(error.statusCode).toBe(403);
					expect(error.message).toContain("subscription");
				}
			}
		});

		test("succeeds when user has active subscription", () => {
			db.run(
				"INSERT INTO subscriptions (id, user_id, customer_id, status) VALUES (?, ?, ?, ?)",
				["test-sub-4", testUserId, "test-customer", "active"],
			);

			const req = new Request("http://localhost/api/test", {
				headers: {
					Cookie: `session=${sessionId}`,
				},
			});

			const user = requireSubscription(req);
			expect(user.id).toBe(testUserId);
		});

		test("succeeds when user is admin without subscription", () => {
			// Make user admin
			db.run("UPDATE users SET role = ? WHERE id = ?", ["admin", testUserId]);

			const req = new Request("http://localhost/api/test", {
				headers: {
					Cookie: `session=${sessionId}`,
				},
			});

			const user = requireSubscription(req);
			expect(user.id).toBe(testUserId);
			expect(user.role).toBe("admin");
		});
	});
});
