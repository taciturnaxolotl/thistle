import { expect, test } from "bun:test";
import db from "../db/schema";
import { checkRateLimit, cleanupOldAttempts } from "./rate-limit";

// Clean up before tests
db.run("DELETE FROM rate_limit_attempts");

test("allows requests under the limit", () => {
	const key = "test:allow";

	const result1 = checkRateLimit(key, 5, 60);
	expect(result1.allowed).toBe(true);

	const result2 = checkRateLimit(key, 5, 60);
	expect(result2.allowed).toBe(true);

	const result3 = checkRateLimit(key, 5, 60);
	expect(result3.allowed).toBe(true);
});

test("blocks requests over the limit", () => {
	const key = "test:block";

	// Make 5 requests (limit)
	for (let i = 0; i < 5; i++) {
		const result = checkRateLimit(key, 5, 60);
		expect(result.allowed).toBe(true);
	}

	// 6th request should be blocked
	const blocked = checkRateLimit(key, 5, 60);
	expect(blocked.allowed).toBe(false);
	expect(blocked.retryAfter).toBeGreaterThan(0);
});

test("rolling window allows requests after time passes", async () => {
	const key = "test:rolling";

	// Make 3 requests
	for (let i = 0; i < 3; i++) {
		checkRateLimit(key, 3, 2); // 3 per 2 seconds
	}

	// 4th should be blocked
	let result = checkRateLimit(key, 3, 2);
	expect(result.allowed).toBe(false);

	// Wait for window to pass
	await new Promise((resolve) => setTimeout(resolve, 2100));

	// Should now be allowed (old attempts outside window)
	result = checkRateLimit(key, 3, 2);
	expect(result.allowed).toBe(true);
});

test("different keys are tracked separately", () => {
	const key1 = "test:separate1";
	const key2 = "test:separate2";

	// Exhaust limit for key1
	for (let i = 0; i < 5; i++) {
		checkRateLimit(key1, 5, 60);
	}

	const blocked = checkRateLimit(key1, 5, 60);
	expect(blocked.allowed).toBe(false);

	// key2 should still be allowed
	const allowed = checkRateLimit(key2, 5, 60);
	expect(allowed.allowed).toBe(true);
});

test("cleanup removes old attempts", () => {
	const key = "test:cleanup";

	// Create some attempts
	checkRateLimit(key, 10, 60);
	checkRateLimit(key, 10, 60);

	// Manually insert an old attempt (25 hours ago)
	const oldTimestamp = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
	db.run("INSERT INTO rate_limit_attempts (key, timestamp) VALUES (?, ?)", [
		"test:old",
		oldTimestamp,
	]);

	// Run cleanup (default: removes attempts older than 24 hours)
	cleanupOldAttempts();

	// Old attempt should be gone
	const count = db
		.query<{ count: number }, []>(
			"SELECT COUNT(*) as count FROM rate_limit_attempts WHERE key = 'test:old'",
		)
		.get();

	expect(count?.count).toBe(0);

	// Recent attempts should still exist
	const recentCount = db
		.query<{ count: number }, [string]>(
			"SELECT COUNT(*) as count FROM rate_limit_attempts WHERE key = ?",
		)
		.get(key);

	expect(recentCount?.count).toBe(2);
});

// Cleanup after tests
db.run("DELETE FROM rate_limit_attempts");
