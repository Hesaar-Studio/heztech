import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="assistant" element={<div>Assistant</div>} />
          <Route path="agents" element={<div>Agents</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Navigation', () => {
  it('renders sidebar with nav items', () => {
    renderShell();
    const nav = screen.getByLabelText('Main navigation');
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText('Home')).toBeInTheDocument();
    expect(within(nav).getByText('ARTA')).toBeInTheDocument();
    expect(within(nav).getByText('HezTech')).toBeInTheDocument();
    expect(within(nav).getByText('Agents')).toBeInTheDocument();
  });

  it('shows language toggle', () => {
    renderShell();
    expect(screen.getByLabelText('Toggle language')).toBeInTheDocument();
  });
});
