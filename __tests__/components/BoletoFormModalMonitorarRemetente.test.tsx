// @vitest-environment jsdom
/**
 * "Monitorar remetente" no boleto (16/10/2026): abre o cadastro já com os padrões
 * tirados do boleto; fornecedor e classificação só se o boleto é da org da caixa
 * (o banco recusa os de outra — era um 23503); remetente já cadastrado abre em
 * edição (antes esbarrava na UNIQUE da caixa). Plano:
 * docs/planos/2026-10-16-captura-padroes-do-remetente.md (passo G).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getDocumentoUrl: vi.fn().mockResolvedValue(null),
    podeExcluir: vi.fn().mockReturnValue(true),
    podeMudarOrganizacao: vi.fn().mockReturnValue(true),
    motivoParaNaoMudarOrganizacao: vi.fn().mockReturnValue(null),
    listAuditoria: vi.fn().mockResolvedValue([]),
}));
const captura = vi.hoisted(() => ({
    mensagemDoBoleto: vi.fn(),
    listarContas: vi.fn(),
    listarRemetentes: vi.fn(),
}));
vi.mock('../../services/emailCaptureService', () => ({ emailCaptureService: captura }));
vi.mock('../../services/boletoService', () => ({ boletoService: svc, MOTIVO_SEM_VENCIMENTO: 'x' }));
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
vi.mock('../../components/boletos/EmailCaptureSenderSheet', () => ({
    default: (p: { open: boolean; remetente?: { id: string } | null; prefill: unknown }) => (p.open
        ? <pre data-testid="sheet-remetente">{JSON.stringify({ remetente: p.remetente?.id ?? null, prefill: p.prefill })}</pre>
        : null),
}));

import BoletoFormModal from '../../components/BoletoFormModal';
import { ConfirmProvider } from '../../components/ui/confirm';

const boleto = {
    id: 'b9', organization_id: 'org-1', status: 'revisao', documento_path: 'org-1/2026/c.pdf', documento_nome: 'c.pdf',
    documento_hash: 'h', valor: 54.04, vencimento: '2026-11-10', created_at: '2026-10-01T00:00:00Z', origem: 'email',
    email_message_id: 'm1', supplier_id: 'f1', cost_center_id: 'cc1', descricao: 'Energia – 11/2026',
    multa_percentual: 2, juros_dia: 0.033, juros_dia_tipo: 'percentual',
} as never;

const lerSheet = () => JSON.parse(screen.getByTestId('sheet-remetente').textContent!);

beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:teste';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    captura.mensagemDoBoleto.mockResolvedValue({ id: 'm1', account_id: 'c1', remetente: 'Energisa <faturas@energisa.com.br>', assunto: 'Fatura' });
    captura.listarRemetentes.mockResolvedValue([]);
    captura.listarContas.mockResolvedValue([{ id: 'c1', organization_id: 'org-1', usuario: 'caixa@gmail.com', status: 'ativa' }]);
});

const montar = () => render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={boleto} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);

describe('Monitorar remetente — padrões tirados do boleto', () => {
    it('novo: fornecedor, classificação, descrição com {mês}, dia, multa e juros', async () => {
        montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Monitorar remetente' }));
        const { remetente, prefill } = await screen.findByTestId('sheet-remetente').then(lerSheet);
        expect(remetente).toBeNull();
        expect(prefill).toMatchObject({
            account_id: 'c1', tipo: 'exato', email: 'faturas@energisa.com.br', supplier_id: 'f1',
            padrao_cost_center_id: 'cc1', padrao_descricao: 'Energia – {mês}', padrao_dia_vencimento: 10,
            padrao_multa_percentual: 2, padrao_juros_dia: 0.033, padrao_juros_dia_tipo: 'percentual',
        });
        // Valor e observações variam de boleto a boleto: não viram padrão.
        expect(prefill.padrao_valor).toBeUndefined();
        expect(prefill.padrao_observacoes).toBeUndefined();
    });

    it('caixa de OUTRA organização: sem fornecedor nem classificação', async () => {
        captura.listarContas.mockResolvedValue([{ id: 'c1', organization_id: 'org-2', usuario: 'caixa@gmail.com', status: 'ativa' }]);
        montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Monitorar remetente' }));
        const { prefill } = await screen.findByTestId('sheet-remetente').then(lerSheet);
        expect(prefill).toMatchObject({ supplier_id: null, padrao_cost_center_id: null, padrao_dia_vencimento: 10 });
    });

    it('remetente já cadastrado: o link vira "Padrões do remetente" e abre em edição', async () => {
        captura.listarRemetentes.mockResolvedValue([
            { id: 'r7', account_id: 'c1', tipo: 'exato', email: 'faturas@energisa.com.br', dominio: null },
        ]);
        montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Padrões do remetente' }));
        const { remetente, prefill } = await screen.findByTestId('sheet-remetente').then(lerSheet);
        expect(remetente).toBe('r7');
        expect(prefill).toBeNull();
    });
});
