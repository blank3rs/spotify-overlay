#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
APP_NAME="spotify-overlay"
APP_INSTALL_PATH="/Applications/${APP_NAME}.app"
echo "--- Spotify Overlay Build & Install Script ---"

# --- Prerequisite Checks ---
echo "Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo >&2 "Error: Node.js not found. Install from https://nodejs.org/"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo >&2 "Error: npm not found. Comes with Node.js."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo >&2 "Error: Python 3 not found. Install from https://www.python.org/"; exit 1; }
command -v pip3 >/dev/null 2>&1 || { echo >&2 "Error: pip3 not found."; exit 1; }
command -v osascript >/dev/null 2>&1 || { echo >&2 "Error: osascript not found. Should be part of macOS."; exit 1; }

echo "Prerequisites found."

# --- Install Dependencies ---
echo "Installing Python dependencies..."
pip3 install -r requirements.txt
echo "Installing Node.js dependencies..."
npm install

# --- Build the Application ---
echo "Building the Electron application (.app)..."
npx electron-forge make
# Detect architecture dynamically
ARCH=$(uname -m)
# Map x86_64 to x64 if necessary (Electron Forge might use x64)
if [ "$ARCH" == "x86_64" ]; then
    ARCH="x64"
fi
BUILT_APP_PATH="./out/${APP_NAME}-darwin-${ARCH}/${APP_NAME}.app"

# --- Verify Build Output ---
echo "Verifying build output exists at: ${BUILT_APP_PATH}"
if [ ! -d "${BUILT_APP_PATH}" ]; then
    echo "Error: Build output not found at expected location: ${BUILT_APP_PATH}"
    echo "Please check the 'out' directory and Electron Forge logs for errors."
    # List contents of 'out' directory for debugging
    echo "Contents of './out':"
    ls -l ./out || echo "'out' directory not found."
    if [ -d "./out/${APP_NAME}-darwin-${ARCH}" ]; then
      echo "Contents of './out/${APP_NAME}-darwin-${ARCH}':"
      ls -l "./out/${APP_NAME}-darwin-${ARCH}"
    fi
    exit 1
fi
echo "Build output verified."

# --- Install Application ---
echo "Attempting to copy application to ${APP_INSTALL_PATH}..."
# Check if it already exists to avoid unnecessary copy/prompt if possible
if [ -d "${APP_INSTALL_PATH}" ]; then
    echo "Application already exists at ${APP_INSTALL_PATH}. Removing old version..."
    # Use sudo to remove from /Applications. This is the step most likely to fail without interaction.
    sudo rm -rf "${APP_INSTALL_PATH}"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to remove existing application at ${APP_INSTALL_PATH}."
        echo "Please remove it manually and run the script again, or move the new app manually."
        exit 1
    fi
fi
echo "Copying new version..."
# Use sudo to copy to /Applications. Needs password if run by normal user.
sudo cp -Rp "${BUILT_APP_PATH}" "${APP_INSTALL_PATH}"
if [ $? -ne 0 ]; then
    echo "Error: Failed to copy application to ${APP_INSTALL_PATH}."
    echo "Please ensure you have permissions or try copying manually later."
    exit 1
else
    echo "Application successfully copied to /Applications."
fi

# --- Add to Login Items ---
echo "Adding application to Login Items..."
osascript <<EOF
tell application "System Events"
    make new login item at end with properties {path:"${APP_INSTALL_PATH}", hidden:false, name:"spotify-overlay"}
end tell
EOF
if [ $? -eq 0 ]; then
    echo "Successfully added to Login Items."
else
    echo "Warning: Could not add to Login Items automatically. You may need to do this manually."
    echo "To add manually: System Settings/Preferences > Users & Groups > Login Items > Add ${APP_NAME}.app"
fi

# --- Final Instructions ---
echo "---"
echo "Setup Complete!"
echo " - Application installed at: ${APP_INSTALL_PATH}"
echo " - Application added to Login Items (will start automatically on system boot)"
echo " - The overlay will appear automatically when Spotify is playing music"
echo " - The overlay will hide when music is paused or Spotify is closed"
echo " - The overlay's position will be remembered between sessions"
echo " - The application uses minimal resources when no music is playing"
echo ""
echo "--- Finished ---" 