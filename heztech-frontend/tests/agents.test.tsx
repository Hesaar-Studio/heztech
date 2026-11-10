import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentsPage } from '@/pages/AgentsPage';

describe('Agents Command Center', () => {
  it('switches between Operations and Architecture views', () => {
    render(
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>
    );
    const ops = screen.getByRole('tab', { name: /operations/i });
    const arch = screen.getByRole('tab', { name: /architecture/i });
    expect(ops).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(arch);
    expect(arch).toHaveAttribute('aria-selected', 'true');
  });

  it('identifies ARTA as the master assistant while retaining the HezTech brand', () => {
    render(
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'ARTA' })).toBeInTheDocument();
    expect(screen.queryByText(/HezTech Assistant/i)).not.toBeInTheDocument();
  });

  it('labels the approval notification panel as ARTA notifications', async () => {
    render(
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'ARTA notifications' }));
    expect(await screen.findByRole('dialog', { name: 'ARTA notifications' })).toBeInTheDocument();
  });

  it('selects an agent node and shows inspector', () => {
    render(
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>
    );
    const nodes = screen.getAllByRole('button');
    const research = nodes.find((n) => n.textContent?.includes('Research'));
    expect(research).toBeTruthy();
    if (research) fireEvent.click(research);
    expect(screen.getByLabelText(/Inspector/i)).toBeInTheDocument();
  });
});
