import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, CalendarClock, AlertTriangle, CalendarCheck, CalendarX, FileText } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { useConfirm } from '../ui/confirm';
import ContractReajusteDue from '../ContractReajusteDue';
import RenewContractSheet from './RenewContractSheet';
import { contractRenewalService, ExpiringRental } from '../../services/contractRenewalService';
import { Client, Contract } from '../../types';

const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Contrato', sortable: true },
    { key: 'client', label: 'Locatário', sortable: true },
    { key: 'status', label: 'Situação', sortable: true },
    { key: 'end_date', label: 'Fim da vigência', sortable: true },
    { key: 'days', label: 'Prazo', sortable: true },
    { key: 'value', label: 'Aluguel', sortable: true },
    { key: 'index', label: 'Índice', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

type Faixa = 'all' | 'vencidos' | 'd30' | 'd60' | 'sem_vigencia';

/** Data BR sem bug de fuso: em UTC-3, `new Date(iso)` retrocede um dia. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n: number) =>
    (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const faixaOf = (days: number | null): Exclude<Faixa, 'all'> | 'longe' =>
    days == null ? 'sem_vigencia' : days < 0 ? 'vencidos' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'longe';

const prazoLabel = (days: number | null) =>
    days == null ? 'Vigência não informada'
        : days < 0 ? `Venceu há ${Math.abs(days)} dia(s)`
        : days === 0 ? 'Vence hoje'
        : `Vence em ${days} dia(s)`;

const prazoColor = (days: number | null) =>
    days == null ? 'text-gray-400'
        : days < 0 ? 'text-red-600'
        : days <= 30 ? 'text-amber-700'
        : days <= 60 ? 'text-amber-600'
        : 'text-gray-600';

interface Props {
    /** Pode vir vazio em "Todas as organizações" — a leitura NÃO é bloqueada (REGRA #5). */
    organizationId?: string;
    clients?: Client[];
    onRenewed?: (child: Contract) => void;
    /** Avisa o módulo pai para recarregar, com a mensagem do que aconteceu. */
    onChanged?: (message: string) => void;
    /** Abre o detalhe do contrato (aditivos, documentos, assinatura). */
    onOpenContract?: (contractId: string) => void;
}

const RentalRenewals: React.FC<Props> = ({ organizationId, clients = [], onRenewed, onChanged, onOpenContract }) => {
    const [rows, setRows] = useState<ExpiringRental[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [faixa, setFaixa] = useState<Faixa>('all');
    const [renewingId, setRenewingId] = useState<string | null>(null);
    const [closingId, setClosingId] = useState<string | null>(null);
    const confirm = useConfirm();
    const [searchTerm, setSearchTerm] = usePersistedState('rentalRenewals:search', '');
    const [showClosed, setShowClosed] = usePersistedState<boolean>('rentalRenewals:showClosed', false);
    const tableColumns = useTableColumns(COLUMNS, 'rentalRenewalsColumns');

    const clientName = useCallback(
        (id?: string) => (id ? (clients.find(c => c.id === id)?.name ?? '—') : '—'),
        [clients],
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // null = TODOS os contratos de locação vigentes, não só os que vencem
            // em 90 dias. Sem a lista completa não há como encerrar nem corrigir
            // um contrato que está fora da janela ou sem vigência definida.
            setRows(await contractRenewalService.listRentalsExpiring(organizationId, null, showClosed));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar os contratos de locação.');
        } finally {
            setLoading(false);
        }
    }, [organizationId, showClosed]);

    useEffect(() => { loadData(); }, [loadData]);

    const stats = useMemo(() => ({
        vencidos: rows.filter(r => r.days_until_end != null && r.days_until_end < 0).length,
        d30: rows.filter(r => r.days_until_end != null && r.days_until_end >= 0 && r.days_until_end <= 30).length,
        d60: rows.filter(r => r.days_until_end != null && r.days_until_end > 30 && r.days_until_end <= 60).length,
        semVigencia: rows.filter(r => r.days_until_end == null).length,
    }), [rows]);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const result = rows.filter(r => {
            if (faixa !== 'all' && faixaOf(r.days_until_end) !== faixa) return false;
            if (!term) return true;
            return `${r.number} ${r.title} ${clientName(r.client_id)}`.toLowerCase().includes(term);
        });
        // Sem vigência vai para o fim da ordenação por prazo (não é "urgente", é incompleto).
        const prazo = (d: number | null) => (d == null ? Number.MAX_SAFE_INTEGER : d);
        return result.sort((a, b) => {
            const dir = tableColumns.sortDirection === 'desc' ? -1 : 1;
            switch (tableColumns.sortColumn) {
                case 'number': return a.number.localeCompare(b.number) * dir;
                case 'client': return clientName(a.client_id).localeCompare(clientName(b.client_id)) * dir;
                case 'status': return (a.status || '').localeCompare(b.status || '') * dir;
                case 'value': return ((a.current_value || 0) - (b.current_value || 0)) * dir;
                case 'index': return (a.reajuste_index || '').localeCompare(b.reajuste_index || '') * dir;
                case 'days':
                case 'end_date': return (prazo(a.days_until_end) - prazo(b.days_until_end)) * dir;
                default: return prazo(a.days_until_end) - prazo(b.days_until_end); // sem seleção: mais urgente primeiro
            }
        });
    }, [rows, faixa, searchTerm, clientName, tableColumns.sortColumn, tableColumns.sortDirection]);

    const toggleFaixa = (f: Exclude<Faixa, 'all'>) => setFaixa(prev => (prev === f ? 'all' : f));

    const handleReopen = async (r: ExpiringRental) => {
        const ok = await confirm({
            title: `Reabrir o contrato ${r.number}?`,
            message: 'O contrato volta a Ativo e reaparece entre os vigentes. '
                + 'Se a vigência já terminou, ele entra na fila como vencido, pendente de renovação.',
            variant: 'default',
            confirmLabel: 'Reabrir',
        });
        if (!ok) return;
        setClosingId(r.id);
        try {
            await contractRenewalService.reopenContract(r.id);
            await loadData();
            onChanged?.('Contrato reaberto.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao reabrir o contrato.');
        } finally {
            setClosingId(null);
        }
    };

    const handleClose = async (r: ExpiringRental) => {
        const ok = await confirm({
            title: `Encerrar o contrato ${r.number}?`,
            message: 'O contrato sai da lista de vigentes e deixa de aparecer para renovação. '
                + 'As parcelas já lançadas não são alteradas — cobranças pendentes continuam em Contas a Receber '
                + 'e precisam ser baixadas ou canceladas separadamente.',
            variant: 'warning',
            confirmLabel: 'Encerrar',
        });
        if (!ok) return;
        setClosingId(r.id);
        try {
            await contractRenewalService.closeContract(r.id);
            await loadData();
            onChanged?.('Contrato encerrado.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao encerrar o contrato.');
        } finally {
            setClosingId(null);
        }
    };

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
                <button onClick={() => toggleFaixa('sem_vigencia')} className="text-left">
                    <KpiCard shadow={false} size="sm" label="Sem vigência" value={stats.semVigencia} icon={<CalendarCheck className="w-4 h-4" />} color="gray" />
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

                        {/* Encerrados ficam fora por padrão (não há o que renovar neles);
                            o toggle os traz para consulta e para reabrir um encerrado por engano. */}
                        <button
                            onClick={() => setShowClosed(!showClosed)}
                            className={`h-9 px-3.5 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                                showClosed ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            Encerrados
                        </button>

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
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato de locação vigente</h3>
                        <p className="text-sm text-gray-500">
                            Contratos ativos ou assinados aparecem aqui — inclusive os sem vigência definida.
                            Gere o contrato a partir da negociação, na aba Contratos.
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
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Situação" uppercase={false}
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
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                                                {r.renewed
                                                    ? <span className="text-emerald-700">Renovado por {r.renewed_by}</span>
                                                    : <span className="text-gray-700">{r.status}</span>}
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
                                                    {onOpenContract && (
                                                        <button
                                                            onClick={() => onOpenContract(r.id)}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                        >
                                                            Ver contrato
                                                        </button>
                                                    )}
                                                    {r.status === 'Encerrado' ? (
                                                        <button
                                                            onClick={() => handleReopen(r)}
                                                            disabled={closingId === r.id}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                                                        >
                                                            {closingId === r.id ? 'Reabrindo…' : 'Reabrir'}
                                                        </button>
                                                    ) : (
                                                    <>
                                                    {/* Renovar exige vigência: sem fim definido não há de onde
                                                        derivar o início do contrato-filho. Botão fica disabled
                                                        com title explicando, nunca some nem morre em silêncio. */}
                                                    {/* Renovar leva para a negociação (aba Contrato
                                                        e Assinatura › Renovações), que é o único
                                                        lugar onde se mexe no contrato. A fila aqui
                                                        só mostra o que está vencendo. */}
                                                    <button
                                                        onClick={() => (onOpenContract ? onOpenContract(r.id) : setRenewingId(r.id))}
                                                        disabled={r.renewed || !r.end_date}
                                                        title={
                                                            r.renewed ? `Já renovado pelo contrato ${r.renewed_by}`
                                                                : !r.end_date ? 'Informe o fim da vigência na negociação (aba Contrato) antes de renovar'
                                                                : undefined
                                                        }
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:text-gray-300 disabled:hover:bg-transparent"
                                                    >
                                                        Renovar
                                                    </button>
                                                    <button
                                                        onClick={() => handleClose(r)}
                                                        disabled={closingId === r.id}
                                                        className="text-gray-500 hover:text-red-600 text-sm font-medium p-1.5 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                                    >
                                                        {closingId === r.id ? 'Encerrando…' : 'Encerrar'}
                                                    </button>
                                                    </>
                                                    )}
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
                onRenewed={(r) => {
                    loadData();
                    if (r.mode === 'ADITIVO') {
                        onChanged?.('Aditivo de prorrogação gerado. Abra o contrato para emitir e assinar o documento.');
                    } else if (r.child) {
                        onRenewed?.(r.child);
                    }
                }}
            />
        </div>
    );
};

export default RentalRenewals;
