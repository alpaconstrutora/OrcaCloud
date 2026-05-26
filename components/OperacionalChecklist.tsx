import React, { useState, useEffect } from 'react'
import { CheckSquare, Square, Loader2, AlertCircle, ChevronDown, ChevronRight, Wand2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TipoObra, ProjectTypeTemplate } from '../types/project'
import { projectTypeTemplatesService } from '../services/projectTypeTemplatesService'

interface ChecklistItem {
  id: string
  description: string
  required: boolean
  requires_photo: boolean
  gate: 'pre_start' | 'pre_completion' | 'free'
  sort_order: number
}

interface ChecklistResponse {
  id: string
  item_id: string
  completed: boolean
  notes: string | null
  completed_at: string | null
}

interface Props {
  workOrderId: string
  orgId?: string
}

const TIPO_OBRA_LABELS: Record<TipoObra, string> = {
  residencial_multifamiliar: 'Residencial Multifamiliar',
  casa: 'Casa Residencial',
  loja: 'Loja Comercial',
  sala: 'Sala / Escritório',
  galpao: 'Galpão Industrial',
  reforma: 'Reforma',
  outro: 'Outro',
}

const GATE_LABELS: Record<string, string> = {
  pre_start: 'Pré-início',
  pre_completion: 'Pré-conclusão',
  free: 'Livre',
}

const GATE_COLORS: Record<string, string> = {
  pre_start: 'bg-amber-100 text-amber-700',
  pre_completion: 'bg-purple-100 text-purple-700',
  free: 'bg-slate-100 text-slate-600',
}

const OperacionalChecklist: React.FC<Props> = ({ workOrderId, orgId }) => {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [responses, setResponses] = useState<Record<string, ChecklistResponse>>({})
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [tipoObra, setTipoObra] = useState<TipoObra | null>(null)
  const [template, setTemplate] = useState<ProjectTypeTemplate | null>(null)

  useEffect(() => {
    loadData()
  }, [workOrderId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load work order to get checklist template and project_id
      const { data: wo, error: woErr } = await supabase
        .from('work_orders')
        .select('checklist_template_id, project_id')
        .eq('id', workOrderId)
        .single()
      if (woErr) throw woErr

      if (!wo.checklist_template_id) {
        setItems([])
        setResponses({})
        // Try to load tipo_obra from project for seed suggestion
        if (wo.project_id) {
          const { data: proj } = await supabase
            .from('projects')
            .select('settings')
            .eq('id', wo.project_id)
            .maybeSingle()
          const tipo = (proj?.settings as any)?.tipoObra as TipoObra | undefined
          if (tipo) {
            setTipoObra(tipo)
            const tmpl = await projectTypeTemplatesService.getTemplate(tipo, orgId)
            setTemplate(tmpl)
          }
        }
        setLoading(false)
        return
      }

      const [itemsRes, responsesRes] = await Promise.all([
        supabase
          .from('oe_checklist_items')
          .select('*')
          .eq('template_id', wo.checklist_template_id)
          .order('sort_order'),
        supabase
          .from('oe_checklist_responses')
          .select('*')
          .eq('work_order_id', workOrderId),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (responsesRes.error) throw responsesRes.error

      setItems(itemsRes.data ?? [])
      const respMap: Record<string, ChecklistResponse> = {}
      for (const r of responsesRes.data ?? []) {
        respMap[r.item_id] = r
      }
      setResponses(respMap)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar checklist')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (itemId: string) => {
    setToggling(itemId)
    setError(null)
    try {
      const current = responses[itemId]
      const nowCompleted = !current?.completed

      if (current) {
        const { error: updErr } = await supabase
          .from('oe_checklist_responses')
          .update({
            completed: nowCompleted,
            completed_at: nowCompleted ? new Date().toISOString() : null,
          })
          .eq('id', current.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('oe_checklist_responses')
          .insert({
            work_order_id: workOrderId,
            item_id: itemId,
            completed: true,
            completed_at: new Date().toISOString(),
          })
        if (insErr) throw insErr
      }

      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar item')
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  const handleSeedFromTemplate = async () => {
    if (!template || !tipoObra || !orgId) return
    setSeeding(true)
    setError(null)
    try {
      // Create an oe_checklist_template entry
      const { data: tplRow, error: tplErr } = await supabase
        .from('oe_checklist_templates')
        .insert({
          org_id: orgId,
          name: `${TIPO_OBRA_LABELS[tipoObra]} — Padrão`,
          service_type: tipoObra,
          active: true,
        })
        .select('id')
        .single()
      if (tplErr) throw tplErr

      // Insert checklist items from template
      const itemsToInsert: Array<{
        template_id: string; description: string; required: boolean;
        requires_photo: boolean; gate: string; sort_order: number
      }> = []
      let order = 0
      for (const phase of template.checklist_template) {
        const gate = phase.phase === 'pre_start' ? 'pre_start'
          : phase.phase === 'pre_completion' ? 'pre_completion' : 'free'
        for (const desc of phase.items) {
          itemsToInsert.push({
            template_id: tplRow.id,
            description: desc,
            required: gate !== 'free',
            requires_photo: false,
            gate,
            sort_order: order++,
          })
        }
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('oe_checklist_items')
          .insert(itemsToInsert)
        if (itemsErr) throw itemsErr
      }

      // Link template to work order
      const { error: woErr } = await supabase
        .from('work_orders')
        .update({ checklist_template_id: tplRow.id })
        .eq('id', workOrderId)
      if (woErr) throw woErr

      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao pré-popular checklist')
    } finally {
      setSeeding(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-4">
        <CheckSquare className="w-10 h-10 mb-2" />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-400">Nenhum checklist vinculado</p>
          <p className="text-xs mt-1 text-slate-400">Vincule um modelo ao criar a OE ou use o template do tipo de obra</p>
        </div>
        {tipoObra && template && template.checklist_template.length > 0 && orgId && (
          <button
            onClick={handleSeedFromTemplate}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
          >
            {seeding
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Wand2 className="w-4 h-4" />}
            Pré-popular pelo tipo: {TIPO_OBRA_LABELS[tipoObra]}
          </button>
        )}
      </div>
    )
  }

  // Group by gate
  const byGate: Record<string, ChecklistItem[]> = {}
  for (const item of items) {
    if (!byGate[item.gate]) byGate[item.gate] = []
    byGate[item.gate].push(item)
  }

  const completedCount = Object.values(responses).filter(r => r.completed).length
  const pct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Progress */}
      <div className="bg-slate-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-black text-slate-700">{completedCount} / {items.length} itens concluídos</span>
          <span className="text-sm font-black text-blue-600">{pct}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Items by gate */}
      {(['pre_start', 'pre_completion', 'free'] as const).map(gate => {
        const gateItems = byGate[gate]
        if (!gateItems?.length) return null

        const gateCompleted = gateItems.filter(i => responses[i.id]?.completed).length
        const isCollapsed = collapsed[gate]

        return (
          <div key={gate} className="border border-slate-100 rounded-2xl overflow-hidden">
            <button
              onClick={() => setCollapsed(c => ({ ...c, [gate]: !c[gate] }))}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${GATE_COLORS[gate]}`}>
                  {GATE_LABELS[gate]}
                </span>
                <span className="text-sm font-bold text-slate-600">
                  {gateCompleted}/{gateItems.length}
                </span>
              </div>
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-slate-50">
                {gateItems.map(item => {
                  const resp = responses[item.id]
                  const done = resp?.completed ?? false

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => handleToggle(item.id)}
                    >
                      <div className="mt-0.5 shrink-0">
                        {toggling === item.id ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : done ? (
                          <CheckSquare className="w-5 h-5 text-green-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.required && (
                            <span className="text-xs font-bold text-red-500">Obrigatório</span>
                          )}
                          {item.requires_photo && (
                            <span className="text-xs font-bold text-purple-500">Requer foto</span>
                          )}
                          {done && resp?.completed_at && (
                            <span className="text-xs text-slate-400">
                              {new Date(resp.completed_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default OperacionalChecklist
