/**
 * Widget UI Controller
 * Manages UI state, interactions, and audio playback
 */

class Widget {
  constructor() {
    this.audioRecorder = null;
    this.currentAudio = null;
    this.isRecording = false;
    this.isPaused = false;
    this.recordingStartTime = null;
    this.pausedDuration = 0;
    this.lastPauseTime = null;
    this.timerInterval = null;
    this.playbackTimers = new Map(); // Track playback timers for each recording
    this.recordings = [];
    this.microphones = [];
    this.selectedMicId = null;
    this.micDropdownOpen = false;

    this.initElements();
    this.attachEventListeners();
    this.loadRecordings();
    this.listMicrophones();
  }

  /**
   * Initialize DOM element references
   */
  initElements() {
    // Controls
    this.compactControls = document.getElementById("compact-controls");
    this.recordBtn = document.getElementById("record-btn");
    this.listBtn = document.getElementById("list-btn");

    // Error display
    this.errorDisplay = document.getElementById("error-display");
    this.errorMessage = document.getElementById("error-message");
    this.errorCloseBtn = document.getElementById("error-close-btn");

    // Recording panel
    this.recordingPanel = document.getElementById("recording-panel");
    this.pauseRecordingBtn = document.getElementById("pause-recording-btn");
    this.doneRecordingBtn = document.getElementById("done-recording-btn");
    this.cancelRecordingBtn = document.getElementById("cancel-recording-btn");
    this.micToggleBtn = document.getElementById("mic-toggle-btn");
    this.micSelector = document.getElementById("mic-selector");
    this.micList = document.getElementById("mic-list");
    this.recordingTime = document.getElementById("recording-time");
    this.chevronIcon = document.getElementById("chevron-icon");
    this.pauseIconSvg = this.pauseRecordingBtn.querySelector(".pause-icon-svg");
    this.playIconSvg = this.pauseRecordingBtn.querySelector(".play-icon-svg");

    // Recordings panel
    this.recordingsPanel = document.getElementById("recordings-panel");
    this.closeListBtn = document.getElementById("close-list-btn");
    this.recordingsList = document.getElementById("recordings-list");
    this.seeMoreBtn = document.getElementById("see-more-btn");

    // Initialize audio recorder
    this.audioRecorder = new AudioRecorder();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Record button - start recording
    this.recordBtn.addEventListener("click", () => this.handleRecordClick());

    // List button - show recordings
    this.listBtn.addEventListener("click", () => this.showRecordingsList());

    // Pause recording button
    this.pauseRecordingBtn.addEventListener("click", () => this.handlePause());

    // Done recording button
    this.doneRecordingBtn.addEventListener("click", () => this.handleDone());

    // Cancel recording button
    this.cancelRecordingBtn.addEventListener("click", () =>
      this.handleCancel(),
    );

    // Mic toggle button
    this.micToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMicDropdown();
    });

    // Close mic dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        this.micDropdownOpen &&
        !this.micSelector.contains(e.target) &&
        !this.micToggleBtn.contains(e.target)
      ) {
        this.toggleMicDropdown(false);
      }
    });

    // Close list button
    this.closeListBtn.addEventListener("click", () =>
      this.hideRecordingsList(),
    );

    // See more button
    this.seeMoreBtn.addEventListener("click", () =>
      this.openRecordingsFolder(),
    );

    // Error close button
    this.errorCloseBtn.addEventListener("click", () => this.hideError());

    // Cleanup on window unload
    window.addEventListener("beforeunload", () => this.cleanup());

    // Listen for recovery
    if (window.electronAPI.onRecoveryFound) {
      window.electronAPI.onRecoveryFound((recording) => {
        console.log("Recovered recording:", recording);
        this.loadRecordings();
        this.showError("Recovered interrupted recording");
        // Auto-hide after 3 seconds
        setTimeout(() => this.hideError(), 3000);
      });
    }
  }

  /**
   * Show error message in widget UI
   */
  showError(message) {
    this.errorMessage.textContent = message;
    this.errorDisplay.classList.remove("hidden");

    // Resize window if needed (unless list is open via list mode)
    if (this.recordingsPanel.classList.contains("hidden")) {
      window.electronAPI.resizeWindow("error");
    }
  }

  /**
   * Hide error message
   */
  hideError() {
    this.errorDisplay.classList.add("hidden");

    // Restore window size based on current state
    if (!this.recordingsPanel.classList.contains("hidden")) {
      // List is open, size is fine
    } else if (this.isRecording) {
      window.electronAPI.resizeWindow("recording");
    } else {
      window.electronAPI.resizeWindow("compact");
    }
  }

  /**
   * Handle record button click
   */
  async handleRecordClick() {
    try {
      // Refresh mic list if empty
      if (this.microphones.length === 0) {
        await this.listMicrophones();
      }

      // Initialize recorder
      await this.audioRecorder.init(null, this.selectedMicId);

      // Start recording
      await this.audioRecorder.start();

      // Notify backend
      const result = await window.electronAPI.startRecording();
      if (!result.success) {
        throw new Error(result.error);
      }

      // Update UI
      this.isRecording = true;
      this.isPaused = false;
      this.recordingStartTime = Date.now();
      this.pausedDuration = 0;
      this.lastPauseTime = null;
      this.showRecordingPanel();
      this.startTimer();

      // Reset pause button icon to show pause bars
      this.resetPauseButton();
    } catch (error) {
      console.error("Failed to start recording:", error);
      this.showError(error.message);
    }
  }

  /**
   * List available microphones
   */
  async listMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.microphones = devices.filter(
        (device) => device.kind === "audioinput",
      );

      // Select default if none selected
      if (!this.selectedMicId && this.microphones.length > 0) {
        // Try to find the default device or just pick the first one
        const defaultMic =
          this.microphones.find((m) => m.deviceId === "default") ||
          this.microphones[0];
        this.selectedMicId = defaultMic.deviceId;
      }

      this.populateMicList();
    } catch (error) {
      console.error("Error listing microphones:", error);
    }
  }

  /**
   * Populate the mic selector dropdown
   */
  populateMicList() {
    this.micList.innerHTML = "";

    this.microphones.forEach((mic) => {
      const option = document.createElement("button");
      option.className = `mic-option ${mic.deviceId === this.selectedMicId ? "selected" : ""}`;
      option.innerHTML = `
        <span class="mic-name-text">${mic.label || "Microphone " + (this.microphones.indexOf(mic) + 1)}</span>
        ${
          mic.deviceId === this.selectedMicId
            ? `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `
            : ""
        }
      `;

      option.onclick = () => this.selectMicrophone(mic.deviceId);
      this.micList.appendChild(option);
    });
  }

  /**
   * Toggle the mic selection dropdown
   */
  toggleMicDropdown(forceState) {
    this.micDropdownOpen =
      forceState !== undefined ? forceState : !this.micDropdownOpen;

    if (this.micDropdownOpen) {
      this.micSelector.classList.remove("hidden");
      this.chevronIcon.classList.add("rotate-180");
      this.populateMicList(); // Refresh list on open

      // Resize window for dropdown
      window.electronAPI.resizeWindow("recording-mic");
    } else {
      this.micSelector.classList.add("hidden");
      this.chevronIcon.classList.remove("rotate-180");

      // Return to normal recording size
      if (this.isRecording) {
        window.electronAPI.resizeWindow("recording");
      }
    }
  }

  /**
   * Select a microphone
   */
  async selectMicrophone(deviceId) {
    this.selectedMicId = deviceId;
    this.toggleMicDropdown(false);

    // If we are currently recording, we might want to restart the stream
    // but the user just asked for "mic select kr saku" so I'll keep it simple for now.
    // Switching during recording usually requires stopping the old stream and starting a new one.
    if (this.isRecording) {
      console.log(
        "Switching mic during recording not yet implemented (restarts needed)",
      );
      // For now, let's just update the internal selected mic for the next recording
    }

    console.log("Microphone selected:", deviceId);
  }

  /**
   * Reset pause button to initial pause icon state
   */
  resetPauseButton() {
    if (this.pauseIconSvg) this.pauseIconSvg.classList.remove("hidden");
    if (this.playIconSvg) this.playIconSvg.classList.add("hidden");
  }

  /**
   * Handle pause button
   */
  handlePause() {
    if (this.isPaused) {
      // Resume
      this.audioRecorder.resume();
      this.isPaused = false;

      // Calculate pause duration
      if (this.lastPauseTime) {
        const pauseDuration = Date.now() - this.lastPauseTime;
        this.pausedDuration += pauseDuration;
        this.lastPauseTime = null;
      }

      this.startTimer(); // Resume timer
      this.resetPauseButton();
    } else {
      // Pause
      this.audioRecorder.pause();
      this.isPaused = true;
      this.lastPauseTime = Date.now();
      this.stopTimer(); // Stop timer when paused

      // Toggle icons
      if (this.pauseIconSvg) this.pauseIconSvg.classList.add("hidden");
      if (this.playIconSvg) this.playIconSvg.classList.remove("hidden");
    }
  }

  /**
   * Handle cancel button
   */
  async handleCancel() {
    try {
      // Stop/Cancel audio recorder
      this.audioRecorder.cancel();

      // Notify backend to discard
      const result = await window.electronAPI.cancelRecording();
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log("Recording cancelled and discarded");

      // Reset UI
      this.stopTimer();
      this.hideRecordingPanel();
      this.isRecording = false;
      this.isPaused = false;
      this.recordingStartTime = null;
      this.pausedDuration = 0;
      this.lastPauseTime = null;
    } catch (error) {
      console.error("Failed to cancel recording:", error);
      this.showError(`Failed to cancel: ${error.message}`);
    }
  }

  /**
   * Handle done button - stop and save recording
   */
  async handleDone() {
    try {
      const duration = Math.floor(
        (Date.now() - this.recordingStartTime - this.pausedDuration) / 1000,
      );

      // Stop audio recorder
      await this.audioRecorder.stop();

      // Notify backend to finalize
      const result = await window.electronAPI.stopRecording(duration);
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log("Recording saved:", result.fileName);

      // Reset UI
      this.stopTimer();
      this.hideRecordingPanel();
      this.isRecording = false;
      this.isPaused = false;
      this.recordingStartTime = null;
      this.pausedDuration = 0;
      this.lastPauseTime = null;

      // Reload recordings list
      await this.loadRecordings();
    } catch (error) {
      console.error("Failed to save recording:", error);
      this.showError(`Failed to save: ${error.message}`);
    }
  }

  /**
   * Show recording panel with waveform
   */
  showRecordingPanel() {
    // Resize window FIRST
    window.electronAPI.resizeWindow("recording");

    // Show panel immediately - CSS transition (0.3s) handles the fade in
    this.compactControls.classList.add("hidden");
    this.recordingPanel.classList.remove("hidden");
  }

  /**
   * Hide recording panel
   */
  hideRecordingPanel() {
    // Hide panels FIRST (Trigger CSS fade out)
    this.recordingPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");

    // Wait for transition to almost complete (250ms) before resizing
    // CSS transition is 300ms, so this resize happens just as it fades out
    setTimeout(() => {
      window.electronAPI.resizeWindow("compact");
    }, 300);
  }

  /**
   * Start recording timer
   */
  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - this.recordingStartTime - this.pausedDuration) / 1000,
      );
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      this.recordingTime.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }, 1000);
  }

  /**
   * Stop timer
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Show recordings list panel
   */
  async showRecordingsList() {
    await this.loadRecordings();

    // Resize window FIRST
    window.electronAPI.resizeWindow("list");

    // Show immediately
    this.compactControls.classList.add("hidden");
    this.recordingsPanel.classList.remove("hidden");
  }

  /**
   * Hide recordings list panel
   */
  hideRecordingsList() {
    // Hide panels FIRST
    this.recordingsPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");

    // Stop any playing audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.clearPlaybackTimers();
    }

    // Wait for transition to almost complete (250ms) before resizing
    setTimeout(() => {
      window.electronAPI.resizeWindow("compact");
    }, 300);
  }

  /**
   * Load recordings from backend
   */
  async loadRecordings() {
    try {
      const result = await window.electronAPI.getRecordings();
      if (result.success) {
        this.recordings = result.recordings;
        this.renderRecordings();
      }
    } catch (error) {
      console.error("Failed to load recordings:", error);
    }
  }

  /**
   * Render recordings list (max 3 recent)
   */
  renderRecordings() {
    this.recordingsList.innerHTML = "";

    if (this.recordings.length === 0) {
      this.recordingsList.innerHTML =
        '<div class="empty-state">no recordings yet</div>';
      this.seeMoreBtn.style.display = "none";
      return;
    }

    // Show only 3 most recent recordings
    const recentRecordings = this.recordings.slice(-3).reverse();

    recentRecordings.forEach((recording) => {
      const item = this.createRecordingItem(recording);
      this.recordingsList.appendChild(item);
    });

    // Show "See More" button if there are more than 3 recordings
    this.seeMoreBtn.style.display =
      this.recordings.length > 3 ? "block" : "none";
  }

  /**
   * Create recording item element
   */
  createRecordingItem(recording) {
    const item = document.createElement("div");
    item.className = "recording-item";

    // Format date
    const date = new Date(recording.createdAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Format duration
    const totalMinutes = Math.floor(recording.duration / 60);
    const totalSeconds = recording.duration % 60;
    const totalFormatted = `${totalMinutes}:${String(totalSeconds).padStart(2, "0")}`;

    item.innerHTML = `
      <div class="recording-header">
        <div class="recording-name">${recording.fileName}</div>
      </div>
      <div class="recording-controls">
          <button class="play-btn" data-path="${recording.filePath}" data-id="${recording.id}">
            <div class="play-icon"></div>
          </button>
          <div class="recording-duration" data-id="${recording.id}">0:00 / ${totalFormatted}</div>
        <div class="recording-date">${formattedDate}</div>
      </div>
    `;

    // Attach play button listener
    const playBtn = item.querySelector(".play-btn");
    const durationEl = item.querySelector(".recording-duration");
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePlayback(recording, playBtn, durationEl);
    });

    return item;
  }

  /**
   * Format time in M:SS format
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  /**
   * Clear all playback timers
   */
  clearPlaybackTimers() {
    this.playbackTimers.forEach((timer) => clearInterval(timer));
    this.playbackTimers.clear();
  }

  /**
   * Toggle audio playback
   */
  togglePlayback(recording, button, durationEl) {
    const filePath = recording.filePath;
    const recordingId = recording.id;

    // If playing this file, pause it
    if (
      this.currentAudio &&
      !this.currentAudio.paused &&
      this.currentAudio.src.includes(filePath)
    ) {
      this.currentAudio.pause();
      button.innerHTML = '<div class="play-icon"></div>';

      // Clear the timer for this recording
      if (this.playbackTimers.has(recordingId)) {
        clearInterval(this.playbackTimers.get(recordingId));
        this.playbackTimers.delete(recordingId);
      }
      return;
    }

    // Stop any currently playing audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.clearPlaybackTimers();

      // Reset all play buttons and durations
      document.querySelectorAll(".play-btn").forEach((btn) => {
        btn.innerHTML = '<div class="play-icon"></div>';
      });
      document.querySelectorAll(".recording-duration").forEach((el) => {
        const id = el.getAttribute("data-id");
        const rec = this.recordings.find((r) => r.id === id);
        if (rec) {
          const totalMin = Math.floor(rec.duration / 60);
          const totalSec = rec.duration % 60;
          el.textContent = `0:00 / ${totalMin}:${String(totalSec).padStart(2, "0")}`;
        }
      });
    }

    // Create and play new audio
    this.currentAudio = new Audio(`file://${filePath}`);

    // Update button to pause icon
    button.innerHTML =
      '<div class="pause-icon"><span></span><span></span></div>';

    // Update playback progress
    const updateProgress = () => {
      if (this.currentAudio && !this.currentAudio.paused) {
        const current = this.formatTime(this.currentAudio.currentTime);
        const total = this.formatTime(recording.duration);
        durationEl.textContent = `${current} / ${total}`;
      }
    };

    // Set up interval to update progress
    const timer = setInterval(updateProgress, 100);
    this.playbackTimers.set(recordingId, timer);

    // Reset button when audio ends
    this.currentAudio.onended = () => {
      button.innerHTML = '<div class="play-icon"></div>';
      const total = this.formatTime(recording.duration);
      durationEl.textContent = `0:00 / ${total}`;

      if (this.playbackTimers.has(recordingId)) {
        clearInterval(this.playbackTimers.get(recordingId));
        this.playbackTimers.delete(recordingId);
      }
    };

    // Handle errors
    this.currentAudio.onerror = (error) => {
      console.error("Audio playback error:", error);
      this.showError("Failed to play recording");
      button.innerHTML = '<div class="play-icon"></div>';

      if (this.playbackTimers.has(recordingId)) {
        clearInterval(this.playbackTimers.get(recordingId));
        this.playbackTimers.delete(recordingId);
      }
    };

    this.currentAudio.play().catch((error) => {
      console.error("Play failed:", error);
      this.showError("Failed to play recording");
      button.innerHTML = '<div class="play-icon"></div>';
    });
  }

  /**
   * Open recordings folder in file manager
   */
  async openRecordingsFolder() {
    try {
      await window.electronAPI.openRecordingsFolder();
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
      this.showError("Failed to open recordings folder");
    }
  }

  /**
   * Cleanup resources on close
   */
  cleanup() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    this.clearPlaybackTimers();

    if (this.audioRecorder) {
      this.audioRecorder.cleanup();
    }

    this.stopTimer();
  }
}

// Initialize widget when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const widget = new Widget();
  console.log("Widget initialized");
});
