import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { hashPasswordClient } from "../lib/client-auth";
import {
	authenticateWithPasskey,
	isPasskeySupported,
} from "../lib/client-passkey";
import type { PasswordStrength } from "./password-strength";
import "./password-strength";
import type { PasswordStrengthResult } from "./password-strength";

interface User {
	email: string;
	name: string | null;
	avatar: string;
	role?: "user" | "admin";
	has_subscription?: boolean;
}

@customElement("auth-component")
export class AuthComponent extends LitElement {
	@state() user: User | null = null;
	@state() loading = true;
	@state() showModal = false;
	@state() email = "";
	@state() password = "";
	@state() name = "";
	@state() error = "";
	@state() isSubmitting = false;
	@state() needsRegistration = false;
	@state() passwordStrength: PasswordStrengthResult | null = null;
	@state() passkeySupported = false;

	static override styles = css`
		:host {
			display: block;
		}

		.auth-container {
			position: relative;
		}

		.auth-button {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: var(--primary);
			color: white;
			border: 2px solid var(--primary);
			border-radius: 8px;
			cursor: pointer;
			font-size: 1rem;
			font-weight: 500;
			transition: all 0.2s;
			font-family: inherit;
		}

		.auth-button:hover {
			background: transparent;
			color: var(--primary);
		}

		.auth-button:hover .email {
			color: var(--primary);
		}

		.auth-button img {
			transition: all 0.2s;
		}

		.auth-button:hover img {
			opacity: 0.8;
		}

		.user-info {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}

		.email {
			font-weight: 500;
			color: white;
			font-size: 0.875rem;
			transition: all 0.2s;
		}

		.modal-overlay {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 2000;
			padding: 1rem;
		}

		.modal {
			background: var(--background);
			border: 2px solid var(--secondary);
			border-radius: 12px;
			padding: 2rem;
			max-width: 400px;
			width: 100%;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		}

		.modal-title {
			margin-top: 0;
			margin-bottom: 1rem;
			color: var(--text);
		}

		.form-group {
			margin-bottom: 1rem;
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

		.error-message {
			color: var(--accent);
			font-size: 0.875rem;
			margin-top: 1rem;
		}

		button {
			padding: 0.75rem 1.5rem;
			border: 2px solid var(--primary);
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s;
			font-family: inherit;
		}

		button:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.btn-primary {
			background: var(--primary);
			color: white;
			flex: 1;
		}

		.btn-primary:hover:not(:disabled) {
			background: transparent;
			color: var(--primary);
		}

		.btn-neutral {
			background: transparent;
			color: var(--text);
			border-color: var(--secondary);
		}

		.btn-neutral:hover:not(:disabled) {
			border-color: var(--primary);
			color: var(--primary);
		}

		.btn-rejection {
			background: transparent;
			color: var(--accent);
			border-color: var(--accent);
		}

		.btn-rejection:hover:not(:disabled) {
			background: var(--accent);
			color: white;
		}

		.modal-actions {
			display: flex;
			gap: 0.5rem;
			margin-top: 1rem;
		}

		.user-menu {
			position: absolute;
			top: calc(100% + 0.5rem);
			right: 0;
			background: var(--background);
			border: 2px solid var(--secondary);
			border-radius: 8px;
			padding: 0.5rem;
			min-width: 200px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			z-index: 100;
		}

		.user-menu a,
		.user-menu button {
			padding: 0.75rem 1rem;
			background: transparent;
			color: var(--text);
			text-decoration: none;
			border: none;
			border-radius: 6px;
			font-weight: 500;
			text-align: left;
			transition: all 0.2s;
			font-family: inherit;
			font-size: 1rem;
			cursor: pointer;
		}

		.user-menu a:hover,
		.user-menu button:hover {
			background: var(--secondary);
		}

		.admin-link {
			color: #dc2626;
			border: 2px dashed #dc2626 !important;
		}

		.admin-link:hover {
			background: #fee2e2;
			color: #991b1b;
			border-color: #991b1b !important;
		}

		.loading {
			font-size: 0.875rem;
			color: var(--text);
		}

		.info-text {
			color: var(--text);
			font-size: 0.875rem;
			margin: 0;
		}

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		margin: 1.5rem 0;
		color: var(--secondary);
		font-size: 0.875rem;
	}

	.divider::before,
	.divider::after {
		content: "";
		flex: 1;
		border-bottom: 1px solid var(--secondary);
	}

	.divider::before {
		margin-right: 0.5rem;
	}

	.divider::after {
		margin-left: 0.5rem;
	}

	.btn-passkey {
		background: transparent;
		color: var(--primary);
		border-color: var(--primary);
		width: 100%;
		margin-bottom: 0;
	}

	.btn-passkey:hover:not(:disabled) {
		background: var(--primary);
		color: white;
	}
	`;

	override async connectedCallback() {
		super.connectedCallback();
		this.passkeySupported = isPasskeySupported();
		await this.checkAuth();
	}

	async checkAuth() {
		try {
			const response = await fetch("/api/auth/me");

			if (response.ok) {
				this.user = await response.json();
			} else if (window.location.pathname !== "/") {
				window.location.href = "/";
			}
		} finally {
			this.loading = false;
		}
	}

	public isAuthenticated(): boolean {
		return this.user !== null;
	}

	public openAuthModal() {
		this.openModal();
	}

	private openModal() {
		this.showModal = true;
		this.needsRegistration = false;
		this.email = "";
		this.password = "";
		this.name = "";
		this.error = "";
	}

	private closeModal() {
		this.showModal = false;
		this.needsRegistration = false;
		this.email = "";
		this.password = "";
		this.name = "";
		this.error = "";
	}

	private async handleSubmit(e: Event) {
		e.preventDefault();
		this.error = "";
		this.isSubmitting = true;

		try {
			// Hash password client-side with expensive PBKDF2
			const passwordHash = await hashPasswordClient(this.password, this.email);

			if (this.needsRegistration) {
				const response = await fetch("/api/auth/register", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						email: this.email,
						password: passwordHash,
						name: this.name || null,
					}),
				});

				if (!response.ok) {
					const data = await response.json();
					this.error = data.error || "Registration failed";
					return;
				}

				this.user = await response.json();
				this.closeModal();
				await this.checkAuth();
				window.dispatchEvent(new CustomEvent("auth-changed"));
				window.location.href = "/classes";
			} else {
				const response = await fetch("/api/auth/login", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						email: this.email,
						password: passwordHash,
					}),
				});

				if (!response.ok) {
					const data = await response.json();
					if (response.status === 401) {
						this.needsRegistration = true;
						this.error = "";
						return;
					}
					this.error = data.error || "Login failed";
					return;
				}

				this.user = await response.json();
				this.closeModal();
				await this.checkAuth();
				window.dispatchEvent(new CustomEvent("auth-changed"));
				window.location.href = "/classes";
			}
		} catch (error) {
			// Catch crypto.subtle errors and other exceptions
			this.error = error instanceof Error ? error.message : "An error occurred";
		} finally {
			this.isSubmitting = false;
		}
	}

	private async handleLogout() {
		this.showModal = false;
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			this.user = null;
			window.dispatchEvent(new CustomEvent("auth-changed"));
			window.location.href = "/";
		} catch {
			// Silent fail
		}
	}

	private toggleMenu() {
		this.showModal = !this.showModal;
	}

	private handleEmailInput(e: Event) {
		this.email = (e.target as HTMLInputElement).value;
	}

	private handleNameInput(e: Event) {
		this.name = (e.target as HTMLInputElement).value;
	}

	private handlePasswordInput(e: Event) {
		this.password = (e.target as HTMLInputElement).value;
	}

	private handlePasswordBlur() {
		if (!this.needsRegistration) return;

		const strengthComponent = this.shadowRoot?.querySelector(
			"password-strength",
		) as PasswordStrength | null;
		if (strengthComponent && this.password) {
			strengthComponent.checkHIBP(this.password);
		}
	}

	private handleStrengthChange(e: CustomEvent<PasswordStrengthResult>) {
		this.passwordStrength = e.detail;
	}

	private async handlePasskeyLogin() {
		this.error = "";
		this.isSubmitting = true;

		try {
			const result = await authenticateWithPasskey(this.email || undefined);

			if (!result.success) {
				this.error = result.error || "Passkey authentication failed";
				return;
			}

			// Success - reload to get user info
			await this.checkAuth();
			this.closeModal();
			window.dispatchEvent(new CustomEvent("auth-changed"));
			window.location.href = "/classes";
		} finally {
			this.isSubmitting = false;
		}
	}

	override render() {
		if (this.loading) {
			return html`<div class="loading">Loading...</div>`;
		}

		return html`
			<div class="auth-container">
				${
					this.user
						? html`
							<button class="auth-button" @click=${this.toggleMenu}>
								<div class="user-info">
									<img
										src="https://hostedboringavatars.vercel.app/api/marble?size=32&name=${this.user.avatar}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
										alt="Avatar"
										width="32"
										height="32"
										style="border-radius: 50%"
									/>
									<span class="email">${this.user.name ?? this.user.email}</span>
								</div>
							</button>
							${
								this.showModal
									? html`
										<div class="user-menu">
											<a href="/classes" @click=${this.closeModal}>Classes</a>
											<a href="/settings" @click=${this.closeModal}>Settings</a>
											${
												this.user.role === "admin"
													? html`<a href="/admin" @click=${this.closeModal} class="admin-link">Admin</a>`
													: ""
											}
											<button @click=${this.handleLogout}>Logout</button>
										</div>
									`
									: ""
							}
						`
						: html`
							<button class="auth-button" @click=${this.openModal}>
								Sign In
							</button>
						`
				}
			</div>

			${
				this.showModal && !this.user
					? html`
						<div class="modal-overlay" @click=${this.closeModal}>
							<div class="modal" @click=${(e: Event) => e.stopPropagation()}>
								<h2 class="modal-title">
									${this.needsRegistration ? "Create Account" : "Sign In"}
								</h2>

								${
									this.needsRegistration
										? html`
											<p class="info-text">
												Looks like you might not have an account yet. Create one below!
											</p>
										`
										: ""
								}

							${
								!this.needsRegistration && this.passkeySupported
									? html`
										<button
											type="button"
											class="btn-passkey"
											@click=${this.handlePasskeyLogin}
											?disabled=${this.isSubmitting}
										>
											🔑 ${this.isSubmitting ? "Loading..." : "Sign in with Passkey"}
										</button>
										<div class="divider">or sign in with password</div>
									  `
									: ""
							}

								<form @submit=${this.handleSubmit}>
									<div class="form-group">
										<input
											type="email"
											id="email"
											placeholder="heidi@awesome.net"
											.value=${this.email}
											@input=${this.handleEmailInput}
											required
											?disabled=${this.isSubmitting}
										/>
									</div>

									${
										this.needsRegistration
											? html`
												<div class="form-group">
													<label for="name">Name (optional)</label>
													<input
														type="text"
														id="name"
														placeholder="Heidi VanCoolbeans"
														.value=${this.name}
														@input=${this.handleNameInput}
														?disabled=${this.isSubmitting}
													/>
												</div>
											`
											: ""
									}

									<div class="form-group">
										<label for="password">Password</label>
										<input
											type="password"
											id="password"
											placeholder="*************"
											.value=${this.password}
											@input=${this.handlePasswordInput}
											@blur=${this.handlePasswordBlur}
											required
											?disabled=${this.isSubmitting}
										/>
										${
											this.needsRegistration
												? html`<password-strength
														.password=${this.password}
														@strength-change=${this.handleStrengthChange}
													></password-strength>`
												: ""
										}
									</div>

									${
										this.error
											? html`<div class="error-message">${this.error}</div>`
											: ""
									}

									<div class="modal-actions">
										<button
											type="submit"
											class="btn-primary"
											?disabled=${
												this.isSubmitting ||
												(this.passwordStrength?.isChecking ?? false) ||
												(this.needsRegistration &&
													!(this.passwordStrength?.isValid ?? false))
											}
										>
											${
												this.isSubmitting
													? "Loading..."
													: this.needsRegistration
														? "Create Account"
														: "Sign In"
											}
										</button>
										<button
											type="button"
											class="btn-neutral"
											@click=${this.closeModal}
											?disabled=${this.isSubmitting}
										>
											Cancel
										</button>
									</div>
								</form>
							</div>
						</div>
					`
					: ""
			}
		`;
	}
}
