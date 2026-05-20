import { useState, useEffect, useCallback } from 'react';
import { listProcessingJobs, replayDeadLetter } from '../../services/nfeService';
import type { ProcessingJobWithDoc } from '../../types/fiscal';

interface Props {
  organizationId: string;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}

function Badge({ status }: { status: string }) {
  return <span className={`f-badge f-badge-${status}`}>⬤ {status.replace('_', ' ')}</span>;
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

export function FiscalJobs({ organizationId, onToast }: Props) {
  const [jobs, setJobs] = useState<ProcessingJobWithDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [replaying, setReplaying] = useState<string | null>(null);

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
    all:         jobs.length,
    completed:   jobs.filter(j => j.status === 'completed').length,
    failed:      jobs.filter(j => j.status === 'failed').length,
    dead_letter: jobs.filter(j => j.status === 'dead_letter').length,
  };

  const shown = jobs.filter(j =>
    filter === 'all'         ? true :
    filter === 'dead_letter' ? j.status === 'dead_letter' :
    filter === 'failed'      ? j.status === 'failed' :
    j.status === filter
  );

  const duration = (job: ProcessingJobWithDoc) => {
    if (!job.started_at || !job.finished_at) return '—';
    const ms = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="f-page">
      <div className="f-page-header">
        <div className="f-page-title">Fila de processamento</div>
        <div className="f-page-sub">Visibilidade operacional dos jobs • Gerenciamento de dead letter</div>
      </div>

      <div className="f-stats-grid">
        {[
          { label: 'Jobs totais',  val: counts.all,         color: 'var(--ftext)' },
          { label: 'Concluídos',   val: counts.completed,   color: 'var(--fgreen)' },
          { label: 'Falhas',       val: counts.failed,      color: 'var(--famber)' },
          { label: 'Dead letter',  val: counts.dead_letter, color: 'var(--fred)' },
        ].map(s => (
          <div key={s.label} className="f-stat-card">
            <div className="f-stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="f-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {counts.dead_letter > 0 && (
        <div style={{
          background: 'var(--fred-bg)', border: '1px solid #3d0f0f',
          borderRadius: 'var(--fradius-lg)', padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: 'var(--fred)', fontSize: 16 }}>⚠</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--fred)', fontSize: 13 }}>
              {counts.dead_letter} documento(s) em dead letter
            </div>
            <div style={{ fontSize: 12, color: '#f87171', marginTop: 2 }}>
              Requerem revisão manual. NF-e com falha de dados não são reprocessadas automaticamente.
            </div>
          </div>
        </div>
      )}

      <div className="f-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="f-filters" style={{ marginBottom: 0 }}>
            {([
              ['all',         'Todos',        counts.all],
              ['completed',   'Concluídos',   counts.completed],
              ['failed',      'Com falha',    counts.failed],
              ['dead_letter', 'Dead letter',  counts.dead_letter],
            ] as [string, string, number][]).map(([k, label, count]) => (
              <button
                key={k}
                className={`f-filter-chip ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {label}{' '}
                <span style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: 10, marginLeft: 4 }}>{count}</span>
              </button>
            ))}
          </div>
          <button className="f-btn f-btn-ghost f-btn-sm" onClick={loadJobs}>↺ Atualizar</button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ftext3)' }}>Carregando…</div>
        ) : (
          <div className="f-table-wrap">
            <table className="f-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Retries</th>
                  <th>Falha</th>
                  <th>Erro</th>
                  <th>Duração</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(job => (
                  <tr key={job.id}>
                    <td><Badge status={job.status} /></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>
                        {job.raw_document?.access_key?.substring(0, 20)}…
                      </div>
                      <div className="f-mono" style={{ color: 'var(--ftext3)', fontSize: 10, marginTop: 2 }}>
                        {job.id}
                      </div>
                    </td>
                    <td><span className="f-tag">{job.job_type}</span></td>
                    <td>
                      <span className="f-mono" style={{
                        color: job.retry_count >= job.max_retries ? 'var(--fred)' : 'var(--ftext2)',
                      }}>
                        {job.retry_count}/{job.max_retries}
                      </span>
                    </td>
                    <td>
                      {job.failure_type ? (
                        <span style={{
                          fontSize: 11,
                          color: job.failure_type === 'data_failure' ? 'var(--fred)' : 'var(--famber)',
                        }}>
                          {job.failure_type === 'data_failure' ? 'dados' : 'técnica'}
                        </span>
                      ) : <span style={{ color: 'var(--ftext3)' }}>—</span>}
                    </td>
                    <td>
                      {job.error_code ? (
                        <span className="f-mono" style={{ fontSize: 10, color: 'var(--fred)' }}>
                          {job.error_code}
                        </span>
                      ) : <span style={{ color: 'var(--ftext3)' }}>—</span>}
                    </td>
                    <td><span className="f-mono" style={{ fontSize: 11 }}>{duration(job)}</span></td>
                    <td>
                      {(job.status === 'dead_letter' || job.status === 'failed') && (
                        <button
                          className="f-btn f-btn-ghost f-btn-sm"
                          disabled={replaying === job.id}
                          onClick={() => handleReplay(job.id)}
                        >
                          {replaying === job.id
                            ? <span className="f-spin">⟳</span>
                            : '↺ Replay'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <div className="f-empty" style={{ padding: '40px 0' }}>
                <div className="f-empty-title">Nenhum job encontrado</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="f-card">
        <div className="f-section-title">Runbook operacional — respostas rápidas</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {RUNBOOK.map(({ trigger, action }) => (
            <div key={trigger} style={{
              background: 'var(--fbg3)', borderRadius: 'var(--fradius)',
              padding: 14, border: '1px solid var(--fborder)',
            }}>
              <div style={{
                fontFamily: 'monospace', fontSize: 10, color: 'var(--famber)',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1,
              }}>
                ⚡ {trigger}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ftext2)', lineHeight: 1.6 }}>{action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
