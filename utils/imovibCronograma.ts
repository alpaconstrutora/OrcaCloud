import type { ImovibStudy } from '../types';
import type { ImovibMathResult } from './imovibMotor';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Marcos e datas do estudo (item 5.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Puro.
 * Testes: __tests__/imovibCronograma.test.ts.
 *
 * Sem data-base o mês fica "Mês N" e a data, nula — nunca uma data inventada.
 * Datas são aritmética de texto 'AAAA-MM' (sem Date: o fuso já trocou o dia de
 * datas do cronograma da obra).
 */

export type MarcoId = 'aquisicao' | 'aprovacao' | 'registro_incorporacao' | 'lancamento'
    | 'inicio_obra' | 'habite_se' | 'repasse' | 'fim_das_vendas' | 'encerramento';

export interface MarcoDoEstudo {
    id: MarcoId;
    rotulo: string;
    mes: number | null;
    /** 'AAAA-MM' quando há data-base e mês. */
    data: string | null;
}

export const ROTULO_DO_MARCO: Record<MarcoId, string> = {
    aquisicao: 'Aquisição do terreno',
    aprovacao: 'Aprovação do projeto',
    registro_incorporacao: 'Registro da incorporação',
    lancamento: 'Lançamento',
    inicio_obra: 'Início da obra',
    habite_se: 'Habite-se (fim da obra)',
    repasse: 'Repasse',
    fim_das_vendas: 'Fim das vendas',
    encerramento: 'Encerramento',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Ano e mês (1–12) do mês `mes` do estudo, ou null sem data-base válida. */
function anoMes(baseDate: string | null | undefined, mes: number): { ano: number; mes: number } | null {
    const m = /^(\d{4})-(\d{2})/.exec(baseDate ?? '');
    if (!m) return null;
    const inicio = Number(m[1]) * 12 + (Number(m[2]) - 1);
    if (Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    const alvo = inicio + Math.round(mes) - 1;
    return { ano: Math.floor(alvo / 12), mes: (alvo % 12) + 1 };
}

/** "mar/27" com data-base; "Mês 3" sem ela. */
export function nomeDoMes(baseDate: string | null | undefined, mes: number): string {
    const a = anoMes(baseDate, mes);
    return a ? `${MESES[a.mes - 1]}/${String(a.ano % 100).padStart(2, '0')}` : `Mês ${mes}`;
}

/** 'AAAA-MM' do mês `mes` do estudo, ou null sem data-base. */
export function dataDoMes(baseDate: string | null | undefined, mes: number): string | null {
    const a = anoMes(baseDate, mes);
    return a ? `${a.ano}-${String(a.mes).padStart(2, '0')}` : null;
}

/** Mês do estudo em que cai a data 'AAAA-MM…' (1 = mês da data-base); null sem as duas. */
export function mesDaData(baseDate: string | null | undefined, data: string | null | undefined): number | null {
    const b = /^(\d{4})-(\d{2})/.exec(baseDate ?? '');
    const d = /^(\d{4})-(\d{2})/.exec(data ?? '');
    if (!b || !d) return null;
    return (Number(d[1]) * 12 + Number(d[2])) - (Number(b[1]) * 12 + Number(b[2])) + 1;
}

export function marcosDoEstudo(study: ImovibStudy, r: ImovibMathResult): MarcoDoEstudo[] {
    const D = IMOVIB_DEFAULTS;
    const v = (x: number | null | undefined, padrao: number) => (x == null || Number.isNaN(x) ? padrao : x);
    const inicioObra = v(study.construction_start_month, D.construction_start_month);
    const fimObra = inicioObra + v(study.construction_duration_months, D.construction_duration_months) - 1;
    const inicioVendas = v(study.sales_start_month, D.sales_start_month);
    const meses: Record<MarcoId, number | null> = {
        aquisicao: v(study.acquisition_month, D.acquisition_month),
        aprovacao: study.approval_month ?? null,
        registro_incorporacao: study.incorporation_registry_month ?? null,
        lancamento: inicioVendas,
        inicio_obra: inicioObra,
        habite_se: fimObra,
        repasse: fimObra + v(study.handover_delay_months, D.handover_delay_months),
        fim_das_vendas: inicioVendas + v(study.sales_duration_months, D.sales_duration_months) - 1,
        encerramento: r.duration || null,
    };
    return (Object.keys(ROTULO_DO_MARCO) as MarcoId[]).map(id => ({
        id,
        rotulo: ROTULO_DO_MARCO[id],
        mes: meses[id],
        data: meses[id] == null ? null : dataDoMes(study.base_date, meses[id]!),
    }));
}
