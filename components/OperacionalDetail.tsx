import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Edit2, Loader2, AlertCircle, Clock, CheckCircle2, XCircle,
  Lock, PlayCircle, Eye, TrendingUp, DollarSign, Calendar, Users,
  ClipboardList, Camera, AlertTriangle, History, ChevronDown, Plus,
  CheckSquare, FileText, Zap, Info, RefreshCw
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { workOrderService } from '../services/workOrderService'
import type { WorkOrderStatus } from '../types/operational-control'
import { ALLOWED_TRANSITIONS } from '../services/workOrderService'
import OperacionalWorkLog from './OperacionalWorkLog'
import OperacionalChecklist from './OperacionalChecklist'
import OperacionalEvidence from './OperacionalEvidence'
import OperacionalNC from './OperacionalNC'

type Tab = 'geral' | 'apontamentos' | 'checklist' | 'evidencias' | 'ncs' | 'historico'

interface Props {
  workOrderId: string
  orgId: string
  onBack: () => void
  onEdit: (id: string) => void
}

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string; bg: string }> = {
  planned:            { label: 'Planejada',      color: 'text-slate-700',   bg: 'bg-slate-100' },
  released:           { label: 'Liberada',       color: 'text-blue-700',    bg: 'bg-blue-100' },
  in_progress:        { label: 'Em Execução',    color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  pending_inspection: { label: 'Ag. Inspeção',   color: 'text-amber-700',   bg: 'bg-amber-100' },
  approved:           { label: 'Aprovada',       color: 'text-emerald-700', bg: 'bg-emerald-100' },
  rejected:           { label: 'Reprovada',      color: 'text-red-700',     bg: 'bg-red-100' },
  measured:           { label: 'Medida',         color: 'text-violet-700',  bg: 'bg-violet-100' },
  closed:             { label: 'Encerrada',      color: 'text-slate-500',   bg: 'bg-slate-100' },
  blocked:            { label: 'Bloqueada',      color: 'text-red-700',     bg: 'bg-red-100' },
}

const TRANSITION_LABELS: Partial<Record<WorkOrderStatus, string>> = {
  released:           'Liberar OE',
  in_progress:        'Iniciar Execução',
  pending_inspection: 'Solicitar Inspeção',
  approved:           'Aprovar',
  rejected:           'Reprovar',
  measured:           'Registrar Medição',
  closed:             'Encerrar',
  blocked:            'Bloquear',
  planned:            'Voltar para Planejada',
}

function fmtCurrency(v: number | null | undefined) {
  if (!v) return 'R$ —'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function fmtDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Info item ────────────────────────────────────────────────────────────────
const InfoItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
    <p className="text-sm font-bold text-slate-900">{value || '—'}</p>
  </div>
)

// ── Tab button ────────────────────────────────────────────────────────────────
const TabBtn: React.FC<{ active: boolean; label: string; badge?: number; onClick: () => void }> = ({
  active, label, badge, onClick
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap
      ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
  >
    {label}
    {badge !== undefined && badge > 0 && (
      <span className="px-1.5 py-0.5 bg-red-500 text-white rounded text-[9px] font-black">{badge}</span>
    )}
  </button>
)

// ── Transition modal ──────────────────────────────────────────────────────────
const TransitionModal: React.FC<{
  newStatus: WorkOrderStatus
  onConfirm: (reason: string) => void
  onCancel: () => void
  errors: string[]
  isLoading: boolean
}> = ({ newStatus, onConfirm, onCancel, errors, isLoading }) => {
  const [reason, setReason] = useState('')
  const label = TRANSITION_LABELS[newStatus] ?? newStatus

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-black text-slate-900">{label}</h3>

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-2">Requisitos não atendidos</p>
            {errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{e}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-1.5">
            Motivo / Observação
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Opcional — descreva o motivo da transição"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            disabled={errors.length > 0 || isLoading}
            onClick={() => onConfirm(reason)}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const OperacionalDetail: React.FC<Props> = ({ workOrderId, orgId, onBack, onEdit }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wo, setWo] = useState<Record<string, any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('geral')
  const [pendingTransition, setPendingTransition] = useState<WorkOrderStatus | null>(null)
  const [transitionErrors, setTransitionErrors] = useState<string[]>([])
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showUnblockModal, setShowUnblockModal] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await workOrderService.getById(workOrderId)
      setWo(data as Record<string, unknown>)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar OE')
    } finally {
      setIsLoading(false)
    }
  }, [workOrderId])

  useEffect(() => { load() }, [load])

  const handleTransitionClick = async (newStatus: WorkOrderStatus) => {
    const result = await workOrderService.validateTransition(workOrderId, newStatus)
    setTransitionErrors(result.errors)
    setPendingTransition(newStatus)
  }

  const handleTransitionConfirm = async (reason: string) => {
    if (!pendingTransition) return
    setIsTransitioning(true)
    try {
      if (pendingTransition === (wo?.status as string) && wo?.status === 'blocked') {
        await workOrderService.unblock(workOrderId, { reason })
      } else {
        await workOrderService.transition(workOrderId, pendingTransition, { reason })
      }
      setPendingTransition(null)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro na transição')
    } finally {
      setIsTransitioning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (error || !wo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <AlertCircle className="w-10 h-10 mb-2" />
        <p className="font-bold">{error ?? 'Ordem não encontrada'}</p>
        <button onClick={onBack} className="mt-3 px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold">Voltar</button>
      </div>
    )
  }

  const status = wo.status as WorkOrderStatus
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planned
  const allowedNext = ALLOWED_TRANSITIONS[status] ?? []
  const openNcs = ((wo.non_conformances as { status: string }[]) ?? []).filter(nc => nc.status !== 'closed').length
  const logCount = ((wo.work_logs as unknown[]) ?? []).length
  const checklistResponses = (wo.checklist_responses as { completed: boolean }[]) ?? []
  const checklistDone = checklistResponses.filter(r => r.completed).length
  const checklistTotal = checklistResponses.length
  const evidenceCount = ((wo.evidence_files as unknown[]) ?? []).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 text-sm font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {wo.code && (
              <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                {wo.code as string}
              </span>
            )}
            <span className={`text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {(wo.priority as string) !== 'normal' && (
              <span className={`text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${
                wo.priority === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {wo.priority === 'critical' ? '⚠ Crítica' : '↑ Alta'}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-slate-900">{wo.title as string}</h2>
          {wo.description && (
            <p className="text-sm text-slate-500">{wo.description as string}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(workOrderId)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            <Edit2 className="w-4 h-4" />
            Editar
          </button>
        </div>
      </div>

      {/* Custo Previsto x Realizado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Previsto</p>
          <p className="text-xl font-black text-slate-900 mt-1">{fmtCurrency(wo.planned_cost as number)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Realizado</p>
          <p className={`text-xl font-black mt-1 ${
            (wo.actual_total_cost as number) > (wo.planned_cost as number) ? 'text-red-600' : 'text-emerald-600'
          }`}>{fmtCurrency(wo.actual_total_cost as number)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avanço</p>
          <p className="text-xl font-black text-blue-600 mt-1">{(wo.completion_pct as number).toFixed(0)}%</p>
          <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${wo.completion_pct as number}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prazo Final</p>
          <p className={`text-xl font-black mt-1 ${
            wo.planned_end_date && new Date(wo.planned_end_date as string) < new Date() && !['measured','closed'].includes(status)
              ? 'text-red-600' : 'text-slate-900'
          }`}>
            {fmtDate(wo.planned_end_date as string)}
          </p>
        </div>
      </div>

      {/* Workflow buttons */}
      {(allowedNext.length > 0 || status === 'blocked') && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Ações Disponíveis</p>
          <div className="flex flex-wrap gap-2">
            {status === 'blocked' && (
              <button
                onClick={() => setShowUnblockModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                Desbloquear
              </button>
            )}
            {allowedNext.map(next => (
              <button
                key={next}
                onClick={() => handleTransitionClick(next)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all ${
                  next === 'blocked' ? 'bg-red-50 text-red-700 hover:bg-red-100' :
                  next === 'rejected' ? 'bg-red-50 text-red-700 hover:bg-red-100' :
                  'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-900/20'
                }`}
              >
                {TRANSITION_LABELS[next] ?? next}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-hide">
          <TabBtn active={activeTab === 'geral'}        label="Geral"        onClick={() => setActiveTab('geral')} />
          <TabBtn active={activeTab === 'apontamentos'} label="Apontamentos" badge={logCount}     onClick={() => setActiveTab('apontamentos')} />
          <TabBtn active={activeTab === 'checklist'}    label="Checklist"    badge={checklistTotal - checklistDone} onClick={() => setActiveTab('checklist')} />
          <TabBtn active={activeTab === 'evidencias'}   label="Evidências"   badge={evidenceCount} onClick={() => setActiveTab('evidencias')} />
          <TabBtn active={activeTab === 'ncs'}          label="NCs"          badge={openNcs}       onClick={() => setActiveTab('ncs')} />
          <TabBtn active={activeTab === 'historico'}    label="Histórico"    onClick={() => setActiveTab('historico')} />
        </div>

        <div className="p-5">
          {/* Tab: Geral */}
          {activeTab === 'geral' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <InfoItem label="Etapa" value={wo.phase as string} />
              <InfoItem label="Tipo" value={(wo.type as string) === 'own' ? 'Própria' : 'Terceirizada'} />
              <InfoItem label="Equipe" value={(wo.team as { name: string } | null)?.name} />
              <InfoItem label="Responsável" value={(wo.responsible as { name: string } | null)?.name} />
              <InfoItem label="Início Planejado" value={fmtDate(wo.planned_start_date as string)} />
              <InfoItem label="Fim Planejado" value={fmtDate(wo.planned_end_date as string)} />
              <InfoItem label="Início Real" value={fmtDate(wo.actual_start_date as string)} />
              <InfoItem label="Fim Real" value={fmtDate(wo.actual_end_date as string)} />
              <InfoItem label="Unidade de Medição" value={wo.measurement_unit as string} />
              <InfoItem label="Qtd Prevista" value={wo.planned_quantity ? `${wo.planned_quantity} ${wo.measurement_unit ?? ''}` : null} />
              <InfoItem label="Qtd Executada" value={wo.executed_quantity ? `${wo.executed_quantity} ${wo.measurement_unit ?? ''}` : null} />
              <InfoItem label="Replanejamentos" value={String(wo.replanning_count ?? 0)} />
              {wo.budget_item_ref && (
                <>
                  <InfoItem label="Item de Orçamento" value={(wo.budget_item_ref as { description: string }).description} />
                  <InfoItem label="Custo Unit. Orçado" value={
                    fmtCurrency((wo.budget_item_ref as { unitCost: number }).unitCost)
                  } />
                </>
              )}
              {wo.planning_item_ref && (() => {
                const p = wo.planning_item_ref as {
                  planningProjectName: string
                  itemDescription: string
                  plannedStart?: string
                  plannedEnd?: string
                  budgetedValue?: number
                }
                const actualStart = wo.actual_start_date as string | null
                const actualEnd = wo.actual_end_date as string | null
                const planStart = p.plannedStart ? new Date(p.plannedStart + 'T00:00:00') : null
                const planEnd = p.plannedEnd ? new Date(p.plannedEnd + 'T00:00:00') : null
                const realStart = actualStart ? new Date(actualStart + 'T00:00:00') : null
                const realEnd = actualEnd ? new Date(actualEnd + 'T00:00:00') : null
                const startSlip = planStart && realStart ? Math.round((realStart.getTime() - planStart.getTime()) / 86400000) : null
                const endSlip = planEnd && realEnd ? Math.round((realEnd.getTime() - planEnd.getTime()) / 86400000) : null
                return (
                  <div className="col-span-2 md:col-span-3 border-t border-slate-100 pt-4 mt-2">
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-3">Vínculo com Planejamento</p>
                    <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Atividade</p>
                        <p className="text-sm font-black text-violet-900">{p.itemDescription}</p>
                        <p className="text-xs text-violet-500">{p.planningProjectName}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Início Planejado (Crono)</p>
                          <p className="text-sm font-bold text-violet-800">{fmtDate(p.plannedStart ?? null)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Fim Planejado (Crono)</p>
                          <p className="text-sm font-bold text-violet-800">{fmtDate(p.plannedEnd ?? null)}</p>
                        </div>
                        {startSlip !== null && (
                          <div>
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Desvio Início</p>
                            <p className={`text-sm font-black ${startSlip > 0 ? 'text-red-600' : startSlip < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {startSlip > 0 ? `+${startSlip}d` : startSlip < 0 ? `${startSlip}d` : 'Em dia'}
                            </p>
                          </div>
                        )}
                        {endSlip !== null && (
                          <div>
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Desvio Fim</p>
                            <p className={`text-sm font-black ${endSlip > 0 ? 'text-red-600' : endSlip < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {endSlip > 0 ? `+${endSlip}d` : endSlip < 0 ? `${endSlip}d` : 'Em dia'}
                            </p>
                          </div>
                        )}
                        {p.budgetedValue != null && (
                          <div>
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide">Valor Orçado (Crono)</p>
                            <p className="text-sm font-black text-violet-800">
                              {p.budgetedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Tab: Apontamentos */}
          {activeTab === 'apontamentos' && (
            <OperacionalWorkLog
              workOrderId={workOrderId}
              measurementUnit={wo.measurement_unit ?? null}
              onLogsChanged={load}
            />
          )}

          {/* Tab: Checklist */}
          {activeTab === 'checklist' && (
            <OperacionalChecklist
              workOrderId={workOrderId}
            />
          )}

          {/* Tab: Evidências */}
          {activeTab === 'evidencias' && (
            <OperacionalEvidence
              workOrderId={workOrderId}
              orgId={orgId}
            />
          )}

          {/* Tab: NCs */}
          {activeTab === 'ncs' && (
            <OperacionalNC
              workOrderId={workOrderId}
              orgId={orgId}
            />
          )}

          {/* Tab: Histórico */}
          {activeTab === 'historico' && (
            <div className="space-y-3">
              {((wo.status_history as { id: string; previous_status: string | null; new_status: string; reason: string | null; created_at: string }[]) ?? [])
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map(h => {
                  const cfg = STATUS_CONFIG[h.new_status as WorkOrderStatus]
                  return (
                    <div key={h.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg?.bg ?? 'bg-slate-200'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {h.previous_status && (
                            <>
                              <span className="text-xs text-slate-400">{STATUS_CONFIG[h.previous_status as WorkOrderStatus]?.label ?? h.previous_status}</span>
                              <span className="text-xs text-slate-300">→</span>
                            </>
                          )}
                          <span className={`text-xs font-black ${cfg?.color ?? 'text-slate-700'}`}>
                            {cfg?.label ?? h.new_status}
                          </span>
                        </div>
                        {h.reason && <p className="text-xs text-slate-500 mt-0.5">{h.reason}</p>}
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtDateTime(h.created_at)}</span>
                    </div>
                  )
                })}
              {!((wo.status_history as unknown[]) ?? []).length && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhuma transição registrada</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transition modal */}
      {pendingTransition && (
        <TransitionModal
          newStatus={pendingTransition}
          errors={transitionErrors}
          isLoading={isTransitioning}
          onConfirm={handleTransitionConfirm}
          onCancel={() => { setPendingTransition(null); setTransitionErrors([]) }}
        />
      )}

      {/* Unblock modal */}
      {showUnblockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Desbloquear OE</h3>
            <p className="text-sm text-slate-500">
              A OE voltará ao status anterior:{' '}
              <strong>{STATUS_CONFIG[wo.status_before_block as WorkOrderStatus]?.label ?? wo.status_before_block as string}</strong>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowUnblockModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">Cancelar</button>
              <button
                onClick={async () => {
                  setIsTransitioning(true)
                  try {
                    await workOrderService.unblock(workOrderId)
                    setShowUnblockModal(false)
                    await load()
                  } finally {
                    setIsTransitioning(false)
                  }
                }}
                disabled={isTransitioning}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isTransitioning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OperacionalDetail
