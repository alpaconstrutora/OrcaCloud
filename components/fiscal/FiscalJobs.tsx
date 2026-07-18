import { useState, useEffect, useCallback, useRef } from 'react';
import { ListChecks, Search, AlertTriangle, RotateCw, Zap, Archive, X } from 'lucide-react';
import { listProcessingJobs, replayDeadLetter, dismissDeadLetter, listParsingErrors } from '../../services/nfeService';
import type { ProcessingJobWithDoc, ParsingError } from '../../types/fiscal';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import FiscalDeadLetterLoteModal from './FiscalDeadLetterLoteModal';

interface Props {
  organizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'text-gray-500',
  processing: 'text-amber-600',
  parsed: 'text-purple-600',
  normalized: 'text-teal-600',
  completed: 'text-emerald-700',
  failed: 'text-red-600',
  dead_letter: 'text-rose-700',
  duplicated: 'text-gray-400',
};

function StatusText({ job }: { job: ProcessingJobWithDoc }) {
  if (job.dismissed_at) return <span className="text-sm font-normal text-gray-400">arquivado</span>;
  return <span className={`text-sm font-normal ${STATUS_COLORS[job.status] ?? 'text-gray-600'}`}>{job.status.replace('_', ' ')}</span>;
}

const RUNBOOK = [
  {
    trigger: 'Dead letter cresce',
    action: 'Verificar parsing_errors. Se data_failure: corrigir XML e replay manual. Se technical_failure: verificar Storage/Edge Function.',
  },
  {
    trigger: 'Webhook silencioso',
    action: 'Fallback polling detecta jobs queued > 2 min. Edge Function é disparada automaticamente a cada 2 min via cron.',
  },
  {
    trigger: 'Retry explodindo',
    action: 'Verificar error_code. Falhas técnicas recorrentes indicam problema de infra. Verificar Storage e Edge Function logs.',
  },
  {
    trigger: 'NF duplicada',
    action: 'Sistema detecta por access_key e source_hash. Job finaliza como duplicated automaticamente. Não requer ação manual.',
  },
] as const;

const COLUMNS: ColumnConfig[] = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'document', label: 'Documento', sortable: true },
  { key: 'type', label: 'Tipo', sortable: true },
  { key: 'retries', label: 'Retries', sortable: true },
  { key: 'failure', label: 'Falha', sortable: true },
  { key: 'error', label: 'Erro', sortable: true },
  { key: 'duration', label: 'Duração', sortable: true },
  { key: 'actions', label: 'Ação', sortable: false },
];

export function FiscalJobs({ organizationId, onToast }: Props) {
  const [jobs, setJobs] = useState<ProcessingJobWithDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [replaying, setReplaying] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedState<string>('fiscalJobs:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'fiscalJobsColumns');
  const confirm = useConfirm();

  const [selectedJob, setSelectedJob] = useState<ProcessingJobWithDoc | null>(null);
  const [parsingErrors, setParsingErrors] = useState<ParsingError[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissing, setDismissing] = useState(false);

  // Seleção em lote (modelo: BoletoManager)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loteAction, setLoteAction] = useState<'replay' | 'dismiss' | null>(null);
  const [loteJobs, setLoteJobs] = useState<ProcessingJobWithDoc[]>([]);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const shiftHeldRef = useRef(false);

  const loadJobs = useCallback(() => {
    setLoading(true);
    listProcessingJobs(organizationId)
      .then(setJobs)
      .catch(() => onToast('Erro ao carregar jobs', 'err'))
      .finally(() => setLoading(false));
  }, [organizationId, onToast]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!selectedJob) { setParsingErrors([]); return; }
    setErrorsLoading(true);
    listParsingErrors(selectedJob.id)
      .then(setParsingErrors)
      .catch(() => onToast('Erro ao carregar detalhes da falha', 'err'))
      .finally(() => setErrorsLoading(false));
  }, [selectedJob, onToast]);

  const handleReplay = async (jobId: string) => {
    setReplaying(jobId);
    try {
      await replayDeadLetter(jobId);
      onToast('Job enviado para replay com sucesso', 'ok');
      setSelectedJob(null);
      loadJobs();
    } catch (err: any) {
      onToast(err.message ?? 'Erro ao fazer replay', 'err');
    } finally {
      setReplaying(null);
    }
  };

  // Gap: Replay reprocessa o MESMO XML sem alteração — inútil (e enganoso)
  // para data_failure, que só se resolve com um XML corrigido. Avisa antes.
  const handleReplayClick = async (job: ProcessingJobWithDoc) => {
    if (job.failure_type === 'data_failure') {
      const ok = await confirm({
        title: 'Replay não corrige dados inválidos',
        message: 'Este job falhou por problema no conteúdo do XML (data_failure). O Replay reprocessa o MESMO arquivo, sem nenhuma alteração — se o defeito continuar no XML, o job vai cair em dead letter de novo pelo mesmo motivo.\n\nSó prossiga se o arquivo já foi substituído por fora do sistema. Caso contrário, oriente o cliente a reenviar o XML corrigido — o novo upload dispara o replay automaticamente.',
        variant: 'warning',
        confirmLabel: 'Fazer replay mesmo assim',
      });
      if (!ok) return;
    }
    handleReplay(job.id);
  };

  // Gap: não havia como marcar um dead letter como "já tratado" (ex: cliente
  // reenviou XML corrigido por fora do fluxo automático) — o job antigo
  // ficava órfão na fila para sempre. Arquivar tira da fila ativa sem apagar
  // o histórico (dismissed_at fica registrado, status continua dead_letter).
  const handleDismiss = async (job: ProcessingJobWithDoc) => {
    const ok = await confirm({
      title: 'Arquivar job de dead letter?',
      message: 'O job sai da fila ativa de dead letter. Use isto quando o problema já foi resolvido fora do sistema (ex: o cliente reenviou o XML corrigido por e-mail e você já tratou manualmente). O histórico é mantido — não é uma exclusão.',
      variant: 'warning',
      confirmLabel: 'Arquivar job',
    });
    if (!ok) return;

    setDismissing(true);
    try {
      await dismissDeadLetter(job.id, dismissReason.trim() || undefined);
      onToast('Job arquivado', 'ok');
      setSelectedJob(null);
      setDismissReason('');
      loadJobs();
    } catch (err: any) {
      onToast(err.message ?? 'Erro ao arquivar job', 'err');
    } finally {
      setDismissing(false);
    }
  };

  const activeDeadLetter = (j: ProcessingJobWithDoc) => j.status === 'dead_letter' && !j.dismissed_at;

  const counts = {
    all: jobs.length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    dead_letter: jobs.filter(activeDeadLetter).length,
    archived: jobs.filter(j => !!j.dismissed_at).length,
  };

  const FILTERS = [
    { k: 'all', label: 'Todos', count: counts.all },
    { k: 'completed', label: 'Concluídos', count: counts.completed },
    { k: 'failed', label: 'Com falha', count: counts.failed },
    { k: 'dead_letter', label: 'Dead letter', count: counts.dead_letter },
    { k: 'archived', label: 'Arquivados', count: counts.archived },
  ];

  const duration = (job: ProcessingJobWithDoc) => {
    if (!job.started_at || !job.finished_at) return null;
    return (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000;
  };
  const durationLabel = (job: ProcessingJobWithDoc) => {
    const s = duration(job);
    return s === null ? '—' : `${s.toFixed(1)}s`;
  };

  const term = searchTerm.trim().toLowerCase();
  const filtered = jobs.filter(j => {
    if (filter === 'archived') { if (!j.dismissed_at) return false; }
    else if (filter === 'dead_letter') { if (!activeDeadLetter(j)) return false; }
    else if (filter !== 'all' && j.status !== filter) return false;
    if (term && !(j.raw_document?.access_key ?? '').toLowerCase().includes(term) && !j.id.toLowerCase().includes(term)) return false;
    return true;
  });

  const shown = [...filtered].sort((a, b) => {
    if (tableColumns.sortColumn) {
      const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
      switch (tableColumns.sortColumn) {
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'document': return (a.raw_document?.access_key ?? '').localeCompare(b.raw_document?.access_key ?? '') * dir;
        case 'type': return a.job_type.localeCompare(b.job_type) * dir;
        case 'retries': return (a.retry_count - b.retry_count) * dir;
        case 'failure': return (a.failure_type ?? '').localeCompare(b.failure_type ?? '') * dir;
        case 'error': return (a.error_code ?? '').localeCompare(b.error_code ?? '') * dir;
        case 'duration': return ((duration(a) ?? -1) - (duration(b) ?? -1)) * dir;
      }
    }
    return b.created_at.localeCompare(a.created_at); // default: mais recente primeiro
  });

  // Só jobs em dead letter/falha ativos podem receber ação em lote (replay/arquivar).
  const selectable = (j: ProcessingJobWithDoc) =>
    (j.status === 'dead_letter' || j.status === 'failed') && !j.dismissed_at;
  const selectableShown = shown.filter(selectable);
  const selectableIndex = new Map(selectableShown.map((j, i) => [j.id, i]));
  const allSelected = selectableShown.length > 0 && selectableShown.every(j => selectedIds.has(j.id));

  const handleCheckboxMouseDown = useCallback((e: React.MouseEvent) => {
    shiftHeldRef.current = e.shiftKey;
  }, []);

  // Estável enquanto selectableShown não muda de identidade — o range usa a lista
  // visível (já filtrada/ordenada) de itens selecionáveis.
  const handleCheckboxChange = useCallback((checked: boolean, id: string, index: number) => {
    if (shiftHeldRef.current && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const rangeIds = selectableShown.slice(start, end + 1).map(j => j.id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        rangeIds.forEach(rid => (checked ? next.add(rid) : next.delete(rid)));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (checked) next.add(id); else next.delete(id);
        return next;
      });
    }
    lastSelectedIndexRef.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableShown]);

  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelectAll = () =>
    allSelected ? clearSelection() : setSelectedIds(new Set(selectableShown.map(j => j.id)));

  const selectedJobs = shown.filter(j => selectedIds.has(j.id));
  // Só dead_letter ativos podem ser arquivados (dismiss); replay aceita failed também.
  const dismissableSelected = selectedJobs.filter(activeDeadLetter);

  // Abre o modal com um snapshot dos jobs — não deriva da seleção viva, para que
  // o resultado (ok/errors) continue visível mesmo após loadJobs() recarregar a lista.
  function abrirLote(action: 'replay' | 'dismiss') {
    setLoteJobs(action === 'dismiss' ? dismissableSelected : selectedJobs);
    setLoteAction(action);
  }

  return (
    <div className="space-y-6">
      {/* Título vive no FiscalModule e muda com a aba ativa (§19.1) — não repetir aqui. */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-3">
        <KpiCard shadow={false} size="lg" className="col-span-2" label="Jobs totais" value={counts.all} icon={<ListChecks className="w-4 h-4" />} color="blue" />
        <KpiCard shadow={false} size="sm" label="Concluídos" value={counts.completed} icon={<Zap className="w-4 h-4" />} color="emerald" />
        <KpiCard shadow={false} size="sm" label="Falhas" value={counts.failed} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <KpiCard shadow={false} size="sm" label="Dead letter" value={counts.dead_letter} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
        <KpiCard shadow={false} size="sm" label="Arquivados" value={counts.archived} icon={<Archive className="w-4 h-4" />} color="gray" />
      </div>

      {counts.dead_letter > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <div className="text-sm font-bold text-red-700">{counts.dead_letter} documento(s) em dead letter</div>
            <div className="text-xs text-red-500 mt-0.5">Requerem revisão manual. NF-e com falha de dados não são reprocessadas automaticamente — abra "Ver detalhes" para decidir entre Replay e Arquivar.</div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2.5 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por chave de acesso ou ID do job..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <button onClick={loadJobs} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
          <RotateCw className="w-4 h-4" />
        </button>
        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
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

      <div className="inline-flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1">
        {FILTERS.map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${filter === f.k ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {f.label} <span className="opacity-60 text-xs ml-1">{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
          <ListChecks className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum job encontrado</h3>
          <p className="text-sm text-gray-500">Ajuste os filtros ou a busca.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableShown.length === 0}
                      title="Selecionar todos os jobs em dead letter/falha"
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:opacity-30"
                    />
                  </th>
                  {tableColumns.visibleColumns.includes('status') && (
                    <SortableHeader colKey="status" label="Status" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('document') && (
                    <SortableHeader colKey="document" label="Documento" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('type') && (
                    <SortableHeader colKey="type" label="Tipo" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('retries') && (
                    <SortableHeader colKey="retries" label="Retries" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('failure') && (
                    <SortableHeader colKey="failure" label="Falha" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('error') && (
                    <SortableHeader colKey="error" label="Erro" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('duration') && (
                    <SortableHeader colKey="duration" label="Duração" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ação</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shown.map(job => (
                  <tr key={job.id} className={`hover:bg-blue-50/50 transition-colors ${selectedIds.has(job.id) ? 'bg-blue-50/60' : ''}`}>
                    <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                      {selectable(job) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(job.id)}
                          title="Dica: segure Shift e clique para selecionar um intervalo"
                          onMouseDown={handleCheckboxMouseDown}
                          onChange={e => handleCheckboxChange(e.target.checked, job.id, selectableIndex.get(job.id) ?? 0)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      )}
                    </td>
                    {tableColumns.visibleColumns.includes('status') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0"><StatusText job={job} /></td>
                    )}
                    {tableColumns.visibleColumns.includes('document') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                        <div className="text-sm font-normal text-gray-700">{job.raw_document?.access_key?.substring(0, 20)}…</div>
                        <div className="text-xs text-gray-400 mt-0.5">{job.id}</div>
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('type') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{job.job_type}</td>
                    )}
                    {tableColumns.visibleColumns.includes('retries') && (
                      <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal ${job.retry_count >= job.max_retries ? 'text-red-600' : 'text-gray-600'}`}>
                        {job.retry_count}/{job.max_retries}
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('failure') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                        {job.failure_type
                          ? <span className={job.failure_type === 'data_failure' ? 'text-red-600' : 'text-amber-600'}>
                              {job.failure_type === 'data_failure' ? 'dados' : 'técnica'}
                            </span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('error') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                        {job.error_code
                          ? <span className="text-red-600">{job.error_code}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('duration') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{durationLabel(job)}</td>
                    )}
                    {tableColumns.visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            Ver detalhes
                          </button>
                          {(job.status === 'dead_letter' || job.status === 'failed') && !job.dismissed_at && (
                            <ActionIconButton
                              kind="history"
                              title="Replay"
                              icon={<RotateCw className={`w-4 h-4 ${replaying === job.id ? 'animate-spin' : ''}`} />}
                              disabled={replaying === job.id}
                              onClick={() => handleReplayClick(job)}
                            />
                          )}
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

      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-4 pb-2.5 border-b border-gray-100">Runbook operacional — respostas rápidas</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {RUNBOOK.map(({ trigger, action }) => (
            <div key={trigger} className="bg-gray-50 rounded-[10px] border border-gray-100 p-3.5">
              <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold mb-1.5">{trigger}</div>
              <div className="text-sm text-gray-600 leading-relaxed">{action}</div>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={!!selectedJob} onClose={() => { setSelectedJob(null); setDismissReason(''); }} size="lg">
        {selectedJob && (
          <>
            <SheetHeader onClose={() => { setSelectedJob(null); setDismissReason(''); }}>
              <SheetTitle>Job {selectedJob.id.substring(0, 8)}…</SheetTitle>
              <SheetDescription>{selectedJob.raw_document?.access_key ?? '—'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Status</div>
                  <StatusText job={selectedJob} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Tipo de falha</div>
                  <div className="text-sm font-normal text-gray-700">
                    {selectedJob.failure_type === 'data_failure' ? 'Dados (XML inválido)' : selectedJob.failure_type === 'technical_failure' ? 'Técnica (infra)' : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Retries</div>
                  <div className="text-sm font-normal text-gray-700">{selectedJob.retry_count}/{selectedJob.max_retries}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Código de erro</div>
                  <div className="text-sm font-normal text-gray-700">{selectedJob.error_code ?? '—'}</div>
                </div>
              </div>

              {selectedJob.error_message && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Mensagem de erro</div>
                  <div className="text-sm font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-[10px] p-3 whitespace-pre-wrap">{selectedJob.error_message}</div>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Histórico de falhas (parsing_errors)</div>
                {errorsLoading ? (
                  <div className="text-sm text-gray-400">Carregando…</div>
                ) : parsingErrors.length === 0 ? (
                  <div className="text-sm text-gray-400">Nenhum registro de falha detalhado para este job.</div>
                ) : (
                  <div className="space-y-2">
                    {parsingErrors.map(pe => (
                      <div key={pe.id} className="bg-gray-50 border border-gray-100 rounded-[10px] p-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span className="font-semibold text-red-600">{pe.error_code}</span>
                          <span>{new Date(pe.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="text-sm text-gray-700">{pe.error_message}</div>
                        {pe.error_payload && Object.keys(pe.error_payload).length > 0 && (
                          <pre className="text-xs text-gray-500 mt-1.5 overflow-x-auto">{JSON.stringify(pe.error_payload, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedJob.dismissed_at ? (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-[10px] px-4 py-3">
                  <Archive className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-gray-600">Arquivado em {new Date(selectedJob.dismissed_at).toLocaleString('pt-BR')}</div>
                    {selectedJob.dismissal_reason && <div className="text-xs text-gray-500 mt-0.5">{selectedJob.dismissal_reason}</div>}
                  </div>
                </div>
              ) : selectedJob.status === 'dead_letter' && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Arquivar (motivo opcional)</div>
                  <textarea
                    value={dismissReason}
                    onChange={e => setDismissReason(e.target.value)}
                    placeholder="Ex: cliente reenviou XML corrigido por e-mail em 12/07, tratado manualmente."
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
                  />
                </div>
              )}
            </SheetPanel>
            <SheetFooter>
              {!selectedJob.dismissed_at && (selectedJob.status === 'dead_letter' || selectedJob.status === 'failed') && (
                <button
                  disabled={replaying === selectedJob.id}
                  onClick={() => handleReplayClick(selectedJob)}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-slate-200 text-slate-700 rounded-[6px] hover:border-blue-200 hover:text-blue-600 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                  <RotateCw className={`w-4 h-4 ${replaying === selectedJob.id ? 'animate-spin' : ''}`} />
                  Replay
                </button>
              )}
              {!selectedJob.dismissed_at && selectedJob.status === 'dead_letter' && (
                <button
                  disabled={dismissing}
                  onClick={() => handleDismiss(selectedJob)}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-amber-600 text-white rounded-[6px] hover:bg-amber-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" />
                  Arquivar job
                </button>
              )}
            </SheetFooter>
          </>
        )}
      </Sheet>

      {/* Barra de ações em lote — fixa (fora do fluxo) para não forçar reflow da
          tabela ao selecionar o primeiro item (modelo: BoletoManager) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-[14px] shadow-lg shadow-blue-900/20">
          <span className="text-sm font-bold whitespace-nowrap">
            {selectedIds.size} job{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => abrirLote('replay')}
            className="flex items-center gap-1.5 h-8 px-3 bg-white/15 rounded-[8px] font-medium text-[13px] hover:bg-white/25 transition-colors active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Replay em lote
          </button>
          <button
            onClick={() => abrirLote('dismiss')}
            disabled={dismissableSelected.length === 0}
            title={dismissableSelected.length === 0 ? 'Nenhum dos selecionados está em dead letter ativo' : undefined}
            className="flex items-center gap-1.5 h-8 px-3 bg-white/15 rounded-[8px] font-medium text-[13px] hover:bg-white/25 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Archive className="w-3.5 h-3.5" />
            Arquivar em lote
            {dismissableSelected.length > 0 && dismissableSelected.length !== selectedIds.size && (
              <span className="opacity-75">({dismissableSelected.length})</span>
            )}
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 h-8 px-3 bg-blue-500 rounded-[8px] font-medium text-[13px] hover:bg-blue-400 transition-colors active:scale-95"
          >
            <X className="w-3.5 h-3.5" />
            Desmarcar
          </button>
        </div>
      )}

      {loteAction && loteJobs.length > 0 && (
        <FiscalDeadLetterLoteModal
          jobs={loteJobs}
          action={loteAction}
          onClose={() => { setLoteAction(null); setLoteJobs([]); clearSelection(); }}
          onDone={loadJobs}
        />
      )}
    </div>
  );
}
