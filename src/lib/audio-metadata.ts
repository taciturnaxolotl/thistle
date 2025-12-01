import { $ } from "bun";

/**
 * Extracts creation date from audio file metadata using ffprobe
 * Falls back to file birth time (original creation) if no metadata found
 * @param filePath Path to audio file
 * @returns Date object or null if not found
 */
export async function extractAudioCreationDate(
	filePath: string,
): Promise<Date | null> {
	try {
		// Use ffprobe to extract creation_time metadata
		// -v quiet: suppress verbose output
		// -print_format json: output as JSON
		// -show_entries format_tags: show all tags to search for date fields
		const result =
			await $`ffprobe -v quiet -print_format json -show_entries format_tags ${filePath}`.text();

		const metadata = JSON.parse(result);
		const tags = metadata?.format?.tags || {};

		// Try multiple metadata fields that might contain creation date
		const dateFields = [
			tags.creation_time, // Standard creation_time
			tags.date, // Common date field
			tags.DATE, // Uppercase variant
			tags.year, // Year field
			tags.YEAR, // Uppercase variant
			tags["com.apple.quicktime.creationdate"], // Apple QuickTime
			tags.TDRC, // ID3v2 recording time
			tags.TDRL, // ID3v2 release time
		];

		for (const dateField of dateFields) {
			if (dateField) {
				const date = new Date(dateField);
				if (!Number.isNaN(date.getTime())) {
					console.log(
						`[AudioMetadata] Extracted creation date from metadata: ${date.toISOString()} from ${filePath}`,
					);
					return date;
				}
			}
		}

		// Fallback: use file birth time (original creation time on filesystem)
		// This preserves the original file creation date better than mtime
		console.log(
			`[AudioMetadata] No creation_time metadata found, using file birth time`,
		);
		const file = Bun.file(filePath);
		const stat = await file.stat();
		const date = new Date(stat.birthtime || stat.mtime);
		console.log(
			`[AudioMetadata] Using file birth time: ${date.toISOString()} from ${filePath}`,
		);
		return date;
	} catch (error) {
		console.error(
			`[AudioMetadata] Failed to extract metadata from ${filePath}:`,
			error instanceof Error ? error.message : "Unknown error",
		);
		return null;
	}
}

/**
 * Gets day of week from a date (0 = Sunday, 6 = Saturday)
 */
export function getDayOfWeek(date: Date): number {
	return date.getDay();
}

/**
 * Gets day name from a date
 */
export function getDayName(date: Date): string {
	const days = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	return days[date.getDay()] || "Unknown";
}

/**
 * Checks if a meeting time label matches a specific day
 * Labels like "Monday Lecture", "Tuesday Lab", "Wed Discussion" should match
 */
export function meetingTimeLabelMatchesDay(
	label: string,
	dayName: string,
): boolean {
	const lowerLabel = label.toLowerCase();
	const lowerDay = dayName.toLowerCase();

	// Check for full day name
	if (lowerLabel.includes(lowerDay)) {
		return true;
	}

	// Check for 3-letter abbreviations
	const abbrev = dayName.slice(0, 3).toLowerCase();
	if (lowerLabel.includes(abbrev)) {
		return true;
	}

	return false;
}

/**
 * Finds the best matching meeting time for a given date
 * @param date Date from audio metadata
 * @param meetingTimes Available meeting times for the class
 * @returns Meeting time ID or null if no match
 */
export function findMatchingMeetingTime(
	date: Date,
	meetingTimes: Array<{ id: string; label: string }>,
): string | null {
	const dayName = getDayName(date);

	// Find meeting time that matches the day
	const match = meetingTimes.find((mt) =>
		meetingTimeLabelMatchesDay(mt.label, dayName),
	);

	if (match) {
		console.log(
			`[AudioMetadata] Matched ${dayName} to meeting time: ${match.label}`,
		);
		return match.id;
	}

	console.log(
		`[AudioMetadata] No meeting time found matching ${dayName} in available options: ${meetingTimes.map((mt) => mt.label).join(", ")}`,
	);
	return null;
}
