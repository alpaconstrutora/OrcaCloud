// @vitest-environment jsdom
/**
 * CUB de referência do CAPEX: lê do empreendimento só a UF do terreno, não a linha
 * inteira (pendência da Fase 5 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

const emp = vi.hoisted(() => ({ getById: vi.fn(), camposDoEmpreendimento: vi.fn() }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: emp }));
vi.mock('../../services/cubService', () => ({ cubDoPadrao: vi.fn().mockResolvedValue(null) }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import ImovibCubReferencia from '../../components/ImovibCubReferencia';
import { baseStudy } from '../fixtures/imovibEstudos';

describe('CUB de referência', () => {
    it('estudo vinculado: lê só terreno_state do empreendimento', async () => {
        emp.camposDoEmpreendimento.mockResolvedValue({ terreno_state: 'MT' });
        render(<ImovibCubReferencia study={baseStudy({ estrutura: { origem: 'empreendimento', empreendimento_id: 'emp-1' } }) as never} onReferencia={vi.fn()} />);
        await waitFor(() => expect(emp.camposDoEmpreendimento).toHaveBeenCalledWith('emp-1', ['terreno_state']));
        expect(emp.getById).not.toHaveBeenCalled();
        await waitFor(() => expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('MT'));
    });
});
