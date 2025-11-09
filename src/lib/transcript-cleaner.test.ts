import { test, expect } from "bun:test";
import { cleanTranscript } from "./transcript-cleaner";

test("cleanTranscript removes tags and fixes grammar", async () => {
	const rawTranscript = `[SIDE CONVERSATION] Yes? So with this course packet, what quiz is and exams, and if I can study through here, what you talk about? And I give you a good review every time. Yeah, so I'd be good to just study that and then we can do it. Yeah, and all the examples and stuff that we get from class especially. And then I, like your first quiz, I give you a mock quiz exactly like the quiz. Oh, okay. so you can kind of get a feel for how I do things. [inaudible] Okay? [inaudible] Yeah. [background chatter]`;

	const result = await cleanTranscript({
		transcriptId: "test-123",
		rawTranscript,
	});

	// Check that tags are removed
	expect(result.cleanedTranscript).not.toContain("[SIDE CONVERSATION]");
	expect(result.cleanedTranscript).not.toContain("[inaudible]");
	expect(result.cleanedTranscript).not.toContain("[background chatter]");

	// Check that we got some text back
	expect(result.cleanedTranscript.length).toBeGreaterThan(0);
	expect(result.cleanedTranscript.length).toBeLessThan(rawTranscript.length);

	console.log("Original:", rawTranscript.substring(0, 100));
	console.log("Cleaned:", result.cleanedTranscript.substring(0, 100));
}, 30000); // 30s timeout for API call

test("cleanTranscript handles empty transcript", async () => {
	const result = await cleanTranscript({
		transcriptId: "test-empty",
		rawTranscript: "",
	});

	expect(result.cleanedTranscript).toBe("");
});

test("cleanTranscript falls back to raw transcript on API error", async () => {
	const rawTranscript = "Test transcript";

	// Test with missing API key (if it's actually set, this test might fail)
	const originalKey = process.env.GEMINI_API_KEY;
	delete process.env.GEMINI_API_KEY;

	const result = await cleanTranscript({
		transcriptId: "test-fallback",
		rawTranscript,
	});

	expect(result.cleanedTranscript).toBe(rawTranscript);
	expect(result.error).toBe("GEMINI_API_KEY not set");

	// Restore key
	if (originalKey) {
		process.env.GEMINI_API_KEY = originalKey;
	}
});
