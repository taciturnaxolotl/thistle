# Whisper Transcription Server

This is a FastAPI server that provides real-time audio transcription using the faster-whisper library.

## Features

- Real-time transcription with streaming progress updates
- Supports multiple audio formats (MP3, WAV, M4A, etc.)
- Language detection
- Segment-based transcription with timestamps
- RESTful API endpoint

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

**Option 1: Manual setup**
```bash
pip install -r requirements.txt
python main.py
```

**Option 2: Quick start script**
```bash
./run.sh
```

The server will start on `http://localhost:8000` and load the Whisper model (this may take a few minutes on first run).

## API Usage

### POST `/transcribe-with-progress`

Upload an audio file to get real-time transcription progress.

**Example with curl:**
```bash
curl -X POST "http://localhost:8000/transcribe-with-progress" \
     -F "file=@/path/to/your/audio.mp3"
```

**Streaming Response:**
The endpoint returns a stream of JSON objects:

```json
{"status": "starting", "total_duration": 15.36, "language": "en", "language_probability": 0.99}
{"status": "progress", "percentage": 25.59, "start": 0.0, "end": 3.93, "text": "This is a test of the transcription server."}
{"status": "progress", "percentage": 57.68, "start": 3.93, "end": 8.86, "text": "It should be streaming the results back in real time."}
{"status": "complete"}
```

### Response Format

- `starting`: Initial metadata about the audio file
- `progress`: Transcription segments with progress percentage
- `complete`: Transcription finished successfully
- `error`: An error occurred during transcription

## Configuration

You can modify the model settings in `main.py`:

```python
model_size = "base"  # Options: tiny, base, small, medium, large-v1, large-v2, large-v3
model = WhisperModel(model_size, device="cpu", compute_type="int8")
```

For GPU acceleration, change to:
```python
model = WhisperModel(model_size, device="cuda", compute_type="float16")
```

## Integration with Thistle

This server is designed to work with the Thistle web application. Set the `WHISPER_SERVICE_URL` environment variable in Thistle to point to this server.

```bash
# In Thistle's .env file
WHISPER_SERVICE_URL=http://localhost:8000
```
