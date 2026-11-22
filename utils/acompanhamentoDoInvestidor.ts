/**
 * Acompanhamento da oportunidade para o investidor (Fase D1 do plano
 * docs/planos/2026-11-21-portal-do-investidor-consolidacao.md): o previsto da versão publicada (naVitrine) × o
 * realizado da obra e das vendas (fn_investor_portal_get_acompanhamento) — só totais. Puro, sem I/O.
 */
export interface RealizadoDoInvestidor {
    obra_nome: string | null;
    avanco: number | null;
    custo_realizado: number;
    entradas: number;
    vendido: number;
    unidades: number;
    unidades_vendidas: number;
}

export interface LinhaDoAcompanhamento {
    rotulo: string;
    previsto: number | null;
    realizado: number | null;
    /** realizado ÷ previsto (0,25 = 25%); `null` sem os dois. */
    fracao: number | null;
    formato: 'moeda' | 'unidades' | 'pct';
}

const fracao = (r: number | null, p: number | null) => (r != null && p != null && p > 0 ? r / p : null);

export function linhasDoAcompanhamento(
    previsto: { vgv: number | null; custo_total: number | null },
    realizado: RealizadoDoInvestidor,
): LinhaDoAcompanhamento[] {
    return [
        { rotulo: 'Vendas (VGV)', previsto: previsto.vgv, realizado: realizado.vendido, fracao: fracao(realizado.vendido, previsto.vgv), formato: 'moeda' },
        { rotulo: 'Unidades vendidas', previsto: realizado.unidades || null, realizado: realizado.unidades_vendidas, fracao: fracao(realizado.unidades_vendidas, realizado.unidades || null), formato: 'unidades' },
        { rotulo: 'Custo (obra e terreno)', previsto: previsto.custo_total, realizado: realizado.custo_realizado, fracao: fracao(realizado.custo_realizado, previsto.custo_total), formato: 'moeda' },
        { rotulo: 'Avanço físico da obra', previsto: 100, realizado: realizado.avanco, fracao: realizado.avanco != null ? realizado.avanco / 100 : null, formato: 'pct' },
    ];
}
