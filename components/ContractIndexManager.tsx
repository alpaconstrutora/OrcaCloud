import React, { useEffect, useState, useCallback } from 'react';
import {
    TrendingUp, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import { contractIndexService, ContractIndexValue, IndexName } from '../services/contractIndexService';
import { contractService } from '../services/contractService';

interface Props {
    organizationId: string;
}

const INDEX_NAMES: IndexName[] = ['INCC-M', 'INCC', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

const fmtDate = (d: string) => {
    const [y, m] = d.split('-');
    return `${m}/${y}`;
};
const fmtVal = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtCur = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const ContractIndexManager: React.FC<Props> = ({ organizationId }) => {
    const [selectedIndex, setSelectedIndex] = useState<IndexName>('INCC-M');
    const [values, setValues] = useState<ContractIndexValue[]>([]);
    const [dueContracts, setDueContracts] = useState<{
        id: string; number: string; title: string; reajuste_index: string;
        reajuste_proximo: string; current_value: number;
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingDue, setLoadingDue] = useState(false);
    const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

    // form para novo valor
    const [newMonth, setNewMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [newValue, setNewValue] = useState('');
    const [saving, setSaving] = useState(false);

    // reajuste em lote
    const [applyingId, setApplyingId] = useState<string | null>(null);

    const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const loadValues = useCallback(async () => {
        setLoading(true);
        try { setValues(await contractIndexService.list(selectedIndex, organizationId)); }
        finally { setLoading(false); }
    }, [selectedIndex, organizationId]);

    const loadDue = useCallback(async () => {
        setLoadingDue(true);
        try { setDueContracts(await contractIndexService.listDueForReajuste(organizationId)); }
        finally { setLoadingDue(false); }
    }, [organizationId]);

    useEffect(() => { loadValues(); }, [loadValues]);
    useEffect(() => { loadDue(); }, [loadDue]);

    const handleAdd = async () => {
        const v = parseFloat(newValue.replace(',', '.'));
        if (isNaN(v) || v <= 0 || !newMonth) return;
        setSaving(true);
        try {
            const [y, m] = newMonth.split('-').map(Number);
            await contractIndexService.upsert(organizationId, selectedIndex, new Date(y, m - 1, 1), v);
            setNewValue('');
            notify('Valor salvo.', 'success');
            loadValues();
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`, 'error');
        } finally { setSaving(false); }
    };

    const handleRemove = async (id: string) => {
        await contractIndexService.remove(id);
        loadValues();
    };

    const handleApplyReajuste = async (contractId: string, indexName: string) => {
        setApplyingId(contractId);
        try {
            // busca o contrato para saber data_base
            const contract = await contractService.getContractById(contractId);
            if (!contract?.reajuste_data_base) {
                notify('Contrato sem data-base de reajuste definida. Aplique o primeiro reajuste manualmente.', 'error');
                return;
            }
            const [baseRow, currentRow] = await Promise.all([
                contractIndexService.getClosestTo(indexName as IndexName, contract.reajuste_data_base, organizationId),
                contractIndexService.getClosestTo(indexName as IndexName, new Date().toISOString().slice(0, 10), organizationId),
            ]);
            if (!baseRow || !currentRow) {
                notify(`Índice ${indexName} não encontrado para as datas necessárias. Cadastre os valores primeiro.`, 'error');
                return;
            }
            if (baseRow.value === currentRow.value) {
                notify('Índice base e atual são iguais — nenhum reajuste necessário.', 'info');
                return;
            }
            await contractService.applyReajuste(contractId, baseRow.value, currentRow.value,
                `${indexName} ${fmtDate(baseRow.reference_month)} → ${fmtDate(currentRow.reference_month)}`);
            notify(`Reajuste aplicado ao contrato ${contract.number}.`, 'success');
            loadDue();
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`, 'error');
        } finally { setApplyingId(null); }
    };

    return (
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {notification && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm shadow-lg font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error'   ? 'bg-red-600 text-white' :
                                                      'bg-gray-900 text-white'
                }`}>{notification.msg}</div>
            )}

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-600" /> Índices de Reajuste
            </h2>

            {/* Contratos com reajuste vencido */}
            {dueContracts.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle size={16} />
                        {dueContracts.length} contrato(s) com reajuste vencido
                    </p>
                    <div className="space-y-2">
                        {dueContracts.map(c => (
                            <div key={c.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-2.5">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.number} — {c.title}</p>
                                    <p className="text-[11px] text-gray-400">
                                        {c.reajuste_index} · venceu {new Date(c.reajuste_proximo).toLocaleDateString('pt-BR')} · valor atual {fmtCur(c.current_value)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleApplyReajuste(c.id, c.reajuste_index)}
                                    disabled={applyingId === c.id}
                                    className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                >
                                    {applyingId === c.id ? 'Aplicando…' : 'Aplicar'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {dueContracts.length === 0 && !loadingDue && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl">
                    <CheckCircle2 size={15} /> Nenhum reajuste vencido no momento.
                </div>
            )}

            {/* Seletor de índice */}
            <div className="flex items-center gap-3 flex-wrap">
                {INDEX_NAMES.map(n => (
                    <button key={n} onClick={() => setSelectedIndex(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedIndex === n
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}>
                        {n}
                    </button>
                ))}
                <button onClick={loadValues} disabled={loading}
                    className="ml-auto text-gray-400 hover:text-gray-700 disabled:opacity-50">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Adicionar valor */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Cadastrar valor — {selectedIndex}
                </p>
                <div className="flex gap-3 items-end">
                    <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Mês de referência</label>
                        <input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)}
                            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-[11px] text-gray-400 mb-1">Valor do índice</label>
                        <input type="number" step="0.0001" min="0" value={newValue} onChange={e => setNewValue(e.target.value)}
                            placeholder="ex: 3326.33"
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={handleAdd} disabled={saving || !newValue || !newMonth}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        <Plus size={14} /> {saving ? 'Salvando…' : 'Adicionar'}
                    </button>
                </div>
            </div>

            {/* Tabela de valores */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="space-y-px">
                        {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-50 dark:bg-gray-700/50 animate-pulse" />)}
                    </div>
                ) : values.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                        Nenhum valor cadastrado para {selectedIndex}.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Referência</th>
                                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Variação</th>
                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fonte</th>
                                <th className="w-8" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {values.map((v, i) => {
                                const prev = values[i + 1];
                                const varPct = prev ? ((v.value - prev.value) / prev.value) * 100 : null;
                                return (
                                    <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{fmtDate(v.reference_month)}</td>
                                        <td className="px-4 py-2.5 text-right font-mono text-gray-700 dark:text-gray-200">{fmtVal(v.value)}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            {varPct !== null ? (
                                                <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${varPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {varPct >= 0 ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                                    {Math.abs(varPct).toFixed(2)}%
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-400">{v.source ?? '—'}</td>
                                        <td className="px-3 py-2.5">
                                            {v.organization_id && (
                                                <button onClick={() => handleRemove(v.id)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ContractIndexManager;
