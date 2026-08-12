// components/empreendimento/EmpreendimentoModule.tsx
import React from 'react';
import { Plus, Building2, Search, RefreshCw, AlertCircle, MoveHorizontal, HardHat } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineActionTray } from '../ui/InlineActionTray';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useStore } from '../../store/useStore';
import { empreendimentoService, EmpreendimentoOrphanSummary } from '../../services/empreendimentoService';
import { empreendimentoTypeService } from '../../services/empreendimentoTypeService';
import { Empreendimento, EmpreendimentoStatus } from '../../types';
import EmpreendimentoForm from './EmpreendimentoForm';
import EmpreendimentoDetail from './EmpreendimentoDetail';
import CriarObraDoEmpreendimento from './CriarObraDoEmpreendimento';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
  /** `handleLoadProject` do App — abre um projeto já carregado (aba Vinculações). */
  onLoadProject?: (id: string, targetView?: string | null) => Promise<void>;
}

const STATUS_LABELS: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'Planejamento',
  LANCAMENTO: 'Lançamento',
  EM_OBRAS: 'Em Obras',
  ENTREGUE: 'Entregue',
  ENCERRADO: 'Encerrado',
};

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const STATUS_TEXT_COLOR: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'text-gray-600',
  LANCAMENTO: 'text-amber-600',
  EM_OBRAS: 'text-blue-600',
  ENTREGUE: 'text-emerald-600',
  ENCERRADO: 'text-slate-500',
};

const COLUMNS: ColumnConfig[] = [
  { key: 'code', label: 'Código', sortable: true },
  { key: 'name', label: 'Empreendimento', sortable: true },
  { key: 'tipo', label: 'Tipo', sortable: true },
  { key: 'organization', label: 'Organização', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'vgv', label: 'VGV Total', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

// Chaves de dado na ordem do COLUMNS — usadas na soma de `tableTotalWidth`, para
// não repetir a lista à mão a cada coluna nova (era assim que a soma ficava para trás).
const DATA_COLUMN_KEYS = COLUMNS.filter(c => c.key !== 'actions').map(c => c.key);

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  code: 120,
  name: 320,
  tipo: 160,
  organization: 200,
  status: 140,
  vgv: 160,
  actions: 150,
};

// Reordenar colunas por arraste (estilo ClickUp) — mesmos label/sortable/className que
// estavam hardcoded no <SortableHeader> original de cada coluna.
const EMPREENDIMENTO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  code: { label: 'Código', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  name: { label: 'Empreendimento', sortable: true, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  tipo: { label: 'Tipo', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  organization: { label: 'Organização', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  status: { label: 'Status', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  vgv: { label: 'VGV total', sortable: true, className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

function renderEmpreendimentoCell(
  key: string,
  item: Empreendimento,
  ctx: { tipoLabel: (slug?: string | null) => string; orgName: (id?: string | null) => string },
): React.ReactNode {
  switch (key) {
    case 'code':
      return <div className="text-sm font-normal text-gray-600 whitespace-nowrap">{item.code || '—'}</div>;
    case 'name':
      return (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-normal text-gray-900 truncate">{item.name}</p>
            <p className="text-sm font-normal text-gray-400 truncate">{item.spe_razao_social || '—'}</p>
          </div>
        </div>
      );
    case 'tipo':
      return <div className="text-sm font-normal text-gray-600 whitespace-nowrap truncate">{ctx.tipoLabel(item.tipo)}</div>;
    case 'organization':
      return <div className="text-sm font-normal text-gray-700 whitespace-nowrap truncate">{ctx.orgName(item.organization_id)}</div>;
    case 'status':
      return (
        <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </span>
      );
    case 'vgv':
      return (
        <div className="text-sm font-medium text-gray-800">
          {item.vgv_total != null ? `R$ ${item.vgv_total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—'}
        </div>
      );
    default:
      return null;
  }
}

// Fallback só usado se o catálogo (Configurações do Sistema → Tipos de Empreendimento)
// ainda não carregou ou o tipo salvo foi excluído do catálogo — mesmo mapa de EmpreendimentoDetail.tsx.
const FALLBACK_TIPO_LABELS: Record<string, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  MISTO: 'Misto',
  COND_LOGISTICO: 'Condomínio Logístico',
  COND_INDUSTRIAL: 'Condomínio Industrial',
};

export const EmpreendimentoModule: React.FC<Props> = ({ activeOrganizationId, onChangeView, onLoadProject }) => {
  // "Todas as organizações" não bloqueia o cadastro: o modal pede a org num seletor próprio.
  const isAllOrgs = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
  const orgIdParam = isAllOrgs ? undefined : (activeOrganizationId as string);

  const { organizations } = useStore();
  const orgName = React.useCallback(
    (id?: string | null) => (id ? (organizations.find(o => o.id === id)?.name ?? '—') : '—'),
    [organizations],
  );

  const [items, setItems] = React.useState<Empreendimento[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = usePersistedState<string>('empreendimentoList:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'empreendimentoListColumns');
  const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'empreendimentoListColWidths');
  // table-layout:fixed + largura total explícita — mesma razão do padrão em SupplierList
  // (ver comentário lá): evita o navegador redistribuir espaço sobrando entre colunas
  // com <col> de largura fixa ao arrastar uma borda.
  const tableTotalWidth = DATA_COLUMN_KEYS.reduce(
    (sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0),
    0,
  ) + cols.getWidth('actions');
  const [selected, setSelected] = React.useState<Empreendimento | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Empreendimento | null>(null);
  // Duplicação: o formulário abre em modo CRIAR, pré-preenchido a partir deste
  // empreendimento; a estrutura (torres/pavimentos/unidades/áreas) só é copiada
  // quando o usuário salva.
  const [duplicating, setDuplicating] = React.useState<Empreendimento | null>(null);
  // Criar obra a partir do empreendimento — abre o ProjectModal pré-preenchido.
  const [creatingObraFor, setCreatingObraFor] = React.useState<Empreendimento | null>(null);
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

  const [tipoNameMap, setTipoNameMap] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    empreendimentoTypeService.list(orgIdParam)
      .then(types => setTipoNameMap(Object.fromEntries(types.map(t => [t.slug, t.name]))))
      .catch(() => setTipoNameMap({}));
  }, [orgIdParam]);
  const tipoLabel = React.useCallback(
    (slug?: string | null) => slug ? (tipoNameMap[slug] || FALLBACK_TIPO_LABELS[slug] || slug) : '—',
    [tipoNameMap],
  );

  // Aviso proativo de vínculos órfãos (unidade apontando para um imóvel do
  // Comercial que não existe mais) — sem isto, só se descobre abrindo a aba
  // Espelho de Vendas/Locações de cada empreendimento um a um (foi assim que
  // o caso Garden Cambuhy — 41 unidades órfãs — passou despercebido).
  const [orphanSummary, setOrphanSummary] = React.useState<EmpreendimentoOrphanSummary[]>([]);
  React.useEffect(() => {
    let active = true;
    empreendimentoService.getOrphanLinksSummary(orgIdParam)
      .then(summary => { if (active) setOrphanSummary(summary); })
      .catch(err => console.error('[EmpreendimentoModule] erro ao varrer vínculos órfãos:', err));
    return () => { active = false; };
  }, [orgIdParam, items]);

  const handleSaved = async (saved: Empreendimento) => {
    setIsFormOpen(false);
    setEditing(null);
    setDuplicating(null);
    await load();
    // Se estávamos no detalhe, refletir a edição
    if (selected && selected.id === saved.id) setSelected(saved);
  };

  const handleDuplicate = (item: Empreendimento) => {
    setEditing(null);
    setDuplicating(item);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setDuplicating(null);
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

  const filtered = React.useMemo(() => {
    const term = search.toLowerCase();
    const result = items.filter(i =>
      i.name.toLowerCase().includes(term) ||
      (i.code || '').toLowerCase().includes(term) ||
      (i.spe_razao_social || '').toLowerCase().includes(term) ||
      orgName(i.organization_id).toLowerCase().includes(term)
    );

    return result.sort((a, b) => {
      if (tableColumns.sortColumn) {
        switch (tableColumns.sortColumn) {
          case 'code':
            return tableColumns.sortDirection === 'asc'
              ? (a.code || '').localeCompare(b.code || '')
              : (b.code || '').localeCompare(a.code || '');
          case 'name':
            return tableColumns.sortDirection === 'asc'
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name);
          case 'tipo':
            return tableColumns.sortDirection === 'asc'
              ? tipoLabel(a.tipo).localeCompare(tipoLabel(b.tipo))
              : tipoLabel(b.tipo).localeCompare(tipoLabel(a.tipo));
          case 'organization':
            return tableColumns.sortDirection === 'asc'
              ? orgName(a.organization_id).localeCompare(orgName(b.organization_id))
              : orgName(b.organization_id).localeCompare(orgName(a.organization_id));
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
  }, [items, search, tableColumns.sortColumn, tableColumns.sortDirection, tipoLabel, orgName]);

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
          onOpenProject={onLoadProject}
          onChangeView={onChangeView}
          onSynced={async () => {
            try {
              const refreshed = await empreendimentoService.getById(selected.id) as Empreendimento | null;
              if (refreshed) setSelected(refreshed);
            } catch { /* noop */ }
          }}
        />
        {isFormOpen && (
          <EmpreendimentoForm
            organizationId={editing?.organization_id || duplicating?.organization_id || selected.organization_id || orgIdParam || ''}
            editing={editing}
            duplicateFrom={duplicating}
            onClose={closeForm}
            onSaved={handleSaved}
          />
        )}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header flat — h1 solto + subtítulo mt-1.5 (ui_ux_guia_unificado.md §20). O contexto de
          módulo (Comercial/Incorporação) já está na sidebar — não duplicar (§18 do
          ui_ux_guia_unificado.md). */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Empreendimentos</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">Incorporações e desenvolvimentos imobiliários da organização.</p>
      </div>

      {/* Aviso proativo de vínculos órfãos — mesmo padrão visual do banner usado em
          EspelhoVendasTab/EspelhoLocacoesTab (bg-rose-50 + AlertCircle), só que aqui
          cobre TODOS os empreendimentos de uma vez em vez de um só. */}
      {orphanSummary.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-[10px] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">
              {orphanSummary.length} empreendimento{orphanSummary.length !== 1 ? 's' : ''} com unidades vinculadas a imóveis que não existem mais no Comercial:
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {orphanSummary.map(o => (
              <button
                key={o.empreendimentoId}
                onClick={() => {
                  const item = items.find(i => i.id === o.empreendimentoId);
                  if (item) setSelected(item);
                }}
                className="text-xs font-bold text-rose-700 bg-white border border-rose-200 rounded-[6px] px-2.5 py-1 hover:bg-rose-100 transition-colors"
              >
                {o.empreendimentoName} ({o.commercialOrphans + o.rentalOrphans})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabela com toolbar de busca acoplada (ui_ux_guia_unificado.md §5.2) — busca, refresh, colunas
          e o botão primário (sem barra de escopo/§4: não há controles de conta/competência
          aqui) dentro do MESMO card da tabela, separados só pelo border-b da toolbar. */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-white">
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

            {/* Sem toggle grid/lista: esta tela só tem visualização em tabela */}
            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              <ColumnConfigButton
                columns={COLUMNS.filter(c => c.key !== 'actions')}
                visibleColumns={tableColumns.visibleColumns}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={tableColumns.toggleColumn}
                onReset={tableColumns.resetColumns}
              />
              {/* Autofit sob comando explícito — nunca automático (ver doc de autoFit em TableUtils) */}
              <button
                onClick={() => cols.autoFit()}
                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                title="Ajustar largura das colunas ao conteúdo"
              >
                <MoveHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Botão primário (§8) — ação de cadastro pouco frequente, mora aqui porque a
                tela não tem barra de escopo (§4) própria para hospedá-lo. */}
            <button
              onClick={() => { setEditing(null); setIsFormOpen(true); }}
              title="Novo empreendimento"
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-[15px] h-[15px]" /> Novo empreendimento
            </button>
          </div>
        </div>

        {/* Conteúdo — sem bg/border/rounded/shadow próprios, o card pai já supre */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando empreendimentos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum empreendimento encontrado</h3>
            <p className="text-sm text-gray-500">
              {search ? 'Tente ajustar sua busca.' : 'Cadastre seu primeiro empreendimento no botão acima.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
              <colgroup>
                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                  <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                ))}
                {/* espaçador sem largura fixa — absorve a sobra quando a tabela é mais
                    estreita que o container (ver comentário equivalente em SupplierList) */}
                <col />
                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
              </colgroup>
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                    const def = EMPREENDIMENTO_COLUMN_HEADERS[key];
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
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                      Ações
                      <cols.ResizeHandle colKey="actions" />
                    </th>
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
                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                      <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                        {renderEmpreendimentoCell(key, item, { tipoLabel, orgName })}
                      </td>
                    ))}
                    <td aria-hidden="true" className="border-r border-gray-100" />
                    {tableColumns.visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right">
                        {/* Abrir = clique na linha (ação dominante, §9.1). Editar e Duplicar ficam
                            visíveis (as frequentes); as raras vão para a bandeja (§9/§9.2: 3+
                            ações secundárias não ficam soltas na fileira). */}
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <ActionIconButton kind="edit" onClick={() => { setDuplicating(null); setEditing(item); setIsFormOpen(true); }} />
                          <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(item)} />
                          <InlineActionTray>
                            <ActionIconButton
                              kind="move"
                              title="Criar obra para este empreendimento"
                              icon={<HardHat className="w-4 h-4" />}
                              onClick={() => setCreatingObraFor(item)}
                            />
                            <ActionIconButton kind="delete" onClick={(e) => handleDelete(e, item)} />
                          </InlineActionTray>
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

      {isFormOpen && (
        <EmpreendimentoForm
          organizationId={editing?.organization_id || duplicating?.organization_id || orgIdParam || ''}
          editing={editing}
          duplicateFrom={duplicating}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {creatingObraFor && (
        <CriarObraDoEmpreendimento
          empreendimento={creatingObraFor}
          target={{ kind: 'EMPREENDIMENTO' }}
          onClose={() => setCreatingObraFor(null)}
          onCreated={(_, projectName) => {
            setCreatingObraFor(null);
            notify(`Obra "${projectName}" criada e vinculada ao empreendimento.`);
          }}
          onError={message => { setCreatingObraFor(null); notify(message, 'error'); }}
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
