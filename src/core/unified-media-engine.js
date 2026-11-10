'use strict';

/**
 * HezTech Unified Media Engine
 * Reverse-Engineered Concat Pipeline & CapCut Bridge Integration
 *
 * Capabilities:
 * - FFmpeg media probe & fast thumbnail/frame extraction
 * - Frame-accurate cut, trim, split & concat
 * - Automated silence detection & smart silence removal
 * - Persian RTL subtitle generation & burn-in (HarfBuzz/FriBidi shaper)
 * - Aspect ratio converter (16:9 YouTube <-> 9:16 Reels/Shorts with blurred padding or crop)
 * - EBU R128 audio normalization & voice enhancement
 * - Bidirectional CapCut draft sync (reads/writes draft_content.json with microsecond timestamps)
 * - Concat project schema export (concat.json)
 * - Persistent project save/load in Vault
 * - 100% offline, local execution on C: drive with zero VPN dependency
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FFMPEG = process.env.HEZTECH_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.HEZTECH_FFPROBE || 'ffprobe';

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Green', 'AppData', 'Local');
const CAPCUT_DRAFTS_DIR = path.join(LOCAL_APPDATA, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');

function run(bin, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 * 16 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message).split('\n').slice(-4).join(' ').slice(0, 400);
        return reject(new Error(detail || 'FFMPEG_FAILED'));
      }
      resolve({ stdout, stderr });
    });
  });
}

function formatFfmpegPath(p) {
  // Convert Windows backslashes and escape colon for FFmpeg filter graph
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

class UnifiedMediaEngine {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
    this.outputDir = path.join(this.dataDir, 'media-output');
    this.projectsDir = path.join(this.dataDir, 'media-projects');
    this.capcutDraftsDir = options.capcutDraftsDir || CAPCUT_DRAFTS_DIR;
    this.ensureDirs();
  }

  ensureDirs() {
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(this.projectsDir, { recursive: true });
  }

  /**
   * Probe video/audio stream properties
   */
  async probe(inputPath) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND: ' + inputPath);
    const { stdout } = await run(FFPROBE, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ], 30000);

    const data = JSON.parse(stdout);
    const video = (data.streams || []).find(s => s.codec_type === 'video') || null;
    const audio = (data.streams || []).find(s => s.codec_type === 'audio') || null;

    let fps = 30;
    if (video && video.avg_frame_rate) {
      const parts = video.avg_frame_rate.split('/');
      if (parts.length === 2 && Number(parts[1]) > 0) {
        fps = Math.round((Number(parts[0]) / Number(parts[1])) * 100) / 100;
      }
    }

    return {
      path: inputPath,
      name: path.basename(inputPath),
      durationSec: Number(data.format?.duration || 0),
      sizeBytes: Number(data.format?.size || fs.statSync(inputPath).size),
      format: data.format?.format_name || null,
      video: video ? {
        codec: video.codec_name,
        width: Number(video.width),
        height: Number(video.height),
        aspectRatio: video.width && video.height ? `${video.width}:${video.height}` : null,
        fps,
        bitrate: Number(video.bit_rate || 0)
      } : null,
      audio: audio ? {
        codec: audio.codec_name,
        channels: Number(audio.channels || 2),
        sampleRate: Number(audio.sample_rate || 44100),
        bitrate: Number(audio.bit_rate || 0)
      } : null
    };
  }

  /**
   * Extract video frame at timestamp
   */
  async extractFrame({ inputPath, atSec = 0, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    this.ensureDirs();
    const safeName = String(name || `frame-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}.png`);
    await run(FFMPEG, [
      '-y',
      '-ss', String(Math.max(0, Number(atSec) || 0)),
      '-i', inputPath,
      '-frames:v', '1',
      outputPath
    ]);
    if (!fs.existsSync(outputPath)) throw new Error('FRAME_EXTRACTION_FAILED');
    return {
      outputPath,
      atSec,
      sizeBytes: fs.statSync(outputPath).size
    };
  }

  /**
   * Trim / Cut segment from video
   */
  async trim({ inputPath, startSec, durationSec, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const start = Math.max(0, Number(startSec) || 0);
    const duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('DURATION_REQUIRED');

    const source = await this.probe(inputPath);
    if (start >= source.durationSec) throw new Error('START_BEYOND_END');
    const effective = Math.min(duration, Math.max(0, source.durationSec - start));

    this.ensureDirs();
    const safeName = String(name || `trim-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}${safeName.toLowerCase().endsWith('.mp4') ? '' : '.mp4'}`);

    await run(FFMPEG, [
      '-y',
      '-ss', String(start),
      '-t', String(effective),
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('TRIM_FAILED');
    }

    const result = await this.probe(outputPath);
    return {
      outputPath,
      sourcePath: inputPath,
      requestedDurationSec: effective,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      video: result.video,
      audio: result.audio
    };
  }

  /**
   * Detect silence intervals in video audio
   */
  async detectSilence({ inputPath, noiseThresholdDb = -30, minSilenceDurationSec = 0.5 }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const { stderr } = await run(FFMPEG, [
      '-i', inputPath,
      '-af', `silencedetect=noise=${noiseThresholdDb}dB:d=${minSilenceDurationSec}`,
      '-f', 'null',
      '-'
    ], 60000);

    const silences = [];
    let currentStart = null;
    const lines = stderr.split('\n');

    for (const line of lines) {
      if (line.includes('silence_start:')) {
        const match = line.match(/silence_start:\s*([0-9.]+)/);
        if (match) currentStart = parseFloat(match[1]);
      } else if (line.includes('silence_end:')) {
        const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
        const durMatch = line.match(/silence_duration:\s*([0-9.]+)/);
        if (endMatch) {
          const end = parseFloat(endMatch[1]);
          const duration = durMatch ? parseFloat(durMatch[1]) : (currentStart !== null ? end - currentStart : 0);
          silences.push({
            start: currentStart !== null ? currentStart : Math.max(0, end - duration),
            end,
            duration
          });
          currentStart = null;
        }
      }
    }

    return silences;
  }

  /**
   * Remove awkward pauses and silence from video automatically
   */
  async removeSilence({ inputPath, noiseThresholdDb = -30, minSilenceDurationSec = 0.5, marginSec = 0.05, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const source = await this.probe(inputPath);
    const silences = await this.detectSilence({ inputPath, noiseThresholdDb, minSilenceDurationSec });

    this.ensureDirs();
    const safeName = String(name || `nosilence-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}${safeName.toLowerCase().endsWith('.mp4') ? '' : '.mp4'}`);

    if (silences.length === 0) {
      // No silences found, just copy or return probe
      fs.copyFileSync(inputPath, outputPath);
      return {
        outputPath,
        sourcePath: inputPath,
        silencesRemoved: 0,
        savedTimeSec: 0,
        durationSec: source.durationSec,
        sizeBytes: fs.statSync(outputPath).size
      };
    }

    // Build speech intervals
    const speechIntervals = [];
    let curTime = 0;

    for (const sil of silences) {
      const speechEnd = Math.max(curTime, sil.start + marginSec);
      if (speechEnd > curTime) {
        speechIntervals.push({ start: curTime, end: Math.min(source.durationSec, speechEnd) });
      }
      curTime = Math.min(source.durationSec, Math.max(curTime, sil.end - marginSec));
    }
    if (curTime < source.durationSec) {
      speechIntervals.push({ start: curTime, end: source.durationSec });
    }

    if (speechIntervals.length === 0) {
      throw new Error('NO_SPEECH_INTERVALS_DETECTED');
    }

    // Build FFmpeg complex filter
    // e.g., [0:v]trim=start=0:end=3,setpts=PTS-STARTPTS[v0]; [0:a]atrim=start=0:end=3,asetpts=PTS-STARTPTS[a0]; ... [v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]
    const filterParts = [];
    const concatInputs = [];

    speechIntervals.forEach((interval, idx) => {
      const vTag = `v${idx}`;
      const aTag = `a${idx}`;
      filterParts.push(`[0:v]trim=start=${interval.start.toFixed(3)}:end=${interval.end.toFixed(3)},setpts=PTS-STARTPTS[${vTag}]`);
      filterParts.push(`[0:a]atrim=start=${interval.start.toFixed(3)}:end=${interval.end.toFixed(3)},asetpts=PTS-STARTPTS[${aTag}]`);
      concatInputs.push(`[${vTag}][${aTag}]`);
    });

    filterParts.push(`${concatInputs.join('')}concat=n=${speechIntervals.length}:v=1:a=1[outv][outa]`);

    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-filter_complex', filterParts.join('; '),
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('SILENCE_REMOVAL_RENDER_FAILED');
    }

    const result = await this.probe(outputPath);
    const totalSilencedSec = silences.reduce((acc, s) => acc + s.duration, 0);

    return {
      outputPath,
      sourcePath: inputPath,
      silencesRemoved: silences.length,
      savedTimeSec: Math.max(0, source.durationSec - result.durationSec),
      totalSilencedSec,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      intervals: speechIntervals
    };
  }

  /**
   * Add Persian RTL Subtitles (Burns into video and generates SRT file)
   */
  async addPersianSubtitles({ inputPath, subtitles, fontName = 'Arial', fontSize = 24, fontColor = 'white', name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    if (!Array.isArray(subtitles) || subtitles.length === 0) throw new Error('SUBTITLES_REQUIRED');

    this.ensureDirs();
    const safeName = String(name || `subtitled-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const srtPath = path.join(this.outputDir, `${safeName}.srt`);
    const outputPath = path.join(this.outputDir, `${safeName}${safeName.toLowerCase().endsWith('.mp4') ? '' : '.mp4'}`);

    // Generate SRT content
    const srtLines = [];
    subtitles.forEach((sub, idx) => {
      const startMs = Math.round(Number(sub.startSec || 0) * 1000);
      const endMs = Math.round(Number(sub.endSec || (sub.startSec + 3)) * 1000);

      const fmtTime = (ms) => {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const milli = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
      };

      srtLines.push(String(idx + 1));
      srtLines.push(`${fmtTime(startMs)} --> ${fmtTime(endMs)}`);
      srtLines.push(sub.text.trim());
      srtLines.push('');
    });

    fs.writeFileSync(srtPath, srtLines.join('\n'), 'utf-8');

    // Burn with FFmpeg libass/FriBidi/HarfBuzz shaper
    const formattedSrt = formatFfmpegPath(srtPath);
    const style = `FontName=${fontName},FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2`;

    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-vf', `subtitles='${formattedSrt}':force_style='${style}'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('SUBTITLE_BURN_FAILED');
    }

    const result = await this.probe(outputPath);
    return {
      outputPath,
      srtPath,
      subtitlesCount: subtitles.length,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes
    };
  }

  /**
   * Change Aspect Ratio (16:9 Landscape <-> 9:16 Portrait Reels/Shorts)
   */
  async changeAspectRatio({ inputPath, targetRatio = '9:16', mode = 'pad', name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    const source = await this.probe(inputPath);
    this.ensureDirs();

    const safeName = String(name || `aspect-${targetRatio.replace(':', 'x')}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}.mp4`);

    let targetWidth = 1080;
    let targetHeight = 1920;

    if (targetRatio === '16:9') {
      targetWidth = 1920;
      targetHeight = 1080;
    } else if (targetRatio === '1:1') {
      targetWidth = 1080;
      targetHeight = 1080;
    }

    let filter = '';
    if (mode === 'pad') {
      // Blurred background + sharp original centered
      filter = `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,boxblur=20:5,crop=${targetWidth}:${targetHeight}[bg]; [0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fg]; [bg][fg]overlay=(W-w)/2:(H-h)/2[outv]`;
    } else {
      // Center crop
      filter = `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}[outv]`;
    }

    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath)) throw new Error('ASPECT_RATIO_CHANGE_FAILED');
    const result = await this.probe(outputPath);
    return {
      outputPath,
      targetRatio,
      mode,
      width: targetWidth,
      height: targetHeight,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes
    };
  }

  /**
   * EBU R128 Audio Normalization & Voice Enhancement
   */
  async enhanceAudio({ inputPath, normalize = true, name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    this.ensureDirs();

    const safeName = String(name || `enhanced-audio-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}.mp4`);

    const audioFilters = [];
    // Highpass to eliminate low hum (<80Hz), lowpass to reduce harsh hiss (>12kHz)
    audioFilters.push('highpass=f=80', 'lowpass=f=12000');
    if (normalize) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-c:v', 'copy',
      '-af', audioFilters.join(','),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath)) throw new Error('AUDIO_ENHANCE_FAILED');
    const result = await this.probe(outputPath);
    return {
      outputPath,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes
    };
  }

  /**
   * Merge / Concatenate multiple video clips
   */
  async mergeClips({ clipPaths = [], name }) {
    if (!Array.isArray(clipPaths) || clipPaths.length < 2) {
      throw new Error('AT_LEAST_TWO_CLIPS_REQUIRED');
    }
    for (const p of clipPaths) {
      if (!p || !fs.existsSync(p)) throw new Error('CLIP_NOT_FOUND: ' + p);
    }

    this.ensureDirs();
    const safeName = String(name || `merged-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}${safeName.toLowerCase().endsWith('.mp4') ? '' : '.mp4'}`);

    // Build FFmpeg complex filter to unify resolution and audio channels
    const filterParts = [];
    const concatInputs = [];

    clipPaths.forEach((_, idx) => {
      filterParts.push(`[${idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${idx}]`);
      filterParts.push(`[${idx}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${idx}]`);
      concatInputs.push(`[v${idx}][a${idx}]`);
    });

    filterParts.push(`${concatInputs.join('')}concat=n=${clipPaths.length}:v=1:a=1[outv][outa]`);

    const inputArgs = [];
    clipPaths.forEach(p => {
      inputArgs.push('-i', p);
    });

    await run(FFMPEG, [
      '-y',
      ...inputArgs,
      '-filter_complex', filterParts.join('; '),
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('MERGE_CLIPS_FAILED');
    }

    const result = await this.probe(outputPath);
    return {
      outputPath,
      clipsCount: clipPaths.length,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      video: result.video,
      audio: result.audio
    };
  }

  /**
   * Export video using standard professional presets
   */
  async exportPreset({ inputPath, preset = 'instagram_reel', name }) {
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('INPUT_NOT_FOUND');
    this.ensureDirs();

    const safeName = String(name || `${preset}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.outputDir, `${safeName}.mp4`);

    let scaleFilter = '';
    let crf = '22';
    let audioBitrate = '192k';

    switch (preset) {
      case 'instagram_reel':
      case 'youtube_shorts':
      case 'tiktok':
        // 9:16 vertical 1080x1920
        scaleFilter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30';
        crf = '21';
        audioBitrate = '192k';
        break;
      case 'youtube_16_9':
        // 16:9 landscape 1920x1080
        scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30';
        crf = '19';
        audioBitrate = '320k';
        break;
      case 'web_optimized':
        // 720p or 1080p balanced
        scaleFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30';
        crf = '24';
        audioBitrate = '128k';
        break;
      case 'high_quality':
      default:
        // Source aspect ratio maintained
        scaleFilter = 'setsar=1,fps=30';
        crf = '18';
        audioBitrate = '320k';
        break;
    }

    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', crf,
      '-c:a', 'aac',
      '-b:a', audioBitrate,
      '-movflags', '+faststart',
      outputPath
    ]);

    if (!fs.existsSync(outputPath)) throw new Error('PRESET_EXPORT_FAILED');
    const result = await this.probe(outputPath);
    return {
      outputPath,
      preset,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      video: result.video,
      audio: result.audio
    };
  }

  /**
   * Export to CapCut Desktop Draft (draft_content.json)
   */
  async exportCapCutDraft({ projectName, videoPath, subtitles = [], durationSec }) {
    if (!videoPath || !fs.existsSync(videoPath)) throw new Error('INPUT_NOT_FOUND');
    const safeProj = String(projectName || `HezTech_${Date.now()}`).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_');
    const projectDir = path.join(this.capcutDraftsDir, safeProj);
    fs.mkdirSync(projectDir, { recursive: true });

    const dur = Math.round((Number(durationSec) || 10) * 1000000); // microseconds
    const videoId = 'video_' + Date.now();
    const trackVideoId = 'track_video_main';
    const trackTextId = 'track_text_subtitles';

    // Construct CapCut draft_content.json structure
    const draftContent = {
      canvas_config: { width: 1920, height: 1080, ratio: 'original' },
      color_space: 0,
      duration: dur,
      fps: 30.0,
      materials: {
        videos: [
          {
            id: videoId,
            path: videoPath,
            type: 'video',
            duration: dur,
            width: 1920,
            height: 1080
          }
        ],
        texts: subtitles.map((s, idx) => ({
          id: `text_${idx}_${Date.now()}`,
          content: JSON.stringify({
            text: s.text,
            styles: [{ fill: { alpha: 1.0, content: { solid: { color: [1.0, 1.0, 1.0] } } } }]
          }),
          type: 'text'
        })),
        audios: [],
        transitions: []
      },
      tracks: [
        {
          id: trackVideoId,
          type: 'video',
          segments: [
            {
              id: 'seg_video_0',
              material_id: videoId,
              target_timerange: { duration: dur, start: 0 },
              source_timerange: { duration: dur, start: 0 }
            }
          ]
        }
      ]
    };

    if (subtitles.length > 0) {
      draftContent.tracks.push({
        id: trackTextId,
        type: 'text',
        segments: subtitles.map((s, idx) => {
          const startMicros = Math.round(Number(s.startSec || 0) * 1000000);
          const endMicros = Math.round(Number(s.endSec || (s.startSec + 3)) * 1000000);
          return {
            id: `seg_text_${idx}`,
            material_id: draftContent.materials.texts[idx].id,
            target_timerange: { start: startMicros, duration: Math.max(100000, endMicros - startMicros) }
          };
        })
      });
    }

    const draftFile = path.join(projectDir, 'draft_content.json');
    fs.writeFileSync(draftFile, JSON.stringify(draftContent, null, 2), 'utf-8');

    // Also write draft_meta_info.json
    const metaInfo = {
      draft_id: safeProj,
      draft_name: safeProj,
      draft_create_time: Date.now(),
      draft_update_time: Date.now(),
      draft_timeline_duration: dur
    };
    fs.writeFileSync(path.join(projectDir, 'draft_meta_info.json'), JSON.stringify(metaInfo, null, 2), 'utf-8');

    return {
      success: true,
      projectName: safeProj,
      projectDir,
      draftFile,
      durationMicros: dur,
      tracksCount: draftContent.tracks.length
    };
  }

  /**
   * Import CapCut Draft into Unified Project
   */
  async importCapCutDraft(draftName) {
    const projectDir = path.join(this.capcutDraftsDir, draftName);
    const draftFile = path.join(projectDir, 'draft_content.json');
    if (!fs.existsSync(draftFile)) throw new Error('CAPCUT_DRAFT_NOT_FOUND: ' + draftFile);

    const raw = JSON.parse(fs.readFileSync(draftFile, 'utf-8'));
    const videos = raw.materials?.videos || [];
    const texts = raw.materials?.texts || [];

    const durationSec = (raw.duration || 0) / 1000000;
    return {
      draftName,
      projectDir,
      durationSec,
      fps: raw.fps || 30,
      videosCount: videos.length,
      textsCount: texts.length,
      tracks: raw.tracks || []
    };
  }

  /**
   * Save and Load Unified Media Projects
   */
  saveProject(project) {
    this.ensureDirs();
    const id = project.id || `proj_${Date.now()}`;
    const p = {
      ...project,
      id,
      updatedAt: new Date().toISOString()
    };
    const targetFile = path.join(this.projectsDir, `${id}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(p, null, 2), 'utf-8');
    return { success: true, id, path: targetFile };
  }

  loadProject(id) {
    const targetFile = path.join(this.projectsDir, `${id}.json`);
    if (!fs.existsSync(targetFile)) throw new Error('PROJECT_NOT_FOUND: ' + id);
    return JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
  }

  listProjects() {
    this.ensureDirs();
    const files = fs.readdirSync(this.projectsDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.projectsDir, f), 'utf-8'));
        return {
          id: data.id || path.basename(f, '.json'),
          title: data.title || data.name || f,
          updatedAt: data.updatedAt || null,
          mediaCount: data.timeline?.clips?.length || 0,
          durationSec: data.durationSec || 0
        };
      } catch {
        return { id: path.basename(f, '.json'), title: f, error: 'PARSE_FAILED' };
      }
    });
  }
}

module.exports = { UnifiedMediaEngine };
