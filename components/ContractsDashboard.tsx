import React, { useEffect, useState, useCallback } from 'react';
import {
    FileText, AlertTriangle, TrendingUp, Clock, DollarSign,
    CheckCircle2, XCircle, RotateCcw, ChevronRight, RefreshCw, Plus, Shield, Search,
} from 'lucide-react';
import { contractService } from '../services/contractService';
import { contractGuaranteeService, ContractGuaranteeExpiring } from '../services/contractGuaranteeService';
import { supabase } from '../lib/supabase';
import { Contract } from '../types';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { formatDateBR as fmtDate } from './ui/Format';

interface Props {
    organizationId: string;
    onViewContract: (id: string) => void;
    direction?: 'OUTGOING' | 'INCOMING';
    domain?: 'SUPRIMENTOS' | 'SERVICOS' | 'LOCACAO' | 'VENDAS';
    onCreateNew?: () => void;
}

const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr + 'T12:00:00').getTime() - Date.now();
    return Math.ceil(diff / 86400000);
};

const STATUS_LABEL: Record<string, string> = {
    Rascunho: 'Rascunho', Revisão: 'Revisão', Enviado: 'Enviado',
    Aprovado: 'Aprovado', Assinado: 'Assinado', Ativo: 'Ativo',
    Concluído: 'Concluído', Suspenso: 'Suspenso', Encerrado: 'Encerrado', Cancelado: 'Cancelado',
};
// ui_ux_guia_unificado.md §8 — Status Badge: texto colorido, sem pílula/fundo/uppercase.
const STATUS_COLOR: Record<string, string> = {
    Rascunho: 'text-gray-600', Revisão: 'text-purple-600', Enviado: 'text-blue-600',
    Aprovado: 'text-teal-600', Assinado: 'text-indigo-600', Ativo: 'text-emerald-600',
    Concluído: 'text-emerald-500', Suspenso: 'text-amber-600', Encerrado: 'text-gray-400', Cancelado: 'text-red-600',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
    <span className={`text-sm font-normal ${STATUS_COLOR[status] ?? 'text-gray-600'}`}>
        {STATUS_LABEL[status] ?? status}
    </span>
);

// ui_ux_guia_unificado.md §2 — colunas fora do componente.
// `client` só existe em domínios que mostram Contratante (showsClient); filtrada por domínio dentro do componente.
const COLUMNS: (ColumnConfig & { clientOnly?: boolean })[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'title', label: 'Título', sortable: true },
    { key: 'client', label: 'Contratante', sortable: true, clientOnly: true },
    { key: 'value', label: 'Valor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'end_date', label: 'Vencimento', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

export const ContractsDashboard: React.FC<Props> = ({ organizationId, onViewContract, direction, domain, onCreateNew }) => {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'alerts' | 'active' | 'all'>('alerts');
    const [measuredTotal, setMeasuredTotal] = useState(0);
    const [clientNames, setClientNames] = useState<Record<string, string>>({});
    const [guaranteesExpiring, setGuaranteesExpiring] = useState<ContractGuaranteeExpiring[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ui_ux_guia_unificado.md §3 — busca persistida.
    const [searchTerm, setSearchTerm] = usePersistedState<string>('contractsDashboard:search', '');

    // Layout "com cliente" (mostra coluna Contratante): qualquer domínio OUTGOING.
    const showsClient = direction === 'OUTGOING' || domain === 'SERVICOS' || domain === 'LOCACAO' || domain === 'VENDAS';

    const domainColumns = React.useMemo(
        () => COLUMNS.filter(c => !c.clientOnly || showsClient),
        [showsClient]
    );
    const tableColumns = useTableColumns(domainColumns, 'contractsDashboardColumns');

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await contractService.listContracts(undefined, organizationId, undefined, direction, domain);
            setContracts(data);
        } catch (err: any) {
            console.error('[ContractsDashboard] Erro ao carregar contratos:', err);
            setLoadError(err?.message || 'Erro ao carregar contratos.');
            setContracts([]);
        } finally {
            setLoading(false);
        }
    }, [organizationId, direction, domain]);

    useEffect(() => { load(); }, [load]);

    // Fase 5.1 — apólices/garantias vigentes vencendo em até 30 dias (PLANO_MODULO_CONTRATOS_GAPS.md)
    useEffect(() => {
        contractGuaranteeService.listExpiring(organizationId, 30)
            .then(setGuaranteesExpiring)
            .catch(() => setGuaranteesExpiring([]));
    }, [organizationId]);

    useEffect(() => {
        if (!showsClient) { setClientNames({}); return; }
        const ids = [...new Set(contracts.filter(c => (c as any).client_id).map(c => (c as any).client_id as string))];
        if (!ids.length) return;
        // VENDAS/LOCACAO → clientes comerciais na tabela `clients`.
        // SERVICOS (e OUTGOING legado) → tabela `service_clients`.
        const clientTable = (domain === 'VENDAS' || domain === 'LOCACAO') ? 'clients' : 'service_clients';
        supabase.from(clientTable).select('id, name').in('id', ids).then(({ data }) => {
            const map: Record<string, string> = {};
            (data ?? []).forEach((s: { id: string; name: string }) => { map[s.id] = s.name; });
            setClientNames(map);
        });
    }, [contracts, showsClient, domain]);

    useEffect(() => {
        if (!showsClient) { setMeasuredTotal(0); return; }
        const ids = contracts.filter(c => ['Ativo', 'Concluído', 'Assinado'].includes(c.status)).map(c => c.id);
        if (!ids.length) { setMeasuredTotal(0); return; }
        supabase
            .from('contract_measurements')
            .select('net_value')
            .in('contract_id', ids)
            .then(({ data }) => {
                setMeasuredTotal((data ?? []).reduce((s, m) => s + ((m as { net_value: number }).net_value || 0), 0));
            });
    }, [contracts, showsClient]);

    // ── KPIs ────────────────────────────────────────────────────────────────
    const active = contracts.filter(c => c.status === 'Ativo');
    const rascunho = contracts.filter(c => c.status === 'Rascunho' || c.status === 'Enviado');
    const totalReceita = active.reduce((s, c) => s + (c.current_value ?? 0), 0);

    // Contratos que já têm renovação (contrato-filho) não alertam de vencimento —
    // o fim da vigência deles é esperado, a continuidade já está contratada.
    const renewedIds = new Set(
        contracts.map(c => c.parent_contract_id).filter((id): id is string => Boolean(id))
    );
    // Recorrentes (locação) ENTRAM nos alertas: o filtro `|| c.is_recurring` que
    // existia aqui fazia todo contrato de aluguel vencer em silêncio.
    const alertaVencimento = (c: Contract) => Boolean(c.end_date) && !renewedIds.has(c.id);

    const vencendo30 = active.filter(c => {
        if (!alertaVencimento(c)) return false;
        const d = daysUntil(c.end_date!);
        return d >= 0 && d <= 30;
    });
    const vencendo90 = active.filter(c => {
        if (!alertaVencimento(c)) return false;
        const d = daysUntil(c.end_date!);
        return d > 30 && d <= 90;
    });
    const vencidos = contracts.filter(c => {
        if (c.status !== 'Ativo' || !alertaVencimento(c)) return false;
        return daysUntil(c.end_date!) < 0;
    });
    // Recorrente não "vence": chega ao fim da vigência e precisa ser renovado.
    const rotuloPrazo = (c: Contract) =>
        c.is_recurring
            ? `Renovar até ${c.end_date!.slice(8, 10)}/${c.end_date!.slice(5, 7)}/${c.end_date!.slice(0, 4)}`
            : `Vence em ${daysUntil(c.end_date!)} dia(s)`;
    const reajustePendente = active.filter(c =>
        c.reajuste_index && c.reajuste_proximo && daysUntil(c.reajuste_proximo) <= 30
    );
    const semAprovacao = contracts.filter(c => c.approval_status === 'PENDENTE');

    // ── Alertas consolidados ────────────────────────────────────────────────
    type Alert = { id: string; level: 'critical' | 'warning' | 'info'; label: string; contract: Contract };
    const guaranteeAlerts: Alert[] = guaranteesExpiring
        .map((g): Alert | null => {
            const c = contracts.find(x => x.id === g.contract_id);
            if (!c) return null;
            const label = g.days_remaining < 0
                ? `Apólice vencida há ${Math.abs(g.days_remaining)} dia(s)`
                : `Apólice vence em ${g.days_remaining} dia(s)`;
            const level: Alert['level'] = g.days_remaining < 0 ? 'critical' : 'warning';
            return { id: c.id, level, label, contract: c };
        })
        .filter((a): a is Alert => a !== null);
    const alerts: Alert[] = [
        ...vencidos.map(c => ({ id: c.id, level: 'critical' as const, label: `Vencido há ${Math.abs(daysUntil(c.end_date!))} dia(s)`, contract: c })),
        ...guaranteeAlerts,
        ...vencendo30.map(c => ({ id: c.id, level: 'warning' as const, label: rotuloPrazo(c), contract: c })),
        ...reajustePendente.map(c => ({ id: c.id, level: 'warning' as const, label: `Reajuste ${c.reajuste_index} em ${daysUntil(c.reajuste_proximo!)} dia(s)`, contract: c })),
        ...semAprovacao.map(c => ({ id: c.id, level: 'info' as const, label: 'Aguardando aprovação', contract: c })),
        ...vencendo90.map(c => ({ id: c.id, level: 'info' as const, label: rotuloPrazo(c), contract: c })),
    ];

    const saldoContratual = totalReceita - measuredTotal;

    const kpis = showsClient ? [
        { label: 'Contratos Ativos', value: active.length.toString(), sub: `${rascunho.length} em elaboração`, icon: <CheckCircle2 className="w-4 h-4" />, color: 'emerald' as const },
        { label: 'Receita Contratada', value: fmt(totalReceita), sub: `${active.filter(c => c.is_recurring).length} recorrentes`, icon: <DollarSign className="w-4 h-4" />, color: 'blue' as const },
        { label: 'Total Medido', value: fmt(measuredTotal), sub: `${((totalReceita > 0 ? measuredTotal / totalReceita : 0) * 100).toFixed(0)}% do contratado`, icon: <TrendingUp className="w-4 h-4" />, color: 'violet' as const },
        { label: 'Saldo Contratual', value: fmt(saldoContratual), sub: vencidos.length > 0 ? `${vencidos.length} contrato(s) vencido(s)` : 'Sem vencimentos', icon: <Clock className="w-4 h-4" />, color: saldoContratual < 0 ? ('red' as const) : ('gray' as const) },
        { label: 'Apólices Vencendo', value: guaranteesExpiring.length.toString(), sub: guaranteesExpiring.some(g => g.days_remaining < 0) ? `${guaranteesExpiring.filter(g => g.days_remaining < 0).length} já vencida(s)` : 'Próximos 30 dias', icon: <Shield className="w-4 h-4" />, color: guaranteesExpiring.length > 0 ? ('red' as const) : ('gray' as const) },
    ] : [
        { label: 'Contratos Ativos', value: active.length.toString(), sub: `${rascunho.length} em rascunho/enviado`, icon: <CheckCircle2 className="w-4 h-4" />, color: 'emerald' as const },
        { label: 'Receita Contratada', value: fmt(totalReceita), sub: `${active.filter(c => c.is_recurring).length} recorrentes`, icon: <DollarSign className="w-4 h-4" />, color: 'blue' as const },
        { label: 'Vencendo em 30 dias', value: vencendo30.length.toString(), sub: `${vencidos.length} já vencido(s)`, icon: <Clock className="w-4 h-4" />, color: vencendo30.length > 0 ? ('amber' as const) : ('gray' as const) },
        { label: 'Reajustes Pendentes', value: reajustePendente.length.toString(), sub: `${semAprovacao.length} aguardando aprovação`, icon: <RotateCcw className="w-4 h-4" />, color: reajustePendente.length > 0 ? ('orange' as const) : ('gray' as const) },
        { label: 'Apólices Vencendo', value: guaranteesExpiring.length.toString(), sub: guaranteesExpiring.some(g => g.days_remaining < 0) ? `${guaranteesExpiring.filter(g => g.days_remaining < 0).length} já vencida(s)` : 'Próximos 30 dias', icon: <Shield className="w-4 h-4" />, color: guaranteesExpiring.length > 0 ? ('red' as const) : ('gray' as const) },
    ];

    const tabContracts = tab === 'alerts'
        ? alerts.map(a => a.contract).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
        : tab === 'active' ? active
        : contracts;

    // Busca + ordenação (§3/§6.3) — aplicadas em cima do recorte da aba ativa.
    const visibleContracts = React.useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        let list = !q ? tabContracts : tabContracts.filter(c => {
            const clientName = (c as any).client_id ? (clientNames[(c as any).client_id] ?? '') : '';
            return (c.number ?? '').toString().toLowerCase().includes(q)
                || (c.title ?? '').toLowerCase().includes(q)
                || clientName.toLowerCase().includes(q)
                || (STATUS_LABEL[c.status] ?? c.status).toLowerCase().includes(q);
        });
        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            const col = tableColumns.sortColumn;
            list = [...list].sort((a, b) => {
                switch (col) {
                    case 'number':
                        return (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true }) * dir;
                    case 'title':
                        return (a.title ?? '').localeCompare(b.title ?? '') * dir;
                    case 'client': {
                        const an = (a as any).client_id ? (clientNames[(a as any).client_id] ?? '') : '';
                        const bn = (b as any).client_id ? (clientNames[(b as any).client_id] ?? '') : '';
                        return an.localeCompare(bn) * dir;
                    }
                    case 'value':
                        return ((a.current_value ?? 0) - (b.current_value ?? 0)) * dir;
                    case 'status':
                        return (STATUS_LABEL[a.status] ?? a.status).localeCompare(STATUS_LABEL[b.status] ?? b.status) * dir;
                    case 'end_date':
                        return ((a.end_date ? new Date(a.end_date).getTime() : Infinity) - (b.end_date ? new Date(b.end_date).getTime() : Infinity)) * dir;
                    default:
                        return 0;
                }
            });
        }
        return list;
    }, [tabContracts, searchTerm, clientNames, tableColumns.sortColumn, tableColumns.sortDirection]);

    const sortHeaderProps = {
        sortColumn: tableColumns.sortColumn,
        sortDirection: tableColumns.sortDirection,
        onSort: tableColumns.handleColumnSort,
        uppercase: false as const,
    };
    const vc = tableColumns.visibleColumns;

    return (
        <div className="space-y-6">
            {/* Erro de carregamento */}
            {loadError && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px] text-red-700 text-sm font-medium">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{loadError}</span>
                    <button onClick={load} className="ml-auto text-sm font-medium underline hover:no-underline">Tentar novamente</button>
                </div>
            )}

            {/* KPIs — §4, componente canônico KpiCard */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {kpis.map(k => (
                    <KpiCard key={k.label} shadow={false} size="sm" label={k.label} value={loading ? '…' : k.value} sub={k.sub} icon={k.icon} color={k.color} />
                ))}
            </div>

            {/* Tabs (Alertas/Ativos/Todos) + toolbar acoplada à tabela (§5.2/§19) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0 w-fit">
                    {([
                        { id: 'alerts', label: `Alertas${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
                        { id: 'active', label: `Ativos (${active.length})` },
                        { id: 'all',    label: `Todos (${contracts.length})` },
                    ] as const).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                                tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {onCreateNew && (
                    <button
                        onClick={onCreateNew}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo contrato
                    </button>
                )}
            </div>

            {/* Alert badges quando na aba Alertas e sem nenhum alerta */}
            {tab === 'alerts' && alerts.length === 0 && !loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-gray-400 bg-white rounded-[10px] border border-gray-100">
                    <CheckCircle2 size={32} strokeWidth={1} className="text-emerald-400" />
                    <p className="text-sm">Nenhum alerta. Carteira saudável.</p>
                </div>
            )}

            {/* Toolbar + Tabela — card único acoplado (§5.2) */}
            {(tab !== 'alerts' || alerts.length > 0) && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por número, título, contratante ou status..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button onClick={load} disabled={loading} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50 shrink-0" title="Atualizar">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={domainColumns.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : visibleContracts.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca.</p>
                        </div>
                    ) : (
                        // §6.5 — cabeçalho fixo: a aba "Todos" pode crescer bastante.
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {vc.includes('number') && <SortableHeader colKey="number" label="Número" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100" />}
                                        {vc.includes('title') && <SortableHeader colKey="title" label="Título" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100" />}
                                        {showsClient && vc.includes('client') && <SortableHeader colKey="client" label="Contratante" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100" />}
                                        {vc.includes('value') && <SortableHeader colKey="value" label="Valor" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100 text-right" />}
                                        {vc.includes('status') && <SortableHeader colKey="status" label="Status" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100 text-center" />}
                                        {vc.includes('end_date') && <SortableHeader colKey="end_date" label="Vencimento" {...sortHeaderProps} className="px-4 py-2.5 border-r border-gray-100" />}
                                        {tab === 'alerts' && <th className="px-4 py-2.5 border-r border-gray-100 text-table-header font-semibold text-gray-500">Alerta</th>}
                                        <th className="px-4 py-2.5 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visibleContracts.map(c => {
                                        const contractAlerts = alerts.filter(a => a.id === c.id);
                                        const topAlert = contractAlerts[0];
                                        const endDays = c.end_date && !c.is_recurring ? daysUntil(c.end_date) : null;
                                        return (
                                            // §9.1 — clique na linha já é a ação dominante (abrir detalhe); coluna de
                                            // ações não duplica um botão "Ver Detalhes" de texto.
                                            <tr key={c.id} onClick={() => onViewContract(c.id)}
                                                className="hover:bg-blue-50/50 transition-colors cursor-pointer">
                                                {vc.includes('number') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{c.number}</td>
                                                )}
                                                {vc.includes('title') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-[220px] truncate">{c.title}</td>
                                                )}
                                                {showsClient && vc.includes('client') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 max-w-[160px] truncate">
                                                        {(c as any).client_id ? (clientNames[(c as any).client_id] ?? '…') : '—'}
                                                    </td>
                                                )}
                                                {vc.includes('value') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800">
                                                        {fmt(c.current_value ?? 0)}
                                                    </td>
                                                )}
                                                {vc.includes('status') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                        <StatusBadge status={c.status} />
                                                    </td>
                                                )}
                                                {vc.includes('end_date') && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                                        {c.is_recurring ? (
                                                            <span className="text-blue-500">Recorrente</span>
                                                        ) : c.end_date ? (
                                                            <span className={endDays !== null && endDays < 0 ? 'text-red-600' : endDays !== null && endDays <= 30 ? 'text-amber-600' : ''}>
                                                                {fmtDate(c.end_date)}
                                                                {endDays !== null && endDays < 0 && ` (vencido)`}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                )}
                                                {tab === 'alerts' && (
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        {topAlert && (
                                                            <span className={`inline-flex items-center gap-1 text-sm font-normal ${
                                                                topAlert.level === 'critical' ? 'text-red-600' :
                                                                topAlert.level === 'warning'  ? 'text-amber-600' :
                                                                                                 'text-blue-600'
                                                            }`}>
                                                                {topAlert.level === 'critical' && <XCircle size={14} />}
                                                                {topAlert.level === 'warning'  && <AlertTriangle size={14} />}
                                                                {topAlert.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-4 py-2.5 text-right">
                                                    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                        <ChevronRight size={16} className="text-gray-300" />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Distribuição por status */}
            {tab === 'all' && !loading && contracts.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(
                        contracts.reduce((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {} as Record<string, number>)
                    ).map(([status, count]) => (
                        <div key={status} className="bg-white rounded-[10px] border border-gray-100 px-4 py-3 flex items-center gap-3">
                            <span className={`text-sm font-normal flex-1 ${STATUS_COLOR[status] ?? 'text-gray-600'}`}>{STATUS_LABEL[status] ?? status}</span>
                            <span className="text-sm font-bold text-gray-900">{count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ContractsDashboard;
