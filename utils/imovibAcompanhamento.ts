/**
 * Viabilidade × realizado (item 10.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Puro: alinha o
 * fluxo previsto do estudo (mês 1 = mês da data-base) com o realizado financeiro
 * das obras e as vendas reais do empreendimento. Testes: __tests__/imovibAcompanhamento.test.ts.
 *
 * Mês sem lançamento realizado é null, nunca zero ("não houve" e "não sei" não se
 * confundem). Venda feita antes da data-base entra no acumulado do mês 1.
 */
import type { MonthlyFlow } from './imovibMotor';
import { dataDoMes } from './imovibCronograma';

export interface MesDoAcompanhamento {
    /** 'AAAA-MM'. */
    mes: string;
    receitaPrevista: number;
    receitaRealizada: number | null;
    custoPrevisto: number;
    custoRealizado: number | null;
    vendasPrevistasAcum: number;
    vendasReaisAcum: number | null;
    /** O mês de hoje: o realizado ainda está pela metade, o desvio não diz nada. */
    emCurso: boolean;
}

const anoMes = (s: string) => s.slice(0, 7);

export function compararComRealizado(
    fluxo: MonthlyFlow[],
    baseDate: string,
    realizado: { mes: string; entradas: number; saidas: number }[],
    vendas: { mes: string; valor: number }[],
    vendasPrevistasPorMes: number[],
    /** 'AAAA-MM' de hoje: depois dele não há realizado. Omitido = sem corte. */
    hoje?: string,
): MesDoAcompanhamento[] {
    const porMes = new Map<string, { entradas: number; saidas: number }>();
    for (const r of realizado) {
        const k = anoMes(r.mes);
        const m = porMes.get(k) ?? { entradas: 0, saidas: 0 };
        m.entradas += Number(r.entradas) || 0;
        m.saidas += Number(r.saidas) || 0;
        porMes.set(k, m);
    }
    const vendasOrdenadas = [...vendas].sort((a, b) => anoMes(a.mes).localeCompare(anoMes(b.mes)));
    let previstas = 0;
    let reais = 0;
    let proximaVenda = 0;
    return fluxo.map((f, i) => {
        const mes = dataDoMes(baseDate, f.month) ?? '';
        previstas += vendasPrevistasPorMes[i] ?? 0;
        while (proximaVenda < vendasOrdenadas.length && anoMes(vendasOrdenadas[proximaVenda].mes) <= mes) {
            reais += Number(vendasOrdenadas[proximaVenda].valor) || 0;
            proximaVenda++;
        }
        const futuro = hoje != null && mes > hoje;
        const r = futuro ? undefined : porMes.get(mes);
        return {
            mes,
            receitaPrevista: f.rev,
            receitaRealizada: r ? r.entradas : null,
            custoPrevisto: f.cost,
            custoRealizado: r ? r.saidas : null,
            vendasPrevistasAcum: previstas,
            vendasReaisAcum: futuro ? null : reais,
            emCurso: hoje != null && mes === hoje,
        };
    });
}
