import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface PendingRecording {
	id: string;
	original_filename: string;
	user_id: number;
	user_name: string | null;
	user_email: string;
	class_id: string;
	class_name: string;
	course_code: string;
	meeting_time_id: string | null;
	meeting_label: string | null;
	created_at: number;
	status: string;
}

interface Class {
	id: string;
	name: string;
	course_code: string;
}

interface Transcription {
	id: string;
	original_filename: string;
	status: string;
	meeting_time_id: string | null;
	created_at: number;
}

interface MeetingTime {
	id: string;
	label: string;
}

@customElement("admin-pending-recordings")
export class AdminPendingRecordings extends LitElement {
	@state() recordings: PendingRecording[] = [];
	@state() isLoading = true;
	@state() error: string | null = null;

	static override styles = css`
    :host {
      display: block;
    }

    .error-banner {
      background: #fecaca;
      border: 2px solid rgba(220, 38, 38, 0.8);
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      color: #dc2626;
      font-weight: 500;
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

    .recordings-grid {
      display: grid;
      gap: 1.5rem;
    }

    .recording-card {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      transition: border-color 0.2s;
    }

    .recording-card:hover {
      border-color: var(--primary);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .file-info {
      flex: 1;
    }

    .filename {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.5rem;
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

    .class-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .course-code {
      font-weight: 600;
      color: var(--accent);
      font-size: 0.875rem;
    }

    .class-name {
      font-size: 0.875rem;
      color: var(--text);
    }

    .meeting-label {
      display: inline-block;
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      color: var(--primary);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .user-avatar {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
    }

    .timestamp {
      color: var(--paynes-gray);
      font-size: 0.875rem;
    }

    .audio-player {
      margin: 1rem 0;
    }

    .audio-player audio {
      width: 100%;
      height: 2.5rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .approve-btn {
      background: var(--accent);
      color: var(--white);
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: opacity 0.2s;
      flex: 1;
    }

    .approve-btn:hover:not(:disabled) {
      opacity: 0.9;
    }

    .approve-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .delete-btn {
      background: transparent;
      border: 2px solid #dc2626;
      color: #dc2626;
      padding: 0.75rem 1.5rem;
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
		await this.loadRecordings();
	}

	private async loadRecordings() {
		this.isLoading = true;
		this.error = null;

		try {
			// Get all classes with their transcriptions
			const response = await fetch("/api/classes");
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to load classes");
			}

			const data = await response.json();
			const classesGrouped = data.classes || {};

			// Flatten all classes
			const allClasses: Class[] = [];
			for (const classes of Object.values(classesGrouped)) {
				allClasses.push(...(classes as Class[]));
			}

			// Fetch transcriptions for each class
			const pendingRecordings: PendingRecording[] = [];

			await Promise.all(
				allClasses.map(async (cls) => {
					try {
						const classResponse = await fetch(`/api/classes/${cls.id}`);
						if (!classResponse.ok) return;

						const classData = await classResponse.json();
						const pendingTranscriptions = (
							classData.transcriptions || []
						).filter((t: Transcription) => t.status === "pending");

						for (const transcription of pendingTranscriptions) {
							// Get user info
							const userResponse = await fetch(
								`/api/admin/transcriptions/${transcription.id}/details`,
							);
							if (!userResponse.ok) continue;

							const transcriptionDetails = await userResponse.json();

							// Find meeting label
							const meetingTime = classData.meetingTimes.find(
								(m: MeetingTime) => m.id === transcription.meeting_time_id,
							);

							pendingRecordings.push({
								id: transcription.id,
								original_filename: transcription.original_filename,
								user_id: transcriptionDetails.user_id,
								user_name: transcriptionDetails.user_name,
								user_email: transcriptionDetails.user_email,
								class_id: cls.id,
								class_name: cls.name,
								course_code: cls.course_code,
								meeting_time_id: transcription.meeting_time_id,
								meeting_label: meetingTime?.label || null,
								created_at: transcription.created_at,
								status: transcription.status,
							});
						}
					} catch (error) {
						console.error(`Failed to load class ${cls.id}:`, error);
					}
				}),
			);

			// Sort by created_at descending
			pendingRecordings.sort((a, b) => b.created_at - a.created_at);

			this.recordings = pendingRecordings;
		} catch (err) {
			this.error =
				err instanceof Error
					? err.message
					: "Failed to load pending recordings. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private async handleApprove(recordingId: string) {
		this.error = null;
		try {
			const response = await fetch(`/api/transcripts/${recordingId}/select`, {
				method: "PUT",
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to approve recording");
			}

			// Reload recordings
			await this.loadRecordings();
		} catch (err) {
			this.error =
				err instanceof Error
					? err.message
					: "Failed to approve recording. Please try again.";
		}
	}

	private async handleDelete(recordingId: string) {
		if (
			!confirm(
				"Are you sure you want to delete this recording? This cannot be undone.",
			)
		) {
			return;
		}

		this.error = null;
		try {
			const response = await fetch(`/api/admin/transcriptions/${recordingId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to delete recording");
			}

			// Reload recordings
			await this.loadRecordings();
		} catch (err) {
			this.error =
				err instanceof Error
					? err.message
					: "Failed to delete recording. Please try again.";
		}
	}

	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading pending recordings...</div>`;
		}

		if (this.error) {
			return html`
        <div class="error-banner">${this.error}</div>
        <button @click=${this.loadRecordings}>Retry</button>
      `;
		}

		if (this.recordings.length === 0) {
			return html`
        <div class="empty-state">
          <p>No pending recordings</p>
        </div>
      `;
		}

		return html`
      ${this.error ? html`<div class="error-banner">${this.error}</div>` : ""}
      
      <div class="recordings-grid">
        ${this.recordings.map(
					(recording) => html`
          <div class="recording-card">
            <div class="card-header">
              <div class="file-info">
                <div class="filename">${recording.original_filename}</div>
              </div>
            </div>

            <div class="meta-row">
              <div class="meta-item">
                <div class="meta-label">Class</div>
                <div class="meta-value">
                  <div class="class-info">
                    <span class="course-code">${recording.course_code}</span>
                    <span class="class-name">${recording.class_name}</span>
                  </div>
                </div>
              </div>

              <div class="meta-item">
                <div class="meta-label">Meeting Time</div>
                <div class="meta-value">
                  ${
										recording.meeting_label
											? html`<span class="meeting-label">${recording.meeting_label}</span>`
											: html`<span style="color: var(--paynes-gray); font-style: italic;">Not specified</span>`
									}
                </div>
              </div>

              <div class="meta-item">
                <div class="meta-label">Uploaded By</div>
                <div class="meta-value">
                  <div class="user-info">
                    <img
                      src="https://hostedboringavatars.vercel.app/api/marble?size=24&name=${recording.user_id}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
                      alt="Avatar"
                      class="user-avatar"
                    />
                    <span>${recording.user_name || recording.user_email}</span>
                  </div>
                </div>
              </div>

              <div class="meta-item">
                <div class="meta-label">Uploaded At</div>
                <div class="meta-value timestamp">
                  ${this.formatTimestamp(recording.created_at)}
                </div>
              </div>
            </div>

            <div class="audio-player">
              <audio controls preload="metadata" src="/api/transcriptions/${recording.id}/audio"></audio>
            </div>

            <div class="actions">
              <button class="approve-btn" @click=${() => this.handleApprove(recording.id)}>
                ✓ Approve & Transcribe
              </button>
              <button class="delete-btn" @click=${() => this.handleDelete(recording.id)}>
                Delete
              </button>
            </div>
          </div>
        `,
				)}
      </div>
    `;
	}
}
