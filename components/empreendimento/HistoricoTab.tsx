// components/empreendimento/HistoricoTab.tsx
//
// Aba Histórico do Empreendimento — trilha de auditoria (empreendimento_audit_logs).
// Só leitura: a tabela é imutável por RLS (só SELECT/INSERT, nenhuma policy de
// UPDATE/DELETE). UI segue docs/ui_ux_guia_unificado.md §5.2/§6/§7/§8/§11/§12.
import React from 'react';
import { History, Search, RefreshCw } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import {
  ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { empreendimentoAuditService } from '../../services/empreendimentoAuditService';
import {
  EmpreendimentoAuditLog, EmpreendimentoAuditEntity,
  EmpreendimentoAuditAction, EmpreendimentoAuditSource,
} from '../../types';

interface Props {
  empreendimentoId: string;
  organizationId: string;
}

const PAGE_SIZE = 50;

const COLUMNS: ColumnConfig[] = [
  { key: 'created_at', label: 'Data/hora', sortable: true },
  { key: 'user', label: 'Usuário', sortable: true },
  { key: 'entity', label: 'Entidade', sortable: true },
  { key: 'action', label: 'Ação', sortable: true },
  { key: 'field', label: 'Campo', sortable: true },
  // De → Para é composto (dois valores na mesma célula) — sem valor único pra ordenar.
  { key: 'change', label: 'De → Para', sortable: false },
  { key: 'source', label: 'Origem', sortable: true },
];

const ENTITY_LABELS: Record<EmpreendimentoAuditEntity, string> = {
  empreendimento: 'Empreendimento',
  tower: 'Torre',
  floor: 'Pavimento',
  unit: 'Unidade',
  common_area: 'Área comum',
  regulatory_zone: 'Zona regulatória',
  obra_link: 'Vínculo com obra',
  area_project: 'Áreas NBR 12721',
  study_link: 'Estudo vinculado',
  commercial: 'Espelho de Vendas',
  rental: 'Espelho de Locações',
  proposal: 'Curadoria',
  cost_center: 'Centro de custo',
};

const ACTION_LABELS: Record<EmpreendimentoAuditAction, string> = {
  create: 'Criou',
  update: 'Alterou',
  delete: 'Excluiu',
  link: 'Vinculou',
  unlink: 'Desvinculou',
  sync: 'Sincronizou',
  publish: 'Publicou',
  pull: 'Importou status',
  approve: 'Aprovou',
  reject: 'Rejeitou',
  export: 'Exportou',
};

// Texto colorido puro — §8 proíbe pílula/fundo/uppercase em badge de status.
const ACTION_COLORS: Record<EmpreendimentoAuditAction, string> = {
  create: 'text-emerald-700',
  update: 'text-blue-700',
  delete: 'text-red-600',
  link: 'text-indigo-700',
  unlink: 'text-amber-700',
  sync: 'text-violet-700',
  publish: 'text-teal-700',
  pull: 'text-cyan-700',
  approve: 'text-emerald-700',
  reject: 'text-red-600',
  export: 'text-gray-600',
};

const SOURCE_LABELS: Record<EmpreendimentoAuditSource, string> = {
  app: 'Cadastro',
  sync_imovib: 'Viabilidade (Imovib)',
  sync_planta: 'Planta IA',
  curadoria: 'Curadoria',
  comercial: 'Vendas',
  locacao: 'Locações',
  area_engine: 'Áreas NBR',
};

// Nomes técnicos de coluna não dizem nada para quem lê o histórico.
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  code: 'Código',
  status: 'Situação',
  tipo: 'Tipo',
  vgv_total: 'VGV total',
  matricula: 'Matrícula',
  construtora: 'Construtora',
  responsavel_tecnico: 'Responsável técnico',
  crea_cau: 'CREA/CAU',
  numero_processo: 'Número do processo',
  project_id: 'Obra vinculada',
  developer_name: 'Incorporadora',
  manager: 'Gestor',
  launch_date: 'Lançamento',
  expected_delivery_date: 'Entrega prevista',
  price: 'Preço',
  rental_price: 'Preço de locação',
  rental_status: 'Situação de locação',
  private_area: 'Área privativa',
  common_area: 'Área comum',
  total_area: 'Área total',
  typology: 'Tipologia',
  bedrooms: 'Dormitórios',
  bathrooms: 'Banheiros',
  parking_spaces: 'Vagas',
  floors_count: 'Pavimentos',
  units_per_floor: 'Unidades por pavimento',
  spe_razao_social: 'SPE — razão social',
  spe_cnpj: 'SPE — CNPJ',
  terreno_area: 'Área do terreno',
};

const auditEntityLabel = (e: EmpreendimentoAuditEntity): string => ENTITY_LABELS[e] ?? e;
const auditActionLabel = (a: EmpreendimentoAuditAction): string => ACTION_LABELS[a] ?? a;
const auditSourceLabel = (s: EmpreendimentoAuditSource): string => SOURCE_LABELS[s] ?? s;
const auditFieldLabel = (f: string | null): string => (f ? FIELD_LABELS[f] ?? f : '—');

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
};

/** Valor de auditoria em texto. Objetos viram JSON curto; vazio vira travessão. */
const formatValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return '—'; }
  }
  return String(v);
};

const truncate = (s: string, max = 42): string => (s.length > max ? `${s.slice(0, max)}…` : s);

// Reordenar colunas por arraste (estilo ClickUp) — mesmos label/sortable/className que
// estavam hardcoded no <SortableHeader> original de cada coluna.
const HISTORICO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  created_at: { label: 'Data/hora', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
  user: { label: 'Usuário', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
  entity: { label: 'Entidade', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
  action: { label: 'Ação', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
  field: { label: 'Campo', sortable: true, className: 'px-6 py-2 border-r border-gray-100' },
  change: { label: 'De → Para', sortable: false, className: 'px-6 py-2 border-r border-gray-100' },
  source: { label: 'Origem', sortable: true, className: 'px-6 py-2' },
};

function renderHistoricoCell(key: string, log: EmpreendimentoAuditLog): React.ReactNode {
  switch (key) {
    case 'created_at':
      return <span className="text-sm font-normal text-gray-600">{formatDateTime(log.created_at)}</span>;
    case 'user':
      return <span className="text-sm font-normal text-gray-700">{log.user_email || 'Sistema'}</span>;
    case 'entity':
      return (
        <span className="text-sm font-normal text-gray-700">
          {auditEntityLabel(log.entity_type)}
          {log.entity_label && (
            <span className="text-gray-400"> · {truncate(log.entity_label, 28)}</span>
          )}
        </span>
      );
    case 'action':
      return (
        <span className={`text-sm font-normal ${ACTION_COLORS[log.action] || 'text-gray-600'}`}>
          {auditActionLabel(log.action)}
        </span>
      );
    case 'field':
      return <span className="text-sm font-normal text-gray-600">{auditFieldLabel(log.field_name)}</span>;
    case 'change': {
      const resumo = summarizeMetadata(log.metadata);
      return (
        <span className="text-sm font-normal text-gray-600">
          {log.field_name
            ? `${truncate(formatValue(log.old_value), 24)} → ${truncate(formatValue(log.new_value), 24)}`
            : resumo || '—'}
        </span>
      );
    }
    case 'source':
      return <span className="text-sm font-normal text-gray-600">{auditSourceLabel(log.source)}</span>;
    default:
      return null;
  }
}

/** Resumo legível de um evento de lote (metadata com contadores). */
const summarizeMetadata = (metadata: Record<string, unknown> | null | undefined): string | null => {
  if (!metadata) return null;
  const parts = Object.entries(metadata)
    .filter(([k, v]) => k !== 'emLote' && typeof v === 'number' && v > 0)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(' · ') : null;
};

export const HistoricoTab: React.FC<Props> = ({ empreendimentoId }) => {
  const [logs, setLogs] = React.useState<EmpreendimentoAuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<EmpreendimentoAuditLog | null>(null);

  const [search, setSearch] = usePersistedState<string>('empreendimentoHistorico:search', '');
  const [entityFilter, setEntityFilter] = usePersistedState<string>('empreendimentoHistorico:entity', '');
  const [actionFilter, setActionFilter] = usePersistedState<string>('empreendimentoHistorico:action', '');
  const [sourceFilter, setSourceFilter] = usePersistedState<string>('empreendimentoHistorico:source', '');
  const tableColumns = useTableColumns(COLUMNS, 'empreendimentoHistoricoColumns');

  const filters = React.useMemo(() => ({
    search: search || undefined,
    entityType: entityFilter ? [entityFilter as EmpreendimentoAuditEntity] : undefined,
    action: actionFilter ? [actionFilter as EmpreendimentoAuditAction] : undefined,
    source: sourceFilter ? [sourceFilter as EmpreendimentoAuditSource] : undefined,
  }), [search, entityFilter, actionFilter, sourceFilter]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await empreendimentoAuditService.list(empreendimentoId, { ...filters, limit: PAGE_SIZE });
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('[HistoricoTab] erro ao carregar o histórico:', err);
      setError('Não foi possível carregar o histórico. Verifique se a migration 20270839000000 foi aplicada.');
      setLogs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId, filters]);

  React.useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await empreendimentoAuditService.list(empreendimentoId, {
        ...filters, limit: PAGE_SIZE, offset: logs.length,
      });
      setLogs(prev => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('[HistoricoTab] erro ao carregar mais eventos:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const sorted = React.useMemo(() => {
    const col = tableColumns.sortColumn;
    if (!col) return logs;
    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
    const key = (l: EmpreendimentoAuditLog): string => {
      switch (col) {
        case 'user': return l.user_email ?? '';
        case 'entity': return auditEntityLabel(l.entity_type);
        case 'action': return auditActionLabel(l.action);
        case 'field': return auditFieldLabel(l.field_name);
        case 'source': return auditSourceLabel(l.source);
        default: return l.created_at;
      }
    };
    return [...logs].sort((a, b) => key(a).localeCompare(key(b), 'pt-BR') * dir);
  }, [logs, tableColumns.sortColumn, tableColumns.sortDirection]);

  return (
    <div className="space-y-6">
      {/* Banner de erro fica FORA do card acoplado — dentro quebraria a costura (§5.2). */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-[10px] p-4 text-sm font-normal text-red-700">
          {error}
        </div>
      )}

      {/* Toolbar acoplada à tabela — §5.2 */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-2 border-b border-gray-100 bg-white">
          <div className="flex flex-col md:flex-row gap-2.5 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por entidade, campo ou usuário..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <select
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="">Todas as entidades</option>
              {(Object.keys(ENTITY_LABELS) as EmpreendimentoAuditEntity[]).map(k => (
                <option key={k} value={k}>{ENTITY_LABELS[k]}</option>
              ))}
            </select>

            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="">Todas as ações</option>
              {(Object.keys(ACTION_LABELS) as EmpreendimentoAuditAction[]).map(k => (
                <option key={k} value={k}>{ACTION_LABELS[k]}</option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="">Todas as origens</option>
              {(Object.keys(SOURCE_LABELS) as EmpreendimentoAuditSource[]).map(k => (
                <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
              ))}
            </select>

            <button
              onClick={load}
              className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              <ColumnConfigButton
                columns={COLUMNS}
                visibleColumns={tableColumns.visibleColumns}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={tableColumns.toggleColumn}
                onReset={tableColumns.resetColumns}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum evento registrado</h3>
            {/* Empreendimento anterior à migration nasce com histórico vazio — sem
                esta frase, a aba parece quebrada. */}
            <p className="text-sm text-gray-500">
              As alterações passam a ser registradas a partir de agora.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    {tableColumns.orderedVisibleColumns.map(key => {
                      const def = HISTORICO_COLUMN_HEADERS[key];
                      if (!def) return null;
                      return (
                        <SortableHeader
                          key={key}
                          colKey={key}
                          label={def.label}
                          sortable={def.sortable !== false}
                          uppercase={false}
                          sortColumn={tableColumns.sortColumn}
                          sortDirection={tableColumns.sortDirection}
                          onSort={tableColumns.handleColumnSort}
                          onMoveColumn={tableColumns.moveColumn}
                          className={def.className}
                        />
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sorted.map(log => (
                    <tr
                      key={log.id}
                      onClick={() => setSelected(log)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    >
                      {tableColumns.orderedVisibleColumns.map(key => (
                        <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                          {renderHistoricoCell(key, log)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="p-4 border-t border-gray-100 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 h-9 rounded-[6px] hover:bg-blue-50 transition-all disabled:opacity-50"
                >
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detalhe do evento — painel lateral (UI_PATTERNS: Sheet, não modal). */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} size="lg">
        {selected && (
          <>
            <SheetHeader onClose={() => setSelected(null)}>
              <SheetTitle>{auditActionLabel(selected.action)} · {auditEntityLabel(selected.entity_type)}</SheetTitle>
              <SheetDescription>{formatDateTime(selected.created_at)}</SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Usuário</p>
                  <p className="text-sm font-normal text-gray-700">{selected.user_email || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Origem</p>
                  <p className="text-sm font-normal text-gray-700">{auditSourceLabel(selected.source)}</p>
                </div>
                {selected.entity_label && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Registro</p>
                    <p className="text-sm font-normal text-gray-700">{selected.entity_label}</p>
                  </div>
                )}
                {selected.field_name && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Campo</p>
                      <p className="text-sm font-normal text-gray-700">{auditFieldLabel(selected.field_name)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Valor anterior</p>
                        <p className="text-sm font-normal text-gray-700 break-words">{formatValue(selected.old_value)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Valor novo</p>
                        <p className="text-sm font-normal text-gray-700 break-words">{formatValue(selected.new_value)}</p>
                      </div>
                    </div>
                  </>
                )}
                {selected.reason && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Motivo</p>
                    <p className="text-sm font-normal text-gray-700">{selected.reason}</p>
                  </div>
                )}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Detalhes</p>
                    <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-3 space-y-1">
                      {Object.entries(selected.metadata).map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-normal text-gray-500">{k}</span>
                          <span className="text-sm font-normal text-gray-700 text-right break-words">{formatValue(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SheetPanel>
          </>
        )}
      </Sheet>
    </div>
  );
};

export default HistoricoTab;
