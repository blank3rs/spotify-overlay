const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let pythonProcess;
let isContentPlaying = false;
let windowPositionFile = path.join(app.getPath('userData'), 'settings', 'window-position.json');
let isQuitting = false;

// Function to load saved window position
function loadWindowPosition() {
  try {
    // Use a more specific path in userData
    const dataPath = path.join(app.getPath('userData'), 'settings');
    // Ensure directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    
    windowPositionFile = path.join(dataPath, 'window-position.json');
    
    if (fs.existsSync(windowPositionFile)) {
      const data = fs.readFileSync(windowPositionFile, 'utf8');
      const position = JSON.parse(data);
      console.log(`Loaded window position: ${position.x}, ${position.y}, timestamp: ${new Date(position.timestamp).toLocaleString()}`);
      
      // Validate the loaded data has valid x,y coordinates
      if (typeof position.x === 'number' && typeof position.y === 'number' &&
          !isNaN(position.x) && !isNaN(position.y) && 
          position.x > -10000 && position.x < 10000 && // Sanity check for values
          position.y > -10000 && position.y < 10000) {
        return position;
      } else {
        console.error(`Invalid position format in saved file: x=${position.x}, y=${position.y}`);
      }
    } else {
      console.log('No saved window position found, using default');
    }
  } catch (e) {
    console.error(`Error loading window position: ${e.message}`);
    console.error(`Stack: ${e.stack}`);
  }
  return null;
}

// Function to save window position
function saveWindowPosition() {
  if (!mainWindow) {
    console.log('Cannot save window position: mainWindow is null');
    return;
  }
  
  try {
    // Get position and ensure it's valid
    const position = mainWindow.getPosition();
    
    // Validate position before saving
    if (!Array.isArray(position) || position.length !== 2 || 
        typeof position[0] !== 'number' || typeof position[1] !== 'number' ||
        isNaN(position[0]) || isNaN(position[1])) {
      console.error(`Invalid position to save: ${JSON.stringify(position)}`);
      return;
    }
    
    // Create structured data with timestamp
    const posData = {
      x: position[0],
      y: position[1],
      timestamp: Date.now(),
      app_version: app.getVersion()
    };
    
    // Make sure the directory exists
    const dataPath = path.dirname(windowPositionFile);
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
      console.log(`Created settings directory: ${dataPath}`);
    }
    
    // Read existing file first to check for changes
    let currentData = null;
    if (fs.existsSync(windowPositionFile)) {
      try {
        const fileContents = fs.readFileSync(windowPositionFile, 'utf8');
        currentData = JSON.parse(fileContents);
      } catch (e) {
        console.log(`Couldn't read current position file: ${e.message}`);
      }
    }
    
    // Only write if position has changed
    if (!currentData || 
        currentData.x !== posData.x || 
        currentData.y !== posData.y) {
      
      // Write to file with better error handling - use synchronous to ensure it completes
      fs.writeFileSync(windowPositionFile, JSON.stringify(posData, null, 2), 'utf8');
      console.log(`Window position saved: ${position[0]}, ${position[1]}`);
    }
  } catch (e) {
    console.error(`Error saving window position: ${e.message}`);
    console.error(`Path: ${windowPositionFile}, Error: ${e.stack}`);
  }
}

function createWindow() {
  // Check for explicit position arguments from command line
  const fixedPositionArg = process.argv.find(arg => arg.startsWith('--position='));
  
  // Load saved position if available
  let savedPosition = loadWindowPosition();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workArea;
  
  // Default position if no saved position (center of screen)
  let winX = Math.round((width - 220) / 2) + primaryDisplay.workArea.x;
  let winY = Math.round((height - 48) / 2) + primaryDisplay.workArea.y;
  
  let useDefaultPosition = false;
  
  // First check for explicit position argument
  if (fixedPositionArg) {
    try {
      const pos = fixedPositionArg.split('=')[1].split(',');
      if (pos.length === 2) {
        winX = parseInt(pos[0]);
        winY = parseInt(pos[1]);
        console.log(`Using fixed position from command line: ${winX}, ${winY}`);
      }
    } catch (e) {
      console.error(`Error parsing position argument: ${e.message}`);
    }
  }
  // Otherwise use saved position if available
  else if (savedPosition) {
    const displays = screen.getAllDisplays();
    let onScreen = false;
    
    // Check if saved position is on any connected display
    for (const display of displays) {
      const bounds = display.workArea;
      if (
        savedPosition.x >= bounds.x && 
        savedPosition.x <= bounds.x + bounds.width - 220 &&
        savedPosition.y >= bounds.y && 
        savedPosition.y <= bounds.y + bounds.height - 48
      ) {
        onScreen = true;
        winX = savedPosition.x;
        winY = savedPosition.y;
        console.log(`Using saved position: ${winX}, ${winY} on display: ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`);
        break;
      }
    }
    
    if (!onScreen) {
      console.log(`Saved position ${savedPosition.x}, ${savedPosition.y} is not on screen, using default`);
      useDefaultPosition = true;
    }
  } else {
    useDefaultPosition = true;
    console.log('No valid saved position found, using default');
  }

  // Use default center position if needed
  if (useDefaultPosition) {
    // Use primary display coordinates
    winX = Math.round((primaryDisplay.workArea.width - 220) / 2) + primaryDisplay.workArea.x;
    winY = Math.round((primaryDisplay.workArea.height - 48) / 2) + primaryDisplay.workArea.y;
    console.log(`Using default center position: ${winX}, ${winY}`);
  }

  // Different window settings for auto-launch vs manual launch
  const windowSettings = {
    width: 220,
    height: 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    x: winX,
    y: winY,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    fullscreenable: false
  };

  console.log(`Creating window at position: ${winX}, ${winY}`);
  
  // Create window with selected settings
  mainWindow = new BrowserWindow(windowSettings);

  // Load the HTML file
  mainWindow.loadFile('index.html');
  
  // Check if app was launched at login
  const isAutoLaunched = process.argv.includes('--launched-at-login') || 
                         app.getLoginItemSettings().wasOpenedAtLogin;
  
  // Force app to be visible and focused if not auto-launched
  if (!isAutoLaunched) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      // Save the initial position immediately
      saveWindowPosition();
    });
  } else {
    // For auto-launched app, save position without showing
    saveWindowPosition();
  }
  
  // Also save position after a short delay to ensure it's set correctly
  setTimeout(() => {
    if (mainWindow) saveWindowPosition();
  }, 1000);

  // Handle focus and blur to ensure consistent appearance
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window-focus', true);
  });
  
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-focus', false);
  });

  // Save position when window is moved
  mainWindow.on('moved', () => {
    // Get position immediately after move
    const pos = mainWindow.getPosition();
    console.log(`Window moved to ${pos[0]}, ${pos[1]}`);
    saveWindowPosition();
  });
  
  // Set up periodic position saving (every 30 seconds)
  const positionSaveInterval = setInterval(() => {
    if (mainWindow && !isQuitting) {
      saveWindowPosition();
    } else {
      clearInterval(positionSaveInterval);
    }
  }, 30000);
  
  mainWindow.on('closed', () => {
    // Clear the interval when window is closed
    clearInterval(positionSaveInterval);
    
    if (!isQuitting) {
      saveWindowPosition(); // Save position before recreating
      createWindow(); // Recreate the window if app is not quitting
      return;
    }
    mainWindow = null;
    if (pythonProcess) {
      pythonProcess.kill(); // Kill Python script when window closes
    }
  });

  startPythonPoller();
}

function showOrHideWindow(shouldShow) {
  if (!mainWindow) return;
  
  console.log(`showOrHideWindow called with shouldShow=${shouldShow}, window currently visible: ${mainWindow.isVisible()}`);
  
  if (shouldShow) {
    // Only show if window isn't already visible
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      // Don't call focus() - this prevents stealing focus from other applications
    }
    isContentPlaying = true;
    console.log('Window shown');
  } else if (!shouldShow && mainWindow.isVisible()) {
    mainWindow.hide();
    isContentPlaying = false;
    console.log('Window hidden');
  }
}

function startPythonPoller() {
  try {
    // Use absolute paths for Python
    // Try multiple Python paths
    const possiblePythonPaths = [
      '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      'python3',
      'python'
    ];
    
    // Find first valid Python interpreter
    let pythonPath = null;
    for (const path of possiblePythonPaths) {
      try {
        // Use simple check - if we can run it with --version, it's valid
        require('child_process').execSync(`${path} --version`, {stdio: 'ignore'});
        pythonPath = path;
        console.log(`Found Python at: ${pythonPath}`);
        break;
      } catch (e) {
        // This Python path doesn't work, try next one
        continue;
      }
    }
    
    if (!pythonPath) {
      console.error('No valid Python interpreter found!');
      return;
    }
    
    let scriptPath;
    let scriptWorkingDirectory;
    
    // Check if app is packaged
    if (app.isPackaged) {
      // In production: Run directly from the Resources path
      scriptPath = path.join(process.resourcesPath, 'spotify_poller.py');
      // Set the working directory to the Resources path so imports and .env work
      scriptWorkingDirectory = process.resourcesPath;
      console.log(`App is packaged. Using script at: ${scriptPath}`);
      console.log(`Working directory: ${scriptWorkingDirectory}`);
      
      // Check which files exist in Resources
      try {
        const resourceFiles = require('fs').readdirSync(process.resourcesPath);
        console.log(`Files in resources: ${JSON.stringify(resourceFiles)}`);
      } catch (e) {
        console.error(`Failed to list resources: ${e.message}`);
      }
    } else {
      // In development: use current directory
      scriptPath = path.join(process.cwd(), 'spotify_poller.py');
      scriptWorkingDirectory = process.cwd();
      console.log(`Development mode. Using script at: ${scriptPath}`);
    }
    
    // Verify the script exists before trying to spawn
    if (!fs.existsSync(scriptPath)) {
      console.error(`Error: Python script not found at ${scriptPath}`);
      // Try to see what's in the directory
      try {
        const dirPath = path.dirname(scriptPath);
        const dirFiles = fs.readdirSync(dirPath);
        console.error(`Files in ${dirPath}: ${dirFiles.join(', ')}`);
      } catch (e) {
        console.error(`Failed to list directory: ${e.message}`);
      }
      
      // Handle error appropriately - maybe show an error to the user
      // Attempt to restart after delay?
       setTimeout(() => {
        if (!isQuitting) startPythonPoller();
      }, 10000);
      return; 
    }

    // Set up environment with proper PATH and system variables
    const env = Object.assign({}, process.env, {
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Library/Frameworks/Python.framework/Versions/3.12/bin',
      PYTHONIOENCODING: 'UTF-8',
      PYTHONUNBUFFERED: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      HOME: app.getPath('home'),
      // Add this to help scripts find their location
      ELECTRON_APP_RESOURCES: app.isPackaged ? process.resourcesPath : process.cwd(),
      ELECTRON_APP_PATH: app.getAppPath()
    });
    
    console.log(`Starting Python process with: ${pythonPath} ${scriptPath}`);
    
    // Spawn Python process with script, environment, and corrected working directory
    pythonProcess = spawn(pythonPath, [scriptPath], {
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Set the current working directory for the Python process
      cwd: scriptWorkingDirectory,
      detached: true // Allow process to run independently
    });
    
    // Handle Python process stdout data
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      
      try {
        // Try to parse as JSON
        const jsonData = JSON.parse(output);
        console.log('Received JSON data from Python:', jsonData);
        
        // Handle debug log messages from the python script
        if (jsonData.hasOwnProperty('debug_log')) {
          console.log(`Python debug: ${jsonData.debug_log}`);
          
          // Check if debug_log contains JSON data that needs to be parsed again
          try {
            const innerData = JSON.parse(jsonData.debug_log);
            console.log('Found nested JSON in debug_log:', innerData);
            
            // If it contains track info, use it to update the UI and window visibility
            if (innerData.hasOwnProperty('track_name') && innerData.hasOwnProperty('is_playing')) {
              console.log(`Track data found in inner JSON: ${innerData.track_name}, playing: ${innerData.is_playing}`);
              
              // Send to renderer
              if (mainWindow) {
                mainWindow.webContents.send('spotify-data', innerData);
              }
              
              // Update window visibility
              showOrHideWindow(innerData.is_playing);
            }
          } catch (innerError) {
            // Not JSON, just a regular debug message
          }
          return;
        }
        
        // Handle suggestion results
        if (jsonData.hasOwnProperty('suggestion_result')) {
          console.log('Suggestion result:', jsonData.suggestion_result);
          if (mainWindow) {
            mainWindow.webContents.send('suggestion-result', jsonData.suggestion_result);
          }
          return;
        }
        
        // Regular track data
        if (jsonData.hasOwnProperty('track_name') && jsonData.hasOwnProperty('is_playing')) {
          console.log(`Track data: ${jsonData.track_name}, playing: ${jsonData.is_playing}`);
          
          // Forward the data to the renderer
          if (mainWindow) {
            mainWindow.webContents.send('spotify-data', jsonData);
          }
          
          // Check if music is playing and update window visibility
          if (jsonData.hasOwnProperty('is_playing')) {
            showOrHideWindow(jsonData.is_playing);
          }
        }
      } catch (err) {
        // Not JSON data, just log it
        console.log(`Non-JSON Python output: ${output}`);
      }
    });
    
    // Also capture stderr for better debugging
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data.toString().trim()}`);
    });
    
    // Handle process errors
    pythonProcess.on('error', (err) => {
      console.error(`Python process error: ${err.message}`);
      // Python process error - restart after a delay
      setTimeout(() => {
        if (!isQuitting) startPythonPoller();
      }, 5000);
    });
    
    // Handle process exit
    pythonProcess.on('exit', (code, signal) => {
      console.log(`Python process exited with code ${code} and signal ${signal}`);
      // Python process exited - restart after a delay
      if (code !== 0 && !isQuitting) {
        setTimeout(() => {
          startPythonPoller();
        }, 5000);
      }
    });
    
    // Set up IPC handlers for renderer commands
    // Register the seek-spotify event handler
    ipcMain.on('seek-spotify', (event, positionMs) => {
      if (pythonProcess && pythonProcess.stdin.writable) {
        const command = { command: 'seek', position_ms: positionMs };
        pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      }
    });
    
    // Register the like-spotify event handler
    ipcMain.on('like-spotify', (event, trackId) => {
      if (pythonProcess && pythonProcess.stdin.writable) {
        const command = { command: 'like', track_id: trackId };
        pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      }
    });
    
    // Register the suggest-similar event handler
    ipcMain.on('suggest-similar', (event) => {
      if (pythonProcess && pythonProcess.stdin.writable) {
        const command = { command: 'suggest_similar' };
        pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      }
    });
    
    // Reuse the generic handler for other commands
    ipcMain.on('spotify-command', (event, command) => {
      if (pythonProcess && pythonProcess.stdin) {
        pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      }
    });
    
    // Set up IPC handler for window position
    ipcMain.on('get-window-position', (event) => {
      if (mainWindow) {
        event.returnValue = mainWindow.getPosition();
      } else {
        event.returnValue = [0, 0];
      }
    });
    
    // Set up handler for quit app
    ipcMain.on('quit-app', () => {
      isQuitting = true;
      app.quit();
    });
    
  } catch (err) {
    // Error starting Python poller - retry after a delay
    setTimeout(() => {
      if (!isQuitting) startPythonPoller();
    }, 5000);
  }
}

// App lifecycle handlers
app.whenReady().then(() => {
  createWindow();
  
  // Set login item settings to ensure app starts at login
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false
  });
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Mark as quitting to prevent restart loops
app.on('before-quit', () => {
  isQuitting = true;
  // Save position before quitting
  saveWindowPosition();
});

// Handle macOS app quit
app.on('will-quit', () => {
  // Final attempt to save position
  saveWindowPosition();
});

// Handle window-all-closed (happens on Windows/Linux quit)
app.on('window-all-closed', function () {
  // Save position when all windows close
  saveWindowPosition();
  if (process.platform !== 'darwin') app.quit();
});

// Add this for better error handling
process.on('uncaughtException', (err) => {
  // Uncaught exception - prevent crash
  if (!isQuitting) {
    // Try to restart window if it crashed
    if (!mainWindow) {
      setTimeout(createWindow, 1000);
    }
  }
}); 