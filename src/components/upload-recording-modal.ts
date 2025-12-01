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
	@state() private uploadProgress = 0;
	@state() private error: string | null = null;
	@state() private detectedMeetingTime: string | null = null;
	@state() private detectingMeetingTime = false;
	@state() private uploadComplete = false;
	@state() private uploadedTranscriptionId: string | null = null;
	@state() private submitting = false;
	@state() private selectedDate: string = "";

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
			this.uploadComplete = false;
			this.uploadedTranscriptionId = null;
			this.submitting = false;
			this.selectedDate = "";

			if (this.selectedFile && this.classId) {
				// Set initial date from file
				const fileDate = new Date(this.selectedFile.lastModified);
				this.selectedDate = fileDate.toISOString().split("T")[0] || "";
				// Start both detection and upload in parallel
				this.detectMeetingTime();
				this.startBackgroundUpload();
			}
		}
	}

	private async startBackgroundUpload() {
		if (!this.selectedFile) return;

		this.uploading = true;
		this.uploadProgress = 0;

		try {
			const formData = new FormData();
			formData.append("audio", this.selectedFile);
			formData.append("class_id", this.classId);

			// Send recording date (from date picker or file timestamp)
			if (this.selectedDate) {
				// Convert YYYY-MM-DD to timestamp (noon local time)
				const date = new Date(`${this.selectedDate}T12:00:00`);
				formData.append("recording_date", Math.floor(date.getTime() / 1000).toString());
			} else if (this.selectedFile.lastModified) {
				// Use file's lastModified as recording date
				formData.append("recording_date", Math.floor(this.selectedFile.lastModified / 1000).toString());
			}

			// Don't send section_id yet - will be set via PATCH when user confirms

			const xhr = new XMLHttpRequest();

			// Track upload progress
			xhr.upload.addEventListener("progress", (e) => {
				if (e.lengthComputable) {
					this.uploadProgress = Math.round((e.loaded / e.total) * 100);
				}
			});

			// Handle completion
			xhr.addEventListener("load", () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					this.uploadComplete = true;
					this.uploading = false;
					const response = JSON.parse(xhr.responseText);
					this.uploadedTranscriptionId = response.id;
				} else {
					this.uploading = false;
					const response = JSON.parse(xhr.responseText);
					this.error = response.error || "Upload failed";
				}
			});

			// Handle errors
			xhr.addEventListener("error", () => {
				this.uploading = false;
				this.error = "Upload failed. Please try again.";
			});

			xhr.open("POST", "/api/transcriptions");
			xhr.send(formData);
		} catch (error) {
			console.error("Upload failed:", error);
			this.uploading = false;
			this.error =
				error instanceof Error
					? error.message
					: "Upload failed. Please try again.";
		}
	}

	private async detectMeetingTime() {
		if (!this.classId) return;

		this.detectingMeetingTime = true;

		try {
			const formData = new FormData();
			formData.append("class_id", this.classId);

			// Use selected date or file's lastModified timestamp
			let timestamp: number;
			if (this.selectedDate) {
				// Convert YYYY-MM-DD to timestamp (noon local time to avoid timezone issues)
				const date = new Date(`${this.selectedDate}T12:00:00`);
				timestamp = date.getTime();
			} else if (this.selectedFile?.lastModified) {
				timestamp = this.selectedFile.lastModified;
			} else {
				return;
			}

			formData.append("file_timestamp", timestamp.toString());

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

	private handleDateChange(e: Event) {
		const input = e.target as HTMLInputElement;
		this.selectedDate = input.value;
		// Re-detect meeting time when date changes
		if (this.selectedDate && this.classId) {
			this.detectMeetingTime();
		}
	}

	private handleSectionChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		this.selectedSectionId = select.value || null;
	}

	private async handleSubmit() {
		if (!this.uploadedTranscriptionId || !this.selectedMeetingTimeId) return;

		this.submitting = true;
		this.error = null;

		try {
			// Get section to use (selected override or user's section)
			const sectionToUse = this.selectedSectionId || this.userSection;

			const response = await fetch(
				`/api/transcriptions/${this.uploadedTranscriptionId}/meeting-time`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						meeting_time_id: this.selectedMeetingTimeId,
						section_id: sectionToUse,
					}),
				},
			);

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to update meeting time";
				this.submitting = false;
				return;
			}

			// Success - close modal and refresh
			this.dispatchEvent(new CustomEvent("upload-success"));
			this.handleClose();
		} catch (error) {
			console.error("Failed to update meeting time:", error);
			this.error = "Failed to update meeting time";
			this.submitting = false;
		}
	}

	private handleClose() {
		if (this.uploading || this.submitting) return;
		this.open = false;
		this.selectedFile = null;
		this.selectedMeetingTimeId = null;
		this.selectedSectionId = null;
		this.error = null;
		this.detectedMeetingTime = null;
		this.detectingMeetingTime = false;
		this.uploadComplete = false;
		this.uploadProgress = 0;
		this.uploadedTranscriptionId = null;
		this.submitting = false;
		this.selectedDate = "";
		this.dispatchEvent(new CustomEvent("close"));
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
                  <label for="date">Recording Date</label>
                  <input
                    type="date"
                    id="date"
                    .value=${this.selectedDate}
                    @change=${this.handleDateChange}
                    ?disabled=${this.uploading}
                    style="padding: 0.75rem; border: 1px solid var(--secondary); border-radius: 4px; font-size: 0.875rem; color: var(--text); background: var(--background);"
                  />
                  <div class="help-text">
                    Change the date to detect the correct meeting time
                  </div>
                </div>

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
							this.sections.length > 0 && this.selectedFile
								? html`
                <div class="form-group">
                  <label for="section">Section</label>
                  <select
                    id="section"
                    @change=${this.handleSectionChange}
                    ?disabled=${this.uploading}
                    .value=${this.selectedSectionId || this.userSection || ""}
                  >
                    <option value="">Use my section ${this.userSection ? `(${this.sections.find((s) => s.id === this.userSection)?.section_number})` : ""}</option>
                    ${this.sections
											.filter((section) => section.id !== this.userSection)
											.map(
												(section) => html`
                      <option value=${section.id}>${section.section_number}</option>
                    `,
											)}
                  </select>
                  <div class="help-text">
                    Select which section this recording is for (defaults to your section)
                  </div>
                </div>
              `
								: ""
						}

            ${
							this.uploading || this.uploadComplete
								? html`
                <div class="form-group">
                  <label>Upload Status</label>
                  <div style="background: color-mix(in srgb, var(--primary) 5%, transparent); border-radius: 8px; padding: 1rem;">
                    ${
											this.uploadComplete
												? html`
                      <div style="color: green; font-weight: 500;">
                        ✓ Upload complete! Select a meeting time to continue.
                      </div>
                    `
												: html`
                      <div style="color: var(--text); font-weight: 500; margin-bottom: 0.5rem;">
                        Uploading... ${this.uploadProgress}%
                      </div>
                      <div style="background: var(--secondary); border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: var(--accent); height: 100%; width: ${this.uploadProgress}%; transition: width 0.3s;"></div>
                      </div>
                    `
										}
                  </div>
                </div>
              `
								: ""
						}
          </form>

          <div class="modal-footer">
            <button class="btn-cancel" @click=${this.handleClose} ?disabled=${this.uploading || this.submitting}>
              Cancel
            </button>
            ${
							this.uploadComplete && this.selectedMeetingTimeId
								? html`
              <button class="btn-upload" @click=${this.handleSubmit} ?disabled=${this.submitting}>
                ${this.submitting ? "Submitting..." : "Confirm & Submit"}
              </button>
            `
								: ""
						}
          </div>
        </div>
      </div>
    `;
	}
}
