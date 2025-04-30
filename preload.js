const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose a function to send seek commands securely
  sendSeekCommand: (positionMs) => ipcRenderer.send('seek-spotify', positionMs),
  
  // Expose a function to send like command
  sendLikeCommand: (trackId) => ipcRenderer.send('like-spotify', trackId),
  
  // Expose a function to send suggest similar song command
  sendSuggestSimilarCommand: () => ipcRenderer.send('suggest-similar'),
  
  // Expose a function to receive data from the main process securely
  onSpotifyData: (callback) => ipcRenderer.on('spotify-data', (event, ...args) => callback(...args)),
  
  // Expose a function to receive errors from the main process securely
  onSpotifyError: (callback) => ipcRenderer.on('spotify-error', (event, ...args) => callback(...args)),
  
  // Add function to handle window focus changes
  onWindowFocusChange: (callback) => ipcRenderer.on('window-focus', (event, ...args) => callback(...args)),
  
  // Expose a function to receive suggestion results
  onSuggestionResult: (callback) => ipcRenderer.on('suggestion-result', (event, ...args) => callback(...args)),
  
  // Add function to quit the app
  quitApp: () => ipcRenderer.send('quit-app')
}); 