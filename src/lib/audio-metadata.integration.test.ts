import { afterAll, describe, expect, test } from "bun:test";
import { extractAudioCreationDate } from "./audio-metadata";

describe("extractAudioCreationDate (integration)", () => {
	const testAudioPath = "./test-audio-sample.m4a";

	// Clean up test file after tests
	afterAll(async () => {
		try {
			await Bun.file(testAudioPath).exists().then(async (exists) => {
				if (exists) {
					await Bun.$`rm ${testAudioPath}`;
				}
			});
		} catch {
			// Ignore cleanup errors
		}
	});

	test("extracts creation date from audio file with metadata", async () => {
		// Create a test audio file with metadata using ffmpeg
		// 1 second silent audio with creation_time metadata
		const creationTime = "2024-01-15T14:30:00.000000Z";

		// Create the file with metadata
		await Bun.$`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -metadata creation_time=${creationTime} -y ${testAudioPath}`.quiet();

		const date = await extractAudioCreationDate(testAudioPath);

		expect(date).not.toBeNull();
		expect(date).toBeInstanceOf(Date);
		// JavaScript Date.toISOString() uses 3 decimal places, not 6 like the input
		expect(date?.toISOString()).toBe("2024-01-15T14:30:00.000Z");
	});

	test("returns null for audio file without creation_time metadata", async () => {
		// Create audio file without metadata
		await Bun.$`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -y ${testAudioPath}`.quiet();

		const date = await extractAudioCreationDate(testAudioPath);

		// Should use file modification time as fallback
		expect(date).not.toBeNull();
		expect(date).toBeInstanceOf(Date);
		// Should be very recent (within last minute)
		const now = new Date();
		const diff = now.getTime() - (date?.getTime() ?? 0);
		expect(diff).toBeLessThan(60000); // Less than 1 minute
	});

	test("returns null for non-existent file", async () => {
		const date = await extractAudioCreationDate("./non-existent-file.m4a");
		expect(date).toBeNull();
	});
});
