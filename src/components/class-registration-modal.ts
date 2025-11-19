import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("class-registration-modal")
export class ClassRegistrationModal extends LitElement {
	@property({ type: Boolean }) open = false;
	@state() classCode = "";
	@state() isSubmitting = false;
	@state() error = "";

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
      max-width: 28rem;
      width: 100%;
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

    .form-group {
      margin-bottom: 1.5rem;
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
      text-transform: uppercase;
    }

    input:focus {
      outline: none;
      border-color: var(--primary);
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

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    button {
      padding: 0.75rem 1.5rem;
      border: 2px solid var(--primary);
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
      flex: 1;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--gunmetal);
      border-color: var(--gunmetal);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text);
      border-color: var(--secondary);
    }

    .btn-secondary:hover:not(:disabled) {
      border-color: var(--primary);
      color: var(--primary);
    }
  `;

	private handleClose() {
		this.classCode = "";
		this.error = "";
		this.dispatchEvent(new CustomEvent("close"));
	}

	private handleInput(e: Event) {
		this.classCode = (e.target as HTMLInputElement).value.toUpperCase();
		this.error = "";
	}

	private async handleSubmit(e: Event) {
		e.preventDefault();
		this.error = "";
		this.isSubmitting = true;

		try {
			const response = await fetch("/api/classes/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ class_code: this.classCode.trim() }),
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
			this.isSubmitting = false;
		}
	}

	override render() {
		if (!this.open) return html``;

		return html`
      <div class="modal-overlay" @click=${this.handleClose}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2 class="modal-title">Register for Class</h2>
            <button class="close-btn" @click=${this.handleClose} type="button">×</button>
          </div>

          <form @submit=${this.handleSubmit}>
            <div class="form-group">
              <label for="class-code">Class Code</label>
              <input
                type="text"
                id="class-code"
                placeholder="ABC123"
                .value=${this.classCode}
                @input=${this.handleInput}
                required
                ?disabled=${this.isSubmitting}
                maxlength="20"
              />
              <div class="helper-text">
                Enter the class code provided by your instructor
              </div>
              ${this.error ? html`<div class="error-message">${this.error}</div>` : ""}
            </div>

            <div class="modal-actions">
              <button
                type="submit"
                class="btn-primary"
                ?disabled=${this.isSubmitting || !this.classCode.trim()}
              >
                ${this.isSubmitting ? "Joining..." : "Join Class"}
              </button>
              <button
                type="button"
                class="btn-secondary"
                @click=${this.handleClose}
                ?disabled=${this.isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
	}
}
