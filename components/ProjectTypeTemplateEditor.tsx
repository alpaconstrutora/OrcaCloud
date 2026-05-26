import React, { useState, useEffect } from 'react'
import {
  Layers, Plus, Trash2, Save, Loader2, AlertCircle, CheckCircle2,
  RotateCcw, ChevronDown, ChevronRight, GripVertical, Settings2,
} from 'lucide-react'
import { TipoObra, ProjectTypeTemplate, EapPhase, RequiredDoc, TemplateIndicator, ChecklistTemplateItem } from '../types/project'
import { projectTypeTemplatesService } from '../services/projectTypeTemplatesService'

const TIPO_OBRA_LABELS: Record<TipoObra, string> = {
  residencial_multifamiliar: 'Residencial Multifamiliar',
  casa: 'Casa Residencial',
  loja: 'Loja Comercial',
  sala: 'Sala / Escritório',
  galpao: 'Galpão Industrial',
  reforma: 'Reforma',
  outro: 'Outro',
}

const TIPOS: TipoObra[] = ['residencial_multifamiliar', 'casa', 'loja', 'sala', 'galpao', 'reforma', 'outro']

const GATE_LABELS: Record<string, string> = {
  pre_start: 'Pré-início',
  in_progress: 'Em andamento',
  pre_completion: 'Pré-conclusão',
}

interface Props {
  orgId: string
}

const emptyTemplate = (tipo: TipoObra): ProjectTypeTemplate => ({
  tipo_obra: tipo,
  eap_phases: [],
  required_docs: [],
  indicators: [],
  checklist_template: [
    { phase: 'pre_start', items: [] },
    { phase: 'in_progress', items: [] },
    { phase: 'pre_completion', items: [] },
  ],
})

const ProjectTypeTemplateEditor: React.FC<Props> = ({ orgId }) => {
  const [selectedTipo, setSelectedTipo] = useState<TipoObra>('residencial_multifamiliar')
  const [systemTemplate, setSystemTemplate] = useState<ProjectTypeTemplate | null>(null)
  const [orgTemplate, setOrgTemplate] = useState<ProjectTypeTemplate | null>(null)
  const [draft, setDraft] = useState<ProjectTypeTemplate>(emptyTemplate('residencial_multifamiliar'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [newEapCode, setNewEapCode] = useState('')
  const [newEapName, setNewEapName] = useState('')
  const [newDocName, setNewDocName] = useState('')
  const [newDocRequired, setNewDocRequired] = useState(true)
  const [newIndKey, setNewIndKey] = useState('')
  const [newIndLabel, setNewIndLabel] = useState('')
  const [newIndUnit, setNewIndUnit] = useState('')
  const [newChecklistItems, setNewChecklistItems] = useState<Record<string, string>>({})

  useEffect(() => {
    loadTemplates(selectedTipo)
  }, [selectedTipo, orgId])

  const loadTemplates = async (tipo: TipoObra) => {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const [sys, org] = await Promise.all([
        projectTypeTemplatesService.getTemplate(tipo, undefined),
        projectTypeTemplatesService.getTemplate(tipo, orgId),
      ])
      setSystemTemplate(sys)
      // org template only if it actually belongs to this org (not the system fallback)
      const hasOrgOverride = org && org.org_id === orgId
      setOrgTemplate(hasOrgOverride ? org : null)
      setDraft(hasOrgOverride ? { ...org } : sys ? { ...sys, org_id: orgId } : emptyTemplate(tipo))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await projectTypeTemplatesService.saveOrgTemplate({ ...draft, org_id: orgId, tipo_obra: selectedTipo })
      setSaved(true)
      await loadTemplates(selectedTipo)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar template')
    } finally {
      setSaving(false)
    }
  }

  const handleResetToSystem = () => {
    if (!systemTemplate) return
    if (!window.confirm('Descartar personalização e voltar ao template padrão do sistema?')) return
    setDraft({ ...systemTemplate, org_id: orgId })
  }

  const toggleSection = (key: string) =>
    setCollapsedSections(s => ({ ...s, [key]: !s[key] }))

  // ── EAP Phases ──────────────────────────────────────────────────────────────
  const addEapPhase = () => {
    if (!newEapCode.trim() || !newEapName.trim()) return
    setDraft(d => ({ ...d, eap_phases: [...d.eap_phases, { code: newEapCode.trim(), name: newEapName.trim() }] }))
    setNewEapCode('')
    setNewEapName('')
  }

  const removeEapPhase = (i: number) =>
    setDraft(d => ({ ...d, eap_phases: d.eap_phases.filter((_, idx) => idx !== i) }))

  const updateEapPhase = (i: number, field: keyof EapPhase, value: string) =>
    setDraft(d => ({ ...d, eap_phases: d.eap_phases.map((p, idx) => idx === i ? { ...p, [field]: value } : p) }))

  // ── Required Docs ────────────────────────────────────────────────────────────
  const addDoc = () => {
    if (!newDocName.trim()) return
    setDraft(d => ({ ...d, required_docs: [...d.required_docs, { name: newDocName.trim(), required: newDocRequired }] }))
    setNewDocName('')
    setNewDocRequired(true)
  }

  const removeDoc = (i: number) =>
    setDraft(d => ({ ...d, required_docs: d.required_docs.filter((_, idx) => idx !== i) }))

  const updateDoc = (i: number, field: keyof RequiredDoc, value: string | boolean) =>
    setDraft(d => ({ ...d, required_docs: d.required_docs.map((doc, idx) => idx === i ? { ...doc, [field]: value } : doc) }))

  // ── Indicators ───────────────────────────────────────────────────────────────
  const addIndicator = () => {
    if (!newIndKey.trim() || !newIndLabel.trim()) return
    setDraft(d => ({ ...d, indicators: [...d.indicators, { key: newIndKey.trim(), label: newIndLabel.trim(), unit: newIndUnit.trim() }] }))
    setNewIndKey('')
    setNewIndLabel('')
    setNewIndUnit('')
  }

  const removeIndicator = (i: number) =>
    setDraft(d => ({ ...d, indicators: d.indicators.filter((_, idx) => idx !== i) }))

  const updateIndicator = (i: number, field: keyof TemplateIndicator, value: string) =>
    setDraft(d => ({ ...d, indicators: d.indicators.map((ind, idx) => idx === i ? { ...ind, [field]: value } : ind) }))

  // ── Checklist Items ───────────────────────────────────────────────────────────
  const addChecklistItem = (phase: ChecklistTemplateItem['phase']) => {
    const val = newChecklistItems[phase]?.trim()
    if (!val) return
    setDraft(d => ({
      ...d,
      checklist_template: d.checklist_template.map(ct =>
        ct.phase === phase ? { ...ct, items: [...ct.items, val] } : ct
      ),
    }))
    setNewChecklistItems(prev => ({ ...prev, [phase]: '' }))
  }

  const removeChecklistItem = (phase: ChecklistTemplateItem['phase'], itemIdx: number) =>
    setDraft(d => ({
      ...d,
      checklist_template: d.checklist_template.map(ct =>
        ct.phase === phase ? { ...ct, items: ct.items.filter((_, i) => i !== itemIdx) } : ct
      ),
    }))

  // ── Section toggle helper ─────────────────────────────────────────────────────
  const SectionHeader: React.FC<{ id: string; label: string; count: number }> = ({ id, label, count }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between py-2 border-b border-slate-100"
    >
      <span className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
        {label}
        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg font-bold">{count}</span>
      </span>
      {collapsedSections[id]
        ? <ChevronRight className="w-4 h-4 text-slate-400" />
        : <ChevronDown className="w-4 h-4 text-slate-400" />}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-indigo-600" />
            Templates por Tipo de Obra
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">
            Personalize EAP, documentação, indicadores e checklists para cada tipo de obra da sua organização.
          </p>
        </div>
      </div>

      {/* Tipo tabs */}
      <div className="flex flex-wrap gap-2">
        {TIPOS.map(tipo => (
          <button
            key={tipo}
            onClick={() => setSelectedTipo(tipo)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              selectedTipo === tipo
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            {TIPO_OBRA_LABELS[tipo]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor panel */}
          <div className="lg:col-span-2 space-y-4">

            {/* Origin badge */}
            <div className="flex items-center gap-3">
              <span className={`text-xs font-black px-3 py-1 rounded-full ${orgTemplate ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                {orgTemplate ? 'Template personalizado da organização' : 'Usando template padrão do sistema'}
              </span>
              {orgTemplate && systemTemplate && (
                <button
                  onClick={handleResetToSystem}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Resetar para padrão
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* ── EAP Phases ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <SectionHeader id="eap" label="Fases EAP" count={draft.eap_phases.length} />
              {!collapsedSections['eap'] && (
                <>
                  <div className="space-y-2">
                    {draft.eap_phases.map((phase, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                        <input
                          className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono shrink-0 focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={phase.code}
                          onChange={e => updateEapPhase(i, 'code', e.target.value)}
                          placeholder="1.0"
                        />
                        <input
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={phase.name}
                          onChange={e => updateEapPhase(i, 'name', e.target.value)}
                        />
                        <button onClick={() => removeEapPhase(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                    <input
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono shrink-0 focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newEapCode}
                      onChange={e => setNewEapCode(e.target.value)}
                      placeholder="1.0"
                    />
                    <input
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newEapName}
                      onChange={e => setNewEapName(e.target.value)}
                      placeholder="Nome da fase"
                      onKeyDown={e => e.key === 'Enter' && addEapPhase()}
                    />
                    <button onClick={addEapPhase} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Required Docs ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <SectionHeader id="docs" label="Documentação" count={draft.required_docs.length} />
              {!collapsedSections['docs'] && (
                <>
                  <div className="space-y-2">
                    {draft.required_docs.map((doc, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={doc.name}
                          onChange={e => updateDoc(i, 'name', e.target.value)}
                        />
                        <label className="flex items-center gap-1 text-xs font-bold text-slate-500 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={doc.required}
                            onChange={e => updateDoc(i, 'required', e.target.checked)}
                            className="rounded"
                          />
                          Obrig.
                        </label>
                        <button onClick={() => removeDoc(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                    <input
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newDocName}
                      onChange={e => setNewDocName(e.target.value)}
                      placeholder="Nome do documento"
                      onKeyDown={e => e.key === 'Enter' && addDoc()}
                    />
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 shrink-0 cursor-pointer">
                      <input type="checkbox" checked={newDocRequired} onChange={e => setNewDocRequired(e.target.checked)} className="rounded" />
                      Obrig.
                    </label>
                    <button onClick={addDoc} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Indicators ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <SectionHeader id="kpis" label="Indicadores / KPIs" count={draft.indicators.length} />
              {!collapsedSections['kpis'] && (
                <>
                  <div className="space-y-2">
                    {draft.indicators.map((ind, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono shrink-0 focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={ind.key}
                          onChange={e => updateIndicator(i, 'key', e.target.value)}
                          placeholder="chave"
                        />
                        <input
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={ind.label}
                          onChange={e => updateIndicator(i, 'label', e.target.value)}
                          placeholder="Rótulo"
                        />
                        <input
                          className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                          value={ind.unit}
                          onChange={e => updateIndicator(i, 'unit', e.target.value)}
                          placeholder="unid."
                        />
                        <button onClick={() => removeIndicator(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                    <input
                      className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono shrink-0 focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newIndKey}
                      onChange={e => setNewIndKey(e.target.value)}
                      placeholder="chave"
                    />
                    <input
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newIndLabel}
                      onChange={e => setNewIndLabel(e.target.value)}
                      placeholder="Rótulo"
                    />
                    <input
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                      value={newIndUnit}
                      onChange={e => setNewIndUnit(e.target.value)}
                      placeholder="unid."
                      onKeyDown={e => e.key === 'Enter' && addIndicator()}
                    />
                    <button onClick={addIndicator} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Checklist ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <SectionHeader id="checklist" label="Checklist de Obra" count={draft.checklist_template.reduce((acc, ct) => acc + ct.items.length, 0)} />
              {!collapsedSections['checklist'] && (
                <div className="space-y-4">
                  {(['pre_start', 'in_progress', 'pre_completion'] as const).map(phase => {
                    const ct = draft.checklist_template.find(c => c.phase === phase) || { phase, items: [] }
                    return (
                      <div key={phase} className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{GATE_LABELS[phase]}</p>
                        {ct.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="flex-1 text-xs text-slate-700 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">{item}</span>
                            <button onClick={() => removeChecklistItem(phase, idx)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                            value={newChecklistItems[phase] || ''}
                            onChange={e => setNewChecklistItems(prev => ({ ...prev, [phase]: e.target.value }))}
                            placeholder="Adicionar item..."
                            onKeyDown={e => e.key === 'Enter' && addChecklistItem(phase)}
                          />
                          <button onClick={() => addChecklistItem(phase)} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar personalização
              </button>
              {saved && (
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Salvo com sucesso!
                </div>
              )}
            </div>
          </div>

          {/* Preview panel */}
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-4 sticky top-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                Preview — {TIPO_OBRA_LABELS[selectedTipo]}
              </p>

              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">Fases EAP ({draft.eap_phases.length})</p>
                {draft.eap_phases.length === 0
                  ? <p className="text-xs text-slate-400 italic">Nenhuma fase</p>
                  : draft.eap_phases.slice(0, 6).map(p => (
                    <div key={p.code} className="flex gap-2 text-xs mb-1">
                      <span className="font-mono text-slate-400 w-8 shrink-0">{p.code}</span>
                      <span className="text-slate-700">{p.name}</span>
                    </div>
                  ))}
                {draft.eap_phases.length > 6 && <p className="text-xs text-slate-400">+{draft.eap_phases.length - 6} mais...</p>}
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">Docs obrigatórios ({draft.required_docs.filter(d => d.required).length})</p>
                {draft.required_docs.filter(d => d.required).slice(0, 5).map(d => (
                  <div key={d.name} className="text-xs text-slate-700 mb-0.5">• {d.name}</div>
                ))}
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">KPIs ({draft.indicators.length})</p>
                {draft.indicators.map(ind => (
                  <div key={ind.key} className="text-xs text-slate-700 mb-0.5">{ind.label} <span className="text-slate-400">({ind.unit})</span></div>
                ))}
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">
                  Checklist ({draft.checklist_template.reduce((a, c) => a + c.items.length, 0)} itens)
                </p>
                {draft.checklist_template.map(ct => ct.items.length > 0 && (
                  <div key={ct.phase} className="mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase">{GATE_LABELS[ct.phase]}: </span>
                    <span className="text-xs text-slate-600">{ct.items.length} itens</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectTypeTemplateEditor
