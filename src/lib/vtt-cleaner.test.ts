import { test, expect } from "bun:test";
import { cleanVTT } from "./vtt-cleaner";
import { readFileSync } from "fs";
import { join } from "path";

const sampleVTT = `WEBVTT

00:00:00.000 --> 00:00:03.480
<|startoftranscript|> [SIDE CONVERSATION]<|endoftext|>

00:00:00.000 --> 00:00:00.000
<|startoftranscript|> Yes?

00:00:00.000 --> 00:00:00.000
So with this course packet, what quiz is and exams, and if I can study through here, what you talk about?

00:00:00.000 --> 00:00:00.000
And I give you a good review every time.

00:00:00.000 --> 00:00:00.000
Yeah, so I'd be good to just study that and then we can do it.`;

test("cleanVTT removes tags and cleans text", async () => {
	const result = await cleanVTT("test-vtt", sampleVTT);

	expect(result).toContain("WEBVTT");
	expect(result).not.toContain("[SIDE CONVERSATION]");
	expect(result).not.toContain("<|startoftranscript|>");
	expect(result).not.toContain("<|endoftext|>");
	expect(result).toContain("-->");

	console.log("Cleaned VTT preview:", result.substring(0, 200));
}, 30000);

test("cleanVTT preserves empty VTT", async () => {
	const emptyVTT = "WEBVTT\n\n";
	const result = await cleanVTT("test-empty", emptyVTT);

	expect(result).toBe(emptyVTT);
});

test("cleanVTT detects multiple paragraphs", async () => {
	const multiParaVTT = `WEBVTT

Paragraph 1-1
00:00:00.000 --> 00:00:00.000
Again, thank you for the privilege to not only study here, but also to teach here. Jesus,

Paragraph 1-2
00:00:00.000 --> 00:00:00.000
thank you. All`;

	const result = await cleanVTT("test-multi-para", multiParaVTT);

	expect(result).toContain("Paragraph 1-1");
	expect(result).toContain("Paragraph 2-1");
	// Should have at least two paragraphs
	const paraMatches = result.match(/Paragraph \d+-\d+/g);
	expect(paraMatches?.length).toBeGreaterThan(1);
}, 30000);

test("cleanVTT with real transcription data", async () => {
	const originalApiKey = process.env.OPENROUTER_API_KEY;
	// Temporarily unset to force fallback
	delete process.env.OPENROUTER_API_KEY;

	try {
		const vttPath = join(__dirname, "../../transcripts/d69d8076-598a-4fe5-8100-fe3eff47fcd6.vtt");
		const realVTT = readFileSync(vttPath, "utf-8");

		const result = await cleanVTT("real-test", realVTT);

		expect(result).toContain("WEBVTT");
		// Check that it has multiple paragraph numbers
		const paraMatches = result.match(/Paragraph (\d+)-\d+/g);
		const uniqueParas = new Set(paraMatches?.map(m => m.match(/Paragraph (\d+)/)?.[1]));
		expect(uniqueParas.size).toBeGreaterThan(1);
		console.log("Paragraphs found:", uniqueParas.size);
	} finally {
		process.env.OPENROUTER_API_KEY = originalApiKey;
	}
}, 30000);
