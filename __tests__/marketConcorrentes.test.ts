/**
 * Fase 7.7 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md: concorrentes monitorados do
 * Market (raio do estudo de terreno) e a importação deles como comparáveis do Imovib.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caixaDoRaio, comparavelDoConcorrente, distanciaEmKm, jaEhComparavel, noRaio, type ConcorrenteMonitorado } from '../utils/marketConcorrentes';

const centro = { latitude: -15.6, longitude: -56.1 };
const conc = (over: Partial<ConcorrenteMonitorado> = {}): ConcorrenteMonitorado => ({
    id: 'c1', studyId: 't1', origem: 'anuncio', nome: 'Apartamento · 2 quarto(s)', endereco: 'Rua A, 10',
    preco: 500_000, area: 62.5, precoM2: null, totalDeUnidades: null, incorporadora: null, lancamento: null,
    posicao: { latitude: -15.605, longitude: -56.1 }, listingId: 'l1', developmentId: null, ...over,
});

describe('raio', () => {
    it('distância com uma casa e filtro do raio em ordem', () => {
        expect(distanciaEmKm(centro, { latitude: -15.609, longitude: -56.1 })).toBe(1);
        const r = noRaio([
            { id: 'longe', latitude: -15.7, longitude: -56.1 },
            { id: 'perto', latitude: -15.601, longitude: -56.1 },
            { id: 'meio', latitude: -15.605, longitude: -56.1 },
            { id: 'sem', latitude: null, longitude: null },
        ], centro, 1000);
        expect(r.map(x => x.id)).toEqual(['perto', 'meio']);
    });
    it('a caixa contém o raio', () => {
        const c = caixaDoRaio(centro, 1000);
        expect(c.latMin).toBeLessThan(-15.608);
        expect(c.latMax).toBeGreaterThan(-15.592);
    });
});

describe('comparavelDoConcorrente', () => {
    it('anúncio: preço/m² pela área, distância do terreno, vendidas em branco', () => {
        const c = comparavelDoConcorrente(conc(), 'est', centro, '2026-11-21', 3);
        expect(c).toMatchObject({ study_id: 'est', name: 'Apartamento · 2 quarto(s)', ticket: 500_000, typical_area: 62.5,
            price_sqm: 8000, distance_km: 0.6, sold_units: null, collected_at: '2026-11-21', sort_order: 3, source: 'Ópura Market (anúncio)' });
    });
    it('lançamento: unidades e incorporadora; sem posição, sem distância', () => {
        const c = comparavelDoConcorrente(conc({ origem: 'lancamento', totalDeUnidades: 120, incorporadora: 'X', precoM2: 9000, posicao: null }), 'est', centro, '2026-11-21', 0);
        expect(c).toMatchObject({ total_units: 120, developer: 'X', price_sqm: 9000, distance_km: null });
    });
    it('não importa duas vezes o mesmo nome e endereço', () => {
        expect(jaEhComparavel(conc(), [{ name: ' apartamento · 2 quarto(s) ', address: 'Rua A, 10' }])).toBe(true);
        expect(jaEhComparavel(conc(), [{ name: 'Outro', address: 'Rua A, 10' }])).toBe(false);
    });
});

describe('migration 995000', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271121995000_market_concorrentes_monitorados.sql'), 'utf8')
        .replace(/--.*$/gm, '');
    it('a policy confere a org do estudo de terreno e a do anúncio, não só a da linha', () => {
        expect(sql).toMatch(/FROM public\.opura_market_terrain_studies s\s+WHERE s\.id = study_id AND s\.organization_id = opura_market_monitored_competitors\.organization_id/);
        expect(sql).toMatch(/listing_id IS NULL OR EXISTS/);
    });
});
