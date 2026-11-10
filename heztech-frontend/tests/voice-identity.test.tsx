import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { describe, expect, it } from 'vitest';

describe('ARTA voice identity', () => {
  it('shows ARTA as the voice assistant and keeps the microphone muted until a stream exists', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Live Voice Session' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'ARTA — LIVE VOICE' })).toBeInTheDocument();
    expect(within(dialog).getByText('ARTA')).toBeInTheDocument();
    expect(within(dialog).getByText('Mic Muted')).toBeInTheDocument();
    expect(screen.getAllByText('HezTech').length).toBeGreaterThan(0);
  });
});
