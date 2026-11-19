/**
 * Versões congeladas do estudo (item 10.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D5: versão
 * não se edita nem se apaga). Puro: os indicadores que a versão grava e a
 * comparação entre duas versões. Testes: __tests__/imovibVersoes.test.ts.
 */
import type { ImovibStudy, ImovibRisk, ImovibScenario, ImovibLandChecklistItem } from '../types';
import type { DadosDoRelatorio } from './imovibRelatorio';
import type { CalculoDaVersao } from './imovibCalculoDaVersao';
import type { ImovibComparable } from './imovibMercado';
import type { ImovibPartner } from './imovibSocios';
import { computeImovibMath } from './imovibMotor';
import { calcularIndicadores } from './imovibIndicadores';
import { memorialDePremissas } from './imovibMemorial';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { diaDeBrasilia } from './dataDeBrasilia';

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
    /** Caixa acumulado nunca negativo: não há payback. Versões antigas não têm o campo (ver `semExposicaoDa`). */
    semExposicao?: boolean;
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
        semExposicao: ind.semExposicao,
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
    /** Última edição (plano 2026-11-19); null = nunca editada. */
    updated_at?: string | null;
    updated_by?: string | null;
}

export interface LadoDaComparacao {
    snapshot: ImovibStudy;
    results: ResultadosDaVersao;
}

export interface DiferencaEntreVersoes {
    /** Premissas do memorial cujo valor mudou, de A para B. */
    premissas: { campo: string; grupo: string; premissa: string; unidade: string; antes: number | string | null; depois: number | string | null }[];
    /** Todos os indicadores, lado a lado. */
    indicadores: { chave: keyof ResultadosDaVersao; rotulo: string; unidade: string; a: number | null; b: number | null; textoA?: string; textoB?: string }[];
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

/**
 * O snapshot gravado por `imovibService.congelarVersao`: o estudo carregado, os cenários e,
 * desde 15/11/2026, as listas do relatório completo (versões anteriores não têm `relatorio`).
 */
export type SnapshotDaVersao = ImovibStudy & {
    cenarios?: ImovibScenario[];
    /** Fase 6 (plano 2026-11-15): o resultado do cálculo no congelamento. Versões anteriores não têm. */
    calculo?: CalculoDaVersao;
    relatorio?: {
        comparaveis?: ImovibComparable[];
        riscos?: ImovibRisk[];
        dueDiligence?: ImovibLandChecklistItem[];
        socios?: ImovibPartner[];
    };
};

/**
 * Os dados do relatório completo de uma versão (Fase 1 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md): o estudo sem as listas
 * penduradas no snapshot, as listas da versão e a data da versão como data do relatório.
 * Versão sem `relatorio` (anterior a 15/11) sai com as listas vazias: cada seção diz que não há dado.
 */
export function dadosDoRelatorioDaVersao(snapshot: SnapshotDaVersao, versao: Pick<ImovibStudyVersion, 'created_at'>): DadosDoRelatorio {
    const { cenarios, relatorio, calculo: _calculo, ...study } = snapshot;
    return {
        study: study as ImovibStudy,
        comparaveis: relatorio?.comparaveis ?? [],
        riscos: relatorio?.riscos ?? [],
        cenarios: cenarios ?? [],
        dueDiligence: relatorio?.dueDiligence ?? [],
        socios: relatorio?.socios ?? [],
        hoje: diaDeBrasilia(versao.created_at),
    };
}

/**
 * A versão que a oportunidade publica para o investidor (Fase 2 do plano 2026-11-15): o estudo do
 * snapshot, as listas do relatório, a versão e a organização (capa do relatório). Montada igual no
 * portal (fn_investor_portal_get_versao) e na prévia do gestor (imovibService.versaoPublicada).
 */
export interface VersaoPublicada {
    study: ImovibStudy;
    cenarios: ImovibScenario[];
    relatorio: NonNullable<SnapshotDaVersao['relatorio']>;
    versao: { id: string; label: string; created_at: string };
    organizacao: { name: string | null; logo_url: string | null };
    /** Fase 6: os números congelados para o investidor; null em versão anterior (o painel calcula). */
    calculo: CalculoDaVersao['investidor'] | null;
}

/** Colunas internas do estudo (parecer, critérios, notas de fonte): não vão ao investidor. A mesma
 *  lista que fn_investor_portal_get_versao tira no banco. */
export const CHAVES_INTERNAS_DO_ESTUDO = [
    'premise_notes', 'recommendation', 'recommendation_notes', 'recommended_by', 'recommended_at',
    'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure', 'recommendation_snapshot', 'recommended_by_user_id',
] as const;

/** Os campos de cada lista que o relatório e o painel usam — o resto (notas, fonte, responsável,
 *  quem conferiu) é interno. Os mesmos que fn_investor_portal_get_versao monta no banco. */
export const CAMPOS_PARA_O_INVESTIDOR = {
    cenarios: ['id', 'name', 'kind', 'choques', 'sort_order'],
    comparaveis: ['id', 'name', 'distance_km', 'launch_date', 'total_units', 'sold_units', 'price_sqm'],
    riscos: ['id', 'category', 'description', 'probability', 'impact', 'mitigation', 'status', 'sort_order'],
    dueDiligence: ['id', 'item_key', 'label', 'status', 'notes', 'sort_order'],
    socios: ['id', 'name', 'share_percent', 'capital_percent', 'sort_order'],
} as const;

const so = <T>(lista: T[] | undefined, campos: readonly string[]): T[] =>
    (lista ?? []).map(x => Object.fromEntries(campos.filter(c => c in (x as object)).map(c => [c, (x as Record<string, unknown>)[c]])) as T);

/**
 * O que o investidor vê de uma versão, igual no portal e na prévia do gestor (revisão da Fase 2):
 * o estudo sem as chaves internas e as listas só com os campos do relatório.
 */
export function versaoPublicadaDoSnapshot(
    snapshot: SnapshotDaVersao,
    versao: VersaoPublicada['versao'],
    organizacao: VersaoPublicada['organizacao'],
): VersaoPublicada {
    const { cenarios, relatorio, calculo, ...resto } = snapshot;
    const study = { ...resto } as Record<string, unknown>;
    for (const k of CHAVES_INTERNAS_DO_ESTUDO) delete study[k];
    const C = CAMPOS_PARA_O_INVESTIDOR;
    return {
        study: study as unknown as ImovibStudy,
        cenarios: so(cenarios, C.cenarios),
        relatorio: {
            comparaveis: so(relatorio?.comparaveis, C.comparaveis),
            riscos: so(relatorio?.riscos, C.riscos),
            dueDiligence: so(relatorio?.dueDiligence, C.dueDiligence),
            socios: so(relatorio?.socios, C.socios),
        },
        versao,
        organizacao,
        // Só a parte do investidor: a edição interna (com parecer) nunca entra aqui.
        calculo: calculo?.investidor ?? null,
    };
}

export const snapshotDaVersaoPublicada = (vp: VersaoPublicada): SnapshotDaVersao =>
    ({ ...vp.study, cenarios: vp.cenarios, relatorio: vp.relatorio });

/** Os números congelados de uma edição do relatório da versão (null = versão anterior à Fase 6). */
export function congeladoDaVersao(calculo: CalculoDaVersao | null | undefined, edicao: 'interna' | 'investidor') {
    if (!calculo) return null;
    const { capa, graficos } = calculo.investidor;
    return { capa, graficos, secoes: edicao === 'investidor' ? calculo.investidor.secoes : calculo.interno.secoes };
}

/** Versão antiga não guardava `semExposicao`: exposição máxima zero quer dizer o mesmo. */
export const semExposicaoDa = (r: ResultadosDaVersao): boolean => r.semExposicao ?? r.exposicaoMaxima <= 0;

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
    const indicadores = INDICADORES_DA_VERSAO.map(i => {
        if (i.chave === 'paybackMes') {
            // Sem exposição, o payback não existe: a regra antiga gravava "Mês 1", a de hoje
            // grava vazio — os dois são o mesmo estudo e não podem aparecer como mudança.
            const sa = semExposicaoDa(a.results);
            const sb = semExposicaoDa(b.results);
            return {
                ...i,
                a: sa ? null : a.results.paybackMes ?? null,
                b: sb ? null : b.results.paybackMes ?? null,
                ...(sa ? { textoA: 'Sem exposição' } : {}),
                ...(sb ? { textoB: 'Sem exposição' } : {}),
            };
        }
        return { ...i, a: (a.results[i.chave] as number | null | undefined) ?? null, b: (b.results[i.chave] as number | null | undefined) ?? null };
    });
    return { premissas, indicadores };
}

// ── Editar e excluir versões (plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md) ──

/** Edição de versão em aberto no estudo (`imovib_studies.edicao_versao`, sem a cópia de segurança). */
export interface EdicaoDaVersao {
    version_id: string;
    version_label: string;
    started_by: string;
    started_by_name: string | null;
    started_at: string;
}

export interface AcaoDaVersao {
    pode: boolean;
    motivo?: string;
}

/**
 * Versão publicada = só leitura; as demais: editar tudo, renomear e excluir. Uma edição por estudo: com
 * outra versão em edição, editar e excluir esperam (renomear não mexe no estudo).
 */
export function acoesDaVersao(args: {
    versaoId: string;
    publicadaEm: string | null;
    edicaoAberta: EdicaoDaVersao | null;
    pode: AcaoDaVersao;
}): { editar: AcaoDaVersao; excluir: AcaoDaVersao; renomear: AcaoDaVersao } {
    const tres = (a: AcaoDaVersao) => ({ editar: a, excluir: a, renomear: a });
    if (!args.pode.pode) return tres({ pode: false, motivo: args.pode.motivo });
    if (args.publicadaEm != null) return tres({ pode: false, motivo: `Publicada em «${args.publicadaEm}» — só leitura.` });
    const ed = args.edicaoAberta;
    if (ed && ed.version_id === args.versaoId) {
        return {
            editar: { pode: false, motivo: 'Esta versão já está em edição no estudo.' },
            excluir: { pode: false, motivo: 'Salve ou descarte a edição desta versão antes de excluir.' },
            renomear: { pode: true },
        };
    }
    if (ed) {
        return {
            editar: { pode: false, motivo: `Termine a edição da versão «${ed.version_label}» antes de editar outra.` },
            excluir: { pode: false, motivo: `Termine a edição da versão «${ed.version_label}» antes de excluir outra.` },
            renomear: { pode: true },
        };
    }
    return tres({ pode: true });
}

/**
 * Partes do estudo que a cópia da versão não guardou (versões de antes de 15/11). Ao editar, essas
 * partes ficam com o conteúdo de hoje do estudo — a confirmação diz quais.
 */
export function partesAusentesDaVersao(snapshot: Record<string, unknown>): string[] {
    const rel = (snapshot.relatorio ?? null) as Record<string, unknown> | null;
    const partes: [boolean, string][] = [
        [!('cenarios' in snapshot), 'cenários'],
        [!rel || !('comparaveis' in rel), 'comparáveis'],
        [!rel || !('riscos' in rel), 'riscos'],
        [!rel || !('dueDiligence' in rel), 'due diligence'],
        [!rel || !('socios' in rel), 'sócios'],
        [!('capex_items' in snapshot), 'CAPEX'],
        [!('funding_sources' in snapshot), 'outras fontes de capital'],
    ];
    return partes.filter(([falta]) => falta).map(([, nome]) => nome);
}
