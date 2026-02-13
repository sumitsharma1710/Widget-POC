/**
 * Audio Recorder Module
 * Handles microphone capture, encoding, and waveform visualization
 */

class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
    this.isPaused = false;

    // Waveform visualization
    this.canvas = null;
    this.canvasCtx = null;
    this.animationId = null;

    // Chunk saving interval
    this.saveInterval = null;
    this.SAVE_INTERVAL_MS = 5000; // Save every 5 seconds

    this.selectedDeviceId = null;
    this.currentMimeType = null;
  }

  /**
   * Initialize the audio recorder
   * @param {HTMLCanvasElement} canvas - Canvas element for waveform
   * @param {string} deviceId - Microphone device ID
   */
  async init(canvas, deviceId = null) {
    this.canvas = canvas;
    if (this.canvas) {
      this.canvasCtx = canvas.getContext("2d");
    }
    this.selectedDeviceId = deviceId;

    // Request microphone access
    try {
      // Check if any audio input devices exist
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput",
      );
      console.log("Available audio inputs:", audioInputs);

      if (audioInputs.length === 0) {
        console.warn("No audio input devices found!");
        throw new Error(
          "No microphone detected on your system. Please check your audio settings.",
        );
      }

      // Try with advanced constraints first
      console.log(
        "Requesting microphone access with advanced constraints...",
        this.selectedDeviceId,
      );
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      if (this.selectedDeviceId) {
        constraints.audio.deviceId = { exact: this.selectedDeviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Microphone access granted");
      return true;
    } catch (error) {
      console.warn(
        "Advanced constraints failed, retrying with basic constraints...",
        error,
      );

      try {
        // Fallback to basic constraints
        const basicConstraints = { audio: true };
        if (this.selectedDeviceId) {
          basicConstraints.audio = {
            deviceId: { exact: this.selectedDeviceId },
          };
        }
        this.stream =
          await navigator.mediaDevices.getUserMedia(basicConstraints);
        console.log("Microphone access granted with basic constraints");
        return true;
      } catch (fallbackError) {
        console.error("Microphone access denied:", fallbackError);

        let errorMessage = "Microphone access is required to record.";

        if (
          fallbackError.name === "NotFoundError" ||
          fallbackError.message.includes("device not found")
        ) {
          errorMessage =
            "No microphone detected on your system. Please check you have a microphone connected.";
        } else if (
          fallbackError.name === "NotAllowedError" ||
          fallbackError.name === "PermissionDeniedError"
        ) {
          errorMessage =
            "Microphone permission was denied. Please grant permission and try again.";
        } else if (audioInputs && audioInputs.length === 0) {
          errorMessage = "No microphone drivers found on the system.";
        }

        throw new Error(errorMessage);
      }
    }
  }

  /**
   * Switch to a different microphone during active recording
   * @param {string} newDeviceId - New microphone device ID
   */
  async switchMicrophone(newDeviceId) {
    if (!this.isRecording) {
      console.log("Not currently recording, nothing to switch");
      return;
    }

    console.log("Switching microphone to:", newDeviceId);

    const wasRecording =
      this.mediaRecorder && this.mediaRecorder.state === "recording";
    const wasPaused = this.isPaused;

    try {
      // Save current chunks before switching
      if (this.chunks.length > 0) {
        await this.saveCurrentChunks();
      }

      // Stop current stream
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }

      // Get new stream with new microphone
      const constraints = {
        audio: {
          deviceId: { exact: newDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.selectedDeviceId = newDeviceId;

      // Reconnect audio context and analyser
      if (this.audioContext) {
        const source = this.audioContext.createMediaStreamSource(this.stream);
        if (this.analyser) {
          source.connect(this.analyser);
        }
      }

      // Recreate MediaRecorder with new stream
      if (this.mediaRecorder) {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: this.currentMimeType,
          audioBitsPerSecond: 128000,
        });

        // Reattach event handlers
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.chunks.push(event.data);
          }
        };

        // Restart recording
        if (wasRecording && !wasPaused) {
          this.mediaRecorder.start(1000);
          console.log("Recording restarted with new microphone");
        } else if (wasPaused) {
          this.mediaRecorder.start(1000);
          this.mediaRecorder.pause();
          console.log("Recording switched (paused state maintained)");
        }
      }

      console.log("Microphone switched successfully");
    } catch (error) {
      console.error("Failed to switch microphone:", error);
      throw new Error(`Failed to switch microphone: ${error.message}`);
    }
  }

  /**
   * Start recording
   */
  async start() {
    if (!this.stream) {
      await this.init(this.canvas, this.selectedDeviceId);
    }

    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    // Connect stream to analyser
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // Determine best supported MIME type
    const mimeType = this.getSupportedMimeType();
    this.currentMimeType = mimeType;
    console.log("Using MIME type:", mimeType);

    try {
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000,
      });

      this.chunks = [];

      // Handle data available
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      // Start recording with timeslice for regular data availability
      this.mediaRecorder.start(1000); // Get data every second
      this.isRecording = true;
      this.isPaused = false;

      // Start waveform visualization
      this.drawWaveform();

      // Setup periodic chunk saving
      this.startChunkSaving();

      console.log("Recording started");
    } catch (e) {
      console.error("MediaRecorder error:", e);
      throw new Error(`MediaRecorder failed: ${e.message}`);
    }
  }

  /**
   * Get best supported MIME type
   */
  getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/wav",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "audio/webm"; // Fallback
  }

  /**
   * Start periodic chunk saving
   */
  startChunkSaving() {
    this.saveInterval = setInterval(async () => {
      if (this.chunks.length > 0 && !this.isPaused) {
        await this.saveCurrentChunks();
      }
    }, this.SAVE_INTERVAL_MS);
  }

  /**
   * Save current chunks to disk
   */
  async saveCurrentChunks() {
    if (this.chunks.length === 0) return;

    // Combine current chunks
    const blob = new Blob(this.chunks, {
      type: this.currentMimeType || this.mediaRecorder.mimeType,
    });
    const arrayBuffer = await blob.arrayBuffer();

    // Send to main process
    try {
      await window.electronAPI.saveChunk(
        arrayBuffer,
        this.currentMimeType || this.mediaRecorder.mimeType,
      );
      console.log("Chunk saved:", blob.size, "bytes");

      // Clear saved chunks
      this.chunks = [];
    } catch (error) {
      console.error("Failed to save chunk:", error);
    }
  }

  /**
   * Pause recording
   */
  pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
      this.isPaused = true;
      cancelAnimationFrame(this.animationId);
      console.log("Recording paused");
    }
  }

  /**
   * Resume recording
   */
  resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.drawWaveform();
      console.log("Recording resumed");
    }
  }

  /**
   * Stop recording and return the final blob
   */
  async stop() {
    return new Promise(async (resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      // Stop periodic saving
      if (this.saveInterval) {
        clearInterval(this.saveInterval);
        this.saveInterval = null;
      }

      // Stop visualization
      cancelAnimationFrame(this.animationId);

      this.mediaRecorder.onstop = async () => {
        // Save any remaining chunks
        await this.saveCurrentChunks();

        this.isRecording = false;
        this.isPaused = false;

        // Cleanup
        if (this.audioContext) {
          this.audioContext.close();
          this.audioContext = null;
        }

        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
          this.stream = null;
        }

        console.log("Recording stopped");
        resolve(true);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Cancel recording without saving
   */
  cancel() {
    // Stop periodic saving
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    // Stop visualization
    cancelAnimationFrame(this.animationId);

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    this.chunks = [];
    this.isRecording = false;
    this.isPaused = false;

    // Cleanup
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    console.log("Recording cancelled");
  }

  /**
   * Draw waveform visualization
   */
  drawWaveform() {
    if (!this.analyser || !this.canvasCtx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording || this.isPaused) return;

      this.animationId = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);

      const width = this.canvas.width;
      const height = this.canvas.height;

      // Clear canvas with transparent background
      this.canvasCtx.clearRect(0, 0, width, height);

      // Draw bars - more compact for horizontal layout
      const barCount = Math.min(bufferLength, 40); // Limit bars for compact view
      const barWidth = Math.max(2, width / barCount - 1);
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor(i * (bufferLength / barCount));
        const barHeight = (dataArray[dataIndex] / 255) * height * 0.8; // Scale to 80%

        // Gradient from purple to red based on intensity
        const intensity = dataArray[dataIndex] / 255;
        const r = Math.floor(79 + intensity * 176); // 79 to 255
        const g = Math.floor(70 - intensity * 70); // 70 to 0
        const b = Math.floor(229 - intensity * 161); // 229 to 68

        this.canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Draw bar from center
        const y = (height - barHeight) / 2;
        this.canvasCtx.fillRect(x, y, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    cancelAnimationFrame(this.animationId);
  }
}

// Export for use in renderer
window.AudioRecorder = AudioRecorder;
