import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./vtt-viewer.ts";

interface TranscriptDetails {
	id: string;
	original_filename: string;
	status: string;
	created_at: number;
	completed_at: number | null;
	error_message: string | null;
	user_id: string;
	user_email: string;
	user_name: string | null;
	vtt_content: string | null;
}

@customElement("transcript-modal")
export class TranscriptViewModal extends LitElement {
	@property({ type: String }) transcriptId: string | null = null;
	@state() private transcript: TranscriptDetails | null = null;
	@state() private loading = false;
	@state() private error: string | null = null;
	private wasOpen = false;

	static override styles = css`
    :host {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    :host([open]) {
      display: flex;
    }

    .modal-content {
      background: var(--background);
      border-radius: 8px;
      max-width: 50rem;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 2px solid var(--secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .modal-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text);
      margin: 0;
    }

    .modal-close {
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
      transition: background 0.2s;
    }

    .modal-close:hover {
      background: var(--secondary);
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
      flex: 1;
    }

    .detail-section {
      margin-bottom: 2rem;
    }

    .detail-section:last-child {
      margin-bottom: 0;
    }

    .detail-section-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--secondary);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--secondary);
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      font-weight: 500;
      color: var(--text);
    }

    .detail-value {
      color: var(--text);
      opacity: 0.8;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .status-completed {
      background: #dcfce7;
      color: #166534;
    }

    .status-processing,
    .status-uploading {
      background: #fef3c7;
      color: #92400e;
    }

    .status-failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .status-pending {
      background: #e0e7ff;
      color: #3730a3;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .user-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
    }

    .transcript-text {
      background: color-mix(in srgb, var(--primary) 5%, transparent);
      border: 2px solid var(--secondary);
      border-radius: 6px;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.875rem;
      line-height: 1.6;
      white-space: pre-wrap;
      color: var(--text);
      max-height: 30rem;
      overflow-y: auto;
    }

    .loading, .error {
      text-align: center;
      padding: 2rem;
    }

    .error {
      color: #dc2626;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text);
      opacity: 0.6;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 4px;
    }

    .btn-danger {
      background: #dc2626;
      color: white;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      font-family: inherit;
      transition: all 0.2s;
    }

    .btn-danger:hover {
      background: #b91c1c;
    }

    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .modal-footer {
      padding: 1.5rem;
      border-top: 2px solid var(--secondary);
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .audio-player {
      margin-bottom: 1rem;
    }

    .audio-player audio {
      width: 100%;
    }
  `;

	override connectedCallback() {
		super.connectedCallback();
		if (this.transcriptId) {
			this.loadTranscriptDetails();
		}
	}

	override updated(changedProperties: Map<string, unknown>) {
		if (changedProperties.has("transcriptId") && this.transcriptId) {
			this.loadTranscriptDetails();
		}

		// If the host loses the [open] attribute, stop any playback inside the modal
		const isOpen = this.hasAttribute("open");
		if (this.wasOpen && !isOpen) {
			this.stopAudioPlayback();
		}
		this.wasOpen = isOpen;
	}

	private async loadTranscriptDetails() {
		if (!this.transcriptId) return;

		this.loading = true;
		this.error = null;

		try {
			// Fetch transcript details
			const [detailsRes, vttRes] = await Promise.all([
				fetch(`/api/admin/transcriptions/${this.transcriptId}/details`),
				fetch(`/api/transcriptions/${this.transcriptId}?format=vtt`).catch(() => null),
			]);

			if (!detailsRes.ok) {
				throw new Error("Failed to load transcript details");
			}

			const vttContent = vttRes?.ok ? await vttRes.text() : null;

			// Get basic info from database
			const info = await detailsRes.json();

			this.transcript = {
				id: this.transcriptId,
				original_filename: info?.original_filename || "Unknown",
				status: info?.status || "unknown",
				created_at: info?.created_at || 0,
				completed_at: info?.completed_at || null,
				error_message: info?.error_message || null,
				user_id: info?.user_id || "",
				user_email: info?.user_email || "",
				user_name: info?.user_name || null,
				vtt_content: vttContent,
			};
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to load transcript details";
			this.transcript = null;
		} finally {
			this.loading = false;
		}
	}

	private close() {
		this.stopAudioPlayback();
		this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
	}

	private formatTimestamp(timestamp: number) {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	private stopAudioPlayback() {
		try {
			// stop audio inside this modal's shadow root
			const aud = this.shadowRoot?.querySelector('audio') as HTMLAudioElement | null;
			if (aud) {
				aud.pause();
				try { aud.currentTime = 0; } catch (e) { /* ignore */ }
			}

			// Also stop any audio elements in light DOM that match the transcript audio id
			if (this.transcript) {
				const id = `audio-${this.transcript.id}`;
				const outside = document.getElementById(id) as HTMLAudioElement | null;
				if (outside && outside !== aud) {
					outside.pause();
					try { outside.currentTime = 0; } catch (e) { /* ignore */ }
				}
			}
		} catch (e) {
			// ignore
		}
	}

	private async handleDelete() {
		if (!confirm("Are you sure you want to delete this transcription? This cannot be undone.")) {
			return;
		}

		try {
			const res = await fetch(`/api/admin/transcriptions/${this.transcriptId}`, {
				method: "DELETE",
			});

			if (!res.ok) {
				throw new Error("Failed to delete transcription");
			}

			this.dispatchEvent(new CustomEvent("transcript-deleted", { bubbles: true, composed: true }));
			this.close();
		} catch {
			alert("Failed to delete transcription");
		}
	}

	override render() {
		return html`
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2 class="modal-title">Transcription Details</h2>
          <button class="modal-close" @click=${this.close} aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          ${this.loading ? html`<div class="loading">Loading...</div>` : ""}
          ${this.error ? html`<div class="error">${this.error}</div>` : ""}
          ${this.transcript ? this.renderTranscriptDetails() : ""}
        </div>
        ${this.transcript
					? html`
          <div class="modal-footer">
            <button class="btn-danger" @click=${this.handleDelete}>Delete Transcription</button>
          </div>
        `
					: ""}
      </div>
    `;
	}

	private renderTranscriptDetails() {
		if (!this.transcript) return "";

		return html`
      <div class="detail-section">
        <h3 class="detail-section-title">File Information</h3>
        <div class="detail-row">
          <span class="detail-label">File Name</span>
          <span class="detail-value">${this.transcript.original_filename}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="status-badge status-${this.transcript.status}">${this.transcript.status}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created At</span>
          <span class="detail-value">${this.formatTimestamp(this.transcript.created_at)}</span>
        </div>
        ${this.transcript.completed_at
					? html`
          <div class="detail-row">
            <span class="detail-label">Completed At</span>
            <span class="detail-value">${this.formatTimestamp(this.transcript.completed_at)}</span>
          </div>
        `
					: ""}
        ${this.transcript.error_message
					? html`
          <div class="detail-row">
            <span class="detail-label">Error Message</span>
            <span class="detail-value" style="color: #dc2626;">${this.transcript.error_message}</span>
          </div>
        `
					: ""}
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">User Information</h3>
        <div class="detail-row">
          <span class="detail-label">User</span>
          <div class="user-info">
            <img 
              src="https://hostedboringavatars.vercel.app/api/marble?size=32&name=${this.transcript.user_id}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
              alt="Avatar"
              class="user-avatar"
            />
            <span>${this.transcript.user_name || this.transcript.user_email}</span>
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">Email</span>
          <span class="detail-value">${this.transcript.user_email}</span>
        </div>
      </div>

      ${this.transcript.status === "completed"
				? html`
        <div class="detail-section">
          <h3 class="detail-section-title">Audio</h3>
          <div class="audio-player">
            <audio id="audio-${this.transcript.id}" controls src="/api/transcriptions/${this.transcript.id}/audio"></audio>
          </div>
        </div>
      `
				: ""}

      <div class="detail-section">
        <h3 class="detail-section-title">Transcript</h3>
        ${this.transcript.status === "completed" && this.transcript.vtt_content
					? html`<vtt-viewer .vttContent=${this.transcript.vtt_content ?? ""} .audioId=${`audio-${this.transcript.id}`}></vtt-viewer>`
					: html`<div class="transcript-text">${this.transcript.vtt_content || "No transcript available"}</div>`}
      </div>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"transcript-modal": TranscriptViewModal;
	}
}
