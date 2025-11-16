import { expect, test } from "bun:test";
import { hashPasswordClient } from "./client-auth";

test("hashPasswordClient produces consistent output", async () => {
	const hash1 = await hashPasswordClient("password123", "user@example.com");
	const hash2 = await hashPasswordClient("password123", "user@example.com");

	expect(hash1).toBe(hash2);
	expect(hash1).toHaveLength(64); // 32 bytes * 2 hex chars
});

test("hashPasswordClient produces different hashes for different passwords", async () => {
	const hash1 = await hashPasswordClient("password123", "user@example.com");
	const hash2 = await hashPasswordClient("different", "user@example.com");

	expect(hash1).not.toBe(hash2);
});

test("hashPasswordClient produces different hashes for different emails", async () => {
	const hash1 = await hashPasswordClient("password123", "user1@example.com");
	const hash2 = await hashPasswordClient("password123", "user2@example.com");

	expect(hash1).not.toBe(hash2);
});

test("hashPasswordClient is case-insensitive for email", async () => {
	const hash1 = await hashPasswordClient("password123", "User@Example.Com");
	const hash2 = await hashPasswordClient("password123", "user@example.com");

	expect(hash1).toBe(hash2);
});

test("hashPasswordClient produces hex-encoded output", async () => {
	const hash = await hashPasswordClient("test", "test@test.com");

	// Should only contain hex characters
	expect(hash).toMatch(/^[0-9a-f]+$/);
});
