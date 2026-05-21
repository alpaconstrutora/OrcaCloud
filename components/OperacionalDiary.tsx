import React, { useState, useEffect } from 'react'
import {
  BookOpen, Plus, Sun, Cloud, CloudRain, CloudLightning,
  Users, Loader2, AlertCircle, ChevronLeft, ChevronRight, Save
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WeatherCondition, FieldCondition, SiteDiarySnapshot } from '../types/operational-control'

interface SiteDiary {
  id: string
  diary_date: string
  weather: WeatherCondition | null
  field_condition: FieldCondition
  workers_present: number
  general_notes: string | null
  auto_generated: boolean
  snapshot: SiteDiarySnapshot | null
  reviewed_at: string | null
}

interface Props {
  projectId: string
  orgId: string
}

const WEATHER_CONFIG: Record<WeatherCondition, { label: string; icon: React.ElementType; cls: string }> = {
  sunny: { label: 'Ensolarado', icon: Sun, cls: 'text-yellow-500' },
  cloudy: { label: 'Nublado', icon: Cloud, cls: 'text-slate-500' },
  rain: { label: 'Chuva', icon: CloudRain, cls: 'text-blue-500' },
  heavy_rain: { label: 'Chuva forte', icon: CloudLightning, cls: 'text-indigo-600' },
}

const FIELD_CONDITION_CONFIG: Record<FieldCondition, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'bg-green-100 text-green-700' },
  compromised: { label: 'Comprometido', cls: 'bg-amber-100 text-amber-700' },
  halted: { label: 'Paralisado', cls: 'bg-red-100 text-red-700' },
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planejada', released: 'Liberada', in_progress: 'Em execução',
  pending_inspection: 'Aguard. inspeção', approved: 'Aprovada',
  rejected: 'Rejeitada', measured: 'Medida', closed: 'Encerrada', blocked: 'Bloqueada',
}

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
})

const OperacionalDiary: React.FC<Props> = ({ projectId, orgId }) => {
  const [diaries, setDiaries] = useState<SiteDiary[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedDiary, setSelectedDiary] = useState<SiteDiary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'view' | 'edit'>('list')
  const [currentPage, setCurrentPage] = useState(0)

  const [form, setForm] = useState({
    weather: 'sunny' as WeatherCondition,
    fieldCondition: 'normal' as FieldCondition,
    workersPresent: '0',
    generalNotes: '',
  })

  useEffect(() => {
    loadDiaries()
  }, [projectId])

  const loadDiaries = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('site_diary')
        .select('*')
        .eq('project_id', projectId)
        .order('diary_date', { ascending: false })
      if (fetchErr) throw fetchErr
      setDiaries(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar diários')
    } finally {
      setLoading(false)
    }
  }

  const handleAutoGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      // Check if diary already exists for today
      const existing = diaries.find(d => d.diary_date === selectedDate)
      if (existing) {
        setSelectedDiary(existing)
        populateForm(existing)
        setMode('view')
        return
      }

      // Fetch today's work logs and active work orders for snapshot
      const [woRes, logsRes, ncsRes] = await Promise.all([
        supabase.from('work_orders').select('id, code, title, status, completion_pct').eq('project_id', projectId).in('status', ['in_progress', 'pending_inspection', 'released']),
        supabase.from('work_logs').select('team_id, hours_worked, quantity_executed, team:labor_teams(name)').eq('work_order_id', projectId),
        supabase.from('non_conformances').select('id, description, severity, status').in('status', ['open', 'in_treatment']),
      ])

      const snapshot: SiteDiarySnapshot = {
        workOrders: (woRes.data ?? []).map(w => ({
          id: w.id, code: w.code, title: w.title, status: w.status, completionPct: w.completion_pct,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        workLogs: (logsRes.data ?? []).map((l: any) => ({
          teamId: l.team_id, teamName: Array.isArray(l.team) ? (l.team[0]?.name ?? null) : (l.team?.name ?? null), hoursWorked: l.hours_worked, quantityExecuted: l.quantity_executed,
        })),
        nonConformances: (ncsRes.data ?? []).map(nc => ({
          id: nc.id, description: nc.description, severity: nc.severity, status: nc.status,
        })),
        snapshotAt: new Date().toISOString(),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalWorkers = (logsRes.data ?? []).reduce((s: number, l: any) => s + (l.hours_worked ? 1 : 0), 0)

      const { data: inserted, error: insErr } = await supabase
        .from('site_diary')
        .insert({
          project_id: projectId,
          org_id: orgId,
          diary_date: selectedDate,
          weather: 'sunny',
          field_condition: 'normal',
          workers_present: totalWorkers,
          auto_generated: true,
          snapshot,
        })
        .select()
        .single()

      if (insErr) throw insErr
      await loadDiaries()
      setSelectedDiary(inserted)
      populateForm(inserted)
      setMode('edit')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar diário')
    } finally {
      setGenerating(false)
    }
  }

  const populateForm = (diary: SiteDiary) => {
    setForm({
      weather: diary.weather ?? 'sunny',
      fieldCondition: diary.field_condition,
      workersPresent: String(diary.workers_present),
      generalNotes: diary.general_notes ?? '',
    })
  }

  const handleSave = async () => {
    if (!selectedDiary) return
    setSaving(true)
    setError(null)
    try {
      const { error: updErr } = await supabase
        .from('site_diary')
        .update({
          weather: form.weather,
          field_condition: form.fieldCondition,
          workers_present: parseInt(form.workersPresent) || 0,
          general_notes: form.generalNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedDiary.id)
      if (updErr) throw updErr
      await loadDiaries()
      setMode('list')
      setSelectedDiary(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar diário')
    } finally {
      setSaving(false)
    }
  }

  const PAGE_SIZE = 7
  const paged = diaries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(diaries.length / PAGE_SIZE)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  // ── Edit / View mode ──────────────────────────────────────────────────────────
  if ((mode === 'view' || mode === 'edit') && selectedDiary) {
    const WeatherIcon = WEATHER_CONFIG[selectedDiary.weather ?? 'sunny']?.icon ?? Sun

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setMode('list'); setSelectedDiary(null) }}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              {fmtDate(selectedDiary.diary_date)}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedDiary.auto_generated ? 'Gerado automaticamente' : 'Registro manual'}
              {selectedDiary.reviewed_at && ' · Revisado'}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Condições do dia</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(WEATHER_CONFIG) as [WeatherCondition, typeof WEATHER_CONFIG[WeatherCondition]][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <button
                  key={key}
                  onClick={() => setForm(f => ({ ...f, weather: key }))}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                    ${form.weather === key ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                >
                  <Icon className={`w-6 h-6 ${cfg.cls}`} />
                  <span className="text-xs font-bold text-slate-600">{cfg.label}</span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Campo</label>
              <select
                value={form.fieldCondition}
                onChange={e => setForm(f => ({ ...f, fieldCondition: e.target.value as FieldCondition }))}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="normal">Normal</option>
                <option value="compromised">Comprometido</option>
                <option value="halted">Paralisado</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Trabalhadores presentes</label>
              <input
                type="number"
                min="0"
                value={form.workersPresent}
                onChange={e => setForm(f => ({ ...f, workersPresent: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Anotações gerais</label>
              <textarea
                value={form.generalNotes}
                onChange={e => setForm(f => ({ ...f, generalNotes: e.target.value }))}
                rows={4}
                placeholder="Registre ocorrências, visitas, decisões do dia..."
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Snapshot */}
        {selectedDiary.snapshot && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Snapshot do dia</p>

            {selectedDiary.snapshot.workOrders.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">OEs ativas</p>
                <div className="space-y-1">
                  {selectedDiary.snapshot.workOrders.map(wo => (
                    <div key={wo.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                      <span className="text-slate-700 font-medium">
                        {wo.code && <span className="text-slate-400 mr-1">{wo.code}</span>}
                        {wo.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-slate-400">{STATUS_LABELS[wo.status] ?? wo.status}</span>
                        <span className="text-xs font-black text-blue-600">{wo.completionPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDiary.snapshot.nonConformances.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">NCs abertas</p>
                <div className="space-y-1">
                  {selectedDiary.snapshot.nonConformances.map(nc => (
                    <div key={nc.id} className="text-sm text-slate-700 py-1 border-b border-slate-50 last:border-0">
                      {nc.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => { setMode('list'); setSelectedDiary(null) }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-black transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    )
  }

  // ── List mode ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">{diaries.length} {diaries.length === 1 ? 'entrada' : 'entradas'} no diário</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {generating ? 'Gerando...' : 'Registrar dia'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {diaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-300">
          <BookOpen className="w-16 h-16 mb-4" />
          <p className="text-lg font-black">Diário vazio</p>
          <p className="text-sm mt-1 text-slate-400">Selecione uma data e clique em "Registrar dia"</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paged.map(diary => {
              const weatherCfg = WEATHER_CONFIG[diary.weather ?? 'sunny']
              const WeatherIcon = weatherCfg?.icon ?? Sun
              const fieldCfg = FIELD_CONDITION_CONFIG[diary.field_condition]

              return (
                <button
                  key={diary.id}
                  onClick={() => { setSelectedDiary(diary); populateForm(diary); setMode('view') }}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex flex-col items-center justify-center w-14 shrink-0">
                    <span className="text-xl font-black text-slate-900">
                      {new Date(diary.diary_date + 'T12:00:00').getDate().toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs text-slate-400 font-bold uppercase">
                      {new Date(diary.diary_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                    </span>
                  </div>

                  <div className="w-px h-10 bg-slate-100 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <WeatherIcon className={`w-4 h-4 shrink-0 ${weatherCfg?.cls}`} />
                      <span className="text-sm font-black text-slate-900">
                        {new Date(diary.diary_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                      </span>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${fieldCfg.cls}`}>
                        {fieldCfg.label}
                      </span>
                    </div>
                    {diary.general_notes && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{diary.general_notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-slate-500 font-bold">
                      <Users className="w-3.5 h-3.5" />
                      {diary.workers_present}
                    </div>
                    {diary.reviewed_at && (
                      <span className="text-xs bg-green-100 text-green-700 font-black px-2 py-0.5 rounded-lg">
                        Revisado
                      </span>
                    )}
                    {diary.auto_generated && !diary.reviewed_at && (
                      <span className="text-xs bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-lg">
                        Auto
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-500">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default OperacionalDiary
