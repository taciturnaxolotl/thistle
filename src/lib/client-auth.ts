/**
 * Client-side password hashing using PBKDF2.
 * Uses aggressive iteration count to waste client CPU instead of server CPU.
 * Server will apply lightweight Argon2 on top for storage.
 */

const ITERATIONS = 1_000_000; // ~1-2 seconds on modern devices

/**
 * Hash password client-side using PBKDF2.
 * @param password - Plaintext password
 * @param email - Email address (used as salt)
 * @returns Hex-encoded hash
 */
export async function hashPasswordClient(
	password: string,
	email: string,
): Promise<string> {
	const encoder = new TextEncoder();

	// Import password as key
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	// Use email as salt (deterministic, unique per user)
	const salt = encoder.encode(email.toLowerCase());

	// Derive 256 bits using PBKDF2
	const hashBuffer = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		256, // 256 bits = 32 bytes
	);

	// Convert to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
