import { Database } from "bun:sqlite";

// Use test database when NODE_ENV is test
const dbPath =
	process.env.NODE_ENV === "test" ? "thistle.test.db" : "thistle.db";
export const db = new Database(dbPath);

console.log(`[Database] Using database: ${dbPath}`);

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
		name: "Initial schema with all tables and constraints",
		sql: `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT,
        avatar TEXT DEFAULT 'd',
        role TEXT NOT NULL DEFAULT 'user',
        last_login INTEGER,
        email_verified BOOLEAN DEFAULT 0,
        email_notifications_enabled BOOLEAN DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
      CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

      -- Sessions table
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

      -- Passkeys table
      CREATE TABLE IF NOT EXISTS passkeys (
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
      );

      CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
      CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);

      -- Rate limiting table
      CREATE TABLE IF NOT EXISTS rate_limit_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_key_timestamp ON rate_limit_attempts(key, timestamp);

      -- Classes table
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

      CREATE INDEX IF NOT EXISTS idx_classes_semester_year ON classes(semester, year);
      CREATE INDEX IF NOT EXISTS idx_classes_archived ON classes(archived);
      CREATE INDEX IF NOT EXISTS idx_classes_course_code ON classes(course_code);

      -- Class members table
      CREATE TABLE IF NOT EXISTS class_members (
        class_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        enrolled_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (class_id, user_id),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_class_members_user_id ON class_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_class_members_class_id ON class_members(class_id);

      -- Meeting times table
      CREATE TABLE IF NOT EXISTS meeting_times (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_meeting_times_class_id ON meeting_times(class_id);

      -- Transcriptions table
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

      CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_class_id ON transcriptions(class_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_whisper_job_id ON transcriptions(whisper_job_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_meeting_time_id ON transcriptions(meeting_time_id);

      -- Class waitlist table
      CREATE TABLE IF NOT EXISTS class_waitlist (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        course_code TEXT NOT NULL,
        course_name TEXT NOT NULL,
        professor TEXT NOT NULL,
        semester TEXT NOT NULL,
        year INTEGER NOT NULL,
        meeting_times TEXT,
        additional_info TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_waitlist_user_id ON class_waitlist(user_id);
      CREATE INDEX IF NOT EXISTS idx_waitlist_course_code ON class_waitlist(course_code);

      -- Subscriptions table
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        customer_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_start INTEGER,
        current_period_end INTEGER,
        cancel_at_period_end BOOLEAN DEFAULT 0,
        canceled_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);

      -- Email verification tokens table
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON email_verification_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON email_verification_tokens(token);

      -- Password reset tokens table
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

      -- Email change tokens table
      CREATE TABLE IF NOT EXISTS email_change_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        new_email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_email_change_tokens_user_id ON email_change_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_change_tokens_token ON email_change_tokens(token);

      -- Create ghost user for deleted accounts
      INSERT OR IGNORE INTO users (id, email, password_hash, name, avatar, role, created_at)
      VALUES (0, 'ghosty@thistle.internal', NULL, 'Ghosty', '👻', 'user', strftime('%s', 'now'));
    `,
	},
	{
		version: 2,
		name: "Add sections support to classes and class members",
		sql: `
			-- Add section_number to classes (nullable for existing classes)
			ALTER TABLE classes ADD COLUMN section_number TEXT;

			-- Add section_id to class_members (nullable - NULL means default section)
			ALTER TABLE class_members ADD COLUMN section_id TEXT;

			-- Create sections table to track all available sections for a class
			CREATE TABLE IF NOT EXISTS class_sections (
				id TEXT PRIMARY KEY,
				class_id TEXT NOT NULL,
				section_number TEXT NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
				UNIQUE(class_id, section_number)
			);

			CREATE INDEX IF NOT EXISTS idx_class_sections_class_id ON class_sections(class_id);

			-- Add section_id to transcriptions to track which section uploaded it
			ALTER TABLE transcriptions ADD COLUMN section_id TEXT;

			CREATE INDEX IF NOT EXISTS idx_transcriptions_section_id ON transcriptions(section_id);
		`,
	},
	{
		version: 3,
		name: "Add voting system for collaborative recording selection",
		sql: `
			-- Add vote count to transcriptions
			ALTER TABLE transcriptions ADD COLUMN vote_count INTEGER NOT NULL DEFAULT 0;

			-- Add auto-submitted flag to track if transcription was auto-selected
			ALTER TABLE transcriptions ADD COLUMN auto_submitted BOOLEAN DEFAULT 0;

			-- Create votes table to track who voted for which recording
			CREATE TABLE IF NOT EXISTS recording_votes (
				id TEXT PRIMARY KEY,
				transcription_id TEXT NOT NULL,
				user_id INTEGER NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE(transcription_id, user_id)
			);

			CREATE INDEX IF NOT EXISTS idx_recording_votes_transcription_id ON recording_votes(transcription_id);
			CREATE INDEX IF NOT EXISTS idx_recording_votes_user_id ON recording_votes(user_id);
		`,
	},
	{
		version: 4,
		name: "Add recording_date to transcriptions for chronological ordering",
		sql: `
			-- Add recording_date (timestamp when the recording was made, not uploaded)
			-- Defaults to created_at for existing records
			ALTER TABLE transcriptions ADD COLUMN recording_date INTEGER;
			
			-- Set recording_date to created_at for existing records
			UPDATE transcriptions SET recording_date = created_at WHERE recording_date IS NULL;

			-- Create index for ordering by recording date
			CREATE INDEX IF NOT EXISTS idx_transcriptions_recording_date ON transcriptions(recording_date);
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
