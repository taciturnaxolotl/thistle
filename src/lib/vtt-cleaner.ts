// Parse and clean VTT files using AI

interface VTTSegment {
	index?: number | string;
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
 * Chunk size for VTT processing
 */
const CHUNK_SIZE = 40; // Segments per chunk

/**
 * Find paragraph boundaries in processed VTT content
 * Returns the segments in the last paragraph and highest paragraph number found
 */
function extractLastParagraphAndHighestNumber(vttContent: string): {
	segments: string;
	paragraphNumber: string | null;
	highestParagraphNumber: number;
} {
	if (!vttContent)
		return { segments: "", paragraphNumber: null, highestParagraphNumber: 0 };

	// Split into segments (separated by double newline)
	const segments = vttContent.split("\n\n").filter(Boolean);
	if (segments.length === 0)
		return { segments: "", paragraphNumber: null, highestParagraphNumber: 0 };

	// Get all segments from the last paragraph number
	const lastSegments: string[] = [];
	let currentParagraphNumber: string | null = null;
	let highestParagraphNumber = 0;

	// First, scan through all segments to find the highest paragraph number
	for (const segment of segments) {
		if (!segment) continue;

		const lines = segment.split("\n");
		const firstLine = lines[0] || "";

		// Check for paragraph number pattern
		const paragraphMatch = /Paragraph (\d+)-\d+/.exec(firstLine);
		if (paragraphMatch?.[1]) {
			const paragraphNum = parseInt(paragraphMatch[1], 10);
			if (
				!Number.isNaN(paragraphNum) &&
				paragraphNum > highestParagraphNumber
			) {
				highestParagraphNumber = paragraphNum;
			}
		}
	}

	// Start from the end and work backwards to find the last paragraph
	for (let i = segments.length - 1; i >= 0; i--) {
		const segment = segments[i];
		if (!segment) continue;

		const lines = segment.split("\n");
		const firstLine = lines[0] || "";

		// Check for paragraph number pattern
		const paragraphMatch = /Paragraph (\d+)-\d+/.exec(firstLine);
		if (paragraphMatch?.[1]) {
			const paragraphNumber = paragraphMatch[1];

			if (!currentParagraphNumber) {
				// This is the first paragraph number we've found working backwards
				currentParagraphNumber = paragraphNumber;
				lastSegments.unshift(segment);
			} else if (paragraphNumber === currentParagraphNumber) {
				// Same paragraph, add it
				lastSegments.unshift(segment);
			} else {
				// Different paragraph, we're done
				break;
			}
		} else {
			// No paragraph number, but might be part of current paragraph
			// Add it if we've already started collecting segments
			if (currentParagraphNumber) {
				lastSegments.unshift(segment);
			}
		}
	}

	return {
		segments: lastSegments.join("\n\n"),
		paragraphNumber: currentParagraphNumber,
		highestParagraphNumber,
	};
}

/**
 * Process a chunk of VTT segments using AI
 */
async function processVTTChunk(
	transcriptionId: string,
	inputSegments: Array<{ index: number; timestamp: string; text: string }>,
	chunkIndex: number,
	previousParagraphNumber: string | null,
	apiKey: string,
	apiBaseUrl: string,
	model: string,
	previousParagraphText?: string,
): Promise<string> {
	const chunkId = `${transcriptionId}-chunk${chunkIndex}`;

	const hasTextContext = !!previousParagraphText;

	console.log(
		`[VTTCleaner] Processing chunk ${chunkIndex} with ${inputSegments.length} segments${hasTextContext ? " and previous paragraph text context" : ""}`,
	);

	const nextParagraphNumber = previousParagraphNumber
		? String(parseInt(previousParagraphNumber, 10) + 1)
		: "1";

	const prompt = `Can you turn this into a paragraph separated vtt file?

Use the format "Paragraph X-Y" where X is the paragraph number and Y is the segment number within that paragraph:

Paragraph 1-1
00:00:00.000 --> 00:00:05.559
Today in chapel we are talking about the fact that we believe in having gospel

Paragraph 1-2
00:00:05.559 --> 00:00:08.639
conversations. I'm gonna run my own PowerPoint. I'm gonna jump around. It's

Paragraph 1-3
00:00:08.639 --> 00:00:11.960
gonna be a little more conversational than normal.

Paragraph 2-1
00:00:11.960 --> 00:00:15.000
Now let's talk about something different.

I want you to preserve sentences across paragraph breaks moving whatever is the smallest amount out to its own segment block.

Here are important guidelines for forming paragraphs:
1. Create a new paragraph when there's a change in topic or speaker.
2. Don't make paragraphs too long - aim for 4-5 sentences per paragraph maximum.
3. Group related thoughts together in the same paragraph.
4. Start a new paragraph when a sentence introduces a completely new idea.
5. Focus on the number of sentences, not segments, when creating paragraphs.
6. The number of segments in a paragraph may vary, but keep paragraphs to a reasonable length.

Also go through and rewrite the words to extract the meaning and not necessarily the exact phrasing if it sounds unnatural when written. I want the text to remain lined up with the original though so don't rewrite entire paragraphs but you can remove ums, alrights, and similar. Also remove all contextual tags like [background noise]. Add punctuation if it's missing to make the text readable. If there is no more context to fit a segment then just skip it and move to the next one.

${
	hasTextContext
		? `The following is the last paragraph from the previous chunk and is provided for context only. DO NOT include it in your output - it's already in the transcript:

${previousParagraphText}

Now process the following new segments, continuing from the previous paragraph. ${previousParagraphNumber ? `Start your paragraphs with number ${nextParagraphNumber} (unless you're continuing the previous paragraph).` : ""}`
		: "Process the following segments:"
}

${JSON.stringify(inputSegments, null, 2)}

Return ONLY the VTT content WITHOUT the "WEBVTT" header and nothing else. No explanations or additional text.`;

	try {
		const response = await fetch(`${apiBaseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"HTTP-Referer": process.env.ORIGIN || "http://localhost:3000",
				"X-Title": `Thistle Transcription Chunk ${chunkIndex}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: prompt }],
				temperature: 0.3,
				max_tokens: 8192, // Reduced for chunks
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[VTTCleaner] OpenRouter error for ${chunkId}:`, errorText);
			throw new Error(`API error: ${response.status}`);
		}

		const result = await response.json();
		const cleanedVTT = result.choices?.[0]?.message?.content?.trim();

		if (!cleanedVTT) {
			throw new Error("Empty response from AI");
		}

		// Extract VTT content if the model wrapped it in markdown
		let chunkVTT = cleanedVTT;
		if (cleanedVTT.includes("```")) {
			const vttMatch = cleanedVTT.match(/```(?:vtt)?\n([\s\S]*?)```/);
			if (vttMatch?.[1]) {
				chunkVTT = vttMatch[1].trim();
			}
		}

		// Remove WEBVTT header if present (we'll add it once at the end)
		if (chunkVTT.startsWith("WEBVTT")) {
			const lines = chunkVTT.split("\n");
			// Skip WEBVTT line and any blank lines that follow
			let i = 1;
			while (i < lines.length && !lines[i]?.trim()) {
				i++;
			}
			chunkVTT = lines.slice(i).join("\n");
		}

		console.log(`[VTTCleaner] Successfully processed chunk ${chunkIndex}`);
		return chunkVTT;
	} catch (error) {
		console.error(`[VTTCleaner] Exception in chunk ${chunkIndex}:`, error);
		throw error;
	}
}

/**
 * Clean VTT text using AI to create paragraph-separated VTT file.
 * Uses OpenRouter API to intelligently group segments into paragraphs
 * while preserving timing information. Processes sequentially in chunks
 * with context from previous chunks to maintain paragraph continuity.
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

	const apiKey = process.env.LLM_API_KEY;
	const apiBaseUrl = process.env.LLM_API_BASE_URL;
	const model = process.env.LLM_MODEL;

	if (!apiKey || !apiBaseUrl || !model) {
		console.warn(
			"[VTTCleaner] LLM configuration incomplete (need LLM_API_KEY, LLM_API_BASE_URL, LLM_MODEL), returning uncleaned VTT",
		);
		return vttContent;
	}

	try {
		// Build the input segments
		const inputSegments = segments.map((seg, idx) => ({
			index: idx,
			timestamp: seg.timestamp,
			text: seg.text,
		}));

		// Prepare chunks for sequential processing
		const chunks: Array<typeof inputSegments> = [];
		for (let i = 0; i < inputSegments.length; i += CHUNK_SIZE) {
			// Don't go beyond array bounds
			const end = Math.min(i + CHUNK_SIZE, inputSegments.length);
			chunks.push(inputSegments.slice(i, end));
		}

		console.log(
			`[VTTCleaner] Split into ${chunks.length} chunks for sequential processing with paragraph context`,
		);

		// Process chunks sequentially with context from previous chunk
		const processedChunks: string[] = [];
		let previousParagraphText: string | undefined;
		let previousParagraphNumber: string | null = null;

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			if (!chunk || chunk.length === 0) continue;

			try {
				const processedChunk = await processVTTChunk(
					transcriptionId,
					chunk,
					i,
					previousParagraphNumber,
					apiKey,
					apiBaseUrl,
					model,
					previousParagraphText,
				);
				processedChunks.push(processedChunk);
				console.log(
					`[VTTCleaner] Completed chunk ${i}/${chunks.length - 1}${previousParagraphText ? " (with context)" : ""}`,
				);

				// Extract context for the next chunk
				if (i < chunks.length - 1) {
					const {
						segments: lastParagraphText,
						paragraphNumber,
						highestParagraphNumber,
					} = extractLastParagraphAndHighestNumber(processedChunk);

					if (lastParagraphText) {
						console.log(
							`[VTTCleaner] Using paragraph ${paragraphNumber || "unknown"} as context for next chunk (highest paragraph: ${highestParagraphNumber})`,
						);
						previousParagraphText = lastParagraphText;
						previousParagraphNumber = highestParagraphNumber.toString();
					} else {
						previousParagraphText = undefined;
						previousParagraphNumber = null;
					}
				}
			} catch (error) {
				console.error(`[VTTCleaner] Chunk ${i} failed:`, error);
				// Return the original segments for this chunk if processing fails
				const fallbackChunk = chunk
					.map((seg) => `${seg.index || ""}\n${seg.timestamp}\n${seg.text}`)
					.join("\n\n");
				processedChunks.push(fallbackChunk);
				previousParagraphText = undefined;
				previousParagraphNumber = null;
			}
		}

		// Combine all processed chunks
		const finalVTT = `WEBVTT\n\n${processedChunks.join("\n\n")}`;

		console.log(
			`[VTTCleaner] Successfully cleaned ${segments.length} segments in ${chunks.length} sequential chunks with paragraph context`,
		);

		return finalVTT;
	} catch (error) {
		console.error("[VTTCleaner] Exception:", error);
		console.warn("[VTTCleaner] Falling back to uncleaned VTT");
		return vttContent;
	}
}
