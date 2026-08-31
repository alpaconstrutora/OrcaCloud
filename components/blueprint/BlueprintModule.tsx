import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, PencilRuler, Loader2, AlertCircle, Search, MoveHorizontal } from 'lucide-react';
import { useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { archiveStudy, createStudy, duplicateStudy, listBranches, listStudies } from '../../services/blueprintService';
import type { BlueprintStudy } from '../../types/blueprint';
import BlueprintEditor from './BlueprintEditor';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import {
  ColumnConfig,
  useTableColumns,
  useResizableColumns,
  ColumnConfigButton,
  SortableHeader,
  usePersistedState,
} from '../ui/TableUtils';

const COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'updated_at', label: 'Atualizada em', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = { name: 340, status: 140, updated_at: 160, actions: 100 };

const StatusBadge = ({ status }: { status: BlueprintStudy['status'] }) => (
  <span className={`text-sm font-normal ${status === 'PUBLICADO' ? 'text-emerald-700' : 'text-gray-600'}`}>
    {status === 'PUBLICADO' ? 'Publicada' : 'Rascunho'}
  </span>
);

/**
 * Planta Inteligente — lista de estudos e entrada no editor (épico E3).
 *
 * Organização: o seletor do topo é a autoridade (ver hooks/useOrgContext.tsx).
 * Na LEITURA, `orgId === null` significa "Todas" e vai direto ao service sem
 * filtro, deixando a RLS recortar — nunca bloquear a tela por causa de null.
 * Na ESCRITA, `resolveWriteOrg` decide: com uma organização no topo usa ela sem
 * perguntar; em "Todas" abre o modal.
 */
export default function BlueprintModule() {
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();

  const [studies, setStudies] = useState<BlueprintStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<{ study: BlueprintStudy; branchId: string } | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedState<string>('blueprintModule:search', '');

  const tableColumns = useTableColumns(COLUMNS, 'blueprintModuleColumns');
  const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'blueprintModuleColWidths');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setStudies(await listStudies(orgId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar() {
    // Modo 'single': uma planta pertence a uma organização por natureza. Não faz
    // sentido replicar o mesmo desenho em várias, então o modal nem oferece
    // "Todas" — é o caso 4 da regra em hooks/useOrgContext.tsx.
    const alvo = await resolveWriteOrg('single');
    if (!alvo) return; // usuário cancelou o modal

    // 'single' só devolve `{ kind: 'org' }`; o ramo 'all' existe para satisfazer
    // o tipo da união. Sem checagem de falsidade depois disto — o guard do CI
    // proíbe a forma `if (!organizationId) return`, e com razão: é exatamente ela
    // que deixa a tela em branco quando o topo está em "Todas".
    const organizationId = alvo.kind === 'org' ? alvo.orgId : alvo.orgIds[0];

    setCriando(true);
    setErro(null);
    try {
      const { study, branch } = await createStudy({
        organizationId,
        name: `Planta ${new Date().toLocaleDateString('pt-BR')}`,
      });
      // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
      setStudies((atual) => [study, ...atual]);
      setAberto({ study, branchId: branch.id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriando(false);
    }
  }

  async function abrir(study: BlueprintStudy) {
    setErro(null);
    try {
      const branches = await listBranches(study.id);
      const principal = branches.find((b) => b.name === 'principal') ?? branches[0];
      if (!principal) {
        setErro('Este estudo não tem ramo de trabalho. Crie um novo estudo.');
        return;
      }
      setAberto({ study, branchId: principal.id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function duplicar(study: BlueprintStudy) {
    setErro(null);
    try {
      const copia = await duplicateStudy(study.id);
      // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
      setStudies((atual) => [copia, ...atual]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function excluir(study: BlueprintStudy) {
    setErro(null);
    try {
      await archiveStudy(study.id);
      setStudies((atual) => atual.filter((s) => s.id !== study.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const filteredStudies = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    const base = termo ? studies.filter((s) => s.name.toLowerCase().includes(termo)) : studies;

    if (!tableColumns.sortColumn) return base;
    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (tableColumns.sortColumn) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'updated_at':
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
        default:
          return 0;
      }
    });
  }, [studies, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

  const tableTotalWidth = COLUMNS.reduce(
    (sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0),
    0,
  );

  if (aberto) {
    return (
      <BlueprintEditor
        study={aberto.study}
        branchId={aberto.branchId}
        onBack={() => {
          setAberto(null);
          carregar();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Planta Inteligente</h1>
          <p className="mt-1.5 text-sm text-gray-400 font-medium">
            Desenhe paredes e o sistema deriva os ambientes, as áreas e os perímetros.
            Publicar cria uma versão imutável, endereçável por hash.
          </p>
        </div>
        <button
          type="button"
          onClick={criar}
          disabled={criando}
          className="flex shrink-0 items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:bg-gray-300"
        >
          {criando ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Plus className="h-[15px] w-[15px]" />}
          Nova planta
        </button>
      </div>

      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Carregando estudos…</p>
        </div>
      ) : studies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
          <PencilRuler className="mx-auto h-8 w-8 text-gray-300" />
          <h3 className="mt-3 text-lg font-bold text-gray-900">Nenhuma planta ainda</h3>
          <p className="mt-1 text-sm text-gray-500">Crie a primeira para começar a desenhar.</p>
        </div>
      ) : (
        <div>
          {/* Toolbar desaninhada (§5.1) — só busca + configuração de colunas: a tela não tem grid/lista nem filtros de escopo. */}
          <div className="flex flex-col md:flex-row gap-2.5 items-center mb-3">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome da planta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              <ColumnConfigButton
                columns={COLUMNS.filter((c) => c.key !== 'actions')}
                visibleColumns={tableColumns.visibleColumns}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={tableColumns.toggleColumn}
                onReset={tableColumns.resetColumns}
              />
              {/* Ajustar largura ao conteúdo — §6.1.2 do guia. Ícone MoveHorizontal, neutro. */}
              <button
                onClick={() => cols.autoFit()}
                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                title="Ajustar largura das colunas ao conteúdo"
              >
                <MoveHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {filteredStudies.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
              <Search className="mx-auto h-8 w-8 text-gray-300" />
              <h3 className="mt-3 text-lg font-bold text-gray-900">Nenhuma planta encontrada</h3>
              <p className="mt-1 text-sm text-gray-500">Tente ajustar sua busca.</p>
            </div>
          ) : (
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  ref={cols.tableRef}
                  className="text-left border-collapse"
                  style={{ tableLayout: 'fixed', width: tableTotalWidth }}
                >
                  <colgroup>
                    {COLUMNS.filter((c) => c.key !== 'actions').map(
                      (c) =>
                        tableColumns.visibleColumns.includes(c.key) && (
                          <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
                        ),
                    )}
                    {/* espaçador — absorve a folga ANTES de Ações (§6.1.1) */}
                    <col />
                    {tableColumns.visibleColumns.includes('actions') && (
                      <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                    )}
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                      {tableColumns.visibleColumns.includes('name') && (
                        <SortableHeader
                          colKey="name"
                          label="Nome"
                          uppercase={false}
                          sortColumn={tableColumns.sortColumn}
                          sortDirection={tableColumns.sortDirection}
                          onSort={tableColumns.handleColumnSort}
                          className="px-6 py-2 border-r border-gray-100 overflow-hidden"
                        >
                          <cols.ResizeHandle colKey="name" />
                        </SortableHeader>
                      )}
                      {tableColumns.visibleColumns.includes('status') && (
                        <SortableHeader
                          colKey="status"
                          label="Status"
                          uppercase={false}
                          sortColumn={tableColumns.sortColumn}
                          sortDirection={tableColumns.sortDirection}
                          onSort={tableColumns.handleColumnSort}
                          className="px-6 py-2 border-r border-gray-100 overflow-hidden"
                        >
                          <cols.ResizeHandle colKey="status" />
                        </SortableHeader>
                      )}
                      {tableColumns.visibleColumns.includes('updated_at') && (
                        <SortableHeader
                          colKey="updated_at"
                          label="Atualizada em"
                          uppercase={false}
                          sortColumn={tableColumns.sortColumn}
                          sortDirection={tableColumns.sortDirection}
                          onSort={tableColumns.handleColumnSort}
                          className="px-6 py-2 border-r border-gray-100 overflow-hidden"
                        >
                          <cols.ResizeHandle colKey="updated_at" />
                        </SortableHeader>
                      )}
                      <th aria-hidden="true" className="border-r border-gray-100"></th>
                      {tableColumns.visibleColumns.includes('actions') && (
                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredStudies.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                        onClick={() => abrir(s)}
                      >
                        {tableColumns.visibleColumns.includes('name') && (
                          <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                            <div className="flex items-center gap-2 min-w-0">
                              <PencilRuler className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="block truncate" title={s.name}>{s.name}</span>
                            </div>
                          </td>
                        )}
                        {tableColumns.visibleColumns.includes('status') && (
                          <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                            <StatusBadge status={s.status} />
                          </td>
                        )}
                        {tableColumns.visibleColumns.includes('updated_at') && (
                          <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                            {new Date(s.updated_at).toLocaleDateString('pt-BR')}
                          </td>
                        )}
                        <td aria-hidden="true"></td>
                        {tableColumns.visibleColumns.includes('actions') && (
                          <td className="px-6 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <ActionIconButton kind="edit" onClick={() => abrir(s)} />
                              <ActionIconButton kind="duplicate" onClick={() => duplicar(s)} />
                              <InlineDisclosureMenu showDelete onDelete={() => excluir(s)} />
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
        </div>
      )}

      {orgTargetModal}
    </div>
  );
}
