import { test, expect } from "bun:test";
import { cleanVTT, parseVTT } from "./vtt-cleaner";

const sampleVTT = `WEBVTT

00:00:00.000 --> 00:00:03.480
<|startoftranscript|> [SIDE CONVERSATION]<|endoftext|>

00:00:03.480 --> 00:00:05.000
<|startoftranscript|> Yes?

00:00:05.000 --> 00:00:08.000
So with this course packet, what quiz is and exams, and if I can study through here, what you talk about?

00:00:08.000 --> 00:00:10.000
And I give you a good review every time.

00:00:10.000 --> 00:00:12.000
Yeah, so I'd be good to just study that and then we can do it.`;

test("parseVTT extracts segments correctly", () => {
	const segments = parseVTT(sampleVTT);

	expect(segments.length).toBeGreaterThan(0);
	expect(segments[0]?.timestamp).toContain("-->");
	expect(segments[0]?.text).toBeDefined();
	expect(segments[0]?.start).toBeGreaterThanOrEqual(0);
	expect(segments[0]?.end).toBeGreaterThanOrEqual(0);
});

test("parseVTT handles empty VTT", () => {
	const emptyVTT = "WEBVTT\n\n";
	const segments = parseVTT(emptyVTT);

	expect(segments.length).toBe(0);
});

test("cleanVTT preserves VTT format when AI key not available", async () => {
	// Save original env var
	const originalKey = process.env.LLM_API_KEY;
	
	// Remove key to test fallback
	delete process.env.LLM_API_KEY;
	
	const result = await cleanVTT("test-vtt", sampleVTT);

	expect(result).toContain("WEBVTT");
	expect(result).toContain("-->");
	
	// Restore original key
	if (originalKey) {
		process.env.LLM_API_KEY = originalKey;
	}
});

test("cleanVTT preserves empty VTT", async () => {
	const emptyVTT = "WEBVTT\n\n";
	const result = await cleanVTT("test-empty", emptyVTT);

	expect(result).toBe(emptyVTT);
});

// Integration test - only runs if API key is available
test("cleanVTT uses AI when available", async () => {
	if (!process.env.LLM_API_KEY) {
		console.log("Skipping AI test - no LLM_API_KEY set");
		return;
	}

	const result = await cleanVTT("test-ai", sampleVTT);

	expect(result).toContain("WEBVTT");
	expect(result).toContain("-->");
	
	// AI should clean up tags
	expect(result).not.toContain("<|startoftranscript|>");
	expect(result).not.toContain("[SIDE CONVERSATION]");
	
	// Should have paragraph formatting
	expect(result).toContain("Paragraph");
	
	console.log("AI-cleaned VTT preview:", result.substring(0, 300));
}, 30000);
