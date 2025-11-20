import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { UAParser } from "ua-parser-js";
import { hashPasswordClient } from "../lib/client-auth";
import { isPasskeySupported, registerPasskey } from "../lib/client-passkey";

interface User {
	email: string;
	name: string | null;
	avatar: string;
	created_at: number;
}

interface Session {
	id: string;
	ip_address: string | null;
	user_agent: string | null;
	created_at: number;
	expires_at: number;
	is_current: boolean;
}

interface Passkey {
	id: string;
	name: string | null;
	created_at: number;
	last_used_at: number | null;
}

interface Subscription {
	id: string;
	status: string;
	current_period_start: number | null;
	current_period_end: number | null;
	cancel_at_period_end: number;
	canceled_at: number | null;
}

type SettingsPage = "account" | "sessions" | "passkeys" | "billing" | "danger";

@customElement("user-settings")
export class UserSettings extends LitElement {
	@state() user: User | null = null;
	@state() sessions: Session[] = [];
	@state() passkeys: Passkey[] = [];
	@state() subscription: Subscription | null = null;
	@state() loading = true;
	@state() loadingSessions = true;
	@state() loadingPasskeys = true;
	@state() loadingSubscription = true;
	@state() error = "";
	@state() showDeleteConfirm = false;
	@state() currentPage: SettingsPage = "account";
	@state() editingEmail = false;
	@state() editingPassword = false;
	@state() newEmail = "";
	@state() newPassword = "";
	@state() newName = "";
	@state() newAvatar = "";
	@state() passkeySupported = false;
	@state() addingPasskey = false;

	static override styles = css`
		:host {
			display: block;
		}

		.settings-container {
			max-width: 80rem;
			margin: 0 auto;
			padding: 2rem;
		}

		h1 {
			margin-bottom: 1rem;
			color: var(--text);
		}

		.tabs {
			display: flex;
			gap: 1rem;
			border-bottom: 2px solid var(--secondary);
			margin-bottom: 2rem;
		}

		.tab {
			padding: 0.75rem 1.5rem;
			border: none;
			background: transparent;
			color: var(--text);
			cursor: pointer;
			font-size: 1rem;
			font-weight: 500;
			font-family: inherit;
			border-bottom: 2px solid transparent;
			margin-bottom: -2px;
			transition: all 0.2s;
		}

		.tab:hover {
			color: var(--primary);
		}

		.tab.active {
			color: var(--primary);
			border-bottom-color: var(--primary);
		}

		.tab-content {
			display: none;
		}

		.tab-content.active {
			display: block;
		}

		.content-inner {
			max-width: 56rem;
		}

		.section {
			background: var(--background);
			border: 1px solid var(--secondary);
			border-radius: 12px;
			padding: 2rem;
			margin-bottom: 2rem;
		}

		.section-title {
			font-size: 1.25rem;
			font-weight: 600;
			color: var(--text);
			margin: 0 0 1.5rem 0;
		}

		.field-group {
			margin-bottom: 1.5rem;
		}

		.field-group:last-child {
			margin-bottom: 0;
		}

		.field-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 1rem;
		}

		.field-label {
			font-weight: 500;
			color: var(--text);
			font-size: 0.875rem;
			margin-bottom: 0.5rem;
			display: block;
		}

		.field-value {
			font-size: 1rem;
			color: var(--text);
			opacity: 0.8;
		}

		.change-link {
			background: none;
			border: 1px solid var(--secondary);
			color: var(--text);
			font-size: 0.875rem;
			font-weight: 500;
			cursor: pointer;
			padding: 0.25rem 0.75rem;
			border-radius: 6px;
			font-family: inherit;
			transition: all 0.2s;
		}

		.change-link:hover {
			border-color: var(--primary);
			color: var(--primary);
		}

		.btn {
			padding: 0.75rem 1.5rem;
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s;
			font-family: inherit;
			border: 2px solid transparent;
		}

		.btn-rejection {
			background: transparent;
			color: var(--accent);
			border-color: var(--accent);
		}

		.btn-rejection:hover {
			background: var(--accent);
			color: white;
		}

		.btn-affirmative {
			background: var(--primary);
			color: white;
			border-color: var(--primary);
		}

		.btn-affirmative:hover:not(:disabled) {
			background: transparent;
			color: var(--primary);
		}

		.btn-success {
			background: var(--success);
			color: white;
			border-color: var(--success);
		}

		.btn-success:hover:not(:disabled) {
			background: transparent;
			color: var(--success);
		}

		.btn-small {
			padding: 0.5rem 1rem;
			font-size: 0.875rem;
		}

		.avatar-container:hover .avatar-overlay {
			opacity: 1;
		}

		.avatar-overlay {
			position: absolute;
			top: 0;
			left: 0;
			width: 48px;
			height: 48px;
			background: rgba(0, 0, 0, 0.2);
			border-radius: 50%;
			border: 2px solid transparent;
			display: flex;
			align-items: center;
			justify-content: center;
			opacity: 0;
			cursor: pointer;
		}

		.reload-symbol {
			font-size: 18px;
			color: white;
			transform: rotate(79deg) translate(0px, -2px);
		}

		.profile-row {
			display: flex;
			align-items: center;
			gap: 1rem;
		}

		.avatar-container {
			position: relative;
		}

		.field-description {
			font-size: 0.875rem;
			color: var(--paynes-gray);
			margin: 0.5rem 0;
		}

		.danger-section {
			border-color: var(--accent);
		}

		.danger-section .section-title {
			color: var(--accent);
		}

		.danger-text {
			color: var(--text);
			opacity: 0.7;
			margin-bottom: 1.5rem;
			line-height: 1.5;
		}

		.session-list {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.session-card {
			background: var(--background);
			border: 1px solid var(--secondary);
			border-radius: 8px;
			padding: 1.25rem;
		}

		.session-card.current {
			border-color: var(--accent);
			background: rgba(239, 131, 84, 0.03);
		}

		.session-header {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			margin-bottom: 1rem;
		}

		.session-title {
			font-weight: 600;
			color: var(--text);
		}

		.current-badge {
			display: inline-block;
			background: var(--accent);
			color: white;
			padding: 0.25rem 0.5rem;
			border-radius: 4px;
			font-size: 0.75rem;
			font-weight: 600;
		}

		.session-details {
			display: grid;
			gap: 0.75rem;
		}

		.session-row {
			display: grid;
			grid-template-columns: 100px 1fr;
			gap: 1rem;
		}

		.session-label {
			font-weight: 500;
			color: var(--text);
			opacity: 0.6;
			font-size: 0.875rem;
		}

		.session-value {
			color: var(--text);
			font-size: 0.875rem;
		}

		.user-agent {
			font-family: monospace;
			word-break: break-all;
		}

		.field-input {
			padding: 0.5rem;
			border: 1px solid var(--secondary);
			border-radius: 6px;
			font-family: inherit;
			font-size: 1rem;
			color: var(--text);
			background: var(--background);
			flex: 1;
		}

		.field-input:focus {
			outline: none;
			border-color: var(--primary);
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
		}

		.modal {
			background: var(--background);
			border: 2px solid var(--accent);
			border-radius: 12px;
			padding: 2rem;
			max-width: 400px;
			width: 90%;
		}

		.modal h3 {
			margin-top: 0;
			color: var(--accent);
		}

		.modal-actions {
			display: flex;
			gap: 0.5rem;
			margin-top: 1.5rem;
		}

		.btn-neutral {
			background: transparent;
			color: var(--text);
			border-color: var(--secondary);
		}

		.btn-neutral:hover {
			border-color: var(--primary);
			color: var(--primary);
		}

		.error {
			color: var(--accent);
		}

		.loading {
			text-align: center;
			color: var(--text);
			padding: 2rem;
		}

		@media (max-width: 768px) {
			.settings-container {
				padding: 1rem;
			}

			.tabs {
				overflow-x: auto;
			}

			.tab {
				white-space: nowrap;
			}

			.content-inner {
				padding: 0;
			}
		}
	`;

	override async connectedCallback() {
		super.connectedCallback();
		this.passkeySupported = isPasskeySupported();
		
		// Check for tab query parameter
		const params = new URLSearchParams(window.location.search);
		const tab = params.get("tab");
		if (tab && this.isValidTab(tab)) {
			this.currentPage = tab as SettingsPage;
		}
		
		await this.loadUser();
		await this.loadSessions();
		await this.loadSubscription();
		if (this.passkeySupported) {
			await this.loadPasskeys();
		}
	}

	private isValidTab(tab: string): boolean {
		return ["account", "sessions", "passkeys", "billing", "danger"].includes(tab);
	}

	private setTab(tab: SettingsPage) {
		this.currentPage = tab;
		// Update URL without reloading page
		const url = new URL(window.location.href);
		url.searchParams.set("tab", tab);
		window.history.pushState({}, "", url);
	}

	async loadUser() {
		try {
			const response = await fetch("/api/auth/me");

			if (!response.ok) {
				window.location.href = "/";
				return;
			}

			this.user = await response.json();
		} finally {
			this.loading = false;
		}
	}

	async loadSessions() {
		try {
			const response = await fetch("/api/sessions");

			if (response.ok) {
				const data = await response.json();
				this.sessions = data.sessions;
			}
		} finally {
			this.loadingSessions = false;
		}
	}

	async loadPasskeys() {
		try {
			const response = await fetch("/api/passkeys");

			if (response.ok) {
				const data = await response.json();
				this.passkeys = data.passkeys;
			}
		} finally {
			this.loadingPasskeys = false;
		}
	}

	async loadSubscription() {
		try {
			const response = await fetch("/api/billing/subscription");

			if (response.ok) {
				const data = await response.json();
				this.subscription = data.subscription;
			}
		} finally {
			this.loadingSubscription = false;
		}
	}

	async handleAddPasskey() {
		this.addingPasskey = true;
		this.error = "";

		try {
			const name = prompt("Name this passkey (optional):");
			if (name === null) {
				// User cancelled
				return;
			}

			const result = await registerPasskey(name || undefined);

			if (!result.success) {
				this.error = result.error || "Failed to register passkey";
				return;
			}

			// Reload passkeys
			await this.loadPasskeys();
		} finally {
			this.addingPasskey = false;
		}
	}

	async handleDeletePasskey(passkeyId: string) {
		if (!confirm("Are you sure you want to delete this passkey?")) {
			return;
		}

		try {
			const response = await fetch(`/api/passkeys/${passkeyId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const error = await response.json();
				this.error = error.error || "Failed to delete passkey";
				return;
			}

			// Reload passkeys
			await this.loadPasskeys();
		} catch {
			this.error = "Failed to delete passkey";
		}
	}

	async handleLogout() {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			window.location.href = "/";
		} catch {
			this.error = "Failed to logout";
		}
	}

	async handleDeleteAccount() {
		try {
			const response = await fetch("/api/auth/delete-account", {
				method: "DELETE",
			});

			if (!response.ok) {
				this.error = "Failed to delete account";
				return;
			}

			window.location.href = "/";
		} catch {
			this.error = "Failed to delete account";
		} finally {
			this.showDeleteConfirm = false;
		}
	}

	async handleUpdateEmail() {
		if (!this.newEmail) {
			this.error = "Email required";
			return;
		}

		try {
			const response = await fetch("/api/user/email", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: this.newEmail }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to update email";
				return;
			}

			// Reload user data
			await this.loadUser();
			this.editingEmail = false;
			this.newEmail = "";
		} catch {
			this.error = "Failed to update email";
		}
	}

	async handleUpdatePassword() {
		if (!this.newPassword) {
			this.error = "Password required";
			return;
		}

		if (this.newPassword.length < 8) {
			this.error = "Password must be at least 8 characters";
			return;
		}

		try {
			// Hash password client-side before sending
			const passwordHash = await hashPasswordClient(
				this.newPassword,
				this.user?.email ?? "",
			);

			const response = await fetch("/api/user/password", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: passwordHash }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to update password";
				return;
			}

			this.editingPassword = false;
			this.newPassword = "";
		} catch {
			this.error = "Failed to update password";
		}
	}

	async handleUpdateName() {
		if (!this.newName) {
			this.error = "Name required";
			return;
		}

		try {
			const response = await fetch("/api/user/name", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: this.newName }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to update name";
				return;
			}

			// Reload user data
			await this.loadUser();
			this.newName = "";
		} catch {
			this.error = "Failed to update name";
		}
	}

	async handleUpdateAvatar() {
		if (!this.newAvatar) {
			this.error = "Avatar required";
			return;
		}

		try {
			const response = await fetch("/api/user/avatar", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ avatar: this.newAvatar }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to update avatar";
				return;
			}

			// Reload user data
			await this.loadUser();
			this.newAvatar = "";
		} catch {
			this.error = "Failed to update avatar";
		}
	}

	async handleCreateCheckout() {
		this.loading = true;
		this.error = "";

		try {
			const response = await fetch("/api/billing/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to create checkout session";
				return;
			}

			const { url } = await response.json();
			window.open(url, "_blank");
		} catch {
			this.error = "Failed to create checkout session";
		} finally {
			this.loading = false;
		}
	}

	async handleOpenPortal() {
		this.loading = true;
		this.error = "";

		try {
			const response = await fetch("/api/billing/portal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to open customer portal";
				return;
			}

			const { url } = await response.json();
			window.open(url, "_blank");
		} catch {
			this.error = "Failed to open customer portal";
		} finally {
			this.loading = false;
		}
	}

	generateRandomAvatar() {
		// Generate a random string for the avatar
		const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
		let result = "";
		for (let i = 0; i < 8; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		this.newAvatar = result;
		this.handleUpdateAvatar();
	}

	formatDate(timestamp: number, future = false): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diff = Math.abs(now.getTime() - date.getTime());

		// For future dates (like expiration)
		if (future || date > now) {
			// Less than a day
			if (diff < 24 * 60 * 60 * 1000) {
				const hours = Math.floor(diff / (60 * 60 * 1000));
				return `in ${hours} hour${hours === 1 ? "" : "s"}`;
			}

			// Less than a week
			if (diff < 7 * 24 * 60 * 60 * 1000) {
				const days = Math.floor(diff / (24 * 60 * 60 * 1000));
				return `in ${days} day${days === 1 ? "" : "s"}`;
			}

			// Show full date
			return date.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
			});
		}

		// For past dates
		// Less than a minute
		if (diff < 60 * 1000) {
			return "Just now";
		}

		// Less than an hour
		if (diff < 60 * 60 * 1000) {
			const minutes = Math.floor(diff / (60 * 1000));
			return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
		}

		// Less than a day
		if (diff < 24 * 60 * 60 * 1000) {
			const hours = Math.floor(diff / (60 * 60 * 1000));
			return `${hours} hour${hours === 1 ? "" : "s"} ago`;
		}

		// Less than a week
		if (diff < 7 * 24 * 60 * 60 * 1000) {
			const days = Math.floor(diff / (24 * 60 * 60 * 1000));
			return `${days} day${days === 1 ? "" : "s"} ago`;
		}

		// Show full date
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		});
	}

	async handleKillSession(sessionId: string) {
		try {
			const response = await fetch(`/api/sessions`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to kill session";
				return;
			}

			// Reload sessions
			await this.loadSessions();
		} catch {
			this.error = "Failed to kill session";
		}
	}

	parseUserAgent(userAgent: string | null): string {
		if (!userAgent) return "Unknown";

		const parser = new UAParser(userAgent);
		const result = parser.getResult();

		const browser = result.browser.name
			? `${result.browser.name}${result.browser.version ? ` ${result.browser.version}` : ""}`
			: "";
		const os = result.os.name
			? `${result.os.name}${result.os.version ? ` ${result.os.version}` : ""}`
			: "";

		if (browser && os) {
			return `${browser} on ${os}`;
		}
		if (browser) return browser;
		if (os) return os;

		return userAgent;
	}

	renderAccountPage() {
		if (!this.user) return html``;

		const createdDate = new Date(
			this.user.created_at * 1000,
		).toLocaleDateString();

		return html`
			<div class="content-inner">
			<div class="section">
				<h2 class="section-title">Profile Information</h2>

				<div class="field-group">
				<div class="profile-row">
				<div class="avatar-container">
				<img
				src="https://hostedboringavatars.vercel.app/api/marble?size=48&name=${this.user.avatar}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
				alt="Avatar"
				style="border-radius: 50%; width: 48px; height: 48px; border: 2px solid var(--secondary); cursor: pointer;"
				@click=${this.generateRandomAvatar}
				/>
				<div class="avatar-overlay" @click=${this.generateRandomAvatar}>
				<span class="reload-symbol">↻</span>
				</div>
				</div>
				<input
				type="text"
				class="field-input"
				style="flex: 1;"
				.value=${this.user.name ?? ""}
				@input=${(e: Event) => {
					this.newName = (e.target as HTMLInputElement).value;
				}}
				@blur=${() => {
					if (this.newName && this.newName !== (this.user?.name ?? "")) {
						this.handleUpdateName();
					}
				}}
				placeholder="Your name"
				/>
				</div>
				</div>

				<div class="field-group">
					<label class="field-label">Email</label>
					${
						this.editingEmail
							? html`
							<div style="display: flex; gap: 0.5rem; align-items: center;">
								<input
									type="email"
									class="field-input"
									.value=${this.newEmail}
									@input=${(e: Event) => {
										this.newEmail = (e.target as HTMLInputElement).value;
									}}
									placeholder=${this.user.email}
								/>
								<button
									class="btn btn-affirmative btn-small"
									@click=${this.handleUpdateEmail}
								>
									Save
								</button>
								<button
									class="btn btn-neutral btn-small"
									@click=${() => {
										this.editingEmail = false;
										this.newEmail = "";
									}}
								>
									Cancel
								</button>
							</div>
						  `
							: html`
							<div class="field-row">
								<div class="field-value">${this.user.email}</div>
								<button
									class="change-link"
									@click=${() => {
										this.editingEmail = true;
										this.newEmail = this.user?.email ?? "";
									}}
								>
									Change
								</button>
							</div>
						  `
					}
				</div>

				<div class="field-group">
					<label class="field-label">Password</label>
					${
						this.editingPassword
							? html`
							<div style="display: flex; gap: 0.5rem; align-items: center;">
								<input
									type="password"
									class="field-input"
									.value=${this.newPassword}
									@input=${(e: Event) => {
										this.newPassword = (e.target as HTMLInputElement).value;
									}}
									placeholder="New password"
								/>
								<button
									class="btn btn-affirmative btn-small"
									@click=${this.handleUpdatePassword}
								>
									Save
								</button>
								<button
									class="btn btn-neutral btn-small"
									@click=${() => {
										this.editingPassword = false;
										this.newPassword = "";
									}}
								>
									Cancel
								</button>
							</div>
						  `
							: html`
							<div class="field-row">
								<div class="field-value">••••••••</div>
								<button
									class="change-link"
									@click=${() => {
										this.editingPassword = true;
									}}
								>
									Change
								</button>
							</div>
						  `
					}
				</div>

			${
				this.passkeySupported
					? html`
						<div class="field-group">
							<label class="field-label">Passkeys</label>
							<p class="field-description">
								Passkeys provide a more secure and convenient way to sign in without passwords. 
								They use biometric authentication or your device's security features.
							</p>
							${
								this.loadingPasskeys
									? html`<div class="field-value">Loading passkeys...</div>`
									: this.passkeys.length === 0
										? html`<div class="field-value" style="color: var(--paynes-gray);">No passkeys registered yet</div>`
										: html`
											<div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
												${this.passkeys.map(
													(passkey) => html`
														<div class="session-card">
															<div class="session-details">
																<div class="session-row">
																	<span class="session-label">Name</span>
																	<span class="session-value">${passkey.name || "Unnamed passkey"}</span>
																</div>
																<div class="session-row">
																	<span class="session-label">Created</span>
																	<span class="session-value">${new Date(passkey.created_at * 1000).toLocaleDateString()}</span>
																</div>
																${
																	passkey.last_used_at
																		? html`
																			<div class="session-row">
																				<span class="session-label">Last used</span>
																				<span class="session-value">${new Date(passkey.last_used_at * 1000).toLocaleDateString()}</span>
																			</div>
																		  `
																		: ""
																}
															</div>
															<button
																class="btn btn-rejection btn-small"
																@click=${() => this.handleDeletePasskey(passkey.id)}
																style="margin-top: 0.75rem;"
															>
																Delete
															</button>
														</div>
													`,
												)}
											</div>
										  `
							}
							<button
								class="btn btn-affirmative"
								style="margin-top: 1rem;"
								@click=${this.handleAddPasskey}
								?disabled=${this.addingPasskey}
							>
								${this.addingPasskey ? "Adding..." : "Add Passkey"}
							</button>
						</div>
					  `
					: ""
			}

				<div class="field-group">
					<label class="field-label">Member Since</label>
					<div class="field-value">${createdDate}</div>
				</div>
			</div>
			</div>
		`;
	}

	renderSessionsPage() {
		return html`
			<div class="content-inner">
			<div class="section">
				<h2 class="section-title">Active Sessions</h2>
				${
					this.loadingSessions
						? html`<div class="loading">Loading sessions...</div>`
						: this.sessions.length === 0
							? html`<p>No active sessions</p>`
							: html`
								<div class="session-list">
									${this.sessions.map(
										(session) => html`
											<div class="session-card ${session.is_current ? "current" : ""}">
												<div class="session-header">
													<span class="session-title">Session</span>
													${session.is_current ? html`<span class="current-badge">Current</span>` : ""}
												</div>
												<div class="session-details">
												<div class="session-row">
												<span class="session-label">IP Address</span>
												<span class="session-value">${session.ip_address ?? "Unknown"}</span>
												</div>
												<div class="session-row">
												<span class="session-label">Device</span>
												<span class="session-value">${this.parseUserAgent(session.user_agent)}</span>
												</div>
												<div class="session-row">
												<span class="session-label">Created</span>
												<span class="session-value">${this.formatDate(session.created_at)}</span>
												</div>
												<div class="session-row">
												<span class="session-label">Expires</span>
												<span class="session-value">${this.formatDate(session.expires_at, true)}</span>
												</div>
												</div>
												<div style="margin-top: 1rem;">
												${
													session.is_current
														? html`
												<button
												 class="btn btn-rejection"
												 @click=${this.handleLogout}
												 >
												 Logout
												 </button>
												 `
														: html`
												    <button
												class="btn btn-rejection"
												@click=${() => this.handleKillSession(session.id)}
											>
												Kill Session
											</button>
										  `
												}
							</div>
											</div>
										`,
									)}
								</div>
							  `
				}
			</div>
			</div>
		`;
	}

	renderBillingPage() {
		if (this.loadingSubscription) {
			return html`
				<div class="content-inner">
					<div class="section">
						<div class="loading">Loading subscription...</div>
					</div>
				</div>
			`;
		}

		const hasActiveSubscription = this.subscription && (
			this.subscription.status === "active" || 
			this.subscription.status === "trialing"
		);

		if (this.subscription && !hasActiveSubscription) {
			// Has a subscription but it's not active (canceled, expired, etc.)
			const statusColor = 
				this.subscription.status === "canceled" ? "var(--accent)" :
				"var(--secondary)";

			return html`
				<div class="content-inner">
					<div class="section">
						<h2 class="section-title">Subscription</h2>
						
						<div class="field-group">
							<label class="field-label">Status</label>
							<div style="display: flex; align-items: center; gap: 0.75rem;">
								<span style="
									display: inline-block;
									padding: 0.25rem 0.75rem;
									border-radius: 4px;
									background: ${statusColor};
									color: var(--white);
									font-size: 0.875rem;
									font-weight: 600;
									text-transform: uppercase;
								">
									${this.subscription.status}
								</span>
							</div>
						</div>

						${this.subscription.canceled_at ? html`
							<div class="field-group">
								<label class="field-label">Canceled At</label>
								<div class="field-value" style="color: var(--accent);">
									${this.formatDate(this.subscription.canceled_at)}
								</div>
							</div>
						` : ""}

						<div class="field-group" style="margin-top: 2rem;">
							<button
								class="btn btn-success"
								@click=${this.handleCreateCheckout}
								?disabled=${this.loading}
							>
								${this.loading ? "Loading..." : "Activate Your Subscription"}
							</button>
							<p class="field-description" style="margin-top: 0.75rem;">
								Reactivate your subscription to unlock unlimited transcriptions.
							</p>
						</div>

						${this.error ? html`<p class="error" style="margin-top: 1rem;">${this.error}</p>` : ""}
					</div>
				</div>
			`;
		}

		if (hasActiveSubscription) {
			return html`
				<div class="content-inner">
					<div class="section">
						<h2 class="section-title">Subscription</h2>
						
						<div class="field-group">
							<label class="field-label">Status</label>
							<div style="display: flex; align-items: center; gap: 0.75rem;">
								<span style="
									display: inline-block;
									padding: 0.25rem 0.75rem;
									border-radius: 4px;
									background: var(--success);
									color: var(--white);
									font-size: 0.875rem;
									font-weight: 600;
									text-transform: uppercase;
								">
									${this.subscription.status}
								</span>
								${this.subscription.cancel_at_period_end ? html`
									<span style="color: var(--accent); font-size: 0.875rem;">
										(Cancels at end of period)
									</span>
								` : ""}
							</div>
						</div>

						${this.subscription.current_period_start && this.subscription.current_period_end ? html`
							<div class="field-group">
								<label class="field-label">Current Period</label>
								<div class="field-value">
									${this.formatDate(this.subscription.current_period_start)} - 
									${this.formatDate(this.subscription.current_period_end)}
								</div>
							</div>
						` : ""}

						<div class="field-group" style="margin-top: 2rem;">
							<button
								class="btn btn-affirmative"
								@click=${this.handleOpenPortal}
								?disabled=${this.loading}
							>
								${this.loading ? "Loading..." : "Manage Subscription"}
							</button>
							<p class="field-description" style="margin-top: 0.75rem;">
								Opens the customer portal where you can update payment methods, view invoices, and manage your subscription.
							</p>
						</div>

						${this.error ? html`<p class="error" style="margin-top: 1rem;">${this.error}</p>` : ""}
					</div>
				</div>
			`;
		}

		return html`
			<div class="content-inner">
				<div class="section">
					<h2 class="section-title">Billing & Subscription</h2>
					<p class="field-description" style="margin-bottom: 1.5rem;">
						Activate your subscription to unlock unlimited transcriptions. Note: We currently offer a single subscription tier.
					</p>
					<button
						class="btn btn-success"
						@click=${this.handleCreateCheckout}
						?disabled=${this.loading}
					>
						${this.loading ? "Loading..." : "Activate Your Subscription"}
					</button>
					${this.error ? html`<p class="error" style="margin-top: 1rem;">${this.error}</p>` : ""}
				</div>
			</div>
		`;
	}

	renderDangerPage() {
		return html`
			<div class="content-inner">
			<div class="section danger-section">
				<h2 class="section-title">Delete Account</h2>
				<p class="danger-text">
					Once you delete your account, there is no going back. This will
					permanently delete your account and all associated data.
				</p>
				<button
					class="btn btn-rejection"
					@click=${() => {
						this.showDeleteConfirm = true;
					}}
				>
					Delete Account
				</button>
			</div>
			</div>
		`;
	}

	override render() {
		if (this.loading) {
			return html`<div class="loading">Loading...</div>`;
		}

		if (this.error) {
			return html`<div class="error">${this.error}</div>`;
		}

		if (!this.user) {
			return html`<div class="error">No user data available</div>`;
		}

		return html`
			<div class="settings-container">
				<h1>Settings</h1>

				<div class="tabs">
					<button
						class="tab ${this.currentPage === "account" ? "active" : ""}"
						@click=${() => {
							this.setTab("account");
						}}
					>
						Account
					</button>
					<button
						class="tab ${this.currentPage === "sessions" ? "active" : ""}"
						@click=${() => {
							this.setTab("sessions");
						}}
					>
						Sessions
					</button>
					<button
						class="tab ${this.currentPage === "billing" ? "active" : ""}"
						@click=${() => {
							this.setTab("billing");
						}}
					>
						Billing
					</button>
					<button
						class="tab ${this.currentPage === "danger" ? "active" : ""}"
						@click=${() => {
							this.setTab("danger");
						}}
					>
						Danger Zone
					</button>
				</div>

				${this.currentPage === "account" ? this.renderAccountPage() : ""}
				${this.currentPage === "sessions" ? this.renderSessionsPage() : ""}
				${this.currentPage === "billing" ? this.renderBillingPage() : ""}
				${this.currentPage === "danger" ? this.renderDangerPage() : ""}
			</div>

			${
				this.showDeleteConfirm
					? html`
						<div
							class="modal-overlay"
							@click=${() => {
								this.showDeleteConfirm = false;
							}}
						>
							<div class="modal" @click=${(e: Event) => e.stopPropagation()}>
								<h3>Delete Account</h3>
								<p>
									Are you absolutely sure? This action cannot be undone. All your data will be
									permanently deleted.
								</p>
								<div class="modal-actions">
									<button class="btn btn-rejection" @click=${this.handleDeleteAccount}>
										Yes, Delete My Account
									</button>
									<button
										class="btn btn-neutral"
										@click=${() => {
											this.showDeleteConfirm = false;
										}}
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
				  `
					: ""
			}
		`;
	}
}
