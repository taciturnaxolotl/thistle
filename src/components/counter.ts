import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

// Simple counter web component using Lit
@customElement("counter-component")
export class CounterComponent extends LitElement {
	@property({ type: Number }) count = 10;

	static override styles = css`
    :host {
      display: block;
      margin: 2rem 0;
      padding: 2rem;
      border: 1px solid var(--secondary);
      border-radius: 8px;
      text-align: center;
      background: white;
    }

    .counter-display {
      font-size: 3rem;
      font-weight: bold;
      margin: 1rem 0;
      font-family: 'Charter', 'Bitstream Charter', 'Sitka Text', Cambria, serif;
      color: var(--primary);
    }

    button {
      font-family: 'Charter', 'Bitstream Charter', 'Sitka Text', Cambria, serif;
      font-size: 1rem;
      padding: 0.75rem 1.5rem;
      margin: 0 0.5rem;
      border: 2px solid var(--primary);
      background: var(--background);
      color: var(--text);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    button:hover {
      background: var(--primary);
      color: var(--background);
    }

    button:active {
      transform: scale(0.95);
    }

    button.reset {
      border-color: var(--accent);
    }

    button.reset:hover {
      background: var(--accent);
      color: var(--background);
    }
  `;

	private resetCounter() {
		this.count = 0;
	}

	override render() {
		return html`
      <div>
        <h3>Counter</h3>
        <div class="counter-display">${this.count}</div>
        <div>
          <button @click=${() => this.count--}>-</button>
          <button class="reset" @click=${this.resetCounter}>Reset</button>
          <button @click=${() => this.count++}>+</button>
        </div>
      </div>
    `;
	}
}
