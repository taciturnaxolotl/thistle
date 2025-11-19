import { afterEach, beforeEach, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import {
	createClass,
	createMeetingTime,
	enrollUserInClass,
	getClassById,
	getClassesForUser,
	getMeetingTimesForClass,
	getTranscriptionsForClass,
	isUserEnrolledInClass,
} from "./classes";
import { Database } from "bun:sqlite";

const TEST_DB = "test-classes.db";
let db: Database;

beforeEach(() => {
	db = new Database(TEST_DB);

	// Create minimal schema for testing
	db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE classes (
      id TEXT PRIMARY KEY,
      course_code TEXT NOT NULL,
      name TEXT NOT NULL,
      professor TEXT NOT NULL,
      semester TEXT NOT NULL,
      year INTEGER NOT NULL,
      archived BOOLEAN DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE class_members (
      class_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      enrolled_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (class_id, user_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE meeting_times (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE transcriptions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      class_id TEXT,
      meeting_time_id TEXT,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (meeting_time_id) REFERENCES meeting_times(id) ON DELETE SET NULL
    );
  `);
});

afterEach(() => {
	db.close();
	try {
		unlinkSync(TEST_DB);
	} catch {
		// File may not exist
	}
});

test("creates a class with all required fields", () => {
	const cls = createClass({
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
	// Create user
	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		"test@example.com",
		"hash",
	]);
	const userId = db
		.query<{ id: number }, []>("SELECT last_insert_rowid() as id")
		.get()?.id;

	// Create class
	const cls = createClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	// Enroll user
	enrollUserInClass(userId!, cls.id);

	// Verify enrollment
	const isEnrolled = isUserEnrolledInClass(userId!, cls.id);
	expect(isEnrolled).toBe(true);
});

test("gets classes for enrolled user", () => {
	// Create user
	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		"test@example.com",
		"hash",
	]);
	const userId = db
		.query<{ id: number }, []>("SELECT last_insert_rowid() as id")
		.get()?.id;

	// Create two classes
	const cls1 = createClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	const cls2 = createClass({
		course_code: "CS 102",
		name: "Data Structures",
		professor: "Dr. Jones",
		semester: "Fall",
		year: 2024,
	});

	// Enroll user in only one class
	enrollUserInClass(userId!, cls1.id);

	// Get classes for user
	const classes = getClassesForUser(userId!, false);
	expect(classes.length).toBe(1);
	expect(classes[0]?.id).toBe(cls1.id);

	// Admin should see all
	const allClasses = getClassesForUser(userId!, true);
	expect(allClasses.length).toBe(2);
});

test("creates and retrieves meeting times", () => {
	const cls = createClass({
		course_code: "CS 101",
		name: "Intro to CS",
		professor: "Dr. Smith",
		semester: "Fall",
		year: 2024,
	});

	const meeting1 = createMeetingTime(cls.id, "Monday Lecture");
	const meeting2 = createMeetingTime(cls.id, "Wednesday Lab");

	const meetings = getMeetingTimesForClass(cls.id);
	expect(meetings.length).toBe(2);
	expect(meetings[0]?.label).toBe("Monday Lecture");
	expect(meetings[1]?.label).toBe("Wednesday Lab");
});
