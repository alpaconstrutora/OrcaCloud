import React from 'react';
import {
    ArrowRightLeft, ArrowUpDown, Briefcase, Calendar, Check, CheckCircle2, FileText,
    LayoutGrid, MoveHorizontal, Search, Table2, X,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { formatMoney, formatDateBR } from '../ui/Format';
import { ColumnConfig, useTableColumns, ColumnConfigButton, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { LazySelect, type LazyOption } from './LazySelect';
import type { BankTransaction, InternalTransaction } from '../../types';

/**
 * Aba "Conciliados" da Conciliação Bancária.
 *
 * Terceira aba extraída de `BankReconciliation.tsx` (item 3.4 do plano), depois de Regras
 * e Categorias. A quebra vai uma aba por vez, com conferência visual de cada uma.
 *
 * A ordenação por data e o filtro de fluxo continuam no pai: quem chega aqui já recebe
 * `sortedMatches` pronto. `matchSortOrder` vem junto só para o cabeçalho desenhar a seta e
 * saber para que lado inverter — a aba não decide a ordem, só a exibe. A BUSCA, ao
 * contrário, é desta aba (§5.2: toolbar acoplada à tabela) e só recorta o que já chegou.
 *
 * ⚠️ Como em Regras, o tipo do vínculo é o LOCAL declarado dentro do pai, com
 * `[key: string]: unknown`, e não algum de `types/financial.ts`. Sem repetir a forma
 * inclusive o índice, os handlers do pai deixam de ser atribuíveis às props.
 */

export type VinculoDeConciliacao = {
    id: string;
    bank_transaction_id: string;
    internal_transaction_id: string;
    created_at: string;
    bank_transaction?: BankTransaction | null;
    internal_transaction?: InternalTransaction | null;
    [key: string]: unknown;
};

/** Colunas da lista — o usuário liga/desliga na engrenagem (§5.1). "Ações" não entra na
 *  engrenagem e fica sempre por último. */
export const CONCILIATED_COLUMNS: ColumnConfig[] = [
    { key: 'bankDesc',   label: 'Extrato: descrição' },
    { key: 'bankDate',   label: 'Data do extrato' },
    { key: 'bankAmount', label: 'Valor do extrato' },
    { key: 'link',       label: 'Vínculo' },
    { key: 'intDesc',    label: 'Interno: descrição' },
    { key: 'intDate',    label: 'Data do interno' },
    { key: 'intAmount',  label: 'Valor do interno' },
    { key: 'actions',    label: 'Ações', sortable: false },
];

/** Larguras padrão em px (soma 1126: cabe ao lado da sidebar, em 1440 px de tela). O usuário arrasta a
 *  borda do cabeçalho (duplo clique restaura) ou usa o botão de ajuste ao conteúdo (§6.1). */
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    bankDesc: 230, bankDate: 120, bankAmount: 130, link: 96,
    intDesc: 230, intDate: 120, intAmount: 130, actions: 70,
};

const ALINHAMENTO_CABECALHO: Record<string, string> = {
    bankDesc: '', intDesc: '',
    bankDate: 'text-center', intDate: 'text-center', link: 'text-center', actions: 'text-center',
    bankAmount: 'text-right', intAmount: 'text-right',
};

interface Props {
    /**
     * `matches` é a lista INTEIRA e `sortedMatches` a já filtrada/ordenada pelo pai. As duas
     * são necessárias porque o contador do topo e o estado vazio olham para o total, e a
     * tabela olha para o recorte — era assim no pai, e trocar uma pela outra mudaria o que
     * a tela diz quando há filtro de fluxo ligado.
     */
    matches: VinculoDeConciliacao[];
    sortedMatches: VinculoDeConciliacao[];
    conciliatedViewMode: 'grid' | 'list';
    setConciliatedViewMode: (m: 'grid' | 'list') => void;
    matchSortOrder: 'desc' | 'asc';
    setMatchSortOrder: (o: 'desc' | 'asc') => void;
    categoryOptions: LazyOption[];
    onUndoMatch: (matchId: string, bankTxId: string, internalTxId: string) => void;
    onUpdateBankCategory: (id: string, category: string) => void;
    onUpdateInternalCategory: (id: string, category: string) => void;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function textoDeBusca(m: VinculoDeConciliacao): string {
    const b = m.bank_transaction;
    const i = m.internal_transaction;
    return semAcento([
        b?.description_normalized, b?.description_raw, b?.category, b?.counterparty_name,
        b && formatMoney(b.amount), b?.amount,
        i?.description, i?.category, i?.source_system, i?.entity_name, i?.party_name,
        i && formatMoney(i.amount), i?.amount,
    ].filter(v => v !== undefined && v !== null && v !== '').join(' '));
}

export default function ConciliatedTab({
    matches, sortedMatches, conciliatedViewMode, setConciliatedViewMode,
    matchSortOrder, setMatchSortOrder, categoryOptions,
    onUndoMatch, onUpdateBankCategory, onUpdateInternalCategory,
}: Props) {
    // §3: busca de TELA persiste (a lista é o recorte de trabalho do usuário)
    const [busca, setBusca] = usePersistedState<string>('conciliacaoConciliados:search', '');
    const colunas = useTableColumns(CONCILIATED_COLUMNS, 'conciliacaoConciliadosColumns');

    const visiveis = React.useMemo(() => {
        const termo = semAcento(busca.trim());
        if (!termo) return sortedMatches;
        return sortedMatches.filter(m => textoDeBusca(m).includes(termo));
    }, [sortedMatches, busca]);

    const chavesVisiveis = React.useMemo(() => {
        const meio = colunas.orderedVisibleColumns.filter(k => k !== 'actions');
        return colunas.visibleColumns.includes('actions') ? [...meio, 'actions'] : meio;
    }, [colunas.orderedVisibleColumns, colunas.visibleColumns]);
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'conciliacaoConciliadosColWidths');
    const colunasDeDados = chavesVisiveis.filter(k => k !== 'actions');
    const temAcoes = chavesVisiveis.includes('actions');
    // §6.1: a largura do <table> é a SOMA exata das colunas visíveis (nunca 100%); o
    // `minWidth: 100%` + o <col /> espaçador antes de "Ações" absorvem a folga.
    const larguraTotal = colunasDeDados.reduce((t, k) => t + cols.getWidth(k), 0) + (temAcoes ? cols.getWidth('actions') : 0);

    const cabecalho = (key: string) => {
        if (key === 'bankDate') {
            return (
                <button
                    type="button"
                    onClick={() => setMatchSortOrder(matchSortOrder === 'desc' ? 'asc' : 'desc')}
                    className="inline-flex items-center justify-center gap-1.5 hover:text-blue-600 transition-colors"
                    title={matchSortOrder === 'desc' ? 'Data do extrato: mais recentes primeiro — clique para inverter' : 'Data do extrato: mais antigos primeiro — clique para inverter'}
                >
                    Data <ArrowUpDown className="w-3 h-3" />
                </button>
            );
        }
        // Cabeçalho curto: as duas metades da linha já são separadas por "Extrato:/Interno:".
        // Os nomes completos (Data do extrato…) ficam na engrenagem, onde precisam distinguir.
        const curto: Record<string, string> = { bankDate: 'Data', intDate: 'Data', bankAmount: 'Valor', intAmount: 'Valor' };
        return curto[key] ?? CONCILIATED_COLUMNS.find(c => c.key === key)?.label ?? key;
    };

    const celula = (key: string, m: VinculoDeConciliacao) => {
        const bTx = m.bank_transaction as BankTransaction;
        const iTx = m.internal_transaction as InternalTransaction;
        switch (key) {
            case 'bankDesc':
                return (
                    <>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bTx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <p className="text-sm font-normal text-gray-700 break-words" title={bTx.description_normalized || bTx.description_raw}>
                                {bTx.description_normalized || bTx.description_raw}
                            </p>
                            <LazySelect
                                value={bTx.category || ''}
                                currentLabel={bTx.category || ''}
                                onChange={(v) => onUpdateBankCategory(bTx.id, v)}
                                options={categoryOptions}
                                placeholder="Pendente"
                                className={`text-sm font-normal px-2 py-0.5 rounded border transition-all appearance-none cursor-pointer w-fit ${
                                    bTx.category
                                        ? 'text-gray-900 bg-gray-50 border-gray-100'
                                        : 'text-gray-400 bg-white border-dashed border-gray-200'
                                }`}
                            />
                        </div>
                    </>
                );
            case 'bankDate':
                return (
                    <>
                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-normal text-gray-600 leading-none">{formatDateBR(bTx.transaction_date)}</span>
                    </>
                );
            case 'bankAmount':
                return (
                    <p className={`text-sm font-medium ${bTx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatMoney(bTx.amount)}
                    </p>
                );
            case 'link':
                return (
                    <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-sm">
                        <Check className="w-4 h-4" />
                    </div>
                );
            case 'intDesc':
                return (
                    <>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iTx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Briefcase className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <p className="text-sm font-normal text-gray-700 break-words">{iTx.description}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-normal text-gray-400 shrink-0">{iTx.source_system}</span>
                                <LazySelect
                                    value={iTx.category || ''}
                                    currentLabel={iTx.category || ''}
                                    onChange={(v) => onUpdateInternalCategory(iTx.id, v)}
                                    options={categoryOptions}
                                    placeholder="Pendente"
                                    className={`text-sm font-normal px-2 py-0.5 rounded border transition-all appearance-none cursor-pointer w-fit ${
                                        iTx.category
                                            ? 'text-gray-900 bg-gray-50 border-gray-100'
                                            : 'text-gray-400 bg-white border-dashed border-gray-200'
                                    }`}
                                />
                            </div>
                        </div>
                    </>
                );
            case 'intDate':
                return (
                    <>
                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-normal text-gray-600 leading-none">{formatDateBR(iTx.transaction_date)}</span>
                    </>
                );
            case 'intAmount':
                return (
                    <>
                        <p className="text-sm font-medium text-gray-800">{formatMoney(iTx.amount)}</p>
                        <span className="text-xs font-normal text-emerald-600">Vinculado</span>
                    </>
                );
            case 'actions':
                return (
                    <ActionIconButton
                        kind="edit"
                        tone="attention"
                        title="Desfazer vínculo"
                        icon={<ArrowRightLeft className="w-4 h-4" />}
                        onClick={() => onUndoMatch(m.id, bTx.id, iTx.id)}
                    />
                );
            default:
                return null;
        }
    };

    /** Layout de cada célula (alinhamento e direção) — o conteúdo vem de `celula`. */
    const layoutCelula = (key: string) => {
        if (key === 'bankDesc' || key === 'intDesc') return 'flex items-center gap-4 min-w-0';
        if (key === 'bankAmount') return 'flex items-center justify-end';
        if (key === 'intAmount') return 'flex flex-col items-end justify-center';
        return 'flex items-center justify-center gap-2';
    };

    return (
        <div className="min-h-[500px]">
            {/* §5.2 — toolbar e conteúdo dividem UM card; a única linha entre eles é o border-b da toolbar */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por descrição, categoria, origem ou valor..."
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                className="w-full h-9 pl-9 pr-9 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                            {busca && (
                                <button
                                    onClick={() => setBusca('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Limpar busca"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <span className="text-sm font-semibold text-emerald-600 whitespace-nowrap shrink-0">
                            {busca.trim() && visiveis.length !== sortedMatches.length
                                ? `${visiveis.length} de ${matches.length} vínculos`
                                : `${matches.length} ${matches.length === 1 ? 'vínculo' : 'vínculos'}`}
                        </span>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0" />

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            {conciliatedViewMode === 'list' && (
                                <>
                                    <ColumnConfigButton
                                        columns={CONCILIATED_COLUMNS.filter(c => c.key !== 'actions')}
                                        visibleColumns={colunas.visibleColumns}
                                        showColumnConfig={colunas.showColumnConfig}
                                        onToggleShow={() => colunas.setShowColumnConfig(!colunas.showColumnConfig)}
                                        onToggleColumn={colunas.toggleColumn}
                                        onReset={colunas.resetColumns}
                                    />
                                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                        Duplo clique no divisor segue "restaurar padrão". */}
                                    <button
                                        onClick={() => cols.autoFit()}
                                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                        title="Ajustar largura das colunas ao conteúdo"
                                    >
                                        <MoveHorizontal className="w-4 h-4" />
                                    </button>
                                    <div className="w-px h-5 bg-gray-200 mx-0.5" />
                                </>
                            )}
                            <button
                                onClick={() => setConciliatedViewMode('grid')}
                                className={`p-1.5 rounded-[6px] transition-all ${conciliatedViewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em Grade"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setConciliatedViewMode('list')}
                                className={`p-1.5 rounded-[6px] transition-all ${conciliatedViewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em Lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {matches.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma conciliação</h3>
                        <p className="text-sm text-gray-500">Os vínculos efetuados aparecerão aqui.</p>
                    </div>
                ) : visiveis.length === 0 ? (
                    <div className="text-center py-12">
                        <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum vínculo encontrado</h3>
                        <p className="text-sm text-gray-500">Tente ajustar a busca ou o filtro de fluxo.</p>
                    </div>
                ) : conciliatedViewMode === 'list' ? (
                    <div className="overflow-auto max-h-[70vh]">
                        <table
                            ref={cols.tableRef}
                            className="text-left border-collapse"
                            style={{ tableLayout: 'fixed', width: larguraTotal, minWidth: '100%' }}
                        >
                            <colgroup>
                                {colunasDeDados.map(k => (
                                    <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio */}
                                <col />
                                {temAcoes && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {colunasDeDados.map(k => (
                                        <th key={k} className={`relative overflow-hidden px-6 py-2 whitespace-nowrap border-r border-gray-100 font-semibold ${ALINHAMENTO_CABECALHO[k] ?? ''}`}>
                                            {cabecalho(k)}
                                            <cols.ResizeHandle colKey={k} />
                                        </th>
                                    ))}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {temAcoes && (
                                        <th className={`relative overflow-hidden px-6 py-2 whitespace-nowrap font-semibold ${ALINHAMENTO_CABECALHO.actions}`}>
                                            {cabecalho('actions')}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {visiveis.map(m => {
                                    if (!m.bank_transaction || !m.internal_transaction) return null;
                                    return (
                                        <tr key={m.id} className="hover:bg-gray-50 transition-all group">
                                            {colunasDeDados.map(k => (
                                                <td key={k} className="px-6 py-2.5 border-r border-gray-100 align-middle">
                                                    <div className={layoutCelula(k)}>{celula(k, m)}</div>
                                                </td>
                                            ))}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            {temAcoes && (
                                                <td className="px-6 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                    <div className={layoutCelula('actions')}>{celula('actions', m)}</div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 lg:p-6">
                        {visiveis.map(m => {
                            const bTx = m.bank_transaction;
                            const iTx = m.internal_transaction;
                            if (!bTx || !iTx) return null;

                            return (
                                <div key={m.id} className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm relative group overflow-hidden hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bTx.direction === 'DEBIT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex flex-col gap-1">
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none">Extrato Bancário</p>
                                                <p className="text-xs font-bold text-gray-900 truncate max-w-[150px] mb-1">{bTx.description_normalized || bTx.description_raw}</p>
                                                <LazySelect
                                                    value={bTx.category || ''}
                                                    currentLabel={bTx.category || ''}
                                                    onChange={(v) => onUpdateBankCategory(bTx.id, v)}
                                                    options={categoryOptions}
                                                    placeholder="Pendente"
                                                    className={`text-sm font-normal px-2 py-0.5 rounded border transition-all appearance-none cursor-pointer w-fit ${
                                                        bTx.category
                                                            ? 'text-gray-900 bg-gray-50 border-gray-100'
                                                            : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                    }`}
                                                />
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-xs font-black ${bTx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatMoney(bTx.amount)}
                                            </p>
                                            <span className="text-[8px] font-black text-gray-400">{formatDateBR(bTx.transaction_date)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center py-2 relative">
                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-emerald-100" />
                                        <div className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-sm relative z-10 border border-emerald-100">
                                            <Check className="w-3 h-3" />
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end mt-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iTx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                <Briefcase className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex flex-col gap-1">
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none">Sistema Interno</p>
                                                <p className="text-xs font-bold text-gray-900 truncate max-w-[150px] mb-1">{iTx.description}</p>
                                                <LazySelect
                                                    value={iTx.category || ''}
                                                    currentLabel={iTx.category || ''}
                                                    onChange={(v) => onUpdateInternalCategory(iTx.id, v)}
                                                    options={categoryOptions}
                                                    placeholder="Pendente"
                                                    className={`text-sm font-normal px-2 py-0.5 rounded border transition-all appearance-none cursor-pointer w-fit ${
                                                        iTx.category
                                                            ? 'text-gray-900 bg-gray-50 border-gray-100'
                                                            : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                    }`}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="text-right">
                                                <p className="text-xs font-black text-gray-900">{formatMoney(iTx.amount)}</p>
                                                <span className="text-[8px] font-black text-emerald-600">{iTx.source_system}</span>
                                            </div>
                                            <button
                                                onClick={() => onUndoMatch(m.id, bTx.id, iTx.id)}
                                                className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Desfazer Vínculo"
                                            >
                                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
