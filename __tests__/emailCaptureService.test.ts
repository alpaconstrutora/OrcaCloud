/**
 * Cadastro de remetente da captura (15/10/2026, plano S5): o banco só concede
 * INSERT/UPDATE de algumas colunas. Mandar `id`, `created_at` ou
 * `pdf_senha_atualizada_em` levaria 42501 — e a senha só vai pela RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: Array<{ op: string; payload?: unknown; rpc?: string; args?: unknown }> = [];

vi.mock('../lib/supabase', () => {
    const fim = { select: () => ({ single: async () => ({ data: { id: 's1' }, error: null }) }) };
    return {
        supabase: {
            from: () => ({
                insert: (payload: unknown) => (chamadas.push({ op: 'insert', payload }), fim),
                update: (payload: unknown) => (chamadas.push({ op: 'update', payload }), { eq: () => fim }),
            }),
            rpc: async (rpc: string, args: unknown) => (chamadas.push({ op: 'rpc', rpc, args }), { data: null, error: null }),
            functions: { invoke: async (nome: string, opts: { body: unknown }) => (chamadas.push({ op: 'fn', rpc: nome, args: opts.body }), { data: { busca: { id: 'b1' } }, error: null }) },
        },
    };
});

import { emailCaptureService, progressoDaBusca } from '../services/emailCaptureService';

const PERMITIDAS = ['organization_id', 'account_id', 'supplier_id', 'nome', 'tipo', 'email', 'dominio', 'palavras_chave', 'importacao', 'exigir_dmarc', 'ativo'];

beforeEach(() => { chamadas.length = 0; });

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
