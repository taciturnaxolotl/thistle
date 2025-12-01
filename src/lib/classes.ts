import { nanoid } from "nanoid";
import db from "../db/schema";

export interface Class {
	id: string;
	course_code: string;
	name: string;
	professor: string;
	semester: string;
	year: number;
	archived: boolean;
	section_number?: string | null;
	created_at: number;
}

export interface ClassSection {
	id: string;
	class_id: string;
	section_number: string;
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
	section_id: string | null;
	enrolled_at: number;
}

export interface ClassWithStats extends Class {
	student_count?: number;
	transcript_count?: number;
}

/**
 * Get all classes for a user (either enrolled or admin sees all)
 */
export function getClassesForUser(
	userId: number,
	isAdmin: boolean,
	limit = 50,
	cursor?: string,
): {
	data: ClassWithStats[];
	pagination: {
		limit: number;
		hasMore: boolean;
		nextCursor: string | null;
	};
} {
	let classes: ClassWithStats[];

	if (isAdmin) {
		if (cursor) {
			const { decodeClassCursor } = require("./cursor");
			const { year, semester, courseCode, id } = decodeClassCursor(cursor);

			classes = db
				.query<ClassWithStats, [number, string, string, string, number]>(
					`SELECT 
						c.*,
						(SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count,
						(SELECT COUNT(*) FROM transcriptions WHERE class_id = c.id) as transcript_count
					FROM classes c 
					WHERE (c.year < ? OR 
						(c.year = ? AND c.semester < ?) OR 
						(c.year = ? AND c.semester = ? AND c.course_code > ?) OR
						(c.year = ? AND c.semester = ? AND c.course_code = ? AND c.id > ?))
					ORDER BY c.year DESC, c.semester DESC, c.course_code ASC, c.id ASC
					LIMIT ?`,
				)
				.all(
					year,
					year,
					semester,
					year,
					semester,
					courseCode,
					year,
					semester,
					courseCode,
					id,
					limit + 1,
				);
		} else {
			classes = db
				.query<ClassWithStats, [number]>(
					`SELECT 
						c.*,
						(SELECT COUNT(*) FROM class_members WHERE class_id = c.id) as student_count,
						(SELECT COUNT(*) FROM transcriptions WHERE class_id = c.id) as transcript_count
					FROM classes c 
					ORDER BY c.year DESC, c.semester DESC, c.course_code ASC, c.id ASC
					LIMIT ?`,
				)
				.all(limit + 1);
		}
	} else {
		if (cursor) {
			const { decodeClassCursor } = require("./cursor");
			const { year, semester, courseCode, id } = decodeClassCursor(cursor);

			classes = db
				.query<
					ClassWithStats,
					[number, number, string, string, string, number]
				>(
					`SELECT c.* FROM classes c
					INNER JOIN class_members cm ON c.id = cm.class_id
					WHERE cm.user_id = ? AND 
						(c.year < ? OR 
						(c.year = ? AND c.semester < ?) OR 
						(c.year = ? AND c.semester = ? AND c.course_code > ?) OR
						(c.year = ? AND c.semester = ? AND c.course_code = ? AND c.id > ?))
					ORDER BY c.year DESC, c.semester DESC, c.course_code ASC, c.id ASC
					LIMIT ?`,
				)
				.all(
					userId,
					year,
					year,
					semester,
					year,
					semester,
					courseCode,
					year,
					semester,
					courseCode,
					id,
					limit + 1,
				);
		} else {
			classes = db
				.query<ClassWithStats, [number, number]>(
					`SELECT c.* FROM classes c
					INNER JOIN class_members cm ON c.id = cm.class_id
					WHERE cm.user_id = ?
					ORDER BY c.year DESC, c.semester DESC, c.course_code ASC, c.id ASC
					LIMIT ?`,
				)
				.all(userId, limit + 1);
		}
	}

	const hasMore = classes.length > limit;
	if (hasMore) {
		classes.pop();
	}

	let nextCursor: string | null = null;
	if (hasMore && classes.length > 0) {
		const { encodeClassCursor } = require("./cursor");
		const last = classes[classes.length - 1];
		if (last) {
			nextCursor = encodeClassCursor(
				last.year,
				last.semester,
				last.course_code,
				last.id,
			);
		}
	}

	return {
		data: classes,
		pagination: {
			limit,
			hasMore,
			nextCursor,
		},
	};
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
	meeting_times?: string[];
	sections?: string[];
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

	// Create meeting times if provided
	if (data.meeting_times && data.meeting_times.length > 0) {
		for (const label of data.meeting_times) {
			createMeetingTime(id, label);
		}
	}

	// Create sections if provided
	if (data.sections && data.sections.length > 0) {
		for (const sectionNumber of data.sections) {
			createClassSection(id, sectionNumber);
		}
	}

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
	const result = db.run("UPDATE classes SET archived = ? WHERE id = ?", [
		archived ? 1 : 0,
		classId,
	]);

	if (result.changes === 0) {
		throw new Error("Class not found");
	}
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
export function enrollUserInClass(
	userId: number,
	classId: string,
	sectionId?: string | null,
): void {
	const now = Math.floor(Date.now() / 1000);
	db.run(
		"INSERT OR IGNORE INTO class_members (class_id, user_id, section_id, enrolled_at) VALUES (?, ?, ?, ?)",
		[classId, userId, sectionId ?? null, now],
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
 * Get a single meeting time by ID
 */
export function getMeetingById(meetingId: string): MeetingTime | null {
	const result = db
		.query<MeetingTime, [string]>("SELECT * FROM meeting_times WHERE id = ?")
		.get(meetingId);
	return result ?? null;
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
				section_id: string | null;
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
			`SELECT id, user_id, meeting_time_id, section_id, filename, original_filename, status, progress, error_message, created_at, updated_at
       FROM transcriptions
       WHERE class_id = ?
       ORDER BY recording_date DESC, created_at DESC`,
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
       ORDER BY year DESC, semester DESC, professor ASC`,
		)
		.all(`%${courseCode}%`);
}

/**
 * Join a class by class ID
 */
export function joinClass(
	classId: string,
	userId: number,
	sectionId?: string | null,
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

	// Check if class has sections and require one to be selected
	const sections = getClassSections(classId);
	if (sections.length > 0 && !sectionId) {
		return { success: false, error: "Please select a section" };
	}

	// If section provided, validate it exists and belongs to this class
	if (sectionId) {
		const section = sections.find((s) => s.id === sectionId);
		if (!section) {
			return { success: false, error: "Invalid section selected" };
		}
	}

	// Enroll user
	db.query(
		"INSERT INTO class_members (class_id, user_id, section_id, enrolled_at) VALUES (?, ?, ?, ?)",
	).run(cls.id, userId, sectionId ?? null, Math.floor(Date.now() / 1000));

	return { success: true };
}

/**
 * Create a section for a class
 */
export function createClassSection(
	classId: string,
	sectionNumber: string,
): ClassSection {
	const id = nanoid();
	const now = Math.floor(Date.now() / 1000);

	db.run(
		"INSERT INTO class_sections (id, class_id, section_number, created_at) VALUES (?, ?, ?, ?)",
		[id, classId, sectionNumber, now],
	);

	return {
		id,
		class_id: classId,
		section_number: sectionNumber,
		created_at: now,
	};
}

/**
 * Get all sections for a class
 */
export function getClassSections(classId: string): ClassSection[] {
	return db
		.query<ClassSection, [string]>(
			"SELECT * FROM class_sections WHERE class_id = ? ORDER BY section_number ASC",
		)
		.all(classId);
}

/**
 * Delete a class section
 */
export function deleteClassSection(sectionId: string): void {
	db.run("DELETE FROM class_sections WHERE id = ?", [sectionId]);
}

/**
 * Get user's enrolled section for a class
 */
export function getUserSection(userId: number, classId: string): string | null {
	const result = db
		.query<{ section_id: string | null }, [string, number]>(
			"SELECT section_id FROM class_members WHERE class_id = ? AND user_id = ?",
		)
		.get(classId, userId);
	return result?.section_id ?? null;
}

/**
 * Waitlist entry interface
 */
export interface WaitlistEntry {
	id: string;
	user_id: number;
	course_code: string;
	course_name: string;
	professor: string;
	semester: string;
	year: number;
	additional_info: string | null;
	meeting_times: string | null;
	created_at: number;
}

/**
 * Add a class to the waitlist
 */
export function addToWaitlist(
	userId: number,
	courseCode: string,
	courseName: string,
	professor: string,
	semester: string,
	year: number,
	additionalInfo: string | null,
	meetingTimes: string[] | null,
): string {
	const id = nanoid();
	const meetingTimesJson = meetingTimes ? JSON.stringify(meetingTimes) : null;

	db.query(
		`INSERT INTO class_waitlist 
     (id, user_id, course_code, course_name, professor, semester, year, additional_info, meeting_times, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		id,
		userId,
		courseCode,
		courseName,
		professor,
		semester,
		year,
		additionalInfo,
		meetingTimesJson,
		Math.floor(Date.now() / 1000),
	);
	return id;
}

/**
 * Get all waitlist entries
 */
export function getAllWaitlistEntries(): WaitlistEntry[] {
	return db
		.query<WaitlistEntry, []>(
			"SELECT * FROM class_waitlist ORDER BY created_at DESC",
		)
		.all();
}

/**
 * Delete a waitlist entry
 */
export function deleteWaitlistEntry(id: string): void {
	db.query("DELETE FROM class_waitlist WHERE id = ?").run(id);
}
