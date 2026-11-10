'use strict';

const path = require('path');
const assert = require('assert');
const ToolManager = require('../src/core/tools');

async function testArtaMediaTools() {
  console.log('--- STARTING ARTA MEDIA TOOLS INTEGRATION TESTS ---');

  const tools = ToolManager.getAvailableTools();
  console.log(`Total tools registered in ToolManager: ${tools.length}`);

  const mediaTools = tools.filter(t => t.id.startsWith('media_'));
  console.log('Registered media tools:', mediaTools.map(t => t.id));
  assert(mediaTools.length >= 8, 'Expected at least 8 media tools registered');

  const sampleVideo = 'C:\\Users\\Green\\openclaw\\vault\\media-output\\sample_test.mp4';
  const silenceVideo = 'C:\\Users\\Green\\openclaw\\vault\\media-output\\silence_test.mp4';

  // 1. Tool: media_probe
  console.log('\n[1] Executing Tool: media_probe...');
  const probeInvocation = await ToolManager.invokeTool('media_probe', { inputPath: sampleVideo }, { approved: true, user: 'owner' });
  assert(probeInvocation.success === true, 'media_probe invocation failed');
  const probeRes = probeInvocation.result;
  console.log('media_probe output:', { duration: probeRes.durationSec, res: `${probeRes.video?.width}x${probeRes.video?.height}` });
  assert(probeRes.durationSec > 0, 'media_probe duration must be positive');

  // 2. Tool: media_trim
  console.log('\n[2] Executing Tool: media_trim...');
  const trimInvocation = await ToolManager.invokeTool('media_trim', {
    inputPath: sampleVideo,
    startSec: 0,
    durationSec: 2.5,
    name: 'arta-tool-trim'
  }, { approved: true, user: 'owner' });
  assert(trimInvocation.success === true, 'media_trim invocation failed');
  const trimRes = trimInvocation.result;
  console.log('media_trim output:', trimRes.outputPath, 'duration:', trimRes.durationSec);
  assert(trimRes.outputPath && trimRes.durationSec > 0, 'media_trim output invalid');

  // 3. Tool: media_remove_silence
  console.log('\n[3] Executing Tool: media_remove_silence...');
  const silenceInvocation = await ToolManager.invokeTool('media_remove_silence', {
    inputPath: silenceVideo,
    noiseThresholdDb: -30,
    minSilenceDurationSec: 0.5,
    name: 'arta-tool-nosilence'
  }, { approved: true, user: 'owner' });
  assert(silenceInvocation.success === true, 'media_remove_silence invocation failed');
  const silenceRes = silenceInvocation.result;
  console.log('media_remove_silence output:', {
    outputPath: silenceRes.outputPath,
    silencesRemoved: silenceRes.silencesRemoved,
    savedTimeSec: silenceRes.savedTimeSec
  });
  assert(silenceRes.silencesRemoved >= 1, 'media_remove_silence removed count invalid');

  // 4. Tool: media_persian_subtitles
  console.log('\n[4] Executing Tool: media_persian_subtitles...');
  const subInvocation = await ToolManager.invokeTool('media_persian_subtitles', {
    inputPath: sampleVideo,
    subtitles: [
      { startSec: 0, endSec: 3, text: 'دستور تدوین توسط اَرتا با موفقیت اجرا شد.' }
    ],
    name: 'arta-tool-subtitled'
  }, { approved: true, user: 'owner' });
  assert(subInvocation.success === true, 'media_persian_subtitles invocation failed');
  const subRes = subInvocation.result;
  console.log('media_persian_subtitles output:', subRes.outputPath, 'count:', subRes.subtitlesCount);
  assert(subRes.subtitlesCount === 1, 'media_persian_subtitles count invalid');

  // 5. Tool: media_change_aspect (Reels 9:16)
  console.log('\n[5] Executing Tool: media_change_aspect...');
  const aspectInvocation = await ToolManager.invokeTool('media_change_aspect', {
    inputPath: sampleVideo,
    targetRatio: '9:16',
    mode: 'pad',
    name: 'arta-tool-vertical'
  }, { approved: true, user: 'owner' });
  assert(aspectInvocation.success === true, 'media_change_aspect invocation failed');
  const aspectRes = aspectInvocation.result;
  console.log('media_change_aspect output:', aspectRes.outputPath, 'dims:', `${aspectRes.width}x${aspectRes.height}`);
  assert(aspectRes.width === 1080 && aspectRes.height === 1920, 'media_change_aspect dimensions invalid');

  // 6. Tool: media_enhance_audio
  console.log('\n[6] Executing Tool: media_enhance_audio...');
  const audioInvocation = await ToolManager.invokeTool('media_enhance_audio', {
    inputPath: sampleVideo,
    normalize: true,
    name: 'arta-tool-audio-norm'
  }, { approved: true, user: 'owner' });
  assert(audioInvocation.success === true, 'media_enhance_audio invocation failed');
  const audioRes = audioInvocation.result;
  console.log('media_enhance_audio output:', audioRes.outputPath);
  assert(audioRes.outputPath, 'media_enhance_audio output invalid');

  // 7. Tool: media_export_capcut
  console.log('\n[7] Executing Tool: media_export_capcut...');
  const capcutInvocation = await ToolManager.invokeTool('media_export_capcut', {
    projectName: 'ARTA_Automated_Session',
    videoPath: sampleVideo,
    durationSec: 5,
    subtitles: [{ startSec: 0, endSec: 3, text: 'خروجی رسمی شورا و اَرتا' }]
  }, { approved: true, user: 'owner' });
  assert(capcutInvocation.success === true, 'media_export_capcut invocation failed');
  const capcutRes = capcutInvocation.result;
  console.log('media_export_capcut output:', capcutRes.projectDir);
  assert(capcutRes.success === true, 'media_export_capcut failed');

  // 8. Tool: media_project_manager
  console.log('\n[8] Executing Tool: media_project_manager (save/list)...');
  const projInvocation = await ToolManager.invokeTool('media_project_manager', {
    action: 'save',
    project: {
      id: 'arta_proj_01',
      title: 'پروژه تدوین خودکار اَرتا',
      durationSec: 5
    }
  }, { approved: true, user: 'owner' });
  assert(projInvocation.success === true, 'media_project_manager invocation failed');
  const projRes = projInvocation.result;
  console.log('media_project_manager output:', projRes);
  assert(projRes.success === true, 'media_project_manager failed');

  console.log('\n>>> ALL 8 ARTA MEDIA TOOLS TESTS PASSED WITH 100% SUCCESS! <<<');
}

testArtaMediaTools().catch(err => {
  console.error('ARTA TOOL TEST FAILED:', err);
  process.exit(1);
});
