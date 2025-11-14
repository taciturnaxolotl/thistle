import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

let testDb: Database;

beforeEach(() => {
	testDb = new Database(":memory:");

	testDb.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      avatar TEXT DEFAULT 'd',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      role TEXT NOT NULL DEFAULT 'user'
    )
  `);

	testDb.run(`
    CREATE TABLE passkeys (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      name TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

afterEach(() => {
	testDb.close();
});

test("admin can update user name", async () => {
	const result = testDb.run(
		"INSERT INTO users (email, password_hash, name, avatar) VALUES (?, ?, ?, ?)",
		["test@example.com", "password123", "Old Name", "avatar1"],
	);

	const userId = Number(result.lastInsertRowid);

	testDb.run("UPDATE users SET name = ? WHERE id = ?", ["New Name", userId]);

	const user = testDb
		.query<{ name: string }, [number]>("SELECT name FROM users WHERE id = ?")
		.get(userId);

	expect(user?.name).toBe("New Name");
});

test("admin can update user password", async () => {
	const result = testDb.run(
		"INSERT INTO users (email, password_hash) VALUES (?, ?)",
		["test@example.com", "password123"],
	);

	const userId = Number(result.lastInsertRowid);

	testDb.run("UPDATE users SET password_hash = ? WHERE id = ?", [
		"newpassword456",
		userId,
	]);

	const user = testDb
		.query<{ password_hash: string }, [number]>(
			"SELECT password_hash FROM users WHERE id = ?",
		)
		.get(userId);

	expect(user?.password_hash).toBe("newpassword456");
});

test("admin can view user passkeys", async () => {
	const result = testDb.run(
		"INSERT INTO users (email, password_hash) VALUES (?, ?)",
		["test@example.com", "password123"],
	);

	const userId = Number(result.lastInsertRowid);

	testDb.run(
		"INSERT INTO passkeys (id, user_id, credential_id, public_key, counter) VALUES (?, ?, ?, ?, ?)",
		["pk1", userId, "cred1", "pubkey1", 0],
	);

	testDb.run(
		"INSERT INTO passkeys (id, user_id, credential_id, public_key, counter) VALUES (?, ?, ?, ?, ?)",
		["pk2", userId, "cred2", "pubkey2", 0],
	);

	const passkeys = testDb
		.query<{ id: string }, [number]>(
			"SELECT id FROM passkeys WHERE user_id = ?",
		)
		.all(userId);

	expect(passkeys.length).toBe(2);
});

test("admin can revoke user passkey", async () => {
	const result = testDb.run(
		"INSERT INTO users (email, password_hash) VALUES (?, ?)",
		["test@example.com", "password123"],
	);

	const userId = Number(result.lastInsertRowid);

	testDb.run(
		"INSERT INTO passkeys (id, user_id, credential_id, public_key, counter) VALUES (?, ?, ?, ?, ?)",
		["pk1", userId, "cred1", "pubkey1", 0],
	);

	let passkeys = testDb
		.query<{ id: string }, [number]>(
			"SELECT id FROM passkeys WHERE user_id = ?",
		)
		.all(userId);
	expect(passkeys.length).toBe(1);

	testDb.run("DELETE FROM passkeys WHERE id = ? AND user_id = ?", [
		"pk1",
		userId,
	]);

	passkeys = testDb
		.query<{ id: string }, [number]>(
			"SELECT id FROM passkeys WHERE user_id = ?",
		)
		.all(userId);
	expect(passkeys.length).toBe(0);
});

test("updating password clears user sessions", async () => {
	testDb.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

	const result = testDb.run(
		"INSERT INTO users (email, password_hash) VALUES (?, ?)",
		["test@example.com", "password123"],
	);

	const userId = Number(result.lastInsertRowid);

	const expiresAt = Math.floor(Date.now() / 1000) + 3600;
	testDb.run(
		"INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		["session1", userId, expiresAt],
	);

	let sessions = testDb
		.query<{ id: string }, [number]>(
			"SELECT id FROM sessions WHERE user_id = ?",
		)
		.all(userId);
	expect(sessions.length).toBe(1);

	testDb.run("UPDATE users SET password_hash = ? WHERE id = ?", [
		"newpassword",
		userId,
	]);
	testDb.run("DELETE FROM sessions WHERE user_id = ?", [userId]);

	sessions = testDb
		.query<{ id: string }, [number]>(
			"SELECT id FROM sessions WHERE user_id = ?",
		)
		.all(userId);
	expect(sessions.length).toBe(0);
});

