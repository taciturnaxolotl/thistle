import { expect, test } from "bun:test";
import db from "../db/schema";
import {
	consumeEmailChangeToken,
	createEmailChangeToken,
	createUser,
	getUserByEmail,
	updateUserEmail,
	verifyEmailChangeToken,
} from "./auth";

test("email change token lifecycle", async () => {
	// Create a test user with unique email
	const timestamp = Date.now();
	const user = await createUser(
		`test-email-change-${timestamp}@example.com`,
		"password123",
		"Test User",
	);

	// Create an email change token
	const newEmail = `new-email-${timestamp}@example.com`;
	const token = createEmailChangeToken(user.id, newEmail);

	expect(token).toBeTruthy();
	expect(token.length).toBeGreaterThan(0);

	// Verify the token
	const result = verifyEmailChangeToken(token);
	expect(result).toBeTruthy();
	expect(result?.userId).toBe(user.id);
	expect(result?.newEmail).toBe(newEmail);

	// Update the email
	if (result) {
		updateUserEmail(result.userId, result.newEmail);
	}

	// Consume the token
	consumeEmailChangeToken(token);

	// Verify the email was updated
	const updatedUser = getUserByEmail(newEmail);
	expect(updatedUser).toBeTruthy();
	expect(updatedUser?.id).toBe(user.id);
	expect(updatedUser?.email).toBe(newEmail);

	// Verify the token can't be used again
	const result2 = verifyEmailChangeToken(token);
	expect(result2).toBeNull();

	// Clean up
	db.run("DELETE FROM users WHERE id = ?", [user.id]);
});

test("email change token expires", async () => {
	// Create a test user with unique email
	const timestamp = Date.now();
	const user = await createUser(
		`test-expire-${timestamp}@example.com`,
		"password123",
		"Test User",
	);

	// Create an email change token
	const newEmail = `new-expire-${timestamp}@example.com`;
	const token = createEmailChangeToken(user.id, newEmail);

	// Manually expire the token
	db.run("UPDATE email_change_tokens SET expires_at = ? WHERE token = ?", [
		Math.floor(Date.now() / 1000) - 1,
		token,
	]);

	// Verify the token is expired
	const result = verifyEmailChangeToken(token);
	expect(result).toBeNull();

	// Clean up
	db.run("DELETE FROM users WHERE id = ?", [user.id]);
});

test("only one email change token per user", async () => {
	// Create a test user with unique email
	const timestamp = Date.now();
	const user = await createUser(
		`test-single-token-${timestamp}@example.com`,
		"password123",
		"Test User",
	);

	// Create first token
	const token1 = createEmailChangeToken(
		user.id,
		`email1-${timestamp}@example.com`,
	);

	// Create second token (should delete first)
	const token2 = createEmailChangeToken(
		user.id,
		`email2-${timestamp}@example.com`,
	);

	// First token should be invalid
	const result1 = verifyEmailChangeToken(token1);
	expect(result1).toBeNull();

	// Second token should work
	const result2 = verifyEmailChangeToken(token2);
	expect(result2).toBeTruthy();
	expect(result2?.newEmail).toBe(`email2-${timestamp}@example.com`);

	// Clean up
	db.run("DELETE FROM users WHERE id = ?", [user.id]);
	db.run("DELETE FROM email_change_tokens WHERE user_id = ?", [user.id]);
});
