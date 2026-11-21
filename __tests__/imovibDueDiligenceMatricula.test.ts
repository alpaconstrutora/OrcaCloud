/**
 * Leitura da matrícula → itens da due diligence do estudo (item 1.2 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md).
 */
import { describe, it, expect } from 'vitest';
import { atualizacoesDaMatricula, itemDaDueDiligenceQueTrava, type AchadoDaMatricula } from '../utils/imovibDueDiligenceMatricula';
import type { ImovibLandChecklistItem } from '../types';

const item = (item_key: string, extra: Partial<ImovibLandChecklistItem> = {}): ImovibLandChecklistItem => ({
    id: `id-${item_key}`, study_id: 'e', item_key, label: item_key, status: 'pendente', notes: null, sort_order: 0, criticidade: 'media', ...extra,
});
const achado = (extra: Partial<AchadoDaMatricula>): AchadoDaMatricula => ({
    item_key: 'onus_gravames', title: 'Hipoteca', description: 'Hipoteca vigente no R.6', criticidade: 'alta',
    suggested_status: 'inconforme', source_excerpt: 'R.6 — hipoteca', confidence: 0.9, ...extra,
});
const AGORA = '2026-11-21T12:00:00.000Z';

describe('atualizacoesDaMatricula', () => {
    it('achado inconforme vira "problema" no item da chave, com criticidade e origem da IA', () => {
        const [u, ...resto] = atualizacoesDaMatricula([achado({})], [item('matricula'), item('onus_gravames')], AGORA);
        expect(resto).toHaveLength(0);
        expect(u.id).toBe('id-onus_gravames');
        expect(u.campos.status).toBe('problema');
        expect(u.campos.criticidade).toBe('alta');
        expect(u.campos.ai_extracted).toBe(true);
        expect(u.campos.ai_confidence).toBe(0.9);
        expect(u.campos.ai_source_excerpt).toBe('R.6 — hipoteca');
        expect(u.campos.notes).toBe('IA (90%): Hipoteca: Hipoteca vigente no R.6');
    });

    it('a IA nunca marca "ok": pendente/em análise mantêm a situação, e um item "ok" continua "ok"', () => {
        const [u] = atualizacoesDaMatricula([achado({ suggested_status: 'em_analise' })], [item('onus_gravames', { status: 'ok' })], AGORA);
        expect(u.campos.status).toBeUndefined();
        const [v] = atualizacoesDaMatricula([achado({ suggested_status: 'pendente' })], [item('onus_gravames')], AGORA);
        expect(v.campos.status).toBeUndefined();
    });

    it('criticidade só sobe; observação antiga fica; vários achados no mesmo item viram uma atualização', () => {
        const [u] = atualizacoesDaMatricula(
            [achado({ criticidade: 'baixa', confidence: 0.7 }), achado({ title: 'Penhora', criticidade: 'critica', confidence: 0.4, source_excerpt: 'Av.3' })],
            [item('onus_gravames', { criticidade: 'alta', notes: 'Pedir certidão' })],
            AGORA,
        );
        expect(u.campos.criticidade).toBe('critica');
        expect(u.campos.ai_confidence).toBe(0.4);
        expect(u.campos.notes?.split('\n')).toEqual(['Pedir certidão', 'IA (70%): Hipoteca: Hipoteca vigente no R.6', 'IA (40%): Penhora: Hipoteca vigente no R.6']);
        expect(u.campos.ai_source_excerpt).toBe('R.6 — hipoteca | Av.3');
    });

    it('achado sem chave (ou com chave fora do checklist) cai no item "matricula"; sem esse item, é ignorado', () => {
        const [u] = atualizacoesDaMatricula([achado({ item_key: null }), achado({ item_key: 'inventada' })], [item('matricula')], AGORA);
        expect(u.id).toBe('id-matricula');
        expect(atualizacoesDaMatricula([achado({ item_key: null })], [item('onus_gravames')], AGORA)).toEqual([]);
    });
});

describe('itemDaDueDiligenceQueTrava', () => {
    it('alta/crítica sem "ok" nem "não se aplica" trava', () => {
        expect(itemDaDueDiligenceQueTrava({ criticidade: 'alta', status: 'pendente' })).toBe(true);
        expect(itemDaDueDiligenceQueTrava({ criticidade: 'critica', status: 'problema' })).toBe(true);
        expect(itemDaDueDiligenceQueTrava({ criticidade: 'critica', status: 'ok' })).toBe(false);
        expect(itemDaDueDiligenceQueTrava({ criticidade: 'alta', status: 'nao_se_aplica' })).toBe(false);
        expect(itemDaDueDiligenceQueTrava({ criticidade: 'media', status: 'problema' })).toBe(false);
    });
});
