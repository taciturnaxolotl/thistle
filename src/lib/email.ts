/**
 * Email service using MailChannels API
 * Docs: https://api.mailchannels.net/tx/v1/documentation
 */

interface EmailAddress {
	email: string;
	name?: string;
}

interface EmailContent {
	type: "text/plain" | "text/html";
	value: string;
}

interface SendEmailOptions {
	to: string | EmailAddress;
	subject: string;
	html?: string;
	text?: string;
	replyTo?: string;
}

/**
 * Send an email via MailChannels
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
	const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@thistle.app";
	const fromName = process.env.SMTP_FROM_NAME || "Thistle";
	const dkimDomain = process.env.DKIM_DOMAIN || "thistle.app";
	// Validated at startup
	const dkimPrivateKey = process.env.DKIM_PRIVATE_KEY as string;
	const mailchannelsApiKey = process.env.MAILCHANNELS_API_KEY as string;

	// Normalize recipient
	const recipient =
		typeof options.to === "string" ? { email: options.to } : options.to;

	// Build content array
	const content: EmailContent[] = [];
	if (options.text) {
		content.push({ type: "text/plain", value: options.text });
	}
	if (options.html) {
		content.push({ type: "text/html", value: options.html });
	}

	if (content.length === 0) {
		throw new Error("At least one of 'text' or 'html' must be provided");
	}

	const payload = {
		personalizations: [
			{
				to: [recipient],
				...(options.replyTo && {
					reply_to: { email: options.replyTo },
				}),
				dkim_domain: dkimDomain,
				dkim_selector: "mailchannels",
				dkim_private_key: dkimPrivateKey,
			},
		],
		from: {
			email: fromEmail,
			name: fromName,
		},
		subject: options.subject,
		content,
	};

	const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Api-Key": mailchannelsApiKey,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`MailChannels API error (${response.status}): ${errorText}`,
		);
	}

	console.log(`[Email] Sent "${options.subject}" to ${recipient.email}`);
}
