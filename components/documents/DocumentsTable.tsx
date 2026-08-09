import React from 'react';
import { FileText, FileSpreadsheet, Image as ImageIcon, Briefcase, Lock } from 'lucide-react';
import { SortableHeader, useTableColumns, useResizableColumns } from '../ui/TableUtils';
import { OpuraDocument } from '../../types';

/** Subconjunto do retorno de `useTableColumns` que a tabela precisa — cada tela
 * cria seu próprio hook (chave de persistência própria) e repassa aqui. */
type TableColumnsState = Pick<
  ReturnType<typeof useTableColumns>,
  'visibleColumns' | 'sortColumn' | 'sortDirection' | 'handleColumnSort'
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
  const { visibleColumns, sortColumn, sortDirection, handleColumnSort } = tableColumns;

  // §6.1 — só entra na conta quando `cols` foi passado (opt-in).
  const dataColKeys = ['nome', 'descricao', ...dynamicColumns, 'autor', 'tipo_documento', 'project_id',
    ...(showValidade ? ['data_validade'] : []), 'data_emissao', 'status']
    .filter(k => visibleColumns.includes(k) || dynamicColumns.includes(k));
  const tableWidth = cols
    ? (selectable ? 40 : 0) + dataColKeys.reduce((s, k) => s + cols.getWidth(k), 0) + (visibleColumns.includes('actions') ? cols.getWidth('actions') : 0)
    : undefined;

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
              {dataColKeys.map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
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
              {visibleColumns.includes('nome') && (
                <SortableHeader colKey="nome" label="Documento" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="nome" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('descricao') && (
                <SortableHeader colKey="descricao" label="Descrição" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="descricao" />}
                </SortableHeader>
              )}

              {dynamicColumns.map((col, idx) => (
                <th key={`dyn-head-${idx}`} className="px-6 py-2 border-r border-gray-100 text-left text-table-header font-semibold text-gray-500 whitespace-nowrap relative overflow-hidden">
                  {getDynamicColumnLabel ? getDynamicColumnLabel(col) : col}
                  {cols && <cols.ResizeHandle colKey={col} />}
                </th>
              ))}

              {visibleColumns.includes('autor') && (
                <SortableHeader colKey="autor" label="Autor" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="autor" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('tipo_documento') && (
                <SortableHeader colKey="tipo_documento" label="Tipo / Categoria" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="tipo_documento" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('project_id') && (
                <SortableHeader colKey="project_id" label="Obra Vinculada" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="project_id" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('data_emissao') && (
                <SortableHeader colKey="data_emissao" label="Emissão" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="data_emissao" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('data_validade') && showValidade && (
                <SortableHeader colKey="data_validade" label="Validade" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="data_validade" />}
                </SortableHeader>
              )}
              {visibleColumns.includes('status') && (
                <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden">
                  {cols && <cols.ResizeHandle colKey="status" />}
                </SortableHeader>
              )}
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
                const { statusColor, statusLabel } = getDocumentStatusPresentation(doc.status);
                const rowSelectable = !selectable || !isRowSelectable || isRowSelectable(doc);
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
                    {visibleColumns.includes('nome') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 min-w-[200px]">
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
                      </td>
                    )}
                    {visibleColumns.includes('descricao') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 max-w-[260px] truncate" title={doc.descricao || undefined}>
                        {doc.descricao || '-'}
                      </td>
                    )}

                    {dynamicColumns.map((col, idx) => (
                      <td key={`dyn-body-${doc.id}-${idx}`} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 whitespace-nowrap bg-slate-50/30">
                        {getDynamicCellValue ? getDynamicCellValue(doc, col) : '-'}
                      </td>
                    ))}

                    {visibleColumns.includes('autor') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                        {doc.autor || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('tipo_documento') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                        {doc.tipo_documento}
                      </td>
                    )}
                    {visibleColumns.includes('project_id') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                        {resolveProjectName ? resolveProjectName(doc) : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('data_emissao') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                        {doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('data_validade') && showValidade && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                        {doc.data_validade ? new Date(doc.data_validade).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('status') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                        <span className={statusColor}>{statusLabel}</span>
                      </td>
                    )}
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
