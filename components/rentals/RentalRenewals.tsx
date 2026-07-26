import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, CalendarClock, AlertTriangle, CalendarCheck, CalendarX, FileText } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ContractReajusteDue from '../ContractReajusteDue';
import RenewContractSheet from './RenewContractSheet';
import { contractRenewalService, ExpiringRental } from '../../services/contractRenewalService';
import { Client, Contract } from '../../types';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Contrato', sortable: true },
    { key: 'client', label: 'Locatário', sortable: true },
    { key: 'end_date', label: 'Fim da vigência', sortable: true },
    { key: 'days', label: 'Prazo', sortable: true },
    { key: 'value', label: 'Aluguel', sortable: true },
    { key: 'index', label: 'Índice', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

type Faixa = 'all' | 'vencidos' | 'd30' | 'd60' | 'd90';

/** Data BR sem bug de fuso: em UTC-3, `new Date(iso)` retrocede um dia. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n: number) =>
    (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const faixaOf = (days: number): Exclude<Faixa, 'all'> =>
    days < 0 ? 'vencidos' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90';

const prazoLabel = (days: number) =>
    days < 0 ? `Venceu há ${Math.abs(days)} dia(s)` : days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)`;

const prazoColor = (days: number) =>
    days < 0 ? 'text-red-600' : days <= 30 ? 'text-amber-700' : days <= 60 ? 'text-amber-600' : 'text-gray-600';

interface Props {
    /** Pode vir vazio em "Todas as organizações" — a leitura NÃO é bloqueada (REGRA #5). */
    organizationId?: string;
    clients?: Client[];
    onRenewed?: (child: Contract) => void;
}

const RentalRenewals: React.FC<Props> = ({ organizationId, clients = [], onRenewed }) => {
    const [rows, setRows] = useState<ExpiringRental[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [faixa, setFaixa] = useState<Faixa>('all');
    const [renewingId, setRenewingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = usePersistedState('rentalRenewals:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'rentalRenewalsColumns');

    const clientName = useCallback(
        (id?: string) => (id ? (clients.find(c => c.id === id)?.name ?? '—') : '—'),
        [clients],
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await contractRenewalService.listRentalsExpiring(organizationId, 90));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar os contratos a vencer.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { loadData(); }, [loadData]);

    const stats = useMemo(() => ({
        vencidos: rows.filter(r => r.days_until_end < 0).length,
        d30: rows.filter(r => r.days_until_end >= 0 && r.days_until_end <= 30).length,
        d60: rows.filter(r => r.days_until_end > 30 && r.days_until_end <= 60).length,
        d90: rows.filter(r => r.days_until_end > 60).length,
    }), [rows]);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const result = rows.filter(r => {
            if (faixa !== 'all' && faixaOf(r.days_until_end) !== faixa) return false;
            if (!term) return true;
            return `${r.number} ${r.title} ${clientName(r.client_id)}`.toLowerCase().includes(term);
        });
        return result.sort((a, b) => {
            const dir = tableColumns.sortDirection === 'desc' ? -1 : 1;
            switch (tableColumns.sortColumn) {
                case 'number': return a.number.localeCompare(b.number) * dir;
                case 'client': return clientName(a.client_id).localeCompare(clientName(b.client_id)) * dir;
                case 'value': return ((a.current_value || 0) - (b.current_value || 0)) * dir;
                case 'index': return (a.reajuste_index || '').localeCompare(b.reajuste_index || '') * dir;
                case 'days':
                case 'end_date': return (a.days_until_end - b.days_until_end) * dir;
                default: return a.days_until_end - b.days_until_end; // sem seleção: mais urgente primeiro
            }
        });
    }, [rows, faixa, searchTerm, clientName, tableColumns.sortColumn, tableColumns.sortDirection]);

    const toggleFaixa = (f: Exclude<Faixa, 'all'>) => setFaixa(prev => (prev === f ? 'all' : f));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <button onClick={() => toggleFaixa('vencidos')} className="text-left">
                    <KpiCard shadow={false} size="sm" label="Vencidos" value={stats.vencidos} icon={<CalendarX className="w-4 h-4" />} color="red" />
                </button>
                <button onClick={() => toggleFaixa('d30')} className="text-left">
                    <KpiCard shadow={false} size="sm" label="Vencem em 30 dias" value={stats.d30} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
                </button>
                <button onClick={() => toggleFaixa('d60')} className="text-left">
                    <KpiCard shadow={false} size="sm" label="Vencem em 60 dias" value={stats.d60} icon={<CalendarClock className="w-4 h-4" />} color="orange" />
                </button>
                <button onClick={() => toggleFaixa('d90')} className="text-left">
                    <KpiCard shadow={false} size="sm" label="Vencem em 90 dias" value={stats.d90} icon={<CalendarCheck className="w-4 h-4" />} color="blue" />
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Toolbar acoplada à tabela — §5.2 */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por contrato, unidade ou locatário..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {faixa !== 'all' && (
                            <button
                                onClick={() => setFaixa('all')}
                                className="h-9 px-3.5 rounded-[6px] text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all whitespace-nowrap"
                            >
                                Limpar filtro de prazo
                            </button>
                        )}

                        <button
                            onClick={loadData}
                            title="Atualizar"
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma locação a renovar</h3>
                        <p className="text-sm text-gray-500">
                            Contratos aparecem aqui quando o fim da vigência entra nos próximos 90 dias.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('number') && (
                                        <SortableHeader colKey="number" label="Contrato" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('client') && (
                                        <SortableHeader colKey="client" label="Locatário" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('end_date') && (
                                        <SortableHeader colKey="end_date" label="Fim da vigência" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('days') && (
                                        <SortableHeader colKey="days" label="Prazo" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('value') && (
                                        <SortableHeader colKey="value" label="Aluguel" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('index') && (
                                        <SortableHeader colKey="index" label="Índice" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(r => (
                                    <tr key={r.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.visibleColumns.includes('number') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {r.number}
                                                <span className="block text-sm font-normal text-gray-400 truncate">{r.title}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('client') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {clientName(r.client_id)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('end_date') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {fmtDate(r.end_date)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('days') && (
                                            <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal ${prazoColor(r.days_until_end)}`}>
                                                {prazoLabel(r.days_until_end)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('value') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">
                                                {fmtCur(r.current_value)}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('index') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {r.reajuste_index || '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => setRenewingId(r.id)}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        Renovar
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Reajuste vencido — componente já existente do módulo Contratos, reusado aqui.
                Um contrato pode precisar de reajuste sem estar perto do fim da vigência. */}
            <ContractReajusteDue organizationId={organizationId || ''} />

            <RenewContractSheet
                open={Boolean(renewingId)}
                contractId={renewingId}
                onClose={() => setRenewingId(null)}
                onRenewed={(child) => { loadData(); onRenewed?.(child); }}
            />
        </div>
    );
};

export default RentalRenewals;
