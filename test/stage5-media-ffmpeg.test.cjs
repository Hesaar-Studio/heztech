'use strict';

/**
 * PHASE E — real media processing. Uses the machine's FFmpeg to produce an
 * actual playable MP4 from a generated sample, then verifies it with ffprobe.
 * The source file must remain byte-identical.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { MediaService } = require('../src/core/media-service');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-media-'));
const sample = path.join(workDir, 'sample.mp4');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function haveFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 15000 });
    return true;
  } catch (e) {
    return false;
  }
}

const ffmpegAvailable = haveFfmpeg();

test.before(() => {
  if (!ffmpegAvailable) return;
  // 3-second synthetic clip with a tone, generated locally.
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', sample
  ], { stdio: 'ignore', timeout: 120000 });
});

test.after(() => {
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}
});

test('PHASE-E1: ffmpeg is available on this machine', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, () => {
  assert.equal(ffmpegAvailable, true);
  assert.ok(fs.existsSync(sample));
});

test('PHASE-E2: trim produces a real, shorter, playable MP4 and leaves the source untouched', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, async () => {
  const before = hashFile(sample);
  const service = new MediaService({ dataDir: workDir });

  const result = await service.trim({ inputPath: sample, startSec: 0.5, durationSec: 1.0, name: 'trimmed' });

  assert.ok(fs.existsSync(result.outputPath), 'output file must exist');
  assert.notEqual(result.outputPath, sample);
  assert.equal(hashFile(sample), before, 'source file must be unchanged');
  assert.equal(result.video.codec, 'h264');
  assert.equal(result.video.width, 320);
  assert.ok(result.durationSec >= 0.7 && result.durationSec <= 1.6, `unexpected duration ${result.durationSec}`);
  assert.ok(result.sizeBytes > 0);

  // Independently verified by ffprobe, not just by the service's own claim.
  const probed = await service.probe(result.outputPath);
  assert.ok(probed.durationSec > 0.6);
});

test('PHASE-E3: a frame can be extracted as a real PNG', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, async () => {
  const service = new MediaService({ dataDir: workDir });
  const frame = await service.extractFrame({ inputPath: sample, atSec: 1, name: 'poster' });
  assert.ok(fs.existsSync(frame.outputPath));
  assert.ok(frame.sizeBytes > 0);
  const header = fs.readFileSync(frame.outputPath).subarray(0, 8);
  assert.equal(header.subarray(0, 4).toString('hex'), '89504e47', 'must be a real PNG');
});

test('PHASE-E4: invalid input is refused, not reported as success', async () => {
  const service = new MediaService({ dataDir: workDir });
  await assert.rejects(() => service.trim({ inputPath: path.join(workDir, 'missing.mp4'), durationSec: 1 }), /INPUT_NOT_FOUND/);
  await assert.rejects(() => service.trim({ inputPath: sample, durationSec: 0 }), /DURATION_REQUIRED|INPUT_NOT_FOUND/);
});
