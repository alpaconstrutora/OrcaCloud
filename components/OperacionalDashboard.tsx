import React, { useState, useEffect } from 'react'
import {
  BarChart2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, DollarSign, Activity, Loader2
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WorkOrderStatus } from '../types/operational-control'

interface Props {
  projectId: string
  orgId: string
}

interface WorkOrderSummary {
  id: string
  code: string | null
  title: string
  status: WorkOrderStatus
  priority: string
  phase: string | null
  completion_pct: number
  planned_cost: number | null
  actual_total_cost: number
  planned_end_date: string | null
  actual_end_date: string | null
}

interface DashboardData {
  workOrders: WorkOrderSummary[]
  costComparison: Array<{
    phase: string | null
    work_orders: number
    total_planned_cost: number
    total_actual_cost: number
    avg_completion_pct: number
  }>
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planejada', released: 'Liberada', in_progress: 'Em execução',
  pending_inspection: 'Aguardando inspeção', approved: 'Aprovada',
  rejected: 'Rejeitada', measured: 'Medida', closed: 'Encerrada', blocked: 'Bloqueada',
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600',
  released: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  pending_inspection: 'bg-purple-100 text-purple-700',
  approved: 'bg-teal-100 text-teal-700',
  rejected: 'bg-red-100 text-red-700',
  measured: 'bg-cyan-100 text-cyan-700',
  closed: 'bg-green-100 text-green-700',
  blocked: 'bg-orange-100 text-orange-700',
}

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${v.toFixed(1)}%`

const KpiCard: React.FC<{
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}> = ({ label, value, sub, icon: Icon, color }) => (
  <div className={`rounded-2xl p-4 ${color}`}>
    <div className="flex items-start justify-between mb-2">
      <p className="text-xs font-black uppercase tracking-widest opacity-70">{label}</p>
      <Icon className="w-4 h-4 opacity-50" />
    </div>
    <p className="text-2xl font-black">{value}</p>
    {sub && <p className="text-xs mt-1 opacity-60 font-medium">{sub}</p>}
  </div>
)

const OperacionalDashboard: React.FC<Props> = ({ projectId }) => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [woRes, costRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, code, title, status, priority, phase, completion_pct, planned_cost, actual_total_cost, planned_end_date, actual_end_date')
          .eq('project_id', projectId),
        supabase
          .from('vw_project_cost_comparison')
          .select('*')
          .eq('project_id', projectId),
      ])

      if (woRes.error) throw woRes.error

      setData({
        workOrders: (woRes.data ?? []) as WorkOrderSummary[],
        costComparison: costRes.data ?? [],
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-2">
        <AlertTriangle className="w-10 h-10" />
        <p className="font-bold text-sm">{error}</p>
        <button onClick={loadData} className="text-xs text-blue-600 hover:underline">Tentar novamente</button>
      </div>
    )
  }

  if (!data) return null

  const wos = data.workOrders
  const total = wos.length
  const inProgress = wos.filter(w => w.status === 'in_progress').length
  const closed = wos.filter(w => w.status === 'closed').length
  const blocked = wos.filter(w => w.status === 'blocked').length
  const today = new Date().toISOString().split('T')[0]
  const overdue = wos.filter(w =>
    w.planned_end_date && w.planned_end_date < today && !['measured', 'closed'].includes(w.status)
  ).length
  const critical = wos.filter(w => w.priority === 'critical' && !['measured', 'closed'].includes(w.status)).length

  const totalPlanned = wos.reduce((s, w) => s + (w.planned_cost ?? 0), 0)
  const totalActual = wos.reduce((s, w) => s + w.actual_total_cost, 0)
  const costDeviation = totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned) * 100 : 0
  const avgCompletion = total > 0 ? wos.reduce((s, w) => s + w.completion_pct, 0) / total : 0

  // Status distribution
  const byStatus: Record<string, number> = {}
  for (const wo of wos) {
    byStatus[wo.status] = (byStatus[wo.status] ?? 0) + 1
  }

  // Phase distribution
  const byPhase: Record<string, { count: number; planned: number; actual: number; pct: number }> = {}
  for (const wo of wos) {
    const ph = wo.phase ?? 'Sem etapa'
    if (!byPhase[ph]) byPhase[ph] = { count: 0, planned: 0, actual: 0, pct: 0 }
    byPhase[ph].count++
    byPhase[ph].planned += wo.planned_cost ?? 0
    byPhase[ph].actual += wo.actual_total_cost
    byPhase[ph].pct = (byPhase[ph].pct * (byPhase[ph].count - 1) + wo.completion_pct) / byPhase[ph].count
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="OEs ativas"
          value={inProgress}
          sub={`de ${total} total`}
          icon={Activity}
          color="bg-indigo-50 text-indigo-900"
        />
        <KpiCard
          label="Concluídas"
          value={closed}
          sub={total > 0 ? fmtPct((closed / total) * 100) : '0%'}
          icon={CheckCircle2}
          color="bg-green-50 text-green-900"
        />
        <KpiCard
          label="Em atraso"
          value={overdue}
          sub={blocked > 0 ? `${blocked} bloqueadas` : undefined}
          icon={AlertTriangle}
          color={overdue > 0 ? 'bg-red-50 text-red-900' : 'bg-slate-50 text-slate-900'}
        />
        <KpiCard
          label="% médio execução"
          value={fmtPct(avgCompletion)}
          sub={critical > 0 ? `${critical} críticas` : undefined}
          icon={TrendingUp}
          color="bg-blue-50 text-blue-900"
        />
      </div>

      {/* Cost summary */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Custo Realizado vs Previsto</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold">Previsto total</p>
            <p className="text-xl font-black text-slate-900 mt-1">{fmtCurrency(totalPlanned)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold">Realizado total</p>
            <p className="text-xl font-black text-slate-900 mt-1">{fmtCurrency(totalActual)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold">Desvio</p>
            <div className={`flex items-center justify-center gap-1 mt-1 ${costDeviation > 10 ? 'text-red-600' : costDeviation < -5 ? 'text-green-600' : 'text-slate-700'}`}>
              {costDeviation > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <p className="text-xl font-black">{costDeviation > 0 ? '+' : ''}{fmtPct(costDeviation)}</p>
            </div>
          </div>
        </div>

        {/* Cost bar */}
        {totalPlanned > 0 && (
          <div className="mt-4">
            <div className="w-full bg-slate-100 rounded-full h-3 relative overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${totalActual > totalPlanned ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min((totalActual / totalPlanned) * 100, 100)}%` }}
              />
              {totalActual > totalPlanned && (
                <div
                  className="absolute top-0 h-3 bg-red-300 opacity-50"
                  style={{ left: '100%', width: `${((totalActual - totalPlanned) / totalPlanned) * 100}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-400">
              <span>0</span>
              <span>Previsto: {fmtCurrency(totalPlanned)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Distribuição por Status</p>
          <div className="space-y-2">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className={`text-xs font-black px-2 py-0.5 rounded-lg min-w-[130px] ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABELS[status] ?? status}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-black text-slate-700 w-6 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(byStatus).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Nenhuma OE cadastrada</p>
            )}
          </div>
        </div>

        {/* Phase breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Por Etapa / Fase</p>
          <div className="space-y-3">
            {Object.entries(byPhase).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([phase, info]) => (
              <div key={phase}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 truncate max-w-[160px]">{phase}</span>
                  <span className="text-slate-400 shrink-0 ml-2">{info.count} OEs · {fmtPct(info.pct)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${info.pct}%` }} />
                </div>
              </div>
            ))}
            {Object.keys(byPhase).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Nenhuma OE cadastrada</p>
            )}
          </div>
        </div>
      </div>

      {/* Critical & Overdue table */}
      {(critical > 0 || overdue > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            Atenção — Críticas & Atrasadas
          </p>
          <div className="space-y-2">
            {wos
              .filter(w =>
                (w.priority === 'critical' || (w.planned_end_date && w.planned_end_date < today)) &&
                !['measured', 'closed'].includes(w.status)
              )
              .slice(0, 10)
              .map(wo => {
                const isOverdue = wo.planned_end_date && wo.planned_end_date < today
                return (
                  <div key={wo.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {wo.code && <span className="text-slate-400 mr-1">{wo.code}</span>}
                        {wo.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded ${STATUS_COLORS[wo.status]}`}>
                          {STATUS_LABELS[wo.status]}
                        </span>
                        {isOverdue && (
                          <span className="text-xs text-red-600 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Atrasada
                          </span>
                        )}
                        {wo.priority === 'critical' && (
                          <span className="text-xs text-red-700 font-black">Crítica</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-slate-900">{fmtPct(wo.completion_pct)}</p>
                      <p className="text-xs text-slate-400">execução</p>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

export default OperacionalDashboard
