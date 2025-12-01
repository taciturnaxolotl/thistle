import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface MeetingTime {
	id: string;
	label: string;
}

interface ClassSection {
	id: string;
	section_number: string;
}

@customElement("upload-recording-modal")
export class UploadRecordingModal extends LitElement {
	@property({ type: Boolean }) open = false;
	@property({ type: String }) classId = "";
	@property({ type: Array }) meetingTimes: MeetingTime[] = [];
	@property({ type: Array }) sections: ClassSection[] = [];
	@property({ type: String }) userSection: string | null = null;

	@state() private selectedFile: File | null = null;
	@state() private selectedMeetingTimeId: string | null = null;
	@state() private selectedSectionId: string | null = null;
	@state() private uploading = false;
	@state() private error: string | null = null;
	@state() private detectedMeetingTime: string | null = null;
	@state() private detectingMeetingTime = false;

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

    .meeting-time-selector {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .meeting-time-button {
      padding: 0.75rem 1rem;
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
      color: var(--text);
      text-align: left;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .meeting-time-button:hover {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, transparent);
    }

    .meeting-time-button.selected {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }

    .meeting-time-button.detected {
      border-color: var(--accent);
    }

    .meeting-time-button.detected::after {
      content: "✨ Auto-detected";
      margin-left: auto;
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .detecting-text {
      font-size: 0.875rem;
      color: var(--paynes-gray);
      padding: 0.5rem;
      text-align: center;
      font-style: italic;
    }
  `;

	private async handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			this.selectedFile = input.files[0] ?? null;
			this.error = null;
			this.detectedMeetingTime = null;
			this.selectedMeetingTimeId = null;

			// Auto-detect meeting time from file metadata
			if (this.selectedFile && this.classId) {
				await this.detectMeetingTime();
			}
		}
	}

	private async detectMeetingTime() {
		if (!this.selectedFile || !this.classId) return;

		this.detectingMeetingTime = true;

		try {
			const formData = new FormData();
			formData.append("audio", this.selectedFile);
			formData.append("class_id", this.classId);

			// Send the file's original lastModified timestamp (preserved by browser)
			// This is more accurate than server-side file timestamps
			if (this.selectedFile.lastModified) {
				formData.append(
					"file_timestamp",
					this.selectedFile.lastModified.toString(),
				);
			}

			const response = await fetch("/api/transcriptions/detect-meeting-time", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				console.warn("Failed to detect meeting time");
				return;
			}

			const data = await response.json();

			if (data.detected && data.meeting_time_id) {
				this.detectedMeetingTime = data.meeting_time_id;
				this.selectedMeetingTimeId = data.meeting_time_id;
			}
		} catch (error) {
			console.warn("Error detecting meeting time:", error);
		} finally {
			this.detectingMeetingTime = false;
		}
	}

	private handleMeetingTimeSelect(meetingTimeId: string) {
		this.selectedMeetingTimeId = meetingTimeId;
	}

	private handleSectionChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		this.selectedSectionId = select.value || null;
	}

	private handleClose() {
		if (this.uploading) return;
		this.open = false;
		this.selectedFile = null;
		this.selectedMeetingTimeId = null;
		this.selectedSectionId = null;
		this.error = null;
		this.detectedMeetingTime = null;
		this.detectingMeetingTime = false;
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

			// Use user's section by default, or allow override
			const sectionToUse = this.selectedSectionId || this.userSection;
			if (sectionToUse) {
				formData.append("section_id", sectionToUse);
			}

			const response = await fetch("/api/transcriptions", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Upload failed");
			}

			// Success
			this.dispatchEvent(new CustomEvent("upload-success"));
			this.handleClose();
		} catch (error) {
			console.error("Upload failed:", error);
			this.error =
				error instanceof Error
					? error.message
					: "Upload failed. Please try again.";
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

            ${
							this.selectedFile
								? html`
                <div class="form-group">
                  <label>Meeting Time</label>
                  ${
										this.detectingMeetingTime
											? html`<div class="detecting-text">Detecting meeting time from audio metadata...</div>`
											: html`
                      <div class="meeting-time-selector">
                        ${this.meetingTimes.map(
													(meeting) => html`
                          <button
                            type="button"
                            class="meeting-time-button ${this.selectedMeetingTimeId === meeting.id ? "selected" : ""} ${this.detectedMeetingTime === meeting.id ? "detected" : ""}"
                            @click=${() => this.handleMeetingTimeSelect(meeting.id)}
                            ?disabled=${this.uploading}
                          >
                            ${meeting.label}
                          </button>
                        `,
												)}
                      </div>
                    `
									}
                  <div class="help-text">
                    ${
											this.detectedMeetingTime
												? "Auto-detected based on recording date. You can change if needed."
												: "Select which meeting this recording is for"
										}
                  </div>
                </div>
              `
								: ""
						}

            ${
							this.sections.length > 1 && this.selectedFile
								? html`
                <div class="form-group">
                  <label for="section">Section (optional)</label>
                  <select
                    id="section"
                    @change=${this.handleSectionChange}
                    ?disabled=${this.uploading}
                  >
                    <option value="">Use my section ${this.userSection ? `(${this.sections.find((s) => s.id === this.userSection)?.section_number})` : ""}</option>
                    ${this.sections.map(
											(section) => html`
                      <option value=${section.id}>${section.section_number}</option>
                    `,
										)}
                  </select>
                  <div class="help-text">
                    Override which section this recording is for
                  </div>
                </div>
              `
								: ""
						}
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
