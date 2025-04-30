import customtkinter as ctk
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from PIL import Image, ImageTk
import json
import os
import logging
import platform
import requests
from io import BytesIO
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class SpotifyOverlay(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Configure window
        self.title("Spotify Overlay")
        
        # Make window stay on top of everything
        self.attributes('-topmost', True)
        self.attributes('-alpha', 0.92)
        self.overrideredirect(True)  # Remove window decorations
        
        # Attempt transparent background for rounded corner effect (macOS mainly)
        if platform.system() == 'Darwin':
            self.config(bg='systemTransparent') # macOS specific
            self.attributes("-transparent", True)
        
        # Set window type to be a toolbar (helps with staying on top)
        if platform.system() == 'Darwin':  # macOS
            self.attributes('-type', 'toolbar')
        elif platform.system() == 'Windows':
            self.attributes('-toolwindow', True)
        
        # Set window size and position (match Arc browser taskbar height)
        self.geometry("180x48+100+100")  # Narrower width
        
        # Configure the appearance
        ctk.set_appearance_mode("dark")
        
        # Make window draggable
        self.bind('<Button-1>', self.start_move)
        self.bind('<B1-Motion>', self.on_move)
        
        # Initialize variables
        self.current_image = None
        self.progress_visible = True  # Always show progress
        self.max_text_width = 110  # Maximum width for text in pixels
        
        # Initialize Spotify client
        self.setup_spotify()
        
        # Use grid layout for the root window
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        
        # Create UI elements
        self.create_widgets()
        
        # Start update loop
        self.update_now_playing()
        
        # Ensure window stays on top
        self.after(100, self.ensure_on_top)

    def ensure_on_top(self):
        """Periodically ensure window stays on top"""
        self.lift()
        self.attributes('-topmost', True)
        self.after(100, self.ensure_on_top)

    def setup_spotify(self):
        try:
            logger.info("Loading Spotify credentials from config.json")
            with open('config.json', 'r') as f:
                config = json.load(f)
            
            logger.info("Initializing Spotify client")
            self.spotify = spotipy.Spotify(auth_manager=SpotifyOAuth(
                client_id=config['client_id'],
                client_secret=config['client_secret'],
                redirect_uri=config['redirect_uri'],
                scope="user-read-playback-state user-modify-playback-state",
                cache_path=".spotify_caches"
            ))
            logger.info("Spotify client initialized successfully")
        except Exception as e:
            logger.error(f"Error setting up Spotify: {str(e)}")
            self.show_error(f"Error setting up Spotify: {str(e)}")
            self.spotify = None

    def truncate_text(self, text, font, max_width):
        """Truncate text to fit within max_width pixels"""
        if not text:
            return text
            
        test_label = ctk.CTkLabel(self, text=text, font=font)
        current_width = test_label.winfo_reqwidth()
        test_label.destroy()
        
        if current_width <= max_width:
            return text
            
        while text and current_width > max_width:
            text = text[:-1]
            test_label = ctk.CTkLabel(self, text=text + "...", font=font)
            current_width = test_label.winfo_reqwidth()
            test_label.destroy()
            
        return text + "..."

    def create_widgets(self):
        # Main frame with rounded corners - This provides the visual background
        self.main_frame = ctk.CTkFrame(
            self, # Parent is now the root window
            fg_color="#121212",
            corner_radius=16,  # More rounded corners
            border_width=1,
            border_color="#282828"
        )
        # Place main_frame using grid in the root window
        self.main_frame.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        self.main_frame.grid_columnconfigure(1, weight=1) # Content column expands
        self.main_frame.grid_rowconfigure(0, weight=1) # Main row takes space

        # Album cover (Using grid now)
        self.cover_label = ctk.CTkLabel(
            self.main_frame, # Place directly in main_frame
            text="",
            width=46,
            height=46,
            fg_color="#282828", # Placeholder color
            corner_radius=8
        )
        self.cover_label.grid(row=0, column=0, padx=(5, 5), pady=(1,1), sticky="ns")

        # Info and progress container (Using grid)
        self.content_frame = ctk.CTkFrame(
            self.main_frame, # Place directly in main_frame
            fg_color="transparent"
        )
        self.content_frame.grid(row=0, column=1, sticky="nsew", padx=(0, 5), pady=0)
        self.content_frame.grid_columnconfigure(0, weight=1)
        self.content_frame.grid_rowconfigure(0, weight=0) # Song row
        self.content_frame.grid_rowconfigure(1, weight=0) # Artist row
        self.content_frame.grid_rowconfigure(2, weight=1) # Progress gets remaining vertical space

        # Song info
        self.song_label = ctk.CTkLabel(
            self.content_frame,
            text="No song playing",
            font=("SF Pro Display", 12, "bold"),
            text_color="#FFFFFF",
            anchor="w",
            wraplength=self.max_text_width
        )
        self.song_label.grid(row=0, column=0, sticky="ew", pady=(2,0))

        # Artist info
        self.artist_label = ctk.CTkLabel(
            self.content_frame,
            text="",
            font=("SF Pro Display", 10),
            text_color="#B3B3B3",
            anchor="w",
            wraplength=self.max_text_width
        )
        self.artist_label.grid(row=1, column=0, sticky="ew", pady=(0,0))

        # Progress frame
        self.progress_frame = ctk.CTkFrame(
            self.content_frame,
            fg_color="red", # DEBUG: Make progress frame visible
            height=10 # Slimmer progress area
        )
        # Ensure progress frame sticks to bottom and fills horizontally
        self.progress_frame.grid(row=2, column=0, sticky="sew", pady=(1, 2))
        self.progress_frame.grid_columnconfigure(0, weight=1)

        # Progress slider
        self.progress_slider = ctk.CTkSlider(
            self.progress_frame,
            from_=0,
            to=100,
            height=4,
            button_length=0,
            button_color="#1DB954",
            button_hover_color="#1ed760",
            progress_color="#1DB954",
            fg_color="#4f4f4f"
        )
        # Use grid for the slider within its frame
        self.progress_slider.grid(row=0, column=0, sticky="ew", pady=(0,0))
        self.progress_slider.bind("<Button-1>", self.start_seek)
        self.progress_slider.bind("<ButtonRelease-1>", self.end_seek)

        # Time labels (hidden by default, shown on hover? Maybe later)
        self.time_frame = ctk.CTkFrame(
            self.progress_frame,
            fg_color="transparent"
        )
        # Don't pack time_frame initially to hide times
        # self.time_frame.pack(fill="x")

        self.current_time = ctk.CTkLabel(
            self.time_frame,
            text="0:00",
            font=("SF Pro Display", 9),
            text_color="#B3B3B3"
        )
        self.current_time.pack(side="left")

        self.total_time = ctk.CTkLabel(
            self.time_frame,
            text="0:00",
            font=("SF Pro Display", 9),
            text_color="#B3B3B3"
        )
        self.total_time.pack(side="right")

    def load_album_art(self, url):
        try:
            response = requests.get(url)
            img = Image.open(BytesIO(response.content))
            img = img.resize((46, 46), Image.Resampling.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            self.current_image = photo  # Keep a reference
            self.cover_label.configure(image=photo)
        except Exception as e:
            logger.error(f"Error loading album art: {str(e)}")

    def update_now_playing(self):
        if not self.spotify:
            self.after(1000, self.update_now_playing)
            return

        try:
            current_track = self.spotify.current_playback()
            
            if current_track is None or not current_track['item']:
                self.song_label.configure(text="No active playback")
                self.artist_label.configure(text="")
                self.progress_slider.set(0)
            else:
                track = current_track['item']
                
                # Truncate song and artist names
                song_name = self.truncate_text(
                    track['name'],
                    ("SF Pro Display", 13, "bold"),
                    self.max_text_width
                )
                artist_name = self.truncate_text(
                    track['artists'][0]['name'],
                    ("SF Pro Display", 11),
                    self.max_text_width
                )
                
                self.song_label.configure(text=song_name)
                self.artist_label.configure(text=artist_name)
                
                # Update album art
                if track['album']['images']:
                    self.load_album_art(track['album']['images'][-1]['url'])
                
                # Update duration and progress
                progress_ms = current_track['progress_ms']
                self.current_duration = track['duration_ms']
                
                # Update slider if not being dragged
                if not hasattr(self, 'seeking') or not self.seeking:
                    progress_percent = (progress_ms / self.current_duration) * 100
                    self.progress_slider.set(progress_percent)
                
                self.current_time.configure(text=self.format_duration(progress_ms))
                self.total_time.configure(text=self.format_duration(self.current_duration))

                # Update color scheme based on track energy/valence
                try:
                    features = self.spotify.audio_features([track['id']])[0]
                    if features:
                        energy = features['energy']
                        valence = features['valence']
                        
                        # Create a color gradient based on the track's mood
                        if valence > 0.6:  # Happy/Upbeat
                            color = f"#{int(255 * energy):02x}80{int(255 * (1-energy)):02x}"
                        elif valence < 0.4:  # Sad/Melancholic
                            color = f"#{int(255 * energy):02x}{int(255 * (1-energy)):02x}80"
                        else:  # Neutral
                            color = f"#{int(255 * energy):02x}{int(255 * energy):02x}{int(255 * energy):02x}"
                        
                        self.main_frame.configure(fg_color=color)
                except:
                    pass

        except Exception as e:
            logger.error(f"Error updating playback: {str(e)}")
            self.song_label.configure(text="Error connecting to Spotify")
            self.artist_label.configure(text="Check console for details")
        
        self.after(1000, self.update_now_playing)

    def format_duration(self, ms):
        """Format milliseconds to M:SS format"""
        seconds = int(ms / 1000)
        minutes = seconds // 60
        seconds = seconds % 60
        return f"{minutes}:{seconds:02d}"

    def start_seek(self, event):
        self.seeking = True

    def end_seek(self, event):
        if hasattr(self, 'seeking') and self.seeking:
            try:
                position = int(self.progress_slider.get() * self.current_duration / 100)
                self.spotify.seek_track(position)
            except Exception as e:
                logger.error(f"Error seeking: {str(e)}")
            self.seeking = False

    def show_error(self, message):
        error_label = ctk.CTkLabel(
            self,
            text=message,
            text_color="#FF4444",
            font=("Helvetica", 12)
        )
        error_label.pack(pady=10)

    def start_move(self, event):
        # Only start move if not on an edge
        x, y = event.x, event.y
        width, height = self.winfo_width(), self.winfo_height()
        
        if y < 5 or y > height - 5 or x < 5 or x > width - 5:
            return
            
        self.x = event.x
        self.y = event.y

    def on_move(self, event):
        if not hasattr(self, 'x'):
            return
            
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.winfo_x() + deltax
        y = self.winfo_y() + deltay
        self.geometry(f"+{x}+{y}")

if __name__ == "__main__":
    app = SpotifyOverlay()
    app.mainloop() 