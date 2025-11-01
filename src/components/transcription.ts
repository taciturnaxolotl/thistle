import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface TranscriptionJob {
	id: string;
	filename: string;
	status: "uploading" | "processing" | "transcribing" | "completed" | "failed";
	progress: number;
	transcript?: string;
	created_at: number;
}

@customElement("transcription-component")
export class TranscriptionComponent extends LitElement {
	@state() jobs: TranscriptionJob[] = [];
	@state() isUploading = false;
	@state() dragOver = false;
	@state() serviceAvailable = true;

	static override styles = css`
    :host {
      display: block;
    }

    .upload-area {
      border: 2px dashed var(--secondary);
      border-radius: 8px;
      padding: 3rem 2rem;
      text-align: center;
      transition: all 0.2s;
      cursor: pointer;
      background: var(--background);
    }

    .upload-area:hover,
    .upload-area.drag-over {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, transparent);
    }

    .upload-area.disabled {
      border-color: var(--secondary);
      opacity: 0.6;
      cursor: not-allowed;
    }

    .upload-area.disabled:hover {
      border-color: var(--secondary);
      background: transparent;
    }

    .upload-icon {
      font-size: 3rem;
      color: var(--secondary);
      margin-bottom: 1rem;
    }

    .upload-text {
      color: var(--text);
      font-size: 1.125rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .upload-hint {
      color: var(--text);
      opacity: 0.7;
      font-size: 0.875rem;
    }

    .jobs-section {
      margin-top: 2rem;
    }

    .jobs-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 1rem;
    }

    .job-card {
      background: var(--background);
      border: 1px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .job-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .job-filename {
      font-weight: 500;
      color: var(--text);
    }

    .job-status {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-uploading {
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      color: var(--primary);
    }

    .status-processing {
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      color: var(--primary);
    }

    .status-transcribing {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
    }

    .status-completed {
      background: color-mix(in srgb, var(--success) 10%, transparent);
      color: var(--success);
    }

    .status-failed {
      background: color-mix(in srgb, var(--text) 10%, transparent);
      color: var(--text);
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: var(--secondary);
      border-radius: 2px;
      margin-bottom: 1rem;
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 2px;
      transition: width 0.3s;
    }

    .progress-fill.indeterminate {
      width: 30%;
      background: var(--primary);
      animation: progress-slide 1.5s ease-in-out infinite;
    }

    @keyframes progress-slide {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(333%);
      }
    }

    .job-transcript {
      background: color-mix(in srgb, var(--primary) 5%, transparent);
      border-radius: 6px;
      padding: 1rem;
      margin-top: 1rem;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--text);
    }

    .hidden {
      display: none;
    }

    .file-input {
      display: none;
    }
  `;

	private eventSources: Map<string, EventSource> = new Map();
	private handleAuthChange = async () => {
		await this.checkHealth();
		await this.loadJobs();
		this.connectToJobStreams();
	};

	override async connectedCallback() {
		super.connectedCallback();
		await this.checkHealth();
		await this.loadJobs();
		this.connectToJobStreams();

		// Listen for auth changes to reload jobs
		window.addEventListener("auth-changed", this.handleAuthChange);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		// Clean up all event sources
		for (const es of this.eventSources.values()) {
			es.close();
		}
		this.eventSources.clear();
		window.removeEventListener("auth-changed", this.handleAuthChange);
	}

	private connectToJobStreams() {
		// Connect to SSE streams for active jobs
		for (const job of this.jobs) {
			if (
				job.status === "processing" ||
				job.status === "transcribing" ||
				job.status === "uploading"
			) {
				this.connectToJobStream(job.id);
			}
		}
	}

	private connectToJobStream(jobId: string, retryCount = 0) {
		if (this.eventSources.has(jobId)) {
			return; // Already connected
		}

		const eventSource = new EventSource(`/api/transcriptions/${jobId}/stream`);

		// Handle named "update" events from SSE stream
		eventSource.addEventListener("update", (event) => {
			const update = JSON.parse(event.data);

			// Update the job in our list efficiently (mutate in place for Lit)
			const job = this.jobs.find((j) => j.id === jobId);
			if (job) {
				// Update properties directly
				if (update.status !== undefined) job.status = update.status;
				if (update.progress !== undefined) job.progress = update.progress;
				if (update.transcript !== undefined) job.transcript = update.transcript;

				// Trigger Lit re-render by creating new array reference
				this.jobs = [...this.jobs];

				// Close connection if job is complete or failed
				if (update.status === "completed" || update.status === "failed") {
					eventSource.close();
					this.eventSources.delete(jobId);
				}
			}
		});

		eventSource.onerror = (error) => {
			console.warn(`SSE connection error for job ${jobId}:`, error);
			eventSource.close();
			this.eventSources.delete(jobId);

			// Check if the job still exists before retrying
			const job = this.jobs.find((j) => j.id === jobId);
			if (!job) {
				console.log(`Job ${jobId} no longer exists, skipping retry`);
				return;
			}

			// Don't retry if job is already in a terminal state
			if (job.status === "completed" || job.status === "failed") {
				console.log(`Job ${jobId} is ${job.status}, skipping retry`);
				return;
			}

			// Retry connection up to 3 times with exponential backoff
			if (retryCount < 3) {
				const backoff = 2 ** retryCount * 1000; // 1s, 2s, 4s
				console.log(
					`Retrying connection in ${backoff}ms (attempt ${retryCount + 1}/3)`,
				);
				setTimeout(() => {
					this.connectToJobStream(jobId, retryCount + 1);
				}, backoff);
			} else {
				console.error(`Failed to connect to job ${jobId} after 3 attempts`);
			}
		};

		this.eventSources.set(jobId, eventSource);
	}

	async checkHealth() {
		try {
			const response = await fetch("/api/transcriptions/health");
			if (response.ok) {
				const data = await response.json();
				this.serviceAvailable = data.available;
			} else {
				this.serviceAvailable = false;
			}
		} catch {
			this.serviceAvailable = false;
		}
	}

	async loadJobs() {
		try {
			const response = await fetch("/api/transcriptions");
			if (response.ok) {
				const data = await response.json();
				this.jobs = data.jobs;
				// Don't override serviceAvailable - it's set by checkHealth()
			} else if (response.status === 404) {
				// Transcription service not available - show empty state
				this.jobs = [];
			} else {
				console.error("Failed to load jobs:", response.status);
			}
		} catch (error) {
			// Network error or service unavailable - don't break the page
			console.warn("Transcription service unavailable:", error);
			this.jobs = [];
		}
	}

	private handleDragOver(e: DragEvent) {
		e.preventDefault();
		this.dragOver = true;
	}

	private handleDragLeave(e: DragEvent) {
		e.preventDefault();
		this.dragOver = false;
	}

	private async handleDrop(e: DragEvent) {
		e.preventDefault();
		this.dragOver = false;

		const files = e.dataTransfer?.files;
		const file = files?.[0];
		if (file) {
			await this.uploadFile(file);
		}
	}

	private async handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			await this.uploadFile(file);
		}
	}

	private async uploadFile(file: File) {
		const allowedTypes = [
			"audio/mpeg", // MP3
			"audio/wav", // WAV
			"audio/x-wav", // WAV (alternative)
			"audio/m4a", // M4A
			"audio/mp4", // MP4 audio
			"audio/aac", // AAC
			"audio/ogg", // OGG
			"audio/webm", // WebM audio
			"audio/flac", // FLAC
		];

		// Also check file extension for M4A files (sometimes MIME type isn't set correctly)
		const isM4A = file.name.toLowerCase().endsWith(".m4a");
		const isAllowedType =
			allowedTypes.includes(file.type) || (isM4A && file.type === "");

		if (!isAllowedType) {
			alert(
				"Please select a supported audio file (MP3, WAV, M4A, AAC, OGG, WebM, or FLAC)",
			);
			return;
		}

		if (file.size > 100 * 1024 * 1024) {
			// 100MB limit
			alert("File size must be less than 100MB");
			return;
		}

		this.isUploading = true;

		try {
			const formData = new FormData();
			formData.append("audio", file);

			const response = await fetch("/api/transcriptions", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const data = await response.json();
				alert(
					data.error ||
						"Upload failed - transcription service may be unavailable",
				);
			} else {
				const result = await response.json();
				await this.loadJobs();
				// Connect to SSE stream for this new job
				this.connectToJobStream(result.id);
			}
		} catch {
			alert("Upload failed - transcription service may be unavailable");
		} finally {
			this.isUploading = false;
		}
	}

	private getStatusClass(status: string) {
		return `status-${status}`;
	}

	override render() {
		return html`
      <div class="upload-area ${this.dragOver ? "drag-over" : ""} ${!this.serviceAvailable ? "disabled" : ""}"
           @dragover=${this.serviceAvailable ? this.handleDragOver : null}
           @dragleave=${this.serviceAvailable ? this.handleDragLeave : null}
           @drop=${this.serviceAvailable ? this.handleDrop : null}
           @click=${this.serviceAvailable ? () => (this.shadowRoot?.querySelector(".file-input") as HTMLInputElement)?.click() : null}>
        <div class="upload-icon">🎵</div>
        <div class="upload-text">
          ${
						!this.serviceAvailable
							? "Transcription service unavailable"
							: this.isUploading
								? "Uploading..."
								: "Drop audio file here or click to browse"
					}
        </div>
        <div class="upload-hint">
          ${this.serviceAvailable ? "Supports MP3, WAV, M4A, AAC, OGG, WebM, FLAC up to 100MB" : "Transcription is currently unavailable"}
        </div>
        <input type="file" class="file-input" accept="audio/mpeg,audio/wav,audio/m4a,audio/mp4,audio/aac,audio/ogg,audio/webm,audio/flac,.m4a" @change=${this.handleFileSelect} ${!this.serviceAvailable ? "disabled" : ""} />
      </div>

      <div class="jobs-section ${this.jobs.length === 0 ? "hidden" : ""}">
        <h3 class="jobs-title">Your Transcriptions</h3>
        ${this.jobs.map(
					(job) => html`
          <div class="job-card">
            <div class="job-header">
              <span class="job-filename">${job.filename}</span>
              <span class="job-status ${this.getStatusClass(job.status)}">${job.status}</span>
            </div>

            ${
							job.status === "uploading" ||
							job.status === "processing" ||
							job.status === "transcribing"
								? html`
              <div class="progress-bar">
                <div class="progress-fill ${job.status === "processing" ? "indeterminate" : ""}" style="${job.status === "processing" ? "" : `width: ${job.progress}%`}"></div>
              </div>
            `
								: ""
						}

            ${
							job.transcript
								? html`
              <div class="job-transcript">${job.transcript}</div>
            `
								: ""
						}
          </div>
        `,
				)}
      </div>
    `;
	}
}
