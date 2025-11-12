// Parse and clean VTT files

import type { ParagraphBoundary } from "./transcript-cleaner";

interface VTTSegment {
	index?: number;
	timestamp: string;
	text: string;
	start?: number;
	end?: number;
}

/**
 * Parse a VTT timestamp string (hh:mm:ss.mmm or mm:ss.mmm) into seconds
 */
function parseTimestampToSeconds(ts?: string): number {
	if (!ts) return 0;
	// ts expected like "00:00:09.039"
	const parts = ts.split(":").map((p) => p.trim());
	const hh = parts[0] ?? "0";
	const mm = parts[1] ?? "0";
	const ss = parts[2] ?? "0";
	if (parts.length === 3) {
		const seconds =
			parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseFloat(ss);
		return seconds;
	} else if (parts.length === 2) {
		return parseInt(mm, 10) * 60 + parseFloat(ss);
	}
	return 0;
}

/**
 * Parse VTT content into segments, populating start/end in seconds
 */
export function parseVTT(vttContent: string): VTTSegment[] {
	const lines = vttContent.split("\n");
	const segments: VTTSegment[] = [];
	let currentSegment: Partial<VTTSegment> = {};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim();

		if (!line) {
			if (currentSegment.timestamp && currentSegment.text) {
				// parse start/end
				const match = /([\d:.]+)\s*-->\s*([\d:.]+)/.exec(
					currentSegment.timestamp || "",
				);
				if (match) {
					currentSegment.start = parseTimestampToSeconds(match[1]);
					currentSegment.end = parseTimestampToSeconds(match[2]);
				}
				segments.push(currentSegment as VTTSegment);
				currentSegment = {};
			}
			continue;
		}

		if (line === "WEBVTT") {
			continue;
		}

		// Check if it's a cue id (before timestamp)
		if (!currentSegment.timestamp && line && !line.includes("-->")) {
			currentSegment.index = line;
			continue;
		}

		// Check if it's a timestamp line
		if (line.includes("-->")) {
			currentSegment.timestamp = line;
			// Next line(s) will be text
			const textLines: string[] = [];
			i++;
			while (
				i < lines.length &&
				lines[i]?.trim() &&
				!lines[i]?.includes("-->")
			) {
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
		const match = /([\d:.]+)\s*-->\s*([\d:.]+)/.exec(
			currentSegment.timestamp || "",
		);
		if (match?.[1] && match[2]) {
			currentSegment.start = parseTimestampToSeconds(match[1]);
			currentSegment.end = parseTimestampToSeconds(match[2]);
		}
		segments.push(currentSegment as VTTSegment);
	}

	return segments;
}

/**
 * Clean VTT text segments by removing tags and fixing grammar.
 * Additionally, merge cleaned segments into paragraph cues while preserving
 * stable paragraph IDs (derived from first segment start time).
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
		`[VTTCleaner] Processing ${segments.length} segments for ${transcriptionId}`,
	);

	// Combine all text for cleaning and paragraphing
	const allText = segments.map((s) => s.text).join(" ");

	// Attempt LLM-driven cleaning and paragraphing in one request, fallback to deterministic rules
	let paragraphBoundaries: ParagraphBoundary[] = [];

	try {
		const { cleanAndGetParagraphBoundaries } = await import(
			"./transcript-cleaner"
		);
		const result = await cleanAndGetParagraphBoundaries({
			transcriptId: transcriptionId,
			rawTranscript: allText,
			segments: segments.map((s) => ({
				index: s.index,
				start: s.start,
				end: s.end,
				text: s.text,
			})),
			maxWordsMove: 0,
		});

		if (result?.paragraphs) {
			paragraphBoundaries = result.paragraphs;
		}
	} catch (e) {
		console.warn(
			"[VTTCleaner] Consolidated LLM failed, no paragraph detection:",
			e,
		);
	}

	if (paragraphBoundaries.length === 0) {
		// No paragraphs detected, treat as one big paragraph
		paragraphBoundaries = [
			{
				startSegmentIndex: 0,
				endSegmentIndex: segments.length - 1,
				text: allText,
			},
		];
	}

	// Get the full cleaned transcript from paragraphs
	const cleanedTranscript = paragraphBoundaries.map((p) => p.text).join(" ");

	// Split cleaned text back into segments proportionally (word-based)
	const words = cleanedTranscript.split(/\s+/).filter(Boolean);
	const originalWords = allText.split(/\s+/).filter(Boolean);
	const ratio = words.length / Math.max(1, originalWords.length);

	let wordIndex = 0;
	const cleanedSegments: VTTSegment[] = [];

	for (const segment of segments) {
		const originalWordCount = Math.max(
			1,
			segment.text.split(/\s+/).filter(Boolean).length,
		);
		const newWordCount = Math.max(1, Math.round(originalWordCount * ratio));
		const segmentWords = words.slice(wordIndex, wordIndex + newWordCount);
		wordIndex += newWordCount;

		cleanedSegments.push({
			index: segment.index,
			timestamp: segment.timestamp,
			text: segmentWords.join(" "),
			start: segment.start,
			end: segment.end,
		});
	}

	// If any remaining words, append to last segment
	if (wordIndex < words.length && cleanedSegments.length > 0) {
		const rest = words.slice(wordIndex).join(" ");
		const lastIdx = cleanedSegments.length - 1;
		const lastSeg = cleanedSegments[lastIdx];
		if (lastSeg) {
			lastSeg.text += (lastSeg.text ? " " : "") + rest;
		}
	}

	// Assign paragraph-based IDs to segments
	for (let i = 0; i < cleanedSegments.length; i++) {
		const seg = cleanedSegments[i];
		if (!seg) continue;

		// Find which paragraph this segment belongs to
		let paraIndex = 0;
		let segmentInPara = 1;
		for (let p = 0; p < paragraphBoundaries.length; p++) {
			const para = paragraphBoundaries[p];
			if (i >= para.startSegmentIndex && i <= para.endSegmentIndex) {
				paraIndex = p + 1;
				segmentInPara = i - para.startSegmentIndex + 1;
				break;
			}
		}

		// Use paragraph-based ID: "Paragraph N-M" where N is paragraph number, M is segment within paragraph
		seg.index = `Paragraph ${paraIndex}-${segmentInPara}`;
	}

	// Build output VTT with cleaned segment cues having paragraph-based IDs
	let output = "WEBVTT\n\n";
	for (const seg of cleanedSegments) {
		if (!seg || !seg.timestamp || !seg.text) continue;
		output += `${seg.index}\n`;
		output += `${seg.timestamp}\n`;
		output += `${seg.text}\n\n`;
	}

	console.log(
		`[VTTCleaner] Completed for ${transcriptionId}: ${cleanedSegments.length} segments in ${paragraphBoundaries.length} paragraphs`,
	);

	return output;
}
