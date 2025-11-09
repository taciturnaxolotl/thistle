import { expect, test } from "bun:test";
import {
	deleteTranscript,
	getTranscript,
	hasTranscript,
	saveTranscript,
} from "./transcript-storage";

test("transcript storage", async () => {
	const testId = "test-transcript-123";
	const testContent = "This is a test transcript with some content.";

	// Should not exist initially
	expect(await hasTranscript(testId)).toBe(false);
	expect(await getTranscript(testId)).toBe(null);

	// Save transcript
	await saveTranscript(testId, testContent);

	// Should exist now
	expect(await hasTranscript(testId)).toBe(true);
	expect(await getTranscript(testId)).toBe(testContent);

	// Delete transcript
	await deleteTranscript(testId);

	// Should not exist anymore
	expect(await hasTranscript(testId)).toBe(false);
	expect(await getTranscript(testId)).toBe(null);
});

test("transcript storage handles large content", async () => {
	const testId = "test-large-transcript";
	// Create a 1MB transcript
	const largeContent = "A".repeat(1024 * 1024);

	await saveTranscript(testId, largeContent);
	const retrieved = await getTranscript(testId);

	expect(retrieved).toBe(largeContent);
	expect(retrieved?.length).toBe(1024 * 1024);

	await deleteTranscript(testId);
});

test("transcript storage prevents directory traversal", async () => {
	const maliciousIds = [
		"../../../etc/passwd",
		"../../secret.txt",
		"../config",
		"test/../../../etc/passwd",
		"test/../../passwd",
	];

	for (const id of maliciousIds) {
		await expect(saveTranscript(id, "malicious")).rejects.toThrow();
		await expect(getTranscript(id)).rejects.toThrow();
		await expect(deleteTranscript(id)).rejects.toThrow();
		await expect(hasTranscript(id)).rejects.toThrow();
	}
});

test("transcript storage validates ID format", async () => {
	const invalidIds = [
		"test; rm -rf /",
		"test`whoami`",
		"test\x00null",
		"test\nls",
		"test&&ls",
	];

	for (const id of invalidIds) {
		await expect(saveTranscript(id, "test")).rejects.toThrow(
			"Invalid transcription ID",
		);
	}
});

test("transcript storage accepts valid UUIDs", async () => {
	const validIds = [
		"550e8400-e29b-41d4-a716-446655440000",
		"6ba7b810-9dad-11d1-80b4-00c04fd430c8",
		"test-abc-123",
		"abc123",
	];

	for (const id of validIds) {
		await saveTranscript(id, "test");
		expect(await getTranscript(id)).toBe("test");
		await deleteTranscript(id);
	}
});

