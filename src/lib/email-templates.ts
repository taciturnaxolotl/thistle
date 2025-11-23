/**
 * Email templates for transactional emails
 * Uses inline CSS for maximum email client compatibility
 */

const baseStyles = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    line-height: 1.6;
    color: #2d3142;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  .header {
    text-align: center;
    margin-bottom: 2rem;
  }
  .header h1 {
    color: #2d3142;
    font-size: 1.5rem;
    margin: 0;
  }
  .content {
    background: #ffffff;
    padding: 2rem;
    border-radius: 0.5rem;
    border: 1px solid #bfc0c0;
  }
  .button {
    display: inline-block;
    background-color: #ef8354;
    color: #ffffff;
    text-decoration: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 500;
    font-size: 1rem;
    margin: 1rem 0;
    border: 2px solid #ef8354;
  }
  .footer {
    text-align: center;
    margin-top: 2rem;
    color: #4f5d75;
    font-size: 0.875rem;
  }
  .code {
    background: #f5f5f5;
    border: 1px solid #bfc0c0;
    border-radius: 0.25rem;
    padding: 0.5rem 1rem;
    font-family: 'Courier New', monospace;
    font-size: 1.5rem;
    letter-spacing: 0.25rem;
    text-align: center;
    margin: 1rem 0;
  }
  .info-box {
    background: #f5f5f5;
    border: 1px solid #bfc0c0;
    border-radius: 6px;
    padding: 1.25rem;
    margin: 1rem 0;
  }
  .info-box-label {
    color: #4f5d75;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    margin: 0 0 0.25rem 0;
    font-weight: 600;
  }
  .info-box-value {
    color: #2d3142;
    font-size: 1rem;
    margin: 0;
  }
  .info-box-divider {
    border: 0;
    border-top: 1px solid #bfc0c0;
    margin: 1rem 0;
  }
`;

interface VerifyEmailOptions {
	name: string | null;
	code: string;
	token: string;
}

export function verifyEmailTemplate(options: VerifyEmailOptions): string {
	const greeting = options.name ? `Hi ${options.name}` : "Hi there";
	const origin = process.env.ORIGIN || "http://localhost:3000";
	const verifyLink = `${origin}/api/auth/verify-email?token=${options.token}`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Thistle</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪻 Thistle</h1>
    </div>
    <div class="content">
      <h2>${greeting}!</h2>
      <p>Thanks for signing up for Thistle. Please verify your email address to get started.</p>
      <p><strong>Your verification code is:</strong></p>
      <div class="code">${options.code}</div>
      <p style="color: #4f5d75; font-size: 0.875rem; margin-top: 1rem; margin-bottom: 0.75rem;">
        This code will expire in 24 hours. Enter it in the verification dialog after you login, or click the button below:
      </p>
      <p style="text-align: center; margin-top: 0; margin-bottom: 0.75rem;">
        <a href="${verifyLink}" class="button" style="display: inline-block; background-color: #ef8354; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; font-size: 1rem; margin: 0; border: 2px solid #ef8354;">Verify Email</a>
      </p>
    </div>
    <div class="footer">
      <p>If you didn't create an account, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface PasswordResetOptions {
	name: string | null;
	resetLink: string;
}

export function passwordResetTemplate(options: PasswordResetOptions): string {
	const greeting = options.name ? `Hi ${options.name}` : "Hi there";

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - Thistle</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪻 Thistle</h1>
    </div>
    <div class="content">
      <h2>${greeting}!</h2>
      <p>We received a request to reset your password. Click the button below to create a new password.</p>
      <p style="text-align: center;">
        <a href="${options.resetLink}" class="button" style="display: inline-block; background-color: #ef8354; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; font-size: 1rem; margin: 1rem 0; border: 2px solid #ef8354;">Reset Password</a>
      </p>
      <p style="color: #4f5d75; font-size: 0.875rem;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${options.resetLink}" style="color: #4f5d75; word-break: break-all;">${options.resetLink}</a>
      </p>
      <p style="color: #4f5d75; font-size: 0.875rem;">
        This link will expire in 1 hour.
      </p>
    </div>
    <div class="footer">
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface TranscriptionCompleteOptions {
	name: string | null;
	originalFilename: string;
	transcriptLink: string;
	className?: string;
}

export function transcriptionCompleteTemplate(
	options: TranscriptionCompleteOptions,
): string {
	const greeting = options.name ? `Hi ${options.name}` : "Hi there";

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcription Complete - Thistle</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪻 Thistle</h1>
    </div>
    <div class="content">
      <h2>${greeting}!</h2>
      <p>Your transcription is ready!</p>
      
      <div class="info-box">
        ${
					options.className
						? `
        <p class="info-box-label">Class</p>
        <p class="info-box-value">${options.className}</p>
        <hr class="info-box-divider">
        `
						: ""
				}
        <p class="info-box-label">File</p>
        <p class="info-box-value">${options.originalFilename}</p>
      </div>

      <p style="text-align: center; margin-top: 1.5rem; margin-bottom: 0;">
        <a href="${options.transcriptLink}" class="button" style="display: inline-block; background-color: #ef8354; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; font-size: 1rem; margin: 0; border: 2px solid #ef8354;">View Transcript</a>
      </p>
    </div>
    <div class="footer">
      <p>Thanks for using Thistle!</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface EmailChangeOptions {
	name: string | null;
	currentEmail: string;
	newEmail: string;
	verifyLink: string;
}

export function emailChangeTemplate(options: EmailChangeOptions): string {
	const greeting = options.name ? `Hi ${options.name}` : "Hi there";

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Email Change - Thistle</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪻 Thistle</h1>
    </div>
    <div class="content">
      <h2>${greeting}!</h2>
      <p>You requested to change your email address.</p>
      
      <div class="info-box">
        <p class="info-box-label">Current Email</p>
        <p class="info-box-value">${options.currentEmail}</p>
        <hr class="info-box-divider">
        <p class="info-box-label">New Email</p>
        <p class="info-box-value">${options.newEmail}</p>
      </div>

      <p>Click the button below to confirm this change:</p>

      <p style="text-align: center; margin-top: 1.5rem; margin-bottom: 0;">
        <a href="${options.verifyLink}" class="button" style="display: inline-block; background-color: #ef8354; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; font-size: 1rem; margin: 0; border: 2px solid #ef8354;">Verify Email Change</a>
      </p>

      <p style="color: #4f5d75; font-size: 0.875rem; margin-top: 1.5rem;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${options.verifyLink}" style="color: #4f5d75; word-break: break-all;">${options.verifyLink}</a>
      </p>

      <p style="color: #4f5d75; font-size: 0.875rem;">
        This link will expire in 24 hours.
      </p>
    </div>
    <div class="footer">
      <p>If you didn't request this change, please ignore this email and your email address will remain unchanged.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
