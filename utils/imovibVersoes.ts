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
        // Positiva, como no parecer e no relatório (o motor guarda o caixa mínimo, negativo).
        exposicaoMaxima: Math.max(0, -r.maxExposure),
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

/** O que mexe no número e não é premissa do memorial: torres, rubricas, espelho, fontes. */
const semDatas = (x: unknown): unknown => JSON.parse(JSON.stringify(x ?? null, (k, v) => (k === 'created_at' || k === 'updated_at' ? undefined : v)));
const ordenado = <T extends { id?: string }>(xs: T[] | null | undefined) => [...(xs ?? [])].sort((p, q) => String(p.id).localeCompare(String(q.id)));
const ESTRUTURA: { id: string; rotulo: string; chave: (s: ImovibStudy) => string; resumo: (s: ImovibStudy) => string }[] = [
    { id: 'blocks', rotulo: 'Torres, tipologias e preços', chave: s => JSON.stringify(semDatas(ordenado(s.blocks))), resumo: s => `${(s.blocks ?? []).length} torre(s)` },
    { id: 'capex_items', rotulo: 'Rubricas do orçamento', chave: s => JSON.stringify(semDatas(ordenado(s.capex_items))), resumo: s => `${(s.capex_items ?? []).length} rubrica(s)` },
    { id: 'unit_instances', rotulo: 'Espelho de vendas', chave: s => JSON.stringify(semDatas(ordenado(s.unit_instances))), resumo: s => `${(s.unit_instances ?? []).length} unidade(s)` },
    { id: 'funding_sources', rotulo: 'Outras fontes de capital', chave: s => JSON.stringify(semDatas(ordenado(s.funding_sources))), resumo: s => `${(s.funding_sources ?? []).length} fonte(s)` },
];

export function diferencaEntreVersoes(a: LadoDaComparacao, b: LadoDaComparacao): DiferencaEntreVersoes {
    const ma = memorialDePremissas(a.snapshot);
    const mb = new Map(memorialDePremissas(b.snapshot).map(l => [String(l.campo), l]));
    const bruto = (s: ImovibStudy, campo: string) => JSON.stringify((s as unknown as Record<string, unknown>)[campo] ?? null);
    const premissas = ma.flatMap(l => {
        const outra = mb.get(String(l.campo));
        if (!outra) return [];
        const campo = String(l.campo);
        // Lista (curva personalizada, parcelas): o texto pode ficar igual com o conteúdo diferente.
        const mudouOConteudo = bruto(a.snapshot, campo) !== bruto(b.snapshot, campo);
        if (outra.valor === l.valor && !mudouOConteudo) return [];
        const depois = outra.valor === l.valor ? `${outra.valor ?? '—'} (conteúdo alterado)` : outra.valor;
        return [{ campo, grupo: l.grupo, premissa: l.premissa, unidade: l.unidade, antes: l.valor, depois }];
    });
    for (const e of ESTRUTURA) {
        const xa = e.chave(a.snapshot);
        const xb = e.chave(b.snapshot);
        if (xa !== xb) premissas.push({ campo: e.id, grupo: 'Estrutura', premissa: e.rotulo, unidade: '', antes: e.resumo(a.snapshot), depois: `${e.resumo(b.snapshot)} (alterado)` });
    }
    const indicadores = INDICADORES_DA_VERSAO.map(i => ({ ...i, a: a.results[i.chave] ?? null, b: b.results[i.chave] ?? null }));
    return { premissas, indicadores };
}
