/**
 * Análise de Contratos de Serviço — pura, sem I/O.
 *
 * Plano: docs/planos/2026-11-13-contratos-servico-aba-analise.md. Aos moldes de
 * Venda de Ativos › Análise (`lib/salesAnalysis.ts`), com o MESMO princípio:
 * **uma consulta, muitos baldes**. A aba carrega o bruto uma vez (contratos de
 * serviço, as parcelas e as medições deles) e o agrupamento por CLIENTE
 * acontece aqui. Cada contrato, parcela e medição entra em exatamente um balde,
 * e o total é o balde de tudo calculado pelo mesmo caminho de código — a tabela
 * fecha com os indicadores do topo por construção.
 *
 * ⚠️ **O que é "contratado"** (decisão do usuário, 13/11/2026, "Aprovado em
 * diante"): Aprovado, Assinado, Ativo, Suspenso, Concluído e Encerrado.
 * Rascunho, Minuta, Revisão e Enviado são "em negociação". Cancelado fica fora
 * das duas. Status que o sistema não conhece conta como negociação — nunca
 * infla a carteira firmada.
 *
 * Regra transversal do módulo, mantida: **`null` é "não medido", nunca zero.**
 */

import {
    collectionSnapshot,
    parseDateBR,
    diffDays,
    type Receivable,
    type CollectionSnapshot,
} from './rentalExecutive';
import { receivablesAging, type ReceivablesAging } from './rentalAnalysisCharts';
import { receivableSchedule, type ReceivableSchedule, type MonthBucket, type CountValue } from './salesAnalysis';

export type { MonthBucket, CountValue, ReceivableSchedule };

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário
// ─────────────────────────────────────────────────────────────────────────────

/** A ordem do ciclo de vida — é a ordem das barras do gráfico de status. */
export const SERVICE_CONTRACT_STATUS_ORDER = [
    'Rascunho', 'Minuta', 'Revisão', 'Enviado', 'Aprovado', 'Assinado',
    'Ativo', 'Suspenso', 'Concluído', 'Encerrado', 'Cancelado',
] as const;

/** Contratado e ainda correndo — o que pode vencer, ser medido e renovado. */
const VIGENTES = new Set(['Aprovado', 'Assinado', 'Ativo', 'Suspenso']);
/** Contratado e já terminado. */
const ENCERRADOS = new Set(['Concluído', 'Encerrado']);

/** Situação do contrato — a cor da linha do tempo e as fatias do donut. */
export type ServiceContractSituation = 'vigente' | 'encerrado' | 'negociacao' | 'cancelado';

/** Etapa para a carteira: contratado (vigente + encerrado), negociação ou cancelado. */
export type ServiceContractStage = 'contracted' | 'negotiation' | 'cancelled';

export const serviceContractSituation = (status?: string | null): ServiceContractSituation => {
    const s = String(status ?? '').trim();
    if (s === 'Cancelado') return 'cancelado';
    if (VIGENTES.has(s)) return 'vigente';
    if (ENCERRADOS.has(s)) return 'encerrado';
    return 'negociacao';
};

export const serviceContractStage = (status?: string | null): ServiceContractStage => {
    const sit = serviceContractSituation(status);
    return sit === 'cancelado' ? 'cancelled' : sit === 'negociacao' ? 'negotiation' : 'contracted';
};

/** Paleta validada (§28.4) — o mesmo trio de Venda de Ativos, sem o verde. */
export const SERVICE_SITUATION_COLORS: Record<ServiceContractSituation, string> = {
    vigente: '#2563eb',
    negociacao: '#d97706',
    encerrado: '#94a3b8',
    cancelado: '#cbd5e1',
};

export const SERVICE_SITUATION_LABELS: Record<ServiceContractSituation, string> = {
    vigente: 'Vigente',
    negociacao: 'Em negociação',
    encerrado: 'Encerrado',
    cancelado: 'Cancelado',
};

/** Medição que já vale como executada (aprovada). */
const MEDICAO_APROVADA = new Set(['Processada', 'Paga']);
/** Medição lançada e esperando aprovação. */
const MEDICAO_EM_APROVACAO = new Set(['Pendente', 'Em Análise']);
/** Modos de faturamento em que existe medição — os outros não "medem". */
const FATURA_POR_MEDICAO = new Set(['MEDICAO', 'ETAPA']);

export const SEM_CLIENTE = '__sem_cliente__';
export const SEM_CLIENTE_LABEL = 'Sem cliente';

// ─────────────────────────────────────────────────────────────────────────────
// Insumo
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisServiceContract {
    id: string;
    client_id?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    original_value?: number | null;
    current_value?: number | null;
    number?: string | null;
    title?: string | null;
    billing_mode?: string | null;
}

export interface AnalysisMeasurement {
    contract_id: string;
    status?: string | null;
    total_value?: number | null;
}

export interface GroupServiceContractsInput {
    contracts: AnalysisServiceContract[];
    /** `contracts.id` → parcelas. `null` = não carregadas (cobrança "não medida"). */
    receivablesByContract: Map<string, Receivable[]> | null;
    /** `null` = medições não carregadas (medido "não medido"). */
    measurements: AnalysisMeasurement[] | null;
    /** `clients.id` → nome. Cliente sem nome conhecido vira "Cliente sem nome". */
    clientNames: Map<string, string>;
    now?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Saída
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceTimelineRow {
    id: string;
    number: string;
    title: string;
    clientName: string;
    status: string;
    situation: ServiceContractSituation;
    value: number;
    start: string | null;
    end: string | null;
    /** Medido (aprovado) ÷ valor. `null` = contrato que não mede, ou medições não carregadas. */
    measuredRate: number | null;
    /** Vencido e não baixado, deste contrato. 0 sem parcelas carregadas. */
    overdue: number;
    /** Vigente que termina em até 90 dias. */
    expiring: boolean;
    /** Vigente com o fim já no passado. */
    expired: boolean;
}

export interface ServiceStatusBar {
    status: string;
    label: string;
    stage: ServiceContractStage;
    count: number;
    value: number;
}

/**
 * Tudo o que a aba sabe sobre UM recorte — um cliente, ou a carteira inteira
 * (`ALL`). KPIs, gráficos, linha do tempo e linha da tabela leem o MESMO objeto.
 */
export interface ServiceContractsScope {
    clientId: string;
    name: string;
    /** Todos os contratos do balde, cancelados inclusive. Soma = total. */
    contractsCount: number;

    bySituation: Record<ServiceContractSituation, CountValue>;
    /** Só os status presentes, na ordem do ciclo de vida (desconhecidos no fim). */
    byStatus: ServiceStatusBar[];

    /** Aprovado em diante. Soma = total. */
    contractedCount: number;
    contractedValue: number;
    /** Valor original dos contratados — a base da variação. */
    originalValue: number;
    /** vigente − original dos contratados (aditivos + reajustes). */
    variation: number;
    /** `null` sem valor original. */
    variationRate: number | null;
    /** Valor contratado ÷ contratos contratados. `null` sem contrato. */
    ticket: number | null;

    negotiationCount: number;
    negotiationValue: number;
    /** Em negociação que já têm parcela lançada — o aviso que impede ler errado. */
    negotiationWithReceivables: number;
    cancelledCount: number;
    cancelledValue: number;

    /** Vigentes (Aprovado/Assinado/Ativo/Suspenso). */
    active: CountValue;
    /** Vigentes que terminam de hoje a +90 dias. */
    expiring90: CountValue;
    /** Vigentes com o fim no passado. */
    expiredActive: number;
    /** Vigentes sem data de fim. */
    activeWithoutEnd: number;

    /** Contratados por mês de início, últimos 12 meses (o corrente por último). */
    startedByMonth: MonthBucket[];
    started90: CountValue;
    /** Contratados sem data de início — fora da série. */
    contractedWithoutStart: number;

    /** `null` = medições não carregadas. */
    measurement: {
        /** Σ das medições aprovadas (Processada/Paga) dos contratados. */
        measured: number;
        /** Medições em Pendente/Em Análise. */
        pending: CountValue;
        /** Valor vigente dos contratados faturados por medição/etapa. */
        base: number;
        measurableCount: number;
        /** medido ÷ base. `null` sem contrato por medição. */
        rate: number | null;
    } | null;

    /** `null` = parcelas não carregadas. */
    collection: CollectionSnapshot | null;
    aging: ReceivablesAging | null;
    schedule: ReceivableSchedule | null;
    /** Σ por contrato contratado de (valor − lançado), nunca negativo. `null` sem parcelas. */
    toBill: number | null;

    timeline: ServiceTimelineRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────────

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/** Valor do contrato: o vigente (pós-aditivo/reajuste), senão o original. */
export const serviceContractValue = (c: Pick<AnalysisServiceContract, 'current_value' | 'original_value'>): number =>
    Number(c.current_value ?? c.original_value) || 0;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date, comAno: boolean): string =>
    comAno ? `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : MESES_CURTOS[d.getMonth()];

const vazio = (): CountValue => ({ count: 0, value: 0 });
const somar = (b: CountValue, v: number) => { b.count++; b.value += v; };

const ordemDoStatus = new Map<string, number>(SERVICE_CONTRACT_STATUS_ORDER.map((s, i) => [s, i]));

interface Bucket {
    id: string;
    name: string;
    contracts: AnalysisServiceContract[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrupamento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrupa os contratos de serviço por cliente. Linhas e total saem do mesmo
 * caminho de código — o total é o balde de todos os contratos.
 */
export const groupServiceContractsAnalysis = (input: GroupServiceContractsInput): {
    rows: ServiceContractsScope[];
    byId: Map<string, ServiceContractsScope>;
    total: ServiceContractsScope;
} => {
    const { contracts, receivablesByContract, measurements, clientNames } = input;
    const agora = input.now ?? new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    const nomeDoCliente = (id: string | null | undefined): string =>
        id ? (clientNames.get(id) ?? clientNames.get(key(id)) ?? 'Cliente sem nome') : SEM_CLIENTE_LABEL;

    const medicoesPorContrato = new Map<string, AnalysisMeasurement[]>();
    for (const m of measurements ?? []) {
        const lista = medicoesPorContrato.get(key(m.contract_id)) ?? [];
        lista.push(m);
        medicoesPorContrato.set(key(m.contract_id), lista);
    }
    const parcelasDe = (c: AnalysisServiceContract): Receivable[] =>
        receivablesByContract?.get(c.id) ?? receivablesByContract?.get(key(c.id)) ?? [];

    const baldes = new Map<string, Bucket>();
    for (const c of contracts) {
        const id = c.client_id ? key(c.client_id) : SEM_CLIENTE;
        const b = baldes.get(id) ?? { id: c.client_id ?? SEM_CLIENTE, name: nomeDoCliente(c.client_id), contracts: [] };
        b.contracts.push(c);
        baldes.set(id, b);
    }

    const escopoDe = (b: Bucket): ServiceContractsScope => {
        const bySituation: Record<ServiceContractSituation, CountValue> = {
            vigente: vazio(), encerrado: vazio(), negociacao: vazio(), cancelado: vazio(),
        };
        const porStatus = new Map<string, ServiceStatusBar>();
        let originalValue = 0, contractedValue = 0, contractedCount = 0;
        let negotiationWithReceivables = 0;
        const expiring90 = vazio();
        let expiredActive = 0, activeWithoutEnd = 0;

        const inicioSerie = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
        const startedByMonth: MonthBucket[] = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(inicioSerie.getFullYear(), inicioSerie.getMonth() + i, 1);
            return { month: monthKey(d), label: monthLabel(d, i === 0 || d.getMonth() === 0), count: 0, value: 0 };
        });
        const idxMes = new Map(startedByMonth.map((m, i) => [m.month, i]));
        const started90 = vazio();
        let contractedWithoutStart = 0;

        let measured = 0, base = 0, measurableCount = 0;
        const pending = vazio();

        const parcelas: Receivable[] = [];
        let aFaturar = 0;
        const timeline: ServiceTimelineRow[] = [];

        for (const c of b.contracts) {
            const valor = serviceContractValue(c);
            const status = String(c.status ?? '').trim() || 'Sem status';
            const sit = serviceContractSituation(c.status);
            const etapa = serviceContractStage(c.status);
            somar(bySituation[sit], valor);

            const barra = porStatus.get(status) ?? { status, label: status, stage: etapa, count: 0, value: 0 };
            barra.count++;
            barra.value += valor;
            porStatus.set(status, barra);

            const minhas = etapa === 'cancelled' ? [] : parcelasDe(c);
            parcelas.push(...minhas);
            if (etapa === 'negotiation' && minhas.length > 0) negotiationWithReceivables++;

            // ── Vigência ─────────────────────────────────────────────────────
            let expiring = false, expired = false;
            if (sit === 'vigente') {
                if (!c.end_date) activeWithoutEnd++;
                else {
                    const dias = diffDays(hoje, parseDateBR(c.end_date));
                    if (dias < 0) { expired = true; expiredActive++; }
                    else if (dias <= 90) { expiring = true; somar(expiring90, valor); }
                }
            }

            // ── Medição ──────────────────────────────────────────────────────
            const meds = medicoesPorContrato.get(key(c.id)) ?? [];
            const medidoDoContrato = meds
                .filter(m => MEDICAO_APROVADA.has(String(m.status ?? '')))
                .reduce((a, m) => a + (Number(m.total_value) || 0), 0);
            const mede = FATURA_POR_MEDICAO.has(String(c.billing_mode ?? '').toUpperCase());

            if (etapa === 'contracted') {
                contractedCount++;
                contractedValue += valor;
                originalValue += Number(c.original_value ?? c.current_value) || 0;
                // Por CONTRATO, nunca negativo: um contrato faturado a mais não
                // abate o saldo de outro — e a soma das linhas fecha com o total.
                const lancado = minhas.reduce((a, r) => a + (Number(r.amount) || 0), 0);
                aFaturar += Math.max(0, valor - lancado);

                if (c.start_date) {
                    const ini = parseDateBR(c.start_date);
                    const i = idxMes.get(monthKey(ini));
                    if (i != null) somar(startedByMonth[i], valor);
                    const dias = diffDays(ini, hoje);
                    if (dias >= 0 && dias <= 90) somar(started90, valor);
                } else contractedWithoutStart++;

                if (measurements) {
                    measured += medidoDoContrato;
                    for (const m of meds) {
                        if (MEDICAO_EM_APROVACAO.has(String(m.status ?? ''))) somar(pending, Number(m.total_value) || 0);
                    }
                    if (mede) { base += valor; measurableCount++; }
                }
            }

            const overdue = minhas
                .filter(r => !r.settled && r.due_date && diffDays(parseDateBR(r.due_date), hoje) > 0)
                .reduce((a, r) => a + (Number(r.amount) || 0), 0);

            timeline.push({
                id: c.id,
                number: String(c.number ?? '').trim(),
                title: String(c.title ?? '').trim() || 'Contrato sem título',
                clientName: nomeDoCliente(c.client_id),
                status,
                situation: sit,
                value: valor,
                start: c.start_date ?? null,
                end: c.end_date ?? null,
                measuredRate: measurements && mede && valor > 0 ? medidoDoContrato / valor : null,
                overdue,
                expiring,
                expired,
            });
        }

        const byStatus = [...porStatus.values()].sort((x, y) =>
            (ordemDoStatus.get(x.status) ?? 99) - (ordemDoStatus.get(y.status) ?? 99) || x.status.localeCompare(y.status, 'pt-BR'));

        // Começo mais antigo primeiro; sem início no fim.
        timeline.sort((x, y) => {
            if (!x.start && !y.start) return x.title.localeCompare(y.title, 'pt-BR');
            if (!x.start) return 1;
            if (!y.start) return -1;
            return x.start.localeCompare(y.start);
        });

        const carregouParcelas = receivablesByContract != null;

        return {
            clientId: b.id,
            name: b.name,
            contractsCount: b.contracts.length,
            bySituation,
            byStatus,
            contractedCount,
            contractedValue,
            originalValue,
            variation: contractedValue - originalValue,
            variationRate: originalValue > 0 ? contractedValue / originalValue - 1 : null,
            ticket: contractedCount > 0 ? contractedValue / contractedCount : null,
            negotiationCount: bySituation.negociacao.count,
            negotiationValue: bySituation.negociacao.value,
            negotiationWithReceivables,
            cancelledCount: bySituation.cancelado.count,
            cancelledValue: bySituation.cancelado.value,
            active: bySituation.vigente,
            expiring90,
            expiredActive,
            activeWithoutEnd,
            startedByMonth,
            started90,
            contractedWithoutStart,
            measurement: measurements
                ? { measured, pending, base, measurableCount, rate: base > 0 ? measured / base : null }
                : null,
            collection: carregouParcelas ? collectionSnapshot(parcelas, agora) : null,
            aging: carregouParcelas ? receivablesAging(parcelas, agora) : null,
            schedule: carregouParcelas ? receivableSchedule(parcelas, agora) : null,
            toBill: carregouParcelas ? aFaturar : null,
            timeline,
        };
    };

    const tudo: Bucket = { id: 'ALL', name: 'Todos os clientes', contracts: [...baldes.values()].flatMap(b => b.contracts) };

    const rows = [...baldes.values()]
        .map(escopoDe)
        // "Sem cliente" por último: resíduo de cadastro, não concorrente.
        .sort((a, b) => {
            if (a.clientId === SEM_CLIENTE) return 1;
            if (b.clientId === SEM_CLIENTE) return -1;
            return (b.contractedValue + b.negotiationValue) - (a.contractedValue + a.negotiationValue)
                || a.name.localeCompare(b.name, 'pt-BR');
        });

    return { rows, byId: new Map(rows.map(r => [r.clientId, r])), total: escopoDe(tudo) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Rodapé da tabela "Por cliente"
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceRowsSummary {
    contractsCount: number;
    contractedCount: number;
    contractedValue: number;
    negotiationValue: number;
    activeCount: number;
    expiring90Count: number;
    variationRate: number | null;
    ticket: number | null;
    measured: number | null;
    measuredRate: number | null;
    billed: number | null;
    toBill: number | null;
    receivableOpen: number | null;
    overdue90: number | null;
    received: number | null;
}

/**
 * Rodapé sobre as linhas na tela. Taxas PONDERADAS pela base de cada linha
 * (valor original, base de medição) — sem busca, o rodapé é igual ao topo por
 * construção (lição de Locações, 26/10/2026). Medição e cobrança são `null`
 * quando nenhuma linha as tem carregadas.
 */
export const summarizeServiceRows = (rows: ServiceContractsScope[]): ServiceRowsSummary => {
    let n = 0, nContr = 0, vContr = 0, vNeg = 0, ativos = 0, vencem = 0, orig = 0;
    let medido = 0, baseMed = 0, comMedicao = false;
    let lancado = 0, aFaturar = 0, aberto = 0, venc90 = 0, recebido = 0, comCobranca = false;
    for (const r of rows) {
        n += r.contractsCount;
        nContr += r.contractedCount;
        vContr += r.contractedValue;
        vNeg += r.negotiationValue;
        ativos += r.active.count;
        vencem += r.expiring90.count;
        orig += r.originalValue;
        if (r.measurement) { comMedicao = true; medido += r.measurement.measured; baseMed += r.measurement.base; }
        if (r.aging && r.toBill != null) {
            comCobranca = true;
            lancado += r.aging.billed;
            aFaturar += r.toBill;
            aberto += r.aging.totalOpen;
            venc90 += r.aging.over90;
            recebido += r.aging.received;
        }
    }
    return {
        contractsCount: n,
        contractedCount: nContr,
        contractedValue: vContr,
        negotiationValue: vNeg,
        activeCount: ativos,
        expiring90Count: vencem,
        variationRate: orig > 0 ? vContr / orig - 1 : null,
        ticket: nContr > 0 ? vContr / nContr : null,
        measured: comMedicao ? medido : null,
        measuredRate: comMedicao && baseMed > 0 ? medido / baseMed : null,
        billed: comCobranca ? lancado : null,
        toBill: comCobranca ? aFaturar : null,
        receivableOpen: comCobranca ? aberto : null,
        overdue90: comCobranca ? venc90 : null,
        received: comCobranca ? recebido : null,
    };
};
