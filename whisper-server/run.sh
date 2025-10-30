#!/bin/bash

# Quick script to run the Whisper transcription server

echo "Setting up Whisper transcription server..."
echo "Installing dependencies..."
pip3 install -r requirements.txt

echo ""
echo "Starting Whisper server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

python main.py
