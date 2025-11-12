import { test, expect } from "bun:test";
import { cleanAndGetParagraphBoundaries } from "./transcript-cleaner";

test("cleanAndGetParagraphBoundaries cleans transcript and returns paragraph boundaries", async () => {
// Use a longer, more realistic transcript sample with natural paragraph breaks
const rawTranscript = `[SIDE CONVERSATION] Today in chapel we are talking about the fact that we believe in having gospel conversations. I'm gonna run my own PowerPoint. I'm gonna jump around. It's gonna be a little more conversational than normal. It's not gonna be like one of the normal sermons, although I know me and my tendency it'll turn into a sermon at some point just because that's the way God made me, so I can't help it.

Alright, so when it starts just have fun with it. We'll go on. Here's what it says in our doctrinal statement. It says, "Due to the commission of Christ and the urgency of the Gospel, all believers are to engage in Gospel conversations." How many of you believe that? That's pretty weak. How many of you believe that?

To live God-honoring lives and to work continuously for the spread of the Gospel to their neighbors and the nations. Now, let's be honest, as we start off this morning, all of us could do a better job with personal evangelism, and all of us could do a better job with a heart for missions.

So I'm not up here talking to you about something I have conquered or mastered. I'm not the expert on this. In fact, when it comes to personal evangelism in my own strength, I'm often a complete failure. But I have found that even in my weakness, God can use me in powerful ways when I make myself available to Him.`;

// Create mock segments from raw transcript (simulating whisper output)
const sentences = rawTranscript.split(/\.\s+/);
const mockSegments: { index?: number; start?: number; end?: number; text: string }[] = [];
let timeOffset = 0;
for (let i = 0; i < sentences.length; i++) {
const sentence = sentences[i]?.trim();
if (!sentence) continue;
const duration = sentence.split(/\s+/).length * 0.3; // ~0.3s per word
mockSegments.push({
index: i,
start: timeOffset,
end: timeOffset + duration,
text: sentence,
});
timeOffset += duration;
}

const result = await cleanAndGetParagraphBoundaries({
transcriptId: "test-123",
rawTranscript,
segments: mockSegments,
maxWordsMove: 3,
});

// Check that we got a result
expect(result.paragraphs).toBeDefined();
expect(result.paragraphs!.length).toBeGreaterThan(1); // Should have multiple paragraphs

// Check that paragraphs have the expected structure
for (const para of result.paragraphs!) {
		expect(para).toHaveProperty('startSegmentIndex');
 expect(para).toHaveProperty('endSegmentIndex');
 expect(para).toHaveProperty('text');
 expect(para.text.length).toBeGreaterThan(0);
}

// The cleaned text should have tags removed
const cleanedText = result.paragraphs!.map(p => p.text).join(' ');

expect(cleanedText).not.toContain("[SIDE CONVERSATION]");
expect(cleanedText.toLowerCase()).toContain("gospel");
expect(cleanedText.toLowerCase()).toContain("evangelism");

	console.log(`Detected ${result.paragraphs!.length} paragraphs from ${mockSegments.length} segments`);
	console.log("First paragraph:", result.paragraphs![0]?.text.substring(0, 100) + "...");
	console.log("Last paragraph:", result.paragraphs![result.paragraphs!.length - 1]?.text.substring(0, 100) + "...");
}, 30000); // 30s timeout for API call

test("cleanAndGetParagraphBoundaries handles empty transcript", async () => {
const result = await cleanAndGetParagraphBoundaries({
transcriptId: "test-empty",
rawTranscript: "",
segments: [],
maxWordsMove: 3,
});

expect(result.paragraphs).toEqual([]);
});

test("cleanAndGetParagraphBoundaries returns error on missing API key", async () => {
const rawTranscript = "Test transcript";

// Test with missing API key (if it's actually set, this test might fail)
const originalKey = process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const result = await cleanAndGetParagraphBoundaries({
transcriptId: "test-fallback",
rawTranscript,
segments: [{ text: rawTranscript }],
maxWordsMove: 3,
});

expect(result.paragraphs).toBeUndefined();
expect(result.error).toBe("OPENROUTER_API_KEY not set");

// Restore key
if (originalKey) {
process.env.OPENROUTER_API_KEY = originalKey;
}
});
