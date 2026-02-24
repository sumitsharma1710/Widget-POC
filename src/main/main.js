const { app } = require("electron");
const {
  createWidgetWindow,
  getWidgetWindow,
  showWidget,
  hideWidget,
  toggleWidget,
} = require("./widget-window");
const { createTray } = require("./tray");
const { setupIpcHandlers } = require("./ipc-handlers");
const {
  initStorage,
  checkForRecovery,
  recoverRecording,
} = require("./storage");
const { requestSystemPermissions } = require("./permission");
const { loadPreferences } = require("./preferences");

let preferences = null;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Focus the widget if user tries to launch second instance
    const widgetWindow = getWidgetWindow();
    if (widgetWindow) {
      if (widgetWindow.isMinimized()) widgetWindow.restore();
      widgetWindow.show();
      widgetWindow.focus();
    }
  });

  // Load preferences early
  preferences = loadPreferences();

  // App ready event
  app.whenReady().then(async () => {
    // Request system permissions
    await requestSystemPermissions();

    // Initialize storage
    await initStorage();

    // Check for crash recovery
    const recoveryData = await checkForRecovery();
    if (recoveryData) {
      try {
        const recovered = await recoverRecording(recoveryData);
        // We'll notify the window after it's created
        setTimeout(() => {
          const win = getWidgetWindow();
          if (win) {
            win.webContents.send("recording:recovery-found", recovered);
          }
        }, 2000); // Give UI time to load
      } catch (error) {
        console.error("Failed to recover recording:", error);
      }
    }

    // Setup IPC handlers first
    setupIpcHandlers();

    // Create the widget window
    createWidgetWindow();

    // Create system tray
    createTray();
  });

  // Cleanup on quit
  app.on("will-quit", () => {
    // Unregister all shortcuts
  });

  // Keep app running even when all windows are closed (for system tray)
  app.on("window-all-closed", () => {
    // Don't quit on macOS
    if (process.platform !== "darwin") {
      // On other platforms, keep running for tray
      // app.quit();
    }
  });

  // Re-create window on macOS when clicking dock icon
  app.on("activate", () => {
    const widgetWindow = getWidgetWindow();
    if (!widgetWindow) {
      createWidgetWindow();
    } else {
      showWidget();
    }
  });
}
