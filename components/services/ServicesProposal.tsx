import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, FileText, Send, Download } from 'lucide-react';
import {
  servicesCommercialService,
  ServiceProposal,
  ServiceBudget,
  ServiceOpportunity,
  EngineeringProjectSummary,
} from '../../services/servicesCommercialService';
import { useServicesToast } from './useServicestoast';
import ServicesToast from './ServicesToast';

interface Props {
  opportunityId: string;
  organizationId: string;
  onBack: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', expired: 'Expirada',
};

const ServicesProposal: React.FC<Props> = ({ opportunityId, organizationId, onBack }) => {
  const [proposal, setProposal] = useState<ServiceProposal | null>(null);
  const [budget, setBudget] = useState<ServiceBudget | null>(null);
  const [opportunity, setOpportunity] = useState<ServiceOpportunity | null>(null);
  const [engineeringSummary, setEngineeringSummary] = useState<EngineeringProjectSummary | null>(null);
  const [form, setForm] = useState({
    scope: '',
    payment_terms: '',
    delivery_term_days: '',
    valid_until: '',
  });
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { toasts, show: showToast, dismiss } = useServicesToast();

  const load = useCallback(async () => {
    const [p, b, o] = await Promise.all([
      servicesCommercialService.getProposal(opportunityId),
      servicesCommercialService.getBudget(opportunityId),
      servicesCommercialService.getOpportunity(opportunityId),
    ]);
    setProposal(p);
    setBudget(b);
    setOpportunity(o);
    if (o?.budget_source === 'engineering' && o.engineering_project_id) {
      const summary = await servicesCommercialService.getEngineeringSummary(o.engineering_project_id);
      setEngineeringSummary(summary);
    } else {
      setEngineeringSummary(null);
    }
    if (p) {
      setForm({
        scope: p.scope ?? '',
        payment_terms: p.payment_terms ?? '',
        delivery_term_days: p.delivery_term_days?.toString() ?? '',
        valid_until: p.valid_until ?? '',
      });
    }
  }, [opportunityId]);

  const totalValue = engineeringSummary?.total ?? budget?.total ?? 0;

  useEffect(() => { load(); }, [load]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const save = async (status?: ServiceProposal['status']) => {
    setSaving(true);
    try {
      const payload = {
        opportunity_id: opportunityId,
        organization_id: organizationId,
        budget_id: budget?.id ?? null,
        total_value: totalValue,
        scope: form.scope || null,
        payment_terms: form.payment_terms || null,
        delivery_term_days: form.delivery_term_days ? Number(form.delivery_term_days) : null,
        valid_until: form.valid_until || null,
        status: (status ?? proposal?.status ?? 'draft') as ServiceProposal['status'],
      };
      const saved = proposal
        ? await servicesCommercialService.updateProposal(proposal.id, payload)
        : await servicesCommercialService.createProposal(payload);
      setProposal(saved);
      showToast('Rascunho salvo!');
    } catch {
      showToast('Erro ao salvar a proposta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const markSent = async () => {
    setSaving(true);
    try {
      const payload = {
        opportunity_id: opportunityId,
        organization_id: organizationId,
        budget_id: budget?.id ?? null,
        total_value: totalValue,
        scope: form.scope || null,
        payment_terms: form.payment_terms || null,
        delivery_term_days: form.delivery_term_days ? Number(form.delivery_term_days) : null,
        valid_until: form.valid_until || null,
        status: 'sent' as const,
        sent_at: new Date().toISOString(),
      };
      const saved = proposal
        ? await servicesCommercialService.updateProposal(proposal.id, payload)
        : await servicesCommercialService.createProposal(payload);
      setProposal(saved);
      showToast('Proposta marcada como enviada!');
    } catch {
      showToast('Erro ao atualizar a proposta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const printProposal = () => {
    setPrinting(true);
    const win = window.open('', '_blank');
    if (!win) { setPrinting(false); return; }

    const total = totalValue;
    const isEngineering = !!engineeringSummary;
    const subtotalForPrint = engineeringSummary?.subtotal ?? budget?.subtotal ?? 0;
    const bdiPct = engineeringSummary?.bdi_pct ?? 0;
    const marginPct = engineeringSummary?.margin_pct ?? budget?.margin_pct ?? 0;
    const bdiValue = subtotalForPrint * bdiPct / 100;
    const marginValue = subtotalForPrint * (1 + bdiPct / 100) * (marginPct / 100);
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Proposta ${proposal?.proposal_number ?? ''}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { font-size: 22px; color: #1d4ed8; margin-bottom: 4px; }
    .number { font-size: 13px; color: #6b7280; margin-bottom: 32px; }
    h2 { font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th { text-align: left; padding: 8px 6px; background: #f3f4f6; }
    td { padding: 7px 6px; border-bottom: 1px solid #f3f4f6; }
    .total-row td { font-weight: bold; font-size: 15px; border-bottom: none; }
    .footer { margin-top: 60px; border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 12px; color: #9ca3af; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Proposta Comercial</h1>
  <div class="number">${proposal?.proposal_number ?? 'Nova proposta'} &nbsp;|&nbsp; ${new Date().toLocaleDateString('pt-BR')}</div>

  ${form.scope ? `<h2>Escopo do Serviço</h2><p style="white-space:pre-line;font-size:13px">${form.scope}</p>` : ''}

  ${isEngineering ? `
  <h2>Composição do Valor</h2>
  <table>
    <tbody>
      <tr><td>Subtotal (custo direto)</td><td style="text-align:right">${fmt(subtotalForPrint)}</td></tr>
      <tr><td>BDI (${bdiPct}%)</td><td style="text-align:right">${fmt(bdiValue)}</td></tr>
      <tr><td>Margem comercial (${marginPct}%)</td><td style="text-align:right">${fmt(marginValue)}</td></tr>
      <tr class="total-row" style="background:#f0fdf4"><td>TOTAL</td><td style="text-align:right;color:#16a34a">${fmt(total)}</td></tr>
    </tbody>
  </table>
  <p style="font-size:11px;color:#9ca3af;margin-top:8px">Detalhamento por item disponível mediante solicitação.</p>
  ` : budget?.items?.length ? `
  <h2>Itens do Orçamento</h2>
  <table>
    <thead><tr><th>Descrição</th><th>Unid.</th><th>Qtd.</th><th>Valor Unit.</th><th>Total</th></tr></thead>
    <tbody>
      ${budget.items.map(it => `
        <tr>
          <td>${it.description}</td>
          <td>${it.unit}</td>
          <td>${it.quantity}</td>
          <td>${fmt(it.unit_price)}</td>
          <td>${fmt(it.total)}</td>
        </tr>
      `).join('')}
      <tr class="total-row" style="background:#f0fdf4">
        <td colspan="4" style="text-align:right">Total (com margem ${budget.margin_pct}%)</td>
        <td style="color:#16a34a">${fmt(total)}</td>
      </tr>
    </tbody>
  </table>
  ` : `<h2>Valor</h2><p style="font-size:22px;font-weight:bold;color:#16a34a">${fmt(total)}</p>`}

  ${form.payment_terms ? `<h2>Condições de Pagamento</h2><p style="font-size:13px;white-space:pre-line">${form.payment_terms}</p>` : ''}
  ${form.delivery_term_days ? `<h2>Prazo de Execução</h2><p style="font-size:13px">${form.delivery_term_days} dias corridos</p>` : ''}
  ${form.valid_until ? `<h2>Validade da Proposta</h2><p style="font-size:13px">Até ${new Date(form.valid_until).toLocaleDateString('pt-BR')}</p>` : ''}

  <h2>Assinatura</h2>
  <div style="display:flex;gap:60px;margin-top:40px;font-size:12px">
    <div>
      <div style="border-top:1px solid #374151;width:200px;padding-top:8px">Contratante</div>
    </div>
    <div>
      <div style="border-top:1px solid #374151;width:200px;padding-top:8px">Contratada</div>
    </div>
  </div>

  <div class="footer">Documento gerado pelo ORÇACLOUD em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>

  <script>setTimeout(() => { window.print(); }, 400);</script>
</body>
</html>`;
    win.document.write(html);
    win.document.close();
    setPrinting(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Proposta</h2>
            {proposal && (
              <p className="text-xs text-gray-400">{proposal.proposal_number} — {STATUS_LABELS[proposal.status]}</p>
            )}
          </div>
        </div>
        {totalValue > 0 && (
          <span className="text-lg font-bold text-green-600 dark:text-green-400">{fmt(totalValue)}</span>
        )}
      </div>

      {!budget && !engineeringSummary && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 text-sm text-yellow-700 dark:text-yellow-400">
          Crie um orçamento simples ou vincule um orçamento da engenharia antes de gerar a proposta.
        </div>
      )}

      {engineeringSummary && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800 space-y-2">
          <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">
            Origem: Engenharia — {engineeringSummary.name}
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
            <span className="text-right text-gray-900 dark:text-white">{fmt(engineeringSummary.subtotal)}</span>
            <span className="text-gray-600 dark:text-gray-400">BDI ({engineeringSummary.bdi_pct}%)</span>
            <span className="text-right text-gray-900 dark:text-white">{fmt(engineeringSummary.subtotal * engineeringSummary.bdi_pct / 100)}</span>
            <span className="text-gray-600 dark:text-gray-400">Margem ({engineeringSummary.margin_pct}%)</span>
            <span className="text-right text-gray-900 dark:text-white">{fmt(engineeringSummary.subtotal * (1 + engineeringSummary.bdi_pct / 100) * (engineeringSummary.margin_pct / 100))}</span>
            <span className="text-gray-700 dark:text-gray-200 font-semibold pt-1 border-t border-blue-100 dark:border-blue-800">Total</span>
            <span className="text-right font-bold text-green-600 dark:text-green-400 pt-1 border-t border-blue-100 dark:border-blue-800">{fmt(engineeringSummary.total)}</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className={LABEL}>Escopo do serviço</label>
          <textarea className={INPUT} rows={5} value={form.scope} onChange={set('scope')} placeholder="Descreva o que será executado..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Prazo de execução (dias)</label>
            <input className={INPUT} type="number" min="1" value={form.delivery_term_days} onChange={set('delivery_term_days')} />
          </div>
          <div>
            <label className={LABEL}>Validade da proposta</label>
            <input className={INPUT} type="date" value={form.valid_until} onChange={set('valid_until')} />
          </div>
        </div>
        <div>
          <label className={LABEL}>Condições de pagamento</label>
          <textarea className={INPUT} rows={3} value={form.payment_terms} onChange={set('payment_terms')} placeholder="Ex: 30% na assinatura, 40% na entrega..." />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => save()}
          disabled={saving}
          className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar rascunho'}
        </button>
        <button
          onClick={printProposal}
          disabled={(!budget && !engineeringSummary) || printing}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <Download size={15} /> PDF
        </button>
        <button
          onClick={markSent}
          disabled={(!budget && !engineeringSummary) || saving}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Send size={15} /> Marcar enviada
        </button>
      </div>
      <ServicesToast toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default ServicesProposal;
