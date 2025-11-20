import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface User {
	id: number;
	email: string;
	name: string | null;
	avatar: string;
	role: "user" | "admin";
	transcription_count: number;
	last_login: number | null;
	created_at: number;
	subscription_status: string | null;
	subscription_id: string | null;
}

@customElement("admin-users")
export class AdminUsers extends LitElement {
	@state() users: User[] = [];
	@state() searchQuery = "";
	@state() isLoading = true;
	@state() error: string | null = null;
	@state() currentUserEmail: string | null = null;
	@state() revokingSubscriptions = new Set<number>();

	static override styles = css`
    :host {
      display: block;
    }

    .search-box {
      width: 100%;
      max-width: 30rem;
      margin-bottom: 1.5rem;
      padding: 0.75rem 1rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      font-size: 1rem;
      background: var(--background);
      color: var(--text);
    }

    .search-box:focus {
      outline: none;
      border-color: var(--primary);
    }

    .loading,
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--paynes-gray);
    }

    .error {
      background: color-mix(in srgb, red 10%, transparent);
      border: 1px solid red;
      color: red;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    .users-grid {
      display: grid;
      gap: 1rem;
    }

    .user-card {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .user-card:hover {
      border-color: var(--primary);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .user-avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
    }

    .user-details {
      flex: 1;
    }

    .user-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.25rem;
    }

    .user-email {
      font-size: 0.875rem;
      color: var(--paynes-gray);
    }

    .admin-badge {
      background: var(--accent);
      color: var(--white);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .meta-row {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .meta-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--paynes-gray);
      letter-spacing: 0.05em;
    }

    .meta-value {
      font-size: 0.875rem;
      color: var(--text);
    }

    .timestamp {
      color: var(--paynes-gray);
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .role-select {
      padding: 0.5rem 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      background: var(--background);
      color: var(--text);
      cursor: pointer;
      font-weight: 600;
    }

    .role-select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .delete-btn {
      background: transparent;
      border: 2px solid #dc2626;
      color: #dc2626;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s;
    }

    .delete-btn:hover:not(:disabled) {
      background: #dc2626;
      color: var(--white);
    }

    .delete-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .revoke-btn {
      background: transparent;
      border: 2px solid var(--accent);
      color: var(--accent);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s;
    }

    .revoke-btn:hover:not(:disabled) {
      background: var(--accent);
      color: var(--white);
    }

    .revoke-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .subscription-badge {
      background: var(--primary);
      color: var(--white);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .subscription-badge.active {
      background: var(--primary);
      color: var(--white);
    }

    .subscription-badge.none {
      background: var(--secondary);
      color: var(--paynes-gray);
    }
  `;

	override async connectedCallback() {
		super.connectedCallback();
		await this.getCurrentUser();
		await this.loadUsers();
	}

	private async getCurrentUser() {
		try {
			const response = await fetch("/api/auth/me");
			if (response.ok) {
				const user = await response.json();
				this.currentUserEmail = user.email;
			}
		} catch (error) {
			console.error("Failed to get current user:", error);
		}
	}

	private async loadUsers() {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch("/api/admin/users");
			if (!response.ok) {
				throw new Error("Failed to load users");
			}

			this.users = await response.json();
		} catch (error) {
			console.error("Failed to load users:", error);
			this.error = "Failed to load users. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private async handleRoleChange(
		userId: number,
		email: string,
		newRole: "user" | "admin",
		oldRole: "user" | "admin",
		event: Event,
	) {
		const select = event.target as HTMLSelectElement;

		const isDemotingSelf =
			email === this.currentUserEmail &&
			oldRole === "admin" &&
			newRole === "user";

		if (isDemotingSelf) {
			if (
				!confirm(
					"⚠️ WARNING: You are about to demote yourself from admin to user. You will lose access to this admin panel immediately. Are you sure?",
				)
			) {
				select.value = oldRole;
				return;
			}

			if (
				!confirm(
					"⚠️ FINAL WARNING: This action cannot be undone by you. Another admin will need to restore your admin access. Continue?",
				)
			) {
				select.value = oldRole;
				return;
			}
		} else {
			if (!confirm(`Change user role to ${newRole}?`)) {
				select.value = oldRole;
				return;
			}
		}

		try {
			const response = await fetch(`/api/admin/users/${userId}/role`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: newRole }),
			});

			if (!response.ok) {
				throw new Error("Failed to update role");
			}

			if (isDemotingSelf) {
				window.location.href = "/";
			} else {
				await this.loadUsers();
			}
		} catch (error) {
			console.error("Failed to update role:", error);
			alert("Failed to update user role");
			select.value = oldRole;
		}
	}

	@state() deleteState: {
		id: number;
		type: "user" | "revoke";
		clicks: number;
		timeout: number | null;
	} | null = null;

	private handleDeleteClick(userId: number, event: Event) {
		event.stopPropagation();

		// If this is a different item or timeout expired, reset
		if (
			!this.deleteState ||
			this.deleteState.id !== userId ||
			this.deleteState.type !== "user"
		) {
			// Clear any existing timeout
			if (this.deleteState?.timeout) {
				clearTimeout(this.deleteState.timeout);
			}

			// Set first click
			const timeout = window.setTimeout(() => {
				this.deleteState = null;
			}, 1000);

			this.deleteState = { id: userId, type: "user", clicks: 1, timeout };
			return;
		}

		// Increment clicks
		const newClicks = this.deleteState.clicks + 1;

		// Clear existing timeout
		if (this.deleteState.timeout) {
			clearTimeout(this.deleteState.timeout);
		}

		// Third click - actually delete
		if (newClicks === 3) {
			this.deleteState = null;
			this.performDeleteUser(userId);
			return;
		}

		// Second click - reset timeout
		const timeout = window.setTimeout(() => {
			this.deleteState = null;
		}, 1000);

		this.deleteState = { id: userId, type: "user", clicks: newClicks, timeout };
	}

	private async performDeleteUser(userId: number) {
		try {
			const response = await fetch(`/api/admin/users/${userId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete user");
			}

			// Remove user from local array instead of reloading
			this.users = this.users.filter(u => u.id !== userId);
			this.dispatchEvent(new CustomEvent("user-deleted"));
		} catch (error) {
			console.error("Failed to delete user:", error);
			alert("Failed to delete user. Please try again.");
		}
	}

	private handleRevokeClick(userId: number, email: string, subscriptionId: string, event: Event) {
		event.stopPropagation();

		// If this is a different item or timeout expired, reset
		if (
			!this.deleteState ||
			this.deleteState.id !== userId ||
			this.deleteState.type !== "revoke"
		) {
			// Clear any existing timeout
			if (this.deleteState?.timeout) {
				clearTimeout(this.deleteState.timeout);
			}

			// Set first click
			const timeout = window.setTimeout(() => {
				this.deleteState = null;
			}, 1000);

			this.deleteState = { id: userId, type: "revoke", clicks: 1, timeout };
			return;
		}

		// Increment clicks
		const newClicks = this.deleteState.clicks + 1;

		// Clear existing timeout
		if (this.deleteState.timeout) {
			clearTimeout(this.deleteState.timeout);
		}

		// Third click - actually revoke
		if (newClicks === 3) {
			this.deleteState = null;
			this.performRevokeSubscription(userId, email, subscriptionId);
			return;
		}

		// Second click - reset timeout
		const timeout = window.setTimeout(() => {
			this.deleteState = null;
		}, 1000);

		this.deleteState = { id: userId, type: "revoke", clicks: newClicks, timeout };
	}

	private async performRevokeSubscription(userId: number, email: string, subscriptionId: string) {
		this.revokingSubscriptions.add(userId);
		this.requestUpdate();

		try {
			const response = await fetch(`/api/admin/users/${userId}/subscription`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ subscriptionId }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to revoke subscription");
			}

			await this.loadUsers();
			alert(`Subscription revoked for ${email}`);
		} catch (error) {
			console.error("Failed to revoke subscription:", error);
			alert(`Failed to revoke subscription: ${error instanceof Error ? error.message : "Unknown error"}`);
			this.revokingSubscriptions.delete(userId);
		}
	}

	private getDeleteButtonText(userId: number, type: "user" | "revoke"): string {
		if (
			!this.deleteState ||
			this.deleteState.id !== userId ||
			this.deleteState.type !== type
		) {
			return type === "user" ? "Delete User" : "Revoke Subscription";
		}

		if (this.deleteState.clicks === 1) {
			return "Are you sure?";
		}

		if (this.deleteState.clicks === 2) {
			return "Final warning!";
		}

		return type === "user" ? "Delete User" : "Revoke Subscription";
	}

	private handleCardClick(userId: number, event: Event) {
		// Don't open modal if clicking on delete button, revoke button, or role select
		if (
			(event.target as HTMLElement).closest(".delete-btn") ||
			(event.target as HTMLElement).closest(".revoke-btn") ||
			(event.target as HTMLElement).closest(".role-select")
		) {
			return;
		}
		this.dispatchEvent(
			new CustomEvent("open-user", {
				detail: { id: userId },
			}),
		);
	}

	private formatTimestamp(timestamp: number | null): string {
		if (!timestamp) return "Never";
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	private get filteredUsers() {
		if (!this.searchQuery) return this.users;

		const query = this.searchQuery.toLowerCase();
		return this.users.filter(
			(u) =>
				u.email.toLowerCase().includes(query) ||
				u.name?.toLowerCase().includes(query),
		);
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading users...</div>`;
		}

		if (this.error) {
			return html`
        <div class="error">${this.error}</div>
        <button @click=${this.loadUsers}>Retry</button>
      `;
		}

		const filtered = this.filteredUsers;

		return html`
      <input
        type="text"
        class="search-box"
        placeholder="Search by name or email..."
        .value=${this.searchQuery}
        @input=${(e: Event) => {
					this.searchQuery = (e.target as HTMLInputElement).value;
				}}
      />

      ${
				filtered.length === 0
					? html`<div class="empty-state">No users found</div>`
					: html`
          <div class="users-grid">
            ${filtered.map(
							(u) => html`
              <div class="user-card" @click=${(e: Event) => this.handleCardClick(u.id, e)}>
                <div class="card-header">
                  <div class="user-info">
                    <img
                      src="https://hostedboringavatars.vercel.app/api/marble?size=48&name=${u.avatar}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
                      alt="Avatar"
                      class="user-avatar"
                    />
                    <div class="user-details">
                      <div class="user-name">${u.name || "Anonymous"}</div>
                      <div class="user-email">${u.email}</div>
                    </div>
                  </div>
                  ${u.role === "admin" ? html`<span class="admin-badge">Admin</span>` : ""}
                </div>

                <div class="meta-row">
                  <div class="meta-item">
                    <div class="meta-label">Transcriptions</div>
                    <div class="meta-value">${u.transcription_count}</div>
                  </div>
                  <div class="meta-item">
                    <div class="meta-label">Subscription</div>
                    <div class="meta-value">
                      ${u.subscription_status 
                        ? html`<span class="subscription-badge ${u.subscription_status.toLowerCase()}">${u.subscription_status}</span>` 
                        : html`<span class="subscription-badge none">None</span>`
                      }
                    </div>
                  </div>
                  <div class="meta-item">
                    <div class="meta-label">Last Login</div>
                    <div class="meta-value timestamp">
                      ${this.formatTimestamp(u.last_login)}
                    </div>
                  </div>
                  <div class="meta-item">
                    <div class="meta-label">Joined</div>
                    <div class="meta-value timestamp">
                      ${this.formatTimestamp(u.created_at)}
                    </div>
                  </div>
                </div>

                <div class="actions">
                  <select
                    class="role-select"
                    .value=${u.role}
                    @change=${(e: Event) => this.handleRoleChange(u.id, u.email, (e.target as HTMLSelectElement).value as "user" | "admin", u.role, e)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button 
                    class="revoke-btn" 
                    ?disabled=${!u.subscription_status || !u.subscription_id || this.revokingSubscriptions.has(u.id)}
                    @click=${(e: Event) => {
											if (u.subscription_id) {
												this.handleRevokeClick(u.id, u.email, u.subscription_id, e);
											}
										}}
                  >
                    ${this.revokingSubscriptions.has(u.id) ? "Revoking..." : this.getDeleteButtonText(u.id, "revoke")}
                  </button>
                  <button class="delete-btn" @click=${(e: Event) => this.handleDeleteClick(u.id, e)}>
                    ${this.getDeleteButtonText(u.id, "user")}
                  </button>
                </div>
              </div>
            `,
						)}
          </div>
        `
			}
    `;
	}
}
