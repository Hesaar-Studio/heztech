import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { LabelKey } from '@/i18n/labels';
import './ChatComposer.css';

interface ChatComposerProps {
  initialText?: string;
  labels: LabelKey;
  disabled?: boolean;
  sending?: boolean;
  modelName?: string | null;
  onSend: (text: string) => void;
  onCancel?: () => void;
  onAttach?: () => void;
}

export function ChatComposer({
  labels,
  initialText = '',
  disabled,
  sending,
  modelName,
  onSend,
  onCancel,
  onAttach,
}: ChatComposerProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    const handleAutoSend = (e: any) => {
      if (e.detail?.text) {
        onSend(e.detail.text);
      }
    };
    window.addEventListener('heztech:send-chat', handleAutoSend);
    return () => window.removeEventListener('heztech:send-chat', handleAutoSend);
  }, [onSend]);

  useEffect(() => {
    const handleFillChat = (event: Event) => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail?.text;
      if (typeof text === 'string') setText(text);
    };
    window.addEventListener('heztech:fill-chat', handleFillChat);
    return () => window.removeEventListener('heztech:fill-chat', handleFillChat);
  }, []);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form className="ht-composer" onSubmit={handleSubmit}>
      <div className="ht-composer__toolbar">
        {modelName ? (
          <span className="ht-composer__model">
            {labels.assistant.model}: <strong>{modelName}</strong>
          </span>
        ) : (
          <span className="ht-composer__model ht-composer__model--muted">
            {labels.assistant.model}: {labels.notConfigured}
          </span>
        )}
        <div className="ht-composer__toolbar-actions">
          <button
            type="button"
            className="ht-composer__icon-btn"
            onClick={onAttach}
            disabled={disabled || !onAttach}
            title={labels.assistant.attach}
            aria-label={labels.assistant.attach}
          >
            <Icon name="attach" size={18} />
          </button>
          <button
            type="button"
            className="ht-composer__icon-btn ht-composer__icon-btn--voice"
            onClick={() => window.dispatchEvent(new CustomEvent('heztech:open-voice-orb'))}
            title={labels.voiceOrb.openVoice}
            aria-label={labels.voiceOrb.openVoice}
          >
            <Icon name="mic" size={18} />
          </button>
        </div>
      </div>
      <div className="ht-composer__row">
        <textarea
          ref={textareaRef}
          className="ht-composer__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={labels.assistant.placeholder}
          rows={2}
          disabled={disabled}
          aria-label={labels.assistant.placeholder}
        />
        {sending ? (
          <Button type="button" variant="danger" size="md" onClick={onCancel}>
            {labels.assistant.cancel}
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="md" disabled={disabled || !text.trim()}>
            <Icon name="send" size={18} />
            {labels.assistant.send}
          </Button>
        )}
      </div>
    </form>
  );
}
