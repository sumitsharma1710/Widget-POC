const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

let widgetWindow = null;

/**
 * Create the widget window
 */
function createWidgetWindow(preferences, savePreferences) {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Widget dimensions - start compact
  const widgetWidth = 100;
  const widgetHeight = 60;

  // Position at center-top of screen (default)
  const x = Math.floor((screenWidth - widgetWidth) / 2);
  const y = 20; // 20px from top

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: x,
    y: y,
    frame: false, // Frameless window
    transparent: true, // Allow transparent background
    alwaysOnTop: true, // Float above other windows
    resizable: false, // Fixed size initially
    skipTaskbar: true, // Don't show in taskbar
    show: false, // Don't show until ready
    hasShadow: true, // Window shadow
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script
    },
  });

  // Load the index.html file
  widgetWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Show window when ready
  widgetWindow.once("ready-to-show", () => {
    widgetWindow.show();
    setCompactMode(); // Ensure compact mode on start
  });

  // Handle window close - hide instead of destroy
  widgetWindow.on("close", (event) => {
    if (!widgetWindow.forceClose) {
      event.preventDefault();
      widgetWindow.hide();
    }
  });

  // Open DevTools in development
  if (process.argv.includes("--enable-logging")) {
    widgetWindow.webContents.openDevTools({ mode: "detach" });
  }

  return widgetWindow;
}

/**
 * Get the widget window instance
 */
function getWidgetWindow() {
  return widgetWindow;
}

/**
 * Show the widget
 */
function showWidget() {
  if (widgetWindow) {
    widgetWindow.show();
  }
}

/**
 * Hide the widget
 */
function hideWidget() {
  if (widgetWindow) {
    widgetWindow.hide();
  }
}

/**
 * Toggle widget visibility
 */
function toggleWidget() {
  if (widgetWindow) {
    if (widgetWindow.isVisible()) {
      widgetWindow.hide();
    } else {
      widgetWindow.show();
    }
  }
}

/**
 * Set widget to compact mode (initial state - just buttons)
 */
function setCompactMode() {
  if (widgetWindow) {
    const newWidth = 100;
    const newHeight = 60;

    // Get current position
    const [x, y] = widgetWindow.getPosition();

    // Force resizable to update bounds
    widgetWindow.setResizable(true);
    widgetWindow.setSize(newWidth, newHeight, true);
    widgetWindow.setResizable(false);

    // Restore position
    widgetWindow.setPosition(x, y, true);
  }
}

/**
 * Set widget to recording mode (expanded horizontal with waveform)
 */
function setRecordingMode() {
  if (widgetWindow) {
    const newWidth = 360;
    const newHeight = 60;

    // Get current position
    const [x, y] = widgetWindow.getPosition();

    // Force resizable to update bounds
    widgetWindow.setResizable(true);
    widgetWindow.setSize(newWidth, newHeight, true);
    widgetWindow.setResizable(false);

    // Restore position
    widgetWindow.setPosition(x, y, true);
  }
}

/**
 * Set widget to list mode (showing recordings)
 */
function setListMode() {
  if (widgetWindow) {
    const newWidth = 330;
    const newHeight = 370;

    // Get current position
    const [x, y] = widgetWindow.getPosition();

    // Force resizable to update bounds
    widgetWindow.setResizable(true);
    widgetWindow.setSize(newWidth, newHeight, true);
    widgetWindow.setResizable(false);

    // Restore position
    widgetWindow.setPosition(x, y, true);
  }
}

/**
 * Set widget to error mode (expanded for message visibility)
 */
function setErrorMode() {
  if (widgetWindow) {
    const newWidth = 340;
    const newHeight = 120; // Sufficient height for multiline error

    // Get current position
    const [x, y] = widgetWindow.getPosition();

    // Force resizable to update bounds
    widgetWindow.setResizable(true);
    widgetWindow.setSize(newWidth, newHeight, true);
    widgetWindow.setResizable(false);

    // Restore position
    widgetWindow.setPosition(x, y, true);
  }
}

/**
 * Set widget to expanded size (during recording) - LEGACY
 */
function expandWidget() {
  setRecordingMode();
}

/**
 * Set widget to collapsed size (idle state) - LEGACY
 */
function collapseWidget() {
  setCompactMode();
}

/**
 * Destroy the widget window completely (for app quit)
 */
function destroyWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.forceClose = true;
    widgetWindow.destroy();
    widgetWindow = null;
  }
}

module.exports = {
  createWidgetWindow,
  getWidgetWindow,
  showWidget,
  hideWidget,
  toggleWidget,
  setCompactMode,
  setRecordingMode,
  setListMode,
  setErrorMode,
  expandWidget,
  collapseWidget,
  destroyWidget,
};
