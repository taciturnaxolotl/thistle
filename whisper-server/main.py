import os
import json
import tempfile
import asyncio
import sqlite3
import time
import uuid
from faster_whisper import WhisperModel
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

# --- 1. Load Model on Startup ---
# This loads the model only once, not on every request
print("--- Loading faster-whisper model... ---")
model_size = "small"
# You can change this to "cuda" and "float16" if you have a GPU
model = WhisperModel(model_size, device="cpu", compute_type="int8")
print(f"--- Model '{model_size}' loaded. Server is ready. ---")

# --- 2. Setup Database for Job Tracking ---
db_path = "./whisper.db"  # Independent DB for Whisper server
db = sqlite3.connect(db_path, check_same_thread=False)
db.execute("""
CREATE TABLE IF NOT EXISTS whisper_jobs (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0,
    transcript TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at INTEGER,
    updated_at INTEGER
)
""")
db.commit()

# --- 2. Create FastAPI App ---
app = FastAPI(title="Whisper Transcription Server with Progress")


# --- 3. Define the Transcription Function ---
# Runs in background and updates DB
def run_transcription(job_id: str, temp_file_path: str):
    try:
        # 1. Update to processing
        db.execute("UPDATE whisper_jobs SET status = 'processing', updated_at = ? WHERE id = ?", (int(time.time()), job_id))
        db.commit()

        # 2. Get segments and total audio duration
        segments, info = model.transcribe(
            temp_file_path,
            beam_size=5,
            vad_filter=True
        )

        total_duration = round(info.duration, 2)
        print(f"Job {job_id}: Total audio duration: {total_duration}s")
        print(f"Job {job_id}: Detected language: {info.language}")

        transcript = ""

        # 3. Process each segment
        for segment in segments:
            progress_percent = (segment.end / total_duration) * 100
            transcript += segment.text.strip() + " "

            db.execute("""
                UPDATE whisper_jobs SET progress = ?, transcript = ?, updated_at = ? WHERE id = ?
            """, (round(progress_percent, 2), transcript.strip(), int(time.time()), job_id))
            db.commit()

        # 4. Complete
        db.execute("UPDATE whisper_jobs SET status = 'completed', progress = 100, updated_at = ? WHERE id = ?", (int(time.time()), job_id))
        db.commit()

    except Exception as e:
        db.execute("UPDATE whisper_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?", (str(e), int(time.time()), job_id))
        db.commit()

    finally:
        # Clean up temp file
        print(f"Job {job_id}: Cleaning up temp file: {temp_file_path}")
        os.remove(temp_file_path)


# --- 4. Define the FastAPI Endpoints ---
@app.post("/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    """
    Accepts an audio file, starts transcription in background, returns job ID.
    """

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save the uploaded file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as temp_file:
        while content := await file.read(1024 * 1024):
            temp_file.write(content)
        temp_file_path = temp_file.name

    print(f"Job {job_id}: File saved to temporary path: {temp_file_path}")

    # Create job in DB
    db.execute("INSERT INTO whisper_jobs (id, created_at, updated_at) VALUES (?, ?, ?)", (job_id, int(time.time()), int(time.time())))
    db.commit()

    # Start transcription in background
    asyncio.create_task(asyncio.to_thread(run_transcription, job_id, temp_file_path))

    return {"job_id": job_id}

@app.get("/transcribe/{job_id}/stream")
async def stream_transcription_status(job_id: str):
    """
    Stream the status and progress of a transcription job via SSE.
    """
    async def event_generator():
        last_updated_at = None
        
        while True:
            row = db.execute("""
                SELECT status, progress, transcript, error_message, updated_at 
                FROM whisper_jobs 
                WHERE id = ?
            """, (job_id,)).fetchone()
            
            if not row:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "Job not found"})
                }
                return
            
            status, progress, transcript, error_message, updated_at = row
            
            # Only send if data changed
            if updated_at != last_updated_at:
                last_updated_at = updated_at
                
                data = {
                    "status": status,
                    "progress": progress,
                }
                
                # Include transcript only if it changed (save bandwidth)
                if transcript:
                    data["transcript"] = transcript
                
                if error_message:
                    data["error_message"] = error_message
                
                yield {
                    "event": "message",
                    "data": json.dumps(data)
                }
            
            # Close stream if job is complete or failed
            if status in ('completed', 'failed'):
                return
            
            # Poll every 500ms
            await asyncio.sleep(0.5)
    
    return EventSourceResponse(event_generator())

@app.get("/transcribe/{job_id}")
def get_transcription_status(job_id: str):
    """
    Get the status and progress of a transcription job.
    """
    row = db.execute("SELECT status, progress, transcript, error_message FROM whisper_jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return {"error": "Job not found"}, 404

    status, progress, transcript, error_message = row
    return {
        "status": status,
        "progress": progress,
        "transcript": transcript,
        "error_message": error_message
    }

@app.get("/jobs")
def list_jobs():
    """
    List all jobs with their current status. Used for recovery/sync.
    """
    rows = db.execute("""
        SELECT id, status, progress, created_at, updated_at 
        FROM whisper_jobs 
        ORDER BY created_at DESC
    """).fetchall()
    
    jobs = []
    for row in rows:
        jobs.append({
            "id": row[0],
            "status": row[1],
            "progress": row[2],
            "created_at": row[3],
            "updated_at": row[4]
        })
    
    return {"jobs": jobs}

@app.delete("/transcribe/{job_id}")
def delete_job(job_id: str):
    """
    Delete a job from the database. Used for cleanup.
    """
    result = db.execute("DELETE FROM whisper_jobs WHERE id = ?", (job_id,))
    db.commit()
    
    if result.rowcount == 0:
        return {"error": "Job not found"}, 404
    
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
