import React from 'react';
import {
    RefreshCw, AlertTriangle, TrendingUp, FileSignature, Receipt, Clock, Inbox, X,
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
import { useOrgContext } from '../hooks/useOrgContext';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import ClientSelect from './ClientSelect';
import Button from './ui/Button';
import { KpiCard, type KpiTom } from './ui/KpiCard';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
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
    return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function plural(n: number, um: string, varios: string): string {
    return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}
function fData(iso: string | null): string {
    return iso ? iso.split('-').reverse().join('/') : '—';
}
/** Texto do erro em qualquer formato: o Supabase devolve objeto `{ message }`
 *  que não é `Error`, e `String(e)` virava "[object Object]" na tela (28/10/2026). */
function mensagemDeErro(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        return (e as { message: string }).message;
    }
    return String(e);
}

/** Data pronta para virar período: ano de 4 dígitos ≥ 1900. Enquanto se digita
 *  o ano, o Chrome emite "0002-01-01", "0020-01-01"… e cada um disparava 3 RPCs
 *  (e uma série de milhares de meses). */
function dataCompleta(v: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900;
}

/** Dias desde o vencimento (0 = vence hoje ou ainda não venceu). */
function diasVencido(dueDate: string | null, hoje: string): number {
    if (!dueDate || dueDate >= hoje) return 0;
    return Math.round((Date.parse(hoje) - Date.parse(dueDate)) / 86_400_000);
}

/** Página do extrato — mesma de Relatórios ÒPURA. */
const ENTRIES_PAGE = 200;

/** Limiares da Inadimplência (guia §4.5: cor só por limiar com nome). Fração do
 *  saldo devedor que já venceu — hipótese de gestão, ajuste aqui. */
const LIMIAR = {
    vencidoSobreAbertoAtencao: 0.10,
    vencidoSobreAbertoAlerta: 0.30,
};

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

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Rótulo do tooltip com o ano: o eixo mostra "jul", e "jul" de que ano? */
function rotuloPeriodo(key: string | undefined): string {
    if (!key) return '';
    const [y, m] = key.split('-').map(Number);
    return m ? `${MESES_EXTENSO[m - 1] ?? key} de ${y}` : String(y);
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
                <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
                {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            {aside}
        </div>
        <div className="mt-3 flex-1 min-h-0">{children}</div>
    </div>
);

/** Estado vazio de um card de gráfico — texto só, sem ícone grande (§28.5). */
const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-center min-h-[160px] text-sm text-gray-500 text-center px-4">
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

/** Alternador Mensal / Anual — trilho do §19.1 em `h-7`. É um alternador (dois
 *  estados do mesmo gráfico), não abas: botões com `aria-pressed`. */
const GRANULARIDADES: { id: Granularidade; label: string }[] = [
    { id: 'mensal', label: 'Mensal' },
    { id: 'anual', label: 'Anual' },
];
const GranularidadeToggle: React.FC<{ value: Granularidade; onChange: (g: Granularidade) => void }> = ({ value, onChange }) => (
    <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0" role="group" aria-label="Período do gráfico">
        {GRANULARIDADES.map(g => (
            <button
                key={g.id}
                type="button"
                aria-pressed={value === g.id}
                onClick={() => onChange(g.id)}
                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    value === g.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                }`}
            >
                {g.label}
            </button>
        ))}
    </div>
);

// ── Tabelas "Por cliente" e "Por obra" ─────────────────────────────────────────
/** Uma linha do pivô lida como recebível: o que foi faturado, o que entrou, o
 *  que falta e quanto disso já venceu. O pivô roda só com entradas (CREDIT), a
 *  mesma base do KPI Inadimplência — a soma da coluna Vencido fecha com ele. */
interface LinhaRecebivel {
    key: string | null;
    nome: string;
    faturado: number;
    recebido: number;
    aberto: number;
    vencido: number;
    pctRecebido: number | null;
    qtd: number;
}
function paraRecebivel(r: OpuraPivotRow): LinhaRecebivel {
    const recebido = Number(r.credit_realizado) || 0;
    const aberto = Number(r.credit_previsto) || 0;
    const faturado = recebido + aberto;
    return {
        key: r.dimension_key,
        nome: r.dimension_label,
        faturado, recebido, aberto,
        vencido: Number(r.vencido) || 0,
        pctRecebido: faturado > 0 ? (recebido / faturado) * 100 : null,
        qtd: Number(r.qtd) || 0,
    };
}
/** Quem mais deve primeiro: é a pergunta da tela. O cabeçalho reordena. */
const porVencido = (a: LinhaRecebivel, b: LinhaRecebivel) => b.vencido - a.vencido || b.aberto - a.aberto;

function colunas(nome: string): StandardTableColumn[] {
    return [
        { key: 'nome', label: nome, sortable: true, width: 280 },
        { key: 'faturado', label: 'Faturado', sortable: true, width: 140, align: 'right' },
        { key: 'recebido', label: 'Recebido', sortable: true, width: 140, align: 'right' },
        { key: 'aberto', label: 'Em aberto', sortable: true, width: 140, align: 'right' },
        { key: 'vencido', label: 'Vencido', sortable: true, width: 150, align: 'right' },
        { key: 'pctRecebido', label: 'Recebido do faturado', sortable: true, width: 180 },
        { key: 'qtd', label: 'Lançamentos', sortable: true, width: 120, align: 'right' },
    ];
}
const COLUNAS_CLIENTE = colunas('Cliente');
const COLUNAS_OBRA = colunas('Obra');

const sortRecebivel = (key: string, l: LinhaRecebivel) =>
    key === 'nome' ? l.nome : (l[key as keyof LinhaRecebivel] as number | null);

function celulaRecebivel(key: string, l: LinhaRecebivel): React.ReactNode {
    switch (key) {
        case 'nome':
            return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>;
        case 'vencido':
            return l.vencido > 0 ? (
                <span className="inline-flex items-center justify-end gap-1 text-sm font-medium text-red-700 tabular-nums">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {fBRL(l.vencido)}
                </span>
            ) : <span className="text-sm font-medium text-gray-800 tabular-nums">{fBRL(0)}</span>;
        case 'pctRecebido':
            return l.pctRecebido === null
                ? <span className="text-sm text-gray-600">—</span>
                : <SegmentedProgress percent={l.pctRecebido} title="Recebido sobre o faturado desta linha" />;
        case 'qtd':
            return <span className="text-sm font-normal text-gray-600 tabular-nums">{l.qtd.toLocaleString('pt-BR')}</span>;
        default:
            return <span className="text-sm font-medium text-gray-800 tabular-nums">{fBRL(l[key as 'faturado' | 'recebido' | 'aberto'])}</span>;
    }
}

/** Título de seção dentro do card da tabela (mesma anatomia do ChartCard §28.2). */
const TituloSecao: React.FC<{ titulo: string; subtitulo: string }> = ({ titulo, subtitulo }) => (
    <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>
    </div>
);

// ── Componente ──────────────────────────────────────────────────────────────────
interface CentralClienteProps {
    /** Leva à tela onde o número se resolve (ação "Cobrar em Contas a Receber"). */
    onNavigate?: (view: string) => void;
}

const CentralCliente: React.FC<CentralClienteProps> = ({ onNavigate }) => {
    const { showToast } = useToast();
    // REGRA #5: a organização vem do seletor do topo (empresa/obra herdam a
    // org dona). A prop que o AppRouter passava era o valor cru do store — com
    // uma EMPRESA escolhida ficava vazia e a tela somava todas as organizações.
    const { orgId: organizationId } = useOrgContext();
    const now = new Date();
    const hoje = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [clients, setClients] = React.useState<ClientLite[]>([]);
    // Antes da lista chegar ela está vazia — sem isto a tela dizia "Nenhum
    // cliente cadastrado." durante a carga (visto no navegador, 28/10/2026).
    const [clientesCarregados, setClientesCarregados] = React.useState(false);
    // "Todos os clientes" é o padrão: a tela abria no 1º cliente em ordem
    // alfabética, que costuma não ter lançamento — e parecia zerada (14/09/2026).
    const [clientId, setClientId] = React.useState<string>(TODOS_CLIENTES);
    // Tipo de cliente = clients.category (catálogo Configurações › Tipos de
    // Clientes). Filtro de tela → persiste (§3).
    const [tipo, setTipo] = usePersistedState<string>('centralCliente:tipo', TODOS_TIPOS);
    const [tiposCatalogo, setTiposCatalogo] = React.useState<string[]>([]);
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`);
    const [dateTo, setDateTo]     = React.useState(`${now.getFullYear()}-12-31`);
    // O que está no campo (pode estar no meio da digitação); o período acima só
    // muda — e só recarrega — quando a data fica completa.
    const [dateFromInput, setDateFromInput] = React.useState(dateFrom);
    const [dateToInput, setDateToInput]     = React.useState(dateTo);
    // Completa não basta: editando dia/mês, cada tecla já forma uma data válida
    // ("02/01", "20/01", "20/02"…) — medido: 3 cargas ao digitar um dia e um
    // mês. Aplica só depois de 400 ms sem digitar.
    React.useEffect(() => {
        if (!dataCompleta(dateFromInput)) return;
        const t = setTimeout(() => setDateFrom(dateFromInput), 400);
        return () => clearTimeout(t);
    }, [dateFromInput]);
    React.useEffect(() => {
        if (!dataCompleta(dateToInput)) return;
        const t = setTimeout(() => setDateTo(dateToInput), 400);
        return () => clearTimeout(t);
    }, [dateToInput]);

    const [kpis, setKpis]       = React.useState<OpuraClienteKpis | null>(null);
    const [byClient, setByClient] = React.useState<OpuraPivotRow[]>([]);
    const [byProject, setByProject] = React.useState<OpuraPivotRow[]>([]);
    // Série do gráfico Previsto × Realizado: pivot por mês do lançamento, com
    // o MESMO recorte (cliente + período + transaction_date) dos KPIs.
    const [byMonth, setByMonth] = React.useState<OpuraPivotRow[]>([]);
    const [granularidade, setGranularidade] = usePersistedState<Granularidade>('centralCliente:granularidade', 'mensal');
    const [loading, setLoading] = React.useState(false);
    const [error, setError]     = React.useState<string | null>(null);

    // Drill-down extrato. `filters` fica guardado para o "Carregar mais".
    const [drill, setDrill] = React.useState<{ label: string; filters: OpuraEntryFilters } | null>(null);
    const [entries, setEntries] = React.useState<OpuraEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = React.useState(false);
    const [entriesLoadingMore, setEntriesLoadingMore] = React.useState(false);
    const [entriesError, setEntriesError] = React.useState<string | null>(null);
    // Abrir a obra A e logo a B: a resposta de A não pode encher a gaveta de B.
    const drillReq = React.useRef(0);

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
            setClientesCarregados(true);
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
        if (clientIds && clientIds.length === 0) { setKpis(null); setByClient([]); setByProject([]); setByMonth([]); return; }
        setLoading(true);
        setError(null);
        try {
            const filtro = clientIds ? { clientIds, dateFrom, dateTo } : { clientId, dateFrom, dateTo };
            // Tabelas só com entradas (CREDIT): é a base do KPI Inadimplência, e
            // assim a soma da coluna Vencido fecha com ele (o vencido do pivô
            // somaria saídas pendentes também).
            const recebiveis = { ...filtro, direction: 'CREDIT' as const };
            const [k, cli, proj, meses] = await Promise.all([
                opuraAnalyticsService.clienteKpis(organizationId, clientIds ? null : clientId, dateFrom, dateTo, clientIds),
                clientIds ? opuraAnalyticsService.pivot(organizationId, 'client', recebiveis) : Promise.resolve([] as OpuraPivotRow[]),
                opuraAnalyticsService.pivot(organizationId, 'project', recebiveis),
                opuraAnalyticsService.pivot(organizationId, 'tx_month', filtro),
            ]);
            if (seq !== loadSeq.current) return; // resposta de um recorte que já não é o da tela
            setKpis(k);
            setByClient(cli);
            setByProject(proj);
            setByMonth(meses);
        } catch (e: unknown) {
            if (seq !== loadSeq.current) return;
            const msg = mensagemDeErro(e);
            setKpis(null); setByClient([]); setByProject([]); setByMonth([]); setError(msg);
            showToast(`Erro ao carregar Central de Clientes: ${msg}`, 'error');
            console.error('[CentralCliente]', e);
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, [organizationId, clientId, clientIds, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    // Primeira página do extrato. O erro fica DENTRO da gaveta, com "Tentar
    // novamente": antes só ia para o toast, e a gaveta dizia "Sem lançamentos." —
    // uma falha lida como "este cliente não tem nada" (crítica 2, 28/10/2026).
    const carregarExtrato = React.useCallback(async (f: OpuraEntryFilters) => {
        const req = ++drillReq.current;
        setEntries([]); setEntriesError(null); setEntriesLoading(true);
        try {
            const data = await opuraAnalyticsService.entries(organizationId, f, ENTRIES_PAGE, 0);
            if (req === drillReq.current) setEntries(data);
        } catch (e: unknown) {
            if (req === drillReq.current) setEntriesError(mensagemDeErro(e));
        } finally {
            if (req === drillReq.current) setEntriesLoading(false);
        }
    }, [organizationId]);

    const openDrill = React.useCallback((row: LinhaRecebivel) => {
        // "— Sem obra" tem chave NULL: pede as linhas SEM obra. Mandar
        // projectId vazio era "sem filtro" e listava todas as obras.
        const obra: OpuraEntryFilters = row.key ? { projectId: row.key } : { semDimensao: 'project' };
        // Só entradas, como a linha que foi clicada — a quantidade bate.
        const base: OpuraEntryFilters = { dateFrom, dateTo, direction: 'CREDIT', ...obra };
        const f: OpuraEntryFilters = clientIds ? { clientIds, ...base } : { clientId, ...base };
        setDrill({ label: row.nome, filters: f });
        void carregarExtrato(f);
    }, [carregarExtrato, clientId, clientIds, dateFrom, dateTo]);

    const loadMoreEntries = React.useCallback(async () => {
        if (!drill) return;
        const req = drillReq.current;
        setEntriesLoadingMore(true);
        try {
            const data = await opuraAnalyticsService.entries(organizationId, drill.filters, ENTRIES_PAGE, entries.length);
            if (req === drillReq.current) setEntries(prev => [...prev, ...data]);
        } catch (e: unknown) {
            if (req === drillReq.current) showToast(`Erro ao carregar extrato: ${mensagemDeErro(e)}`, 'error');
        } finally {
            if (req === drillReq.current) setEntriesLoadingMore(false);
        }
    }, [drill, entries.length, organizationId, showToast]);

    const closeDrill = React.useCallback(() => {
        drillReq.current++;
        setDrill(null);
        setEntriesLoading(false);
        setEntriesLoadingMore(false);
    }, []);
    const totalEntries = entries[0]?.total_count ?? entries.length;
    const hasMoreEntries = entries.length < totalEntries;

    // Recorte por cliente pelo teclado (crítica 2): Enter numa linha de "Por
    // cliente" desmontava a própria tabela e o foco caía no <body>, sem volta.
    // Agora o foco vai para o chip do recorte; desfazer pelo chip devolve o foco
    // à linha daquele cliente em "Por cliente".
    const chipRef = React.useRef<HTMLButtonElement>(null);
    const porClienteRef = React.useRef<HTMLDivElement>(null);
    const focarChip = React.useRef(false);
    const voltarParaLinha = React.useRef<string | null>(null);
    const recortarPara = (l: LinhaRecebivel) => {
        if (!l.key) return;
        focarChip.current = true;
        setClientId(l.key);
    };
    const voltarParaTodos = () => {
        voltarParaLinha.current = selected?.name ?? null;
        setClientId(TODOS_CLIENTES);
    };
    React.useEffect(() => {
        if (focarChip.current && chipRef.current) { focarChip.current = false; chipRef.current.focus(); }
    }, [clientId]);

    // Derivados
    const contratado = kpis?.contratado ?? 0;
    const recebido = kpis?.recebido ?? 0;
    const aReceber = kpis?.a_receber ?? 0;
    const vencido = kpis?.vencido ?? 0;
    const faturado = recebido + aReceber;
    const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : null);
    const fracaoVencida = aReceber > 0 ? vencido / aReceber : 0;
    const tomInadimplencia: KpiTom = fracaoVencida >= LIMIAR.vencidoSobreAbertoAlerta ? 'alerta'
        : fracaoVencida >= LIMIAR.vencidoSobreAbertoAtencao ? 'atencao' : 'neutro';

    const linhasCliente = React.useMemo(() => byClient.map(paraRecebivel).sort(porVencido), [byClient]);
    const linhasObra = React.useMemo(() => byProject.map(paraRecebivel).sort(porVencido), [byProject]);

    // Voltou para "Todos" pelo chip: quando "Por cliente" recarregar, o foco
    // volta à linha do cliente de onde se saiu (o rótulo começa pelo nome).
    React.useEffect(() => {
        const nome = voltarParaLinha.current;
        if (!nome || !todos || linhasCliente.length === 0) return;
        voltarParaLinha.current = null;
        const linhas = [...(porClienteRef.current?.querySelectorAll<HTMLElement>('tr[tabindex="0"]') ?? [])];
        (linhas.find(tr => tr.getAttribute('aria-label')?.startsWith(`${nome}:`)) ?? linhas[0])?.focus();
    }, [todos, linhasCliente]);

    // Ainda não há número nenhum (1ª carga): KPIs, tabelas e gráfico mostram
    // "carregando", nunca zero nem "nenhuma entrada".
    const semNumeros = kpis === null;

    // Anúncio do recorte para leitor de tela: trocar cliente/tipo/período
    // mudava todos os números sem nenhum aviso.
    const anuncio = loading ? `Carregando ${escopoLabel}…`
        : kpis ? `Mostrando ${escopoLabel}: ${fBRL(vencido)} vencido de ${fBRL(aReceber)} em aberto.`
        : '';

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

    const controle = 'h-9 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

    return (
        <div className="space-y-6">
            {/* Cabeçalho (§20): h1 + p, controles de escopo à direita só a partir
                de 1536 px — em 1280, ao lado dos ~920 px de controles, o título
                quebrava em duas linhas. */}
            <div className="flex flex-col 2xl:flex-row 2xl:items-end justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Central de Clientes</h1>
                        {/* Recorte ativo, e o caminho de volta (mouse e teclado). */}
                        {!todos && selected && (
                            <button
                                ref={chipRef}
                                type="button"
                                onClick={voltarParaTodos}
                                aria-label={`Recorte: ${selected.name}. Voltar para todos os clientes`}
                                title="Voltar para todos os clientes"
                                className="inline-flex items-center gap-1.5 h-8 max-w-full pl-3 pr-2 rounded-[6px] border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                            >
                                <span className="truncate">Cliente: {selected.name}</span>
                                <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Contratado × Faturado × Recebido — por cliente.</p>
                    <p role="status" className="sr-only">{anuncio}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Tipo de cliente — recorta o seletor e o "Todos". */}
                    <select
                        value={tipoAtivo}
                        onChange={e => setTipo(e.target.value)}
                        aria-label="Tipo de cliente"
                        title="Tipo de cliente"
                        className={`${controle} pl-3 pr-8 cursor-pointer w-full sm:w-auto sm:max-w-[220px]`}
                    >
                        <option value={TODOS_TIPOS}>Todos os tipos</option>
                        {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {/* Escopo da tela: um cliente do tipo, ou todos eles (sem "limpar"). */}
                    <div className="w-full sm:w-[260px]">
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
                    <div className="flex items-center gap-2">
                        <input type="date" value={dateFromInput} aria-label="Data inicial do período"
                            onChange={e => setDateFromInput(e.target.value)}
                            className={`${controle} px-3`} />
                        <span className="text-gray-500 text-sm">até</span>
                        <input type="date" value={dateToInput} aria-label="Data final do período"
                            onChange={e => setDateToInput(e.target.value)}
                            className={`${controle} px-3`} />
                    </div>
                    <Button variant="secondary" onClick={load} disabled={loading} className="text-sm gap-2">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="bg-white rounded-[10px] border border-red-100 shadow-sm p-8 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar a Central de Clientes</p>
                    <p className="text-xs text-gray-500 max-w-md break-words">{error}</p>
                    <Button onClick={load} className="mt-2 text-sm gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </Button>
                </div>
            ) : !clientId ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-500">Selecione um cliente.</div>
            ) : clientesCarregados && clientIds && clientIds.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-500">
                    {clients.length === 0 ? 'Nenhum cliente cadastrado.' : `Nenhum cliente do tipo "${tipoAtivo}".`}
                </div>
            ) : (
                <>
                    {/* Indicadores (§4.5 `destaque`): cor só por limiar. A
                        Inadimplência é a pergunta da tela — leva à cobrança.
                        2×2 até 1536 px: em 4 colunas, com a barra lateral, um
                        valor de milhões não cabe no card. */}
                    {semNumeros ? (
                        // Esqueleto enquanto não há número (§28.5): a tela não afirma
                        // "R$ 0,00 · nada em aberto" — dizia, e era falso. Não depende
                        // de `loading`: entre a lista de clientes chegar e o efeito de
                        // carga ligar o `loading` há um quadro pintado (medido).
                        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3" aria-busy="true" aria-label="Carregando indicadores">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 space-y-2.5">
                                    <div className="h-3.5 w-24 rounded bg-gray-100 motion-safe:animate-pulse" />
                                    <div className="h-7 w-40 max-w-full rounded bg-gray-100 motion-safe:animate-pulse" />
                                    <div className="h-3 w-32 rounded bg-gray-100 motion-safe:animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : (
                    <div className={`grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
                        <KpiCard destaque label="Contratado" icon={<FileSignature />}
                            value={fBRL(contratado)}
                            sub={plural(kpis?.qtd_contratos ?? 0, 'contrato', 'contratos')} />
                        <KpiCard destaque label="Faturado" icon={<Receipt />}
                            value={fBRL(faturado)}
                            sub={pct(faturado, contratado) !== null ? `recebido + a receber · ${fPct(pct(faturado, contratado))} do contratado` : 'recebido + a receber'} />
                        <KpiCard destaque label="Recebido" icon={<TrendingUp />}
                            value={fBRL(recebido)}
                            sub={pct(recebido, faturado) !== null ? `${fPct(pct(recebido, faturado))} do faturado` : undefined} />
                        <KpiCard destaque label="Inadimplência" icon={<Clock />}
                            value={fBRL(vencido)}
                            sub={aReceber > 0 ? `${fPct(fracaoVencida * 100)} do saldo devedor de ${fBRL(aReceber)}` : 'nada em aberto'}
                            tom={tomInadimplencia}
                            acao={vencido > 0 && onNavigate ? { label: 'Cobrar em Contas a Receber', onClick: () => onNavigate('contas-a-receber') } : undefined} />
                    </div>
                    )}

                    {/* Quem deve: a quebra que o subtítulo promete. Só em "Todos". */}
                    {todos && (
                        <div ref={porClienteRef}>
                        <StandardTable<LinhaRecebivel>
                            storageKey="centralCliente:porCliente"
                            toolbarTop={<TituloSecao titulo="Por cliente" subtitulo="Entradas do período, de quem mais deve para quem menos deve. Clique num cliente para ver só ele." />}
                            columns={COLUNAS_CLIENTE}
                            rows={linhasCliente}
                            rowKey={l => l.key ?? `sem:${l.nome}`}
                            searchText={l => l.nome}
                            searchPlaceholder="Buscar cliente..."
                            sortValue={sortRecebivel}
                            renderCell={celulaRecebivel}
                            onRowClick={recortarPara}
                            rowLabel={l => `${l.nome}: ${fBRL(l.vencido)} vencido, ${fBRL(l.aberto)} em aberto. Ver só este cliente`}
                            loading={semNumeros || (loading && linhasCliente.length === 0)}
                            empty={{ icon: <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma entrada no período', subtitle: 'Nenhum cliente do recorte tem lançamento a receber nestas datas.' }}
                            maxHeight="480px"
                        />
                        </div>
                    )}

                    {/* Previsto × Realizado por período (guia §28) — mesma base
                        dos KPIs Saldo devedor (previsto) e Recebido (realizado). */}
                    <ChartCard
                        title="Previsto × Realizado por período"
                        subtitle={`Lançamentos a receber ${todos ? 'dos clientes do recorte' : 'deste cliente'}, pela data do lançamento: previsto = pendente, realizado = conciliado. A soma fecha com Saldo devedor e Recebido.`}
                        aside={<GranularidadeToggle value={granularidade} onChange={setGranularidade} />}
                    >
                        {(semNumeros || loading) && byMonth.length === 0 ? (
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
                                {/* O gráfico é figura, não controle: fora do Tab (o Recharts
                                    deixava o SVG focável e sem nome), com o resumo como nome. */}
                                <div style={{ height: 220 }} role="img"
                                    aria-label={`Previsto × Realizado por período: previsto ${fBRL(totalPrevisto)}, realizado ${fBRL(totalRealizado)}.`}>
                                    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                        <BarChart data={serie} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%" accessibilityLayer={false}>
                                            <CartesianGrid vertical={false} stroke={GRID} />
                                            <XAxis
                                                dataKey="label"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={TICK}
                                                interval="preserveStartEnd"
                                                minTickGap={8}
                                            />
                                            {/* 60 px: com 48 o "600 mil" quebrava em duas linhas
                                                e o tick do topo saía cortado. */}
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={TICK}
                                                tickFormatter={compactAxis}
                                                width={60}
                                                ticks={yTicks}
                                                domain={[0, yTicks[yTicks.length - 1]]}
                                            />
                                            <RechartsTooltip
                                                cursor={TOOLTIP_CURSOR}
                                                contentStyle={TOOLTIP_STYLE}
                                                itemStyle={{ color: '#1f2937' }}
                                                labelStyle={{ color: '#64748b' }}
                                                separator=": "
                                                labelFormatter={(_, payload) => rotuloPeriodo((payload?.[0]?.payload as { key?: string } | undefined)?.key)}
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
                                        <p className="text-xs text-gray-500 truncate">Previsto no período</p>
                                        <p className="text-sm font-medium text-gray-800 truncate tabular-nums">{fBRL(totalPrevisto)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500 truncate">Realizado no período</p>
                                        <p className="text-sm font-medium text-gray-800 truncate tabular-nums">{fBRL(totalRealizado)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500 truncate">Realizado sobre o total</p>
                                        <p className="text-sm font-medium text-gray-800 truncate tabular-nums">{fPct(pctRealizadoSerie)}</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </ChartCard>

                    {/* Por obra → extrato. Antes mostrava só o realizado: a obra com
                        R$ 466 mil em aberto aparecia "R$ 0,00 · 0%". */}
                    <StandardTable<LinhaRecebivel>
                        storageKey="centralCliente:porObra"
                        toolbarTop={<TituloSecao titulo="Por obra" subtitulo={`Entradas do período ${todos ? 'dos clientes do recorte' : 'deste cliente'} por obra. Clique numa obra para ver o extrato.`} />}
                        columns={COLUNAS_OBRA}
                        rows={linhasObra}
                        rowKey={l => l.key ?? 'sem-obra'}
                        searchText={l => l.nome}
                        searchPlaceholder="Buscar obra..."
                        sortValue={sortRecebivel}
                        renderCell={celulaRecebivel}
                        onRowClick={openDrill}
                        rowLabel={l => `${l.nome}: ${fBRL(l.vencido)} vencido, ${fBRL(l.aberto)} em aberto. Abrir o extrato`}
                        loading={semNumeros || (loading && linhasObra.length === 0)}
                        empty={{ icon: <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Sem lançamentos no período' }}
                        maxHeight="480px"
                    />
                </>
            )}

            {/* Drawer extrato (§6.9: tabela compacta, cabeçalho em sentence case) */}
            <Sheet open={drill !== null} onClose={closeDrill} size="2xl">
                <SheetHeader onClose={closeDrill}>
                    <SheetTitle>{drill?.label ?? 'Extrato'}</SheetTitle>
                    <SheetDescription>
                        {escopoLabel} · {entriesLoading ? 'carregando…' : entriesError ? 'não carregou' : plural(totalEntries, 'lançamento', 'lançamentos')}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-6 py-5">
                    {entriesLoading ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-500">Carregando extrato...</div>
                    ) : entriesError ? (
                        <div role="alert" className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                            <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
                            <p className="text-sm font-medium text-gray-800">Não foi possível carregar o extrato.</p>
                            <p className="text-xs text-gray-500 max-w-md break-words">{entriesError}</p>
                            <Button variant="secondary" onClick={() => drill && void carregarExtrato(drill.filters)} className="text-sm gap-2">
                                <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                            </Button>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-500">Sem lançamentos.</div>
                    ) : (
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Data</th>
                                        <th className="px-4 py-2 border-r border-gray-100">Lançamento</th>
                                        <th className="px-3 py-2 text-right whitespace-nowrap">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {entries.map(e => {
                                        const pendente = e.status === 'PENDING';
                                        const dias = pendente ? diasVencido(e.due_date, hoje) : 0;
                                        const saida = e.direction === 'DEBIT';
                                        return (
                                            <tr key={e.id} className="hover:bg-gray-50/50">
                                                <td className="px-3 py-2.5 border-r border-gray-100 whitespace-nowrap text-sm font-normal text-gray-600 tabular-nums align-top">{fData(e.transaction_date)}</td>
                                                <td className="px-4 py-2.5 border-r border-gray-100 align-top min-w-0">
                                                    <p className="text-sm font-normal text-gray-700 break-words text-pretty">{e.description || e.category_name || '—'}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {[todos ? e.client_name : null, e.category_name, e.project_name].filter(Boolean).join(' · ')}
                                                    </p>
                                                    {/* O vencido diz que venceu, em texto — não só a cor. */}
                                                    {pendente && (dias > 0 ? (
                                                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-700">
                                                            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                                            previsto · vencido há {plural(dias, 'dia', 'dias')} (venc. {fData(e.due_date)})
                                                        </p>
                                                    ) : (
                                                        <p className="mt-0.5 text-xs text-gray-500">previsto{e.due_date ? ` · vence ${fData(e.due_date)}` : ''}</p>
                                                    ))}
                                                </td>
                                                {/* Verde só no que ENTROU: pendente não é receita ainda. */}
                                                <td className={`px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm font-medium align-top ${
                                                    saida ? 'text-red-600' : pendente ? 'text-gray-800' : 'text-green-700'
                                                }`}>
                                                    {saida ? '−' : pendente ? '' : '+'}{fBRL(e.amount)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/* O extrato vem em páginas de 200 — o cabeçalho diz o total,
                        então a lista diz quantos mostra e busca o resto. */}
                    {!entriesLoading && hasMoreEntries && (
                        <div className="flex flex-wrap items-center gap-3 pt-3 text-sm text-gray-500">
                            <span>Exibindo {entries.length} de {totalEntries}</span>
                            <Button variant="secondary" onClick={loadMoreEntries} disabled={entriesLoadingMore}>
                                <RefreshCw className={`w-[15px] h-[15px] ${entriesLoadingMore ? 'animate-spin' : ''}`} />
                                {entriesLoadingMore ? 'Carregando…' : `Carregar mais ${Math.min(ENTRIES_PAGE, totalEntries - entries.length)}`}
                            </Button>
                        </div>
                    )}
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default CentralCliente;
