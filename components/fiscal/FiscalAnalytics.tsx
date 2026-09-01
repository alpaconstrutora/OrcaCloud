import { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Clock, ListChecks, Zap, AlertTriangle, Archive, Tags } from 'lucide-react';
import { listNfeInvoices, listProcessingJobs, listClassificationRules } from '../../services/nfeService';
import type { NfeInvoice, ProcessingJobWithDoc, ClassificationRule, RuleType } from '../../types/fiscal';
import { KpiCard } from '../ui/KpiCard';

interface Props {
  organizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
  /** Cromo do módulo pai (abas §3 + botões §4) — ver FiscalDocuments.tsx para o porquê. */
  chromeSlot?: React.ReactNode;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Título de bloco de KPIs — esta aba concentra indicadores de TRÊS domínios
// (documentos, fila e regras), então cada grade precisa dizer de onde vem;
// sem isso "Total ingerido" e "Jobs totais" ficam lado a lado sem contexto.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-slate-500 mb-2">{children}</h2>;
}

/**
 * Aba Análise — reúne os KPIs de todo o módulo Fiscal num só lugar.
 *
 * Antes cada aba (Documentos, Fila & Jobs, Classificação) abria com sua própria
 * grade de KPIs empurrando a tabela para baixo. Os números continuam derivados
 * das MESMAS chamadas de serviço das outras abas (não de uma view agregada
 * paralela), justamente para não divergirem do que cada tela mostra ao filtrar.
 */
export function FiscalAnalytics({ organizationId, onToast, chromeSlot }: Props) {
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [jobs, setJobs] = useState<ProcessingJobWithDoc[]>([]);
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listNfeInvoices(organizationId),
      listProcessingJobs(organizationId),
      listClassificationRules(organizationId),
    ])
      .then(([invs, js, rs]) => { setInvoices(invs); setJobs(js); setRules(rs); })
      .catch(() => onToast('Erro ao carregar indicadores', 'err'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  // ── Documentos (mesmas contas de FiscalDocuments) ──────────────────────────
  // nfe_invoices só contém documentos que já passaram pelo pipeline com sucesso
  // (falhas ficam em raw_documents/processing_jobs, refletidas no bloco da fila).
  const totalDocs = invoices.length;
  const linked = invoices.filter(i => !!i.linked_transaction_id).length;
  const pendingLink = totalDocs - linked;
  const totalValue = invoices.reduce((a, b) => a + b.total_value, 0);
  const successRate = 100;

  // ── Fila & Jobs (mesmas contas de FiscalJobs) ──────────────────────────────
  const activeDeadLetter = (j: ProcessingJobWithDoc) => j.status === 'dead_letter' && !j.dismissed_at;
  const jobCounts = {
    all: jobs.length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    dead_letter: jobs.filter(activeDeadLetter).length,
    archived: jobs.filter(j => !!j.dismissed_at).length,
  };

  // ── Classificação (mesma conta de FiscalRules) ─────────────────────────────
  const countByType = (type: RuleType) => rules.filter(r => r.rule_type === type).length;

  return (
    <div className="space-y-6">
      {/* Título vive no FiscalModule e muda com a aba ativa (§19.1) — não repetir aqui. */}
      {chromeSlot}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500 text-sm">Carregando indicadores...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <SectionTitle>Documentos</SectionTitle>
            {/* Grade simétrica (§4.2: são 4 métricas independentes, não um total decomposto). */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total ingerido" value={totalDocs} icon={<FileText className="w-5 h-5" />} color="blue" />
              <KpiCard label="Valor total" value={fmt(totalValue)} icon={<FileText className="w-5 h-5" />} color="indigo" />
              <KpiCard label="Taxa de sucesso" value={`${successRate}%`} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
              <KpiCard label="Aguard. aprovação" value={pendingLink} icon={<Clock className="w-5 h-5" />} color={pendingLink > 0 ? 'amber' : 'gray'} />
            </div>
          </div>

          <div>
            <SectionTitle>Fila de processamento</SectionTitle>
            {/* Quebra de simetria (§4.2): "Jobs totais" é o total do qual os demais
                são a decomposição. */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <KpiCard shadow={false} size="lg" className="col-span-2" label="Jobs totais" value={jobCounts.all} icon={<ListChecks className="w-4 h-4" />} color="blue" />
              <KpiCard shadow={false} size="sm" label="Concluídos" value={jobCounts.completed} icon={<Zap className="w-4 h-4" />} color="emerald" />
              <KpiCard shadow={false} size="sm" label="Falhas" value={jobCounts.failed} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
              <KpiCard shadow={false} size="sm" label="Dead letter" value={jobCounts.dead_letter} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
              <KpiCard shadow={false} size="sm" label="Arquivados" value={jobCounts.archived} icon={<Archive className="w-4 h-4" />} color="gray" />
            </div>
          </div>

          <div>
            <SectionTitle>Regras de classificação</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard label="NCM" value={countByType('ncm')} icon={<Tags className="w-5 h-5" />} color="blue" />
              <KpiCard label="Palavra-chave" value={countByType('keyword')} icon={<Tags className="w-5 h-5" />} color="purple" />
              <KpiCard label="CFOP" value={countByType('cfop')} icon={<Tags className="w-5 h-5" />} color="teal" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
