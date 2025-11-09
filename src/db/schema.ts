import { Database } from "bun:sqlite";

export const db = new Database("thistle.db");

// Schema version tracking
db.run(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`);

const migrations = [
	{
		version: 1,
		name: "Complete user schema",
		sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        avatar TEXT DEFAULT 'd',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
	},
	{
		version: 2,
		name: "Add transcriptions table",
		sql: `
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploading',
        progress INTEGER NOT NULL DEFAULT 0,
        transcript TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);
    `,
	},
	{
		version: 3,
		name: "Add whisper_job_id to transcriptions",
		sql: `
      ALTER TABLE transcriptions ADD COLUMN whisper_job_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_transcriptions_whisper_job_id ON transcriptions(whisper_job_id);
    `,
	},
	{
		version: 4,
		name: "Remove transcript column from transcriptions",
		sql: `
      -- SQLite 3.35.0+ supports DROP COLUMN
      ALTER TABLE transcriptions DROP COLUMN transcript;
    `,
	},
];

function getCurrentVersion(): number {
	const result = db
		.query<{ version: number }, []>(
			"SELECT MAX(version) as version FROM schema_migrations",
		)
		.get();
	return result?.version ?? 0;
}

function applyMigration(
	version: number,
	sql: string,
	index: number,
	total: number,
) {
	const current = getCurrentVersion();
	if (current >= version) return;

	const isTTY = typeof process !== "undefined" && process.stdout?.isTTY;
	const startMsg = `Applying migration ${index + 1} of ${total}`;

	if (isTTY) {
		process.stdout.write(`${startMsg}...`);
		const start = performance.now();
		db.run(sql);
		db.run("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
		const duration = Math.round(performance.now() - start);
		process.stdout.write(`\r${startMsg} (${duration}ms)\n`);
	} else {
		console.log(startMsg);
		db.run(sql);
		db.run("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
	}
}

// Apply all migrations
const current = getCurrentVersion();
const pending = migrations.filter((m) => m.version > current);

for (const [index, migration] of pending.entries()) {
	applyMigration(migration.version, migration.sql, index, pending.length);
}

export default db;
