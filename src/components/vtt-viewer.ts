import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

interface VTTSegment {
	start: number;
	end: number;
	text: string;
	index?: string;
}

function parseVTT(vttContent: string): VTTSegment[] {
	const segments: VTTSegment[] = [];
	const lines = vttContent.split("\n");

	let i = 0;
	// Skip WEBVTT header if present
	while (i < lines.length && (lines[i] || "").trim() !== "WEBVTT") {
		i++;
	}
	if (i < lines.length) i++; // advance past header if found

	while (i < lines.length) {
		let index: string | undefined;
		let line = lines[i] || "";

		// Check for cue ID (line before timestamp)
		if (line.trim() && !line.includes("-->")) {
			index = line.trim();
			i++;
			line = lines[i] || "";
		}

		if (line.includes("-->")) {
			const parts = line.split("-->").map((s) => s.trim());
			const start = parseVTTTimestamp(parts[0] ?? "");
			const end = parseVTTTimestamp(parts[1] ?? "");

			// Collect text lines until empty line
			const textLines: string[] = [];
			i++;
			while (i < lines.length && (lines[i] || "").trim()) {
				textLines.push(lines[i] || "");
				i++;
			}

			segments.push({
				start,
				end,
				text: textLines.join(" ").trim(),
				index,
			});
		} else {
			i++;
		}
	}

	return segments;
}

function parseVTTTimestamp(timestamp?: string): number {
	const parts = (timestamp || "").split(":");
	if (parts.length === 3) {
		const hours = Number.parseFloat(parts[0] || "0");
		const minutes = Number.parseFloat(parts[1] || "0");
		const seconds = Number.parseFloat(parts[2] || "0");
		return hours * 3600 + minutes * 60 + seconds;
	}
	return 0;
}

@customElement("vtt-viewer")
export class VTTViewer extends LitElement {
	@property({ type: String }) vttContent = "";
	@property({ type: String }) audioId = "";

	static override styles = css`
	.transcript {
		background: color-mix(in srgb, var(--primary) 5%, transparent);
		border-radius: 6px;
		padding: 1rem;
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
	`;

	private audioElement: HTMLAudioElement | null = null;
	private boundTimeUpdate: ((this: HTMLAudioElement, ev: Event) => any) | null = null;
	private boundTranscriptClick: ((e: Event) => any) | null = null;

	private _viewerId = `vtt-${Math.random().toString(36).slice(2,9)}`;

	private findAudioElementById(id: string): HTMLAudioElement | null {
		let root: any = this.getRootNode();
		let depth = 0;
		while (root && depth < 10) {
			if (root instanceof ShadowRoot) {
				const el = root.querySelector(`#${id}`) as HTMLAudioElement | null;
				if (el) return el;
				root = (root as ShadowRoot).host?.getRootNode?.();
			} else if (root instanceof Document) {
				const byId = root.getElementById(id) as HTMLAudioElement | null;
				if (byId) return byId;
				break;
			} else {
				break;
			}
			depth++;
		}
		return null;
	}

	private setupHighlighting() {
		// Detach previous listeners if any
		this.detachHighlighting();

		const audioElement = this.findAudioElementById(this.audioId);
		const transcriptDiv = this.shadowRoot?.querySelector('.transcript') as HTMLDivElement | null;
		if (!audioElement || !transcriptDiv) return;

		// Clear any lingering highlights from prior instances
		transcriptDiv.querySelectorAll('.current-segment').forEach((el) => (el as HTMLElement).classList.remove('current-segment'));

		this.audioElement = audioElement;
		let currentSegmentElement: HTMLElement | null = null;

		this.boundTimeUpdate = () => {
			const currentTime = this.audioElement?.currentTime ?? 0;
			const segmentElements = transcriptDiv.querySelectorAll('[data-start]');
			let found = false;

			for (const el of Array.from(segmentElements)) {
				const start = Number.parseFloat((el as HTMLElement).dataset.start || '0');
				const end = Number.parseFloat((el as HTMLElement).dataset.end || '0');

				if (currentTime >= start && currentTime <= end) {
					found = true;
					if (currentSegmentElement !== el) {
						currentSegmentElement?.classList.remove('current-segment');
						(el as HTMLElement).classList.add('current-segment');
						currentSegmentElement = el as HTMLElement;
						(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
					}
					break;
				}
			}

			// If no segment matched, clear any existing highlight
			if (!found && currentSegmentElement) {
				currentSegmentElement.classList.remove('current-segment');
				currentSegmentElement = null;
			}
		};

		audioElement.addEventListener('timeupdate', this.boundTimeUpdate as EventListener);

		this.boundTranscriptClick = (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.dataset.start) {
				this.audioElement!.currentTime = Number.parseFloat(target.dataset.start);
				this.audioElement!.play();
			}
		};

		transcriptDiv.addEventListener('click', this.boundTranscriptClick);
	}

	private detachHighlighting() {
		try {
			const transcriptDiv = this.shadowRoot?.querySelector('.transcript') as HTMLDivElement | null;
			if (this.audioElement) {
				// Pause playback to avoid audio continuing after the viewer is removed
				try {
					this.audioElement.pause();
				} catch (e) {
					// ignore
				}
				if (this.boundTimeUpdate) {
					this.audioElement.removeEventListener('timeupdate', this.boundTimeUpdate);
				}
			}
			if (transcriptDiv && this.boundTranscriptClick) {
				transcriptDiv.removeEventListener('click', this.boundTranscriptClick);
			}
		} finally {
			this.audioElement = null;
			this.boundTimeUpdate = null;
			this.boundTranscriptClick = null;
		}
	}

	override disconnectedCallback() {
		this.detachHighlighting();
		super.disconnectedCallback && super.disconnectedCallback();
	}

	override updated(changed: Map<string, any>) {
		super.updated(changed);
		if (changed.has('vttContent') || changed.has('audioId')) {
			this.setupHighlighting();
		}
	}

	private renderFromVTT() {
		if (!this.vttContent) return html``;
		const segments = parseVTT(this.vttContent);
		const paragraphGroups = new Map<string, VTTSegment[]>();

		for (const segment of segments) {
			const id = (segment.index || "").trim();
			const match = id.match(/^Paragraph\s+(\d+)-/);
			const paraNum = match ? match[1] : '0';
			if (!paragraphGroups.has(paraNum)) paragraphGroups.set(paraNum, []);
			paragraphGroups.get(paraNum)!.push(segment);
		}

		const paragraphs = Array.from(paragraphGroups.entries()).map(([_, groupSegments]) => {
			const fullText = groupSegments.map(s => s.text || '').join(' ');
			const sentences = fullText.split(/(?<=[\.\!\?])\s+/g).filter(Boolean);
			const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
			const totalWords = Math.max(1, wordCounts.reduce((a, b) => a + b, 0));
			const paraStart = Math.min(...groupSegments.map(s => s.start ?? 0));
			const paraEnd = Math.max(...groupSegments.map(s => s.end ?? paraStart));
			let acc = 0;
			const paraDuration = paraEnd - paraStart;

			return html`<div class="paragraph">${sentences.map((sent, si) => {
				const startOffset = (acc / totalWords) * paraDuration;
				acc += wordCounts[si];
				const sentenceDuration = (wordCounts[si] / totalWords) * paraDuration;
				const endOffset = si < sentences.length - 1 ? startOffset + sentenceDuration - 0.001 : paraEnd - paraStart;
				const spanStart = paraStart + startOffset;
				const spanEnd = paraStart + endOffset;
				return html`<span class="segment" data-start="${spanStart}" data-end="${spanEnd}">${sent}</span>${si < sentences.length - 1 ? ' ' : ''}`;
			})}</div>`;
		});

		return html`${paragraphs}`;
	}

	override render() {
		return html`<div class="transcript">${this.renderFromVTT()}</div>`;
	}
}
