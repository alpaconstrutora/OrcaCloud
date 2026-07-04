import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Search, FileText, Loader2, RefreshCw,
    Building2, Calendar, AlertTriangle, ChevronDown,
    Wallet, Clock, CheckCircle2, SlidersHorizontal, X,
    ArrowUpDown, Download, LayoutGrid, List, Upload, Pencil,
} from 'lucide-react';
import { boletoService } from '../services/boletoService';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { supplierService } from '../services/supplierService';
import type { Boleto, BoletoStatus, BoletoFilters, Organization, CostCenter } from '../types';
import BoletoFormModal, { formatBRL } from './BoletoFormModal';
import BoletoLoteModal from './BoletoLoteModal';
import BoletoEdicaoEmLoteModal from './BoletoEdicaoEmLoteModal';
import { useStore } from '../store/useStore';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from './ui/TableUtils';
import { formatDateBR } from './ui/Format';
import Button from './ui/Button';

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

const BOLETO_COLUMNS: ColumnConfig[] = [
    { key: 'numero', label: 'Código', sortable: true },
    { key: 'beneficiario', label: 'Beneficiário', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

interface BoletoItemBaseProps {
    boleto: Boleto;
    idx: number;
    selected: boolean;
    isHighlighted: boolean;
    atrasado: boolean;
    supplierMap: Record<string, string>;
    onOpen: (b: Boleto) => void;
    onCheckboxMouseDown: (e: React.MouseEvent) => void;
    onCheckboxChange: (checked: boolean, id: string, idx: number) => void;
}

// Memoizado para que uma seleção (shift+click em intervalo grande) não force o
// React a re-renderizar todos os cards/linhas — só os que realmente mudaram de
// estado (selected/atrasado/isHighlighted) são atualizados.
const BoletoCardItem = React.memo(function BoletoCardItem({
    boleto: b, idx, selected, isHighlighted, atrasado, supplierMap,
    onOpen, onCheckboxMouseDown, onCheckboxChange,
}: BoletoItemBaseProps) {
    return (
        <div className={`relative group transition-all ${isHighlighted ? 'ring-4 ring-blue-400 ring-offset-2 rounded-3xl animate-pulse' : ''}`}>
            {/* Checkbox overlay */}
            <label
                className="absolute top-3 left-3 z-10 cursor-pointer"
                onClick={e => e.stopPropagation()}
            >
                <input
                    type="checkbox"
                    checked={selected}
                    onMouseDown={onCheckboxMouseDown}
                    onChange={e => onCheckboxChange(e.target.checked, b.id, idx)}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                />
            </label>
            <button
                onClick={() => onOpen(b)}
                className={`w-full text-left bg-white rounded-2xl border p-5 pl-9 hover:shadow-lg transition-all ${
                    selected ? 'border-blue-400 ring-2 ring-blue-200' :
                    atrasado ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-gray-200'
                }`}
            >
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-bold text-gray-900 truncate">
                            {b.supplier_id
                                ? (supplierMap[b.supplier_id] ?? b.beneficiario_nome ?? b.documento_nome)
                                : (b.beneficiario_nome ?? b.documento_nome ?? 'Beneficiário desconhecido')}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {b.numero != null && (
                            <span className="text-xs font-black text-gray-400 tracking-widest">
                                #{String(b.numero).padStart(4, '0')}
                            </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest ${STATUS_COLORS[b.status]}`}>
                            {STATUS_LABELS[b.status]}
                        </span>
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-3 truncate">
                    {b.banco_nome ?? 'Banco desconhecido'}
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
                            {formatDateBR(b.vencimento)}
                        </p>
                    </div>
                </div>

                {b.confidence_score !== undefined && b.confidence_score < 80 && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-700">
                        <AlertTriangle className="w-3 h-3" />
                        Baixa confiança ({b.confidence_score}%)
                    </div>
                )}
            </button>
        </div>
    );
});

interface BoletoRowItemProps extends BoletoItemBaseProps {
    isHighlighted: boolean;
    visibleColumns: string[];
    projectMap: Record<string, string>;
    ccMap: Record<string, string>;
}

const BoletoRowItem = React.memo(function BoletoRowItem({
    boleto: b, idx, selected, isHighlighted, atrasado, supplierMap, visibleColumns, projectMap, ccMap,
    onOpen, onCheckboxMouseDown, onCheckboxChange,
}: BoletoRowItemProps) {
    return (
        <tr
            onClick={() => onOpen(b)}
            className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                isHighlighted ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : selected ? 'bg-blue-50/60' : atrasado ? 'bg-red-50/40' : ''
            }`}
        >
            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={selected}
                    onMouseDown={onCheckboxMouseDown}
                    onChange={e => onCheckboxChange(e.target.checked, b.id, idx)}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                />
            </td>
            {visibleColumns.includes('numero') && (
                <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-black text-gray-500 tracking-widest">
                        {b.numero != null ? `#${String(b.numero).padStart(4, '0')}` : '—'}
                    </span>
                </td>
            )}
            {visibleColumns.includes('beneficiario') && (
                <td className="px-4 py-3 text-gray-700 max-w-[200px]">
                    <p className="font-medium truncate">
                        {b.supplier_id
                            ? (supplierMap[b.supplier_id] ?? b.beneficiario_nome ?? b.documento_nome)
                            : (b.beneficiario_nome ?? b.documento_nome)}
                    </p>
                    {b.beneficiario_cnpj && !b.supplier_id && (
                        <p className="text-xs text-gray-400 font-mono truncate">{b.beneficiario_cnpj}</p>
                    )}
                </td>
            )}
            {visibleColumns.includes('obra') && (
                <td className="px-4 py-3 text-table-body text-gray-500 max-w-[160px]">
                    <p className="truncate">{b.project_id ? (projectMap[b.project_id] ?? '—') : '—'}</p>
                </td>
            )}
            {visibleColumns.includes('centro_custo') && (
                <td className="px-4 py-3 text-table-body text-gray-500 max-w-[140px]">
                    <p className="truncate">{b.cost_center_id ? (ccMap[b.cost_center_id] ?? '—') : '—'}</p>
                </td>
            )}
            {visibleColumns.includes('valor') && (
                <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                    {formatBRL(b.valor)}
                </td>
            )}
            {visibleColumns.includes('vencimento') && (
                <td className={`px-4 py-3 text-center text-sm font-semibold whitespace-nowrap ${atrasado ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatDateBR(b.vencimento)}
                    {atrasado && <div className="text-xs text-red-400 font-bold">ATRASADO</div>}
                </td>
            )}
            {visibleColumns.includes('status') && (
                <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest ${STATUS_COLORS[b.status]}`}>
                        {STATUS_LABELS[b.status]}
                    </span>
                    {b.confidence_score !== undefined && b.confidence_score < 80 && (
                        <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] font-bold text-amber-600">
                            <AlertTriangle className="w-2.5 h-2.5" /> {b.confidence_score}%
                        </div>
                    )}
                </td>
            )}
        </tr>
    );
});

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
    const [isLoteOpen, setIsLoteOpen] = useState(false);
    const [editing, setEditing] = useState<Boleto | undefined>(undefined);
    const [exporting, setExporting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoteEditOpen, setIsLoteEditOpen] = useState(false);
    const tableColumns = useTableColumns(BOLETO_COLUMNS, 'boletoManagerColumns');

    // Raw arrays kept alongside maps for the bulk-edit modal dropdowns
    const [supplierList, setSupplierList] = useState<{ id: string; name: string }[]>([]);
    const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);
    const [ccList, setCcList] = useState<{ id: string; name: string }[]>([]);

    const [filtroStatus, setFiltroStatus] = useState<BoletoStatus | 'todos'>('todos');
    const [busca, setBusca] = useState('');
    const [buscaDebounced, setBuscaDebounced] = useState('');

    // Debounce da busca textual: evita refiltrar/reordenar a lista inteira
    // (e re-renderizar todos os cards) a cada tecla digitada, o que travava o input.
    useEffect(() => {
        const timer = setTimeout(() => setBuscaDebounced(busca), 250);
        return () => clearTimeout(timer);
    }, [busca]);

    // Filtros avançados (client-side)
    const [showFiltros, setShowFiltros] = useState(false);
    const [vencDe, setVencDe] = useState('');
    const [vencAte, setVencAte] = useState('');
    const [valorMin, setValorMin] = useState('');
    const [valorMax, setValorMax] = useState('');
    const [ordenarPor, setOrdenarPor] = useState<'vencimento' | 'valor' | 'created_at' | 'numero' | 'project_id' | 'cost_center_id' | 'beneficiario_nome' | 'status'>('created_at');
    const [ordenarDir, setOrdenarDir] = useState<'asc' | 'desc'>('desc');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

    // Lookup maps para exibição nos cards/linhas
    const [ccMap, setCcMap] = useState<Record<string, string>>({});
    const [projectMap, setProjectMap] = useState<Record<string, string>>({});
    const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});

    const [orgPrompt, setOrgPrompt] = useState(false);
    const orgSelectRef = useRef<HTMLSelectElement>(null);

    // Deep-link: item destacado vindo de outro módulo (ex: conciliação bancária)
    const viewFocus = useStore(s => s.viewFocus);
    const setViewFocus = useStore(s => s.setViewFocus);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const temFiltroAtivo = vencDe || vencAte || valorMin || valorMax;

    function limparFiltros() {
        setVencDe(''); setVencAte(''); setValorMin(''); setValorMax('');
    }

    const effectiveOrgId = selectedOrgId === 'ALL' ? undefined : selectedOrgId;

    function handleOrgChange(id: string) {
        setSelectedOrgId(id);
        onOrgChange?.(id === 'ALL' ? null : id);
    }

    const lastSelectedIndexRef = useRef<number | null>(null);
    const shiftHeldRef = useRef(false);

    const handleCheckboxMouseDown = useCallback((e: React.MouseEvent) => {
        shiftHeldRef.current = e.shiftKey;
    }, []);

    function selectAllFiltered() {
        setSelectedIds(new Set(filtered.map(b => b.id)));
    }

    function clearSelection() {
        setSelectedIds(new Set());
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
                projectService.listProjects(undefined, orgId ?? organizationId).catch(() => [] as { id: string; name: string }[]),
                supplierService.listSuppliers(orgId).catch(() => [] as { id: string; name: string }[]),
            ]);

            setBoletos(list);
            setCcMap(Object.fromEntries((ccs || []).map((c) => [c.id, c.name])));
            setProjectMap(Object.fromEntries((projs || []).map((p) => [p.id, p.name])));
            setSupplierMap(Object.fromEntries((sups || []).map((s) => [s.id, s.name])));
            setCcList((ccs || []).map(c => ({ id: c.id, name: c.name })));
            setProjectList((projs || []).filter(p => p.name !== 'Gestão Comercial').map(p => ({ id: p.id, name: p.name })));
            setSupplierList((sups || []).map(s => ({ id: s.id, name: s.name })));
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

    // Consome o deep-link: ao chegar de outro módulo com viewFocus apontando um boleto,
    // abre a edição do item e o destaca; depois limpa o foco para não reabrir.
    useEffect(() => {
        if (!viewFocus?.ref || loading) return;
        if (viewFocus.source && viewFocus.source !== 'BOLETO') return;
        const alvo = boletos.find(b => b.id === viewFocus.ref);
        if (alvo) {
            setEditing(alvo);
            setIsModalOpen(true);
            setHighlightId(alvo.id);
            setTimeout(() => setHighlightId(null), 4000);
            setViewFocus(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewFocus, loading, boletos]);

    const filtered = useMemo(() => {
        let list = boletos;

        // Busca textual
        if (buscaDebounced) {
            const b = buscaDebounced.toLowerCase();
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
            const sortCol = tableColumns.sortColumn || ordenarPor;
            const sortDir = tableColumns.sortColumn ? tableColumns.sortDirection : ordenarDir;

            switch (sortCol) {
                case 'numero':        va = a.numero ?? 0;                       vb = b.numero ?? 0;                       break;
                case 'vencimento':    va = a.vencimento ?? '';                  vb = b.vencimento ?? '';                  break;
                case 'valor':         va = a.valor ?? 0;                        vb = b.valor ?? 0;                        break;
                case 'obra':          va = projectMap[a.project_id ?? ''] ?? ''; vb = projectMap[b.project_id ?? ''] ?? ''; break;
                case 'centro_custo':  va = ccMap[a.cost_center_id ?? ''] ?? '';  vb = ccMap[b.cost_center_id ?? ''] ?? '';  break;
                case 'beneficiario':  va = (a.beneficiario_nome ?? '').toLowerCase(); vb = (b.beneficiario_nome ?? '').toLowerCase(); break;
                case 'status':        va = a.status;                            vb = b.status;                            break;
                default:              va = a.created_at;                        vb = b.created_at;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [boletos, buscaDebounced, vencDe, vencAte, valorMin, valorMax, ordenarPor, ordenarDir, supplierMap, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Mantido estável enquanto `filtered` não muda, para que as linhas memoizadas
    // (BoletoCardItem/BoletoRowItem) não re-renderizem a cada seleção.
    const handleCheckboxChange = useCallback((checked: boolean, id: string, index: number) => {
        if (shiftHeldRef.current && lastSelectedIndexRef.current !== null) {
            const start = Math.min(lastSelectedIndexRef.current, index);
            const end = Math.max(lastSelectedIndexRef.current, index);
            const rangeIds = filtered.slice(start, end + 1).map(b => b.id);
            setSelectedIds(prev => {
                const next = new Set(prev);
                rangeIds.forEach(rid => checked ? next.add(rid) : next.delete(rid));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (checked) next.add(id); else next.delete(id);
                return next;
            });
        }
        lastSelectedIndexRef.current = index;
    }, [filtered]);

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

    const abrirEdicao = useCallback((b: Boleto) => {
        setEditing(b);
        setIsModalOpen(true);
    }, []);

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
                                className="w-full bg-transparent text-form-input font-bold text-gray-700 outline-none cursor-pointer appearance-none pr-5"
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
                            <Button
                                variant="secondary"
                                size="lg"
                                onClick={() => handleExport('excel')}
                                disabled={exporting}
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                title="Exportar lista filtrada para Excel"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Excel
                            </Button>
                            <Button
                                variant="secondary"
                                size="lg"
                                onClick={() => handleExport('pdf')}
                                disabled={exporting}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                title="Exportar lista filtrada para PDF"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                PDF
                            </Button>
                        </>
                    )}
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => carregar(effectiveOrgId)}
                        className="text-gray-700 border-gray-100 hover:bg-gray-50"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </Button>
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => setIsLoteOpen(true)}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                        <Upload className="w-4 h-4" />
                        Importar em Lote
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={abrirNovo}
                        className="gap-3 shadow-xl shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Boleto
                    </Button>
                </div>
            </div>

            {/* Cards de resumo */}
            {!loading && boletos.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* A Pagar */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">A Pagar</span>
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
                            <span className={`text-xs font-bold uppercase tracking-widest ${summary.countAVencer7 > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Vencem em 7 dias</span>
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
                            <span className={`text-xs font-bold uppercase tracking-widest ${summary.countAtrasado > 0 ? 'text-red-500' : 'text-gray-400'}`}>Em Atraso</span>
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
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Pagos no Mês</span>
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
                        className={`px-4 py-2 rounded-full text-button font-bold uppercase tracking-widest border transition-colors ${
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
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border font-bold text-form-input uppercase tracking-widest transition-colors ${
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
                <div className="flex bg-white border border-gray-100 rounded-2xl overflow-hidden gap-1">
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
                {viewMode === 'list' && (
                    <ColumnConfigButton
                        columns={BOLETO_COLUMNS}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />
                )}
            </div>

            {/* Painel de filtros avançados */}
            {showFiltros && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Filtros avançados</span>
                        {temFiltroAtivo && (
                            <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-red-500 hover:text-red-700 normal-case font-bold">
                                <X className="w-3 h-3" /> Limpar filtros
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Vencimento de */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Vencimento de</label>
                            <input
                                type="date"
                                value={vencDe}
                                onChange={(e) => setVencDe(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Vencimento até */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Vencimento até</label>
                            <input
                                type="date"
                                value={vencAte}
                                onChange={(e) => setVencAte(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Valor mínimo */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Valor mínimo (R$)</label>
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
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Valor máximo (R$)</label>
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
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Ordenar por</span>
                        <select
                            value={ordenarPor}
                            onChange={(e) => setOrdenarPor(e.target.value as typeof ordenarPor)}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-form-input font-bold"
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
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOrdenarDir(d => d === 'asc' ? 'desc' : 'asc')}
                            className="normal-case font-bold"
                        >
                            {ordenarDir === 'asc' ? '↑ Crescente' : '↓ Decrescente'}
                        </Button>
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

            {/* Barra de ações em lote — fixa (fora do fluxo normal) para não forçar
                reflow da lista inteira de boletos ao selecionar/desmarcar o primeiro item */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {selectedIds.size} boleto{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">
                            · {formatBRL(filtered.filter(b => selectedIds.has(b.id)).reduce((s, b) => s + (b.valor ?? 0), 0))}
                        </span>
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsLoteEditOpen(true)}
                        className="text-blue-700 border-none hover:bg-blue-50"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar em Lote
                    </Button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
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
                    {filtered.map((b, idx) => {
                        const atrasado = !!(b.vencimento && !['pago','cancelado'].includes(b.status)
                            && new Date(b.vencimento + 'T00:00:00') < new Date());
                        return (
                            <BoletoCardItem
                                key={b.id}
                                boleto={b}
                                idx={idx}
                                selected={selectedIds.has(b.id)}
                                isHighlighted={highlightId === b.id}
                                atrasado={atrasado}
                                supplierMap={supplierMap}
                                onOpen={abrirEdicao}
                                onCheckboxMouseDown={handleCheckboxMouseDown}
                                onCheckboxChange={handleCheckboxChange}
                            />
                        );
                    })}
                </div>
            ) : (
                /* ── Vista em lista ── */
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-widest text-gray-400">
                                <th className="px-4 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && filtered.every(b => selectedIds.has(b.id))}
                                        onChange={() => filtered.every(b => selectedIds.has(b.id)) ? clearSelection() : selectAllFiltered()}
                                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                        title="Selecionar todos"
                                    />
                                </th>
                                {tableColumns.visibleColumns.includes('numero') && (
                                    <SortableHeader
                                        label="Código"
                                        colKey="numero"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-left px-4 py-3 w-20"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('beneficiario') && (
                                    <SortableHeader
                                        label="Beneficiário"
                                        colKey="beneficiario"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-left px-4 py-3"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('obra') && (
                                    <SortableHeader
                                        label="Obra"
                                        colKey="obra"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-left px-4 py-3"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('centro_custo') && (
                                    <SortableHeader
                                        label="Centro de Custo"
                                        colKey="centro_custo"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-left px-4 py-3"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('valor') && (
                                    <SortableHeader
                                        label="Valor"
                                        colKey="valor"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-right px-4 py-3"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('vencimento') && (
                                    <SortableHeader
                                        label="Vencimento"
                                        colKey="vencimento"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-center px-4 py-3"
                                    />
                                )}
                                {tableColumns.visibleColumns.includes('status') && (
                                    <SortableHeader
                                        label="Status"
                                        colKey="status"
                                        sortable={true}
                                        sortColumn={tableColumns.sortColumn}
                                        sortDirection={tableColumns.sortDirection}
                                        onSort={tableColumns.handleColumnSort}
                                        className="text-center px-4 py-3"
                                    />
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map((b, idx) => {
                                const atrasado = !!(b.vencimento && !['pago','cancelado'].includes(b.status)
                                    && new Date(b.vencimento + 'T00:00:00') < new Date());
                                return (
                                    <BoletoRowItem
                                        key={b.id}
                                        boleto={b}
                                        idx={idx}
                                        selected={selectedIds.has(b.id)}
                                        isHighlighted={highlightId === b.id}
                                        atrasado={atrasado}
                                        supplierMap={supplierMap}
                                        projectMap={projectMap}
                                        ccMap={ccMap}
                                        visibleColumns={tableColumns.visibleColumns}
                                        onOpen={abrirEdicao}
                                        onCheckboxMouseDown={handleCheckboxMouseDown}
                                        onCheckboxChange={handleCheckboxChange}
                                    />
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t border-gray-100">
                                <td colSpan={5} className="px-4 py-2 text-table-body text-gray-400">{filtered.length} boleto{filtered.length !== 1 ? 's' : ''}</td>
                                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                                    {formatBRL(filtered.filter(b => !['pago','cancelado'].includes(b.status)).reduce((s, b) => s + (b.valor ?? 0), 0))}
                                </td>
                                <td colSpan={2} className="px-4 py-2 text-table-body text-gray-400 text-right">total pendente</td>
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

            {isLoteOpen && (
                <BoletoLoteModal
                    organizationId={effectiveOrgId ?? organizationId}
                    organizations={organizations}
                    userEmail={userEmail}
                    projectId={projectId}
                    onClose={() => setIsLoteOpen(false)}
                    onConcluir={() => { setIsLoteOpen(false); carregar(effectiveOrgId); }}
                />
            )}

            {isLoteEditOpen && (
                <BoletoEdicaoEmLoteModal
                    boletos={filtered.filter(b => selectedIds.has(b.id))}
                    organizationId={effectiveOrgId ?? organizationId}
                    suppliers={supplierList}
                    projects={projectList}
                    costCenters={ccList}
                    userEmail={userEmail}
                    onClose={() => { setIsLoteEditOpen(false); clearSelection(); }}
                    onSaved={() => carregar(effectiveOrgId)}
                />
            )}
        </div>
    );
};

export default BoletoManager;
