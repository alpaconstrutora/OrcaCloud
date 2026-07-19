// components/empreendimento/EmpreendimentoModule.tsx
import React from 'react';
import { Plus, Building2, Search, RefreshCw, AlertCircle } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { KpiCard } from '../ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { empreendimentoService } from '../../services/empreendimentoService';
import { Empreendimento, EmpreendimentoStatus } from '../../types';
import EmpreendimentoForm from './EmpreendimentoForm';
import EmpreendimentoDetail from './EmpreendimentoDetail';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

const STATUS_LABELS: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'Planejamento',
  LANCAMENTO: 'Lançamento',
  EM_OBRAS: 'Em Obras',
  ENTREGUE: 'Entregue',
  ENCERRADO: 'Encerrado',
};

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_standard_guide.md §8).
const STATUS_TEXT_COLOR: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'text-gray-600',
  LANCAMENTO: 'text-amber-600',
  EM_OBRAS: 'text-blue-600',
  ENTREGUE: 'text-emerald-600',
  ENCERRADO: 'text-slate-500',
};

const COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Empreendimento', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'vgv', label: 'VGV Total', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

export const EmpreendimentoModule: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => {
  // "Todas as organizações" não bloqueia o cadastro: o modal pede a org num seletor próprio.
  const isAllOrgs = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
  const orgIdParam = isAllOrgs ? undefined : (activeOrganizationId as string);

  const [items, setItems] = React.useState<Empreendimento[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = usePersistedState<string>('empreendimentoList:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'empreendimentoListColumns');
  const [selected, setSelected] = React.useState<Empreendimento | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Empreendimento | null>(null);
  const confirm = useConfirm();
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await empreendimentoService.list(orgIdParam));
    } catch (err) {
      console.error('[EmpreendimentoModule] erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [orgIdParam]);

  React.useEffect(() => { load(); }, [load]);

  const handleSaved = async (saved: Empreendimento) => {
    setIsFormOpen(false);
    setEditing(null);
    await load();
    // Se estávamos no detalhe, refletir a edição
    if (selected && selected.id === saved.id) setSelected(saved);
  };

  const handleDelete = async (e: React.MouseEvent, item: Empreendimento) => {
    e.stopPropagation();
    const ok = await confirm({
      title: `Excluir "${item.name}"?`,
      message: 'Torres, unidades e áreas comuns serão removidos. Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await empreendimentoService.remove(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err: any) {
      notify(`Erro ao excluir: ${err.message}`, 'error');
    }
  };

  const kpis = React.useMemo(() => {
    const emObras = items.filter(i => i.status === 'EM_OBRAS').length;
    const vgvTotal = items.reduce((sum, i) => sum + (i.vgv_total || 0), 0);
    return { total: items.length, emObras, vgvTotal };
  }, [items]);

  const filtered = React.useMemo(() => {
    const result = items.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.spe_razao_social || '').toLowerCase().includes(search.toLowerCase())
    );

    return result.sort((a, b) => {
      if (tableColumns.sortColumn) {
        switch (tableColumns.sortColumn) {
          case 'name':
            return tableColumns.sortDirection === 'asc'
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name);
          case 'status':
            return tableColumns.sortDirection === 'asc'
              ? STATUS_LABELS[a.status].localeCompare(STATUS_LABELS[b.status])
              : STATUS_LABELS[b.status].localeCompare(STATUS_LABELS[a.status]);
          case 'vgv':
            return tableColumns.sortDirection === 'asc'
              ? (a.vgv_total || 0) - (b.vgv_total || 0)
              : (b.vgv_total || 0) - (a.vgv_total || 0);
          default:
            return 0;
        }
      }
      // Sem coluna clicada, ordenação default é nome A-Z (§6.4: sem dropdown redundante).
      return a.name.localeCompare(b.name);
    });
  }, [items, search, tableColumns.sortColumn, tableColumns.sortDirection]);

  // ── Detalhe ────────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <>
        <EmpreendimentoDetail
          empreendimento={selected}
          // Com "Todas as organizações" a org vem da própria entidade aberta.
          organizationId={selected.organization_id || orgIdParam || ''}
          onBack={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setIsFormOpen(true); }}
          onGoToStudy={selected.imovib_study_id ? () => onChangeView('imovib') : undefined}
          onSynced={async () => {
            try {
              const refreshed = await empreendimentoService.getById(selected.id) as Empreendimento | null;
              if (refreshed) setSelected(refreshed);
            } catch { /* noop */ }
          }}
        />
        {isFormOpen && (
          <EmpreendimentoForm
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
      {/* Header — card com breadcrumb (linguagem visual própria deste módulo,
          documentada como exceção ao cabeçalho flat em ui_ux_standard_guide.md
          §20); radius migrado pra escala compacta (§16) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <span>Comercial</span><span>/</span><span className="text-gray-600 font-bold">Incorporação</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" /> Empreendimentos
          </h1>
        </div>
        {/* Botão primário — variante compacta (§17), não o componente Button
            compartilhado (BASE dele ainda é font-black uppercase tracking-widest
            rounded-xl, estilo pesado deprecado) */}
        <button
          onClick={() => { setEditing(null); setIsFormOpen(true); }}
          title="Novo empreendimento"
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-[15px] h-[15px]" /> Novo empreendimento
        </button>
      </div>

      {/* KPIs — mesmo nível de importância (contagem × contagem × soma financeira), grade simétrica (§4.2) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard shadow={false} label="Total de Empreendimentos" value={kpis.total} icon={<Building2 className="w-5 h-5" />} color="blue" />
        <KpiCard shadow={false} label="Em Obras" value={kpis.emObras} icon={<Building2 className="w-5 h-5" />} color="amber" />
        <KpiCard shadow={false} label="VGV Total" value={`R$ ${kpis.vgvTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={<Building2 className="w-5 h-5" />} color="emerald" />
      </div>

      {/* Toolbar — variante desaninhada (§5.1): já há KPI cards acima dando contexto */}
      <div className="flex flex-col md:flex-row gap-2.5 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, código ou SPE..."
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

        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

        {/* Sem toggle grid/lista: esta tela só tem visualização em tabela (§5, nota) */}
        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
          <ColumnConfigButton
            columns={COLUMNS.filter(c => c.key !== 'actions')}
            visibleColumns={tableColumns.visibleColumns}
            showColumnConfig={tableColumns.showColumnConfig}
            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
            onToggleColumn={tableColumns.toggleColumn}
            onReset={tableColumns.resetColumns}
          />
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Carregando empreendimentos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum empreendimento encontrado</h3>
          <p className="text-sm text-gray-500">
            {search ? 'Tente ajustar sua busca.' : 'Cadastre seu primeiro empreendimento no botão acima.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  {tableColumns.visibleColumns.includes('name') && (
                    <SortableHeader colKey="name" label="Empreendimento" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                      onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('status') && (
                    <SortableHeader colKey="status" label="Status" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                      onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                  )}
                  {tableColumns.visibleColumns.includes('vgv') && (
                    <SortableHeader colKey="vgv" label="VGV total" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                      onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                  )}
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
                    {tableColumns.visibleColumns.includes('name') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-normal text-gray-900 truncate">{item.name}</p>
                            <p className="text-sm font-normal text-gray-400 truncate">{item.code || item.spe_razao_social || '—'}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('status') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                        <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('vgv') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">
                        {item.vgv_total != null ? `R$ ${item.vgv_total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—'}
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right">
                        {/* Abrir = clique na linha (ação dominante, §9.1). Ações restantes: só Excluir. */}
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
        </div>
      )}

      {isFormOpen && (
        <EmpreendimentoForm
          organizationId={editing?.organization_id || orgIdParam || ''}
          editing={editing}
          onClose={() => { setIsFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
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

export default EmpreendimentoModule;
