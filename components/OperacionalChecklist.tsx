import React, { useState, useEffect, useRef } from 'react'
import {
  CheckSquare, Loader2, AlertCircle, ChevronDown, ChevronRight, Wand2,
  CheckCircle2, XCircle, MinusCircle, Ban, Camera,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TipoObra, ProjectTypeTemplate } from '../types/project'
import { projectTypeTemplatesService } from '../services/projectTypeTemplatesService'

type ResponseStatus = 'conforme' | 'nao_conforme' | 'parcial' | 'nao_aplicavel'

interface ChecklistItem {
  id: string
  description: string
  required: boolean
  requires_photo: boolean
  gate: 'pre_start' | 'pre_completion' | 'free'
  sort_order: number
  severity: 'minor' | 'moderate' | 'major' | null
  category: string | null
}

interface ChecklistResponse {
  id: string
  item_id: string
  completed: boolean
  response_status: ResponseStatus | null
  notes: string | null
  evidence_id: string | null
  nc_id: string | null
  completed_at: string | null
}

interface Props {
  workOrderId: string
  orgId?: string
}

interface NCFormState {
  description: string
  severity: 'minor' | 'moderate' | 'major'
  dueDate: string
  correctiveAction: string
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

const SEVERITY_LABELS: Record<string, string> = {
  minor: 'Leve',
  moderate: 'Moderada',
  major: 'Grave',
}

const STATUS_OPTIONS: Array<{
  value: ResponseStatus
  label: string
  icon: React.ElementType
  activeCls: string
  hoverCls: string
}> = [
  {
    value: 'conforme',
    label: 'Conforme',
    icon: CheckCircle2,
    activeCls: 'bg-emerald-600 text-white border-transparent',
    hoverCls: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300',
  },
  {
    value: 'nao_conforme',
    label: 'Não conforme',
    icon: XCircle,
    activeCls: 'bg-red-600 text-white border-transparent',
    hoverCls: 'hover:bg-red-50 hover:text-red-700 hover:border-red-300',
  },
  {
    value: 'parcial',
    label: 'Parcial',
    icon: MinusCircle,
    activeCls: 'bg-amber-500 text-white border-transparent',
    hoverCls: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300',
  },
  {
    value: 'nao_aplicavel',
    label: 'N/A',
    icon: Ban,
    activeCls: 'bg-slate-400 text-white border-transparent',
    hoverCls: 'hover:bg-slate-100 hover:text-slate-600 hover:border-slate-300',
  },
]

const OperacionalChecklist: React.FC<Props> = ({ workOrderId, orgId }) => {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [responses, setResponses] = useState<Record<string, ChecklistResponse>>({})
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expandedNCItemId, setExpandedNCItemId] = useState<string | null>(null)
  const [ncForms, setNcForms] = useState<Record<string, NCFormState>>({})
  const [tipoObra, setTipoObra] = useState<TipoObra | null>(null)
  const [template, setTemplate] = useState<ProjectTypeTemplate | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { loadData() }, [workOrderId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: wo, error: woErr } = await supabase
        .from('work_orders')
        .select('checklist_template_id, project_id')
        .eq('id', workOrderId)
        .single()
      if (woErr) throw woErr

      if (!wo.checklist_template_id) {
        setItems([])
        setResponses({})
        if (wo.project_id) {
          const { data: proj } = await supabase
            .from('projects')
            .select('settings')
            .eq('id', wo.project_id)
            .maybeSingle()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .select('id, description, required, requires_photo, gate, sort_order, severity, category')
          .eq('template_id', wo.checklist_template_id)
          .order('sort_order'),
        supabase
          .from('oe_checklist_responses')
          .select('id, item_id, completed, response_status, notes, evidence_id, nc_id, completed_at')
          .eq('work_order_id', workOrderId),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (responsesRes.error) throw responsesRes.error

      setItems(itemsRes.data ?? [])
      const respMap: Record<string, ChecklistResponse> = {}
      for (const r of responsesRes.data ?? []) respMap[r.item_id] = r
      setResponses(respMap)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar checklist')
    } finally {
      setLoading(false)
    }
  }

  const handleSeedFromTemplate = async () => {
    if (!template || !tipoObra || !orgId) return
    setSeeding(true)
    setError(null)
    try {
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

      const itemsToInsert: Array<{
        template_id: string; description: string; required: boolean
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
        const { error: itemsErr } = await supabase.from('oe_checklist_items').insert(itemsToInsert)
        if (itemsErr) throw itemsErr
      }

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

  const saveResponse = async (
    item: ChecklistItem,
    status: ResponseStatus,
    ncId: string | null = null,
  ) => {
    setSaving(item.id)
    setError(null)
    try {
      const isComplete = status !== 'nao_aplicavel'
      const current = responses[item.id]
      const payload = {
        response_status: status,
        completed: isComplete,
        completed_at: isComplete ? new Date().toISOString() : null,
        nc_id: ncId,
      }

      if (current) {
        const { error: updErr } = await supabase
          .from('oe_checklist_responses')
          .update(payload)
          .eq('id', current.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('oe_checklist_responses')
          .insert({ work_order_id: workOrderId, item_id: item.id, ...payload })
        if (insErr) throw insErr
      }

      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar resposta')
    } finally {
      setSaving(null)
    }
  }

  const handleStatusSelect = (item: ChecklistItem, status: ResponseStatus) => {
    const current = responses[item.id]
    if (current?.response_status === status) return

    if (status === 'nao_conforme') {
      setExpandedNCItemId(item.id)
      setNcForms(f => ({
        ...f,
        [item.id]: {
          description: item.description,
          severity: item.severity ?? 'moderate',
          dueDate: '',
          correctiveAction: '',
        },
      }))
      return
    }

    saveResponse(item, status)
  }

  const handleNCSubmit = async (item: ChecklistItem) => {
    const ncForm = ncForms[item.id]
    if (!ncForm) return
    setSaving(item.id)
    setError(null)
    try {
      const { data: nc, error: ncErr } = await supabase
        .from('non_conformances')
        .insert({
          work_order_id: workOrderId,
          description: ncForm.description,
          severity: ncForm.severity,
          due_date: ncForm.dueDate || null,
          corrective_action: ncForm.correctiveAction || null,
          status: 'open',
        })
        .select('id')
        .single()
      if (ncErr) throw ncErr

      await saveResponse(item, 'nao_conforme', nc.id)
      setExpandedNCItemId(null)
      setNcForms(f => { const n = { ...f }; delete n[item.id]; return n })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar NC')
      setSaving(null)
    }
  }

  const handlePhotoUpload = async (item: ChecklistItem, file: File) => {
    setUploading(item.id)
    setError(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `evidence/${orgId ?? 'default'}/${workOrderId}/cl_${item.id}_${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('operational-evidence')
        .upload(path, file, { upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('operational-evidence').getPublicUrl(path)

      const { data: ev, error: evErr } = await supabase
        .from('evidence_files')
        .insert({
          work_order_id: workOrderId,
          file_type: 'photo',
          file_url: urlData.publicUrl,
          gate: item.gate,
          description: `Checklist: ${item.description}`,
          captured_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (evErr) throw evErr

      const current = responses[item.id]
      if (current) {
        await supabase.from('oe_checklist_responses').update({ evidence_id: ev.id }).eq('id', current.id)
      } else {
        await supabase.from('oe_checklist_responses').insert({
          work_order_id: workOrderId,
          item_id: item.id,
          evidence_id: ev.id,
          completed: false,
        })
      }

      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar foto')
    } finally {
      setUploading(null)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────

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
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Pré-popular pelo tipo: {TIPO_OBRA_LABELS[tipoObra]}
          </button>
        )}
      </div>
    )
  }

  // ── Group by gate ─────────────────────────────────────────────────────────

  const byGate: Record<string, ChecklistItem[]> = {}
  for (const item of items) {
    if (!byGate[item.gate]) byGate[item.gate] = []
    byGate[item.gate].push(item)
  }

  const totalAnswered = Object.values(responses).filter(r => r.response_status !== null).length
  const conformeCount = Object.values(responses).filter(r => r.response_status === 'conforme').length
  const ncCount       = Object.values(responses).filter(r => r.response_status === 'nao_conforme').length
  const pct = items.length > 0 ? Math.round((totalAnswered / items.length) * 100) : 0

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Progress */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-slate-700">{totalAnswered} / {items.length} respondidos</span>
          <span className="text-sm font-black text-blue-600">{pct}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        {(conformeCount > 0 || ncCount > 0) && (
          <div className="flex items-center gap-4 text-xs font-bold">
            {conformeCount > 0 && <span className="text-emerald-600">{conformeCount} conformes</span>}
            {ncCount > 0 && <span className="text-red-600">{ncCount} não conformes</span>}
          </div>
        )}
      </div>

      {/* Items by gate */}
      {(['pre_start', 'pre_completion', 'free'] as const).map(gate => {
        const gateItems = byGate[gate]
        if (!gateItems?.length) return null

        const gateAnswered = gateItems.filter(i => responses[i.id]?.response_status).length
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
                <span className="text-sm font-bold text-slate-600">{gateAnswered}/{gateItems.length}</span>
              </div>
              {isCollapsed
                ? <ChevronRight className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-slate-50">
                {gateItems.map(item => {
                  const resp = responses[item.id]
                  const currentStatus = resp?.response_status ?? null
                  const isSaving = saving === item.id
                  const isUploadingThis = uploading === item.id
                  const hasPhoto = Boolean(resp?.evidence_id)
                  const isNCExpanded = expandedNCItemId === item.id
                  const ncForm = ncForms[item.id]

                  return (
                    <div key={item.id} className="px-4 py-3 space-y-3">
                      {/* Description + meta */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.description}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {item.required && (
                              <span className="text-xs font-bold text-red-500">Obrigatório</span>
                            )}
                            {item.category && (
                              <span className="text-xs text-slate-400">{item.category}</span>
                            )}
                            {item.requires_photo && (
                              <span className={`text-xs font-bold ${hasPhoto ? 'text-emerald-600' : 'text-purple-500'}`}>
                                {hasPhoto ? '✓ Foto' : 'Requer foto'}
                              </span>
                            )}
                            {resp?.completed_at && (
                              <span className="text-xs text-slate-400">
                                {new Date(resp.completed_at).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                            {resp?.nc_id && (
                              <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                NC aberta
                              </span>
                            )}
                          </div>
                        </div>
                        {isSaving && <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-1" />}
                      </div>

                      {/* 4-state response buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {STATUS_OPTIONS.map(opt => {
                          const Icon = opt.icon
                          const isActive = currentStatus === opt.value
                          return (
                            <button
                              key={opt.value}
                              disabled={isSaving}
                              onClick={() => handleStatusSelect(item, opt.value)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all disabled:opacity-50
                                ${isActive
                                  ? opt.activeCls + ' shadow-sm'
                                  : 'border-slate-200 text-slate-500 ' + opt.hoverCls}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {opt.label}
                            </button>
                          )
                        })}

                        {/* Photo button (always visible if requires_photo) */}
                        {item.requires_photo && (
                          <>
                            <input
                              ref={el => { fileRefs.current[item.id] = el }}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0]
                                if (f) handlePhotoUpload(item, f)
                                e.target.value = ''
                              }}
                            />
                            <button
                              disabled={isUploadingThis}
                              onClick={() => fileRefs.current[item.id]?.click()}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all
                                ${hasPhoto
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                            >
                              {isUploadingThis
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Camera className="w-3.5 h-3.5" />}
                              {hasPhoto ? 'Foto OK' : 'Foto'}
                            </button>
                          </>
                        )}
                      </div>

                      {/* NC inline form */}
                      {isNCExpanded && ncForm && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-3">
                          <p className="text-xs font-black text-red-600 uppercase tracking-widest">
                            Registrar Não Conformidade
                          </p>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs font-bold text-slate-500">Descrição</label>
                              <textarea
                                value={ncForm.description}
                                onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], description: e.target.value } }))}
                                rows={2}
                                className="mt-1 w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-bold text-slate-500">Severidade</label>
                                <select
                                  value={ncForm.severity}
                                  onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], severity: e.target.value as NCFormState['severity'] } }))}
                                  className="mt-1 w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400"
                                >
                                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-slate-500">Prazo</label>
                                <input
                                  type="date"
                                  value={ncForm.dueDate}
                                  onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], dueDate: e.target.value } }))}
                                  className="mt-1 w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500">Ação corretiva</label>
                              <textarea
                                value={ncForm.correctiveAction}
                                onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], correctiveAction: e.target.value } }))}
                                rows={2}
                                placeholder="Opcional"
                                className="mt-1 w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => {
                                setExpandedNCItemId(null)
                                setNcForms(f => { const n = { ...f }; delete n[item.id]; return n })
                              }}
                              className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={isSaving || !ncForm.description.trim()}
                              onClick={() => handleNCSubmit(item)}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 disabled:opacity-50"
                            >
                              {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                              Confirmar NC
                            </button>
                          </div>
                        </div>
                      )}
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
