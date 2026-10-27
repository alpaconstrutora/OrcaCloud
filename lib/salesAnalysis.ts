/**
 * Análise de Venda de Ativos — pura, sem I/O.
 *
 * Plano: docs/planos/2026-10-27-vendas-aba-analise.md. Espelho da Análise de
 * Locações (`rentalByEmpreendimento.ts`), com o MESMO princípio: **uma
 * consulta, muitos baldes**. A aba carrega o bruto uma vez (imóveis,
 * negociações, contratos de venda e as parcelas deles) e o agrupamento por
 * empreendimento acontece aqui. Cada imóvel, negociação, contrato e parcela
 * entra em exatamente um balde, e o total é o balde de tudo calculado pelo
 * mesmo caminho de código — por isso a tabela fecha com os indicadores do topo
 * por construção, e não por disciplina.
 *
 * ⚠️ **O que é "vendida"** (decisão do usuário, 27/10/2026, "Com contrato"):
 * negociação em Contrato, Assinatura ou Concluído — ou unidade com status
 * `SOLD`. Proposta, Aprovação e Reserva são "em negociação". Até aqui os cards
 * de Venda de Ativos só contavam Concluído, e em produção nenhuma das 14
 * negociações estava lá: o VGV vendido da carteira inteira saía R$ 0.
 *
 * Regra transversal do módulo, mantida: **`null` é "não medido", nunca zero.**
 */

import { leafNodes, type PortfolioNode } from './rentalPortfolio';
import {
    collectionSnapshot,
    parseDateBR,
    diffDays,
    type Receivable,
    type CollectionSnapshot,
} from './rentalExecutive';
import { receivablesAging, type ReceivablesAging } from './rentalAnalysisCharts';
import {
    empreendimentoOfProperty,
    empreendimentoOfContract,
    SEM_EMPREENDIMENTO,
    SEM_EMPREENDIMENTO_LABEL,
    type EmpreendimentoRef,
    type AnalysisContract,
} from './rentalByEmpreendimento';
import { rotuloCurtoDaUnidade } from './rentalUnitMirror';
import { STATUS_LABELS, normalizeStatus, type DealWorkflowStatus } from './dealWorkflow';

export { SEM_EMPREENDIMENTO };

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário
// ─────────────────────────────────────────────────────────────────────────────

/** Etapas em que a negociação JÁ É venda (decisão de 27/10/2026). */
export const ETAPAS_VENDIDA: DealWorkflowStatus[] = ['CONTRATO', 'ASSINATURA', 'COMPLETED'];

/** Etapas abertas, na ordem do funil. `WAITING_PAYMENT` (legado) é Reserva. */
export const ETAPAS_ABERTAS: DealWorkflowStatus[] = ['IN_NEGOTIATION', 'PENDING', 'RESERVA'];

export type SaleDealStage = 'sold' | 'open' | 'cancelled';

/** Em que ponto a negociação está para a análise. Status vazio é Proposta —
 *  o mesmo padrão de `getDealStatusDisplay`. */
export const saleDealStage = (status?: string | null): SaleDealStage => {
    if (status === 'CANCELLED') return 'cancelled';
    const s = normalizeStatus((status || 'IN_NEGOTIATION') as DealWorkflowStatus);
    return ETAPAS_VENDIDA.includes(s) ? 'sold' : 'open';
};

/** As cinco categorias da composição. Soma = unidades do balde. */
export type SaleUnitStatus = 'sold' | 'reserved' | 'available' | 'exchanged' | 'other';

/** Status do cadastro, com as grafias em português que ainda existem na base
 *  (mesma normalização de `salesDashboardService`). */
const statusDoCadastro = (s?: string | null): string => {
    const v = String(s ?? '').toUpperCase();
    if (v === 'VENDIDO') return 'SOLD';
    if (v === 'RESERVADO') return 'RESERVED';
    if (v === 'DISPONÍVEL' || v === 'DISPONIVEL') return 'AVAILABLE';
    if (v === 'PERMUTADO') return 'EXCHANGED';
    return v;
};

// ─────────────────────────────────────────────────────────────────────────────
// Entradas
// ─────────────────────────────────────────────────────────────────────────────

export interface SaleProperty extends PortfolioNode {
    status?: string | null;
    name?: string;
    block?: string;
    floor?: number;
    type?: string | null;
    price?: number;
    initial_price?: number;
    private_area?: number;
}

export interface SaleDeal {
    id: string;
    type?: string | null;
    status?: string | null;
    property_id?: string | null;
    units?: { property_id: string; value?: number | null }[] | null;
    value?: number | null;
    /** Data da negociação — base da velocidade de vendas. */
    date?: string | null;
    client_id?: string | null;
}

export interface SaleClient {
    id: string;
    category?: string | null;
}

export interface GroupSalesAnalysisInput {
    properties: SaleProperty[];
    /** Só negociações de VENDA — quem chama filtra `type === 'SALE'`. */
    deals: SaleDeal[];
    /** `commercial_properties.id` → empreendimento, eixo de VENDA. */
    empreendimentoByProperty: Record<string, EmpreendimentoRef>;
    /** Contratos `domain='VENDAS'`. `null` = não carregados (não medido). */
    contracts?: AnalysisContract[] | null;
    receivablesByContract?: Map<string, Receivable[]> | null;
    now?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Saídas
// ─────────────────────────────────────────────────────────────────────────────

export interface SaleUnitStatusBreakdown {
    sold: number;
    reserved: number;
    available: number;
    exchanged: number;
    other: number;
    total: number;
}

export interface MonthBucket {
    /** `YYYY-MM`. */
    month: string;
    /** `out/26` no primeiro mês e em todo janeiro; só `nov` nos demais. */
    label: string;
    count: number;
    value: number;
}

export interface CountValue {
    count: number;
    value: number;
}

/** Parcelas em aberto que vencem de hoje em diante, por mês. */
export interface ReceivableSchedule {
    months: MonthBucket[];
    within30: CountValue;
    within90: CountValue;
    within365: CountValue;
    /** Vencem depois do horizonte dos meses. */
    beyond: CountValue;
    /** Em aberto sem vencimento — fora dos meses. */
    noDueDate: number;
}

export interface SaleMirrorCell {
    id: string;
    /** Prédio (raiz) da unidade — o espelho abre a torre no inventário por ele. */
    parentId: string | null;
    name: string;
    label: string;
    /** `''` = sem torre cadastrada. */
    block: string;
    /** 0 = térreo; negativo = subsolo; `null` = sem andar. */
    floor: number | null;
    status: SaleUnitStatus;
    /** Etapa da negociação que ocupa a unidade ("Contrato", "Reserva"…). */
    stageLabel: string | null;
    /** Preço de tabela (`price`, senão `initial_price`). */
    tablePrice: number;
    /** Parte da unidade no valor da negociação (vendida ou aberta). 0 sem negociação. */
    dealValue: number;
    privateArea: number | null;
    /** Recebido ÷ valor da venda, do CONTRATO. `null` sem contrato ou sem valor. */
    receivedRatio: number | null;
    /** Vencido e não baixado, dos contratos desta unidade. */
    overdue: number;
    overdue90: number;
    overdueByContract: [string, number][];
    /** Quantas unidades a negociação cobre (1 = só ela). */
    dealUnits: number;
}

/**
 * Tudo o que a aba sabe sobre UM recorte — um empreendimento, ou a carteira
 * inteira (`ALL`). Os KPIs do topo, os gráficos, o espelho e a linha da tabela
 * leem o MESMO objeto.
 */
export interface SalesAnalysisScope {
    empreendimentoId: string;
    name: string;
    /** Unidades (folhas) do balde. Soma = total. */
    unitsCount: number;
    /** Folhas menos permutadas — a base de "% vendido". Soma = total. */
    sellableCount: number;
    soldCount: number;
    /** vendidas ÷ vendáveis. `null` sem unidade vendável. */
    soldRate: number | null;
    unitStatus: SaleUnitStatusBreakdown;

    /** Σ valor das negociações vendidas. Soma = total. */
    vgvSold: number;
    soldDealsCount: number;
    /** Unidades `SOLD` sem negociação: contam na unidade, ficam FORA do VGV. */
    soldWithoutDeal: number;
    /** Preço de tabela das vendáveis não vendidas (reservadas + disponíveis). */
    vgvUnsold: number;
    /** Vendáveis não vendidas sem preço — ficam fora do VGV a vender. */
    unsoldWithoutPrice: number;
    vgvTotal: number;
    /** VGV vendido ÷ VGV total. `null` sem VGV. */
    vgvSoldRate: number | null;

    openDealsCount: number;
    openDealsValue: number;
    /** Uma linha por etapa (Proposta → Concluído), sempre todas. */
    funnel: { status: DealWorkflowStatus; label: string; count: number; value: number }[];
    cancelledCount: number;

    /** VGV vendido ÷ negociações vendidas. `null` sem venda. */
    ticket: number | null;
    /** Σ venda ÷ Σ tabela − 1, das vendas com preço de tabela. Negativo = desconto. */
    discount: { rate: number | null; sale: number; base: number; count: number };
    valuePerSqm: { max: number | null; min: number | null; avg: number | null; count: number };

    /** Vendas com data da negociação nos últimos 90 dias. */
    sales90: CountValue;
    /** Últimos 12 meses (o corrente por último), vendas pela data da negociação. */
    salesByMonth: MonthBucket[];
    /** Vendas sem data — fora da velocidade. */
    soldWithoutDate: number;

    /** `null` = contratos não carregados. */
    collection: CollectionSnapshot | null;
    aging: ReceivablesAging | null;
    schedule: ReceivableSchedule | null;
    /** Contratos de venda do balde. `null` = não carregados. */
    contractsCount: number | null;

    units: SaleMirrorCell[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────────

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

export const tablePriceOf = (p: { price?: number; initial_price?: number }): number =>
    Number(p.price) || Number(p.initial_price) || 0;

const unitIdsOf = (d: SaleDeal): string[] =>
    d.units && d.units.length > 0
        ? d.units.map(u => u.property_id)
        : (d.property_id ? [d.property_id] : []);

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date, comAno: boolean): string =>
    comAno ? `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : MESES_CURTOS[d.getMonth()];

/** `count` meses a partir de `inicio` (dia 1), todos presentes — mês vazio = 0. */
const mesesDesde = (inicio: Date, count: number): MonthBucket[] =>
    Array.from({ length: count }, (_, i) => {
        const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
        return { month: monthKey(d), label: monthLabel(d, i === 0 || d.getMonth() === 0), count: 0, value: 0 };
    });

const vazio = (): CountValue => ({ count: 0, value: 0 });
const somar = (b: CountValue, v: number) => { b.count++; b.value += v; };

/**
 * Parcelas em aberto que vencem de hoje em diante, por mês, nos próximos
 * `horizonMonths`. Vencidas ficam de fora: elas moram no aging. O vencimento é
 * comparado em DATA local (`parseDateBR`) — o mesmo cuidado de fuso do resto.
 */
export const receivableSchedule = (rows: Receivable[], now: Date = new Date(), horizonMonths = 12): ReceivableSchedule => {
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const months = mesesDesde(hoje, horizonMonths);
    const idx = new Map(months.map((m, i) => [m.month, i]));
    const out: ReceivableSchedule = {
        months, within30: vazio(), within90: vazio(), within365: vazio(), beyond: vazio(), noDueDate: 0,
    };
    for (const r of rows) {
        if (r.settled) continue;
        const v = Number(r.amount) || 0;
        if (!r.due_date) { out.noDueDate++; continue; }
        const venc = parseDateBR(r.due_date);
        const dias = diffDays(hoje, venc);
        if (dias < 0) continue;
        if (dias <= 30) somar(out.within30, v);
        if (dias <= 90) somar(out.within90, v);
        if (dias <= 365) somar(out.within365, v);
        const i = idx.get(monthKey(venc));
        if (i == null) somar(out.beyond, v);
        else somar(months[i], v);
    }
    return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Agrupamento
// ─────────────────────────────────────────────────────────────────────────────

interface Bucket {
    ref: EmpreendimentoRef;
    leaves: SaleProperty[];
    deals: SaleDeal[];
    contracts: AnalysisContract[];
    receivables: Receivable[];
}

const novoBucket = (ref: EmpreendimentoRef): Bucket => ({ ref, leaves: [], deals: [], contracts: [], receivables: [] });

/**
 * Agrupa a carteira de venda por empreendimento. Devolve linhas e total pelo
 * mesmo caminho de código — o total é o balde de todos os dados.
 */
export const groupSalesAnalysis = (input: GroupSalesAnalysisInput): {
    rows: SalesAnalysisScope[];
    byId: Map<string, SalesAnalysisScope>;
    total: SalesAnalysisScope;
} => {
    const { properties, deals, empreendimentoByProperty, contracts, receivablesByContract } = input;
    const agora = input.now ?? new Date();

    const byId = new Map(properties.map(p => [key(p.id), p]));
    const semEmp: EmpreendimentoRef = { id: SEM_EMPREENDIMENTO, name: SEM_EMPREENDIMENTO_LABEL };
    const refOf = (p: SaleProperty): EmpreendimentoRef =>
        empreendimentoOfProperty(p, byId, empreendimentoByProperty) ?? semEmp;

    const baldes = new Map<string, Bucket>();
    const balde = (ref: EmpreendimentoRef): Bucket => {
        const b = baldes.get(ref.id) ?? novoBucket(ref);
        baldes.set(ref.id, b);
        return b;
    };

    // ── Unidade → negociação que a ocupa ─────────────────────────────────────
    // Uma unidade tem no máximo uma negociação ativa (trava no banco desde
    // 11/10/2026). Se vier mais de uma (dado antigo), a vendida prevalece.
    const dealDaUnidade = new Map<string, SaleDeal>();
    for (const d of deals) {
        const etapa = saleDealStage(d.status);
        if (etapa === 'cancelled') continue;
        for (const u of unitIdsOf(d)) {
            const atual = dealDaUnidade.get(key(u));
            if (!atual || (etapa === 'sold' && saleDealStage(atual.status) !== 'sold')) dealDaUnidade.set(key(u), d);
        }
    }

    const statusDaUnidade = (p: SaleProperty): SaleUnitStatus => {
        const d = dealDaUnidade.get(key(p.id));
        const cadastro = statusDoCadastro(p.status);
        if (d && saleDealStage(d.status) === 'sold') return 'sold';
        if (cadastro === 'SOLD') return 'sold';
        if (cadastro === 'EXCHANGED') return 'exchanged';
        if (d || cadastro === 'RESERVED') return 'reserved';
        if (cadastro === 'AVAILABLE') return 'available';
        return 'other';
    };

    // ── Imóveis ──────────────────────────────────────────────────────────────
    // Folhas decididas UMA vez, sobre a lista inteira (mesmo cuidado de
    // Locações: recalcular por balde faria edifício virar folha e contar duas vezes).
    for (const p of leafNodes(properties)) balde(refOf(p)).leaves.push(p);

    // ── Negociações ──────────────────────────────────────────────────────────
    const empreendimentoByDeal = new Map<string, EmpreendimentoRef>();
    for (const d of deals) {
        const pid = unitIdsOf(d)[0];
        const imovel = pid ? byId.get(key(pid)) : undefined;
        const ref = imovel ? refOf(imovel) : semEmp;
        empreendimentoByDeal.set(key(d.id), ref);
        balde(ref).deals.push(d);
    }

    // ── Contratos e parcelas ─────────────────────────────────────────────────
    const contractsById = new Map((contracts ?? []).map(c => [key(c.id), c]));
    if (contracts) {
        for (const c of contracts) {
            const b = balde(empreendimentoOfContract(c, contractsById, empreendimentoByDeal) ?? semEmp);
            b.contracts.push(c);
            for (const r of receivablesByContract?.get(c.id) ?? []) b.receivables.push(r);
        }
    }

    // Negociação → contratos dela (contrato-filho sobe a cadeia até achar `deal_id`).
    const dealsById = new Map(deals.map(d => [key(d.id), d]));
    const contratosDoNegocio = new Map<string, AnalysisContract[]>();
    for (const c of contracts ?? []) {
        let atual: AnalysisContract | undefined = c;
        const vistos = new Set<string>();
        while (atual && !vistos.has(key(atual.id))) {
            vistos.add(key(atual.id));
            if (atual.deal_id && dealsById.has(key(atual.deal_id))) {
                const lista = contratosDoNegocio.get(key(atual.deal_id)) ?? [];
                lista.push(c);
                contratosDoNegocio.set(key(atual.deal_id), lista);
                break;
            }
            atual = atual.parent_contract_id ? contractsById.get(key(atual.parent_contract_id)) : undefined;
        }
    }

    /** Parte da unidade no valor da negociação: o valor da própria unidade
     *  quando o contrato o traz, senão rateio pelo preço de tabela (ou por
     *  igual, sem tabela). Nunca o valor cheio em cada unidade — somaria N vezes. */
    const parteDaUnidade = (d: SaleDeal, unidadeId: string): number => {
        const total = Number(d.value) || 0;
        const ids = unitIdsOf(d);
        if (ids.length <= 1) return total;
        const propria = d.units?.find(u => key(u.property_id) === key(unidadeId));
        if (propria?.value != null && Number(propria.value) > 0) return Number(propria.value);
        const precos = ids.map(id => tablePriceOf(byId.get(key(id)) ?? {}));
        const soma = precos.reduce((a, v) => a + v, 0);
        const meu = tablePriceOf(byId.get(key(unidadeId)) ?? {});
        return soma > 0 ? total * (meu / soma) : total / ids.length;
    };

    const escopoDe = (b: Bucket): SalesAnalysisScope => {
        const unitStatus: SaleUnitStatusBreakdown = { sold: 0, reserved: 0, available: 0, exchanged: 0, other: 0, total: b.leaves.length };
        let vgvUnsold = 0;
        let unsoldWithoutPrice = 0;
        let soldWithoutDeal = 0;
        for (const p of b.leaves) {
            const s = statusDaUnidade(p);
            unitStatus[s]++;
            if (s === 'sold' && !(dealDaUnidade.get(key(p.id)) && saleDealStage(dealDaUnidade.get(key(p.id))!.status) === 'sold')) soldWithoutDeal++;
            if (s === 'reserved' || s === 'available' || s === 'other') {
                const preco = tablePriceOf(p);
                if (preco > 0) vgvUnsold += preco;
                else unsoldWithoutPrice++;
            }
        }
        const sellableCount = unitStatus.total - unitStatus.exchanged;

        const vendidas = b.deals.filter(d => saleDealStage(d.status) === 'sold');
        const abertas = b.deals.filter(d => saleDealStage(d.status) === 'open');
        const vgvSold = vendidas.reduce((a, d) => a + (Number(d.value) || 0), 0);
        const vgvTotal = vgvSold + vgvUnsold;

        const funnel = [...ETAPAS_ABERTAS, ...ETAPAS_VENDIDA].map(status => {
            const daEtapa = b.deals.filter(d =>
                d.status !== 'CANCELLED' && normalizeStatus((d.status || 'IN_NEGOTIATION') as DealWorkflowStatus) === status);
            return {
                status,
                label: STATUS_LABELS[status],
                count: daEtapa.length,
                value: daEtapa.reduce((a, d) => a + (Number(d.value) || 0), 0),
            };
        });

        // Desconto: só vendas cuja tabela é conhecida — sem ela não há contra o
        // quê medir. Agregado (Σ venda ÷ Σ tabela), para uma venda grande pesar
        // como grande.
        let somaVenda = 0;
        let somaTabela = 0;
        let amostraDesconto = 0;
        const valoresM2: number[] = [];
        for (const d of vendidas) {
            const ids = unitIdsOf(d);
            const tabela = ids.reduce((a, id) => a + tablePriceOf(byId.get(key(id)) ?? {}), 0);
            const valor = Number(d.value) || 0;
            if (tabela > 0 && valor > 0) { somaVenda += valor; somaTabela += tabela; amostraDesconto++; }
            const area = ids.reduce((a, id) => a + (Number(byId.get(key(id))?.private_area) || 0), 0);
            if (area > 0 && valor > 0) valoresM2.push(valor / area);
        }

        // Velocidade: pela data da negociação (é a data que todo negócio tem).
        const inicioDoAno = new Date(agora.getFullYear(), agora.getMonth() - 11, 1);
        const salesByMonth = mesesDesde(inicioDoAno, 12);
        const idxMes = new Map(salesByMonth.map((m, i) => [m.month, i]));
        const sales90 = vazio();
        let soldWithoutDate = 0;
        const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        for (const d of vendidas) {
            if (!d.date) { soldWithoutDate++; continue; }
            const data = parseDateBR(d.date);
            const valor = Number(d.value) || 0;
            const dias = diffDays(data, hoje);
            if (dias >= 0 && dias <= 90) somar(sales90, valor);
            const i = idxMes.get(monthKey(data));
            if (i != null) somar(salesByMonth[i], valor);
        }

        // Células do espelho.
        const units: SaleMirrorCell[] = b.leaves.map(p => {
            const d = dealDaUnidade.get(key(p.id));
            const contratos = d ? contratosDoNegocio.get(key(d.id)) ?? [] : [];
            let overdue = 0;
            let overdue90 = 0;
            let recebido = 0;
            const overdueByContract: [string, number][] = [];
            for (const c of contratos) {
                const ag = receivablesAging(receivablesByContract?.get(c.id) ?? [], agora);
                overdue += ag.totalOverdue;
                overdue90 += ag.over90;
                recebido += ag.received;
                if (ag.totalOverdue > 0) overdueByContract.push([c.id, ag.totalOverdue]);
            }
            const valorNegocio = d ? Number(d.value) || 0 : 0;
            const nome = (p.name ?? '').trim() || 'Unidade';
            const andar = p.floor == null || Number.isNaN(Number(p.floor)) ? null : Number(p.floor);
            return {
                id: p.id,
                parentId: p.parent_id ?? null,
                name: nome,
                label: rotuloCurtoDaUnidade(nome),
                block: (p.block ?? '').trim(),
                floor: andar,
                status: statusDaUnidade(p),
                stageLabel: d ? STATUS_LABELS[normalizeStatus((d.status || 'IN_NEGOTIATION') as DealWorkflowStatus)] ?? null : null,
                tablePrice: tablePriceOf(p),
                dealValue: d ? parteDaUnidade(d, p.id) : 0,
                privateArea: p.private_area ? Number(p.private_area) : null,
                receivedRatio: contracts && contratos.length > 0 && valorNegocio > 0 ? recebido / valorNegocio : null,
                overdue,
                overdue90,
                overdueByContract,
                dealUnits: d ? Math.max(1, unitIdsOf(d).length) : 1,
            };
        });

        return {
            empreendimentoId: b.ref.id,
            name: b.ref.name,
            unitsCount: unitStatus.total,
            sellableCount,
            soldCount: unitStatus.sold,
            soldRate: sellableCount > 0 ? unitStatus.sold / sellableCount : null,
            unitStatus,
            vgvSold,
            soldDealsCount: vendidas.length,
            soldWithoutDeal,
            vgvUnsold,
            unsoldWithoutPrice,
            vgvTotal,
            vgvSoldRate: vgvTotal > 0 ? vgvSold / vgvTotal : null,
            openDealsCount: abertas.length,
            openDealsValue: abertas.reduce((a, d) => a + (Number(d.value) || 0), 0),
            funnel,
            cancelledCount: b.deals.filter(d => d.status === 'CANCELLED').length,
            ticket: vendidas.length > 0 ? vgvSold / vendidas.length : null,
            discount: {
                rate: somaTabela > 0 ? somaVenda / somaTabela - 1 : null,
                sale: somaVenda,
                base: somaTabela,
                count: amostraDesconto,
            },
            valuePerSqm: valoresM2.length > 0
                ? {
                    max: Math.max(...valoresM2),
                    min: Math.min(...valoresM2),
                    avg: valoresM2.reduce((a, v) => a + v, 0) / valoresM2.length,
                    count: valoresM2.length,
                }
                : { max: null, min: null, avg: null, count: 0 },
            sales90,
            salesByMonth,
            soldWithoutDate,
            collection: contracts ? collectionSnapshot(b.receivables, agora) : null,
            aging: contracts ? receivablesAging(b.receivables, agora) : null,
            schedule: contracts ? receivableSchedule(b.receivables, agora) : null,
            contractsCount: contracts ? b.contracts.length : null,
            units,
        };
    };

    const totalBucket = novoBucket({ id: 'ALL', name: 'Todos os empreendimentos' });
    for (const b of baldes.values()) {
        totalBucket.leaves.push(...b.leaves);
        totalBucket.deals.push(...b.deals);
        totalBucket.contracts.push(...b.contracts);
        totalBucket.receivables.push(...b.receivables);
    }

    const rows = [...baldes.values()]
        .map(escopoDe)
        // "Sem empreendimento" por último: resíduo de cadastro, não concorrente.
        .sort((a, b) => {
            if (a.empreendimentoId === SEM_EMPREENDIMENTO) return 1;
            if (b.empreendimentoId === SEM_EMPREENDIMENTO) return -1;
            return b.vgvTotal - a.vgvTotal;
        });

    return { rows, byId: new Map(rows.map(r => [r.empreendimentoId, r])), total: escopoDe(totalBucket) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Rodapé da tabela "Por empreendimento"
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesRowsSummary {
    sellableCount: number;
    soldCount: number;
    soldRate: number | null;
    vgvSold: number;
    vgvUnsold: number;
    vgvTotal: number;
    vgvSoldRate: number | null;
    openDealsCount: number;
    openDealsValue: number;
    sales90Count: number;
    sales90Value: number;
    soldDealsCount: number;
    ticket: number | null;
    discountRate: number | null;
    valuePerSqmAvg: number | null;
    receivableOpen: number | null;
    overdue90: number | null;
    received: number | null;
}

/**
 * Rodapé sobre as linhas na tela. Taxas e médias são PONDERADAS pela base de
 * cada linha (unidades vendáveis, VGV, tabela, amostra de m²) — sem busca, o
 * rodapé é igual ao topo por construção (lição de Locações, 26/10/2026: a média
 * simples deu 31,9% contra 34,3% do KPI). Cobrança é `null` quando nenhuma
 * linha tem contratos carregados.
 */
export const summarizeSalesRows = (rows: SalesAnalysisScope[]): SalesRowsSummary => {
    let sellable = 0, sold = 0, vgvSold = 0, vgvUnsold = 0, openN = 0, openV = 0;
    let s90n = 0, s90v = 0, soldDeals = 0, somaVenda = 0, somaTabela = 0, somaM2 = 0, amostraM2 = 0;
    let aberto = 0, venc90 = 0, recebido = 0, comCobranca = false;
    for (const r of rows) {
        sellable += r.sellableCount;
        sold += r.soldCount;
        vgvSold += r.vgvSold;
        vgvUnsold += r.vgvUnsold;
        openN += r.openDealsCount;
        openV += r.openDealsValue;
        s90n += r.sales90.count;
        s90v += r.sales90.value;
        soldDeals += r.soldDealsCount;
        somaVenda += r.discount.sale;
        somaTabela += r.discount.base;
        if (r.valuePerSqm.avg != null) { somaM2 += r.valuePerSqm.avg * r.valuePerSqm.count; amostraM2 += r.valuePerSqm.count; }
        if (r.aging) {
            comCobranca = true;
            aberto += r.aging.totalOpen;
            venc90 += r.aging.over90;
            recebido += r.aging.received;
        }
    }
    const vgvTotal = vgvSold + vgvUnsold;
    return {
        sellableCount: sellable,
        soldCount: sold,
        soldRate: sellable > 0 ? sold / sellable : null,
        vgvSold,
        vgvUnsold,
        vgvTotal,
        vgvSoldRate: vgvTotal > 0 ? vgvSold / vgvTotal : null,
        openDealsCount: openN,
        openDealsValue: openV,
        sales90Count: s90n,
        sales90Value: s90v,
        soldDealsCount: soldDeals,
        ticket: soldDeals > 0 ? vgvSold / soldDeals : null,
        discountRate: somaTabela > 0 ? somaVenda / somaTabela - 1 : null,
        valuePerSqmAvg: amostraM2 > 0 ? somaM2 / amostraM2 : null,
        receivableOpen: comCobranca ? aberto : null,
        overdue90: comCobranca ? venc90 : null,
        received: comCobranca ? recebido : null,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Segundo eixo: tipo de cliente
// ─────────────────────────────────────────────────────────────────────────────

export const SEM_CATEGORIA = '__sem_categoria__';
export const SEM_CATEGORIA_LABEL = 'Sem categoria';

export interface SalesClientTypeScope {
    categoryId: string;
    label: string;
    /** Clientes distintos com ao menos uma venda no grupo. */
    clientCount: number;
    salesCount: number;
    vgv: number;
    ticket: number | null;
    /** Média de (valor ÷ área privativa) das vendas com área. `null` sem área. */
    avgValuePerSqm: number | null;
}

/**
 * Vendas por categoria do cliente (`clients.category`). Mesma população de
 * "VGV vendido": só negociações vendidas — duas tabelas vizinhas não podem
 * medir coisas diferentes com o mesmo nome.
 */
export const groupSalesByClientType = (input: {
    deals: SaleDeal[];
    properties: SaleProperty[];
    clients: SaleClient[];
}): { rows: SalesClientTypeScope[]; total: SalesClientTypeScope } => {
    const propsById = new Map(input.properties.map(p => [key(p.id), p]));
    const clientsById = new Map(input.clients.map(c => [key(c.id), c]));
    type B = { categoryId: string; label: string; clientIds: Set<string>; deals: SaleDeal[] };
    const baldes = new Map<string, B>();
    const balde = (id: string, label: string): B => {
        const b = baldes.get(id) ?? { categoryId: id, label, clientIds: new Set<string>(), deals: [] };
        baldes.set(id, b);
        return b;
    };
    for (const d of input.deals) {
        if (saleDealStage(d.status) !== 'sold') continue;
        const categoria = d.client_id ? clientsById.get(key(d.client_id))?.category?.trim() : undefined;
        const b = categoria ? balde(categoria, categoria) : balde(SEM_CATEGORIA, SEM_CATEGORIA_LABEL);
        b.deals.push(d);
        if (d.client_id) b.clientIds.add(key(d.client_id));
    }
    const escopo = (b: B): SalesClientTypeScope => {
        const vgv = b.deals.reduce((a, d) => a + (Number(d.value) || 0), 0);
        const m2 = b.deals
            .map(d => ({ v: Number(d.value) || 0, a: unitIdsOf(d).reduce((s, id) => s + (Number(propsById.get(key(id))?.private_area) || 0), 0) }))
            .filter(x => x.a > 0 && x.v > 0)
            .map(x => x.v / x.a);
        return {
            categoryId: b.categoryId,
            label: b.label,
            clientCount: b.clientIds.size,
            salesCount: b.deals.length,
            vgv,
            ticket: b.deals.length > 0 ? vgv / b.deals.length : null,
            avgValuePerSqm: m2.length > 0 ? m2.reduce((a, v) => a + v, 0) / m2.length : null,
        };
    };
    const total: B = { categoryId: 'ALL', label: 'Todos os tipos', clientIds: new Set(), deals: [] };
    for (const b of baldes.values()) { total.deals.push(...b.deals); b.clientIds.forEach(id => total.clientIds.add(id)); }
    const rows = [...baldes.values()].map(escopo).sort((a, b) => {
        if (a.categoryId === SEM_CATEGORIA) return 1;
        if (b.categoryId === SEM_CATEGORIA) return -1;
        return b.vgv - a.vgv;
    });
    return { rows, total: escopo(total) };
};
