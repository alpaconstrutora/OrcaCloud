import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getPipelineHealth } from '../../services/nfeService';
import { FISCAL_CSS } from './fiscalCss';
import { FiscalUpload } from './FiscalUpload';
import { FiscalDocuments } from './FiscalDocuments';
import { FiscalJobs } from './FiscalJobs';
import { FiscalRules } from './FiscalRules';
import type { PipelineHealth } from '../../types/fiscal';

export type FiscalPage = 'upload' | 'documents' | 'admin' | 'rules';

interface ToastState { msg: string; type: 'ok' | 'err'; }

function FiscalToast({ msg, type, onClose }: ToastState & { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`f-toast f-toast-${type}`}>
      <span>{type === 'ok' ? '✓' : '✕'}</span>
      <span>{msg}</span>
    </div>
  );
}

export function FiscalModule() {
  const { activeOrganizationId, organizations, session } = useStore();
  const [page, setPage] = useState<FiscalPage>('upload');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  // Seletor próprio do módulo Fiscal — independe do seletor global do app.
  // '' representa "Todas as organizações".
  const [moduleOrgId, setModuleOrgId] = useState(activeOrganizationId ?? '');

  const orgId: string | null = moduleOrgId || null;
  const isConsolidated = !orgId;

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  useEffect(() => {
    if (!orgId) { setHealth(null); return; }
    getPipelineHealth(orgId).then(setHealth).catch(() => null);
  }, [orgId, page]);

  const rate = health
    ? Math.round(health.success_rate_pct)
    : 0;

  const nav: { id: FiscalPage; label: string; icon: React.ReactNode }[] = [
    {
      id: 'upload', label: 'Upload NF-e',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>,
    },
    {
      id: 'documents', label: 'Documentos',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
    },
    {
      id: 'admin', label: 'Fila & Jobs',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
    },
    {
      id: 'rules', label: 'Classificação',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
    },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FISCAL_CSS }} />
      <div className="fiscal-root">
        <div className="f-main">
          {/* Header */}
          <div className="f-module-header">
            <div className="f-module-title-row">
              <div>
                <h1 className="f-module-title">Módulo Fiscal</h1>
                <p className="f-module-sub">Pipeline de NF-e e classificação de documentos</p>
              </div>
              <div className="f-module-header-right">
                <select
                  value={moduleOrgId}
                  onChange={e => setModuleOrgId(e.target.value)}
                  className="f-org-select"
                  title="Organização"
                >
                  <option value="">Todas as organizações</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                {health && (
                  <div className="f-health-chips">
                    <span className="f-health-chip">
                      <span className="f-health-chip-dot" style={{ background: rate >= 80 ? 'var(--fgreen)' : rate >= 50 ? 'var(--famber)' : 'var(--fred)' }} />
                      Sucesso {rate}%
                    </span>
                    {(health.dead_letter ?? 0) > 0 && (
                      <span className="f-health-chip f-health-chip-warn">
                        ⚠ {health.dead_letter} dead letter
                      </span>
                    )}
                    {(health.queued ?? 0) > 0 && (
                      <span className="f-health-chip">
                        {health.queued} na fila
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isConsolidated && (page === 'upload' || page === 'rules') && (
              <div className="f-consolidated-banner">
                <span>
                  Visão consolidada — selecione uma organização específica acima para {page === 'upload' ? 'enviar NF-e' : 'criar regras'}.
                </span>
              </div>
            )}

            {/* Tabs */}
            <div className="f-tabs">
              {nav.map(n => (
                <button
                  key={n.id}
                  className={`f-tab ${page === n.id ? 'active' : ''}`}
                  onClick={() => setPage(n.id)}
                >
                  {n.icon} {n.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="f-tab-content">
            {page === 'upload' && (
              orgId ? (
                <FiscalUpload
                  organizationId={orgId}
                  userId={session?.user?.id ?? ''}
                  onToast={showToast}
                  onNavigate={setPage}
                />
              ) : (
                <div className="f-tab-empty">Selecione uma organização acima para enviar NF-e.</div>
              )
            )}
            {page === 'documents' && (
              <FiscalDocuments
                organizationId={orgId}
                onToast={showToast}
              />
            )}
            {page === 'admin' && (
              <FiscalJobs
                organizationId={orgId}
                onToast={showToast}
              />
            )}
            {page === 'rules' && (
              <FiscalRules
                organizationId={orgId}
                writeOrganizationId={orgId}
                onToast={showToast}
              />
            )}
          </div>
        </div>
      </div>

      {toast && (
        <FiscalToast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
