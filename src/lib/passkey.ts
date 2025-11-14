import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type VerifiedAuthenticationResponse,
	type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/types";
import db from "../db/schema";
import type { User } from "./auth";

export interface Passkey {
	id: string;
	user_id: number;
	credential_id: string;
	public_key: string;
	counter: number;
	transports: string | null;
	name: string | null;
	created_at: number;
	last_used_at: number | null;
}

export interface RegistrationChallenge {
	challenge: string;
	user_id: number;
	expires_at: number;
}

export interface AuthenticationChallenge {
	challenge: string;
	expires_at: number;
}

// In-memory challenge storage
const registrationChallenges = new Map<string, RegistrationChallenge>();
const authenticationChallenges = new Map<string, AuthenticationChallenge>();

// Challenge TTL: 5 minutes
const CHALLENGE_TTL = 5 * 60 * 1000;

// Cleanup expired challenges every minute
setInterval(() => {
	const now = Date.now();
	for (const [challenge, data] of registrationChallenges.entries()) {
		if (data.expires_at < now) {
			registrationChallenges.delete(challenge);
		}
	}
	for (const [challenge, data] of authenticationChallenges.entries()) {
		if (data.expires_at < now) {
			authenticationChallenges.delete(challenge);
		}
	}
}, 60 * 1000);

/**
 * Get RP ID and origin based on environment
 */
function getRPConfig(): { rpID: string; rpName: string; origin: string } {
	if (process.env.NODE_ENV === "production") {
		return {
			rpID: process.env.RP_ID || "thistle.app",
			rpName: "Thistle",
			origin: process.env.ORIGIN || "https://thistle.app",
		};
	}
	return {
		rpID: "localhost",
		rpName: "Thistle (Dev)",
		origin: "http://localhost:3000",
	};
}

/**
 * Generate registration options for a user
 */
export async function createRegistrationOptions(user: User) {
	const { rpID, rpName } = getRPConfig();

	// Get existing credentials to exclude
	const existingCredentials = getPasskeysForUser(user.id);

	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: user.email,
		userDisplayName: user.name || user.email,
		attestationType: "none",
		excludeCredentials: existingCredentials.map((cred) => ({
			id: cred.credential_id,
			transports: cred.transports?.split(",") as
				| ("usb" | "nfc" | "ble" | "internal" | "hybrid")[]
				| undefined,
		})),
		authenticatorSelection: {
			residentKey: "preferred",
			userVerification: "preferred",
		},
	});

	// Store challenge
	registrationChallenges.set(options.challenge, {
		challenge: options.challenge,
		user_id: user.id,
		expires_at: Date.now() + CHALLENGE_TTL,
	});

	return options;
}

/**
 * Verify registration response and create passkey
 */
export async function verifyAndCreatePasskey(
	response: RegistrationResponseJSON,
	expectedChallenge: string,
	name?: string,
): Promise<Passkey> {
	// Validate challenge exists
	const challengeData = registrationChallenges.get(expectedChallenge);
	if (!challengeData) {
		throw new Error("Invalid or expired challenge");
	}

	if (challengeData.expires_at < Date.now()) {
		registrationChallenges.delete(expectedChallenge);
		throw new Error("Challenge expired");
	}

	const { origin, rpID } = getRPConfig();

	// Verify the registration
	let verification: VerifiedRegistrationResponse;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
		});
	} catch (error) {
		throw new Error(
			`Registration verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}

	if (!verification.verified || !verification.registrationInfo) {
		throw new Error("Registration verification failed");
	}

	// Remove used challenge
	registrationChallenges.delete(expectedChallenge);

	const { credential } = verification.registrationInfo;

	// Create passkey
	// credential.id is a base64url string in SimpleWebAuthn v13
	// credential.publicKey is a Uint8Array that needs conversion
	const passkeyId = crypto.randomUUID();
	const credentialIdBase64 = credential.id;
	const publicKeyBase64 = Buffer.from(credential.publicKey).toString("base64url");
	const transports = response.response.transports?.join(",") || null;

	db.run(
		`INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			passkeyId,
			challengeData.user_id,
			credentialIdBase64,
			publicKeyBase64,
			credential.counter,
			transports,
			name || null,
		],
	);

	const passkey = db
		.query<Passkey, [string]>(
			`SELECT id, user_id, credential_id, public_key, counter, transports, name, created_at, last_used_at
       FROM passkeys WHERE id = ?`,
		)
		.get(passkeyId);

	if (!passkey) {
		throw new Error("Failed to create passkey");
	}

	return passkey;
}

/**
 * Generate authentication options
 */
export async function createAuthenticationOptions(email?: string) {
	const { rpID } = getRPConfig();

	let allowCredentials: Array<{
		id: string;
		transports?: ("usb" | "nfc" | "ble" | "internal" | "hybrid")[];
	}> = [];

	// If email provided, only allow that user's credentials
	if (email) {
		const user = db
			.query<{ id: number }, [string]>("SELECT id FROM users WHERE email = ?")
			.get(email);

		if (user) {
			const credentials = getPasskeysForUser(user.id);
			allowCredentials = credentials.map((cred) => ({
				id: cred.credential_id,
				transports: cred.transports?.split(",") as
					| ("usb" | "nfc" | "ble" | "internal" | "hybrid")[]
					| undefined,
			}));
		}
	}

	const options = await generateAuthenticationOptions({
		rpID,
		allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
		userVerification: "preferred",
	});

	// Store challenge
	authenticationChallenges.set(options.challenge, {
		challenge: options.challenge,
		expires_at: Date.now() + CHALLENGE_TTL,
	});

	return options;
}

/**
 * Verify authentication response
 */
export async function verifyAndAuthenticatePasskey(
	response: AuthenticationResponseJSON,
	expectedChallenge: string,
): Promise<{ passkey: Passkey; user: User }> {
	// Validate challenge
	const challengeData = authenticationChallenges.get(expectedChallenge);
	if (!challengeData) {
		throw new Error("Invalid or expired challenge");
	}

	if (challengeData.expires_at < Date.now()) {
		authenticationChallenges.delete(expectedChallenge);
		throw new Error("Challenge expired");
	}

	// Get passkey by credential ID
	// response.id is already base64url encoded string from SimpleWebAuthn
	const passkey = db
		.query<Passkey, [string]>(
			`SELECT id, user_id, credential_id, public_key, counter, transports, name, created_at, last_used_at
       FROM passkeys WHERE credential_id = ?`,
		)
		.get(response.id);

	if (!passkey) {
		throw new Error("Passkey not found");
	}

	const { origin, rpID } = getRPConfig();

	// Verify the authentication
	let verification: VerifiedAuthenticationResponse;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: passkey.credential_id,
				publicKey: Buffer.from(passkey.public_key, "base64url"),
				counter: passkey.counter,
			},
		});
	} catch (error) {
		throw new Error(
			`Authentication verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}

	if (!verification.verified) {
		throw new Error("Authentication verification failed");
	}

	// Remove used challenge
	authenticationChallenges.delete(expectedChallenge);

	// Update last used timestamp and counter
	const now = Math.floor(Date.now() / 1000);
	db.run(
		"UPDATE passkeys SET last_used_at = ?, counter = ? WHERE id = ?",
		[now, verification.authenticationInfo.newCounter, passkey.id],
	);

	// Get user
	const user = db
		.query<User, [number]>(
			"SELECT id, email, name, avatar, created_at, role FROM users WHERE id = ?",
		)
		.get(passkey.user_id);

	if (!user) {
		throw new Error("User not found");
	}

	return { passkey, user };
}

/**
 * Get all passkeys for a user
 */
export function getPasskeysForUser(userId: number): Passkey[] {
	return db
		.query<Passkey, [number]>(
			`SELECT id, user_id, credential_id, public_key, counter, transports, name, created_at, last_used_at
       FROM passkeys WHERE user_id = ? ORDER BY created_at DESC`,
		)
		.all(userId);
}

/**
 * Delete a passkey
 */
export function deletePasskey(passkeyId: string, userId: number): void {
	db.run("DELETE FROM passkeys WHERE id = ? AND user_id = ?", [
		passkeyId,
		userId,
	]);
}

/**
 * Update passkey name
 */
export function updatePasskeyName(
	passkeyId: string,
	userId: number,
	name: string,
): void {
	db.run("UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?", [
		name,
		passkeyId,
		userId,
	]);
}
