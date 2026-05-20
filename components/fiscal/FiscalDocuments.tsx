import { useState, useEffect } from 'react';
import { listNfeInvoices, getNfeInvoiceWithItems } from '../../services/nfeService';
import type { NfeInvoice, NfeInvoiceWithItems, ProcessingStatus } from '../../types/fiscal';

interface Props {
  organizationId: string;
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

function DocumentDetail({
  invoice,
  onBack,
}: {
  invoice: NfeInvoice;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<'data' | 'items' | 'logs'>('data');
  const [detail, setDetail] = useState<NfeInvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'items' && !detail) {
      setLoading(true);
      getNfeInvoiceWithItems(invoice.id)
        .then(setDetail)
        .finally(() => setLoading(false));
    }
  }, [tab, invoice.id, detail]);

  const currentStep = STEP_ORDER[invoice.document_status] ?? -1;
  const isError = ['failed', 'dead_letter'].includes(invoice.document_status);

  return (
    <div className="f-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="f-btn f-btn-ghost f-btn-sm" onClick={onBack}>← Voltar</button>
        <div>
          <div className="f-page-title" style={{ fontSize: 18 }}>{invoice.issuer_name}</div>
          <div className="f-page-sub" style={{ marginTop: 2 }}>NF-e emitida em {fmtDate(invoice.issue_date)}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Badge status={invoice.document_status} />
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['data', 'items', 'logs'] as const).map(t => (
          <button
            key={t}
            className={`f-btn f-btn-sm ${tab === t ? 'f-btn-primary' : 'f-btn-ghost'}`}
            onClick={() => setTab(t)}
          >
            {t === 'data'  ? 'Dados extraídos' :
             t === 'items' ? `Itens (${detail?.items.length ?? '…'})` :
             'Logs'}
          </button>
        ))}
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

      {tab === 'logs' && (
        <div className="f-card">
          <div className="f-section-title">Log de processamento</div>
          <div style={{ padding: '20px 0', color: 'var(--ftext3)', fontSize: 12, fontFamily: 'monospace' }}>
            Logs detalhados disponíveis na tabela parsing_errors do banco de dados.
          </div>
        </div>
      )}
    </div>
  );
}

export function FiscalDocuments({ organizationId, onToast }: Props) {
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<NfeInvoice | null>(null);

  useEffect(() => {
    setLoading(true);
    listNfeInvoices(organizationId)
      .then(setInvoices)
      .catch(() => onToast('Erro ao carregar documentos', 'err'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  if (selected) {
    return <DocumentDetail invoice={selected} onBack={() => setSelected(null)} />;
  }

  const counts = {
    all:       invoices.length,
    completed: invoices.filter(i => i.document_status === 'completed').length,
    failed:    invoices.filter(i => ['failed', 'dead_letter'].includes(i.document_status)).length,
    queued:    invoices.filter(i => i.document_status === 'queued').length,
  };

  const shown = invoices.filter(i =>
    filter === 'all'    ? true :
    filter === 'failed' ? ['failed', 'dead_letter'].includes(i.document_status) :
    i.document_status === filter
  );

  const totalValue = invoices
    .filter(i => i.document_status === 'completed')
    .reduce((a, b) => a + b.total_value, 0);

  const successRate = counts.all > 0
    ? Math.round((counts.completed / counts.all) * 100)
    : 0;

  const deadLetterCount = invoices.filter(i => i.document_status === 'dead_letter').length;

  const FILTERS = [
    { k: 'all',       label: 'Todos',      count: counts.all },
    { k: 'completed', label: 'Concluídos', count: counts.completed },
    { k: 'failed',    label: 'Com erro',   count: counts.failed },
    { k: 'queued',    label: 'Na fila',    count: counts.queued },
  ];

  return (
    <div className="f-page">
      <div className="f-page-header">
        <div className="f-page-title">Documentos fiscais</div>
        <div className="f-page-sub">
          {counts.all} NF-e registradas • {counts.completed} processadas com sucesso
        </div>
      </div>

      <div className="f-stats-grid">
        {[
          { label: 'Total ingerido', val: counts.all,           color: 'var(--ftext)' },
          { label: 'Valor total',    val: fmt(totalValue),      color: 'var(--faccent)' },
          { label: 'Taxa sucesso',   val: `${successRate}%`,    color: 'var(--fgreen)' },
          { label: 'Dead letter',    val: deadLetterCount,      color: 'var(--fred)' },
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
                  <th>Chave de acesso</th>
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
                      <span className="f-mono f-truncate" style={{ display: 'block', maxWidth: 160, color: 'var(--ftext3)', fontSize: 10 }}>
                        {inv.access_key.substring(0, 22)}…
                      </span>
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
    </div>
  );
}
