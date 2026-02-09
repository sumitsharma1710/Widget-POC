const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Recording controls
  startRecording: () => ipcRenderer.invoke("recording:start"),
  pauseRecording: () => ipcRenderer.invoke("recording:pause"),
  resumeRecording: () => ipcRenderer.invoke("recording:resume"),
  stopRecording: (duration) =>
    ipcRenderer.invoke("recording:stop", { duration }),
  cancelRecording: () => ipcRenderer.invoke("recording:cancel"),

  // Save audio chunk
  saveChunk: (chunk, mimeType) =>
    ipcRenderer.invoke("recording:save-chunk", { chunk, mimeType }),

  // Get recordings list
  getRecordings: () => ipcRenderer.invoke("recordings:list"),

  // Open recordings folder
  openRecordingsFolder: () => ipcRenderer.invoke("recordings:open-folder"),

  // Window controls
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  closeWindow: () => ipcRenderer.send("window:close"),
});
