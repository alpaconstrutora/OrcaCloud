import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Search, FileText, Loader2, RefreshCw,
    Building2, Calendar, AlertTriangle,
    Wallet, Clock, CheckCircle2, SlidersHorizontal, X,
    Download, LayoutGrid, List, Upload, Pencil, AlertCircle, Trash2, MoveHorizontal, ChevronDown,
} from 'lucide-react';
import { boletoService } from '../services/boletoService';
import { useConfirm } from './ui/confirm';
import { financialRegistryService } from '../services/financialRegistryService';
import { projectService } from '../services/projectService';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import type { Boleto, BoletoStatus, BoletoFilters, BoletoStats, Organization, CostCenter } from '../types';
import { STATUS_LABELS, STATUS_TEXT_COLORS } from '../utils/boletoStatus';
import { onlyObras } from '../utils/projectClassification';
import BoletoFormModal, { formatBRL } from './BoletoFormModal';
import BoletoLoteModal from './BoletoLoteModal';
import BoletoEdicaoEmLoteModal from './BoletoEdicaoEmLoteModal';
import ActionIconButton from './ui/ActionIconButton';
import { useStore } from '../store/useStore';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { formatDateBR, formatDateTimeBR } from './ui/Format';
import Button from './ui/Button';
import { KpiCard } from './ui/KpiCard';

interface BoletoManagerProps {
    organizationId: string;
    userEmail?: string;
    projectId?: string;
    organizations?: Organization[];
    onOrgChange?: (id: string | null) => void;
    /* `tabsSlot` removido em 2026-08-15: só o ProjectFinancialManager o passava,
       quando esta tela era aba dele. Agora ela é sempre rota própria
       (AppRouter 'boletos-pagar') e não tem barra de abas de pai nenhum. */
}

const BOLETO_COLUMNS: ColumnConfig[] = [
    { key: 'numero', label: 'Código', sortable: true },
    { key: 'beneficiario', label: 'Beneficiário', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'capturado_em', label: 'Capturado em', sortable: true },
    { key: 'capturado_por', label: 'Capturado por', sortable: true },
    // Clicar na linha já abre o boleto (ação dominante, única relevante — guia
    // §9.1). A coluna 'actions' fica só com o que não é a ação dominante:
    // excluir (restrito a rascunho, igual à exclusão em lote).
    { key: 'actions', label: 'Ações', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX (padrão ClientList.tsx). 'actions' não tem
// ordenação própria (sortable: false) mas participa do arraste igual às demais.
const BOLETO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; uppercase?: boolean; className: string }> = {
    numero: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    beneficiario: { label: 'Beneficiário', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    obra: { label: 'Obra', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    centro_custo: { label: 'Centro de Custo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    valor: { label: 'Valor', className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    vencimento: { label: 'Vencimento', className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    capturado_em: { label: 'Capturado em', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    capturado_por: { label: 'Capturado por', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    actions: { label: 'Ações', sortable: false, className: 'px-6 py-2 text-right' },
};

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    numero: 118, beneficiario: 220, obra: 160, centro_custo: 179, valor: 130,
    vencimento: 150, status: 130, capturado_em: 165, capturado_por: 167, actions: 70,
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa os
// filtros rápidos/campos de período já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'beneficiario', label: 'Beneficiário', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'valor', label: 'Valor', type: 'number' },
    { key: 'vencimento', label: 'Vencimento', type: 'date' },
    { key: 'banco', label: 'Banco', type: 'text' },
];

function getAdvancedFilterValue(b: Boleto, key: string): unknown {
    switch (key) {
        case 'beneficiario': return b.beneficiario_nome ?? b.documento_nome ?? '';
        case 'status': return b.status;
        case 'valor': return b.valor ?? null;
        case 'vencimento': return b.vencimento ?? null;
        case 'banco': return b.banco_nome ?? '';
        default: return null;
    }
}

// Conteúdo de cada célula (td) por coluna — extraído para função pura para que
// o tbody possa mapear `orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna (padrão renderClientCell em ClientList.tsx).
function renderBoletoCell(
    key: string,
    b: Boleto,
    ctx: {
        atrasado: boolean;
        supplierMap: Record<string, string>;
        projectMap: Record<string, string>;
        ccMap: Record<string, string>;
        onDelete: (b: Boleto) => void;
    },
): React.ReactNode {
    const { atrasado, supplierMap, projectMap, ccMap, onDelete } = ctx;
    switch (key) {
        case 'numero':
            return (
                <span className="text-sm font-normal text-gray-600 whitespace-nowrap">
                    {b.numero != null ? `#${String(b.numero).padStart(4, '0')}` : '—'}
                </span>
            );
        case 'beneficiario': {
            const nome = b.supplier_id
                ? (supplierMap[b.supplier_id] ?? b.beneficiario_nome ?? b.documento_nome)
                : (b.beneficiario_nome ?? b.documento_nome);
            return (
                <div className="text-sm font-normal text-gray-700">
                    <p className="break-words">{nome}</p>
                    {b.beneficiario_cnpj && !b.supplier_id && (
                        <p className="text-xs text-gray-400 font-normal break-words">{b.beneficiario_cnpj}</p>
                    )}
                </div>
            );
        }
        case 'obra': {
            const obraNome = b.project_id ? (projectMap[b.project_id] ?? '—') : '—';
            return (
                <p className="break-words text-sm font-normal text-gray-700">
                    {obraNome}
                </p>
            );
        }
        case 'centro_custo': {
            const ccNome = b.cost_center_id ? (ccMap[b.cost_center_id] ?? '—') : '—';
            return (
                <p className="break-words text-sm font-normal text-gray-600">
                    {ccNome}
                </p>
            );
        }
        case 'valor':
            return (
                <div className="text-sm font-medium text-gray-800 text-right whitespace-nowrap">
                    {formatBRL(b.valor)}
                </div>
            );
        case 'vencimento':
            return (
                <div className={`text-sm font-normal whitespace-nowrap ${atrasado ? 'text-red-600' : 'text-gray-600'}`}>
                    {formatDateBR(b.vencimento)}
                    {atrasado && <div className="text-xs text-red-400 font-normal">Atrasado</div>}
                </div>
            );
        case 'status':
            return (
                <>
                    <span className={`text-sm font-normal ${STATUS_TEXT_COLORS[b.status]}`}>
                        {STATUS_LABELS[b.status]}
                    </span>
                    {b.confidence_score !== undefined && b.confidence_score < 80 && (
                        <div className="mt-0.5 flex items-center gap-0.5 text-[9px] font-normal text-amber-600">
                            <AlertTriangle className="w-2.5 h-2.5" /> {b.confidence_score}%
                        </div>
                    )}
                </>
            );
        case 'capturado_em':
            return (
                <span className="text-sm font-normal text-gray-600 whitespace-nowrap">
                    {formatDateTimeBR(b.created_at)}
                </span>
            );
        case 'capturado_por':
            return (
                <p className="truncate text-sm font-normal text-gray-600 max-w-[160px]">
                    {b.created_by_email ?? '—'}
                </p>
            );
        case 'actions':
            return (
                <div className="flex items-center justify-end">
                    <ActionIconButton
                        kind="delete"
                        disabled={b.status !== 'rascunho'}
                        title={b.status === 'rascunho' ? 'Excluir' : 'Apenas rascunhos podem ser excluídos'}
                        onClick={() => onDelete(b)}
                    />
                </div>
            );
        default:
            return null;
    }
}

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
    onDelete: (b: Boleto) => void;
}

// Memoizado para que uma seleção (shift+click em intervalo grande) não force o
// React a re-renderizar todos os cards/linhas — só os que realmente mudaram de
// estado (selected/atrasado/isHighlighted) são atualizados.
const BoletoCardItem = React.memo(function BoletoCardItem({
    boleto: b, idx, selected, isHighlighted, atrasado, supplierMap,
    onOpen, onCheckboxMouseDown, onCheckboxChange, onDelete,
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
                    title="Dica: segure Shift e clique para selecionar um intervalo"
                    checked={selected}
                    onMouseDown={onCheckboxMouseDown}
                    onChange={e => onCheckboxChange(e.target.checked, b.id, idx)}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                />
            </label>
            <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                <ActionIconButton
                    kind="delete"
                    size="sm"
                    disabled={b.status !== 'rascunho'}
                    title={b.status === 'rascunho' ? 'Excluir' : 'Apenas rascunhos podem ser excluídos'}
                    onClick={() => onDelete(b)}
                />
            </div>
            <button
                onClick={() => onOpen(b)}
                className={`w-full text-left bg-white rounded-[10px] border p-5 pl-9 hover:shadow-lg transition-all ${
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
                        <span className={`text-sm font-normal ${STATUS_TEXT_COLORS[b.status]}`}>
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
    orderedVisibleColumns: string[];
    projectMap: Record<string, string>;
    ccMap: Record<string, string>;
}

const BoletoRowItem = React.memo(function BoletoRowItem({
    boleto: b, idx, selected, isHighlighted, atrasado, supplierMap, orderedVisibleColumns, projectMap, ccMap,
    onOpen, onCheckboxMouseDown, onCheckboxChange, onDelete,
}: BoletoRowItemProps) {
    return (
        <tr
            onClick={() => onOpen(b)}
            className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${
                isHighlighted ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : selected ? 'bg-blue-50/60' : atrasado ? 'bg-red-50/40' : ''
            }`}
        >
            <td className="px-4 py-2.5 border-r border-gray-100" onClick={e => e.stopPropagation()}>
                <input
                    type="checkbox"
                    title="Dica: segure Shift e clique para selecionar um intervalo"
                    checked={selected}
                    onMouseDown={onCheckboxMouseDown}
                    onChange={e => onCheckboxChange(e.target.checked, b.id, idx)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                />
            </td>
            {orderedVisibleColumns.map(key => (
                <td
                    key={key}
                    className="px-6 py-2.5 border-r border-gray-100 last:border-r-0"
                    onClick={key === 'actions' ? (e) => e.stopPropagation() : undefined}
                >
                    {renderBoletoCell(key, b, { atrasado, supplierMap, projectMap, ccMap, onDelete })}
                </td>
            ))}
            {/* espaçador — casa com o <col /> sem largura, no final (ver colgroup) */}
            <td aria-hidden="true"></td>
        </tr>
    );
});

const BoletoManager: React.FC<BoletoManagerProps> = ({
    organizationId, userEmail, projectId, organizations = [], onOrgChange,
}) => {
    const [boletos, setBoletos] = useState<Boleto[]>([]);
    // Totais agregados no servidor — independem de quantos boletos estão na tela.
    const [stats, setStats] = useState<BoletoStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoteOpen, setIsLoteOpen] = useState(false);
    const [editing, setEditing] = useState<Boleto | undefined>(undefined);
    const [exporting, setExporting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoteEditOpen, setIsLoteEditOpen] = useState(false);
    const [excluindoLote, setExcluindoLote] = useState(false);
    const confirm = useConfirm();
    const tableColumns = useTableColumns(BOLETO_COLUMNS, 'boletoManagerColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'boletoManagerColWidths');
    // Largura total = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full/100% junto com table-layout:fixed (§6.1). Sem coluna "Ações" (§9.1) —
    // o espaçador vai no FINAL, não antes de nada (não há coluna fixa pra ancorar).
    const tableTotalWidth = 40
        + (['numero', 'beneficiario', 'obra', 'centro_custo', 'valor', 'vencimento', 'status', 'capturado_em', 'capturado_por', 'actions'] as const)
            .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0);
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'boletoManagerFilters:advanced');

    // Toast de Notificação — Seção 13 do guia
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Raw arrays kept alongside maps for the bulk-edit modal dropdowns
    const [supplierList, setSupplierList] = useState<{ id: string; name: string }[]>([]);
    const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);
    const [ccList, setCcList] = useState<{ id: string; name: string }[]>([]);

    // F2: filtros sobrevivem a navegação/reload.
    const [filtroStatus, setFiltroStatus] = usePersistedState<BoletoStatus | 'todos'>('boletoManagerFilters:status', 'todos');
    const [busca, setBusca] = usePersistedState('boletoManagerFilters:busca', '');
    const [buscaDebounced, setBuscaDebounced] = useState('');

    // Debounce da busca textual: evita refiltrar/reordenar a lista inteira
    // (e re-renderizar todos os cards) a cada tecla digitada, o que travava o input.
    useEffect(() => {
        const timer = setTimeout(() => setBuscaDebounced(busca), 250);
        return () => clearTimeout(timer);
    }, [busca]);

    // Filtro de status — dropdown (mesmo mecanismo do AdvancedFilterPanel/ColumnConfigButton)
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showStatusMenu) setShowStatusMenu(false);
        };
        const onClickOutside = (e: MouseEvent) => {
            if (showStatusMenu && statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
                setShowStatusMenu(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onClickOutside);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onClickOutside);
        };
    }, [showStatusMenu]);

    // Filtros avançados (client-side)
    const [showFiltros, setShowFiltros] = useState(false);
    const [vencDe, setVencDe] = usePersistedState('boletoManagerFilters:vencDe', '');
    const [vencAte, setVencAte] = usePersistedState('boletoManagerFilters:vencAte', '');
    const [valorMin, setValorMin] = usePersistedState('boletoManagerFilters:valorMin', '');
    const [valorMax, setValorMax] = usePersistedState('boletoManagerFilters:valorMax', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('boletoManagerFilters:viewMode', 'list');

    // Lookup maps para exibição nos cards/linhas
    const [ccMap, setCcMap] = useState<Record<string, string>>({});
    const [projectMap, setProjectMap] = useState<Record<string, string>>({});
    const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});


    // Abrir edição substitui a lista pelo BoletoFormModal (página cheia) — ao
    // voltar, a div de scroll da tabela é recriada do zero e o navegador zera
    // o scrollTop, dando a impressão de que "o foco volta pra primeira linha".
    // Guardamos a posição aqui e restauramos ao fechar o formulário.
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const savedScrollTopRef = useRef(0);

    // Deep-link: item destacado vindo de outro módulo (ex: conciliação bancária)
    const viewFocus = useStore(s => s.viewFocus);
    const setViewFocus = useStore(s => s.setViewFocus);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const temFiltroAtivo = vencDe || vencAte || valorMin || valorMax;

    function limparFiltros() {
        setVencDe(''); setVencAte(''); setValorMin(''); setValorMax('');
    }

    // Org vem do seletor global do topo; vazio = "Todas as organizações" (REGRA #5:
    // leitura não bloqueia — o service não filtra e a RLS recorta).
    const effectiveOrgId = organizationId || undefined;

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

    async function handleExcluirLote() {
        const selecionados = filtered.filter(b => selectedIds.has(b.id));
        const rascunhos = selecionados.filter(b => b.status === 'rascunho');
        const naoRascunhos = selecionados.length - rascunhos.length;
        if (rascunhos.length === 0) {
            notify('Apenas boletos em rascunho podem ser excluídos. Use cancelar para os demais.', 'error');
            return;
        }
        const ok = await confirm({
            title: `Excluir ${rascunhos.length} boleto${rascunhos.length !== 1 ? 's' : ''}?`,
            message: naoRascunhos > 0
                ? `Essa ação não pode ser desfeita. ${naoRascunhos} boleto${naoRascunhos !== 1 ? 's' : ''} selecionado${naoRascunhos !== 1 ? 's' : ''} não ${naoRascunhos !== 1 ? 'são rascunhos e serão ignorados' : 'é rascunho e será ignorado'} (use cancelar).`
                : 'Excluir permanentemente os boletos selecionados? Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setExcluindoLote(true);
        try {
            const resultados = await Promise.allSettled(
                rascunhos.map(b => boletoService.excluirRascunho(b.id, effectiveOrgId ?? organizationId, userEmail))
            );
            const excluidosIds = new Set(
                rascunhos.filter((_, i) => resultados[i].status === 'fulfilled').map(b => b.id)
            );
            const falhas = resultados.length - excluidosIds.size;
            if (falhas > 0) {
                notify(`${excluidosIds.size} boleto(s) excluído(s), ${falhas} falharam.`, excluidosIds.size === 0 ? 'error' : 'success');
            } else {
                notify(`${rascunhos.length} boleto${rascunhos.length !== 1 ? 's excluídos' : ' excluído'} com sucesso.`);
            }
            if (excluidosIds.size > 0) {
                setBoletos(prev => prev.filter(item => !excluidosIds.has(item.id)));
                void recarregarStats();
            }
            clearSelection();
        } finally {
            setExcluindoLote(false);
        }
    }

    async function handleExcluirBoleto(b: Boleto) {
        if (b.status !== 'rascunho') {
            notify('Apenas boletos em rascunho podem ser excluídos. Use cancelar para os demais.', 'error');
            return;
        }
        const ok = await confirm({
            title: 'Excluir boleto?',
            message: 'Excluir permanentemente este boleto? Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await boletoService.excluirRascunho(b.id, effectiveOrgId ?? organizationId, userEmail);
            notify('Boleto excluído com sucesso.');
            setBoletos(prev => prev.filter(item => item.id !== b.id));
            void recarregarStats();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify(error.message || 'Falha ao excluir boleto.', 'error');
        }
    }

    /**
     * Reagrega só os KPIs, sem mexer na lista nem acionar `loading` — assim as
     * ações locais (§22: criar/editar/excluir atualizam o array na mão) não
     * deixam os totais defasados e a tela não recarrega nem perde o scroll.
     */
    const recarregarStats = useCallback(async () => {
        try {
            const filters: BoletoFilters = {};
            if (projectId) filters.project_id = projectId;
            setStats(await boletoService.stats(effectiveOrgId, filters));
        } catch {
            // KPI defasado não justifica quebrar a tela; a próxima carga corrige.
        }
    }, [effectiveOrgId, projectId]);

    async function carregar(orgId: string | undefined) {
        setLoading(true);
        setError(null);
        try {
            const filters: BoletoFilters = {};
            if (filtroStatus !== 'todos') filters.status = filtroStatus;
            if (projectId) filters.project_id = projectId;

            const [list, agregados, ccs, projs, sups] = await Promise.all([
                boletoService.list(orgId, filters),
                boletoService.stats(orgId, filters),
                financialRegistryService.listCostCenters(orgId).catch(() => [] as CostCenter[]),
                projectService.listProjects({ organizationId: orgId ?? organizationId }).catch(() => [] as { id: string; name: string }[]),
                supplierService.listSuppliers(orgId).catch(() => [] as { id: string; name: string; nickname?: string | null }[]),
            ]);

            setBoletos(list);
            setStats(agregados);
            // `listProjects` devolve OBRA/ORCAMENTO/PLANEJAMENTO/DIARIO — o service só
            // tira projeto de sistema. Sem `onlyObras`, a coluna "Obra" do boleto
            // imprimia o nome de um planejamento, e o seletor de obra da edição em
            // lote oferecia planejamento para gravar. CLAUDE.md regra #3, nas duas
            // camadas. Mesmo defeito encontrado na lista de contratos em 28/08/2026.
            // O cast só reconcilia a união criada pelo fallback do `.catch` acima
            // (`{id,name}[]`) com a linha real, que traz `settings`.
            const obras = onlyObras((projs || []) as { id: string; name: string; settings?: { classification?: string | null } | null }[]);
            setCcMap(Object.fromEntries((ccs || []).map((c) => [c.id, c.name])));
            setProjectMap(Object.fromEntries(obras.map((p) => [p.id, p.name])));
            setSupplierMap(Object.fromEntries((sups || []).map((s) => [s.id, getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)])));
            setCcList((ccs || []).map(c => ({ id: c.id, name: c.name })));
            // Projeto de sistema já sai no projectService — utils/systemProjects.ts
            setProjectList(obras.map(p => ({ id: p.id, name: p.name })));
            setSupplierList((sups || []).map(s => ({ id: s.id, name: getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay) })));
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error.message || 'Falha ao carregar boletos');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar(effectiveOrgId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveOrgId, filtroStatus, projectId]);

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

        list = applyFilterRules(list, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        // Ordenação — cada coluna já ordena pelo próprio <thead> (SortableHeader,
        // guia §6.3/§6.4). Sem coluna selecionada, cai no default abaixo
        // (created_at desc — captura mais recente primeiro).
        list = [...list].sort((a, b) => {
            let va: string | number, vb: string | number;
            const sortCol = tableColumns.sortColumn || 'created_at';
            const sortDir = tableColumns.sortColumn ? tableColumns.sortDirection : 'desc';

            switch (sortCol) {
                case 'numero':        va = a.numero ?? 0;                       vb = b.numero ?? 0;                       break;
                case 'vencimento':    va = a.vencimento ?? '';                  vb = b.vencimento ?? '';                  break;
                case 'valor':         va = a.valor ?? 0;                        vb = b.valor ?? 0;                        break;
                case 'obra':          va = projectMap[a.project_id ?? ''] ?? ''; vb = projectMap[b.project_id ?? ''] ?? ''; break;
                case 'centro_custo':  va = ccMap[a.cost_center_id ?? ''] ?? '';  vb = ccMap[b.cost_center_id ?? ''] ?? '';  break;
                case 'beneficiario':  va = (a.beneficiario_nome ?? '').toLowerCase(); vb = (b.beneficiario_nome ?? '').toLowerCase(); break;
                case 'status':        va = a.status;                            vb = b.status;                            break;
                case 'capturado_em':  va = a.created_at;                        vb = b.created_at;                       break;
                case 'capturado_por': va = (a.created_by_email ?? '').toLowerCase(); vb = (b.created_by_email ?? '').toLowerCase(); break;
                default:              va = a.created_at;                        vb = b.created_at;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [boletos, buscaDebounced, vencDe, vencAte, valorMin, valorMax, advancedFilters.rules, supplierMap, tableColumns.sortColumn, tableColumns.sortDirection]);

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

    // KPIs e contadores vêm de `boletoService.stats` (agregado sobre a base inteira).
    // Não recalcular a partir de `boletos`: essa lista é o recorte já filtrado por
    // status, então os contadores dos outros status zerariam.
    const counts = useMemo(() => {
        const c: Record<string, number> = { todos: stats?.total ?? 0 };
        for (const s of Object.keys(STATUS_LABELS)) c[s] = stats?.countPorStatus[s] ?? 0;
        return c;
    }, [stats]);

    const summary = useMemo(() => ({
        totalPendente: stats?.totalPendente ?? 0, countPendente: stats?.countPendente ?? 0,
        totalAtrasado: stats?.totalAtrasado ?? 0, countAtrasado: stats?.countAtrasado ?? 0,
        totalAVencer7: stats?.totalAVencer7 ?? 0, countAVencer7: stats?.countAVencer7 ?? 0,
        totalPagoMes:  stats?.totalPagoMes  ?? 0, countPagoMes:  stats?.countPagoMes  ?? 0,
    }), [stats]);

    function abrirNovo() {
        setEditing(undefined);
        setIsModalOpen(true);
    }

    const abrirEdicao = useCallback((b: Boleto) => {
        savedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
        setEditing(b);
        setIsModalOpen(true);
    }, []);

    function fecharModal() {
        setIsModalOpen(false);
        setEditing(undefined);
        // O container ainda não existe no primeiro paint pós-fechamento — espera
        // o próximo frame antes de restaurar o scroll.
        requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
            }
        });
    }

    function handleSaved(updated: Boleto) {
        // `boletos` já vem filtrado por status no servidor (carregar() passa
        // filters.status) — respeitar o filtro atual em vez de sempre inserir,
        // senão um boleto capturado com outro status "vaza" para a aba errada.
        const combinaComFiltro = (filtroStatus === 'todos' || updated.status === filtroStatus)
            && (!projectId || updated.project_id === projectId);
        setBoletos(prev => {
            const existe = prev.some(b => b.id === updated.id);
            if (!combinaComFiltro) return prev.filter(b => b.id !== updated.id);
            return existe ? prev.map(b => (b.id === updated.id ? updated : b)) : [updated, ...prev];
        });
        void recarregarStats();
    }

    async function handleExport(tipo: 'excel' | 'pdf') {
        if (!filtered.length) return;
        setExporting(true);
        try {
            const nome = `boletos${effectiveOrgId ? `_${effectiveOrgId.slice(0, 8)}` : ''}`;
            if (tipo === 'excel') await boletoService.exportarExcel(filtered, nome);
            else await boletoService.exportarPDF(filtered, nome);
            notify(`Exportação para ${tipo === 'excel' ? 'Excel' : 'PDF'} concluída.`);
        } catch (err: unknown) {
            console.error('[export]', err);
            notify('Falha ao exportar. Tente novamente.', 'error');
        } finally {
            setExporting(false);
        }
    }

    // Formulário de captura ocupa a área do módulo (página dentro do app),
    // no lugar da lista — mantendo menu lateral/topo visíveis. Não é overlay.
    if (isModalOpen) {
        return (
            <BoletoFormModal
                organizationId={editing?.organization_id ?? effectiveOrgId ?? ''}
                organizations={organizations}
                onOrgChange={(id) => onOrgChange?.(id || null)}
                userEmail={userEmail}
                projectId={projectId}
                boleto={editing}
                onClose={fecharModal}
                onSaved={handleSaved}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* 1. Título — h1 solto (§1). Escopo e ações moram na barra da §4, abaixo
                dos KPIs; antes estavam espremidos aqui na mesma linha do título. */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Boletos a Pagar</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Capture boletos via PDF e gere lançamentos automaticamente em contas a pagar.
                </p>
            </div>

            {/* 3. Cards de resumo — padrão guia seção 4 (componente KpiCard) */}
            {!loading && boletos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <KpiCard
                        label="A Pagar"
                        value={formatBRL(summary.totalPendente)}
                        sub={`${summary.countPendente} boleto${summary.countPendente !== 1 ? 's' : ''} pendente${summary.countPendente !== 1 ? 's' : ''}`}
                        icon={<Wallet className="w-5 h-5" />}
                        color="blue"
                    />
                    <KpiCard
                        label="Vencem em 7 dias"
                        value={formatBRL(summary.totalAVencer7)}
                        sub={`${summary.countAVencer7} boleto${summary.countAVencer7 !== 1 ? 's' : ''}`}
                        icon={<Clock className="w-5 h-5" />}
                        color="amber"
                    />
                    <KpiCard
                        label="Em Atraso"
                        value={formatBRL(summary.totalAtrasado)}
                        sub={`${summary.countAtrasado} boleto${summary.countAtrasado !== 1 ? 's' : ''}`}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        color="red"
                    />
                    <KpiCard
                        label="Pagos no Mês"
                        value={formatBRL(summary.totalPagoMes)}
                        sub={`${summary.countPagoMes} boleto${summary.countPagoMes !== 1 ? 's' : ''}`}
                        icon={<CheckCircle2 className="w-5 h-5" />}
                        color="emerald"
                    />
                </div>
            )}

            {/* 4. Toolbar de botões (§4) — escopo à esquerda (organização), ação
                primária à direita. Estavam todos na linha do título antes. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Sem seletor de organização aqui: vem do seletor global do topo. */}

                    {/* Exports — só fazem sentido com lista carregada */}
                    {filtered.length > 0 && (
                        <>
                            <button
                                onClick={() => handleExport('excel')}
                                disabled={exporting}
                                title="Exportar lista filtrada para Excel"
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-emerald-700 rounded-[6px] hover:bg-emerald-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Excel
                            </button>
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={exporting}
                                title="Exportar lista filtrada para PDF"
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-red-600 rounded-[6px] hover:bg-red-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                PDF
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => carregar(effectiveOrgId)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </button>
                    <button
                        onClick={() => setIsLoteOpen(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-blue-600 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Upload className="w-4 h-4" />
                        Importar em Lote
                    </button>
                </div>

                {/* Ação primária — único azul sólido da tela (§8) */}
                <button
                    onClick={abrirNovo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo boleto
                </button>
            </div>

            {/* Erro — antes do card, para não quebrar a costura toolbar↔tabela abaixo */}
            {error && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Toolbar acoplada à tabela (padrão OpuraDocsModule/GED): toolbar e
                conteúdo dividem um único bloco — border/rounded/shadow ficam só no
                container pai (overflow-hidden corta os cantos), a única costura
                visível entre os dois é o border-b da toolbar, sem bordas duplicadas. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-white space-y-3">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                {/* min-w-0: sem isso o flex-1 não encolhe abaixo do tamanho do
                    placeholder e a linha estoura quando os demais grupos entram ao lado. */}
                <div className="flex-1 min-w-0 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome do arquivo, beneficiário ou linha digitável..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                {/* Filtro de status — dropdown, dentro da toolbar acoplada e logo após
                    a busca (§5). Antes era um trilho segmentado com as 7 pílulas lado
                    a lado, que não cabia bem junto dos outros grupos da toolbar; virou
                    um único botão que abre a lista, mesmo mecanismo de abre/fecha do
                    AdvancedFilterPanel/ColumnConfigButton (click fora + Escape). */}
                <div className="relative shrink-0" ref={statusMenuRef}>
                    <button
                        onClick={() => setShowStatusMenu(v => !v)}
                        className={`flex items-center gap-2 h-9 px-3.5 rounded-[6px] border font-medium text-[13px] whitespace-nowrap transition-colors ${
                            filtroStatus !== 'todos'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {filtroStatus === 'todos' ? 'Status' : STATUS_LABELS[filtroStatus as BoletoStatus]}
                        <span className="opacity-60">{counts[filtroStatus] ?? 0}</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {showStatusMenu && (
                        <div className="absolute left-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] z-50">
                            {(['todos', ...Object.keys(STATUS_LABELS)] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => { setFiltroStatus(s as BoletoStatus | 'todos'); setShowStatusMenu(false); }}
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                                        filtroStatus === s ? 'text-blue-700 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <span>{s === 'todos' ? 'Todos' : STATUS_LABELS[s as BoletoStatus]}</span>
                                    <span className="opacity-60">{counts[s] ?? 0}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => setShowFiltros(v => !v)}
                    className={`flex items-center gap-2 h-9 px-3.5 rounded-[6px] border font-medium text-[13px] transition-colors ${
                        showFiltros || temFiltroAtivo
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Filtros
                    {temFiltroAtivo && (
                        <span className="ml-0.5 w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    )}
                </button>
                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

                {/* Separador entre grupo "filtrar" e grupo "visualizar" — só na variante desaninhada (§5.1) */}
                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                {/* Agrupador ViewMode + ColumnConfig — escala compacta §16 */}
                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    {viewMode === 'list' && (
                        <>
                            <ColumnConfigButton
                                columns={BOLETO_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                Duplo clique no divisor segue "restaurar padrão". */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                        </>
                    )}
                    <button
                        onClick={() => setViewMode('grid')}
                        title="Visualização em blocos"
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        title="Visualização em lista"
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Painel de filtros avançados — escala compacta §16 */}
            {showFiltros && (
                <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Filtros avançados</span>
                        {temFiltroAtivo && (
                            <button onClick={limparFiltros} className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
                                <X className="w-3 h-3" /> Limpar filtros
                            </button>
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
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm"
                            />
                        </div>
                        {/* Vencimento até */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Vencimento até</label>
                            <input
                                type="date"
                                value={vencAte}
                                onChange={(e) => setVencAte(e.target.value)}
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm"
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
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm"
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
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm"
                            />
                        </div>
                    </div>
                </div>
            )}
            </div>

            {/* Barra de ações em lote — fixa (fora do fluxo normal) para não forçar
                reflow da lista inteira de boletos ao selecionar/desmarcar o primeiro item */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
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
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExcluirLote}
                        disabled={excluindoLote}
                        className="text-red-700 border-none hover:bg-red-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir em Lote
                    </Button>
                    <button
                        onClick={clearSelection}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

            {/* Loading — padrão guia seção 11 (sem borda/rounded/shadow própria:
                já está dentro do card acoplado toolbar+conteúdo, ver abertura acima) */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando boletos...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                    {/* Empty State — padrão guia seção 12, escala compacta §16 */}
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum boleto encontrado</h3>
                    <p className="text-sm text-gray-500">Tente ajustar seus filtros de busca.</p>
                    <button onClick={abrirNovo} className="mt-4 text-blue-600 hover:underline text-sm font-medium">
                        Capturar o primeiro boleto
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
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
                                onDelete={handleExcluirBoleto}
                            />
                        );
                    })}
                </div>
            ) : (
                /* ── Vista em lista ── */
                /* Cabeçalho fixo (guia §6.5) — lista pode crescer bastante (captura
                    contínua de boletos); overflow-auto cobre rolagem vertical E
                    horizontal (§15). Sem bg/border/rounded/shadow própria: já está
                    dentro do card acoplado toolbar+conteúdo (ver abertura acima). */
                <div ref={scrollContainerRef} className="overflow-auto max-h-[70vh]">
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                        <colgroup>
                            {/* checkbox */}
                            <col style={{ width: '40px' }} />
                            {tableColumns.orderedVisibleColumns.map(key => (
                                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                            ))}
                            {/* espaçador NO FINAL (§6.1.1 não se aplica: sem coluna "Ações" fixa
                                pra ancorar — §9.1, o clique na linha já é a ação). Absorve a folga
                                quando a soma das colunas é menor que o container. */}
                            <col />
                        </colgroup>
                        {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader
                            força uppercase internamente por padrão; classes de estilo no <tr>. Ordem
                            vem de orderedVisibleColumns — arrastar um header (onMoveColumn) reordena
                            e persiste, estilo ClickUp (mesmo padrão de ClientList.tsx). */}
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && filtered.every(b => selectedIds.has(b.id))}
                                        onChange={() => filtered.every(b => selectedIds.has(b.id)) ? clearSelection() : selectAllFiltered()}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                        title="Selecionar todos"
                                    />
                                </th>
                                {tableColumns.orderedVisibleColumns.map(key => {
                                    const def = BOLETO_COLUMN_HEADERS[key];
                                    if (!def) return null;
                                    return (
                                        <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false}
                                            uppercase={def.uppercase ?? false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            onMoveColumn={tableColumns.moveColumn}
                                            className={def.className}>
                                            <cols.ResizeHandle colKey={key} />
                                        </SortableHeader>
                                    );
                                })}
                                {/* espaçador — casa com o <col /> sem largura, no final */}
                                <th aria-hidden="true" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
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
                                        orderedVisibleColumns={tableColumns.orderedVisibleColumns}
                                        onOpen={abrirEdicao}
                                        onCheckboxMouseDown={handleCheckboxMouseDown}
                                        onCheckboxChange={handleCheckboxChange}
                                        onDelete={handleExcluirBoleto}
                                    />
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t border-gray-100">
                                <td colSpan={5} className="px-4 py-2 text-table-body text-gray-400">{filtered.length} boleto{filtered.length !== 1 ? 's' : ''}</td>
                                <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                                    {formatBRL(filtered.filter(b => !['pago','cancelado'].includes(b.status)).reduce((s, b) => s + (b.valor ?? 0), 0))}
                                </td>
                                {/* colSpan 6: vencimento + status + capturado_em + capturado_por + actions + espaçador final */}
                                <td colSpan={6} className="px-4 py-2 text-table-body text-gray-400 text-right">total pendente</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
            </div>

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
            {/* Toast de Notificação — padrão guia seção 13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}

        </div>
    );
};

export default BoletoManager;
