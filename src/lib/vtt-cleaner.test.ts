import { test, expect } from "bun:test";
import { cleanVTT } from "./vtt-cleaner";

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
