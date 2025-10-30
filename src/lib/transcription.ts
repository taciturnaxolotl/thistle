import type { Database } from "bun:sqlite";
import { createEventSource } from "eventsource-client";
import { ErrorCode } from "./errors";

// Constants
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const MAX_TRANSCRIPT_LENGTH = 50000;
export const MAX_ERROR_LENGTH = 255;

// Types
export type TranscriptionStatus =
	| "uploading"
	| "processing"
	| "completed"
	| "failed";

export interface TranscriptionUpdate {
	status: TranscriptionStatus;
	progress: number;
	transcript?: string;
	error_message?: string;
	error_code?: string;
}

export interface WhisperJob {
	id: string;
	status: string;
	progress?: number;
	transcript?: string;
	error_message?: string;
}

// Event emitter for real-time transcription updates with automatic cleanup
export class TranscriptionEventEmitter {
	private listeners = new Map<
		string,
		Set<(data: TranscriptionUpdate) => void>
	>();
	private cleanupTimers = new Map<string, NodeJS.Timeout>();

	on(transcriptionId: string, callback: (data: TranscriptionUpdate) => void) {
		if (!this.listeners.has(transcriptionId)) {
			this.listeners.set(transcriptionId, new Set());
		}
		this.listeners.get(transcriptionId)?.add(callback);

		// Clear any pending cleanup for this transcription
		const timer = this.cleanupTimers.get(transcriptionId);
		if (timer) {
			clearTimeout(timer);
			this.cleanupTimers.delete(transcriptionId);
		}
	}

	off(transcriptionId: string, callback: (data: TranscriptionUpdate) => void) {
		this.listeners.get(transcriptionId)?.delete(callback);

		// Schedule cleanup if no listeners remain
		if (this.listeners.get(transcriptionId)?.size === 0) {
			this.scheduleCleanup(transcriptionId);
		}
	}

	emit(transcriptionId: string, data: TranscriptionUpdate) {
		const callbacks = this.listeners.get(transcriptionId);
		if (callbacks) {
			for (const callback of callbacks) {
				callback(data);
			}
		}

		// Auto-cleanup completed/failed jobs after emission
		if (data.status === "completed" || data.status === "failed") {
			this.scheduleCleanup(transcriptionId);
		}
	}

	hasListeners(transcriptionId: string): boolean {
		return (this.listeners.get(transcriptionId)?.size ?? 0) > 0;
	}

	private scheduleCleanup(transcriptionId: string) {
		// Clean up listeners after 5 minutes of inactivity
		const timer = setTimeout(
			() => {
				this.listeners.delete(transcriptionId);
				this.cleanupTimers.delete(transcriptionId);
			},
			5 * 60 * 1000,
		);

		this.cleanupTimers.set(transcriptionId, timer);
	}
}

// Whisper service manager
export class WhisperServiceManager {
	private activeStreams = new Map<
		string,
		ReturnType<typeof createEventSource>
	>();
	private streamLocks = new Set<string>();

	constructor(
		private serviceUrl: string,
		private db: Database,
		private events: TranscriptionEventEmitter,
	) {}

	async startTranscription(
		transcriptionId: string,
		filename: string,
	): Promise<void> {
		try {
			// Update status to processing
			this.updateTranscription(transcriptionId, {
				status: "processing",
				progress: 10,
			});

			// Read file from disk
			const filePath = `./uploads/${filename}`;
			const fileBuffer = await Bun.file(filePath).arrayBuffer();

			// Create form data for the faster-whisper server
			const formData = new FormData();
			const file = new File([fileBuffer], filename, { type: "audio/mpeg" });
			formData.append("file", file);

			// Call the faster-whisper server to start transcription
			const response = await fetch(`${this.serviceUrl}/transcribe`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				throw new Error(
					`Whisper service returned ${response.status}: ${errorText}`,
				);
			}

			const { job_id } = await response.json();
			console.log(
				`[Transcription] Created Whisper job ${job_id} for ${transcriptionId}`,
			);

			// Connect to SSE stream from Whisper
			this.streamWhisperJob(transcriptionId, job_id, filePath);
		} catch (error) {
			console.error(
				`[Transcription] Failed to start ${transcriptionId}:`,
				error,
			);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const errorCode =
				error instanceof Error && error.message.includes("Whisper service")
					? ErrorCode.WHISPER_SERVICE_ERROR
					: ErrorCode.TRANSCRIPTION_FAILED;

			this.updateTranscription(transcriptionId, {
				status: "failed",
				error_message: errorMessage,
			});

			this.events.emit(transcriptionId, {
				status: "failed",
				progress: 0,
				error_message: errorMessage,
				error_code: errorCode,
			});
		}
	}

	private streamWhisperJob(
		transcriptionId: string,
		jobId: string,
		filePath: string,
	) {
		// Prevent duplicate streams using locks
		if (this.streamLocks.has(transcriptionId)) {
			console.log(`[Stream] Already streaming ${transcriptionId}, skipping`);
			return;
		}

		this.streamLocks.add(transcriptionId);

		const es = createEventSource({
			url: `${this.serviceUrl}/transcribe/${jobId}/stream`,
			onMessage: ({ data }) => {
				try {
					const update = JSON.parse(data) as WhisperJob;
					this.handleWhisperUpdate(transcriptionId, jobId, filePath, update);
				} catch (err) {
					console.error(
						`[Stream] Error processing update for ${transcriptionId}:`,
						err,
					);
				}
			},
		});

		this.activeStreams.set(transcriptionId, es);
	}

	private handleWhisperUpdate(
		transcriptionId: string,
		jobId: string,
		filePath: string,
		update: WhisperJob,
	) {
		if (update.status === "processing") {
			const progress = Math.max(10, Math.min(95, update.progress ?? 0));
			this.updateTranscription(transcriptionId, { progress });

			this.events.emit(transcriptionId, {
				status: "processing",
				progress,
			});
		} else if (update.status === "completed") {
			const transcript = (update.transcript ?? "").substring(
				0,
				MAX_TRANSCRIPT_LENGTH,
			);

			this.updateTranscription(transcriptionId, {
				status: "completed",
				progress: 100,
				transcript,
			});

			this.events.emit(transcriptionId, {
				status: "completed",
				progress: 100,
				transcript,
			});

			// Clean up
			this.cleanupJob(transcriptionId, jobId, filePath);
		} else if (update.status === "failed") {
			const errorMessage = (
				update.error_message ?? "Transcription failed"
			).substring(0, MAX_ERROR_LENGTH);

			this.updateTranscription(transcriptionId, {
				status: "failed",
				error_message: errorMessage,
			});

			this.events.emit(transcriptionId, {
				status: "failed",
				progress: 0,
				error_message: errorMessage,
				error_code: ErrorCode.TRANSCRIPTION_FAILED,
			});

			this.closeStream(transcriptionId);
			this.deleteWhisperJob(jobId);
		}
	}

	private cleanupJob(transcriptionId: string, jobId: string, filePath: string) {
		// Delete uploaded file
		Bun.file(filePath)
			.text()
			.then(() => Bun.write(filePath, ""))
			.catch(() => {});

		this.closeStream(transcriptionId);
		this.deleteWhisperJob(jobId);
	}

	private closeStream(transcriptionId: string) {
		const es = this.activeStreams.get(transcriptionId);
		if (es) {
			es.close();
			this.activeStreams.delete(transcriptionId);
		}
		this.streamLocks.delete(transcriptionId);
	}

	private async deleteWhisperJob(jobId: string) {
		try {
			await fetch(`${this.serviceUrl}/transcribe/${jobId}`, {
				method: "DELETE",
			});
		} catch {
			// Silent fail - job may already be deleted
		}
	}

	private updateTranscription(
		transcriptionId: string,
		data: {
			status?: TranscriptionStatus;
			progress?: number;
			transcript?: string;
			error_message?: string;
		},
	) {
		const updates: string[] = [];
		const values: (string | number)[] = [];

		if (data.status !== undefined) {
			updates.push("status = ?");
			values.push(data.status);
		}
		if (data.progress !== undefined) {
			updates.push("progress = ?");
			values.push(data.progress);
		}
		if (data.transcript !== undefined) {
			updates.push("transcript = ?");
			values.push(data.transcript);
		}
		if (data.error_message !== undefined) {
			updates.push("error_message = ?");
			values.push(data.error_message);
		}

		updates.push("updated_at = ?");
		values.push(Math.floor(Date.now() / 1000));

		values.push(transcriptionId);

		this.db.run(
			`UPDATE transcriptions SET ${updates.join(", ")} WHERE id = ?`,
			values,
		);
	}

	async syncWithWhisper(): Promise<void> {
		try {
			const whisperJobs = await this.fetchWhisperJobs();
			if (!whisperJobs) return;

			const activeDbJobs = this.getActiveDbJobs();
			const activeJobsMap = new Map(activeDbJobs.map((j) => [j.id, j]));

			await this.syncWhisperJobsToDb(whisperJobs, activeJobsMap);
			await this.syncDbJobsToWhisper(activeDbJobs, whisperJobs);
		} catch (error) {
			console.warn(
				"[Sync] Failed:",
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	}

	private async fetchWhisperJobs(): Promise<WhisperJob[] | null> {
		try {
			const response = await fetch(`${this.serviceUrl}/jobs`);
			if (!response.ok) {
				console.warn("[Sync] Whisper service unavailable");
				return null;
			}
			const { jobs } = await response.json();
			return jobs;
		} catch {
			return null;
		}
	}

	private getActiveDbJobs(): Array<{
		id: string;
		filename: string;
		status: string;
	}> {
		return this.db
			.query<{ id: string; filename: string; status: string }, []>(
				"SELECT id, filename, status FROM transcriptions WHERE status IN ('uploading', 'processing')",
			)
			.all();
	}

	private async syncWhisperJobsToDb(
		whisperJobs: WhisperJob[],
		activeJobsMap: Map<
			string,
			{ id: string; filename: string; status: string }
		>,
	) {
		for (const whisperJob of whisperJobs) {
			const localJob = activeJobsMap.get(whisperJob.id);

			if (!localJob) {
				await this.handleOrphanedWhisperJob(whisperJob.id);
				continue;
			}

			if (whisperJob.status === "completed" || whisperJob.status === "failed") {
				await this.syncCompletedJob(whisperJob);
			}
		}
	}

	private async handleOrphanedWhisperJob(jobId: string) {
		const jobExists = this.db
			.query<{ id: string }, [string]>(
				"SELECT id FROM transcriptions WHERE id = ?",
			)
			.get(jobId);

		if (!jobExists) {
			// Not our job, delete it from Whisper
			await this.deleteWhisperJob(jobId);
		}
	}

	private async syncCompletedJob(whisperJob: WhisperJob) {
		try {
			const details = await this.fetchJobDetails(whisperJob.id);
			if (!details) return;

			if (details.status === "completed") {
				const transcript =
					details.transcript?.substring(0, MAX_TRANSCRIPT_LENGTH) ?? "";

				this.updateTranscription(whisperJob.id, {
					status: "completed",
					progress: 100,
					transcript,
				});

				this.events.emit(whisperJob.id, {
					status: "completed",
					progress: 100,
					transcript,
				});
			} else if (details.status === "failed") {
				const errorMessage = (
					details.error_message ?? "Transcription failed"
				).substring(0, MAX_ERROR_LENGTH);

				this.updateTranscription(whisperJob.id, {
					status: "failed",
					error_message: errorMessage,
				});

				this.events.emit(whisperJob.id, {
					status: "failed",
					progress: 0,
					error_message: errorMessage,
				});
			}

			await this.deleteWhisperJob(whisperJob.id);
		} catch {
			console.warn(
				`[Sync] Failed to retrieve details for job ${whisperJob.id}`,
			);
		}
	}

	private async fetchJobDetails(jobId: string): Promise<WhisperJob | null> {
		const response = await fetch(`${this.serviceUrl}/transcribe/${jobId}`);
		if (!response.ok) return null;
		return response.json();
	}

	private async syncDbJobsToWhisper(
		activeDbJobs: Array<{ id: string; filename: string; status: string }>,
		whisperJobs: WhisperJob[],
	) {
		for (const localJob of activeDbJobs) {
			const whisperHasJob = whisperJobs.some((wj) => wj.id === localJob.id);

			if (!whisperHasJob) {
				// Job was lost, mark as failed
				const errorMessage = "Job lost - whisper service may have restarted";

				this.updateTranscription(localJob.id, {
					status: "failed",
					error_message: errorMessage,
				});

				this.events.emit(localJob.id, {
					status: "failed",
					progress: 0,
					error_message: errorMessage,
				});
			}
		}
	}

	async cleanupStaleFiles(): Promise<void> {
		try {
			// Find transcriptions older than 24 hours that are completed or failed
			const staleTranscriptions = this.db
				.query<{ filename: string }, [number]>(
					`SELECT filename FROM transcriptions 
					 WHERE status IN ('completed', 'failed') 
					 AND updated_at < ?`,
				)
				.all(Math.floor(Date.now() / 1000) - 24 * 60 * 60);

			for (const { filename } of staleTranscriptions) {
				const filePath = `./uploads/${filename}`;
				await Bun.write(filePath, "").catch(() => {});
			}

			console.log(
				`[Cleanup] Removed ${staleTranscriptions.length} stale files`,
			);
		} catch (error) {
			console.error("[Cleanup] Failed:", error);
		}
	}
}
