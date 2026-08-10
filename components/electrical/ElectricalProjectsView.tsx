import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, FolderGit2, Calendar, User, ChevronRight, PenTool, Search, MoveHorizontal, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { OpuraElectricalProject } from '../../types/electrical';
import { electricalProjectService } from '../../services/electricalProjectService';

interface ElectricalProjectsViewProps {
  organizationId?: string;
  projectId?: string;
  obras?: { id: string; name: string }[];
  setProjectId?: (id: string | null) => void;
  onChangeView: (view: string) => void;
  // This helps to pass the selected electrical project ID to the editor
  onSelectProject: (id: string) => void;
}

const COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Nome do Projeto', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'technicalLead', label: 'Líder Técnico', sortable: true },
  { key: 'createdAt', label: 'Data de Criação', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];
const COL_WIDTHS: Record<string, number> = { name: 260, status: 130, technicalLead: 200, createdAt: 150, actions: 130 };

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (coluna estrutural fixa fora do drag).
const ELECTRICAL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  name: { label: 'Nome do Projeto', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  technicalLead: { label: 'Líder Técnico', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  createdAt: { label: 'Data de Criação', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderElectricalCell(key: string, proj: OpuraElectricalProject): React.ReactNode {
  switch (key) {
    case 'name':
      return (
        <>
          <div className="truncate text-sm font-normal text-gray-700">{proj.name}</div>
          <div className="text-xs text-gray-400">{proj.tensionType || 'Tensão não definida'}</div>
        </>
      );
    case 'status':
      return <span className="text-sm font-normal text-amber-700">{proj.status.toUpperCase()}</span>;
    case 'technicalLead':
      return (
        <div className="flex items-center gap-2 min-w-0 text-sm font-normal text-gray-600">
          <User className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="truncate">{proj.technicalLead || 'Não atribuído'}</span>
        </div>
      );
    case 'createdAt':
      return (
        <div className="flex items-center gap-2 text-sm font-normal text-gray-600">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {new Date(proj.createdAt).toLocaleDateString('pt-BR')}
        </div>
      );
    default:
      return null;
  }
}

const ElectricalProjectsView: React.FC<ElectricalProjectsViewProps> = ({ organizationId, projectId, obras, setProjectId, onChangeView, onSelectProject }) => {
  const [projects, setProjects] = useState<OpuraElectricalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const { localToast, showToast } = useToast();

  const [search, setSearch] = usePersistedState<string>('electricalProjects:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'electricalProjectsColumns');
  const cols = useResizableColumns(COL_WIDTHS, 'electricalProjectsColWidths');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await electricalProjectService.listProjects(organizationId, projectId);
      setProjects(data);
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar projetos elétricos', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, projectId, showToast]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!organizationId) {
      showToast('Você precisa selecionar uma organização.', 'error');
      return;
    }
    if (!projectId) {
      showToast('Você precisa selecionar uma obra/projeto no topo da tela antes de criar um projeto elétrico.', 'error');
      return;
    }

    const name = prompt('Nome do projeto elétrico (ex: Elétrica Torre A):');
    if (!name) return;

    try {
      const newProj = await electricalProjectService.createProject({
        organizationId: organizationId,
        projectId: projectId,
        name,
        status: 'draft',
      });
      // Cria a versão inicial
      await electricalProjectService.createVersion({
        organizationId: organizationId,
        electricalProjectId: newProj.id,
        versionNumber: 1,
        status: 'draft',
        isLocked: false,
      });

      setProjects(prev => [newProj, ...prev]);
      showToast('Projeto elétrico criado', 'success');
    } catch (error: any) {
      console.error(error);
      showToast('Erro ao criar projeto elétrico: ' + (error.message || 'Desconhecido'), 'error');
    }
  };

  const openEditor = (id: string) => {
    onSelectProject(id);
    onChangeView('electrical-editor');
  };

  const handleEdit = async (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    const newName = prompt('Novo nome do projeto:', currentName);
    if (!newName || newName === currentName) return;
    try {
      const updated = await electricalProjectService.updateProject(id, { name: newName });
      setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...updated, name: newName } : p)));
      showToast('Projeto atualizado', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao atualizar projeto.', 'error');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!await confirm({
      title: 'Excluir projeto elétrico?',
      message: 'Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    })) return;
    try {
      await electricalProjectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      showToast('Projeto excluído', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao excluir projeto.', 'error');
    }
  };

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = !term ? projects : projects.filter(p =>
      p.name.toLowerCase().includes(term) || (p.technicalLead || '').toLowerCase().includes(term));
    const key = tableColumns.sortColumn;
    if (!key) return rows;
    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key];
      const bv = (b as unknown as Record<string, unknown>)[key];
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }, [projects, search, tableColumns.sortColumn, tableColumns.sortDirection]);

  const semLiderCount = projects.filter(p => !p.technicalLead).length;

  const orderedVisible = tableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
  const tableWidth = orderedVisible.reduce((s, key) => s + cols.getWidth(key), 0) + cols.getWidth('actions');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <FolderGit2 className="w-8 h-8 text-blue-600" />
            Projetos Elétricos
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Gerencie plantas, ambientes e pontos elétricos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(obras && obras.length > 0) && (
            <select
              className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              value={projectId || ''}
              onChange={(e) => setProjectId?.(e.target.value)}
            >
              <option value="">Selecione uma Obra...</option>
              {obras.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
          >
            <Plus className="w-[15px] h-[15px]" />
            Novo Projeto Elétrico
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-[10px] px-4 py-2.5 flex items-center gap-5 shadow-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Total de Projetos</p>
            <p className="text-lg font-bold text-gray-900">{projects.length}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-[10px] px-4 py-2.5 flex items-center gap-5 shadow-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Sem Líder Técnico Atribuído</p>
            <p className="text-lg font-bold text-gray-900">{semLiderCount}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex flex-col md:flex-row gap-2.5 items-center">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou líder técnico..."
              className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
            <ColumnConfigButton
              columns={COLUMNS.filter(c => c.key !== 'actions')}
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

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <PenTool className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              {projects.length === 0 ? 'Nenhum projeto elétrico' : 'Nenhum projeto encontrado'}
            </h3>
            <p className="text-slate-500 max-w-sm mt-2 mb-6">
              {projects.length === 0
                ? 'Você ainda não criou nenhum projeto elétrico para esta obra. Clique no botão acima para começar.'
                : 'Tente ajustar sua busca.'}
            </p>
            {projects.length === 0 && (
              <button onClick={handleCreate} className="h-9 px-3.5 rounded-[6px] border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                Criar Primeiro Projeto
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                    const def = ELECTRICAL_COLUMN_HEADERS[key];
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
              <tbody className="divide-y divide-gray-100">
                {filteredProjects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => openEditor(proj.id)}>
                    {orderedVisible.map(key => (
                      <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                        {renderElectricalCell(key, proj)}
                      </td>
                    ))}
                    <td aria-hidden="true"></td>
                    {tableColumns.visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditor(proj.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1"
                          >
                            Abrir editor
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <ActionIconButton kind="edit" title="Editar Nome" onClick={(e) => handleEdit(e, proj.id, proj.name)} />
                          <ActionIconButton kind="delete" title="Excluir Projeto" onClick={(e) => handleDelete(e, proj.id)} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

export default ElectricalProjectsView;
