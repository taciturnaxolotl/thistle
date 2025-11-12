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
 * Clean VTT text using AI to create paragraph-separated VTT file.
 * Uses OpenRouter API to intelligently group segments into paragraphs
 * while preserving timing information.
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
		console.warn("[VTTCleaner] LLM configuration incomplete (need LLM_API_KEY, LLM_API_BASE_URL, LLM_MODEL), returning uncleaned VTT");
		return vttContent;
	}

	try {
		// Build the input for the AI
		const inputSegments = segments.map((seg, idx) => ({
			index: idx,
			timestamp: seg.timestamp,
			text: seg.text,
		}));

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

Also go through and rewrite the words to extract the meaning and not necessarily the exact phrasing if it sounds unnatural when written. I want the text to remain lined up with the original though so don't rewrite entire paragraphs but you can remove ums, alrights, and similar. Also remove all contextual tags like [background noise]. Add punctuation if it's missing to make the text readable. If there is no more context to fit a segment then just skip it and move to the next one.

Input segments:
${JSON.stringify(inputSegments, null, 2)}

Return ONLY the VTT content starting with "WEBVTT" and nothing else. No explanations or additional text.`;

		const response = await fetch(
			`${apiBaseUrl}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
					"HTTP-Referer": "https://thistle.app",
					"X-Title": "Thistle Transcription",
				},
				body: JSON.stringify({
					model,
					messages: [
						{ role: "user", content: prompt },
					],
					temperature: 0.3,
					max_tokens: 16384,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[VTTCleaner] OpenRouter error for ${transcriptionId}:`, errorText);
			console.warn("[VTTCleaner] Falling back to uncleaned VTT");
			return vttContent;
		}

		const result = await response.json();
		const cleanedVTT = result.choices?.[0]?.message?.content?.trim();

		if (!cleanedVTT) {
			console.warn("[VTTCleaner] Empty response from AI, returning uncleaned VTT");
			return vttContent;
		}

		// Extract VTT content if the model wrapped it in markdown
		let finalVTT = cleanedVTT;
		if (cleanedVTT.includes("```")) {
			const vttMatch = cleanedVTT.match(/```(?:vtt)?\n([\s\S]*?)```/);
			if (vttMatch?.[1]) {
				finalVTT = vttMatch[1].trim();
			}
		}

		// Ensure it starts with WEBVTT
		if (!finalVTT.startsWith("WEBVTT")) {
			const webvttIndex = finalVTT.indexOf("WEBVTT");
			if (webvttIndex !== -1) {
				finalVTT = finalVTT.substring(webvttIndex);
			} else {
				finalVTT = `WEBVTT\n\n${finalVTT}`;
			}
		}

		console.log(
			`[VTTCleaner] Successfully cleaned ${segments.length} segments using AI`,
		);

		return finalVTT;
	} catch (err) {
		console.error("[VTTCleaner] Exception:", err);
		console.warn("[VTTCleaner] Falling back to uncleaned VTT");
		return vttContent;
	}
}
