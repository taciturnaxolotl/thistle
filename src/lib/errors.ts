// Structured error codes for API responses

export enum ErrorCode {
	// Authentication errors
	AUTH_REQUIRED = "AUTH_REQUIRED",
	INVALID_SESSION = "INVALID_SESSION",
	INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
	EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS",
	SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED",

	// Validation errors
	VALIDATION_FAILED = "VALIDATION_FAILED",
	MISSING_FIELD = "MISSING_FIELD",
	INVALID_FORMAT = "INVALID_FORMAT",
	FILE_TOO_LARGE = "FILE_TOO_LARGE",
	UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE",

	// Transcription errors
	TRANSCRIPTION_NOT_FOUND = "TRANSCRIPTION_NOT_FOUND",
	TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED",
	WHISPER_SERVICE_UNAVAILABLE = "WHISPER_SERVICE_UNAVAILABLE",
	WHISPER_SERVICE_ERROR = "WHISPER_SERVICE_ERROR",
	UPLOAD_FAILED = "UPLOAD_FAILED",

	// Session errors
	SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
	SESSION_REVOKE_FAILED = "SESSION_REVOKE_FAILED",

	// User errors
	USER_UPDATE_FAILED = "USER_UPDATE_FAILED",
	USER_DELETE_FAILED = "USER_DELETE_FAILED",

	// Generic errors
	INTERNAL_ERROR = "INTERNAL_ERROR",
	NOT_FOUND = "NOT_FOUND",
}

export interface ApiError {
	error: string;
	code: ErrorCode;
	details?: string;
	field?: string;
}

export class AppError extends Error {
	constructor(
		public code: ErrorCode,
		message: string,
		public statusCode: number = 500,
		public details?: string,
		public field?: string,
	) {
		super(message);
		this.name = "AppError";
	}

	toJSON(): ApiError {
		return {
			error: this.message,
			code: this.code,
			details: this.details,
			field: this.field,
		};
	}

	toResponse(): Response {
		return Response.json(this.toJSON(), { status: this.statusCode });
	}
}

// Helper functions for common errors
export const AuthErrors = {
	required: () =>
		new AppError(ErrorCode.AUTH_REQUIRED, "Authentication required", 401),
	invalidSession: () =>
		new AppError(ErrorCode.INVALID_SESSION, "Invalid or expired session", 401),
	invalidCredentials: () =>
		new AppError(
			ErrorCode.INVALID_CREDENTIALS,
			"Invalid email or password",
			401,
		),
	emailExists: () =>
		new AppError(
			ErrorCode.EMAIL_ALREADY_EXISTS,
			"Email already registered",
			400,
		),
	adminRequired: () =>
		new AppError(ErrorCode.AUTH_REQUIRED, "Admin access required", 403),
	subscriptionRequired: () =>
		new AppError(
			ErrorCode.SUBSCRIPTION_REQUIRED,
			"Active subscription required",
			403,
		),
};

export const ValidationErrors = {
	missingField: (field: string) =>
		new AppError(
			ErrorCode.MISSING_FIELD,
			`${field} is required`,
			400,
			undefined,
			field,
		),
	invalidFormat: (field: string, details?: string) =>
		new AppError(
			ErrorCode.INVALID_FORMAT,
			`Invalid ${field} format`,
			400,
			details,
			field,
		),
	fileTooLarge: (maxSize: string) =>
		new AppError(
			ErrorCode.FILE_TOO_LARGE,
			`File size must be less than ${maxSize}`,
			400,
		),
	unsupportedFileType: (supportedTypes: string) =>
		new AppError(
			ErrorCode.UNSUPPORTED_FILE_TYPE,
			`Unsupported file type. Supported: ${supportedTypes}`,
			400,
		),
};

export const TranscriptionErrors = {
	notFound: () =>
		new AppError(
			ErrorCode.TRANSCRIPTION_NOT_FOUND,
			"Transcription not found",
			404,
		),
	failed: (details?: string) =>
		new AppError(
			ErrorCode.TRANSCRIPTION_FAILED,
			"Transcription failed",
			500,
			details,
		),
	serviceUnavailable: () =>
		new AppError(
			ErrorCode.WHISPER_SERVICE_UNAVAILABLE,
			"Transcription service unavailable",
			503,
			"The Whisper transcription service is not responding. Please try again later.",
		),
	serviceError: (details: string) =>
		new AppError(
			ErrorCode.WHISPER_SERVICE_ERROR,
			"Transcription service error",
			502,
			details,
		),
	uploadFailed: (details?: string) =>
		new AppError(ErrorCode.UPLOAD_FAILED, "Upload failed", 500, details),
};

export const SessionErrors = {
	notFound: () =>
		new AppError(ErrorCode.SESSION_NOT_FOUND, "Session not found", 404),
	revokeFailed: () =>
		new AppError(
			ErrorCode.SESSION_REVOKE_FAILED,
			"Failed to revoke session",
			500,
		),
};

export const UserErrors = {
	updateFailed: (field: string, details?: string) =>
		new AppError(
			ErrorCode.USER_UPDATE_FAILED,
			`Failed to update ${field}`,
			500,
			details,
		),
	deleteFailed: () =>
		new AppError(ErrorCode.USER_DELETE_FAILED, "Failed to delete user", 500),
};

// Generic error handler
export function handleError(error: unknown): Response {
	if (error instanceof AppError) {
		return error.toResponse();
	}

	// Handle database unique constraint errors
	if (
		error instanceof Error &&
		error.message?.includes("UNIQUE constraint failed")
	) {
		if (error.message.includes("email")) {
			return AuthErrors.emailExists().toResponse();
		}
	}

	// Log unexpected errors
	console.error("Unexpected error:", error);

	// Return generic error
	return new AppError(
		ErrorCode.INTERNAL_ERROR,
		"An unexpected error occurred",
		500,
	).toResponse();
}
