// @vitest-environment jsdom
/**
 * Tributos a Pagar é tela de GESTÃO; pagar é só em Contas a Pagar (21/10/2026).
 * Plano: docs/planos/2026-10-21-tributos-gestao-pagamento-em-contas-a-pagar.md
 *
 * Trava as duas pontas: a tela de Tributos não oferece Pagar, Estornar nem
 * seleção para baixa em lote — só o atalho para o título em Contas a Pagar; e
 * o service mostra como Pago o tributo que foi conciliado por lá.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { navigateToFocus, updateStatus } = vi.hoisted(() => ({ navigateToFocus: vi.fn(), updateStatus: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ viewFocus: null, setViewFocus: () => {}, navigateToFocus }),
}));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));

const tributo = (id: string, effective_status: string) => ({
    id, organization_id: 'org1', reference_id: `tax-${id}`, transaction_date: '2026-09-01', due_date: '2026-10-20',
    amount: 100, description: `Tributo ${id}`, category: 'Locação', party_name: 'IRRF', client_name: 'Cliente X',
    status: effective_status === 'PAGO' ? 'CONCILIATED' : 'PENDING',
    business_status: effective_status === 'VENCIDO' ? 'PREVISTO' : effective_status, effective_status, empreendimento_name: null,
});
vi.mock('../../services/taxPayableService', () => ({
    taxPayableService: {
        list: vi.fn(async () => [tributo('aberto', 'PREVISTO'), tributo('vencido', 'VENCIDO'), tributo('pago', 'PAGO'), tributo('retido', 'RETIDO')]),
        getRecognitionRegime: vi.fn(async () => 'CAIXA'),
        updateStatus,
    },
}));
vi.mock('../../services/taxSettingsService', () => ({ taxSettingsService: { list: vi.fn(async () => []) } }));

import TributosAPagarManager from '../../components/TributosAPagarManager';

describe('Tributos a Pagar — gestão, sem pagamento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    it('não oferece Pagar, Estornar nem seleção em lote', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        expect(screen.queryByRole('button', { name: /^Pagar/ })).toBeNull();
        expect(screen.queryByTitle('Estornar baixa')).toBeNull();
        expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('cada tributo abre o próprio título em Contas a Pagar', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        const atalhos = screen.getAllByRole('button', { name: 'Ver em Contas a Pagar' });
        expect(atalhos).toHaveLength(4);   // aberto, vencido, pago e retido
        fireEvent.click(atalhos[0]);
        expect(navigateToFocus).toHaveBeenCalledWith('contas-a-pagar', 'aberto', 'CONTA_PAGAR');
    });
});
