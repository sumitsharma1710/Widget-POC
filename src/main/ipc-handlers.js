const { ipcMain, shell, BrowserWindow } = require("electron");
const {
  getWidgetWindow,
  expandWidget,
  collapseWidget,
  setCompactMode,
  setRecordingMode,
  setRecordingMicMode,
  setListMode,
  setErrorMode,
} = require("./widget-window");
const { setRecordingState } = require("./tray");
const {
  saveAudioChunk,
  finalizeRecording,
  cancelRecording,
  startNewRecording,
  getRecordingsList,
  getRecordingsDir,
} = require("./storage");

// Current recording state
let currentRecordingId = null;

/**
 * Setup all IPC handlers for communication with renderer
 */
function setupIpcHandlers() {
  // Start a new recording
  ipcMain.handle("recording:start", async (event) => {
    try {
      currentRecordingId = await startNewRecording();
      setRecordingState(true);
      expandWidget();
      console.log("Recording started:", currentRecordingId);
      return { success: true, recordingId: currentRecordingId };
    } catch (error) {
      console.error("Failed to start recording:", error);
      return { success: false, error: error.message };
    }
  });

  // Save audio chunk (called periodically during recording)
  ipcMain.handle("recording:save-chunk", async (event, { chunk, mimeType }) => {
    if (!currentRecordingId) {
      return { success: false, error: "No active recording" };
    }

    try {
      await saveAudioChunk(currentRecordingId, chunk, mimeType);
      return { success: true };
    } catch (error) {
      console.error("Failed to save chunk:", error);
      return { success: false, error: error.message };
    }
  });

  // Pause recording (handled in renderer, just update tray)
  ipcMain.handle("recording:pause", async (event) => {
    console.log("Recording paused");
    return { success: true };
  });

  // Resume recording (handled in renderer, just update tray)
  ipcMain.handle("recording:resume", async (event) => {
    console.log("Recording resumed");
    return { success: true };
  });

  // Stop and finalize recording
  ipcMain.handle("recording:stop", async (event, { duration }) => {
    if (!currentRecordingId) {
      return { success: false, error: "No active recording" };
    }

    try {
      const result = await finalizeRecording(currentRecordingId, duration);
      setRecordingState(false);
      collapseWidget();
      currentRecordingId = null;
      console.log("Recording saved:", result.filePath);
      return { success: true, ...result };
    } catch (error) {
      console.error("Failed to finalize recording:", error);
      return { success: false, error: error.message };
    }
  });

  // Cancel and discard recording
  ipcMain.handle("recording:cancel", async (event) => {
    if (!currentRecordingId) {
      return { success: false, error: "No active recording" };
    }

    try {
      await cancelRecording(currentRecordingId);
      setRecordingState(false);
      collapseWidget();
      currentRecordingId = null;
      console.log("Recording cancelled");
      return { success: true };
    } catch (error) {
      console.error("Failed to cancel recording:", error);
      return { success: false, error: error.message };
    }
  });

  // Get list of recordings
  ipcMain.handle("recordings:list", async (event) => {
    try {
      const recordings = await getRecordingsList();
      return { success: true, recordings };
    } catch (error) {
      console.error("Failed to get recordings list:", error);
      return { success: false, error: error.message };
    }
  });

  // Open recordings folder in file manager
  ipcMain.handle("recordings:open-folder", async (event) => {
    try {
      const recordingsDir = getRecordingsDir();
      await shell.openPath(recordingsDir);
      return { success: true };
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
      return { success: false, error: error.message };
    }
  });

  // Window control handlers
  ipcMain.on("window:minimize", (event) => {
    const widgetWindow = getWidgetWindow();
    if (widgetWindow) {
      widgetWindow.hide();
    }
  });

  ipcMain.on("window:close", (event) => {
    const widgetWindow = getWidgetWindow();
    if (widgetWindow) {
      widgetWindow.hide();
    }
  });

  ipcMain.on("set-ignore-mouse-events", (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setIgnoreMouseEvents(ignore, options);
    }
  });

  ipcMain.on("resize-window", (event, mode) => {
    switch (mode) {
      case "compact":
        setCompactMode();
        break;
      case "recording":
        setRecordingMode();
        break;
      case "recording-mic":
        setRecordingMicMode();
        break;
      case "list":
        setListMode();
        break;
      case "error":
        setErrorMode();
        break;
    }
  });
}

module.exports = {
  setupIpcHandlers,
};
