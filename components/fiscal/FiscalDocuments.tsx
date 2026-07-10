import { useState, useEffect } from 'react';
import {
  FileText, Search, RefreshCw, CheckCircle2, Clock, AlertTriangle, ArrowLeft, Plus, UploadCloud,
} from 'lucide-react';
import { listNfeInvoices, getNfeInvoiceWithItems, approveAndLink, linkExistingTransaction, createOrderFromNfe } from '../../services/nfeService';
import { projectService } from '../../services/projectService';
import type { NfeInvoice, NfeInvoiceWithItems } from '../../types/fiscal';
import { supabase } from '../../lib/supabase';
import { validateNfe, summarizeAlerts } from '../../services/taxValidationService';
import { TaxValidationPanel } from './TaxValidationPanel';
import { JournalEntryCard } from './JournalEntryCard';
import { KpiCard } from '../ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import { useConfirm } from '../ui/confirm';

interface Props {
  organizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
  /** Ausente (undefined) quando nenhuma organização está selecionada — some o botão. */
  onOpenUpload?: () => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const CATEGORY_COLORS: Record<string, string> = {
  'aço': 'text-amber-600',
  'concreto': 'text-emerald-600',
  'elétrica': 'text-blue-600',
  'hidráulica': 'text-teal-600',
  'alvenaria': 'text-orange-600',
  'material': 'text-purple-600',
  'equipamento': 'text-cyan-600',
};

function CategoryText({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-sm font-normal text-gray-400">—</span>;
  return <span className={`text-sm font-normal ${CATEGORY_COLORS[cat] ?? 'text-gray-600'}`}>{cat}</span>;
}

const PIPELINE_STEPS = [
  { key: 'queued', label: 'Fila' },
  { key: 'processing', label: 'Processando' },
  { key: 'parsed', label: 'Parse' },
  { key: 'normalized', label: 'Normalizado' },
  { key: 'completed', label: 'Concluído' },
] as const;

// Colunas da tabela principal (lista de documentos)
const COLUMNS: ColumnConfig[] = [
  // Status é constante ("Processado") nesta lista — nfe_invoices só contém
  // documentos que já passaram pelo pipeline com sucesso; sem valor variável, sem ordenação.
  { key: 'status', label: 'Status', sortable: false },
  { key: 'issuer', label: 'Fornecedor', sortable: true },
  { key: 'issue_date', label: 'Emissão', sortable: true },
  { key: 'value', label: 'Valor', sortable: true },
  { key: 'link', label: 'Título', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

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
  const confirm = useConfirm();
  const [tab, setTab] = useState<'new' | 'existing'>('new');

  // Aba: Criar Novo
  const [projectId, setProjectId] = useState(invoice.project_id ?? '');
  const [purchaseOrderId, setPurchaseOrderId] = useState(invoice.purchase_order_id ?? '');
  const [orderMode, setOrderMode] = useState<'none' | 'existing' | 'new'>(invoice.purchase_order_id ? 'existing' : 'none');
  const [orders, setOrders] = useState<{ id: string; number: string }[]>([]);
  const [dueDate, setDueDate] = useState('');

  // Aba: Vincular Existente
  const [existingTxs, setExistingTxs] = useState<{ id: string; description: string; amount: number; transaction_date: string; entity_name: string }[]>([]);
  const [selectedTxId, setSelectedTxId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) { setOrders([]); setPurchaseOrderId(''); return; }
    supabase
      .from('purchase_orders')
      .select('id, number')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as { id: string; number: string }[]));
  }, [projectId]);

  useEffect(() => {
    if (tab === 'existing') {
      supabase
        .from('internal_transactions')
        .select('id, description, amount, transaction_date, entity_name')
        .eq('organization_id', organizationId)
        .eq('direction', 'DEBIT')
        .eq('status', 'PENDING')
        .ilike('entity_name', `%${invoice.issuer_name.split(' ')[0]}%`)
        .order('transaction_date', { ascending: true })
        .then(({ data }) => setExistingTxs(data ?? []));
    }
  }, [tab, organizationId, invoice.issuer_name]);

  async function handleCreateNew() {
    if (!projectId) { setError('Selecione uma obra.'); return; }
    if (!dueDate) { setError('Informe a data de vencimento.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let finalPurchaseOrderId = orderMode === 'existing' ? (purchaseOrderId || undefined) : undefined;

      if (orderMode === 'new') {
        const doCreate = async (autoCreate: boolean) => {
          return await createOrderFromNfe({
            invoiceId: invoice.id,
            projectId,
            userId: user?.id ?? '',
            autoCreateSupplier: autoCreate,
          });
        };
        try {
          const tempNfe = await doCreate(false);
          finalPurchaseOrderId = tempNfe.purchase_order_id ?? undefined;
        } catch (err: any) {
          if (err.message === 'SUPPLIER_NOT_FOUND') {
            const ok = await confirm({
              title: 'Fornecedor não encontrado',
              message: 'Fornecedor (emissor da NF-e) não encontrado. Deseja cadastrá-lo automaticamente e prosseguir?',
              variant: 'default',
              confirmLabel: 'Cadastrar e prosseguir',
            });
            if (ok) {
              const tempNfe = await doCreate(true);
              finalPurchaseOrderId = tempNfe.purchase_order_id ?? undefined;
            } else {
              setSaving(false); return;
            }
          } else {
            throw err;
          }
        }
      }

      const updated = await approveAndLink({
        invoiceId: invoice.id,
        organizationId,
        projectId,
        dueDate,
        userId: user?.id ?? '',
        purchaseOrderId: finalPurchaseOrderId,
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

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1';

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader
        title="Lançamento financeiro"
        description={`${invoice.issuer_name} — ${fmt(invoice.total_value)}`}
        onClose={onClose}
      />
      <ModalBody>
        <div className="inline-flex items-center h-9 bg-gray-50 px-1 rounded-[10px] border border-gray-100 gap-1 mb-5">
          <button
            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${tab === 'new' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab('new')}
          >
            Criar título
          </button>
          <button
            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${tab === 'existing' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab('existing')}
          >
            Vincular existente
          </button>
        </div>

        {tab === 'new' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>Obra / Projeto *</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Pedido de compra <span className="font-normal normal-case text-gray-400">(habilita 3-way match)</span>
              </label>
              <div className="flex gap-2 mb-2">
                {([['none', 'Sem vínculo'], ['existing', 'Vincular existente'], ['new', 'Criar novo']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`flex-1 h-9 px-2 rounded-[6px] text-[13px] font-medium transition-all ${orderMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => { setOrderMode(mode); setPurchaseOrderId(''); }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {orderMode === 'existing' && (
                <select value={purchaseOrderId} onChange={e => setPurchaseOrderId(e.target.value)} className={inputCls}>
                  <option value="">Selecione um pedido...</option>
                  {orders.map(o => <option key={o.id} value={o.id}>Pedido #{o.number}</option>)}
                </select>
              )}
              {orderMode === 'new' && (
                <div className="text-xs text-gray-500 mt-2">
                  Um novo pedido de compra será gerado copiando os itens desta NF-e.
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Vencimento *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        {tab === 'existing' && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-gray-500">
              Selecione um título financeiro pendente gerado por contratos ou pedidos de compra para amarrar a esta NF-e.
            </div>
            <div>
              <label className={labelCls}>Título pendente *</label>
              {existingTxs.length === 0 ? (
                <div className="text-sm text-red-600 p-3 border border-dashed border-red-300 rounded-[6px]">
                  Nenhum título pendente encontrado para este fornecedor.
                </div>
              ) : (
                <select value={selectedTxId} onChange={e => setSelectedTxId(e.target.value)} className={inputCls}>
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

        {error && <div className="text-sm font-medium text-red-600 mt-3">{error}</div>}
      </ModalBody>
      <ModalFooter>
        <button
          className="h-9 px-4 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
          onClick={onClose}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          className="h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
          onClick={tab === 'new' ? handleCreateNew : handleLinkExisting}
          disabled={saving || (tab === 'existing' && !selectedTxId)}
        >
          {saving ? 'Processando…' : (tab === 'new' ? 'Aprovar e gerar título' : 'Vincular título')}
        </button>
      </ModalFooter>
    </Modal>
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

  // nfe_invoices só existe após o pipeline concluir com sucesso — document_status
  // aqui é o ciclo de vida do documento (sempre 'active'), não o estágio do parse.
  const currentStep = PIPELINE_STEPS.findIndex(s => s.key === 'completed');
  const canApprove = !invoice.linked_transaction_id;
  const linkedProject = projects.find(p => p.id === invoice.project_id);

  const TABS = (['data', 'items', 'validation', 'logs'] as const).map(t => ({
    key: t,
    label:
      t === 'data' ? 'Dados extraídos' :
      t === 'items' ? `Itens (${detail?.items.length ?? '…'})` :
      t === 'validation' ? (alertSummary.total > 0 ? `Validação (${alertSummary.total})` : 'Validação') :
      'Logs',
    hasCritical: t === 'validation' && alertSummary.critical > 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black text-gray-900 truncate">{invoice.issuer_name}</h1>
          <p className="text-gray-400 text-xs mt-0.5 font-medium">NF-e emitida em {fmtDate(invoice.issue_date)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-normal text-emerald-700">Processado</span>
          {alertSummary.critical > 0 && (
            <button
              onClick={() => setTab('validation')}
              className="text-sm font-medium text-red-600 hover:underline"
              title="Ver alertas tributários"
            >
              {alertSummary.critical} crítico{alertSummary.critical > 1 ? 's' : ''}
            </button>
          )}
          {alertSummary.warning > 0 && alertSummary.critical === 0 && (
            <button
              onClick={() => setTab('validation')}
              className="text-sm font-medium text-amber-600 hover:underline"
              title="Ver alertas tributários"
            >
              {alertSummary.warning} atenção
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => setShowApproveModal(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" /> Lançamento financeiro
            </button>
          )}
          {invoice.linked_transaction_id && (
            <span className="inline-flex items-center gap-1.5 text-sm font-normal text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Título gerado
            </span>
          )}
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
        <div className="flex items-center">
          {PIPELINE_STEPS.map((step, idx) => (
            <div key={step.key} className="flex-1 text-center relative">
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className="absolute top-4 right-0 w-full h-0.5 bg-gray-200 -translate-y-1/2" />
              )}
              <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center mx-auto mb-1.5 text-xs font-bold ${
                idx < currentStep ? 'border-emerald-500 bg-emerald-50 text-emerald-600' :
                idx === currentStep ? 'border-blue-500 bg-blue-50 text-blue-600' :
                'border-gray-200 bg-white text-gray-400'
              }`}>
                {idx < currentStep ? '✓' : idx + 1}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${
              tab === t.key ? 'bg-blue-600 text-white' : t.hasCritical ? 'text-red-600 hover:text-red-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'data' && (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
          <div className="grid grid-cols-2 gap-5">
            {([
              ['Emitente', invoice.issuer_name],
              ['CNPJ emitente', invoice.issuer_cnpj],
              ['Data de emissão', fmtDate(invoice.issue_date)],
              ['Valor total', fmt(invoice.total_value)],
              ['Status documento', 'Concluído'],
              ['Status pagamento', invoice.payment_status],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">{k}</div>
                <div className="text-sm font-medium text-gray-800">{v}</div>
              </div>
            ))}
          </div>

          {invoice.linked_transaction_id && (
            <div className="mt-5 p-4 rounded-[10px] bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1.5">Vínculo financeiro</div>
              <div className="text-sm text-emerald-900">
                Título gerado em {fmtDate(invoice.approved_at ?? '')}
                {linkedProject && <> · Obra: <strong>{linkedProject.name}</strong></>}
              </div>
            </div>
          )}

          {invoice.linked_transaction_id && (
            <div className="mt-4">
              <JournalEntryCard invoiceId={invoice.id} />
            </div>
          )}

          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Chave de acesso</div>
            <div className="text-xs text-gray-500 break-all font-normal">{invoice.access_key}</div>
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500 text-sm">Carregando itens…</p>
            </div>
          )}
          {!loading && detail && detail.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2">NCM</th>
                    <th className="px-4 py-2">CFOP</th>
                    <th className="px-4 py-2">Qtd</th>
                    <th className="px-4 py-2">Vl. unit.</th>
                    <th className="px-4 py-2">Total</th>
                    <th className="px-4 py-2">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-500">{item.line_number}</td>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-700">{item.description}</td>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{item.ncm ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{item.cfop ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{item.quantity} {item.commercial_unit}</td>
                      <td className="px-4 py-2.5 text-sm font-normal text-gray-600">{fmt(item.unit_value)}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{fmt(item.total_value)}</td>
                      <td className="px-4 py-2.5"><CategoryText cat={item.category} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && (!detail || detail.items.length === 0) && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">Itens não disponíveis</h3>
              <p className="text-sm text-gray-500">Documento ainda não foi processado com sucesso.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'validation' && (
        <TaxValidationPanel alerts={alerts} loading={loading} />
      )}

      {tab === 'logs' && (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-3">Log de processamento</div>
          <div className="text-xs text-gray-400 font-mono">
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
export function FiscalDocuments({ organizationId, onToast, onOpenUpload }: Props) {
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<NfeInvoice | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedState<string>('fiscalDocuments:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'fiscalDocumentsColumns');

  const loadData = () => {
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
  };

  useEffect(loadData, [organizationId]);

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

  // nfe_invoices só contém documentos que já passaram pelo pipeline com sucesso
  // (falhas ficam em raw_documents/processing_jobs, exibidas na aba "Fila & Jobs").
  const counts = {
    all: invoices.length,
    completed: invoices.length,
    linked: invoices.filter(i => !!i.linked_transaction_id).length,
  };
  const pendingLink = counts.all - counts.linked;
  const totalValue = invoices.reduce((a, b) => a + b.total_value, 0);
  const successRate = 100;

  const FILTERS = [
    { k: 'all', label: 'Todos', count: counts.all },
    { k: 'pendente', label: 'Aguard. aprovação', count: pendingLink },
    { k: 'linked', label: 'Com título', count: counts.linked },
  ];

  const term = searchTerm.trim().toLowerCase();
  const filtered = invoices.filter(i => {
    if (filter === 'linked' && !i.linked_transaction_id) return false;
    if (filter === 'pendente' && i.linked_transaction_id) return false;
    if (term && !i.issuer_name.toLowerCase().includes(term) && !i.issuer_cnpj.includes(term)) return false;
    return true;
  });

  const shown = [...filtered].sort((a, b) => {
    if (tableColumns.sortColumn) {
      const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
      switch (tableColumns.sortColumn) {
        case 'issuer': return a.issuer_name.localeCompare(b.issuer_name) * dir;
        case 'issue_date': return (new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()) * dir;
        case 'value': return (a.total_value - b.total_value) * dir;
        case 'link': return (Number(!!a.linked_transaction_id) - Number(!!b.linked_transaction_id)) * dir;
      }
    }
    return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime(); // default: mais recente primeiro
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Documentos fiscais</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">
          {counts.all} NF-e registradas • {counts.completed} processadas • {counts.linked} com título gerado
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total ingerido" value={counts.all} icon={<FileText className="w-5 h-5" />} color="blue" />
        <KpiCard label="Valor total" value={fmt(totalValue)} icon={<FileText className="w-5 h-5" />} color="indigo" />
        <KpiCard label="Taxa de sucesso" value={`${successRate}%`} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
        <KpiCard label="Aguard. aprovação" value={pendingLink} icon={<Clock className="w-5 h-5" />} color={pendingLink > 0 ? 'amber' : 'gray'} />
      </div>

      <div className="flex flex-col md:flex-row gap-2.5 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por fornecedor ou CNPJ..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
          <RefreshCw className="w-4 h-4" />
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
        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <UploadCloud className="w-4 h-4" /> Enviar NF-e
          </button>
        )}
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
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento encontrado</h3>
          <p className="text-sm text-gray-500">Faça upload de XMLs para começar ou ajuste os filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                {tableColumns.visibleColumns.includes('status') && (
                  <SortableHeader colKey="status" label="Status" sortable={false} uppercase={false}
                    className="px-6 py-2 border-r border-gray-100" />
                )}
                {tableColumns.visibleColumns.includes('issuer') && (
                  <SortableHeader colKey="issuer" label="Fornecedor" uppercase={false}
                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                    className="px-6 py-2 border-r border-gray-100" />
                )}
                {tableColumns.visibleColumns.includes('issue_date') && (
                  <SortableHeader colKey="issue_date" label="Emissão" uppercase={false}
                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                    className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                )}
                {tableColumns.visibleColumns.includes('value') && (
                  <SortableHeader colKey="value" label="Valor" uppercase={false}
                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                    className="px-6 py-2 border-r border-gray-100" />
                )}
                {tableColumns.visibleColumns.includes('link') && (
                  <SortableHeader colKey="link" label="Título" uppercase={false}
                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                    className="px-6 py-2 border-r border-gray-100" />
                )}
                {tableColumns.visibleColumns.includes('actions') && (
                  <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shown.map(inv => (
                <tr
                  key={inv.id}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  onClick={() => setSelected(inv)}
                >
                  {tableColumns.visibleColumns.includes('status') && (
                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-emerald-700">Processado</td>
                  )}
                  {tableColumns.visibleColumns.includes('issuer') && (
                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                      <div className="text-sm font-normal text-gray-700">{inv.issuer_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{inv.issuer_cnpj}</div>
                    </td>
                  )}
                  {tableColumns.visibleColumns.includes('issue_date') && (
                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{fmtDate(inv.issue_date)}</td>
                  )}
                  {tableColumns.visibleColumns.includes('value') && (
                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">{fmt(inv.total_value)}</td>
                  )}
                  {tableColumns.visibleColumns.includes('link') && (
                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                      {inv.linked_transaction_id
                        ? <span className="text-emerald-700">Gerado</span>
                        : <span className="text-amber-600">Pendente</span>}
                    </td>
                  )}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <td className="px-6 py-2.5 text-right">
                      <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelected(inv)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
