/**
 * Simulador — as comparações do PRD item 5.
 *
 * O que estes testes protegem: que a comparação diga a verdade sobre QUAL é
 * mais cara. Um simulador que erra a ordem é pior que nenhum, porque a decisão
 * de contratação é tomada em cima dele.
 */

import { describe, expect, it } from 'vitest';
import {
    compararRefinanciamento,
    liquidoLiberado,
    serieConstante,
    simulate,
    simulateVariants,
    varCarencias,
    varCenariosIndexador,
    varEntradas,
    varPrazos,
    varSistemas,
} from '../utils/debtSimulator';
import type { DebtScheduleParams } from '../utils/debtAmortization';

const base: DebtScheduleParams = {
    principal: 100_000,
    nominalRate: 1,
    ratePeriod: 'MENSAL',
    system: 'PRICE',
    installmentCount: 60,
    installmentPeriod: 'MENSAL',
    firstDueDate: '2026-10-10',
};

describe('liquidoLiberado', () => {
    it('desconta tudo que o banco retém', () => {
        expect(liquidoLiberado(100_000, { iof: 1500, tarifas: 800, seguro: 700 })).toBe(97_000);
    });

    it('sem custos, o líquido é o principal', () => {
        expect(liquidoLiberado(100_000)).toBe(100_000);
    });

    it('nunca devolve negativo', () => {
        expect(liquidoLiberado(1000, { tarifas: 5000 })).toBe(0);
    });
});

describe('simulate · métricas básicas', () => {
    const r = simulate('base', base);

    it('conta as parcelas e acha a primeira', () => {
        expect(r.nParcelas).toBe(60);
        expect(r.primeiraParcela).toBeCloseTo(2224.44, 2);
    });

    it('Price é constante EXCETO a última, que absorve o resíduo', () => {
        // Não é defeito: com 60 arredondamentos a 2 casas, sobra centavo, e a
        // última parcela é onde ele cai para o saldo fechar em 0 — é o que o
        // banco faz na tabela real. Verificado no navegador em 30/08 (SAC 120×:
        // R$ 1.052,81 na última contra R$ 1.052,63 nas demais).
        const semUltima = r.rows.slice(0, -1).map(x => x.total);
        expect(Math.max(...semUltima)).toBeCloseTo(Math.min(...semUltima), 2);

        const ultima = r.rows[r.rows.length - 1].total;
        expect(Math.abs(ultima - semUltima[0])).toBeLessThan(1);
        expect(r.rows[r.rows.length - 1].closingBalance).toBe(0);
    });

    it('amortiza exatamente o principal', () => {
        expect(r.totalAmortizacao).toBeCloseTo(100_000, 2);
    });

    it('custo total sem encargos = total de juros', () => {
        expect(r.custoTotal).toBeCloseTo(r.totalJuros, 2);
    });

    it('CET ≈ taxa contratada quando não há custo de liberação', () => {
        expect(r.cetAnual).not.toBeNull();
        expect(r.cetAnual!).toBeGreaterThan(12);
        expect(r.cetAnual!).toBeLessThan(13.5);
    });

    it('datas de início e fim', () => {
        expect(r.primeiroVencimento).toBe('2026-10-10');
        expect(r.ultimoVencimento).toBe('2031-09-10');
    });
});

describe('custos na liberação encarecem o CET e o custo total', () => {
    const limpo = simulate('limpo', base);
    const comCustos = simulate('com custos', base, { custos: { iof: 2000, tarifas: 1000 } });

    it('o cronograma é o MESMO — o que muda é o que entrou', () => {
        expect(comCustos.totalPago).toBeCloseTo(limpo.totalPago, 2);
    });

    it('mas o CET sobe', () => {
        expect(comCustos.cetAnual!).toBeGreaterThan(limpo.cetAnual!);
    });

    it('e o custo total sobe exatamente pelos R$ 3.000 retidos', () => {
        expect(comCustos.custoTotal - limpo.custoTotal).toBeCloseTo(3000, 2);
    });
});

describe('SAC × Price — o confronto do PRD', () => {
    const [sac, price] = simulateVariants(base, varSistemas());

    it('SAC paga MENOS juros no total', () => {
        expect(sac.totalJuros).toBeLessThan(price.totalJuros);
    });

    it('mas SAC começa com parcela MAIOR', () => {
        expect(sac.primeiraParcela).toBeGreaterThan(price.primeiraParcela);
    });

    it('SAC decresce de verdade; Price varia só o centavo da última', () => {
        // SAC: a diferença entre a primeira e a última é da ordem dos juros do
        // principal inteiro — centenas de reais, não centavos.
        expect(sac.maiorParcela - sac.menorParcela).toBeGreaterThan(500);
        expect(price.maiorParcela - price.menorParcela).toBeLessThan(1);
    });

    it('os dois amortizam o mesmo principal', () => {
        expect(sac.totalAmortizacao).toBeCloseTo(price.totalAmortizacao, 2);
    });

    it('SAC aperta mais o caixa no primeiro ano', () => {
        expect(sac.impactoMensal12m).toBeGreaterThan(price.impactoMensal12m);
    });
});

describe('prazo — alongar barateia a parcela e encarece o total', () => {
    const [curto, medio, longo] = simulateVariants(base, varPrazos([24, 60, 120]));

    it('parcela cai conforme o prazo cresce', () => {
        expect(curto.primeiraParcela).toBeGreaterThan(medio.primeiraParcela);
        expect(medio.primeiraParcela).toBeGreaterThan(longo.primeiraParcela);
    });

    it('juros totais sobem conforme o prazo cresce', () => {
        expect(curto.totalJuros).toBeLessThan(medio.totalJuros);
        expect(medio.totalJuros).toBeLessThan(longo.totalJuros);
    });

    it('todos amortizam o mesmo principal', () => {
        for (const r of [curto, medio, longo]) expect(r.totalAmortizacao).toBeCloseTo(100_000, 2);
    });
});

describe('carência — alivia agora, custa depois', () => {
    const [sem, com6, com12] = simulateVariants(base, varCarencias([0, 6, 12]));

    it('quanto maior a carência, mais juros no total', () => {
        expect(sem.totalJuros).toBeLessThan(com6.totalJuros);
        expect(com6.totalJuros).toBeLessThan(com12.totalJuros);
    });

    it('a primeira parcela fica menor (só juros)', () => {
        expect(com6.primeiraParcela).toBeLessThan(sem.primeiraParcela);
        expect(com6.primeiraParcela).toBeCloseTo(1000, 2);
    });

    it('o caixa do primeiro ano respira', () => {
        expect(com12.impactoMensal12m).toBeLessThan(sem.impactoMensal12m);
    });
});

describe('entrada — reduz o que se financia', () => {
    const [sem, com20] = simulateVariants(base, varEntradas(100_000, [0, 20]));

    it('financia 80% e amortiza 80%', () => {
        expect(com20.totalAmortizacao).toBeCloseTo(80_000, 2);
        expect(sem.totalAmortizacao).toBeCloseTo(100_000, 2);
    });

    it('juros caem na proporção', () => {
        expect(com20.totalJuros).toBeCloseTo(sem.totalJuros * 0.8, 0);
    });
});

describe('cenários de indexador', () => {
    const variantes = varCenariosIndexador('2026-10-10', 60, [0.5, 0.9, 1.2], 'CDI');
    const [brando, medio, duro] = simulateVariants(base, variantes);

    it('rotula com o índice e a taxa', () => {
        expect(variantes[0].label).toContain('CDI');
        expect(variantes[0].label).toContain('0,5');
    });

    it('índice maior = custo maior, monotônico', () => {
        expect(brando.totalPago).toBeLessThan(medio.totalPago);
        expect(medio.totalPago).toBeLessThan(duro.totalPago);
    });

    it('mesmo indexado, o principal fecha', () => {
        for (const r of [brando, medio, duro]) expect(r.rows[r.rows.length - 1].closingBalance).toBe(0);
    });

    it('serieConstante cobre o intervalo pedido', () => {
        const s = serieConstante('2026-10-10', 12, 1);
        expect(Object.keys(s)).toHaveLength(13);
        expect(s['2026-10']).toBeCloseTo(1.01, 10);
        expect(s['2027-10']).toBeCloseTo(1.01, 10);
    });
});

describe('refinanciamento', () => {
    const nova: DebtScheduleParams = { ...base, nominalRate: 0.7, installmentCount: 48 };

    it('taxa bem menor compensa, e a economia é positiva', () => {
        const r = compararRefinanciamento({
            saldoDevedor: 80_000,
            restanteAPagar: 105_000,
            nova,
        });
        expect(r.economia).toBeGreaterThan(0);
        expect(r.nova.totalPago).toBeLessThan(r.atual.total);
    });

    it('o custo de saída entra na conta e pode inverter a decisão', () => {
        const sem = compararRefinanciamento({ saldoDevedor: 80_000, restanteAPagar: 105_000, nova });
        const com = compararRefinanciamento({
            saldoDevedor: 80_000, restanteAPagar: 105_000, custoDeSaida: 30_000, nova,
        });
        expect(com.economia).toBeCloseTo(sem.economia + 30_000, 2);
        expect(com.atual.custoDeSaida).toBe(30_000);
    });

    it('refinanciar por taxa igual não economiza nada relevante', () => {
        const r = compararRefinanciamento({
            saldoDevedor: 80_000,
            restanteAPagar: 100_000,
            nova: { ...base, nominalRate: 1, installmentCount: 60 },
        });
        // Mesma taxa e prazo maior: a troca PIORA.
        expect(r.economia).toBeLessThan(0);
    });
});

describe('guardas', () => {
    it('principal zero devolve tudo zerado, sem NaN', () => {
        const r = simulate('vazio', { ...base, principal: 0 });
        expect(r.nParcelas).toBe(0);
        expect(r.totalPago).toBe(0);
        expect(r.cetAnual).toBeNull();
    });

    it('CET null quando não há líquido liberado — nunca 0%', () => {
        const r = simulate('tudo retido', base, { custos: { retido: 100_000 } });
        expect(r.cetAnual).toBeNull();
    });
});
