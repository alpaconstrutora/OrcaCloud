// utils/extratoDoSindico.ts
//
// Portal do Síndico › Financeiro › Extrato e conciliação (G2b, 25/10/2026).
// A parte pura (sem React, sem Supabase).
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_extrato_*`, migration
// aplicar_20271025100000); isto existe para o botão desligado dizer o motivo
// ANTES do clique, com as mesmas frases.
import { normalizeText } from './reconciliationRules';
import type { RawTransaction } from '../services/bankStatementParsers';

export interface VinculoDoMovimento {
    matchId: string;
    tituloId: string;
    descricao: string | null;
    valor: number;
    vencimento: string | null;
    credor: string | null;
}

/** Uma linha do extrato como `sindico_portal_extrato` devolve. */
export interface MovimentoDoExtrato {
    id: string;
    data: string;
    valor: number;
    direcao: 'DEBIT' | 'CREDIT';
    descricao: string;
    status: string;
    vinculos: VinculoDoMovimento[];
    /** Títulos de valor exato a até 10 dias — a sugestão do portal. */
    candidatosExatos: number;
}

/** Um título candidato, como `sindico_portal_extrato_candidatos` devolve. */
export interface CandidatoDoMovimento {
    id: string;
    descricao: string | null;
    credor: string | null;
    valor: number;
    vencimento: string | null;
    pagoEm: string | null;
    situacao: 'ABERTO' | 'BAIXADO';
    exato: boolean;
    difValor: number;
    difDias: number;
}

export type SituacaoDoMovimento = 'CONCILIADO' | 'SUGESTAO' | 'PENDENTE' | 'IGNORADO' | 'TRANSFERENCIA';

export const ROTULO_SITUACAO_DO_MOVIMENTO: Record<SituacaoDoMovimento, string> = {
    CONCILIADO: 'Conciliado', SUGESTAO: 'Tem sugestão', PENDENTE: 'A conciliar', IGNORADO: 'Ignorado', TRANSFERENCIA: 'Transferência',
};

export function situacaoDoMovimento(m: MovimentoDoExtrato): SituacaoDoMovimento {
    if (m.status === 'IGNORED') return 'IGNORADO';
    if (m.status === 'TRANSFER') return 'TRANSFERENCIA';
    if (m.status === 'MATCHED' || m.vinculos.length > 0) return 'CONCILIADO';
    return m.candidatosExatos > 0 ? 'SUGESTAO' : 'PENDENTE';
}

/** `base` = o motivo de não operar (link sem senha, prévia, condomínio sem org própria). */
export function motivoNaoConciliaMovimento(m: MovimentoDoExtrato, base: string | null): string | null {
    if (base) return base;
    const s = situacaoDoMovimento(m);
    if (s === 'CONCILIADO') return 'Este movimento já está conciliado. Desfaça o vínculo antes de trocar o título.';
    if (s === 'IGNORADO') return 'Este movimento está ignorado. Restaure-o antes de conciliar.';
    if (s === 'TRANSFERENCIA') return 'Este movimento é transferência entre contas e só a administradora mexe nele.';
    return null;
}

/** Ignorar e restaurar são o mesmo botão: só o conciliado não pode. */
export function motivoNaoIgnoraMovimento(m: MovimentoDoExtrato, base: string | null): string | null {
    if (base) return base;
    const s = situacaoDoMovimento(m);
    if (s === 'CONCILIADO') return 'Este movimento está conciliado — desfaça o vínculo antes de ignorar.';
    if (s === 'TRANSFERENCIA') return 'Este movimento é transferência entre contas e só a administradora mexe nele.';
    return null;
}

/** Linhas lidas do arquivo (o mesmo `parseStatementFile` do admin) no formato da RPC.
 *  O banco recalcula sentido, ordinal e assinatura — daqui vai o que o arquivo diz. */
export function linhasParaImportar(transacoes: Pick<RawTransaction, 'date' | 'amount' | 'memo' | 'description' | 'fitid' | 'id'>[]) {
    return transacoes.map(t => {
        const texto = (t.memo || t.description || 'Sem descrição').trim();
        return {
            data: t.date,
            valor: t.amount,
            memo: t.memo ?? null,
            descricao: t.description ?? null,
            fitid: t.fitid || t.id || null,
            normalizada: normalizeText(texto),
        };
    });
}

/** Entradas e saídas somam TUDO o que o banco mostra (o ignorado também saiu da
 *  conta — a soma tem de bater com o extrato); ignorar só tira do "a conciliar". */
export function resumoDoExtrato(movimentos: MovimentoDoExtrato[]) {
    let entradas = 0, saidas = 0, conciliados = 0, pendentes = 0, ignorados = 0;
    for (const m of movimentos) {
        const s = situacaoDoMovimento(m);
        if (m.direcao === 'CREDIT') entradas += Number(m.valor) || 0; else saidas += Number(m.valor) || 0;
        if (s === 'IGNORADO') ignorados++;
        else if (s === 'CONCILIADO' || s === 'TRANSFERENCIA') conciliados++;
        else pendentes++;
    }
    return { entradas: Math.round(entradas * 100) / 100, saidas: Math.round(saidas * 100) / 100, conciliados, pendentes, ignorados };
}
