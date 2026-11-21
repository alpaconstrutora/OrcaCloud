/**
 * Fase A (segurança) de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md — lado do app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../lib/supabase', () => ({
    supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a), storage: { from: vi.fn() } },
}));
vi.mock('../services/storageService', () => ({ storageService: { uploadFile: vi.fn() } }));

import { resumoFinanceiroDoInvestidor } from '../services/pdfReportService';
import { investorPortalTokenService } from '../services/investorPortalTokenService';
import { announcementsService } from '../services/announcementsService';
import { assertDocumentNotDuplicated } from '../services/documentDuplicateCheck';

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation((t: string) => { throw new Error(`não pode gravar ${t} direto`); });
});

describe('A2 — relatório mensal de UM investidor', () => {
    const obras = [{ id: 'o1', name: 'Garden' }, { id: 'o2', name: 'Torre' }];
    const lancamentos = [
        { project_id: 'o1', investor_id: 'eu', type: 'aporte', amount: 100, status: 'liquidado' },
        { project_id: 'o1', investor_id: 'outro', type: 'aporte', amount: 9_999, status: 'liquidado' },
        { project_id: 'o1', investor_id: 'eu', type: 'dividendo', amount: 10, status: 'liquidado' },
        { project_id: 'o1', investor_id: 'eu', type: 'distribuicao', amount: 5, status: 'pendente' },
        { project_id: 'o2', investor_id: 'outro', type: 'aporte', amount: 500, status: 'liquidado' },
    ];
    it('só os lançamentos do investidor; recebido só liquidado; obra sem nada dele some', () => {
        expect(resumoFinanceiroDoInvestidor(obras, lancamentos, 'eu')).toEqual([
            { name: 'Garden', aportes: 100, dividendos: 10, pendentes: 5 },
        ]);
    });
});

describe('A1 — revogar o link só pela RPC', () => {
    it('chama investor_portal_revoke_token e não grava a tabela', async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        await investorPortalTokenService.revokeToken('inv-1');
        expect(rpc).toHaveBeenCalledWith('investor_portal_revoke_token', { p_investor_id: 'inv-1' });
        expect(from).not.toHaveBeenCalled();
    });
});

describe('A7 — ciência/voto do investidor logado pelo token dele', () => {
    it('pega o próprio token e responde pela RPC do link', async () => {
        rpc.mockImplementation((nome: string) => Promise.resolve(nome === 'portal_token_para_mim'
            ? { data: { situacao: 'ok', token: 'tok-1' }, error: null }
            : { data: { valid: true }, error: null }));
        await announcementsService.acknowledge('ann-1', 'qualquer', 'sim');
        expect(rpc).toHaveBeenCalledWith('portal_token_para_mim', { p_portal: 'investidor' });
        expect(rpc).toHaveBeenCalledWith('fn_investor_portal_acknowledge', { p_token: 'tok-1', p_announcement_id: 'ann-1', p_vote_option: 'sim' });
        expect(from).not.toHaveBeenCalled();
    });
    it('sem acesso de investidor ativo, diz por quê', async () => {
        rpc.mockResolvedValue({ data: { situacao: 'revogado' }, error: null });
        await expect(announcementsService.acknowledge('ann-1', 'x')).rejects.toThrow(/não está ativo/);
    });
});

describe('A8 — CPF/CNPJ de outra organização: só "existe em <org>"', () => {
    it('sem nome nem código, a mensagem ainda bloqueia e diz a organização', async () => {
        rpc.mockResolvedValue({ data: [{ id: null, name: null, code: null, organization_id: 'b', organization_name: 'Alpa B' }], error: null });
        await expect(assertDocumentNotDuplicated('investor', '123.456.789-00')).rejects.toThrow(/já está cadastrado como investidor na organização "Alpa B"/);
    });
});
