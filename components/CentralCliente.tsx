import React from 'react';
import {
    RefreshCw, AlertTriangle, Users, TrendingUp, FileSignature,
    Wallet, Receipt, Clock,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import {
    opuraAnalyticsService,
    type OpuraClienteKpis,
    type OpuraEntry,
    type OpuraEntryFilters,
    type OpuraPivotRow,
} from '../services/opuraAnalyticsService';
import { supabase } from '../lib/supabase';
import { clientCategoryService } from '../services/clientCategoryService';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import ClientSelect from './ClientSelect';
import Button from './ui/Button';
import { SegmentedProgress } from './ui/SegmentedProgress';
import { usePersistedState } from './ui/TableUtils';
import { montarSeriePrevistoRealizado, type Granularidade } from '../lib/opuraPrevistoRealizadoSerie';

// ── Formatadores ──────────────────────────────────────────────────────────────
function fBRL(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `${v.toFixed(1)}%`;
}

/** Tick de eixo: "12 mil" / "1,2 mi" — o eixo é régua, não valor; a moeda
 *  está no subtítulo e no tooltip, e "R$ 10 mil" quebrava em duas linhas. */
function compactAxis(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1_000) return `${Math.round(v / 1_000).toLocaleString('pt-BR')} mil`;
    return String(Math.round(v));
}

/** Ticks "redondos" para o eixo de valor (0 · 1 mil · 2 mil …). O automático
 *  do Recharts devolve 0/950/1900/2850, e o formatador compacto arredondaria
 *  2850 para "3 mil" — rótulo mentindo sobre a linha em que está. */
function niceTicks(max: number, count = 4): number[] {
    if (!(max > 0)) return [0];
    const bruto = max / count;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const frac = bruto / pot;
    const passo = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pot;
    const ticks: number[] = [];
    for (let t = 0; t <= max + passo * 0.999; t += passo) ticks.push(Math.round(t * 1000) / 1000);
    return ticks;
}

interface ClientLite { id: string; name: string; document: string | null; category: string | null; }

/** Valor do seletor de cliente que significa "todos os clientes (do tipo escolhido)". */
const TODOS_CLIENTES = '__todos__';
/** Valor do filtro de tipo que significa "todos os tipos". */
const TODOS_TIPOS = '';

// ── Cromo do gráfico (guia §28, mesmos valores de RentalAnalysisOverview) ──────
const GRID = '#f1f5f9';
const TICK = { fontSize: 11, fill: '#64748b' };
const TOOLTIP_STYLE = {
    backgroundColor: '#fff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    fontSize: 12,
};
const TOOLTIP_CURSOR = { fill: '#f8fafc' };
/** Medida do PRIMEIRO render, antes de o container ser medido — sem isto o
 *  Recharts avisa "width(-1)" no console a cada gráfico montado. */
const INITIAL_DIMENSION = { width: 520, height: 200 };
/** Forma "ênfase" (§28.4): realizado é a série, previsto é o contexto em cinza
 *  recessivo — validado com o script do dataviz; o cinza reprova no piso de
 *  croma DE PROPÓSITO e exige legenda + valores visíveis (abaixo). */
const SERIE_REALIZADO = '#3b82f6';
const SERIE_PREVISTO = '#94a3b8';

const ChartCard: React.FC<{
    title: string;
    subtitle?: string;
    /** Controle à direita do título (ex.: alternador de granularidade). */
    aside?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, aside, children }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-col">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {aside}
        </div>
        <div className="mt-3 flex-1 min-h-0">{children}</div>
    </div>
);

/** Estado vazio de um card de gráfico — texto só, sem ícone grande (§28.5). */
const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-center min-h-[160px] text-sm text-gray-400 text-center px-4">
        {children}
    </div>
);

/** Legenda HTML — obrigatória com 2+ séries (a identidade nunca fica só na cor). */
const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        {items.map(i => (
            <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: i.color }} />
                {i.label}
            </span>
        ))}
    </div>
);

/** Alternador Mensal / Anual — trilho de abas do §19.1, em `h-7`. */
const GRANULARIDADES: { id: Granularidade; label: string }[] = [
    { id: 'mensal', label: 'Mensal' },
    { id: 'anual', label: 'Anual' },
];
const GranularidadeToggle: React.FC<{ value: Granularidade; onChange: (g: Granularidade) => void }> = ({ value, onChange }) => (
    <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0" role="tablist" aria-label="Período do gráfico">
        {GRANULARIDADES.map(g => (
            <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={value === g.id}
                onClick={() => onChange(g.id)}
                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                    value === g.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                }`}
            >
                {g.label}
            </button>
        ))}
    </div>
);

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
    organizationId: string | null;
}

const CentralCliente: React.FC<CentralClienteProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [clients, setClients] = React.useState<ClientLite[]>([]);
    // "Todos os clientes" é o padrão: a tela abria no 1º cliente em ordem
    // alfabética, que costuma não ter lançamento — e parecia zerada (14/09/2026).
    const [clientId, setClientId] = React.useState<string>(TODOS_CLIENTES);
    // Tipo de cliente = clients.category (catálogo Configurações › Tipos de
    // Clientes). Filtro de tela → persiste (§3).
    const [tipo, setTipo] = usePersistedState<string>('centralCliente:tipo', TODOS_TIPOS);
    const [tiposCatalogo, setTiposCatalogo] = React.useState<string[]>([]);
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]     = React.useState(`${now.getFullYear()}-12-31`);

    const [kpis, setKpis]       = React.useState<OpuraClienteKpis | null>(null);
    const [byProject, setByProject] = React.useState<OpuraPivotRow[]>([]);
    // Série do gráfico Previsto × Realizado: pivot por mês do lançamento, com
    // o MESMO recorte (cliente + período + transaction_date) dos KPIs.
    const [byMonth, setByMonth] = React.useState<OpuraPivotRow[]>([]);
    const [granularidade, setGranularidade] = usePersistedState<Granularidade>('centralCliente:granularidade', 'mensal');
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Drill-down extrato
    const [drill, setDrill] = React.useState<{ label: string } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);

    React.useEffect(() => {
        (async () => {
            // Clientes legados têm organization_id = NULL (globais) — incluí-los,
            // como faz o clientService padrão. Sem organização selecionada
            // ("Todas"), não filtra — a RLS já restringe às organizações do usuário.
            let query = supabase.from('clients').select('id, name, document, category').order('name');
            if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
            const [{ data, error }, catalogo] = await Promise.all([
                query,
                // Catálogo de tipos (com os padrões virtuais). Falha aqui não
                // derruba a tela: o filtro ainda lista os tipos presentes nos clientes.
                clientCategoryService.list(organizationId || undefined).catch(() => []),
            ]);
            if (error) { showToast(`Erro ao carregar clientes: ${error.message}`, 'error'); return; }
            setClients((data || []) as ClientLite[]);
            setTiposCatalogo(catalogo.map(c => c.name));
        })();
    }, [organizationId, showToast]);

    // Opções do filtro: catálogo ∪ tipos que os clientes carregados realmente
    // têm — um tipo apagado do catálogo mas ainda usado não some do filtro.
    const tipos = React.useMemo(() => {
        const set = new Set<string>(tiposCatalogo.map(t => t.trim()).filter(Boolean));
        for (const c of clients) if (c.category?.trim()) set.add(c.category.trim());
        return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [tiposCatalogo, clients]);
    // Tipo persistido que não existe mais nesta organização = "todos os tipos".
    const tipoAtivo = tipo && tipos.includes(tipo) ? tipo : TODOS_TIPOS;

    // Clientes que o seletor oferece e que "Todos os clientes" agrega.
    const clientesDoTipo = React.useMemo(
        () => tipoAtivo ? clients.filter(c => (c.category ?? '').trim() === tipoAtivo) : clients,
        [clients, tipoAtivo],
    );
    // Cliente escolhido saiu do recorte (trocou o tipo) → volta para "Todos".
    React.useEffect(() => {
        if (clientId !== TODOS_CLIENTES && !clientesDoTipo.some(c => c.id === clientId)) setClientId(TODOS_CLIENTES);
    }, [clientesDoTipo, clientId]);

    const todos = clientId === TODOS_CLIENTES;
    const selected = todos ? null : (clients.find(c => c.id === clientId) ?? null);
    // Lista de ids que a RPC recebe em "Todos" (já recortada por org + tipo).
    const clientIds = React.useMemo(() => (todos ? clientesDoTipo.map(c => c.id) : undefined), [todos, clientesDoTipo]);
    const escopoLabel = todos
        ? (tipoAtivo ? `Todos os clientes · ${tipoAtivo}` : 'Todos os clientes')
        : (selected?.name ?? '');

    // Sequência da última carga: trocar tipo/cliente dispara nova RPC e a
    // anterior (47 ids, mais lenta) pode responder DEPOIS — sem isto ela
    // sobrescrevia o recorte novo com os números velhos (visto no harness, 14/09).
    const loadSeq = React.useRef(0);

    const load = React.useCallback(async () => {
        if (!clientId) return;
        const seq = ++loadSeq.current;
        // "Todos" sem nenhum cliente no recorte: não há o que somar (e a RPC
        // exige cliente ou lista) — zera sem ir à rede.
        if (clientIds && clientIds.length === 0) { setKpis(null); setByProject([]); setByMonth([]); return; }
        setLoading(true);
        setError(null);
        try {
            const filtro = clientIds ? { clientIds, dateFrom, dateTo } : { clientId, dateFrom, dateTo };
            const [k, proj, meses] = await Promise.all([
                opuraAnalyticsService.clienteKpis(organizationId, clientIds ? null : clientId, dateFrom, dateTo, clientIds),
                opuraAnalyticsService.pivot(organizationId, 'project', filtro),
                opuraAnalyticsService.pivot(organizationId, 'tx_month', filtro),
            ]);
            if (seq !== loadSeq.current) return; // resposta de um recorte que já não é o da tela
            setKpis(k);
            setByProject(proj);
            setByMonth(meses);
        } catch (e: unknown) {
            if (seq !== loadSeq.current) return;
            const msg = e instanceof Error ? e.message : String(e);
            setKpis(null); setByProject([]); setByMonth([]); setError(msg);
            showToast(`Erro ao carregar Central de Clientes: ${msg}`, 'error');
            console.error('[CentralCliente]', e);
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, [organizationId, clientId, clientIds, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const openDrill = React.useCallback(async (row: OpuraPivotRow) => {
        setDrill({ label: row.dimension_label });
        setEntries([]); setEntriesLoading(true);
        try {
            const f: OpuraEntryFilters = clientIds
                ? { clientIds, dateFrom, dateTo, projectId: row.dimension_key ?? undefined }
                : { clientId, dateFrom, dateTo, projectId: row.dimension_key ?? undefined };
            setEntries(await opuraAnalyticsService.entries(organizationId, f, 200, 0));
        } catch (e: unknown) {
            showToast(`Erro ao carregar extrato: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setEntriesLoading(false);
        }
    }, [organizationId, clientId, clientIds, dateFrom, dateTo, showToast]);

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

    // Gráfico Previsto × Realizado — todos os períodos do intervalo, vazio = 0.
    const serie = React.useMemo(
        () => montarSeriePrevistoRealizado(byMonth, dateFrom, dateTo, granularidade),
        [byMonth, dateFrom, dateTo, granularidade],
    );
    const serieMax = Math.max(0, ...serie.map(p => Math.max(p.previsto, p.realizado)));
    const yTicks = niceTicks(serieMax);
    const totalPrevisto = serie.reduce((a, p) => a + p.previsto, 0);
    const totalRealizado = serie.reduce((a, p) => a + p.realizado, 0);
    const pctRealizadoSerie = totalPrevisto + totalRealizado > 0 ? (totalRealizado / (totalPrevisto + totalRealizado)) * 100 : null;
    // Acima disto os rótulos de mês colidem mesmo em card de largura inteira.
    const MESES_MAX_VISAO_MENSAL = 60;
    // `barSize` FIXO, não `maxBarSize`: com maxBarSize o Recharts centraliza
    // cada barra no próprio slot e o par Previsto/Realizado do mesmo período
    // se afasta (~80px na visão anual). Com barSize fixo ele encosta as duas
    // (barGap) e centraliza o par na banda; se não couber, reduz sozinho.
    const barSize = serie.length <= 12 ? 24 : serie.length <= 24 ? 14 : 10;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Users className="w-7 h-7 text-blue-600" /> Central de Clientes
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Contratado × Faturado × Recebido — por cliente.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Tipo de cliente — recorta o seletor e o "Todos". */}
                    <select
                        value={tipoAtivo}
                        onChange={e => setTipo(e.target.value)}
                        title="Tipo de cliente"
                        className="h-9 pl-3 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer max-w-[220px]"
                    >
                        <option value={TODOS_TIPOS}>Todos os tipos</option>
                        {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {/* Escopo da tela: um cliente do tipo, ou todos eles (sem "limpar"). */}
                    <div className="w-[260px]">
                        <ClientSelect
                            clients={clientesDoTipo}
                            value={clientId}
                            onChange={setClientId}
                            allowClear={false}
                            allOption={{ id: TODOS_CLIENTES, label: tipoAtivo ? `Todos os clientes · ${tipoAtivo}` : 'Todos os clientes' }}
                            disabled={clients.length === 0}
                            placeholder={clients.length === 0 ? 'Nenhum cliente' : 'Selecionar cliente...'}
                            triggerClassName="w-full h-9 border border-gray-200 rounded-[6px] text-sm bg-white focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <Button onClick={load} disabled={loading}
                        className="text-sm gap-2">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar a Central de Clientes</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <Button onClick={load} className="mt-2 text-sm gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </Button>
                </div>
            ) : !clientId ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">Selecione um cliente.</div>
            ) : clientIds && clientIds.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                    {clients.length === 0 ? 'Nenhum cliente cadastrado.' : `Nenhum cliente do tipo "${tipoAtivo}".`}
                </div>
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

                    {/* Previsto × Realizado por período (guia §28) — mesma base
                        dos KPIs Saldo devedor (previsto) e Recebido (realizado). */}
                    <ChartCard
                        title="Previsto × Realizado por período"
                        subtitle={`Lançamentos a receber ${todos ? 'dos clientes do recorte' : 'deste cliente'}, pela data do lançamento: previsto = pendente, realizado = conciliado. A soma fecha com Saldo devedor e Recebido.`}
                        aside={<GranularidadeToggle value={granularidade} onChange={setGranularidade} />}
                    >
                        {loading && byMonth.length === 0 ? (
                            <ChartEmpty>Carregando...</ChartEmpty>
                        ) : serie.length === 0 ? (
                            <ChartEmpty>Período inválido — a data inicial precisa ser anterior à final.</ChartEmpty>
                        ) : granularidade === 'mensal' && serie.length > MESES_MAX_VISAO_MENSAL ? (
                            <ChartEmpty>Período longo demais para a visão mensal ({serie.length} meses). Use a visão anual ou encurte o período.</ChartEmpty>
                        ) : serieMax === 0 ? (
                            <ChartEmpty>Nenhum lançamento a receber {todos ? 'dos clientes do recorte' : 'deste cliente'} no período.</ChartEmpty>
                        ) : (
                            <>
                                <Legend items={[{ label: 'Previsto', color: SERIE_PREVISTO }, { label: 'Realizado', color: SERIE_REALIZADO }]} />
                                <div style={{ height: 220 }}>
                                    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                        <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
                                            <CartesianGrid vertical={false} stroke={GRID} />
                                            <XAxis
                                                dataKey="label"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={TICK}
                                                interval={serie.length <= 12 ? 0 : 'preserveStartEnd'}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={TICK}
                                                tickFormatter={compactAxis}
                                                width={48}
                                                ticks={yTicks}
                                                domain={[0, yTicks[yTicks.length - 1]]}
                                            />
                                            <RechartsTooltip
                                                cursor={TOOLTIP_CURSOR}
                                                contentStyle={TOOLTIP_STYLE}
                                                itemStyle={{ color: '#1f2937' }}
                                                labelStyle={{ color: '#64748b' }}
                                                formatter={(val, name) => [fBRL(Number(val)), name === 'realizado' ? 'Realizado' : 'Previsto']}
                                            />
                                            {/* Sem animação: re-renderiza ao trocar Mensal/Anual, e a
                                                barra que "cresce" a cada clique lê como dado mudando. */}
                                            <Bar dataKey="previsto" fill={SERIE_PREVISTO} radius={[4, 4, 0, 0]} barSize={barSize} isAnimationActive={false} />
                                            <Bar dataKey="realizado" fill={SERIE_REALIZADO} radius={[4, 4, 0, 0]} barSize={barSize} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* A leitura sem passar o mouse — e a "vista de tabela" que o
                                    cinza recessivo do previsto exige. */}
                                <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100">
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-400 truncate">Previsto no período</p>
                                        <p className="text-sm font-medium text-gray-800 truncate">{fBRL(totalPrevisto)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-400 truncate">Realizado no período</p>
                                        <p className="text-sm font-medium text-gray-800 truncate">{fBRL(totalRealizado)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-400 truncate">Realizado sobre o total</p>
                                        <p className="text-sm font-medium text-gray-800 truncate">{fPct(pctRealizadoSerie)}</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </ChartCard>

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
                                                    <span className="text-sm font-normal text-gray-700 truncate group-hover:text-blue-700">{c.dimension_label}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-sm font-normal text-gray-400">{c.qtd}</td>
                                            <td className={`px-5 py-2.5 text-right tabular-nums text-sm font-medium ${c.net_realizado < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {fBRL(c.net_realizado)}
                                            </td>
                                            {/* §29 — proporção desta linha em relação ao maior realizado da lista */}
                                            <td className="px-5 py-2.5 w-44">
                                                <SegmentedProgress percent={Math.abs(c.net_realizado) / maxProjAbs * 100} title="Realizado desta linha em relação ao maior da lista" />
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
                    <SheetDescription>{escopoLabel} · {entries[0]?.total_count ?? entries.length} lançamento(s)</SheetDescription>
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
        </div>
    );
};

export default CentralCliente;
