const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");
const {
  showWidget,
  hideWidget,
  toggleWidget,
  destroyWidget,
} = require("./widget-window");

let tray = null;
let isRecording = false;

/**
 * Create the system tray icon
 */
function createTray() {
  // Create tray icon (use a simple red circle for now, we'll create proper icons later)
  const iconPath = path.join(__dirname, "../../assets/tray-icon.png");

  // Create a default icon if file doesn't exist
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultIcon();
    }
  } catch (e) {
    trayIcon = createDefaultIcon();
  }

  // Resize for tray (16x16 on most platforms)
  trayIcon = trayIcon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip("Floating Meeting Widget");

  // Build context menu
  updateTrayMenu();

  // Click to toggle widget
  tray.on("click", () => {
    toggleWidget();
  });

  return tray;
}

/**
 * Create a default icon programmatically
 */
function createDefaultIcon() {
  // Create a simple 32x32 icon with a microphone symbol
  const size = 32;
  const canvas = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#4A90A4"/>
      <rect x="12" y="8" width="8" height="12" rx="4" fill="white"/>
      <rect x="14" y="20" width="4" height="4" fill="white"/>
      <rect x="10" y="24" width="12" height="2" rx="1" fill="white"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(canvas).toString("base64")}`,
  );
}

/**
 * Create recording indicator icon
 */
function createRecordingIcon() {
  const size = 32;
  const canvas = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#E74C3C"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(canvas).toString("base64")}`,
  );
}

/**
 * Update the tray context menu
 */
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Widget",
      click: () => showWidget(),
    },
    {
      label: isRecording ? "Recording..." : "Start Recording",
      enabled: !isRecording,
      click: () => {
        showWidget();
        // Trigger recording start via widget
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        destroyWidget();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Update tray to show recording state
 */
function setRecordingState(recording) {
  isRecording = recording;

  if (tray) {
    let icon;
    if (recording) {
      icon = createRecordingIcon();
      tray.setToolTip("Recording in progress...");
    } else {
      icon = createDefaultIcon();
      tray.setToolTip("Floating Meeting Widget");
    }

    icon = icon.resize({ width: 16, height: 16 });
    tray.setImage(icon);
    updateTrayMenu();
  }
}

/**
 * Get the tray instance
 */
function getTray() {
  return tray;
}

module.exports = {
  createTray,
  getTray,
  setRecordingState,
  updateTrayMenu,
};
