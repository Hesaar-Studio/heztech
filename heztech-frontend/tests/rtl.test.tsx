import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';

describe('RTL / LTR', () => {
  it('toggles document direction on language switch', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const toggle = screen.getByLabelText('Toggle language');
    expect(document.documentElement.dir).toBe('ltr');
    fireEvent.click(toggle);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('fa');
  });
});
