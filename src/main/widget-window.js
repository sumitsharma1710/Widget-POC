const { BrowserWindow, screen } = require("electron");
const path = require("path");
const { setupPermissionHandlers } = require("./permission");

let widgetWindow = null;

/**
 * Create the floating widget window
 */
function createWidgetWindow(preferences, savePreferences) {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Widget dimensions - start compact
  const widgetWidth = 340;
  const widgetHeight = 400;

  // Position in bottom-right corner with padding
  const x = screenWidth - widgetWidth - 20;
  const y = screenHeight - widgetHeight - 20;

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: x,
    y: y,
    frame: false, // Frameless window
    transparent: true, // Allow transparent background
    alwaysOnTop: true, // Float above other windows
    resizable: false, // Fixed size
    skipTaskbar: true, // Don't show in taskbar
    show: true, // Show immediately
    hasShadow: true, // Window shadow
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script
    },
  });

  // Setup permissions
  setupPermissionHandlers(widgetWindow, preferences, savePreferences);

  // Load the widget HTML
  widgetWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

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
 * Show the widget window
 */
function showWidget() {
  if (widgetWindow) {
    widgetWindow.show();
    widgetWindow.focus();
  }
}

/**
 * Hide the widget window
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
      widgetWindow.focus();
    }
  }
}

/**
 * Set widget to compact mode (initial state - just buttons)
 */
function setCompactMode() {
  if (widgetWindow) {
    widgetWindow.setSize(100, 60, true);
  }
}

/**
 * Set widget to recording mode (expanded horizontal with waveform)
 */
function setRecordingMode() {
  if (widgetWindow) {
    widgetWindow.setSize(320, 60, true);
  }
}

/**
 * Set widget to list mode (showing recordings)
 */
function setListMode() {
  if (widgetWindow) {
    widgetWindow.setSize(350, 450, true);
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
 * Force close the widget (for app quit)
 */
function destroyWidget() {
  if (widgetWindow) {
    widgetWindow.forceClose = true;
    widgetWindow.close();
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
  expandWidget,
  collapseWidget,
  destroyWidget,
};
