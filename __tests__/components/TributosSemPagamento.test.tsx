// @vitest-environment jsdom
/**
 * Tributos a Pagar é tela de GESTÃO; pagar é só em Contas a Pagar (21/10/2026).
 * Plano: docs/planos/2026-10-21-tributos-gestao-pagamento-em-contas-a-pagar.md
 *
 * Trava as duas pontas: a tela de Tributos não oferece Pagar nem Estornar —
 * só o atalho para o título em Contas a Pagar; e o service mostra como Pago o
 * tributo que foi conciliado por lá.
 *
 * Desde 21/10/2026 (DARF, docs/planos/2026-10-21-agrupar-tributos-em-darf.md) a
 * seleção voltou, mas SÓ para "Agrupar em DARF": a barra de lote não tem baixa.
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

const tributo = (id: string, effective_status: string, transaction_date = '2026-09-01') => ({
    id, organization_id: 'org1', reference_id: `tax-${id}`, transaction_date, due_date: '2026-10-20',
    amount: 100, description: `Tributo ${id}`, category: 'Locação', party_name: 'IRRF', client_name: 'Cliente X',
    status: effective_status === 'PAGO' ? 'CONCILIATED' : 'PENDING',
    business_status: effective_status === 'VENCIDO' ? 'PREVISTO' : effective_status, effective_status, empreendimento_name: null,
});
vi.mock('../../services/taxPayableService', () => ({
    taxPayableService: {
        list: vi.fn(async () => [tributo('aberto', 'PREVISTO'), tributo('vencido', 'VENCIDO'), tributo('pago', 'PAGO'), tributo('retido', 'RETIDO'), tributo('outubro', 'PREVISTO', '2026-10-05')]),
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

    it('não oferece Pagar nem Estornar', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        expect(screen.queryByRole('button', { name: /^Pagar/ })).toBeNull();
        expect(screen.queryByTitle('Estornar baixa')).toBeNull();
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('a seleção é só para agrupar: pago e retido ficam desligados com o motivo', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        const caixa = (texto: string) => screen.getByText(texto).closest('tr')!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(caixa('Tributo pago').disabled).toBe(true);
        expect(caixa('Tributo pago').closest('span')!.getAttribute('title')).toMatch(/Pago/);
        expect(caixa('Tributo retido').disabled).toBe(true);
        expect(caixa('Tributo retido').closest('span')!.getAttribute('title')).toMatch(/Retido pelo cliente/);

        fireEvent.click(caixa('Tributo aberto'));
        fireEvent.click(caixa('Tributo vencido'));
        const agrupar = screen.getByRole('button', { name: /Agrupar em DARF/ }) as HTMLButtonElement;
        expect(agrupar.disabled).toBe(false);
        // A barra não tem baixa: pagar é em Contas a Pagar.
        expect(screen.queryByRole('button', { name: /Baixa|Pagar \(/ })).toBeNull();
    });

    it('competências diferentes desligam "Agrupar em DARF" dizendo quais', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        const caixa = (texto: string) => screen.getByText(texto).closest('tr')!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(caixa('Tributo aberto'));
        fireEvent.click(caixa('Tributo outubro'));
        const agrupar = screen.getByRole('button', { name: /Agrupar em DARF/ }) as HTMLButtonElement;
        expect(agrupar.disabled).toBe(true);
        expect(agrupar.closest('span')!.getAttribute('title')).toBe('Um DARF só junta tributos da mesma competência — a seleção tem 09/2026 e 10/2026');
    });

    it('cada tributo abre o próprio título em Contas a Pagar', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('Tributo aberto');

        const atalhos = screen.getAllByRole('button', { name: 'Ver em Contas a Pagar' });
        expect(atalhos).toHaveLength(5);   // aberto, vencido, pago, retido e outubro
        fireEvent.click(atalhos[0]);
        expect(navigateToFocus).toHaveBeenCalledWith('contas-a-pagar', 'aberto', 'CONTA_PAGAR');
    });
});
