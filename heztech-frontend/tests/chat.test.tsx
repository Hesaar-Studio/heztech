import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssistantPage } from '@/pages/AssistantPage';
import { labels } from '@/i18n/labels';

class SpeechRecognitionMock {
  static current: SpeechRecognitionMock | null = null;
  lang = '';
  continuous = true;
  interimResults = true;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    SpeechRecognitionMock.current = this;
  }

  start() {}
  stop() { this.onend?.(); }
  abort() {}
}

describe('Assistant chat', () => {
  it('shows disconnected state when no adapter', () => {
    render(
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    );
    expect(screen.getAllByText(/Not Connected|متصل نیست|Backend adapter/i).length).toBeGreaterThan(0);
  });

  it('uses ARTA as the chat assistant name without changing the HezTech product brand', () => {
    render(
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /ARTA.*اَرتا/ })).toBeInTheDocument();
    expect(screen.getByText('ARTA')).toBeInTheDocument();
    expect(labels.en.appName).toBe('HezTech');
    expect(labels.fa.appName).toBe('HezTech');
    expect(screen.getByText(/Start a conversation with ARTA/i)).toBeInTheDocument();
    expect(screen.queryByText(/HezTech Assistant/i)).not.toBeInTheDocument();
  });

  it('composer is disabled without adapter', () => {
    render(
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    );
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('identifies ARTA and puts user-started speech in the composer for review', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: SpeechRecognitionMock,
    });

    try {
      render(
        <MemoryRouter>
          <AssistantPage />
        </MemoryRouter>
      );
      expect(screen.getAllByRole('heading', { name: /ARTA/ }).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
      const recognition = SpeechRecognitionMock.current;
      expect(recognition?.lang).toBe('en-US');
      expect(recognition?.continuous).toBe(false);
      act(() => recognition?.onresult?.({ results: [[{ transcript: 'Hey Arta' }]] }));

      expect(screen.getByRole('textbox')).toHaveValue('Hey Arta');
      expect(screen.getByText(/Review it before sending/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Stop microphone' })).toBeInTheDocument();
    } finally {
      delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
      SpeechRecognitionMock.current = null;
    }
  });
});
