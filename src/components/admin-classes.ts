import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface Class {
	id: string;
	course_code: string;
	name: string;
	professor: string;
	semester: string;
	year: number;
	archived: boolean;
	created_at: number;
}

interface WaitlistEntry {
	id: string;
	user_id: number;
	course_code: string;
	course_name: string;
	professor: string;
	semester: string;
	year: number;
	additional_info: string | null;
	meeting_times: string | null;
	created_at: number;
}

@customElement("admin-classes")
export class AdminClasses extends LitElement {
	@state() classes: Class[] = [];
	@state() waitlist: WaitlistEntry[] = [];
	@state() isLoading = true;
	@state() error = "";
	@state() searchTerm = "";
	@state() showCreateModal = false;
	@state() activeTab: "classes" | "waitlist" = "classes";
	@state() approvingEntry: WaitlistEntry | null = null;
	@state() meetingTimes: string[] = [""];

	static override styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      gap: 1rem;
    }

    .search {
      flex: 1;
      max-width: 30rem;
      padding: 0.5rem 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 4px;
      font-size: 1rem;
      font-family: inherit;
      background: var(--background);
      color: var(--text);
    }

    .search:focus {
      outline: none;
      border-color: var(--primary);
    }

    .create-btn {
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
      white-space: nowrap;
    }

    .create-btn:hover {
      background: var(--gunmetal);
      border-color: var(--gunmetal);
    }

    .classes-grid {
      display: grid;
      gap: 1rem;
    }

    .class-card {
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 8px;
      padding: 1.25rem;
      transition: all 0.2s;
    }

    .class-card:hover {
      border-color: var(--primary);
    }

    .class-card.archived {
      opacity: 0.6;
      border-style: dashed;
    }

    .class-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 0.75rem;
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
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge.archived {
      background: var(--secondary);
      color: var(--text);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    button {
      padding: 0.5rem 1rem;
      border: 2px solid;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .btn-archive {
      background: transparent;
      color: var(--paynes-gray);
      border-color: var(--secondary);
    }

    .btn-archive:hover {
      border-color: var(--paynes-gray);
    }

    .btn-delete {
      background: transparent;
      color: #dc2626;
      border-color: #dc2626;
    }

    .btn-delete:hover {
      background: #dc2626;
      color: white;
    }

    button:disabled {
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
      padding: 3rem 2rem;
      color: var(--paynes-gray);
    }

    .error-message {
      background: #fee2e2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .tabs {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid var(--secondary);
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: transparent;
      border: none;
      border-radius: 0;
      color: var(--text);
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .tab:hover {
      color: var(--primary);
    }

    .tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }

    .tab-badge {
      display: inline-block;
      margin-left: 0.5rem;
      padding: 0.125rem 0.5rem;
      background: var(--accent);
      color: white;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
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
      max-width: 32rem;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-title {
      margin: 0 0 1.5rem 0;
      color: var(--text);
      font-size: 1.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text);
      font-size: 0.875rem;
    }

    .form-group input {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid var(--secondary);
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
      background: var(--background);
      color: var(--text);
      box-sizing: border-box;
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .meeting-times-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .meeting-time-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .meeting-time-row input {
      flex: 1;
    }

    .btn-remove {
      padding: 0.5rem;
      background: transparent;
      color: #dc2626;
      border: 2px solid #dc2626;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-remove:hover {
      background: #dc2626;
      color: white;
    }

    .btn-add {
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      background: transparent;
      color: var(--primary);
      border: 2px solid var(--primary);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-add:hover {
      background: var(--primary);
      color: white;
    }

    .modal-actions {
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
  `;

	override async connectedCallback() {
		super.connectedCallback();
		await this.loadData();
	}

	private async loadData() {
		this.isLoading = true;
		this.error = "";

		try {
			const [classesRes, waitlistRes] = await Promise.all([
				fetch("/api/admin/classes"),
				fetch("/api/admin/waitlist"),
			]);

			if (!classesRes.ok || !waitlistRes.ok) {
				throw new Error("Failed to load data");
			}

			const classesData = await classesRes.json();
			const waitlistData = await waitlistRes.json();

			this.classes = classesData.classes || [];
			this.waitlist = waitlistData.waitlist || [];
		} catch {
			this.error = "Failed to load data. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private handleSearch(e: Event) {
		this.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
	}

	private async handleToggleArchive(classId: string) {
		try {
			const response = await fetch(`/api/classes/${classId}/archive`, {
				method: "PUT",
			});

			if (!response.ok) {
				throw new Error("Failed to update class");
			}

			await this.loadData();
		} catch {
			this.error = "Failed to update class. Please try again.";
		}
	}

	private async handleDelete(classId: string, courseName: string) {
		if (
			!confirm(
				`Are you sure you want to delete ${courseName}? This will remove all associated data and cannot be undone.`,
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/classes/${classId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete class");
			}

			await this.loadData();
		} catch {
			this.error = "Failed to delete class. Please try again.";
		}
	}

	private handleCreateClass() {
		this.showCreateModal = true;
	}

	private async handleDeleteWaitlist(id: string, courseCode: string) {
		if (
			!confirm(
				`Are you sure you want to delete this waitlist request for ${courseCode}?`,
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/waitlist/${id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete waitlist entry");
			}

			await this.loadData();
		} catch {
			this.error = "Failed to delete waitlist entry. Please try again.";
		}
	}

	private getFilteredClasses() {
		if (!this.searchTerm) return this.classes;

		return this.classes.filter((cls) => {
			const searchStr = this.searchTerm;
			return (
				cls.course_code.toLowerCase().includes(searchStr) ||
				cls.name.toLowerCase().includes(searchStr) ||
				cls.professor.toLowerCase().includes(searchStr)
			);
		});
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading...</div>`;
		}

		const filteredClasses = this.getFilteredClasses();

		return html`
      ${this.error ? html`<div class="error-message">${this.error}</div>` : ""}

      <div class="tabs">
        <button
          class="tab ${this.activeTab === "classes" ? "active" : ""}"
          @click=${() => { this.activeTab = "classes"; }}
        >
          Classes
        </button>
        <button
          class="tab ${this.activeTab === "waitlist" ? "active" : ""}"
          @click=${() => { this.activeTab = "waitlist"; }}
        >
          Waitlist
          ${this.waitlist.length > 0 ? html`<span class="tab-badge">${this.waitlist.length}</span>` : ""}
        </button>
      </div>

      ${
				this.activeTab === "classes"
					? this.renderClasses(filteredClasses)
					: this.renderWaitlist()
			}

      ${this.approvingEntry ? this.renderApprovalModal() : ""}
    `;
	}

	private renderClasses(filteredClasses: Class[]) {
		return html`
      <div class="header">
        <input
          type="text"
          class="search"
          placeholder="Search classes..."
          @input=${this.handleSearch}
          .value=${this.searchTerm}
        />
        <button class="create-btn" @click=${this.handleCreateClass}>
          + Create Class
        </button>
      </div>

      ${
				filteredClasses.length === 0
					? html`
          <div class="empty-state">
            ${this.searchTerm ? "No classes found matching your search" : "No classes yet"}
          </div>
        `
					: html`
          <div class="classes-grid">
            ${filteredClasses.map(
							(cls) => html`
              <div class="class-card ${cls.archived ? "archived" : ""}">
                <div class="class-header">
                  <div class="class-info">
                    <div class="course-code">${cls.course_code}</div>
                    <div class="class-name">${cls.name}</div>
                    <div class="class-meta">
                      <span>👤 ${cls.professor}</span>
                      <span>📅 ${cls.semester} ${cls.year}</span>
                      ${cls.archived ? html`<span class="badge archived">Archived</span>` : ""}
                    </div>
                  </div>
                  <div class="actions">
                    <button
                      class="btn-archive"
                      @click=${() => this.handleToggleArchive(cls.id)}
                    >
                      ${cls.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                      class="btn-delete"
                      @click=${() => this.handleDelete(cls.id, cls.course_code)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            `,
						)}
          </div>
        `
			}
    `;
	}

	private renderWaitlist() {
		return html`
      ${
				this.waitlist.length === 0
					? html`
          <div class="empty-state">No waitlist requests yet</div>
        `
					: html`
          <div class="classes-grid">
            ${this.waitlist.map(
							(entry) => html`
              <div class="class-card">
                <div class="class-header">
                  <div class="class-info">
                    <div class="course-code">${entry.course_code}</div>
                    <div class="class-name">${entry.course_name}</div>
                    <div class="class-meta">
                      <span>👤 ${entry.professor}</span>
                      <span>📅 ${entry.semester} ${entry.year}</span>
                    </div>
                    ${
											entry.additional_info
												? html`
                      <p style="margin-top: 0.75rem; font-size: 0.875rem; color: var(--paynes-gray);">
                        ${entry.additional_info}
                      </p>
                    `
												: ""
										}
                  </div>
                  <div class="actions">
                    <button
                      class="btn-archive"
                      @click=${() => this.handleApproveWaitlist(entry)}
                    >
                      Approve & Create Class
                    </button>
                    <button
                      class="btn-delete"
                      @click=${() => this.handleDeleteWaitlist(entry.id, entry.course_code)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            `,
						)}
          </div>
        `
			}
    `;
	}

	private handleApproveWaitlist(entry: WaitlistEntry) {
		this.approvingEntry = entry;

		// Parse meeting times from JSON if available, otherwise use empty array
		if (entry.meeting_times) {
			try {
				const parsed = JSON.parse(entry.meeting_times);
				this.meetingTimes = Array.isArray(parsed) && parsed.length > 0 ? parsed : [""];
			} catch {
				this.meetingTimes = [""];
			}
		} else {
			this.meetingTimes = [""];
		}
	}

	private addMeetingTime() {
		this.meetingTimes = [...this.meetingTimes, ""];
	}

	private removeMeetingTime(index: number) {
		this.meetingTimes = this.meetingTimes.filter((_, i) => i !== index);
	}

	private updateMeetingTime(index: number, value: string) {
		this.meetingTimes = this.meetingTimes.map((time, i) =>
			i === index ? value : time,
		);
	}

	private cancelApproval() {
		this.approvingEntry = null;
		this.meetingTimes = [""];
	}

	private async submitApproval() {
		if (!this.approvingEntry) return;

		const entry = this.approvingEntry;
		const times = this.meetingTimes.filter((t) => t.trim() !== "");

		if (times.length === 0) {
			this.error = "Please add at least one meeting time";
			return;
		}

		try {
			const response = await fetch("/api/classes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					course_code: entry.course_code,
					name: entry.course_name,
					professor: entry.professor,
					semester: entry.semester,
					year: entry.year,
					meeting_times: times,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to create class");
			}

			await fetch(`/api/admin/waitlist/${entry.id}`, {
				method: "DELETE",
			});

			await this.loadData();

			this.activeTab = "classes";
			this.approvingEntry = null;
			this.meetingTimes = [""];
		} catch {
			this.error = "Failed to approve waitlist entry. Please try again.";
		}
	}

	private renderApprovalModal() {
		if (!this.approvingEntry) return "";

		const entry = this.approvingEntry;

		return html`
      <div class="modal-overlay" @click=${this.cancelApproval}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h2 class="modal-title">Add Meeting Times</h2>

          <p style="margin-bottom: 1.5rem; color: var(--paynes-gray);">
            Creating class: <strong>${entry.course_code} - ${entry.course_name}</strong>
          </p>

          <div class="form-group">
            <label>Meeting Times</label>
            <div class="meeting-times-list">
              ${this.meetingTimes.map(
								(time, index) => html`
                <div class="meeting-time-row">
                  <input
                    type="text"
                    placeholder="e.g., Monday Lecture, Wednesday Lab"
                    .value=${time}
                    @input=${(e: Event) =>
											this.updateMeetingTime(
												index,
												(e.target as HTMLInputElement).value,
											)}
                  />
                  ${
										this.meetingTimes.length > 1
											? html`
                    <button
                      class="btn-remove"
                      @click=${() => this.removeMeetingTime(index)}
                    >
                      Remove
                    </button>
                  `
											: ""
									}
                </div>
              `,
							)}
              <button class="btn-add" @click=${this.addMeetingTime}>
                + Add Meeting Time
              </button>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click=${this.cancelApproval}>
              Cancel
            </button>
            <button
              class="btn-submit"
              @click=${this.submitApproval}
              ?disabled=${this.meetingTimes.every((t) => t.trim() === "")}
            >
              Create Class
            </button>
          </div>
        </div>
      </div>
    `;
	}
}
