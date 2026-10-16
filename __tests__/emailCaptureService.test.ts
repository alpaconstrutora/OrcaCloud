/**
 * Cadastro de remetente da captura (15/10/2026, plano S5): o banco só concede
 * INSERT/UPDATE de algumas colunas. Mandar `id`, `created_at` ou
 * `pdf_senha_atualizada_em` levaria 42501 — e a senha só vai pela RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: Array<{ op: string; payload?: unknown; rpc?: string; args?: unknown }> = [];
/** Respostas das Edge Functions, na ordem; vazio = resposta padrão. */
const respostasFn: unknown[] = [];

vi.mock('../lib/supabase', () => {
    const fim = { select: () => ({ single: async () => ({ data: { id: 's1' }, error: null }) }) };
    return {
        supabase: {
            from: () => ({
                insert: (payload: unknown) => (chamadas.push({ op: 'insert', payload }), fim),
                update: (payload: unknown) => (chamadas.push({ op: 'update', payload }), { eq: () => fim }),
            }),
            rpc: async (rpc: string, args: unknown) => (chamadas.push({ op: 'rpc', rpc, args }), { data: null, error: null }),
            functions: { invoke: async (nome: string, opts: { body: unknown }) => (chamadas.push({ op: 'fn', rpc: nome, args: opts.body }), { data: respostasFn.length ? respostasFn.shift() : { busca: { id: 'b1' } }, error: null }) },
        },
    };
});

import { emailCaptureService, progressoDaBusca } from '../services/emailCaptureService';

const PERMITIDAS = ['organization_id', 'account_id', 'supplier_id', 'nome', 'tipo', 'email', 'dominio', 'palavras_chave', 'importacao', 'exigir_dmarc', 'ativo',
    // Padrões do boleto (16/10/2026) — também concedidos por coluna.
    'padrao_descricao', 'padrao_observacoes', 'padrao_project_id', 'padrao_cost_center_id', 'padrao_plano_de_contas_id', 'padrao_category_id',
    'padrao_dia_vencimento', 'padrao_valor', 'padrao_multa', 'padrao_multa_percentual', 'padrao_juros_dia', 'padrao_juros_dia_tipo'];

beforeEach(() => { chamadas.length = 0; respostasFn.length = 0; });

describe('salvarRemetente — só colunas concedidas', () => {
    it('editar a partir do registro lido não manda id, created_at nem a data da senha', async () => {
        const lido = {
            id: 's1', created_at: '2026-10-15', pdf_senha_atualizada_em: '2026-10-15T22:00:00Z',
            organization_id: 'o1', account_id: 'c1', supplier_id: null, nome: 'Energisa', tipo: 'exato' as const,
            email: ' Faturas@Energisa.com.br ', dominio: 'x', palavras_chave: [' fatura ', ''], importacao: 'revisao' as const,
            exigir_dmarc: true, ativo: true,
        };
        await emailCaptureService.salvarRemetente('s1', lido as never);
        const payload = chamadas[0].payload as Record<string, unknown>;
        expect(Object.keys(payload).sort()).toEqual([...PERMITIDAS].sort());
        expect(payload.email).toBe('faturas@energisa.com.br');
        expect(payload.dominio).toBeNull();
        expect(payload.palavras_chave).toEqual(['fatura']);
    });
});

describe('definirSenhaPdf — pela RPC, vazio remove', () => {
    it('grava e remove pela RPC', async () => {
        await emailCaptureService.definirSenhaPdf('s1', '12345');
        await emailCaptureService.definirSenhaPdf('s1', null);
        expect(chamadas).toEqual([
            { op: 'rpc', rpc: 'email_capture_definir_senha_pdf', args: { p_sender: 's1', p_senha: '12345' } },
            { op: 'rpc', rpc: 'email_capture_definir_senha_pdf', args: { p_sender: 's1', p_senha: '' } },
        ]);
    });
});

describe('busca por período', () => {
    it('iniciar, continuar e cancelar chamam a sincronização com o modo certo', async () => {
        await emailCaptureService.buscarPeriodo('c1', '2026-09-01', '2026-09-30');
        await emailCaptureService.continuarBusca('c1');
        await emailCaptureService.cancelarBusca('b1');
        expect(chamadas).toEqual([
            { op: 'fn', rpc: 'email-capture-sync', args: { modo: 'periodo', accountId: 'c1', de: '2026-09-01', ate: '2026-09-30' } },
            { op: 'fn', rpc: 'email-capture-sync', args: { modo: 'periodo', accountId: 'c1' } },
            { op: 'fn', rpc: 'email-capture-sync', args: { modo: 'cancelar_busca', buscaId: 'b1' } },
        ]);
    });

    it('progresso: null antes de contar, 100 quando conclui ou não há e-mails', () => {
        expect(progressoDaBusca({ status: 'pendente', total_mensagens: null, mensagens_processadas: 0 })).toBeNull();
        expect(progressoDaBusca({ status: 'em_andamento', total_mensagens: 200, mensagens_processadas: 50 })).toBe(25);
        expect(progressoDaBusca({ status: 'em_andamento', total_mensagens: 0, mensagens_processadas: 0 })).toBe(100);
        expect(progressoDaBusca({ status: 'concluida', total_mensagens: 10, mensagens_processadas: 3 })).toBe(100);
    });
});

describe('busca por período com remetentes', () => {
    it('manda remetentes só quando há algum', async () => {
        await emailCaptureService.buscarPeriodo('c1', '2026-09-01', '2026-09-30', ['energisaonline.com.br']);
        await emailCaptureService.buscarPeriodo('c1', '2026-09-01', '2026-09-30', []);
        expect(chamadas).toEqual([
            { op: 'fn', rpc: 'email-capture-sync', args: { modo: 'periodo', accountId: 'c1', de: '2026-09-01', ate: '2026-09-30', remetentes: ['energisaonline.com.br'] } },
            { op: 'fn', rpc: 'email-capture-sync', args: { modo: 'periodo', accountId: 'c1', de: '2026-09-01', ate: '2026-09-30' } },
        ]);
    });
});

/* 16/10/2026: chamada da tela trabalha em lotes de ~15 s (o navegador corta
   Edge Function em 150 s, e o resto do client em 20 s); a função diz se ficou fila. */
describe('Sincronizar agora — repete enquanto a função disser que ficou fila', () => {
    const lote = (n: number, pendente: boolean) =>
        ({ contas: 1, mensagens: n, criados: n, duplicados: 1, ignorados: 0, erros: 0, pendente });

    it('soma os lotes e para quando a fila acaba', async () => {
        respostasFn.push(lote(2, true), lote(3, true), lote(1, false));
        const r = await emailCaptureService.sincronizarAgora('c1');
        expect(chamadas.filter(c => c.op === 'fn')).toHaveLength(3);
        expect(chamadas.every(c => (c.args as { modo: string }).modo === 'agora')).toBe(true);
        expect(r).toEqual({ mensagens: 6, criados: 6, duplicados: 3, ignorados: 0, erros: 0, pendente: false });
    });

    it('para no limite de rodadas e avisa que ainda há fila', async () => {
        respostasFn.push(lote(1, true), lote(1, true), lote(1, true));
        const r = await emailCaptureService.sincronizarAgora('c1', 2);
        expect(chamadas.filter(c => c.op === 'fn')).toHaveLength(2);
        expect(r.pendente).toBe(true);
        expect(r.criados).toBe(2);
    });

    it('função antiga, sem "pendente": uma rodada só', async () => {
        respostasFn.push({ contas: 1, mensagens: 0, criados: 0, duplicados: 0, ignorados: 0, erros: 0 });
        const r = await emailCaptureService.sincronizarAgora('c1');
        expect(chamadas.filter(c => c.op === 'fn')).toHaveLength(1);
        expect(r.pendente).toBe(false);
    });
});

describe('salvarRemetente — padrões do boleto (16/10/2026)', () => {
    it('texto em branco e id vazio viram null; juros sem valor não manda tipo; valor zero não grava', async () => {
        await emailCaptureService.salvarRemetente(null, {
            organization_id: 'o1', account_id: 'c1', supplier_id: null, nome: 'LL', tipo: 'exato', email: 'll@x.com', dominio: null,
            palavras_chave: [], importacao: 'revisao', exigir_dmarc: true, ativo: true,
            padrao_descricao: '  Honorários {mês} ', padrao_observacoes: '   ', padrao_project_id: '', padrao_cost_center_id: 'cc1',
            padrao_plano_de_contas_id: null, padrao_category_id: null, padrao_dia_vencimento: 10, padrao_valor: 0,
            padrao_multa: null, padrao_multa_percentual: 2, padrao_juros_dia: null, padrao_juros_dia_tipo: 'percentual',
        } as never);
        const payload = chamadas[0].payload as Record<string, unknown>;
        expect(payload).toMatchObject({
            padrao_descricao: 'Honorários {mês}', padrao_observacoes: null, padrao_project_id: null, padrao_cost_center_id: 'cc1',
            padrao_dia_vencimento: 10, padrao_valor: null, padrao_multa_percentual: 2, padrao_juros_dia: null, padrao_juros_dia_tipo: null,
        });
    });
});
