// Clean up transcripts using Gemini to remove tags and fix grammar

interface CleanTranscriptOptions {
	transcriptId: string;
	rawTranscript: string;
}

interface CleanTranscriptResult {
	cleanedTranscript: string;
	error?: string;
}

/**
 * Clean transcript using Gemini Flash 2.0 (cheapest model)
 * Removes tags like [SIDE CONVERSATION], [inaudible], etc.
 * Fixes grammar while preserving sentence structure
 */
export async function cleanTranscript({
	transcriptId,
	rawTranscript,
}: CleanTranscriptOptions): Promise<CleanTranscriptResult> {
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		return {
			cleanedTranscript: rawTranscript,
			error: "GEMINI_API_KEY not set",
		};
	}

	// Skip cleaning if transcript is empty
	if (!rawTranscript || rawTranscript.trim().length === 0) {
		return {
			cleanedTranscript: rawTranscript,
		};
	}

	console.log(
		`[TranscriptCleaner] Starting cleanup for ${transcriptId} (${rawTranscript.length} chars)`,
	);

	try {
		const prompt = `You are a transcript editor. Clean up this transcript by:
1. Removing ALL tags like [SIDE CONVERSATION], [inaudible], [background chatter], etc.
2. Fixing grammar and punctuation to make sentences readable
3. Preserving the original sentence structure and wording as much as possible
4. Fixing obvious speech recognition errors (e.g., "gr..." should be "grade")
5. NOT adding any new content or changing the meaning
6. If there are obvious speaking mistakes then you can fix those (e.g. "we are going no wait sorry you should be doing")

Return ONLY the cleaned transcript text, nothing else.

Transcript to clean:
${rawTranscript}`;

		const response = await fetch(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [{ text: prompt }],
						},
					],
					generationConfig: {
						temperature: 0.3,
						topK: 40,
						topP: 0.95,
						maxOutputTokens: 8192,
					},
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`[TranscriptCleaner] Gemini API error for ${transcriptId}:`,
				errorText,
			);
			return {
				cleanedTranscript: rawTranscript,
				error: `Gemini API error: ${response.status}`,
			};
		}

		const result = await response.json();
		const cleanedText =
			result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

		if (!cleanedText) {
			console.warn(
				`[TranscriptCleaner] Empty response from Gemini for ${transcriptId}`,
			);
			return {
				cleanedTranscript: rawTranscript,
				error: "Empty response from Gemini",
			};
		}

		const reduction = Math.round(
			((rawTranscript.length - cleanedText.length) / rawTranscript.length) *
				100,
		);
		console.log(
			`[TranscriptCleaner] Completed for ${transcriptId}: ${rawTranscript.length} → ${cleanedText.length} chars (${reduction}% reduction)`,
		);

		return {
			cleanedTranscript: cleanedText,
		};
	} catch (error) {
		console.error(
			`[TranscriptCleaner] Failed to clean ${transcriptId}:`,
			error,
		);
		return {
			cleanedTranscript: rawTranscript,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
