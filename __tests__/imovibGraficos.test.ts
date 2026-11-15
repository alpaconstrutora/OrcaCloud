import { describe, it, expect } from 'vitest';

/**
 * Fase 3 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: os dados dos
 * gráficos saem de funções puras, usadas igual na tela, no PDF e no dashboard do investidor.
 */
import { fluxoAnual, dadosDosCenarios, dadosDoTornado, dadosDasVendas, fatiasDoCapital, GRAFICOS_DA_SECAO } from '../utils/imovibGraficos';
import { computeImovibMath } from '../utils/imovibMotor';
import { tornado, CHOQUES_PADRAO } from '../utils/imovibSensibilidade';
import { ORDEM_DAS_SECOES } from '../utils/imovibRelatorio';
import { baseStudy } from './fixtures/imovibEstudos';

describe('dados dos gráficos', () => {
    it('fluxo anual: soma receitas, custos e caixa por ano; acumulado é o do último mês do ano', () => {
        const r = computeImovibMath(baseStudy() as never);
        const anos = fluxoAnual(r.monthlyFlows);
        expect(anos[0].name).toBe('Ano 1');
        const ano1 = r.monthlyFlows.filter(f => f.month <= 12);
        expect(anos[0].net).toBeCloseTo(ano1.reduce((a, f) => a + f.net, 0), 6);
        expect(anos[0].acc).toBe(ano1[ano1.length - 1].acc);
        expect(anos.reduce((a, x) => a + x.rev, 0)).toBeCloseTo(r.monthlyFlows.reduce((a, f) => a + f.rev, 0), 6);
    });

    it('cenários: o estudo primeiro e cada cenário com o seu VPL', () => {
        const estudo = baseStudy();
        const linhas = dadosDosCenarios(estudo as never, [{ id: 'c1', study_id: 'e', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 }]);
        expect(linhas.map(l => l.nome)).toEqual(['Estudo', 'Pessimista']);
        expect(linhas[0].vpl).toBe(computeImovibMath(estudo as never).vpl);
        expect(linhas[1].vpl).toBeLessThan(linhas[0].vpl);
    });

    it('tornado: uma barra por variável, relativa ao estudo, com o rótulo do choque', () => {
        const estudo = baseStudy();
        const barras = tornado(estudo as never, 'vpl', CHOQUES_PADRAO);
        const d = dadosDoTornado(barras, 'vpl', CHOQUES_PADRAO);
        expect(d).toHaveLength(barras.length);
        expect(d[0].cima).toBeCloseTo(barras[0].acima - barras[0].base, 6);
        expect(d[0].nome).toContain(barras[0].rotulo);
    });

    it('vendas por mês: a partir do início das vendas, com o estoque que resta', () => {
        const r = computeImovibMath(baseStudy() as never);
        const d = dadosDasVendas(r, 1);
        expect(d[0].mes).toBe('Mês 1');
        expect(d.reduce((a, x) => a + x.vendas, 0)).toBeCloseTo(r.vendasPorMes.reduce((a, b) => a + b, 0), 6);
        expect(d[d.length - 1].estoque).toBeGreaterThanOrEqual(0);
    });

    it('capital: só as fatias com valor, com rótulo e cor', () => {
        const f = fatiasDoCapital({ proprio: 100, divida: 0, vendasNaObra: 300, permuta: 0, terceiros: 0 });
        expect(f.map(x => x.chave)).toEqual(['proprio', 'vendasNaObra']);
        expect(f[0].pct).toBe(25);
        expect(f[0].cor).toMatch(/^#/);
    });

    it('cada seção do relatório diz os seus gráficos (as que não têm, lista vazia)', () => {
        expect(Object.keys(GRAFICOS_DA_SECAO).sort()).toEqual([...ORDEM_DAS_SECOES].sort());
        expect(GRAFICOS_DA_SECAO.indicadores).toEqual(['curva_s']);
        expect(GRAFICOS_DA_SECAO.fluxo).toEqual(['fluxo_anual']);
        expect(GRAFICOS_DA_SECAO.sensibilidade).toEqual(['tornado', 'cenarios']);
        expect(GRAFICOS_DA_SECAO.cronograma).toEqual(['marcos', 'vendas']);
        expect(GRAFICOS_DA_SECAO.capital).toEqual(['capital']);
        expect(GRAFICOS_DA_SECAO.riscos).toEqual([]);
    });
});
