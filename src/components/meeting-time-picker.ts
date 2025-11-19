import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface MeetingTime {
	day: string;
	startTime: string;
	endTime: string;
	label: string;
}

interface DayState {
	day: string;
	shortName: string;
	selected: boolean;
}

@customElement("meeting-time-picker")
export class MeetingTimePicker extends LitElement {
	@property({ type: Array }) value: MeetingTime[] = [];

	@state() private days: DayState[] = [
		{ day: "Monday", shortName: "Mon", selected: false },
		{ day: "Tuesday", shortName: "Tue", selected: false },
		{ day: "Wednesday", shortName: "Wed", selected: false },
		{ day: "Thursday", shortName: "Thu", selected: false },
		{ day: "Friday", shortName: "Fri", selected: false },
		{ day: "Saturday", shortName: "Sat", selected: false },
		{ day: "Sunday", shortName: "Sun", selected: false },
	];

	static override styles = css`
    :host {
      display: block;
    }

    .day-selector {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .day-button {
      flex: 1;
      min-width: 3.5rem;
      padding: 0.75rem 0.5rem;
      background: var(--background);
      border: 2px solid var(--secondary);
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
      color: var(--text);
    }

    .day-button:hover {
      border-color: var(--primary);
    }

    .day-button.selected {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }

    .helper-text {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--paynes-gray);
    }
  `;

	override connectedCallback() {
		super.connectedCallback();
		this.loadFromValue();
	}

	override updated(changedProperties: Map<string, unknown>) {
		if (changedProperties.has("value")) {
			this.loadFromValue();
		}
	}

	private loadFromValue() {
		// Always reset all days first
		this.days = this.days.map((d) => ({ ...d, selected: false }));

		// If no value, we're done
		if (!this.value || this.value.length === 0) return;

		// Load from value
		for (const meeting of this.value) {
			const dayIndex = this.days.findIndex((d) => d.day === meeting.day);
			if (dayIndex !== -1) {
				this.days = this.days.map((d, i) =>
					i === dayIndex ? { ...d, selected: true } : d,
				);
			}
		}
	}

	private toggleDay(index: number) {
		this.days = this.days.map((d, i) =>
			i === index ? { ...d, selected: !d.selected } : d,
		);
		this.dispatchChange();
	}

	private dispatchChange() {
		const selectedDays = this.days
			.filter((d) => d.selected)
			.map((d) => ({
				day: d.day,
				startTime: "",
				endTime: "",
				label: d.day,
			}));

		this.dispatchEvent(
			new CustomEvent("change", {
				detail: selectedDays,
				bubbles: true,
				composed: true,
			}),
		);
	}

	override render() {
		return html`
      <div class="day-selector">
        ${this.days.map(
					(day, index) => html`
          <button
            type="button"
            class="day-button ${day.selected ? "selected" : ""}"
            @click=${() => this.toggleDay(index)}
          >
            ${day.shortName}
          </button>
        `,
				)}
      </div>

      <div class="helper-text">
        Click on days to select when this class meets
      </div>
    `;
	}
}
