/**
 * Espelho das unidades — a carteira de locação desenhada como PRÉDIO: torres
 * lado a lado, andares de cima para baixo, uma célula por unidade locável.
 * Pura, sem I/O. Plano: docs/planos/2026-10-26-locacoes-analise-espelho-vivo.md.
 *
 * Existe porque a crítica da aba Análise (26/10/2026) achou o que faltava ao
 * painel: o empreendimento como ATIVO FÍSICO. Oito números dizem "12,2% vencido";
 * só o espelho diz QUAIS salas, em que andar.
 *
 * Mesmo princípio de `rentalByEmpreendimento.ts`: o espelho é feito do MESMO
 * balde que os indicadores — as mesmas folhas (`unitStatusBreakdown`), as mesmas
 * parcelas (`receivablesAging`), o mesmo log de status (`snapshotsFrom`). Um
 * desenho que discordasse do gráfico ao lado seria o elemento menos confiável
 * da tela.
 */

import { receivablesAging } from './rentalAnalysisCharts';
import type { Receivable } from './rentalExecutive';
import { snapshotsFrom, type StatusEvent } from './rentalVacancy';

export type MirrorStatus = 'rented' | 'available' | 'reserved' | 'maintenance' | 'other';

export interface UnitMirrorCell {
    id: string;
    /** Prédio (raiz) da unidade — o espelho abre a torre no inventário por ele. */
    parentId: string | null;
    /** Nome inteiro (vai no detalhe). */
    name: string;
    /** O que cabe na célula: "301", "Estac. 1". */
    label: string;
    /** `''` = sem torre cadastrada. */
    block: string;
    /** `null` = sem andar cadastrado. 0 = térreo; negativo = subsolo. */
    floor: number | null;
    /** As mesmas 5 categorias do donut "Composição das unidades". */
    status: MirrorStatus;
    /** Dias no status vago atual. `null` = não está vaga, ou o log não cobre. */
    vacantDays: number | null;
    /** O marco veio do backfill — os dias são um piso, não a data real. */
    vacancyApproximate: boolean;
    /** Parcela mensal contratada (só contrato fechado). */
    contracted: number;
    /** Valor base da Inteligência de Aluguéis (`rentalValueOf`). */
    base: number;
    privateArea: number | null;
    /** Vencido e não baixado, dos contratos desta unidade. */
    overdue: number;
    /** A parte vencida há mais de 90 dias. */
    overdue90: number;
    /** Atraso por contrato, para quem precisa somar sem contar duas vezes um
     *  contrato de várias unidades (o teste de partição faz isso). */
    overdueByContract: [string, number][];
    /** Quantas unidades o contrato desta unidade cobre (1 = só ela). Com mais
     *  de uma, o atraso mostrado é o do CONTRATO inteiro — o detalhe diz isso. */
    contractUnits: number;
    /** Contrato vigente terminando nos próximos 90 dias. */
    expiresWithin90: boolean;
}

export interface MirrorUnitInput {
    id: string;
    parent_id?: string | null;
    name?: string | null;
    block?: string | null;
    floor?: number | null;
    status?: string | null;
    rental_price?: number;
    price?: number;
    private_area?: number;
}

interface MirrorDeal {
    id: string;
    property_id?: string | null;
    units?: { property_id: string }[] | null;
}

interface MirrorContract {
    id: string;
    deal_id?: string | null;
    parent_contract_id?: string | null;
    status?: string | null;
    end_date?: string | null;
}

export interface BuildUnitMirrorInput {
    leaves: MirrorUnitInput[];
    deals: MirrorDeal[];
    contracts?: MirrorContract[] | null;
    receivablesByContract?: Map<string, Receivable[]> | null;
    events?: StatusEvent[] | null;
    rentalValueOf: (p: { rental_price?: number; price?: number }) => number;
    contractedValueOf: (propertyId: string) => number;
    now?: Date;
}

const key = (id: string | null | undefined): string => String(id ?? '').toLowerCase();
const MS_DIA = 86_400_000;
const STATUS_CONTRATO_ATIVO = 'Ativo';

const statusDoEspelho = (s?: string | null): MirrorStatus => {
    switch (s) {
        case 'RENTED': return 'rented';
        case 'AVAILABLE': return 'available';
        case 'RESERVED': return 'reserved';
        case 'MAINTENANCE': return 'maintenance';
        default: return 'other';
    }
};

/** "Sala - 301" → "301"; "Estacionamento 1" → "Estac. 1"; "Salão" → "Salão". */
export const rotuloCurtoDaUnidade = (nome: string): string => {
    const n = nome.trim();
    const numeroNoFim = /[-–]\s*([0-9]+[A-Za-z]?)\s*$/.exec(n);
    if (numeroNoFim) return numeroNoFim[1];
    if (/^[0-9]+[A-Za-z]?$/.test(n)) return n;
    const palavraENumero = /^(\p{L}+)\s+([0-9]+[A-Za-z]?)$/u.exec(n);
    if (palavraENumero && palavraENumero[1].length > 6) return `${palavraENumero[1].slice(0, 5)}. ${palavraENumero[2]}`;
    return n.length > 9 ? `${n.slice(0, 8)}…` : n;
};

/** Pavimento 0 é o TÉRREO; negativo é subsolo (memória `project_pavimento_zero_terreo_nullif`). */
export const rotuloDoAndar = (andar: number | null): { curto: string; longo: string } => {
    if (andar == null) return { curto: '—', longo: 'Sem andar cadastrado' };
    if (andar === 0) return { curto: 'T', longo: 'Térreo' };
    if (andar < 0) return { curto: `S${-andar}`, longo: `${-andar}º subsolo` };
    return { curto: `${andar}º`, longo: `${andar}º pavimento` };
};

/** "TORRE A" fica; "A" vira "Torre A"; sem torre, "Sem torre". */
export const rotuloDaTorre = (bloco: string): string =>
    !bloco.trim() ? 'Sem torre' : /^\s*(torre|bloco|galp)/i.test(bloco) ? bloco : `Torre ${bloco}`;

/**
 * Uma célula por unidade locável do balde. O caminho do atraso é o mesmo do
 * agrupamento por empreendimento: parcela → contrato → (pai, se é renovação) →
 * negócio → unidades.
 */
export const buildUnitMirror = (input: BuildUnitMirrorInput): UnitMirrorCell[] => {
    const agora = input.now ?? new Date();
    const dealsById = new Map(input.deals.map(d => [key(d.id), d]));
    const contractsById = new Map((input.contracts ?? []).map(c => [key(c.id), c]));

    const unidadesDoNegocio = (d: MirrorDeal): string[] =>
        d.units && d.units.length > 0 ? d.units.map(u => key(u.property_id)) : (d.property_id ? [key(d.property_id)] : []);

    // Contrato-filho de renovação não carrega `deal_id` — sobe pela cadeia.
    const negocioDoContrato = (c: MirrorContract): MirrorDeal | null => {
        let atual: MirrorContract | undefined = c;
        const vistos = new Set<string>();
        while (atual && !vistos.has(key(atual.id))) {
            vistos.add(key(atual.id));
            if (atual.deal_id) {
                const d = dealsById.get(key(atual.deal_id));
                if (d) return d;
            }
            atual = atual.parent_contract_id ? contractsById.get(key(atual.parent_contract_id)) : undefined;
        }
        return null;
    };

    // unidade → contratos dela (com quantas unidades cada contrato cobre)
    const contratosDaUnidade = new Map<string, { contract: MirrorContract; units: number }[]>();
    for (const c of input.contracts ?? []) {
        const d = negocioDoContrato(c);
        if (!d) continue;
        const unidades = unidadesDoNegocio(d);
        for (const u of unidades) {
            const lista = contratosDaUnidade.get(u) ?? [];
            lista.push({ contract: c, units: unidades.length });
            contratosDaUnidade.set(u, lista);
        }
    }

    const vaga = new Map(
        snapshotsFrom(input.events ?? [], agora)
            .filter(s => s.status === 'AVAILABLE')
            .map(s => [key(s.propertyId), s]),
    );

    return input.leaves.map(p => {
        const status = statusDoEspelho(p.status);
        const contratos = contratosDaUnidade.get(key(p.id)) ?? [];
        const overdueByContract: [string, number][] = [];
        let overdue = 0;
        let overdue90 = 0;
        let expiresWithin90 = false;
        for (const { contract } of contratos) {
            const aging = receivablesAging(input.receivablesByContract?.get(contract.id) ?? [], agora);
            if (aging.totalOverdue > 0) overdueByContract.push([contract.id, aging.totalOverdue]);
            overdue += aging.totalOverdue;
            overdue90 += aging.over90;
            if ((contract.status ?? '') === STATUS_CONTRATO_ATIVO && contract.end_date) {
                const dias = (new Date(`${contract.end_date.slice(0, 10)}T12:00:00`).getTime() - agora.getTime()) / MS_DIA;
                if (dias >= 0 && dias <= 90) expiresWithin90 = true;
            }
        }
        const snap = status === 'available' ? vaga.get(key(p.id)) : undefined;
        const nome = (p.name ?? '').trim() || 'Unidade';
        const andar = p.floor == null || Number.isNaN(Number(p.floor)) ? null : Number(p.floor);
        return {
            id: p.id,
            parentId: p.parent_id ?? null,
            name: nome,
            label: rotuloCurtoDaUnidade(nome),
            block: (p.block ?? '').trim(),
            floor: andar,
            status,
            vacantDays: snap ? snap.days : null,
            vacancyApproximate: snap ? snap.approximate : false,
            contracted: input.contractedValueOf(p.id) ?? 0,
            base: input.rentalValueOf(p),
            privateArea: p.private_area ? Number(p.private_area) : null,
            overdue,
            overdue90,
            overdueByContract,
            contractUnits: contratos.length > 0 ? Math.max(...contratos.map(c => c.units)) : 1,
            expiresWithin90,
        };
    });
};

export interface MirrorFloor { floor: number | null; cells: UnitMirrorCell[] }
export interface MirrorTower { block: string; floors: MirrorFloor[] }

const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Torres (alfabética, "sem torre" no fim) → andares (de cima para baixo, "sem
 *  andar" no fim) → unidades (ordem natural do rótulo: 2 antes de 10). */
export const mirrorTowers = (cells: UnitMirrorCell[]): MirrorTower[] => {
    const porTorre = new Map<string, UnitMirrorCell[]>();
    for (const c of cells) {
        const lista = porTorre.get(c.block) ?? [];
        lista.push(c);
        porTorre.set(c.block, lista);
    }
    return [...porTorre.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : natural.compare(a, b)))
        .map(([block, lista]) => {
            const porAndar = new Map<number | null, UnitMirrorCell[]>();
            for (const c of lista) {
                const l = porAndar.get(c.floor) ?? [];
                l.push(c);
                porAndar.set(c.floor, l);
            }
            const floors = [...porAndar.entries()]
                .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
                .map(([floor, cs]) => ({ floor, cells: [...cs].sort((x, y) => natural.compare(x.label, y.label)) }));
            return { block, floors };
        });
};
