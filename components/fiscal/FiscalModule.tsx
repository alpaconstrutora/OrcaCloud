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
  const { activeOrganizationId, session } = useStore();
  const [page, setPage] = useState<FiscalPage>('upload');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [health, setHealth] = useState<PipelineHealth | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  useEffect(() => {
    if (!activeOrganizationId) return;
    getPipelineHealth(activeOrganizationId).then(setHealth).catch(() => null);
  }, [activeOrganizationId, page]);

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

  if (!activeOrganizationId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0d0f12', color: '#8b92a4' }}>
        Selecione uma organização para acessar o módulo fiscal.
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FISCAL_CSS }} />
      <div className="fiscal-root">
        {/* Sidebar */}
        <div className="f-sidebar">
          <div className="f-logo">
            <div className="f-logo-mark">Orça<span>Cloud</span></div>
            <div className="f-logo-sub">Módulo Fiscal</div>
          </div>

          <nav className="f-nav">
            <div className="f-nav-section">Pipeline NF-e</div>
            {nav.map(n => (
              <div
                key={n.id}
                className={`f-nav-item ${page === n.id ? 'active' : ''}`}
                onClick={() => setPage(n.id)}
              >
                {n.icon} {n.label}
              </div>
            ))}
          </nav>

          <div className="f-sidebar-footer">
            <div className="f-health-card">
              <div className="f-health-title">Pipeline health</div>
              <div className="f-health-row">
                <span className="f-health-label">Taxa sucesso</span>
                <span className="f-health-val" style={{ color: rate >= 80 ? 'var(--fgreen)' : rate >= 50 ? 'var(--famber)' : 'var(--fred)' }}>
                  {health ? `${rate}%` : '—'}
                </span>
              </div>
              <div className="f-health-row">
                <span className="f-health-label">Dead letter</span>
                <span className="f-health-val" style={{ color: (health?.dead_letter ?? 0) > 0 ? 'var(--fred)' : 'var(--fgreen)' }}>
                  {health?.dead_letter ?? '—'}
                </span>
              </div>
              <div className="f-health-row">
                <span className="f-health-label">Na fila</span>
                <span className="f-health-val" style={{ color: 'var(--ftext2)' }}>
                  {health?.queued ?? '—'}
                </span>
              </div>
              {health && (
                <div className="f-progress-bar" style={{ marginTop: 8 }}>
                  <div
                    className="f-progress-fill"
                    style={{ width: `${rate}%`, background: rate >= 80 ? 'var(--fgreen)' : 'var(--famber)' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="f-main">
          {page === 'upload' && (
            <FiscalUpload
              organizationId={activeOrganizationId}
              userId={session?.user?.id ?? ''}
              onToast={showToast}
              onNavigate={setPage}
            />
          )}
          {page === 'documents' && (
            <FiscalDocuments
              organizationId={activeOrganizationId}
              onToast={showToast}
            />
          )}
          {page === 'admin' && (
            <FiscalJobs
              organizationId={activeOrganizationId}
              onToast={showToast}
            />
          )}
          {page === 'rules' && (
            <FiscalRules
              organizationId={activeOrganizationId}
              onToast={showToast}
            />
          )}
        </div>
      </div>

      {toast && (
        <FiscalToast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
