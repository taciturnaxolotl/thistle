import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";

const TEST_DB = "test-schema.db";

afterEach(() => {
	try {
		unlinkSync(TEST_DB);
	} catch {
		// File may not exist
	}
});

test("schema creates all required tables", () => {
	const db = new Database(TEST_DB);

	// Create schema_migrations table
	db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

	// Apply migration (simplified version of migration 1)
	const migration = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      avatar TEXT DEFAULT 'd',
      role TEXT NOT NULL DEFAULT 'user',
      last_login INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      course_code TEXT NOT NULL,
      name TEXT NOT NULL,
      professor TEXT NOT NULL,
      semester TEXT NOT NULL,
      year INTEGER NOT NULL,
      archived BOOLEAN DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS class_members (
      class_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      enrolled_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (class_id, user_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meeting_times (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcriptions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      class_id TEXT,
      meeting_time_id TEXT,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      whisper_job_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (meeting_time_id) REFERENCES meeting_times(id) ON DELETE SET NULL
    );
  `;

	db.run(migration);

	// Verify tables exist
	const tables = db
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
		)
		.all();

	const tableNames = tables.map((t) => t.name);

	expect(tableNames).toContain("users");
	expect(tableNames).toContain("classes");
	expect(tableNames).toContain("class_members");
	expect(tableNames).toContain("meeting_times");
	expect(tableNames).toContain("transcriptions");

	db.close();
});

test("class foreign key constraints work", () => {
	const db = new Database(TEST_DB);

	// Create tables
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
  `);

	db.run("PRAGMA foreign_keys = ON");

	// Create test data
	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		"test@example.com",
		"hash",
	]);
	const userId = db
		.query<{ id: number }, []>("SELECT last_insert_rowid() as id")
		.get()?.id;

	db.run(
		"INSERT INTO classes (id, course_code, name, professor, semester, year) VALUES (?, ?, ?, ?, ?, ?)",
		["class-1", "CS 101", "Intro to CS", "Dr. Smith", "Fall", 2024],
	);

	// Enroll user in class
	db.run("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)", [
		"class-1",
		userId,
	]);

	const enrollment = db
		.query<{ class_id: string; user_id: number }, []>(
			"SELECT class_id, user_id FROM class_members",
		)
		.get();

	expect(enrollment?.class_id).toBe("class-1");
	expect(enrollment?.user_id).toBe(userId);

	// Delete class should cascade delete enrollment
	db.run("DELETE FROM classes WHERE id = ?", ["class-1"]);

	const enrollments = db
		.query<{ class_id: string }, []>("SELECT class_id FROM class_members")
		.all();
	expect(enrollments.length).toBe(0);

	db.close();
});

test("transcription status defaults to pending", () => {
	const db = new Database(TEST_DB);

	db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		"test@example.com",
		"hash",
	]);
	const userId = db
		.query<{ id: number }, []>("SELECT last_insert_rowid() as id")
		.get()?.id;

	db.run(
		"INSERT INTO transcriptions (id, user_id, filename, original_filename) VALUES (?, ?, ?, ?)",
		["trans-1", userId, "file.mp3", "original.mp3"],
	);

	const transcription = db
		.query<{ status: string; progress: number }, []>(
			"SELECT status, progress FROM transcriptions WHERE id = 'trans-1'",
		)
		.get();

	expect(transcription?.status).toBe("pending");
	expect(transcription?.progress).toBe(0);

	db.close();
});
