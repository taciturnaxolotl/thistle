import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

declare global {
	interface Window {
		confetti: (options: {
			particleCount?: number;
			spread?: number;
			startVelocity?: number;
			decay?: number;
			scalar?: number;
			origin?: { x?: number; y?: number };
		}) => void;
	}
}

@customElement("checkout-success")
export class CheckoutSuccess extends LitElement {
	@state() checkoutId: string | null = null;
	@state() loading = true;
	@state() error = "";

	static override styles = css`
		:host {
			display: block;
			max-width: 48rem;
			margin: 0 auto;
			padding: 2rem;
		}

		.success-container {
			text-align: center;
			padding: 3rem 2rem;
		}

		.success-icon {
			font-size: 5rem;
			margin-bottom: 1.5rem;
			animation: bounce 0.6s ease-out;
		}

		@keyframes bounce {
			0%, 100% { transform: translateY(0); }
			50% { transform: translateY(-20px); }
		}

		h1 {
			color: var(--text);
			margin-bottom: 1rem;
			font-size: 2.5rem;
		}

		.message {
			color: var(--text);
			opacity: 0.8;
			margin-bottom: 2rem;
			line-height: 1.8;
			font-size: 1.125rem;
		}

		.highlight {
			color: var(--accent);
			font-weight: 600;
		}

		.features {
			background: var(--background);
			border: 1px solid var(--secondary);
			border-radius: 12px;
			padding: 2rem;
			margin: 2rem 0;
			text-align: left;
		}

		.features h2 {
			color: var(--text);
			font-size: 1.25rem;
			margin: 0 0 1.5rem 0;
			text-align: center;
		}

		.feature-list {
			list-style: none;
			padding: 0;
			margin: 0;
			display: grid;
			gap: 1rem;
		}

		.feature-item {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			color: var(--text);
			font-size: 1rem;
		}

		.feature-icon {
			font-size: 1.5rem;
			flex-shrink: 0;
		}

		.checkout-id {
			background: var(--background);
			border: 1px solid var(--secondary);
			border-radius: 8px;
			padding: 1rem;
			margin: 2rem 0;
			font-family: monospace;
			font-size: 0.875rem;
			color: var(--text);
			opacity: 0.6;
			word-break: break-all;
		}

		.actions {
			display: flex;
			gap: 1rem;
			justify-content: center;
			flex-wrap: wrap;
			margin-top: 2rem;
		}

		.btn {
			padding: 0.75rem 1.5rem;
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s;
			font-family: inherit;
			border: 2px solid transparent;
			text-decoration: none;
			display: inline-block;
		}

		.btn-affirmative {
			background: var(--primary);
			color: white;
			border-color: var(--primary);
		}

		.btn-affirmative:hover {
			background: var(--gunmetal);
			border-color: var(--gunmetal);
		}

		.btn-neutral {
			background: transparent;
			color: var(--text);
			border-color: var(--secondary);
		}

		.btn-neutral:hover {
			border-color: var(--primary);
			color: var(--primary);
		}

		.error {
			color: var(--accent);
			text-align: center;
			padding: 2rem;
		}

		.loading {
			text-align: center;
			color: var(--text);
			padding: 2rem;
		}

		@media (max-width: 768px) {
			h1 {
				font-size: 2rem;
			}

			.message {
				font-size: 1rem;
			}
		}
	`;

	override connectedCallback() {
		super.connectedCallback();
		const params = new URLSearchParams(window.location.search);
		this.checkoutId = params.get("checkout_id");
		this.loading = false;

		// Trigger confetti after a short delay
		setTimeout(() => this.fireConfetti(), 300);
	}

	fireConfetti() {
		if (!window.confetti) return;

		const count = 200;
		const defaults = {
			origin: { y: 0.7 },
		};

		const fire = (particleRatio: number, opts: object) => {
			window.confetti({
				...defaults,
				...opts,
				particleCount: Math.floor(count * particleRatio),
			});
		};

		fire(0.25, {
			spread: 26,
			startVelocity: 55,
		});

		fire(0.2, {
			spread: 60,
		});

		fire(0.35, {
			spread: 100,
			decay: 0.91,
			scalar: 0.8,
		});

		fire(0.1, {
			spread: 120,
			startVelocity: 25,
			decay: 0.92,
			scalar: 1.2,
		});

		fire(0.1, {
			spread: 120,
			startVelocity: 45,
		});
	}

	override render() {
		if (this.loading) {
			return html`<div class="loading">Loading...</div>`;
		}

		if (this.error) {
			return html`<div class="error">${this.error}</div>`;
		}

		return html`
			<div class="success-container">
				<div class="success-icon">🎉</div>
				<h1>Thanks for purchasing a subscription for thistle!</h1>
				<p class="message">
					
					${
						this.checkoutId
							? html`
								<div class="checkout-id">
									Checkout ID: ${this.checkoutId}
								</div>
							`
							: ""
					}
					Go checkout your classes and try recording a lecture!
				</p>
				
				<div class="actions">
					<a href="/classes" class="btn btn-affirmative">
						Lets go!!!
					</a>
				</div>
			</div>
		`;
	}
}
