import React from 'react';
import {
    RefreshCw, AlertTriangle, Users, TrendingUp, FileSignature,
    Wallet, Receipt, Clock,
} from 'lucide-react';
import {
    opuraAnalyticsService,
    type OpuraClienteKpis,
    type OpuraEntry,
    type OpuraEntryFilters,
    type OpuraPivotRow,
} from '../services/opuraAnalyticsService';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

// ── Formatadores ──────────────────────────────────────────────────────────────
function fBRL(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `${v.toFixed(1)}%`;
}

interface ClientLite { id: string; name: string; document: string | null; }

// ── KPI card ───────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-none">{label}</p>
                <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ── Componente ──────────────────────────────────────────────────────────────────
interface CentralClienteProps {
    organizationId: string;
}

const CentralCliente: React.FC<CentralClienteProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [clients, setClients] = React.useState<ClientLite[]>([]);
    const [clientId, setClientId] = React.useState<string>('');
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]     = React.useState(`${now.getFullYear()}-12-31`);

    const [kpis, setKpis]       = React.useState<OpuraClienteKpis | null>(null);
    const [byProject, setByProject] = React.useState<OpuraPivotRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Drill-down extrato
    const [drill, setDrill] = React.useState<{ label: string } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);

    React.useEffect(() => {
        if (!organizationId) return;
        (async () => {
            // Clientes legados têm organization_id = NULL (globais) — incluí-los,
            // como faz o clientService padrão.
            const { data, error } = await supabase
                .from('clients')
                .select('id, name, document')
                .or(`organization_id.eq.${organizationId},organization_id.is.null`)
                .order('name');
            if (error) { showToast(`Erro ao carregar clientes: ${error.message}`, 'error'); return; }
            const list = (data || []) as ClientLite[];
            setClients(list);
            setClientId(prev => prev || list[0]?.id || '');
        })();
    }, [organizationId, showToast]);

    const selected = clients.find(c => c.id === clientId) ?? null;

    const load = React.useCallback(async () => {
        if (!organizationId || !clientId) return;
        setLoading(true);
        setError(null);
        try {
            const [k, proj] = await Promise.all([
                opuraAnalyticsService.clienteKpis(organizationId, clientId, dateFrom, dateTo),
                opuraAnalyticsService.pivot(organizationId, 'project', { clientId, dateFrom, dateTo }),
            ]);
            setKpis(k);
            setByProject(proj);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setKpis(null); setByProject([]); setError(msg);
            showToast(`Erro ao carregar Central de Clientes: ${msg}`, 'error');
            console.error('[CentralCliente]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, clientId, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const openDrill = React.useCallback(async (row: OpuraPivotRow) => {
        setDrill({ label: row.dimension_label });
        setEntries([]); setEntriesLoading(true);
        try {
            const f: OpuraEntryFilters = { clientId, dateFrom, dateTo, projectId: row.dimension_key ?? undefined };
            setEntries(await opuraAnalyticsService.entries(organizationId, f, 200, 0));
        } catch (e: unknown) {
            showToast(`Erro ao carregar extrato: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setEntriesLoading(false);
        }
    }, [organizationId, clientId, dateFrom, dateTo, showToast]);

    // Derivados
    const contratado = kpis?.contratado ?? 0;
    const recebido = kpis?.recebido ?? 0;
    const aReceber = kpis?.a_receber ?? 0;
    const vencido = kpis?.vencido ?? 0;
    const faturado = recebido + aReceber;
    const pctRecebido = faturado > 0 ? (recebido / faturado) * 100 : null;

    const curvaMax = Math.max(1, contratado, faturado, recebido);
    const curva = [
        { label: 'Contratado', value: contratado, color: 'bg-slate-400' },
        { label: 'Faturado',   value: faturado,   color: 'bg-blue-500' },
        { label: 'Recebido',   value: recebido,   color: 'bg-emerald-500' },
    ];
    const maxProjAbs = Math.max(1, ...byProject.map(c => Math.abs(c.net_realizado)));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Users className="w-7 h-7 text-blue-600" /> Central de Clientes
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">Contratado × Faturado × Recebido — por cliente.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select value={clientId} onChange={e => setClientId(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 max-w-[240px]">
                        {clients.length === 0 && <option value="">Nenhum cliente</option>}
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <button onClick={load} disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                </div>
            </div>

            {error ? (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar a Central de Clientes</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <button onClick={load} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                </div>
            ) : !clientId ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">Selecione um cliente.</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                        <KPICard label="Contratado"    value={fBRL(contratado)} sub={`${kpis?.qtd_contratos ?? 0} contrato(s)`} icon={FileSignature} color="bg-slate-50 text-slate-600" />
                        <KPICard label="Faturado"      value={fBRL(faturado)}   sub={pctRecebido !== null ? `${fPct(pctRecebido)} recebido` : undefined} icon={Receipt} color="bg-blue-50 text-blue-600" />
                        <KPICard label="Recebido"      value={fBRL(recebido)}   icon={TrendingUp} color="bg-green-50 text-green-600" />
                        <KPICard label="Saldo devedor" value={fBRL(aReceber)}   sub="a receber em aberto" icon={Wallet} color="bg-amber-50 text-amber-600" />
                        <KPICard label="Inadimplência" value={fBRL(vencido)}    sub="vencido" icon={Clock} color={vencido > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'} />
                    </div>

                    {/* Curva: Contratado × Faturado × Recebido */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Contratado × Faturado × Recebido</p>
                        <div className="space-y-3">
                            {curva.map(c => (
                                <div key={c.label} className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-gray-500 w-24 flex-shrink-0">{c.label}</span>
                                    <div className="flex-1 h-5 rounded-lg bg-gray-50 overflow-hidden">
                                        <div className={`h-full ${c.color} rounded-lg transition-all`} style={{ width: `${c.value / curvaMax * 100}%` }} />
                                    </div>
                                    <span className="text-sm font-black text-gray-800 tabular-nums w-32 text-right flex-shrink-0">{fBRL(c.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Cliente por Obra (clicável → extrato) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-5 pt-5 pb-2">Por Obra <span className="text-gray-300 normal-case font-medium">· clique para o extrato</span></p>
                        {loading ? (
                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Carregando...</div>
                        ) : byProject.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Sem lançamentos no período.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <tbody>
                                    {byProject.map((c, i) => (
                                        <tr key={c.dimension_key ?? `p-${i}`} onClick={() => openDrill(c)}
                                            className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer group">
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden flex-shrink-0" style={{ width: 60 }}>
                                                        <div className="h-full bg-blue-500" style={{ width: `${Math.abs(c.net_realizado) / maxProjAbs * 100}%` }} />
                                                    </div>
                                                    <span className="text-gray-700 font-medium truncate group-hover:text-blue-700">{c.dimension_label}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{c.qtd}</td>
                                            <td className={`px-5 py-2.5 text-right tabular-nums font-bold ${c.net_realizado < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {fBRL(c.net_realizado)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* Drawer extrato */}
            <Sheet open={drill !== null} onClose={() => setDrill(null)} size="2xl">
                <SheetHeader onClose={() => setDrill(null)}>
                    <SheetTitle>{drill?.label ?? 'Extrato'}</SheetTitle>
                    <SheetDescription>{selected?.name} · {entries[0]?.total_count ?? entries.length} lançamento(s)</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    {entriesLoading ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">Carregando extrato...</div>
                    ) : entries.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">Sem lançamentos.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <tbody>
                                {entries.map(e => (
                                    <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 tabular-nums">{e.transaction_date.split('-').reverse().join('/')}</td>
                                        <td className="px-2 py-2.5">
                                            <p className="text-gray-700 font-medium truncate max-w-[260px]">{e.description || e.category_name || '—'}</p>
                                            <p className="text-xs text-gray-400 truncate">
                                                {[e.category_name, e.project_name].filter(Boolean).join(' · ')}
                                                {e.status === 'PENDING' ? ' · previsto' : ''}
                                            </p>
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${e.direction === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                            {e.direction === 'DEBIT' ? '−' : '+'}{fBRL(e.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default CentralCliente;
