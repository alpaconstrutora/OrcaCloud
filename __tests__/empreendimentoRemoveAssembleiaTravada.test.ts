/**
 * Excluir empreendimento/condomínio com assembleia registrada.
 *
 * A trava da assembleia (`_assembleia_trava`, migration 860100) recusa excluir
 * assembleia convocada, encerrada ou cancelada — é registro legal — e a exclusão
 * do empreendimento chega lá pela CASCATA (empreendimentos → condominio_assembleias,
 * avisos → SET NULL do aviso_id). A recusa vem com HINT 'assembleia_travada' e uma
 * mensagem sobre UMA assembleia ("Esta assembleia já foi encerrada… não se exclui"),
 * que na tela de empreendimentos não diz nada a quem clicou em Excluir.
 *
 * O que se trava: o serviço troca essa recusa por uma frase do caso dele, e
 * qualquer outro erro continua saindo como antes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let erroDoDelete: { message: string; code?: string; hint?: string } | null = null;
const audit = vi.fn();

vi.mock('../lib/supabase', () => {
    const select = () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { name: 'Residencial Teste', organization_id: 'org-1' }, error: null }) }),
    });
    const del = () => ({ eq: async () => ({ error: erroDoDelete }) });
    return { supabase: { from: () => ({ select, delete: del }) } };
});
vi.mock('../services/empreendimentoAuditService', () => ({
    empreendimentoAuditService: { record: (...a: unknown[]) => audit(...a) },
}));

import { empreendimentoService } from '../services/empreendimentoService';

beforeEach(() => {
    erroDoDelete = null;
    audit.mockReset();
});

describe('empreendimentoService.remove — assembleia registrada', () => {
    it('recusa da trava (HINT assembleia_travada) vira a frase do condomínio', async () => {
        erroDoDelete = {
            message: 'Esta assembleia já foi encerrada: nada mais muda, e ela não se exclui.',
            code: '23514', hint: 'assembleia_travada',
        };
        await expect(empreendimentoService.remove('emp-1'))
            .rejects.toThrow('Este condomínio tem assembleias registradas e não pode ser excluído.');
        expect(audit).not.toHaveBeenCalled();
    });

    it('também a recusa que vem pelo SET NULL do aviso da convocação', async () => {
        erroDoDelete = {
            message: 'Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.',
            code: '23514', hint: 'assembleia_travada',
        };
        await expect(empreendimentoService.remove('emp-1'))
            .rejects.toThrow('Este condomínio tem assembleias registradas e não pode ser excluído.');
    });

    it('outro erro continua como era', async () => {
        erroDoDelete = { message: 'permission denied for table empreendimentos', code: '42501' };
        await expect(empreendimentoService.remove('emp-1'))
            .rejects.toThrow('Failed to delete empreendimento: permission denied for table empreendimentos');
    });

    it('sem erro, exclui e grava a trilha', async () => {
        await empreendimentoService.remove('emp-1');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', entityId: 'emp-1' }));
    });
});
