import React, { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Plus, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { contractIndexService, ContractIndexValue, IndexName } from '../services/contractIndexService';
import { useOrgContext, useOrgWriteTarget } from '../hooks/useOrgContext';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';

const COLUMNS: ColumnConfig[] = [
    { key: 'reference', label: 'Referência', sortable: true },
    { key: 'value', label: 'Valor', sortable: true },
    { key: 'variation', label: 'Variação', sortable: false },
    { key: 'source', label: 'Fonte', sortable: true },
    { key: 'actions', label: '', sortable: false },
];

const INDEX_NAMES: IndexName[] = ['INCC-M', 'INCC', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

const fmtDate = (d: string) => {
    const [y, m] = d.split('-');
    return `${m}/${y}`;
};
const fmtVal = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const ContractIndexManager: React.FC = () => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [selectedIndex, setSelectedIndex] = useState<IndexName>('INCC-M');
    const [values, setValues] = useState<ContractIndexValue[]>([]);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

    // form para novo valor
    const [newMonth, setNewMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [newValue, setNewValue] = useState('');
    const [saving, setSaving] = useState(false);

    const tableColumns = useTableColumns(COLUMNS, 'contractIndexColumns');

    const sortedValues = React.useMemo(() => {
        if (!tableColumns.sortColumn) return values;
        return [...values].sort((a, b) => {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            if (tableColumns.sortColumn === 'reference') return a.reference_month.localeCompare(b.reference_month) * dir;
            if (tableColumns.sortColumn === 'value') return (a.value - b.value) * dir;
            if (tableColumns.sortColumn === 'source') return (a.source ?? '').localeCompare(b.source ?? '') * dir;
            return 0;
        });
    }, [values, tableColumns.sortColumn, tableColumns.sortDirection]);

    const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const loadValues = useCallback(async () => {
        setLoading(true);
        try { setValues(await contractIndexService.list(selectedIndex, activeOrganizationId ?? undefined)); }
        finally { setLoading(false); }
    }, [selectedIndex, activeOrganizationId]);

    useEffect(() => { loadValues(); }, [loadValues]);

    const handleAdd = async () => {
        const v = parseFloat(newValue.replace(',', '.'));
        if (isNaN(v) || v <= 0 || !newMonth) return;
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setSaving(true);
        try {
            const [y, m] = newMonth.split('-').map(Number);
            await contractIndexService.upsert(orgId, selectedIndex, new Date(y, m - 1, 1), v);
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

    return (
        <div className="space-y-4">
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] px-5 py-4 rounded-2xl text-sm shadow-xl font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error'   ? 'bg-red-600 text-white' :
                                                      'bg-gray-900 text-white'
                }`}>{notification.msg}</div>
            )}

            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-600" /> Índices de Reajuste
            </h2>
            <p className="text-sm text-gray-500">
                Catálogo de valores mensais (INCC, IPCA, IGP-M, CUB) usado para calcular reajustes de contratos e outras correções monetárias.
            </p>

            {/* Seletor de índice */}
            <div className="flex items-center gap-3 flex-wrap">
                {INDEX_NAMES.map(n => (
                    <button key={n} onClick={() => setSelectedIndex(n)}
                        className={`h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${
                            selectedIndex === n
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {n}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                    <ColumnConfigButton
                        columns={COLUMNS}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                    <button onClick={loadValues} disabled={loading}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-50">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Adicionar valor */}
            <div className="bg-white rounded-[10px] border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3">
                    Cadastrar valor — {selectedIndex}
                </p>
                <div className="flex gap-3 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Mês de referência</label>
                        <input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)}
                            className="h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Valor do índice</label>
                        <input type="number" step="0.0001" min="0" value={newValue} onChange={e => setNewValue(e.target.value)}
                            placeholder="ex: 3326.33"
                            className="w-full h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={saving || !newValue || !newMonth}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" /> {saving ? 'Salvando…' : 'Adicionar'}
                    </button>
                </div>
            </div>

            {/* Tabela de valores */}
            <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="space-y-px">
                        {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-50 animate-pulse" />)}
                    </div>
                ) : values.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                        Nenhum valor cadastrado para {selectedIndex}.
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            <tr>
                                {tableColumns.visibleColumns.includes('reference') && (
                                    <SortableHeader colKey="reference" label="Referência" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('value') && (
                                    <SortableHeader colKey="value" label="Valor" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />
                                )}
                                {tableColumns.visibleColumns.includes('variation') && (
                                    <SortableHeader colKey="variation" label="Variação" uppercase={false} sortable={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />
                                )}
                                {tableColumns.visibleColumns.includes('source') && (
                                    <SortableHeader colKey="source" label="Fonte" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('actions') && <th className="w-10" />}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {sortedValues.map((v) => {
                                const originalIndex = values.indexOf(v);
                                const prev = values[originalIndex + 1];
                                const varPct = prev ? ((v.value - prev.value) / prev.value) * 100 : null;
                                return (
                                    <tr key={v.id} className="hover:bg-blue-50/50 transition-colors">
                                        {tableColumns.visibleColumns.includes('reference') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{fmtDate(v.reference_month)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('value') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">{fmtVal(v.value)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('variation') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                                {varPct !== null ? (
                                                    <span className={`inline-flex items-center gap-0.5 text-sm font-normal ${varPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {varPct >= 0 ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                        {Math.abs(varPct).toFixed(2)}%
                                                    </span>
                                                ) : '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('source') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{v.source ?? '—'}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                {v.organization_id && (
                                                    <ActionIconButton kind="delete" onClick={() => handleRemove(v.id)} />
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {orgTargetModal}
        </div>
    );
};

export default ContractIndexManager;
