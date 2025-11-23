import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import db from "../db/schema";
import {
	consumePasswordResetToken,
	createEmailVerificationToken,
	createPasswordResetToken,
	createUser,
	isEmailVerified,
	verifyEmailToken,
	verifyPasswordResetToken,
} from "./auth";

describe("Email Verification", () => {
	let userId: number;
	const testEmail = `test-verify-${Date.now()}@example.com`;

	beforeEach(async () => {
		// Create test user
		const user = await createUser(testEmail, "a".repeat(64), "Test User");
		userId = user.id;
	});

	afterEach(() => {
		// Cleanup
		db.run("DELETE FROM users WHERE email = ?", [testEmail]);
		db.run("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]);
	});

	test("creates verification token", () => {
		const token = createEmailVerificationToken(userId);
		expect(token).toBeDefined();
		expect(typeof token).toBe("string");
		expect(token.length).toBeGreaterThan(0);
	});

	test("verifies valid token", () => {
		const token = createEmailVerificationToken(userId);
		const result = verifyEmailToken(token);

		expect(result).not.toBeNull();
		expect(result?.userId).toBe(userId);
		expect(result?.email).toBe(testEmail);
		expect(isEmailVerified(userId)).toBe(true);
	});

	test("rejects invalid token", () => {
		const result = verifyEmailToken("invalid-token-12345");
		expect(result).toBeNull();
		expect(isEmailVerified(userId)).toBe(false);
	});

	test("token is one-time use", () => {
		const token = createEmailVerificationToken(userId);

		// First use succeeds
		const firstResult = verifyEmailToken(token);
		expect(firstResult).not.toBeNull();

		// Second use fails
		const secondResult = verifyEmailToken(token);
		expect(secondResult).toBeNull();
	});

	test("rejects expired token", () => {
		const token = createEmailVerificationToken(userId);

		// Manually expire the token
		db.run(
			"UPDATE email_verification_tokens SET expires_at = ? WHERE token = ?",
			[Math.floor(Date.now() / 1000) - 100, token],
		);

		const result = verifyEmailToken(token);
		expect(result).toBeNull();
	});

	test("replaces existing token when creating new one", () => {
		const token1 = createEmailVerificationToken(userId);
		const token2 = createEmailVerificationToken(userId);

		// First token should be invalidated
		expect(verifyEmailToken(token1)).toBeNull();

		// Second token should work
		expect(verifyEmailToken(token2)).not.toBeNull();
	});
});

describe("Password Reset", () => {
	let userId: number;
	const testEmail = `test-reset-${Date.now()}@example.com`;

	beforeEach(async () => {
		const user = await createUser(testEmail, "a".repeat(64), "Test User");
		userId = user.id;
	});

	afterEach(() => {
		db.run("DELETE FROM users WHERE email = ?", [testEmail]);
		db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
	});

	test("creates reset token", () => {
		const token = createPasswordResetToken(userId);
		expect(token).toBeDefined();
		expect(typeof token).toBe("string");
		expect(token.length).toBeGreaterThan(0);
	});

	test("verifies valid reset token", () => {
		const token = createPasswordResetToken(userId);
		const verifiedUserId = verifyPasswordResetToken(token);

		expect(verifiedUserId).toBe(userId);
	});

	test("rejects invalid reset token", () => {
		const verifiedUserId = verifyPasswordResetToken("invalid-token-12345");
		expect(verifiedUserId).toBeNull();
	});

	test("consumes reset token", () => {
		const token = createPasswordResetToken(userId);

		// Token works before consumption
		expect(verifyPasswordResetToken(token)).toBe(userId);

		// Consume token
		consumePasswordResetToken(token);

		// Token no longer works
		expect(verifyPasswordResetToken(token)).toBeNull();
	});

	test("rejects expired reset token", () => {
		const token = createPasswordResetToken(userId);

		// Manually expire the token
		db.run("UPDATE password_reset_tokens SET expires_at = ? WHERE token = ?", [
			Math.floor(Date.now() / 1000) - 100,
			token,
		]);

		const verifiedUserId = verifyPasswordResetToken(token);
		expect(verifiedUserId).toBeNull();
	});

	test("replaces existing reset token when creating new one", () => {
		const token1 = createPasswordResetToken(userId);
		const token2 = createPasswordResetToken(userId);

		// First token should be invalidated
		expect(verifyPasswordResetToken(token1)).toBeNull();

		// Second token should work
		expect(verifyPasswordResetToken(token2)).toBe(userId);
	});
});
