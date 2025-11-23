import { expect, test } from "bun:test";
import {
	validateClassId,
	validateCourseCode,
	validateCourseName,
	validateEmail,
	validateName,
	validatePasswordHash,
	validateSemester,
	validateYear,
} from "./validation";

test("validateEmail accepts valid emails", () => {
	expect(validateEmail("test@example.com").valid).toBe(true);
	expect(validateEmail("user.name+tag@example.co.uk").valid).toBe(true);
	expect(validateEmail("test@subdomain.example.com").valid).toBe(true);
});

test("validateEmail rejects invalid emails", () => {
	expect(validateEmail("").valid).toBe(false);
	expect(validateEmail("not-an-email").valid).toBe(false);
	expect(validateEmail("@example.com").valid).toBe(false);
	expect(validateEmail("test@").valid).toBe(false);
	expect(validateEmail("a".repeat(321)).valid).toBe(false); // Too long
	expect(validateEmail(123).valid).toBe(false); // Not a string
});

test("validateName accepts valid names", () => {
	expect(validateName("John Doe").valid).toBe(true);
	expect(validateName("Alice").valid).toBe(true);
	expect(validateName("María García").valid).toBe(true);
});

test("validateName rejects invalid names", () => {
	expect(validateName("").valid).toBe(false);
	expect(validateName("   ").valid).toBe(false); // Whitespace only
	expect(validateName("a".repeat(256)).valid).toBe(false); // Too long
	expect(validateName(123).valid).toBe(false); // Not a string
});

test("validatePasswordHash accepts valid PBKDF2 hashes", () => {
	const validHash = "a".repeat(64); // 64 char hex string
	expect(validatePasswordHash(validHash).valid).toBe(true);
	expect(validatePasswordHash("0123456789abcdef".repeat(4)).valid).toBe(true);
});

test("validatePasswordHash rejects invalid hashes", () => {
	expect(validatePasswordHash("short").valid).toBe(false);
	expect(validatePasswordHash("a".repeat(63)).valid).toBe(false); // Too short
	expect(validatePasswordHash("a".repeat(65)).valid).toBe(false); // Too long
	expect(validatePasswordHash("g".repeat(64)).valid).toBe(false); // Invalid hex
	expect(validatePasswordHash(123).valid).toBe(false); // Not a string
});

test("validateCourseCode accepts valid course codes", () => {
	expect(validateCourseCode("CS101").valid).toBe(true);
	expect(validateCourseCode("MATH 2410").valid).toBe(true);
	expect(validateCourseCode("BIO-101").valid).toBe(true);
});

test("validateCourseCode rejects invalid course codes", () => {
	expect(validateCourseCode("").valid).toBe(false);
	expect(validateCourseCode("   ").valid).toBe(false);
	expect(validateCourseCode("a".repeat(51)).valid).toBe(false); // Too long
	expect(validateCourseCode(123).valid).toBe(false); // Not a string
});

test("validateCourseName accepts valid course names", () => {
	expect(validateCourseName("Introduction to Computer Science").valid).toBe(
		true,
	);
	expect(validateCourseName("Calculus I").valid).toBe(true);
});

test("validateCourseName rejects invalid course names", () => {
	expect(validateCourseName("").valid).toBe(false);
	expect(validateCourseName("   ").valid).toBe(false);
	expect(validateCourseName("a".repeat(501)).valid).toBe(false); // Too long
	expect(validateCourseName(123).valid).toBe(false); // Not a string
});

test("validateSemester accepts valid semesters", () => {
	expect(validateSemester("Fall").valid).toBe(true);
	expect(validateSemester("spring").valid).toBe(true); // Case insensitive
	expect(validateSemester("SUMMER").valid).toBe(true);
	expect(validateSemester("Winter").valid).toBe(true);
});

test("validateSemester rejects invalid semesters", () => {
	expect(validateSemester("").valid).toBe(false);
	expect(validateSemester("Invalid").valid).toBe(false);
	expect(validateSemester("Autumn").valid).toBe(false);
	expect(validateSemester(123).valid).toBe(false); // Not a string
});

test("validateYear accepts valid years", () => {
	const currentYear = new Date().getFullYear();
	expect(validateYear(currentYear).valid).toBe(true);
	expect(validateYear(2024).valid).toBe(true);
	expect(validateYear(currentYear + 1).valid).toBe(true);
});

test("validateYear rejects invalid years", () => {
	expect(validateYear(1999).valid).toBe(false); // Too old
	expect(validateYear(2050).valid).toBe(false); // Too far in future
	expect(validateYear("2024").valid).toBe(false); // Not a number
});

test("validateClassId accepts valid class IDs", () => {
	expect(validateClassId("abc123").valid).toBe(true);
	expect(validateClassId("class-2024-fall").valid).toBe(true);
});

test("validateClassId rejects invalid class IDs", () => {
	expect(validateClassId("").valid).toBe(false);
	expect(validateClassId("a".repeat(101)).valid).toBe(false); // Too long
	expect(validateClassId(123).valid).toBe(false); // Not a string
});
