// @vitest-environment jsdom
/**
 * Coluna "Organização" em Tributos a Pagar (22/10/2026).
 * Plano: docs/planos/2026-10-22-tributos-coluna-organizacao.md
 *
 * Folha e pró-labore geram tributos para Alpa e Garden; em "Todas as organizações" a
 * lista não dizia de qual era cada linha. A coluna usa a lista `organizations` que a
 * tela já recebe (nenhuma consulta nova) e acompanha o filtro avançado, a ordenação
 * e o Agrupar.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ viewFocus: null, setViewFocus: () => {}, navigateToFocus: vi.fn() }),
}));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: null }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));

const base = { source_system: 'LABOR', transaction_date: '2026-06-01', due_date: '2026-07-20', amount: 100, status: 'PENDING', business_status: 'PREVISTO', effective_status: 'VENCIDO', empreendimento_name: null, client_name: null, category: 'Encargos Patronais', party_name: 'FGTS' };
vi.mock('../../services/taxPayableService', () => ({
    taxPayableService: {
        list: vi.fn(async () => [
            { ...base, id: 'a', organization_id: 'org1', reference_id: 'labor-1-unallocated-fgts', description: 'FGTS da Alpa' },
            { ...base, id: 'g', organization_id: 'org2', reference_id: 'labor-2-unallocated-fgts', description: 'FGTS da Garden' },
            { ...base, id: 'x', organization_id: 'org-desconhecida', reference_id: 'labor-3-unallocated-fgts', description: 'FGTS de fora' },
        ]),
        getRecognitionRegime: vi.fn(async () => 'CAIXA'),
        updateStatus: vi.fn(),
    },
}));
vi.mock('../../services/taxSettingsService', () => ({ taxSettingsService: { list: vi.fn(async () => []) } }));

import TributosAPagarManager from '../../components/TributosAPagarManager';

const ORGS = [{ id: 'org1', name: 'Alpa Construtora' }, { id: 'org2', name: 'Garden Cambuhy SPE' }] as never;
const linha = (texto: string) => screen.getByText(texto).closest('tr')!;

describe('Tributos a Pagar — coluna Organização', () => {
    beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });

    it('mostra o nome da organização de cada tributo; org desconhecida cai em travessão', async () => {
        render(<TributosAPagarManager organizations={ORGS} />);
        await screen.findByText('FGTS da Alpa');

        expect(screen.getAllByText('Organização').length).toBeGreaterThan(0);
        expect(within(linha('FGTS da Alpa')).getByText('Alpa Construtora')).toBeTruthy();
        expect(within(linha('FGTS da Garden')).getByText('Garden Cambuhy SPE')).toBeTruthy();
        // sem nome na lista: "—" (e nunca o id cru da organização)
        expect(within(linha('FGTS de fora')).queryByText('org-desconhecida')).toBeNull();
    });

    it('agrupa por organização: um cabeçalho de grupo por nome, com a contagem', async () => {
        render(<TributosAPagarManager organizations={ORGS} />);
        await screen.findByText('FGTS da Alpa');

        fireEvent.change(screen.getByTitle('Agrupar os tributos'), { target: { value: 'organizacao' } });
        const grupos = await screen.findAllByText(/^(Alpa Construtora|Garden Cambuhy SPE|Sem organização)$/);
        // 3 cabeçalhos de grupo + as 2 células que mostram o nome (a de fora não tem nome)
        expect(grupos.length).toBeGreaterThanOrEqual(5);
        expect(screen.getAllByText('Sem organização').length).toBeGreaterThan(0);
    });
});
