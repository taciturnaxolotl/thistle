/**
 * Cursor encoding/decoding for pagination
 * Cursors are base64url-encoded strings for opacity and URL safety
 */

/**
 * Encode a cursor from components
 */
export function encodeCursor(parts: string[]): string {
	const raw = parts.join("|");
	// Use base64url encoding (no padding, URL-safe characters)
	return Buffer.from(raw).toString("base64url");
}

/**
 * Decode a cursor into components
 */
export function decodeCursor(cursor: string): string[] {
	try {
		const raw = Buffer.from(cursor, "base64url").toString("utf-8");
		return raw.split("|");
	} catch {
		throw new Error("Invalid cursor format");
	}
}

/**
 * Encode a transcription/user cursor (timestamp-id)
 */
export function encodeSimpleCursor(timestamp: number, id: string): string {
	return encodeCursor([timestamp.toString(), id]);
}

/**
 * Decode a transcription/user cursor (timestamp-id)
 */
export function decodeSimpleCursor(cursor: string): {
	timestamp: number;
	id: string;
} {
	const parts = decodeCursor(cursor);
	if (parts.length !== 2) {
		throw new Error("Invalid cursor format");
	}

	const timestamp = Number.parseInt(parts[0] || "", 10);
	const id = parts[1] || "";

	if (Number.isNaN(timestamp) || !id) {
		throw new Error("Invalid cursor format");
	}

	return { timestamp, id };
}

/**
 * Encode a class cursor (year-semester-coursecode-id)
 */
export function encodeClassCursor(
	year: number,
	semester: string,
	courseCode: string,
	id: string,
): string {
	return encodeCursor([year.toString(), semester, courseCode, id]);
}

/**
 * Decode a class cursor (year-semester-coursecode-id)
 */
export function decodeClassCursor(cursor: string): {
	year: number;
	semester: string;
	courseCode: string;
	id: string;
} {
	const parts = decodeCursor(cursor);
	if (parts.length !== 4) {
		throw new Error("Invalid cursor format");
	}

	const year = Number.parseInt(parts[0] || "", 10);
	const semester = parts[1] || "";
	const courseCode = parts[2] || "";
	const id = parts[3] || "";

	if (Number.isNaN(year) || !semester || !courseCode || !id) {
		throw new Error("Invalid cursor format");
	}

	return { year, semester, courseCode, id };
}
