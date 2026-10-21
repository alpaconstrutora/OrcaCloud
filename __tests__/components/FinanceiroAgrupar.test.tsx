// @vitest-environment jsdom
/**
 * "Agrupar" propagado para Tributos a Pagar, Cobranças e Contas a Pagar › Notas.
 * Pedido de 15/10/2026, docs/planos/2026-10-15-financeiro-agrupar-propagacao.md
 * (Parcelas e a fila de Aprovação têm testes próprios, por causa da paginação.)
 *
 * O mesmo roteiro nas três telas montadas de verdade: o seletor existe, o
 * cabeçalho de grupo traz contagem e total, recolher esconde as linhas, e o
 * "selecionar todos" ignora o grupo recolhido.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ viewFocus: null, setViewFocus: () => {} }),
}));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));

// ── Tributos a Pagar ────────────────────────────────────────────────
const tributo = (id: string, nome: string, amount: number) => ({
    id, organization_id: 'org1', reference_id: 'ref', transaction_date: '2026-09-01', due_date: '2026-10-20',
    amount, description: `Tributo ${id}`, category: 'Locação', party_name: nome, client_name: 'Cliente X',
    business_status: 'PREVISTO', effective_status: 'PREVISTO', empreendimento_name: null,
});
const TRIBUTOS = [tributo('t1', 'IRRF', 100), tributo('t2', 'PIS', 10), tributo('t3', 'IRRF', 50)];
vi.mock('../../services/taxPayableService', () => ({
    taxPayableService: {
        list: vi.fn(async () => TRIBUTOS),
        getRecognitionRegime: vi.fn(async () => 'CAIXA'),
    },
}));
vi.mock('../../services/taxSettingsService', () => ({ taxSettingsService: { list: vi.fn(async () => []) } }));

// ── Cobranças ───────────────────────────────────────────────────────
const cobranca = (id: string, party: string, billing_type: string, value: number) => ({
    id, organization_id: 'org1', transaction_id: `tx-${id}`, party_name: party, description: `Cobrança ${id}`,
    billing_type, due_date: '2026-10-10', value, status: 'PENDING', asaas_payment_id: `pay_${id}`,
});
const COBRANCAS = [cobranca('c1', 'Maria', 'BOLETO', 200), cobranca('c2', 'João', 'PIX', 30), cobranca('c3', 'Ana', 'BOLETO', 5)];
vi.mock('../../services/clientChargeService', () => ({
    clientChargeService: { list: vi.fn(async () => COBRANCAS), cancel: vi.fn(), resend: vi.fn() },
}));

// ── Contas a Pagar › Notas ──────────────────────────────────────────
const nota = (id: string, supplierName: string, amount: number) => ({
    id, supplierId: 's', filePath: 'f', fileName: `NF ${id}.pdf`, amount, dueDate: '2099-01-10',
    status: 'pending', notes: '', createdAt: '2026-01-01', supplierName,
});
const NOTAS = [nota('n1', 'Cimentos Beta', 300), nota('n2', 'Areia Gama', 40), nota('n3', 'Cimentos Beta', 60)];
vi.mock('../../services/invoiceService', () => ({ invoiceService: { listAll: vi.fn(async () => NOTAS), marcarPago: vi.fn(), openInvoice: vi.fn() } }));
vi.mock('../../services/payableService', () => ({
    payableService: { list: vi.fn(async () => []), updateStatus: vi.fn(), remove: vi.fn() },
    payableParty: (p: { party_name?: string }) => p.party_name ?? '—',
}));
vi.mock('../../services/exportService', () => ({ exportService: {} }));

import TributosAPagarManager from '../../components/TributosAPagarManager';
import ClientChargesModule from '../../components/ClientChargesModule';
import ContasPagarManager from '../../components/ContasPagarManager';

const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;
const textoDoCabecalho = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.trim()).filter(Boolean).join(' ');

describe.each([
    {
        tela: 'Tributos a Pagar',
        montar: () => render(<TributosAPagarManager organizationId="org1" />),
        primeiraLinha: 'Tributo t1',
        seletor: 'Agrupar os tributos', campo: 'tributo',
        grupo: 'IRRF', esperado: /^IRRF 2 R\$\s?150,00$/, linhasDoGrupo: ['Tributo t1', 'Tributo t3'], fora: 'Tributo t2',
        // Sem seleção desde 21/10/2026: o lote só servia para pagar, e o pagamento
        // mudou para Contas a Pagar (TributosSemPagamento.test.tsx).
        marcarTodos: undefined, selecionados: undefined,
    },
    {
        tela: 'Cobranças',
        montar: () => render(<ClientChargesModule organizationId="org1" />),
        primeiraLinha: 'Cobrança c1',
        seletor: 'Agrupar as cobranças', campo: 'tipo',
        grupo: 'Boleto', esperado: /^Boleto 2 R\$\s?205,00$/, linhasDoGrupo: ['Cobrança c1', 'Cobrança c3'], fora: 'Cobrança c2',
        marcarTodos: 'Selecionar todas (canceláveis)', selecionados: /^1 selecionada$/,
    },
    {
        tela: 'Contas a Pagar › Notas',
        montar: () => { window.localStorage.setItem('contasPagarManager:visao', JSON.stringify('notas')); return render(<ContasPagarManager organizations={[]} />); },
        primeiraLinha: 'Cimentos Beta',
        seletor: 'Agrupar as notas', campo: 'fornecedor',
        grupo: 'Cimentos Beta', esperado: /^Cimentos Beta 2 R\$\s?360,00$/, linhasDoGrupo: ['NF n1.pdf', 'NF n3.pdf'], fora: 'NF n2.pdf',
        marcarTodos: 'Selecionar todos (pagáveis)', selecionados: /^1 selecionada$/,
    },
])('$tela — Agrupar', ({ montar, primeiraLinha, seletor, campo, grupo, esperado, linhasDoGrupo, fora, marcarTodos, selecionados }) => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    it('agrupa com contagem e total; recolher esconde as linhas; "selecionar todos" ignora o recolhido', async () => {
        montar();
        await screen.findAllByText(primeiraLinha);

        fireEvent.change(screen.getByTitle(seletor), { target: { value: campo } });
        expect(textoDoCabecalho(grupo)).toMatch(esperado);
        linhasDoGrupo.forEach(t => expect(screen.getAllByText(t).length).toBeGreaterThan(0));

        fireEvent.click(cabecalho(grupo));
        linhasDoGrupo.forEach(t => expect(screen.queryByText(t)).toBeNull());
        expect(screen.getAllByText(fora).length).toBeGreaterThan(0);

        if (marcarTodos && selecionados) {
            fireEvent.click(screen.getByTitle(marcarTodos));
            expect(screen.getByText(selecionados)).toBeTruthy();
        }

        fireEvent.change(screen.getByTitle(seletor), { target: { value: 'none' } });
        expect(document.querySelectorAll('tbody span.font-semibold')).toHaveLength(0);
    });
});
