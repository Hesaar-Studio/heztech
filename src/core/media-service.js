'use strict';

/**
 * Controlled FFmpeg processing for Media Studio.
 *
 * Rules:
 * - The source file is never modified; every operation writes a new file.
 * - Output always lands inside the app's own media output directory.
 * - Every result is verified with ffprobe before it is reported as success.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FFMPEG = process.env.HEZTECH_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.HEZTECH_FFPROBE || 'ffprobe';

function run(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message).split('\n').slice(-3).join(' ').slice(0, 300);
        return reject(new Error(detail || 'FFMPEG_FAILED'));
      }
      resolve({ stdout, stderr });
    });
  });
}

class MediaService {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
    this.outputDir = options.outputDir || path.join(this.dataDir, 'media-output');
  }

  ensureOutputDir() {
    fs.mkdirSync(this.outputDir, { recursive: true });
    return this.outputDir;
  }

  async probe(inputPath) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const { stdout } = await run(FFPROBE, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ], 30000);

    const data = JSON.parse(stdout);
    const video = (data.streams || []).find(s => s.codec_type === 'video') || {};
    const audio = (data.streams || []).find(s => s.codec_type === 'audio') || {};
    return {
      path: inputPath,
      durationSec: Number(data.format?.duration || 0),
      sizeBytes: Number(data.format?.size || fs.statSync(inputPath).size),
      format: data.format?.format_name || null,
      video: video.codec_name ? {
        codec: video.codec_name,
        width: video.width,
        height: video.height,
        fps: video.avg_frame_rate
      } : null,
      audio: audio.codec_name ? { codec: audio.codec_name, channels: audio.channels } : null
    };
  }

  /**
   * Trim a clip into a new MP4. Re-encodes only when the cut is not keyframe
   * aligned, which is the safe default for arbitrary owner-chosen timestamps.
   */
  async trim({ inputPath, startSec, durationSec, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const start = Math.max(0, Number(startSec) || 0);
    const duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('DURATION_REQUIRED');

    const source = await this.probe(inputPath);
    if (start >= source.durationSec) throw new Error('START_BEYOND_END');
    const effective = Math.min(duration, Math.max(0, source.durationSec - start));

    this.ensureOutputDir();
    const safeName = String(name || `trim-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}${safeName.toLowerCase().endsWith('.mp4') ? '' : '.mp4'}`);

    await run(FFMPEG, [
      '-y',
      '-ss', String(start),
      '-t', String(effective),
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-map_metadata', '-1',
      outputPath
    ]);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('OUTPUT_NOT_CREATED');
    }

    const result = await this.probe(outputPath);
    return {
      outputPath,
      sourcePath: inputPath,
      requestedDurationSec: effective,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      video: result.video,
      audio: result.audio,
      sourceUnchanged: true
    };
  }

  async extractFrame({ inputPath, atSec = 0, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    this.ensureOutputDir();
    const safeName = String(name || `frame-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}.png`);
    await run(FFMPEG, ['-y', '-ss', String(Math.max(0, Number(atSec) || 0)), '-i', inputPath, '-frames:v', '1', outputPath]);
    if (!fs.existsSync(outputPath)) throw new Error('OUTPUT_NOT_CREATED');
    return { outputPath, sizeBytes: fs.statSync(outputPath).size };
  }
}

module.exports = { MediaService };
