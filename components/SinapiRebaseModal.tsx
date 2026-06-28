import React from 'react';
import { AlertTriangle, RefreshCw, X, Loader2, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { sinapiService, SinapiReference, resolveReferenceDate } from '../services/sinapiService';
import { BudgetEntry, SinapiItem } from '../types';

interface SinapiRebaseProps {
  budget: BudgetEntry[];
  references: SinapiReference[];
  /** Valor cru salvo no orçamento (settings.referenceMonth) — pode ser label legado. */
  pinnedRaw: string | undefined;
  location: string;
  chargeType: string;
  isLocked?: boolean;
  /** Aplica o rebase: novo budget com preços da competência alvo + a data alvo. */
  onApply: (newBudget: BudgetEntry[], targetReferenceDate: string) => void;
}

interface DiffRow {
  id: string;
  code: string;
  description: string;
  quantity: number;
  oldPrice: number;
  newPrice: number | null; // null = órfão (código inexistente na nova competência)
}

const CHUNK = 200;
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const SinapiRebaseModal: React.FC<SinapiRebaseProps> = ({
  budget, references, pinnedRaw, location, chargeType, isLocked, onApply,
}) => {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<DiffRow[]>([]);
  const fetchedRef = React.useRef<Map<string, SinapiItem>>(new Map());

  const pinned = resolveReferenceDate(pinnedRaw, references);
  const latest = references[0];

  // Não há atualização disponível se: sem versões, sem pin, ou já está na mais recente.
  if (!latest || !pinned || pinned === latest.referenceDate) return null;

  const pinnedLabel = references.find(r => r.referenceDate === pinned)?.label || pinned;

  const loadDiff = async () => {
    setOpen(true);
    setLoading(true);
    try {
      // Só itens SINAPI participam do rebase (base própria não é versionada).
      const sinapiEntries = budget.filter(e => e.sinapiItem && e.sinapiItem.source !== 'Própria');
      const uniqueCodes = Array.from(new Set(sinapiEntries.map(e => e.sinapiItem.code)));

      const fetchedMap = new Map<string, SinapiItem>();
      for (let i = 0; i < uniqueCodes.length; i += CHUNK) {
        const slice = uniqueCodes.slice(i, i + CHUNK);
        const items = await sinapiService.getItemsByCodes(slice, location, chargeType, latest.referenceDate);
        items.forEach(it => fetchedMap.set(it.code, it));
      }
      fetchedRef.current = fetchedMap;

      const diff: DiffRow[] = sinapiEntries.map(e => {
        const nf = fetchedMap.get(e.sinapiItem.code);
        return {
          id: e.id,
          code: e.sinapiItem.code,
          description: e.sinapiItem.description,
          quantity: e.quantity,
          oldPrice: e.sinapiItem.price || 0,
          newPrice: nf ? (nf.price || 0) : null,
        };
      });
      setRows(diff);
    } catch (err) {
      console.error('[SinapiRebase] Falha ao carregar diferença:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    const fetchedMap = fetchedRef.current;
    const newBudget = budget.map(e => {
      if (!e.sinapiItem || e.sinapiItem.source === 'Própria') return e;
      const nf = fetchedMap.get(e.sinapiItem.code);
      if (!nf) return e; // órfão: mantém o preço antigo
      return {
        ...e,
        sinapiItem: {
          ...e.sinapiItem,
          price: nf.price ?? e.sinapiItem.price,
          unit: nf.unit || e.sinapiItem.unit,
          description: nf.description || e.sinapiItem.description,
          composition: nf.composition ?? e.sinapiItem.composition,
        },
      };
    });
    onApply(newBudget, latest.referenceDate);
    setOpen(false);
  };

  // Totais de custo direto (sem BDI) — apenas linhas SINAPI.
  const oldTotal = rows.reduce((a, r) => a + r.quantity * r.oldPrice, 0);
  const newTotal = rows.reduce((a, r) => a + r.quantity * (r.newPrice ?? r.oldPrice), 0);
  const orphans = rows.filter(r => r.newPrice === null).length;
  const delta = newTotal - oldTotal;

  return (
    <>
      {/* Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2.5 text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">
            Nova competência SINAPI disponível: <strong>{latest.label}</strong>. Este orçamento usa <strong>{pinnedLabel}</strong>.
          </span>
        </div>
        {!isLocked && (
          <button
            onClick={loadDiff}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-button font-bold hover:bg-amber-700 transition-colors shrink-0 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Revisar atualização
          </button>
        )}
      </div>

      {/* Modal de diff */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-2 rounded-lg text-white"><RefreshCw className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Atualizar competência SINAPI</h3>
                  <p className="text-xs text-gray-500">{pinnedLabel} → {latest.label} · estado {location} · {chargeType === 'COM_DESONERACAO' ? 'com' : 'sem'} desoneração</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo */}
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-6 text-sm">
              <div><span className="text-gray-400 text-xs uppercase font-bold mr-2">Custo direto atual</span><strong className="text-gray-700">R$ {fmt(oldTotal)}</strong></div>
              <div><span className="text-gray-400 text-xs uppercase font-bold mr-2">Após atualização</span><strong className="text-gray-900">R$ {fmt(newTotal)}</strong></div>
              <div className={`flex items-center gap-1 font-bold ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {delta > 0 ? <TrendingUp className="w-4 h-4" /> : delta < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                R$ {fmt(Math.abs(delta))} ({oldTotal > 0 ? ((delta / oldTotal) * 100).toFixed(1) : '0.0'}%)
              </div>
              {orphans > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {orphans} item(ns) sem correspondência (mantidos)
                </div>
              )}
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                  <span className="text-sm font-bold uppercase tracking-wider">Comparando preços em {latest.label}...</span>
                </div>
              ) : rows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">Nenhum item SINAPI no orçamento para atualizar.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2 text-left">Código</th>
                      <th className="px-4 py-2 text-left">Descrição</th>
                      <th className="px-4 py-2 text-right">Qtd</th>
                      <th className="px-4 py-2 text-right">Unit. atual</th>
                      <th className="px-4 py-2 text-right">Unit. novo</th>
                      <th className="px-4 py-2 text-right">Δ%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => {
                      const orphan = r.newPrice === null;
                      const pct = !orphan && r.oldPrice > 0 ? ((r.newPrice! - r.oldPrice) / r.oldPrice) * 100 : 0;
                      return (
                        <tr key={r.id} className={orphan ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2 font-mono text-table-body text-gray-500">{r.code}</td>
                          <td className="px-4 py-2 text-gray-700 truncate max-w-[320px]">{r.description}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{r.quantity}</td>
                          <td className="px-4 py-2 text-right text-gray-600">R$ {fmt(r.oldPrice)}</td>
                          <td className="px-4 py-2 text-right font-bold text-gray-900">
                            {orphan ? <span className="text-amber-600 text-xs italic">não encontrado</span> : `R$ ${fmt(r.newPrice!)}`}
                          </td>
                          <td className={`px-4 py-2 text-right font-bold ${orphan ? 'text-amber-500' : pct > 0 ? 'text-red-600' : pct < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {orphan ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
              <p className="text-xs text-gray-400 italic">Itens da base própria e sem correspondência mantêm o preço atual.</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(false)} className="px-5 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={apply}
                  disabled={loading || rows.length === 0}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  Aplicar {latest.label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SinapiRebaseModal;
