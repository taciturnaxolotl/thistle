// File-based transcript storage to avoid SQLite size limits

import { unlinkSync } from "node:fs";
import { basename } from "node:path";

const TRANSCRIPTS_DIR = "./transcripts";

/**
 * Validate and sanitize transcription ID to prevent directory traversal
 */
function validateTranscriptionId(id: string): string {
	// Reject empty strings
	if (!id || id.length === 0) {
		throw new Error("Invalid transcription ID: empty");
	}
	// Only allow safe characters (alphanumeric, hyphens, underscores)
	if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
		throw new Error("Invalid transcription ID format");
	}
	// Ensure no path traversal by using only the basename
	const safeName = basename(id);
	if (safeName !== id) {
		throw new Error("Invalid transcription ID: path traversal detected");
	}
	return safeName;
}

/**
 * Write transcript to file system
 */
export async function saveTranscript(
	transcriptionId: string,
	transcript: string,
): Promise<void> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.txt`;
	await Bun.write(filePath, transcript);
}

/**
 * Read transcript from file system
 */
export async function getTranscript(
	transcriptionId: string,
): Promise<string | null> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.txt`;
	try {
		return await Bun.file(filePath).text();
	} catch {
		return null;
	}
}

/**
 * Delete transcript file
 */
export async function deleteTranscript(transcriptionId: string): Promise<void> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.txt`;
	try {
		unlinkSync(filePath);
	} catch {
		// File doesn't exist or already deleted
	}
}

/**
 * Check if transcript exists
 */
export async function hasTranscript(transcriptionId: string): Promise<boolean> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.txt`;
	return await Bun.file(filePath).exists();
}
