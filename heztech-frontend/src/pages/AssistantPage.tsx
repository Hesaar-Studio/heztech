import { useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import { useAdapters } from '@/hooks/useAdapters';
import type { Conversation, ConversationMessage, ModelInfo } from '@/types';
import './AssistantPage.css';

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  error?: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function AssistantPage() {
  const { labels, locale } = useLocale();
  const location = useLocation();
  const { chat } = useAdapters();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(location.state?.conversationId || null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [modelMode, setModelMode] = useState<'offline' | 'auto' | 'online'>('auto');

  // Provider mode is persisted in the app config, not in component state only.
  const heztechApi = (window as unknown as {
    heztech?: { setModelMode?: (m: string) => Promise<{ success?: boolean; error?: string }>; getConfig?: () => Promise<{ config?: { modelMode?: string } }> };
    hesatech?: { setModelMode?: (m: string) => Promise<{ success?: boolean; error?: string }>; getConfig?: () => Promise<{ config?: { modelMode?: string } }> };
  }).heztech || (window as unknown as { hesatech?: { setModelMode?: (m: string) => Promise<{ success?: boolean; error?: string }>; getConfig?: () => Promise<{ config?: { modelMode?: string } }> } }).hesatech;

  useEffect(() => {
    heztechApi?.getConfig?.().then((res) => {
      const saved = res?.config?.modelMode;
      if (saved === 'offline' || saved === 'online' || saved === 'auto') setModelMode(saved);
    }).catch(() => {});
  }, [heztechApi]);

  const applyMode = async (next: 'offline' | 'auto' | 'online') => {
    const res = await heztechApi?.setModelMode?.(next);
    if (res && res.success === false) {
      setError(res.error || 'ذخیرهٔ حالت مدل ناموفق بود.');
      return;
    }
    setModelMode(next);
    if (next === 'offline') {
      const local = models.find((m) => m.id === 'local-offline-brain');
      if (local && chat) {
        const applied = await chat.setSelectedModel(local.id);
        if (applied.ok) setModel(local);
      }
    }
  };
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [targetAgent, setTargetAgent] = useState<string | null>(location.state?.agentName || null);
  const [targetAgentId, setTargetAgentId] = useState<string | null>(location.state?.agentId || null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [attachmentDraft, setAttachmentDraft] = useState('');
  async function handleAttach() {
    try {
      const api = window.heztech || window.hesatech;
      const res = await api.pickTextAttachment();
      if (!res.success) throw new Error(res.error || 'Attachment unavailable');
      if (!res.canceled) setAttachmentDraft((document.querySelector('textarea.ht-composer__input') as HTMLTextAreaElement)?.value + '\n\n[Attachment: ' + res.name + ']\n' + res.content);
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  const connected = !!chat;
  const lastAssistantMessage = [...messages].reverse().find(
    (message) => message.role === 'assistant' && !message.isStreaming && message.content.trim()
  );

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  function togglePushToTalk() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError(locale === 'fa'
        ? 'تشخیص گفتار در این نسخهٔ مرورگر در دسترس نیست.'
        : 'Speech recognition is unavailable in this browser.');
      return;
    }

    setVoiceError(null);
    try {
      const recognition = new Recognition();
      recognition.lang = locale === 'fa' ? 'fa-IR' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) {
          window.dispatchEvent(new CustomEvent('heztech:fill-chat', { detail: { text: transcript } }));
          setVoiceError(locale === 'fa'
            ? 'متن تشخیص‌داده‌شده در کادر پیام قرار گرفت؛ پیش از ارسال آن را بازبینی کنید.'
            : 'Transcript added to the composer. Review it before sending.');
        }
      };
      recognition.onerror = (event) => {
        setVoiceError(event.error === 'not-allowed'
          ? (locale === 'fa' ? 'اجازهٔ میکروفون داده نشد.' : 'Microphone permission was denied.')
          : (locale === 'fa' ? 'تشخیص گفتار ناموفق بود.' : 'Speech recognition failed.'));
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (error) {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleSpeechOutput() {
    if (typeof window.speechSynthesis === 'undefined') {
      setVoiceError(locale === 'fa' ? 'پخش گفتار در دسترس نیست.' : 'Spoken responses are unavailable.');
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!lastAssistantMessage) return;

    setVoiceError(null);
    const utterance = new SpeechSynthesisUtterance(lastAssistantMessage.content.slice(0, 4000));
    utterance.lang = locale === 'fa' ? 'fa-IR' : 'en-US';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setVoiceError(locale === 'fa' ? 'پخش پاسخ صوتی ناموفق بود.' : 'Spoken response failed.');
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  // Sync target agent if navigated with new state
  useEffect(() => {
    if (location.state?.agentName) {
      setTargetAgent(location.state.agentName);
      setTargetAgentId(location.state.agentId || null);
    }
  }, [location.state]);

  const loadConversations = useCallback(async () => {
    if (!chat) return;
    const res = await chat.listConversations();
    if (res.ok) setConversations(res.data);
    else setError(res.error);
  }, [chat]);

  const loadMessages = useCallback(
    async (id: string) => {
      if (!chat) return;
      const res = await chat.getMessages(id);
      if (res.ok) setMessages(res.data);
      else setError(res.error);
    },
    [chat]
  );

  useEffect(() => {
    if (!chat) {
      setError(labels.disconnectedHint);
      return;
    }
    setError(null);
    loadConversations();
    chat.listModels().then((r) => {
      if (r.ok) setModels(r.data);
      else setError(r.error);
    });
    chat.getSelectedModel().then((r) => {
      if (r.ok) setModel(r.data);
      else setError(r.error);
    });
  }, [chat, loadConversations, labels.disconnectedHint]);

  useEffect(() => {
    if (sending) return;
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  async function handleNew() {
    if (!chat) return;
    const res = await chat.createConversation();
    if (res.ok) {
      setConversations((prev) => [res.data, ...prev]);
      setActiveId(res.data.id);
      setMessages([]);
    } else {
      setError(res.error);
    }
  }

  async function handleSend(text: string) {
    if (!chat || sending) return;
    setSending(true);
    let convId = activeId;
    if (!convId) {
      const created = await chat.createConversation(text.slice(0, 48));
      if (!created.ok) {
        setSending(false);
        setError(created.error);
        return;
      }
      convId = created.data.id;
      setConversations((prev) => [created.data, ...prev]);
      setActiveId(convId);
    }

    const userMsg: ConversationMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const streamId = `local-assistant-${Date.now()}`;
    const assistantMsg: ConversationMessage = {
      id: streamId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      model: model?.name,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const chunk of chat.sendMessage(convId, text, {
        modelId: model?.id,
        agentId: targetAgentId || undefined,
        signal: controller.signal,
      })) {
        if (chunk.type === 'token') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId ? { ...m, content: m.content + chunk.content } : m
            )
          );
        } else if (chunk.type === 'tool') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId
                ? {
                    ...m,
                    toolCalls: [...(m.toolCalls || []), chunk.tool],
                  }
                : m
            )
          );
        } else if (chunk.type === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId
                ? {
                    ...m,
                    id: chunk.messageId,
                    isStreaming: false,
                    model: [
                      chunk.model,
                      chunk.provider,
                      chunk.latencyMs == null ? null : `${chunk.latencyMs} ms`,
                    ].filter(Boolean).join(' · ') || m.model,
                  }
                : m
            )
          );
        } else if (chunk.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId ? { ...m, isStreaming: false, error: chunk.error } : m
            )
          );
          setError(chunk.error);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== 'Aborted') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamId ? { ...m, isStreaming: false, error: msg } : m
          )
        );
        setError(msg);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    if (chat && activeId) chat.cancelStream(activeId);
  }

  async function handleExportConversation() {
    if (messages.length === 0) return;
    const activeConv = conversations.find((c) => c.id === activeId);
    const title = activeConv?.title || `${labels.agents.masterAgent} Conversation`;
    let md = `# ${title}\n\n`;
    md += `- **Date:** ${new Date().toLocaleString()}\n`;
    md += `- **Messages:** ${messages.length}\n`;
    md += `- **Model:** ${model?.name || 'Gemini'}\n\n`;
    md += `---\n\n`;

    messages.forEach((m) => {
      const sender = m.role === 'user' ? 'User' : labels.agents.masterAgent;
      const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : '';
      md += `### ${sender} ${timeStr ? `*(${timeStr})*` : ''}\n\n`;
      if (m.model) md += `> **Model:** \`${m.model}\`\n\n`;
      md += `${m.content || ''}\n\n`;
      if (m.toolCalls && m.toolCalls.length > 0) {
        md += `> **Tools:** ${m.toolCalls.map((t) => `\`${t.name}\` (${t.status})`).join(', ')}\n\n`;
      }
      md += `---\n\n`;
    });

    const filename = `heztech-chat-${activeId || Date.now()}.md`;
    try {
      const api = window.heztech || window.hesatech;
      if (api?.saveFile) {
        const res = await api.saveFile({
          defaultPath: filename,
          content: md,
          filters: [
            { name: 'Markdown Document', extensions: ['md'] },
            { name: 'Text Document', extensions: ['txt'] },
          ],
        });
        if (res?.success) return;
      }
    } catch (err) {
      console.warn('Native save dialog error, falling back to browser download:', err);
    }

    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export download failed:', e);
    }
  }

  return (
    <div className="ht-assistant">
      {/* Sidebar Conversation History */}
      <aside
        className={`ht-assistant__history ${historyOpen ? '' : 'ht-assistant__history--closed'}`}
        aria-label={labels.assistant.history}
      >
        <div className="ht-assistant__history-header">
          <h2>{labels.assistant.history}</h2>
          <Button variant="accent" size="sm" onClick={handleNew} disabled={!connected || sending}>
            <Icon name="plus" size={16} />
            {labels.assistant.newConversation}
          </Button>
        </div>
        {!connected ? (
          <div className="ht-disconnected" style={{ margin: '12px' }}>
            {labels.notConnected}
          </div>
        ) : conversations.length === 0 ? (
          <div className="ht-empty-state" style={{ minHeight: 120 }}>
            <p>{labels.empty.noConversations}</p>
          </div>
        ) : (
          <ul className="ht-assistant__conv-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`ht-assistant__conv ${activeId === c.id ? 'ht-assistant__conv--active' : ''}`}
                  disabled={sending}
                  onClick={() => setActiveId(c.id)}
                >
                  <span className="ht-assistant__conv-title">{c.title || 'Untitled'}</span>
                  <span className="ht-assistant__conv-meta">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main Chat Workspace */}
      <section className="ht-assistant__main">
        {/* Topbar with Transparent Backend Status & Target Agent Badge */}
        <div className="ht-assistant__topbar">
          <div className="ht-assistant__topbar-left">
            <button
              type="button"
              className="ht-assistant__toggle-hist"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-label={historyOpen ? labels.common.collapse : labels.common.expand}
            >
              <Icon name={historyOpen ? 'panelClose' : 'panelOpen'} size={18} />
            </button>
            <div className="ht-assistant__identity">
              <h1 className="ht-assistant__title">ARTA <span lang="fa">اَرتا</span></h1>
              <span>{locale === 'fa' ? 'دستیار هوشمند HezTech' : 'Digital operations assistant for HezTech'}</span>
            </div>

            {/* Target Agent Context Badge when routed from "Ask this agent" */}
            {targetAgent && (
              <div className="ht-assistant__agent-badge">
                <Icon name="bot" size={14} />
                <span>{locale === 'fa' ? `عامل هدف: ${targetAgent}` : `Focus Agent: ${targetAgent}`}</span>
                <button
                  type="button"
                  className="ht-assistant__agent-badge-close"
                  onClick={() => {
                    setTargetAgent(null);
                    setTargetAgentId(null);
                  }}
                  aria-label="Remove focus agent"
                  title="Clear agent filter"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="ht-assistant__topbar-right">
            {/* Export Full Conversation Button */}
            <button
              type="button"
              className="ht-assistant__export-btn"
              onClick={handleExportConversation}
              disabled={messages.length === 0}
              title={locale === 'fa' ? 'خروجی کل مکالمه (Markdown)' : 'Export conversation as Markdown'}
              aria-label="Export conversation"
            >
              <Icon name="fileText" size={14} />
              <span>{locale === 'fa' ? 'خروجی مکالمه' : 'Export Chat'}</span>
            </button>

            {/* Transparent Backend Connection Status */}
            <div className="ht-assistant__backend-badge">
              <span
                className={`ht-assistant__status-dot ${
                  connected ? 'ht-assistant__status-dot--online' : 'ht-assistant__status-dot--offline'
                }`}
              />
              <span className="ht-assistant__status-text">
                {connected
                  ? `Backend: Live · ${model?.name || 'Gemini 3.5 Flash'}`
                  : 'Backend: Disconnected'}
              </span>
            </div>

            {/* Provider mode: offline / auto / online */}
            <div className="ht-assistant__mode-switch" role="group" aria-label="حالت ارائه‌دهندهٔ مدل">
              {(['offline', 'auto', 'online'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`ht-assistant__mode-btn${modelMode === mode ? ' ht-assistant__mode-btn--active' : ''}`}
                  aria-pressed={modelMode === mode}
                  disabled={sending}
                  onClick={() => { void applyMode(mode); }}
                >
                  {mode === 'offline' ? 'آفلاین' : mode === 'auto' ? 'خودکار' : 'آنلاین'}
                </button>
              ))}
            </div>

            {/* Model Selector */}
            <select
              aria-label="Model"
              className="ht-assistant__model-select"
              value={model?.id || ''}
              disabled={sending || !chat}
              onChange={async (e) => {
                const selected = models.find((m) => m.id === e.target.value);
                if (selected && chat) {
                  const result = await chat.setSelectedModel(selected.id);
                  if (result.ok) setModel(selected);
                  else setError(result.error);
                }
              }}
            >
              <option value="" disabled>
                —
              </option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.verified ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ht-assistant__voice-controls">
          <div className="ht-assistant__voice-copy">
            <strong>{locale === 'fa' ? 'ورودی صوتیِ فشاری' : 'Push-to-talk'}</strong>
            <span>{locale === 'fa'
              ? 'میکروفون فقط با انتخاب شما فعال است؛ واژهٔ بیدارباش فعال نیست. پردازش محلی تضمین نمی‌شود.'
              : 'Microphone is user-activated only; no wake word is enabled. Local processing is not guaranteed.'}</span>
          </div>
          <div className="ht-assistant__voice-actions">
            <button
              type="button"
              className={`ht-assistant__voice-btn ${listening ? 'ht-assistant__voice-btn--active' : ''}`}
              onClick={togglePushToTalk}
              aria-pressed={listening}
            >
              <Icon name={listening ? 'micOff' : 'mic'} size={16} />
              {listening
                ? (locale === 'fa' ? 'توقف میکروفون' : 'Stop microphone')
                : (locale === 'fa' ? 'شروع گفتار' : 'Start voice input')}
            </button>
            <button
              type="button"
              className="ht-assistant__voice-btn"
              onClick={toggleSpeechOutput}
              disabled={!lastAssistantMessage}
              aria-pressed={speaking}
            >
              <Icon name={speaking ? 'volumeX' : 'volume2'} size={16} />
              {speaking
                ? (locale === 'fa' ? 'توقف پخش' : 'Stop speaking')
                : (locale === 'fa' ? 'خواندن پاسخ' : 'Speak last reply')}
            </button>
          </div>
          {voiceError && <p className="ht-assistant__voice-status" role="status">{voiceError}</p>}
        </div>

        {error && (
          <div className="ht-disconnected" role="alert" style={{ margin: '0 16px' }}>
            <Icon name="alert" size={16} />
            {error}
          </div>
        )}

        <MessageList
          messages={messages}
          labels={labels}
          emptyTitle={
            targetAgent
              ? `${targetAgent} is ready to assist`
              : labels.empty.noMessages
          }
          emptyHint={
            targetAgent
              ? `Ask ${targetAgent} to analyze telemetry, run tools, or coordinate actions.`
              : connected
                ? labels.assistant.placeholder
                : labels.disconnectedHint
          }
        />

        <ChatComposer
          initialText={attachmentDraft || location.state?.draft || ''}
          labels={labels}
          disabled={!connected}
          sending={sending}
          modelName={model?.name}
          onSend={handleSend}
          onCancel={handleCancel}
          onAttach={handleAttach}
        />
      </section>
    </div>
  );
}
