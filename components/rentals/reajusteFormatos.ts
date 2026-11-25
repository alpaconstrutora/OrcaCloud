import type { RegistroDeReajuste } from '../../services/reajusteLocacaoService';

/** Formatos da aba Locações › Reajustes (fila e histórico). */

export const ROTULO_DECISAO: Record<RegistroDeReajuste['decisao'], string> = {
    INDICE: '100% do índice',
    PERCENTUAL: 'Percentual informado',
    VALOR: 'Valor informado',
    NAO_APLICADO: 'Não reajustado',
};

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
export const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
/** Data e hora locais de um timestamp (quando a decisão foi gravada). */
export const fmtDataHora = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtCur = (n?: number | null) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
