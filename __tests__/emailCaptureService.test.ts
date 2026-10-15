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
        },
    };
});

import { emailCaptureService } from '../services/emailCaptureService';

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
