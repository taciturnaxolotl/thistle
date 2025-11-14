// File-based transcript storage to avoid SQLite size limits

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
 * Write WebVTT transcript to file system
 */
export async function saveTranscriptVTT(
	transcriptionId: string,
	vttContent: string,
): Promise<void> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.vtt`;
	await Bun.write(filePath, vttContent);
}

/**
 * Read WebVTT transcript from file system
 */
export async function getTranscriptVTT(
	transcriptionId: string,
): Promise<string | null> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.vtt`;
	try {
		return await Bun.file(filePath).text();
	} catch {
		return null;
	}
}
