import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BitolaCutPlan, CutBar } from '../../utils/cuttingStock'

interface Props {
  plans: BitolaCutPlan[]
  totalBars: number
  overallUsagePct: number
  totalWasteKg: number
  totalWasteCostBrl: number | null
}

// ── Paleta de cores para as peças (índice dentro da barra) ───────────────────
const PIECE_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#F97316', '#06B6D4', '#84CC16', '#EF4444', '#6366F1',
  '#0EA5E9', '#A855F7', '#14B8A6', '#F43F5E', '#FACC15',
]
function pieceColor(index: number) { return PIECE_COLORS[index % PIECE_COLORS.length] }

// ── Barra visual ─────────────────────────────────────────────────────────────
const BarVisual: React.FC<{ bar: CutBar }> = ({ bar }) => (
  <div className="flex items-center gap-2 group">
    <span className="text-[10px] font-bold text-slate-400 w-6 text-right flex-shrink-0">
      {bar.barIndex + 1}
    </span>
    <div className="flex-1 flex rounded overflow-hidden h-5 border border-slate-100">
      {bar.cuts.map((cut, j) => (
        <div
          key={j}
          style={{
            width: `${(cut.lengthCm / bar.totalCm) * 100}%`,
            backgroundColor: pieceColor(j),
            opacity: 0.85,
          }}
          title={`${cut.label} — ${cut.lengthCm.toFixed(0)} cm`}
        />
      ))}
      {bar.wasteCm > 0 && (
        <div
          style={{ width: `${(bar.wasteCm / bar.totalCm) * 100}%` }}
          className="h-full bg-red-100 border-l border-red-200"
          title={`Sobra: ${bar.wasteCm.toFixed(1)} cm`}
        />
      )}
    </div>
    <span className="text-[10px] text-slate-400 w-16 flex-shrink-0 text-right">
      {bar.wasteCm.toFixed(0)} cm sobra
    </span>
  </div>
)

// ── Gauge de aproveitamento ──────────────────────────────────────────────────
const UsageGauge: React.FC<{ pct: number; size?: 'sm' | 'md' }> = ({ pct, size = 'md' }) => {
  const pctDisplay = (pct * 100).toFixed(1)
  const color = pct >= 0.9 ? 'bg-emerald-500' : pct >= 0.75 ? 'bg-amber-400' : 'bg-red-400'
  const h = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} bg-slate-100 rounded-full overflow-hidden`}>
        <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={`font-black tabular-nums text-slate-700 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        {pctDisplay}%
      </span>
    </div>
  )
}

// ── Seção por bitola ─────────────────────────────────────────────────────────
const BitolaSection: React.FC<{ plan: BitolaCutPlan }> = ({ plan }) => {
  const [expanded, setExpanded] = useState(plan.nBars <= 5)
  const MAX_BARS_DEFAULT = 8

  const barsToShow = expanded ? plan.bars : plan.bars.slice(0, MAX_BARS_DEFAULT)
  const hasMore = plan.bars.length > MAX_BARS_DEFAULT && !expanded

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <div className="text-left">
            <p className="font-black text-slate-900">
              Ø{plan.bitolaMm} mm <span className="text-slate-400 font-bold">({plan.tipo})</span>
            </p>
            <p className="text-xs text-slate-400 font-medium">
              {plan.nBars} barra{plan.nBars !== 1 ? 's' : ''} × {(plan.barLengthCm / 100).toFixed(0)} m
              {plan.wasteKg != null && ` · Sobra: ${plan.wasteKg.toFixed(2)} kg`}
              {plan.wasteCostBrl != null && ` (≈ ${plan.wasteCostBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
            </p>
          </div>
        </div>
        <div className="w-40">
          <UsageGauge pct={plan.usagePct} size="sm" />
        </div>
      </button>

      {/* Barras */}
      {expanded && (
        <div className="px-5 pb-4 space-y-2 border-t border-slate-50">
          <div className="flex items-center gap-2 pt-3 pb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex-1 ml-8">
              Distribuição das peças
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-red-300 w-16 text-right">
              Sobra
            </span>
          </div>
          {barsToShow.map(bar => <BarVisual key={bar.barIndex} bar={bar} />)}
          {hasMore && (
            <button onClick={() => setExpanded(true)}
              className="ml-8 text-xs font-bold text-blue-600 hover:underline">
              + {plan.bars.length - MAX_BARS_DEFAULT} barras…
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
const StructuralBarPlan: React.FC<Props> = ({
  plans, totalBars, overallUsagePct, totalWasteKg, totalWasteCostBrl,
}) => {
  if (plans.length === 0) return null

  return (
    <div className="space-y-4">
      {/* KPIs globais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">Barras totais</p>
          <p className="text-3xl font-black text-blue-900 mt-1">{totalBars}</p>
          <p className="text-xs text-blue-400 mt-1">× 12 m cada</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Aproveitamento geral</p>
          <UsageGauge pct={overallUsagePct} />
        </div>
        <div className="bg-amber-50 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-500">Sobra total</p>
          <p className="text-2xl font-black text-amber-900 mt-1">{totalWasteKg.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
        </div>
        {totalWasteCostBrl != null ? (
          <div className="bg-red-50 rounded-2xl p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-red-400">Custo da sobra</p>
            <p className="text-2xl font-black text-red-900 mt-1">
              {totalWasteCostBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Custo da sobra</p>
            <p className="text-sm text-slate-300 mt-2">Cadastre custo/kg no catálogo</p>
          </div>
        )}
      </div>

      {/* Legenda da visualização */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIECE_COLORS[0] }} />
          <span>Peças cortadas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-100 border border-red-200" />
          <span>Sobra (cavaco)</span>
        </div>
        <span className="ml-auto italic">Passe o mouse sobre cada segmento para ver os detalhes</span>
      </div>

      {/* Seção por bitola */}
      {plans.map(p => <BitolaSection key={p.bitolaMm} plan={p} />)}
    </div>
  )
}

export default StructuralBarPlan
