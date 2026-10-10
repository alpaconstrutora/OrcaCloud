/**
 * Números do contrato vinculado ao documento (F6 — campos calculados e tabelas
 * dinâmicas). PURO: tipos e totais. Quem lê do banco é
 * `resolverContexto.carregarFinanceiroContrato` (cache de 1 minuto).
 *
 * Parcelas: `internal_transactions` do contrato (PENDING = em aberto,
 * CONCILIATED = quitada; CANCELLED fica de fora). Medições:
 * `contract_measurements` do contrato.
 */
export interface ParcelaContrato {
    vencimento: string | null;
    descricao: string;
    valor: number;
    quitada: boolean;
}

export interface MedicaoContrato {
    numero: string;
    inicio: string | null;
    fim: string | null;
    data: string | null;
    situacao: string;
    valor: number;
}

export interface FinanceiroContrato {
    parcelas: ParcelaContrato[];
    medicoes: MedicaoContrato[];
}

// ─── Totais (puros) ──────────────────────────────────────────────────────────

const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

export const valorPago = (f: FinanceiroContrato) => soma(f.parcelas.filter(p => p.quitada).map(p => p.valor));
export const valorEmAberto = (f: FinanceiroContrato) => soma(f.parcelas.filter(p => !p.quitada).map(p => p.valor));
/** Medições aprovadas/pagas — "Pendente", "Rejeitada" e "Rascunho" não contam como medido. */
export const valorMedido = (f: FinanceiroContrato) =>
    soma(f.medicoes.filter(m => !/pendente|rejeit|rascunho|cancel/i.test(m.situacao)).map(m => m.valor));
