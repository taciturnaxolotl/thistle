import { nanoid } from "nanoid";
import db from "../db/schema";

export interface Class {
	id: string;
	course_code: string;
	name: string;
	professor: string;
	section: string | null;
	semester: string;
	year: number;
	archived: boolean;
	created_at: number;
}

export interface MeetingTime {
	id: string;
	class_id: string;
	label: string;
	created_at: number;
}

export interface ClassMember {
	class_id: string;
	user_id: number;
	enrolled_at: number;
}

/**
 * Get all classes for a user (either enrolled or admin sees all)
 */
export function getClassesForUser(
	userId: number,
	isAdmin: boolean,
): Class[] {
	if (isAdmin) {
		return db
			.query<Class, []>(
				"SELECT * FROM classes ORDER BY year DESC, semester DESC, course_code ASC",
			)
			.all();
	}

	return db
		.query<Class, [number]>(
			`SELECT c.* FROM classes c
       INNER JOIN class_members cm ON c.id = cm.class_id
       WHERE cm.user_id = ?
       ORDER BY c.year DESC, c.semester DESC, c.course_code ASC`,
		)
		.all(userId);
}

/**
 * Get a single class by ID
 */
export function getClassById(classId: string): Class | null {
	const result = db
		.query<Class, [string]>("SELECT * FROM classes WHERE id = ?")
		.get(classId);
	return result ?? null;
}

/**
 * Check if user is enrolled in a class
 */
export function isUserEnrolledInClass(
	userId: number,
	classId: string,
): boolean {
	const result = db
		.query<{ count: number }, [string, number]>(
			"SELECT COUNT(*) as count FROM class_members WHERE class_id = ? AND user_id = ?",
		)
		.get(classId, userId);
	return (result?.count ?? 0) > 0;
}

/**
 * Create a new class
 */
export function createClass(data: {
	course_code: string;
	name: string;
	professor: string;
	semester: string;
	year: number;
}): Class {
	const id = nanoid();
	const now = Math.floor(Date.now() / 1000);

	db.run(
		"INSERT INTO classes (id, course_code, name, professor, semester, year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		[
			id,
			data.course_code,
			data.name,
			data.professor,
			data.semester,
			data.year,
			now,
		],
	);

	return {
		id,
		course_code: data.course_code,
		name: data.name,
		professor: data.professor,
		semester: data.semester,
		year: data.year,
		archived: false,
		created_at: now,
	};
}

/**
 * Archive or unarchive a class
 */
export function toggleClassArchive(classId: string, archived: boolean): void {
	db.run("UPDATE classes SET archived = ? WHERE id = ?", [
		archived ? 1 : 0,
		classId,
	]);
}

/**
 * Delete a class (cascades to members, meeting times, and transcriptions)
 */
export function deleteClass(classId: string): void {
	db.run("DELETE FROM classes WHERE id = ?", [classId]);
}

/**
 * Enroll a user in a class
 */
export function enrollUserInClass(userId: number, classId: string): void {
	const now = Math.floor(Date.now() / 1000);
	db.run(
		"INSERT OR IGNORE INTO class_members (class_id, user_id, enrolled_at) VALUES (?, ?, ?)",
		[classId, userId, now],
	);
}

/**
 * Remove a user from a class
 */
export function removeUserFromClass(userId: number, classId: string): void {
	db.run("DELETE FROM class_members WHERE class_id = ? AND user_id = ?", [
		classId,
		userId,
	]);
}

/**
 * Get all members of a class
 */
export function getClassMembers(classId: string) {
	return db
		.query<
			{
				user_id: number;
				email: string;
				name: string | null;
				avatar: string;
				enrolled_at: number;
			},
			[string]
		>(
			`SELECT cm.user_id, u.email, u.name, u.avatar, cm.enrolled_at
       FROM class_members cm
       INNER JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ?
       ORDER BY cm.enrolled_at DESC`,
		)
		.all(classId);
}

/**
 * Create a meeting time for a class
 */
export function createMeetingTime(classId: string, label: string): MeetingTime {
	const id = nanoid();
	const now = Math.floor(Date.now() / 1000);

	db.run(
		"INSERT INTO meeting_times (id, class_id, label, created_at) VALUES (?, ?, ?, ?)",
		[id, classId, label, now],
	);

	return {
		id,
		class_id: classId,
		label,
		created_at: now,
	};
}

/**
 * Get all meeting times for a class
 */
export function getMeetingTimesForClass(classId: string): MeetingTime[] {
	return db
		.query<MeetingTime, [string]>(
			"SELECT * FROM meeting_times WHERE class_id = ? ORDER BY created_at ASC",
		)
		.all(classId);
}

/**
 * Update a meeting time label
 */
export function updateMeetingTime(meetingId: string, label: string): void {
	db.run("UPDATE meeting_times SET label = ? WHERE id = ?", [label, meetingId]);
}

/**
 * Delete a meeting time
 */
export function deleteMeetingTime(meetingId: string): void {
	db.run("DELETE FROM meeting_times WHERE id = ?", [meetingId]);
}

/**
 * Get transcriptions for a class
 */
export function getTranscriptionsForClass(classId: string) {
	return db
		.query<
			{
				id: string;
				user_id: number;
				meeting_time_id: string | null;
				filename: string;
				original_filename: string;
				status: string;
				progress: number;
				error_message: string | null;
				created_at: number;
				updated_at: number;
			},
			[string]
		>(
			`SELECT id, user_id, meeting_time_id, filename, original_filename, status, progress, error_message, created_at, updated_at
       FROM transcriptions
       WHERE class_id = ?
       ORDER BY created_at DESC`,
		)
		.all(classId);
}

/**
 * Search for classes by course code
 */
export function searchClassesByCourseCode(courseCode: string): Class[] {
	return db
		.query<Class, [string]>(
			`SELECT * FROM classes 
       WHERE UPPER(course_code) LIKE UPPER(?) 
       AND archived = 0
       ORDER BY year DESC, semester DESC, professor ASC, section ASC`,
		)
		.all(`%${courseCode}%`);
}

/**
 * Join a class by class ID
 */
export function joinClass(
	classId: string,
	userId: number,
): { success: boolean; error?: string } {
	// Find class by ID
	const cls = db
		.query<Class, [string]>("SELECT * FROM classes WHERE id = ?")
		.get(classId);

	if (!cls) {
		return { success: false, error: "Class not found" };
	}

	if (cls.archived) {
		return { success: false, error: "This class is archived" };
	}

	// Check if already enrolled
	const existing = db
		.query<ClassMember, [string, number]>(
			"SELECT * FROM class_members WHERE class_id = ? AND user_id = ?",
		)
		.get(cls.id, userId);

	if (existing) {
		return { success: false, error: "Already enrolled in this class" };
	}

	// Enroll user
	db.query(
		"INSERT INTO class_members (class_id, user_id, enrolled_at) VALUES (?, ?, ?)",
	).run(cls.id, userId, Math.floor(Date.now() / 1000));

	return { success: true };
}

