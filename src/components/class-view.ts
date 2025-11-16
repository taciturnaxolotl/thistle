import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../components/vtt-viewer.ts";

interface TranscriptionJob {
	id: string;
	filename: string;
	class_name?: string;
	status: "uploading" | "processing" | "transcribing" | "completed" | "failed";
	progress: number;
	created_at: number;
	audioUrl?: string;
	vttContent?: string;
}

@customElement("class-view")
export class ClassView extends LitElement {
	@state() override className = "";
	@state() jobs: TranscriptionJob[] = [];
	@state() searchQuery = "";
	@state() isLoading = true;
	private eventSources: Map<string, EventSource> = new Map();

	static override styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
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

    h1 {
      color: var(--text);
      margin: 0;
    }

    .search-box {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--secondary);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text);
      background: var(--background);
      width: 20rem;
    }

    .search-box:focus {
      outline: none;
      border-color: var(--primary);
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

    .job-date {
      font-size: 0.875rem;
      color: var(--paynes-gray);
    }

    .job-status {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-completed {
      background: color-mix(in srgb, green 10%, transparent);
      color: green;
    }

    .status-failed {
      background: color-mix(in srgb, var(--text) 10%, transparent);
      color: var(--text);
    }

    .status-processing, .status-transcribing, .status-uploading {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
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
  `;

	override async connectedCallback() {
		super.connectedCallback();
		this.extractClassName();
		await this.loadJobs();
		this.connectToJobStreams();

		window.addEventListener("auth-changed", this.handleAuthChange);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener("auth-changed", this.handleAuthChange);
	}

	private handleAuthChange = async () => {
		await this.loadJobs();
	};

	private extractClassName() {
		const path = window.location.pathname;
		const match = path.match(/^\/class\/(.+)$/);
		if (match) {
			this.className = decodeURIComponent(match[1] ?? "");
		}
	}

	private async loadJobs() {
		this.isLoading = true;
		try {
			const response = await fetch("/api/transcriptions");
			if (!response.ok) {
				if (response.status === 401) {
					this.jobs = [];
					return;
				}
				throw new Error("Failed to load transcriptions");
			}

			const data = await response.json();
			const allJobs = data.jobs || [];

			// Filter by class
			if (this.className === "uncategorized") {
				this.jobs = allJobs.filter((job: TranscriptionJob) => !job.class_name);
			} else {
				this.jobs = allJobs.filter(
					(job: TranscriptionJob) => job.class_name === this.className,
				);
			}

			// Load VTT for completed jobs
			await this.loadVTTForCompletedJobs();
		} catch (error) {
			console.error("Failed to load jobs:", error);
		} finally {
			this.isLoading = false;
		}
	}

	private async loadVTTForCompletedJobs() {
		const completedJobs = this.jobs.filter((job) => job.status === "completed");

		await Promise.all(
			completedJobs.map(async (job) => {
				try {
					const response = await fetch(
						`/api/transcriptions/${job.id}?format=vtt`,
					);
					if (response.ok) {
						const vttContent = await response.text();
						job.vttContent = vttContent;
						job.audioUrl = `/api/transcriptions/${job.id}/audio`;
						this.requestUpdate();
					}
				} catch (error) {
					console.error(`Failed to load VTT for job ${job.id}:`, error);
				}
			}),
		);
	}

	private connectToJobStreams() {
		// For active jobs, connect to SSE streams
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

	private connectToJobStream(jobId: string) {
		if (this.eventSources.has(jobId)) {
			return;
		}

		const eventSource = new EventSource(`/api/transcriptions/${jobId}/stream`);

		eventSource.addEventListener("update", async (event) => {
			const update = JSON.parse(event.data);

			const job = this.jobs.find((j) => j.id === jobId);
			if (job) {
				if (update.status !== undefined) job.status = update.status;
				if (update.progress !== undefined) job.progress = update.progress;

				if (update.status === "completed") {
					await this.loadVTTForCompletedJobs();
					eventSource.close();
					this.eventSources.delete(jobId);
				}

				this.requestUpdate();
			}
		});

		eventSource.onerror = () => {
			eventSource.close();
			this.eventSources.delete(jobId);
		};

		this.eventSources.set(jobId, eventSource);
	}

	private get filteredJobs(): TranscriptionJob[] {
		if (!this.searchQuery) {
			return this.jobs;
		}

		const query = this.searchQuery.toLowerCase();
		return this.jobs.filter((job) =>
			job.filename.toLowerCase().includes(query),
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

	private getStatusClass(status: string): string {
		return `status-${status}`;
	}

	override render() {
		const displayName =
			this.className === "uncategorized" ? "Uncategorized" : this.className;

		return html`
      <div>
        <a href="/classes" class="back-link">← Back to all classes</a>
        
        <div class="header">
          <h1>${displayName}</h1>
          <input
            type="text"
            class="search-box"
            placeholder="Search transcriptions..."
            .value=${this.searchQuery}
            @input=${(e: Event) => {
							this.searchQuery = (e.target as HTMLInputElement).value;
						}}
          />
        </div>

        ${
					this.filteredJobs.length === 0 && !this.isLoading
						? html`
          <div class="empty-state">
            <h2>${this.searchQuery ? "No matching transcriptions" : "No transcriptions yet"}</h2>
            <p>${this.searchQuery ? "Try a different search term" : "Upload an audio file to get started!"}</p>
          </div>
        `
						: html`
          ${this.filteredJobs.map(
						(job) => html`
            <div class="job-card">
              <div class="job-header">
                <div>
                  <div class="job-filename">${job.filename}</div>
                  <div class="job-date">${this.formatDate(job.created_at)}</div>
                </div>
                <span class="job-status ${this.getStatusClass(job.status)}">${job.status}</span>
              </div>

              ${
								job.status === "uploading" ||
								job.status === "processing" ||
								job.status === "transcribing"
									? html`
                <div class="progress-bar">
                  <div class="progress-fill ${job.status === "processing" ? "indeterminate" : ""}" 
                       style="${job.status === "processing" ? "" : `width: ${job.progress}%`}"></div>
                </div>
              `
									: ""
							}

              ${
								job.status === "completed" && job.audioUrl && job.vttContent
									? html`
                <div class="audio-player">
                  <audio id="audio-${job.id}" preload="metadata" controls src="${job.audioUrl}"></audio>
                </div>
                <vtt-viewer .vttContent=${job.vttContent} .audioId=${`audio-${job.id}`}></vtt-viewer>
              `
									: ""
							}
            </div>
          `,
					)}
        `
				}
      </div>
    `;
	}
}
