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
    this.timerInterval = null;
    this.playbackTimers = new Map(); // Track playback timers for each recording
    this.recordings = [];

    this.initElements();
    this.attachEventListeners();
    this.loadRecordings();
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
    this.waveformCanvas = document.getElementById("waveform-canvas");
    this.recordingTime = document.getElementById("recording-time");

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
  }

  /**
   * Show error message in widget UI
   */
  showError(message) {
    this.errorMessage.textContent = message;
    this.errorDisplay.classList.remove("hidden");
  }

  /**
   * Hide error message
   */
  hideError() {
    this.errorDisplay.classList.add("hidden");
  }

  /**
   * Handle record button click
   */
  async handleRecordClick() {
    try {
      // Initialize recorder with canvas
      await this.audioRecorder.init(this.waveformCanvas);

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
      this.showRecordingPanel();
      this.startTimer();
    } catch (error) {
      console.error("Failed to start recording:", error);
      this.showError(error.message);
    }
  }

  /**
   * Handle pause button
   */
  handlePause() {
    if (this.isPaused) {
      // Resume
      this.audioRecorder.resume();
      this.isPaused = false;
      this.pauseRecordingBtn.querySelector(".pause-icon").innerHTML = `
        <span></span>
        <span></span>
      `;
    } else {
      // Pause
      this.audioRecorder.pause();
      this.isPaused = true;
      // Change to play icon when paused
      this.pauseRecordingBtn.querySelector(".pause-icon").innerHTML = ``;
      this.pauseRecordingBtn.querySelector(".pause-icon").style.cssText = `
        width: 0;
        height: 0;
        border-left: 10px solid #ffc107;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        margin-left: 3px;
      `;
    }
  }

  /**
   * Handle done button - stop and save recording
   */
  async handleDone() {
    try {
      const duration = Math.floor(
        (Date.now() - this.recordingStartTime) / 1000,
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
    this.compactControls.classList.add("hidden");
    this.recordingPanel.classList.remove("hidden");

    // Set canvas size
    this.waveformCanvas.width = 180;
    this.waveformCanvas.height = 32;
  }

  /**
   * Hide recording panel
   */
  hideRecordingPanel() {
    this.recordingPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");
  }

  /**
   * Start recording timer
   */
  startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
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
    this.compactControls.classList.add("hidden");
    this.recordingsPanel.classList.remove("hidden");
  }

  /**
   * Hide recordings list panel
   */
  hideRecordingsList() {
    this.recordingsPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");

    // Stop any playing audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.clearPlaybackTimers();
    }
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
        <div class="recording-date">${formattedDate}</div>
      </div>
      <div class="recording-controls">
        <button class="play-btn" data-path="${recording.filePath}" data-id="${recording.id}">
          <div class="play-icon"></div>
        </button>
        <div class="recording-duration" data-id="${recording.id}">0:00 / ${totalFormatted}</div>
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
