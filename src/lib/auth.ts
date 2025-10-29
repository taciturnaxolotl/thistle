import db from "../db/schema";

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export interface User {
	id: number;
	email: string;
	name: string | null;
	avatar: string;
	created_at: number;
}

export interface Session {
	id: string;
	user_id: number;
	ip_address: string | null;
	user_agent: string | null;
	created_at: number;
	expires_at: number;
}

export async function hashPassword(password: string): Promise<string> {
	return await Bun.password.hash(password, {
		algorithm: "argon2id",
		memoryCost: 19456,
		timeCost: 2,
	});
}

export async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	return await Bun.password.verify(password, hash, "argon2id");
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
			"SELECT id, email, name, avatar, created_at FROM users WHERE id = ?",
		)
		.get(session.user_id);

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
	const passwordHash = await hashPassword(password);

	const result = db.run(
		"INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
		[email, passwordHash, name ?? null],
	);

	const user = db
		.query<User, [number]>("SELECT id, email, name, avatar, created_at FROM users WHERE id = ?")
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
		.query<{ id: number; email: string; name: string | null; password_hash: string; created_at: number }, [string]>(
			"SELECT id, email, name, avatar, password_hash, created_at FROM users WHERE email = ?",
		)
		.get(email);

	if (!result) return null;

	const isValid = await verifyPassword(password, result.password_hash);
	if (!isValid) return null;

	return {
		id: result.id,
		email: result.email,
		name: result.name,
		avatar: result.avatar,
		created_at: result.created_at,
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

export function deleteUser(userId: number): void {
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
	const hash = await hashPassword(newPassword);
	db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
}
