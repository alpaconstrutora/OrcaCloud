import React, { useState, useEffect, useMemo } from 'react'
import { Save, X, Loader2, AlertCircle, ChevronDown, Search, Link2, Unlink, CalendarDays } from 'lucide-react'
import { workOrderService } from '../services/workOrderService'
import { supabase } from '../lib/supabase'
import type { WorkOrderType, WorkOrderPriority, BudgetItemRef, PlanningItemRef } from '../types/operational-control'
import type { BudgetEntry } from '../types'
import type { ItemScheduleDetails } from '../types/schedule'

interface Team { id: string; name: string }
interface Employee { id: string; name: string; role: string | null }
interface ChecklistTemplate { id: string; name: string; service_type: string | null }
interface WorkOrderOption { id: string; code: string | null; title: string }

interface Props {
  workOrderId?: string
  projectId: string
  orgId: string
  onSave: (id: string) => void
  onCancel: () => void
}

const PHASES = [
  'Fundações', 'Estrutura', 'Alvenaria', 'Cobertura', 'Instalações Hidráulicas',
  'Instalações Elétricas', 'Revestimentos', 'Esquadrias', 'Pintura', 'Acabamentos',
  'Urbanização', 'Outros',
]

const fmtCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Budget Item Picker Modal ──────────────────────────────────────────────────
const BudgetPickerModal: React.FC<{
  items: BudgetEntry[]
  onSelect: (item: BudgetEntry) => void
  onClose: () => void
}> = ({ items, onSelect, onClose }) => {
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')

  const phases = useMemo(() => {
    const s = new Set(items.map(i => i.phase).filter(Boolean))
    return Array.from(s).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(item => {
      if (phaseFilter && item.phase !== phaseFilter) return false
      if (q && !item.sinapiItem.description.toLowerCase().includes(q) &&
               !item.sinapiItem.code?.toLowerCase().includes(q) &&
               !item.phase?.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, phaseFilter])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900">Vincular item de orçamento</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-50 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por descrição ou código..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
            />
          </div>
          <select
            value={phaseFilter}
            onChange={e => setPhaseFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
          >
            <option value="">Todas as fases</option>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <p className="font-bold text-sm">Nenhum item encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-start justify-between px-5 py-3.5 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.sinapiItem.code && (
                        <span className="text-xs font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {item.sinapiItem.code}
                        </span>
                      )}
                      <p className="text-sm font-bold text-slate-900 truncate">{item.sinapiItem.description}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span>{item.phase}{item.subPhase ? ` / ${item.subPhase}` : ''}</span>
                      <span className="font-bold">{item.sinapiItem.unit}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-black text-blue-700">{fmtCurrency(item.sinapiItem.price)}</p>
                    <p className="text-xs text-slate-400">/ {item.sinapiItem.unit}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-400 text-center">
          {filtered.length} de {items.length} itens
        </div>
      </div>
    </div>
  )
}

// ── Planning Item Picker Modal ────────────────────────────────────────────────
interface PlanningProject { id: string; name: string; settings: any; budget: any }
interface PlanningActivityRow {
  itemScheduleId: string
  description: string
  phase?: string
  plannedStart?: string
  plannedEnd?: string
  budgetedValue?: number
}

const PlanningPickerModal: React.FC<{
  orgId: string
  onSelect: (ref: PlanningItemRef) => void
  onClose: () => void
}> = ({ orgId, onSelect, onClose }) => {
  const [projects, setProjects] = useState<PlanningProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [activities, setActivities] = useState<PlanningActivityRow[]>([])
  const [search, setSearch] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, settings, budget')
      .filter('settings->>organizationId', 'eq', orgId)
      .filter('settings->>classification', 'eq', 'PLANEJAMENTO')
      .order('name')
      .then(({ data }) => {
        setProjects(data ?? [])
        setLoadingProjects(false)
      })
  }, [orgId])

  useEffect(() => {
    if (!selectedProjectId) { setActivities([]); return }
    const proj = projects.find(p => p.id === selectedProjectId)
    if (!proj) return

    const itemSchedules: ItemScheduleDetails[] = proj.settings?.schedule?.itemSchedules ?? []
    const budgetArr: BudgetEntry[] = Array.isArray(proj.budget) ? proj.budget : []

    const rows: PlanningActivityRow[] = itemSchedules
      .map(s => {
        const entry = budgetArr.find((b: BudgetEntry) => b.id === s.id)
        if (!entry) return null
        return {
          itemScheduleId: s.id,
          description: entry.sinapiItem.description,
          phase: entry.phase,
          plannedStart: s.startDate,
          plannedEnd: s.endDate,
          budgetedValue: s.budgetedValue,
        }
      })
      .filter(Boolean) as PlanningActivityRow[]

    setActivities(rows)
  }, [selectedProjectId, projects])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return activities
    return activities.filter(a =>
      a.description.toLowerCase().includes(q) ||
      (a.phase ?? '').toLowerCase().includes(q)
    )
  }, [activities, search])

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const fmtDate = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900">Vincular atividade do planejamento</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-50 flex gap-3">
          {loadingProjects ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando projetos...
            </div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum projeto de planejamento encontrado nesta organização.</p>
          ) : (
            <select
              value={selectedProjectId}
              onChange={e => { setSelectedProjectId(e.target.value); setSearch('') }}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
            >
              <option value="">Selecione o projeto de planejamento...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        {selectedProjectId && (
          <div className="px-4 py-3 border-b border-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar atividade..."
                autoFocus
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {!selectedProjectId ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CalendarDays className="w-8 h-8 mb-2 opacity-40" />
              <p className="font-bold text-sm">Selecione um projeto de planejamento</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <p className="font-bold text-sm">Nenhuma atividade encontrada</p>
              {activities.length === 0 && (
                <p className="text-xs mt-1">Projeto sem atividades programadas</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map(act => (
                <button
                  key={act.itemScheduleId}
                  onClick={() => onSelect({
                    planningProjectId: selectedProjectId,
                    planningProjectName: selectedProject?.name ?? '',
                    itemScheduleId: act.itemScheduleId,
                    itemDescription: act.description,
                    phase: act.phase,
                    plannedStart: act.plannedStart,
                    plannedEnd: act.plannedEnd,
                    budgetedValue: act.budgetedValue,
                  })}
                  className="w-full flex items-start justify-between px-5 py-3.5 hover:bg-violet-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{act.description}</p>
                    {act.phase && (
                      <p className="text-xs text-slate-500 mt-0.5">{act.phase}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4 text-xs text-slate-500">
                    <p>{fmtDate(act.plannedStart)} → {fmtDate(act.plannedEnd)}</p>
                    {act.budgetedValue != null && (
                      <p className="font-black text-violet-700 mt-0.5">
                        {act.budgetedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedProjectId && (
          <div className="p-4 border-t border-slate-100 text-xs text-slate-400 text-center">
            {filtered.length} de {activities.length} atividades
          </div>
        )}
      </div>
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode; colSpan?: number }> = ({ label, required, children, colSpan }) => (
  <div className={colSpan === 2 ? 'col-span-2' : colSpan === 3 ? 'col-span-3' : ''}>
    <label className="text-xs font-black text-slate-500 uppercase tracking-wide">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="mt-1">{children}</div>
  </div>
)

// ── Main Form ─────────────────────────────────────────────────────────────────
const OperacionalForm: React.FC<Props> = ({ workOrderId, projectId, orgId, onSave, onCancel }) => {
  const isEditing = Boolean(workOrderId)

  const [teams, setTeams] = useState<Team[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [siblings, setSiblings] = useState<WorkOrderOption[]>([])
  const [budgetItems, setBudgetItems] = useState<BudgetEntry[]>([])
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItemRef | null>(null)
  const [showBudgetPicker, setShowBudgetPicker] = useState(false)
  const [selectedPlanningItem, setSelectedPlanningItem] = useState<PlanningItemRef | null>(null)
  const [showPlanningPicker, setShowPlanningPicker] = useState(false)

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    phase: '',
    type: 'own' as WorkOrderType,
    priority: 'normal' as WorkOrderPriority,
    teamId: '',
    responsibleId: '',
    plannedStartDate: '',
    plannedEndDate: '',
    measurementUnit: '',
    plannedQuantity: '',
    plannedCost: '',
    predecessorId: '',
    checklistTemplateId: '',
  })

  useEffect(() => {
    loadReferenceData()
    if (isEditing && workOrderId) loadWorkOrder(workOrderId)
  }, [workOrderId])

  const loadReferenceData = async () => {
    const [teamsRes, empRes, templatesRes, siblingsRes, projectRes] = await Promise.all([
      supabase.from('labor_teams').select('id, name').order('name'),
      supabase.from('employees').select('id, name, role').order('name'),
      supabase.from('oe_checklist_templates').select('id, name, service_type').eq('org_id', orgId).eq('active', true).order('name'),
      (() => {
        let q = supabase.from('work_orders').select('id, code, title').eq('project_id', projectId)
        if (workOrderId) q = q.neq('id', workOrderId)
        return q.order('code')
      })(),
      supabase.from('projects').select('budget').eq('id', projectId).single(),
    ])
    if (teamsRes.data) setTeams(teamsRes.data)
    if (empRes.data) setEmployees(empRes.data)
    if (templatesRes.data) setTemplates(templatesRes.data)
    if (siblingsRes.data) setSiblings(siblingsRes.data)
    if (projectRes.data?.budget) {
      // budget is stored as JSON array of BudgetEntry
      const rawBudget = projectRes.data.budget as BudgetEntry[]
      setBudgetItems(Array.isArray(rawBudget) ? rawBudget : [])
    }
  }

  const loadWorkOrder = async (id: string) => {
    setLoading(true)
    try {
      const wo = await workOrderService.getById(id)
      setForm({
        title: wo.title ?? '',
        description: wo.description ?? '',
        phase: wo.phase ?? '',
        type: (wo.type as WorkOrderType) ?? 'own',
        priority: (wo.priority as WorkOrderPriority) ?? 'normal',
        teamId: wo.team_id ?? '',
        responsibleId: wo.responsible_id ?? '',
        plannedStartDate: wo.planned_start_date ?? '',
        plannedEndDate: wo.planned_end_date ?? '',
        measurementUnit: wo.measurement_unit ?? '',
        plannedQuantity: wo.planned_quantity != null ? String(wo.planned_quantity) : '',
        plannedCost: wo.planned_cost != null ? String(wo.planned_cost) : '',
        predecessorId: wo.predecessor_id ?? '',
        checklistTemplateId: wo.checklist_template_id ?? '',
      })
      if (wo.budget_item_ref) {
        setSelectedBudgetItem(wo.budget_item_ref as BudgetItemRef)
      }
      if (wo.planning_item_ref) {
        setSelectedPlanningItem(wo.planning_item_ref as PlanningItemRef)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar OE')
    } finally {
      setLoading(false)
    }
  }

  const handlePlanningSelect = (ref: PlanningItemRef) => {
    setSelectedPlanningItem(ref)
    // Auto-fill dates and phase from planning activity if not already set
    setForm(f => ({
      ...f,
      phase: f.phase || ref.phase || '',
      plannedStartDate: f.plannedStartDate || ref.plannedStart || '',
      plannedEndDate: f.plannedEndDate || ref.plannedEnd || '',
    }))
    setShowPlanningPicker(false)
  }

  const handleBudgetSelect = (item: BudgetEntry) => {
    const ref: BudgetItemRef = {
      id: item.id,
      description: item.sinapiItem.description,
      unit: item.sinapiItem.unit,
      unitCost: item.sinapiItem.price,
      phase: item.phase,
      subPhase: item.subPhase,
      sinapiCode: item.sinapiItem.code,
    }
    setSelectedBudgetItem(ref)
    // Auto-fill measurement unit and planned cost if empty
    setForm(f => ({
      ...f,
      measurementUnit: f.measurementUnit || item.sinapiItem.unit,
      phase: f.phase || item.phase || '',
    }))
    setShowBudgetPicker(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        phase: form.phase || undefined,
        type: form.type,
        priority: form.priority,
        orgId,
        projectId,
        teamId: form.teamId || undefined,
        responsibleId: form.responsibleId || undefined,
        plannedStartDate: form.plannedStartDate || undefined,
        plannedEndDate: form.plannedEndDate || undefined,
        measurementUnit: form.measurementUnit || undefined,
        plannedQuantity: form.plannedQuantity ? parseFloat(form.plannedQuantity) : undefined,
        plannedCost: form.plannedCost ? parseFloat(form.plannedCost) : undefined,
        predecessorId: form.predecessorId || undefined,
        checklistTemplateId: form.checklistTemplateId || undefined,
        budgetItemRef: selectedBudgetItem ?? undefined,
        planningItemRef: selectedPlanningItem ?? undefined,
      }

      let savedId: string
      if (isEditing && workOrderId) {
        const data = await workOrderService.update(workOrderId, payload)
        savedId = data.id
      } else {
        const data = await workOrderService.create(payload)
        savedId = data.id
      }

      onSave(savedId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar OE')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
  const selectCls = inputCls + " appearance-none"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">
            {isEditing ? 'Editar Ordem de Execução' : 'Nova Ordem de Execução'}
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Preencha os dados da OE</p>
        </div>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section: Orçamento */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Vínculo com Orçamento</p>
            {budgetItems.length === 0 && (
              <p className="text-xs text-slate-400">Obra sem orçamento cadastrado</p>
            )}
          </div>

          {selectedBudgetItem ? (
            <div className="flex items-start justify-between p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {selectedBudgetItem.sinapiCode && (
                    <span className="text-xs font-black text-blue-500 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                      {selectedBudgetItem.sinapiCode}
                    </span>
                  )}
                  <p className="text-sm font-black text-blue-900 truncate">{selectedBudgetItem.description}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-blue-700">
                  <span>{selectedBudgetItem.phase}{selectedBudgetItem.subPhase ? ` / ${selectedBudgetItem.subPhase}` : ''}</span>
                  <span className="font-black">{fmtCurrency(selectedBudgetItem.unitCost)} / {selectedBudgetItem.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                {budgetItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBudgetPicker(true)}
                    className="text-xs font-black text-blue-600 hover:text-blue-800 px-2 py-1 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    Trocar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBudgetItem(null)}
                  className="text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Unlink className="w-3 h-3" />
                  Desvincular
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => budgetItems.length > 0 && setShowBudgetPicker(true)}
              disabled={budgetItems.length === 0}
              className={`w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl text-sm font-bold transition-colors
                ${budgetItems.length > 0
                  ? 'border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                  : 'border-slate-200 text-slate-300 cursor-not-allowed'}`}
            >
              <Link2 className="w-4 h-4" />
              {budgetItems.length > 0 ? 'Selecionar item do orçamento' : 'Sem itens de orçamento disponíveis'}
            </button>
          )}
        </div>

        {/* Section: Planejamento */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Vínculo com Planejamento</p>
          </div>

          {selectedPlanningItem ? (
            <div className="flex items-start justify-between p-4 bg-violet-50 border border-violet-100 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-violet-900 truncate">{selectedPlanningItem.itemDescription}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-violet-700">
                  {selectedPlanningItem.phase && <span>{selectedPlanningItem.phase}</span>}
                  <span className="font-bold">
                    {selectedPlanningItem.plannedStart
                      ? new Date(selectedPlanningItem.plannedStart + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                    {' → '}
                    {selectedPlanningItem.plannedEnd
                      ? new Date(selectedPlanningItem.plannedEnd + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                  {selectedPlanningItem.budgetedValue != null && (
                    <span>
                      {selectedPlanningItem.budgetedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-violet-500 mt-1">{selectedPlanningItem.planningProjectName}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPlanningPicker(true)}
                  className="text-xs font-black text-violet-600 hover:text-violet-800 px-2 py-1 hover:bg-violet-100 rounded-lg transition-colors"
                >
                  Trocar
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlanningItem(null)}
                  className="text-xs font-bold text-slate-400 hover:text-red-500 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Unlink className="w-3 h-3" />
                  Desvincular
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPlanningPicker(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-300 text-violet-600 hover:border-violet-500 hover:bg-violet-50 rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <CalendarDays className="w-4 h-4" />
              Selecionar atividade do cronograma
            </button>
          )}
        </div>

        {/* Section: Identificação */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Identificação</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Título" required colSpan={2}>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="Ex: Execução de alvenaria bloco cerâmico"
                className={inputCls}
              />
            </Field>
            <Field label="Fase / Etapa">
              <div className="relative">
                <select
                  value={form.phase}
                  onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Selecione...</option>
                  {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Tipo">
              <div className="relative">
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as WorkOrderType }))}
                  className={selectCls}
                >
                  <option value="own">Própria</option>
                  <option value="subcontracted">Subcontratada</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Prioridade">
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as WorkOrderPriority }))}
                  className={selectCls}
                >
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Descrição" colSpan={2}>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Detalhes adicionais sobre a execução..."
                className={inputCls + ' resize-none'}
              />
            </Field>
          </div>
        </div>

        {/* Section: Equipe */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Equipe & Responsável</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Equipe">
              <div className="relative">
                <select
                  value={form.teamId}
                  onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Selecione a equipe...</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Responsável">
              <div className="relative">
                <select
                  value={form.responsibleId}
                  onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Selecione...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}{emp.role ? ` — ${emp.role}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
          </div>
        </div>

        {/* Section: Datas */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cronograma</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Início planejado">
              <input
                type="date"
                value={form.plannedStartDate}
                onChange={e => setForm(f => ({ ...f, plannedStartDate: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Fim planejado">
              <input
                type="date"
                value={form.plannedEndDate}
                onChange={e => setForm(f => ({ ...f, plannedEndDate: e.target.value }))}
                min={form.plannedStartDate}
                className={inputCls}
              />
            </Field>
            <Field label="OE predecessora">
              <div className="relative">
                <select
                  value={form.predecessorId}
                  onChange={e => setForm(f => ({ ...f, predecessorId: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Nenhuma</option>
                  {siblings.map(s => (
                    <option key={s.id} value={s.id}>{s.code ?? '—'} — {s.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
          </div>
        </div>

        {/* Section: Medição & Custo */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Medição & Custo</p>
          {selectedBudgetItem && (
            <div className="text-xs text-blue-600 font-bold bg-blue-50 px-3 py-2 rounded-xl">
              Referência orçamentária: {fmtCurrency(selectedBudgetItem.unitCost)} / {selectedBudgetItem.unit}
              {form.plannedQuantity && (
                <> · Custo calculado: {fmtCurrency(selectedBudgetItem.unitCost * parseFloat(form.plannedQuantity))}</>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Unidade de medida">
              <input
                type="text"
                value={form.measurementUnit}
                onChange={e => setForm(f => ({ ...f, measurementUnit: e.target.value }))}
                placeholder="m², m³, un..."
                className={inputCls}
              />
            </Field>
            <Field label="Quantidade planejada">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.plannedQuantity}
                onChange={e => setForm(f => ({ ...f, plannedQuantity: e.target.value }))}
                placeholder="0.00"
                className={inputCls}
              />
            </Field>
            <Field label="Custo previsto (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.plannedCost}
                onChange={e => setForm(f => ({ ...f, plannedCost: e.target.value }))}
                placeholder={
                  selectedBudgetItem && form.plannedQuantity
                    ? String((selectedBudgetItem.unitCost * parseFloat(form.plannedQuantity)).toFixed(2))
                    : '0.00'
                }
                className={inputCls}
              />
            </Field>
          </div>
          {/* Auto-calculate button */}
          {selectedBudgetItem && form.plannedQuantity && !form.plannedCost && (
            <button
              type="button"
              onClick={() => {
                const calculated = (selectedBudgetItem.unitCost * parseFloat(form.plannedQuantity)).toFixed(2)
                setForm(f => ({ ...f, plannedCost: calculated }))
              }}
              className="text-xs font-black text-blue-600 hover:text-blue-800 underline"
            >
              ↑ Preencher custo a partir do orçamento ({fmtCurrency(selectedBudgetItem.unitCost * parseFloat(form.plannedQuantity))})
            </button>
          )}
        </div>

        {/* Section: Qualidade */}
        {templates.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Qualidade</p>
            <Field label="Modelo de checklist">
              <div className="relative">
                <select
                  value={form.checklistTemplateId}
                  onChange={e => setForm(f => ({ ...f, checklistTemplateId: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Nenhum</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.service_type ? ` (${t.service_type})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </Field>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-black transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-lg shadow-blue-900/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEditing ? 'Salvar alterações' : 'Criar OE'}
          </button>
        </div>
      </form>

      {/* Budget Picker Modal */}
      {showBudgetPicker && (
        <BudgetPickerModal
          items={budgetItems}
          onSelect={handleBudgetSelect}
          onClose={() => setShowBudgetPicker(false)}
        />
      )}

      {/* Planning Picker Modal */}
      {showPlanningPicker && (
        <PlanningPickerModal
          orgId={orgId}
          onSelect={handlePlanningSelect}
          onClose={() => setShowPlanningPicker(false)}
        />
      )}
    </div>
  )
}

export default OperacionalForm
