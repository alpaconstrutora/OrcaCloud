import { useState, useEffect, useCallback } from 'react';
import { ListChecks, Search, AlertTriangle, RotateCw, Zap } from 'lucide-react';
import { listProcessingJobs, replayDeadLetter } from '../../services/nfeService';
import type { ProcessingJobWithDoc } from '../../types/fiscal';
import { KpiCard } from '../ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';

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

function StatusText({ status }: { status: string }) {
  return <span className={`text-sm font-normal ${STATUS_COLORS[status] ?? 'text-gray-600'}`}>{status.replace('_', ' ')}</span>;
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

  const loadJobs = useCallback(() => {
    setLoading(true);
    listProcessingJobs(organizationId)
      .then(setJobs)
      .catch(() => onToast('Erro ao carregar jobs', 'err'))
      .finally(() => setLoading(false));
  }, [organizationId, onToast]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleReplay = async (jobId: string) => {
    setReplaying(jobId);
    try {
      await replayDeadLetter(jobId);
      onToast('Job enviado para replay com sucesso', 'ok');
      loadJobs();
    } catch (err: any) {
      onToast(err.message ?? 'Erro ao fazer replay', 'err');
    } finally {
      setReplaying(null);
    }
  };

  const counts = {
    all: jobs.length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    dead_letter: jobs.filter(j => j.status === 'dead_letter').length,
  };

  const FILTERS = [
    { k: 'all', label: 'Todos', count: counts.all },
    { k: 'completed', label: 'Concluídos', count: counts.completed },
    { k: 'failed', label: 'Com falha', count: counts.failed },
    { k: 'dead_letter', label: 'Dead letter', count: counts.dead_letter },
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
    if (filter !== 'all' && j.status !== filter) return false;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Fila de processamento</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">Visibilidade operacional dos jobs e gerenciamento de dead letter.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard shadow={false} size="lg" className="col-span-2" label="Jobs totais" value={counts.all} icon={<ListChecks className="w-4 h-4" />} color="blue" />
        <KpiCard shadow={false} size="sm" label="Concluídos" value={counts.completed} icon={<Zap className="w-4 h-4" />} color="emerald" />
        <KpiCard shadow={false} size="sm" label="Falhas" value={counts.failed} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <KpiCard shadow={false} size="sm" label="Dead letter" value={counts.dead_letter} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
      </div>

      {counts.dead_letter > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <div className="text-sm font-bold text-red-700">{counts.dead_letter} documento(s) em dead letter</div>
            <div className="text-xs text-red-500 mt-0.5">Requerem revisão manual. NF-e com falha de dados não são reprocessadas automaticamente.</div>
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
                  <tr key={job.id} className="hover:bg-blue-50/50 transition-colors">
                    {tableColumns.visibleColumns.includes('status') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0"><StatusText status={job.status} /></td>
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
                        {(job.status === 'dead_letter' || job.status === 'failed') && (
                          <button
                            disabled={replaying === job.id}
                            onClick={() => handleReplay(job.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                          >
                            {replaying === job.id ? <RotateCw className="w-4 h-4 animate-spin inline" /> : 'Replay'}
                          </button>
                        )}
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
    </div>
  );
}
