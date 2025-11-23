import type { Database } from "bun:sqlite";
import { createEventSource } from "eventsource-client";
import { ErrorCode } from "./errors";
import { saveTranscriptVTT } from "./transcript-storage";
import { cleanVTT } from "./vtt-cleaner";

// Constants
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_ERROR_LENGTH = 255;

// Types
export type TranscriptionStatus =
	| "uploading"
	| "processing"
	| "transcribing"
	| "finalizing"
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

	async checkHealth(): Promise<boolean> {
		try {
			const response = await fetch(`${this.serviceUrl}/jobs`, {
				method: "GET",
			});
			return response.ok;
		} catch {
			return false;
		}
	}

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

			// Create form data for the Murmur server
			const formData = new FormData();
			const file = new File([fileBuffer], filename, { type: "audio/mpeg" });
			formData.append("file", file);

			// Call the Murmur server to start transcription
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

			// Store Murmur's job_id in our database for tracking
			this.db.run("UPDATE transcriptions SET whisper_job_id = ? WHERE id = ?", [
				job_id,
				transcriptionId,
			]);

			// Connect to SSE stream from Murmur (use the job_id returned by Murmur)
			this.streamWhisperJob(transcriptionId, job_id);
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

	private streamWhisperJob(transcriptionId: string, jobId: string) {
		// Prevent duplicate streams using locks
		if (this.streamLocks.has(transcriptionId)) {
			return;
		}

		this.streamLocks.add(transcriptionId);

		const es = createEventSource({
			url: `${this.serviceUrl}/transcribe/${jobId}/stream`,
			onMessage: async ({ event, data }) => {
				try {
					// Handle "error" events from SSE (e.g., "Job not found")
					if (event === "error") {
						const errorData = JSON.parse(data) as { error: string };
						console.error(
							`[Stream] Whisper service error for ${transcriptionId}:`,
							errorData.error,
						);

						// Mark the job as failed in our database
						this.updateTranscription(transcriptionId, {
							status: "failed",
							error_message: errorData.error,
						});

						this.events.emit(transcriptionId, {
							status: "failed",
							progress: 0,
							error_message: errorData.error,
							error_code: ErrorCode.TRANSCRIPTION_FAILED,
						});

						this.closeStream(transcriptionId);
						return;
					}

					const update = JSON.parse(data) as WhisperJob;
					await this.handleWhisperUpdate(transcriptionId, update);
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

	private async handleWhisperUpdate(
		transcriptionId: string,
		update: WhisperJob,
	) {
		if (update.status === "pending") {
			// Initial status, no action needed
			return;
		}

		if (update.status === "processing") {
			// Murmur is initializing (file I/O, WhisperKit setup) - no transcript yet
			const progress = Math.min(100, update.progress ?? 0);

			this.updateTranscription(transcriptionId, {
				status: "processing",
				progress,
			});

			this.events.emit(transcriptionId, {
				status: "processing",
				progress,
			});
		} else if (update.status === "transcribing") {
			// Active transcription with progress callbacks
			const progress = Math.min(100, update.progress ?? 0);

			// If progress is still 0, keep status as "processing" until real progress starts
			const status = progress === 0 ? "processing" : "transcribing";

			// Strip WhisperKit special tokens from intermediate transcript
			let transcript = update.transcript ?? "";
			transcript = transcript.replace(/<\|[^|]+\|>/g, "").trim();

			this.updateTranscription(transcriptionId, {
				status,
				progress,
			});

			this.events.emit(transcriptionId, {
				status,
				progress,
				transcript: transcript || undefined,
			});
		} else if (update.status === "completed") {
			// Set to finalizing state while we fetch and process the VTT
			this.updateTranscription(transcriptionId, {
				status: "finalizing",
				progress: 100,
			});

			this.events.emit(transcriptionId, {
				status: "finalizing",
				progress: 100,
			});

			// Fetch and save VTT file from Murmur
			const whisperJobId = this.db
				.query<{ whisper_job_id: string }, [string]>(
					"SELECT whisper_job_id FROM transcriptions WHERE id = ?",
				)
				.get(transcriptionId)?.whisper_job_id;

			if (whisperJobId) {
				try {
					const vttResponse = await fetch(
						`${this.serviceUrl}/transcribe/${whisperJobId}?format=vtt`,
					);
					if (vttResponse.ok) {
						const vttContent = await vttResponse.text();
						const cleanedVTT = await cleanVTT(transcriptionId, vttContent);
						await saveTranscriptVTT(transcriptionId, cleanedVTT);
						this.updateTranscription(transcriptionId, {});
					}
				} catch (error) {
					console.warn(
						`[Transcription] Failed to fetch VTT for ${transcriptionId}:`,
						error,
					);
				}
			}

			this.updateTranscription(transcriptionId, {
				status: "completed",
				progress: 100,
			});

			this.events.emit(transcriptionId, {
				status: "completed",
				progress: 100,
			});

			// Close stream - keep audio file for playback
			this.closeStream(transcriptionId);
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

			// Only close stream - keep failed jobs in Whisper for debugging
			this.closeStream(transcriptionId);
		}
	}

	private closeStream(transcriptionId: string) {
		const es = this.activeStreams.get(transcriptionId);
		if (es) {
			es.close();
			this.activeStreams.delete(transcriptionId);
		}
		this.streamLocks.delete(transcriptionId);
	}

	private updateTranscription(
		transcriptionId: string,
		data: {
			status?: TranscriptionStatus;
			progress?: number;
			error_message?: string;
			vttContent?: string;
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
		const whisperJobs = await this.fetchWhisperJobs();
		if (!whisperJobs) {
			console.warn("[Sync] Murmur service unavailable");
			return;
		}

		const activeDbJobs = this.getActiveDbJobs();
		const activeJobsMap = new Map(activeDbJobs.map((j) => [j.id, j]));

		await this.syncWhisperJobsToDb(whisperJobs, activeJobsMap);
		await this.syncDbJobsToWhisper(activeDbJobs, whisperJobs);
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
		whisper_job_id: string | null;
		filename: string;
		status: string;
	}> {
		return this.db
			.query<
				{
					id: string;
					whisper_job_id: string | null;
					filename: string;
					status: string;
				},
				[]
			>(
				"SELECT id, whisper_job_id, filename, status FROM transcriptions WHERE status IN ('uploading', 'processing', 'transcribing')",
			)
			.all();
	}

	private async syncWhisperJobsToDb(
		whisperJobs: WhisperJob[],
		activeJobsMap: Map<
			string,
			{
				id: string;
				whisper_job_id: string | null;
				filename: string;
				status: string;
			}
		>,
	) {
		for (const whisperJob of whisperJobs) {
			// Try to find by whisper_job_id first, then fall back to id
			let localJob = Array.from(activeJobsMap.values()).find(
				(j) => j.whisper_job_id === whisperJob.id,
			);

			if (!localJob) {
				// Legacy: try matching by our transcriptionId === whisperJob.id
				localJob = activeJobsMap.get(whisperJob.id);
			}

			if (!localJob) {
				await this.handleOrphanedWhisperJob(whisperJob.id);
				continue;
			}

			// Reconnect to active jobs on startup
			if (
				whisperJob.status === "processing" ||
				whisperJob.status === "transcribing"
			) {
				// Check if we're already streaming this job
				if (!this.activeStreams.has(localJob.id)) {
					console.log(
						`[Sync] Reconnecting to active job ${localJob.id} (Murmur job ${whisperJob.id})`,
					);
					this.streamWhisperJob(localJob.id, whisperJob.id);
				}
			} else if (
				whisperJob.status === "completed" ||
				whisperJob.status === "failed"
			) {
				// Use our transcription ID, not Murmur's job ID
				await this.syncCompletedJob(whisperJob, localJob.id);
			}
		}
	}

	private async deleteWhisperJob(jobId: string) {
		try {
			const response = await fetch(`${this.serviceUrl}/transcribe/${jobId}`, {
				method: "DELETE",
			});
			if (response.ok) {
				console.log(`[Cleanup] Deleted job ${jobId} from Murmur`);
			} else {
				console.warn(
					`[Cleanup] Failed to delete job ${jobId}: ${response.status}`,
				);
			}
		} catch (error) {
			console.error(`[Cleanup] Error deleting job ${jobId}:`, error);
		}
	}

	private async handleOrphanedWhisperJob(jobId: string) {
		// Check if this Murmur job_id exists in our DB (either as id or whisper_job_id)
		const jobExists = this.db
			.query<{ id: string }, [string, string]>(
				"SELECT id FROM transcriptions WHERE id = ? OR whisper_job_id = ?",
			)
			.get(jobId, jobId);

		if (!jobExists) {
			// Not our job - delete it from Murmur
			console.warn(
				`[Sync] Found orphaned job ${jobId} in Murmur (not in our DB) - deleting...`,
			);
			await this.deleteWhisperJob(jobId);
		}
	}

	private async syncCompletedJob(
		whisperJob: WhisperJob,
		transcriptionId: string,
	) {
		try {
			const details = await this.fetchJobDetails(whisperJob.id);
			if (!details) return;

			if (details.status === "completed") {
				// Fetch and save VTT file
				try {
					const vttResponse = await fetch(
						`${this.serviceUrl}/transcribe/${whisperJob.id}?format=vtt`,
					);
					if (vttResponse.ok) {
						const vttContent = await vttResponse.text();
						const cleanedVTT = await cleanVTT(transcriptionId, vttContent);
						await saveTranscriptVTT(transcriptionId, cleanedVTT);
						this.updateTranscription(transcriptionId, {});
					}
				} catch (error) {
					console.warn(
						`[Sync] Failed to fetch VTT for ${transcriptionId}:`,
						error,
					);
				}

				// Set to finalizing state while we process
				this.updateTranscription(transcriptionId, {
					status: "finalizing",
					progress: 100,
				});

				this.events.emit(transcriptionId, {
					status: "finalizing",
					progress: 100,
				});

				// Then immediately mark as completed
				this.updateTranscription(transcriptionId, {
					status: "completed",
					progress: 100,
				});

				this.events.emit(transcriptionId, {
					status: "completed",
					progress: 100,
				});

				// Clean up job from Murmur after successful completion
				await this.deleteWhisperJob(whisperJob.id);
			} else if (details.status === "failed") {
				const errorMessage = (
					details.error_message ?? "Transcription failed"
				).substring(0, MAX_ERROR_LENGTH);

				this.updateTranscription(transcriptionId, {
					status: "failed",
					error_message: errorMessage,
				});

				this.events.emit(transcriptionId, {
					status: "failed",
					progress: 0,
					error_message: errorMessage,
				});

				// Clean up failed job from Murmur
				await this.deleteWhisperJob(whisperJob.id);
			}
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
		activeDbJobs: Array<{
			id: string;
			whisper_job_id: string | null;
			filename: string;
			status: string;
		}>,
		whisperJobs: WhisperJob[],
	) {
		for (const localJob of activeDbJobs) {
			// Check if Murmur has this job (by whisper_job_id or legacy id match)
			const whisperHasJob = whisperJobs.some(
				(wj) => wj.id === localJob.whisper_job_id || wj.id === localJob.id,
			);

			if (!whisperHasJob && localJob.whisper_job_id) {
				// Job was lost from Murmur, mark as failed
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
		} catch (error) {
			console.error("[Cleanup] Failed:", error);
		}
	}

	stop(): void {
		console.log("[Transcription] Closing active streams...");
		// Close all active SSE streams to Murmur
		for (const [transcriptionId, stream] of this.activeStreams.entries()) {
			try {
				stream.close();
				this.streamLocks.delete(transcriptionId);
			} catch (error) {
				console.error(
					`[Transcription] Error closing stream ${transcriptionId}:`,
					error,
				);
			}
		}
		this.activeStreams.clear();
		console.log("[Transcription] All streams closed");
	}
}
