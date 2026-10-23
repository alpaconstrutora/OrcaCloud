// @vitest-environment jsdom
/**
 * Edição em Lote › mudar status (23/10/2026 — docs/planos/2026-10-23-boleto-lote-status.md, item 3).
 *
 * Mesma regra do campo Status da página: quem pode muda, quem não pode fica com
 * o motivo na lista; o efeito no financeiro aparece antes do "Aplicar status".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    aprovarEmLote: vi.fn(),
    associarEmLote: vi.fn(),
    mudarStatusEmLote: vi.fn(),
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

const boleto = (id: string, numero: number, status: string, extra: Record<string, unknown> = {}) => ({
    id, numero, organization_id: 'org-1', status, valor: 100, vencimento: '2026-11-10', supplier_id: 'sup-1',
    created_at: '2026-10-01T00:00:00Z', ...extra,
}) as never;

const aprovado = boleto('b1', 1461, 'aprovado', { invoice_id: 'inv-1' });
const revisao = boleto('b2', 1462, 'revisao');
const pago = boleto('b3', 1463, 'pago', { invoice_id: 'inv-3' });

function abrir(boletos: never[]) {
    const onSaved = vi.fn();
    render(
        <BoletoEdicaoEmLoteModal
            boletos={boletos} organizationId="org-1" suppliers={[{ id: 'sup-1', name: 'Energisa' }] as never}
            projects={[]} costCenters={[]} userEmail="u@alpa" onClose={vi.fn()} onSaved={onSaved}
        />,
    );
    return { onSaved };
}
const campo = () => screen.getByLabelText('Mudar status') as HTMLSelectElement;

beforeEach(() => vi.clearAllMocks());

describe('Mudar status na Edição em Lote', () => {
    it('o campo oferece revisão, rascunho, pago e cancelado; aprovar fica no botão próprio', () => {
        abrir([aprovado, revisao]);
        expect(Array.from(campo().options).map(o => o.textContent)).toEqual(['— Não alterar —', 'Em revisão', 'Rascunho', 'Pago', 'Cancelado']);
        expect(screen.getByText('Para aprovar, use "Aprovar e Lançar".')).toBeInTheDocument();
    });

    it('cancelar: conta quem muda, diz o efeito, mostra quem fica e pede o motivo', async () => {
        svc.mudarStatusEmLote.mockResolvedValue({ ok: ['b1', 'b2'], errors: [], ficaram: [{ id: 'b3', motivo: 'De "Pago" não vai para "Cancelado".' }] });
        const { onSaved } = abrir([aprovado, revisao, pago]);
        fireEvent.change(campo(), { target: { value: 'cancelado' } });
        const painel = screen.getByRole('region', { name: 'Mudança de status em lote' });
        expect(painel).toHaveTextContent('2 de 3 passam para "Cancelado" · 1 fica como está');
        expect(painel).toHaveTextContent(/Aprovado \(1\):.*título em Contas a Pagar e a nota ficam cancelados/);
        expect(screen.getByText('De "Pago" não vai para "Cancelado".')).toBeInTheDocument();

        const aplicar = screen.getByRole('button', { name: 'Aplicar status' });
        expect(aplicar).toBeDisabled();
        expect(aplicar.getAttribute('title')).toBe('Escreva o motivo do cancelamento.');
        fireEvent.change(screen.getByLabelText('Motivo do cancelamento'), { target: { value: 'Duplicados' } });
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar status' }));
        await waitFor(() => expect(svc.mudarStatusEmLote).toHaveBeenCalledWith(['b1', 'b2', 'b3'], 'org-1', 'cancelado', { motivo: 'Duplicados', userEmail: 'u@alpa' }));
        expect(await screen.findByText('2 boletos passaram para "Cancelado".')).toBeInTheDocument();
        expect(screen.getByText('Boleto #1463 ficou como estava: De "Pago" não vai para "Cancelado".')).toBeInTheDocument();
        expect(onSaved).toHaveBeenCalled();
    });

    it('nenhum pode mudar: botão desligado com o motivo', () => {
        abrir([pago]);
        fireEvent.change(campo(), { target: { value: 'pago' } });
        const aplicar = screen.getByRole('button', { name: 'Aplicar status' });
        expect(aplicar).toBeDisabled();
        expect(aplicar.getAttribute('title')).toMatch(/Nenhum dos boletos selecionados pode ir para este status/);
        expect(screen.getByText('Já está em "Pago".')).toBeInTheDocument();
    });

    it('revisão → rascunho não mexe no financeiro: botão azul, sem motivo', () => {
        abrir([revisao]);
        fireEvent.change(campo(), { target: { value: 'rascunho' } });
        const aplicar = screen.getByRole('button', { name: 'Aplicar status' });
        expect(aplicar).not.toBeDisabled();
        expect(aplicar.className).toMatch(/bg-blue-600/);
        expect(screen.queryByLabelText('Motivo do cancelamento')).toBeNull();
    });
});
