import { describe, expect, it } from 'vitest';
import { pavimentosDaTorre } from '../utils/empreendimentoPavimentosDaTorre';

// docs/planos/2026-11-25-torre-card-pavimentos.md
describe('pavimentosDaTorre', () => {
    it('o Nº de pavimentos da torre vale quando existe', () => {
        expect(pavimentosDaTorre(6, [{ repeat_count: 10 }], [{ floor: 1 }])).toEqual({ n: 6, fonte: 'TORRE' });
    });

    it('vazio: conta o cadastro de pavimentos (soma das repetições, como a seção Pavimentos)', () => {
        // Torre A do Garden: 2 estacionamentos, térreo e 3 tipos = 6 andares.
        const cadastro = [{ repeat_count: 1 }, { repeat_count: 1 }, { repeat_count: 1 }, { repeat_count: 3 }];
        expect(pavimentosDaTorre(null, cadastro, [])).toEqual({ n: 6, fonte: 'CADASTRO' });
        expect(pavimentosDaTorre(0, cadastro, [])).toEqual({ n: 6, fonte: 'CADASTRO' });
    });

    it('sem número nem cadastro: os andares distintos das unidades', () => {
        expect(pavimentosDaTorre(undefined, [], [{ floor: -1 }, { floor: 0 }, { floor: 1 }, { floor: 1 }, { floor: null }])).toEqual({ n: 3, fonte: 'UNIDADES' });
    });

    it('nada disso: null ("sem pavimentos")', () => {
        expect(pavimentosDaTorre(null, undefined, undefined)).toBeNull();
        expect(pavimentosDaTorre(null, [], [{ floor: null }])).toBeNull();
    });
});
