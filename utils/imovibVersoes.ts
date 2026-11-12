/**
 * Versões congeladas do estudo (item 10.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D5: versão
 * não se edita nem se apaga). Puro: os indicadores que a versão grava e a
 * comparação entre duas versões. Testes: __tests__/imovibVersoes.test.ts.
 */
import type { ImovibStudy } from '../types';
import { computeImovibMath } from './imovibMotor';
import { calcularIndicadores } from './imovibIndicadores';
import { memorialDePremissas } from './imovibMemorial';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/** Indicadores do momento do congelamento. Número que não existe (TIR sem troca de sinal) é null: o JSON não guarda NaN. */
export interface ResultadosDaVersao {
    vgv: number;
    vgvLiquido: number;
    custoObra: number;
    terreno: number;
    vpl: number;
    tirAnual: number | null;
    vplProjeto: number;
    tirProjetoAnual: number | null;
    exposicaoMaxima: number;
    duracao: number;
    lucroLiquido: number;
    margemLiquidaPct: number | null;
    paybackMes: number | null;
    multiplo: number | null;
}

export const INDICADORES_DA_VERSAO: { chave: keyof ResultadosDaVersao; rotulo: string; unidade: string }[] = [
    { chave: 'vgv', rotulo: 'VGV', unidade: 'R$' },
    { chave: 'vgvLiquido', rotulo: 'VGV líquido', unidade: 'R$' },
    { chave: 'custoObra', rotulo: 'Custo de obra', unidade: 'R$' },
    { chave: 'terreno', rotulo: 'Terreno', unidade: 'R$' },
    { chave: 'vpl', rotulo: 'VPL', unidade: 'R$' },
    { chave: 'tirAnual', rotulo: 'TIR', unidade: '% a.a.' },
    { chave: 'vplProjeto', rotulo: 'VPL do projeto', unidade: 'R$' },
    { chave: 'tirProjetoAnual', rotulo: 'TIR do projeto', unidade: '% a.a.' },
    { chave: 'exposicaoMaxima', rotulo: 'Exposição máxima', unidade: 'R$' },
    { chave: 'lucroLiquido', rotulo: 'Lucro líquido', unidade: 'R$' },
    { chave: 'margemLiquidaPct', rotulo: 'Margem líquida sobre o VGV', unidade: '%' },
    { chave: 'paybackMes', rotulo: 'Payback simples', unidade: 'mês' },
    { chave: 'multiplo', rotulo: 'Múltiplo do capital', unidade: 'x' },
    { chave: 'duracao', rotulo: 'Duração', unidade: 'meses' },
];

const finito = (x: number | null | undefined): number | null => (x == null || !Number.isFinite(x) ? null : x);

export function resultadosDoEstudo(study: ImovibStudy): ResultadosDaVersao {
    const r = computeImovibMath(study);
    const ind = calcularIndicadores(r, study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate);
    return {
        vgv: r.vgvTotal,
        vgvLiquido: r.netVgvTotal,
        custoObra: r.constCostTotal,
        terreno: r.landCost,
        vpl: r.vpl,
        tirAnual: finito(r.annualIrr),
        vplProjeto: r.vplProjeto,
        tirProjetoAnual: finito(r.annualIrrProjeto),
        exposicaoMaxima: r.maxExposure,
        duracao: r.duration,
        lucroLiquido: ind.lucroLiquido,
        margemLiquidaPct: ind.margemLiquidaSobreVgv == null ? null : ind.margemLiquidaSobreVgv * 100,
        paybackMes: ind.paybackSimplesMes,
        multiplo: finito(ind.multiploDoCapital),
    };
}

/** Linha de imovib_study_versions sem o snapshot (pesado: lido só para comparar). */
export interface ImovibStudyVersion {
    id: string;
    study_id: string;
    label: string;
    notes: string | null;
    results: ResultadosDaVersao;
    created_at: string;
    created_by: string | null;
}

export interface LadoDaComparacao {
    snapshot: ImovibStudy;
    results: ResultadosDaVersao;
}

export interface DiferencaEntreVersoes {
    /** Premissas do memorial cujo valor mudou, de A para B. */
    premissas: { campo: string; grupo: string; premissa: string; unidade: string; antes: number | string | null; depois: number | string | null }[];
    /** Todos os indicadores, lado a lado. */
    indicadores: { chave: keyof ResultadosDaVersao; rotulo: string; unidade: string; a: number | null; b: number | null }[];
}

export function diferencaEntreVersoes(a: LadoDaComparacao, b: LadoDaComparacao): DiferencaEntreVersoes {
    const ma = memorialDePremissas(a.snapshot);
    const mb = new Map(memorialDePremissas(b.snapshot).map(l => [String(l.campo), l]));
    const premissas = ma.flatMap(l => {
        const outra = mb.get(String(l.campo));
        if (!outra || outra.valor === l.valor) return [];
        return [{ campo: String(l.campo), grupo: l.grupo, premissa: l.premissa, unidade: l.unidade, antes: l.valor, depois: outra.valor }];
    });
    const indicadores = INDICADORES_DA_VERSAO.map(i => ({ ...i, a: a.results[i.chave] ?? null, b: b.results[i.chave] ?? null }));
    return { premissas, indicadores };
}
