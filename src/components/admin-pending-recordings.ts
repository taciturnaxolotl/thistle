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

@customElement("admin-pending-recordings")
export class AdminPendingRecordings extends LitElement {
	@state() recordings: PendingRecording[] = [];
	@state() isLoading = true;
	@state() error: string | null = null;

	static override styles = css`
    :host {
      display: block;
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

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      overflow: hidden;
    }

    thead {
      background: var(--primary);
      color: var(--white);
    }

    th {
      padding: 1rem;
      text-align: left;
      font-weight: 600;
    }

    td {
      padding: 1rem;
      border-top: 1px solid var(--secondary);
      color: var(--text);
    }

    tr:hover {
      background: color-mix(in srgb, var(--primary) 5%, transparent);
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
      font-size: 0.75rem;
      font-weight: 500;
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

    .approve-btn {
      background: var(--accent);
      color: var(--white);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }

    .approve-btn:hover:not(:disabled) {
      opacity: 0.9;
    }

    .approve-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
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
		await this.loadRecordings();
	}

	private async loadRecordings() {
		this.isLoading = true;
		this.error = null;

		try {
			// Get all classes with their transcriptions
			const response = await fetch("/api/classes");
			if (!response.ok) {
				throw new Error("Failed to load classes");
			}

			const data = await response.json();
			const classesGrouped = data.classes || {};

			// Flatten all classes
			const allClasses: any[] = [];
			for (const classes of Object.values(classesGrouped)) {
				allClasses.push(...(classes as any[]));
			}

			// Fetch transcriptions for each class
			const pendingRecordings: PendingRecording[] = [];

			await Promise.all(
				allClasses.map(async (cls) => {
					try {
						const classResponse = await fetch(`/api/classes/${cls.id}`);
						if (!classResponse.ok) return;

						const classData = await classResponse.json();
						const pendingTranscriptions = (classData.transcriptions || []).filter(
							(t: any) => t.status === "pending",
						);

						for (const transcription of pendingTranscriptions) {
							// Get user info
							const userResponse = await fetch(
								`/api/admin/transcriptions/${transcription.id}/details`,
							);
							if (!userResponse.ok) continue;

							const transcriptionDetails = await userResponse.json();

							// Find meeting label
							const meetingTime = classData.meetingTimes.find(
								(m: any) => m.id === transcription.meeting_time_id,
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
		} catch (error) {
			console.error("Failed to load pending recordings:", error);
			this.error = "Failed to load pending recordings. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private async handleApprove(recordingId: string) {
		try {
			const response = await fetch(`/api/transcripts/${recordingId}/select`, {
				method: "PUT",
			});

			if (!response.ok) {
				throw new Error("Failed to approve recording");
			}

			// Reload recordings
			await this.loadRecordings();
		} catch (error) {
			console.error("Failed to approve recording:", error);
			alert("Failed to approve recording. Please try again.");
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

		try {
			const response = await fetch(`/api/admin/transcriptions/${recordingId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete recording");
			}

			// Reload recordings
			await this.loadRecordings();
		} catch (error) {
			console.error("Failed to delete recording:", error);
			alert("Failed to delete recording. Please try again.");
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
        <div class="error">${this.error}</div>
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
      <table>
        <thead>
          <tr>
            <th>File Name</th>
            <th>Class</th>
            <th>Meeting Time</th>
            <th>Uploaded By</th>
            <th>Uploaded At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.recordings.map(
						(recording) => html`
            <tr>
              <td>${recording.original_filename}</td>
              <td>
                <div class="class-info">
                  <span class="course-code">${recording.course_code}</span>
                  <span class="class-name">${recording.class_name}</span>
                </div>
              </td>
              <td>
                ${
									recording.meeting_label
										? html`<span class="meeting-label">${recording.meeting_label}</span>`
										: html`<span style="color: var(--paynes-gray); font-style: italic;">Not specified</span>`
								}
              </td>
              <td>
                <div class="user-info">
                  <img
                    src="https://hostedboringavatars.vercel.app/api/marble?size=32&name=${recording.user_id}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
                    alt="Avatar"
                    class="user-avatar"
                  />
                  <span>${recording.user_name || recording.user_email}</span>
                </div>
              </td>
              <td class="timestamp">${this.formatTimestamp(recording.created_at)}</td>
              <td>
                <div class="actions">
                  <button class="approve-btn" @click=${() => this.handleApprove(recording.id)}>
                    ✓ Approve & Transcribe
                  </button>
                  <button class="delete-btn" @click=${() => this.handleDelete(recording.id)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `,
					)}
        </tbody>
      </table>
    `;
	}
}
