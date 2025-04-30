#!/bin/bash

# Create log file
LOG_FILE="$HOME/spotify_overlay_launch.log"
echo "Starting Spotify overlay at $(date)" > "$LOG_FILE"

# Kill any existing spotify-overlay processes
pkill -f spotify-overlay
echo "Killed existing processes" >> "$LOG_FILE"
sleep 1

# Check if Spotify is running
if pgrep -f Spotify > /dev/null; then
  echo "Spotify is running" >> "$LOG_FILE"
else
  echo "Spotify is not running" >> "$LOG_FILE"
fi

# Launch spotify-overlay
echo "Launching overlay app" >> "$LOG_FILE"
/Applications/spotify-overlay.app/Contents/MacOS/spotify-overlay >> "$LOG_FILE" 2>&1 &
echo "Launched with PID: $!" >> "$LOG_FILE" 