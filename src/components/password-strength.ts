import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface PasswordStrengthResult {
	score: number;
	label: string;
	color: string;
	isValid: boolean;
	isChecking: boolean;
	isPwned: boolean;
}

@customElement("password-strength")
export class PasswordStrength extends LitElement {
	@property({ type: String }) password = "";
	@state() private isChecking = false;
	@state() private isPwned = false;
	@state() private hasChecked = false;

	static override styles = css`
		:host {
			display: block;
			margin-top: 0.5rem;
		}

		.strength-container {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.strength-bar-container {
			width: 100%;
			height: 0.5rem;
			background: var(--secondary);
			border-radius: 4px;
			overflow: hidden;
		}

		.strength-bar {
			height: 100%;
			transition: width 0.3s ease, background-color 0.3s ease;
			border-radius: 4px;
		}

		.strength-info {
			display: flex;
			justify-content: space-between;
			align-items: center;
			font-size: 0.75rem;
		}

		.strength-label {
			font-weight: 500;
		}

		.pwned-warning {
			color: var(--accent);
			font-size: 0.75rem;
			font-weight: 500;
		}

		.checking {
			color: var(--paynes-gray);
			font-size: 0.75rem;
		}
	`;

	private calculateStrength(): PasswordStrengthResult {
		const password = this.password;
		let score = 0;

		if (!password) {
			return {
				score: 0,
				label: "",
				color: "transparent",
				isValid: false,
				isChecking: this.isChecking,
				isPwned: this.isPwned,
			};
		}

		// Length bonus (up to 40 points)
		score += Math.min(password.length * 3, 40);

		// Character variety (up to 50 points)
		if (/[a-z]/.test(password)) score += 10;
		if (/[A-Z]/.test(password)) score += 10;
		if (/[0-9]/.test(password)) score += 10;
		if (/[^a-zA-Z0-9]/.test(password)) score += 15;

		// Character diversity bonus (up to 10 points)
		const uniqueChars = new Set(password).size;
		score += Math.min(uniqueChars, 10);

		score = Math.min(score, 100);

		let label = "";
		let color = "";
		let isValid = false;

		if (score < 30) {
			label = "Weak";
			color = "#ef8354"; // accent/coral
			isValid = false;
		} else if (score < 60) {
			label = "Fair";
			color = "#f4a261"; // orange
			isValid = password.length >= 12;
		} else if (score < 80) {
			label = "Strong";
			color = "#2a9d8f"; // teal
			isValid = true;
		} else {
			label = "Excellent";
			color = "#264653"; // dark teal
			isValid = true;
		}

		// Invalid if pwned
		if (this.isPwned && this.hasChecked) {
			isValid = false;
		}

		return {
			score,
			label,
			color,
			isValid,
			isChecking: this.isChecking,
			isPwned: this.isPwned,
		};
	}

	async checkHIBP(password: string) {
		if (!password || password.length < 8) {
			this.hasChecked = true;
			return;
		}

		this.isChecking = true;
		this.isPwned = false;

		try {
			// Hash password with SHA-1
			const encoder = new TextEncoder();
			const data = encoder.encode(password);
			const hashBuffer = await crypto.subtle.digest("SHA-1", data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("")
				.toUpperCase();

			// Send first 5 chars to HIBP API (k-anonymity)
			const prefix = hashHex.substring(0, 5);
			const suffix = hashHex.substring(5);

			const response = await fetch(
				`https://api.pwnedpasswords.com/range/${prefix}`,
			);

			if (response.ok) {
				const text = await response.text();
				const hashes = text.split("\n");

				// Check if our hash suffix appears in the response
				this.isPwned = hashes.some((line) => line.startsWith(suffix));
			}
		} catch (error) {
			console.error("HIBP check failed:", error);
			// Don't block on error
		} finally {
			this.isChecking = false;
			this.hasChecked = true;
		}
	}

	// Public method to get current state
	getStrengthResult(): PasswordStrengthResult {
		return this.calculateStrength();
	}

	override render() {
		const strength = this.calculateStrength();

		if (!this.password) {
			return html``;
		}

		return html`
			<div class="strength-container">
				<div class="strength-bar-container">
					<div
						class="strength-bar"
						style="width: ${strength.score}%; background-color: ${strength.color};"
					></div>
				</div>
				<div class="strength-info">
					<span class="strength-label">${strength.label}</span>
					${
						this.isChecking
							? html`<span class="checking">Checking security...</span>`
							: this.isPwned
								? html`<span class="pwned-warning"
										>⚠️ This password has been exposed in databreaches</span
									>`
								: ""
					}
				</div>
			</div>
		`;
	}

	override updated(changedProperties: Map<string, unknown>) {
		if (changedProperties.has("password")) {
			// Reset checking state when password changes
			this.hasChecked = false;
			this.isPwned = false;

			// Dispatch event so parent knows to disable/enable submit
			this.dispatchEvent(
				new CustomEvent("strength-change", {
					detail: this.calculateStrength(),
					bubbles: true,
					composed: true,
				}),
			);
		}
	}
}
