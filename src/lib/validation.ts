/**
 * Input validation utilities
 */

// RFC 5322 compliant email regex (simplified but comprehensive)
const EMAIL_REGEX =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Validation limits
export const VALIDATION_LIMITS = {
	EMAIL_MAX: 320, // RFC 5321
	NAME_MAX: 255,
	PASSWORD_HASH_LENGTH: 64, // PBKDF2 hex output
	COURSE_CODE_MAX: 50,
	COURSE_NAME_MAX: 500,
	PROFESSOR_NAME_MAX: 255,
	SEMESTER_MAX: 50,
	CLASS_ID_MAX: 100,
};

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate email address
 */
export function validateEmail(email: unknown): ValidationResult {
	if (typeof email !== "string") {
		return { valid: false, error: "Email must be a string" };
	}

	const trimmed = email.trim();

	if (trimmed.length === 0) {
		return { valid: false, error: "Email is required" };
	}

	if (trimmed.length > VALIDATION_LIMITS.EMAIL_MAX) {
		return {
			valid: false,
			error: `Email must be less than ${VALIDATION_LIMITS.EMAIL_MAX} characters`,
		};
	}

	if (!EMAIL_REGEX.test(trimmed)) {
		return { valid: false, error: "Invalid email format" };
	}

	return { valid: true };
}

/**
 * Validate name (user name, professor name, etc.)
 */
export function validateName(
	name: unknown,
	fieldName = "Name",
): ValidationResult {
	if (typeof name !== "string") {
		return { valid: false, error: `${fieldName} must be a string` };
	}

	const trimmed = name.trim();

	if (trimmed.length === 0) {
		return { valid: false, error: `${fieldName} is required` };
	}

	if (trimmed.length > VALIDATION_LIMITS.NAME_MAX) {
		return {
			valid: false,
			error: `${fieldName} must be less than ${VALIDATION_LIMITS.NAME_MAX} characters`,
		};
	}

	return { valid: true };
}

/**
 * Validate password hash format (client-side PBKDF2)
 */
export function validatePasswordHash(password: unknown): ValidationResult {
	if (typeof password !== "string") {
		return { valid: false, error: "Password must be a string" };
	}

	// Client sends PBKDF2 as hex string
	if (
		password.length !== VALIDATION_LIMITS.PASSWORD_HASH_LENGTH ||
		!/^[0-9a-f]+$/.test(password)
	) {
		return { valid: false, error: "Invalid password format" };
	}

	return { valid: true };
}

/**
 * Validate course code
 */
export function validateCourseCode(courseCode: unknown): ValidationResult {
	if (typeof courseCode !== "string") {
		return { valid: false, error: "Course code must be a string" };
	}

	const trimmed = courseCode.trim();

	if (trimmed.length === 0) {
		return { valid: false, error: "Course code is required" };
	}

	if (trimmed.length > VALIDATION_LIMITS.COURSE_CODE_MAX) {
		return {
			valid: false,
			error: `Course code must be less than ${VALIDATION_LIMITS.COURSE_CODE_MAX} characters`,
		};
	}

	return { valid: true };
}

/**
 * Validate course/class name
 */
export function validateCourseName(courseName: unknown): ValidationResult {
	if (typeof courseName !== "string") {
		return { valid: false, error: "Course name must be a string" };
	}

	const trimmed = courseName.trim();

	if (trimmed.length === 0) {
		return { valid: false, error: "Course name is required" };
	}

	if (trimmed.length > VALIDATION_LIMITS.COURSE_NAME_MAX) {
		return {
			valid: false,
			error: `Course name must be less than ${VALIDATION_LIMITS.COURSE_NAME_MAX} characters`,
		};
	}

	return { valid: true };
}

/**
 * Validate semester
 */
export function validateSemester(semester: unknown): ValidationResult {
	if (typeof semester !== "string") {
		return { valid: false, error: "Semester must be a string" };
	}

	const trimmed = semester.trim();

	if (trimmed.length === 0) {
		return { valid: false, error: "Semester is required" };
	}

	if (trimmed.length > VALIDATION_LIMITS.SEMESTER_MAX) {
		return {
			valid: false,
			error: `Semester must be less than ${VALIDATION_LIMITS.SEMESTER_MAX} characters`,
		};
	}

	// Optional: validate it's a known semester value
	const validSemesters = ["fall", "spring", "summer", "winter"];
	if (!validSemesters.includes(trimmed.toLowerCase())) {
		return {
			valid: false,
			error: "Semester must be Fall, Spring, Summer, or Winter",
		};
	}

	return { valid: true };
}

/**
 * Validate year
 */
export function validateYear(year: unknown): ValidationResult {
	if (typeof year !== "number") {
		return { valid: false, error: "Year must be a number" };
	}

	const currentYear = new Date().getFullYear();
	const minYear = 2000;
	const maxYear = currentYear + 5;

	if (year < minYear || year > maxYear) {
		return {
			valid: false,
			error: `Year must be between ${minYear} and ${maxYear}`,
		};
	}

	return { valid: true };
}

/**
 * Validate class ID format
 */
export function validateClassId(classId: unknown): ValidationResult {
	if (typeof classId !== "string") {
		return { valid: false, error: "Class ID must be a string" };
	}

	if (classId.length === 0) {
		return { valid: false, error: "Class ID is required" };
	}

	if (classId.length > VALIDATION_LIMITS.CLASS_ID_MAX) {
		return {
			valid: false,
			error: `Class ID must be less than ${VALIDATION_LIMITS.CLASS_ID_MAX} characters`,
		};
	}

	return { valid: true };
}
