const transcriptionsComponent = document.getElementById(
	"transcriptions-component",
) as HTMLElement | null;
const usersComponent = document.getElementById(
	"users-component",
) as HTMLElement | null;
const userModal = document.getElementById("user-modal") as HTMLElement | null;
const transcriptModal = document.getElementById(
	"transcript-modal",
) as HTMLElement | null;
const errorMessage = document.getElementById("error-message") as HTMLElement;
const loading = document.getElementById("loading") as HTMLElement;
const content = document.getElementById("content") as HTMLElement;

// Modal functions
function openUserModal(userId: string) {
	userModal.setAttribute("open", "");
	userModal.userId = userId;
}

function closeUserModal() {
	userModal.removeAttribute("open");
	userModal.userId = null;
}

function openTranscriptModal(transcriptId: string) {
	transcriptModal.setAttribute("open", "");
	transcriptModal.transcriptId = transcriptId;
}

function closeTranscriptModal() {
	transcriptModal.removeAttribute("open");
	transcriptModal.transcriptId = null;
}

// Listen for component events
transcriptionsComponent?.addEventListener(
	"open-transcription",
	(e: CustomEvent) => {
		openTranscriptModal(e.detail.id);
	},
);

usersComponent?.addEventListener("open-user", (e: CustomEvent) => {
	openUserModal(e.detail.id);
});

// Listen for modal close events
userModal?.addEventListener("close", closeUserModal);
userModal?.addEventListener("user-updated", async () => {
	await loadStats();
});
userModal?.addEventListener("click", (e: MouseEvent) => {
	if (e.target === userModal) closeUserModal();
});

transcriptModal?.addEventListener("close", closeTranscriptModal);
transcriptModal?.addEventListener("transcript-deleted", async () => {
	await loadStats();
});
transcriptModal?.addEventListener("click", (e: MouseEvent) => {
	if (e.target === transcriptModal) closeTranscriptModal();
});

async function loadStats() {
	try {
		const [transcriptionsRes, usersRes] = await Promise.all([
			fetch("/api/admin/transcriptions"),
			fetch("/api/admin/users"),
		]);

		if (!transcriptionsRes.ok || !usersRes.ok) {
			if (transcriptionsRes.status === 403 || usersRes.status === 403) {
				window.location.href = "/";
				return;
			}
			throw new Error("Failed to load admin data");
		}

		const transcriptions = await transcriptionsRes.json();
		const users = await usersRes.json();

		const totalUsers = document.getElementById("total-users");
		const totalTranscriptions = document.getElementById("total-transcriptions");
		const failedTranscriptions = document.getElementById(
			"failed-transcriptions",
		);

		if (totalUsers) totalUsers.textContent = users.length.toString();
		if (totalTranscriptions)
			totalTranscriptions.textContent = transcriptions.length.toString();

		const failed = transcriptions.filter(
			(t: { status: string }) => t.status === "failed",
		);
		if (failedTranscriptions)
			failedTranscriptions.textContent = failed.length.toString();

		loading.classList.add("hidden");
		content.classList.remove("hidden");
	} catch (error) {
		errorMessage.textContent = (error as Error).message;
		errorMessage.classList.remove("hidden");
		loading.classList.add("hidden");
	}
}

// Tab switching
function switchTab(tabName: string) {
	document.querySelectorAll(".tab").forEach((t) => {
		t.classList.remove("active");
	});
	document.querySelectorAll(".tab-content").forEach((c) => {
		c.classList.remove("active");
	});

	const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
	const tabContent = document.getElementById(`${tabName}-tab`);

	if (tabButton && tabContent) {
		tabButton.classList.add("active");
		tabContent.classList.add("active");

		// Update URL without reloading
		const url = new URL(window.location.href);
		url.searchParams.set("tab", tabName);
		// Remove subtab param when leaving classes tab
		if (tabName !== "classes") {
			url.searchParams.delete("subtab");
		}
		window.history.pushState({}, "", url);
	}
}

document.querySelectorAll(".tab").forEach((tab) => {
	tab.addEventListener("click", () => {
		switchTab((tab as HTMLElement).dataset.tab || "");
	});
});

// Check for tab query parameter on load
const params = new URLSearchParams(window.location.search);
const initialTab = params.get("tab");
const validTabs = ["pending", "transcriptions", "users", "classes"];

if (initialTab && validTabs.includes(initialTab)) {
	switchTab(initialTab);
}

// Initialize
loadStats();
