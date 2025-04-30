# Spotify Overlay

A cool, floating overlay for Spotify that shows the current song, provides playback controls, and includes AI features like song suggestions.

## Features

- Always-on-top floating window
- Draggable interface
- Resizable window
- Real-time song information display (Track, Artist, Album Art)
- Playback controls (Play/Pause, Seek)
- Like current song button
- AI-powered song suggestion button
- Semi-transparent background
- Modern UI design

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd spotify-overlay
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

3.  **Install Python dependencies:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    pip install -r requirements.txt
    ```

4.  **Set up API Credentials (.env file):**

    *   **Spotify:**
        *   Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
        *   Create a new application or use an existing one.
        *   Note down your **Client ID** and **Client Secret**.
        *   In your application settings on the Spotify Dashboard, add `http://localhost:8888/callback` as a **Redirect URI**.
    *   **Azure OpenAI (Optional, for AI features):**
        *   Set up an Azure OpenAI resource.
        *   Get your **API Key**, **Endpoint URL**, and **Deployment Name** for a model like GPT-4 or GPT-4o-mini.

    *   **Create `.env` file:**
        *   Copy the example file: `cp .env.example .env`
        *   Open the `.env` file in a text editor.
        *   Fill in your credentials:
            ```dotenv
            # .env
            SPOTIFY_CLIENT_ID=your_spotify_client_id_here
            SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
            SPOTIFY_REDIRECT_URI=http://localhost:8888/callback

            AZURE_OPENAI_KEY=your_azure_openai_key_here
            AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint_here
            AZURE_OPENAI_API_VERSION=2024-08-01-preview # Or your specific API version
            AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name_here
            ```
        *   **Important:** Do not commit your `.env` file to version control. It's included in `.gitignore` by default.

5.  **Run the application:**
    ```bash
    npm start
    ```
    Alternatively, use the build/launch scripts (`build.sh`, `launch_overlay.sh`).

## Usage

- Drag the window by clicking and holding the top bar.
- Resize the window using the handle in the bottom-right corner.
- Use the playback controls (play/pause, seek bar) to control Spotify.
- Click the heart icon to like the current song.
- Click the lightbulb icon to get an AI-suggested similar song added to your queue (requires Azure OpenAI setup).
- The overlay will automatically update with the current song information.

## Note

- Make sure you have the Spotify desktop application running.
- On the first run, you will be prompted to log in to Spotify via your web browser to authorize the application. 