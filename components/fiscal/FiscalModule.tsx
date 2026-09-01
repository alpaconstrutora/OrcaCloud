import { useState, useEffect } from 'react';
import { FileText, ListChecks, Tags, AlertCircle, CheckCircle2, UploadCloud, BarChart3 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getPipelineHealth } from '../../services/nfeService';
import { FISCAL_CSS } from './fiscalCss';
import { FiscalUpload } from './FiscalUpload';
import { FiscalDocuments } from './FiscalDocuments';
import { FiscalJobs } from './FiscalJobs';
import { FiscalRules } from './FiscalRules';
import { FiscalAnalytics } from './FiscalAnalytics';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import type { PipelineHealth } from '../../types/fiscal';

export type FiscalPage = 'documents' | 'admin' | 'rules' | 'analytics';

interface ToastState { msg: string; type: 'ok' | 'err'; }

// Toast — padrão ui_ux_guia_unificado.md §13
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
  // Análise concentra os KPIs das três abas acima — elas abrem direto na tabela.
  { id: 'analytics', label: 'Análise', icon: <BarChart3 className="w-4 h-4" /> },
];

// Título da tela acompanha a aba ativa — guia §19.1. Antes o <h1> era fixo
// ("Módulo Fiscal") e cada aba filha repetia um <h1> próprio logo abaixo: dois
// títulos empilhados, e o de cima mentindo sobre o que estava na tela.
const VIEW_HEADERS: Record<FiscalPage, { title: string; subtitle: string }> = {
  documents: { title: 'Documentos fiscais', subtitle: 'NF-e ingeridas, processadas e vinculadas a títulos financeiros.' },
  admin: { title: 'Fila de processamento', subtitle: 'Visibilidade operacional dos jobs e gerenciamento de dead letter.' },
  rules: { title: 'Regras de classificação', subtitle: 'Regras heurísticas configuráveis — NCM, CFOP e palavras-chave. Sem código hardcoded.' },
  analytics: { title: 'Análise', subtitle: 'Indicadores consolidados do módulo fiscal — documentos, fila de processamento e regras.' },
};

interface Props {
  /** Navega para Suprimentos > Pedidos > detalhe do pedido. */
  onViewOrder?: (orderId: string) => void;
  /** Navega para a aba Contas a Pagar, escopada pela obra do título vinculado. */
  onViewPayable?: (projectId: string | null) => void;
}

export function FiscalModule({ onViewOrder, onViewPayable }: Props) {
  const { activeOrganizationId, session } = useStore();
  const [page, setPage] = useState<FiscalPage>('documents');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [health, setHealth] = useState<PipelineHealth | null>(null);

  // Org vem do seletor global do topo — sem seletor próprio no módulo.
  const orgId = activeOrganizationId;
  const isConsolidated = !orgId;

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  useEffect(() => {
    if (!orgId) { setHealth(null); return; }
    getPipelineHealth(orgId).then(setHealth).catch(() => null);
  }, [orgId, page]);

  const rate = health ? Math.round(health.success_rate_pct) : 0;
  const rateColor = rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500';

  // Cromo do módulo (§3 abas + §4 botões) — montado aqui e passado como
  // `chromeSlot` para o filho ativo posicionar depois do próprio KPI (ver
  // comentário no JSX abaixo). Abas primeiro, botões depois, na ordem do §1.
  const chromeSlot = (
    <>
      {/* Toolbar de abas — §19.1 (trilho bg-gray-50, aba ativa bg-white text-blue-600,
          flex-wrap); mb-3 pelo ritmo de cromo do §20.1 */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                page === n.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar de botões — §5.3: escopo à esquerda, ação primária à direita.
          Sem seletor de organização aqui: vem do seletor global do topo. */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {health && (
            <>
              <span className="inline-flex items-center gap-1.5 h-9 text-xs font-medium text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rateColor}`} />
                Sucesso {rate}%
              </span>
              {(health.dead_letter ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 h-9 text-xs font-medium text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" /> {health.dead_letter} dead letter
                </span>
              )}
              {(health.queued ?? 0) > 0 && (
                <span className="inline-flex items-center h-9 text-xs font-medium text-gray-500">{health.queued} na fila</span>
              )}
            </>
          )}
        </div>

        {/* Ação primária — §17 variante compacta; mora na toolbar de botões (§5.3),
            não solta ao lado do <h1>. Só na aba Documentos e com org definida. */}
        {page === 'documents' && orgId && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
          >
            <UploadCloud className="w-[15px] h-[15px]" />
            Enviar NF-e
          </button>
        )}
      </div>

      {isConsolidated && page === 'rules' && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] px-4 py-2.5 text-sm font-medium mb-3">
          Visão consolidada — selecione uma organização específica acima para criar regras.
        </div>
      )}
    </>
  );

  return (
    <>
      {/* FISCAL_CSS ainda é injetado — TaxValidationPanel/JournalEntryCard (renderizados
          dentro de FiscalDocuments) continuam usando as classes f-* legadas; fora do
          escopo desta migração. A classe .fiscal-root só fornece as CSS custom
          properties (--fred, --fgreen etc.) que esses dois componentes consomem. */}
      <style dangerouslySetInnerHTML={{ __html: FISCAL_CSS }} />
      {/* Scroll box PRÓPRIO, aninhado dentro do <main> do Layout — que já tem seu
          próprio scroll e seu próprio gutter (p-4 md:p-6, §20.2). `absolute inset-0`
          (o `<main>` do Layout já é `relative`) cancela os 4 lados do padding
          herdado de uma vez; o `p-4 md:p-6` do filho reaplica o mesmo valor uma
          única vez (era `px-7 py-6`, 28px, valor que não existe em nenhuma outra
          tela, EM CIMA do padding do Layout — Fiscal respirava mais que qualquer
          outra tela, não menos).
          ⚠️ NÃO trocar por `h-full` + margem negativa: `h-full` mede 100% do
          conteúdo já descontado o padding do pai, então cancelar com `-mt`/`-mx`
          desloca a caixa sem esticar a altura, sobrando um vão do tamanho da
          margem na borda oposta (medido com Playwright, 2026-08-08). `inset-0`
          não tem esse problema — define topo E fundo ao mesmo tempo, a altura
          sai correta por construção. */}
      <div className="fiscal-root absolute inset-0 overflow-y-auto" style={{ background: '#f9fafb' }}>
        {/* Container raiz — space-y-6 (§20). O header fixo em card branco que existia
            aqui foi removido: título de tela é bloco flat, não banda/hero (§20). */}
        <div className="p-4 md:p-6 space-y-6">
          {/* Cabeçalho de tela — §20; título muda junto com a aba ativa (§19.1) */}
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[page].title}</h1>
            <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[page].subtitle}</p>
          </div>

          {/* Conteúdo da aba ativa — abas e botões são cromo do módulo pai, montados
              aqui e passados como `chromeSlot` para o filho posicionar (mesmo padrão
              de `tabsSlot` em ProjectFinancialManager/BoletoManager). Desde a criação
              da aba Análise os KPIs do módulo moram só nela: Documentos, Fila & Jobs e
              Classificação abrem direto no cromo + tabela, então nesses três o
              `chromeSlot` é o primeiro bloco depois do título. */}
          {page === 'documents' && (
            <FiscalDocuments
              organizationId={orgId}
              onToast={showToast}
              onViewOrder={onViewOrder}
              onViewPayable={onViewPayable}
              chromeSlot={chromeSlot}
            />
          )}
          {page === 'admin' && (
            <FiscalJobs
              organizationId={orgId}
              onToast={showToast}
              chromeSlot={chromeSlot}
            />
          )}
          {page === 'rules' && (
            <FiscalRules
              organizationId={orgId}
              writeOrganizationId={orgId}
              onToast={showToast}
              chromeSlot={chromeSlot}
            />
          )}
          {page === 'analytics' && (
            <FiscalAnalytics
              organizationId={orgId}
              onToast={showToast}
              chromeSlot={chromeSlot}
            />
          )}
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
