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
}

@customElement("admin-users")
export class AdminUsers extends LitElement {
	@state() users: User[] = [];
	@state() searchQuery = "";
	@state() isLoading = true;
	@state() error: string | null = null;
	@state() currentUserEmail: string | null = null;

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

	private async handleRoleChange(userId: number, email: string, newRole: "user" | "admin", oldRole: "user" | "admin", event: Event) {
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

	private async handleDelete(userId: number, email: string) {
		if (
			!confirm(
				`Are you sure you want to delete user ${email}? This will delete all their transcriptions and cannot be undone.`,
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/users/${userId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete user");
			}

			await this.loadUsers();
			this.dispatchEvent(new CustomEvent("user-deleted"));
		} catch (error) {
			console.error("Failed to delete user:", error);
			alert("Failed to delete user. Please try again.");
		}
	}

	private handleCardClick(userId: number, event: Event) {
		// Don't open modal if clicking on delete button or role select
		if (
			(event.target as HTMLElement).closest(".delete-btn") ||
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
				(u.name && u.name.toLowerCase().includes(query)),
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
                  <button class="delete-btn" @click=${() => this.handleDelete(u.id, u.email)}>
                    Delete User
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
