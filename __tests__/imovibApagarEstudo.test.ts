import { describe, it, expect, vi } from 'vitest';

/**
 * Estudo com versão congelada não se apaga (item 3 do plano
 * docs/planos/2026-11-12-imovib-governanca-pendencias.md): o banco recusa (FK
 * RESTRICT, erro 23503) e o serviço diz por quê.
 */
const resposta = vi.hoisted(() => ({ error: null as null | { code: string; message: string } }));
vi.mock('../lib/supabase', () => ({
    supabase: { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: resposta.error }) }) }) },
}));

import { imovibService } from '../services/imovibService';

describe('apagar estudo com versão congelada', () => {
    it('o erro de chave do banco vira a mensagem que diz por quê', async () => {
        resposta.error = { code: '23503', message: 'update or delete on table "imovib_studies" violates foreign key constraint "imovib_study_versions_study_id_fkey"' };
        await expect(imovibService.deleteStudy('e1')).rejects.toThrow('Este estudo tem versões congeladas e não pode ser apagado.');
    });

    it('sem versão, apaga', async () => {
        resposta.error = null;
        await expect(imovibService.deleteStudy('e1')).resolves.toBeUndefined();
    });
});
