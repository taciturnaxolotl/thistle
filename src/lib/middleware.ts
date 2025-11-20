// Helper functions for route authentication and error handling

import db from "../db/schema";
import type { User } from "./auth";
import { getSessionFromRequest, getUserBySession } from "./auth";
import { AuthErrors } from "./errors";

export interface AuthenticatedRequest extends Request {
	user: User;
}

export function requireAuth(req: Request): User {
	const sessionId = getSessionFromRequest(req);
	if (!sessionId) {
		throw AuthErrors.required();
	}

	const user = getUserBySession(sessionId);
	if (!user) {
		throw AuthErrors.invalidSession();
	}

	return user;
}

export function requireAdmin(req: Request): User {
	const user = requireAuth(req);

	if (user.role !== "admin") {
		throw AuthErrors.adminRequired();
	}

	return user;
}

export function hasActiveSubscription(userId: number): boolean {
	const subscription = db
		.query<{ status: string }, [number]>(
			"SELECT status FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due') ORDER BY created_at DESC LIMIT 1",
		)
		.get(userId);

	return !!subscription;
}

export function requireSubscription(req: Request): User {
	const user = requireAuth(req);

	// Admins bypass subscription requirement
	if (user.role === "admin") {
		return user;
	}

	if (!hasActiveSubscription(user.id)) {
		throw AuthErrors.subscriptionRequired();
	}

	return user;
}
