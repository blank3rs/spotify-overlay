const songTitleEl = document.getElementById('song-title');
const artistNameEl = document.getElementById('artist-name');
const albumArtEl = document.getElementById('album-art');
const progressSliderEl = document.getElementById('progress-slider');
const overlayContainerEl = document.getElementById('overlay-container');
const progressFillEl = document.getElementById('progress-fill');
const hoverTooltipEl = document.getElementById('hover-tooltip'); // Get tooltip element
const likeButtonEl = document.getElementById('like-button'); // Get like button

// Get the new elements
const suggestButtonEl = document.getElementById('suggest-button');
const suggestionNotificationEl = document.getElementById('suggestion-notification');

let currentTrackDuration = 0;
let currentTrackId = null; // Store current track ID
let isSeeking = false;
let isHoveringSlider = false; // Track hover state
let lastUpdateTime = Date.now();
let visibilityCheckInterval = null;

// --- State for Animation ---
let lastProgressMs = 0;
let isPlaying = false;
let animationFrameId = null; // To control the animation loop

// Function to format milliseconds to M:SS
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// UPDATED Function: Update the width of the fill element
function updateSliderProgressVisuals(percentage) {
    // Ensure percentage is within bounds
    percentage = Math.max(0, Math.min(100, percentage));
    // DEBUG: Log the calculated percentage
    // console.log(`Updating slider progress: value=${percentage}, max=100, percentage=${percentage}%`); 
    progressFillEl.style.width = `${percentage}%`;
    // Update the invisible slider's value as well
    progressSliderEl.value = percentage;
}

// --- Animation Loop with power efficiency ---
function animationLoop() {
    if (isPlaying && !isSeeking && currentTrackDuration > 0) {
        const now = Date.now();
        const timeElapsed = now - lastUpdateTime;
        const estimatedProgressMs = lastProgressMs + timeElapsed;
        const estimatedPercentage = (estimatedProgressMs / currentTrackDuration) * 100;
        
        updateSliderProgressVisuals(estimatedPercentage);
    }
    // Request the next frame
    animationFrameId = requestAnimationFrame(animationLoop);
}

function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Function to check if text overflows container and add marquee if needed
function checkAndApplyMarquee(element, text) {
    // Remove any existing marquee
    if (element.querySelector('.marquee-text')) {
        element.innerHTML = '';
    }
    
    // Reset to plain text first
    element.textContent = text;
    
    // Check if text is overflowing
    const isOverflowing = element.scrollWidth > element.clientWidth;
    
    if (isOverflowing) {
        // Create marquee span
        element.innerHTML = '';
        const marqueeSpan = document.createElement('span');
        marqueeSpan.className = 'marquee-text';
        marqueeSpan.textContent = text;
        element.appendChild(marqueeSpan);
    }
}

// --- Event Listeners ---

// Double-click to quit application
overlayContainerEl.addEventListener('dblclick', (e) => {
    // Check if the event target is a clickable control to avoid quitting when
    // double-clicking on controls like the slider or like button
    if (e.target === overlayContainerEl || e.target === songTitleEl || e.target === artistNameEl) {
        window.electronAPI.quitApp();
    }
});

// Listen for data from the main process (via preload script)
window.electronAPI.onSpotifyData((data) => {
    // console.log('Received data:', data);
    if (data.error) {
        // Display full error messages in a more readable way
        const errorMsg = data.error;
        
        // No marquee for error message - just plain text
        songTitleEl.innerHTML = ''; // Clear any existing content including marquee
        songTitleEl.textContent = 'Spotify Error:';
        
        // Show full error text, breaking into multiple lines if needed
        if (errorMsg.length > 30) {
            // Split the error into chunks for better readability
            const firstLine = errorMsg.substring(0, 30);
            const secondLine = errorMsg.substring(30);
            artistNameEl.textContent = firstLine;
            // Create or update an error details element
            let errorDetailsEl = document.getElementById('error-details');
            if (!errorDetailsEl) {
                errorDetailsEl = document.createElement('div');
                errorDetailsEl.id = 'error-details';
                errorDetailsEl.style.fontSize = '10px';
                errorDetailsEl.style.color = '#ff7777';
                errorDetailsEl.style.marginTop = '2px';
                artistNameEl.parentNode.insertBefore(errorDetailsEl, artistNameEl.nextSibling);
            }
            errorDetailsEl.textContent = secondLine;
        } else {
            artistNameEl.textContent = errorMsg;
            // Remove error details element if it exists
            const errorDetailsEl = document.getElementById('error-details');
            if (errorDetailsEl) {
                errorDetailsEl.remove();
            }
        }
        
        albumArtEl.src = '';
        stopAnimationLoop(); // Stop animation on error
        updateSliderProgressVisuals(0);
        overlayContainerEl.style.backgroundColor = 'rgba(40, 20, 20, 0.85)'; // Reddish background for errors
        isPlaying = false;
        currentTrackDuration = 0;
        currentTrackId = null; // Clear track ID on error
        return;
    }
    
    // Remove error details element if it exists when there's no error
    const errorDetailsEl = document.getElementById('error-details');
    if (errorDetailsEl) {
        errorDetailsEl.remove();
    }
    
    // Reset background color when successful
    overlayContainerEl.style.backgroundColor = 'rgba(28, 28, 28, 0.75)';

    // Apply song title with marquee if needed
    const trackName = data.track_name || 'Connecting...';
    checkAndApplyMarquee(songTitleEl, trackName);
    
    // Set artist name normally
    artistNameEl.textContent = data.artist_name || '';
    
    albumArtEl.src = data.album_art_url || '';
    currentTrackId = data.track_id || null; // Store track ID
    
    // Update state for animation
    lastProgressMs = data.progress_ms || 0;
    currentTrackDuration = data.duration_ms || 0;
    isPlaying = data.is_playing || false;
    lastUpdateTime = Date.now(); // Record time of this update

    // Update visuals only if not seeking
    if (!isSeeking && currentTrackDuration > 0) {
        const progressPercent = (lastProgressMs / currentTrackDuration) * 100;
        updateSliderProgressVisuals(progressPercent);
    }

    // Manage animation loop based on playback state
    if (isPlaying && !animationFrameId) {
        animationFrameId = requestAnimationFrame(animationLoop); // Start loop if playing and not already running
    } else if (!isPlaying && animationFrameId) {
        stopAnimationLoop(); // Stop loop if not playing
    }
});

// Listen for errors from the main process
window.electronAPI.onSpotifyError((errorMessage) => {
    // console.error('Received error:', errorMessage);
    songTitleEl.textContent = 'Error';
    artistNameEl.textContent = errorMessage.substring(0, 50);
    albumArtEl.src = '';
    stopAnimationLoop(); // Stop animation on error
    updateSliderProgressVisuals(0);
     overlayContainerEl.style.backgroundColor = 'rgba(28, 28, 28, 0.75)'; // Reset color
     isPlaying = false;
     currentTrackDuration = 0;
     currentTrackId = null; // Clear track ID on error
});

// Handle slider seeking AND HOVER
progressSliderEl.addEventListener('input', (event) => {
    if (!isSeeking) {
      isSeeking = true; // Flag that user is dragging
      stopAnimationLoop(); // Pause local animation while seeking
    }
    // Update visual fill element immediately while dragging based on slider value
    updateSliderProgressVisuals(event.target.value); 
    updateTooltip(event); 
});

// Add a mousedown listener to the progress container to improve seeking
progressContainerEl = document.getElementById('progress-container');
progressContainerEl.addEventListener('mousedown', (event) => {
    // Only handle left-clicks
    if (event.button !== 0) return;
    
    // Calculate the click position as a percentage of the slider width
    const containerRect = progressContainerEl.getBoundingClientRect();
    const clickX = event.clientX - containerRect.left;
    const clickPercent = Math.max(0, Math.min(100, (clickX / containerRect.width) * 100));
    
    // Update slider value
    progressSliderEl.value = clickPercent;
    
    // Trigger the seek
    const seekPositionMs = Math.floor((clickPercent / 100) * currentTrackDuration);
    
    // Update visual first for responsive feel
    updateSliderProgressVisuals(clickPercent);
    
    // Send the seek command
    window.electronAPI.sendSeekCommand(seekPositionMs);
    
    // Update state
    lastProgressMs = seekPositionMs;
    lastUpdateTime = Date.now();
    
    // Keep animations consistent
    isSeeking = false;
    if (isPlaying && !animationFrameId) {
        animationFrameId = requestAnimationFrame(animationLoop);
    }
    
    // Show tooltip temporarily
    updateTooltip({
        clientX: event.clientX,
        target: progressSliderEl
    });
    
    // Create appearance of transient hover
    hoverTooltipEl.style.opacity = '1';
    setTimeout(() => {
        if (!isHoveringSlider) {
            hoverTooltipEl.style.opacity = '0';
        }
    }, 1000);
});

progressSliderEl.addEventListener('change', (event) => {
    const seekPositionPercent = event.target.value;
    const seekPositionMs = Math.floor((seekPositionPercent / 100) * currentTrackDuration);
    // console.log(`Sending seek command for ${seekPositionMs}ms`);
    window.electronAPI.sendSeekCommand(seekPositionMs);
    
    // Update state immediately after sending command
    lastProgressMs = seekPositionMs;
    lastUpdateTime = Date.now();
    updateSliderProgressVisuals(seekPositionPercent); // Ensure visual matches sent command
    
    isSeeking = false; // Reset flag 
    // Restart animation loop if song is still marked as playing
    if (isPlaying && !animationFrameId) {
         animationFrameId = requestAnimationFrame(animationLoop);
    } 
});

// Show/Hide Tooltip on Slider Hover
progressSliderEl.addEventListener('mouseenter', () => {
    isHoveringSlider = true;
    hoverTooltipEl.style.opacity = '1';
});

progressSliderEl.addEventListener('mouseleave', () => {
    isHoveringSlider = false;
    hoverTooltipEl.style.opacity = '0';
});

// Update Tooltip position and text on mouse move over slider
progressSliderEl.addEventListener('mousemove', (event) => {
    if (isHoveringSlider) {
        updateTooltip(event);
    }
});

// Helper function to update tooltip
function updateTooltip(event) {
    if (currentTrackDuration <= 0) return; // No duration, nothing to show

    const sliderRect = progressSliderEl.getBoundingClientRect();
    const hoverX = event.clientX - sliderRect.left; // X position within the slider
    const hoverPercent = Math.max(0, Math.min(100, (hoverX / sliderRect.width) * 100));
    const hoverTimeMs = (hoverPercent / 100) * currentTrackDuration;

    hoverTooltipEl.textContent = formatDuration(hoverTimeMs);
    
    // Calculate position to keep tooltip within bounds
    const tooltipWidth = hoverTooltipEl.offsetWidth;
    const maxLeft = sliderRect.width - tooltipWidth; 
    const tooltipLeft = Math.max(0, Math.min(maxLeft, hoverX - (tooltipWidth / 2)));

    hoverTooltipEl.style.left = `${tooltipLeft}px`;
    hoverTooltipEl.style.transform = 'translateX(0)'; // Reset transform used for centering initially
    hoverTooltipEl.style.opacity = '1'; // Ensure visible on move
}

// Like Button Click
likeButtonEl.addEventListener('click', () => {
    if (currentTrackId) {
        // Send the like command
        window.electronAPI.sendLikeCommand(currentTrackId);
        
        // Add visual feedback - toggle the "liked" class
        likeButtonEl.classList.add('liked');
        
        // Remove the "liked" class after animation completes
        setTimeout(() => {
            likeButtonEl.classList.remove('liked');
        }, 700); // Slightly longer than animation to ensure it completes
    }
});

// Document visibility change handler for power efficiency
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden (user switched tabs/minimized) - stop animation to save power
        stopAnimationLoop();
    } else if (isPlaying) {
        // Page is visible again and song is playing - restart animation
        lastUpdateTime = Date.now(); // Reset time reference
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(animationLoop);
        }
    }
});

// Handle window focus changes
window.electronAPI.onWindowFocusChange((isFocused) => {
  if (isFocused) {
    document.body.classList.remove('window-unfocused');
  } else {
    document.body.classList.add('window-unfocused');
  }
});

// Initial slider state
updateSliderProgressVisuals(0);

// Add a click event listener to the suggestion button
suggestButtonEl.addEventListener('click', () => {
    // Visual feedback - add the suggesting class
    suggestButtonEl.classList.add('suggesting');
    
    // Clear any existing timeouts for notifications
    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }
    
    // Update notification with more descriptive message
    const currentTrack = songTitleEl.textContent;
    suggestionNotificationEl.textContent = `Finding similar songs...`;
    suggestionNotificationEl.style.backgroundColor = 'rgba(80, 80, 200, 0.95)'; // Different color for search state
    
    // Show the notification
    suggestionNotificationEl.classList.add('visible');
    
    // Send the command to the main process
    window.electronAPI.sendSuggestSimilarCommand();
    
    // Reset button after 2 seconds
    setTimeout(() => {
        suggestButtonEl.classList.remove('suggesting');
    }, 2000);
    
    // Auto-hide the searching notification after 1 second
    window.notificationTimeout = setTimeout(() => {
        suggestionNotificationEl.classList.remove('visible');
    }, 1000);
});

// Listen for suggestion results
window.electronAPI.onSuggestionResult((result) => {
    // Clear the "suggesting" state
    suggestButtonEl.classList.remove('suggesting');
    
    // Clear any existing timeouts
    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }
    
    // Wait a moment before showing the result notification (to ensure separation from first notification)
    setTimeout(() => {
        // Show the result in the notification
        if (result.status === 'success') {
            // Get full track details for clarity
            const track = result.track;
            const songName = track.name.trim();
            const artistName = track.artist.trim();
            
            // Create a short concise message
            suggestionNotificationEl.textContent = `Added: ${songName}`;
            suggestionNotificationEl.style.backgroundColor = 'rgba(29, 185, 84, 0.9)'; // Success color
            console.log(`Added song to queue: "${songName}" by ${artistName}`);
        } else {
            // Error message
            suggestionNotificationEl.textContent = 'Song not found';
            suggestionNotificationEl.style.backgroundColor = 'rgba(255, 89, 89, 0.95)'; // Error color
        }
        
        // Make notification visible
        suggestionNotificationEl.classList.add('visible');
        
        // Auto-hide notification after 4 seconds
        window.notificationTimeout = setTimeout(() => {
            suggestionNotificationEl.classList.remove('visible');
        }, 4000);
    }, 500); // 500ms delay to ensure visual separation between notifications
}); 