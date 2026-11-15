// Indicadores de prazo de um planejamento — a MESMA conta da Central de Comando
// (components/schedule/CommandCenterPanel.tsx) e da lista Engenharia › Planejamento.
//
// Por que um utilitário só: a lista mostrava "Progresso Médio 5.4%", que era o default
// fixo `obraProgress` de constants.ts (nunca recalculado), e "Atividades Críticas"
// contava itens de cronograma órfãos (de itens que já saíram do orçamento). O número
// que o engenheiro vê na lista tem de ser o que ele vê ao abrir o planejamento.
// Crítica de design 2026-11-14 — docs/planos/2026-11-14-planejamento-lista-critica.md.
import type { ProjectSchedule } from '../types';

/** Folha do cronograma = item do orçamento, com o valor orçado que pesa o avanço. */
export interface FolhaDoCronograma {
    id: string;
    orcado: number;
}

export interface IndicadoresDePrazo {
    /** Avanço físico real, 0–100, ponderado pelo valor orçado de cada item. */
    avancoFisicoPct: number;
    /** Avanço que deveria haver até hoje pelas datas (PV ÷ total orçado), 0–100. */
    previstoPct: number;
    /** Valor agregado (EV) e planejado até hoje (PV), na moeda do orçamento. */
    ev: number;
    pv: number;
    /** EV/PV; `null` quando nada estava previsto até hoje (sem datas ou tudo no futuro). */
    spi: number | null;
    /** Itens cujo último dia trabalhado já passou com avanço abaixo de 100%. */
    atrasadas: number;
    /** Atraso em dias corridos pelo cronograma ganho: o avanço real de hoje é o que estava previsto
     *  para `avancoEquivaleA`; atraso = hoje − essa data. 0 = em dia; `null` quando nada estava
     *  previsto até hoje (sem datas ou tudo no futuro). */
    atrasoDias: number | null;
    avancoEquivaleA: string;
    /** Dias desde o término previsto, se ele já passou sem chegar a 100%; senão `null`. */
    terminoVencidoDias: number | null;
    /** Itens no caminho crítico (motor do cronograma) e, deles, os ainda não concluídos. */
    criticas: number;
    criticasAbertas: number;
    /** Início e término previstos do cronograma (ISO `AAAA-MM-DD`), '' se não há datas. O término é
     *  o ÚLTIMO DIA TRABALHADO (o "Término" do MS Project e o do cabeçalho do planejamento), não o
     *  `endDate` cru do motor — ver `ultimoDiaTrabalhado`. */
    inicioPrevisto: string;
    fimPrevisto: string;
    /** Término da linha de base ativa e desvio em dias (positivo = atrasou). */
    fimBaseline: string;
    desvioDias: number | null;
    /** Algum item do orçamento tem início e término no cronograma. */
    temDatas: boolean;
    totalFolhas: number;
}

/** Hoje no fuso de quem usa (não UTC: depois das 21h em Brasília o UTC já é amanhã). */
export const hojeLocalISO = (agora: Date = new Date()): string => {
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const d = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${m}-${d}`;
};

export const diasEntre = (a: string, b: string): number =>
    Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);

const fracaoDecorrida = (inicio: string, fim: string, hoje: string): number => {
    if (hoje <= inicio) return 0;
    if (hoje >= fim) return 1;
    return diasEntre(inicio, hoje) / Math.max(1, diasEntre(inicio, fim));
};

/** Datas vêm como 'AAAA-MM-DD' ou ISO completo; a comparação é por dia. */
const soDia = (v?: string): string => (v ? v.slice(0, 10) : '');

const somarDias = (iso: string, n: number): string =>
    new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const ehDiaUtil = (iso: string): boolean => {
    const d = new Date(iso + 'T00:00:00Z').getUTCDay();
    return d !== 0 && d !== 6;
};

/**
 * Último dia trabalhado de uma tarefa — o "Término" que o planejador conhece (MS Project, cabeçalho
 * do planejamento). O motor grava `endDate = início + duração` em dias úteis, que é o dia útil
 * SEGUINTE ao último trabalhado: Divino, tarefa de 18/11 com 10 dias úteis → endDate 02/12,
 * trabalhada até 01/12 (= Término declarado). A lista mostrava 02/12 e o cabeçalho 01/12 (2ª crítica,
 * 15/11/2026). Marco (fim = início) é o próprio dia. Seg–sex; feriados do calendário do cronograma
 * não entram (raro: só erra se o dia útil anterior ao fim for feriado).
 */
export function ultimoDiaTrabalhado(inicio: string, fimDoMotor: string): string {
    if (!fimDoMotor) return '';
    if (!inicio || fimDoMotor <= inicio) return fimDoMotor;
    let d = somarDias(fimDoMotor, -1);
    while (d > inicio && !ehDiaUtil(d)) d = somarDias(d, -1);
    return d;
}

export function indicadoresDePrazo(
    folhas: FolhaDoCronograma[],
    schedule: Pick<ProjectSchedule, 'itemSchedules' | 'startDate' | 'endDate' | 'baselines' | 'activeBaselineId'> | null | undefined,
    hoje: string = hojeLocalISO(),
): IndicadoresDePrazo {
    const itens = schedule?.itemSchedules ?? [];
    const porId = new Map(itens.map(s => [s.id, s]));

    let somaPonderada = 0;
    let pesoTotal = 0;
    let ev = 0;
    let pv = 0;
    let atrasadas = 0;
    let criticas = 0;
    let criticasAbertas = 0;
    let temDatas = false;
    const comDatas: { ini: string; fim: string; orcado: number }[] = [];

    for (const folha of folhas) {
        const sched = porId.get(folha.id);
        const orcado = folha.orcado;
        const real = (sched?.manualRealPct ?? 0) / 100;
        if (orcado > 0) {
            somaPonderada += real * orcado;
            pesoTotal += orcado;
        }
        ev += real * orcado;

        const ini = soDia(sched?.earlyStart ?? sched?.startDate);
        const fim = soDia(sched?.earlyFinish ?? sched?.endDate);
        if (ini && fim) {
            temDatas = true;
            // PV na convenção do motor: o trabalho ocupa [início, fim) — no último dia trabalhado
            // ainda falta esse dia.
            pv += fracaoDecorrida(ini, fim, hoje) * orcado;
            comDatas.push({ ini, fim, orcado });
        }
        const ultimoDia = ultimoDiaTrabalhado(ini, fim);
        if (ultimoDia && ultimoDia < hoje && real < 1) atrasadas++;
        if (sched?.isCritical) {
            criticas++;
            if (real < 1) criticasAbertas++;
        }
    }

    // Término previsto: como na Central de Comando, o maior término entre os itens do
    // cronograma; sem nenhum, o término declarado no próprio cronograma.
    const maiorFim = itens.reduce((max, s) => {
        const e = ultimoDiaTrabalhado(soDia(s.earlyStart ?? s.startDate), soDia(s.earlyFinish ?? s.endDate));
        return e && (!max || e > max) ? e : max;
    }, '');
    const fimPrevisto = maiorFim || soDia(schedule?.endDate);
    const menorInicio = itens.reduce((min, s) => {
        const i = soDia(s.earlyStart ?? s.startDate);
        return i && (!min || i < min) ? i : min;
    }, '');
    const inicioPrevisto = menorInicio || soDia(schedule?.startDate);

    let fimBaseline = '';
    let desvioDias: number | null = null;
    const baseline = schedule?.activeBaselineId
        ? schedule.baselines?.find(b => b.id === schedule.activeBaselineId)
        : undefined;
    if (baseline) {
        // Término × término: a linha de base guarda o fim do motor também.
        fimBaseline = Object.values(baseline.itemDates).reduce((max, d) => {
            const e = ultimoDiaTrabalhado(soDia(d.startDate), soDia(d.endDate));
            return e && (!max || e > max) ? e : max;
        }, '');
        if (fimBaseline && fimPrevisto) desvioDias = diasEntre(fimBaseline, fimPrevisto);
    }

    // Cronograma ganho (earned schedule): a última data em que o PV planejado ainda não passava do
    // EV de hoje. Atraso em DIAS sem depender de linha de base — o planejador pergunta "quanto
    // atrasa", não "qual o SPI".
    let atrasoDias: number | null = null;
    let avancoEquivaleA = '';
    if (pv > 0) {
        if (ev >= pv) {
            atrasoDias = 0;
            avancoEquivaleA = hoje;
        } else {
            const pvEm = (dia: string) => comDatas.reduce((t, c) => t + fracaoDecorrida(c.ini, c.fim, dia) * c.orcado, 0);
            const base = comDatas.reduce((min, c) => (!min || c.ini < min ? c.ini : min), '');
            let lo = 0;
            let hi = Math.max(0, diasEntre(base, hoje));
            while (lo < hi) {
                const meio = Math.ceil((lo + hi) / 2);
                if (pvEm(somarDias(base, meio)) <= ev + 1e-9) lo = meio; else hi = meio - 1;
            }
            avancoEquivaleA = somarDias(base, lo);
            atrasoDias = diasEntre(avancoEquivaleA, hoje);
        }
    }

    const avancoFisicoPct = pesoTotal > 0 ? (somaPonderada / pesoTotal) * 100 : 0;
    const terminoVencidoDias = fimPrevisto && fimPrevisto < hoje && avancoFisicoPct < 100 ? diasEntre(fimPrevisto, hoje) : null;

    return {
        avancoFisicoPct,
        previstoPct: pesoTotal > 0 ? (pv / pesoTotal) * 100 : 0,
        ev,
        pv,
        spi: pv > 0 ? ev / pv : null,
        atrasadas,
        atrasoDias,
        avancoEquivaleA,
        terminoVencidoDias,
        criticas,
        criticasAbertas,
        inicioPrevisto,
        fimPrevisto,
        fimBaseline,
        desvioDias,
        temDatas,
        totalFolhas: folhas.length,
    };
}

/** Folhas a partir do orçamento gravado do planejamento (coluna `projects.budget`). */
export const folhasDoOrcamento = (
    budget: { id: string; quantity?: number; sinapiItem?: { price?: number } }[] | null | undefined,
): FolhaDoCronograma[] =>
    (budget ?? []).map(b => ({ id: b.id, orcado: (b.quantity ?? 0) * (b.sinapiItem?.price ?? 0) }));
