import { describe, it, expect, vi } from 'vitest';

/**
 * "Salvar Premissas" grava o estudo inteiro do formulário. Desde a Fase 4 o
 * estudo traz `funding_sources` montado em memória (não é coluna), e o banco
 * recusava a gravação. updateStudy descarta os campos montados em memória.
 */
const update = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            update: (campos: unknown) => {
                update(campos);
                return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) };
            },
        }),
    },
}));

import { imovibService } from '../services/imovibService';

describe('updateStudy — campos montados em memória não vão ao banco', () => {
    it('descarta funding_sources, blocks, capex_items, unit_instances e estrutura', async () => {
        await imovibService.updateStudy('x', {
            name: 'Estudo', funding_sources: [], blocks: [], capex_items: [], unit_instances: [], estrutura: { origem: 'estudo' },
        } as never);
        expect(update).toHaveBeenCalledWith({ name: 'Estudo' });
    });
});
