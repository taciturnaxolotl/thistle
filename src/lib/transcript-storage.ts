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

/**
 * Compatibility wrappers using VTT as the canonical format
 */
export async function hasTranscript(transcriptionId: string): Promise<boolean> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.vtt`;
	try {
		// Try reading the file; if it exists return true
		await Bun.file(filePath).text();
		return true;
	} catch {
		return false;
	}
}

export async function saveTranscript(
	transcriptionId: string,
	content: string,
): Promise<void> {
	// Store transcripts as VTT files to keep a single canonical format
	return saveTranscriptVTT(transcriptionId, content);
}

export async function getTranscript(
	transcriptionId: string,
): Promise<string | null> {
	// Read VTT content as the transcript text
	return getTranscriptVTT(transcriptionId);
}

export async function deleteTranscript(transcriptionId: string): Promise<void> {
	const safeId = validateTranscriptionId(transcriptionId);
	const filePath = `${TRANSCRIPTS_DIR}/${safeId}.vtt`;
	try {
		const fs = await import("node:fs");
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch {
		// Ignore errors
	}
}
