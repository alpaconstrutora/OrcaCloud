import { describe, it, expect } from 'vitest';
import { areaEquivalenteDasVersoes, type VersaoComQuadro } from '../utils/imovibAreaEquivalente';

/**
 * Área equivalente NBR 12721 no estudo (item 8.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o estudo lê o
 * quadro gravado na Planta, não recalcula a norma.
 */
const versao = (over: Partial<VersaoComQuadro> = {}): VersaoComQuadro => ({
    snapshotId: 's1',
    revisao: 1,
    aprovacoes: [],
    status: 'success',
    quadroI: [{ qi_18_floor_equivalent_total_raw: 1_000.5 }, { qi_18_floor_equivalent_total_raw: 2_000.25 }],
    ...over,
});

describe('8.2 — área equivalente da versão gravada', () => {
    it('sem quadro gravado: null (a tela diz "não medido", nunca zero)', () => {
        expect(areaEquivalenteDasVersoes([])).toBeNull();
    });

    it('o total é a soma de qi_18_floor_equivalent_total_raw do Quadro I', () => {
        const r = areaEquivalenteDasVersoes([versao()]);
        expect(r?.total).toBeCloseTo(3_000.75, 6);
        expect(r?.revisao).toBe(1);
        expect(r?.situacao).toBe('Sem aprovação');
    });

    it('escolhe a versão como o memorial: aprovada técnica e jurídica antes da revisão mais alta', () => {
        const r = areaEquivalenteDasVersoes([
            versao({ snapshotId: 'aprovada', revisao: 2, aprovacoes: [{ tipo: 'TECNICA' }, { tipo: 'JURIDICA' }], quadroI: [{ qi_18_floor_equivalent_total_raw: 500 }] }),
            versao({ snapshotId: 'nova', revisao: 3, quadroI: [{ qi_18_floor_equivalent_total_raw: 900 }] }),
        ]);
        expect(r?.snapshotId).toBe('aprovada');
        expect(r?.total).toBe(500);
        expect(r?.situacao).toBe('Técnica e jurídica aprovadas');
    });

    it('quadro com pendência bloqueante continua com o total, marcado', () => {
        expect(areaEquivalenteDasVersoes([versao({ status: 'failed' })])?.status).toBe('failed');
    });

    it('Quadro I vazio ou sem área conta como não medido, nunca zero', () => {
        expect(areaEquivalenteDasVersoes([versao({ quadroI: [] })])).toBeNull();
        expect(areaEquivalenteDasVersoes([versao({ quadroI: [{ qi_18_floor_equivalent_total_raw: 0 }] })])).toBeNull();
    });
});
