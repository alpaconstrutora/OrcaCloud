import { useState, useEffect } from 'react';
import {
  FileText, Search, RefreshCw, CheckCircle2, ArrowLeft, Plus, ShoppingCart, MoveHorizontal,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { listNfeInvoices, getNfeInvoiceWithItems, approveAndLink, linkExistingTransaction, createOrderFromNfe, deleteNfeInvoice } from '../../services/nfeService';
import { projectService } from '../../services/projectService';
import { MissingCodeError } from '../../services/orderNumberingService';
import type { NfeInvoice, NfeInvoiceWithItems } from '../../types/fiscal';
import { supabase } from '../../lib/supabase';
import { validateNfe, summarizeAlerts } from '../../services/taxValidationService';
import { TaxValidationPanel } from './TaxValidationPanel';
import { JournalEntryCard } from './JournalEntryCard';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import { useConfirm } from '../ui/confirm';

interface Props {
  organizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
  /** Navega para Suprimentos > Pedidos > detalhe do pedido. */
  onViewOrder?: (orderId: string) => void;
  /** Navega para a aba Contas a Pagar, escopada pela obra do título vinculado. */
  onViewPayable?: (projectId: string | null) => void;
  /**
   * Cromo do módulo pai (abas §3 + botões §4). Vem por prop porque a anatomia
   * do §1 exige KPIs antes das toolbars, mas os KPIs são desta tela e as
   * toolbars são do FiscalModule — quem decide a ordem final é o filho.
   */
  chromeSlot?: React.ReactNode;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';
/**
 * O número da NF-e (nNF) não é persistido em coluna própria — é extraído da
 * chave de acesso (44 dígitos), posições 26-34 do layout padrão da SEFAZ.
 */
const nfNumber = (accessKey: string | null | undefined) =>
  accessKey && accessKey.length === 44 ? String(Number(accessKey.slice(25, 34))) : '—';

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
  { key: 'code', label: 'Código', sortable: true },
  { key: 'nf_number', label: 'Nº NF-e', sortable: true },
  // Status é constante ("Processado") nesta lista — nfe_invoices só contém
  // documentos que já passaram pelo pipeline com sucesso; sem valor variável, sem ordenação.
  { key: 'status', label: 'Status', sortable: false },
  { key: 'issuer', label: 'Fornecedor', sortable: true },
  { key: 'issue_date', label: 'Emissão', sortable: true },
  { key: 'value', label: 'Valor', sortable: true },
  { key: 'link', label: 'Título', sortable: true },
  { key: 'order', label: 'Pedido', sortable: true },
  { key: 'payable', label: 'Contas a Pagar', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
// São chute inicial; o botão de auto-ajuste da toolbar (§6.1.2) mede o conteúdo real.
// A soma (1240px) cabe no container real da tela (~1290px com a sidebar aberta),
// para "Ações" não nascer cortada exigindo scroll lateral logo ao abrir. "Ações"
// leva 215px porque hospeda "Ver detalhes" + dois ícones sem quebrar em duas linhas.
const COL_WIDTHS: Record<string, number> = {
  code: 90, nf_number: 95, status: 105, issuer: 210, issue_date: 100,
  value: 115, link: 90, order: 95, payable: 125, actions: 215,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' fica fora (coluna estrutural fixa à direita).
// `overflow-hidden` é exigência do §6.1: o <th> hospeda a alça de redimensionamento.
const DOCUMENTS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  nf_number: { label: 'Nº NF-e', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  status: { label: 'Status', sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  issuer: { label: 'Fornecedor', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  issue_date: { label: 'Emissão', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  value: { label: 'Valor', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  link: { label: 'Título', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  order: { label: 'Pedido', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
  payable: { label: 'Contas a Pagar', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna. Colunas 'order'/'payable' navegam
// para outras telas — dependem de callbacks e do mapa de números de pedido
// resolvidos em runtime, por isso recebem um `ctx`.
function renderDocumentCell(
  key: string,
  inv: NfeInvoice,
  ctx: { orderNumbers: Record<string, string>; onViewOrder?: (orderId: string) => void; onViewPayable?: (projectId: string | null) => void },
): React.ReactNode {
  switch (key) {
    case 'code':
      return <span className="text-sm font-normal text-gray-600">{inv.code ?? '—'}</span>;
    case 'nf_number':
      return <span className="text-sm font-normal text-gray-600">{nfNumber(inv.access_key)}</span>;
    case 'status':
      return <span className="text-sm font-normal text-emerald-700">Processado</span>;
    case 'issuer':
      return (
        // Coluna de largura fixa (§6.1) não recorta sozinha — `truncate` só age em
        // bloco (§6.1.2), e o nome inteiro fica no `title`.
        <>
          <div className="block truncate text-sm font-normal text-gray-700" title={inv.issuer_name}>{inv.issuer_name}</div>
          <div className="block truncate text-xs text-gray-400 mt-0.5">{inv.issuer_cnpj}</div>
        </>
      );
    case 'issue_date':
      return <span className="text-sm font-normal text-gray-600">{fmtDate(inv.issue_date)}</span>;
    case 'value':
      return <span className="text-sm font-medium text-gray-800">{fmt(inv.total_value)}</span>;
    case 'link':
      return inv.linked_transaction_id
        ? <span className="text-sm font-normal text-emerald-700">Gerado</span>
        : <span className="text-sm font-normal text-amber-600">Pendente</span>;
    case 'order':
      return inv.purchase_order_id && ctx.onViewOrder ? (
        <button
          onClick={e => { e.stopPropagation(); ctx.onViewOrder!(inv.purchase_order_id!); }}
          className="text-sm font-normal text-blue-600 hover:text-blue-800 hover:underline"
        >
          #{ctx.orderNumbers[inv.purchase_order_id] ?? '…'}
        </button>
      ) : (
        <span className="text-sm font-normal text-gray-400">—</span>
      );
    case 'payable':
      return inv.linked_transaction_id && ctx.onViewPayable ? (
        <button
          onClick={e => { e.stopPropagation(); ctx.onViewPayable!(inv.project_id); }}
          className="text-sm font-normal text-blue-600 hover:text-blue-800 hover:underline"
        >
          Ver título
        </button>
      ) : (
        <span className="text-sm font-normal text-gray-400">—</span>
      );
    default:
      return null;
  }
}

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
  const [dueDate, setDueDate] = useState(invoice.issue_date ?? '');

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
  // §21 — rótulo de campo em sentence case, sem uppercase/tracking
  const labelCls = 'text-xs font-semibold text-slate-500 block mb-1';

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
                Pedido de compra <span className="font-normal text-gray-400">(habilita 3-way match)</span>
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

// ── Modal: Gerar Pedido de Compra (standalone, sem lançamento financeiro) ────
function GenerateOrderModal({
  invoice,
  projects,
  onClose,
  onSuccess,
}: {
  invoice: NfeInvoice;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: (updated: NfeInvoice, orderNumber: string) => void;
}) {
  const confirm = useConfirm();
  const [projectId, setProjectId] = useState(invoice.project_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    if (!projectId) { setError('Selecione uma obra.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const doCreate = async (autoCreate: boolean) => createOrderFromNfe({
        invoiceId: invoice.id,
        projectId,
        userId: user?.id ?? '',
        autoCreateSupplier: autoCreate,
      });

      let updated: NfeInvoice;
      try {
        updated = await doCreate(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SUPPLIER_NOT_FOUND') {
          const ok = await confirm({
            title: 'Fornecedor não encontrado',
            message: 'Fornecedor (emissor da NF-e) não encontrado. Deseja cadastrá-lo automaticamente e prosseguir?',
            variant: 'default',
            confirmLabel: 'Cadastrar e prosseguir',
          });
          if (!ok) { setSaving(false); return; }
          updated = await doCreate(true);
        } else {
          throw err;
        }
      }

      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id, number')
        .eq('id', updated.purchase_order_id!)
        .single<{ id: string; number: string }>();

      onSuccess(updated, order?.number ?? '');
    } catch (e: unknown) {
      setError(e instanceof MissingCodeError ? e.message : e instanceof Error ? e.message : 'Erro ao gerar pedido');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
  const labelCls = 'text-xs font-semibold text-slate-500 block mb-1';

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader
        title="Gerar pedido de compra"
        description={`${invoice.issuer_name} — ${fmt(invoice.total_value)}`}
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Obra / Projeto *</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="text-xs text-gray-500">
            Um pedido de compra será gerado copiando os itens desta NF-e.
          </div>
        </div>
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
          onClick={handleGenerate}
          disabled={saving}
        >
          {saving ? 'Gerando…' : 'Gerar pedido'}
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
  onViewOrder,
}: {
  invoice: NfeInvoice;
  projects: { id: string; name: string }[];
  organizationId: string;
  onBack: () => void;
  onToast: (msg: string, type: 'ok' | 'err') => void;
  onViewOrder?: (orderId: string) => void;
}) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [tab, setTab] = useState<'data' | 'items' | 'validation' | 'logs'>('data');
  const [detail, setDetail] = useState<NfeInvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showGenerateOrderModal, setShowGenerateOrderModal] = useState(false);
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
          {invoice.purchase_order_id ? (
            onViewOrder && (
              <button
                onClick={() => onViewOrder(invoice.purchase_order_id!)}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Ver pedido de compra
              </button>
            )
          ) : (
            <button
              onClick={() => setShowGenerateOrderModal(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
            >
              <ShoppingCart className="w-[15px] h-[15px]" /> Gerar pedido de compra
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

      {/* Tabs — anatomia canônica §19.1: card externo + trilho cinza + aba ativa branca */}
      <div className="bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="inline-flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white text-blue-600 shadow-sm' : t.hasCritical ? 'text-red-600 hover:text-red-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
                <div className="text-xs font-semibold text-slate-500 mb-1">{k}</div>
                <div className="text-sm font-medium text-gray-800">{v}</div>
              </div>
            ))}
          </div>

          {invoice.linked_transaction_id && (
            <div className="mt-5 p-4 rounded-[10px] bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-700 mb-1.5">Vínculo financeiro</div>
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
            <div className="text-xs font-semibold text-slate-500 mb-1">Chave de acesso</div>
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
                    <th className="px-6 py-2 border-r border-gray-100">#</th>
                    <th className="px-6 py-2 border-r border-gray-100">Descrição</th>
                    <th className="px-6 py-2 border-r border-gray-100">NCM</th>
                    <th className="px-6 py-2 border-r border-gray-100">CFOP</th>
                    <th className="px-6 py-2 border-r border-gray-100">Qtd</th>
                    <th className="px-6 py-2 border-r border-gray-100">Vl. unit.</th>
                    <th className="px-6 py-2 border-r border-gray-100">Total</th>
                    <th className="px-6 py-2">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.line_number}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.description}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.ncm ?? '—'}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.cfop ?? '—'}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.quantity} {item.commercial_unit}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{fmt(item.unit_value)}</td>
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">{fmt(item.total_value)}</td>
                      <td className="px-6 py-2.5"><CategoryText cat={item.category} /></td>
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
          <div className="text-xs font-semibold text-slate-500 mb-3">Log de processamento</div>
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

      {showGenerateOrderModal && (
        <GenerateOrderModal
          invoice={invoice}
          projects={projects}
          onClose={() => setShowGenerateOrderModal(false)}
          onSuccess={updated => {
            setInvoice(updated);
            setShowGenerateOrderModal(false);
            onToast('Pedido de compra gerado com sucesso!', 'ok');
          }}
        />
      )}
    </div>
  );
}

// ── Lista de NF-es ────────────────────────────────────────────────────────────
export function FiscalDocuments({ organizationId, onToast, onViewOrder, onViewPayable, chromeSlot }: Props) {
  const [invoices, setInvoices] = useState<NfeInvoice[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<NfeInvoice | null>(null);
  const [generatingOrderFor, setGeneratingOrderFor] = useState<NfeInvoice | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedState<string>('fiscalDocuments:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'fiscalDocumentsColumns');
  const cols = useResizableColumns(COL_WIDTHS, 'fiscalDocumentsColWidths');
  const confirm = useConfirm();

  const handleDelete = async (inv: NfeInvoice) => {
    if (inv.linked_transaction_id) {
      onToast('Não é possível excluir: NF-e já possui título financeiro vinculado', 'err');
      return;
    }
    const ok = await confirm({
      title: 'Cancelar NF-e?',
      message: `Cancelar a NF-e de "${inv.issuer_name}"? Ela sai desta lista, mas o documento continua guardado — nota fiscal tem retenção legal e não é apagada do sistema.`,
      variant: 'danger',
      confirmLabel: 'Cancelar NF-e',
    });
    if (!ok) return;
    try {
      await deleteNfeInvoice(inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      onToast('NF-e cancelada', 'ok');
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Erro ao cancelar NF-e', 'err');
    }
  };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      listNfeInvoices(organizationId),
      projectService.listProjects({ organizationId: organizationId ?? undefined }),
    ])
      .then(async ([invs, projs]) => {
        setInvoices(invs);
        setProjects(projs.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));

        const orderIds = [...new Set(invs.map(i => i.purchase_order_id).filter((id): id is string => !!id))];
        if (orderIds.length > 0) {
          const { data } = await supabase.from('purchase_orders').select('id, number').in('id', orderIds);
          const map: Record<string, string> = {};
          (data ?? []).forEach((o: { id: string; number: string }) => { map[o.id] = o.number; });
          setOrderNumbers(map);
        } else {
          setOrderNumbers({});
        }
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
        onViewOrder={onViewOrder}
      />
    );
  }

  // nfe_invoices só contém documentos que já passaram pelo pipeline com sucesso
  // (falhas ficam em raw_documents/processing_jobs, exibidas na aba "Fila").
  const counts = {
    all: invoices.length,
    linked: invoices.filter(i => !!i.linked_transaction_id).length,
  };
  const pendingLink = counts.all - counts.linked;

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
        case 'code': return (a.code ?? '').localeCompare(b.code ?? '', 'pt-BR', { numeric: true }) * dir;
        case 'nf_number': return nfNumber(a.access_key).localeCompare(nfNumber(b.access_key), 'pt-BR', { numeric: true }) * dir;
        case 'order': return (orderNumbers[a.purchase_order_id ?? ''] ?? '').localeCompare(orderNumbers[b.purchase_order_id ?? ''] ?? '', 'pt-BR', { numeric: true }) * dir;
        case 'payable': return (Number(!!a.linked_transaction_id) - Number(!!b.linked_transaction_id)) * dir;
      }
    }
    return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime(); // default: mais recente primeiro
  });

  // Soma exata das colunas visíveis — §6.1 proíbe `w-full` com table-layout:fixed
  // (o navegador redistribuiria a folga e o arraste redimensionaria a coluna vizinha).
  const visibleDataCols = tableColumns.orderedVisibleColumns.filter(key => key !== 'actions');
  const tableTotalWidth = visibleDataCols.reduce((s, key) => s + cols.getWidth(key), 0)
    + (tableColumns.visibleColumns.includes('actions') ? cols.getWidth('actions') : 0);

  return (
    <div className="space-y-6">
      {/* Cromo do módulo pai (abas §3 + botões §4). Os KPIs que abriam esta tela
          migraram para a aba Análise, então o cromo é o primeiro bloco após o título. */}
      {chromeSlot}

      {/* Toolbar acoplada à tabela — §5.2: border/rounded/shadow só no pai; a
          toolbar interna não tem moldura própria, só o border-b. */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-2 border-b border-gray-100 bg-white">
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

            {/* Filtros rápidos (§5) — reduzem o conjunto, por isso ficam na barra de
                busca e não na toolbar de abas (§19.1), que é navegação. */}
            <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              {FILTERS.map(f => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                    filter === f.k ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {f.label} <span className="opacity-60 text-xs ml-1">{f.count}</span>
                </button>
              ))}
            </div>

            <button onClick={loadData} title="Recarregar" className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0">
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
              {/* Auto-ajuste (§6.1.2) sob comando explícito — nunca automático:
                  recalcular a cada busca/filtro faria as colunas dançarem enquanto o
                  usuário digita. O duplo clique no divisor segue sendo "restaurar
                  largura padrão"; autofit é botão próprio. */}
              <button
                onClick={() => cols.autoFit()}
                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                title="Ajustar largura das colunas ao conteúdo"
              >
                <MoveHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
          </div>
        ) : shown.length === 0 ? (
          /* Empty state sem bg/border/rounded próprios — o card acoplado já supre (§5.2) */
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento encontrado</h3>
            <p className="text-sm text-gray-500">Faça upload de XMLs para começar ou ajuste os filtros.</p>
          </div>
        ) : (
          /* Cabeçalho fixo (§6.5) — a lista de NF-e cresce sem teto ao longo do tempo */
          <div className="overflow-auto max-h-[70vh]">
          <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
            <colgroup>
              {visibleDataCols.map(key => (
                <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
              ))}
              {/* Espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para
                  "Ações" não andar a cada arraste e desalinhar da toolbar acoplada. */}
              <col />
              {tableColumns.visibleColumns.includes('actions') && (
                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
              )}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                {visibleDataCols.map(key => {
                  const def = DOCUMENTS_COLUMN_HEADERS[key];
                  if (!def) return null;
                  return (
                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                      onSort={tableColumns.handleColumnSort}
                      onMoveColumn={tableColumns.moveColumn}
                      className={def.className}>
                      <cols.ResizeHandle colKey={key} />
                    </SortableHeader>
                  );
                })}
                {/* espaçador — casa com o <col /> sem largura do colgroup, na mesma ordem */}
                <th aria-hidden="true" className="border-r border-gray-100" />
                {tableColumns.visibleColumns.includes('actions') && (
                  <th className="px-6 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                    Ações
                    <cols.ResizeHandle colKey="actions" />
                  </th>
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
                  {visibleDataCols.map(key => (
                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 overflow-hidden">
                      {renderDocumentCell(key, inv, { orderNumbers, onViewOrder, onViewPayable })}
                    </td>
                  ))}
                  {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                  <td aria-hidden="true" className="border-r border-gray-100"></td>
                  {tableColumns.visibleColumns.includes('actions') && (
                    <td className="px-6 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelected(inv)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          Ver detalhes
                        </button>
                        {!inv.purchase_order_id && (
                          <button
                            onClick={() => setGeneratingOrderFor(inv)}
                            title="Gerar pedido de compra"
                            className="text-gray-600 hover:text-blue-600 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </button>
                        )}
                        <ActionIconButton kind="delete" title="Excluir NF-e" onClick={() => handleDelete(inv)} />
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

      {generatingOrderFor && (
        <GenerateOrderModal
          invoice={generatingOrderFor}
          projects={projects}
          onClose={() => setGeneratingOrderFor(null)}
          onSuccess={(updated, orderNumber) => {
            setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
            if (updated.purchase_order_id) {
              setOrderNumbers(prev => ({ ...prev, [updated.purchase_order_id!]: orderNumber }));
            }
            setGeneratingOrderFor(null);
            onToast('Pedido de compra gerado com sucesso!', 'ok');
          }}
        />
      )}
    </div>
  );
}
