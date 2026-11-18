import { describe, it, expect, vi, beforeEach } from 'vitest';

// 18/11/2026 (F14): o reenvio é a RPC fn_alcada_enviar com p_reenvio — o SERVIDOR confere que o
// título está REJEITADO, mantém a cadeia e calcula os níveis da faixa. Aqui fica o contrato do
// lado da tela: chama o reenvio do approvalService e tira o título de BLOQUEADO.
const m = vi.hoisted(() => ({
    chamadas: [] as { entity: string; id: string; extra: Record<string, unknown> }[],
    erro: null as Error | null,
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/approvalService', () => ({
    approvalService: {
        resubmit: vi.fn(async (entity: string, id: string, extra: Record<string, unknown>) => {
            m.chamadas.push({ entity, id, extra });
            if (m.erro) throw m.erro;
            return { id, approval_status: 'PENDENTE' };
        }),
    },
}));
vi.mock('../services/processService', () => ({ processService: {} }));

import { financialApprovalService } from '../services/financialApprovalService';

describe('financialApprovalService.reenviar', () => {
    beforeEach(() => { m.chamadas = []; m.erro = null; });

    it('reenvia pelo servidor e tira o título de BLOQUEADO (sem gravar campo de aprovação daqui)', async () => {
        await financialApprovalService.reenviar('t1');
        expect(m.chamadas).toHaveLength(1);
        expect(m.chamadas[0]).toMatchObject({ entity: 'transaction', id: 't1' });
        expect(m.chamadas[0].extra).toMatchObject({ business_status: null });
        expect(Object.keys(m.chamadas[0].extra).filter(k => k.startsWith('approval'))).toEqual([]);
    });

    it('recusa do servidor (título que não está rejeitado) chega à tela', async () => {
        m.erro = new Error('Só item rejeitado é reenviado para aprovação.');
        await expect(financialApprovalService.reenviar('t1')).rejects.toThrow(/rejeitado/i);
    });
});
