import { useState, useEffect } from 'react';
import { listNfeInvoices, getNfeInvoiceWithItems, approveAndLink, linkExistingTransaction } from '../../services/nfeService';
import { projectService } from '../../services/projectService';
import type { NfeInvoice, NfeInvoiceWithItems, ProcessingStatus } from '../../types/fiscal';
import { supabase } from '../../lib/supabase';
import { validateNfe, summarizeAlerts } from '../../services/taxValidationService';
import { TaxValidationPanel } from './TaxValidationPanel';
import { JournalEntryCard } from './JournalEntryCard';

interface Props {
  organizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

function Badge({ status }: { status: ProcessingStatus | string }) {
  return <span className={`f-badge f-badge-${status}`}>⬤ {status.replace('_', ' ')}</span>;
}

function Category({ cat }: { cat: string | null }) {
  if (!cat) return <span style={{ color: 'var(--ftext3)' }}>—</span>;
  return <span className={`f-cat f-cat-${cat}`}>{cat}</span>;
}

const PIPELINE_STEPS = [
  { key: 'queued',      label: 'Fila' },
  { key: 'processing',  label: 'Processando' },
  { key: 'parsed',      label: 'Parse' },
  { key: 'normalized',  label: 'Normalizado' },
  { key: 'completed',   label: 'Concluído' },
] as const;

const STEP_ORDER: Record<string, number> = {
  queued: 0, processing: 1, parsed: 2, normalized: 3, completed: 4,
};

// ── Modal: Gerar ou Vincular Título Financeiro ────────────────────────────────
function ApproveModal({
  invoice,
  projects,
  organizationId,
  onClose,
  onSuccess,
}: {
  invoice: NfeInvoice;
  projects: { id: string; name: string }[];
  organizationId: string;
  onClose: () => void;
  onSuccess: (updated: NfeInvoice) => void;
}) {
  const [tab, setTab] = useState<'new' | 'existing'>('new');
  
  // Aba: Criar Novo
  const [projectId, setProjectId] = useState(invoice.project_id ?? '');
  const [purchaseOrderId, setPurchaseOrderId] = useState(invoice.purchase_order_id ?? '');
  const [orders, setOrders] = useState<{ id: string; number: string }[]>([]);
  const [dueDate, setDueDate] = useState('');
  
  // Aba: Vincular Existente
  const [existingTxs, setExistingTxs] = useState<{ id: string; description: string; amount: number; transaction_date: string; entity_name: string }[]>([]);
  const [selectedTxId, setSelectedTxId] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Busca pedidos ao trocar de projeto (Novo Título)
  useEffect(() => {
    if (!projectId) { setOrders([]); setPurchaseOrderId(''); return; }
    supabase
      .from('purchase_orders')
      .select('id, number')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as { id: string; number: string }[]));
  }, [projectId]);

  // Busca títulos pendentes (Vincular Existente)
  useEffect(() => {
    if (tab === 'existing') {
      supabase
        .from('internal_transactions')
        .select('id, description, amount, transaction_date, entity_name')
        .eq('organization_id', organizationId)
        .eq('direction', 'DEBIT')
        .eq('status', 'PENDING')
        // Tenta filtrar pelo nome/cnpj do emissor para não poluir
        .ilike('entity_name', `%${invoice.issuer_name.split(' ')[0]}%`)
        .order('transaction_date', { ascending: true })
        .then(({ data }) => setExistingTxs(data ?? []));
    }
  }, [tab, organizationId, invoice.issuer_name]);

  async function handleCreateNew() {
    if (!projectId) { setError('Selecione uma obra.'); return; }
    if (!dueDate)   { setError('Informe a data de vencimento.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updated = await approveAndLink({
        invoiceId: invoice.id,
        organizationId,
        projectId,
        dueDate,
        userId: user?.id ?? '',
        purchaseOrderId: purchaseOrderId || undefined,
      });
      onSuccess(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkExisting() {
    if (!selectedTxId) { setError('Selecione um título financeiro.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updated = await linkExistingTransaction({
        invoiceId: invoice.id,
        transactionId: selectedTxId,
        userId: user?.id ?? '',
      });
      onSuccess(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao vincular título');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="f-card"
        style={{ width: 480, maxWidth: '90vw', margin: 0, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="f-section-title" style={{ marginBottom: 4 }}>Lançamento Financeiro</div>
        <div style={{ fontSize: 13, color: 'var(--ftext3)', marginBottom: 20 }}>
          {invoice.issuer_name} — {fmt(invoice.total_value)}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`f-btn f-btn-sm ${tab === 'new' ? 'f-btn-primary' : 'f-btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setTab('new')}
          >
            Criar Novo Título
          </button>
          <button
            className={`f-btn f-btn-sm ${tab === 'existing' ? 'f-btn-primary' : 'f-btn-ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setTab('existing')}
          >
            Vincular Existente
          </button>
        </div>

        {tab === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ftext2)', display: 'block', marginBottom: 4 }}>
                Obra / Projeto *
              </label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="f-input"
                style={{ width: '100%' }}
              >
                <option value="">Selecione...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ftext2)', display: 'block', marginBottom: 4 }}>
                Vincular Pedido de Compra <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional — habilita 3-way match)</span>
              </label>
              <select
                value={purchaseOrderId}
                onChange={e => setPurchaseOrderId(e.target.value)}
                className="f-input"
                style={{ width: '100%' }}
                disabled={!projectId}
              >
                <option value="">Sem vínculo com pedido</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>Pedido #{o.number}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ftext2)', display: 'block', marginBottom: 4 }}>
                Vencimento *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="f-input"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}

        {tab === 'existing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--ftext3)' }}>
              Selecione um título financeiro pendente gerado por contratos ou pedidos de compra para amarrar a esta NF-e.
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ftext2)', display: 'block', marginBottom: 4 }}>
                Título Pendente *
              </label>
              {existingTxs.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--fred)', padding: 12, border: '1px dashed var(--fred)', borderRadius: 8 }}>
                  Nenhum título pendente encontrado para este fornecedor.
                </div>
              ) : (
                <select
                  value={selectedTxId}
                  onChange={e => setSelectedTxId(e.target.value)}
                  className="f-input"
                  style={{ width: '100%' }}
                >
                  <option value="">Selecione um título...</option>
                  {existingTxs.map(tx => (
                    <option key={tx.id} value={tx.id}>
                      {fmtDate(tx.transaction_date)} — {fmt(tx.amount)} — {tx.description}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--fred)', fontSize: 13, fontWeight: 600, marginTop: 14 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="f-btn f-btn-ghost f-btn-sm" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="f-btn f-btn-primary f-btn-sm"
            onClick={tab === 'new' ? handleCreateNew : handleLinkExisting}
            disabled={saving || (tab === 'existing' && !selectedTxId)}
          >
            {saving ? 'Processando…' : (tab === 'new' ? 'Aprovar e Gerar Título' : 'Vincular a Título Selecionado')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detalhe da NF-e ──────────────────────────────────────────────────────────
function DocumentDetail({
  invoice: initialInvoice,
  projects,
  organizationId,
  onBack,
  onToast,
}: {
  invoice: NfeInvoice;
  projects: { id: string; name: string }[];
  organizationId: string;
  onBack: () => void;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [tab, setTab] = useState<'data' | 'items' | 'validation' | 'logs'>('data');
  const [detail, setDetail] = useState<NfeInvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [alerts, setAlerts] = useState<ReturnType<typeof validateNfe>>([]);

  useEffect(() => {
    if ((tab === 'items' || tab === 'validation') && !detail) {
      setLoading(true);
      getNfeInvoiceWithItems(invoice.id)
        .then(d => {
          setDetail(d);
          if (d) setAlerts(validateNfe(d));
        })
        .finally(() => setLoading(false));
    }
  }, [tab, invoice.id, detail]);

  const alertSummary = summarizeAlerts(alerts);

  const currentStep = STEP_ORDER[invoice.document_status] ?? -1;
  const isError = ['failed', 'dead_letter'].includes(invoice.document_status);
  const canApprove = invoice.document_status === 'completed' && !invoice.linked_transaction_id;
  const linkedProject = projects.find(p => p.id === invoice.project_id);

  return (
    <div className="f-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="f-btn f-btn-ghost f-btn-sm" onClick={onBack}>← Voltar</button>
        <div>
          <div className="f-page-title" style={{ fontSize: 18 }}>{invoice.issuer_name}</div>
          <div className="f-page-sub" style={{ marginTop: 2 }}>NF-e emitida em {fmtDate(invoice.issue_date)}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status={invoice.document_status} />
          {alertSummary.critical > 0 && (
            <span
              style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                background: 'var(--fred)', color: '#fff', padding: '4px 10px', borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={() => setTab('validation')}
              title="Ver alertas tributários"
            >
              ⚠ {alertSummary.critical} crítico{alertSummary.critical > 1 ? 's' : ''}
            </span>
          )}
          {alertSummary.warning > 0 && alertSummary.critical === 0 && (
            <span
              style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                background: '#d97706', color: '#fff', padding: '4px 10px', borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={() => setTab('validation')}
              title="Ver alertas tributários"
            >
              ⚠ {alertSummary.warning} atenção
            </span>
          )}
          {canApprove && (
            <button
              className="f-btn f-btn-primary f-btn-sm"
              onClick={() => setShowApproveModal(true)}
            >
              + Lançamento Financeiro
            </button>
          )}
          {invoice.linked_transaction_id && (
            <span style={{
              fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
              background: 'var(--fgreen)', color: '#fff', padding: '4px 10px', borderRadius: 8,
            }}>
              ✓ Título gerado
            </span>
          )}
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="f-card" style={{ marginBottom: 16 }}>
        <div className="f-pipeline">
          {PIPELINE_STEPS.map((step, idx) => (
            <div key={step.key} className="f-pipe-step">
              <div className={[
                'f-pipe-dot',
                idx < currentStep ? 'done' : '',
                idx === currentStep ? (isError ? 'error' : 'active') : '',
              ].filter(Boolean).join(' ')}>
                {idx < currentStep ? '✓' : idx + 1}
              </div>
              <div className="f-pipe-label">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['data', 'items', 'validation', 'logs'] as const).map(t => {
          const isActive = tab === t;
          const label =
            t === 'data'       ? 'Dados extraídos' :
            t === 'items'      ? `Itens (${detail?.items.length ?? '…'})` :
            t === 'validation' ? (
              alertSummary.total > 0
                ? `Validação ⚠ ${alertSummary.total}`
                : 'Validação'
            ) :
            'Logs';

          const hasCritical = t === 'validation' && alertSummary.critical > 0;
          return (
            <button
              key={t}
              className={`f-btn f-btn-sm ${isActive ? 'f-btn-primary' : 'f-btn-ghost'}`}
              onClick={() => setTab(t)}
              style={hasCritical && !isActive ? { borderColor: 'var(--fred)', color: 'var(--fred)' } : {}}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'data' && (
        <div className="f-card">
          <div className="f-section-title">Dados da nota fiscal</div>
          <div className="f-detail-grid">
            {([
              ['Emitente',          invoice.issuer_name],
              ['CNPJ emitente',     invoice.issuer_cnpj],
              ['Data de emissão',   fmtDate(invoice.issue_date)],
              ['Valor total',       invoice.document_status === 'completed' ? fmt(invoice.total_value) : '—'],
              ['Status documento',  invoice.document_status],
              ['Status pagamento',  invoice.payment_status],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}>
                <div className="f-detail-key">{k}</div>
                <div className="f-detail-val">{v}</div>
              </div>
            ))}
          </div>

          {/* Vínculo financeiro */}
          {invoice.linked_transaction_id && (
            <div style={{
              marginTop: 20, padding: '12px 16px', borderRadius: 10,
              background: 'color-mix(in srgb, var(--fgreen) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--fgreen) 30%, transparent)',
            }}>
              <div className="f-detail-key" style={{ marginBottom: 6 }}>Vínculo financeiro</div>
              <div style={{ fontSize: 13, color: 'var(--ftext)' }}>
                ✓ Título gerado em {fmtDate(invoice.approved_at ?? '')}
                {linkedProject && <> · Obra: <strong>{linkedProject.name}</strong></>}
              </div>
            </div>
          )}

          {/* Lançamento contábil (F4 — partida dobrada) */}
          {invoice.linked_transaction_id && (
            <JournalEntryCard invoiceId={invoice.id} />
          )}

          <div style={{ marginTop: 16 }}>
            <div className="f-detail-key">Chave de acesso</div>
            <div className="f-mono" style={{ marginTop: 4, wordBreak: 'break-all', color: 'var(--ftext2)', fontSize: 12 }}>
              {invoice.access_key}
            </div>
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="f-card">
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ftext3)' }}>
              Carregando itens…
            </div>
          )}
          {!loading && detail && detail.items.length > 0 && (
            <>
              <div className="f-section-title">Itens — {detail.items.length} produtos</div>
              <div className="f-table-wrap">
                <table className="f-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descrição</th>
                      <th>NCM</th>
                      <th>CFOP</th>
                      <th>Qtd</th>
                      <th>Vl. Unit.</th>
                      <th>Total</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id}>
                        <td className="f-mono" style={{ color: 'var(--ftext3)' }}>{item.line_number}</td>
                        <td style={{ fontWeight: 600 }}>{item.description}</td>
                        <td><span className="f-tag">{item.ncm ?? '—'}</span></td>
                        <td><span className="f-tag">{item.cfop ?? '—'}</span></td>
                        <td className="f-mono">{item.quantity} {item.commercial_unit}</td>
                        <td className="f-mono">{fmt(item.unit_value)}</td>
                        <td className="f-mono" style={{ fontWeight: 600 }}>{fmt(item.total_value)}</td>
                        <td><Category cat={item.category} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!loading && (!detail || detail.items.length === 0) && (
            <div className="f-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <div className="f-empty-title">Itens não disponíveis</div>
              <div>Documento ainda não foi processado com sucesso</div>
            </div>
          )}
        </div>
      )}

      {tab === 'validation' && (
        invoice.document_status !== 'completed' ? (
          <div className="f-card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ftext3)' }}>
            A validação tributária só está disponível para NF-es processadas com sucesso.
          </div>
        ) : (
          <TaxValidationPanel alerts={alerts} loading={loading} />
        )
      )}

      {tab === 'logs' && (
        <div className="f-card">
          <div className="f-section-title">Log de processamento</div>
          <div style={{ padding: '20px 0', color: 'var(--ftext3)', fontSize: 12, fontFamily: 'monospace' }}>
            Logs detalhados disponíveis na tabela parsing_errors do banco de dados.
          </div>
        </div>
      )}

      {showApproveModal && (
        <ApproveModal
          invoice={invoice}
          projects={projects}
          organizationId={organizationId}
          onClose={() => setShowApproveModal(false)}
          onSuccess={updated => {
            setInvoice(updated);
            setShowApproveModal(false);
            onToast('Título financeiro gerado com sucesso!', 'ok');
          }}
        />
      )}
    </div>
  );
}

// ── Lista de NF-es ────────────────────────────────────────────────────────────
export function FiscalDocuments({ organizationId, onToast }: Props) {
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<NfeInvoice | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listNfeInvoices(organizationId),
      projectService.listProjects(undefined, organizationId ?? undefined),
    ])
      .then(([invs, projs]) => {
        setInvoices(invs);
        setProjects(projs.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      })
      .catch(() => onToast('Erro ao carregar documentos', 'err'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  if (selected) {
    return (
      <DocumentDetail
        invoice={selected}
        projects={projects}
        organizationId={selected.organization_id}
        onBack={() => setSelected(null)}
        onToast={onToast}
      />
    );
  }

  const counts = {
    all:       invoices.length,
    completed: invoices.filter(i => i.document_status === 'completed').length,
    failed:    invoices.filter(i => ['failed', 'dead_letter'].includes(i.document_status)).length,
    queued:    invoices.filter(i => i.document_status === 'queued').length,
    linked:    invoices.filter(i => !!i.linked_transaction_id).length,
  };

  const shown = invoices.filter(i =>
    filter === 'all'      ? true :
    filter === 'failed'   ? ['failed', 'dead_letter'].includes(i.document_status) :
    filter === 'linked'   ? !!i.linked_transaction_id :
    filter === 'pendente' ? i.document_status === 'completed' && !i.linked_transaction_id :
    i.document_status === filter
  );

  const totalValue = invoices
    .filter(i => i.document_status === 'completed')
    .reduce((a, b) => a + b.total_value, 0);

  const successRate = counts.all > 0
    ? Math.round((counts.completed / counts.all) * 100)
    : 0;

  const deadLetterCount = invoices.filter(i => i.document_status === 'dead_letter').length;
  const pendingLink = counts.completed - counts.linked;

  const FILTERS = [
    { k: 'all',       label: 'Todos',            count: counts.all },
    { k: 'completed', label: 'Processados',       count: counts.completed },
    { k: 'pendente',  label: 'Aguard. aprovação', count: pendingLink },
    { k: 'linked',    label: 'Com título',        count: counts.linked },
    { k: 'failed',    label: 'Com erro',          count: counts.failed },
  ];

  return (
    <div className="f-page">
      <div className="f-page-header">
        <div className="f-page-title">Documentos fiscais</div>
        <div className="f-page-sub">
          {counts.all} NF-e registradas • {counts.completed} processadas • {counts.linked} com título gerado
        </div>
      </div>

      <div className="f-stats-grid">
        {[
          { label: 'Total ingerido',      val: counts.all,        color: 'var(--ftext)' },
          { label: 'Valor total',         val: fmt(totalValue),   color: 'var(--faccent)' },
          { label: 'Taxa sucesso',        val: `${successRate}%`, color: 'var(--fgreen)' },
          { label: 'Aguard. aprovação',   val: pendingLink,       color: pendingLink > 0 ? 'var(--fyellow, #d97706)' : 'var(--ftext3)' },
        ].map(s => (
          <div key={s.label} className="f-stat-card">
            <div className="f-stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="f-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="f-card">
        <div className="f-filters">
          {FILTERS.map(f => (
            <button
              key={f.k}
              className={`f-filter-chip ${filter === f.k ? 'active' : ''}`}
              onClick={() => setFilter(f.k)}
            >
              {f.label}{' '}
              <span style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: 10, marginLeft: 4 }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ftext3)' }}>
            Carregando…
          </div>
        ) : shown.length === 0 ? (
          <div className="f-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
            <div className="f-empty-title">Nenhum documento</div>
            <div>Faça upload de XMLs para começar</div>
          </div>
        ) : (
          <div className="f-table-wrap">
            <table className="f-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Fornecedor</th>
                  <th>Emissão</th>
                  <th>Valor</th>
                  <th>Título</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(inv => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(inv)}>
                    <td><Badge status={inv.document_status} /></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.issuer_name}</div>
                      <div className="f-mono" style={{ color: 'var(--ftext3)', marginTop: 2 }}>
                        {inv.issuer_cnpj}
                      </div>
                    </td>
                    <td>{fmtDate(inv.issue_date)}</td>
                    <td style={{ fontWeight: 700 }}>
                      {inv.document_status === 'completed' ? fmt(inv.total_value) : <span style={{ color: 'var(--ftext3)' }}>—</span>}
                    </td>
                    <td>
                      {inv.linked_transaction_id
                        ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--fgreen)' }}>✓ Gerado</span>
                        : inv.document_status === 'completed'
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fyellow, #d97706)' }}>Pendente</span>
                          : <span style={{ color: 'var(--ftext3)', fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td>
                      <button
                        className="f-btn f-btn-ghost f-btn-sm"
                        onClick={e => { e.stopPropagation(); setSelected(inv); }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deadLetterCount > 0 && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--fred) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--fred) 30%, transparent)',
          fontSize: 13, color: 'var(--fred)', fontWeight: 600,
        }}>
          ⚠ {deadLetterCount} documento(s) em dead letter — acesse Jobs para fazer replay.
        </div>
      )}
    </div>
  );
}
