import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface Session {
	id: string;
	user_agent: string;
	ip_address: string;
	created_at: number;
	expires_at: number;
}

interface Passkey {
	id: string;
	name: string;
	created_at: number;
	last_used_at: number | null;
}

interface UserDetails {
	id: string;
	email: string;
	name: string | null;
	role: string;
	created_at: number;
	last_login: number | null;
	transcriptionCount: number;
	hasPassword: boolean;
	sessions: Session[];
	passkeys: Passkey[];
}

@customElement("user-modal")
export class UserModal extends LitElement {
	@property({ type: String }) userId: string | null = null;
	@state() private user: UserDetails | null = null;
	@state() private loading = false;
	@state() private error: string | null = null;

	static override styles = css`
    :host {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    :host([open]) {
      display: flex;
    }

    .modal-content {
      background: var(--background);
      border-radius: 8px;
      max-width: 40rem;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 2px solid var(--secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text);
      margin: 0;
    }

    .modal-close {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text);
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .modal-close:hover {
      background: var(--secondary);
    }

    .modal-body {
      padding: 1.5rem;
    }

    .detail-section {
      margin-bottom: 2rem;
    }

    .detail-section:last-child {
      margin-bottom: 0;
    }

    .detail-section-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--secondary);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--secondary);
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      font-weight: 500;
      color: var(--text);
    }

    .detail-value {
      color: var(--text);
      opacity: 0.8;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-label {
      display: block;
      font-weight: 500;
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .form-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      font-size: 1rem;
      font-family: inherit;
      background: var(--background);
      color: var(--text);
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--gunmetal);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-danger {
      background: #dc2626;
      color: white;
    }

    .btn-danger:hover {
      background: #b91c1c;
    }

    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-small {
      padding: 0.25rem 0.75rem;
      font-size: 0.875rem;
    }

    .password-status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .password-status.has-password {
      background: #dcfce7;
      color: #166534;
    }

    .password-status.no-password {
      background: #fee2e2;
      color: #991b1b;
    }

    .info-text {
      color: var(--text);
      font-size: 0.875rem;
      margin: 0 0 1rem 0;
      line-height: 1.5;
      opacity: 0.8;
    }

    .session-list, .passkey-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .session-item, .passkey-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }

    .session-item:last-child, .passkey-item:last-child {
      margin-bottom: 0;
    }

    .session-info, .passkey-info {
      flex: 1;
    }

    .session-device, .passkey-name {
      font-weight: 500;
      color: var(--text);
      margin-bottom: 0.25rem;
    }

    .session-meta, .passkey-meta {
      font-size: 0.875rem;
      color: var(--text);
      opacity: 0.6;
    }

    .session-actions, .passkey-actions {
      display: flex;
      gap: 0.5rem;
    }

    .empty-sessions, .empty-passkeys {
      text-align: center;
      padding: 2rem;
      color: var(--text);
      opacity: 0.6;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 4px;
    }

    .section-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .loading, .error {
      text-align: center;
      padding: 2rem;
    }

    .error {
      color: #dc2626;
    }
  `;

	override connectedCallback() {
		super.connectedCallback();
		if (this.userId) {
			this.loadUserDetails();
		}
	}

	override updated(changedProperties: Map<string, unknown>) {
		if (changedProperties.has("userId") && this.userId) {
			this.loadUserDetails();
		}
	}

	private async loadUserDetails() {
		if (!this.userId) return;

		this.loading = true;
		this.error = null;

		try {
			const res = await fetch(`/api/admin/users/${this.userId}/details`);
			if (!res.ok) {
				throw new Error("Failed to load user details");
			}

			this.user = await res.json();
		} catch (err) {
			this.error =
				err instanceof Error ? err.message : "Failed to load user details";
			this.user = null;
		} finally {
			this.loading = false;
		}
	}

	private close() {
		this.dispatchEvent(
			new CustomEvent("close", { bubbles: true, composed: true }),
		);
	}

	private formatTimestamp(timestamp: number) {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	private parseUserAgent(userAgent: string) {
		if (!userAgent) return "🖥️ Unknown Device";
		if (userAgent.includes("iPhone")) return "📱 iPhone";
		if (userAgent.includes("iPad")) return "📱 iPad";
		if (userAgent.includes("Android")) return "📱 Android";
		if (userAgent.includes("Mac")) return "💻 Mac";
		if (userAgent.includes("Windows")) return "💻 Windows";
		if (userAgent.includes("Linux")) return "💻 Linux";
		return "🖥️ Unknown Device";
	}

	private async handleChangeName(e: Event) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const input = form.querySelector("input") as HTMLInputElement;
		const name = input.value.trim();

		if (!name) {
			alert("Please enter a name");
			return;
		}

		const submitBtn = form.querySelector(
			'button[type="submit"]',
		) as HTMLButtonElement;
		submitBtn.disabled = true;
		submitBtn.textContent = "Updating...";

		try {
			const res = await fetch(`/api/admin/users/${this.userId}/name`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			if (!res.ok) {
				throw new Error("Failed to update name");
			}

			alert("Name updated successfully");
			await this.loadUserDetails();
			this.dispatchEvent(
				new CustomEvent("user-updated", { bubbles: true, composed: true }),
			);
		} catch {
			alert("Failed to update name");
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = "Update Name";
		}
	}

	private async handleChangeEmail(e: Event) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const input = form.querySelector('input[type="email"]') as HTMLInputElement;
		const checkbox = form.querySelector(
			'input[type="checkbox"]',
		) as HTMLInputElement;
		const email = input.value.trim();
		const skipVerification = checkbox?.checked || false;

		if (!email || !email.includes("@")) {
			alert("Please enter a valid email");
			return;
		}

		const submitBtn = form.querySelector(
			'button[type="submit"]',
		) as HTMLButtonElement;
		submitBtn.disabled = true;
		submitBtn.textContent = "Updating...";

		try {
			const res = await fetch(`/api/admin/users/${this.userId}/email`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, skipVerification }),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Failed to update email");
			}

			const data = await res.json();
			alert(data.message || "Email updated successfully");
			await this.loadUserDetails();
			this.dispatchEvent(
				new CustomEvent("user-updated", { bubbles: true, composed: true }),
			);
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to update email");
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = "Update Email";
		}
	}

	private async handleChangePassword(e: Event) {
		e.preventDefault();

		if (
			!confirm(
				"Send a password reset email to this user? They will receive a link to set a new password.",
			)
		) {
			return;
		}

		const form = e.target as HTMLFormElement;
		const submitBtn = form.querySelector(
			'button[type="submit"]',
		) as HTMLButtonElement;
		submitBtn.disabled = true;
		submitBtn.textContent = "Sending...";

		try {
			const res = await fetch(
				`/api/admin/users/${this.userId}/password-reset`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
				},
			);

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Failed to send password reset email");
			}

			alert(
				"Password reset email sent successfully. The user will receive a link to set a new password.",
			);
		} catch (err) {
			this.error =
				err instanceof Error
					? err.message
					: "Failed to send password reset email";
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = "Send Reset Email";
		}
	}

	private async handleLogoutAll() {
		if (
			!confirm(
				"Are you sure you want to logout this user from ALL devices? This will terminate all active sessions.",
			)
		) {
			return;
		}

		try {
			const res = await fetch(`/api/admin/users/${this.userId}/sessions`, {
				method: "DELETE",
			});

			if (!res.ok) {
				throw new Error("Failed to logout all devices");
			}

			alert("User logged out from all devices");
			await this.loadUserDetails();
		} catch {
			alert("Failed to logout all devices");
		}
	}

	private async handleRevokeSession(sessionId: string) {
		if (
			!confirm(
				"Revoke this session? The user will be logged out of this device.",
			)
		) {
			return;
		}

		try {
			const res = await fetch(
				`/api/admin/users/${this.userId}/sessions/${sessionId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				throw new Error("Failed to revoke session");
			}

			await this.loadUserDetails();
		} catch {
			alert("Failed to revoke session");
		}
	}

	private async handleRevokePasskey(passkeyId: string) {
		if (
			!confirm(
				"Are you sure you want to revoke this passkey? The user will no longer be able to use it to sign in.",
			)
		) {
			return;
		}

		try {
			const res = await fetch(
				`/api/admin/users/${this.userId}/passkeys/${passkeyId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				throw new Error("Failed to revoke passkey");
			}

			await this.loadUserDetails();
		} catch {
			alert("Failed to revoke passkey");
		}
	}

	override render() {
		return html`
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2 class="modal-title">User Details</h2>
          <button class="modal-close" @click=${this.close} aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          ${this.loading ? html`<div class="loading">Loading...</div>` : ""}
          ${this.error ? html`<div class="error">${this.error}</div>` : ""}
          ${this.user ? this.renderUserDetails() : ""}
        </div>
      </div>
    `;
	}

	private renderUserDetails() {
		if (!this.user) return "";

		return html`
      <div class="detail-section">
        <h3 class="detail-section-title">User Information</h3>
        <div class="detail-row">
          <span class="detail-label">Email</span>
          <span class="detail-value">${this.user.email}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Name</span>
          <span class="detail-value">${this.user.name || "Not set"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Role</span>
          <span class="detail-value">${this.user.role}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Joined</span>
          <span class="detail-value">${this.formatTimestamp(this.user.created_at)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Login</span>
          <span class="detail-value">${this.user.last_login ? this.formatTimestamp(this.user.last_login) : "Never"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Transcriptions</span>
          <span class="detail-value">${this.user.transcriptionCount}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Password Status</span>
          <span class="password-status ${this.user.hasPassword ? "has-password" : "no-password"}">
            ${this.user.hasPassword ? "Has password" : "No password (passkey only)"}
          </span>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">Change Name</h3>
        <form @submit=${this.handleChangeName}>
          <div class="form-group">
            <label class="form-label" for="new-name">New Name</label>
            <input type="text" id="new-name" class="form-input" placeholder="Enter new name" value=${this.user.name || ""}>
          </div>
          <button type="submit" class="btn btn-primary">Update Name</button>
        </form>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">Change Email</h3>
        <form @submit=${this.handleChangeEmail}>
          <div class="form-group">
            <label class="form-label" for="new-email">New Email</label>
            <input type="email" id="new-email" class="form-input" placeholder="Enter new email" value=${this.user.email}>
          </div>
          <div class="form-group" style="margin-top: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="skip-verification" style="cursor: pointer;">
              <span>Skip verification (use if user is locked out of email)</span>
            </label>
          </div>
          <button type="submit" class="btn btn-primary">Update Email</button>
        </form>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">Password Reset</h3>
        <p class="info-text">Send a password reset email to this user. They will receive a secure link to set a new password.</p>
        <form @submit=${this.handleChangePassword}>
          <button type="submit" class="btn btn-primary">Send Reset Email</button>
        </form>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">Active Sessions</h3>
        <div class="section-actions">
          <span class="detail-label">${this.user.sessions.length} active session${this.user.sessions.length !== 1 ? "s" : ""}</span>
          <button @click=${this.handleLogoutAll} class="btn btn-danger btn-small" ?disabled=${this.user.sessions.length === 0}>
            Logout All Devices
          </button>
        </div>
        ${this.renderSessions()}
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">Passkeys</h3>
        ${this.renderPasskeys()}
      </div>
    `;
	}

	private renderSessions() {
		if (!this.user || this.user.sessions.length === 0) {
			return html`<div class="empty-sessions">No active sessions</div>`;
		}

		return html`
      <ul class="session-list">
        ${this.user.sessions.map(
					(s) => html`
          <li class="session-item">
            <div class="session-info">
              <div class="session-device">${this.parseUserAgent(s.user_agent)}</div>
              <div class="session-meta">
                IP: ${s.ip_address || "Unknown"} • 
                Created: ${this.formatTimestamp(s.created_at)} • 
                Expires: ${this.formatTimestamp(s.expires_at)}
              </div>
            </div>
            <div class="session-actions">
              <button class="btn btn-danger btn-small" @click=${() => this.handleRevokeSession(s.id)}>
                Revoke
              </button>
            </div>
          </li>
        `,
				)}
      </ul>
    `;
	}

	private renderPasskeys() {
		if (!this.user || this.user.passkeys.length === 0) {
			return html`<div class="empty-passkeys">No passkeys registered</div>`;
		}

		return html`
      <ul class="passkey-list">
        ${this.user.passkeys.map(
					(pk) => html`
          <li class="passkey-item">
            <div class="passkey-info">
              <div class="passkey-name">${pk.name || "Unnamed Passkey"}</div>
              <div class="passkey-meta">
                Created: ${this.formatTimestamp(pk.created_at)}
                ${pk.last_used_at ? ` • Last used: ${this.formatTimestamp(pk.last_used_at)}` : ""}
              </div>
            </div>
            <div class="passkey-actions">
              <button class="btn btn-danger btn-small" @click=${() => this.handleRevokePasskey(pk.id)}>
                Revoke
              </button>
            </div>
          </li>
        `,
				)}
      </ul>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"user-modal": UserModal;
	}
}
