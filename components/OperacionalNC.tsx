import React, { useState, useEffect } from 'react'
import { AlertTriangle, Plus, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface NonConformance {
  id: string
  description: string
  severity: 'minor' | 'moderate' | 'major'
  status: 'open' | 'in_treatment' | 'closed'
  due_date: string | null
  corrective_action: string | null
  created_at: string
  closed_at: string | null
}

interface Props {
  workOrderId: string
  orgId: string
}

const SEVERITY_CONFIG = {
  minor: { label: 'Leve', cls: 'bg-yellow-100 text-yellow-700' },
  moderate: { label: 'Moderada', cls: 'bg-orange-100 text-orange-700' },
  major: { label: 'Grave', cls: 'bg-red-100 text-red-700' },
}

const STATUS_CONFIG = {
  open: { label: 'Aberta', cls: 'bg-red-100 text-red-700', icon: AlertTriangle },
  in_treatment: { label: 'Em tratamento', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  closed: { label: 'Encerrada', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
}

const OperacionalNC: React.FC<Props> = ({ workOrderId }) => {
  const [ncs, setNcs] = useState<NonConformance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({
    description: '',
    severity: 'minor' as 'minor' | 'moderate' | 'major',
    dueDate: '',
    correctiveAction: '',
  })

  useEffect(() => {
    loadNCs()
  }, [workOrderId])

  const loadNCs = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('non_conformances')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false })
      if (fetchErr) throw fetchErr
      setNcs(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar NCs')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { error: insErr } = await supabase.from('non_conformances').insert({
        work_order_id: workOrderId,
        description: form.description,
        severity: form.severity,
        due_date: form.dueDate || null,
        corrective_action: form.correctiveAction || null,
        status: 'open',
      })
      if (insErr) throw insErr
      setForm({ description: '', severity: 'minor', dueDate: '', correctiveAction: '' })
      setShowForm(false)
      await loadNCs()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar NC')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (id: string, newStatus: NonConformance['status']) => {
    setError(null)
    try {
      const updates: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'closed') updates.closed_at = new Date().toISOString()
      const { error: updErr } = await supabase.from('non_conformances').update(updates).eq('id', id)
      if (updErr) throw updErr
      await loadNCs()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar NC')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  const openCount = ncs.filter(n => n.status === 'open').length
  const inTreatmentCount = ncs.filter(n => n.status === 'in_treatment').length
  const closedCount = ncs.filter(n => n.status === 'closed').length

  return (
    <div className="space-y-4">
      {/* Summary */}
      {ncs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-red-400 font-bold uppercase">Abertas</p>
            <p className="text-2xl font-black text-red-700">{openCount}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-xs text-amber-400 font-bold uppercase">Em tratamento</p>
            <p className="text-2xl font-black text-amber-700">{inTreatmentCount}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xs text-green-400 font-bold uppercase">Encerradas</p>
            <p className="text-2xl font-black text-green-700">{closedCount}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={() => setShowForm(s => !s)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {showForm ? 'Cancelar' : 'Registrar NC'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Descrição</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
                rows={2}
                placeholder="Descreva a não conformidade..."
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-red-400 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Severidade</label>
              <select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof form.severity }))}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-red-400"
              >
                <option value="minor">Leve</option>
                <option value="moderate">Moderada</option>
                <option value="major">Grave</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Prazo</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Ação corretiva</label>
              <textarea
                value={form.correctiveAction}
                onChange={e => setForm(f => ({ ...f, correctiveAction: e.target.value }))}
                rows={2}
                placeholder="Descreva a ação corretiva planejada..."
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-red-400 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Registrar
            </button>
          </div>
        </form>
      )}

      {ncs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-300">
          <AlertTriangle className="w-10 h-10 mb-2" />
          <p className="text-sm font-bold">Nenhuma não conformidade</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ncs.map(nc => {
            const sevCfg = SEVERITY_CONFIG[nc.severity]
            const stsCfg = STATUS_CONFIG[nc.status]
            const StsIcon = stsCfg.icon
            const isExpanded = expandedId === nc.id

            return (
              <div key={nc.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : nc.id)}
                  className="w-full flex items-start justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3 text-left">
                    <StsIcon className={`w-4 h-4 mt-0.5 shrink-0 ${nc.status === 'open' ? 'text-red-500' : nc.status === 'in_treatment' ? 'text-amber-500' : 'text-green-500'}`} />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{nc.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${sevCfg.cls}`}>
                          {sevCfg.label}
                        </span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${stsCfg.cls}`}>
                          {stsCfg.label}
                        </span>
                        {nc.due_date && (
                          <span className="text-xs text-slate-400">
                            Prazo: {new Date(nc.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
                    {nc.corrective_action && (
                      <div className="pt-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1">Ação corretiva</p>
                        <p className="text-sm text-slate-700">{nc.corrective_action}</p>
                      </div>
                    )}
                    {nc.status !== 'closed' && (
                      <div className="flex items-center gap-2">
                        {nc.status === 'open' && (
                          <button
                            onClick={() => handleStatusChange(nc.id, 'in_treatment')}
                            className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-black hover:bg-amber-200 transition-colors"
                          >
                            Iniciar tratamento
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusChange(nc.id, 'closed')}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-black hover:bg-green-200 transition-colors"
                        >
                          Encerrar NC
                        </button>
                      </div>
                    )}
                    {nc.closed_at && (
                      <p className="text-xs text-slate-400">
                        Encerrada em {new Date(nc.closed_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default OperacionalNC
