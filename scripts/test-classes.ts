#!/usr/bin/env bun
import db from "../src/db/schema";
import { createClass, enrollUserInClass, getMeetingTimesForClass, createMeetingTime } from "../src/lib/classes";

// Create a test user (admin)
const email = "admin@thistle.test";
const existingUser = db
	.query<{ id: number }, [string]>("SELECT id FROM users WHERE email = ?")
	.get(email);

let userId: number;

if (!existingUser) {
	db.run(
		"INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
		[email, "test-hash", "admin"],
	);
	userId = db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()!.id;
	console.log(`✅ Created admin user: ${email} (ID: ${userId})`);
} else {
	userId = existingUser.id;
	console.log(`✅ Using existing admin user: ${email} (ID: ${userId})`);
}

// Create a test class
const cls = createClass({
	course_code: "CS 101",
	name: "Introduction to Computer Science",
	professor: "Dr. Jane Smith",
	semester: "Fall",
	year: 2024,
});

console.log(`✅ Created class: ${cls.course_code} - ${cls.name} (ID: ${cls.id})`);

// Enroll the admin in the class
enrollUserInClass(userId, cls.id);
console.log(`✅ Enrolled admin in class`);

// Create meeting times
const meeting1 = createMeetingTime(cls.id, "Monday Lecture");
const meeting2 = createMeetingTime(cls.id, "Wednesday Lab");
console.log(`✅ Created meeting times: ${meeting1.label}, ${meeting2.label}`);

// Verify
const meetings = getMeetingTimesForClass(cls.id);
console.log(`✅ Class has ${meetings.length} meeting times`);

console.log("\n📊 Test Summary:");
console.log(`- Class ID: ${cls.id}`);
console.log(`- Course: ${cls.course_code} - ${cls.name}`);
console.log(`- Professor: ${cls.professor}`);
console.log(`- Semester: ${cls.semester} ${cls.year}`);
console.log(`- Meetings: ${meetings.map(m => m.label).join(", ")}`);
