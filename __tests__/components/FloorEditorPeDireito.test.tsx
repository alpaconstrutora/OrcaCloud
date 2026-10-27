// @vitest-environment jsdom
/**
 * PÉ-DIREITO POR PAVIMENTO (27/10/2026): *"crie pé-direito por pavimento em empreendimento"*. Torres & Unidades ›
 * Pavimentos ganha "Pé-direito (m)"; vazio = o padrão da torre. Plano: docs/planos/2026-10-27-pe-direito-por-pavimento.md.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listFloors: vi.fn(),
  createFloor: vi.fn(),
}));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import FloorEditor, { lerPeDireito } from '../../components/empreendimento/FloorEditor';

const TORRE = { id: 't1', empreendimento_id: 'e1', name: 'Torre A', pe_direito_padrao_m: 3, created_at: '', updated_at: '' };
const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra });

describe('lerPeDireito', () => {
  it('aceita vírgula ou ponto, vazio é null, fora de 2–15 m é recusado', () => {
    expect(lerPeDireito('3,05')).toBe(3.05);
    expect(lerPeDireito('4.5')).toBe(4.5);
    expect(lerPeDireito('  ')).toBeNull();
    expect(lerPeDireito('1,80')).toBe(false);
    expect(lerPeDireito('abc')).toBe(false);
  });
});

describe('Pavimentos › Pé-direito', () => {
  beforeEach(() => {
    svc.listFloors.mockReset();
    svc.createFloor.mockReset();
  });

  it('a tabela mostra o do pavimento e, sem ele, o padrão da torre', async () => {
    svc.listFloors.mockResolvedValue([pav({ id: 'f0', name: 'Térreo', tipo: 'TERREO', floor_number: 0, pe_direito_m: 4.5 }), pav({ id: 'f1', name: 'Tipo', floor_number: 1, sort_order: 1, pe_direito_m: null })]);
    render(<FloorEditor tower={TORRE as never} />);
    await waitFor(() => expect(screen.getByText('4,50 m')).toBeInTheDocument());
    expect(screen.getByText('3,00 m (torre)')).toBeInTheDocument();
  });

  it('adicionar grava o pé-direito digitado; fora da faixa não grava', async () => {
    svc.listFloors.mockResolvedValue([]);
    svc.createFloor.mockImplementation(async (p: Record<string, unknown>) => ({ ...pav(p), id: 'novo' }));
    render(<FloorEditor tower={TORRE as never} />);
    await waitFor(() => expect(svc.listFloors).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Nome *'), 'Térreo');
    await userEvent.type(screen.getByLabelText('Nº inicial *'), '0');
    await userEvent.type(screen.getByLabelText('Pé-direito (m)'), '1,5');
    await userEvent.click(screen.getByRole('button', { name: /Adicionar pavimento/ }));
    expect(svc.createFloor).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Pé-direito (m)'));
    await userEvent.type(screen.getByLabelText('Pé-direito (m)'), '4,50');
    await userEvent.click(screen.getByRole('button', { name: /Adicionar pavimento/ }));
    await waitFor(() => expect(svc.createFloor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Térreo', floor_number: 0, pe_direito_m: 4.5 })));
  });
});
