// utils/financeiroDoSindico.ts
//
// Portal do Síndico › Financeiro — a parte pura (sem React, sem Supabase).
// Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
//
// Duas famílias de regra:
//  1. SITUAÇÃO e RESUMO do mês — "pago" é `tituloEstaPago`, a MESMA regra de
//     Contas a Receber/Pagar e da cota do rateio (utils/situacaoDaCota.ts).
//  2. O QUE o síndico pode fazer com um título, e POR QUÊ não — espelho das
//     recusas das RPCs `sindico_portal_*` (migration aplicar_20271024400000).
//     O banco é quem decide; isto existe para o botão desligado dizer o motivo
//     antes do clique (regra: botão desabilitado SEMPRE diz por quê).
import { tituloEstaPago } from './situacaoDaCota';

/** Um título como `sindico_portal_financeiro` devolve. */
export interface TituloDoCondominio {
    id: string;
    condominioId: string;
    direcao: 'DEBIT' | 'CREDIT';
    origem: string;
    descricao: string | null;
    credor: string | null;
    supplierId: string | null;
    vencimento: string;
    competencia: string | null;
    valor: number;
    status: string;
    businessStatus: string | null;
    approvalStatus: string | null;
    pagoEm: string | null;
    formaPagamento: string | null;
    contaId: string | null;
    centroId: string | null;
    categoriaId: string | null;
    categoria: string | null;
    planoId: string | null;
    lancadoPeloSindico: boolean;
    /** Motivo da trava de pagamento Asaas (em curso ou feito), ou null. */
    travaAsaas: string | null;
}

export type SituacaoDoTitulo = 'PAGO' | 'VENCIDO' | 'EM_ABERTO' | 'CANCELADO';

export const ROTULO_SITUACAO: Record<SituacaoDoTitulo, string> = {
    PAGO: 'Pago', VENCIDO: 'Vencido', EM_ABERTO: 'Em aberto', CANCELADO: 'Cancelado',
};

export function estaCancelado(t: Pick<TituloDoCondominio, 'status' | 'businessStatus'>): boolean {
    return t.status === 'CANCELLED' || t.businessStatus === 'CANCELADO';
}

/** `hoje` em 'YYYY-MM-DD' (Brasília — `hojeEmBrasilia`). */
export function situacaoDoTitulo(t: Pick<TituloDoCondominio, 'status' | 'businessStatus' | 'vencimento'>, hoje: string): SituacaoDoTitulo {
    if (estaCancelado(t)) return 'CANCELADO';
    if (tituloEstaPago(t.status, t.businessStatus)) return 'PAGO';
    return (t.vencimento ?? '').slice(0, 10) < hoje ? 'VENCIDO' : 'EM_ABERTO';
}

const noMes = (iso: string | null | undefined, competencia: string) =>
    !!iso && iso.slice(0, 7) === competencia.slice(0, 7);

export interface ResumoDoMes {
    pagoNoMes: number;
    aPagarNoMes: number;
    /** A pagar em aberto com vencimento antes de hoje — de QUALQUER mês. */
    vencidoAPagar: number;
    recebidoNoMes: number;
    aReceberNoMes: number;
    /** Cotas/receitas em aberto vencidas antes de hoje — de qualquer mês. */
    inadimplencia: number;
    /** Recebido − pago no mês. */
    saldoDoMes: number;
}

/**
 * O mês em números. "Pago no mês" é pelo DIA DO PAGAMENTO (o dinheiro saiu
 * naquele mês); sem data de pagamento gravada, cai no mês do vencimento.
 */
export function resumoDoMes(titulos: TituloDoCondominio[], competencia: string, hoje: string): ResumoDoMes {
    const r: ResumoDoMes = { pagoNoMes: 0, aPagarNoMes: 0, vencidoAPagar: 0, recebidoNoMes: 0, aReceberNoMes: 0, inadimplencia: 0, saldoDoMes: 0 };
    for (const t of titulos) {
        const s = situacaoDoTitulo(t, hoje);
        if (s === 'CANCELADO') continue;
        const valor = Number(t.valor) || 0;
        const pagar = t.direcao === 'DEBIT';
        if (s === 'PAGO') {
            if (noMes(t.pagoEm ?? t.vencimento, competencia)) {
                if (pagar) r.pagoNoMes += valor; else r.recebidoNoMes += valor;
            }
            continue;
        }
        if (noMes(t.vencimento, competencia)) {
            if (pagar) r.aPagarNoMes += valor; else r.aReceberNoMes += valor;
        }
        if (s === 'VENCIDO') {
            if (pagar) r.vencidoAPagar += valor; else r.inadimplencia += valor;
        }
    }
    r.saldoDoMes = r.recebidoNoMes - r.pagoNoMes;
    return r;
}

// ── O que o síndico pode fazer ───────────────────────────────────────────────

export interface ContextoDeOperacao {
    /** Prévia do admin ("Ver como o síndico"). */
    somenteLeitura: boolean;
    /** Entrou com e-mail e senha (o link sozinho não grava). */
    logado: boolean;
    /** `motivoNaoOpera` do condomínio (null = opera; 007 sem org própria = motivo). */
    motivoDoCondominio: string | null;
}

export const MOTIVO_PREVIA = 'Prévia somente leitura.';
/** Mesma frase de `fn_sindico_operar`. */
export const MOTIVO_SEM_LOGIN = 'Para lançar, pagar ou cadastrar, entre no Portal do Síndico com seu e-mail e senha.';

/** Por que nada pode ser gravado neste condomínio agora (null = pode). */
export function motivoNaoOpera(ctx: ContextoDeOperacao): string | null {
    if (ctx.somenteLeitura) return MOTIVO_PREVIA;
    if (!ctx.logado) return MOTIVO_SEM_LOGIN;
    return ctx.motivoDoCondominio;
}

/** Espelho de `fn_sindico_motivo_nao_altera` — editar e cancelar. */
export function motivoNaoAltera(t: TituloDoCondominio): string | null {
    if (t.direcao !== 'DEBIT') return 'Só títulos a pagar são alterados pelo portal.';
    if (t.origem === 'BOLETO') return 'Este título vem de um boleto: corrija o boleto com a administradora.';
    if (t.origem.startsWith('CONTRACT')) return 'Este título vem de um contrato: corrija o contrato com a administradora.';
    if (t.origem !== 'MANUAL') return 'Este título vem de outra origem e só a administradora altera.';
    if (estaCancelado(t)) return 'Este título já está cancelado.';
    if (tituloEstaPago(t.status, t.businessStatus)) return 'Este título já está pago.';
    return t.travaAsaas;
}

/** Espelho das recusas de `sindico_portal_baixar_titulo`. */
export function motivoNaoBaixa(t: TituloDoCondominio): string | null {
    if (t.direcao !== 'DEBIT') return 'Só títulos a pagar recebem baixa pelo portal.';
    if (estaCancelado(t)) return 'Este título está cancelado.';
    if (tituloEstaPago(t.status, t.businessStatus)) return 'Este título já está pago.';
    if (t.approvalStatus === 'PENDENTE') return 'Este título aguarda aprovação na alçada e só pode ser pago depois dela.';
    return t.travaAsaas;
}

/** "2026-10" → "2026-10-01" (o `p_competencia` da leitura). */
export function inicioDaCompetencia(mes: string): string {
    return `${mes.slice(0, 7)}-01`;
}
