import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface Transcription {
	id: string;
	original_filename: string;
	user_id: number;
	user_name: string | null;
	user_email: string;
	status: string;
	created_at: number;
	error_message?: string | null;
}

@customElement("admin-transcriptions")
export class AdminTranscriptions extends LitElement {
	@state() transcriptions: Transcription[] = [];
	@state() searchQuery = "";
	@state() isLoading = true;
	@state() error: string | null = null;

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

    .transcriptions-grid {
      display: grid;
      gap: 1rem;
    }

    .transcription-card {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .transcription-card:hover {
      border-color: var(--primary);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .filename {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .status-badge {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-completed {
      background: color-mix(in srgb, green 10%, transparent);
      color: green;
    }

    .status-failed {
      background: color-mix(in srgb, red 10%, transparent);
      color: red;
    }

    .status-processing,
    .status-transcribing,
    .status-uploading,
    .status-selected {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
    }

    .status-pending {
      background: color-mix(in srgb, var(--paynes-gray) 10%, transparent);
      color: var(--paynes-gray);
    }

    .meta-row {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .user-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
    }

    .timestamp {
      color: var(--paynes-gray);
      font-size: 0.875rem;
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
      margin-top: 1rem;
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
		await this.loadTranscriptions();
	}

	private async loadTranscriptions() {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch("/api/admin/transcriptions");
			if (!response.ok) {
				throw new Error("Failed to load transcriptions");
			}

			this.transcriptions = await response.json();
		} catch (error) {
			console.error("Failed to load transcriptions:", error);
			this.error = "Failed to load transcriptions. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private async handleDelete(transcriptionId: string) {
		if (
			!confirm(
				"Are you sure you want to delete this transcription? This cannot be undone.",
			)
		) {
			return;
		}

		try {
			const response = await fetch(
				`/api/admin/transcriptions/${transcriptionId}`,
				{
					method: "DELETE",
				},
			);

			if (!response.ok) {
				throw new Error("Failed to delete transcription");
			}

			await this.loadTranscriptions();
			this.dispatchEvent(new CustomEvent("transcription-deleted"));
		} catch (error) {
			console.error("Failed to delete transcription:", error);
			alert("Failed to delete transcription. Please try again.");
		}
	}

	private handleCardClick(transcriptionId: string, event: Event) {
		// Don't open modal if clicking on delete button
		if ((event.target as HTMLElement).closest(".delete-btn")) {
			return;
		}
		this.dispatchEvent(
			new CustomEvent("open-transcription", {
				detail: { id: transcriptionId },
			}),
		);
	}

	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	private get filteredTranscriptions() {
		if (!this.searchQuery) return this.transcriptions;

		const query = this.searchQuery.toLowerCase();
		return this.transcriptions.filter(
			(t) =>
				t.original_filename.toLowerCase().includes(query) ||
				t.user_name?.toLowerCase().includes(query) ||
				t.user_email.toLowerCase().includes(query),
		);
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading transcriptions...</div>`;
		}

		if (this.error) {
			return html`
        <div class="error">${this.error}</div>
        <button @click=${this.loadTranscriptions}>Retry</button>
      `;
		}

		const filtered = this.filteredTranscriptions;

		return html`
      <input
        type="text"
        class="search-box"
        placeholder="Search by filename or user..."
        .value=${this.searchQuery}
        @input=${(e: Event) => {
					this.searchQuery = (e.target as HTMLInputElement).value;
				}}
      />

      ${
				filtered.length === 0
					? html`<div class="empty-state">No transcriptions found</div>`
					: html`
          <div class="transcriptions-grid">
            ${filtered.map(
							(t) => html`
              <div class="transcription-card" @click=${(e: Event) => this.handleCardClick(t.id, e)}>
                <div class="card-header">
                  <div class="filename">${t.original_filename}</div>
                  <span class="status-badge status-${t.status}">${t.status}</span>
                </div>

                <div class="meta-row">
                  <div class="user-info">
                    <img
                      src="https://hostedboringavatars.vercel.app/api/marble?size=32&name=${t.user_id}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
                      alt="Avatar"
                      class="user-avatar"
                    />
                    <span>${t.user_name || t.user_email}</span>
                  </div>
                  <span class="timestamp">${this.formatTimestamp(t.created_at)}</span>
                </div>

                ${
									t.error_message
										? html`<div class="error" style="margin-top: 1rem;">${t.error_message}</div>`
										: ""
								}

                <button class="delete-btn" @click=${() => this.handleDelete(t.id)}>
                  Delete
                </button>
              </div>
            `,
						)}
          </div>
        `
			}
    `;
	}
}
