'use strict';

const path = require('path');
const assert = require('assert');
const { UnifiedMediaEngine } = require('../src/core/unified-media-engine');

async function testAll() {
  console.log('--- STARTING UNIFIED MEDIA ENGINE TESTS ---');
  const engine = new UnifiedMediaEngine();

  const sampleVideo = path.join(engine.outputDir, 'sample_test.mp4');
  const silenceVideo = path.join(engine.outputDir, 'silence_test.mp4');

  // 1. Probe
  console.log('\n[1] Testing Media Probe...');
  const probeInfo = await engine.probe(sampleVideo);
  console.log('Probe Result:', {
    duration: probeInfo.durationSec,
    width: probeInfo.video?.width,
    height: probeInfo.video?.height,
    codec: probeInfo.video?.codec
  });
  assert(probeInfo.durationSec > 0, 'Duration must be positive');
  assert(probeInfo.video?.width === 1280, 'Width must be 1280');

  // 2. Extract Frame
  console.log('\n[2] Testing Frame Extraction...');
  const frame = await engine.extractFrame({ inputPath: sampleVideo, atSec: 1.5, name: 'test-extracted-frame' });
  console.log('Frame extracted at:', frame.outputPath, 'size:', frame.sizeBytes);
  assert(frame.sizeBytes > 1000, 'Frame size must be valid');

  // 3. Trim
  console.log('\n[3] Testing Trim...');
  const trimRes = await engine.trim({ inputPath: sampleVideo, startSec: 1, durationSec: 3, name: 'test-trim' });
  console.log('Trimmed output:', trimRes.outputPath, 'duration:', trimRes.durationSec);
  assert(Math.abs(trimRes.durationSec - 3) < 0.2, 'Trimmed duration should be ~3s');

  // 4. Silence Removal
  console.log('\n[4] Testing Silence Removal...');
  const nosilence = await engine.removeSilence({ inputPath: silenceVideo, name: 'test-silence-removed' });
  console.log('Silence removal result:', {
    originalDuration: 9,
    newDuration: nosilence.durationSec,
    silencesRemoved: nosilence.silencesRemoved,
    savedTime: nosilence.savedTimeSec
  });
  assert(nosilence.durationSec < 8.0, 'Silence must be stripped from 9s video');
  assert(nosilence.silencesRemoved >= 1, 'At least 1 silence interval removed');

  // 5. Persian Subtitles (RTL)
  console.log('\n[5] Testing Persian RTL Subtitles...');
  const subRes = await engine.addPersianSubtitles({
    inputPath: sampleVideo,
    subtitles: [
      { startSec: 0.5, endSec: 3.5, text: 'سلام، این آزمون تدوین هوشمند هزتک است.' },
      { startSec: 4.0, endSec: 7.0, text: 'استودیوی رسانه کاملاً یکپارچه و آفلاین کار می‌کند.' }
    ],
    name: 'test-persian-subtitled'
  });
  console.log('Subtitles burned at:', subRes.outputPath, 'subtitlesCount:', subRes.subtitlesCount);
  assert(subRes.subtitlesCount === 2, 'Two subtitle lines should be burned');

  // 6. Aspect Ratio (Vertical 9:16)
  console.log('\n[6] Testing Aspect Ratio Conversion (9:16)...');
  const aspectRes = await engine.changeAspectRatio({ inputPath: sampleVideo, targetRatio: '9:16', mode: 'pad', name: 'test-reels' });
  console.log('Vertical video:', aspectRes.outputPath, 'dims:', `${aspectRes.width}x${aspectRes.height}`);
  assert(aspectRes.width === 1080 && aspectRes.height === 1920, 'Vertical dims must be 1080x1920');

  // 7. CapCut Draft Export & Import
  console.log('\n[7] Testing CapCut Draft Sync...');
  const capcutExport = await engine.exportCapCutDraft({
    projectName: 'HezTech_Automated_Edit',
    videoPath: sampleVideo,
    durationSec: 8,
    subtitles: [{ startSec: 1, endSec: 4, text: 'زیرنویس همگام‌شده در کپ‌کات' }]
  });
  console.log('CapCut draft exported to:', capcutExport.draftFile);
  assert(capcutExport.success === true, 'CapCut draft export must succeed');

  const capcutImport = await engine.importCapCutDraft('HezTech_Automated_Edit');
  console.log('CapCut draft read back:', {
    draftName: capcutImport.draftName,
    durationSec: capcutImport.durationSec,
    tracks: capcutImport.tracks.length
  });
  assert(capcutImport.tracks.length >= 2, 'CapCut draft should have video and text tracks');

  // 8. Project Persistence
  console.log('\n[8] Testing Project Persistence...');
  const saved = engine.saveProject({
    id: 'proj_test_01',
    title: 'پروژه تست استودیو رسانه',
    timeline: { clips: [{ path: sampleVideo, in: 0, out: 8 }] },
    durationSec: 8
  });
  assert(saved.success === true, 'Project save failed');
  const loaded = engine.loadProject('proj_test_01');
  assert(loaded.title === 'پروژه تست استودیو رسانه', 'Loaded title mismatch');
  const list = engine.listProjects();
  assert(list.some(p => p.id === 'proj_test_01'), 'Project must be in list');

  console.log('\n>>> ALL 8 UNIFIED MEDIA ENGINE TESTS PASSED SUCCESSFULLY! <<<');
}

testAll().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
