import os
import json
import sys # Import sys to check if running as packaged app
import logging
from openai import AzureOpenAI
from dotenv import load_dotenv

# Setup basic logging to help debug issues
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.expanduser("~/spotify_ai.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SpotifyAI")

class SpotifyAI:
    def __init__(self):
        # Log initialization start
        logger.info("Initializing SpotifyAI")
        
        # Try multiple paths for .env file
        possible_paths = [
            # Current directory
            os.path.join(os.getcwd(), '.env'),
            # Script directory
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
            # Resources directory in packaged app
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Resources', '.env'),
            # Home directory
            os.path.expanduser('~/.env'),
            # Application Resources path - macOS packaged app
            '/Applications/spotify-overlay.app/Contents/Resources/.env'
        ]
        
        # Log all paths we're checking
        logger.info(f"Checking .env paths: {possible_paths}")
        
        # Try loading from each path
        env_loaded = False
        for dotenv_path in possible_paths:
            if os.path.exists(dotenv_path):
                logger.info(f"Found .env at: {dotenv_path}")
                load_dotenv(dotenv_path=dotenv_path)
                env_loaded = True
                break
        
        if not env_loaded:
            logger.warning("No .env file found in any searched location")
        
        # Check if keys were loaded
        api_key = os.getenv("AZURE_OPENAI_KEY")
        api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")

        if not all([api_key, api_version, azure_endpoint]):
             logger.error("Azure credentials missing after attempting to load .env")
             # Fail gracefully - store None for client so we can check later
             self.client = None
             return

        # Log successful environment loading
        logger.info(f"Loaded environment variables. API version: {api_version}")
        
        try:
            # Initialize Azure OpenAI client
            self.client = AzureOpenAI(
                api_key=api_key,
                api_version=api_version,
                azure_endpoint=azure_endpoint
            )
            self.deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
            logger.info(f"Azure OpenAI client initialized with deployment: {self.deployment_name}")
        except Exception as e:
            logger.error(f"Failed to initialize Azure OpenAI client: {str(e)}")
            self.client = None
    
    def suggest_similar_song(self, track_name, artist_name):
        """
        Get an AI suggestion for a song similar to the current track
        
        Args:
            track_name: Name of the current track
            artist_name: Name of the current artist
            
        Returns:
            A string in the format "Song Title - Artist Name"
        """
        try:
            # Check if client was initialized properly (e.g., if keys were missing)
            if not self.client:
                 logger.error("Cannot suggest song: Azure client not initialized")
                 return "Error: Azure client not initialized"

            logger.info(f"Requesting suggestion for {track_name} by {artist_name}")
            
            # Create prompt for AI
            system_prompt = """You are a music recommendation expert. 
            Given a song and artist, suggest ONE similar song that a fan would enjoy.
            Your response must be in this EXACT format: "Song Title - Artist Name"
            Do not include any other text, explanations, or formatting."""
            
            user_prompt = f"Suggest ONE song similar to '{track_name}' by {artist_name}. Response format: 'Song Title - Artist Name'"
            
            # Call Azure OpenAI for suggestion
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7
            )
            
            suggestion = response.choices[0].message.content.strip()
            logger.info(f"Got suggestion: {suggestion}")
            return suggestion
            
        except Exception as e:
             logger.error(f"Error during OpenAI call: {str(e)}")
             return f"Error generating suggestion: {str(e)}"

# For testing outside of the main application
if __name__ == "__main__":
    ai = SpotifyAI()
    suggestion = ai.suggest_similar_song("Bohemian Rhapsody", "Queen")
    print(f"Suggested song: {suggestion}") 