import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./upload-recording-modal.ts";
import "./vtt-viewer.ts";

interface Class {
	id: string;
	course_code: string;
	name: string;
	professor: string;
	semester: string;
	year: number;
	archived: boolean;
}

interface MeetingTime {
	id: string;
	class_id: string;
	label: string;
	created_at: number;
}

interface Transcription {
	id: string;
	user_id: number;
	meeting_time_id: string | null;
	filename: string;
	original_filename: string;
	status: "pending" | "selected" | "uploading" | "processing" | "transcribing" | "completed" | "failed";
	progress: number;
	error_message: string | null;
	created_at: number;
	updated_at: number;
}

@customElement("class-view")
export class ClassView extends LitElement {
	@state() classId = "";
	@state() classInfo: Class | null = null;
	@state() meetingTimes: MeetingTime[] = [];
	@state() transcriptions: Transcription[] = [];
	@state() isLoading = true;
	@state() error: string | null = null;
	@state() searchQuery = "";
	@state() uploadModalOpen = false;
	private eventSources: Map<string, EventSource> = new Map();

	static override styles = css`
    :host {
      display: block;
    }

    .header {
      margin-bottom: 2rem;
    }

    .back-link {
      color: var(--paynes-gray);
      text-decoration: none;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .back-link:hover {
      color: var(--accent);
    }

    .class-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .class-info h1 {
      color: var(--text);
      margin: 0 0 0.5rem 0;
    }

    .course-code {
      font-size: 1rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
    }

    .professor {
      color: var(--paynes-gray);
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .semester {
      color: var(--paynes-gray);
      font-size: 0.875rem;
    }

    .archived-banner {
      background: var(--paynes-gray);
      color: var(--white);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .search-upload {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 2rem;
    }

    .search-box {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text);
      background: var(--background);
    }

    .search-box:focus {
      outline: none;
      border-color: var(--primary);
    }

    .upload-button {
      background: var(--accent);
      color: var(--white);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .upload-button:hover:not(:disabled) {
      opacity: 0.9;
    }

    .upload-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .meetings-section {
      margin-bottom: 2rem;
    }

    .meetings-section h2 {
      font-size: 1.25rem;
      color: var(--text);
      margin-bottom: 1rem;
    }

    .meetings-list {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .meeting-tag {
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      color: var(--primary);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .transcription-card {
      background: var(--background);
      border: 1px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .transcription-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .transcription-filename {
      font-weight: 500;
      color: var(--text);
    }

    .transcription-date {
      font-size: 0.875rem;
      color: var(--paynes-gray);
    }

    .transcription-status {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-pending {
      background: color-mix(in srgb, var(--paynes-gray) 10%, transparent);
      color: var(--paynes-gray);
    }

    .status-selected, .status-uploading, .status-processing, .status-transcribing {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
    }

    .status-completed {
      background: color-mix(in srgb, green 10%, transparent);
      color: green;
    }

    .status-failed {
      background: color-mix(in srgb, red 10%, transparent);
      color: red;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: var(--secondary);
      border-radius: 2px;
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 2px;
      transition: width 0.3s;
    }

    .progress-fill.indeterminate {
      width: 30%;
      animation: progress-slide 1.5s ease-in-out infinite;
    }

    @keyframes progress-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(333%); }
    }

    .audio-player audio {
      width: 100%;
      height: 2.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--paynes-gray);
    }

    .empty-state h2 {
      color: var(--text);
      margin-bottom: 1rem;
    }

    .loading {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--paynes-gray);
    }

    .error {
      background: color-mix(in srgb, red 10%, transparent);
      border: 1px solid red;
      color: red;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 2rem;
    }
  `;

	override async connectedCallback() {
		super.connectedCallback();
		this.extractClassId();
		await this.loadClass();
		this.connectToTranscriptionStreams();

		window.addEventListener("auth-changed", this.handleAuthChange);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener("auth-changed", this.handleAuthChange);
		// Close all event sources
		for (const eventSource of this.eventSources.values()) {
			eventSource.close();
		}
		this.eventSources.clear();
	}

	private handleAuthChange = async () => {
		await this.loadClass();
	};

	private extractClassId() {
		const path = window.location.pathname;
		const match = path.match(/^\/classes\/(.+)$/);
		if (match && match[1]) {
			this.classId = match[1];
		}
	}

	private async loadClass() {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch(`/api/classes/${this.classId}`);
			if (!response.ok) {
				if (response.status === 401) {
					window.location.href = "/";
					return;
				}
				if (response.status === 403) {
					this.error = "You don't have access to this class.";
					return;
				}
				throw new Error("Failed to load class");
			}

			const data = await response.json();
			this.classInfo = data.class;
			this.meetingTimes = data.meetingTimes || [];
			this.transcriptions = data.transcriptions || [];

			// Load VTT for completed transcriptions
			await this.loadVTTForCompleted();
		} catch (error) {
			console.error("Failed to load class:", error);
			this.error = "Failed to load class. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private async loadVTTForCompleted() {
		const completed = this.transcriptions.filter((t) => t.status === "completed");

		await Promise.all(
			completed.map(async (transcription) => {
				try {
					const response = await fetch(`/api/transcriptions/${transcription.id}?format=vtt`);
					if (response.ok) {
						const vttContent = await response.text();
						(transcription as any).vttContent = vttContent;
						(transcription as any).audioUrl = `/api/transcriptions/${transcription.id}/audio`;
						this.requestUpdate();
					}
				} catch (error) {
					console.error(`Failed to load VTT for ${transcription.id}:`, error);
				}
			}),
		);
	}

	private connectToTranscriptionStreams() {
		const activeStatuses = ["selected", "uploading", "processing", "transcribing"];
		for (const transcription of this.transcriptions) {
			if (activeStatuses.includes(transcription.status)) {
				this.connectToStream(transcription.id);
			}
		}
	}

	private connectToStream(transcriptionId: string) {
		if (this.eventSources.has(transcriptionId)) return;

		const eventSource = new EventSource(`/api/transcriptions/${transcriptionId}/stream`);

		eventSource.addEventListener("update", async (event) => {
			const update = JSON.parse(event.data);
			const transcription = this.transcriptions.find((t) => t.id === transcriptionId);

			if (transcription) {
				if (update.status !== undefined) transcription.status = update.status;
				if (update.progress !== undefined) transcription.progress = update.progress;

				if (update.status === "completed") {
					await this.loadVTTForCompleted();
					eventSource.close();
					this.eventSources.delete(transcriptionId);
				}

				this.requestUpdate();
			}
		});

		eventSource.onerror = () => {
			eventSource.close();
			this.eventSources.delete(transcriptionId);
		};

		this.eventSources.set(transcriptionId, eventSource);
	}

	private get filteredTranscriptions() {
		if (!this.searchQuery) return this.transcriptions;

		const query = this.searchQuery.toLowerCase();
		return this.transcriptions.filter((t) =>
			t.original_filename.toLowerCase().includes(query),
		);
	}

	private formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	private getMeetingLabel(meetingTimeId: string | null): string {
		if (!meetingTimeId) return "";
		const meeting = this.meetingTimes.find((m) => m.id === meetingTimeId);
		return meeting ? meeting.label : "";
	}

	private handleUploadClick() {
		this.uploadModalOpen = true;
	}

	private handleModalClose() {
		this.uploadModalOpen = false;
	}

	private async handleUploadSuccess() {
		this.uploadModalOpen = false;
		// Reload class data to show new recording
		await this.loadClass();
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading class...</div>`;
		}

		if (this.error) {
			return html`
        <div class="error">${this.error}</div>
        <a href="/classes">← Back to classes</a>
      `;
		}

		if (!this.classInfo) {
			return html`
        <div class="error">Class not found</div>
        <a href="/classes">← Back to classes</a>
      `;
		}

		return html`
      <div class="header">
        <a href="/classes" class="back-link">← Back to all classes</a>

        ${this.classInfo.archived ? html`<div class="archived-banner">⚠️ This class is archived - no new recordings can be uploaded</div>` : ""}

        <div class="class-header">
          <div class="class-info">
            <div class="course-code">${this.classInfo.course_code}</div>
            <h1>${this.classInfo.name}</h1>
            <div class="professor">Professor: ${this.classInfo.professor}</div>
            <div class="semester">${this.classInfo.semester} ${this.classInfo.year}</div>
          </div>
        </div>

        ${
					this.meetingTimes.length > 0
						? html`
          <div class="meetings-section">
            <h2>Meeting Times</h2>
            <div class="meetings-list">
              ${this.meetingTimes.map((meeting) => html`<div class="meeting-tag">${meeting.label}</div>`)}
            </div>
          </div>
        `
						: ""
				}

        <div class="search-upload">
          <input
            type="text"
            class="search-box"
            placeholder="Search recordings..."
            .value=${this.searchQuery}
            @input=${(e: Event) => {
							this.searchQuery = (e.target as HTMLInputElement).value;
						}}
          />
          <button 
            class="upload-button" 
            ?disabled=${this.classInfo.archived}
            @click=${this.handleUploadClick}
          >
            📤 Upload Recording
          </button>
        </div>
      </div>

      ${
				this.filteredTranscriptions.length === 0
					? html`
        <div class="empty-state">
          <h2>${this.searchQuery ? "No matching recordings" : "No recordings yet"}</h2>
          <p>${this.searchQuery ? "Try a different search term" : "Upload a recording to get started!"}</p>
        </div>
      `
					: html`
        ${this.filteredTranscriptions.map(
					(t) => html`
          <div class="transcription-card">
            <div class="transcription-header">
              <div>
                <div class="transcription-filename">${t.original_filename}</div>
                ${
									t.meeting_time_id
										? html`<div class="transcription-date">${this.getMeetingLabel(t.meeting_time_id)} • ${this.formatDate(t.created_at)}</div>`
										: html`<div class="transcription-date">${this.formatDate(t.created_at)}</div>`
								}
              </div>
              <span class="transcription-status status-${t.status}">${t.status}</span>
            </div>

            ${
							["uploading", "processing", "transcribing", "selected"].includes(
								t.status,
							)
								? html`
              <div class="progress-bar">
                <div 
                  class="progress-fill ${t.status === "processing" ? "indeterminate" : ""}" 
                  style="${t.status === "processing" ? "" : `width: ${t.progress}%`}"
                ></div>
              </div>
            `
								: ""
						}

            ${
							t.status === "completed" && (t as any).audioUrl && (t as any).vttContent
								? html`
              <div class="audio-player">
                <audio id="audio-${t.id}" preload="metadata" controls src="${(t as any).audioUrl}"></audio>
              </div>
              <vtt-viewer .vttContent=${(t as any).vttContent} .audioId=${`audio-${t.id}`}></vtt-viewer>
            `
								: ""
						}

            ${t.error_message ? html`<div class="error">${t.error_message}</div>` : ""}
          </div>
        `,
				)}
      `
			}

      <upload-recording-modal
        ?open=${this.uploadModalOpen}
        .classId=${this.classId}
        .meetingTimes=${this.meetingTimes.map((m) => ({ id: m.id, label: m.label }))}
        @close=${this.handleModalClose}
        @upload-success=${this.handleUploadSuccess}
      ></upload-recording-modal>
    `;
	}
}
