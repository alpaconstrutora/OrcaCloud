import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Split, Check, RefreshCw, Landmark, FileText, Building2, Loader2 } from 'lucide-react';
import { reconciliationGroupService } from '../services/reconciliationGroupService';
import { bankReconciliationService } from '../services/bankReconciliationService';
import type { GroupSuggestions } from '../services/reconciliationGroupService';
import { useToast } from '../hooks/useToast';
import { formatMoney as formatBRL, formatDateBR as formatDate } from './ui/Format';
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

    const [erro, setErro] = useState<string | null>(null);

    // A organização é a da CONTA. Antes: `if (!organizationId) return` — com o topo
    // em "Todas" a prop vem vazia e o painel sumia sem aviso (REGRA #5). E o erro de
    // carga ia só para o console; agora aparece no painel.
    const load = useCallback(async () => {
        if (!selectedAccountId) { setData(null); return; }
        setLoading(true);
        setErro(null);
        try {
            const org = await bankReconciliationService.resolverOrganizacaoDaConta(selectedAccountId, organizationId);
            if (!org) throw new Error('Não foi possível identificar a organização desta conta bancária.');
            setData(await reconciliationGroupService.findGroups(selectedAccountId, org));
        } catch (e) {
            console.error('[GroupMatchPanel]', e);
            setData(null);
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
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
            const err = e as { message?: string; code?: string };
            showToast(`Erro ao conciliar o grupo: ${err?.message ?? String(e)}${err?.code ? ` (${err.code})` : ''}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const total = (data?.bankToTitles.length ?? 0) + (data?.titleToBanks.length ?? 0);
    if (!selectedAccountId) return null;

    const label = 'text-xs font-semibold text-slate-500';
    const botao = 'flex items-center gap-1 h-8 px-3 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50';

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            {/* Título de seção — mesmo vocabulário de "Regras sugeridas" (§21/§30) */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <Layers className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Agrupamentos sugeridos</h3>
                <span className="text-sm text-gray-500">
                    · {loading ? 'calculando…' : total === 0 ? 'nenhum agrupamento provável' : `${total} ${total === 1 ? 'grupo' : 'grupos'}`}
                </span>
                <button
                    onClick={load}
                    disabled={loading}
                    className="ml-auto h-8 w-8 flex items-center justify-center rounded-[6px] text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-50"
                    title="Recalcular"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {erro && (
                <p className="px-4 py-3 text-sm text-red-600 border-b border-gray-100">Não foi possível calcular os agrupamentos: {erro}</p>
            )}

            {total > 0 && (
                <div className="p-4 space-y-3 bg-gray-50/40">
                    {/* 1 pagamento → N títulos */}
                    {(data?.bankToTitles ?? []).map((g, i) => {
                        const chave = `b2t-${g.bank.id}-${i}`;
                        return (
                            <div key={chave} className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                <p className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 text-sm font-medium text-gray-700">
                                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                    Um pagamento liquida vários títulos
                                </p>
                                <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-x-6 gap-y-4">
                                    <div className="min-w-0">
                                        <p className={`${label} flex items-center gap-1.5 mb-1`}><Landmark className="w-3.5 h-3.5" /> Extrato</p>
                                        <p className="text-sm font-medium text-gray-900 truncate" title={g.bank.description_normalized || g.bank.description_raw}>{g.bank.description_normalized || g.bank.description_raw}</p>
                                        {g.bank.counterparty_name && (
                                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5" title={g.bank.counterparty_name}>
                                                <Building2 className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{g.bank.direction === 'CREDIT' ? 'Pagador' : 'Favorecido'}: {g.bank.counterparty_name}</span>
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-500 mt-0.5">{formatDate(g.bank.transaction_date)}</p>
                                        <p className={`text-sm font-semibold tabular-nums mt-1 ${g.bank.direction === 'CREDIT' ? 'text-emerald-700' : 'text-red-600'}`}>{formatBRL(g.bank.amount)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`${label} flex items-center gap-1.5 mb-1`}>
                                            <FileText className="w-3.5 h-3.5" /> {g.titles.length} títulos · soma {formatBRL(g.total)}
                                            {Math.abs(g.diff) > 0.01 && <span className="text-amber-700"> (diferença {formatBRL(Math.abs(g.diff))})</span>}
                                        </p>
                                        <div className="space-y-1.5">
                                            {g.titles.map(t => (
                                                <div key={t.id} className="flex items-start justify-between text-sm gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-gray-900 truncate" title={t.description || t.entity_name || t.party_name || 'Título'}>{t.description || t.entity_name || t.party_name || 'Título'}</p>
                                                        <p className="text-xs text-gray-500 truncate">
                                                            {partyOf(t) ? <span className="text-indigo-700">{partyOf(t)!.label}: {partyOf(t)!.name} · </span> : ''}
                                                            {formatDate(t.due_date || t.transaction_date)}
                                                        </p>
                                                    </div>
                                                    <span className="tabular-nums font-medium text-gray-900 flex-shrink-0">{formatBRL(t.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end px-4 py-2 border-t border-gray-100">
                                    <button
                                        onClick={() => run(chave, () => reconciliationGroupService.confirmBankToTitles(g.bank.id, g.titles.map(t => t.id)))}
                                        disabled={busy === chave}
                                        className={botao}
                                    >
                                        {busy === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conciliar grupo
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* 1 título → N pagamentos */}
                    {(data?.titleToBanks ?? []).map((g, i) => {
                        const chave = `t2b-${g.title.id}-${i}`;
                        return (
                            <div key={chave} className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                <p className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 text-sm font-medium text-gray-700">
                                    <Split className="w-3.5 h-3.5 text-purple-500" />
                                    Vários pagamentos liquidam um título
                                </p>
                                <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-x-6 gap-y-4">
                                    <div className="min-w-0">
                                        <p className={`${label} flex items-center gap-1.5 mb-1`}><FileText className="w-3.5 h-3.5" /> Título</p>
                                        <p className="text-sm font-medium text-gray-900 truncate" title={g.title.description || g.title.entity_name || g.title.party_name || 'Título'}>{g.title.description || g.title.entity_name || g.title.party_name || 'Título'}</p>
                                        {partyOf(g.title) && (
                                            <p className="text-sm text-indigo-700 flex items-center gap-1 mt-0.5" title={partyOf(g.title)!.name}>
                                                <Building2 className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{partyOf(g.title)!.label}: {partyOf(g.title)!.name}</span>
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-500 mt-0.5">venc. {formatDate(g.title.due_date || g.title.transaction_date)}</p>
                                        <p className="text-sm font-semibold tabular-nums mt-1 text-gray-900">{formatBRL(g.title.amount)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`${label} flex items-center gap-1.5 mb-1`}>
                                            <Landmark className="w-3.5 h-3.5" /> {g.banks.length} pagamentos · soma {formatBRL(g.total)}
                                            {Math.abs(g.diff) > 0.01 && <span className="text-amber-700"> (diferença {formatBRL(Math.abs(g.diff))})</span>}
                                        </p>
                                        <div className="space-y-1.5">
                                            {g.banks.map(b => (
                                                <div key={b.id} className="flex items-start justify-between text-sm gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-gray-900 truncate" title={b.description_normalized || b.description_raw}>{b.description_normalized || b.description_raw}</p>
                                                        <p className="text-xs text-gray-500 truncate">
                                                            {b.counterparty_name ? <span className="text-gray-700">{b.direction === 'CREDIT' ? 'Pagador' : 'Favorecido'}: {b.counterparty_name} · </span> : ''}
                                                            {formatDate(b.transaction_date)}
                                                        </p>
                                                    </div>
                                                    <span className="tabular-nums font-medium text-gray-900 flex-shrink-0">{formatBRL(b.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end px-4 py-2 border-t border-gray-100">
                                    <button
                                        onClick={() => run(chave, () => reconciliationGroupService.confirmTitleToBanks(g.title.id, g.banks.map(b => b.id)))}
                                        disabled={busy === chave}
                                        className={botao}
                                    >
                                        {busy === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conciliar grupo
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default GroupMatchPanel;
