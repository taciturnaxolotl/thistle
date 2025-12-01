#!/usr/bin/env bun

import db from "../src/db/schema";

const email = process.argv[2];

if (!email) {
	console.error("Usage: bun scripts/remove-from-classes.ts <email>");
	console.error("  Removes a user from all their enrolled classes");
	process.exit(1);
}

const user = db
	.query<{ id: number; email: string }, [string]>(
		"SELECT id, email FROM users WHERE email = ?",
	)
	.get(email);

if (!user) {
	console.error(`User with email ${email} not found`);
	process.exit(1);
}

// Get current enrollments
const enrollments = db
	.query<{ class_id: string }, [number]>(
		"SELECT class_id FROM class_members WHERE user_id = ?",
	)
	.all(user.id);

if (enrollments.length === 0) {
	console.log(`User ${email} is not enrolled in any classes`);
	process.exit(0);
}

// Remove from all classes
db.run("DELETE FROM class_members WHERE user_id = ?", [user.id]);

console.log(`✅ Successfully removed ${email} from ${enrollments.length} class(es)`);
