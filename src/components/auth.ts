import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

interface User {
	email: string;
	name: string | null;
	avatar: string;
}

@customElement("auth-component")
export class AuthComponent extends LitElement {
	@state() user: User | null = null;
	@state() loading = true;
	@state() showModal = false;
	@state() email = "";
	@state() password = "";
	@state() name = "";
	@state() error = "";
	@state() isSubmitting = false;
	@state() needsRegistration = false;

	static override styles = css`
		:host {
			display: block;
			position: fixed;
			top: 2rem;
			right: 2rem;
			z-index: 1000;
		}

		.auth-button {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: var(--primary);
			color: white;
			border: 2px solid var(--primary);
			border-radius: 8px;
			cursor: pointer;
			font-size: 1rem;
			font-weight: 500;
			transition: all 0.2s;
			font-family: inherit;
		}

		.auth-button:hover {
			background: transparent;
			color: var(--primary);
		}

		.auth-button:hover .email {
			color: var(--primary);
		}

		.auth-button img {
			transition: all 0.2s;
		}

		.auth-button:hover img {
			opacity: 0.8;
		}

		.user-info {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}

		.email {
			font-weight: 500;
			color: white;
			font-size: 0.875rem;
			transition: all 0.2s;
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
			z-index: 2000;
			padding: 1rem;
		}

		.modal {
			background: var(--background);
			border: 2px solid var(--secondary);
			border-radius: 12px;
			padding: 2rem;
			max-width: 400px;
			width: 100%;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		}

		.modal h2 {
			margin-top: 0;
			color: var(--text);
			font-size: 1.777rem;
		}

		.modal form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.field {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.field label {
			font-weight: 500;
			color: var(--text);
		}

		.field input {
			padding: 0.75rem;
			border: 2px solid var(--secondary);
			border-radius: 6px;
			font-size: 1rem;
			font-family: inherit;
			background: var(--background);
			color: var(--text);
		}

		.field input:focus {
			outline: none;
			border-color: var(--primary);
		}

		.error {
			color: var(--accent);
			font-size: 0.875rem;
			margin: 0;
		}

		.btn {
			padding: 0.75rem 1.5rem;
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s;
			font-family: inherit;
			border: 2px solid;
		}

		.btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.btn-affirmative {
			background: var(--primary);
			color: white;
			border-color: var(--primary);
		}

		.btn-affirmative:hover:not(:disabled) {
			background: transparent;
			color: var(--primary);
		}

		.btn-neutral {
			background: transparent;
			color: var(--text);
			border-color: var(--secondary);
		}

		.btn-neutral:hover:not(:disabled) {
			border-color: var(--primary);
			color: var(--primary);
		}

		.btn-rejection {
			background: transparent;
			color: var(--accent);
			border-color: var(--accent);
		}

		.btn-rejection:hover:not(:disabled) {
			background: var(--accent);
			color: white;
		}

		.modal-actions {
			display: flex;
			gap: 0.5rem;
			margin-top: 1rem;
		}

		.user-menu {
			position: absolute;
			top: calc(100% + 0.5rem);
			right: 0;
			background: var(--background);
			border: 2px solid var(--secondary);
			border-radius: 8px;
			padding: 0.5rem;
			min-width: 200px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.user-menu a,
		.user-menu button {
			padding: 0.75rem 1rem;
			background: transparent;
			color: var(--text);
			text-decoration: none;
			border: none;
			border-radius: 6px;
			font-weight: 500;
			text-align: left;
			transition: all 0.2s;
			font-family: inherit;
			font-size: 1rem;
			cursor: pointer;
		}

		.user-menu a:hover,
		.user-menu button:hover {
			background: var(--secondary);
		}

		.loading {
			font-size: 0.875rem;
			color: var(--text);
		}

		.info-text {
			color: var(--text);
			font-size: 0.875rem;
			margin: 0;
		}
	`;

	override async connectedCallback() {
		super.connectedCallback();
		await this.checkAuth();
	}

	async checkAuth() {
		try {
			const response = await fetch("/api/auth/me");

			if (response.ok) {
				this.user = await response.json();
			}
		} finally {
			this.loading = false;
		}
	}

	private openModal() {
		this.showModal = true;
		this.needsRegistration = false;
		this.email = "";
		this.password = "";
		this.name = "";
		this.error = "";
	}

	private closeModal() {
		this.showModal = false;
		this.email = "";
		this.password = "";
		this.name = "";
		this.error = "";
		this.needsRegistration = false;
	}

	private async handleSubmit(e: Event) {
		e.preventDefault();
		this.error = "";
		this.isSubmitting = true;

		try {
			if (this.needsRegistration) {
				const response = await fetch("/api/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: this.email,
						password: this.password,
						name: this.name,
					}),
				});

				if (!response.ok) {
					const data = await response.json();
					this.error = data.error || "Registration failed";
					return;
				}

				this.user = await response.json();
				this.closeModal();
				await this.checkAuth();
				window.dispatchEvent(new CustomEvent("auth-changed"));
			} else {
				const response = await fetch("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: this.email,
						password: this.password,
					}),
				});

				if (!response.ok) {
					const data = await response.json();

					if (
						response.status === 401 &&
						data.error?.includes("Invalid email")
					) {
						this.needsRegistration = true;
						this.error = "";
						return;
					}

					this.error = data.error || "Login failed";
					return;
				}

				this.user = await response.json();
				this.closeModal();
				await this.checkAuth();
				window.dispatchEvent(new CustomEvent("auth-changed"));
			}
		} finally {
			this.isSubmitting = false;
		}
	}

	async handleLogout() {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			this.user = null;
			window.dispatchEvent(new CustomEvent("auth-changed"));
		} catch {
			// Silent fail
		}
	}

	private toggleUserMenu() {
		this.showModal = !this.showModal;
	}

	override render() {
		if (this.loading) {
			return html`<div class="loading">Loading...</div>`;
		}

		if (this.user) {
			return html`
				<div>
					<button class="auth-button" @click=${this.toggleUserMenu}>
						<img
							src="https://hostedboringavatars.vercel.app/api/marble?size=24&name=${this.user.avatar}&colors=2d3142ff,4f5d75ff,bfc0c0ff,ef8354ff"
							alt="Avatar"
							style="border-radius: 50%; width: 24px; height: 24px;"
						/>
						<span class="email">${this.user.name ?? this.user.email}</span>
						<span>▼</span>
					</button>
					${
						this.showModal
							? html`
							<div class="user-menu">
							<a href="/transcribe" @click=${this.closeModal}>Transcribe</a>
							<a href="/settings" @click=${this.closeModal}>Settings</a>
							 <button @click=${this.handleLogout}>Logout</button>
							</div>
					  `
							: ""
					}
				</div>
			`;
		}

		return html`
			<div>
				<button class="auth-button" @click=${this.openModal}>Login</button>
				${
					this.showModal
						? html`
							<div class="modal-overlay" @click=${this.closeModal}>
								<div class="modal" @click=${(e: Event) => e.stopPropagation()}>
									<h2>${this.needsRegistration ? "Complete Registration" : "Login"}</h2>
									${
										this.needsRegistration
											? html`
												<p class="info-text">
													Welcome! We'll create an account for <strong>${this.email}</strong>
												</p>
										  `
											: ""
									}
									<form @submit=${this.handleSubmit}>
										<div class="field">
											<label for="email">Email</label>
											<input
												type="email"
												id="email"
												.value=${this.email}
												@input=${(e: InputEvent) => {
													this.email = (e.target as HTMLInputElement).value;
												}}
												required
												?disabled=${this.needsRegistration}
											/>
										</div>

										${
											this.needsRegistration
												? html`
													<div class="field">
														<label for="name">Name</label>
														<input
															type="text"
															id="name"
															.value=${this.name}
															@input=${(e: InputEvent) => {
																this.name = (
																	e.target as HTMLInputElement
																).value;
															}}
															required
															placeholder="What should we call you?"
														/>
													</div>
											  `
												: ""
										}

										<div class="field">
											<label for="password">${this.needsRegistration ? "Create Password" : "Password"}</label>
											<input
												type="password"
												id="password"
												.value=${this.password}
												@input=${(e: InputEvent) => {
													this.password = (e.target as HTMLInputElement).value;
												}}
												required
												minlength="8"
												placeholder=${this.needsRegistration ? "At least 8 characters plz" : ""}
											/>
										</div>

										${this.error ? html`<p class="error">${this.error}</p>` : ""}

										<div class="modal-actions">
											<button
												type="submit"
												class="btn btn-affirmative"
												?disabled=${this.isSubmitting}
											>
												${
													this.isSubmitting
														? "Loading..."
														: this.needsRegistration
															? "Create Account"
															: "Login"
												}
											</button>
											<button
												type="button"
												class="btn btn-neutral"
												@click=${this.closeModal}
											>
												Cancel
											</button>
										</div>
									</form>
								</div>
							</div>
					  `
						: ""
				}
			</div>
		`;
	}
}
