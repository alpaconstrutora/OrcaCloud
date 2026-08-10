import React, { useMemo, useState } from 'react';
import { Landmark, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryClient';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import { inssBracketsService } from '../services/inssBracketsService';

const COLUMNS: ColumnConfig[] = [
    { key: 'base_de',  label: 'Base de cálculo: De',   sortable: true },
    { key: 'base_ate', label: 'Base de cálculo: Até',  sortable: true },
    { key: 'aliquota', label: 'Alíquota',               sortable: true },
];

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX.
const INSS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    base_de:  { label: 'Base de cálculo: De',  className: 'px-6 py-2 border-r border-gray-100' },
    base_ate: { label: 'Base de cálculo: Até', className: 'px-6 py-2 border-r border-gray-100' },
    aliquota: { label: 'Alíquota',             className: 'px-6 py-2 text-right' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderInssCell(key: string, b: { base_de: number; base_ate: number; aliquota: number }): React.ReactNode {
    switch (key) {
        case 'base_de':
            return <span className="text-sm font-normal text-gray-700">{fmtBRL(b.base_de)}</span>;
        case 'base_ate':
            return <span className="text-sm font-normal text-gray-700">{fmtBRL(b.base_ate)}</span>;
        case 'aliquota':
            return <div className="text-right"><span className="text-sm font-medium text-gray-800">{fmtPct(b.aliquota)}</span></div>;
        default:
            return null;
    }
}

const InssBracketsSettings: React.FC = () => {
    const tableColumns = useTableColumns(COLUMNS, 'inssBracketsColumns');

    const { data: brackets = [], isLoading } = useQuery({
        queryKey: ['tax-inss-brackets'],
        queryFn: inssBracketsService.list,
        staleTime: STALE.slow,
    });

    const years = useMemo(
        () => Array.from(new Set(brackets.map(b => b.exercicio))).sort((a, b) => b - a),
        [brackets]
    );
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const activeYear = selectedYear ?? years[0] ?? null;

    const rows = useMemo(() => {
        const filtered = brackets.filter(b => b.exercicio === activeYear);
        if (!tableColumns.sortColumn) return filtered;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            if (tableColumns.sortColumn === 'base_de')  return (a.base_de - b.base_de) * dir;
            if (tableColumns.sortColumn === 'base_ate') return (a.base_ate - b.base_ate) * dir;
            if (tableColumns.sortColumn === 'aliquota') return (a.aliquota - b.aliquota) * dir;
            return 0;
        });
    }, [brackets, activeYear, tableColumns.sortColumn, tableColumns.sortDirection]);

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-50 rounded-[10px]">
                    <Landmark className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">INSS — Faixas de Contribuição</h2>
                    <p className="text-sm text-gray-500 mt-1">Tabela oficial de alíquotas progressivas por exercício, usada como referência para cálculo de retenção do INSS.</p>
                </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
                <div className="flex items-center gap-3 flex-wrap mb-4">
                    {years.map(y => (
                        <button
                            key={y}
                            onClick={() => setSelectedYear(y)}
                            className={`h-9 px-3 rounded-[6px] text-sm font-medium transition-all ${
                                activeYear === y ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {y}
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
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma faixa cadastrada</h3>
                            <p className="text-sm text-gray-500">Não há tabela do INSS para {activeYear ?? 'este exercício'}.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = INSS_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                colKey={key}
                                                label={def.label}
                                                sortable={def.sortable !== false}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}
                                            />
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {rows.map(b => (
                                    <tr key={b.id} className="hover:bg-blue-50/50 transition-colors">
                                        {tableColumns.orderedVisibleColumns.map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderInssCell(key, b)}
                                            </td>
                                        ))}
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

export default InssBracketsSettings;
