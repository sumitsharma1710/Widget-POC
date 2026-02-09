// permissions.js
const { systemPreferences } = require("electron");

// Request system permissions (macOS)
async function requestSystemPermissions() {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    // Camera permission
    const cameraStatus = systemPreferences.getMediaAccessStatus("camera");
    if (cameraStatus !== "granted" && cameraStatus !== "denied") {
      await systemPreferences.askForMediaAccess("camera");
    }

    // Microphone permission
    const micStatus = systemPreferences.getMediaAccessStatus("microphone");
    if (micStatus !== "granted" && micStatus !== "denied") {
      await systemPreferences.askForMediaAccess("microphone");
    }
  } catch (error) {
    console.error("Error requesting system permissions:", error);
  }
}

// Setup permission handlers for window
function setupPermissionHandlers(win, preferences, savePreferences) {
  // Handle permission requests
  win.webContents.session.setPermissionRequestHandler(
    async (_webContents, permission, callback, details) => {
      let permissionKey = permission;

      if (permission === "media") {
        // FIX: Empty mediaTypes means screen share request
        if (!details.mediaTypes || details.mediaTypes.length === 0) {
          permissionKey = "screenShare";
          
          // Auto-grant screen share
          if (preferences.permissions[permissionKey] !== true) {
            const next = {
              ...preferences,
              permissions: {
                ...preferences.permissions,
                [permissionKey]: true,
              },
            };
            const saved = await savePreferences(next);
            if (saved) preferences = next;
          }
          
          callback(true);
          return;
        }
        
        if (details.mediaTypes?.includes("video")) {
          permissionKey = "camera";
        } else if (details.mediaTypes?.includes("audio")) {
          permissionKey = "microphone";
        }
      } else if (permission === "display-capture") {
        permissionKey = "screenShare";
        // Auto-grant display capture
        if (preferences.permissions[permissionKey] !== true) {
          const next = {
            ...preferences,
            permissions: {
              ...preferences.permissions,
              [permissionKey]: true,
            },
          };
          const saved = await savePreferences(next);
          if (saved) preferences = next;
        }
        
        callback(true);
        return;
      }

      // Only deny if explicitly set to false
      if (preferences.permissions[permissionKey] === false) {
        callback(false);
        return;
      }

      // Auto-grant essential permissions on first request
      const autoGrantPermissions = [
        "media",
        "notifications",
        "fullscreen",
        "display-capture",
        "clipboard-read",
        "clipboard-write",
      ];

      const allowed = autoGrantPermissions.includes(permission);

      if (allowed && preferences.permissions[permissionKey] !== true) {
        const next = {
          ...preferences,
          permissions: {
            ...preferences.permissions,
            [permissionKey]: true,
          },
        };

        const saved = await savePreferences(next);
        if (saved) preferences = next;
      }
      callback(allowed);
    }
  );

  // Handle permission checks (for already granted permissions)
  win.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      const allowedPermissions = [
        "media",
        "notifications",
        "fullscreen",
        "display-capture",
        "clipboard-read",
        "clipboard-write",
        "geolocation",
      ];

      return allowedPermissions.includes(permission);
    }
  );

  // Handle USB device selection (for media devices)
  win.webContents.session.on(
    "select-usb-device",
    (event, details, callback) => {
      event.preventDefault();
      if (details.deviceList && details.deviceList.length > 0) {
        callback(details.deviceList[0].deviceId);
      } else {
        callback();
      }
    }
  );
}

module.exports = {
  requestSystemPermissions,
  setupPermissionHandlers,
};