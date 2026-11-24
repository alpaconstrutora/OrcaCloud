import React from 'react';
import { trocaPelaMaisAntiga, type PosicaoNaSerie } from '../../utils/sequenciaParcelas';
import { formatDateBR as formatDate } from '../ui/Format';

/**
 * Coluna "Sequência sugerida" — posição da parcela na série do contrato ("Parcela 05 de 30").
 * Usada na Central (sugestões) e na Pendentes (Lançamentos Internos); a numeração vem de
 * `posicoesNasSeries` (utils/sequenciaParcelas), a mesma do card "Sequência de parcelas".
 */

/** "05" — com tantos dígitos quanto o total (mínimo 2). */
export const doisDigitos = (n: number, total: number) => String(n).padStart(Math.max(2, String(total).length), '0');

export const textoDaSequencia = (p?: PosicaoNaSerie) => (p ? `Parcela ${doisDigitos(p.numero, p.total)} de ${doisDigitos(p.total, p.total)}` : '');

/** Chave de ordenação: agrupa por contrato, na ordem da série. Sem posição = '' (quem chama decide o lugar). */
export const chaveDaSequencia = (p?: PosicaoNaSerie) => (p ? `${p.numeroContrato || p.contractId}#${String(p.numero).padStart(5, '0')}` : '');

export const avisoDeOrdem = (p?: PosicaoNaSerie) => {
    if (!p || p.abertasAntes.length === 0) return '';
    const ns = p.abertasAntes.map(n => doisDigitos(n, p.total));
    return ns.length === 1 ? `${ns[0]} em aberto` : `${ns.length} anteriores em aberto`;
};

/** Texto do `title`; `dica` completa a frase do aviso com o que fazer naquela tela. */
export const explicacaoDaOrdem = (p?: PosicaoNaSerie, dica = '') => {
    if (!p) return undefined;
    const base = `Contrato ${p.numeroContrato || '—'}: parcela ${p.numero} de ${p.total}.`;
    if (p.abertasAntes.length === 0) return `${base} Nenhuma parcela anterior em aberto.`;
    return `${base} Anteriores ainda em aberto: ${p.abertasAntes.map(n => doisDigitos(n, p.total)).join(', ')}. `
        + `Quem paga atrasado costuma quitar a mais antiga primeiro — confira se o movimento não é dela${dica ? ` ${dica}` : ''}.`;
};

/**
 * Célula: texto §8, aviso âmbar quando há parcela anterior em aberto. Com `onUsar` e a mais
 * antiga em aberto de MESMO valor (`trocaPelaMaisAntiga`), o aviso vira o botão "usar a NN"
 * (pedido de 24/11/2026) — só na Central, onde há um movimento sugerido para trocar.
 */
export function CelulaSequencia({ p, onUsar, ocupado, dica, vazio = 'O lançamento não é parcela de contrato' }: {
    p?: PosicaoNaSerie;
    onUsar?: (antiga: NonNullable<PosicaoNaSerie['maisAntigaAberta']>) => void;
    ocupado?: boolean;
    dica?: string;
    /** `title` do "—" (sem posição). */
    vazio?: string;
}) {
    if (!p) return <span className="text-sm font-normal text-gray-500" title={vazio}>—</span>;
    const aviso = avisoDeOrdem(p);
    const antiga = onUsar ? trocaPelaMaisAntiga(p) : null;
    return (
        <span className="block truncate text-sm font-normal text-gray-800 tabular-nums" title={explicacaoDaOrdem(p, dica)}>
            {textoDaSequencia(p)}
            {antiga ? (
                <>
                    {' · '}
                    <button
                        type="button"
                        onClick={() => onUsar!(antiga)}
                        disabled={ocupado}
                        title={ocupado
                            ? 'Aguarde a conciliação em andamento'
                            : `Conciliar este movimento com a parcela ${doisDigitos(antiga.numero, p.total)} (venc. ${formatDate(antiga.due_date)}), a mais antiga em aberto — mesmo valor da ${doisDigitos(p.numero, p.total)}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                        usar a {doisDigitos(antiga.numero, p.total)}
                    </button>
                </>
            ) : aviso && <span className="text-amber-800"> · {aviso}</span>}
        </span>
    );
}
