/**
 * Riscos do estudo: uma faixa só (a do módulo Riscos) e o que trava o comitê.
 * Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.1.
 */
import { describe, it, expect } from 'vitest';
import { rotuloDaCategoria, rotuloDaSituacao, nivelDoRiscoDoEstudo, riscoQueTrava, riscoEmAberto } from '../constants/imovibRiscos';

describe('riscos do estudo', () => {
    it('rotula as 14 categorias e a categoria "legal" das versões congeladas antes de 21/11', () => {
        expect(rotuloDaCategoria('juridico')).toBe('Jurídico');
        expect(rotuloDaCategoria('legal')).toBe('Jurídico');
        expect(rotuloDaCategoria('fundiario')).toBe('Fundiário');
        expect(rotuloDaSituacao('em_mitigacao')).toBe('Em mitigação');
    });

    it('usa a faixa do módulo Riscos: 5 médio, 12 alto, 20 crítico', () => {
        expect(nivelDoRiscoDoEstudo({ probability: 2, impact: 2 })).toBe('baixo');
        expect(nivelDoRiscoDoEstudo({ probability: 1, impact: 5 })).toBe('medio');
        expect(nivelDoRiscoDoEstudo({ probability: 3, impact: 4 })).toBe('alto');
        expect(nivelDoRiscoDoEstudo({ probability: 4, impact: 5 })).toBe('critico');
    });

    it('trava o gate só com risco alto/crítico ainda em aberto (materializado conta)', () => {
        expect(riscoQueTrava({ probability: 3, impact: 4, status: 'aberto' })).toBe(true);
        expect(riscoQueTrava({ probability: 4, impact: 5, status: 'materializado' })).toBe(true);
        expect(riscoQueTrava({ probability: 4, impact: 5, status: 'mitigado' })).toBe(false);
        expect(riscoQueTrava({ probability: 4, impact: 5, status: 'aceito' })).toBe(false);
        expect(riscoQueTrava({ probability: 2, impact: 2, status: 'aberto' })).toBe(false);
        expect(riscoEmAberto({ status: 'em_mitigacao' })).toBe(true);
    });
});
