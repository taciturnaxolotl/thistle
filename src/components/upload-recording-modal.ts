import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface MeetingTime {
	id: string;
	label: string;
}

@customElement("upload-recording-modal")
export class UploadRecordingModal extends LitElement {
	@property({ type: Boolean }) open = false;
	@property({ type: String }) classId = "";
	@property({ type: Array }) meetingTimes: MeetingTime[] = [];

	@state() private selectedFile: File | null = null;
	@state() private selectedMeetingTimeId: string | null = null;
	@state() private uploading = false;
	@state() private error: string | null = null;

	static override styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--background);
      border-radius: 8px;
      padding: 2rem;
      max-width: 32rem;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .modal-header h2 {
      margin: 0;
      color: var(--text);
      font-size: 1.5rem;
    }

    .close-button {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--paynes-gray);
      cursor: pointer;
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .close-button:hover {
      background: var(--secondary);
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      font-weight: 500;
      color: var(--text);
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }

    .file-input-wrapper {
      position: relative;
      border: 2px dashed var(--secondary);
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .file-input-wrapper:hover {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 5%, transparent);
    }

    .file-input-wrapper.has-file {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    input[type="file"] {
      position: absolute;
      opacity: 0;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      cursor: pointer;
    }

    .file-input-label {
      color: var(--paynes-gray);
      font-size: 0.875rem;
    }

    .file-input-label strong {
      color: var(--accent);
    }

    .selected-file {
      margin-top: 0.5rem;
      color: var(--text);
      font-weight: 500;
    }

    select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text);
      background: var(--background);
      cursor: pointer;
    }

    select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .help-text {
      font-size: 0.75rem;
      color: var(--paynes-gray);
      margin-top: 0.25rem;
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

    .modal-footer {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-top: 2rem;
    }

    button {
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
      border: none;
    }

    button:hover:not(:disabled) {
      opacity: 0.9;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-cancel {
      background: var(--secondary);
      color: var(--text);
    }

    .btn-upload {
      background: var(--accent);
      color: var(--white);
    }

    .uploading-text {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `;

	private handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			this.selectedFile = input.files[0] ?? null;
			this.error = null;
		}
	}

	private handleMeetingTimeChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		this.selectedMeetingTimeId = select.value || null;
	}

	private handleClose() {
		if (this.uploading) return;
		this.open = false;
		this.selectedFile = null;
		this.selectedMeetingTimeId = null;
		this.error = null;
		this.dispatchEvent(new CustomEvent("close"));
	}

	private async handleUpload() {
		if (!this.selectedFile) {
			this.error = "Please select a file to upload";
			return;
		}

		if (!this.selectedMeetingTimeId) {
			this.error = "Please select a meeting time";
			return;
		}

		this.uploading = true;
		this.error = null;

		try {
			const formData = new FormData();
			formData.append("audio", this.selectedFile);
			formData.append("class_id", this.classId);
			formData.append("meeting_time_id", this.selectedMeetingTimeId);

			const response = await fetch("/api/transcriptions", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Upload failed");
			}

			// Success - close modal and notify parent
			this.dispatchEvent(new CustomEvent("upload-success"));
			this.handleClose();
		} catch (error) {
			console.error("Upload failed:", error);
			this.error =
				error instanceof Error ? error.message : "Upload failed. Please try again.";
		} finally {
			this.uploading = false;
		}
	}

	override render() {
		if (!this.open) return null;

		return html`
      <div class="overlay" @click=${(e: Event) => e.target === e.currentTarget && this.handleClose()}>
        <div class="modal">
          <div class="modal-header">
            <h2>Upload Recording</h2>
            <button class="close-button" @click=${this.handleClose} ?disabled=${this.uploading}>
              ×
            </button>
          </div>

          ${this.error ? html`<div class="error">${this.error}</div>` : ""}

          <form @submit=${(e: Event) => e.preventDefault()}>
            <div class="form-group">
              <label>Audio File</label>
              <div class="file-input-wrapper ${this.selectedFile ? "has-file" : ""}">
                <input
                  type="file"
                  accept="audio/*,video/mp4,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                  @change=${this.handleFileSelect}
                  ?disabled=${this.uploading}
                />
                <div class="file-input-label">
                  ${
										this.selectedFile
											? html`<div class="selected-file">📎 ${this.selectedFile.name}</div>`
											: html`
                      <div>📤 <strong>Choose a file</strong> or drag it here</div>
                      <div style="margin-top: 0.5rem; font-size: 0.75rem;">
                        Supported: MP3, WAV, M4A, AAC, OGG, WebM, FLAC, MP4
                      </div>
                    `
									}
                </div>
              </div>
              <div class="help-text">Maximum file size: 100MB</div>
            </div>

            <div class="form-group">
              <label for="meeting-time">Meeting Time</label>
              <select
                id="meeting-time"
                @change=${this.handleMeetingTimeChange}
                ?disabled=${this.uploading}
                required
              >
                <option value="">Select a meeting time...</option>
                ${this.meetingTimes.map(
									(meeting) => html`
                  <option value=${meeting.id}>${meeting.label}</option>
                `,
								)}
              </select>
              <div class="help-text">
                Select which meeting this recording is for
              </div>
            </div>
          </form>

          <div class="modal-footer">
            <button class="btn-cancel" @click=${this.handleClose} ?disabled=${this.uploading}>
              Cancel
            </button>
            <button
              class="btn-upload"
              @click=${this.handleUpload}
              ?disabled=${this.uploading || !this.selectedFile || !this.selectedMeetingTimeId}
            >
              ${
								this.uploading
									? html`<span class="uploading-text">Uploading...</span>`
									: "Upload"
							}
            </button>
          </div>
        </div>
      </div>
    `;
	}
}
