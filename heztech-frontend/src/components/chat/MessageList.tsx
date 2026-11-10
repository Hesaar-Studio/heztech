import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { ConversationMessage } from '@/types';
import type { LabelKey } from '@/i18n/labels';
import { Icon } from '@/components/ui/Icon';
import './MessageList.css';

interface MessageListProps {
  messages: ConversationMessage[];
  labels: LabelKey;
  emptyTitle: string;
  emptyHint: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  message: ConversationMessage;
  element: HTMLElement;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const api = window.heztech || window.hesatech;
    if (api?.writeClipboard) {
      const res = await api.writeClipboard(text);
      if (res?.success) return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[Clipboard] Error writing to clipboard:', err);
  }
  return false;
}

async function saveMessageFile(filename: string, content: string, ext = 'md'): Promise<boolean> {
  try {
    const api = window.heztech || window.hesatech;
    if (api?.saveFile) {
      const res = await api.saveFile({
        defaultPath: filename,
        content: content,
        filters: ext === 'md'
          ? [
              { name: 'Markdown Document', extensions: ['md'] },
              { name: 'Text Document', extensions: ['txt'] },
              { name: 'JSON Document', extensions: ['json'] },
            ]
          : [
              { name: 'Text Document', extensions: ['txt'] },
              { name: 'Markdown Document', extensions: ['md'] },
            ],
      });
      if (res?.success) return true;
    }
  } catch (err) {
    console.warn('[SaveDialog] Native save error, using browser fallback:', err);
  }

  // Browser download fallback
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('[Download] Failed to download message file:', err);
    return false;
  }
}

function findScrollContainer(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const style = getComputedStyle(el);
    const scrollable = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4;
    if (scrollable) return el;
    el = el.parentElement;
  }
  return null;
}

export function MessageList({ messages, labels, emptyTitle, emptyHint }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listKeyRef = useRef<string>('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const scroller = findScrollContainer(bottomRef.current) || findScrollContainer(el);
    if (!scroller) return;

    // A different conversation must always open at its newest message.
    const listKey = messages[0]?.id || 'empty';
    const isNewList = listKey !== listKeyRef.current;
    listKeyRef.current = listKey;

    const last = messages[messages.length - 1];
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const pinned = distanceFromBottom < 160;

    // Reading history is never interrupted; a message the owner just sent is.
    if (!isNewList && !pinned && last?.role !== 'user') return;

    const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
    toBottom();
    requestAnimationFrame(toBottom);
  }, [messages]);

  // Close context menu on outside click or scroll or Esc
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.ht-context-menu')) {
        setContextMenu(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    }
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleCopyMessage = async (msg: ConversationMessage) => {
    const textToCopy = msg.content || '';
    if (!textToCopy) return;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId((curr) => (curr === msg.id ? null : curr)), 2000);
    }
  };

  const handleCopyCode = async (code: string) => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedCodeSnippet(code);
      setTimeout(() => setCopiedCodeSnippet((curr) => (curr === code ? null : curr)), 2000);
    }
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>, message: ConversationMessage) => {
    e.preventDefault();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 200),
      message,
      element: e.currentTarget,
    });
  };

  const handleSelectAllInMessage = () => {
    if (!contextMenu?.element) return;
    const bodyEl = contextMenu.element.querySelector('.ht-message__body');
    if (!bodyEl) return;
    const range = document.createRange();
    range.selectNodeContents(bodyEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setContextMenu(null);
  };

  // Persian-majority text is laid out right-to-left; English stays LTR. Using
  // one paragraph direction per message lets the Unicode bidi algorithm place
  // Latin runs and punctuation correctly inside Persian sentences.
  const textDirection = (text: string): 'rtl' | 'ltr' => {
    const persian = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return persian > 0 && persian >= latin ? 'rtl' : 'ltr';
  };

  // Inline formatting for model output. Kept as React nodes (never raw HTML) so
  // the renderer stays safe, and model scratchpad blocks are dropped.
  const renderInline = (text: string): ReactNode[] => {
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const nodes: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let key = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(cleaned)) !== null) {
      if (match.index > lastIndex) nodes.push(cleaned.slice(lastIndex, match.index));
      const token = match[0];
      if (token.startsWith('**')) {
        nodes.push(<strong key={`b${key++}`}>{token.slice(2, -2)}</strong>);
      } else {
        nodes.push(<code key={`c${key++}`} className="ht-inline-code">{token.slice(1, -1)}</code>);
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < cleaned.length) nodes.push(cleaned.slice(lastIndex));
    return nodes;
  };

  // Render message content with formatted code blocks and "Copy Code" button
  const renderBody = (content: string) => {
    if (!content) return null;
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const inner = part.slice(3, -3);
        const firstLineBreak = inner.indexOf('\n');
        let lang = 'code';
        let code = inner;
        if (firstLineBreak !== -1) {
          lang = inner.slice(0, firstLineBreak).trim() || 'code';
          code = inner.slice(firstLineBreak + 1);
        }
        const isThisCopied = copiedCodeSnippet === code;

        return (
          <div key={index} className="ht-code-block" dir="ltr">
            <div className="ht-code-block__header">
              <span className="ht-code-block__lang">{lang}</span>
              <button
                type="button"
                className={`ht-code-block__copy-btn ${isThisCopied ? 'ht-code-block__copy-btn--copied' : ''}`}
                onClick={() => handleCopyCode(code)}
                title="کپی کد"
              >
                <Icon name={isThisCopied ? 'check' : 'document'} size={13} />
                <span>{isThisCopied ? 'کپی شد' : 'کپی کد'}</span>
              </button>
            </div>
            <pre className="ht-code-block__pre">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return <span key={index}>{renderInline(part)}</span>;
    });
  };

  if (messages.length === 0) {
    return (
      <div className="ht-empty-state ht-messages-empty">
        <h3>{emptyTitle}</h3>
        <p>{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="ht-messages" role="log" aria-live="polite" ref={listRef}>
      {messages.map((m) => {
        const isCopied = copiedMsgId === m.id;
        const roleLabel = m.role === 'user' ? 'You' : m.role === 'assistant' ? labels.agents.masterAgent : m.role;

        return (
          <div
            key={m.id}
            className={`ht-message ht-message--${m.role}${m.error ? ' ht-message--error' : ''}`}
            onContextMenu={(e) => handleContextMenu(e, m)}
          >
            <div className="ht-message__top-row">
              <div className="ht-message__meta">
                <span className="ht-message__role">{roleLabel}</span>
                {m.model && <span className="ht-message__model">{m.model}</span>}
                {m.isStreaming && <span className="ht-message__streaming">{labels.common.loading}</span>}
              </div>

              {/* Message Action Bar (Copy & Download) */}
              <div className="ht-message__actions">
                <button
                  type="button"
                  className={`ht-message__action-btn ${isCopied ? 'ht-message__action-btn--copied' : ''}`}
                  onClick={() => handleCopyMessage(m)}
                  title={isCopied ? 'کپی شد' : 'کپی متن'}
                  aria-label="Copy message"
                >
                  <Icon name={isCopied ? 'check' : 'document'} size={14} />
                  <span>{isCopied ? 'کپی شد' : 'کپی'}</span>
                </button>

                <button
                  type="button"
                  className="ht-message__action-btn"
                  onClick={() => saveMessageFile(`heztech-response-${Date.now()}.md`, m.content || '', 'md')}
                  title="دانلود به عنوان Markdown"
                  aria-label="Download message as markdown"
                >
                  <Icon name="fileText" size={14} />
                  <span>MD</span>
                </button>
              </div>
            </div>

            <div className="ht-message__body" dir={textDirection(m.content || '')}>
              {m.error ? m.error : renderBody(m.content || (m.isStreaming ? '…' : ''))}
            </div>

            {m.toolCalls && m.toolCalls.length > 0 && (
              <ul className="ht-message__tools">
                {m.toolCalls.map((t) => (
                  <li key={t.id}>
                    <span className={`ht-badge ht-badge--${t.status === 'done' ? 'success' : 'muted'}`}>
                      <Icon name="cpu" size={12} /> {t.name} · {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />

      {/* Floating Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="ht-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          role="menu"
        >
          <button
            type="button"
            className="ht-context-menu__item"
            onClick={async () => {
              await copyToClipboard(contextMenu.message.content || '');
              setContextMenu(null);
            }}
          >
            <Icon name="document" size={15} />
            <span>کپی متن (Copy)</span>
          </button>

          <button
            type="button"
            className="ht-context-menu__item"
            onClick={async () => {
              const roleTitle = contextMenu.message.role === 'assistant' ? labels.agents.masterAgent : 'User';
              const md = `### ${roleTitle}\n\n${contextMenu.message.content || ''}\n`;
              await copyToClipboard(md);
              setContextMenu(null);
            }}
          >
            <Icon name="fileText" size={15} />
            <span>کپی به عنوان مارک‌داون (Markdown)</span>
          </button>

          <button
            type="button"
            className="ht-context-menu__item"
            onClick={handleSelectAllInMessage}
          >
            <Icon name="chess" size={15} />
            <span>انتخاب همه متن پیام (Select All)</span>
          </button>

          <div className="ht-context-menu__divider" />

          <button
            type="button"
            className="ht-context-menu__item"
            onClick={() => {
              saveMessageFile(`heztech-response-${Date.now()}.md`, contextMenu.message.content || '', 'md');
              setContextMenu(null);
            }}
          >
            <Icon name="save" size={15} />
            <span>ذخیره به عنوان فایل MD...</span>
          </button>

          <button
            type="button"
            className="ht-context-menu__item"
            onClick={() => {
              saveMessageFile(`heztech-response-${Date.now()}.txt`, contextMenu.message.content || '', 'txt');
              setContextMenu(null);
            }}
          >
            <Icon name="fileText" size={15} />
            <span>ذخیره به عنوان فایل TXT...</span>
          </button>
        </div>
      )}
    </div>
  );
}
