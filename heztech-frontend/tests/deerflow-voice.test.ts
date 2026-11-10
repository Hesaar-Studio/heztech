import { describe, expect, it } from 'vitest';
import { getSpeechRecognitionLanguage, normalizeSpeechTranscript, mapSpeechRecognitionError, shouldRestartSpeechRecognition } from '../src/lib/deerflow/speech-recognition';

describe('DeerFlow speech utility adaptation', () => {
  it('keeps Persian rather than silently falling back to English', () => {
    expect(getSpeechRecognitionLanguage('fa')).toBe('fa-IR');
    expect(getSpeechRecognitionLanguage('fa-IR')).toBe('fa-IR');
    expect(normalizeSpeechTranscript('  سلام\n هزتک  ')).toBe('سلام هزتک');
  });
  it('does not recommend restarting after denied permission', () => {
    expect(shouldRestartSpeechRecognition(mapSpeechRecognitionError('not-allowed'))).toBe(false);
    expect(shouldRestartSpeechRecognition(mapSpeechRecognitionError('no-speech'))).toBe(true);
  });
});
