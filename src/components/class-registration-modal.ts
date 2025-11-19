import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface ClassResult {
	id: string;
	course_code: string;
	name: string;
	professor: string;
	section: string | null;
	semester: string;
	year: number;
}

@customElement("class-registration-modal")
export class ClassRegistrationModal extends LitElement {
	@property({ type: Boolean }) open = false;
	@state() searchQuery = "";
	@state() results: ClassResult[] = [];
	@state() isSearching = false;
	@state() isJoining = false;
	@state() error = "";
	@state() hasSearched = false;

	static override styles = css`
    :host {
      display: block;
    }

    .modal-overlay {
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
      padding: 1rem;
    }

    .modal {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 12px;
      padding: 2rem;
      max-width: 42rem;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .modal-title {
      margin: 0;
      color: var(--text);
      font-size: 1.5rem;
    }

    .close-btn {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text);
      padding: 0;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: var(--secondary);
    }

    .search-section {
      margin-bottom: 1.5rem;
    }

    .search-section > label {
      margin-bottom: 0.5rem;
    }

    .search-form {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .search-input-wrapper {
      flex: 1;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text);
      font-size: 0.875rem;
    }

    input {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
      background: var(--background);
      color: var(--text);
      transition: all 0.2s;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .search-btn {
      padding: 0.75rem 1.5rem;
      background: var(--primary);
      color: white;
      border: 2px solid var(--primary);
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .search-btn:hover:not(:disabled) {
      background: var(--gunmetal);
      border-color: var(--gunmetal);
    }

    .search-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .helper-text {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--paynes-gray);
    }

    .error-message {
      color: red;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    .results-section {
      margin-top: 1.5rem;
    }

    .results-grid {
      display: grid;
      gap: 0.75rem;
    }

    .class-card {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .class-card:hover:not(:disabled) {
      border-color: var(--accent);
      transform: translateX(4px);
    }

    .class-card:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .class-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .class-info {
      flex: 1;
    }

    .course-code {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--accent);
      text-transform: uppercase;
    }

    .class-name {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0.25rem 0;
      color: var(--text);
    }

    .class-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--paynes-gray);
      margin-top: 0.5rem;
    }

    .join-btn {
      padding: 0.5rem 1rem;
      background: var(--primary);
      color: white;
      border: 2px solid var(--primary);
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
      white-space: nowrap;
    }

    .join-btn:hover:not(:disabled) {
      background: var(--gunmetal);
      border-color: var(--gunmetal);
    }

    .join-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--paynes-gray);
    }

    .loading {
      text-align: center;
      padding: 2rem;
      color: var(--paynes-gray);
    }
  `;

	private handleClose() {
		this.searchQuery = "";
		this.results = [];
		this.error = "";
		this.hasSearched = false;
		this.dispatchEvent(new CustomEvent("close"));
	}

	private handleInput(e: Event) {
		this.searchQuery = (e.target as HTMLInputElement).value;
		this.error = "";
	}

	private async handleSearch(e: Event) {
		e.preventDefault();
		if (!this.searchQuery.trim()) return;

		this.isSearching = true;
		this.error = "";
		this.hasSearched = true;

		try {
			const response = await fetch(
				`/api/classes/search?q=${encodeURIComponent(this.searchQuery.trim())}`,
			);

			if (!response.ok) {
				throw new Error("Search failed");
			}

			const data = await response.json();
			this.results = data.classes || [];
		} catch {
			this.error = "Failed to search classes. Please try again.";
		} finally {
			this.isSearching = false;
		}
	}

	private async handleJoin(classId: string) {
		this.isJoining = true;
		this.error = "";

		try {
			const response = await fetch("/api/classes/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ class_id: classId }),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to join class";
				return;
			}

			// Success - notify parent and close
			this.dispatchEvent(new CustomEvent("class-joined"));
			this.handleClose();
		} catch {
			this.error = "Failed to join class. Please try again.";
		} finally {
			this.isJoining = false;
		}
	}

	override render() {
		if (!this.open) return html``;

		return html`
      <div class="modal-overlay" @click=${this.handleClose}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2 class="modal-title">Find a Class</h2>
            <button class="close-btn" @click=${this.handleClose} type="button">×</button>
          </div>

          <div class="search-section">
            <label for="search">Course Code</label>
            <form class="search-form" @submit=${this.handleSearch}>
              <div class="search-input-wrapper">
                <input
                  type="text"
                  id="search"
                  placeholder="CS 101, MATH 220, etc."
                  .value=${this.searchQuery}
                  @input=${this.handleInput}
                  ?disabled=${this.isSearching}
                />
              </div>
              <button
                type="submit"
                class="search-btn"
                ?disabled=${this.isSearching || !this.searchQuery.trim()}
              >
                ${this.isSearching ? "Searching..." : "Search"}
              </button>
            </form>
            <div class="helper-text">
              Search by course code to find available classes
            </div>
            ${this.error ? html`<div class="error-message">${this.error}</div>` : ""}
          </div>

          ${
						this.hasSearched
							? html`
              <div class="results-section">
                ${
									this.isSearching
										? html`<div class="loading">Searching...</div>`
										: this.results.length === 0
											? html`
                    <div class="empty-state">
                      No classes found matching "${this.searchQuery}"
                    </div>
                  `
											: html`
                    <div class="results-grid">
                      ${this.results.map(
												(cls) => html`
                        <button
                          class="class-card"
                          @click=${() => this.handleJoin(cls.id)}
                          ?disabled=${this.isJoining}
                        >
                          <div class="class-header">
                            <div class="class-info">
                              <div class="course-code">${cls.course_code}</div>
                              <div class="class-name">${cls.name}</div>
                              <div class="class-meta">
                                <span>👤 ${cls.professor}</span>
                                ${cls.section ? html`<span>📍 Section ${cls.section}</span>` : ""}
                                <span>📅 ${cls.semester} ${cls.year}</span>
                              </div>
                            </div>
                            <button
                              class="join-btn"
                              ?disabled=${this.isJoining}
                              @click=${(e: Event) => {
																e.stopPropagation();
																this.handleJoin(cls.id);
															}}
                            >
                              ${this.isJoining ? "Joining..." : "Join"}
                            </button>
                          </div>
                        </button>
                      `,
											)}
                    </div>
                  `
								}
              </div>
            `
							: ""
					}
        </div>
      </div>
    `;
	}
}
