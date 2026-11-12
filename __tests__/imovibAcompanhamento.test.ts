import { describe, it, expect } from 'vitest';
import { compararComRealizado } from '../utils/imovibAcompanhamento';
import type { MonthlyFlow } from '../utils/imovibMotor';

/**
 * Viabilidade × realizado (item 10.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
const fluxo = (n: number): MonthlyFlow[] => Array.from({ length: n }, (_, i) => ({
    month: i + 1, name: `Mês ${i + 1}`, rev: 100 * (i + 1), cost: 50, net: 0, acc: 0, netProjeto: 0, accProjeto: 0, jurosDoMes: 0, linhas: {} as never,
}));

describe('10.4 — compararComRealizado', () => {
    it('o mês 1 do estudo casa com o mês da data-base', () => {
        const r = compararComRealizado(fluxo(3), '2026-03', [{ mes: '2026-04', entradas: 90, saidas: 40 }], [], [0, 0, 0]);
        expect(r.map(m => m.mes)).toEqual(['2026-03', '2026-04', '2026-05']);
        expect(r[1]).toMatchObject({ receitaPrevista: 200, receitaRealizada: 90, custoPrevisto: 50, custoRealizado: 40 });
    });

    it('mês sem lançamento realizado sai com null, e não zero', () => {
        const r = compararComRealizado(fluxo(3), '2026-03', [{ mes: '2026-04', entradas: 90, saidas: 40 }], [], [0, 0, 0]);
        expect(r[0].receitaRealizada).toBeNull();
        expect(r[0].custoRealizado).toBeNull();
        expect(r[2].receitaRealizada).toBeNull();
    });

    it('aceita o mês do realizado como data completa', () => {
        const r = compararComRealizado(fluxo(1), '2026-03', [{ mes: '2026-03-01', entradas: 10, saidas: 5 }], [], [0]);
        expect(r[0].receitaRealizada).toBe(10);
    });

    it('vendas acumuladas: previstas pela curva e reais pelos meses de venda; venda antes da data-base entra no mês 1', () => {
        const r = compararComRealizado(fluxo(3), '2026-03', [],
            [{ mes: '2026-01', valor: 100 }, { mes: '2026-04', valor: 50 }], [10, 20, 30]);
        expect(r.map(m => m.vendasPrevistasAcum)).toEqual([10, 30, 60]);
        expect(r.map(m => m.vendasReaisAcum)).toEqual([100, 150, 150]);
    });

    it('meses depois de hoje não têm realizado (null), nem as vendas acumuladas', () => {
        const r = compararComRealizado(fluxo(3), '2026-03', [], [{ mes: '2026-03', valor: 10 }], [0, 0, 0], '2026-04');
        expect(r.map(m => m.vendasReaisAcum)).toEqual([10, 10, null]);
    });
});
