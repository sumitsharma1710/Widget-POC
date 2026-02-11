const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Storage paths
let recordingsDir = null;
let metadataPath = null;
let tempDir = null;

// In-memory metadata cache
let metadata = {
  recordings: [],
  pendingRecovery: null,
};

/**
 * Initialize storage directories
 */
async function initStorage() {
  const userDataPath = app.getPath("userData");
  recordingsDir = path.join(userDataPath, "recordings");
  tempDir = path.join(userDataPath, "temp");
  metadataPath = path.join(userDataPath, "recordings-metadata.json");

  // Create directories if they don't exist
  await fs.promises.mkdir(recordingsDir, { recursive: true });
  await fs.promises.mkdir(tempDir, { recursive: true });

  // Load existing metadata
  try {
    const data = await fs.promises.readFile(metadataPath, "utf8");
    metadata = JSON.parse(data);
  } catch (e) {
    // No existing metadata, use defaults
    metadata = { recordings: [], pendingRecovery: null };
  }

  console.log("Storage initialized:", recordingsDir);
}

/**
 * Save metadata to disk
 */
async function saveMetadata() {
  await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Start a new recording session
 * @returns {string} Recording ID
 */
async function startNewRecording() {
  const recordingId = `recording_${Date.now()}`;
  const recordingTempDir = path.join(tempDir, recordingId);

  // Create temp directory for this recording
  await fs.promises.mkdir(recordingTempDir, { recursive: true });

  // Mark as pending (for crash recovery)
  metadata.pendingRecovery = {
    recordingId,
    startTime: new Date().toISOString(),
    chunks: [],
  };
  await saveMetadata();

  return recordingId;
}

/**
 * Save an audio chunk to disk
 * @param {string} recordingId
 * @param {ArrayBuffer} chunk - Audio data as ArrayBuffer
 * @param {string} mimeType - MIME type of the audio
 */
async function saveAudioChunk(recordingId, chunk, mimeType) {
  const recordingTempDir = path.join(tempDir, recordingId);
  const chunkIndex = metadata.pendingRecovery?.chunks?.length || 0;
  const extension = mimeType.includes("webm") ? "webm" : "wav";
  const chunkPath = path.join(
    recordingTempDir,
    `chunk_${chunkIndex}.${extension}`,
  );

  // Convert ArrayBuffer to Buffer and save
  const buffer = Buffer.from(chunk);
  await fs.promises.writeFile(chunkPath, buffer);

  // Update metadata
  if (metadata.pendingRecovery) {
    metadata.pendingRecovery.chunks.push({
      index: chunkIndex,
      path: chunkPath,
      size: buffer.length,
      timestamp: new Date().toISOString(),
    });
    await saveMetadata();
  }

  console.log(`Saved chunk ${chunkIndex}: ${buffer.length} bytes`);
}

/**
 * Finalize recording - combine chunks and move to recordings folder
 * @param {string} recordingId
 * @param {number} duration - Duration in seconds
 */
async function finalizeRecording(recordingId, duration) {
  const recordingTempDir = path.join(tempDir, recordingId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const finalFileName = `meeting_${timestamp}.webm`;
  const finalPath = path.join(recordingsDir, finalFileName);

  // Read all chunks and combine
  const chunks = [];
  const chunkFiles = await fs.promises.readdir(recordingTempDir);

  // Sort chunks by index
  chunkFiles.sort((a, b) => {
    const indexA = parseInt(a.match(/chunk_(\d+)/)?.[1] || 0);
    const indexB = parseInt(b.match(/chunk_(\d+)/)?.[1] || 0);
    return indexA - indexB;
  });

  for (const chunkFile of chunkFiles) {
    const chunkPath = path.join(recordingTempDir, chunkFile);
    const chunkData = await fs.promises.readFile(chunkPath);
    chunks.push(chunkData);
  }

  // Combine all chunks into final file
  const combinedBuffer = Buffer.concat(chunks);
  await fs.promises.writeFile(finalPath, combinedBuffer);

  // Calculate file size
  const stats = await fs.promises.stat(finalPath);

  // Add to recordings list
  const recordingMetadata = {
    id: recordingId,
    fileName: finalFileName,
    filePath: finalPath,
    duration: duration,
    fileSize: stats.size,
    createdAt: new Date().toISOString(),
  };

  metadata.recordings.push(recordingMetadata);
  metadata.pendingRecovery = null;
  await saveMetadata();

  // Clean up temp directory
  await fs.promises.rm(recordingTempDir, { recursive: true, force: true });

  console.log(`Recording finalized: ${finalPath} (${stats.size} bytes)`);

  return {
    filePath: finalPath,
    fileName: finalFileName,
    fileSize: stats.size,
    duration: duration,
  };
}

/**
 * Cancel and discard a recording
 * @param {string} recordingId
 */
async function cancelRecording(recordingId) {
  const recordingTempDir = path.join(tempDir, recordingId);

  // Remove temp directory
  try {
    await fs.promises.rm(recordingTempDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore if already deleted
  }

  // Clear pending recovery
  metadata.pendingRecovery = null;
  await saveMetadata();

  console.log("Recording cancelled and cleaned up");
}

/**
 * Check for incomplete recordings from crash
 * @returns {Object|null} Recovery data if found
 */
async function checkForRecovery() {
  if (metadata.pendingRecovery) {
    const { recordingId, startTime, chunks } = metadata.pendingRecovery;
    const recordingTempDir = path.join(tempDir, recordingId);

    // Check if temp directory still exists
    try {
      await fs.promises.access(recordingTempDir);

      // Calculate total size of recovered data
      let totalSize = 0;
      for (const chunk of chunks) {
        try {
          const stats = await fs.promises.stat(chunk.path);
          totalSize += stats.size;
        } catch (e) {
          // Chunk might be corrupted
        }
      }

      if (totalSize > 0) {
        return {
          recordingId,
          startTime,
          chunkCount: chunks.length,
          totalSize,
        };
      }
    } catch (e) {
      // No temp directory, clear pending recovery
      metadata.pendingRecovery = null;
      await saveMetadata();
    }
  }

  return null;
}

/**
 * Recover a recording from crash data
 * @param {Object} recoveryData
 */
async function recoverRecording(recoveryData) {
  const { recordingId, startTime } = recoveryData;
  const recordingTempDir = path.join(tempDir, recordingId);
  const timestamp = new Date(startTime).toISOString().replace(/[:.]/g, "-");
  const finalFileName = `recovered_${timestamp}.webm`;
  const finalPath = path.join(recordingsDir, finalFileName);

  try {
    // Read all chunks and combine
    const chunks = [];
    const chunkFiles = await fs.promises.readdir(recordingTempDir);

    // Sort chunks by index
    chunkFiles.sort((a, b) => {
      const indexA = parseInt(a.match(/chunk_(\d+)/)?.[1] || 0);
      const indexB = parseInt(b.match(/chunk_(\d+)/)?.[1] || 0);
      return indexA - indexB;
    });

    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(recordingTempDir, chunkFile);
      const chunkData = await fs.promises.readFile(chunkPath);
      chunks.push(chunkData);
    }

    // Combine all chunks into final file
    const combinedBuffer = Buffer.concat(chunks);
    await fs.promises.writeFile(finalPath, combinedBuffer);

    // Calculate file size
    const stats = await fs.promises.stat(finalPath);

    // Estimate duration based on size (rough estimate: 128kbps = 16KB/s)
    // This is a fallback since we lost the exact duration state
    const duration = Math.floor(stats.size / 16000);

    // Add to recordings list
    const recordingMetadata = {
      id: recordingId,
      fileName: `Recovered Recording ${new Date(startTime).toLocaleTimeString()}`,
      filePath: finalPath,
      duration: duration,
      fileSize: stats.size,
      createdAt: startTime,
      isRecovered: true,
    };

    metadata.recordings.push(recordingMetadata);
    metadata.pendingRecovery = null;
    await saveMetadata();

    // Clean up temp directory
    await fs.promises.rm(recordingTempDir, { recursive: true, force: true });

    console.log(`Recovery successful: ${finalPath}`);
    return recordingMetadata;
  } catch (error) {
    console.error("Recovery failed:", error);
    // If recovery fails, we should probably still clear the pending flag
    // to avoid stuck recovery loops, but maybe keep the temp files for manual inspection
    metadata.pendingRecovery = null;
    await saveMetadata();
    throw error;
  }
}

/**
 * Get list of all recordings
 */
async function getRecordingsList() {
  return metadata.recordings;
}

/**
 * Get recordings directory path
 */
function getRecordingsDir() {
  return recordingsDir;
}

module.exports = {
  initStorage,
  startNewRecording,
  saveAudioChunk,
  finalizeRecording,
  cancelRecording,
  checkForRecovery,
  recoverRecording,
  getRecordingsList,
  getRecordingsDir,
};
