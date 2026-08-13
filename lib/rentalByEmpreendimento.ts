/**
 * Análise de Locações recortada por EMPREENDIMENTO — pura, sem I/O.
 *
 * Plano: docs/planos/2026-08-12-locacoes-analise-por-empreendimento.md.
 *
 * O princípio que manda no arquivo inteiro é **"uma consulta, muitos baldes"**:
 * a aba Análise carrega o bruto UMA vez (imóveis, negócios, contratos, eventos
 * de status, NOI por imóvel) e o agrupamento acontece aqui, no cliente. A
 * alternativa — uma chamada de serviço por empreendimento — além de custar N
 * round-trips, faz o total e as linhas divergirem no primeiro filtro que ficar
 * fora de sincronia. Foi assim que "patrimônio" e "receita" já mostraram
 * números diferentes em telas diferentes antes da Fase 0 do plano de KPIs.
 *
 * Por isso **todo agrupamento aqui é uma PARTIÇÃO**: cada imóvel, negócio,
 * contrato e evento entra em exatamente um balde, e as grandezas somáveis
 * (unidades, receita, patrimônio, NOI, vagas) fecham com o total por
 * construção. Taxas e médias (ocupação, WALE, inadimplência) são calculadas
 * por balde e NÃO se somam — nem deveriam.
 *
 * Regra transversal do módulo, mantida: **`null` é "não medido", nunca zero.**
 */

import {
    leafNodes,
    sumPortfolioValue,
    getDealInstallmentValue,
    type PortfolioNode,
} from './rentalPortfolio';
import {
    financialOccupancy,
    wale,
    renewalRate,
    collectionSnapshot,
    type Receivable,
    type FinancialOccupancy,
    type WaleResult,
    type RenewalResult,
    type CollectionSnapshot,
} from './rentalExecutive';
import { vacancyStats, netAbsorption, type StatusEvent, type VacancyStats } from './rentalVacancy';
import { portfolioNoi, type NoiResult } from './rentalNoi';

/** Id do balde dos imóveis sem vínculo com empreendimento.
 *  Existe por obrigação aritmética: sem ele, a soma das linhas não fecha com o
 *  total do topo e o usuário lê a diferença como bug da tela. */
export const SEM_EMPREENDIMENTO = '__sem_empreendimento__';

export const SEM_EMPREENDIMENTO_LABEL = 'Sem empreendimento';

/** Status de imóvel considerado ocupado — mesmo valor de `PropertyStatus.RENTED`. */
const STATUS_ALUGADO = 'RENTED';

/** Status de contrato vigente (`contracts.status` guarda português cru). */
const STATUS_CONTRATO_ATIVO = 'Ativo';

export interface EmpreendimentoRef {
    id: string;
    name: string;
}

export interface AnalysisProperty extends PortfolioNode {
    status?: string | null;
    type?: string | null;
    // Sem `| null` de propósito: é a forma de `Property` na tela, e alargar aqui
    // obrigaria a um cast em quem passa a lista real.
    price?: number;
    rental_price?: number;
}

export interface AnalysisDeal {
    id: string;
    type?: string | null;
    status?: string | null;
    property_id?: string | null;
    units?: { property_id: string; value?: number | null }[] | null;
    value?: number | null;
    installment_value?: number | null;
}

export interface AnalysisContract {
    id: string;
    deal_id?: string | null;
    parent_contract_id?: string | null;
    status?: string | null;
    end_date?: string | null;
    current_value?: number | null;
    original_value?: number | null;
    renewal_seq?: number | null;
}

/**
 * Tudo o que a aba Análise sabe sobre UM recorte da carteira — um
 * empreendimento, ou a carteira inteira (o balde `ALL`).
 *
 * É deliberadamente o objeto completo, e não só as colunas da tabela: os KPIs
 * do topo leem o MESMO escopo que as linhas. Se a tabela tivesse um formato
 * reduzido próprio, o topo precisaria de uma segunda conta — e seriam duas
 * fórmulas para divergir, que é o defeito que este arquivo existe para evitar.
 */
export interface RentalAnalysisScope {
    empreendimentoId: string;
    name: string;
    /** Unidades locáveis (folhas da carteira) do balde. Soma = total. */
    unitsCount: number;
    rentedCount: number;
    /** alugadas ÷ locáveis. `null` sem unidade — não é 0%. */
    occupancyRate: number | null;
    /** Imóveis de topo (edifício ou avulso) — o "Ativos sob gestão". */
    activeAssets: number;
    /** Soma das parcelas mensais contratadas. Soma = total. */
    monthlyRevenue: number;
    /** Patrimônio por rollup das raízes do balde. Soma = total. */
    portfolioValue: number;
    /** receita mensal ÷ patrimônio. `null` sem patrimônio. */
    monthlyYield: number | null;
    financial: FinancialOccupancy & { leafCount: number; withoutPrice: number };
    /** `null` = log de status indisponível (migration não aplicada). */
    vacancy: (VacancyStats & { netAbsorption30d: { rented: number; vacated: number; net: number } }) | null;
    /** `null` = despesa por imóvel indisponível. */
    noi: { revenue: number; expense: number; noi: number; margin: number | null } | null;
    /** `null` = contratos indisponíveis (RLS/tabela). */
    executive: {
        wale: WaleResult;
        renewal: RenewalResult;
        collection: CollectionSnapshot;
        contractsConsidered: number;
    } | null;
}

export interface GroupRentalAnalysisInput {
    properties: AnalysisProperty[];
    deals: AnalysisDeal[];
    /** `commercial_properties.id` → empreendimento (empreendimentoService). */
    empreendimentoByProperty: Record<string, EmpreendimentoRef>;
    /** Aluguel de referência da unidade (o `rentalValueOf` da tela). Assinatura
     *  estreita de propósito: só os campos que a conta usa, para a função da
     *  tela (tipada em `Partial<Property>`) encaixar sem cast. */
    rentalValueOf: (property: { rental_price?: number; price?: number }) => number;
    /** Parcela mensal CONTRATADA da unidade, só contrato fechado —
     *  a mesma base da receita mensal (o `getContractedRentalValue(id, true)`). */
    contractedValueOf: (propertyId: string) => number;
    contracts?: AnalysisContract[] | null;
    receivablesByContract?: Map<string, Receivable[]> | null;
    vacancyEvents?: StatusEvent[] | null;
    noiByProperty?: Map<string, NoiResult> | null;
    now?: Date;
    /** Janela da taxa de renovação. Padrão: o ano corrente. */
    renewalFrom?: Date;
    renewalTo?: Date;
}

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/**
 * Empreendimento de um imóvel: vínculo próprio primeiro, senão o do PAI.
 *
 * A unidade se liga por `empreendimento_units.rental_property_id` e o edifício
 * por `empreendimentos.commercial_rental_building_id` — os dois caminhos já vêm
 * resolvidos no mapa. A herança pelo pai cobre o caso comum de o edifício estar
 * vinculado e as unidades não (espelho publicado antes do vínculo das unidades):
 * sem ela, o prédio inteiro cairia em "Sem empreendimento".
 *
 * Sobe a cadeia inteira (com trava de ciclo), não só um nível — carteira com
 * bloco dentro de condomínio tem mais de um degrau.
 */
export const empreendimentoOfProperty = (
    property: AnalysisProperty,
    byId: Map<string, AnalysisProperty>,
    map: Record<string, EmpreendimentoRef>,
): EmpreendimentoRef | null => {
    let atual: AnalysisProperty | undefined = property;
    const visitados = new Set<string>();
    while (atual) {
        const id = key(atual.id);
        if (visitados.has(id)) break;      // `parent_id` circular não pode travar a UI
        visitados.add(id);
        const achado = map[atual.id];
        if (achado) return achado;
        const parent = atual.parent_id;
        if (!parent) break;
        atual = byId.get(key(parent));
    }
    return null;
};

/**
 * Empreendimento de um contrato de locação: `contracts.deal_id` → negócio →
 * imóvel → empreendimento.
 *
 * ⚠️ **Contrato-FILHO de renovação não herda `deal_id`** (memória
 * `project_locacao_renovacao_contratos`): ele só carrega `parent_contract_id`.
 * Por isso, com `deal_id` nulo, sobe pela cadeia de pais até achar um contrato
 * que tenha negócio. Sem esse degrau, toda carteira já renovada cairia em "Sem
 * empreendimento" — e o WALE por empreendimento ficaria errado justamente nos
 * contratos mais antigos, que são os que mais pesam.
 */
export const empreendimentoOfContract = (
    contract: AnalysisContract,
    contractsById: Map<string, AnalysisContract>,
    empreendimentoByDeal: Map<string, EmpreendimentoRef>,
): EmpreendimentoRef | null => {
    let atual: AnalysisContract | undefined = contract;
    const visitados = new Set<string>();
    while (atual) {
        const id = key(atual.id);
        if (visitados.has(id)) break;
        visitados.add(id);
        if (atual.deal_id) {
            const achado = empreendimentoByDeal.get(key(atual.deal_id));
            if (achado) return achado;
        }
        const pai = atual.parent_contract_id;
        if (!pai) break;
        atual = contractsById.get(key(pai));
    }
    return null;
};

/** Imóvel de referência do negócio: o `property_id` direto ou a primeira unidade. */
const propertyIdOfDeal = (deal: AnalysisDeal): string | null =>
    deal.property_id || deal.units?.[0]?.property_id || null;

interface Bucket {
    ref: EmpreendimentoRef;
    leaves: AnalysisProperty[];
    /** Raízes + toda a subárvore delas — base do patrimônio e do NOI. */
    subtree: AnalysisProperty[];
    deals: AnalysisDeal[];
    contracts: AnalysisContract[];
    receivables: Receivable[];
    events: StatusEvent[];
}

const novoBucket = (ref: EmpreendimentoRef): Bucket => ({
    ref, leaves: [], subtree: [], deals: [], contracts: [], receivables: [], events: [],
});

/**
 * Agrupa a carteira de locação por empreendimento.
 *
 * Devolve as linhas E o total calculados **pelo mesmo caminho de código**: o
 * total é o balde de todos os dados. É essa simetria que garante que a tabela
 * feche com os KPIs do topo — e não a disciplina de quem for mexer depois.
 */
export const groupRentalAnalysis = (
    input: GroupRentalAnalysisInput,
): {
    rows: RentalAnalysisScope[];
    byId: Map<string, RentalAnalysisScope>;
    total: RentalAnalysisScope;
} => {
    const {
        properties, deals, empreendimentoByProperty, rentalValueOf, contractedValueOf,
        contracts, receivablesByContract, vacancyEvents, noiByProperty,
    } = input;

    const agora = input.now ?? new Date();
    const renewalFrom = input.renewalFrom ?? new Date(agora.getFullYear(), 0, 1);
    const renewalTo = input.renewalTo ?? new Date(agora.getFullYear(), 11, 31);

    const byId = new Map(properties.map(p => [key(p.id), p]));
    const refOf = (p: AnalysisProperty): EmpreendimentoRef =>
        empreendimentoOfProperty(p, byId, empreendimentoByProperty)
        ?? { id: SEM_EMPREENDIMENTO, name: SEM_EMPREENDIMENTO_LABEL };

    const baldes = new Map<string, Bucket>();
    const balde = (ref: EmpreendimentoRef): Bucket => {
        const existente = baldes.get(ref.id);
        if (existente) return existente;
        const novo = novoBucket(ref);
        baldes.set(ref.id, novo);
        return novo;
    };

    // ── Imóveis ──────────────────────────────────────────────────────────────
    // Folhas e raízes são decididas UMA vez, sobre a lista inteira. Recalcular
    // dentro de cada balde faria um edifício sem as unidades no mesmo balde
    // virar folha e contar duas vezes.
    const folhas = new Set(leafNodes(properties).map(p => key(p.id)));

    // A subárvore acompanha a RAIZ: cada nó vai para o balde do ancestral mais
    // alto presente na lista. Assim as subárvores são disjuntas e o patrimônio
    // (que é rollup, não soma de folhas) fecha exatamente com o total.
    const raizDe = (p: AnalysisProperty): AnalysisProperty => {
        let atual = p;
        const visitados = new Set<string>();
        while (atual.parent_id) {
            const id = key(atual.id);
            if (visitados.has(id)) break;
            visitados.add(id);
            const pai = byId.get(key(atual.parent_id));
            if (!pai || key(pai.id) === id) break;
            atual = pai;
        }
        return atual;
    };

    for (const p of properties) {
        balde(refOf(raizDe(p))).subtree.push(p);
        if (folhas.has(key(p.id))) balde(refOf(p)).leaves.push(p);
    }

    // ── Negócios ─────────────────────────────────────────────────────────────
    const empreendimentoByDeal = new Map<string, EmpreendimentoRef>();
    for (const d of deals) {
        const pid = propertyIdOfDeal(d);
        const imovel = pid ? byId.get(key(pid)) : undefined;
        const ref = imovel
            ? refOf(imovel)
            : { id: SEM_EMPREENDIMENTO, name: SEM_EMPREENDIMENTO_LABEL };
        empreendimentoByDeal.set(key(d.id), ref);
        // A receita mensal do módulo é a das locações FECHADAS — mesma base do
        // KPI "Receita mensal" e da ocupação financeira.
        if (d.type === 'RENTAL' && d.status === 'COMPLETED') balde(ref).deals.push(d);
    }

    // ── Contratos e recebíveis ───────────────────────────────────────────────
    if (contracts) {
        const contractsById = new Map(contracts.map(c => [key(c.id), c]));
        for (const c of contracts) {
            const ref = empreendimentoOfContract(c, contractsById, empreendimentoByDeal)
                ?? { id: SEM_EMPREENDIMENTO, name: SEM_EMPREENDIMENTO_LABEL };
            const b = balde(ref);
            b.contracts.push(c);
            for (const r of receivablesByContract?.get(c.id) ?? []) b.receivables.push(r);
        }
    }

    // ── Eventos de status (vacância) ─────────────────────────────────────────
    if (vacancyEvents) {
        for (const e of vacancyEvents) {
            const imovel = byId.get(key(e.property_id));
            // Evento de imóvel que não está na carteira carregada (vendido,
            // excluído) não pertence a balde nenhum: entra no "Sem
            // empreendimento", nunca some — o total tem que continuar fechando.
            const ref = imovel
                ? refOf(imovel)
                : { id: SEM_EMPREENDIMENTO, name: SEM_EMPREENDIMENTO_LABEL };
            balde(ref).events.push(e);
        }
    }

    const escopoDe = (b: Bucket): RentalAnalysisScope => {
        const alugadas = b.leaves.filter(p => p.status === STATUS_ALUGADO).length;

        const ocupacaoFinanceira = financialOccupancy(
            b.leaves.map(p => ({
                id: p.id,
                rental_price: rentalValueOf(p),
                // Só contrato FECHADO — a mesma base da receita mensal. Sem
                // isso, dois cards vizinhos mediriam coisas diferentes com o
                // mesmo nome.
                contracted: contractedValueOf(p.id) ?? 0,
            })),
        );

        const receita = b.deals.reduce((acc, d) => acc + getDealInstallmentValue(d), 0);
        const patrimonio = sumPortfolioValue(b.subtree, p => Number(p.price) || 0);

        // `null` (não medido) só quando o insumo INTEIRO está ausente. Balde sem
        // evento, com o log disponível, é medição legítima de zero vaga.
        const vacancia = vacancyEvents
            ? {
                ...vacancyStats(b.events, agora),
                netAbsorption30d: netAbsorption(
                    b.events, new Date(agora.getTime() - 30 * 86_400_000), agora,
                ),
            }
            : null;

        const noi = noiByProperty ? portfolioNoi(b.subtree, noiByProperty) : null;

        const executive = contracts
            ? {
                wale: wale(
                    b.contracts.map(c => ({
                        id: c.id,
                        end_date: c.end_date,
                        // Vigente (pós-reajuste) pondera; o de assinatura é fallback.
                        value: c.current_value ?? c.original_value ?? 0,
                        active: (c.status ?? '') === STATUS_CONTRATO_ATIVO,
                    })),
                    agora,
                ),
                renewal: renewalRate(
                    b.contracts.map(c => ({
                        id: c.id,
                        end_date: c.end_date,
                        parent_contract_id: c.parent_contract_id,
                        renewal_seq: c.renewal_seq,
                    })),
                    renewalFrom,
                    renewalTo,
                ),
                collection: collectionSnapshot(b.receivables, agora),
                contractsConsidered: b.contracts.length,
            }
            : null;

        return {
            empreendimentoId: b.ref.id,
            name: b.ref.name,
            unitsCount: b.leaves.length,
            rentedCount: alugadas,
            occupancyRate: b.leaves.length > 0 ? alugadas / b.leaves.length : null,
            activeAssets: b.subtree.filter(p => p.type === 'BUILDING' || !p.parent_id).length,
            monthlyRevenue: receita,
            portfolioValue: patrimonio,
            monthlyYield: patrimonio > 0 ? receita / patrimonio : null,
            financial: {
                ...ocupacaoFinanceira,
                leafCount: b.leaves.length,
                // Unidade sem preço não entra no potencial (não dá para supor
                // preço de quem não tem) — mas isso INFLA a taxa, e quem exibe
                // precisa poder avisar.
                withoutPrice: b.leaves.filter(p => rentalValueOf(p) <= 0).length,
            },
            vacancy: vacancia,
            noi,
            executive,
        };
    };

    // O total é o balde de TUDO, pelo mesmo caminho de código das linhas — não
    // uma segunda fórmula que soma colunas. Ratios (WALE, ocupação) não podem
    // ser somados, e um total somado divergiria deles.
    const totalBucket: Bucket = {
        ref: { id: 'ALL', name: 'Todos os empreendimentos' },
        leaves: [], subtree: [], deals: [], contracts: [], receivables: [], events: [],
    };
    for (const b of baldes.values()) {
        totalBucket.leaves.push(...b.leaves);
        totalBucket.subtree.push(...b.subtree);
        totalBucket.deals.push(...b.deals);
        totalBucket.contracts.push(...b.contracts);
        totalBucket.receivables.push(...b.receivables);
        totalBucket.events.push(...b.events);
    }

    const rows = [...baldes.values()]
        .map(escopoDe)
        // Sem empreendimento fica sempre por último: é resíduo de cadastro, não
        // um empreendimento concorrendo com os outros na leitura.
        .sort((a, b) => {
            if (a.empreendimentoId === SEM_EMPREENDIMENTO) return 1;
            if (b.empreendimentoId === SEM_EMPREENDIMENTO) return -1;
            return b.monthlyRevenue - a.monthlyRevenue;
        });

    return {
        rows,
        byId: new Map(rows.map(r => [r.empreendimentoId, r])),
        total: escopoDe(totalBucket),
    };
};
