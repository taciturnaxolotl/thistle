import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

let testDb: Database;

// Test helper functions that accept a db parameter
function getAllTranscriptions_test(
	db: Database,
	limit = 50,
	cursor?: string,
): {
	data: Array<{
		id: string;
		user_id: number;
		user_email: string;
		user_name: string | null;
		original_filename: string;
		status: string;
		created_at: number;
		error_message: string | null;
	}>;
	pagination: {
		limit: number;
		hasMore: boolean;
		nextCursor: string | null;
	};
} {
	type TranscriptionRow = {
		id: string;
		user_id: number;
		user_email: string;
		user_name: string | null;
		original_filename: string;
		status: string;
		created_at: number;
		error_message: string | null;
	};

	let transcriptions: TranscriptionRow[];

	if (cursor) {
		const { decodeCursor } = require("./cursor");
		const parts = decodeCursor(cursor);

		if (parts.length !== 2) {
			throw new Error("Invalid cursor format");
		}

		const cursorTime = Number.parseInt(parts[0] || "", 10);
		const id = parts[1] || "";

		if (Number.isNaN(cursorTime) || !id) {
			throw new Error("Invalid cursor format");
		}

		transcriptions = db
			.query<TranscriptionRow, [number, number, string, number]>(
				`SELECT 
					t.id, 
					t.user_id, 
					u.email as user_email, 
					u.name as user_name, 
					t.original_filename, 
					t.status, 
					t.created_at,
					t.error_message
				FROM transcriptions t
				LEFT JOIN users u ON t.user_id = u.id
				WHERE t.created_at < ? OR (t.created_at = ? AND t.id < ?)
				ORDER BY t.created_at DESC, t.id DESC
				LIMIT ?`,
			)
			.all(cursorTime, cursorTime, id, limit + 1);
	} else {
		transcriptions = db
			.query<TranscriptionRow, [number]>(
				`SELECT 
					t.id, 
					t.user_id, 
					u.email as user_email, 
					u.name as user_name, 
					t.original_filename, 
					t.status, 
					t.created_at,
					t.error_message
				FROM transcriptions t
				LEFT JOIN users u ON t.user_id = u.id
				ORDER BY t.created_at DESC, t.id DESC
				LIMIT ?`,
			)
			.all(limit + 1);
	}

	const hasMore = transcriptions.length > limit;
	if (hasMore) {
		transcriptions.pop();
	}

	let nextCursor: string | null = null;
	if (hasMore && transcriptions.length > 0) {
		const { encodeCursor } = require("./cursor");
		const last = transcriptions[transcriptions.length - 1];
		if (last) {
			nextCursor = encodeCursor([last.created_at.toString(), last.id]);
		}
	}

	return {
		data: transcriptions,
		pagination: {
			limit,
			hasMore,
			nextCursor,
		},
	};
}

beforeAll(() => {
	testDb = new Database(":memory:");

	// Create test tables
	testDb.run(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			password_hash TEXT,
			name TEXT,
			avatar TEXT DEFAULT 'd',
			role TEXT NOT NULL DEFAULT 'user',
			created_at INTEGER NOT NULL,
			email_verified BOOLEAN DEFAULT 0,
			last_login INTEGER
		)
	`);

	testDb.run(`
		CREATE TABLE transcriptions (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			filename TEXT NOT NULL,
			original_filename TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			error_message TEXT,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)
	`);

	testDb.run(`
		CREATE TABLE classes (
			id TEXT PRIMARY KEY,
			course_code TEXT NOT NULL,
			name TEXT NOT NULL,
			professor TEXT NOT NULL,
			semester TEXT NOT NULL,
			year INTEGER NOT NULL,
			archived BOOLEAN DEFAULT 0
		)
	`);

	testDb.run(`
		CREATE TABLE class_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			class_id TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id),
			FOREIGN KEY (class_id) REFERENCES classes(id)
		)
	`);

	// Create test users
	testDb.run(
		"INSERT INTO users (email, password_hash, email_verified, created_at, role) VALUES (?, ?, 1, ?, ?)",
		[
			"user1@test.com",
			"hash1",
			Math.floor(Date.now() / 1000) - 100,
			"user",
		],
	);
	testDb.run(
		"INSERT INTO users (email, password_hash, email_verified, created_at, role) VALUES (?, ?, 1, ?, ?)",
		[
			"user2@test.com",
			"hash2",
			Math.floor(Date.now() / 1000) - 50,
			"user",
		],
	);
	testDb.run(
		"INSERT INTO users (email, password_hash, email_verified, created_at, role) VALUES (?, ?, 1, ?, ?)",
		["admin@test.com", "hash3", Math.floor(Date.now() / 1000), "admin"],
	);

	// Create test transcriptions
	for (let i = 0; i < 5; i++) {
		testDb.run(
			"INSERT INTO transcriptions (id, user_id, filename, original_filename, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			[
				`trans-${i}`,
				1,
				`file-${i}.mp3`,
				`original-${i}.mp3`,
				"completed",
				Math.floor(Date.now() / 1000) - (100 - i * 10),
			],
		);
	}

	// Create test classes
	testDb.run(
		"INSERT INTO classes (id, course_code, name, professor, semester, year) VALUES (?, ?, ?, ?, ?, ?)",
		["class-1", "CS101", "Intro to CS", "Dr. Smith", "Fall", 2024],
	);
	testDb.run(
		"INSERT INTO classes (id, course_code, name, professor, semester, year) VALUES (?, ?, ?, ?, ?, ?)",
		["class-2", "CS102", "Data Structures", "Dr. Jones", "Spring", 2024],
	);

	// Add user to classes
	testDb.run("INSERT INTO class_members (user_id, class_id) VALUES (?, ?)", [
		1,
		"class-1",
	]);
	testDb.run("INSERT INTO class_members (user_id, class_id) VALUES (?, ?)", [
		1,
		"class-2",
	]);
});

afterAll(() => {
	testDb.close();
});

describe("Transcription Pagination", () => {
	test("returns first page without cursor", () => {
		const result = getAllTranscriptions_test(testDb, 2);

		expect(result.data.length).toBe(2);
		expect(result.pagination.limit).toBe(2);
		expect(result.pagination.hasMore).toBe(true);
		expect(result.pagination.nextCursor).toBeTruthy();
	});

	test("returns second page with cursor", () => {
		const page1 = getAllTranscriptions_test(testDb, 2);
		const page2 = getAllTranscriptions_test(
			testDb,
			2,
			page1.pagination.nextCursor || "",
		);

		expect(page2.data.length).toBe(2);
		expect(page2.pagination.hasMore).toBe(true);
		expect(page2.data[0]?.id).not.toBe(page1.data[0]?.id);
	});

	test("returns last page correctly", () => {
		const result = getAllTranscriptions_test(testDb, 10);

		expect(result.data.length).toBe(5);
		expect(result.pagination.hasMore).toBe(false);
		expect(result.pagination.nextCursor).toBeNull();
	});

	test("rejects invalid cursor format", () => {
		expect(() => {
			getAllTranscriptions_test(testDb, 10, "invalid-cursor");
		}).toThrow("Invalid cursor format");
	});

	test("returns results ordered by created_at DESC", () => {
		const result = getAllTranscriptions_test(testDb, 10);

		for (let i = 0; i < result.data.length - 1; i++) {
			const current = result.data[i];
			const next = result.data[i + 1];
			if (current && next) {
				expect(current.created_at).toBeGreaterThanOrEqual(next.created_at);
			}
		}
	});
});

describe("Cursor Format", () => {
	test("transcription cursor format is base64url", () => {
		const result = getAllTranscriptions_test(testDb, 1);
		const cursor = result.pagination.nextCursor;

		// Should be base64url-encoded (alphanumeric, no padding)
		expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(cursor).not.toContain("="); // No padding
		expect(cursor).not.toContain("+"); // URL-safe
		expect(cursor).not.toContain("/"); // URL-safe
	});
});

describe("Limit Boundaries", () => {
	test("respects minimum limit of 1", () => {
		const result = getAllTranscriptions_test(testDb, 1);
		expect(result.data.length).toBeLessThanOrEqual(1);
	});

	test("handles empty results", () => {
		// Query with a user that has no transcriptions
		const emptyDb = new Database(":memory:");
		emptyDb.run(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT UNIQUE NOT NULL,
				password_hash TEXT,
				name TEXT,
				created_at INTEGER NOT NULL
			)
		`);
		emptyDb.run(`
			CREATE TABLE transcriptions (
				id TEXT PRIMARY KEY,
				user_id INTEGER NOT NULL,
				filename TEXT NOT NULL,
				original_filename TEXT NOT NULL,
				status TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				error_message TEXT
			)
		`);

		const result = getAllTranscriptions_test(emptyDb, 10);

		expect(result.data.length).toBe(0);
		expect(result.pagination.hasMore).toBe(false);
		expect(result.pagination.nextCursor).toBeNull();

		emptyDb.close();
	});
});
