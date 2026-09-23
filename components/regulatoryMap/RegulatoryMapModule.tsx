// components/regulatoryMap/RegulatoryMapModule.tsx
//
// Cadastro de Mapas Regulatórios por cidade (Incorporação). Cada cidade tem seu mapa definido
// pela prefeitura (macroáreas/zonas/C.A./gabarito) — em vez de digitar tudo de novo em cada
// empreendimento, cadastra-se aqui uma vez por cidade e o empreendimento importa (aba "Mapa
// Regulatório" → "Importar de mapa cadastrado").
import React from 'react';
import { Plus, Map, Search, RefreshCw, AlertCircle, MoveHorizontal } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { RegulatoryMapWithCity, RegulatoryMapStatus } from '../../types';
import RegulatoryMapForm from './RegulatoryMapForm';
import RegulatoryMapDetail from './RegulatoryMapDetail';

interface Props {
    activeOrganizationId: string | null;
    onChangeView: (view: string) => void;
}

const STATUS_LABELS: Record<RegulatoryMapStatus, string> = {
    ATIVO: 'Ativo',
    RASCUNHO: 'Rascunho',
    ARQUIVADO: 'Arquivado',
};

const STATUS_TEXT_COLOR: Record<RegulatoryMapStatus, string> = {
    ATIVO: 'text-emerald-600',
    RASCUNHO: 'text-amber-600',
    ARQUIVADO: 'text-slate-500',
};

const MAP_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Mapa', sortable: true },
    { key: 'city', label: 'Cidade', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
// Soma 750px — MENOR que os ~1290px úteis (viewport 1600 menos sidebar e gutter).
// É de propósito: 4 colunas esticadas até 1290 deixariam "Status" com 300px para a
// palavra "Rascunho". Quem absorve a folga é o <col /> espaçador antes de "Ações"
// (§6.1.1), e quem permite que ele a absorva é o `minWidth: '100%'` no <table> —
// sem ele a tabela para nos 750px e a folga vira faixa branca à direita.
const MAP_COL_WIDTHS: Record<string, number> = { name: 320, city: 220, status: 130, actions: 80 };

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (coluna estrutural fixa fora do drag).
const MAP_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Mapa', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    city: { label: 'Cidade', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderMapCell(key: string, item: RegulatoryMapWithCity): React.ReactNode {
    switch (key) {
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Map className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-normal text-gray-900 truncate">{item.name}</p>
                        <p className="text-sm font-normal text-gray-400 truncate">{item.lei_referencia || '—'}</p>
                    </div>
                </div>
            );
        case 'city':
            return (
                <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                    {item.city_name}{item.state_code ? ` - ${item.state_code}` : ''}
                </span>
            );
        case 'status':
            return (
                <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                </span>
            );
        default:
            return null;
    }
}

export const RegulatoryMapModule: React.FC<Props> = ({ activeOrganizationId }) => {
    const isAllOrgs = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
    const orgIdParam = isAllOrgs ? undefined : activeOrganizationId as string;

    const [items, setItems] = React.useState<RegulatoryMapWithCity[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [search, setSearch] = usePersistedState<string>('regulatoryMap:search', '');
    const tableColumns = useTableColumns(MAP_COLUMNS, 'regulatoryMapColumns');
    const cols = useResizableColumns(MAP_COL_WIDTHS, 'regulatoryMapColWidths');
    const [selected, setSelected] = React.useState<RegulatoryMapWithCity | null>(null);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<RegulatoryMapWithCity | null>(null);
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            setItems(await regulatoryMapService.list(orgIdParam));
        } catch (err) {
            console.error('[RegulatoryMapModule] erro ao carregar:', err);
        } finally {
            setLoading(false);
        }
    }, [orgIdParam]);

    React.useEffect(() => { load(); }, [load]);

    const handleSaved = async (saved: { id: string }) => {
        setIsFormOpen(false);
        setEditing(null);
        await load();
        if (selected && selected.id === saved.id) {
            const refreshed = await regulatoryMapService.getById(saved.id);
            if (refreshed) setSelected(refreshed);
        }
    };

    const handleDelete = async (e: React.MouseEvent, item: RegulatoryMapWithCity) => {
        e.stopPropagation();
        const ok = await confirm({
            title: `Excluir "${item.name}"?`,
            message: 'As zonas cadastradas neste mapa serão removidas. Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await regulatoryMapService.remove(item.id);
            setItems(prev => prev.filter(i => i.id !== item.id));
        } catch (err: any) {
            showToast(`Erro ao excluir: ${err.message}`, 'error');
        }
    };

    const filtered = React.useMemo(() => {
        const q = search.toLowerCase();
        const rows = items.filter(i =>
            i.name.toLowerCase().includes(q) ||
            (i.city_name || '').toLowerCase().includes(q) ||
            (i.state_code || '').toLowerCase().includes(q),
        );
        const key = tableColumns.sortColumn;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        if (key === 'city') {
            return [...rows].sort((a, b) => (a.city_name || '').localeCompare(b.city_name || '') * dir);
        }
        if (key === 'status') {
            return [...rows].sort((a, b) => STATUS_LABELS[a.status].localeCompare(STATUS_LABELS[b.status]) * dir);
        }
        return [...rows].sort((a, b) => a.name.localeCompare(b.name) * (key === 'name' ? dir : 1));
    }, [items, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    // ── Detalhe ────────────────────────────────────────────────────────────────
    if (selected) {
        return (
            <>
                <RegulatoryMapDetail
                    map={selected}
                    onBack={() => setSelected(null)}
                    onEdit={() => { setEditing(selected); setIsFormOpen(true); }}
                />
                {isFormOpen && (
                    <RegulatoryMapForm
                        organizationId={editing?.organization_id || selected.organization_id || orgIdParam || ''}
                        editing={editing}
                        onClose={() => { setIsFormOpen(false); setEditing(null); }}
                        onSaved={handleSaved}
                    />
                )}
            </>
        );
    }

    // ── Lista ──────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Cabeçalho §20 — h1 + p direto, sem card/banda/ícone. A migalha "Comercial /
                Incorporação" saiu por ser caminho de módulo estático (§18/§23): a sidebar já
                mostra o grupo Comercial com "Mapa Regulatório" ativo. */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Mapa Regulatório</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        Cadastre o mapa regulatório de cada cidade uma vez; os empreendimentos importam as zonas aplicáveis.
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setIsFormOpen(true); }}
                    title="Novo mapa regulatório"
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo mapa
                </button>
            </div>

            {/* mb-3 — §20.1: entre KPIs e a toolbar acoplada o respiro é 12px (mesma
                tarefa), não os 24px do space-y-6 que separa título de cromo. */}
            {items.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                    <KpiCard label="Total de mapas" value={items.length} icon={<Map className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Ativos" value={items.filter(i => i.status === 'ATIVO').length} icon={<Map className="w-5 h-5" />} color="emerald" />
                    <KpiCard label="Rascunho" value={items.filter(i => i.status === 'RASCUNHO').length} icon={<Map className="w-5 h-5" />} color="amber" />
                </div>
            )}

            {/* Toolbar acoplada à tabela (§5.2): busca e conteúdo dividem UM card —
                border/rounded/shadow só no pai, `overflow-hidden` corta os cantos, e a
                única costura visível é o `border-b` da faixa da toolbar. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-white">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                {/* min-w-0: sem isso o flex-1 não encolhe abaixo do placeholder e a linha
                    estoura quando os grupos da direita entram ao lado. */}
                <div className="flex-1 min-w-0 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Pesquisar por cidade, UF ou nome do mapa..."
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <button
                    onClick={load}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                        columns={MAP_COLUMNS.filter(c => c.key !== 'actions')}
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
            </div>
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando mapas regulatórios...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                    <Map className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum mapa regulatório cadastrado</h3>
                    <p className="text-sm text-gray-500">
                        {search ? 'Tente ajustar sua busca.' : 'Cadastre o mapa regulatório de uma cidade no botão acima.'}
                    </p>
                </div>
            ) : (() => {
                const orderedVisible = tableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
                const tableWidth = orderedVisible.reduce((s, key) => s + cols.getWidth(key), 0) + cols.getWidth('actions');
                return (
                    <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
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
                                        const def = MAP_COLUMN_HEADERS[key];
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
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(item => (
                                    <tr
                                        key={item.id}
                                        onClick={() => setSelected(item)}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    >
                                        {orderedVisible.map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderMapCell(key, item)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                    <ActionIconButton kind="delete" onClick={(e) => handleDelete(e, item)} />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })()}
            </div>

            {isFormOpen && (
                <RegulatoryMapForm
                    organizationId={editing?.organization_id || orgIdParam || ''}
                    editing={editing}
                    onClose={() => { setIsFormOpen(false); setEditing(null); }}
                    onSaved={handleSaved}
                />
            )}

            {/* Só desenha fora do ToastProvider (teste, render isolado): com o provider
                montado em index.tsx o `localToast` vem null e quem mostra é ele. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default RegulatoryMapModule;
