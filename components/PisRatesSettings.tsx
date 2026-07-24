import React, { useMemo, useState } from 'react';
import { Landmark, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryClient';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import { pisRatesService } from '../services/pisRatesService';

const COLUMNS: ColumnConfig[] = [
    { key: 'exercicio', label: 'Exercício',         sortable: true },
    { key: 'regime',    label: 'Regime Tributário', sortable: true },
    { key: 'aliquota',  label: 'Alíquota',          sortable: true },
];

const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;

const PisRatesSettings: React.FC = () => {
    const tableColumns = useTableColumns(COLUMNS, 'pisRatesColumns');

    const { data: rates = [], isLoading } = useQuery({
        queryKey: ['tax-pis-rates'],
        queryFn: pisRatesService.list,
        staleTime: STALE.slow,
    });

    const regimes = useMemo(
        () => Array.from(new Set(rates.map(r => r.regime_tributario))).sort((a, b) => a.localeCompare(b)),
        [rates]
    );
    const [selectedRegime, setSelectedRegime] = useState<string | null>(null);

    const rows = useMemo(() => {
        const filtered = selectedRegime
            ? rates.filter(r => r.regime_tributario === selectedRegime)
            : rates;
        if (!tableColumns.sortColumn) return filtered;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            if (tableColumns.sortColumn === 'exercicio') return (a.exercicio - b.exercicio) * dir;
            if (tableColumns.sortColumn === 'regime')    return a.regime_tributario.localeCompare(b.regime_tributario) * dir;
            if (tableColumns.sortColumn === 'aliquota')  return (a.aliquota - b.aliquota) * dir;
            return 0;
        });
    }, [rates, selectedRegime, tableColumns.sortColumn, tableColumns.sortDirection]);

    const filterBtn = (active: boolean) =>
        `h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${
            active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`;

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-50 rounded-[10px]">
                    <Landmark className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">PIS — Alíquotas por Exercício</h2>
                    <p className="text-sm text-gray-500 mt-1">Alíquota do PIS por exercício e regime tributário (Lucro Real / Lucro Presumido), usada como referência para apuração e retenção.</p>
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                <div className="flex items-center gap-3 flex-wrap mb-4">
                    <button onClick={() => setSelectedRegime(null)} className={filterBtn(selectedRegime === null)}>
                        Todos
                    </button>
                    {regimes.map(r => (
                        <button key={r} onClick={() => setSelectedRegime(r)} className={filterBtn(selectedRegime === r)}>
                            {r}
                        </button>
                    ))}
                    <div className="ml-auto">
                        <ColumnConfigButton
                            columns={COLUMNS}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="text-center py-12">
                            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma alíquota cadastrada</h3>
                            <p className="text-sm text-gray-500">Não há alíquotas de PIS para o filtro selecionado.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.visibleColumns.includes('exercicio') && (
                                        <SortableHeader colKey="exercicio" label="Exercício" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('regime') && (
                                        <SortableHeader colKey="regime" label="Regime Tributário" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('aliquota') && (
                                        <SortableHeader colKey="aliquota" label="Alíquota" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 text-right" />
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {rows.map(r => (
                                    <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                                        {tableColumns.visibleColumns.includes('exercicio') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{r.exercicio}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('regime') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{r.regime_tributario}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('aliquota') && (
                                            <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800">{fmtPct(r.aliquota)}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex items-start gap-3 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-[10px] text-xs text-blue-700 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                    Tabela oficial (mesma para todas as organizações). Novos exercícios são adicionados via atualização do sistema.
                </div>
            </div>
        </div>
    );
};

export default PisRatesSettings;
