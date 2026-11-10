// @vitest-environment jsdom
/**
 * Gerenciar Negociação › Parcelas › "Lançar no Financeiro" com plano COM JUROS
 * (o botão saiu da aba Financeiro em 10/11/2026 — docs/planos/2026-11-10-negociacao-aba-financeiro.md, item 4)
 * (plano docs/planos/2026-11-10-juros-parcelamento-pendencias.md, item 5).
 *
 * Org sem a Conta Financeira "Receita Financeira": o sync lança os juros sem
 * categoria própria e a DRE não consegue separá-los — o relatório do lançamento
 * tem de dizer isso. Com a categoria, nenhum aviso. O DealModal DE VERDADE com a
 * rede trocada por stubs (mesmo arranjo de dealModalJuros.test.tsx).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => {
    const cadeia: unknown = new Proxy(function () { /* stub */ }, {
        get: (_alvo, prop) => (prop === 'then'
            ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
            : cadeia),
        apply: () => cadeia,
    });
    return { supabase: cadeia };
});
const estado = vi.hoisted(() => ({ categoria: null as { id: string } | null }));
vi.mock('../../services/financialCategoryResolver', async (original) => ({
    ...(await original<typeof import('../../services/financialCategoryResolver')>()),
    resolverCategoriaReceitaFinanceira: vi.fn(async () => estado.categoria),
}));
const contrato = vi.hoisted(() => ({
    id: 'ct-1', number: 'CV-2026-001', organization_id: '00000000-0000-0000-0000-000000000000',
    deal_id: 'deal-1', is_recurring: false, payment_term_type: 'Parcelado', original_value: 106618.53,
}));
vi.mock('../../services/contractService', async (original) => {
    const proprios: Record<string, unknown> = {
        getContractByDealId: vi.fn(async () => contrato),
        updateContract: vi.fn(async () => contrato),
        // 1 título lançado: o caminho de sucesso (o aviso vai junto da mensagem verde).
        listFinancialEntries: vi.fn(async () => [{ id: 't1', status: 'PENDING' }]),
        getPaymentSchedule: vi.fn(async () => []),
    };
    return {
        ...(await original<typeof import('../../services/contractService')>()),
        contractService: new Proxy({}, { get: (_a, prop: string) => proprios[prop] ?? vi.fn(async () => []) }),
    };
});
vi.mock('../../services/salesPlanService', () => ({ salesPlanService: { listActive: vi.fn(async () => []) } }));
vi.mock('../../services/commercialService', async (original) => ({
    ...(await original<typeof import('../../services/commercialService')>()),
    commercialService: new Proxy({}, { get: () => vi.fn(async () => []) }),
}));
vi.mock('../../services/clientService', () => ({ clientService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/organizationService', () => ({ organizationService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/projectService', () => ({ projectService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/brokerService', () => ({ brokerService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/paymentTypeService', () => ({ paymentTypeService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/financialRegistryService', () => ({ financialRegistryService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import DealModal from '../../components/DealModal';
import { montarPlanoNoNegocio, type NegocioDoPlano } from '../../utils/jurosParcelamento';

const ORG = '00000000-0000-0000-0000-000000000000';
const base = {
    id: 'deal-1', type: 'SALE', organization_id: ORG, date: '2026-11-10', payment_due_date: '2026-12-10',
    value: 100000, contract_total_value: 100000, payment_method: 'INSTALLMENTS', status: 'CONTRATO',
};
// Price 1% a.m. em 12×: as linhas saem com interest/principal (o que o "Montar plano" grava).
const comJuros = {
    ...base,
    ...montarPlanoNoNegocio(base as NegocioDoPlano, {
        entrada: 0, parcelas: 12, tipo: 'MENSAL', intervaloMeses: 1, primeiroVencimento: '2026-12-10',
        taxaMensal: 1, sistema: 'PRICE',
    }, 'plano-t'),
};

const abrir = () => render(
    <DealModal isOpen onClose={() => {}} defaultType="SALE" organizationId={ORG}
        initialTab="parcelas" initialData={comJuros as never} />,
);
const AVISO = /não tem a Conta Financeira "Receita Financeira"/;

describe('DealModal › Lançar no Financeiro com juros — aviso "Receita Financeira"', () => {
    beforeEach(() => { estado.categoria = null; });

    it('org SEM Receita Financeira: a mensagem do lançamento avisa que a DRE não separa os juros', async () => {
        abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Lançar no Financeiro/ }));
        expect(await screen.findByText(/1 parcela\(s\) lançadas em Contas a Receber/)).toBeTruthy();
        expect(screen.getByText(AVISO)).toBeTruthy();
    });

    it('org COM Receita Financeira: lança sem aviso', async () => {
        estado.categoria = { id: 'cat-fin' };
        abrir();
        fireEvent.click(await screen.findByRole('button', { name: /Lançar no Financeiro/ }));
        expect(await screen.findByText(/1 parcela\(s\) lançadas em Contas a Receber/)).toBeTruthy();
        expect(screen.queryByText(AVISO)).toBeNull();
    });
});
