import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F14/F59 (18/11/2026): a alçada decide no SERVIDOR. Enviar, aprovar e rejeitar são as RPCs
 * fn_alcada_enviar/aprovar/rejeitar; o approvalService não grava mais approval_status,
 * approval_chain nem approval_required_levels com UPDATE direto (o banco recusa — gatilho
 * trg_alcada_guarda). Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md.
 * A regra em si (alçada, nível da vez, faixa) é do banco: scripts/teste-alcada-no-servidor.sql.
 */
const m = vi.hoisted(() => ({
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    from: [] as string[],
    resposta: { data: { id: 'x', approval_status: 'PENDENTE' } as unknown, error: null as { message: string } | null },
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: async (fn: string, args: Record<string, unknown>) => { m.rpcs.push({ fn, args }); return m.resposta; },
        from: (t: string) => { m.from.push(t); throw new Error(`approvalService não deveria ler/gravar ${t} direto`); },
    },
}));

import { approvalService } from '../services/approvalService';

describe('approvalService → RPCs da alçada', () => {
    beforeEach(() => {
        m.rpcs = []; m.from = [];
        m.resposta = { data: { id: 'x', approval_status: 'PENDENTE' }, error: null };
    });

    it('submit chama fn_alcada_enviar com o semFaixa e o extra; não toca a tabela', async () => {
        const r = await approvalService.submit('transaction', 't1',
            { business_status: 'AGUARDANDO_APROVACAO' }, { semFaixa: 'liberar', organizationId: 'o', amount: 1 });
        expect(r).toEqual({ id: 'x', approval_status: 'PENDENTE' });
        expect(m.from).toEqual([]);
        expect(m.rpcs).toEqual([{ fn: 'fn_alcada_enviar', args: {
            p_entity: 'transaction', p_id: 't1', p_sem_faixa: 'liberar',
            p_extra: { business_status: 'AGUARDANDO_APROVACAO' },
        } }]);
    });

    it('submit sem semFaixa manda exigir1 (o default histórico)', async () => {
        await approvalService.submit('doc_gen_documento', 'd1');
        expect(m.rpcs[0].args).toMatchObject({ p_entity: 'doc_gen_documento', p_sem_faixa: 'exigir1', p_extra: {} });
    });

    it('resubmit manda p_reenvio', async () => {
        await approvalService.resubmit('transaction', 't1', { business_status: null });
        expect(m.rpcs[0]).toEqual({ fn: 'fn_alcada_enviar', args: {
            p_entity: 'transaction', p_id: 't1', p_sem_faixa: 'exigir1', p_extra: { business_status: null }, p_reenvio: true,
        } });
    });

    it('approve chama fn_alcada_aprovar com o nível (só conferido pelo servidor), rótulos e extra', async () => {
        await approvalService.approve('contract', 'c1', 2, 'quem@x.com',
            { level1_label: 'Gestor', level2_label: 'Diretoria' }, 'ok', { status: 'Ativo' });
        expect(m.from).toEqual([]);
        expect(m.rpcs).toEqual([{ fn: 'fn_alcada_aprovar', args: {
            p_entity: 'contract', p_id: 'c1', p_nivel: 2, p_obs: 'ok',
            p_rotulos: { level1_label: 'Gestor', level2_label: 'Diretoria' },
            p_extra: { status: 'Ativo' },
        } }]);
        // o e-mail não vai: o passo é gravado em nome do login (JWT)
        expect(JSON.stringify(m.rpcs[0].args)).not.toContain('quem@x.com');
    });

    it('reject chama fn_alcada_rejeitar com motivo e extra', async () => {
        await approvalService.reject('process_step', 's1', 'quem@x.com', 'faltou documento', { status: 'REPROVADO' });
        expect(m.rpcs).toEqual([{ fn: 'fn_alcada_rejeitar', args: {
            p_entity: 'process_step', p_id: 's1', p_motivo: 'faltou documento', p_extra: { status: 'REPROVADO' },
        } }]);
    });

    it('recusa da alçada vira a frase para o usuário', async () => {
        m.resposta = { data: null, error: { message: 'ALCADA_NAO_PERMITE: o nível 1 deste item é aprovado por Bruna.' } };
        await expect(approvalService.approve('transaction', 't1', 1, 'a@x', { level1_label: 'Gestor' }))
            .rejects.toThrow(/^O nível 1 deste item é aprovado por Bruna.$/);
    });

    it('outro erro do servidor chega com o contexto', async () => {
        m.resposta = { data: null, error: { message: 'Item não está pendente de aprovação.' } };
        await expect(approvalService.reject('transaction', 't1', 'a@x', 'm')).rejects.toThrow('Erro ao rejeitar: Item não está pendente de aprovação.');
    });
});
