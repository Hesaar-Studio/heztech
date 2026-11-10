import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('live voice IPC contract', () => {
  it('exposes the complete session and audio bridge used by VoiceOrbModal', () => {
    const preload = fs.readFileSync(path.resolve(process.cwd(), '..', 'preload.js'), 'utf8');
    for (const method of [
      "liveStart: (options) => ipcRenderer.invoke('live:start', options || {})",
      "liveStop: () => ipcRenderer.invoke('live:stop')",
      "liveSendAudio: (data) => ipcRenderer.invoke('live:send-audio', { data })",
      "liveSendAudioEnd: () => ipcRenderer.invoke('live:send-audio-end')",
      "liveSendText: (text) => ipcRenderer.invoke('live:send-text', { text })",
      "ipcRenderer.on('live:audio-chunk', handler)",
    ]) {
      expect(preload).toContain(method);
    }
  });
});
