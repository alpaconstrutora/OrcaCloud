import React from 'react';
import {
    ArrowRightLeft, ArrowUpDown, Briefcase, Calendar, Check, CheckCircle2, FileText,
    LayoutGrid, List,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { formatMoney, formatDateBR } from '../ui/Format';
import { LazySelect, type LazyOption } from './LazySelect';
import type { BankTransaction, InternalTransaction } from '../../types';

/**
 * Aba "Conciliados" da Conciliação Bancária.
 *
 * Terceira aba extraída de `BankReconciliation.tsx` (item 3.4 do plano), depois de Regras
 * e Categorias. A quebra vai uma aba por vez, com conferência visual de cada uma.
 *
 * A ordenação e o filtro de fluxo continuam no pai: quem chega aqui já recebe
 * `sortedMatches` pronto. `matchSortOrder` vem junto só para o cabeçalho desenhar a seta e
 * saber para que lado inverter — a aba não decide a ordem, só a exibe.
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

export default function ConciliatedTab({
    matches, sortedMatches, conciliatedViewMode, setConciliatedViewMode,
    matchSortOrder, setMatchSortOrder, categoryOptions,
    onUndoMatch, onUpdateBankCategory, onUpdateInternalCategory,
}: Props) {
    return (
        <div className="space-y-4 min-h-[500px]">
            <div className="flex justify-between items-center px-4">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Transações Conciliadas
                </h4>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => setConciliatedViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${conciliatedViewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Linha"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setConciliatedViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${conciliatedViewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Visualização em Grade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600">{matches.length} Vínculos</span>
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                {matches.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center py-32">
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-200 rounded-3xl flex items-center justify-center mb-6">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <h5 className="text-sm font-black text-gray-400 uppercase mb-2">Nenhuma conciliação</h5>
                        <p className="text-xs text-gray-400 max-w-[200px]">Os vínculos efetuados aparecerão aqui.</p>
                    </div>
                ) : conciliatedViewMode === 'list' ? (
                    <div className="overflow-auto max-h-[70vh]">
                        <div className="grid grid-cols-[1fr_120px_140px_60px_1fr_120px_140px_80px] sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 items-center">
                            <div className="px-6 py-2 border-r border-gray-100">Extrato: descrição</div>
                            <div
                                className="flex items-center justify-center gap-1.5 px-6 py-2 border-r border-gray-100 cursor-pointer hover:text-blue-600 transition-colors"
                                onClick={() => setMatchSortOrder(matchSortOrder === 'desc' ? 'asc' : 'desc')}
                            >
                                Data <ArrowUpDown className="w-3 h-3" />
                            </div>
                            <div className="px-6 py-2 border-r border-gray-100 text-right">Valor</div>
                            <div className="px-6 py-2 border-r border-gray-100 text-center">Vínculo</div>
                            <div className="px-6 py-2 border-r border-gray-100">Interno: descrição</div>
                            <div className="px-6 py-2 border-r border-gray-100 text-center">Data</div>
                            <div className="px-6 py-2 border-r border-gray-100 text-right">Valor</div>
                            <div className="px-6 py-2 text-center">Ações</div>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {sortedMatches.map(m => {
                                const bTx = m.bank_transaction;
                                const iTx = m.internal_transaction;
                                if (!bTx || !iTx) return null;

                                return (
                                    <div key={m.id} className="grid grid-cols-[1fr_120px_140px_60px_1fr_120px_140px_80px] hover:bg-gray-50 transition-all group items-stretch">
                                        {/* Bank Description */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center gap-4 min-w-0">
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
                                        </div>

                                        {/* Bank Date */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center justify-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-sm font-normal text-gray-600 leading-none">
                                                {formatDateBR(bTx.transaction_date)}
                                            </span>
                                        </div>

                                        {/* Bank Amount */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center justify-end">
                                            <p className={`text-sm font-medium ${bTx.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatMoney(bTx.amount)}
                                            </p>
                                        </div>

                                        {/* Central Interaction */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center justify-center">
                                            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-sm">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        </div>

                                        {/* Internal Description */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center gap-4 min-w-0">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iTx.direction === 'DEBIT' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                <Briefcase className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                <p className="text-sm font-normal text-gray-700 break-words">
                                                    {iTx.description}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-normal text-gray-400 shrink-0">
                                                        {iTx.source_system}
                                                    </span>
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
                                        </div>

                                        {/* Internal Date */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex items-center justify-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-sm font-normal text-gray-600 leading-none">
                                                {formatDateBR(iTx.transaction_date)}
                                            </span>
                                        </div>

                                        {/* Internal Amount */}
                                        <div className="px-6 py-2.5 border-r border-gray-100 flex flex-col items-end justify-center">
                                            <p className="text-sm font-medium text-gray-800">
                                                {formatMoney(iTx.amount)}
                                            </p>
                                            <span className="text-xs font-normal text-emerald-600">Vinculado</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="px-6 py-2.5 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                            <ActionIconButton
                                                kind="edit"
                                                tone="attention"
                                                title="Desfazer vínculo"
                                                icon={<ArrowRightLeft className="w-4 h-4" />}
                                                onClick={() => onUndoMatch(m.id, bTx.id, iTx.id)}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 lg:p-6">
                        {sortedMatches.map(m => {
                            const bTx = m.bank_transaction;
                            const iTx = m.internal_transaction;
                            if (!bTx || !iTx) return null;

                            return (
                                    <div key={m.id} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden hover:shadow-md transition-all">
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
                                                    <p className="text-xs font-black text-gray-900">
                                                        {formatMoney(iTx.amount)}
                                                    </p>
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
