import { afterEach, beforeEach, expect, test } from "bun:test";
import db from "../db/schema";
import {
	createClass,
	createMeetingTime,
	deleteClass,
	enrollUserInClass,
	getClassesForUser,
	getMeetingTimesForClass,
	isUserEnrolledInClass,
	removeUserFromClass,
} from "./classes";

// Track created resources for cleanup
let createdUserIds: number[] = [];
let createdClassIds: string[] = [];

beforeEach(() => {
	createdUserIds = [];
	createdClassIds = [];
});

afterEach(() => {
	// Clean up classes (cascades to members and meeting times)
	for (const classId of createdClassIds) {
		try {
			deleteClass(classId);
		} catch {
			// May already be deleted
		}
	}

	// Clean up users
	for (const userId of createdUserIds) {
		try {
			db.run("DELETE FROM users WHERE id = ?", [userId]);
		} catch {
			// May already be deleted
		}
	}
});

function createTestUser(email: string): number {
	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		email,
		"hash",
	]);
	const userId = db
		.query<{ id: number }, []>("SELECT last_insert_rowid() as id")
		.get()?.id;
	if (!userId) throw new Error("Failed to create user");
	createdUserIds.push(userId);
	return userId;
}

function createTestClass(data: {
	course_code: string;
	name: string;
	professor: string;
	semester: string;
	year: number;
}) {
	const cls = createClass(data);
	createdClassIds.push(cls.id);
	return cls;
}

test("creates a class with all required fields", () => {
	const cls = createTestClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	expect(cls.id).toBeTruthy();
	expect(cls.course_code).toBe("CS 101");
	expect(cls.name).toBe("Intro to CS");
	expect(cls.professor).toBe("Dr. Smith");
	expect(cls.semester).toBe("Fall");
	expect(cls.year).toBe(2024);
	expect(cls.archived).toBe(false);
});

test("enrolls user in class", () => {
	const userId = createTestUser("test@example.com");

	const cls = createTestClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	// Enroll user
	enrollUserInClass(userId, cls.id);

	// Verify enrollment
	const isEnrolled = isUserEnrolledInClass(userId, cls.id);
	expect(isEnrolled).toBe(true);

	// Cleanup enrollment
	removeUserFromClass(userId, cls.id);
});

test("gets classes for enrolled user", () => {
	const userId = createTestUser("test@example.com");

	// Create two classes
	const cls1 = createTestClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	const cls2 = createTestClass({
		course_code: "CS 102",
		name: "Data Structures",
		professor: "Dr. Jones",
		semester: "Fall",
		year: 2024,
	});

	// Enroll user in only one class
	enrollUserInClass(userId, cls1.id);

	// Get classes for user (non-admin)
	const classesResult = getClassesForUser(userId, false);
	expect(classesResult.data.length).toBe(1);
	expect(classesResult.data[0]?.id).toBe(cls1.id);

	// Admin should see all classes (not just the 2 test classes, but all in DB)
	const allClassesResult = getClassesForUser(userId, true);
	expect(allClassesResult.data.length).toBeGreaterThanOrEqual(2);
	expect(allClassesResult.data.some((c) => c.id === cls1.id)).toBe(true);
	expect(allClassesResult.data.some((c) => c.id === cls2.id)).toBe(true);

	// Cleanup enrollment
	removeUserFromClass(userId, cls1.id);
});

test("creates and retrieves meeting times", () => {
	const cls = createTestClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	createMeetingTime(cls.id, "Monday Lecture");
	createMeetingTime(cls.id, "Wednesday Lab");

	const meetings = getMeetingTimesForClass(cls.id);
	expect(meetings.length).toBe(2);
	expect(meetings[0]?.label).toBe("Monday Lecture");
	expect(meetings[1]?.label).toBe("Wednesday Lab");
});
