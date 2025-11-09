// Parse and clean VTT files

import { cleanTranscript } from "./transcript-cleaner";

interface VTTSegment {
	index?: number;
	timestamp: string;
	text: string;
}

/**
 * Parse VTT content into segments
 */
function parseVTT(vttContent: string): VTTSegment[] {
	const lines = vttContent.split("\n");
	const segments: VTTSegment[] = [];
	let currentSegment: Partial<VTTSegment> = {};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim();

		if (!line) {
			if (currentSegment.timestamp && currentSegment.text) {
				segments.push(currentSegment as VTTSegment);
				currentSegment = {};
			}
			continue;
		}

		if (line === "WEBVTT") {
			continue;
		}

		// Check if it's a timestamp line
		if (line.includes("-->")) {
			currentSegment.timestamp = line;
			// Next line(s) will be text
			const textLines: string[] = [];
			i++;
			while (i < lines.length && lines[i]?.trim() && !lines[i]?.includes("-->")) {
				textLines.push(lines[i] || "");
				i++;
			}
			currentSegment.text = textLines.join("\n").trim();
			i--; // Back up one since the loop will increment
		} else if (/^\d+$/.test(line)) {
			// It's an index number
			currentSegment.index = Number.parseInt(line, 10);
		}
	}

	// Add last segment if exists
	if (currentSegment.timestamp && currentSegment.text) {
		segments.push(currentSegment as VTTSegment);
	}

	return segments;
}

/**
 * Clean VTT text segments by removing tags and fixing grammar
 */
export async function cleanVTT(
	transcriptionId: string,
	vttContent: string,
): Promise<string> {
	const segments = parseVTT(vttContent);

	if (segments.length === 0) {
		return vttContent;
	}

	console.log(
		`[VTTCleaner] Cleaning ${segments.length} segments for ${transcriptionId}`,
	);

	// Combine all text for cleaning
	const allText = segments.map((s) => s.text).join(" ");

	const { cleanedTranscript, error } = await cleanTranscript({
		transcriptId: transcriptionId,
		rawTranscript: allText,
	});

	if (error) {
		console.warn(`[VTTCleaner] Falling back to original VTT: ${error}`);
		return vttContent;
	}

	// Split cleaned text back into segments
	// Use simple word-based splitting proportional to original segment lengths
	const words = cleanedTranscript.split(/\s+/);
	const originalWords = allText.split(/\s+/);
	const ratio = words.length / originalWords.length;

	let wordIndex = 0;
	const cleanedSegments: VTTSegment[] = [];

	for (const segment of segments) {
		const originalWordCount = segment.text.split(/\s+/).length;
		const newWordCount = Math.max(1, Math.round(originalWordCount * ratio));
		const segmentWords = words.slice(wordIndex, wordIndex + newWordCount);
		wordIndex += newWordCount;

		cleanedSegments.push({
			timestamp: segment.timestamp,
			text: segmentWords.join(" "),
			index: segment.index,
		});
	}

	// Rebuild VTT
	let output = "WEBVTT\n\n";
	for (const segment of cleanedSegments) {
		if (segment.index !== undefined) {
			output += `${segment.index}\n`;
		}
		output += `${segment.timestamp}\n`;
		output += `${segment.text}\n\n`;
	}

	console.log(`[VTTCleaner] Completed for ${transcriptionId}`);

	return output;
}
