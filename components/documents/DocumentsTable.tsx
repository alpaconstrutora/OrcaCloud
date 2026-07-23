import React from 'react';
import { FileText, FileSpreadsheet, Image as ImageIcon, Briefcase, Lock } from 'lucide-react';
import { SortableHeader, useTableColumns } from '../ui/TableUtils';
import { OpuraDocument } from '../../types';

/** Subconjunto do retorno de `useTableColumns` que a tabela precisa — cada tela
 * cria seu próprio hook (chave de persistência própria) e repassa aqui. */
type TableColumnsState = Pick<
  ReturnType<typeof useTableColumns>,
  'visibleColumns' | 'sortColumn' | 'sortDirection' | 'handleColumnSort'
>;

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
}) => {
  const { visibleColumns, sortColumn, sortDirection, handleColumnSort } = tableColumns;

  return (
    <div className="bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
            <tr>
              {visibleColumns.includes('nome') && (
                <SortableHeader colKey="nome" label="Documento" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
              )}

              {dynamicColumns.map((col, idx) => (
                <th key={`dyn-head-${idx}`} className="px-6 py-2 border-r border-gray-100 text-left text-table-header font-semibold text-gray-500 whitespace-nowrap">
                  {getDynamicColumnLabel ? getDynamicColumnLabel(col) : col}
                </th>
              ))}

              {visibleColumns.includes('autor') && (
                <SortableHeader colKey="autor" label="Autor" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('tipo_documento') && (
                <SortableHeader colKey="tipo_documento" label="Tipo / Categoria" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('project_id') && (
                <SortableHeader colKey="project_id" label="Obra Vinculada" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('data_emissao') && (
                <SortableHeader colKey="data_emissao" label="Emissão" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('data_validade') && showValidade && (
                <SortableHeader colKey="data_validade" label="Validade" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('status') && (
                <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
              )}
              {visibleColumns.includes('actions') && (
                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 whitespace-nowrap">Ações</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + dynamicColumns.length} className="px-6 py-20 text-center">
                  {emptyState ?? DEFAULT_EMPTY_STATE}
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const { statusColor, statusLabel } = getDocumentStatusPresentation(doc.status);
                return (
                  <tr
                    key={doc.id}
                    className={`hover:bg-blue-50/50 transition-colors group ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={onRowClick ? () => onRowClick(doc) : undefined}
                  >
                    {visibleColumns.includes('nome') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {doc.active_version ? renderFileIcon(doc.active_version.mime_type, doc.active_version.storage_path) : <FileText className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900 block truncate">{doc.nome}</span>
                            {doc.descricao && <span className="text-xs text-gray-400 block truncate mt-0.5">{doc.descricao}</span>}
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
