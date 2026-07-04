import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { matchService, ThreeWayMatchData, MatchStatus } from '../services/matchService';
import { formatMoney as fmt } from './ui/Format';

interface Props {
  orderId: string;
}

const fmtQty = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS: Record<MatchStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  ok:      { label: 'OK',        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  partial: { label: 'Parcial',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     Icon: AlertTriangle },
  missing: { label: 'Faltando',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         Icon: XCircle },
  excess:  { label: 'Excesso',   color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   Icon: AlertTriangle },
  pending: { label: 'Pendente',  color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200',     Icon: Clock },
};

function StatusBadge({ status, small }: { status: MatchStatus; small?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 font-bold ${small ? 'text-xs' : 'text-xs'} ${s.bg} ${s.color}`}>
      <s.Icon className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {s.label}
    </span>
  );
}

// ── Barra de progresso ───────────────────────────────────────────────────────
function ProgressBar({ ordered, received }: { ordered: number; received: number }) {
  const pct = ordered > 0 ? Math.min(received / ordered, 1) * 100 : 0;
  const over = ordered > 0 && received > ordered;
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${over ? 'bg-purple-400' : pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Totais ───────────────────────────────────────────────────────────────────
function TotalsRow({ data }: { data: ThreeWayMatchData }) {
  const invStatus = data.invoiceTotal === 0
    ? 'pending'
    : Math.abs(data.invoiceTotal - data.orderTotal) / data.orderTotal <= 0.005
      ? 'ok'
      : data.invoiceTotal < data.orderTotal ? 'partial' : 'excess';

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        { label: 'Pedido',      value: data.orderTotal,   status: 'ok' as MatchStatus },
        { label: 'Recebido',    value: data.receiptTotal, status: (data.receiptTotal >= data.orderTotal ? 'ok' : data.receiptTotal > 0 ? 'partial' : 'missing') as MatchStatus },
        { label: 'Nota Fiscal', value: data.invoiceTotal, status: invStatus as MatchStatus },
      ].map(col => {
        const s = STATUS[col.status];
        return (
          <div key={col.label} className={`rounded-2xl border p-3 ${s.bg}`}>
            <p className={`text-xs font-black uppercase tracking-wider ${s.color}`}>{col.label}</p>
            <p className={`text-lg font-black mt-1 ${s.color}`}>{fmt(col.value)}</p>
            <StatusBadge status={col.status} small />
          </div>
        );
      })}
    </div>
  );
}

// ── Painel principal ─────────────────────────────────────────────────────────
export const ThreeWayMatchPanel: React.FC<Props> = ({ orderId }) => {
  const [data, setData] = useState<ThreeWayMatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    matchService.getThreeWayMatch(orderId).then(setData).finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
      {/* Cabeçalho colapsável */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-sm font-black text-slate-800">Conferência 3-Way Match</p>
            <p className="text-xs text-slate-400">Pedido × Recebimento × Nota Fiscal</p>
          </div>
          {data && !loading && (
            <StatusBadge status={data.overallStatus} />
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t border-slate-100 pt-4">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando conferência…</span>
            </div>
          )}

          {!loading && !data && (
            <p className="text-sm text-slate-400 text-center py-4">Pedido não encontrado.</p>
          )}

          {!loading && data && (
            <>
              {/* Totais */}
              <TotalsRow data={data} />

              {/* NF-es vinculadas */}
              {data.invoices.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Notas fiscais vinculadas</p>
                  {data.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <span className="text-xs font-semibold text-slate-700">{inv.issuerName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-emerald-700">{fmt(inv.total)}</span>
                        <span className="text-xs text-slate-400">{fmtDate(inv.approvedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {data.invoices.length === 0 && (
                <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-bold text-amber-700">Nenhuma NF-e vinculada a este pedido ainda.</p>
                  <p className="text-xs text-amber-600 mt-0.5">Ao aprovar uma nota fiscal, vincule ao pedido para fechar o match.</p>
                </div>
              )}

              {/* Linhas por item */}
              {data.lines.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-2 pr-3 font-black text-xs uppercase tracking-wider text-slate-400 min-w-[180px]">Item</th>
                        <th className="pb-2 px-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right">Pedido</th>
                        <th className="pb-2 px-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right">Recebido</th>
                        <th className="pb-2 pl-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right">Valor NF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.lines.map(line => (
                        <tr key={line.code}>
                          <td className="py-2.5 pr-3">
                            <p className="font-semibold text-slate-800 leading-tight">{line.description}</p>
                            <p className="text-slate-400 text-xs">{line.code} · {line.unit}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <p className="font-bold text-slate-700">{fmtQty(line.orderedQty)}</p>
                            <p className="text-slate-400 text-xs">{fmt(line.orderedValue)}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col items-end gap-1">
                              <p className={`font-bold ${line.qtyStatus === 'ok' ? 'text-emerald-700' : line.qtyStatus === 'missing' ? 'text-red-600' : 'text-amber-700'}`}>
                                {fmtQty(line.receivedQty)}
                              </p>
                              <ProgressBar ordered={line.orderedQty} received={line.receivedQty} />
                              <StatusBadge status={line.qtyStatus} small />
                            </div>
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            {data.invoices.length > 0 ? (
                              <div className="flex flex-col items-end gap-1">
                                <p className={`font-bold ${line.valueStatus === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                  {fmt(line.invoicedValue)}
                                </p>
                                <StatusBadge status={line.valueStatus} small />
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ThreeWayMatchPanel;
