// @vitest-environment jsdom
/**
 * Formulário de boleto — duas correções de 15/10/2026
 * (docs/planos/2026-10-15-captura-boletos-por-email.md, item 1.5).
 *
 * 1. Subir um PDF que já é de um boleto existente (mesmo arquivo ou mesma linha
 *    digitável) NÃO pode gravar os campos do formulário no boleto existente.
 *    Até aqui `associar` era chamado mesmo com `duplicate: true` e sobrescrevia
 *    fornecedor, valor e vencimento de um boleto às vezes já aprovado.
 * 2. "Aprovar e Lançar" sem vencimento fica desligado DIZENDO POR QUÊ.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const MOTIVO = 'Informe o vencimento antes de aprovar — é ele que define a competência do título.';

const svc = vi.hoisted(() => ({
    uploadBoleto: vi.fn(),
    associar: vi.fn(),
    getDocumentoUrl: vi.fn().mockResolvedValue(null),
    podeExcluir: vi.fn().mockReturnValue(true),
    podeMudarOrganizacao: vi.fn().mockReturnValue(true),
    motivoParaNaoMudarOrganizacao: vi.fn().mockReturnValue(null),
    aprovarECriarInvoice: vi.fn(),
    listAuditoria: vi.fn().mockResolvedValue([]),
}));

const captura = vi.hoisted(() => ({
    mensagemDoBoleto: vi.fn(),
    listarContas: vi.fn().mockResolvedValue([]),
    // Desde 16/10/2026 o formulário procura o cadastro do remetente (link "Padrões do remetente").
    listarRemetentes: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/emailCaptureService', () => ({ emailCaptureService: captura }));

vi.mock('../../services/boletoService', () => ({
    boletoService: svc,
    MOTIVO_SEM_VENCIMENTO: 'Informe o vencimento antes de aprovar — é ele que define a competência do título.',
}));
vi.mock('../../utils/boletoParser', () => ({
    extractFromPdfFile: vi.fn().mockResolvedValue(null),
}));
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

const EXISTENTE = {
    id: 'b-velho', organization_id: 'org-1', status: 'aprovado', documento_path: 'org-1/2026/a.pdf',
    documento_nome: 'a.pdf', documento_hash: 'h', supplier_id: 'sup-velho', valor: 999, vencimento: '2026-11-10',
    created_at: '2026-10-01T00:00:00Z',
} as never;

beforeEach(() => {
    vi.clearAllMocks();
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:teste';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

describe('BoletoFormModal — PDF duplicado', () => {
    it('abre o existente e NÃO chama associar com os campos do formulário', async () => {
        svc.uploadBoleto.mockResolvedValue({ boleto: EXISTENTE, extraction: null, duplicate: true });
        const onClose = vi.fn();
        const onSaved = vi.fn();
        const { container } = render(
            <ConfirmProvider>
                <BoletoFormModal organizationId="org-1" onClose={onClose} onSaved={onSaved} />
            </ConfirmProvider>,
        );

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.change(input, { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } });

        fireEvent.click(await screen.findByRole('button', { name: /Salvar e fechar/i }));

        await screen.findByText(/já havia sido capturado/i);
        expect(svc.uploadBoleto).toHaveBeenCalledTimes(1);
        expect(svc.associar).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });
});

describe('BoletoFormModal — aprovar sem vencimento', () => {
    const rascunho = (venc: string | undefined) => ({
        id: 'b1', organization_id: 'org-1', status: 'rascunho', documento_path: 'org-1/2026/b.pdf',
        documento_nome: 'b.pdf', documento_hash: 'h', supplier_id: 'sup-1', valor: 10, vencimento: venc,
        created_at: '2026-10-01T00:00:00Z',
    } as never);

    it('desliga o botão e diz o motivo no title', async () => {
        render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={rascunho(undefined)} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
        const botao = await screen.findByRole('button', { name: /Aprovar e Lançar/i });
        expect(botao).toBeDisabled();
        expect(botao.getAttribute('title')).toBe(MOTIVO);
    });

    it('com vencimento o botão fica ligado', async () => {
        render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={rascunho('2026-11-10')} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
        const botao = await screen.findByRole('button', { name: /Aprovar e Lançar/i });
        await waitFor(() => expect(botao).not.toBeDisabled());
    });
});

describe('BoletoFormModal — origem por e-mail e histórico (15/10/2026)', () => {
    const base = {
        id: 'b9', organization_id: 'org-1', status: 'revisao', documento_path: 'org-1/2026/c.pdf',
        documento_nome: 'c.pdf', documento_hash: 'h', valor: 10, vencimento: '2026-11-10', created_at: '2026-10-01T00:00:00Z',
    };

    it('boleto de e-mail mostra o remetente e o histórico com a captura', async () => {
        captura.mensagemDoBoleto.mockResolvedValue({ id: 'm1', account_id: 'c1', remetente: 'ACME <cobranca@acme.com.br>', assunto: 'Boleto' });
        svc.listAuditoria.mockResolvedValue([{
            id: 'a1', boleto_id: 'b9', organization_id: 'org-1', acao: 'upload', metodo: 'sistema', created_at: '2026-10-15T12:00:00Z',
            valor_depois: { origem: 'email', remetente: 'cobranca@acme.com.br', motivos: ['Caixa em modo piloto: todo boleto passa pela revisão.'] },
        }]);
        render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={{ ...base, origem: 'email', email_message_id: 'm1' } as never} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);

        expect(await screen.findByText(/Recebido por e-mail de ACME/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Monitorar remetente/i })).toBeTruthy();
        expect(await screen.findByText('Capturado')).toBeTruthy();
        expect(screen.getByText(/modo piloto/)).toBeTruthy();
        expect(captura.mensagemDoBoleto).toHaveBeenCalledWith('m1');
    });

    it('boleto enviado na tela não consulta a captura nem mostra "Recebido por e-mail"', async () => {
        captura.mensagemDoBoleto.mockClear();
        svc.listAuditoria.mockResolvedValue([]);
        render(<ConfirmProvider><BoletoFormModal organizationId="org-1" boleto={{ ...base, origem: 'upload' } as never} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
        expect(await screen.findByText('Nenhum evento registrado.')).toBeTruthy();
        expect(screen.queryByText(/Recebido por e-mail/)).toBeNull();
        expect(captura.mensagemDoBoleto).not.toHaveBeenCalled();
    });
});
