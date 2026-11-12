import { describe, it, expect } from 'vitest';
import { resultadoPorSocio } from '../utils/imovibSocios';
import type { LinhaDeAporte } from '../utils/imovibAportes';
import { computeImovibMath } from '../hooks/useImovibMath';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Resultado por sócio (item 9.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): os sócios aportam
 * pela participação nos aportes; as distribuições devolvem primeiro o capital de
 * cada um e repartem o lucro pela participação no resultado.
 */
const linha = (mes: number, aporte: number, distribuicao: number, paraTerceiros = 0): LinhaDeAporte =>
    ({ mes, aporte, distribuicao, caixa: 0, paraTerceiros });
// Aporta 1.000 no mês 1 e 500 no mês 3; distribui 600 no mês 12 e 1.900 no mês 24 (lucro 1.000).
const LINHAS: LinhaDeAporte[] = Array.from({ length: 24 }, (_, i) => {
    const m = i + 1;
    return linha(m, m === 1 ? 1_000 : m === 3 ? 500 : 0, m === 12 ? 600 : m === 24 ? 1_900 : 0);
});
const socio = (name: string, share_percent: number, capital_percent: number) => ({ name, share_percent, capital_percent });

describe('9.2 — resultado por sócio', () => {
    it('dois sócios 60/40 nos dois percentuais: a mesma TIR do incorporador e lucros de 60% e 40%', () => {
        const r = resultadoPorSocio(LINHAS, [socio('A', 60, 60), socio('B', 40, 40)]);
        const [a, b] = r.socios;
        expect(a.tirAnual).toBeCloseTo(r.tirDoIncorporador, 6);
        expect(b.tirAnual).toBeCloseTo(r.tirDoIncorporador, 6);
        expect(a.lucro).toBeCloseTo(600, 6);
        expect(b.lucro).toBeCloseTo(400, 6);
        expect(a.aportes).toBeCloseTo(900, 6);
        expect(a.distribuicoes).toBeCloseTo(1_500, 6);
        expect(r.avisos).toEqual([]);
    });

    it('sócio com 50% do resultado e 30% dos aportes tem TIR maior que a do incorporador', () => {
        const r = resultadoPorSocio(LINHAS, [socio('A', 50, 30), socio('B', 50, 70)]);
        expect(r.socios[0].tirAnual).toBeGreaterThan(r.tirDoIncorporador);
        expect(r.socios[1].tirAnual).toBeLessThan(r.tirDoIncorporador);
        expect(r.socios[0].lucro).toBeCloseTo(500, 6);
        // O capital volta a cada um primeiro: B aportou 1.050 e recebe 1.050 + 500.
        expect(r.socios[1].distribuicoes).toBeCloseTo(1_550, 6);
    });

    it('soma diferente de 100%: aviso, e calcula como veio', () => {
        const r = resultadoPorSocio(LINHAS, [socio('A', 50, 60), socio('B', 40, 40)]);
        expect(r.avisos.some(a => /resultado soma 90%/.test(a))).toBe(true);
        expect(r.avisos.some(a => /aportes/.test(a))).toBe(false);
        expect(r.socios[1].lucro).toBeCloseTo(400, 6);
    });

    it('a parte das fontes por participação não é dos sócios', () => {
        const comFonte = LINHAS.map(l => (l.mes === 24 ? { ...l, paraTerceiros: 300 } : l));
        const r = resultadoPorSocio(comFonte, [socio('A', 100, 100)]);
        expect(r.socios[0].distribuicoes).toBeCloseTo(2_200, 6);
        expect(r.socios[0].lucro).toBeCloseTo(700, 6);
    });

    it('aportes somando menos de 100%: o capital sem dono volta para ninguém, não vira lucro do sócio', () => {
        const r = resultadoPorSocio(LINHAS, [socio('A', 50, 50)]);
        expect(r.socios[0].aportes).toBeCloseTo(750, 6);
        expect(r.socios[0].lucro).toBeCloseTo(500, 6);
        expect(r.socios[0].distribuicoes).toBeCloseTo(1_250, 6);
    });

    it('cruzado com o motor: com 100% nos dois, os sócios recebem a parte do incorporador (sem a das fontes)', () => {
        const estudo = baseStudy({
            funding_sources: [{ id: 'f1', study_id: 'estudo-teste', name: 'Investidor', kind: 'investidor', amount: 1_000_000, entry_month: 3,
                remuneration: 'participacao', rate_annual: null, profit_share_percent: 30, amortization: 'BULLET', term_months: 24, grace_months: 0, sort_order: 0 }],
        });
        const linhas = computeImovibMath(estudo as never).aportes;
        expect(linhas.some(l => l.paraTerceiros > 0)).toBe(true);
        const r = resultadoPorSocio(linhas, [socio('A', 70, 70), socio('B', 30, 30)]);
        const doIncorporador = linhas.reduce((a, l) => a + l.distribuicao - l.paraTerceiros, 0);
        expect(r.socios[0].distribuicoes + r.socios[1].distribuicoes).toBeCloseTo(doIncorporador, 2);
        expect(r.socios[0].tirAnual).toBeCloseTo(r.tirDoIncorporador, 6);
    });

    it('sem sócios: lista vazia e sem aviso', () => {
        expect(resultadoPorSocio(LINHAS, [])).toMatchObject({ socios: [], avisos: [] });
    });

    it('sócio sem aporte e com resultado: sem TIR (só recebe), não infinito', () => {
        const r = resultadoPorSocio(LINHAS, [socio('A', 20, 0), socio('B', 80, 100)]);
        expect(r.socios[0].aportes).toBe(0);
        expect(r.socios[0].lucro).toBeCloseTo(200, 6);
        expect(Number.isNaN(r.socios[0].tirAnual)).toBe(true);
    });
});
