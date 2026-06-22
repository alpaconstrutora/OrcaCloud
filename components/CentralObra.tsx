import React from 'react';
import {
    RefreshCw, AlertTriangle, Building2, TrendingUp, TrendingDown,
    Wallet, FileSignature, Target, Percent,
} from 'lucide-react';
import {
    opuraAnalyticsService,
    type OpuraObraKpis,
    type OpuraEntry,
    type OpuraEntryFilters,
    type OpuraPivotRow,
} from '../services/opuraAnalyticsService';
import type { BudgetEntry } from '../types/budget';
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

// ── Orçado: fórmula canônica do orçamento (Σ qty·preço·(1+bdi/100)) ─────────────
interface ProjectLite {
    id: string;
    name: string;
    budget: BudgetEntry[] | null;
    settings: { bdi?: number; classification?: string } | null;
}
function calcOrcado(p: ProjectLite): number {
    const budget = Array.isArray(p.budget) ? p.budget : [];
    const settingsBdi = p.settings?.bdi ?? 0;
    return budget.reduce((acc, item) => {
        const price = item.sinapiItem?.price || 0;
        const qty = item.quantity || 0;
        const bdi = item.bdi ?? settingsBdi;
        return acc + qty * price * (1 + bdi / 100);
    }, 0);
}

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
interface CentralObraProps {
    organizationId: string;
}

const CentralObra: React.FC<CentralObraProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [projects, setProjects] = React.useState<ProjectLite[]>([]);
    const [projectId, setProjectId] = React.useState<string>('');
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]     = React.useState(`${now.getFullYear()}-12-31`);

    const [kpis, setKpis]       = React.useState<OpuraObraKpis | null>(null);
    const [byCategory, setByCategory] = React.useState<OpuraPivotRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Drill-down extrato
    const [drill, setDrill] = React.useState<{ label: string } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);

    // Carrega a lista de obras uma vez
    React.useEffect(() => {
        if (!organizationId) return;
        (async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('id, name, budget, settings')
                .eq('organization_id', organizationId)
                .order('name');
            if (error) { showToast(`Erro ao carregar obras: ${error.message}`, 'error'); return; }
            const all = (data || []) as ProjectLite[];
            // prioriza classificação OBRA; se nenhuma marcada, mostra todas
            const obras = all.filter(p => p.settings?.classification === 'OBRA');
            const list = obras.length > 0 ? obras : all;
            setProjects(list);
            setProjectId(prev => prev || list[0]?.id || '');
        })();
    }, [organizationId, showToast]);

    const selected = projects.find(p => p.id === projectId) ?? null;
    const orcado = selected ? calcOrcado(selected) : 0;

    const load = React.useCallback(async () => {
        if (!organizationId || !projectId) return;
        setLoading(true);
        setError(null);
        try {
            const [k, cat] = await Promise.all([
                opuraAnalyticsService.obraKpis(organizationId, projectId, dateFrom, dateTo),
                opuraAnalyticsService.pivot(organizationId, 'category', { projectId, dateFrom, dateTo }),
            ]);
            setKpis(k);
            setByCategory(cat);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setKpis(null); setByCategory([]); setError(msg);
            showToast(`Erro ao carregar Central de Obras: ${msg}`, 'error');
            console.error('[CentralObra]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, projectId, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const openDrill = React.useCallback(async (row: OpuraPivotRow) => {
        setDrill({ label: row.dimension_label });
        setEntries([]); setEntriesLoading(true);
        try {
            const f: OpuraEntryFilters = { projectId, dateFrom, dateTo, categoryId: row.dimension_key ?? undefined };
            setEntries(await opuraAnalyticsService.entries(organizationId, f, 200, 0));
        } catch (e: unknown) {
            showToast(`Erro ao carregar extrato: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setEntriesLoading(false);
        }
    }, [organizationId, projectId, dateFrom, dateTo, showToast]);

    // Derivados
    const recebido = kpis?.recebido ?? 0;
    const pago = kpis?.pago ?? 0;
    const contratadoCusto = kpis?.contratado_custo ?? 0;
    const contratadoReceita = kpis?.contratado_receita ?? 0;
    const resultado = recebido - pago;
    const margem = recebido > 0 ? (resultado / recebido) * 100 : null;
    const vencido = (kpis?.vencido_pagar ?? 0) + (kpis?.vencido_receber ?? 0);

    // Curva: Orçado × Contratado(custo) × Pago (base = maior dos três)
    const curvaMax = Math.max(1, orcado, contratadoCusto, pago);
    const curva = [
        { label: 'Orçado',     value: orcado,          color: 'bg-slate-400' },
        { label: 'Contratado', value: contratadoCusto, color: 'bg-blue-500' },
        { label: 'Pago',       value: pago,            color: 'bg-emerald-500' },
    ];
    const maxCatAbs = Math.max(1, ...byCategory.map(c => Math.abs(c.net_realizado)));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Building2 className="w-7 h-7 text-orange-500" /> Central de Obras
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">Orçado × Contratado × Pago × Recebido — por obra.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 max-w-[240px]">
                        {projects.length === 0 && <option value="">Nenhuma obra</option>}
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar a Central de Obras</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <button onClick={load} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                </div>
            ) : !projectId ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">Selecione uma obra.</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                        <KPICard label="Orçado"     value={fBRL(orcado)}            icon={Target}        color="bg-slate-50 text-slate-600" />
                        <KPICard label="Contratado" value={fBRL(contratadoCusto)}   sub={`Receita: ${fBRL(contratadoReceita)}`} icon={FileSignature} color="bg-blue-50 text-blue-600" />
                        <KPICard label="Recebido"   value={fBRL(recebido)}          sub={`A receber: ${fBRL(kpis?.a_receber ?? 0)}`} icon={TrendingUp}   color="bg-green-50 text-green-600" />
                        <KPICard label="Pago"       value={fBRL(pago)}              sub={`A pagar: ${fBRL(kpis?.a_pagar ?? 0)}`}     icon={Wallet}      color="bg-red-50 text-red-600" />
                        <KPICard label="Resultado"  value={fBRL(resultado)}         sub="Recebido − Pago" icon={resultado < 0 ? TrendingDown : TrendingUp} color={resultado < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} />
                        <KPICard label="Margem"     value={fPct(margem)}            sub="sobre recebido"  icon={Percent}       color="bg-purple-50 text-purple-600" />
                    </div>

                    {vencido > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 flex items-center gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <span className="text-amber-800 font-medium">
                                Vencido: <strong>{fBRL(kpis?.vencido_pagar ?? 0)}</strong> a pagar ·{' '}
                                <strong>{fBRL(kpis?.vencido_receber ?? 0)}</strong> a receber
                            </span>
                        </div>
                    )}

                    {/* Curva financeira: Orçado × Contratado × Pago */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Curva Financeira — Orçado × Contratado × Pago</p>
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
                        {orcado > 0 && (
                            <p className="text-xs text-gray-400 mt-3">
                                Consumo do orçado: <strong className="text-gray-600">{fPct(pago / orcado * 100)}</strong> pago ·{' '}
                                <strong className="text-gray-600">{fPct(contratadoCusto / orcado * 100)}</strong> contratado
                            </p>
                        )}
                    </div>

                    {/* Breakdown por categoria (clicável → extrato) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-5 pt-5 pb-2">Por Categoria <span className="text-gray-300 normal-case font-medium">· clique para o extrato</span></p>
                        {loading ? (
                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Carregando...</div>
                        ) : byCategory.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Sem lançamentos no período.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <tbody>
                                    {byCategory.map((c, i) => (
                                        <tr key={c.dimension_key ?? `c-${i}`} onClick={() => openDrill(c)}
                                            className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer group">
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden flex-shrink-0" style={{ width: 60 }}>
                                                        <div className="h-full bg-blue-500" style={{ width: `${Math.abs(c.net_realizado) / maxCatAbs * 100}%` }} />
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
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {[e.category_name, e.supplier_name || e.client_name].filter(Boolean).join(' · ')}
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

export default CentralObra;
