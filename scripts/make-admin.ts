#!/usr/bin/env bun

import db from "../src/db/schema";

const email = process.argv[2];

if (!email) {
	console.error("Usage: bun scripts/make-admin.ts <email>");
	process.exit(1);
}

const user = db
	.query<{ id: number; email: string; role: string }, [string]>(
		"SELECT id, email, role FROM users WHERE email = ?",
	)
	.get(email);

if (!user) {
	console.error(`User with email ${email} not found`);
	process.exit(1);
}

if (user.role === "admin") {
	console.log(`User ${email} is already an admin`);
	process.exit(0);
}

db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);

console.log(`✅ Successfully made ${email} an admin`);
console.log(`   User should refresh their browser to see admin access`);
