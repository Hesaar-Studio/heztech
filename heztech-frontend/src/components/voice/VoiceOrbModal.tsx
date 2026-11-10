import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import { normalizeSpeechTranscript } from '@/lib/deerflow/speech-recognition';
import './VoiceOrbModal.css';

interface VoiceOrbModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialVoice?: string;
}

interface VoiceChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  toolName?: string;
  time: string;
}

class OrbParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  pulseSpeed: number;
  pulseVal: number;

  constructor(w: number, h: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (w * 0.42);
    this.x = w / 2 + Math.cos(angle) * dist;
    this.y = h / 2 + Math.sin(angle) * dist;
    this.vx = (Math.random() - 0.5) * 0.35;
    this.vy = (Math.random() - 0.5) * 0.35;
    this.radius = 1.0 + Math.random() * 1.8;
    this.alpha = 0.35 + Math.random() * 0.55;
    this.pulseSpeed = 0.02 + Math.random() * 0.04;
    this.pulseVal = Math.random() * Math.PI;
  }

  update(w: number, h: number, energy: number) {
    this.pulseVal += this.pulseSpeed * (1 + energy * 2.2);
    this.x += this.vx * (1 + energy * 2.5);
    this.y += this.vy * (1 + energy * 2.5);
    const dx = this.x - w / 2;
    const dy = this.y - h / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = w * 0.44;
    if (dist > maxDist) {
      const normX = dx / dist;
      const normY = dy / dist;
      this.x = w / 2 + normX * maxDist;
      this.y = h / 2 + normY * maxDist;
      this.vx = -this.vx * 0.8;
      this.vy = -this.vy * 0.8;
    }
  }

  draw(ctx: CanvasRenderingContext2D, energy: number) {
    const currentAlpha = Math.min(1, Math.max(0.12, this.alpha + Math.sin(this.pulseVal) * 0.3 + energy * 0.4));
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * (1 + energy * 0.55), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(165, 243, 252, ${currentAlpha})`;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 4 + energy * 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export function VoiceOrbModal({ isOpen, onClose, initialVoice = 'Kore' }: VoiceOrbModalProps) {
  const { labels, locale } = useLocale();
  const [voice, setVoice] = useState<string>(initialVoice);
  const [listenOnly, setListenOnly] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(true);
  const [statusText, setStatusText] = useState<string>('');
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [messages, setMessages] = useState<VoiceChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<OrbParticle[]>([]);
  const energyRef = useRef<number>(0);

  // Audio recording & playback refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionGenerationRef = useRef(0);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  const playbackAudioCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const micMutedRef = useRef<boolean>(micMuted);
  micMutedRef.current = micMuted;

  // Sequential chunk player - guarantees zero overlap and zero repetition
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      activeSourceRef.current = null;
      setIsAiSpeaking(false);
      return;
    }

    if (!playbackAudioCtxRef.current) return;
    const pCtx = playbackAudioCtxRef.current;
    if (pCtx.state === 'suspended') {
      pCtx.resume();
    }

    const buffer = audioQueueRef.current.shift()!;
    const source = pCtx.createBufferSource();
    source.buffer = buffer;
    activeSourceRef.current = source;

    if (playbackAnalyserRef.current) {
      source.connect(playbackAnalyserRef.current);
      playbackAnalyserRef.current.connect(pCtx.destination);
    } else {
      source.connect(pCtx.destination);
    }

    source.onended = () => {
      if (activeSourceRef.current === source) {
        activeSourceRef.current = null;
      }
      playNextChunk();
    };

    isPlayingRef.current = true;
    setIsAiSpeaking(true);
    source.start(0);
  }, []);

  // Stop incoming audio playback and clear queue
  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        // ignore
      }
      activeSourceRef.current = null;
    }
    isPlayingRef.current = false;
    setIsAiSpeaking(false);
  }, []);

  // Queue and play 24kHz PCM chunk received from Live API
  const queueAudioChunk = useCallback((base64Data: string) => {
    try {
      if (!playbackAudioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: 24000 });
        playbackAudioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        playbackAnalyserRef.current = analyser;
      }

      const pCtx = playbackAudioCtxRef.current;
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      const audioBuffer = pCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);

      // Add to FIFO queue and start player loop if idle
      audioQueueRef.current.push(audioBuffer);
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (err) {
      console.warn('[VoiceOrb] Audio playback decode error:', err);
    }
  }, [playNextChunk]);

  // Stop entire live voice session
  const stopLiveSession = useCallback(async () => {
    ++sessionGenerationRef.current;
    try {
      const api = window.heztech || window.hesatech;
      if (api?.liveSendAudioEnd) await api.liveSendAudioEnd();
      if (api?.liveStop) await api.liveStop();
    } catch {
      // ignore
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
    micAnalyserRef.current = null;

    stopPlayback();
    if (playbackAudioCtxRef.current) {
      playbackAudioCtxRef.current.close().catch(() => {});
      playbackAudioCtxRef.current = null;
    }
    playbackAnalyserRef.current = null;
    setStatusText(labels.voiceOrb.ended);
  }, [labels.voiceOrb.ended, stopPlayback]);

  const attachMicStream = useCallback((stream: MediaStream, audioCtx: AudioContext) => {
    micStreamRef.current = stream;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    micAnalyserRef.current = analyser;

    const micSource = audioCtx.createMediaStreamSource(stream);
    micSource.connect(analyser);

    const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptNodeRef.current = scriptNode;

    const zeroGain = audioCtx.createGain();
    zeroGain.gain.value = 0;
    micSource.connect(scriptNode);
    scriptNode.connect(zeroGain);
    zeroGain.connect(audioCtx.destination);

    const api = window.heztech || window.hesatech;
    scriptNode.onaudioprocess = (e) => {
      // Echo prevention: mute mic while muted OR while assistant is speaking (half-duplex guard)
      if (micMutedRef.current || isPlayingRef.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      let binary = '';
      const bytes = new Uint8Array(int16.buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      api?.liveSendAudio?.(b64);
    };
  }, []);

  // Start live voice session with microphone streaming
  const startLiveSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    try {
      setStatusText(labels.voiceOrb.connecting);
      const api = window.heztech || window.hesatech;

      if (!api?.liveStart) throw new Error('پل ارتباط صوتی برنامه در دسترس نیست.');
      if (api.liveStart) {
        const started = await api.liveStart({
          model: 'gemini-3.8-live',
          voice: voice,
          listenOnly: listenOnly,
        });
        if (generation !== sessionGenerationRef.current) return;
        if (!started?.success) throw new Error(started?.error || 'Voice service is not connected');
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      micAudioCtxRef.current = audioCtx;
      await audioCtx.resume();
      if (generation !== sessionGenerationRef.current) { await audioCtx.close(); return; }

      let stream: MediaStream | null = null;
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (micErr) {
            console.warn('[VoiceOrb] Microphone not available or denied:', micErr);
          }
        }
      }

      if (generation !== sessionGenerationRef.current) {
        stream?.getTracks().forEach(track => track.stop());
        return;
      }
      if (stream) {
        attachMicStream(stream, audioCtx);
        setMicMuted(false);
        setStatusText(labels.voiceOrb.listening);
      } else {
        throw new Error(locale === 'fa' ? 'میکروفون در دسترس نیست؛ مجوز میکروفون ویندوز را بررسی کنید.' : 'Microphone unavailable; check Windows microphone permission.');
      }
    } catch (err: any) {
      if (generation !== sessionGenerationRef.current) return;
      await stopLiveSession();
      console.warn('[VoiceOrb] Start error:', err);
      setStatusText('خطای اتصال صوت: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [voice, listenOnly, labels.voiceOrb.connecting, labels.voiceOrb.listening, labels.voiceOrb.idle, locale, attachMicStream, stopLiveSession]);

  // Auto-scroll chat feed to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, transcript]);

  // Handle text input submission to Live Session
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const txt = inputText.trim();
    if (!txt) return;
    setInputText('');
    const api = window.heztech || window.hesatech;
    const nowTime = new Date().toLocaleTimeString(locale === 'fa' ? 'fa-IR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setMessages((prev) => [
      ...prev,
      {
        id: 'user-' + Date.now(),
        role: 'user',
        text: txt,
        time: nowTime,
      },
    ]);
    if (api?.liveSendText) {
      try {
        const sent = await api.liveSendText(txt);
        if (!sent) throw new Error('نشست صوتی متصل نیست.');
      } catch (err: any) {
        console.warn('[VoiceOrb] liveSendText error:', err);
        setStatusText(err instanceof Error ? err.message : String(err));
      }
    }
  };

  // Handle IPC subscriptions from backend
  useEffect(() => {
    if (!isOpen) return;

    const api = window.heztech || window.hesatech;
    let unsubChunk: (() => void) | undefined;
    let unsubInterrupted: (() => void) | undefined;
    let unsubTranscription: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    let unsubToolStatus: (() => void) | undefined;

    if (api?.onLiveAudioChunk) {
      unsubChunk = api.onLiveAudioChunk((chunk: { data?: string }) => {
        if (chunk?.data) {
          queueAudioChunk(chunk.data);
        }
      });
    }

    if (api?.onLiveInterrupted) {
      unsubInterrupted = api.onLiveInterrupted(() => {
        stopPlayback();
      });
    }

    if (api?.onLiveTranscription) {
      unsubTranscription = api.onLiveTranscription((t: { role?: string; text?: string }) => {
        if (t?.text) {
          const raw = normalizeSpeechTranscript(t.text);
          setTranscript(raw);
          const role = t.role === 'user' ? 'user' : 'assistant';
          const nowTime = new Date().toLocaleTimeString(locale === 'fa' ? 'fa-IR' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === role) {
              return [...prev.slice(0, -1), { ...last, text: raw }];
            }
            return [
              ...prev,
              {
                id: 'msg-' + Date.now() + Math.random(),
                role,
                text: raw,
                time: nowTime,
              },
            ];
          });
        }
      });
    }

    if (api?.onLiveStatus) {
      unsubStatus = api.onLiveStatus((s: any) => {
        const val = typeof s === 'string' ? s : s?.status;
        if (val === 'connected') {
          setStatusText(labels.voiceOrb.listening);
        } else if (val === 'connecting') {
          setStatusText(labels.voiceOrb.connecting);
        } else if (val === 'idle') {
          setStatusText(labels.voiceOrb.idle);
        }
      });
    }

    if (api?.onLiveError) {
      unsubError = api.onLiveError((err: any) => {
        const msg = typeof err === 'string' ? err : err?.error || err?.message || 'خطای اتصال';
        setStatusText(`خطا: ${msg}`);
        setMessages((prev) => [
          ...prev,
          {
            id: 'err-' + Date.now(),
            role: 'tool',
            text: `⚠️ خطا: ${msg}`,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      });
    }

    if (api?.onLiveToolStatus) {
      unsubToolStatus = api.onLiveToolStatus((toolData: any) => {
        const name = toolData?.name || 'tool';
        const state = toolData?.state;
        const nowTime = new Date().toLocaleTimeString();
        if (state === 'executing') {
          setActiveTool(name);
          setMessages((prev) => [
            ...prev,
            {
              id: 'tool-' + Date.now() + Math.random(),
              role: 'tool',
              text: `⚡ فراخوانی ابزار سیستم: ${name}`,
              toolName: name,
              time: nowTime,
            },
          ]);
        } else if (state === 'completed') {
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            {
              id: 'tool-' + Date.now() + Math.random(),
              role: 'tool',
              text: `✓ اجرای موفقیت‌آمیز ابزار: ${name}`,
              toolName: name,
              time: nowTime,
            },
          ]);
        } else if (state === 'error') {
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            {
              id: 'tool-' + Date.now() + Math.random(),
              role: 'tool',
              text: `✗ خطای ابزار ${name}: ${toolData?.error || 'نامشخص'}`,
              toolName: name,
              time: nowTime,
            },
          ]);
        }
      });
    }

    startLiveSession();

    return () => {
      unsubChunk?.();
      unsubInterrupted?.();
      unsubTranscription?.();
      unsubStatus?.();
      unsubError?.();
      unsubToolStatus?.();
      stopLiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Particle constellation and audio energy visual rendering loop
  useEffect(() => {
    if (!isOpen) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const sphere = sphereRef.current;
    const w = 195;
    const h = 195;

    // Initialize 30 particles inside sphere
    const parts: OrbParticle[] = [];
    for (let i = 0; i < 30; i++) {
      parts.push(new OrbParticle(w, h));
    }
    particlesRef.current = parts;

    function renderLoop() {
      const ctx = canvas?.getContext('2d');

      // Compute audio energy from either incoming audio playback or user microphone
      let rawVolume = 0;
      if (isAiSpeaking && playbackAnalyserRef.current) {
        const freqData = new Uint8Array(playbackAnalyserRef.current.frequencyBinCount);
        playbackAnalyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        rawVolume = sum / freqData.length / 85;
      } else if (!micMuted && micAnalyserRef.current) {
        const freqData = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        rawVolume = sum / freqData.length / 75;
      }

      const targetEnergy = Math.min(1, Math.max(0, rawVolume));
      energyRef.current += (targetEnergy - energyRef.current) * 0.22;
      const energy = energyRef.current;

      // Dynamic reactive scale and neon glow for Holographic Central Sphere
      if (sphere) {
        const scale = 1 + energy * 0.28;
        const glowCyan = 50 + energy * 85;
        const glowBlue = 95 + energy * 110;
        sphere.style.transform = `scale(${scale.toFixed(3)})`;
        sphere.style.boxShadow = `
          0 0 ${glowCyan}px rgba(0, 229, 255, ${(0.8 + energy * 0.2).toFixed(2)}),
          0 0 ${glowBlue}px rgba(2, 132, 199, 0.7),
          0 0 ${glowBlue * 1.6}px rgba(0, 110, 255, 0.4),
          inset 0 0 35px rgba(255, 255, 255, ${(0.65 + energy * 0.35).toFixed(2)})
        `;
      }

      // Render constellation nodes and connecting lines on Canvas
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 0.8;
        const currentParticles = particlesRef.current;
        for (let i = 0; i < currentParticles.length; i++) {
          for (let j = i + 1; j < currentParticles.length; j++) {
            const dx = currentParticles[i].x - currentParticles[j].x;
            const dy = currentParticles[i].y - currentParticles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 34) {
              const connAlpha = (1 - dist / 34) * (0.2 + energy * 0.45);
              ctx.beginPath();
              ctx.strokeStyle = `rgba(0, 229, 255, ${connAlpha.toFixed(2)})`;
              ctx.moveTo(currentParticles[i].x, currentParticles[i].y);
              ctx.lineTo(currentParticles[j].x, currentParticles[j].y);
              ctx.stroke();
            }
          }
        }

        currentParticles.forEach((p) => {
          p.update(w, h, energy);
          p.draw(ctx, energy);
        });
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    }

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isOpen, isAiSpeaking, micMuted]);

  if (!isOpen) return null;

  // Format current date matching reference image (e.g. MONDAY, JUNE 22)
  const now = new Date();
  const dateStr = now.toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();

  const handleEnd = () => {
    stopLiveSession();
    onClose();
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = e.target.value;
    setVoice(newVoice);
    // Restart session with new voice
    stopLiveSession().then(() => {
      setTimeout(() => startLiveSession(), 200);
    });
  };

  const toggleListenOnly = () => {
    const next = !listenOnly;
    setListenOnly(next);
    stopLiveSession().then(() => {
      setTimeout(() => startLiveSession(), 200);
    });
  };

  const toggleMic = async () => {
    if (micMuted && !micStreamRef.current) {
      try {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        if (stream) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = micAudioCtxRef.current || new AudioContextClass({ sampleRate: 16000 });
          micAudioCtxRef.current = audioCtx;
          attachMicStream(stream, audioCtx);
          setMicMuted(false);
          setStatusText(labels.voiceOrb.listening);
          return;
        }
      } catch (err) {
        console.warn('[VoiceOrb] Toggle mic error:', err);
      }
    }
    setMicMuted((prev) => !prev);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((f) => !f);
  };

  const displayedStatus = isAiSpeaking
    ? labels.voiceOrb.talking
    : statusText || labels.voiceOrb.listening;

  return (
    <div className={`ht-voice-orb-overlay ${isFullscreen ? 'ht-voice-orb-overlay--fullscreen' : ''}`} role="dialog" aria-modal="true">
      {/* Top Header & Brand Bar */}
      <div className="ht-voice-orb-header">
        <div className="ht-voice-orb-top-bar">
          <div className="ht-voice-orb-brand-left">
            <span className="ht-voice-orb-brand-text">{labels.appName}</span>
          </div>

          <div className="ht-voice-orb-top-actions">
            <button
              type="button"
              className="ht-voice-orb-icon-btn"
              title={labels.notifications}
              aria-label={labels.notifications}
            >
              <Icon name="bell" size={16} />
            </button>
            <button type="button" className="ht-voice-orb-icon-btn" title="View Options">
              <Icon name="eye" size={16} />
            </button>
            <div className="ht-voice-orb-live-badge">
              <span className="ht-voice-orb-live-dot" />
              <span>{labels.voiceOrb.live}</span>
            </div>
            <button
              type="button"
              className="ht-voice-orb-close-btn"
              onClick={handleEnd}
              title={labels.common.close}
              aria-label={labels.common.close}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Center Subhead */}
        <div className="ht-voice-orb-title-group">
          <div className="ht-voice-orb-date">{dateStr}</div>
          <h2 className="ht-voice-orb-heading">{labels.voiceOrb.title}</h2>
          <p className="ht-voice-orb-subheading">{labels.voiceOrb.subtitle}</p>
        </div>
      </div>

      {/* Central 3D Holographic Orb Stage */}
      <div className="ht-voice-orb-stage">
        {/* Expanding Sound Shockwave Rings */}
        <div className="ht-voice-ripple-ring ht-voice-ripple-1" />
        <div className="ht-voice-ripple-ring ht-voice-ripple-2" />
        <div className="ht-voice-ripple-ring ht-voice-ripple-3" />

        {/* Concentric Cyberpunk HUD Orbit Rings & Rotating Arcs */}
        <svg className="ht-voice-orb-hud-svg" viewBox="0 0 340 340">
          {/* Static outer faint guide */}
          <circle cx="170" cy="170" r="162" fill="none" stroke="rgba(0, 229, 255, 0.15)" strokeWidth="1" />
          <circle cx="170" cy="170" r="150" fill="none" stroke="rgba(0, 229, 255, 0.22)" strokeWidth="1.2" strokeDasharray="4 8" />

          {/* Rotating Outer Segmented Ticks (Clockwise 50s) */}
          <g className="ht-voice-orb-hud-rotating-ticks">
            <circle cx="170" cy="170" r="140" fill="none" stroke="rgba(0, 229, 255, 0.38)" strokeWidth="3" strokeDasharray="2 12" />
            <circle cx="170" cy="170" r="128" fill="none" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="1" strokeDasharray="1 6" />
          </g>

          {/* Counter-Rotating Cyan Arc Highlights (Counter-Clockwise 22s) */}
          <g className="ht-voice-orb-hud-rotating-arcs">
            <circle cx="170" cy="170" r="134" fill="none" stroke="rgba(0, 229, 255, 0.85)" strokeWidth="2.5" strokeDasharray="45 120" strokeLinecap="round" />
            <circle cx="170" cy="170" r="134" fill="none" stroke="rgba(139, 92, 246, 0.7)" strokeWidth="2.5" strokeDasharray="30 135" strokeDashoffset="90" strokeLinecap="round" />
            <circle cx="170" cy="170" r="110" fill="none" stroke="rgba(0, 229, 255, 0.45)" strokeWidth="1" strokeDasharray="6 6" />
          </g>
        </svg>

        {/* Luminous Central Glowing Sphere */}
        <div
          ref={sphereRef}
          className="ht-voice-orb-central-sphere"
          title="Voice Orb Reactive Sphere"
        >
          <canvas
            ref={canvasRef}
            className="ht-voice-orb-canvas"
            width={195}
            height={195}
          />
        </div>
      </div>

      {/* Voice Identity, State, & Live Dialogue Stream */}
      <div className="ht-voice-orb-status-area">
        <div className="ht-voice-orb-agent-name">{labels.voiceOrb.agentName}</div>
        <div className="ht-voice-orb-agent-state">
          <span className={`ht-voice-orb-status-dot ${isAiSpeaking ? 'ht-voice-orb-status-dot--speaking' : ''}`} />
          <span>{displayedStatus}</span>
          {activeTool && (
            <span className="ht-voice-orb-active-tool-badge">
              ⚡ {activeTool}
            </span>
          )}
        </div>

        {/* Live Conversation Chat & Dialogue Feed */}
        <div className="ht-voice-orb-dialogue-feed" ref={chatScrollRef}>
          {messages.length === 0 ? (
            <div className="ht-voice-orb-empty-prompt">
              {transcript
                ? `«${transcript}»`
                : (locale === 'fa'
                  ? '«صحبت کنید یا متنی بنویسید؛ ابزارهای CapCut، وب و ویندوز در حالت Full Send متصل هستند...»'
                  : '«Speak or type; CapCut, Web, and Windows tools are active...»')}
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`ht-voice-msg-row ht-voice-msg-row--${m.role}`}
              >
                {m.role === 'tool' ? (
                  <div className="ht-voice-msg-tool-pill">
                    <span>{m.text}</span>
                  </div>
                ) : (
                  <div className={`ht-voice-msg-bubble ht-voice-msg-bubble--${m.role}`}>
                    <div className="ht-voice-msg-sender">
                      {m.role === 'user' ? (locale === 'fa' ? 'شما' : 'You') : labels.voiceOrb.agentName}
                      <span className="ht-voice-msg-time">{m.time}</span>
                    </div>
                    <div className="ht-voice-msg-content">{m.text}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Interactive Text Input inside Voice Orb */}
        <form className="ht-voice-orb-input-row" onSubmit={handleSendText}>
          <input
            type="text"
            className="ht-voice-orb-text-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              locale === 'fa'
                ? 'دستور متنی برای مکالمه زنده و کپ‌کات (مثلاً: پروژه‌های کپ‌کات رو بیار)...'
                : 'Type a message or command (e.g., list CapCut drafts)...'
            }
          />
          <button
            type="submit"
            className="ht-voice-orb-send-btn"
            disabled={!inputText.trim()}
          >
            <span>{locale === 'fa' ? 'ارسال' : 'Send'}</span>
          </button>
        </form>
      </div>

      {/* Bottom Controls Pill Toolbar (Matching Reference Image) */}
      <div className="ht-voice-orb-bottom-bar">
        <div className="ht-voice-orb-pill-row">
          {/* 1. End Button */}
          <button
            type="button"
            className="ht-orb-pill-btn ht-orb-pill-btn--end"
            onClick={handleEnd}
          >
            <Icon name="square" size={14} />
            <span>{labels.voiceOrb.end}</span>
          </button>

          {/* 2. Voice Selector Dropdown (Kore / Puck / Charon / Aoede / Fenrir) */}
          <div className="ht-orb-pill-select-wrap">
            <select
              className="ht-orb-pill-select"
              value={voice}
              onChange={handleVoiceChange}
              aria-label="Select Voice"
            >
              <option value="Kore">Kore ▾</option>
              <option value="Puck">Puck ▾</option>
              <option value="Charon">Charon ▾</option>
              <option value="Aoede">Aoede ▾</option>
              <option value="Fenrir">Fenrir ▾</option>
            </select>
          </div>

          {/* 3. Mode Toggle (Listen-only vs Full Send) */}
          <button
            type="button"
            className={`ht-orb-pill-btn ${listenOnly ? 'ht-orb-pill-btn--active' : ''}`}
            onClick={toggleListenOnly}
          >
            <Icon name={listenOnly ? 'shield' : 'sparkles'} size={14} />
            <span>{listenOnly ? labels.voiceOrb.listenOnly : labels.voiceOrb.fullSend}</span>
          </button>

          {/* 4. Mic Mute / Action Toggle */}
          <button
            type="button"
            className={`ht-orb-pill-btn ${!micMuted ? 'ht-orb-pill-btn--active' : ''}`}
            onClick={toggleMic}
          >
            <Icon name={micMuted ? 'micOff' : 'mic'} size={14} />
            <span>{micMuted ? labels.voiceOrb.micMuted : labels.voiceOrb.micActive}</span>
          </button>

          {/* 5. Fullscreen Toggle */}
          <button
            type="button"
            className="ht-orb-pill-btn ht-orb-pill-btn--icon-only"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
          >
            <Icon name="fit" size={14} />
          </button>
        </div>

        {/* Footnote */}
        <p className="ht-voice-orb-footnote">
          {labels.voiceOrb.footnote}
        </p>
      </div>
    </div>
  );
}
