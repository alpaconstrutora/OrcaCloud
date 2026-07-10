import { useState, useEffect } from 'react';
import { FileText, ListChecks, Tags, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getPipelineHealth } from '../../services/nfeService';
import { FISCAL_CSS } from './fiscalCss';
import { FiscalUpload } from './FiscalUpload';
import { FiscalDocuments } from './FiscalDocuments';
import { FiscalJobs } from './FiscalJobs';
import { FiscalRules } from './FiscalRules';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import type { PipelineHealth } from '../../types/fiscal';

export type FiscalPage = 'documents' | 'admin' | 'rules';

interface ToastState { msg: string; type: 'ok' | 'err'; }

// Toast — padrão ui_ux_standard_guide.md §13
function FiscalToast({ msg, type, onClose }: ToastState & { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
      type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

const NAV: { id: FiscalPage; label: string; icon: React.ReactNode }[] = [
  { id: 'documents', label: 'Documentos', icon: <FileText className="w-4 h-4" /> },
  { id: 'admin', label: 'Fila & Jobs', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'rules', label: 'Classificação', icon: <Tags className="w-4 h-4" /> },
];

export function FiscalModule() {
  const { activeOrganizationId, organizations, session } = useStore();
  const [page, setPage] = useState<FiscalPage>('documents');
  const [uploadOpen, setUploadOpen] = useState(false);
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

  const rate = health ? Math.round(health.success_rate_pct) : 0;
  const rateColor = rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <>
      {/* FISCAL_CSS ainda é injetado — TaxValidationPanel/JournalEntryCard (renderizados
          dentro de FiscalDocuments) continuam usando as classes f-* legadas; fora do
          escopo desta migração. A classe .fiscal-root só fornece as CSS custom
          properties (--fred, --fgreen etc.) que esses dois componentes consomem. */}
      <style dangerouslySetInnerHTML={{ __html: FISCAL_CSS }} />
      <div className="fiscal-root h-full flex flex-col overflow-hidden" style={{ background: '#f9fafb' }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header do módulo */}
          <div className="bg-white border-b border-gray-100 px-7 pt-5 shrink-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Módulo Fiscal</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Pipeline de NF-e e classificação de documentos.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={moduleOrgId}
                  onChange={e => setModuleOrgId(e.target.value)}
                  title="Organização"
                  className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-w-[200px]"
                >
                  <option value="">Todas as organizações</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                {health && (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rateColor}`} />
                      Sucesso {rate}%
                    </span>
                    {(health.dead_letter ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" /> {health.dead_letter} dead letter
                      </span>
                    )}
                    {(health.queued ?? 0) > 0 && (
                      <span className="text-xs font-medium text-gray-500">{health.queued} na fila</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isConsolidated && page === 'rules' && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] px-4 py-2.5 text-sm font-medium mb-4">
                Visão consolidada — selecione uma organização específica acima para criar regras.
              </div>
            )}

            {/* Navegação de abas do módulo — escala compacta (§16/§19) */}
            <div className="inline-flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 mb-0">
              {NAV.map(n => (
                <button
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${
                    page === n.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {n.icon} {n.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo da aba ativa */}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {page === 'documents' && (
              <FiscalDocuments
                organizationId={orgId}
                onToast={showToast}
                onOpenUpload={orgId ? () => setUploadOpen(true) : undefined}
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

      {orgId && (
        <Sheet open={uploadOpen} onClose={() => setUploadOpen(false)}>
          <SheetHeader onClose={() => setUploadOpen(false)}>
            <SheetTitle>Upload NF-e</SheetTitle>
            <SheetDescription>Envie arquivos XML de nota fiscal eletrônica para processamento automático.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="px-6 py-5">
            <FiscalUpload
              organizationId={orgId}
              userId={session?.user?.id ?? ''}
              onToast={showToast}
            />
          </SheetPanel>
        </Sheet>
      )}

      {toast && (
        <FiscalToast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
