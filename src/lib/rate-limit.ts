import db from "../db/schema";

export interface RateLimitResult {
	allowed: boolean;
	retryAfter?: number;
}

export interface RateLimitConfig {
	ip?: { max: number; windowSeconds: number };
	account?: { max: number; windowSeconds: number; email: string };
}

export function checkRateLimit(
	key: string,
	maxAttempts: number,
	windowSeconds: number,
): RateLimitResult {
	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - windowSeconds;

	// Count attempts in rolling window
	const count = db
		.query<{ count: number }, [string, number]>(
			"SELECT COUNT(*) as count FROM rate_limit_attempts WHERE key = ? AND timestamp > ?",
		)
		.get(key, windowStart);

	const attemptCount = count?.count ?? 0;

	if (attemptCount >= maxAttempts) {
		// Find oldest attempt in window to calculate retry time
		const oldest = db
			.query<{ timestamp: number }, [string, number]>(
				"SELECT timestamp FROM rate_limit_attempts WHERE key = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 1",
			)
			.get(key, windowStart);

		const retryAfter = oldest
			? oldest.timestamp + windowSeconds - now
			: windowSeconds;

		return {
			allowed: false,
			retryAfter: Math.max(retryAfter, 1),
		};
	}

	// Record this attempt
	db.run("INSERT INTO rate_limit_attempts (key, timestamp) VALUES (?, ?)", [
		key,
		now,
	]);

	return { allowed: true };
}

export function enforceRateLimit(
	req: Request,
	endpoint: string,
	config: RateLimitConfig,
): Response | null {
	const ipAddress =
		req.headers.get("x-forwarded-for") ??
		req.headers.get("x-real-ip") ??
		"unknown";

	// Check IP-based rate limit
	if (config.ip) {
		const ipLimit = checkRateLimit(
			`${endpoint}:ip:${ipAddress}`,
			config.ip.max,
			config.ip.windowSeconds,
		);

		if (!ipLimit.allowed) {
			return Response.json(
				{
					error: `Too many requests. Try again in ${ipLimit.retryAfter} seconds.`,
				},
				{
					status: 429,
					headers: { "Retry-After": String(ipLimit.retryAfter) },
				},
			);
		}
	}

	// Check account-based rate limit
	if (config.account) {
		const accountLimit = checkRateLimit(
			`${endpoint}:account:${config.account.email.toLowerCase()}`,
			config.account.max,
			config.account.windowSeconds,
		);

		if (!accountLimit.allowed) {
			return Response.json(
				{
					error: `Too many attempts for this account. Try again in ${accountLimit.retryAfter} seconds.`,
				},
				{
					status: 429,
					headers: { "Retry-After": String(accountLimit.retryAfter) },
				},
			);
		}
	}

	return null; // Allowed
}

export function cleanupOldAttempts(olderThanSeconds = 86400) {
	// Clean up attempts older than specified time (default: 24 hours)
	const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
	db.run("DELETE FROM rate_limit_attempts WHERE timestamp < ?", [cutoff]);
}

// Run cleanup on module load and periodically
cleanupOldAttempts();
setInterval(
	() => {
		cleanupOldAttempts();
	},
	60 * 60 * 1000,
); // Every hour
