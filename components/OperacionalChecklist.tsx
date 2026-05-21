import React, { useState, useEffect } from 'react'
import { CheckSquare, Square, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

const OperacionalChecklist: React.FC<Props> = ({ workOrderId }) => {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [responses, setResponses] = useState<Record<string, ChecklistResponse>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadData()
  }, [workOrderId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load work order to get checklist template
      const { data: wo, error: woErr } = await supabase
        .from('work_orders')
        .select('checklist_template_id')
        .eq('id', workOrderId)
        .single()
      if (woErr) throw woErr

      if (!wo.checklist_template_id) {
        setItems([])
        setResponses({})
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-300">
        <CheckSquare className="w-10 h-10 mb-2" />
        <p className="text-sm font-bold">Nenhum checklist vinculado</p>
        <p className="text-xs mt-1 text-slate-400">Vincule um modelo de checklist ao criar a OE</p>
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
