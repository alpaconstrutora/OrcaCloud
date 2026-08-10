import React from 'react';
import { FileText, FileSpreadsheet, Image as ImageIcon, Briefcase, Lock } from 'lucide-react';
import { SortableHeader, useTableColumns, useResizableColumns } from '../ui/TableUtils';
import { OpuraDocument } from '../../types';

/** Subconjunto do retorno de `useTableColumns` que a tabela precisa — cada tela
 * cria seu próprio hook (chave de persistência própria) e repassa aqui.
 * `orderedVisibleColumns`/`moveColumn` habilitam o drag-and-drop de colunas (estilo
 * ClickUp, ver GUIA_TABLE_UTILS.md) — todo chamador já os tem, pois passa o retorno
 * inteiro de `useTableColumns(...)`, então isto é aditivo (não quebra ninguém). */
type TableColumnsState = Pick<
  ReturnType<typeof useTableColumns>,
  'visibleColumns' | 'sortColumn' | 'sortDirection' | 'handleColumnSort' | 'orderedVisibleColumns' | 'moveColumn'
>;

/** Resize/autofit (§6.1) — opcional: quem não passar `cols` mantém o comportamento
 * anterior (sem redimensionamento), sem quebrar as telas que ainda não migraram. */
type ResizableColumnsState = ReturnType<typeof useResizableColumns>;

/**
 * Ícone por tipo de arquivo (extraído de `OpuraDocsModule.tsx` — GED). Compartilhado
 * para que a coluna "Documento" fique idêntica em qualquer tela que use `<DocumentsTable>`.
 */
export const renderFileIcon = (mime: string, name?: string) => {
  if (!name) return <FileText className="w-8 h-8 text-gray-400" />;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="w-8 h-8 text-rose-500" />;
  if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="w-8 h-8 text-emerald-600" />;
  if (ext === 'docx' || ext === 'doc') return <FileText className="w-8 h-8 text-blue-600" />;
  if (ext === 'dwg') return <Briefcase className="w-8 h-8 text-amber-600" />;
  if (['png', 'jpg', 'jpeg'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-violet-500" />;
  return <FileText className="w-8 h-8 text-gray-400" />;
};

/** Cor/rótulo do status de um documento (mesma regra do GED). */
export const getDocumentStatusPresentation = (status: OpuraDocument['status']) => {
  const statusColor = status === 'vencido' ? 'text-red-600' : status === 'alerta' ? 'text-amber-600' : 'text-green-600';
  const statusLabel = status === 'vencido' ? 'Vencido' : status === 'alerta' ? 'Em Alerta' : 'Ativo';
  return { statusColor, statusLabel };
};

export interface DocumentsTableProps {
  documents: OpuraDocument[];
  /** Estado de colunas/ordenação — cada tela chama seu próprio `useTableColumns(COLUMNS, 'chave')`. */
  tableColumns: TableColumnsState;
  /** GED oculta "Validade" na aba Engenharia; o Portal do Parceiro pode sempre exibir. */
  showValidade?: boolean;
  /** Resolve o texto da coluna "Obra Vinculada". Sem obras (ex: portal do parceiro) → retorna '-'. */
  resolveProjectName?: (doc: OpuraDocument) => string;
  /** Colunas extras derivadas de naming_mask de pasta (só o GED usa). */
  dynamicColumns?: string[];
  getDynamicColumnLabel?: (col: string) => string;
  getDynamicCellValue?: (doc: OpuraDocument, col: string) => string;
  /** Clique na linha (GED abre o painel de versões). Omitir desativa o clique/cursor-pointer. */
  onRowClick?: (doc: OpuraDocument) => void;
  /** Render prop da coluna Ações — cada consumidor decide o que pode ser feito com o documento. */
  renderActions: (doc: OpuraDocument) => React.ReactNode;
  /** Estado vazio quando não há documento algum (antes de aplicar filtros). */
  emptyState?: React.ReactNode;

  // ─── Seleção em lote (opt-in — omitir mantém o comportamento atual, ex: Portal
  // do Parceiro não usa nenhuma destas props e continua sem coluna de checkbox) ───
  /** Ativa a coluna de checkbox (cabeçalho + linhas). */
  selectable?: boolean;
  selectedIds?: Set<string>;
  /** Documentos integrados de outro módulo ou travados por outra pessoa não entram na seleção. */
  isRowSelectable?: (doc: OpuraDocument) => boolean;
  /** `index` é a posição na lista renderizada — usada para o intervalo de Shift+clique (§10.1). */
  onToggleRow?: (doc: OpuraDocument, index: number, shiftKey: boolean) => void;
  allSelectableSelected?: boolean;
  onToggleAll?: () => void;

  /** §6.1/§6.1.2 — instância de `useResizableColumns` do chamador. Omitir mantém a
   * tabela sem redimensionamento/autofit (comportamento anterior, ainda usado por
   * quem não migrou). */
  cols?: ResizableColumnsState;
}

const DEFAULT_EMPTY_STATE = (
  <div className="text-sm text-slate-400 font-medium">Nenhum documento encontrado.</div>
);

/** Metadados de header por coluna "fixa" (declarada no `ColumnConfig` de cada tela) —
 * usados para renderizar o `<thead>`/`<colgroup>` a partir de `orderedVisibleColumns`
 * (ordem que o usuário arrasta) em vez de uma sequência fixa de JSX. As colunas
 * dinâmicas (máscara de pasta, só o GED usa) não entram aqui — ver `dynamicColumns`. */
const DOCUMENTS_TABLE_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  nome: { label: 'Documento', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  descricao: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  autor: { label: 'Autor', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  tipo_documento: { label: 'Tipo / Categoria', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  project_id: { label: 'Obra Vinculada', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  data_emissao: { label: 'Emissão', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  data_validade: { label: 'Validade', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

/** className completo do `<td>` por coluna fixa — mantém as variações originais
 * (min-w/max-w/truncate/whitespace) que afetam o layout da célula, não só a cor do texto. */
const DOCUMENTS_TABLE_CELL_CLASS: Record<string, string> = {
  nome: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 min-w-[200px]',
  descricao: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 max-w-[260px] truncate',
  autor: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600',
  tipo_documento: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600',
  project_id: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600',
  data_emissao: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap',
  data_validade: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap',
  status: 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal',
};

/** Conteúdo de cada <td> de coluna fixa — extraído para função pura para que o
 * <tbody> possa mapear a ordem escolhida pelo usuário em vez de repetir um bloco
 * condicional fixo por coluna. */
function renderDocumentCell(
  key: string,
  doc: OpuraDocument,
  ctx: { resolveProjectName?: (doc: OpuraDocument) => string },
): React.ReactNode {
  switch (key) {
    case 'nome':
      return (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {doc.active_version ? renderFileIcon(doc.active_version.mime_type, doc.active_version.storage_path) : <FileText className="w-5 h-5 text-gray-400" />}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-gray-900 block truncate">{doc.nome}</span>
            {doc.locked_by && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 mt-0.5">
                <Lock className="w-3 h-3" />
                Em edição por {doc.locked_by_name || doc.locked_by} — V{doc.locked_version}
              </span>
            )}
          </div>
        </div>
      );
    case 'descricao':
      return doc.descricao || '-';
    case 'autor':
      return doc.autor || '-';
    case 'tipo_documento':
      return doc.tipo_documento;
    case 'project_id':
      return ctx.resolveProjectName ? ctx.resolveProjectName(doc) : '-';
    case 'data_emissao':
      return doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString() : '-';
    case 'data_validade':
      return doc.data_validade ? new Date(doc.data_validade).toLocaleDateString() : '-';
    case 'status': {
      const { statusColor, statusLabel } = getDocumentStatusPresentation(doc.status);
      return <span className={statusColor}>{statusLabel}</span>;
    }
    default:
      return null;
  }
}

/**
 * Tabela de documentos compartilhada entre a Gestão de Documentos (GED / ÒPURA Docs) e o
 * Portal do Parceiro — fonte única de layout: qualquer ajuste aqui reflete nos dois lugares.
 * Puramente apresentacional (sem fetch, sem estado de filtro) — extraída de
 * `OpuraDocsModule.tsx` (thead/tbody originais).
 */
export const DocumentsTable: React.FC<DocumentsTableProps> = ({
  documents,
  tableColumns,
  showValidade = true,
  resolveProjectName,
  dynamicColumns = [],
  getDynamicColumnLabel,
  getDynamicCellValue,
  onRowClick,
  renderActions,
  emptyState,
  selectable = false,
  selectedIds,
  isRowSelectable,
  onToggleRow,
  allSelectableSelected = false,
  onToggleAll,
  cols,
}) => {
  const { visibleColumns, sortColumn, sortDirection, handleColumnSort, orderedVisibleColumns, moveColumn } = tableColumns;

  // Colunas "fixas" (declaradas no ColumnConfig de cada tela) na ordem escolhida pelo
  // usuário (drag-and-drop) — exclui 'actions' (sempre fixa ao final) e 'data_validade'
  // quando a tela pediu para escondê-la (GED oculta na aba Engenharia).
  const coreOrderedKeys = orderedVisibleColumns.filter(k => k !== 'actions' && (k !== 'data_validade' || showValidade));
  // As colunas dinâmicas (máscara de pasta) não fazem parte de `columnOrder` — mudam por
  // pasta, não são um ColumnConfig fixo, então não podem ser arrastadas. Ficam ancoradas
  // logo após 'nome'/'descricao', na mesma posição visual que já tinham antes do drag.
  const anchorIdx = Math.max(coreOrderedKeys.lastIndexOf('nome'), coreOrderedKeys.lastIndexOf('descricao'));
  const beforeDynamicKeys = anchorIdx === -1 ? [] : coreOrderedKeys.slice(0, anchorIdx + 1);
  const afterDynamicKeys = anchorIdx === -1 ? coreOrderedKeys : coreOrderedKeys.slice(anchorIdx + 1);

  // §6.1 — só entra na conta quando `cols` foi passado (opt-in).
  const dataColKeys = [...beforeDynamicKeys, ...dynamicColumns, ...afterDynamicKeys];
  const tableWidth = cols
    ? (selectable ? 40 : 0) + dataColKeys.reduce((s, k) => s + cols.getWidth(k), 0) + (visibleColumns.includes('actions') ? cols.getWidth('actions') : 0)
    : undefined;

  const renderCoreHeader = (key: string) => {
    const def = DOCUMENTS_TABLE_COLUMN_HEADERS[key];
    if (!def) return null;
    return (
      <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
        sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort}
        onMoveColumn={moveColumn}
        className={def.className}>
        {cols && <cols.ResizeHandle colKey={key} />}
      </SortableHeader>
    );
  };

  return (
    <div className="bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table
          ref={cols?.tableRef}
          className={cols ? 'text-left border-collapse' : 'w-full text-left border-collapse'}
          style={cols ? { tableLayout: 'fixed', width: tableWidth } : undefined}
        >
          {cols && (
            <colgroup>
              {selectable && <col style={{ width: '40px' }} />}
              {beforeDynamicKeys.map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
              {dynamicColumns.map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
              {afterDynamicKeys.map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
              <col />
              {visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
            </colgroup>
          )}
          <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={allSelectableSelected}
                    onChange={onToggleAll}
                  />
                </th>
              )}
              {beforeDynamicKeys.map(renderCoreHeader)}

              {dynamicColumns.map((col, idx) => (
                <th key={`dyn-head-${idx}`} className="px-6 py-2 border-r border-gray-100 text-left text-table-header font-semibold text-gray-500 whitespace-nowrap relative overflow-hidden">
                  {getDynamicColumnLabel ? getDynamicColumnLabel(col) : col}
                  {cols && <cols.ResizeHandle colKey={col} />}
                </th>
              ))}

              {afterDynamicKeys.map(renderCoreHeader)}
              {cols && <th aria-hidden="true" className="border-r border-gray-100" />}
              {visibleColumns.includes('actions') && (
                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 whitespace-nowrap">Ações</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + dynamicColumns.length + (selectable ? 1 : 0) + (cols ? 1 : 0)} className="px-6 py-20 text-center">
                  {emptyState ?? DEFAULT_EMPTY_STATE}
                </td>
              </tr>
            ) : (
              documents.map((doc, rowIndex) => {
                const rowSelectable = !selectable || !isRowSelectable || isRowSelectable(doc);
                const renderCoreTd = (key: string) => (
                  <td key={key} className={DOCUMENTS_TABLE_CELL_CLASS[key] ?? 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600'}
                    title={key === 'descricao' ? (doc.descricao || undefined) : undefined}>
                    {renderDocumentCell(key, doc, { resolveProjectName })}
                  </td>
                );
                return (
                  <tr
                    key={doc.id}
                    className={`hover:bg-blue-50/50 transition-colors group ${onRowClick ? 'cursor-pointer' : ''} ${selectedIds?.has(doc.id) ? 'bg-blue-50/60' : ''}`}
                    onClick={onRowClick ? () => onRowClick(doc) : undefined}
                  >
                    {selectable && (
                      <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={rowSelectable ? undefined : 'Este documento não pode ser incluído na edição em lote (integrado de outro módulo ou bloqueado por outra pessoa).'}
                          checked={selectedIds?.has(doc.id) ?? false}
                          disabled={!rowSelectable}
                          onChange={(e) => onToggleRow?.(doc, rowIndex, (e.nativeEvent as MouseEvent).shiftKey)}
                        />
                      </td>
                    )}
                    {beforeDynamicKeys.map(renderCoreTd)}

                    {dynamicColumns.map((col, idx) => (
                      <td key={`dyn-body-${doc.id}-${idx}`} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 whitespace-nowrap bg-slate-50/30">
                        {getDynamicCellValue ? getDynamicCellValue(doc, col) : '-'}
                      </td>
                    ))}

                    {afterDynamicKeys.map(renderCoreTd)}
                    {cols && <td aria-hidden="true"></td>}
                    {visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {renderActions(doc)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DocumentsTable;
