import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Split, Check, RefreshCw, Landmark, FileText, Building2 } from 'lucide-react';
import { reconciliationGroupService } from '../services/reconciliationGroupService';
import type { GroupSuggestions } from '../services/reconciliationGroupService';
import { useToast } from '../hooks/useToast';

function formatBRL(v?: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDate(d?: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
}
function partyOf(t: { entity_name?: string; party_name?: string; direction?: string }): { label: string; name: string } | null {
    const name = t.entity_name || t.party_name;
    if (!name) return null;
    return { label: t.direction === 'CREDIT' ? 'Cliente' : 'Fornecedor', name };
}

interface GroupMatchPanelProps {
    organizationId: string;
    selectedAccountId: string | null;
    onReload: () => Promise<void> | void;
}

const GroupMatchPanel: React.FC<GroupMatchPanelProps> = ({ organizationId, selectedAccountId, onReload }) => {
    const { showToast } = useToast();
    const [data, setData] = useState<GroupSuggestions | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!organizationId || !selectedAccountId) { setData(null); return; }
        setLoading(true);
        try {
            setData(await reconciliationGroupService.findGroups(selectedAccountId, organizationId));
        } catch (e) {
            console.error('[GroupMatchPanel]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, selectedAccountId]);

    useEffect(() => { load(); }, [load]);

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try {
            await fn();
            showToast('Conciliação agrupada aplicada', 'success');
            await load();
            await onReload();
        } catch (e) {
            console.error('[GroupMatchPanel] confirm', e);
            showToast('Erro ao conciliar grupo', 'error');
        } finally {
            setBusy(null);
        }
    };

    const total = (data?.bankToTitles.length ?? 0) + (data?.titleToBanks.length ?? 0);
    if (!selectedAccountId) return null;

    return (
        <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Agrupamentos sugeridos
                    {total > 0 && <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{total}</span>}
                </h4>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 disabled:opacity-50"
                    title="Recalcular"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {total === 0 && !loading && (
                <p className="px-1 text-[11px] text-gray-400 font-medium">Nenhum agrupamento provável encontrado.</p>
            )}

            {/* 1 pagamento → N títulos */}
            {(data?.bankToTitles ?? []).map((g, i) => (
                <div key={`b2t-${g.bank.id}-${i}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50/40 border-b border-gray-50">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Um pagamento liquida vários títulos</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1"><Landmark className="w-3.5 h-3.5" /> Extrato</div>
                            <p className="text-sm font-bold text-gray-800 truncate">{g.bank.description_normalized || g.bank.description_raw}</p>
                            {g.bank.counterparty_name && (
                                <p className="text-[11px] font-bold text-gray-600 flex items-center gap-1 mt-0.5" title={g.bank.counterparty_name}>
                                    <Building2 className="w-3 h-3 flex-shrink-0" /><span className="truncate">{g.bank.direction === 'CREDIT' ? 'Pagador' : 'Favorecido'}: {g.bank.counterparty_name}</span>
                                </p>
                            )}
                            <p className="text-[11px] text-gray-400 font-medium">{formatDate(g.bank.transaction_date)}</p>
                            <p className={`text-base font-black tabular-nums mt-1 ${g.bank.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>{formatBRL(g.bank.amount)}</p>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1"><FileText className="w-3.5 h-3.5" /> {g.titles.length} títulos · soma {formatBRL(g.total)}{Math.abs(g.diff) > 0.01 && <span className="text-amber-500"> (dif {formatBRL(Math.abs(g.diff))})</span>}</div>
                            <div className="space-y-1.5">
                                {g.titles.map(t => (
                                    <div key={t.id} className="flex items-start justify-between text-sm gap-2">
                                        <div className="min-w-0">
                                            <p className="text-gray-700 truncate">{t.description || t.entity_name || t.party_name || 'Título'}</p>
                                            <p className="text-[10px] text-gray-400 truncate">
                                                {partyOf(t) ? <span className="text-indigo-500 font-bold">{partyOf(t)!.label}: {partyOf(t)!.name} · </span> : ''}
                                                {formatDate(t.due_date || t.transaction_date)}
                                            </p>
                                        </div>
                                        <span className="tabular-nums font-bold text-gray-900 flex-shrink-0">{formatBRL(t.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end px-4 py-2.5 border-t border-gray-50 bg-gray-50/40">
                        <button
                            onClick={() => run(`b2t-${g.bank.id}-${i}`, () => reconciliationGroupService.confirmBankToTitles(g.bank.id, g.titles.map(t => t.id)))}
                            disabled={busy === `b2t-${g.bank.id}-${i}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Check className="w-3.5 h-3.5" /> Conciliar grupo
                        </button>
                    </div>
                </div>
            ))}

            {/* 1 título → N pagamentos */}
            {(data?.titleToBanks ?? []).map((g, i) => (
                <div key={`t2b-${g.title.id}-${i}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50/40 border-b border-gray-50">
                        <Split className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Vários pagamentos liquidam um título</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1"><FileText className="w-3.5 h-3.5" /> Título</div>
                            <p className="text-sm font-bold text-gray-800 truncate">{g.title.description || g.title.entity_name || g.title.party_name || 'Título'}</p>
                            {partyOf(g.title) && (
                                <p className="text-[11px] font-bold text-indigo-600 flex items-center gap-1 mt-0.5" title={partyOf(g.title)!.name}>
                                    <Building2 className="w-3 h-3 flex-shrink-0" /><span className="truncate">{partyOf(g.title)!.label}: {partyOf(g.title)!.name}</span>
                                </p>
                            )}
                            <p className="text-[11px] text-gray-400 font-medium">venc. {formatDate(g.title.due_date || g.title.transaction_date)}</p>
                            <p className="text-base font-black tabular-nums mt-1 text-gray-900">{formatBRL(g.title.amount)}</p>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1"><Landmark className="w-3.5 h-3.5" /> {g.banks.length} pagamentos · soma {formatBRL(g.total)}{Math.abs(g.diff) > 0.01 && <span className="text-amber-500"> (dif {formatBRL(Math.abs(g.diff))})</span>}</div>
                            <div className="space-y-1.5">
                                {g.banks.map(b => (
                                    <div key={b.id} className="flex items-start justify-between text-sm gap-2">
                                        <div className="min-w-0">
                                            <p className="text-gray-700 truncate">{b.description_normalized || b.description_raw}</p>
                                            <p className="text-[10px] text-gray-400 truncate">
                                                {b.counterparty_name ? <span className="text-gray-600 font-bold">{b.direction === 'CREDIT' ? 'Pagador' : 'Favorecido'}: {b.counterparty_name} · </span> : ''}
                                                {formatDate(b.transaction_date)}
                                            </p>
                                        </div>
                                        <span className="tabular-nums font-bold text-gray-900 flex-shrink-0">{formatBRL(b.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end px-4 py-2.5 border-t border-gray-50 bg-gray-50/40">
                        <button
                            onClick={() => run(`t2b-${g.title.id}-${i}`, () => reconciliationGroupService.confirmTitleToBanks(g.title.id, g.banks.map(b => b.id)))}
                            disabled={busy === `t2b-${g.title.id}-${i}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-black hover:bg-purple-700 disabled:opacity-50"
                        >
                            <Check className="w-3.5 h-3.5" /> Conciliar grupo
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GroupMatchPanel;
