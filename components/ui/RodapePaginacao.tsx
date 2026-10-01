import React, { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from './TableUtils';

/**
 * Paginação em memória (guia §6.7): o carregamento traz o recorte inteiro e a tela só
 * DESENHA uma página. Nasceu na aba Pendentes da Conciliação (01/10/2026), que desenhava
 * os ~5.700 extratos de uma vez: ~40 s de navegador ocupado e ~860 MB na página, e
 * requisições em voo estouravam o corte de 20 s do cliente.
 *
 * O mesmo rodapé já existia copiado no Extrato (BankReconciliation) e no StandardTable;
 * telas novas usam este. Regras do §6.7 que ele cumpre: tamanho da página persiste
 * (`storageKey`), página atual não; qualquer mudança de recorte (`resetKeys`) volta
 * para a 1; se o recorte encolher, cai na última página válida.
 */
export function usePaginacaoEmMemoria<T>(
    rows: T[],
    storageKey: string,
    resetKeys: unknown[],
    defaultPageSize = 100,
) {
    const [pageSize, setPageSize] = usePersistedState<number>(storageKey, defaultPageSize);
    const [page, setPage] = useState(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setPage(1); }, resetKeys);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const pageRows = useMemo(() => rows.slice(pageStart, pageStart + pageSize), [rows, pageStart, pageSize]);
    return { pageRows, total: rows.length, pageSize, setPageSize, page: currentPage, setPage, totalPages, pageStart };
}

interface Props {
    total: number;
    pageStart: number;
    pageSize: number;
    setPageSize: (n: number) => void;
    page: number;
    setPage: (fn: (p: number) => number) => void;
    totalPages: number;
    /** "lançamentos", "extratos"… — aparece no title do seletor de tamanho. */
    rotulo?: string;
    pageSizes?: number[];
    /** Rodapé dentro de coluna estreita: empilha os dois grupos em vez de espremer. */
    compacto?: boolean;
}

/** Rodapé §6.7 — "1–100 de 4.312" + tamanho à esquerda; Anterior · Página X de Y · Próxima à direita. */
export function RodapePaginacao({
    total, pageStart, pageSize, setPageSize, page, setPage, totalPages,
    rotulo = 'linhas', pageSizes = [50, 100, 200, 500], compacto = false,
}: Props) {
    if (total === 0) return null;
    const botao = 'h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all';
    return (
        <div className={`flex ${compacto ? 'flex-col items-stretch gap-2' : 'items-center justify-between gap-4'} px-6 py-3 border-t border-gray-100 text-sm text-gray-500`}>
            <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">
                    {`${(pageStart + 1).toLocaleString('pt-BR')}–${Math.min(pageStart + pageSize, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
                </span>
                <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(() => 1); }}
                    className="h-8 px-2 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600"
                    title={`${rotulo[0].toUpperCase()}${rotulo.slice(1)} por página`}
                >
                    {pageSizes.map(n => <option key={n} value={n}>{n} por página</option>)}
                </select>
            </div>
            <div className={`flex items-center gap-2 ${compacto ? 'justify-between' : ''}`}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={botao}>Anterior</button>
                <span className="whitespace-nowrap">Página {page} de {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={botao}>Próxima</button>
            </div>
        </div>
    );
}

export default RodapePaginacao;
