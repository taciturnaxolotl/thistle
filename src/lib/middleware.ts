// Helper functions for route authentication and error handling

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
