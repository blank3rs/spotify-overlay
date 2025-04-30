import os
import sys
import json
import time
import traceback
import threading

# --- Initial Debug Logging --- START ---
log_file_path = os.path.expanduser("~/spotify_overlay_poller.log")
def log_debug(message, flush=False):
    try:
        with open(log_file_path, "a") as f:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"{timestamp} - {message}\n")
        # Also print to stdout for Electron to potentially catch
        print(json.dumps({"debug_log": message}), flush=True)
    except Exception as e:
        print(json.dumps({"debug_log_error": f"Failed to write log: {e}"}), flush=True)

log_debug("--- spotify_poller.py starting ---")
log_debug(f"Python Executable: {sys.executable}")
log_debug(f"Script Path: {os.path.abspath(__file__)}")
log_debug(f"Current Working Dir: {os.getcwd()}")
log_debug(f"sys.path: {json.dumps(sys.path)}")
log_debug(f"Environment Keys: {json.dumps(list(os.environ.keys()))}")
# --- Initial Debug Logging --- END ---

# Now import other dependencies
import spotipy
from spotipy.oauth2 import SpotifyOAuth
# Import our new SpotifyAI class
from spotify_ai import SpotifyAI

log_debug("Imports successful.")

spotify = None
spotify_ai = None  # Add SpotifyAI instance
last_data = {}
command_lock = threading.Lock()
# Add idle polling timer
ACTIVE_POLL_INTERVAL = 1.0  # Poll every 1 second when music is playing
IDLE_POLL_INTERVAL = 5.0    # Poll every 5 seconds when music is not playing
current_poll_interval = IDLE_POLL_INTERVAL  # Start with idle interval
MAX_RETRIES = 3

def setup_spotify():
    global spotify, spotify_ai
    log_debug("Attempting setup_spotify()...")
    try:
        # Try loading from environment variables first
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        redirect_uri = os.getenv("SPOTIFY_REDIRECT_URI", "http://localhost:8888/callback") # Default redirect URI

        # If not found in env vars, try loading from config.json
        if not client_id or not client_secret:
            log_debug("Credentials not found in environment variables, trying config.json...")
            config_paths = [
                os.path.join(os.path.dirname(__file__), '..', 'config.json'), # Relative path for bundled app
                os.path.join(os.getcwd(), 'config.json'), # Current working directory
                os.path.expanduser('~/.config/spotify-overlay/config.json') # User config dir
            ]

            config_data = None # Use a different variable name to avoid confusion with the old 'config' dict
            for config_path in config_paths:
                try:
                    if os.path.exists(config_path):
                        with open(config_path, 'r') as f:
                            config_data = json.load(f)
                            # Only use config file if env vars weren't set
                            if not client_id:
                                client_id = config_data.get('client_id')
                            if not client_secret:
                                client_secret = config_data.get('client_secret')
                            # Use config redirect_uri only if env var wasn't set AND it's in the file
                            if redirect_uri == "http://localhost:8888/callback" and config_data.get('redirect_uri'):
                                redirect_uri = config_data.get('redirect_uri')

                            log_debug(json.dumps({"status": f"Loaded config from {config_path}"}), flush=True)
                            break # Stop looking once config is found
                except Exception as e:
                    log_debug(json.dumps({"warning": f"Error reading {config_path}: {str(e)}"}), flush=True)
                    # Continue to the next path if there's an error reading one
                    continue

        # If still not found after checking env and config files, use the hardcoded fallback (as a last resort)
        if not client_id or not client_secret:
            log_debug(json.dumps({"warning": "Using hardcoded fallback config. Please set environment variables or configure config.json."}), flush=True)
            client_id = "61273f5e99384defbab085d0e3d55867" # Fallback
            client_secret = "1a73a8b743b643e188a0e7e8c4a6a58b" # Fallback
            # redirect_uri already has a default or was potentially set by config.json

        # Raise an error if credentials could not be loaded from any source
        # It's better to fail clearly than to silently use potentially wrong fallback values
        # Keep the fallback logic above for now, but consider removing it later
        # if not client_id or not client_secret:
        #     raise ValueError("Spotify client_id and client_secret could not be loaded from environment variables or config.json.")

        # If after all checks, we still don't have credentials, raise an error.
        if not client_id or not client_secret:
             raise ValueError("Spotify client_id and client_secret could not be loaded. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables or configure config.json.")

        # Set up cache path in user directory to avoid permission issues
        cache_path = os.path.expanduser("~/.spotify_caches")
        
        # Delete the cache file if it exists but is invalid
        if os.path.exists(cache_path) and os.path.getsize(cache_path) < 10:
            try:
                os.remove(cache_path)
                log_debug(json.dumps({"status": "Removed invalid cache file"}), flush=True)
            except:
                pass

        # Initialize Spotify client
        log_debug("Initializing Spotipy client...")
        spotify = spotipy.Spotify(auth_manager=SpotifyOAuth(
            client_id=client_id, # Use loaded client_id
            client_secret=client_secret, # Use loaded client_secret
            redirect_uri=redirect_uri, # Use loaded redirect_uri
            scope="user-read-playback-state user-modify-playback-state user-library-modify user-library-read",
            cache_path=cache_path,
            open_browser=True
        ))
        log_debug("Spotipy client initialized.")
        
        # Initialize SpotifyAI (for song suggestions)
        try:
            log_debug("Initializing SpotifyAI client...")
            spotify_ai = SpotifyAI()
            log_debug("SpotifyAI client initialized successfully.")
        except Exception as ai_error:
            log_debug(f"SpotifyAI Initialization Error: {str(ai_error)}")
            spotify_ai = None # Ensure it's None if init fails
            # Continue without AI features, but log the error

        # Test the main Spotify connection
        log_debug("Testing Spotify connection (spotify.me())...")
        spotify.me() # This might raise an exception if auth failed
        log_debug("Spotify connection successful")

    except Exception as e:
        log_debug(f"Spotify Setup Error: {str(e)}")
        traceback.print_exc()
        spotify = None
        spotify_ai = None # Also ensure AI client is None on general setup error

def poll_spotify():
    global last_data, current_poll_interval, spotify
    
    if not spotify:
        try:
            setup_spotify()
            if not spotify:
                return
        except Exception as e:
            log_debug(json.dumps({"error": f"Spotify Reconnection Error: {str(e)}"}), flush=True)
            return

    retries = 0
    while retries < MAX_RETRIES:
        try:
            current_track = spotify.current_playback()
            data = {}
            track_id = None # Initialize track_id
            
            if current_track is None or not current_track['is_playing'] or not current_track['item']:
                data = {"track_name": "No active playback", "artist_name": "", "album_art_url": "", "progress_ms": 0, "duration_ms": 0, "is_playing": False, "track_id": None}
                # Switch to idle polling when nothing is playing
                current_poll_interval = IDLE_POLL_INTERVAL
            else:
                track = current_track['item']
                track_id = track['id'] # Store track ID
                data["track_name"] = track['name']
                data["artist_name"] = track['artists'][0]['name'] if track['artists'] else ""
                data["album_art_url"] = track['album']['images'][-1]['url'] if track['album']['images'] else ""
                data["progress_ms"] = current_track['progress_ms']
                data["duration_ms"] = track['duration_ms']
                data["is_playing"] = current_track['is_playing']
                data["track_id"] = track_id # Add track ID to output
                # Switch to active polling when music is playing
                current_poll_interval = ACTIVE_POLL_INTERVAL

            # Only print if data has changed
            if data != last_data:
                # Don't use log_debug for track data - send it directly to stdout
                # to be captured by the Electron app
                print(json.dumps(data), flush=True)
                # Still log it for debugging, but as a separate message
                log_debug(f"Track update: {data['track_name'] if 'track_name' in data else 'No track'}")
                last_data = data
            
            # If we get here, everything worked
            break
        
        except spotipy.exceptions.SpotifyException as e:
            retries += 1
            error_data = {"error": f"Spotify API Error: {str(e)}"}
            if error_data != last_data:
                log_debug(json.dumps(error_data), flush=True)
                last_data = error_data
            
            # Token expired, try to refresh
            if e.http_status == 401:
                spotify = None
                setup_spotify()
                time.sleep(1)
            elif retries >= MAX_RETRIES:
                # Switch to idle polling on persistent error
                current_poll_interval = IDLE_POLL_INTERVAL
                time.sleep(5)
                break
            else:
                time.sleep(1)
                
        except Exception as e:
            retries += 1
            error_data = {"error": f"Spotify Poll Error: {str(e)}"}
            if error_data != last_data:
                log_debug(json.dumps(error_data), flush=True)
                last_data = error_data
            
            if retries >= MAX_RETRIES:
                # Use idle polling on error
                current_poll_interval = IDLE_POLL_INTERVAL
                time.sleep(5)
                break
            else:
                time.sleep(1)

def handle_commands():
    global spotify, spotify_ai # Need access to the global spotify object
    for line in sys.stdin:
        try:
            command_data = json.loads(line)
            command = command_data.get("command")
            
            if command == "seek":
                position_ms = command_data.get("position_ms")
                if position_ms is not None:
                    with command_lock: # Acquire lock before using spotify object
                        if spotify:
                            try:
                                spotify.seek_track(position_ms)
                                # Force an immediate poll after seeking
                                poll_spotify() 
                            except Exception as e:
                                log_debug(json.dumps({"error": f"Seek Error: {str(e)}"}), flush=True)
                        else:
                             log_debug(json.dumps({"error": "Seek Error: Spotify not ready"}), flush=True)
            
            elif command == "like":
                track_id = command_data.get("track_id")
                if track_id:
                    with command_lock:
                        if spotify:
                            try:
                                # Check if already liked first
                                if not spotify.current_user_saved_tracks_contains([track_id])[0]:
                                    spotify.current_user_saved_tracks_add([track_id])
                                else:
                                    log_debug(json.dumps({"status": f"Track {track_id} already liked"}), flush=True)
                            except Exception as e:
                                log_debug(json.dumps({"error": f"Like Error: {str(e)}"}), flush=True)
                        else:
                            log_debug(json.dumps({"error": "Like Error: Spotify not ready"}), flush=True)
            
            elif command == "suggest_similar":
                with command_lock:
                    if spotify and spotify_ai:
                        try:
                            # Get current track
                            current_track = spotify.current_playback()
                            if current_track and current_track.get('is_playing') and current_track.get('item'):
                                track = current_track['item']
                                track_name = track['name']
                                artist_name = track['artists'][0]['name'] if track['artists'] else ""
                                
                                # Get AI suggestion
                                suggestion = spotify_ai.suggest_similar_song(track_name, artist_name)
                                log_debug(json.dumps({"status": f"AI suggested: {suggestion}"}), flush=True)
                                
                                try:
                                    # Parse suggestion (expected format: "Song Title - Artist Name")
                                    if " - " in suggestion:
                                        suggested_title, suggested_artist = suggestion.split(" - ", 1)
                                    else:
                                        # Fallback parsing if not in expected format
                                        parts = suggestion.split()
                                        suggested_artist = parts[-1]
                                        suggested_title = " ".join(parts[:-1])
                                    
                                    # Search for the song
                                    search_query = f"track:{suggested_title} artist:{suggested_artist}"
                                    search_results = spotify.search(q=search_query, type="track", limit=1)
                                    
                                    if search_results['tracks']['items']:
                                        # Add the first result to the queue
                                        suggested_track = search_results['tracks']['items'][0]
                                        spotify.add_to_queue(uri=suggested_track['uri'])
                                        
                                        # Notify the UI
                                        log_debug(json.dumps({
                                            "suggestion_result": {
                                                "status": "success",
                                                "message": f"Added to queue: '{suggested_track['name']}' by {suggested_track['artists'][0]['name']}",
                                                "track": {
                                                    "name": suggested_track['name'],
                                                    "artist": suggested_track['artists'][0]['name'],
                                                    "album": suggested_track['album']['name'],
                                                    "duration_ms": suggested_track['duration_ms'],
                                                    "album_art_url": suggested_track['album']['images'][0]['url'] if suggested_track['album']['images'] else None
                                                }
                                            }
                                        }), flush=True)
                                    else:
                                        # Try a more lenient search
                                        search_query = f"{suggested_title} {suggested_artist}"
                                        search_results = spotify.search(q=search_query, type="track", limit=1)
                                        
                                        if search_results['tracks']['items']:
                                            # Add the first result to the queue
                                            suggested_track = search_results['tracks']['items'][0]
                                            spotify.add_to_queue(uri=suggested_track['uri'])
                                            
                                            # Notify the UI
                                            log_debug(json.dumps({
                                                "suggestion_result": {
                                                    "status": "success",
                                                    "message": f"Added to queue: '{suggested_track['name']}' by {suggested_track['artists'][0]['name']}",
                                                    "track": {
                                                        "name": suggested_track['name'],
                                                        "artist": suggested_track['artists'][0]['name'],
                                                        "album": suggested_track['album']['name'],
                                                        "duration_ms": suggested_track['duration_ms'],
                                                        "album_art_url": suggested_track['album']['images'][0]['url'] if suggested_track['album']['images'] else None
                                                    }
                                                }
                                            }), flush=True)
                                        else:
                                            log_debug(json.dumps({
                                                "suggestion_result": {
                                                    "status": "error",
                                                    "message": f"Could not find '{suggested_title}' by {suggested_artist} on Spotify"
                                                }
                                            }), flush=True)
                                except Exception as e:
                                    log_debug(json.dumps({
                                        "suggestion_result": {
                                            "status": "error",
                                            "message": f"Error processing AI suggestion: {str(e)}"
                                        }
                                    }), flush=True)
                            else:
                                log_debug(json.dumps({
                                    "suggestion_result": {
                                        "status": "error",
                                        "message": "No track currently playing"
                                    }
                                }), flush=True)
                        except Exception as e:
                            log_debug(json.dumps({
                                "suggestion_result": {
                                    "status": "error",
                                    "message": f"Suggestion Error: {str(e)}"
                                }
                            }), flush=True)
                    else:
                        log_debug(json.dumps({
                            "suggestion_result": {
                                "status": "error",
                                "message": "Spotify or AI not ready"
                            }
                        }), flush=True)
                            
        except json.JSONDecodeError:
            pass
        except Exception as e:
            log_debug(json.dumps({"error": f"Command Handling Error: {str(e)}"}), flush=True)

if __name__ == "__main__":
    # Try setup Spotify multiple times
    for attempt in range(3):
        setup_spotify()
        if spotify:
            break
        time.sleep(2)
    
    # Create and start the command handling thread
    command_thread = threading.Thread(target=handle_commands, daemon=True)
    command_thread.start()
    
    # Main polling loop
    while True:
        poll_spotify()
        time.sleep(current_poll_interval)  # Use dynamic poll interval 