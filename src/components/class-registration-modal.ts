import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { MeetingTime } from "./meeting-time-picker";
import "./meeting-time-picker";

interface ClassResult {
	id: string;
	course_code: string;
	name: string;
	professor: string;
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
	@state() showWaitlistForm = false;
	@state() waitlistData = {
		courseCode: "",
		courseName: "",
		professor: "",
		semester: "",
		year: new Date().getFullYear(),
		additionalInfo: "",
		meetingTimes: [] as MeetingTime[],
	};

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

    .empty-state button {
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: var(--accent);
      color: white;
      border: 2px solid var(--accent);
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .empty-state button:hover {
      background: transparent;
      color: var(--accent);
    }

    .waitlist-form {
      margin-top: 1.5rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .form-group-full {
      grid-column: 1 / -1;
    }

    .form-group {
      display: flex;
      flex-direction: column;
    }

    .form-group label {
      margin-bottom: 0.5rem;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
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

    .form-group textarea {
      min-height: 6rem;
      resize: vertical;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
    }

    .form-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-top: 1.5rem;
    }

    .btn-submit {
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

    .btn-submit:hover:not(:disabled) {
      background: var(--gunmetal);
      border-color: var(--gunmetal);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-cancel {
      padding: 0.75rem 1.5rem;
      background: transparent;
      color: var(--text);
      border: 2px solid var(--secondary);
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-cancel:hover {
      border-color: var(--primary);
      color: var(--primary);
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
		this.showWaitlistForm = false;
		this.waitlistData = {
			courseCode: "",
			courseName: "",
			professor: "",
			semester: "",
			year: new Date().getFullYear(),
			additionalInfo: "",
			meetingTimes: [],
		};
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

	private handleRequestWaitlist() {
		this.showWaitlistForm = true;
		this.waitlistData.courseCode = this.searchQuery;
	}

	private handleWaitlistInput(field: string, e: Event) {
		const value = (
			e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
		).value;
		this.waitlistData = { ...this.waitlistData, [field]: value };
	}

	private async handleSubmitWaitlist(e: Event) {
		e.preventDefault();
		this.isJoining = true;
		this.error = "";

		try {
			const response = await fetch("/api/classes/waitlist", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(this.waitlistData),
			});

			if (!response.ok) {
				const data = await response.json();
				this.error = data.error || "Failed to submit waitlist request";
				return;
			}

			// Success
			alert(
				"Your class request has been submitted! An admin will review it soon.",
			);
			this.handleClose();
		} catch {
			this.error = "Failed to submit request. Please try again.";
		} finally {
			this.isJoining = false;
		}
	}

	private handleCancelWaitlist() {
		this.showWaitlistForm = false;
	}

	private handleMeetingTimesChange(e: CustomEvent) {
		this.waitlistData = {
			...this.waitlistData,
			meetingTimes: e.detail,
		};
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
											? this.showWaitlistForm
												? html`
                    <div class="waitlist-form">
                      <p style="margin-bottom: 1.5rem; color: var(--text);">
                        Request this class to be added to Thistle
                      </p>
                      <form @submit=${this.handleSubmitWaitlist}>
                        <div class="form-grid">
                          <div class="form-group">
                            <label>Course Code *</label>
                            <input
                              type="text"
                              required
                              .value=${this.waitlistData.courseCode}
                              @input=${(e: Event) => this.handleWaitlistInput("courseCode", e)}
                            />
                          </div>
                          <div class="form-group">
                            <label>Course Name *</label>
                            <input
                              type="text"
                              required
                              .value=${this.waitlistData.courseName}
                              @input=${(e: Event) => this.handleWaitlistInput("courseName", e)}
                            />
                          </div>
                          <div class="form-group">
                            <label>Professor *</label>
                            <input
                              type="text"
                              required
                              .value=${this.waitlistData.professor}
                              @input=${(e: Event) => this.handleWaitlistInput("professor", e)}
                            />
                          </div>
                          <div class="form-group">
                            <label>Semester *</label>
                            <select
                              required
                              .value=${this.waitlistData.semester}
                              @change=${(e: Event) => this.handleWaitlistInput("semester", e)}
                            >
                              <option value="">Select semester</option>
                              <option value="Spring">Spring</option>
                              <option value="Summer">Summer</option>
                              <option value="Fall">Fall</option>
                              <option value="Winter">Winter</option>
                            </select>
                          </div>
                          <div class="form-group">
                            <label>Year *</label>
                            <input
                              type="number"
                              required
                              min="2020"
                              max="2030"
                              .value=${this.waitlistData.year.toString()}
                              @input=${(e: Event) => this.handleWaitlistInput("year", e)}
                            />
                          </div>
                          <div class="form-group form-group-full">
                            <label>Meeting Times *</label>
                            <meeting-time-picker
                              .value=${this.waitlistData.meetingTimes}
                              @change=${this.handleMeetingTimesChange}
                            ></meeting-time-picker>
                          </div>
                          <div class="form-group form-group-full">
                            <label>Additional Info (optional)</label>
                            <textarea
                              placeholder="Any additional details about this class..."
                              .value=${this.waitlistData.additionalInfo}
                              @input=${(e: Event) => this.handleWaitlistInput("additionalInfo", e)}
                            ></textarea>
                          </div>
                        </div>
                        ${this.error ? html`<div class="error-message">${this.error}</div>` : ""}
                        <div class="form-actions">
                          <button
                            type="button"
                            class="btn-cancel"
                            @click=${this.handleCancelWaitlist}
                            ?disabled=${this.isJoining}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            class="btn-submit"
                            ?disabled=${this.isJoining}
                          >
                            ${this.isJoining ? "Submitting..." : "Submit Request"}
                          </button>
                        </div>
                      </form>
                    </div>
                  `
												: html`
                    <div class="empty-state">
                      <p>No classes found matching "${this.searchQuery}"</p>
                      <p style="margin-top: 0.5rem; font-size: 0.875rem;">
                        Can't find your class? Request it to be added.
                      </p>
                      <button @click=${this.handleRequestWaitlist}>
                        Request Class
                      </button>
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
