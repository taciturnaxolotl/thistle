import db from "../db/schema";

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export type UserRole = "user" | "admin";

export interface User {
	id: number;
	email: string;
	name: string | null;
	avatar: string;
	created_at: number;
	role: UserRole;
	last_login: number | null;
}

export interface Session {
	id: string;
	user_id: number;
	ip_address: string | null;
	user_agent: string | null;
	created_at: number;
	expires_at: number;
}

export function createSession(
	userId: number,
	ipAddress?: string,
	userAgent?: string,
): string {
	const sessionId = crypto.randomUUID();
	const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

	db.run(
		"INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
		[sessionId, userId, ipAddress ?? null, userAgent ?? null, expiresAt],
	);

	return sessionId;
}

export function getSession(sessionId: string): Session | null {
	const now = Math.floor(Date.now() / 1000);

	const session = db
		.query<Session, [string, number]>(
			"SELECT id, user_id, ip_address, user_agent, created_at, expires_at FROM sessions WHERE id = ? AND expires_at > ?",
		)
		.get(sessionId, now);

	return session ?? null;
}

export function getUserBySession(sessionId: string): User | null {
	const session = getSession(sessionId);
	if (!session) return null;

	const user = db
		.query<User, [number]>(
			"SELECT id, email, name, avatar, created_at, role, last_login FROM users WHERE id = ?",
		)
		.get(session.user_id);

	return user ?? null;
}

export function getUserByEmail(email: string): User | null {
	const user = db
		.query<User, [string]>(
			"SELECT id, email, name, avatar, created_at, role, last_login FROM users WHERE email = ?",
		)
		.get(email);

	return user ?? null;
}

export function deleteSession(sessionId: string): void {
	db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

export function cleanupExpiredSessions(): void {
	const now = Math.floor(Date.now() / 1000);
	db.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
}

export async function createUser(
	email: string,
	password: string,
	name?: string,
): Promise<User> {
	// Generate deterministic avatar from email
	const encoder = new TextEncoder();
	const data = encoder.encode(email.toLowerCase());
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const avatar = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.substring(0, 16);

	const result = db.run(
		"INSERT INTO users (email, password_hash, name, avatar) VALUES (?, ?, ?, ?)",
		[email, password, name ?? null, avatar],
	);

	const user = db
		.query<User, [number]>(
			"SELECT id, email, name, avatar, created_at, role, last_login FROM users WHERE id = ?",
		)
		.get(Number(result.lastInsertRowid));

	if (!user) {
		throw new Error("Failed to create user");
	}

	return user;
}

export async function authenticateUser(
	email: string,
	password: string,
): Promise<User | null> {
	const result = db
		.query<
			{
				id: number;
				email: string;
				name: string | null;
				avatar: string;
				password_hash: string;
				created_at: number;
				role: UserRole;
				last_login: number | null;
			},
			[string]
		>(
			"SELECT id, email, name, avatar, password_hash, created_at, role, last_login FROM users WHERE email = ?",
		)
		.get(email);

	if (!result) {
		// Dummy comparison to prevent timing-based account enumeration
		const dummyHash = "0".repeat(64);
		password === dummyHash;
		return null;
	}

	if (password !== result.password_hash) return null;

	// Update last_login
	const now = Math.floor(Date.now() / 1000);
	db.run("UPDATE users SET last_login = ? WHERE id = ?", [now, result.id]);

	return {
		id: result.id,
		email: result.email,
		name: result.name,
		avatar: result.avatar,
		created_at: result.created_at,
		role: result.role,
		last_login: now,
	};
}

export function getUserSessionsForUser(userId: number): Session[] {
	const now = Math.floor(Date.now() / 1000);

	const sessions = db
		.query<Session, [number, number]>(
			"SELECT id, user_id, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC",
		)
		.all(userId, now);

	return sessions;
}

export function getSessionFromRequest(req: Request): string | null {
	const cookie = req.headers.get("cookie");
	if (!cookie) return null;

	const match = cookie.match(/session=([^;]+)/);
	return match?.[1] ?? null;
}

export async function deleteUser(userId: number): Promise<void> {
	// Get user's subscription if they have one
	const subscription = db
		.query<{ id: string }, [number]>(
			"SELECT id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
		)
		.get(userId);

	// Revoke subscription if it exists
	if (subscription) {
		try {
			const { polar } = await import("./polar");
			await polar.subscriptions.revoke({ id: subscription.id });
			console.log(
				`[User Delete] Revoked subscription ${subscription.id} for user ${userId}`,
			);
		} catch (error) {
			console.error(
				`[User Delete] Failed to revoke subscription ${subscription.id}:`,
				error,
			);
			// Continue with user deletion even if subscription revocation fails
		}
	}

	db.run("DELETE FROM users WHERE id = ?", [userId]);
}

export function updateUserEmail(userId: number, newEmail: string): void {
	db.run("UPDATE users SET email = ? WHERE id = ?", [newEmail, userId]);
}

export function updateUserName(userId: number, newName: string): void {
	db.run("UPDATE users SET name = ? WHERE id = ?", [newName, userId]);
}

export function updateUserAvatar(userId: number, avatar: string): void {
	db.run("UPDATE users SET avatar = ? WHERE id = ?", [avatar, userId]);
}

export async function updateUserPassword(
	userId: number,
	newPassword: string,
): Promise<void> {
	db.run("UPDATE users SET password_hash = ? WHERE id = ?", [
		newPassword,
		userId,
	]);
	db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export function isUserAdmin(userId: number): boolean {
	const result = db
		.query<{ role: UserRole }, [number]>("SELECT role FROM users WHERE id = ?")
		.get(userId);

	return result?.role === "admin";
}

export function updateUserRole(userId: number, role: UserRole): void {
	db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
}

export function getAllUsers(): Array<{
	id: number;
	email: string;
	name: string | null;
	avatar: string;
	created_at: number;
	role: UserRole;
}> {
	return db
		.query<
			{
				id: number;
				email: string;
				name: string | null;
				avatar: string;
				created_at: number;
				role: UserRole;
				last_login: number | null;
			},
			[]
		>(
			"SELECT id, email, name, avatar, created_at, role, last_login FROM users ORDER BY created_at DESC",
		)
		.all();
}

export function getAllTranscriptions(): Array<{
	id: string;
	user_id: number;
	user_email: string;
	user_name: string | null;
	original_filename: string;
	status: string;
	created_at: number;
	error_message: string | null;
}> {
	return db
		.query<
			{
				id: string;
				user_id: number;
				user_email: string;
				user_name: string | null;
				original_filename: string;
				status: string;
				created_at: number;
				error_message: string | null;
			},
			[]
		>(
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
      ORDER BY t.created_at DESC`,
		)
		.all();
}

export function deleteTranscription(transcriptionId: string): void {
	const transcription = db
		.query<{ id: string; filename: string }, [string]>(
			"SELECT id, filename FROM transcriptions WHERE id = ?",
		)
		.get(transcriptionId);

	if (!transcription) {
		throw new Error("Transcription not found");
	}

	// Delete database record
	db.run("DELETE FROM transcriptions WHERE id = ?", [transcriptionId]);

	// Delete files (audio file and transcript files)
	try {
		const audioPath = `./uploads/${transcription.filename}`;
		const transcriptPath = `./transcripts/${transcriptionId}.txt`;
		const vttPath = `./transcripts/${transcriptionId}.vtt`;

		if (Bun.file(audioPath).size) {
			Bun.write(audioPath, "").then(() => {
				// File deleted by overwriting with empty content, then unlink
				import("node:fs").then((fs) => {
					fs.unlinkSync(audioPath);
				});
			});
		}

		if (Bun.file(transcriptPath).size) {
			import("node:fs").then((fs) => {
				fs.unlinkSync(transcriptPath);
			});
		}

		if (Bun.file(vttPath).size) {
			import("node:fs").then((fs) => {
				fs.unlinkSync(vttPath);
			});
		}
	} catch {
		// Files might not exist, ignore errors
	}
}

export function getSessionsForUser(userId: number): Session[] {
	const now = Math.floor(Date.now() / 1000);
	return db
		.query<Session, [number, number]>(
			"SELECT id, user_id, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC",
		)
		.all(userId, now);
}

export function deleteSessionById(sessionId: string, userId: number): boolean {
	const result = db.run("DELETE FROM sessions WHERE id = ? AND user_id = ?", [
		sessionId,
		userId,
	]);
	return result.changes > 0;
}

export function deleteAllUserSessions(userId: number): void {
	db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export function updateUserEmailAddress(userId: number, newEmail: string): void {
	db.run("UPDATE users SET email = ? WHERE id = ?", [newEmail, userId]);
}

export interface UserWithStats {
	id: number;
	email: string;
	name: string | null;
	avatar: string;
	created_at: number;
	role: UserRole;
	last_login: number | null;
	transcription_count: number;
	subscription_status: string | null;
	subscription_id: string | null;
}

export function getAllUsersWithStats(): UserWithStats[] {
	return db
		.query<UserWithStats, []>(
			`SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.avatar, 
        u.created_at, 
        u.role,
        u.last_login,
        COUNT(DISTINCT t.id) as transcription_count,
        s.status as subscription_status,
        s.id as subscription_id
      FROM users u
      LEFT JOIN transcriptions t ON u.id = t.user_id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing', 'past_due')
      GROUP BY u.id
      ORDER BY u.created_at DESC`,
		)
		.all();
}
