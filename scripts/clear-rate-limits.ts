#!/usr/bin/env bun

import db from "../src/db/schema";

console.log("🧹 Clearing all rate limit attempts...");

const result = db.run("DELETE FROM rate_limit_attempts");

const deletedCount = result.changes;

if (deletedCount === 0) {
	console.log("ℹ️  No rate limit attempts to clear");
} else {
	console.log(
		`✅ Successfully cleared ${deletedCount} rate limit attempt${deletedCount === 1 ? "" : "s"}`,
	);
}
