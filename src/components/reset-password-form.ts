import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { hashPasswordClient } from "../lib/client-auth";

@customElement("reset-password-form")
export class ResetPasswordForm extends LitElement {
	@property({ type: String }) token: string | null = null;
	@state() private email: string | null = null;
	@state() private password = "";
	@state() private confirmPassword = "";
	@state() private error = "";
	@state() private isSubmitting = false;
	@state() private isSuccess = false;
	@state() private isLoadingEmail = false;

	static override styles = css`
		:host {
			display: block;
		}

		.reset-card {
			background: var(--background);
			border: 2px solid var(--secondary);
			border-radius: 12px;
			padding: 2.5rem;
			max-width: 25rem;
			width: 100%;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		}

		.reset-title {
			margin-top: 0;
			margin-bottom: 2rem;
			color: var(--text);
			text-align: center;
			font-size: 1.75rem;
		}

		.form-group {
			margin-bottom: 1.5rem;
		}

		label {
			display: block;
			margin-bottom: 0.25rem;
			font-weight: 500;
			color: var(--text);
			font-size: 0.875rem;
		}

		input {
			width: 100%;
			padding: 0.75rem;
			border: 2px solid var(--secondary);
			border-radius: 6px;
			font-size: 1rem;
			font-family: inherit;
			background: var(--background);
			color: var(--text);
			transition: all 0.2s;
			box-sizing: border-box;
		}

		input::placeholder {
			color: var(--secondary);
			opacity: 1;
		}

		input:focus {
			outline: none;
			border-color: var(--primary);
		}

		.error-banner {
			background: #fecaca;
			border: 2px solid rgba(220, 38, 38, 0.8);
			border-radius: 6px;
			padding: 1rem;
			margin-bottom: 1rem;
			color: #dc2626;
			font-weight: 500;
		}

		.btn-primary {
			width: 100%;
			padding: 0.75rem 1.5rem;
			border: 2px solid var(--primary);
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s;
			font-family: inherit;
			background: var(--primary);
			color: white;
			margin-top: 0.5rem;
		}

		.btn-primary:hover:not(:disabled) {
			background: transparent;
			color: var(--primary);
		}

		.btn-primary:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.back-link {
			display: block;
			text-align: center;
			margin-top: 1.5rem;
			color: var(--primary);
			text-decoration: none;
			font-weight: 500;
			font-size: 0.875rem;
			transition: all 0.2s;
		}

		.back-link:hover {
			color: var(--accent);
		}

		.success-message {
			text-align: center;
		}

		.success-icon {
			font-size: 3rem;
			margin-bottom: 1rem;
		}

		.success-text {
			color: var(--primary);
			font-size: 1.25rem;
			font-weight: 500;
			margin-bottom: 1.5rem;
		}

		.success-link {
			display: inline-block;
			padding: 0.75rem 1.5rem;
			background: var(--accent);
			color: white;
			text-decoration: none;
			border-radius: 6px;
			font-weight: 500;
			transition: all 0.2s;
		}

		.success-link:hover {
			background: var(--primary);
		}
	`;

	override async updated(changedProperties: Map<string, unknown>) {
		super.updated(changedProperties);

		// When token property changes and we don't have email yet, load it
		if (
			changedProperties.has("token") &&
			this.token &&
			!this.email &&
			!this.isLoadingEmail
		) {
			await this.loadEmail();
		}
	}

	private async loadEmail() {
		this.isLoadingEmail = true;
		this.error = "";

		try {
			const url = `/api/auth/reset-password?token=${encodeURIComponent(this.token || "")}`;
			const response = await fetch(url);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Invalid or expired reset token");
			}

			this.email = data.email;
		} catch (err) {
			this.error =
				err instanceof Error ? err.message : "Failed to verify reset token";
		} finally {
			this.isLoadingEmail = false;
		}
	}

	override render() {
		if (!this.token) {
			return html`
				<div class="reset-card">
					<h1 class="reset-title">Reset Password</h1>
					<div class="error-banner">Invalid or missing reset token</div>
					<a href="/" class="back-link">Back to home</a>
				</div>
			`;
		}

		if (this.isLoadingEmail) {
			return html`
				<div class="reset-card">
					<h1 class="reset-title">Reset Password</h1>
					<p style="text-align: center; color: var(--text);">Verifying reset token...</p>
				</div>
			`;
		}

		if (this.error && !this.email) {
			return html`
				<div class="reset-card">
					<h1 class="reset-title">Reset Password</h1>
					<div class="error-banner">${this.error}</div>
					<a href="/" class="back-link">Back to home</a>
				</div>
			`;
		}

		if (this.isSuccess) {
			return html`
				<div class="reset-card">
					<div class="success-message">
						<div class="success-icon">✓</div>
						<div class="success-text">Password reset successfully!</div>
						<a href="/" class="success-link">Go to home</a>
					</div>
				</div>
			`;
		}

		return html`
			<div class="reset-card">
				<h1 class="reset-title">Reset Password</h1>
				
				<form @submit=${this.handleSubmit}>
					${
						this.error
							? html`<div class="error-banner">${this.error}</div>`
							: ""
					}
					
					<div class="form-group">
						<label for="password">New Password</label>
						<input 
							type="password" 
							id="password" 
							.value=${this.password}
							@input=${(e: Event) => {
								this.password = (e.target as HTMLInputElement).value;
							}}
							required 
							minlength="8"
							placeholder="Enter new password (min 8 characters)"
						>
					</div>
					
					<div class="form-group">
						<label for="confirm-password">Confirm Password</label>
						<input 
							type="password" 
							id="confirm-password" 
							.value=${this.confirmPassword}
							@input=${(e: Event) => {
								this.confirmPassword = (e.target as HTMLInputElement).value;
							}}
							required 
							minlength="8"
							placeholder="Confirm new password"
						>
					</div>
					
					<button type="submit" class="btn-primary" ?disabled=${this.isSubmitting}>
						${this.isSubmitting ? "Resetting..." : "Reset Password"}
					</button>
				</form>
				
				<a href="/" class="back-link">Back to home</a>
			</div>
		`;
	}

	private async handleSubmit(e: Event) {
		e.preventDefault();
		this.error = "";

		// Validate passwords match
		if (this.password !== this.confirmPassword) {
			this.error = "Passwords do not match";
			return;
		}

		// Validate password length
		if (this.password.length < 8) {
			this.error = "Password must be at least 8 characters";
			return;
		}

		this.isSubmitting = true;

		try {
			if (!this.email) {
				throw new Error("Email not loaded");
			}

			// Hash password client-side with user's email
			const hashedPassword = await hashPasswordClient(
				this.password,
				this.email,
			);

			const response = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: this.token, password: hashedPassword }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to reset password");
			}

			// Show success message
			this.isSuccess = true;
		} catch (err) {
			this.error =
				err instanceof Error ? err.message : "Failed to reset password";
		} finally {
			this.isSubmitting = false;
		}
	}
}
