import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface PendingRecording {
	id: string;
	user_id: number;
	filename: string;
	original_filename: string;
	vote_count: number;
	created_at: number;
}

interface RecordingsData {
	recordings: PendingRecording[];
	total_users: number;
	user_vote: string | null;
	vote_threshold: number;
	winning_recording_id: string | null;
}

@customElement("pending-recordings-view")
export class PendingRecordingsView extends LitElement {
	@property({ type: String }) classId = "";
	@property({ type: String }) meetingTimeId = "";
	@property({ type: String }) meetingTimeLabel = "";

	@state() private recordings: PendingRecording[] = [];
	@state() private userVote: string | null = null;
	@state() private voteThreshold = 0;
	@state() private winningRecordingId: string | null = null;
	@state() private error: string | null = null;
	@state() private timeRemaining = "";

	private refreshInterval?: number;
	private loadingInProgress = false;

	static override styles = css`
    :host {
      display: block;
      padding: 1rem;
    }

    .container {
      max-width: 56rem;
      margin: 0 auto;
    }

    h2 {
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .info {
      color: var(--paynes-gray);
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }

    .stats {
      display: flex;
      gap: 2rem;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: color-mix(in srgb, var(--primary) 5%, transparent);
      border-radius: 8px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--paynes-gray);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text);
    }

    .recordings-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .recording-card {
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1rem;
      transition: all 0.2s;
    }

    .recording-card.voted {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 5%, transparent);
    }

    .recording-card.winning {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    .recording-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .recording-info {
      flex: 1;
    }

    .recording-name {
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.25rem;
    }

    .recording-meta {
      font-size: 0.75rem;
      color: var(--paynes-gray);
    }

    .vote-section {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .vote-count {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--accent);
      min-width: 3rem;
      text-align: center;
    }

    .vote-button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid var(--secondary);
      background: var(--background);
      color: var(--text);
    }

    .vote-button:hover:not(:disabled) {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    .vote-button.voted {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--white);
    }

    .vote-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .delete-button {
      padding: 0.5rem;
      border: none;
      background: transparent;
      color: var(--paynes-gray);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .delete-button:hover {
      background: color-mix(in srgb, red 10%, transparent);
      color: red;
    }

    .winning-badge {
      background: var(--accent);
      color: var(--white);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .error {
      background: color-mix(in srgb, red 10%, transparent);
      border: 1px solid red;
      color: red;
      padding: 0.75rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--paynes-gray);
    }

    .audio-player {
      margin-top: 0.75rem;
    }

    audio {
      width: 100%;
      height: 2.5rem;
    }
  `;

	override connectedCallback() {
		super.connectedCallback();
		this.loadRecordings();
		// Refresh every 10 seconds
		this.refreshInterval = setInterval(() => this.loadRecordings(), 10000);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
	}

	private async loadRecordings() {
		if (this.loadingInProgress) return;

		this.loadingInProgress = true;

		try {
			const response = await fetch(
				`/api/classes/${this.classId}/meetings/${this.meetingTimeId}/recordings`,
			);

			if (!response.ok) {
				throw new Error("Failed to load recordings");
			}

			const data: RecordingsData = await response.json();
			this.recordings = data.recordings;
			this.userVote = data.user_vote;
			this.voteThreshold = data.vote_threshold;
			this.winningRecordingId = data.winning_recording_id;

			// Calculate time remaining for first recording
			if (this.recordings.length > 0 && this.recordings[0]) {
				const uploadedAt = this.recordings[0].created_at;
				const now = Date.now() / 1000;
				const elapsed = now - uploadedAt;
				const remaining = 30 * 60 - elapsed; // 30 minutes

				if (remaining > 0) {
					const minutes = Math.floor(remaining / 60);
					const seconds = Math.floor(remaining % 60);
					this.timeRemaining = `${minutes}:${seconds.toString().padStart(2, "0")}`;
				} else {
					this.timeRemaining = "Auto-submitting...";
				}
			}

			this.error = null;
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : "Failed to load recordings";
		} finally {
			this.loadingInProgress = false;
		}
	}

	private async handleVote(recordingId: string) {
		try {
			const response = await fetch(`/api/recordings/${recordingId}/vote`, {
				method: "POST",
			});

			if (!response.ok) {
				throw new Error("Failed to vote");
			}

			const data = await response.json();

			// If a winner was selected, reload the page to show it in transcriptions
			if (data.winning_recording_id) {
				window.location.reload();
			} else {
				// Just reload recordings to show updated votes
				await this.loadRecordings();
			}
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : "Failed to vote";
		}
	}

	private async handleDelete(recordingId: string) {
		if (!confirm("Delete this recording?")) {
			return;
		}

		try {
			const response = await fetch(`/api/recordings/${recordingId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete recording");
			}

			await this.loadRecordings();
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : "Failed to delete recording";
		}
	}

	private formatTimeAgo(timestamp: number): string {
		const now = Date.now() / 1000;
		const diff = now - timestamp;

		if (diff < 60) return "just now";
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	override render() {
		return html`
      <div class="container">
        <h2>Pending Recordings - ${this.meetingTimeLabel}</h2>
        <p class="info">
          Vote for the best quality recording. The winner will be automatically transcribed when 40% of class votes or after 30 minutes.
        </p>

        ${this.error ? html`<div class="error">${this.error}</div>` : ""}

        ${
					this.recordings.length > 0
						? html`
            <div class="stats">
              <div class="stat">
                <div class="stat-label">Recordings</div>
                <div class="stat-value">${this.recordings.length}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Vote Threshold</div>
                <div class="stat-value">${this.voteThreshold} votes</div>
              </div>
              <div class="stat">
                <div class="stat-label">Time Remaining</div>
                <div class="stat-value">${this.timeRemaining}</div>
              </div>
            </div>

            <div class="recordings-list">
              ${this.recordings.map(
								(recording) => html`
                <div class="recording-card ${this.userVote === recording.id ? "voted" : ""} ${this.winningRecordingId === recording.id ? "winning" : ""}">
                  <div class="recording-header">
                    <div class="recording-info">
                      <div class="recording-name">${recording.original_filename}</div>
                      <div class="recording-meta">
                        Uploaded ${this.formatTimeAgo(recording.created_at)}
                      </div>
                    </div>

                    <div class="vote-section">
                      ${
												this.winningRecordingId === recording.id
													? html`<span class="winning-badge">✨ Selected</span>`
													: ""
											}
                      
                      <div class="vote-count">
                        ${recording.vote_count} ${recording.vote_count === 1 ? "vote" : "votes"}
                      </div>

                      <button
                        class="vote-button ${this.userVote === recording.id ? "voted" : ""}"
                        @click=${() => this.handleVote(recording.id)}
                        ?disabled=${this.winningRecordingId !== null}
                      >
                        ${this.userVote === recording.id ? "✓ Voted" : "Vote"}
                      </button>

                      <button
                        class="delete-button"
                        @click=${() => this.handleDelete(recording.id)}
                        title="Delete recording"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div class="audio-player">
                    <audio controls preload="none">
                      <source src="/api/transcriptions/${recording.id}/audio" type="audio/mpeg">
                    </audio>
                  </div>
                </div>
              `,
							)}
            </div>
          `
						: html`
            <div class="empty-state">
              <p>No recordings uploaded yet for this meeting time.</p>
              <p>Upload a recording to get started!</p>
            </div>
          `
				}
      </div>
    `;
	}
}
