import React, { useState, useEffect } from 'react'
import { Plus, Clock, DollarSign, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface WorkLog {
  id: string
  log_date: string
  team_id: string | null
  hours_worked: number | null
  quantity_executed: number | null
  calculated_cost: number | null
  notes: string | null
  created_at: string
  team?: { name: string } | null
}

interface Team {
  id: string
  name: string
}

interface Props {
  workOrderId: string
  measurementUnit: string | null
  onLogsChanged?: () => void
}

const fmtCurrency = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

const OperacionalWorkLog: React.FC<Props> = ({ workOrderId, measurementUnit, onLogsChanged }) => {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    logDate: new Date().toISOString().split('T')[0],
    teamId: '',
    hoursWorked: '',
    quantityExecuted: '',
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [workOrderId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [logsRes, teamsRes] = await Promise.all([
        supabase
          .from('work_logs')
          .select('*, team:labor_teams(name)')
          .eq('work_order_id', workOrderId)
          .order('log_date', { ascending: false }),
        supabase
          .from('labor_teams')
          .select('id, name')
          .order('name'),
      ])
      if (logsRes.error) throw logsRes.error
      if (teamsRes.error) throw teamsRes.error
      setLogs(logsRes.data ?? [])
      setTeams(teamsRes.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar apontamentos')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        work_order_id: workOrderId,
        log_date: form.logDate,
        team_id: form.teamId || null,
        hours_worked: form.hoursWorked ? parseFloat(form.hoursWorked) : null,
        quantity_executed: form.quantityExecuted ? parseFloat(form.quantityExecuted) : null,
        notes: form.notes || null,
      }

      // Calculate cost from team hourly rate if team selected and hours given
      if (form.teamId && form.hoursWorked) {
        const { data: costData } = await supabase
          .from('vw_team_hourly_cost')
          .select('total_hourly_cost')
          .eq('team_id', form.teamId)
          .single()
        if (costData) {
          payload.calculated_cost = costData.total_hourly_cost * parseFloat(form.hoursWorked)
        }
      }

      const { error: insertErr } = await supabase.from('work_logs').insert(payload)
      if (insertErr) throw insertErr

      setForm({ logDate: new Date().toISOString().split('T')[0], teamId: '', hoursWorked: '', quantityExecuted: '', notes: '' })
      setShowForm(false)
      await loadData()
      onLogsChanged?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar apontamento')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este apontamento?')) return
    const { error: delErr } = await supabase.from('work_logs').delete().eq('id', id)
    if (delErr) { setError(delErr.message); return }
    await loadData()
    onLogsChanged?.()
  }

  const totalHours = logs.reduce((s, l) => s + (l.hours_worked ?? 0), 0)
  const totalCost = logs.reduce((s, l) => s + (l.calculated_cost ?? 0), 0)
  const totalQty = logs.reduce((s, l) => s + (l.quantity_executed ?? 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Horas</p>
          <p className="text-xl font-black text-slate-900">{totalHours.toFixed(1)}h</p>
        </div>
        {measurementUnit && (
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">{measurementUnit}</p>
            <p className="text-xl font-black text-slate-900">{totalQty.toFixed(2)}</p>
          </div>
        )}
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-xs text-blue-400 font-bold uppercase tracking-wide">Custo</p>
          <p className="text-xl font-black text-blue-700">{fmtCurrency(totalCost)}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Add button */}
      <button
        onClick={() => setShowForm(s => !s)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
      >
        {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? 'Cancelar' : 'Novo Apontamento'}
      </button>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Data</label>
              <input
                type="date"
                value={form.logDate}
                onChange={e => setForm(f => ({ ...f, logDate: e.target.value }))}
                required
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Equipe</label>
              <select
                value={form.teamId}
                onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="">Sem equipe</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Horas</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.hoursWorked}
                onChange={e => setForm(f => ({ ...f, hoursWorked: e.target.value }))}
                placeholder="0.0"
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>
            {measurementUnit && (
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-wide">{measurementUnit}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantityExecuted}
                  onChange={e => setForm(f => ({ ...f, quantityExecuted: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
                />
              </div>
            )}
            <div className="col-span-2 md:col-span-3">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Observações</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Descreva as atividades realizadas..."
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-300">
          <Clock className="w-10 h-10 mb-2" />
          <p className="text-sm font-bold">Nenhum apontamento registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-start justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-slate-900">{fmtDate(log.log_date)}</span>
                  {log.team && (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                      {log.team.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                  {log.hours_worked != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.hours_worked}h
                    </span>
                  )}
                  {log.quantity_executed != null && measurementUnit && (
                    <span>{log.quantity_executed} {measurementUnit}</span>
                  )}
                  {log.calculated_cost != null && (
                    <span className="flex items-center gap-1 text-blue-600 font-bold">
                      <DollarSign className="w-3 h-3" />
                      {fmtCurrency(log.calculated_cost)}
                    </span>
                  )}
                </div>
                {log.notes && <p className="text-xs text-slate-500 mt-1">{log.notes}</p>}
              </div>
              <button
                onClick={() => handleDelete(log.id)}
                className="text-xs text-red-400 hover:text-red-600 font-bold ml-4 shrink-0"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default OperacionalWorkLog
