// preferences.js
const { app } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");

const userDataPath = app.getPath("userData");
const preferencesPath = path.join(userDataPath, "preferences.json");

// Generate unique device ID
function generateDeviceId() {
  return crypto.randomUUID();
}

// Default preferences schema
const defaultPreferences = {
  version: "1.0.0",
  deviceId: null,
  permissions: {
    camera: null,
    microphone: null,
    notifications: null,
    screenShare: null,
    mediaDevices: null,
    fileSystem: null,
  },
  appSettings: {
    autoLaunch: false,
    minimizeToTray: true,
    startMinimized: false,
    hardwareAcceleration: true,
    theme: "system", // 'light', 'dark', 'system'
  },
  firstRun: true,
  lastUpdated: null,
};

// Load preferences from disk
function loadPreferences() {
  try {
    if (fsSync.existsSync(preferencesPath)) {
      const data = fsSync.readFileSync(preferencesPath, "utf8");
      const loaded = JSON.parse(data);

      // Ensure deviceId exists
      if (!loaded.deviceId) {
        loaded.deviceId = generateDeviceId();
      }

      // Merge with defaults to handle new fields
      return { ...defaultPreferences, ...loaded };
    }
  } catch (error) {
    console.error("Error loading preferences:", error);
  }

  // First run - create new preferences
  const newPrefs = { ...defaultPreferences };
  newPrefs.deviceId = generateDeviceId();
  return newPrefs;
}

// Save preferences to disk
async function savePreferences(preferences) {
  try {
    preferences.lastUpdated = new Date().toISOString();

    // Ensure directory exists
    const dir = path.dirname(preferencesPath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(
      preferencesPath,
      JSON.stringify(preferences, null, 2),
      "utf8",
    );

    return true;
  } catch (error) {
    console.error("Error saving preferences:", error);
    return false;
  }
}

module.exports = {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  preferencesPath,
};
