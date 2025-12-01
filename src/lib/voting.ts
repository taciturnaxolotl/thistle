import { nanoid } from "nanoid";
import db from "../db/schema";

/**
 * Vote for a recording
 * Returns true if vote was recorded, false if already voted
 */
export function voteForRecording(
	transcriptionId: string,
	userId: number,
): boolean {
	try {
		const voteId = nanoid();
		db.run(
			"INSERT INTO recording_votes (id, transcription_id, user_id) VALUES (?, ?, ?)",
			[voteId, transcriptionId, userId],
		);

		// Increment vote count on transcription
		db.run(
			"UPDATE transcriptions SET vote_count = vote_count + 1 WHERE id = ?",
			[transcriptionId],
		);

		return true;
	} catch (error) {
		// Unique constraint violation means user already voted
		if (
			error instanceof Error &&
			error.message.includes("UNIQUE constraint failed")
		) {
			return false;
		}
		throw error;
	}
}

/**
 * Remove vote for a recording
 */
export function removeVote(transcriptionId: string, userId: number): boolean {
	const result = db.run(
		"DELETE FROM recording_votes WHERE transcription_id = ? AND user_id = ?",
		[transcriptionId, userId],
	);

	if (result.changes > 0) {
		// Decrement vote count on transcription
		db.run(
			"UPDATE transcriptions SET vote_count = vote_count - 1 WHERE id = ?",
			[transcriptionId],
		);
		return true;
	}

	return false;
}

/**
 * Get user's vote for a specific class meeting time
 */
export function getUserVoteForMeeting(
	userId: number,
	classId: string,
	meetingTimeId: string,
): string | null {
	const result = db
		.query<
			{ transcription_id: string },
			[number, string, string]
		>(
			`SELECT rv.transcription_id 
       FROM recording_votes rv
       JOIN transcriptions t ON rv.transcription_id = t.id
       WHERE rv.user_id = ? 
         AND t.class_id = ? 
         AND t.meeting_time_id = ?
         AND t.status = 'pending'`,
		)
		.get(userId, classId, meetingTimeId);

	return result?.transcription_id || null;
}

/**
 * Get all pending recordings for a class meeting time (filtered by section)
 */
export function getPendingRecordings(
	classId: string,
	meetingTimeId: string,
	sectionId?: string | null,
) {
	// Build query based on whether section filtering is needed
	let query = `SELECT id, user_id, filename, original_filename, vote_count, created_at, section_id
       FROM transcriptions
       WHERE class_id = ? 
         AND meeting_time_id = ?
         AND status = 'pending'`;

	const params: (string | null)[] = [classId, meetingTimeId];

	// Filter by section if provided (for voting - section-specific)
	if (sectionId !== undefined) {
		query += " AND (section_id = ? OR section_id IS NULL)";
		params.push(sectionId);
	}

	query += " ORDER BY vote_count DESC, created_at ASC";

	return db
		.query<
			{
				id: string;
				user_id: number;
				filename: string;
				original_filename: string;
				vote_count: number;
				created_at: number;
				section_id: string | null;
			},
			(string | null)[]
		>(query)
		.all(...params);
}

/**
 * Get total enrolled users count for a class
 */
export function getEnrolledUserCount(classId: string): number {
	const result = db
		.query<{ count: number }, [string]>(
			"SELECT COUNT(*) as count FROM class_members WHERE class_id = ?",
		)
		.get(classId);

	return result?.count || 0;
}

/**
 * Check if recording should be auto-submitted
 * Returns winning recording ID if ready, null otherwise
 */
export function checkAutoSubmit(
	classId: string,
	meetingTimeId: string,
	sectionId?: string | null,
): string | null {
	const recordings = getPendingRecordings(classId, meetingTimeId, sectionId);

	if (recordings.length === 0) {
		return null;
	}

	const totalUsers = getEnrolledUserCount(classId);
	const now = Date.now() / 1000; // Current time in seconds

	// Get the recording with most votes
	const topRecording = recordings[0];
	if (!topRecording) return null;

	const uploadedAt = topRecording.created_at;
	const timeSinceUpload = now - uploadedAt;

	// Auto-submit if:
	// 1. 30 minutes have passed since first upload, OR
	// 2. 40% of enrolled users have voted for the top recording
	const thirtyMinutes = 30 * 60; // 30 minutes in seconds
	const voteThreshold = Math.ceil(totalUsers * 0.4);

	if (timeSinceUpload >= thirtyMinutes) {
		console.log(
			`[Voting] Auto-submitting ${topRecording.id} - 30 minutes elapsed`,
		);
		return topRecording.id;
	}

	if (topRecording.vote_count >= voteThreshold) {
		console.log(
			`[Voting] Auto-submitting ${topRecording.id} - reached ${topRecording.vote_count}/${voteThreshold} votes (40% threshold)`,
		);
		return topRecording.id;
	}

	return null;
}

/**
 * Mark a recording as auto-submitted and start transcription
 */
export function markAsAutoSubmitted(transcriptionId: string): void {
	db.run(
		"UPDATE transcriptions SET auto_submitted = 1 WHERE id = ?",
		[transcriptionId],
	);
}

/**
 * Delete a pending recording (only allowed by uploader or admin)
 */
export function deletePendingRecording(
	transcriptionId: string,
	userId: number,
	isAdmin: boolean,
): boolean {
	// Check ownership if not admin
	if (!isAdmin) {
		const recording = db
			.query<{ user_id: number; status: string }, [string]>(
				"SELECT user_id, status FROM transcriptions WHERE id = ?",
			)
			.get(transcriptionId);

		if (!recording || recording.user_id !== userId) {
			return false;
		}

		// Only allow deleting pending recordings
		if (recording.status !== "pending") {
			return false;
		}
	}

	// Delete the recording (cascades to votes)
	db.run("DELETE FROM transcriptions WHERE id = ?", [transcriptionId]);

	return true;
}
