import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Search, AlertCircle, Download, FileDown, Upload, Hash, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, MoveHorizontal } from 'lucide-react';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { useConfirm } from './ui/confirm';
import { KpiCard } from './ui/KpiCard';

interface RegistryItem {
    id: string;
    name: string;
    code?: string;
    description?: string;
    bank?: string;
    branch?: string;
    account_number?: string;
    organization_id?: string;
    accounting_nature?: 'CREDORA' | 'DEVEDORA';
    // Conta de pagamento: "atende também" (ver docs/planos/2026-09-15-conta-atende-outras-organizacoes.md)
    serves_all_organizations?: boolean;
    served_organization_ids?: string[];
}

const NATURE_LABELS: Record<'CREDORA' | 'DEVEDORA', string> = {
    CREDORA: 'Credora',
    DEVEDORA: 'Devedora',
};

const NATURE_COLORS: Record<'CREDORA' | 'DEVEDORA', string> = {
    CREDORA: 'text-emerald-700',
    DEVEDORA: 'text-amber-800',
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. As 4 chaves possíveis; a tela só usa as que
// `registryColumns` incluiu (via showCode/showDescription/showBankDetails/showNature).
const REGISTRY_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    organization: { label: 'Organização', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    name: { label: 'Nome', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    details: { label: 'Detalhes', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    accounting_nature: { label: 'Natureza', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

interface RegistryLevelStyle {
    indent: number;
    nameCls: string;
    codeCls: string;
    rowCls: string;
}

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna. `lvl`/`hasChildren`/`expanded`
// vêm calculados por linha em `visibleRows` (ver componente); `toggleExpand` é
// o callback de expandir/recolher já existente.
function renderRegistryCell(
    key: string,
    item: RegistryItem,
    opts: { lvl: RegistryLevelStyle; hasChildren: boolean; expanded: boolean; toggleExpand: (id: string) => void; showCode: boolean; showBankDetails: boolean; organizationName?: string },
): React.ReactNode {
    const { lvl, hasChildren, expanded, toggleExpand, showCode, showBankDetails, organizationName } = opts;
    switch (key) {
        case 'organization':
            return <span className="block truncate text-sm font-normal text-gray-700" title={organizationName}>{organizationName || '—'}</span>;
        case 'code':
            return (
                <span className={`text-sm font-normal whitespace-nowrap ${lvl.codeCls}`}>
                    {item.code || '-'}
                </span>
            );
        case 'name':
            return (
                <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: showCode ? lvl.indent : 0 }}>
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0 rounded transition-colors"
                        >
                            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    ) : (
                        <span className="w-5 h-5 shrink-0" />
                    )}
                    <span className={`truncate ${lvl.nameCls}`}>{item.name}</span>
                </div>
            );
        case 'details':
            return (
                <div className="flex items-center gap-3 text-sm">
                    {item.description && <p className="text-sm font-normal text-gray-600 line-clamp-1 flex-1">{item.description}</p>}
                    {showBankDetails && (item.bank || item.branch || item.account_number) && (
                        <div className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-gray-500">
                            {item.bank && <span>Banco: {item.bank}</span>}
                            {item.branch && <span>Ag: {item.branch}</span>}
                            {item.account_number && <span>Cc: {item.account_number}</span>}
                        </div>
                    )}
                </div>
            );
        case 'accounting_nature':
            return (
                <span className={`text-sm font-normal ${item.accounting_nature ? NATURE_COLORS[item.accounting_nature] : 'text-gray-500'}`}>
                    {item.accounting_nature ? NATURE_LABELS[item.accounting_nature] : '-'}
                </span>
            );
        default:
            return null;
    }
}

interface OrgOption {
    id: string;
    name: string;
}

interface FinancialRegistryManagerProps {
    title: string;
    description: string;
    icon: React.ElementType;
    items: RegistryItem[];
    onSave: (item: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onExport?: () => void;
    onDownloadTemplate?: () => void;
    onImport?: () => void;
    showCode?: boolean;
    showDescription?: boolean;
    showBankDetails?: boolean;
    // Natureza contábil (Credora/Devedora) — só faz sentido no Plano de Contas.
    showNature?: boolean;
    /** Oferece o seletor de organização no formulário. Passe SÓ quando o topo
     *  está em "Todas as organizações" — com organização no topo, o sistema
     *  não pergunta (CLAUDE.md REGRA #5). */
    organizations?: OrgOption[];
    defaultOrganizationId?: string;
    /** Títulos do drawer de criar/editar — a tela diz o nome da entidade no gênero certo
     *  ("Nova conta" / "Editar conta"). Sem isso, "Novo registro" / "Editar registro". */
    sheetLabels?: { create: string; edit: string };
    /** Conta de pagamento: organizações que ela pode ATENDER além da dona (todas as do
     *  usuário). Com isso o drawer mostra o bloco "Atende também". */
    servedOrgOptions?: OrgOption[];
    /** Coluna Organização. Em "Todas as organizações" a lista junta registros
     *  de várias orgs, com códigos repetidos entre elas (toda org tem 1.1.1) —
     *  a coluna é o que os distingue, e a árvore passa a ser por org + código. */
    showOrganization?: boolean;
    organizationNameById?: Map<string, string>;
}

const FinancialRegistryManager: React.FC<FinancialRegistryManagerProps> = ({
    title,
    description,
    icon: Icon,
    items,
    onSave,
    onDelete,
    onExport,
    onDownloadTemplate,
    onImport,
    showCode = false,
    showDescription = false,
    showBankDetails = false,
    showNature = false,
    organizations,
    defaultOrganizationId,
    showOrganization = false,
    organizationNameById,
    sheetLabels = { create: 'Novo registro', edit: 'Editar registro' },
    servedOrgOptions,
}) => {
    const orgNameOf = (item: RegistryItem) => (item.organization_id ? organizationNameById?.get(item.organization_id) : undefined);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    // F2: filtro sobrevive a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('financialRegistryFilters:search', '');
    const [loading, setLoading] = useState(false);
    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Form state
    const [formData, setFormData] = useState<Partial<RegistryItem>>({});
    // "Atende também" — o modo é estado próprio: derivar da lista faria "Organizações
    // específicas" voltar para "Só esta" enquanto nenhuma caixa está marcada.
    const [atendeModo, setAtendeModo] = useState<'own' | 'some' | 'all'>('own');

    // Build column config dynamically based on props
    const registryColumns = useMemo<ColumnConfig[]>(() => {
        const cols: ColumnConfig[] = [];
        if (showOrganization) cols.push({ key: 'organization', label: 'Organização', sortable: true });
        if (showCode) cols.push({ key: 'code', label: 'Código', sortable: true });
        cols.push({ key: 'name', label: 'Nome', sortable: true });
        // Detalhes = descrição + dados bancários combinados — sem valor único óbvio pra ordenar (§6.3).
        if (showDescription || showBankDetails) cols.push({ key: 'details', label: 'Detalhes', sortable: false });
        if (showNature) cols.push({ key: 'accounting_nature', label: 'Natureza', sortable: true });
        return cols;
    }, [showOrganization, showCode, showDescription, showBankDetails, showNature]);

    // `title` na chave: Contas de Pagamento e Plano de Contas têm conjuntos de
    // colunas diferentes, e com a chave compartilhada uma tela herdava a
    // visibilidade salva pela outra (Natureza aparecia em Contas, Detalhes em
    // Plano de Contas). Mesmo motivo da chave de larguras logo abaixo.
    const tableColumns = useTableColumns(registryColumns, `financialRegistryColumns:${title}`);
    // Chaves salvas que esta tela não tem (ex.: Organização, que só existe em
    // "Todas as organizações") ficam fora do render.
    const registryColumnKeys = useMemo(() => new Set(registryColumns.map(c => c.key)), [registryColumns]);
    const orderedVisibleForScreen = tableColumns.orderedVisibleColumns.filter(k => registryColumnKeys.has(k));
    // §6.1 — larguras padrão por chave de coluna; `title` na storageKey evita colisão
    // entre as duas telas que reaproveitam este componente (Contas de Pagamento × Plano de Contas).
    const registryColWidths = useMemo<Record<string, number>>(() => ({
        organization: 220, code: 140, name: 420, details: 480, accounting_nature: 160, actions: 120,
    }), []);
    // max maior que o padrão (500): esta tela só tem 3-4 colunas e "Nome" é a única
    // que pode absorver a folga do container — com o teto padrão, o autofit/arraste
    // batia em 500px e sobrava espaço em branco sem para onde ir.
    const cols = useResizableColumns(registryColWidths, `financialRegistry:${title}:colWidths`, { max: 900 });

    // F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Campos variam
    // com as mesmas props que já controlam as colunas (showCode/showDescription/
    // showBankDetails), pra não oferecer filtro de um campo que a tela não usa.
    const advancedFilterFields = useMemo<FilterFieldConfig[]>(() => {
        const fields: FilterFieldConfig[] = [{ key: 'name', label: 'Nome', type: 'text' }];
        if (showCode) fields.push({ key: 'code', label: 'Código', type: 'text' });
        if (showDescription) fields.push({ key: 'description', label: 'Descrição', type: 'text' });
        if (showBankDetails) {
            fields.push({ key: 'bank', label: 'Banco', type: 'text' });
            fields.push({ key: 'account_number', label: 'Conta', type: 'text' });
        }
        if (showNature) {
            fields.push({
                key: 'accounting_nature', label: 'Natureza', type: 'select',
                options: [{ value: 'CREDORA', label: 'Credora' }, { value: 'DEVEDORA', label: 'Devedora' }],
            });
        }
        return fields;
    }, [showCode, showDescription, showBankDetails, showNature]);

    const getAdvancedFilterValue = (item: RegistryItem, key: string): unknown => (item as any)[key] ?? null;

    const advancedFilters = useAdvancedFilters(advancedFilterFields, 'financialRegistryFilters:advanced');

    const handleEdit = (item: RegistryItem) => {
        setFormData(item);
        setAtendeModo(item.serves_all_organizations ? 'all' : (item.served_organization_ids?.length ? 'some' : 'own'));
        setIsEditing(item.id);
        setIsAdding(false);
    };

    const handleAdd = () => {
        setAtendeModo('own');
        setFormData({ name: '', code: '', description: '', organization_id: defaultOrganizationId, accounting_nature: undefined });
        setIsAdding(true);
        setIsEditing(null);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setIsEditing(null);
        setFormData({});
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;

        setLoading(true);
        try {
            await onSave(formData);
            handleCancel();
            notify('Registro salvo com sucesso.', 'success');
        } catch (error) {
            console.error('Error saving item:', error);
            notify('Erro ao salvar o registro.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir registro?',
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await onDelete(id);
            notify('Registro excluído com sucesso.', 'success');
        } catch (error) {
            console.error('Error deleting item:', error);
            notify('Erro ao excluir o registro.', 'error');
        }
    };

    const filteredItems = useMemo(() => applyFilterRules(
        items.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.code?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (showOrganization && (orgNameOf(item) || '').toLowerCase().includes(searchTerm.toLowerCase()))
        ),
        advancedFilters.rules, advancedFilterFields, getAdvancedFilterValue,
    )
        .sort((a, b) => {
            // TableUtils sort takes priority over default sort
            if (tableColumns.sortColumn) {
                const col = tableColumns.sortColumn;
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                if (col === 'organization') return (orgNameOf(a) || '').localeCompare(orgNameOf(b) || '', 'pt-BR') * dir;
                if (col === 'name') return a.name.localeCompare(b.name, 'pt-BR') * dir;
                if (col === 'code') {
                    if (!a.code && !b.code) return 0;
                    if (!a.code) return 1 * dir;
                    if (!b.code) return -1 * dir;
                    return a.code.localeCompare(b.code, 'pt-BR', { numeric: true }) * dir;
                }
                if (col === 'accounting_nature') {
                    const an = a.accounting_nature ? NATURE_LABELS[a.accounting_nature] : '';
                    const bn = b.accounting_nature ? NATURE_LABELS[b.accounting_nature] : '';
                    if (!an && !bn) return 0;
                    if (!an) return 1 * dir;
                    if (!bn) return -1 * dir;
                    return an.localeCompare(bn, 'pt-BR') * dir;
                }
            }
            // Sem coluna clicada: em "Todas as organizações" agrupa por org
            // primeiro, para as árvores não se intercalarem (1 da Alpa, 1 da SPE…).
            const orgCmp = (orgNameOf(a) || '').localeCompare(orgNameOf(b) || '', 'pt-BR');
            if (orgCmp !== 0) return orgCmp;
            if (!a.code && !b.code) return a.name.localeCompare(b.name, 'pt-BR');
            if (!a.code) return 1;
            if (!b.code) return -1;
            return a.code.localeCompare(b.code, 'pt-BR', { numeric: true });
        }), [items, searchTerm, advancedFilters.rules, advancedFilterFields, tableColumns.sortColumn, tableColumns.sortDirection, showOrganization, organizationNameById]);

    const isFiltering = searchTerm.trim() !== '' || advancedFilters.rules.length > 0;

    // Hierarquia (accordion): pai é o código com o último segmento removido
    // ("1.1.2" -> pai "1.1"). Agrupa por ORGANIZAÇÃO + CÓDIGO (não por id):
    // toda organização tem o mesmo plano padrão (1.1.1 PIS, 1.1.2 COFINS…),
    // e em "Todas as organizações" chavear só pelo código pendurava os filhos
    // de uma org sob o pai de outra — foi por isso que esta tela recusava
    // listar "Todas" até 11/09/2026. Registros duplicados DENTRO da mesma org
    // (mesmo código repetido) continuam mostrando os filhos sob cada
    // duplicata — sintoma visível do problema de dados, não bug da árvore.
    const treeKey = (item: RegistryItem, code: string) => `${item.organization_id ?? ''}|${code}`;
    const childrenByParentCode = useMemo(() => {
        const map = new Map<string, RegistryItem[]>();
        for (const item of filteredItems) {
            if (!item.code) continue;
            const segments = item.code.split('.');
            if (segments.length <= 1) continue;
            const parentKey = treeKey(item, segments.slice(0, -1).join('.'));
            const arr = map.get(parentKey);
            if (arr) arr.push(item); else map.set(parentKey, [item]);
        }
        return map;
    }, [filteredItems]);

    const knownCodes = useMemo(() => new Set(filteredItems.filter(i => i.code).map(i => treeKey(i, i.code!))), [filteredItems]);

    const isRoot = (item: RegistryItem) => {
        if (!item.code) return true;
        const segments = item.code.split('.');
        if (segments.length <= 1) return true;
        return !knownCodes.has(treeKey(item, segments.slice(0, -1).join('.')));
    };

    const rootItems = useMemo(() => filteredItems.filter(isRoot), [filteredItems, knownCodes]);

    const parentIds = useMemo(
        () => filteredItems.filter(i => i.code && (childrenByParentCode.get(treeKey(i, i.code))?.length ?? 0) > 0).map(i => i.id),
        [filteredItems, childrenByParentCode]
    );

    const [expandedIds, setExpandedIds] = usePersistedState<Record<string, boolean>>(`financialRegistryTree:${title}`, {});
    const toggleExpand = (id: string) => setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
    const allExpanded = parentIds.length > 0 && parentIds.every(id => expandedIds[id]);
    const toggleExpandAll = () => setExpandedIds(allExpanded ? {} : Object.fromEntries(parentIds.map(id => [id, true])));

    interface VisibleRow { item: RegistryItem; hasChildren: boolean; }

    const visibleRows = useMemo<VisibleRow[]>(() => {
        if (isFiltering) return filteredItems.map(item => ({ item, hasChildren: false }));
        const rows: VisibleRow[] = [];
        const walk = (item: RegistryItem) => {
            const children = item.code ? childrenByParentCode.get(treeKey(item, item.code)) || [] : [];
            rows.push({ item, hasChildren: children.length > 0 });
            if (children.length > 0 && expandedIds[item.id]) children.forEach(walk);
        };
        rootItems.forEach(walk);
        return rows;
    }, [isFiltering, filteredItems, rootItems, childrenByParentCode, expandedIds]);

    // Auto-ajuste único na 1ª visita (sem largura salva ainda): preenche o
    // container de cara, em vez de deixar a tabela presa à soma dos defaults
    // até o usuário clicar no botão manual (§6.1.2). Depois disso o controle
    // volta a ser 100% manual — não recalcula mais a cada mudança de dado.
    const didAutoFitOnMount = useRef(false);
    useEffect(() => {
        if (didAutoFitOnMount.current || visibleRows.length === 0) return;
        didAutoFitOnMount.current = true;
        const storageKey = `financialRegistry:${title}:colWidths`;
        let hasSavedWidths = false;
        try { hasSavedWidths = !!localStorage.getItem(storageKey); } catch { /* ignore */ }
        if (!hasSavedWidths) cols.autoFit({ fill: true });
    }, [visibleRows.length, title, cols]);

    const getLevel = (code?: string) => code ? code.split('.').length : 0;

    // Hierarquia visual via cor (indentação marca o nível), nunca font-bold/font-black/text-xs
    // fora do padrão de TD (ui_ux_guia_unificado.md §7) — o nível mais alto (1) ganha uma linha
    // de fundo sutil pra se destacar sem precisar de peso.
    const LEVEL_STYLES = [
        // level 0 (sem código)
        { indent: 0,  nameCls: 'text-sm font-normal text-gray-900', codeCls: 'text-gray-500',   rowCls: '' },
        // level 1  (ex: 1)
        { indent: 0,  nameCls: 'text-sm font-normal text-gray-900', codeCls: 'text-gray-700',   rowCls: 'bg-gray-50/60' },
        // level 2  (ex: 1.1)
        { indent: 16, nameCls: 'text-sm font-normal text-gray-800', codeCls: 'text-blue-700',   rowCls: '' },
        // level 3  (ex: 1.1.1)
        { indent: 32, nameCls: 'text-sm font-normal text-gray-600', codeCls: 'text-gray-600',   rowCls: '' },
        // level 4  (ex: 1.1.1.1)
        { indent: 48, nameCls: 'text-sm font-normal text-gray-500', codeCls: 'text-gray-500',   rowCls: '' },
    ];

    const getLevelStyle = (code?: string) => {
        const level = getLevel(code);
        return LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];
    };

    const totalItems = items.length;

    return (
        <div className="space-y-6">
            {/* Header — mesma escala das demais abas de Minha Organização (h1 3xl, subtítulo mt-1.5) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                    <Icon className="w-6 h-6 text-blue-600" />
                    {title}
                </h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{description}</p>
            </div>

            <div className="grid grid-cols-1 mb-3">
                <KpiCard shadow={false} size="sm" label="Total de Registros" value={totalItems} icon={<Hash className="w-4 h-4" />} color="blue" />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {/* Toolbar §5.2 (variante acoplada à tabela, escala compacta §16) — toolbar e
                    conteúdo dividem um único card; a única linha visível entre os dois é o
                    border-b abaixo, sem duas bordas concêntricas. */}
                <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                    {/* Sem seletor de organização aqui: a organização vem do seletor global do topo. */}
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Pesquisar nos registros..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center h-9">
                        <AdvancedFilterPanel fields={advancedFilterFields} state={advancedFilters} />
                    </div>

                    {(onDownloadTemplate || onImport || onExport) && (
                        <>
                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                            <div className="flex items-center gap-1.5">
                                {onDownloadTemplate && (
                                    <button onClick={onDownloadTemplate} title="Baixar modelo para importação"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <FileDown className="w-4 h-4" />
                                    </button>
                                )}
                                {onImport && (
                                    <button onClick={onImport} title="Importar"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <Upload className="w-4 h-4" />
                                    </button>
                                )}
                                {onExport && items.length > 0 && (
                                    <button onClick={onExport} title="Exportar"
                                        className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95">
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {parentIds.length > 0 && !isFiltering && (
                        <button
                            onClick={toggleExpandAll}
                            title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
                            className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95 shrink-0"
                        >
                            {allExpanded ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                        </button>
                    )}

                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={registryColumns}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo cadastro
                    </button>
                </div>

                {/* List Content */}
                <div>

                {/* thead em sentence case (§6.2) — obrigatório porque a tela adotou a
                    escala de radius compacta (§16), mesmo critério do resto do módulo. */}
                <div className="overflow-x-auto">
                    {(() => {
                        const orderedVisible = orderedVisibleForScreen;
                        const tableWidth = orderedVisible.reduce((s, k) => s + cols.getWidth(k), 0) + cols.getWidth('actions');
                        return (
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                        <colgroup>
                            {orderedVisible.map(key => (
                                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                            ))}
                            <col />
                            <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                        </colgroup>
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {orderedVisible.map(key => {
                                    const def = REGISTRY_COLUMN_HEADERS[key];
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
                                <th aria-hidden="true" className="border-r border-gray-100" />
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={orderedVisible.length + 2} className="px-6 py-12 text-center">
                                        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro encontrado</h3>
                                        <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre o primeiro registro.</p>
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map(({ item, hasChildren }) => {
                                    const lvl = showCode ? getLevelStyle(item.code) : getLevelStyle(undefined);
                                    const expanded = !!expandedIds[item.id];
                                    return (
                                    <tr key={item.id} onClick={() => handleEdit(item)} className={`group hover:bg-blue-50/50 transition-colors cursor-pointer ${lvl.rowCls}`}>
                                        {orderedVisible.map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderRegistryCell(key, item, { lvl, hasChildren, expanded, toggleExpand, showCode, showBankDetails, organizationName: orgNameOf(item) })}
                                            </td>
                                        ))}
                                        <td aria-hidden="true"></td>
                                        <td className="px-6 py-2.5 text-right">
                                            {/* Editar = clique na linha (ação dominante, §9.1); ação sempre visível
                                                (nunca opacity-0 group-hover, proibido pelo §9). Kebab só tem Excluir. */}
                                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    Editar
                                                </button>
                                                <InlineDisclosureMenu showDelete onDelete={() => handleDelete(item.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                        );
                    })()}
                </div>
            </div>
            </div>

            {/* Sheet — criar/editar. Mesmo desenho do drawer de Centro de Custo
                (CostCenterModule.tsx): size md, rótulos §21, controles h-9 §16, rodapé
                Cancelar/Salvar. Substituiu o card inline de escala antiga (2026-09-14,
                pedido: "ao clicar em plano de contas abrir drawer com mesmo UI/UX do
                drawer centro de custo"). */}
            <Sheet open={isAdding || !!isEditing} onClose={handleCancel} size="md">
                <SheetHeader onClose={handleCancel}>
                    <SheetTitle>{isEditing ? sheetLabels.edit : sheetLabels.create}</SheetTitle>
                    <SheetDescription>
                        {isEditing && showCode && formData.code ? `Código ${formData.code}` : description}
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <SheetPanel className="p-6 space-y-5">
                        {showCode && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Código contábil</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.code || ''}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    placeholder="Ex: 3.01.02"
                                    className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Nome</label>
                            <input
                                type="text"
                                required
                                autoFocus={!showCode}
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder={showBankDetails ? 'Ex: Banco Itaú' : 'Ex: Despesas administrativas'}
                                className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {showNature && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Natureza</label>
                                <select
                                    value={formData.accounting_nature || ''}
                                    onChange={(e) => setFormData({ ...formData, accounting_nature: (e.target.value || undefined) as 'CREDORA' | 'DEVEDORA' | undefined })}
                                    className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                >
                                    <option value="">Selecione…</option>
                                    <option value="CREDORA">Credora</option>
                                    <option value="DEVEDORA">Devedora</option>
                                </select>
                            </div>
                        )}

                        {showDescription && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Descrição</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Opcional..."
                                    rows={3}
                                    className="mt-1.5 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                                />
                            </div>
                        )}

                        {showBankDetails && (
                            <>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Instituição bancária</label>
                                    <input
                                        type="text"
                                        value={formData.bank || ''}
                                        onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                                        placeholder="Ex: Itaú, 341..."
                                        className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                {organizations && organizations.length > 0 && (
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Organização</label>
                                        <select
                                            value={formData.organization_id || ''}
                                            onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                                            className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        >
                                            <option value="">Selecione uma organização…</option>
                                            {organizations.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Agência</label>
                                        <input
                                            type="text"
                                            value={formData.branch || ''}
                                            onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                                            placeholder="0001"
                                            className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Número da conta</label>
                                        <input
                                            type="text"
                                            value={formData.account_number || ''}
                                            onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                            placeholder="12345-6"
                                            className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* "Atende também" — a conta tem UMA org dona; pode atender outras (algumas ou
                                    todas) e aí o extrato dela classifica com centro de custo / plano de contas /
                                    obra / fornecedor dessas orgs. Regra de produto de 2026-09-15. */}
                                {servedOrgOptions && servedOrgOptions.length > 1 && (() => {
                                    const dona = formData.organization_id || '';
                                    const outras = servedOrgOptions.filter(o => o.id !== dona);
                                    const modo = atendeModo;
                                    const setModo = (m: 'own' | 'some' | 'all') => {
                                        setAtendeModo(m);
                                        setFormData({
                                            ...formData,
                                            serves_all_organizations: m === 'all',
                                            served_organization_ids: m === 'some' ? (formData.served_organization_ids ?? []) : [],
                                        });
                                    };
                                    const marcadas = new Set(formData.served_organization_ids ?? []);
                                    const alternar = (id: string) => {
                                        const prox = new Set(marcadas);
                                        if (prox.has(id)) prox.delete(id); else prox.add(id);
                                        setFormData({ ...formData, serves_all_organizations: false, served_organization_ids: [...prox] });
                                    };
                                    const opcoes: { id: 'own' | 'some' | 'all'; label: string }[] = [
                                        { id: 'own',  label: 'Só esta organização' },
                                        { id: 'some', label: 'Organizações específicas' },
                                        { id: 'all',  label: 'Todas as organizações' },
                                    ];
                                    return (
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500">Atende também</label>
                                            <p className="text-xs text-gray-400 mt-0.5">O extrato desta conta poderá ser classificado com centro de custo, plano de contas, obra e fornecedor das organizações atendidas.</p>
                                            <div className="mt-1.5 flex flex-col gap-2">
                                                {opcoes.map(o => (
                                                    <button
                                                        key={o.id}
                                                        type="button"
                                                        onClick={() => setModo(o.id)}
                                                        className={`h-9 px-3 rounded-[6px] text-sm font-medium border text-left transition-all ${modo === o.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                                    >
                                                        {o.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {modo === 'some' && (
                                                <div className="mt-2 border border-gray-200 rounded-[6px] divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                                    {outras.map(o => (
                                                        <label key={o.id} className="flex items-center gap-2.5 px-3 h-9 text-sm font-normal text-gray-700 cursor-pointer hover:bg-gray-50">
                                                            <input
                                                                type="checkbox"
                                                                checked={marcadas.has(o.id)}
                                                                onChange={() => alternar(o.id)}
                                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                            <span className="truncate">{o.name}</span>
                                                        </label>
                                                    ))}
                                                    {outras.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Nenhuma outra organização disponível.</p>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </SheetPanel>
                    <SheetFooter>
                        <button type="button" onClick={handleCancel} className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !(formData.name || '').trim()}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </SheetFooter>
                </form>
            </Sheet>

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

export default FinancialRegistryManager;
