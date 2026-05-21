import { supabase } from '../lib/supabase'
import type {
  WorkOrderStatus,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  CreateWorkLogInput,
  CreateEvidenceInput,
  CreateNonConformanceInput,
  TransitionValidationResult,
  ALLOWED_TRANSITIONS,
} from '../types/operational-control'

// Re-export para uso nos componentes
export { ALLOWED_TRANSITIONS } from '../types/operational-control'

// ────────────────────────────────────────────────────────────
// WORK ORDERS — CRUD
// ────────────────────────────────────────────────────────────

export const workOrderService = {

  async list(projectId: string, filters?: {
    status?: WorkOrderStatus[]
    teamId?: string
    phase?: string
    overdueOnly?: boolean
  }) {
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        team:labor_teams(id, name),
        responsible:employees(id, name, role),
        non_conformances(id, status)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (filters?.status?.length) {
      query = query.in('status', filters.status)
    }
    if (filters?.teamId) {
      query = query.eq('team_id', filters.teamId)
    }
    if (filters?.phase) {
      query = query.eq('phase', filters.phase)
    }
    if (filters?.overdueOnly) {
      query = query
        .lt('planned_end_date', new Date().toISOString().split('T')[0])
        .not('status', 'in', '("measured","closed")')
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        team:labor_teams(id, name),
        responsible:employees(id, name, role),
        predecessor:work_orders!predecessor_id(id, code, title, status),
        checklist_template:oe_checklist_templates(
          *,
          items:oe_checklist_items(*)
        ),
        work_logs(*),
        evidence_files(*),
        checklist_responses:oe_checklist_responses(
          *,
          item:oe_checklist_items(*)
        ),
        non_conformances(*),
        validations:work_order_validations(*),
        status_history:work_order_status_log(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  async create(input: CreateWorkOrderInput) {
    const code = await workOrderService._generateCode(input.projectId)

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        org_id: input.orgId,
        project_id: input.projectId,
        code,
        title: input.title,
        description: input.description ?? null,
        phase: input.phase ?? null,
        type: input.type ?? 'own',
        priority: input.priority ?? 'normal',
        team_id: input.teamId ?? null,
        responsible_id: input.responsibleId ?? null,
        planned_start_date: input.plannedStartDate ?? null,
        planned_end_date: input.plannedEndDate ?? null,
        measurement_unit: input.measurementUnit ?? null,
        planned_quantity: input.plannedQuantity ?? null,
        planned_cost: input.plannedCost ?? null,
        predecessor_id: input.predecessorId ?? null,
        checklist_template_id: input.checklistTemplateId ?? null,
        budget_item_ref: input.budgetItemRef ?? null,
        planning_item_ref: input.planningItemRef ?? null,
        status: 'planned',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, input: UpdateWorkOrderInput) {
    const current = await workOrderService.getById(id)

    // Impede alteração de baseline após liberação
    const baselineFields = ['baseline_start', 'baseline_end'] as const
    if (current.status !== 'planned') {
      for (const field of baselineFields) {
        if (field in (input as Record<string, unknown>)) {
          throw new Error(`Baseline não pode ser alterado após liberação da OE ${current.code}`)
        }
      }
    }

    const { data, error } = await supabase
      .from('work_orders')
      .update({
        title: input.title,
        description: input.description,
        phase: input.phase,
        type: input.type,
        priority: input.priority,
        team_id: input.teamId,
        responsible_id: input.responsibleId,
        planned_start_date: input.plannedStartDate,
        planned_end_date: input.plannedEndDate,
        measurement_unit: input.measurementUnit,
        planned_quantity: input.plannedQuantity,
        planned_cost: input.plannedCost,
        predecessor_id: input.predecessorId,
        checklist_template_id: input.checklistTemplateId,
        budget_item_ref: input.budgetItemRef,
        planning_item_ref: input.planningItemRef,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('work_orders')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ────────────────────────────────────────────────────────────
  // WORKFLOW — Transições de status
  // ────────────────────────────────────────────────────────────

  async validateTransition(
    workOrderId: string,
    newStatus: WorkOrderStatus
  ): Promise<TransitionValidationResult> {
    const errors: string[] = []

    const wo = await workOrderService.getById(workOrderId)

    // 1. Verificar se a transição é permitida
    const { ALLOWED_TRANSITIONS } = await import('../types/operational-control')
    const allowed = ALLOWED_TRANSITIONS[wo.status as WorkOrderStatus] ?? []
    if (!allowed.includes(newStatus)) {
      return {
        valid: false,
        errors: [`Transição de '${wo.status}' para '${newStatus}' não permitida`],
      }
    }

    // 2. Gates por transição
    if (newStatus === 'released') {
      if (!wo.team_id) errors.push('Equipe não vinculada')
      if (!wo.responsible_id) errors.push('Responsável não definido')
      if (!wo.planned_start_date || !wo.planned_end_date) errors.push('Datas planejadas não preenchidas')
      if (!wo.planned_cost) errors.push('Custo previsto não informado')

      // Checklist pré-início
      const pendingPreStart = (wo.checklist_responses ?? []).filter(
        (r: { item?: { gate: string; required: boolean }; completed: boolean }) =>
          r.item?.gate === 'pre_start' && r.item?.required && !r.completed
      )
      if (pendingPreStart.length > 0) {
        errors.push(`${pendingPreStart.length} itens obrigatórios do checklist pré-início pendentes`)
      }

      // Predecessora
      if (wo.predecessor && wo.predecessor.status !== 'closed') {
        errors.push(`Predecessora "${wo.predecessor.title}" ainda não encerrada`)
      }
    }

    if (newStatus === 'pending_inspection') {
      // Gate configurável: min % padrão 95, pode ser sobrescrito por project_ops_config
      const config = await workOrderService._getProjectConfig(wo.project_id)
      const minPct = config?.gate_config?.minPctForInspection ?? 95

      if (wo.completion_pct < minPct) {
        errors.push(`Execução em ${wo.completion_pct}% — mínimo ${minPct}% para solicitar inspeção`)
      }

      const pendingPreCompletion = (wo.checklist_responses ?? []).filter(
        (r: { item?: { gate: string; required: boolean }; completed: boolean }) =>
          r.item?.gate === 'pre_completion' && r.item?.required && !r.completed
      )
      if (pendingPreCompletion.length > 0) {
        errors.push(`${pendingPreCompletion.length} itens obrigatórios do checklist pré-conclusão pendentes`)
      }

      const openNcs = (wo.non_conformances ?? []).filter(
        (nc: { status: string }) => nc.status === 'open' || nc.status === 'in_treatment'
      )
      if (openNcs.length > 0) {
        errors.push(`${openNcs.length} não conformidade(s) em aberto`)
      }
    }

    if (newStatus === 'approved') {
      const inspectionValidation = (wo.validations ?? []).find(
        (v: { type: string; status: string }) => v.type === 'inspection' && v.status === 'approved'
      )
      if (!inspectionValidation) {
        errors.push('Registro de inspeção aprovada não encontrado')
      }
    }

    return { valid: errors.length === 0, errors }
  },

  async transition(
    workOrderId: string,
    newStatus: WorkOrderStatus,
    options?: { changedById?: string; reason?: string }
  ) {
    const validation = await workOrderService.validateTransition(workOrderId, newStatus)
    if (!validation.valid) {
      const err = new Error(validation.errors.join('; '))
      ;(err as Error & { errors: string[] }).errors = validation.errors
      throw err
    }

    const current = await workOrderService.getById(workOrderId)
    const previousStatus = current.status as WorkOrderStatus

    const updatePayload: Record<string, unknown> = { status: newStatus }

    // Ao bloquear: gravar status anterior para poder restaurar
    if (newStatus === 'blocked') {
      updatePayload.status_before_block = previousStatus
    }
    // Ao desbloquear (não é uma transição normal — chame unblock() diretamente)

    // Baseline: gravar na primeira liberação
    if (newStatus === 'released' && !current.baseline_start) {
      updatePayload.baseline_start = current.planned_start_date
      updatePayload.baseline_end = current.planned_end_date
    }

    // Data início real: ao entrar em execução
    if (newStatus === 'in_progress' && !current.actual_start_date) {
      updatePayload.actual_start_date = new Date().toISOString().split('T')[0]
    }

    // Data fim real: ao fechar
    if (newStatus === 'closed' && !current.actual_end_date) {
      updatePayload.actual_end_date = new Date().toISOString().split('T')[0]
    }

    // Replanejamento: contar quando muda datas após baseline fixado
    if (previousStatus === 'blocked' && newStatus !== 'blocked') {
      updatePayload.replanning_count = (current.replanning_count ?? 0) + 1
    }

    const { data, error } = await supabase
      .from('work_orders')
      .update(updatePayload)
      .eq('id', workOrderId)
      .select()
      .single()

    if (error) throw error

    // Gravar no histórico
    await supabase.from('work_order_status_log').insert({
      work_order_id: workOrderId,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by_id: options?.changedById ?? null,
      reason: options?.reason ?? null,
    })

    return data
  },

  async unblock(workOrderId: string, options?: { changedById?: string; reason?: string }) {
    const { data: current, error: fetchError } = await supabase
      .from('work_orders')
      .select('status, status_before_block, replanning_count')
      .eq('id', workOrderId)
      .single()

    if (fetchError) throw fetchError
    if (current.status !== 'blocked') throw new Error('OE não está bloqueada')

    const restoreStatus = current.status_before_block ?? 'planned'

    const { data, error } = await supabase
      .from('work_orders')
      .update({
        status: restoreStatus,
        status_before_block: null,
        replanning_count: (current.replanning_count ?? 0) + 1,
      })
      .eq('id', workOrderId)
      .select()
      .single()

    if (error) throw error

    await supabase.from('work_order_status_log').insert({
      work_order_id: workOrderId,
      previous_status: 'blocked',
      new_status: restoreStatus,
      changed_by_id: options?.changedById ?? null,
      reason: options?.reason ?? null,
    })

    return data
  },

  // ────────────────────────────────────────────────────────────
  // WORK LOGS — Apontamentos
  // ────────────────────────────────────────────────────────────

  async addWorkLog(input: CreateWorkLogInput) {
    // Buscar custo médio/hora da equipe
    let calculatedCost: number | null = null
    if (input.teamId && input.hoursWorked) {
      const { data: teamCost } = await supabase
        .from('vw_team_hourly_cost')
        .select('avg_hourly_cost')
        .eq('team_id', input.teamId)
        .single()

      if (teamCost) {
        calculatedCost = input.hoursWorked * teamCost.avg_hourly_cost
      }
    }

    const { data: log, error } = await supabase
      .from('work_logs')
      .insert({
        work_order_id: input.workOrderId,
        log_date: input.logDate,
        team_id: input.teamId ?? null,
        hours_worked: input.hoursWorked ?? null,
        quantity_executed: input.quantityExecuted ?? null,
        calculated_cost: calculatedCost,
        notes: input.notes ?? null,
        logged_by_id: input.loggedById ?? null,
      })
      .select()
      .single()

    if (error) throw error

    // Recalcular totais da OE
    await workOrderService._recalculateTotals(input.workOrderId)

    return log
  },

  async deleteWorkLog(logId: string) {
    const { data: log, error: fetchError } = await supabase
      .from('work_logs')
      .select('work_order_id')
      .eq('id', logId)
      .single()

    if (fetchError) throw fetchError

    const { error } = await supabase.from('work_logs').delete().eq('id', logId)
    if (error) throw error

    await workOrderService._recalculateTotals(log.work_order_id)
  },

  // ────────────────────────────────────────────────────────────
  // EVIDENCE FILES — Fotos e documentos
  // ────────────────────────────────────────────────────────────

  async addEvidence(input: CreateEvidenceInput) {
    const { data, error } = await supabase
      .from('evidence_files')
      .insert({
        work_order_id: input.workOrderId,
        file_type: input.fileType ?? 'photo',
        file_url: input.fileUrl,
        thumbnail_url: input.thumbnailUrl ?? null,
        gate: input.gate ?? 'execution',
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        captured_at: input.capturedAt ?? new Date().toISOString(),
        description: input.description ?? null,
        uploaded_by_id: input.uploadedById ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ────────────────────────────────────────────────────────────
  // CHECKLIST
  // ────────────────────────────────────────────────────────────

  async initChecklistForWorkOrder(workOrderId: string, templateId: string) {
    const { data: items, error: itemsError } = await supabase
      .from('oe_checklist_items')
      .select('id')
      .eq('template_id', templateId)

    if (itemsError) throw itemsError

    if (!items?.length) return []

    const responses = items.map(item => ({
      work_order_id: workOrderId,
      item_id: item.id,
      completed: false,
    }))

    const { data, error } = await supabase
      .from('oe_checklist_responses')
      .upsert(responses, { onConflict: 'work_order_id,item_id' })
      .select()

    if (error) throw error
    return data
  },

  async toggleChecklistItem(responseId: string, completed: boolean, options?: {
    evidenceId?: string
    notes?: string
    completedById?: string
  }) {
    const { data, error } = await supabase
      .from('oe_checklist_responses')
      .update({
        completed,
        evidence_id: options?.evidenceId ?? null,
        notes: options?.notes ?? null,
        completed_by_id: options?.completedById ?? null,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', responseId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ────────────────────────────────────────────────────────────
  // NON-CONFORMANCES
  // ────────────────────────────────────────────────────────────

  async createNonConformance(input: CreateNonConformanceInput) {
    const { data, error } = await supabase
      .from('non_conformances')
      .insert({
        work_order_id: input.workOrderId,
        description: input.description,
        severity: input.severity ?? 'moderate',
        responsible_id: input.responsibleId ?? null,
        due_date: input.dueDate ?? null,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async closeNonConformance(ncId: string, options: {
    correctiveAction: string
    resolutionEvidenceId?: string
  }) {
    const { data, error } = await supabase
      .from('non_conformances')
      .update({
        status: 'closed',
        corrective_action: options.correctiveAction,
        resolution_evidence_id: options.resolutionEvidenceId ?? null,
        closed_at: new Date().toISOString(),
      })
      .eq('id', ncId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ────────────────────────────────────────────────────────────
  // SITE DIARY — Diário de obra
  // ────────────────────────────────────────────────────────────

  async generateDiary(projectId: string, date: string) {
    // Verificar se já existe diário revisado (não sobrescreve)
    const { data: existing } = await supabase
      .from('site_diary')
      .select('id, auto_generated, reviewed_at')
      .eq('project_id', projectId)
      .eq('diary_date', date)
      .single()

    if (existing && !existing.auto_generated) return existing

    // Buscar dados do dia
    const [{ data: workOrders }, { data: logs }] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id, code, title, status, completion_pct')
        .eq('project_id', projectId)
        .in('status', ['in_progress', 'pending_inspection', 'released']),
      supabase
        .from('work_logs')
        .select('work_order_id, team_id, hours_worked, quantity_executed, team:labor_teams(name)')
        .eq('log_date', date),
    ])

    const workersPresent = (logs ?? []).reduce(
      (sum: number, l: { hours_worked: number | null }) => sum + (l.hours_worked ? 1 : 0),
      0
    )

    const { data, error } = await supabase
      .from('site_diary')
      .upsert({
        project_id: projectId,
        diary_date: date,
        workers_present: workersPresent,
        auto_generated: true,
        field_condition: 'normal',
      }, { onConflict: 'project_id,diary_date', ignoreDuplicates: false })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async reviewDiary(diaryId: string, options: {
    weather?: string
    fieldCondition?: string
    generalNotes?: string
    reviewedById?: string
  }) {
    // Gravar snapshot ao revisar
    const { data: current } = await supabase
      .from('site_diary')
      .select('project_id, diary_date')
      .eq('id', diaryId)
      .single()

    const [{ data: workOrders }, { data: ncs }] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id, code, title, status, completion_pct')
        .eq('project_id', current!.project_id)
        .in('status', ['in_progress', 'pending_inspection', 'released']),
      supabase
        .from('non_conformances')
        .select('id, description, severity, status')
        .in('status', ['open', 'in_treatment']),
    ])

    const snapshot = {
      workOrders: workOrders ?? [],
      nonConformances: ncs ?? [],
      snapshotAt: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('site_diary')
      .update({
        weather: options.weather ?? null,
        field_condition: options.fieldCondition ?? 'normal',
        general_notes: options.generalNotes ?? null,
        reviewed_by_id: options.reviewedById ?? null,
        reviewed_at: new Date().toISOString(),
        auto_generated: false,
        snapshot,
      })
      .eq('id', diaryId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ────────────────────────────────────────────────────────────
  // DASHBOARD — Comparativo de custo
  // ────────────────────────────────────────────────────────────

  async getProjectCostComparison(projectId: string) {
    const { data, error } = await supabase
      .from('vw_project_cost_comparison')
      .select('*')
      .eq('project_id', projectId)

    if (error) throw error
    return data ?? []
  },

  // ────────────────────────────────────────────────────────────
  // HELPERS INTERNOS
  // ────────────────────────────────────────────────────────────

  async _generateCode(projectId: string): Promise<string> {
    const { data, error } = await supabase
      .rpc('generate_work_order_code', { p_project_id: projectId })

    if (error) throw error
    return data as string
  },

  async _getProjectConfig(projectId: string) {
    const { data } = await supabase
      .from('project_ops_config')
      .select('gate_config')
      .eq('project_id', projectId)
      .single()

    return data
  },

  async _recalculateTotals(workOrderId: string) {
    const { data: logs, error } = await supabase
      .from('work_logs')
      .select('quantity_executed, calculated_cost')
      .eq('work_order_id', workOrderId)

    if (error) throw error

    const { data: wo } = await supabase
      .from('work_orders')
      .select('planned_quantity')
      .eq('id', workOrderId)
      .single()

    const totalQty = (logs ?? []).reduce(
      (sum: number, l: { quantity_executed: number | null }) => sum + (l.quantity_executed ?? 0),
      0
    )
    const totalLaborCost = (logs ?? []).reduce(
      (sum: number, l: { calculated_cost: number | null }) => sum + (l.calculated_cost ?? 0),
      0
    )

    const plannedQty = wo?.planned_quantity ?? 0
    const completionPct = plannedQty > 0
      ? Math.min(100, (totalQty / plannedQty) * 100)
      : 0

    await supabase
      .from('work_orders')
      .update({
        executed_quantity: totalQty,
        completion_pct: Number(completionPct.toFixed(2)),
        actual_labor_cost: totalLaborCost,
        actual_total_cost: totalLaborCost, // material adicionado manualmente na Sprint 8
      })
      .eq('id', workOrderId)
  },
}
