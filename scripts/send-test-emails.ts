/**
 * Send test emails to preview all email templates
 * Usage: bun scripts/send-test-emails.ts <email>
 */

import { sendEmail } from "../src/lib/email";
import {
	passwordResetTemplate,
	transcriptionCompleteTemplate,
	verifyEmailTemplate,
} from "../src/lib/email-templates";

const targetEmail = process.argv[2];

if (!targetEmail) {
	console.error("Usage: bun scripts/send-test-emails.ts <email>");
	process.exit(1);
}

async function sendTestEmails() {
	console.log(`Sending test emails to ${targetEmail}...`);

	try {
		// 1. Email verification
		console.log("\n[1/3] Sending email verification...");
		await sendEmail({
			to: targetEmail,
			subject: "Test: Verify your email - Thistle",
			html: verifyEmailTemplate({
				name: "Test User",
				code: "123456",
				token: "test-token-abc123",
			}),
		});
		console.log("✓ Email verification sent");

		// 2. Password reset
		console.log("\n[2/3] Sending password reset...");
		await sendEmail({
			to: targetEmail,
			subject: "Test: Reset your password - Thistle",
			html: passwordResetTemplate({
				name: "Test User",
				resetLink: "https://thistle.app/reset-password?token=test-token-xyz789",
			}),
		});
		console.log("✓ Password reset sent");

		// 3. Transcription complete
		console.log("\n[3/3] Sending transcription complete...");
		await sendEmail({
			to: targetEmail,
			subject: "Test: Transcription complete - Thistle",
			html: transcriptionCompleteTemplate({
				name: "Test User",
				originalFilename: "lecture-2024-11-22.m4a",
				transcriptLink: "https://thistle.app/transcriptions/123",
				className: "Introduction to Computer Science",
			}),
		});
		console.log("✓ Transcription complete sent");

		console.log("\n✅ All test emails sent successfully!");
	} catch (error) {
		console.error("\n❌ Error sending emails:", error);
		process.exit(1);
	}
}

sendTestEmails();
