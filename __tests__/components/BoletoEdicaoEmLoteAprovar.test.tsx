// @vitest-environment jsdom
/**
 * Edição em Lote › "Aprovar e Lançar" sem exigir alteração (21/10/2026 —
 * docs/planos/2026-10-21-boleto-lote-aprovar-sem-alterar.md, item 3).
 *
 * Antes o botão só ligava depois de mexer em algum campo. Agora liga quando há
 * ao menos um boleto pronto (mesma regra do serviço), e desligado diz o motivo.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    aprovarEmLote: vi.fn(),
    associarEmLote: vi.fn(),
}));
vi.mock('../../services/boletoService', () => ({ boletoService: svc }));
vi.mock('../../components/BoletoFormModal', () => ({ formatBRL: (v?: number) => `R$ ${v ?? 0}` }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listPlanoContas: vi.fn().mockResolvedValue([]),
        listChartOfAccounts: vi.fn().mockResolvedValue([]),
    },
}));
vi.mock('../../services/supplierService', () => ({ getSupplierDisplayName: (s: { name: string }) => s.name }));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import BoletoEdicaoEmLoteModal from '../../components/BoletoEdicaoEmLoteModal';
import { motivoDoStatus } from '../../utils/boletoAprovacaoLote';

const energisa = {
    id: 'b1', numero: 1461, organization_id: 'org-1', status: 'revisao', valor: 102.46, vencimento: '2026-02-21',
    supplier_id: null, sugestao_supplier_id: 'sup-energisa', created_at: '2026-10-19T00:00:00Z',
} as never;
const pago = {
    id: 'b2', numero: 1400, organization_id: 'org-1', status: 'pago', valor: 50, vencimento: '2026-01-10',
    supplier_id: 'sup-energisa', created_at: '2026-10-01T00:00:00Z',
} as never;

const suppliers = [{ id: 'sup-energisa', name: 'Energisa Sul-Sudeste' }] as never;

function abrir(boletos: never[]) {
    return render(
        <BoletoEdicaoEmLoteModal
            boletos={boletos} organizationId="org-1" suppliers={suppliers} projects={[]} costCenters={[]}
            userEmail="u@alpa" onClose={vi.fn()} onSaved={vi.fn()}
        />,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    svc.aprovarEmLote.mockResolvedValue({ ok: ['b1'], errors: [{ id: 'b2', error: motivoDoStatus('pago') }] });
});

describe('Aprovar e Lançar na Edição em Lote', () => {
    it('sem alterar campo nenhum, o botão está ligado e lança com campos vazios', async () => {
        abrir([energisa, pago]);
        const botao = screen.getByRole('button', { name: /Aprovar e Lançar/i });
        expect(botao).not.toBeDisabled();
        expect(botao.getAttribute('title')).toBe('Lança 1 de 2 em Contas a Pagar e os envia para a alçada. O outro fica como está.');
        fireEvent.click(botao);
        await waitFor(() => expect(svc.aprovarEmLote).toHaveBeenCalledWith(['b1', 'b2'], 'org-1', {}, 'u@alpa'));
        // o erro do resultado mostra o NÚMERO do boleto, não um pedaço do uuid
        expect(await screen.findByText(`Boleto #1400: ${motivoDoStatus('pago')}`)).toBeInTheDocument();
    });

    it('mostra quantos estão prontos, o fornecedor sugerido e o motivo de quem não pode', () => {
        abrir([energisa, pago]);
        expect(screen.getByText(/pronto para lançar/)).toHaveTextContent('1 de 2 pronto para lançar · 1 com o fornecedor sugerido');
        expect(screen.getByText('Fornecedor sugerido: Energisa Sul-Sudeste')).toBeInTheDocument();
        expect(screen.getByText(motivoDoStatus('pago'))).toBeInTheDocument();
    });

    it('nenhum pronto: o botão fica desligado e o title diz por quê', () => {
        abrir([pago]);
        const botao = screen.getByRole('button', { name: /Aprovar e Lançar/i });
        expect(botao).toBeDisabled();
        expect(botao.getAttribute('title')).toBe(motivoDoStatus('pago'));
    });

    it('"Salvar Rascunho" continua pedindo alteração — e diz isso', () => {
        abrir([energisa]);
        const salvar = screen.getByRole('button', { name: /Salvar Rascunho/i });
        expect(salvar).toBeDisabled();
        expect(salvar.getAttribute('title')).toBe('Altere ao menos um campo para salvar o rascunho.');
    });
});
