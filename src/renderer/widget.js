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
    this.playbackTimers = new Map();
    this.recordings = [];
    this.microphones = [];
    this.selectedMicId = null;
    this.micDropdownOpen = false;

    // Device monitoring
    this.deviceChangeInterval = null;
    this.currentRecordingMicId = null;
    this.micMonitorInterval = null;

    // Track if mic is unavailable (for resume attempts)
    this.micUnavailable = false;

    this.initElements();
    this.attachEventListeners();
    this.loadRecordings();
    this.listMicrophones();
    this.setupDeviceChangeMonitoring();
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
        this.loadRecordings();
        this.showError("Recovered interrupted recording");
        setTimeout(() => this.hideError(), 3000);
      });
    }
  }

  /**
   * Setup device change monitoring
   * Monitors for microphone connections/disconnections
   */
  setupDeviceChangeMonitoring() {
    // Listen for device changes
    navigator.mediaDevices.addEventListener("devicechange", async () => {
      await this.handleDeviceChange();
    });
  }

  /**
   * Handle device change events
   */
  async handleDeviceChange() {
    const previousMics = [...this.microphones];
    await this.listMicrophones();

    // If dropdown is open, update it in real-time
    if (this.micDropdownOpen) {
      this.populateMicList();
    }

    // If recording, check if current mic is still available
    if (
      this.isRecording &&
      this.currentRecordingMicId &&
      !this.micUnavailable
    ) {
      const currentMicStillExists = this.microphones.some(
        (mic) => mic.deviceId === this.currentRecordingMicId,
      );

      if (!currentMicStillExists) {
        await this.handleMicDisconnectDuringRecording();
      }
    }
  }

  /**
   * Handle microphone disconnection during recording
   */
  async handleMicDisconnectDuringRecording() {
    // Try to find and switch to an available working microphone
    const workingMic = await this.findWorkingMicrophone();

    if (workingMic) {
      // Switch to the working microphone
      try {
        await this.switchMicrophoneDuringRecording(workingMic.deviceId);
        this.showError(
          `Mic disconnected. Switched to ${workingMic.label || "default mic"}`,
        );
        setTimeout(() => this.hideError(), 3000);
      } catch (error) {
        console.error("Failed to switch microphone:", error);
        await this.pauseRecordingDueToMicIssue("Failed to switch microphone");
      }
    } else {
      // No working microphone available - pause recording
      await this.pauseRecordingDueToMicIssue(
        "No microphone available. Please connect a mic to continue",
      );
    }
  }

  /**
   * Find a working microphone from available devices
   */
  async findWorkingMicrophone() {
    // Refresh microphone list
    await this.listMicrophones();

    if (this.microphones.length === 0) {
      return null;
    }

    // Try to find default mic first
    const defaultMic = this.microphones.find((m) => m.deviceId === "default");
    if (defaultMic) {
      const isWorking = await this.testMicrophone(defaultMic.deviceId);
      if (isWorking) {
        return defaultMic;
      }
    }

    // Test each microphone to find a working one
    for (const mic of this.microphones) {
      if (mic.deviceId === "default") continue; // Already tested

      const isWorking = await this.testMicrophone(mic.deviceId);
      if (isWorking) {
        return mic;
      }
    }

    return null;
  }

  /**
   * Test if a microphone is working
   */
  async testMicrophone(deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          sampleRate: 8000,
          channelCount: 1,
        },
      });

      // Check if we're actually getting audio
      const audioTracks = stream.getAudioTracks();
      const hasAudio =
        audioTracks.length > 0 && audioTracks[0].readyState === "live";

      // Stop the test stream
      stream.getTracks().forEach((track) => track.stop());

      return hasAudio;
    } catch (error) {
      console.error(`Microphone test failed for device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Switch microphone during active recording
   */
  async switchMicrophoneDuringRecording(newDeviceId) {
    // Update the recorder with new mic
    await this.audioRecorder.switchMicrophone(newDeviceId);

    // Update current recording mic ID
    this.currentRecordingMicId = newDeviceId;
    this.selectedMicId = newDeviceId;

    // Update UI if dropdown is open
    if (this.micDropdownOpen) {
      this.populateMicList();
    }
  }

  /**
   * Pause recording due to microphone issues
   */
  async pauseRecordingDueToMicIssue(message) {
    // If already in mic unavailable state, don't repeat the process
    if (this.micUnavailable) {
      return;
    }

    // Pause the recording if not already paused
    if (!this.isPaused) {
      this.audioRecorder.pause();
      this.isPaused = true;
      this.lastPauseTime = Date.now();
      this.stopTimer();

      // Toggle icons to show play state
      if (this.pauseIconSvg) this.pauseIconSvg.classList.add("hidden");
      if (this.playIconSvg) this.playIconSvg.classList.remove("hidden");
    }

    // Mark that we're in a "mic unavailable" state
    this.micUnavailable = true;

    // Show error message (only once)
    this.showError(message);
  }

  /**
   * Enable recording controls when mic becomes available
   */
  enableRecordingControls() {
    this.micUnavailable = false;
    this.pauseRecordingBtn.disabled = false;
    this.doneRecordingBtn.disabled = false;
    this.pauseRecordingBtn.style.opacity = "1";
    this.doneRecordingBtn.style.opacity = "1";
  }

  /**
   * Show error message in widget UI
   */
  showError(message) {
    this.errorMessage.textContent = message;
    this.errorDisplay.classList.remove("hidden");

    if (
      this.recordingsPanel.classList.contains("hidden") &&
      this.micSelector.classList.contains("hidden")
    ) {
      window.electronAPI.resizeWindow("error");
    }
  }

  /**
   * Hide error message
   */
  hideError() {
    this.errorDisplay.classList.add("hidden");

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
      // Refresh mic list
      await this.listMicrophones();

      // Check if any microphones are available
      if (this.microphones.length === 0) {
        this.showError(
          "No microphone detected. Please connect a mic and try again.",
        );
        return;
      }

      // Test if selected microphone is working
      const micToUse = this.selectedMicId || this.microphones[0].deviceId;
      const isWorking = await this.testMicrophone(micToUse);

      if (!isWorking) {
        // Try to find any working microphone
        const workingMic = await this.findWorkingMicrophone();

        if (!workingMic) {
          this.showError(
            "No working microphone found. Please check your audio settings.",
          );
          return;
        }

        // Use the working mic
        this.selectedMicId = workingMic.deviceId;
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
      this.currentRecordingMicId = this.selectedMicId;
      this.micUnavailable = false;

      this.showRecordingPanel();
      this.startTimer();
      this.resetPauseButton();
      this.enableRecordingControls();

      // Start monitoring for mic changes during recording
      this.startMicMonitoring();
    } catch (error) {
      console.error("Failed to start recording:", error);
      this.showError(error.message);
    }
  }

  /**
   * Start monitoring microphone during recording
   */
  startMicMonitoring() {
    // Check mic status every 2 seconds during recording
    this.micMonitorInterval = setInterval(async () => {
      if (!this.isRecording) {
        this.stopMicMonitoring();
        return;
      }

      // Refresh the microphones list to get current state
      await this.listMicrophones();

      if (this.micUnavailable) {
        // We're in mic unavailable state, check if a mic becomes available
        const workingMic = await this.findWorkingMicrophone();
        if (workingMic) {
          // Don't auto-resume, just enable controls so user can resume manually
          // This gives user control over when to continue
          this.enableRecordingControls();
          this.hideError();
        }
      } else {
        // We have a mic, check if it's still available
        const micExists = this.microphones.some(
          (mic) => mic.deviceId === this.currentRecordingMicId,
        );

        if (!micExists) {
          await this.handleMicDisconnectDuringRecording();
        }
      }
    }, 2000);
  }

  /**
   * Stop monitoring microphone
   */
  stopMicMonitoring() {
    if (this.micMonitorInterval) {
      clearInterval(this.micMonitorInterval);
      this.micMonitorInterval = null;
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

    if (this.microphones.length === 0) {
      this.micList.innerHTML =
        '<div style="padding: 12px; text-align: center; color: #888;">No microphones available</div>';
      return;
    }

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

      // Refresh list when opening
      this.listMicrophones();

      // Resize window for dropdown
      window.electronAPI.resizeWindow("recording-mic");

      // Start real-time device monitoring while dropdown is open
      this.startDropdownDeviceMonitoring();
    } else {
      this.micSelector.classList.add("hidden");
      this.chevronIcon.classList.remove("rotate-180");

      // Stop device monitoring
      this.stopDropdownDeviceMonitoring();

      // Return to normal recording size
      if (this.isRecording) {
        window.electronAPI.resizeWindow("recording");
      }
    }
  }

  /**
   * Start real-time device monitoring for dropdown
   */
  startDropdownDeviceMonitoring() {
    // Already handled by global devicechange listener
    // but we could add additional polling here if needed
  }

  /**
   * Stop dropdown device monitoring
   */
  stopDropdownDeviceMonitoring() {
    // Cleanup if needed
  }

  /**
   * Select a microphone
   */
  async selectMicrophone(deviceId) {
    this.selectedMicId = deviceId;
    this.toggleMicDropdown(false);

    // If recording, try to switch microphone
    if (this.isRecording && deviceId !== this.currentRecordingMicId) {
      try {
        // Test if the new mic works
        const isWorking = await this.testMicrophone(deviceId);

        if (!isWorking) {
          this.showError("Selected microphone is not working");
          setTimeout(() => this.hideError(), 3000);
          return;
        }

        await this.switchMicrophoneDuringRecording(deviceId);

        // If we were in mic unavailable state, enable controls now
        if (this.micUnavailable) {
          this.enableRecordingControls();
          this.hideError();
        }
      } catch (error) {
        console.error("Failed to switch microphone:", error);
        this.showError("Failed to switch microphone");
        setTimeout(() => this.hideError(), 3000);
      }
    }
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
  async handlePause() {
    if (this.isPaused) {
      // Attempting to resume

      // Check if we're in a mic unavailable state
      if (this.micUnavailable) {
        // Try to find a working microphone
        const workingMic = await this.findWorkingMicrophone();

        if (workingMic) {
          try {
            await this.switchMicrophoneDuringRecording(workingMic.deviceId);
            this.enableRecordingControls();
            this.hideError();
          } catch (error) {
            console.error("Failed to switch to working mic:", error);
            // Still no mic available, show error again
            this.showError(
              "No microphone available. Please connect a mic to continue",
            );
            return;
          }
        } else {
          // Still no mic available, show error again
          this.showError(
            "No microphone available. Please connect a mic to continue",
          );
          return;
        }
      }

      // Resume recording
      this.audioRecorder.resume();
      this.isPaused = false;

      // Calculate pause duration
      if (this.lastPauseTime) {
        const pauseDuration = Date.now() - this.lastPauseTime;
        this.pausedDuration += pauseDuration;
        this.lastPauseTime = null;
      }

      this.startTimer();
      this.resetPauseButton();
    } else {
      // Pause recording (normal user-initiated pause)
      this.audioRecorder.pause();
      this.isPaused = true;
      this.lastPauseTime = Date.now();
      this.stopTimer();

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
      // Stop mic monitoring
      this.stopMicMonitoring();

      // Stop/Cancel audio recorder
      this.audioRecorder.cancel();

      // Notify backend to discard
      const result = await window.electronAPI.cancelRecording();
      if (!result.success) {
        throw new Error(result.error);
      }

      // Reset UI
      this.stopTimer();
      this.hideRecordingPanel();
      this.isRecording = false;
      this.isPaused = false;
      this.recordingStartTime = null;
      this.pausedDuration = 0;
      this.lastPauseTime = null;
      this.currentRecordingMicId = null;
      this.micUnavailable = false;
      this.enableRecordingControls();
      this.hideError();
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
      // Stop mic monitoring
      this.stopMicMonitoring();

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

      // Reset UI
      this.stopTimer();
      this.hideRecordingPanel();
      this.isRecording = false;
      this.isPaused = false;
      this.recordingStartTime = null;
      this.pausedDuration = 0;
      this.lastPauseTime = null;
      this.currentRecordingMicId = null;
      this.micUnavailable = false;
      this.enableRecordingControls();
      this.hideError();

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
    window.electronAPI.resizeWindow("recording");
    this.compactControls.classList.add("hidden");
    this.recordingPanel.classList.remove("hidden");
  }

  /**
   * Hide recording panel
   */
  hideRecordingPanel() {
    this.recordingPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");

    setTimeout(() => {
      window.electronAPI.resizeWindow("compact");
    }, 250);
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
    window.electronAPI.resizeWindow("list");
    this.compactControls.classList.add("hidden");
    this.recordingsPanel.classList.remove("hidden");
  }

  /**
   * Hide recordings list panel
   */
  hideRecordingsList() {
    this.recordingsPanel.classList.add("hidden");
    this.compactControls.classList.remove("hidden");

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.clearPlaybackTimers();
    }

    setTimeout(() => {
      window.electronAPI.resizeWindow("compact");
    }, 250);
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

    const recentRecordings = this.recordings.slice(-3).reverse();

    recentRecordings.forEach((recording) => {
      const item = this.createRecordingItem(recording);
      this.recordingsList.appendChild(item);
    });

    this.seeMoreBtn.style.display =
      this.recordings.length > 3 ? "block" : "none";
  }

  /**
   * Create recording item element
   */
  createRecordingItem(recording) {
    const item = document.createElement("div");
    item.className = "recording-item";

    const date = new Date(recording.createdAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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

    if (
      this.currentAudio &&
      !this.currentAudio.paused &&
      this.currentAudio.src.includes(filePath)
    ) {
      this.currentAudio.pause();
      button.innerHTML = '<div class="play-icon"></div>';

      if (this.playbackTimers.has(recordingId)) {
        clearInterval(this.playbackTimers.get(recordingId));
        this.playbackTimers.delete(recordingId);
      }
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.clearPlaybackTimers();

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

    this.currentAudio = new Audio(`file://${filePath}`);
    button.innerHTML =
      '<div class="pause-icon"><span></span><span></span></div>';

    const updateProgress = () => {
      if (this.currentAudio && !this.currentAudio.paused) {
        const current = this.formatTime(this.currentAudio.currentTime);
        const total = this.formatTime(recording.duration);
        durationEl.textContent = `${current} / ${total}`;
      }
    };

    const timer = setInterval(updateProgress, 100);
    this.playbackTimers.set(recordingId, timer);

    this.currentAudio.onended = () => {
      button.innerHTML = '<div class="play-icon"></div>';
      const total = this.formatTime(recording.duration);
      durationEl.textContent = `0:00 / ${total}`;

      if (this.playbackTimers.has(recordingId)) {
        clearInterval(this.playbackTimers.get(recordingId));
        this.playbackTimers.delete(recordingId);
      }
    };

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
    this.stopMicMonitoring();
    this.stopDropdownDeviceMonitoring();

    if (this.audioRecorder) {
      this.audioRecorder.cleanup();
    }

    this.stopTimer();
  }
}

// Initialize widget when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const widget = new Widget();
  // Expose widget globally so audio recorder can notify it
  window.widget = widget;
});
