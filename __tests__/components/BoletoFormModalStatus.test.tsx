// @vitest-environment jsdom
/**
 * Campo Status na página do boleto (23/10/2026 —
 * docs/planos/2026-10-23-boleto-status-editavel.md, item 3).
 *
 * Guiado pelo fluxo (decisão do usuário): só as mudanças válidas aparecem;
 * rascunho ↔ revisão aplica na hora; o que mexe no financeiro abre um painel
 * com o que vai acontecer e espera o Confirmar. Cancelar pede o motivo ali
 * (era `window.prompt`).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getDocumentoUrl: vi.fn().mockResolvedValue(null),
    podeExcluir: vi.fn().mockReturnValue(true),
    podeMudarOrganizacao: vi.fn().mockReturnValue(true),
    motivoParaNaoMudarOrganizacao: vi.fn().mockReturnValue(null),
    listAuditoria: vi.fn().mockResolvedValue([]),
    motivoDaAlcada: vi.fn().mockResolvedValue(null),
    marcarRevisao: vi.fn(),
    cancelar: vi.fn(),
    reverterParaRascunho: vi.fn(),
    marcarPago: vi.fn(),
}));
vi.mock('../../services/emailCaptureService', () => ({
    emailCaptureService: { mensagemDoBoleto: vi.fn().mockResolvedValue(null), listarContas: vi.fn().mockResolvedValue([]), listarRemetentes: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/boletoService', () => ({ boletoService: svc, MOTIVO_SEM_VENCIMENTO: 'Informe o vencimento' }));
vi.mock('../../utils/boletoParser', () => ({ extractFromPdfFile: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: vi.fn().mockResolvedValue([]),
        listPlanoContas: vi.fn().mockResolvedValue([]),
        listChartOfAccounts: vi.fn().mockResolvedValue([]),
    },
}));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/boletoNomeDocumentoService', () => ({ renomearDocumentoDeNovo: vi.fn() }));
vi.mock('../../hooks/useOrgContext', () => ({ useWritableOrganizations: () => [{ id: 'org-1', name: 'Alpa' }] }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import BoletoFormModal from '../../components/BoletoFormModal';
import { ConfirmProvider } from '../../components/ui/confirm';
import { MOTIVO_STATUS_PROGRAMADO } from '../../utils/boletoStatus';

const base = {
    id: 'b9', numero: 1461, organization_id: 'org-1', documento_path: 'org-1/2026/c.pdf', documento_nome: 'c.pdf',
    documento_hash: 'h', valor: 102.46, vencimento: '2026-02-21', created_at: '2026-10-01T00:00:00Z', supplier_id: 'f1',
};
const montar = (b: Record<string, unknown>, onSaved = vi.fn()) =>
    render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={b as never} onClose={vi.fn()} onSaved={onSaved} /></ConfirmProvider>);
const campo = () => screen.getByRole('combobox', { name: 'Status do boleto' }) as HTMLSelectElement;
const opcoes = () => Array.from(campo().options).map(o => o.textContent);

beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:teste';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

describe('campo Status da página do boleto', () => {
    it('mostra o status atual e só as mudanças válidas', () => {
        montar({ ...base, status: 'revisao' });
        expect(campo().value).toBe('revisao');
        expect(opcoes()).toEqual(['Em revisão (atual)', 'Rascunho', 'Aprovado', 'Cancelado']);
    });

    it('revisão → rascunho aplica na hora, sem painel', async () => {
        const onSaved = vi.fn();
        svc.marcarRevisao.mockResolvedValue({ ...base, status: 'rascunho' });
        montar({ ...base, status: 'revisao' }, onSaved);
        fireEvent.change(campo(), { target: { value: 'rascunho' } });
        await waitFor(() => expect(svc.marcarRevisao).toHaveBeenCalledWith('b9', 'org-1', 'rascunho', undefined));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'rascunho' }));
        expect(screen.queryByRole('region', { name: 'Confirmar mudança de status' })).toBeNull();
    });

    it('cancelar: o painel explica, pede o motivo e só então cancela', async () => {
        svc.cancelar.mockResolvedValue({ ...base, status: 'cancelado', invoice_id: 'inv-1' });
        montar({ ...base, status: 'aprovado', invoice_id: 'inv-1' });
        fireEvent.change(campo(), { target: { value: 'cancelado' } });
        const painel = screen.getByRole('region', { name: 'Confirmar mudança de status' });
        expect(painel).toHaveTextContent('Aprovado → Cancelado.');
        expect(painel).toHaveTextContent(/título em Contas a Pagar e a nota ficam cancelados/);
        const confirmar = screen.getByRole('button', { name: 'Confirmar' });
        expect(confirmar).toBeDisabled();
        expect(confirmar.getAttribute('title')).toBe('Escreva o motivo do cancelamento.');
        fireEvent.change(screen.getByPlaceholderText('Ex.: capturado em dobro'), { target: { value: 'Capturado em dobro' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(svc.cancelar).toHaveBeenCalledWith('b9', 'org-1', 'Capturado em dobro', undefined));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Confirmar mudança de status' })).toBeNull());
    });

    it('aprovado → rascunho estorna só depois do Confirmar; "Manter como está" desiste', async () => {
        svc.reverterParaRascunho.mockResolvedValue({ ...base, status: 'rascunho' });
        montar({ ...base, status: 'aprovado', invoice_id: 'inv-1' });
        fireEvent.change(campo(), { target: { value: 'rascunho' } });
        expect(screen.getByRole('region', { name: 'Confirmar mudança de status' })).toHaveTextContent(/título e a nota deste boleto são apagados/);
        fireEvent.click(screen.getByRole('button', { name: 'Manter como está' }));
        expect(svc.reverterParaRascunho).not.toHaveBeenCalled();
        expect(campo().value).toBe('aprovado');
        fireEvent.change(campo(), { target: { value: 'rascunho' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(svc.reverterParaRascunho).toHaveBeenCalledWith('b9', 'org-1', undefined));
    });

    it('aprovar sem fornecedor: o painel diz por quê e o Confirmar fica desligado', () => {
        montar({ ...base, status: 'rascunho', supplier_id: null });
        fireEvent.change(campo(), { target: { value: 'aprovado' } });
        const confirmar = screen.getByRole('button', { name: 'Confirmar' });
        expect(confirmar).toBeDisabled();
        expect(confirmar.getAttribute('title')).toBe('Selecione um fornecedor antes de aprovar.');
    });

    it('programado: campo desligado com o motivo, e sem botão Cancelar no topo', () => {
        montar({ ...base, status: 'programado', invoice_id: 'inv-1' });
        expect(campo()).toBeDisabled();
        expect(campo().getAttribute('title')).toBe(MOTIVO_STATUS_PROGRAMADO);
        expect(screen.queryByRole('button', { name: /^Cancelar$/ })).toBeNull();
    });

    it('botão Cancelar do topo abre o mesmo painel (sem window.prompt)', () => {
        const prompt = vi.spyOn(window, 'prompt');
        montar({ ...base, status: 'rascunho' });
        fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/ }));
        expect(screen.getByRole('region', { name: 'Confirmar mudança de status' })).toHaveTextContent('Rascunho → Cancelado.');
        expect(prompt).not.toHaveBeenCalled();
    });
});
