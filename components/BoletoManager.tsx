import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Search, FileText, Loader2, RefreshCw,
    Building2, Calendar, AlertTriangle, ChevronDown,
    Wallet, Clock, CheckCircle2, SlidersHorizontal, X,
    ArrowUpDown, Download, LayoutGrid, List,
} from 'lucide-react';
import { boletoService } from '../services/boletoService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { supplierService } from '../services/supplierService';
import type { Boleto, BoletoStatus, BoletoFilters, Organization, CostCenter } from '../types';
import BoletoFormModal, { formatBRL } from './BoletoFormModal';

interface BoletoManagerProps {
    organizationId: string;
    userEmail?: string;
    projectId?: string;
    organizations?: Organization[];
    onOrgChange?: (id: string | null) => void;
}

const STATUS_LABELS: Record<BoletoStatus, string> = {
    rascunho: 'Rascunho',
    revisao: 'Em revisão',
    aprovado: 'Aprovado',
    programado: 'Programado',
    pago: 'Pago',
    cancelado: 'Cancelado',
};

const STATUS_COLORS: Record<BoletoStatus, string> = {
    rascunho: 'bg-gray-100 text-gray-700',
    revisao: 'bg-amber-100 text-amber-700',
    aprovado: 'bg-blue-100 text-blue-700',
    programado: 'bg-indigo-100 text-indigo-700',
    pago: 'bg-emerald-100 text-emerald-700',
    cancelado: 'bg-red-100 text-red-700',
};

const BoletoManager: React.FC<BoletoManagerProps> = ({
    organizationId, userEmail, projectId, organizations = [], onOrgChange,
}) => {
    // Inicia em 'ALL' para garantir visibilidade de todos os boletos acessíveis via RLS.
    // O usuário pode filtrar por organização específica via dropdown.
    const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
    const [boletos, setBoletos] = useState<Boleto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Boleto | undefined>(undefined);
    const [exporting, setExporting] = useState(false);

    const [filtroStatus, setFiltroStatus] = useState<BoletoStatus | 'todos'>('todos');
    const [busca, setBusca] = useState('');

    // Filtros avançados (client-side)
    const [showFiltros, setShowFiltros] = useState(false);
    const [vencDe, setVencDe] = useState('');
    const [vencAte, setVencAte] = useState('');
    const [valorMin, setValorMin] = useState('');
    const [valorMax, setValorMax] = useState('');
    const [ordenarPor, setOrdenarPor] = useState<'vencimento' | 'valor' | 'created_at' | 'numero' | 'project_id' | 'cost_center_id' | 'beneficiario_nome' | 'status'>('created_at');
    const [ordenarDir, setOrdenarDir] = useState<'asc' | 'desc'>('desc');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Lookup maps para exibição nos cards/linhas
    const [ccMap, setCcMap] = useState<Record<string, string>>({});
    const [projectMap, setProjectMap] = useState<Record<string, string>>({});
    const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});

    const [orgPrompt, setOrgPrompt] = useState(false);
    const orgSelectRef = useRef<HTMLSelectElement>(null);

    const temFiltroAtivo = vencDe || vencAte || valorMin || valorMax;

    function limparFiltros() {
        setVencDe(''); setVencAte(''); setValorMin(''); setValorMax('');
    }

    const effectiveOrgId = selectedOrgId === 'ALL' ? undefined : selectedOrgId;

    function handleOrgChange(id: string) {
        setSelectedOrgId(id);
        onOrgChange?.(id === 'ALL' ? null : id);
    }

    async function carregar(orgId: string | undefined) {
        setLoading(true);
        setError(null);
        try {
            const filters: BoletoFilters = {};
            if (filtroStatus !== 'todos') filters.status = filtroStatus;
            if (projectId) filters.project_id = projectId;

            const [list, ccs, projs, sups] = await Promise.all([
                boletoService.list(orgId, filters),
                financialRegistryService.listCostCenters(orgId).catch(() => [] as CostCenter[]),
                projectService.listProjects().catch(() => [] as { id: string; name: string }[]),
                supplierService.listSuppliers(orgId).catch(() => [] as { id: string; name: string }[]),
            ]);

            setBoletos(list);
            setCcMap(Object.fromEntries((ccs || []).map((c) => [c.id, c.name])));
            setProjectMap(Object.fromEntries((projs || []).map((p) => [p.id, p.name])));
            setSupplierMap(Object.fromEntries((sups || []).map((s) => [s.id, s.name])));
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao carregar boletos');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar(selectedOrgId === 'ALL' ? undefined : selectedOrgId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOrgId, filtroStatus, projectId]);

    const filtered = useMemo(() => {
        let list = boletos;

        // Busca textual
        if (busca) {
            const b = busca.toLowerCase();
            list = list.filter(item =>
                (item.documento_nome ?? '').toLowerCase().includes(b) ||
                (item.beneficiario_nome ?? '').toLowerCase().includes(b) ||
                (item.supplier_id ? (supplierMap[item.supplier_id] ?? '').toLowerCase().includes(b) : false) ||
                (item.linha_digitavel ?? '').includes(b) ||
                (item.banco_nome ?? '').toLowerCase().includes(b),
            );
        }

        // Vencimento de/até
        if (vencDe)  list = list.filter(b => b.vencimento && b.vencimento >= vencDe);
        if (vencAte) list = list.filter(b => b.vencimento && b.vencimento <= vencAte);

        // Faixa de valor
        const min = valorMin ? Number(valorMin) : null;
        const max = valorMax ? Number(valorMax) : null;
        if (min !== null) list = list.filter(b => (b.valor ?? 0) >= min);
        if (max !== null) list = list.filter(b => (b.valor ?? 0) <= max);

        // Ordenação
        list = [...list].sort((a, b) => {
            let va: string | number, vb: string | number;
            switch (ordenarPor) {
                case 'numero':        va = a.numero ?? 0;                       vb = b.numero ?? 0;                       break;
                case 'vencimento':    va = a.vencimento ?? '';                  vb = b.vencimento ?? '';                  break;
                case 'valor':         va = a.valor ?? 0;                        vb = b.valor ?? 0;                        break;
                case 'project_id':    va = projectMap[a.project_id ?? ''] ?? ''; vb = projectMap[b.project_id ?? ''] ?? ''; break;
                case 'cost_center_id':va = ccMap[a.cost_center_id ?? ''] ?? '';  vb = ccMap[b.cost_center_id ?? ''] ?? '';  break;
                case 'beneficiario_nome': va = (a.beneficiario_nome ?? '').toLowerCase(); vb = (b.beneficiario_nome ?? '').toLowerCase(); break;
                case 'status':        va = a.status;                            vb = b.status;                            break;
                default:              va = a.created_at;                        vb = b.created_at;
            }
            if (va < vb) return ordenarDir === 'asc' ? -1 : 1;
            if (va > vb) return ordenarDir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [boletos, busca, vencDe, vencAte, valorMin, valorMax, ordenarPor, ordenarDir, supplierMap]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { todos: boletos.length };
        for (const s of Object.keys(STATUS_LABELS)) c[s] = 0;
        for (const b of boletos) c[b.status] = (c[b.status] || 0) + 1;
        return c;
    }, [boletos]);

    const summary = useMemo(() => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const em7 = new Date(hoje);
        em7.setDate(hoje.getDate() + 7);

        const pendentes = boletos.filter(b => !['pago', 'cancelado'].includes(b.status));
        const atrasados = pendentes.filter(b => {
            if (!b.vencimento) return false;
            return new Date(b.vencimento + 'T00:00:00') < hoje;
        });
        const aVencer7 = pendentes.filter(b => {
            if (!b.vencimento) return false;
            const d = new Date(b.vencimento + 'T00:00:00');
            return d >= hoje && d <= em7;
        });

        const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        const pagosNoMes = boletos.filter(b =>
            b.status === 'pago' && (b.updated_at ?? b.created_at).startsWith(anoMes),
        );

        const soma = (arr: Boleto[]) => arr.reduce((s, b) => s + (b.valor ?? 0), 0);
        return {
            totalPendente: soma(pendentes), countPendente: pendentes.length,
            totalAtrasado: soma(atrasados), countAtrasado: atrasados.length,
            totalAVencer7: soma(aVencer7),  countAVencer7: aVencer7.length,
            totalPagoMes:  soma(pagosNoMes), countPagoMes: pagosNoMes.length,
        };
    }, [boletos]);

    function abrirNovo() {
        setEditing(undefined);
        setIsModalOpen(true);
    }

    function abrirEdicao(b: Boleto) {
        setEditing(b);
        setIsModalOpen(true);
    }

    function handleSaved(_updated: Boleto) {
        carregar(effectiveOrgId);
    }

    async function handleExport(tipo: 'excel' | 'pdf') {
        if (!filtered.length) return;
        setExporting(true);
        try {
            const nome = `boletos${selectedOrgId !== 'ALL' ? `_${selectedOrgId.slice(0,8)}` : ''}`;
            if (tipo === 'excel') await boletoService.exportarExcel(filtered, nome);
            else await boletoService.exportarPDF(filtered, nome);
        } catch (err: unknown) {
            console.error('[export]', err);
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Captura de Boletos</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        Capture boletos via PDF e gere lançamentos automaticamente em contas a pagar.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Seletor de organização */}
                    {organizations.length > 0 && (
                        <div className="relative flex items-center gap-2 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-2.5 min-w-[220px]">
                            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <select
                                ref={orgSelectRef}
                                value={selectedOrgId}
                                onChange={(e) => handleOrgChange(e.target.value)}
                                className="w-full bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer appearance-none pr-5"
                            >
                                <option value="ALL">Todas as Organizações</option>
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-3" />
                        </div>
                    )}
                    {filtered.length > 0 && (
                        <>
                            <button
                                onClick={() => handleExport('excel')}
                                disabled={exporting}
                                className="flex items-center gap-2 px-4 py-3 bg-white text-emerald-700 border border-emerald-200 rounded-[1.25rem] hover:bg-emerald-50 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                                title="Exportar lista filtrada para Excel"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Excel
                            </button>
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={exporting}
                                className="flex items-center gap-2 px-4 py-3 bg-white text-red-600 border border-red-200 rounded-[1.25rem] hover:bg-red-50 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                                title="Exportar lista filtrada para PDF"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                PDF
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => carregar(effectiveOrgId)}
                        className="flex items-center gap-2 px-4 py-3 bg-white text-gray-700 border border-gray-100 rounded-[1.25rem] hover:bg-gray-50 font-bold text-xs uppercase tracking-widest"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </button>
                    <button
                        onClick={abrirNovo}
                        className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Boleto
                    </button>
                </div>
            </div>

            {/* Cards de resumo */}
            {!loading && boletos.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* A Pagar */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">A Pagar</span>
                            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                                <Wallet className="w-4 h-4 text-blue-500" />
                            </div>
                        </div>
                        <p className="text-xl font-black text-gray-900 leading-tight">{formatBRL(summary.totalPendente)}</p>
                        <p className="text-xs text-gray-400 mt-1">{summary.countPendente} boleto{summary.countPendente !== 1 ? 's' : ''} pendente{summary.countPendente !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Vencem em 7 dias */}
                    <div className={`rounded-2xl border p-5 transition-colors ${summary.countAVencer7 > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${summary.countAVencer7 > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Vencem em 7 dias</span>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${summary.countAVencer7 > 0 ? 'bg-amber-100' : 'bg-gray-50'}`}>
                                <Clock className={`w-4 h-4 ${summary.countAVencer7 > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
                            </div>
                        </div>
                        <p className={`text-xl font-black leading-tight ${summary.countAVencer7 > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{formatBRL(summary.totalAVencer7)}</p>
                        <p className={`text-xs mt-1 ${summary.countAVencer7 > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{summary.countAVencer7} boleto{summary.countAVencer7 !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Em atraso */}
                    <div className={`rounded-2xl border p-5 transition-colors ${summary.countAtrasado > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${summary.countAtrasado > 0 ? 'text-red-500' : 'text-gray-400'}`}>Em Atraso</span>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${summary.countAtrasado > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
                                <AlertTriangle className={`w-4 h-4 ${summary.countAtrasado > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                            </div>
                        </div>
                        <p className={`text-xl font-black leading-tight ${summary.countAtrasado > 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatBRL(summary.totalAtrasado)}</p>
                        <p className={`text-xs mt-1 ${summary.countAtrasado > 0 ? 'text-red-500' : 'text-gray-400'}`}>{summary.countAtrasado} boleto{summary.countAtrasado !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Pagos no mês */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pagos no Mês</span>
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </div>
                        </div>
                        <p className="text-xl font-black text-gray-900 leading-tight">{formatBRL(summary.totalPagoMes)}</p>
                        <p className="text-xs text-gray-400 mt-1">{summary.countPagoMes} boleto{summary.countPagoMes !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            )}

            {/* Filtros de status */}
            <div className="flex flex-wrap gap-2">
                {(['todos', ...Object.keys(STATUS_LABELS)] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => setFiltroStatus(s as BoletoStatus | 'todos')}
                        className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors ${
                            filtroStatus === s
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {s === 'todos' ? 'Todos' : STATUS_LABELS[s as BoletoStatus]}
                        <span className="ml-2 opacity-60">{counts[s] ?? 0}</span>
                    </button>
                ))}
            </div>

            {/* Busca + botão filtros + toggle view */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome do arquivo, beneficiário ou linha digitável..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="w-full pl-10 pr-3 py-3 bg-white border border-gray-100 rounded-2xl text-sm"
                    />
                </div>
                <button
                    onClick={() => setShowFiltros(v => !v)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border font-bold text-xs uppercase tracking-widest transition-colors ${
                        showFiltros || temFiltroAtivo
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-100 hover:bg-gray-50'
                    }`}
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Filtros
                    {temFiltroAtivo && (
                        <span className="ml-0.5 w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    )}
                </button>
                {/* Toggle grid / lista */}
                <div className="flex bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <button
                        onClick={() => setViewMode('grid')}
                        title="Visualização em blocos"
                        className={`px-3 py-3 transition-colors ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        title="Visualização em lista"
                        className={`px-3 py-3 transition-colors ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Painel de filtros avançados */}
            {showFiltros && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Filtros avançados</span>
                        {temFiltroAtivo && (
                            <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-bold">
                                <X className="w-3 h-3" /> Limpar filtros
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Vencimento de */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Vencimento de</label>
                            <input
                                type="date"
                                value={vencDe}
                                onChange={(e) => setVencDe(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Vencimento até */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Vencimento até</label>
                            <input
                                type="date"
                                value={vencAte}
                                onChange={(e) => setVencAte(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Valor mínimo */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Valor mínimo (R$)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0,00"
                                value={valorMin}
                                onChange={(e) => setValorMin(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Valor máximo */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Valor máximo (R$)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="—"
                                value={valorMax}
                                onChange={(e) => setValorMax(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    {/* Ordenação */}
                    <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ordenar por</span>
                        <select
                            value={ordenarPor}
                            onChange={(e) => setOrdenarPor(e.target.value as typeof ordenarPor)}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold"
                        >
                            <option value="numero">Código</option>
                            <option value="created_at">Data de captura</option>
                            <option value="vencimento">Vencimento</option>
                            <option value="valor">Valor</option>
                            <option value="beneficiario_nome">Beneficiário</option>
                            <option value="project_id">Obra</option>
                            <option value="cost_center_id">Centro de Custo</option>
                            <option value="status">Status</option>
                        </select>
                        <button
                            onClick={() => setOrdenarDir(d => d === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50"
                        >
                            {ordenarDir === 'asc' ? '↑ Crescente' : '↓ Decrescente'}
                        </button>
                    </div>
                </div>
            )}

            {/* Estado de carregamento / erro / vazio */}
            {error && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <FileText className="w-12 h-12 mb-4 text-gray-300" />
                    <p className="font-medium">Nenhum boleto encontrado.</p>
                    <button onClick={abrirNovo} className="mt-4 text-blue-600 hover:underline text-sm font-bold">
                        Capturar o primeiro boleto
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(b => {
                        const atrasado = b.vencimento && !['pago','cancelado'].includes(b.status)
                            && new Date(b.vencimento + 'T00:00:00') < new Date();
                        return (
                            <button
                                key={b.id}
                                onClick={() => abrirEdicao(b)}
                                className={`text-left bg-white rounded-2xl border p-5 hover:shadow-lg transition-all ${atrasado ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <span className="text-sm font-bold text-gray-900 truncate">
                                            {b.banco_nome ?? 'Banco desconhecido'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {b.numero != null && (
                                            <span className="text-[10px] font-black text-gray-400 tracking-widest">
                                                #{String(b.numero).padStart(4, '0')}
                                            </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_COLORS[b.status]}`}>
                                            {STATUS_LABELS[b.status]}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500 mb-3 truncate">
                                    {b.supplier_id
                                        ? (supplierMap[b.supplier_id] ?? b.beneficiario_nome ?? b.documento_nome)
                                        : (b.beneficiario_nome ?? b.documento_nome)}
                                </p>

                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-0.5">Valor</p>
                                        <p className="text-lg font-black text-gray-900">{formatBRL(b.valor)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-0.5 flex items-center gap-1 justify-end">
                                            <Calendar className="w-3 h-3" /> Vencimento
                                        </p>
                                        <p className={`text-sm font-bold ${atrasado ? 'text-red-600' : 'text-gray-700'}`}>
                                            {b.vencimento ? new Date(b.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                        </p>
                                    </div>
                                </div>

                                {b.confidence_score !== undefined && b.confidence_score < 80 && (
                                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                        <AlertTriangle className="w-3 h-3" />
                                        Baixa confiança ({b.confidence_score}%)
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* ── Vista em lista ── */
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                <th className="text-left px-4 py-3 w-20">Código</th>
                                <th className="text-left px-4 py-3">Beneficiário</th>
                                <th className="text-left px-4 py-3">Obra</th>
                                <th className="text-left px-4 py-3">Centro de Custo</th>
                                <th className="text-right px-4 py-3">Valor</th>
                                <th className="text-center px-4 py-3">Vencimento</th>
                                <th className="text-center px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(b => {
                                const atrasado = b.vencimento && !['pago','cancelado'].includes(b.status)
                                    && new Date(b.vencimento + 'T00:00:00') < new Date();
                                return (
                                    <tr
                                        key={b.id}
                                        onClick={() => abrirEdicao(b)}
                                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${atrasado ? 'bg-red-50/40' : ''}`}
                                    >
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-xs font-black text-gray-500 tracking-widest">
                                                {b.numero != null ? `#${String(b.numero).padStart(4, '0')}` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 max-w-[200px]">
                                            <p className="font-medium truncate">
                                                {b.supplier_id
                                                    ? (supplierMap[b.supplier_id] ?? b.beneficiario_nome ?? b.documento_nome)
                                                    : (b.beneficiario_nome ?? b.documento_nome)}
                                            </p>
                                            {b.beneficiario_cnpj && !b.supplier_id && (
                                                <p className="text-[11px] text-gray-400 font-mono truncate">{b.beneficiario_cnpj}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px]">
                                            <p className="truncate">{b.project_id ? (projectMap[b.project_id] ?? '—') : '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px]">
                                            <p className="truncate">{b.cost_center_id ? (ccMap[b.cost_center_id] ?? '—') : '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                                            {formatBRL(b.valor)}
                                        </td>
                                        <td className={`px-4 py-3 text-center text-sm font-semibold whitespace-nowrap ${atrasado ? 'text-red-600' : 'text-gray-700'}`}>
                                            {b.vencimento ? new Date(b.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                            {atrasado && <div className="text-[10px] text-red-400 font-bold">ATRASADO</div>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_COLORS[b.status]}`}>
                                                {STATUS_LABELS[b.status]}
                                            </span>
                                            {b.confidence_score !== undefined && b.confidence_score < 80 && (
                                                <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] font-bold text-amber-600">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> {b.confidence_score}%
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t border-gray-100">
                                <td colSpan={4} className="px-4 py-2 text-xs text-gray-400">{filtered.length} boleto{filtered.length !== 1 ? 's' : ''}</td>
                                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                                    {formatBRL(filtered.filter(b => !['pago','cancelado'].includes(b.status)).reduce((s, b) => s + (b.valor ?? 0), 0))}
                                </td>
                                <td colSpan={2} className="px-4 py-2 text-xs text-gray-400 text-right">total pendente</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <BoletoFormModal
                    organizationId={editing?.organization_id ?? effectiveOrgId ?? ''}
                    organizations={organizations}
                    onOrgChange={(id) => { handleOrgChange(id); }}
                    userEmail={userEmail}
                    projectId={projectId}
                    boleto={editing}
                    onClose={() => { setIsModalOpen(false); setEditing(undefined); }}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
};

export default BoletoManager;
