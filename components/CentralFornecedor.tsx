import React from 'react';
import {
    RefreshCw, AlertTriangle, Truck, FileSignature, Wallet, Clock, Receipt, Inbox,
} from 'lucide-react';
import {
    opuraAnalyticsService,
    type OpuraFornecedorKpis,
    type OpuraEntry,
    type OpuraEntryFilters,
    type OpuraPivotRow,
} from '../services/opuraAnalyticsService';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import { KpiCard } from './ui/KpiCard';
import { usePersistedState } from './ui/TableUtils';

// ── Formatadores ──────────────────────────────────────────────────────────────
function fBRL(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `${v.toFixed(1)}%`;
}

interface SupplierLite { id: string; name: string; document: string | null; }

// ── Componente ──────────────────────────────────────────────────────────────────
interface CentralFornecedorProps {
    organizationId: string | null;
}

const CentralFornecedor: React.FC<CentralFornecedorProps> = ({ organizationId }) => {
    const { localToast, showToast } = useToast();
    const now = new Date();
    const [suppliers, setSuppliers] = React.useState<SupplierLite[]>([]);
    const [supplierId, setSupplierId] = usePersistedState<string>('centralFornecedor:supplierId', '');
    const [dateFrom, setDateFrom] = usePersistedState<string>('centralFornecedor:dateFrom', `${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]     = usePersistedState<string>('centralFornecedor:dateTo', `${now.getFullYear()}-12-31`);

    const [kpis, setKpis]       = React.useState<OpuraFornecedorKpis | null>(null);
    const [byProject, setByProject] = React.useState<OpuraPivotRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Drill-down extrato
    const [drill, setDrill] = React.useState<{ label: string } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);

    React.useEffect(() => {
        (async () => {
            // Fornecedores legados têm organization_id = NULL (globais) — incluí-los.
            // Sem organização selecionada ("Todas"), não filtra — a RLS já
            // restringe às organizações do usuário.
            let query = supabase.from('suppliers').select('id, name, document').order('name');
            if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
            const { data, error } = await query;
            if (error) { showToast(`Erro ao carregar fornecedores: ${error.message}`, 'error'); return; }
            const list = (data || []) as SupplierLite[];
            setSuppliers(list);
            setSupplierId(prev => prev || list[0]?.id || '');
        })();
    }, [organizationId, showToast]);

    const selected = suppliers.find(s => s.id === supplierId) ?? null;

    const load = React.useCallback(async () => {
        if (!supplierId) return;
        setLoading(true);
        setError(null);
        try {
            const [k, proj] = await Promise.all([
                opuraAnalyticsService.fornecedorKpis(organizationId, supplierId, dateFrom, dateTo),
                opuraAnalyticsService.pivot(organizationId, 'project', { supplierId, dateFrom, dateTo }),
            ]);
            setKpis(k);
            setByProject(proj);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setKpis(null); setByProject([]); setError(msg);
            showToast(`Erro ao carregar Central de Fornecedores: ${msg}`, 'error');
            console.error('[CentralFornecedor]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, supplierId, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const openDrill = React.useCallback(async (row: OpuraPivotRow) => {
        setDrill({ label: row.dimension_label });
        setEntries([]); setEntriesLoading(true);
        try {
            const f: OpuraEntryFilters = { supplierId, dateFrom, dateTo, projectId: row.dimension_key ?? undefined };
            setEntries(await opuraAnalyticsService.entries(organizationId, f, 200, 0));
        } catch (e: unknown) {
            showToast(`Erro ao carregar extrato: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setEntriesLoading(false);
        }
    }, [organizationId, supplierId, dateFrom, dateTo, showToast]);

    // Derivados
    const contratado = kpis?.contratado ?? 0;
    const pago = kpis?.pago ?? 0;
    const aPagar = kpis?.a_pagar ?? 0;
    const vencido = kpis?.vencido ?? 0;
    const totalDevido = pago + aPagar;
    const pctPago = totalDevido > 0 ? (pago / totalDevido) * 100 : null;

    const curvaMax = Math.max(1, contratado, totalDevido, pago);
    const curva = [
        { label: 'Contratado', value: contratado,  color: 'bg-slate-400' },
        { label: 'Lançado',    value: totalDevido,  color: 'bg-blue-500' },
        { label: 'Pago',       value: pago,         color: 'bg-emerald-500' },
    ];
    const maxProjAbs = Math.max(1, ...byProject.map(c => Math.abs(c.net_realizado)));
    const hasLedger = (kpis?.qtd_lancamentos ?? 0) > 0;

    return (
        <div className="space-y-6">
            {/* Header (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Truck className="w-7 h-7 text-indigo-600" /> Central de Fornecedores
                </h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Contratado × Pago × Saldo aberto — por fornecedor.</p>
            </div>

            {/* Filtro (régua compacta, §5.1/§16) — obrigatório definir fornecedor/período antes dos KPIs */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                    className="h-9 border border-gray-200 rounded-[6px] px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-w-[280px] w-full md:w-auto">
                    {suppliers.length === 0 && <option value="">Nenhum fornecedor</option>}
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="flex items-center gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="h-9 border border-gray-200 rounded-[6px] px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="h-9 border border-gray-200 rounded-[6px] px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <button onClick={load} disabled={loading} title="Atualizar"
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50 shrink-0">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error ? (
                <div className="bg-white rounded-[10px] border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-[6px] bg-red-50 text-red-500 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar a Central de Fornecedores</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <button onClick={load}
                        className="mt-2 flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        <RefreshCw className="w-[15px] h-[15px]" /> Tentar novamente
                    </button>
                </div>
            ) : !supplierId ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">Selecione um fornecedor.</div>
            ) : (
                <>
                    {/* KPIs (§4) */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <KpiCard label="Contratado"   value={fBRL(contratado)} sub={`${kpis?.qtd_contratos ?? 0} contrato(s)`} icon={<FileSignature className="w-5 h-5" />} color="gray" />
                        <KpiCard label="Pago"         value={fBRL(pago)}       sub={pctPago !== null ? `${fPct(pctPago)} do lançado` : undefined} icon={<Receipt className="w-5 h-5" />} color="emerald" />
                        <KpiCard label="A pagar"      value={fBRL(aPagar)}     sub="saldo em aberto" icon={<Wallet className="w-5 h-5" />} color="amber" />
                        <KpiCard label="Vencido"      value={fBRL(vencido)}    sub="atraso" icon={<Clock className="w-5 h-5" />} color={vencido > 0 ? 'red' : 'gray'} />
                        <KpiCard label="Lançamentos"  value={`${kpis?.qtd_lancamentos ?? 0}`} sub="no período" icon={<Truck className="w-5 h-5" />} color="indigo" />
                    </div>

                    {!hasLedger && (
                        <div className="bg-blue-50 border border-blue-100 rounded-[10px] px-5 py-3 flex items-center gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-blue-800">
                                Sem lançamentos no razão vinculados a este fornecedor. Pagamentos de folha, comissões e
                                custos de obra ainda não carregam fornecedor — a captura na origem alimenta esta tela.
                            </span>
                        </div>
                    )}

                    {/* Curva: Contratado × Lançado × Pago */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Contratado × Lançado × Pago</p>
                        <div className="space-y-3">
                            {curva.map(c => (
                                <div key={c.label} className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-gray-500 w-24 flex-shrink-0">{c.label}</span>
                                    <div className="flex-1 h-5 rounded-[6px] bg-gray-50 overflow-hidden">
                                        <div className={`h-full ${c.color} rounded-[6px] transition-all`} style={{ width: `${c.value / curvaMax * 100}%` }} />
                                    </div>
                                    <span className="text-sm font-black text-gray-800 tabular-nums w-32 text-right flex-shrink-0">{fBRL(c.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Fornecedor por Obra (clicável → extrato) */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-5 pt-5 pb-2">Por Obra <span className="text-gray-300 normal-case font-medium">· clique para o extrato</span></p>
                        {loading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="mt-2 text-sm text-gray-400">Carregando...</p>
                            </div>
                        ) : byProject.length === 0 ? (
                            <div className="text-center py-10">
                                <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">Sem lançamentos no período.</p>
                            </div>
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
                                                    <span className="text-sm font-normal text-gray-700 truncate group-hover:text-blue-700">{c.dimension_label}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-sm font-normal text-gray-400">{c.qtd}</td>
                                            <td className={`px-5 py-2.5 text-right tabular-nums text-sm font-medium ${c.net_realizado < 0 ? 'text-red-600' : 'text-gray-900'}`}>
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
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-sm text-gray-400">Carregando extrato...</p>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-10">
                            <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">Sem lançamentos.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <tbody>
                                {entries.map(e => (
                                    <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-2.5 whitespace-nowrap text-sm font-normal text-gray-500 tabular-nums">{e.transaction_date.split('-').reverse().join('/')}</td>
                                        <td className="px-2 py-2.5">
                                            <p className="text-sm font-normal text-gray-700 truncate max-w-[260px]">{e.description || e.category_name || '—'}</p>
                                            <p className="text-xs text-gray-400 truncate">
                                                {[e.category_name, e.project_name].filter(Boolean).join(' · ')}
                                                {e.status === 'PENDING' ? ' · previsto' : ''}
                                            </p>
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${e.direction === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                            {e.direction === 'DEBIT' ? '−' : '+'}{fBRL(e.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </SheetPanel>
            </Sheet>

            {/* Toast de notificação (§13) */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default CentralFornecedor;
