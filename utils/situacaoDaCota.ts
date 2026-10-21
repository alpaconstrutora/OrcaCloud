/**
 * Situação de uma cota condominial para o síndico (inadimplência) — Portal do
 * Síndico, aba Unidades e Financeiro. Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * A cota vira título em `internal_transactions` quando a cobrança é gerada
 * (`condominio_rateio_itens.transaction_id`). Antes disso ela NÃO está "em
 * aberto": não foi cobrada — dizer "em aberto" faria o síndico cobrar quem
 * nunca recebeu boleto.
 */

export type SituacaoDaCota = 'PAGA' | 'EM_ABERTO' | 'VENCIDA' | 'NAO_COBRADA' | 'CANCELADA';

export const ROTULO_SITUACAO_DA_COTA: Record<SituacaoDaCota, string> = {
    PAGA: 'Paga',
    EM_ABERTO: 'Em aberto',
    VENCIDA: 'Vencida',
    NAO_COBRADA: 'Não cobrada',
    CANCELADA: 'Cancelada',
};

/**
 * Título pago — a MESMA regra de Contas a Receber
 * (`commercialFinanceService.mapReceivableRow` chama esta função): conciliado
 * no extrato, ou baixado à mão (business_status RECEBIDO/PAGO). O banco não usa
 * `PAID` em `internal_transactions.status` (medido em 20/10/2026: PENDING,
 * CONCILIATED, CANCELLED).
 */
export function tituloEstaPago(status: string | null | undefined, businessStatus: string | null | undefined): boolean {
    return status === 'CONCILIATED' || ['RECEBIDO', 'PAGO'].includes(businessStatus || '');
}

export interface CotaComTitulo {
    tituloStatus?: string | null;
    tituloNegocio?: string | null;
    vencimento?: string | null;
}

export function situacaoDaCota(cota: CotaComTitulo, hoje: string): SituacaoDaCota {
    if (!cota.tituloStatus) return 'NAO_COBRADA';
    if (cota.tituloStatus === 'CANCELLED') return 'CANCELADA';
    if (tituloEstaPago(cota.tituloStatus, cota.tituloNegocio)) return 'PAGA';
    if (cota.vencimento && cota.vencimento.slice(0, 10) < hoje) return 'VENCIDA';
    return 'EM_ABERTO';
}

export interface CotaDeRateio extends CotaComTitulo {
    unitId: string | null;
    valor: number;
}

export interface RateioComCotas {
    competencia: string;
    status: string;
    condominioId?: string;
    cotas: CotaDeRateio[];
}

export interface SituacaoDaUnidade {
    /** A cota da competência FECHADA mais recente (rascunho é prévia, não cobrança). */
    ultima: { competencia: string; valor: number; situacao: SituacaoDaCota } | null;
    /** Cotas vencidas e não pagas, de todas as competências. */
    vencidas: number;
    valorVencido: number;
}

/** Situação financeira de cada unidade do prédio, pela cota de cada rateio fechado. */
export function situacaoPorUnidade(rateios: RateioComCotas[], hoje: string): Map<string, SituacaoDaUnidade> {
    const mapa = new Map<string, SituacaoDaUnidade>();
    const fechados = rateios
        .filter(r => r.status === 'FECHADO')
        .sort((a, b) => b.competencia.localeCompare(a.competencia));
    for (const r of fechados) {
        for (const c of r.cotas) {
            if (!c.unitId) continue;
            const s = mapa.get(c.unitId) ?? { ultima: null, vencidas: 0, valorVencido: 0 };
            const situacao = situacaoDaCota(c, hoje);
            if (!s.ultima) s.ultima = { competencia: r.competencia, valor: Number(c.valor) || 0, situacao };
            if (situacao === 'VENCIDA') { s.vencidas += 1; s.valorVencido += Number(c.valor) || 0; }
            mapa.set(c.unitId, s);
        }
    }
    return mapa;
}

/** Totais do prédio: unidades com cota vencida e o valor em atraso. */
export function inadimplenciaDoPredio(rateios: RateioComCotas[], hoje: string): { unidades: number; valor: number } {
    let unidades = 0;
    let valor = 0;
    for (const s of situacaoPorUnidade(rateios, hoje).values()) {
        if (s.vencidas > 0) { unidades += 1; valor += s.valorVencido; }
    }
    return { unidades, valor: Math.round(valor * 100) / 100 };
}
