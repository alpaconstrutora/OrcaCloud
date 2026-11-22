import type { HoldingItem } from '../components/investor/types';

/**
 * A carteira do investidor — o que o Resumo e a Carteira (portal e gestor) mostram. UMA regra (Fase B do plano
 * docs/planos/2026-11-21-portal-do-investidor-consolidacao.md, decisão D2: o Imovib e a SPE são a fonte):
 *
 *  - participação = o SÓCIO da SPE (`spe_partners`: cotas e %); `investor_participations` só para obra sem SPE;
 *  - patrimônio = capital integralizado na SPE + lucro líquido da versão publicada × % de cotas
 *    (sem versão, só o integralizado); obra sem SPE = o aportado. O "valor da obra" digitado não entra mais;
 *  - recebido = dividendo + distribuição liquidados; retirada à parte;
 *  - Retorno total = (recebido + patrimônio − aportado) ÷ aportado; Retorno em caixa = recebido ÷ aportado.
 */
export const SEM_PARTICIPACAO = 'Participação não registrada';
export const SEM_APORTE = 'Sem aporte nem capital integralizado';

export type OrigemDoPatrimonio = 'versao' | 'integralizado' | 'aportado';
export const ROTULO_DA_ORIGEM: Record<OrigemDoPatrimonio, string> = {
    versao: 'Integralizado + resultado da versão publicada × cotas',
    integralizado: 'Capital integralizado na SPE (sem versão publicada)',
    aportado: 'Aportes liquidados (obra sem SPE)',
};

/** O que a carteira precisa da obra (local, status e avanço da ficha). */
export interface ObraDaCarteira {
    id?: string;
    name: string;
    settings?: { location?: string; obraStatus?: string; obraProgress?: number } | null;
}

/** O sócio da SPE (fn_socios_do_investidor). */
export interface SocioDaCarteira {
    id: string;
    name: string;
    project_id?: string | null;
    project_name?: string | null;
    ownership_pct?: number | null;
    quota_count?: number | null;
    capital_calls_total?: number | null;
    capital_paid?: number | null;
    lucro_da_versao?: number | null;
    versao_label?: string | null;
}

export interface ParticipacaoDaCarteira { project_id: string; ownership_pct?: number | null; quota_count?: number | null }

export interface LancamentoDaCarteira {
    project_id: string;
    type: string;
    amount: number | string;
    status: string;
    paid_date?: string | null;
}

export interface ResumoDosLancamentos { aportado: number; recebido: number; retirado: number; pendente: number }

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const pctDoRetorno = (v: number | null) => (v == null ? undefined : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

/** Aportado, recebido (dividendo + distribuição), retirado — só liquidados; pendente = aporte a pagar. */
export function resumoDosLancamentos(lancamentos: LancamentoDaCarteira[]): ResumoDosLancamentos {
    const r: ResumoDosLancamentos = { aportado: 0, recebido: 0, retirado: 0, pendente: 0 };
    for (const l of lancamentos) {
        const v = num(l.amount);
        if (l.type === 'aporte' && (l.status === 'pendente' || l.status === 'atrasado')) r.pendente += v;
        if (l.status !== 'liquidado') continue;
        if (l.type === 'aporte') r.aportado += v;
        else if (l.type === 'dividendo' || l.type === 'distribuicao') r.recebido += v;
        else if (l.type === 'retirada') r.retirado += v;
    }
    return r;
}

/** Retorno total e em caixa, em fração (0,12 = 12%). `null` sem aporte. */
export function retornos(aportado: number, recebido: number, patrimonio: number | null): { total: number | null; emCaixa: number | null } {
    if (!(aportado > 0)) return { total: null, emCaixa: null };
    return {
        total: patrimonio == null ? null : (recebido + patrimonio - aportado) / aportado,
        emCaixa: recebido / aportado,
    };
}

/** Patrimônio do sócio: integralizado + lucro da versão × %. */
export function patrimonioDoSocio(s: SocioDaCarteira): { valor: number; origem: OrigemDoPatrimonio } {
    const integralizado = num(s.capital_paid);
    const lucro = s.lucro_da_versao == null ? null : Number(s.lucro_da_versao);
    if (lucro != null && Number.isFinite(lucro)) {
        return { valor: integralizado + lucro * (num(s.ownership_pct) / 100), origem: 'versao' };
    }
    return { valor: integralizado, origem: 'integralizado' };
}

/**
 * Um item por SPE de que o investidor é sócio; um por obra sem SPE em que ele tem participação ou lançamento.
 * Os lançamentos de cada item são os da obra da SPE (o aporte da chamada de capital cai na obra — Fase 7.1).
 */
export function carteiraDoInvestidor(e: {
    obras: ObraDaCarteira[];
    socios: SocioDaCarteira[];
    participacoes: ParticipacaoDaCarteira[];
    lancamentos: LancamentoDaCarteira[];
}): HoldingItem[] {
    const obraPorId = new Map(e.obras.filter(o => o.id).map(o => [o.id as string, o]));
    const lancDaObra = (id: string | null | undefined) => (id ? e.lancamentos.filter(l => l.project_id === id) : []);
    const itens: HoldingItem[] = [];
    const obrasComSpe = new Set<string>();

    for (const s of e.socios) {
        if (s.project_id) obrasComSpe.add(s.project_id);
        const obra = s.project_id ? obraPorId.get(s.project_id) : undefined;
        const l = resumoDosLancamentos(lancDaObra(s.project_id));
        const p = patrimonioDoSocio(s);
        // D2: a SPE é a fonte — o aportado do sócio é o capital que ele integralizou (cada pagamento de chamada
        // também vira aporte no extrato, Fase 7.1); dos lançamentos da obra vem só o recebido.
        const aportado = num(s.capital_paid);
        const r = retornos(aportado, l.recebido, p.valor);
        const percentual = num(s.ownership_pct);
        itens.push({
            id: s.project_id ?? s.id,
            name: obra?.name ?? s.project_name ?? s.name,
            location: obra?.settings?.location || s.name,
            cota: percentual > 0 ? pct(percentual) : '—',
            equity: aportado > 0 || p.origem === 'versao' ? p.valor : null,
            semPatrimonio: aportado > 0 || p.origem === 'versao' ? undefined : SEM_APORTE,
            origemDoPatrimonio: ROTULO_DA_ORIGEM[p.origem] + (p.origem === 'versao' && s.versao_label ? ` (${s.versao_label})` : ''),
            currentValue: p.valor,
            invested: aportado || undefined,
            received: l.recebido || undefined,
            yoc: r.total ?? undefined,
            yield: pctDoRetorno(r.total),
            retornoEmCaixa: pctDoRetorno(r.emCaixa),
            status: obra?.settings?.obraStatus || 'Em Andamento',
            progress: obra?.settings?.obraProgress || 0,
        });
    }

    const idsSemSpe = new Set<string>([
        ...e.participacoes.map(p => p.project_id),
        ...e.lancamentos.map(l => l.project_id),
    ].filter(id => id && !obrasComSpe.has(id)));
    for (const id of idsSemSpe) {
        const obra = obraPorId.get(id);
        if (!obra) continue;   // lançamento de obra que o investidor não enxerga: não vira item
        const part = e.participacoes.find(p => p.project_id === id);
        const l = resumoDosLancamentos(lancDaObra(id));
        const r = retornos(l.aportado, l.recebido, l.aportado > 0 ? l.aportado : null);
        const percentual = num(part?.ownership_pct);
        itens.push({
            id,
            name: obra.name,
            location: obra.settings?.location || 'Localização não informada',
            cota: percentual > 0 ? pct(percentual) : '—',
            equity: l.aportado > 0 ? l.aportado : null,
            semPatrimonio: l.aportado > 0 ? undefined : (part ? SEM_APORTE : SEM_PARTICIPACAO),
            origemDoPatrimonio: ROTULO_DA_ORIGEM.aportado,
            currentValue: l.aportado || undefined,
            invested: l.aportado || undefined,
            received: l.recebido || undefined,
            yoc: r.total ?? undefined,
            yield: pctDoRetorno(r.total),
            retornoEmCaixa: pctDoRetorno(r.emCaixa),
            status: obra.settings?.obraStatus || 'Em Andamento',
            progress: obra.settings?.obraProgress || 0,
        });
    }
    return itens;
}

/** Os KPIs do Resumo (portal e gestor) — uma conta só para as duas telas. */
export function resumoDaCarteira(itens: HoldingItem[], lancamentos: LancamentoDaCarteira[], agora: Date = new Date()): {
    patrimonio: number | null;
    aportado: number;
    recebido: number;
    retirado: number;
    retornoTotal: number | null;
    retornoEmCaixa: number | null;
    rendimentoMensalPct: number | null;
} {
    const patrimonio = totalDaCarteira(itens).total;
    const aportado = itens.reduce((s, h) => s + (h.invested ?? 0), 0);
    const { recebido, retirado } = resumoDosLancamentos(lancamentos);
    const r = retornos(aportado, recebido, patrimonio);
    const primeiro = lancamentos
        .filter(l => l.type === 'aporte' && l.status === 'liquidado' && l.paid_date)
        .map(l => new Date(l.paid_date as string).getTime())
        .sort((a, b) => a - b)[0];
    const meses = primeiro ? Math.max(1, Math.round((agora.getTime() - primeiro) / (1000 * 60 * 60 * 24 * 30))) : 0;
    return {
        patrimonio,
        aportado,
        recebido,
        retirado,
        retornoTotal: r.total,
        retornoEmCaixa: r.emCaixa,
        rendimentoMensalPct: meses > 0 && aportado > 0 ? (recebido / aportado / meses) * 100 : null,
    };
}

/**
 * Soma só o patrimônio conhecido. `total` nulo = nenhum item tem patrimônio (mostrar "—", nunca
 * "R$ 0"); `motivo` = o de todos os itens sem patrimônio, ou um genérico se forem diferentes.
 */
export function totalDaCarteira(itens: Pick<HoldingItem, 'equity' | 'semPatrimonio'>[]): {
    total: number | null; semPatrimonio: number; motivo?: string;
} {
    const conhecidos = itens.filter(h => h.equity != null);
    const sem = itens.filter(h => h.equity == null);
    const motivos = new Set(sem.map(h => h.semPatrimonio ?? SEM_PARTICIPACAO));
    return {
        total: itens.length > 0 && conhecidos.length === 0 ? null : conhecidos.reduce((s, h) => s + (h.equity ?? 0), 0),
        semPatrimonio: sem.length,
        motivo: motivos.size === 0 ? undefined : motivos.size === 1 ? [...motivos][0] : 'Patrimônio não calculado',
    };
}
