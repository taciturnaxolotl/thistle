import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./vtt-viewer.ts";

interface TranscriptionJob {
	id: string;
	filename: string;
	class_name?: string;
	status: "uploading" | "processing" | "transcribing" | "completed" | "failed";
	progress: number;
	transcript?: string;
	created_at: number;
	audioUrl?: string;
	vttSegments?: VTTSegment[];
	vttContent?: string;
}

interface VTTSegment {
	start: number;
	end: number;
	text: string;
	index?: string;
}

class WordStreamer {
	private queue: string[] = [];
	private isProcessing = false;
	private wordDelay: number;
	private onWord: (word: string) => void;

	constructor(wordDelay: number = 50, onWord: (word: string) => void) {
		this.wordDelay = wordDelay;
		this.onWord = onWord;
	}

	addChunk(text: string) {
		// Split on whitespace and filter out empty strings
		const words = text.split(/(\s+)/).filter((w) => w.length > 0);
		this.queue.push(...words);

		// Start processing if not already running
		if (!this.isProcessing) {
			this.processQueue();
		}
	}

	private async processQueue() {
		this.isProcessing = true;

		while (this.queue.length > 0) {
			const word = this.queue.shift();
			if (!word) break;
			this.onWord(word);
			await new Promise((resolve) => setTimeout(resolve, this.wordDelay));
		}

		this.isProcessing = false;
	}

	showAll() {
		// Drain entire queue immediately
		while (this.queue.length > 0) {
			const word = this.queue.shift();
			if (!word) break;
			this.onWord(word);
		}
		this.isProcessing = false;
	}

	clear() {
		this.queue = [];
		this.isProcessing = false;
	}
}

@customElement("transcription-component")
export class TranscriptionComponent extends LitElement {
	@state() jobs: TranscriptionJob[] = [];
	@state() isUploading = false;
	@state() dragOver = false;
	@state() serviceAvailable = true;
	@state() existingClasses: string[] = [];
	@state() showNewClassInput = false;
	@state() hasSubscription = false;
	@state() isAdmin = false;
	// Word streamers for each job
	private wordStreamers = new Map<string, WordStreamer>();
	// Displayed transcripts
	private displayedTranscripts = new Map<string, string>();
	// Track last full transcript to compare
	private lastTranscripts = new Map<string, string>();

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
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--text);
      line-height: 1.6;
      word-wrap: break-word;
    }

    .segment {
      cursor: pointer;
      transition: background 0.1s;
      display: inline;
    }

    .segment:hover {
      background: color-mix(in srgb, var(--primary) 15%, transparent);
      border-radius: 2px;
    }

    .current-segment {
      background: color-mix(in srgb, var(--accent) 30%, transparent);
      border-radius: 2px;
    }

    .paragraph {
      display: block;
      margin: 0 0 1rem 0;
      line-height: 1.6;
    }

    .audio-player {
      margin-top: 1rem;
      width: 100%;
    }

    .audio-player audio {
      width: 100%;
      height: 2.5rem;
    }

    .hidden {
      display: none;
    }

    .file-input {
      display: none;
    }

    .upload-form {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .class-input {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text);
      background: var(--background);
    }

    .class-input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .class-input::placeholder {
      color: var(--paynes-gray);
      opacity: 0.6;
    }

    .class-select {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text);
      background: var(--background);
      cursor: pointer;
    }

    .class-select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .class-select option {
      padding: 0.5rem;
    }

    .class-group {
      margin-bottom: 2rem;
    }

    .class-header {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--accent);
    }

    .no-class-header {
      border-bottom-color: var(--secondary);
    }
  `;

	private eventSources: Map<string, EventSource> = new Map();
	private handleAuthChange = async () => {
		await this.checkHealth();
		await this.loadJobs();
		await this.loadExistingClasses();
		this.connectToJobStreams();
	};

	private async loadExistingClasses() {
		try {
			const response = await fetch("/api/transcriptions");
			if (!response.ok) {
				this.existingClasses = [];
				return;
			}

			const data = await response.json();
			const jobs = data.jobs || [];

			// Extract unique class names
			const classSet = new Set<string>();
			for (const job of jobs) {
				if (job.class_name) {
					classSet.add(job.class_name);
				}
			}

			this.existingClasses = Array.from(classSet).sort();
		} catch (error) {
			console.error("Failed to load classes:", error);
			this.existingClasses = [];
		}
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.checkAuth();
		await this.checkHealth();
		await this.loadJobs();
		await this.loadExistingClasses();
		this.connectToJobStreams();

		// Listen for auth changes to reload jobs
		window.addEventListener("auth-changed", this.handleAuthChange);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		// Clean up all event sources and word streamers
		for (const es of this.eventSources.values()) {
			es.close();
		}
		this.eventSources.clear();

		for (const streamer of this.wordStreamers.values()) {
			streamer.clear();
		}
		this.wordStreamers.clear();
		this.displayedTranscripts.clear();
		this.lastTranscripts.clear();

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
		eventSource.addEventListener("update", async (event) => {
			const update = JSON.parse(event.data);

			// Update the job in our list efficiently (mutate in place for Lit)
			const job = this.jobs.find((j) => j.id === jobId);
			if (job) {
				// Update properties directly
				if (update.status !== undefined) job.status = update.status;
				if (update.progress !== undefined) job.progress = update.progress;
				if (update.transcript !== undefined) {
					job.transcript = update.transcript;

					// Get or create word streamer for this job
					if (!this.wordStreamers.has(jobId)) {
						const streamer = new WordStreamer(50, (word) => {
							const current = this.displayedTranscripts.get(jobId) || "";
							this.displayedTranscripts.set(jobId, current + word);
							this.requestUpdate();
						});
						this.wordStreamers.set(jobId, streamer);
					}

					const streamer = this.wordStreamers.get(jobId);
					if (!streamer) return;
					const lastTranscript = this.lastTranscripts.get(jobId) || "";
					const newTranscript = update.transcript;

					// Check if this is new content we haven't seen
					if (newTranscript !== lastTranscript) {
						// If new transcript starts with last transcript, it's cumulative - add diff
						if (newTranscript.startsWith(lastTranscript)) {
							const newPortion = newTranscript.slice(lastTranscript.length);
							if (newPortion.trim()) {
								streamer.addChunk(newPortion);
							}
						} else {
							// Completely different segment, add space separator then new content
							if (lastTranscript) {
								streamer.addChunk(" ");
							}
							streamer.addChunk(newTranscript);
						}
						this.lastTranscripts.set(jobId, newTranscript);
					}

					// On completion, show everything immediately
					if (update.status === "completed") {
						streamer.showAll();
						this.wordStreamers.delete(jobId);
						this.lastTranscripts.delete(jobId);
					}
				}

				// Trigger Lit re-render by creating new array reference
				this.jobs = [...this.jobs];

				// Close connection if job is complete or failed
				if (update.status === "completed" || update.status === "failed") {
					eventSource.close();
					this.eventSources.delete(jobId);

					// Clean up streamer
					const streamer = this.wordStreamers.get(jobId);
					if (streamer) {
						streamer.clear();
						this.wordStreamers.delete(jobId);
					}
					this.lastTranscripts.delete(jobId);

					// Load VTT for completed jobs
					if (update.status === "completed") {
						await this.loadVTTForJob(jobId);
					}
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

	async checkAuth() {
		try {
			const response = await fetch("/api/auth/me");
			if (response.ok) {
				const data = await response.json();
				this.hasSubscription = data.has_subscription || false;
				this.isAdmin = data.role === "admin";
			}
		} catch (error) {
			console.warn("Failed to check auth:", error);
		}
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

				// Initialize displayedTranscripts for completed/failed jobs
				for (const job of this.jobs) {
					if (
						(job.status === "completed" || job.status === "failed") &&
						job.transcript
					) {
						this.displayedTranscripts.set(job.id, job.transcript);
					}

					// Fetch VTT for completed jobs
					if (job.status === "completed") {
						await this.loadVTTForJob(job.id);
					}
				}
				// Don't override serviceAvailable - it's set by checkHealth()
			} else if (response.status === 403) {
				// Subscription required - already handled by checkAuth
				this.jobs = [];
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

	private async loadVTTForJob(jobId: string) {
		try {
			const response = await fetch(`/api/transcriptions/${jobId}?format=vtt`);
			if (response.ok) {
				const vttContent = await response.text();

				// Update job with VTT content
				const job = this.jobs.find((j) => j.id === jobId);
				if (job) {
					job.vttContent = vttContent;
					job.audioUrl = `/api/transcriptions/${jobId}/audio`;
					this.jobs = [...this.jobs];
				}
			}
		} catch (error) {
			console.warn(`Failed to load VTT for job ${jobId}:`, error);
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

	private handleClassSelectChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		this.showNewClassInput = select.value === "__new__";
	}

	private async uploadFile(file: File) {
		const allowedTypes = [
			"audio/mpeg", // MP3
			"audio/wav", // WAV
			"audio/x-wav", // WAV (alternative)
			"audio/m4a", // M4A
			"audio/x-m4a", // M4A (alternative)
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
			// Get class name from dropdown or input
			let className = "";

			if (this.showNewClassInput) {
				const classInput = this.shadowRoot?.querySelector(
					"#class-name-input",
				) as HTMLInputElement;
				className = classInput?.value?.trim() || "";
			} else {
				const classSelect = this.shadowRoot?.querySelector(
					"#class-select",
				) as HTMLSelectElement;
				const selectedValue = classSelect?.value;
				if (
					selectedValue &&
					selectedValue !== "__new__" &&
					selectedValue !== ""
				) {
					className = selectedValue;
				}
			}

			const formData = new FormData();
			formData.append("audio", file);
			if (className) {
				formData.append("class_name", className);
			}

			const response = await fetch("/api/transcriptions", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const data = await response.json();
				if (response.status === 403) {
					// Subscription required
					if (
						confirm(
							"Active subscription required to upload transcriptions. Would you like to subscribe now?",
						)
					) {
						window.location.href = "/settings?tab=billing";
						return;
					}
				} else {
					alert(
						data.error ||
							"Upload failed - transcription service may be unavailable",
					);
				}
			} else {
				await response.json();
				// Redirect to class page after successful upload
				let className = "";

				if (this.showNewClassInput) {
					const classInput = this.shadowRoot?.querySelector(
						"#class-name-input",
					) as HTMLInputElement;
					className = classInput?.value?.trim() || "";
				} else {
					const classSelect = this.shadowRoot?.querySelector(
						"#class-select",
					) as HTMLSelectElement;
					const selectedValue = classSelect?.value;
					if (
						selectedValue &&
						selectedValue !== "__new__" &&
						selectedValue !== ""
					) {
						className = selectedValue;
					}
				}

				if (className) {
					window.location.href = `/class/${encodeURIComponent(className)}`;
				} else {
					window.location.href = "/class/uncategorized";
				}
			}
		} catch {
			alert("Upload failed - transcription service may be unavailable");
		} finally {
			this.isUploading = false;
		}
	}

	override render() {
		const canUpload = this.serviceAvailable && (this.hasSubscription || this.isAdmin);

		return html`
      ${!this.hasSubscription && !this.isAdmin ? html`
        <div style="background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid var(--accent); border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; text-align: center;">
          <h3 style="margin: 0 0 0.5rem 0; color: var(--text);">Subscribe to Upload Transcriptions</h3>
          <p style="margin: 0 0 1rem 0; color: var(--text); opacity: 0.8;">You need an active subscription to upload and transcribe audio files.</p>
          <a href="/settings?tab=billing" style="display: inline-block; padding: 0.75rem 1.5rem; background: var(--accent); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: opacity 0.2s;">Subscribe Now</a>
        </div>
      ` : ''}

      <div class="upload-area ${this.dragOver ? "drag-over" : ""} ${!canUpload ? "disabled" : ""}"
           @dragover=${canUpload ? this.handleDragOver : null}
           @dragleave=${canUpload ? this.handleDragLeave : null}
           @drop=${canUpload ? this.handleDrop : null}
           @click=${canUpload ? () => (this.shadowRoot?.querySelector(".file-input") as HTMLInputElement)?.click() : null}>
        <div class="upload-icon">🎵</div>
        <div class="upload-text">
          ${
						!this.serviceAvailable
							? "Transcription service unavailable"
							: !this.hasSubscription && !this.isAdmin
								? "Subscription required"
								: this.isUploading
									? "Uploading..."
									: "Drop audio file here or click to browse"
					}
        </div>
        <div class="upload-hint">
          ${canUpload ? "Supports MP3, WAV, M4A, AAC, OGG, WebM, FLAC up to 100MB" : "Transcription is currently unavailable"}
        </div>
        <input type="file" class="file-input" accept="audio/mpeg,audio/wav,audio/m4a,audio/mp4,audio/aac,audio/ogg,audio/webm,audio/flac,.m4a" @change=${this.handleFileSelect} ${!canUpload ? "disabled" : ""} />
      </div>

      ${
				canUpload
					? html`
        <div class="upload-form">
          <select
            id="class-select"
            class="class-select"
            ?disabled=${this.isUploading}
            @change=${this.handleClassSelectChange}
          >
            <option value="">Select a class (optional)</option>
            ${this.existingClasses.map(
							(className) => html`
              <option value=${className}>${className}</option>
            `,
						)}
            <option value="__new__">+ Add new class</option>
          </select>
          
          ${
						this.showNewClassInput
							? html`
            <input
              type="text"
              id="class-name-input"
              class="class-input"
              placeholder="Enter new class name"
              ?disabled=${this.isUploading}
            />
          `
							: ""
					}
        </div>
      `
					: ""
			}
    `;
	}
}
