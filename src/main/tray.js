const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");
const {
  showWidget,
  hideWidget,
  isWidgetVisible,
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

  tray = new Tray(iconPath);
  tray.setToolTip("Audio Recorder Widget");

  // Build context menu
  updateTrayMenu();

  tray.on("click", () => {
    updateTrayMenu();
  });

  return tray;
}

/**
 * Update the tray context menu
 */
function updateTrayMenu() {
  const widgetVisible = isWidgetVisible();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: widgetVisible ? "Hide Widget" : "Show Widget",
      click: () => {
        if (isWidgetVisible()) {
          hideWidget();
        } else {
          showWidget();
        }

        // To referesh the menu call again
        updateTrayMenu();
      },
    },
    // {
    //   label: isRecording ? "Recording..." : "Start Recording",
    //   enabled: !isRecording,
    //   click: () => {
    //     showWidget();
    //     // Trigger recording start via widget
    //   },
    // },
    // { type: "separator" },
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
    if (recording) {
      tray.setToolTip("Recording in progress...");
    } else {
      tray.setToolTip("Floating Meeting Widget");
    }
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
