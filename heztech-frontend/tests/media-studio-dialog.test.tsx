import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaStudioPage } from '@/pages/MediaStudioPage';

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() {
    this.setAttribute('open', '');
  }
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  }
});

describe('Media Studio accessible text overlay dialog', () => {
  it('replaces browser prompts with an accessible dialog and submits overlay text', async () => {
    const addText = vi.fn().mockResolvedValue({ success: true });
    (window as any).heztech = {
      capcutGetStatus: vi.fn().mockResolvedValue({ success: true }),
      capcutListDrafts: vi.fn().mockResolvedValue({ success: true, drafts: [{ name: 'Project A' }] }),
      capcutAddText: addText
    };
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('window.prompt must not be used');
    });

    render(<MediaStudioPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Add Text/i }));

    const dialog = screen.getByRole('dialog', { name: /Add text to draft/i });
    const textbox = screen.getByRole('textbox', { name: /Text overlay/i });
    fireEvent.change(textbox, { target: { value: 'A title card' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Add text/i }));

    await waitFor(() => expect(addText).toHaveBeenCalledWith({ name: 'Project A', text: 'A title card' }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    expect(await screen.findByRole('status')).toHaveTextContent('Text added to the draft.');
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
    delete (window as any).heztech;
  });
});
