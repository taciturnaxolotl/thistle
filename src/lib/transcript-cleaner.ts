// Paragraph boundary detection using OpenRouter. Returns a JSON array of paragraph objects.
export interface ParagraphBoundary {
	startSegmentIndex: number;
	endSegmentIndex: number;
	text: string;
	// Optional: list of moved words for auditing
	movedWords?: { word: string; fromSegmentIndex: number; toSegmentIndex: number }[];
}

// Cleans transcript and determines paragraph boundaries in one LLM request.
// Returns paragraph boundaries as JSON array.
export async function cleanAndGetParagraphBoundaries({
	transcriptId,
	rawTranscript,
	segments,
	maxWordsMove = 0,
}: {
	transcriptId: string;
	rawTranscript: string;
	segments: { index?: number; start?: number; end?: number; text: string }[];
	maxWordsMove?: number;
}): Promise<{ paragraphs?: ParagraphBoundary[]; error?: string }> {
	// Skip processing if transcript is empty
	if (!rawTranscript || rawTranscript.trim().length === 0) {
		return { paragraphs: [] };
	}

	const apiKey = process.env.OPENROUTER_API_KEY;
	const model = process.env.OPENROUTER_MODEL || "openrouter/polaris-alpha";
	if (!apiKey) {
		return { error: "OPENROUTER_API_KEY not set" };
	}

	try {
		const segmentsPayload = segments.map((s) => ({
			index: s.index ?? null,
			start: s.start ?? null,
			end: s.end ?? null,
			text: s.text ?? "",
		}));

		const prompt = `You are a transcript editor and paragrapher. Input: a list of original transcript segments with their index, start time (seconds), end time (seconds), and the RAW transcript text.

Your task: First, clean the transcript by:
1. Removing ALL tags like [SIDE CONVERSATION], [inaudible], [background chatter], etc.
2. Fixing grammar and punctuation to make sentences readable
3. Preserving the original sentence structure and wording as much as possible
4. Fixing obvious speech recognition errors (e.g., "gr..." should be "grade")
5. NOT adding any new content or changing the meaning
6. If there are obvious speaking mistakes then you can fix those (e.g. "we are going no wait sorry you should be doing")

Then, determine paragraph boundaries by grouping the cleaned segments into logical paragraphs. A paragraph represents a complete thought, topic, or idea. Create MULTIPLE paragraphs based on:
- Natural topic changes or shifts in the speaker's focus
- Pauses or transitions in the speech ("Now...", "So...", "Let me tell you...", "Alright...")
- Complete narrative beats or examples
- Typical spoken paragraph length (30-120 seconds / 5-20 segments)

CRITICAL: Each paragraph MUST end with a complete sentence. DO NOT break paragraphs mid-sentence.

RETURN ONLY a JSON array of objects, EXACTLY in this format (no additional text):

[ {"startSegmentIndex": <int>, "endSegmentIndex": <int>, "text": "<paragraph text>"}, ... ]

Rules for paragraphing:
- ALWAYS end paragraphs at sentence boundaries (after periods, question marks, or exclamation points)
- NEVER break a paragraph in the middle of a sentence
- Create AT LEAST one paragraph for every 30-60 seconds of speech (roughly 5-10 segments)
- DO NOT put the entire transcript in a single paragraph
- Paragraphs must reference original segment indexes
- Do not move words across segment boundaries
- Return the paragraphs in order and cover the entire cleaned transcript text without overlap or omission

Segments:
${JSON.stringify(segmentsPayload, null, 2)}

Raw Transcript:
${rawTranscript}`;

		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
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
					temperature: 0.0,
					max_tokens: 8192,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[Paragrapher] OpenRouter error for ${transcriptId}:`, errorText);
			return { error: `OpenRouter API error: ${response.status}` };
		}

		const result = await response.json();
		const raw = result.choices?.[0]?.message?.content?.trim();
		if (!raw) {
			return { error: "Empty paragrapher response" };
		}

		let parsed: ParagraphBoundary[] | null = null;
		try {
			parsed = JSON.parse(raw) as ParagraphBoundary[];
		} catch (e) {
			// Attempt to extract JSON substring if model padded text
			const firstBracket = raw.indexOf("[");
			const lastBracket = raw.lastIndexOf("]");
			if (firstBracket >= 0 && lastBracket > firstBracket) {
				const substr = raw.substring(firstBracket, lastBracket + 1);
				parsed = JSON.parse(substr) as ParagraphBoundary[];
			}
		}

		if (!parsed || !Array.isArray(parsed)) {
			return { error: "Failed to parse paragrapher JSON" };
		}

		return { paragraphs: parsed };
	} catch (err) {
		console.error("[Paragrapher] Exception:", err);
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
