/**
 * Cálculo congelado na versão (Fase 6 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md — pedido do usuário, 15/11:
 * os números de uma versão publicada nunca mudam).
 *
 * A versão já guardava o estudo (snapshot); agora guarda também o RESULTADO: indicadores do
 * painel, dados dos gráficos, capa e seções do relatório. O painel e o PDF leem daqui, sem chamar o
 * motor — uma correção futura do motor não muda o que o investidor recebeu. A simulação do painel
 * ("e se…") continua calculando na hora, de propósito.
 *
 * - `investidor`: vai ao Portal do Investidor (sem parecer, critérios nem notas de fonte).
 * - `interno`: as seções da edição interna (com parecer); fica no banco, nunca vai ao portal.
 *
 * Testes: __tests__/imovibCalculoDaVersao.test.ts.
 */
import type { ImovibStudy, ImovibScenario } from '../types';
import { computeImovibMath } from './imovibMotor';
import { calcularIndicadores, textoDoPayback } from './imovibIndicadores';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { tornado, CHOQUES_PADRAO, type BarraDoTornado } from './imovibSensibilidade';
import type { VariavelDoEstudo } from './imovibVariacoes';
import { marcosDoEstudo, type MarcoDoEstudo } from './imovibCronograma';
import {
    fluxoAnual, dadosDosCenarios, dadosDasVendas, fatiasDoCapital,
    type AnoDoFluxo, type LinhaDoCenario, type MesDeVendas, type FatiaDoCapital,
} from './imovibGraficos';
import { secoesDoRelatorio, capaDoRelatorio, type DadosDoRelatorio, type SecaoDoRelatorio, type CapaDoRelatorio } from './imovibRelatorio';

/** Muda quando o formato do cálculo congelado mudar (a tela sabe ler as versões antigas). */
export const VERSAO_DO_CALCULO = 1;

export interface IndicadoresDoPainel {
    tma: number;
    vpl: number;
    /** % a.a.; null = sem TIR. */
    tirAnual: number | null;
    /** % sobre o VGV; null = sem VGV. */
    margemLiquidaPct: number | null;
    exposicaoMaxima: number;
    mesDaExposicaoMaxima: number | null;
    semExposicao: boolean;
    vgv: number;
    lucroLiquido: number;
    /** Já em texto ("Mês 29", "Sem exposição"...). */
    payback: string;
    multiplo: number | null;
}

export interface DadosDosGraficos {
    curvaS: { name: string; net: number; acc: number }[];
    fluxoAnual: AnoDoFluxo[];
    tornado: BarraDoTornado[];
    choques: Record<VariavelDoEstudo, number>;
    cenarios: LinhaDoCenario[];
    marcos: MarcoDoEstudo[];
    vendas: MesDeVendas[];
    capital: FatiaDoCapital[];
}

export interface CalculoDaVersao {
    versaoDoCalculo: number;
    investidor: { capa: CapaDoRelatorio; secoes: SecaoDoRelatorio[]; indicadores: IndicadoresDoPainel; graficos: DadosDosGraficos };
    interno: { secoes: SecaoDoRelatorio[] };
}

const finito = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);
/** Como volta do jsonb do banco: NaN vira null, undefined some. */
const comoNoBanco = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function indicadoresDoEstudo(study: ImovibStudy): IndicadoresDoPainel {
    const r = computeImovibMath(study);
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const ind = calcularIndicadores(r, tma);
    return {
        tma,
        vpl: r.vpl,
        tirAnual: finito(r.annualIrr),
        margemLiquidaPct: ind.margemLiquidaSobreVgv == null ? null : ind.margemLiquidaSobreVgv * 100,
        exposicaoMaxima: Math.max(0, -r.maxExposure),
        mesDaExposicaoMaxima: ind.mesDaExposicaoMaxima,
        semExposicao: ind.semExposicao,
        vgv: r.vgvTotal,
        lucroLiquido: ind.lucroLiquido,
        payback: textoDoPayback(ind),
        multiplo: finito(ind.multiploDoCapital),
    };
}

export function graficosDoEstudo(study: ImovibStudy, cenarios: ImovibScenario[]): DadosDosGraficos {
    const r = computeImovibMath(study);
    return {
        curvaS: r.monthlyFlows.map(f => ({ name: f.name, net: f.net, acc: f.acc })),
        fluxoAnual: fluxoAnual(r.monthlyFlows),
        tornado: tornado(study, 'vpl', CHOQUES_PADRAO),
        choques: { ...CHOQUES_PADRAO },
        cenarios: dadosDosCenarios(study, cenarios, r),
        marcos: marcosDoEstudo(study, r),
        vendas: dadosDasVendas(r, Number(study.sales_start_month ?? IMOVIB_DEFAULTS.sales_start_month)),
        capital: fatiasDoCapital(r.capital),
    };
}

/** Tudo o que a versão mostra, calculado uma vez no congelamento. */
export function calculoDaVersao(d: DadosDoRelatorio, versao: { label: string; created_at: string }): CalculoDaVersao {
    return comoNoBanco({
        versaoDoCalculo: VERSAO_DO_CALCULO,
        investidor: {
            capa: capaDoRelatorio(d, { edicao: 'investidor', versao }),
            secoes: secoesDoRelatorio(d, { edicao: 'investidor', versao }),
            indicadores: indicadoresDoEstudo(d.study),
            graficos: graficosDoEstudo(d.study, d.cenarios),
        },
        interno: { secoes: secoesDoRelatorio(d, { versao }) },
    });
}
