import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface ClassStats {
	name: string;
	count: number;
	lastUpdated: number;
}

@customElement("classes-overview")
export class ClassesOverview extends LitElement {
	@state() classes: ClassStats[] = [];
	@state() uncategorizedCount = 0;

	static override styles = css`
    :host {
      display: block;
    }

    h1 {
      color: var(--text);
      margin-bottom: 2rem;
    }

    .classes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      gap: 1.5rem;
      margin-top: 2rem;
    }

    .class-card {
      background: var(--background);
      border: 1px solid var(--secondary);
      border-radius: 8px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: var(--text);
      display: block;
    }

    .class-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .class-name {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--text);
    }

    .class-stats {
      font-size: 0.875rem;
      color: var(--paynes-gray);
    }

    .class-count {
      font-weight: 500;
      color: var(--accent);
    }

    .upload-section {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      border: 2px dashed var(--accent);
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
      text-align: center;
    }

    .upload-button {
      background: var(--accent);
      color: var(--white);
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .upload-button:hover {
      opacity: 0.9;
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
  `;

	override async connectedCallback() {
		super.connectedCallback();
		await this.loadClasses();

		window.addEventListener("auth-changed", this.handleAuthChange);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener("auth-changed", this.handleAuthChange);
	}

	private handleAuthChange = async () => {
		await this.loadClasses();
	};

	private async loadClasses() {
		try {
			const response = await fetch("/api/transcriptions");
			if (!response.ok) {
				if (response.status === 401) {
					this.classes = [];
					this.uncategorizedCount = 0;
					return;
				}
				throw new Error("Failed to load classes");
			}

			const data = await response.json();
			const jobs = data.jobs || [];

			// Group by class and count
			const classMap = new Map<
				string,
				{ count: number; lastUpdated: number }
			>();
			let uncategorized = 0;

			for (const job of jobs) {
				const className = job.class_name;
				if (!className) {
					uncategorized++;
				} else {
					const existing = classMap.get(className);
					if (existing) {
						existing.count++;
						existing.lastUpdated = Math.max(
							existing.lastUpdated,
							job.created_at,
						);
					} else {
						classMap.set(className, {
							count: 1,
							lastUpdated: job.created_at,
						});
					}
				}
			}

			this.uncategorizedCount = uncategorized;
			this.classes = Array.from(classMap.entries())
				.map(([name, stats]) => ({
					name,
					count: stats.count,
					lastUpdated: stats.lastUpdated,
				}))
				.sort((a, b) => b.lastUpdated - a.lastUpdated);
		} catch (error) {
			console.error("Failed to load classes:", error);
		}
	}

	private navigateToUpload() {
		window.location.href = "/transcribe";
	}

	private formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return "Today";
		}
		if (diffDays === 1) {
			return "Yesterday";
		}
		if (diffDays < 7) {
			return `${diffDays} days ago`;
		}
		return date.toLocaleDateString();
	}

	override render() {
		const hasClasses = this.classes.length > 0 || this.uncategorizedCount > 0;

		return html`
      <h1>Your Classes</h1>

      <div class="upload-section">
        <button class="upload-button" @click=${this.navigateToUpload}>
          📤 Upload New Transcription
        </button>
      </div>

      ${
				hasClasses
					? html`
        <div class="classes-grid">
          ${this.classes.map(
						(classInfo) => html`
            <a class="class-card" href="/class/${encodeURIComponent(classInfo.name)}">
              <div class="class-name">${classInfo.name}</div>
              <div class="class-stats">
                <span class="class-count">${classInfo.count}</span>
                ${classInfo.count === 1 ? "transcription" : "transcriptions"}
                • ${this.formatDate(classInfo.lastUpdated)}
              </div>
            </a>
          `,
					)}
          
          ${
						this.uncategorizedCount > 0
							? html`
            <a class="class-card" href="/class/uncategorized">
              <div class="class-name">Uncategorized</div>
              <div class="class-stats">
                <span class="class-count">${this.uncategorizedCount}</span>
                ${this.uncategorizedCount === 1 ? "transcription" : "transcriptions"}
              </div>
            </a>
          `
							: ""
					}
        </div>
      `
					: html`
        <div class="empty-state">
          <h2>No transcriptions yet</h2>
          <p>Upload your first audio file to get started!</p>
        </div>
      `
			}
    `;
	}
}
