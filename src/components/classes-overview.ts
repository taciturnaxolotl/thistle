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
}

interface ClassesGrouped {
	[semesterYear: string]: Class[];
}

@customElement("classes-overview")
export class ClassesOverview extends LitElement {
	@state() classes: ClassesGrouped = {};
	@state() isLoading = true;
	@state() error: string | null = null;

	static override styles = css`
    :host {
      display: block;
    }

    h1 {
      color: var(--text);
      margin-bottom: 2rem;
    }

    .semester-section {
      margin-bottom: 3rem;
    }

    .semester-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 1.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--secondary);
    }

    .classes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      gap: 1.5rem;
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
      position: relative;
    }

    .class-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .class-card.archived {
      opacity: 0.6;
      border-style: dashed;
    }

    .course-code {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--accent);
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .class-name {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--text);
    }

    .professor {
      font-size: 0.875rem;
      color: var(--paynes-gray);
      margin-bottom: 0.25rem;
    }

    .archived-badge {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: var(--paynes-gray);
      color: var(--white);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .register-card {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      border: 2px dashed var(--accent);
      border-radius: 8px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 10rem;
      color: var(--accent);
    }

    .register-card:hover {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
      transform: translateY(-2px);
    }

    .register-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }

    .register-text {
      font-weight: 600;
      font-size: 1rem;
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

    .loading {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--paynes-gray);
    }

    .error {
      background: color-mix(in srgb, red 10%, transparent);
      border: 1px solid red;
      color: red;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 2rem;
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
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch("/api/classes");
			if (!response.ok) {
				if (response.status === 401) {
					this.classes = {};
					return;
				}
				throw new Error("Failed to load classes");
			}

			const data = await response.json();
			this.classes = data.classes || {};
		} catch (error) {
			console.error("Failed to load classes:", error);
			this.error = "Failed to load classes. Please try again.";
		} finally {
			this.isLoading = false;
		}
	}

	private handleRegisterClick() {
		// TODO: Open registration modal/form
		alert("Class registration coming soon!");
	}

	override render() {
		if (this.isLoading) {
			return html`<div class="loading">Loading classes...</div>`;
		}

		if (this.error) {
			return html`
        <div class="error">${this.error}</div>
        <button @click=${this.loadClasses}>Retry</button>
      `;
		}

		const semesterKeys = Object.keys(this.classes);
		const hasClasses = semesterKeys.length > 0;

		return html`
      <h1>Your Classes</h1>

      ${
				hasClasses
					? html`
          ${semesterKeys.map(
						(semesterYear) => html`
            <div class="semester-section">
              <h2 class="semester-title">${semesterYear}</h2>
              <div class="classes-grid">
                ${this.classes[semesterYear]?.map(
									(cls) => html`
                  <a class="class-card ${cls.archived ? "archived" : ""}" href="/classes/${cls.id}">
                    ${cls.archived ? html`<div class="archived-badge">Archived</div>` : ""}
                    <div class="course-code">${cls.course_code}</div>
                    <div class="class-name">${cls.name}</div>
                    <div class="professor">${cls.professor}</div>
                  </a>
                `,
								)}
                
                ${
									semesterKeys.indexOf(semesterYear) === 0
										? html`
                  <div class="register-card" @click=${this.handleRegisterClick}>
                    <div class="register-icon">+</div>
                    <div class="register-text">Register for Class</div>
                  </div>
                `
										: ""
								}
              </div>
            </div>
          `,
					)}
        `
					: html`
          <div class="empty-state">
            <h2>No classes yet</h2>
            <p>You haven't been enrolled in any classes.</p>
          </div>
          <div class="classes-grid">
            <div class="register-card" @click=${this.handleRegisterClick}>
              <div class="register-icon">+</div>
              <div class="register-text">Register for Class</div>
            </div>
          </div>
        `
			}
    `;
	}
}
