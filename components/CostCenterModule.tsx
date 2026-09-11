import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
    Search, Plus, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown,
    Download, Upload, FileDown, Layers, AlertCircle,
} from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import CostCenterV2ImportModal from './CostCenterV2ImportModal';
import { useOrgWriteTarget, forEachTargetOrg, type WriteTarget } from '../hooks/useOrgContext';
import { useStore } from '../store/useStore';
import { costCenterService } from '../services/costCenterService';
import { exportService } from '../services/exportService';
import { projectService } from '../services/projectService';
import { empreendimentoService } from '../services/empreendimentoService';
import { empreendimentoLinksService } from '../services/empreendimentoLinksService';
import { empreendimentoAuditService } from '../services/empreendimentoAuditService';
import { onlyObras } from '../utils/projectClassification';
import { EmpreendimentoCell, type EmpreendimentoCellValue } from './empreendimento/EmpreendimentoCell';
import { CostCenterV2 } from '../types/financial';

const COLUMNS: ColumnConfig[] = [
    { key: 'code',           label: 'Código',                 sortable: true },
    { key: 'group',          label: 'Centro de custo (grupo)', sortable: true },
    { key: 'name',           label: 'Centro de custo',        sortable: true },
    { key: 'empreendimento', label: 'Empreendimento',         sortable: true },
    { key: 'obra',           label: 'Obra',                   sortable: true },
    { key: 'description',    label: 'Descrição',              sortable: true },
    { key: 'actions',        label: 'Ações',                  sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta). 'actions' é
// estrutural (fixo, fora do drag) e não entra aqui.
const COST_CENTER_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code:           { label: 'Código',                  className: 'px-6 py-2 border-r border-gray-100 w-24' },
    group:          { label: 'Centro de custo (grupo)',  className: 'px-6 py-2 border-r border-gray-100' },
    name:           { label: 'Centro de custo',          className: 'px-6 py-2 border-r border-gray-100' },
    empreendimento: { label: 'Empreendimento',           className: 'px-6 py-2 border-r border-gray-100' },
    obra:           { label: 'Obra',                     className: 'px-6 py-2 border-r border-gray-100' },
    description:    { label: 'Descrição',                className: 'px-6 py-2 border-r border-gray-100' },
};

interface CostCenterModuleProps {
    /** Org sobre a qual criar/editar. REGRA #5: leitura nunca bloqueia por org nula; criar exige.
     *  Vem do seletor global de organização do topo — esta tela não tem seletor próprio. */
    organizationId: string | null;
}

interface FormState {
    /** 'group' = grupo (parent_id null); 'item' = centro de custo dentro de um grupo. */
    recordType: 'group' | 'item';
    parent_id: string;
    /** Obra vinculada — só se aplica a 'item' (grupo é corporativo, sem obra). */
    project_id: string;
    /** Empreendimento ancorado DIRETAMENTE (`cost_centers_v2.empreendimento_id`,
     *  1:1 pelo índice `uidx_cost_center_por_empreendimento`). Só para 'item':
     *  grupo é família de despesa, não recebe lançamento — vincular não segregaria
     *  caixa nenhum. Mesmo vínculo que a aba Vinculações do Empreendimento grava. */
    empreendimento_id: string;
    name: string;
    description: string;
}

const EMPTY_FORM: FormState = { recordType: 'group', parent_id: '', project_id: '', empreendimento_id: '', name: '', description: '' };

/** Opção do select de Empreendimento — vem de TODAS as organizações do usuário. */
interface EmpreendimentoOpcao { id: string; name: string; organizationId: string }
/** Centro de custo que já ocupa um empreendimento (1:1), de qualquer organização. */
interface DonoDoEmpreendimento { id: string; code: string; organizationId: string }

/**
 * O único erro que o usuário provoca de verdade neste formulário é o índice 1:1
 * do empreendimento — e a mensagem crua do Postgres cita o nome do índice sem
 * dizer o que fazer. `linkCostCenter` já traduz; o `create` (insert direto) não.
 */
function mensagemDeErroAoSalvar(error: unknown): string {
    const msg = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? '');
    if (msg.includes('uidx_cost_center_por_empreendimento') || msg.includes('já tem um centro de custo vinculado')) {
        return 'Este empreendimento já tem um centro de custo vinculado. Desvincule o atual antes de apontar outro.';
    }
    return 'Erro ao salvar o registro.';
}

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` em vez de uma sequência fixa.
function renderCostCenterCell(
    key: string,
    ctx: {
        item: CostCenterV2;
        isGroup: boolean;
        hasChildren: boolean;
        expanded: boolean;
        toggleExpand: (id: string) => void;
        groupNameFor: (item: CostCenterV2) => string;
        /** Vínculo direto primeiro; sem ele, o derivado da obra. */
        empreendimentoOf: (item: CostCenterV2) => EmpreendimentoCellValue | undefined;
        obraNameById: Record<string, string>;
    },
): React.ReactNode {
    const { item, isGroup, hasChildren, expanded, toggleExpand, groupNameFor, empreendimentoOf, obraNameById } = ctx;
    switch (key) {
        case 'code':
            return <span className="text-xs font-normal text-gray-500 whitespace-nowrap">{item.code}</span>;
        case 'group':
            return (
                <div className="flex items-center gap-2 min-w-0">
                    {isGroup && hasChildren ? (
                        <button type="button" onClick={() => toggleExpand(item.id)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0 rounded transition-colors">
                            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    ) : (
                        <span className="w-5 h-5 shrink-0" />
                    )}
                    <span className={`truncate text-sm font-normal ${isGroup ? 'text-gray-900' : 'text-gray-500'}`}>
                        {isGroup ? item.name : groupNameFor(item)}
                    </span>
                </div>
            );
        case 'name':
            return isGroup ? (
                <span className="text-sm font-normal text-gray-300">—</span>
            ) : (
                <span className="text-sm font-normal text-gray-900 truncate">{item.name}</span>
            );
        case 'empreendimento':
            return <EmpreendimentoCell value={empreendimentoOf(item)} />;
        case 'obra':
            return (
                <span className="text-sm font-normal text-gray-700 truncate">
                    {item.project_id ? (obraNameById[item.project_id] || '—') : <span className="text-gray-400 italic">—</span>}
                </span>
            );
        case 'description':
            return <span className="text-sm font-normal text-gray-500 truncate line-clamp-1">{item.description || '-'}</span>;
        default:
            return null;
    }
}

const CostCenterModule: React.FC<CostCenterModuleProps> = ({ organizationId }) => {
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    // Nome das organizações do usuário — rótulo dos <optgroup> do select de
    // Empreendimento, que cruza organizações (ver comentário no efeito do sheet).
    const organizations = useStore(s => s.organizations);
    const orgNameById = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);

    const [items, setItems] = useState<CostCenterV2[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = usePersistedState('costCenterModule:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'costCenterModuleColumns');
    const [expandedIds, setExpandedIds] = usePersistedState<Record<string, boolean>>('costCenterModule:expanded', {});
    const [sheetOpen, setSheetOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<CostCenterV2 | null>(null);
    const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
    const [createTarget, setCreateTarget] = useState<WriteTarget | null>(null);
    const [importTarget, setImportTarget] = useState<WriteTarget | null>(null);
    const [saving, setSaving] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [obraNameById, setObraNameById] = useState<Record<string, string>>({});
    const [empreendimentoByProject, setEmpreendimentoByProject] = useState<Record<string, EmpreendimentoCellValue>>({});
    const [empreendimentoById, setEmpreendimentoById] = useState<Record<string, EmpreendimentoCellValue>>({});
    const [sheetObras, setSheetObras] = useState<{ id: string; name: string }[]>([]);
    const [sheetObrasLoading, setSheetObrasLoading] = useState(false);
    const [sheetEmpreendimentos, setSheetEmpreendimentos] = useState<EmpreendimentoOpcao[]>([]);
    const [sheetEmpreendimentosLoading, setSheetEmpreendimentosLoading] = useState(false);
    const [donoPorEmpreendimento, setDonoPorEmpreendimento] = useState<Map<string, DonoDoEmpreendimento>>(new Map());
    const confirm = useConfirm();

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await costCenterService.list(organizationId);
            setItems(data);
        } catch (error) {
            console.error('Erro ao carregar centros de custo:', error);
            notify('Erro ao carregar os centros de custo.', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    React.useEffect(() => { load(); }, [load]);

    // Resolve nome da obra e empreendimento para cada organização presente na
    // listagem atual. O empreendimento chega por dois caminhos: o vínculo DIRETO
    // (`empreendimento_id`, gravado neste formulário e na aba Vinculações) e o
    // derivado da obra (mesmo padrão de SupplyChainOrderList/EmpreendimentoCell).
    useEffect(() => {
        const orgIds = Array.from(new Set(items.filter(i => i.project_id || i.empreendimento_id).map(i => i.organization_id)));
        if (orgIds.length === 0) {
            setObraNameById({});
            setEmpreendimentoByProject({});
            setEmpreendimentoById({});
            return;
        }
        let cancelled = false;
        (async () => {
            const nameMap: Record<string, string> = {};
            const empMap: Record<string, EmpreendimentoCellValue> = {};
            const empByIdMap: Record<string, EmpreendimentoCellValue> = {};
            // O vínculo direto cruza organizações (o empreendimento costuma viver
            // na SPE própria, o centro de custo na org do grupo) — então o nome
            // vem de todas as orgs do usuário, sem filtro; a RLS recorta.
            const [, emps] = await Promise.all([
                Promise.all(orgIds.map(async orgId => {
                    const [projects, emp] = await Promise.all([
                        projectService.listProjects({ organizationId: orgId }),
                        empreendimentoService.mapObrasToEmpreendimentos(orgId),
                    ]);
                    onlyObras(projects).forEach(p => { nameMap[p.id] = p.name; });
                    Object.assign(empMap, emp);
                })),
                empreendimentoService.list().catch(() => []),
            ]);
            emps.forEach(e => { empByIdMap[e.id] = { id: e.id, name: e.name }; });
            if (!cancelled) {
                setObraNameById(nameMap);
                setEmpreendimentoByProject(empMap);
                setEmpreendimentoById(empByIdMap);
            }
        })();
        return () => { cancelled = true; };
    }, [items]);

    /** Vínculo direto tem precedência: é o que o usuário escolheu à mão. Sem ele,
     *  cai no empreendimento a que a obra vinculada pertence. */
    const empreendimentoOf = useCallback((item: CostCenterV2): EmpreendimentoCellValue | undefined => {
        if (item.empreendimento_id) return empreendimentoById[item.empreendimento_id];
        return item.project_id ? empreendimentoByProject[item.project_id] : undefined;
    }, [empreendimentoById, empreendimentoByProject]);

    const itemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const childrenByParent = useMemo(() => {
        const map = new Map<string, CostCenterV2[]>();
        for (const item of items) {
            if (!item.parent_id) continue;
            const arr = map.get(item.parent_id);
            if (arr) arr.push(item); else map.set(item.parent_id, [item]);
        }
        return map;
    }, [items]);

    const groupNameFor = useCallback(
        (item: CostCenterV2) => (item.parent_id ? (itemsById.get(item.parent_id)?.name ?? '') : item.name),
        [itemsById],
    );

    const groups = useMemo(() => items.filter(i => !i.parent_id), [items]);

    const compareItems = useCallback((a: CostCenterV2, b: CostCenterV2) => {
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        switch (tableColumns.sortColumn) {
            case 'code': return a.code.localeCompare(b.code, 'pt-BR', { numeric: true }) * dir;
            case 'group': return groupNameFor(a).localeCompare(groupNameFor(b), 'pt-BR') * dir;
            case 'name': return (a.parent_id ? a.name : '').localeCompare(b.parent_id ? b.name : '', 'pt-BR') * dir;
            case 'obra': return (a.project_id ? obraNameById[a.project_id] || '' : '').localeCompare(b.project_id ? obraNameById[b.project_id] || '' : '', 'pt-BR') * dir;
            case 'empreendimento': return (empreendimentoOf(a)?.name || '').localeCompare(empreendimentoOf(b)?.name || '', 'pt-BR') * dir;
            case 'description': return (a.description || '').localeCompare(b.description || '', 'pt-BR') * dir;
            default: return a.code.localeCompare(b.code, 'pt-BR', { numeric: true });
        }
    }, [tableColumns.sortColumn, tableColumns.sortDirection, groupNameFor, obraNameById, empreendimentoOf]);

    const matchesSearch = useCallback((item: CostCenterV2) => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        const obraName = item.project_id ? (obraNameById[item.project_id] || '') : '';
        const empreendimentoName = empreendimentoOf(item)?.name || '';
        return (
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q) ||
            groupNameFor(item).toLowerCase().includes(q) ||
            obraName.toLowerCase().includes(q) ||
            empreendimentoName.toLowerCase().includes(q)
        );
    }, [searchTerm, groupNameFor, obraNameById, empreendimentoOf]);

    const isFiltering = searchTerm.trim() !== '';

    interface VisibleRow { item: CostCenterV2; hasChildren: boolean; isGroup: boolean; }

    const visibleRows = useMemo<VisibleRow[]>(() => {
        if (isFiltering) {
            return items.filter(matchesSearch).sort(compareItems).map(item => ({
                item, hasChildren: false, isGroup: !item.parent_id,
            }));
        }
        const rows: VisibleRow[] = [];
        [...groups].sort(compareItems).forEach(group => {
            const children = childrenByParent.get(group.id) || [];
            rows.push({ item: group, hasChildren: children.length > 0, isGroup: true });
            if (children.length > 0 && expandedIds[group.id]) {
                [...children].sort(compareItems).forEach(child => rows.push({ item: child, hasChildren: false, isGroup: false }));
            }
        });
        return rows;
    }, [isFiltering, items, matchesSearch, compareItems, groups, childrenByParent, expandedIds]);

    const parentIds = useMemo(() => groups.filter(g => (childrenByParent.get(g.id)?.length ?? 0) > 0).map(g => g.id), [groups, childrenByParent]);
    const allExpanded = parentIds.length > 0 && parentIds.every(id => expandedIds[id]);
    const toggleExpand = (id: string) => setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleExpandAll = () => setExpandedIds(allExpanded ? {} : Object.fromEntries(parentIds.map(id => [id, true])));

    const openCreate = async (recordType: 'group' | 'item') => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setCreateTarget(target);
        setEditingItem(null);
        setFormData({
            recordType,
            parent_id: '',
            project_id: '',
            empreendimento_id: '',
            name: '',
            description: '',
        });
        setSheetOpen(true);
    };

    const openEdit = (item: CostCenterV2) => {
        setEditingItem(item);
        setFormData({
            recordType: item.parent_id ? 'item' : 'group',
            parent_id: item.parent_id || '',
            project_id: item.project_id || '',
            empreendimento_id: item.empreendimento_id || '',
            name: item.name,
            description: item.description || '',
        });
        setSheetOpen(true);
    };

    const closeSheet = () => {
        setSheetOpen(false);
        setEditingItem(null);
        setFormData(EMPTY_FORM);
        setCreateTarget(null);
    };

    const editingHasChildren = editingItem ? (childrenByParent.get(editingItem.id)?.length ?? 0) > 0 : false;

    // Vínculo com Obra é por organização (a obra pertence a uma só) — só faz
    // sentido oferecer o select quando o destino da escrita é uma organização
    // única (edição, ou criação com organização específica escolhida).
    const linkOrgId = editingItem ? editingItem.organization_id : (createTarget?.kind === 'org' ? createTarget.orgId : null);

    useEffect(() => {
        if (!sheetOpen || !linkOrgId) { setSheetObras([]); return; }
        let cancelled = false;
        setSheetObrasLoading(true);
        projectService.listProjects({ organizationId: linkOrgId })
            .then(rows => { if (!cancelled) setSheetObras(onlyObras(rows).map(p => ({ id: p.id, name: p.name }))); })
            .catch(() => { if (!cancelled) setSheetObras([]); })
            .finally(() => { if (!cancelled) setSheetObrasLoading(false); });
        return () => { cancelled = true; };
    }, [sheetOpen, linkOrgId]);

    // Empreendimentos de TODAS as organizações do usuário — ao contrário da Obra,
    // o vínculo cruza organizações: cada empreendimento vira uma SPE/org própria
    // (memória de 2026-07-21) enquanto os centros de custo ficam na org do grupo.
    // Filtrar pela org do centro de custo escondia os das SPEs (reportado em
    // 11/09/2026 com o topo em "Todas as organizações"). Sem `.eq('organization_id')`,
    // a RLS recorta (CLAUDE.md REGRA #5). A ocupação 1:1 também é lida sem org,
    // senão um empreendimento preso a um centro de custo de OUTRA org pareceria
    // livre e só o índice único avisaria, na gravação.
    // O select continua exigindo destino único (`linkOrgId`): em criação
    // replicada em todas as orgs, o mesmo empreendimento não pode apontar para
    // N centros de custo.
    useEffect(() => {
        if (!sheetOpen || !linkOrgId) { setSheetEmpreendimentos([]); setDonoPorEmpreendimento(new Map()); return; }
        let cancelled = false;
        setSheetEmpreendimentosLoading(true);
        Promise.all([
            empreendimentoService.list(),
            costCenterService.list(null).catch(() => [] as CostCenterV2[]),
        ])
            .then(([emps, ccs]) => {
                if (cancelled) return;
                setSheetEmpreendimentos(
                    emps
                        .map(e => ({ id: e.id, name: e.name, organizationId: e.organization_id }))
                        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
                );
                const donos = new Map<string, DonoDoEmpreendimento>();
                for (const cc of ccs) if (cc.empreendimento_id) donos.set(cc.empreendimento_id, { id: cc.id, code: cc.code, organizationId: cc.organization_id });
                setDonoPorEmpreendimento(donos);
            })
            .catch(() => { if (!cancelled) { setSheetEmpreendimentos([]); setDonoPorEmpreendimento(new Map()); } })
            .finally(() => { if (!cancelled) setSheetEmpreendimentosLoading(false); });
        return () => { cancelled = true; };
    }, [sheetOpen, linkOrgId]);

    /** Opções agrupadas por organização — a do destino da escrita primeiro. */
    const sheetEmpreendimentosPorOrg = useMemo(() => {
        const grupos = new Map<string, EmpreendimentoOpcao[]>();
        for (const emp of sheetEmpreendimentos) {
            const arr = grupos.get(emp.organizationId);
            if (arr) arr.push(emp); else grupos.set(emp.organizationId, [emp]);
        }
        return [...grupos.entries()]
            .map(([orgId, emps]) => ({ orgId, orgName: orgNameById.get(orgId) || 'Outra organização', emps }))
            .sort((a, b) => (a.orgId === linkOrgId ? -1 : b.orgId === linkOrgId ? 1 : a.orgName.localeCompare(b.orgName, 'pt-BR')));
    }, [sheetEmpreendimentos, orgNameById, linkOrgId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || (!editingItem && !createTarget)) return;
        if (formData.recordType === 'item' && !editingHasChildren && !formData.parent_id) return;
        setSaving(true);
        try {
            const parentId = formData.recordType === 'group' ? null : (formData.parent_id || null);
            const projectId = formData.recordType === 'group' ? null : (formData.project_id || null);
            const empreendimentoId = formData.recordType === 'group' ? null : (formData.empreendimento_id || null);
            if (editingItem) {
                await costCenterService.update(editingItem.id, {
                    name: formData.name.trim(),
                    description: formData.description.trim() || null,
                    parent_id: editingHasChildren ? editingItem.parent_id : parentId,
                    project_id: projectId,
                });
                // O vínculo com empreendimento passa pelo links service, não pelo
                // update acima: é ele que grava o evento na aba Histórico do
                // Empreendimento (link/unlink) e traduz o erro do índice 1:1.
                // Sem `organizationId` no contexto: o serviço de auditoria resolve
                // a org do PRÓPRIO empreendimento, que pode não ser a do centro de
                // custo — o evento tem de cair no Histórico daquele empreendimento.
                const antes = editingItem.empreendimento_id || null;
                if (antes !== empreendimentoId) {
                    if (antes) await empreendimentoLinksService.unlinkCostCenter(editingItem.id, { empreendimentoId: antes });
                    if (empreendimentoId) await empreendimentoLinksService.linkCostCenter(editingItem.id, { empreendimentoId });
                }
            } else {
                // Em "Todas as organizações" o centro de custo é criado em cada uma.
                // (Empreendimento só chega preenchido com organização única — o
                // select não é oferecido em "Todas".)
                const { ok, failed } = await forEachTargetOrg(createTarget!, async orgId => {
                    const criado = await costCenterService.create({
                        organization_id: orgId,
                        parent_id: parentId,
                        project_id: projectId,
                        empreendimento_id: empreendimentoId,
                        name: formData.name.trim(),
                        description: formData.description.trim() || undefined,
                    });
                    if (empreendimentoId) {
                        // Sem `organizationId`: o serviço resolve a org do próprio
                        // empreendimento (pode ser outra que a do centro de custo).
                        await empreendimentoAuditService.record({
                            empreendimentoId,
                            entityType: 'cost_center',
                            entityId: criado.id,
                            entityLabel: `${criado.code} · ${criado.name}`,
                            action: 'create',
                        });
                    }
                    return criado;
                });
                if (ok === 0) throw failed[0]?.error ?? new Error('Falha ao criar');
            }
            closeSheet();
            await load();
            notify('Registro salvo com sucesso.');
        } catch (error) {
            console.error('Erro ao salvar centro de custo:', error);
            notify(mensagemDeErroAoSalvar(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async (item: CostCenterV2) => {
        try {
            await costCenterService.duplicate(item);
            await load();
            notify('Registro duplicado com sucesso.');
        } catch (error) {
            console.error('Erro ao duplicar centro de custo:', error);
            notify('Erro ao duplicar o registro.', 'error');
        }
    };

    const handleDelete = async (item: CostCenterV2) => {
        const childCount = childrenByParent.get(item.id)?.length ?? 0;
        const ok = await confirm({
            title: 'Excluir registro?',
            message: childCount > 0
                ? `Este grupo tem ${childCount} centro${childCount !== 1 ? 's' : ''} de custo vinculado${childCount !== 1 ? 's' : ''} — todos serão excluídos junto. Essa ação não pode ser desfeita.`
                : 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await costCenterService.delete(item.id);
            await load();
            notify('Registro excluído com sucesso.');
        } catch (error) {
            console.error('Erro ao excluir centro de custo:', error);
            notify('Erro ao excluir o registro.', 'error');
        }
    };

    const handleExport = () => {
        exportService.exportCostCentersV2(
            items.map(i => ({ code: i.code, name: i.name, description: i.description, groupName: i.parent_id ? groupNameFor(i) : undefined })),
        );
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho §20 — space-y-6, h1 + p mt-1.5 direto, sem card */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                        <Layers className="w-6 h-6 text-blue-600" />
                        Centro de custo
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Estruture os grupos e centros de custo usados em Suprimentos, Comercial e Financeiro.</p>
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {/* Toolbar §5.2 — acoplada à tabela, mesmo padrão do ÒPURA Docs / FinancialRegistryManager */}
                <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                    {/* Sem seletor de organização aqui: a organização vem do seletor global do topo. */}
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Pesquisar por código, grupo, centro de custo ou descrição..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => exportService.downloadCostCenterV2Template()}
                            title="Baixar modelo para importação"
                            className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95"
                        >
                            <FileDown className="w-4 h-4" />
                        </button>
                        <button
                            onClick={async () => {
                                const target = await resolveWriteOrg('all-allowed');
                                if (!target) return;
                                setImportTarget(target);
                                setShowImportModal(true);
                            }}
                            title="Importar"
                            className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95"
                        >
                            <Upload className="w-4 h-4" />
                        </button>
                        {items.length > 0 && (
                            <button
                                onClick={handleExport}
                                title="Exportar"
                                className="h-9 w-9 flex items-center justify-center text-gray-500 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        )}
                    </div>

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

                    <ColumnConfigButton
                        columns={COLUMNS.filter(c => c.key !== 'actions')}
                        visibleColumns={tableColumns.visibleColumns}
                        showColumnConfig={tableColumns.showColumnConfig}
                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                        onToggleColumn={tableColumns.toggleColumn}
                        onReset={tableColumns.resetColumns}
                    />

                    <button
                        onClick={() => openCreate('group')}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-600 border border-blue-200 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo grupo
                    </button>

                    <button
                        onClick={() => openCreate('item')}
                        disabled={groups.length === 0}
                        title={groups.length === 0 ? 'Crie um grupo antes de cadastrar um centro de custo' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo centro de custo
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : visibleRows.length === 0 ? (
                    <div className="text-center py-12">
                        <AlertCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro encontrado</h3>
                        <p className="text-sm text-gray-500">
                            {isFiltering ? 'Tente ajustar sua busca.' : 'Cadastre o primeiro grupo de centro de custo.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = COST_CENTER_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className} />
                                        );
                                    })}
                                    <th className="px-6 py-2 text-right w-32 text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {visibleRows.map(({ item, hasChildren, isGroup }) => {
                                    const expanded = !!expandedIds[item.id];
                                    return (
                                        <tr key={item.id} className={`group hover:bg-blue-50/50 transition-colors ${isGroup ? 'bg-gray-50/60' : ''}`}>
                                            {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderCostCenterCell(key, { item, isGroup, hasChildren, expanded, toggleExpand, groupNameFor, obraNameById, empreendimentoOf })}
                                                </td>
                                            ))}
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <ActionIconButton kind="edit" onClick={() => openEdit(item)} />
                                                    <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(item)} />
                                                    <ActionIconButton kind="delete" onClick={() => handleDelete(item)} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Sheet — criar/editar (UI_PATTERNS.md: painel lateral é o padrão para cadastro simples) */}
            <Sheet open={sheetOpen} onClose={closeSheet} size="md">
                <SheetHeader onClose={closeSheet}>
                    <SheetTitle>
                        {editingItem
                            ? (formData.recordType === 'group' ? 'Editar grupo' : 'Editar centro de custo')
                            : (formData.recordType === 'group' ? 'Novo grupo' : 'Novo centro de custo')}
                    </SheetTitle>
                    <SheetDescription>
                        {editingItem ? `Código ${editingItem.code}` : 'O código é gerado automaticamente ao salvar.'}
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <SheetPanel className="p-6 space-y-5">
                        {editingItem && !editingHasChildren && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Tipo de registro</label>
                                <div className="mt-1.5 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, recordType: 'group', parent_id: '', project_id: '', empreendimento_id: '' })}
                                        className={`h-9 rounded-[6px] text-sm font-medium border transition-all ${formData.recordType === 'group' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Grupo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, recordType: 'item' })}
                                        className={`h-9 rounded-[6px] text-sm font-medium border transition-all ${formData.recordType === 'item' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Centro de custo
                                    </button>
                                </div>
                            </div>
                        )}

                        {formData.recordType === 'item' && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Grupo</label>
                                <select
                                    required
                                    value={formData.parent_id}
                                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                                    className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                >
                                    <option value="" disabled>Selecione um grupo...</option>
                                    {groups.filter(g => g.id !== editingItem?.id).map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Nome</label>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder={formData.recordType === 'item' ? 'Ex: Recursos Humanos' : 'Ex: Condomínios'}
                                className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {formData.recordType === 'item' && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Obra <span className="text-gray-400 font-normal">(opcional)</span></label>
                                {linkOrgId ? (
                                    <select
                                        value={formData.project_id}
                                        onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                                        disabled={sheetObrasLoading}
                                        className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                                    >
                                        <option value="">— Sem obra vinculada —</option>
                                        {sheetObras.map(o => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className="mt-1.5 text-xs text-gray-400">Disponível só ao gravar numa organização específica — não em "Todas as organizações".</p>
                                )}
                            </div>
                        )}

                        {formData.recordType === 'item' && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Empreendimento <span className="text-gray-400 font-normal">(opcional)</span></label>
                                {linkOrgId ? (
                                    <>
                                        <select
                                            value={formData.empreendimento_id}
                                            onChange={(e) => setFormData({ ...formData, empreendimento_id: e.target.value })}
                                            disabled={sheetEmpreendimentosLoading}
                                            className="mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                                        >
                                            <option value="">— Sem empreendimento vinculado —</option>
                                            {sheetEmpreendimentosPorOrg.map(grupo => (
                                                // Um <optgroup> por organização: o vínculo cruza orgs de propósito
                                                // (empreendimento na SPE, centro de custo na org do grupo).
                                                <optgroup key={grupo.orgId} label={grupo.orgName}>
                                                    {grupo.emps.map(emp => {
                                                        // 1:1 — quem já está preso a outro centro de custo (de qualquer org) aparece, mas não se escolhe.
                                                        const dono = donoPorEmpreendimento.get(emp.id);
                                                        const ocupado = !!dono && dono.id !== editingItem?.id;
                                                        const donoOutraOrg = ocupado && dono!.organizationId !== linkOrgId;
                                                        return (
                                                            <option key={emp.id} value={emp.id} disabled={ocupado}>
                                                                {emp.name}
                                                                {ocupado ? ` — já vinculado a ${dono!.code}${donoOutraOrg ? ` (${orgNameById.get(dono!.organizationId) || 'outra organização'})` : ''}` : ''}
                                                            </option>
                                                        );
                                                    })}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <p className="mt-1.5 text-xs text-gray-400">Vínculo direto, de todas as suas organizações: cada empreendimento tem um único centro de custo. Sem ele, a coluna Empreendimento mostra o da obra vinculada.</p>
                                    </>
                                ) : (
                                    <p className="mt-1.5 text-xs text-gray-400">Ao criar em "Todas as organizações" o centro de custo é replicado em cada uma, e um empreendimento só pode ter um — escolha uma organização para vincular.</p>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Descrição</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Opcional..."
                                rows={3}
                                className="mt-1.5 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                            />
                        </div>
                    </SheetPanel>
                    <SheetFooter>
                        <button type="button" onClick={closeSheet} className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.name.trim()}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </SheetFooter>
                </form>
            </Sheet>

            {showImportModal && importTarget && (
                <CostCenterV2ImportModal
                    target={importTarget}
                    onClose={() => { setShowImportModal(false); setImportTarget(null); }}
                    onSuccess={load}
                />
            )}

            {orgTargetModal}

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

export default CostCenterModule;
