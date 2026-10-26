// @vitest-environment jsdom
/**
 * Aba "Histórico da captura" (16/10/2026): filtro por resultado, período pela
 * data do e-mail (padrão 30 dias) e "Monitorar remetente" em texto só na linha
 * ignorada de quem ainda não tem cadastro. Plano:
 * docs/planos/2026-10-15-captura-boletos-por-email.md ("abas na tela de captura").
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    listarContas: vi.fn(),
    listarRemetentes: vi.fn(),
    listarBuscas: vi.fn(),
    listarMensagens: vi.fn(),
}));
vi.mock('../../services/emailCaptureService', async () => {
    const real = await vi.importActual<typeof import('../../services/emailCaptureService')>('../../services/emailCaptureService');
    return { ...real, emailCaptureService: svc };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: async () => [] } }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'o1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));
vi.mock('../../store/useStore', () => ({ useStore: (sel: (s: { organizations: unknown[] }) => unknown) => sel({ organizations: [] }) }));
vi.mock('../../components/boletos/EmailCaptureSenderSheet', () => ({
    default: (p: { open: boolean; prefill: { email?: string } | null }) => (p.open ? <div data-testid="sheet-remetente">{p.prefill?.email}</div> : null),
}));

import EmailCapturaConfig from '../../components/boletos/EmailCapturaConfig';
import { ConfirmProvider } from '../../components/ui/confirm';

const msg = (id: string, remetente: string, resultado: string, extra: Record<string, unknown> = {}) => ({
    id, organization_id: 'o1', account_id: 'c1', remetente, assunto: `Assunto ${id}`, data_email: '2026-10-10T12:00:00Z',
    documento_nome: `${id}.pdf`, resultado, motivo: null, erro: null, tentativas: 0, boleto_id: null, auth_results: null,
    created_at: '2026-10-10T12:00:00Z', ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.listarContas.mockResolvedValue([{ id: 'c1', organization_id: 'o1', usuario: 'caixa@gmail.com', status: 'ativa', modo: 'hibrido', modo_piloto: true }]);
    svc.listarRemetentes.mockResolvedValue([
        { id: 's1', organization_id: 'o1', account_id: 'c1', nome: 'Energisa', tipo: 'exato', email: 'faturas@energisa.com.br', dominio: null, palavras_chave: [], importacao: 'revisao', exigir_dmarc: true, ativo: true, supplier_id: null, pdf_senha_atualizada_em: null },
    ]);
    svc.listarBuscas.mockResolvedValue([]);
    svc.listarMensagens.mockResolvedValue([
        msg('m1', 'Anthropic <invoice@mail.anthropic.com>', 'ignorado', { motivo: 'Sem linha digitável…' }),
        msg('m2', 'faturas@energisa.com.br', 'criado', { boleto_id: 'b1' }),
        msg('m3', 'contas@destro.com.br', 'erro', { erro: 'falhou' }),
    ]);
});

const montar = () => render(
    <ConfirmProvider>
        <EmailCapturaConfig secao="historico" onAbrirBoleto={vi.fn()} />
    </ConfirmProvider>,
);

describe('Histórico da captura', () => {
    it('lê o período padrão (últimos 30 dias) da org ativa', async () => {
        montar();
        await waitFor(() => expect(svc.listarMensagens).toHaveBeenCalled());
        const [org, periodo] = svc.listarMensagens.mock.calls[0];
        expect(org).toBe('o1');
        expect(periodo).toEqual({ de: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
        const dias = (Date.parse(periodo.ate) - Date.parse(periodo.de)) / 86_400_000;
        expect(dias).toBe(29);
    });

    it('"Monitorar remetente" em texto só na linha ignorada de remetente sem cadastro', async () => {
        montar();
        await screen.findByText('Assunto m1');
        const botoes = screen.getAllByRole('button', { name: 'Monitorar remetente' });
        expect(botoes).toHaveLength(1);
        // Remetente já cadastrado (Energisa) não ganha a ação; o da falha ganha só o ícone.
        expect(screen.getAllByTitle('Monitorar este remetente')).toHaveLength(1);
        fireEvent.click(botoes[0]);
        expect(screen.getByTestId('sheet-remetente').textContent).toBe('invoice@mail.anthropic.com');
    });

    it('filtro Resultado recorta as linhas', async () => {
        montar();
        await screen.findByText('Assunto m1');
        fireEvent.click(screen.getByRole('button', { name: /^Resultado/ }));
        fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /Ignorado/ }));
        await waitFor(() => expect(screen.queryByText('Assunto m2')).toBeNull());
        expect(screen.getByText('Assunto m1')).toBeTruthy();
        expect(screen.queryByText('Assunto m3')).toBeNull();
    });
});
