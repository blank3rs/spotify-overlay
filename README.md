# Spotify Overlay

A cool, floating overlay for Spotify that shows the current song and provides playback controls. The overlay can be moved around your screen and resized as needed.

## Features

- Always-on-top floating window
- Draggable interface
- Resizable window
- Real-time song information display
- Playback controls (play/pause, next, previous)
- Semi-transparent background
- Modern UI design

## Setup

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Set up Spotify API credentials:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new application
   - Get your Client ID and Client Secret
   - Set the redirect URI to `http://localhost:8888/callback`
   - Set the following environment variables:
     ```bash
     export SPOTIFY_CLIENT_ID='your_client_id'
     export SPOTIFY_CLIENT_SECRET='your_client_secret'
     ```

3. Run the application:
```bash
python spotify_overlay.py
```

## Usage

- Drag the window by clicking and holding anywhere on it
- Resize the window using the handle in the bottom-right corner
- Use the playback controls to control your Spotify playback
- The overlay will automatically update with the current song information

## Note

Make sure you have Spotify running and playing music for the overlay to work properly. 