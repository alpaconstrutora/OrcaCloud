import React from 'react';
import { investorService, Investor } from '../services/investorService';
import { investorPortalTokenService, InvestorPortalToken } from '../services/investorPortalTokenService';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, TrendingUp, LayoutDashboard, Table2, Building2, Link2, Copy, Check, RefreshCw, X, AlertCircle, Users, MoveHorizontal } from 'lucide-react';
import InvestorModal from './InvestorModal';
import { useOrgContext } from '../hooks/useOrgContext';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { useConfirm } from './ui/confirm';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import { isObra } from '../utils/projectClassification';

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_COL_WIDTHS: Record<string, number> = {
    code: 118, name: 240, contact: 240, document: 160, project: 220, actions: 190,
};

const INVESTOR_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Investidor', sortable: true },
    // Acesso/Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar (§6.3).
    { key: 'contact', label: 'Acesso / Contato', sortable: false },
    { key: 'document', label: 'Documento', sortable: true },
    // Obra Vinculada = lista de 0..N obras — sem valor único pra ordenar (§6.3).
    { key: 'project', label: 'Obra Vinculada', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX (mesmo padrão de ClientList.tsx).
const INVESTOR_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    name: { label: 'Investidor', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    contact: { label: 'Acesso / Contato', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    document: { label: 'Documento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    project: { label: 'Obra Vinculada', sortable: false, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca já existente, não a substitui.
type InvestorRow = Investor & { _projectNames?: string };

const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Investidor', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'document', label: 'Documento', type: 'text' },
    { key: 'project', label: 'Obra Vinculada', type: 'text' },
];

function getAdvancedFilterValue(inv: InvestorRow, key: string): unknown {
    switch (key) {
        case 'name': return inv.name ?? '';
        case 'email': return inv.email ?? '';
        case 'document': return inv.document ?? '';
        case 'project': return inv._projectNames ?? '';
        default: return null;
    }
}

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna (mesmo padrão de ClientList.tsx).
function renderInvestorCell(key: string, investor: Investor, investorProjects: any[]): React.ReactNode {
    switch (key) {
        case 'code':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{investor.code || '-'}</span>;
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                        <User className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-sm font-normal text-gray-900">{investor.name}</p>
                        <p className="text-xs font-medium text-gray-400">Perfil investidor</p>
                    </div>
                </div>
            );
        case 'contact':
            return (
                <div className="space-y-1">
                    <div className="flex items-center text-sm font-normal text-gray-600">
                        <Mail className="w-3.5 h-3.5 mr-1.5 text-purple-500 shrink-0" />
                        {investor.email}
                    </div>
                    {investor.phone && (
                        <div className="flex items-center text-sm font-normal text-gray-600">
                            <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                            {investor.phone}
                        </div>
                    )}
                </div>
            );
        case 'document':
            return <span className="text-sm font-normal text-gray-600">{investor.document || '-'}</span>;
        case 'project':
            if (investorProjects.length === 0) {
                return <span className="text-sm font-normal text-gray-400">-</span>;
            }
            return (
                <div className="flex flex-col gap-1">
                    {investorProjects.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 text-sm font-normal text-blue-600">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                        </div>
                    ))}
                </div>
            );
        default:
            return null;
    }
}

interface InvestorListProps {
    onInvestorsChange?: () => void;
    organizationId?: string;
    /** Callback chamado quando admin quer "Acessar Portal" (impersonação). */
    onSelectInvestor?: (investor: Investor) => void;
}

const InvestorList: React.FC<InvestorListProps> = ({ onInvestorsChange, organizationId, onSelectInvestor }) => {
    // A organização vem da prop (contexto da tela) ou do seletor do topo. NUNCA
    // `organizations[0]` — ver hooks/useOrgContext.tsx.
    const { orgId: contextOrgId } = useOrgContext();
    const orgId = organizationId || contextOrgId || undefined;
    const [investors, setInvestors] = React.useState<Investor[]>([]);
    const [projects, setProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('investorListFilters:search', '');
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedInvestor, setSelectedInvestor] = React.useState<Investor | undefined>(undefined);
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('investorListFilters:viewMode', 'list');
    const confirm = useConfirm();

    // Toast (§13) — snippet canônico local, não usa componente de outro domínio
    // (Investidores não é Suprimentos/Serviços/Vendas — ver feedback_separacao_contratos).
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Token modal
    const [tokenModal, setTokenModal] = React.useState<{ investor: Investor; token: InvestorPortalToken | null } | null>(null);
    const [tokenLoading, setTokenLoading] = React.useState(false);
    const [tokenCopied, setTokenCopied] = React.useState(false);

    React.useEffect(() => {
        loadData();
    }, [organizationId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            let projectsQuery = supabase
                .from('projects')
                .select('id, name, investor_id, settings')
                .filter('settings->>classification', 'eq', 'OBRA');
            if (organizationId) {
                projectsQuery = projectsQuery.filter('settings->>organizationId', 'eq', organizationId);
            }
            const [investorsData, { data: projectsData }] = await Promise.all([
                investorService.listInvestors(organizationId),
                projectsQuery
            ]);
            setInvestors(investorsData);
            setProjects(projectsData ?? []);
        } catch (error) {
            console.error("Erro ao listar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadInvestors = loadData;

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, que já tem
    // confirmação de 2 passos embutida (ui_ux_guia_unificado.md §9).
    const performDelete = async (id: string) => {
        try {
            await investorService.deleteInvestor(id);
            setInvestors(prev => prev.filter(i => i.id !== id));
            if (onInvestorsChange) onInvestorsChange();
            notify('Investidor excluído com sucesso.', 'success');
        } catch (error) {
            console.error("Erro ao excluir investidor:", error);
            notify('Erro ao excluir o investidor.', 'error');
        }
    };

    // Excluir fora do kebab (grid view): pede confirmação via useConfirm (§14).
    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm({
            title: 'Excluir investidor?',
            message: `Tem certeza que deseja excluir o investidor "${name}"? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await performDelete(id);
    };

    const handleOpenModal = (investor?: Investor) => {
        setSelectedInvestor(investor);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: Partial<Investor>) => {
        try {
            const saved = await investorService.saveInvestor(data);
            setIsModalOpen(false);
            loadInvestors();
            if (onInvestorsChange) onInvestorsChange();
            notify('Investidor salvo com sucesso!', 'success');
            return saved;
        } catch (error: any) {
            console.error("Erro ao salvar investidor:", error);
            notify(`Erro ao salvar o investidor: ${error.message || 'Erro desconhecido'}`, 'error');
            throw error;
        }
    };

    // ── Token helpers ─────────────────────────────────────────────────────────
    const openTokenModal = async (investor: Investor) => {
        setTokenModal({ investor, token: null });
        setTokenLoading(true);
        try {
            const tok = await investorPortalTokenService.getTokenForInvestor(investor.id);
            setTokenModal({ investor, token: tok });
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleGenerateToken = async () => {
        if (!tokenModal || !orgId) return;
        setTokenLoading(true);
        try {
            await investorPortalTokenService.generateToken(tokenModal.investor.id, orgId);
            const tok = await investorPortalTokenService.getTokenForInvestor(tokenModal.investor.id);
            setTokenModal(prev => prev ? { ...prev, token: tok } : null);
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!tokenModal?.token) return;
        await navigator.clipboard.writeText(investorPortalTokenService.buildPortalUrl(tokenModal.token.token));
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    const handleRevokeToken = async () => {
        if (!tokenModal) return;
        const ok = await confirm({
            title: 'Revogar acesso ao portal?',
            message: 'O investidor perderá o acesso ao portal através deste link.',
            variant: 'warning',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
        setTokenLoading(true);
        try {
            await investorPortalTokenService.revokeToken(tokenModal.investor.id);
            setTokenModal(prev => prev ? { ...prev, token: null } : null);
            notify('Acesso revogado.', 'success');
        } catch (e) {
            console.error(e);
            notify('Erro ao revogar.', 'error');
        } finally {
            setTokenLoading(false);
        }
    };

    const tableColumns = useTableColumns(INVESTOR_COLUMNS, 'investorListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'investorListFilters:advanced');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'investorListColWidths');
    // Largura total = soma exata das colunas visíveis. NUNCA w-full/100% junto com
    // table-layout:fixed: o navegador redistribuiria a sobra entre as colunas e
    // arrastar uma borda moveria a vizinha errada (§6.1).
    const tableTotalWidth = (['code', 'name', 'contact', 'document', 'project'] as const)
        .reduce((sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0), 0)
        + cols.getWidth('actions');

    // Nomes das obras vinculadas, resolvidos aqui pra virar campo filtrável (mesmo
    // critério já usado no render da coluna "Obra Vinculada" abaixo).
    const investorsWithProjects: InvestorRow[] = React.useMemo(() => {
        return investors.map(i => ({
            ...i,
            _projectNames: projects
                .filter(p => (p.investor_id ?? p.settings?.investorId) === i.id && isObra(p))
                .map(p => p.name)
                .join(', '),
        }));
    }, [investors, projects]);

    const filteredInvestors = React.useMemo(() => {
        let result = investorsWithProjects
            .filter(i =>
                i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.document?.includes(searchTerm)
            );

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                if (tableColumns.sortColumn) {
                    const col = tableColumns.sortColumn;
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    if (col === 'code') return (a.code || '').localeCompare(b.code || '', 'pt-BR', { numeric: true }) * dir;
                    if (col === 'name') return a.name.localeCompare(b.name) * dir;
                    if (col === 'document') return (a.document || '').localeCompare(b.document || '') * dir;
                }
                // Sem coluna clicada, ordenação default é nome A-Z (ui_ux_guia_unificado.md §6.4:
                // toda coluna ordenável já ordena pelo próprio cabeçalho, sem dropdown redundante).
                return a.name.localeCompare(b.name);
            });
    }, [investorsWithProjects, searchTerm, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    const kpis = React.useMemo(() => {
        const comObra = investorsWithProjects.filter(i => !!i._projectNames).length;
        return {
            total: investors.length,
            comObra,
            semObra: investors.length - comObra,
        };
    }, [investors, investorsWithProjects]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Nossos Investidores</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua base de investidores e sócios com transparência e alta performance.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* "Total" em destaque (2 colunas); os demais são a decomposição (§4.2) */}
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Investidores" value={kpis.total} icon={<Users className="w-4 h-4" />} color="purple" />
                <KpiCard shadow={false} size="sm" label="Com Obra Vinculada" value={kpis.comObra} icon={<Building2 className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Sem Obra Vinculada" value={kpis.semObra} icon={<TrendingUp className="w-4 h-4" />} color="gray" />
            </div>

            {/* Toolbar §5.2 (variante acoplada à tabela, escala compacta §16) — toolbar e
                conteúdo dividem um único card; a única linha visível entre os dois é o
                border-b abaixo, sem duas bordas concêntricas. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-white">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou documento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (ui_ux_guia_unificado.md §6.4) */}
                <div className="flex items-center h-9">
                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

                <button
                    onClick={loadData}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    {viewMode === 'list' && (
                        <>
                            <ColumnConfigButton
                                columns={INVESTOR_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* Autofit sob comando explícito — nunca automático (ver doc de autoFit
                                em TableUtils). Duplo clique no divisor segue "restaurar padrão". */}
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
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Variante compacta do CTA primário (§17), na régua junto do toggle. */}
                <button
                    onClick={() => { setSelectedInvestor(undefined); handleOpenModal(); }}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo investidor
                </button>
            </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : filteredInvestors.length === 0 ? (
                <div className="text-center py-12">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum investidor encontrado</h3>
                    <p className="text-sm text-gray-500">
                        {searchTerm ? 'Tente ajustar seus filtros de busca.' : 'Cadastre seu primeiro investidor no botão acima.'}
                    </p>
                </div>
            ) : (
                viewMode === 'list' ? (
                        <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações": absorve a folga no meio, para a borda de
                                    "Ações" não "andar" a cada redimensionamento e desalinhar da toolbar
                                    acoplada acima (mesma correção feita em ClientList). */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead em sentence case (§6.2) — obrigatório porque a tela adotou a escala
                                de radius compacta (§16), mesmo critério já usado em SupplierList/ClientList.
                                Ordem vem de orderedVisibleColumns — arrastar um header (onMoveColumn)
                                reordena e persiste, estilo ClickUp. */}
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = INVESTOR_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredInvestors.map(investor => {
                                    const investorProjects = projects.filter(p =>
                                        (p.investor_id ?? p.settings?.investorId) === investor.id &&
                                        isObra(p)
                                    );
                                    return (
                                    <tr key={investor.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.orderedVisibleColumns.map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderInvestorCell(key, investor, investorProjects)}
                                            </td>
                                        ))}
                                        {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleOpenModal(investor)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                                >
                                                    Editar
                                                </button>
                                                {onSelectInvestor && (
                                                    <button
                                                        onClick={() => onSelectInvestor(investor)}
                                                        className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                                                        title="Acessar Portal"
                                                    >
                                                        <LayoutDashboard className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openTokenModal(investor)}
                                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Link de Acesso"
                                                >
                                                    <Link2 className="w-4 h-4" />
                                                </button>
                                                <InlineDisclosureMenu
                                                    showDelete
                                                    onDelete={() => performDelete(investor.id)}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
                        {filteredInvestors.map(investor => (
                            <div
                                key={investor.id}
                                className="bg-white rounded-[10px] border border-gray-100 hover:border-purple-300 hover:shadow-md transition-all group flex flex-col overflow-hidden"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-center mb-4">
                                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4">
                                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                                                {investor.name}
                                            </h3>
                                            <span className="text-sm font-normal text-gray-500">Investidor</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-gray-50">
                                        <div className="flex items-center text-sm text-gray-600">
                                            <Mail className="w-4 h-4 mr-2 text-purple-500" />
                                            <span className="truncate">{investor.email}</span>
                                        </div>
                                        {investor.phone && (
                                            <div className="flex items-center text-sm text-gray-600">
                                                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                                <span>{investor.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs pt-2">
                                            <span className="text-gray-400 uppercase tracking-wider font-semibold">Documento</span>
                                            <span className="text-gray-700 font-medium bg-gray-100 px-2 py-0.5 rounded">{investor.document || '-'}</span>
                                        </div>

                                        {/* Linked Projects for Grid View */}
                                        {(() => {
                                            const investorProjects = projects.filter(p =>
                                                (p.investor_id ?? p.settings?.investorId) === investor.id &&
                                                isObra(p)
                                            );

                                            if (investorProjects.length > 0) {
                                                return (
                                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                                        <span className="text-form-label text-gray-400 uppercase tracking-widest font-bold block mb-2">Obra Vinculada</span>
                                                        <div className="space-y-1">
                                                            {investorProjects.slice(0, 2).map(p => (
                                                                <div key={p.id} className="flex items-center gap-1.5 text-xs text-gray-700 bg-purple-50/50 p-1.5 rounded-md border border-purple-100/50">
                                                                    <Building2 className="w-3 h-3 text-purple-500" />
                                                                    <span className="font-medium truncate">{p.name}</span>
                                                                </div>
                                                            ))}
                                                            {investorProjects.length > 2 && (
                                                                <span className="text-xs text-gray-400 pl-1">
                                                                    + {investorProjects.length - 2} outras obras
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50 rounded-b-[10px] border-t border-gray-100 flex justify-end gap-1.5">
                                    {onSelectInvestor && (
                                        <button
                                            onClick={() => onSelectInvestor(investor)}
                                            className="p-2 text-purple-500 hover:text-white hover:bg-purple-500 rounded-lg transition-all shadow-sm"
                                            title="Acessar Portal"
                                        >
                                            <LayoutDashboard className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openTokenModal(investor)}
                                        className="p-2 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-all shadow-sm"
                                        title="Link de Acesso ao Portal"
                                    >
                                        <Link2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleOpenModal(investor)}
                                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-white rounded-lg transition-all shadow-sm"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(investor.id, investor.name)}
                                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg transition-all shadow-sm"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
            </div>

            <InvestorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={selectedInvestor}
                organizationId={orgId}
            />

            {/* Token Modal */}
            {tokenModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setTokenModal(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Link de Acesso</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{tokenModal.investor.name}</p>
                            </div>
                            <button onClick={() => setTokenModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {tokenLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            </div>
                        ) : tokenModal.token?.is_active ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Link ativo</p>
                                    <p className="text-xs text-gray-700 font-mono break-all leading-relaxed">
                                        {investorPortalTokenService.buildPortalUrl(tokenModal.token.token)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Expira em: {new Date(tokenModal.token.expires_at).toLocaleDateString('pt-BR')}
                                        {tokenModal.token.last_used_at && ` · Último acesso: ${new Date(tokenModal.token.last_used_at).toLocaleDateString('pt-BR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                    >
                                        {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <button
                                        onClick={handleGenerateToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 text-gray-500 rounded-2xl text-button font-black uppercase tracking-widest hover:border-gray-300 hover:text-gray-700 transition-all"
                                        title="Regenerar link"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleRevokeToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-red-100 text-red-400 rounded-2xl text-button font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 transition-all"
                                        title="Revogar acesso"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                    <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                                    <p className="text-xs text-gray-400 mt-1">Gere um link para que o investidor acesse o portal sem precisar de cadastro.</p>
                                </div>
                                <button
                                    onClick={handleGenerateToken}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Gerar Link de Acesso
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default InvestorList;
