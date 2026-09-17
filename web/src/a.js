// Activate cursor toggle when the page loads
window.onload = function() {
    tooglecursor();
};

function tooglecursor() {
    // Check KaiOS version or feature support as needed
    // For KaiOS 2.6 (Spatial Navigation API)
    if ('spatialNavigationEnabled' in navigator) {
        if (navigator.spatialNavigationEnabled === false) {
            navigator.spatialNavigationEnabled = true;
        } else {
            navigator.spatialNavigationEnabled = false;
        }
    }

    // For KaiOS 4.0+ (Virtual Cursor API)
    if ('b2g' in navigator && 'virtualCursor' in navigator.b2g) {
        if (navigator.b2g.virtualCursor.enabled === false) {
            navigator.b2g.virtualCursor.enable();
        } else {
            navigator.b2g.virtualCursor.disable();
        }
    }
}

// Function to toggle fullscreen mode
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.warn(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener("keydown", (e) => {
  switch(e.key) {
    /* Volume Down */
    case "**":
      if (navigator.volumeManager)
        navigator.volumeManager.requestDown();
      break;

    case "SoftRight": 
      window.close(); // Attempt to close the app
      break;         
                        
    case "Call": 
      tooglecursor(); // Toggle spatial navigation
      break;

    /* Fullscreen toggle with '0' */
    case "00":
      toggleFullScreen();
      break;

    /* Volume Up */
    case "##":
      if (navigator.volumeManager)
        navigator.volumeManager.requestUp();
      break;
  }
});