import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Edit2, Check, X, GripVertical, ClipboardList, Copy, Download, Upload, FileSpreadsheet,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

interface Template {
  id: string
  name: string
  service_type: string | null
  active: boolean
  created_at: string
  item_count?: number
}

interface TemplateItem {
  id: string
  template_id: string
  description: string
  required: boolean
  requires_photo: boolean
  gate: 'pre_start' | 'pre_completion' | 'free'
  sort_order: number
  severity: 'minor' | 'moderate' | 'major'
  category: string | null
}

interface Props {
  orgId: string
}

const GATE_OPTIONS = [
  { value: 'pre_start',      label: 'Pré-início' },
  { value: 'pre_completion', label: 'Pré-conclusão' },
  { value: 'free',           label: 'Livre' },
] as const

const GATE_COLORS: Record<string, string> = {
  pre_start:      'bg-amber-100 text-amber-700',
  pre_completion: 'bg-purple-100 text-purple-700',
  free:           'bg-slate-100 text-slate-600',
}

const SEVERITY_OPTIONS = [
  { value: 'minor',    label: 'Leve' },
  { value: 'moderate', label: 'Moderada' },
  { value: 'major',    label: 'Grave' },
] as const

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400 transition-colors'

// ── Inline editable item row ──────────────────────────────────────────────────
const ItemRow: React.FC<{
  item: TemplateItem
  onSave: (id: string, patch: Partial<TemplateItem>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}> = ({ item, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(item.id, {
      description:    draft.description,
      required:       draft.required,
      requires_photo: draft.requires_photo,
      gate:           draft.gate,
      severity:       draft.severity,
      category:       draft.category || null,
    })
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group rounded-xl transition-colors">
        <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs font-black px-1.5 py-0.5 rounded ${GATE_COLORS[item.gate]}`}>
              {GATE_OPTIONS.find(g => g.value === item.gate)?.label}
            </span>
            {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
            {item.required && <span className="text-xs font-bold text-red-500">Obrigatório</span>}
            {item.requires_photo && <span className="text-xs font-bold text-purple-500">Foto</span>}
            <span className="text-xs text-slate-400">
              {SEVERITY_OPTIONS.find(s => s.value === item.severity)?.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => { setDraft(item); setEditing(true) }}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2 mx-1 my-1">
      <input
        type="text"
        value={draft.description}
        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
        autoFocus
        className={inputCls}
        placeholder="Descrição do item"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.gate}
          onChange={e => setDraft(d => ({ ...d, gate: e.target.value as TemplateItem['gate'] }))}
          className={inputCls}
        >
          {GATE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select
          value={draft.severity}
          onChange={e => setDraft(d => ({ ...d, severity: e.target.value as TemplateItem['severity'] }))}
          className={inputCls}
        >
          {SEVERITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input
          type="text"
          value={draft.category ?? ''}
          onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          placeholder="Categoria (ex: Estrutura)"
          className={inputCls}
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={e => setDraft(d => ({ ...d, required: e.target.checked }))}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs font-bold text-slate-600">Obrigatório</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.requires_photo}
              onChange={e => setDraft(d => ({ ...d, requires_photo: e.target.checked }))}
              className="w-4 h-4 rounded accent-purple-600"
            />
            <span className="text-xs font-bold text-slate-600">Foto</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setEditing(false)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          disabled={saving || !draft.description.trim()}
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-button font-black hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────
const TemplateCard: React.FC<{
  template: Template
  onToggleActive: (id: string, active: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRename: (id: string, name: string, serviceType: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onExport: (id: string) => Promise<void>
}> = ({ template, onToggleActive, onDelete, onRename, onDuplicate, onExport }) => {
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({
    description: '', gate: 'free' as TemplateItem['gate'],
    required: false, requires_photo: false,
    severity: 'moderate' as TemplateItem['severity'], category: '',
  })
  const [savingNew, setSavingNew] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(template.name)
  const [draftServiceType, setDraftServiceType] = useState(template.service_type ?? '')
  const [itemError, setItemError] = useState<string | null>(null)

  const loadItems = async () => {
    setLoadingItems(true)
    const { data } = await supabase
      .from('oe_checklist_items')
      .select('id, template_id, description, required, requires_photo, gate, sort_order, severity, category')
      .eq('template_id', template.id)
      .order('sort_order')
    setItems(data ?? [])
    setLoadingItems(false)
  }

  const handleExpand = () => {
    setExpanded(e => !e)
    if (!expanded && items.length === 0) loadItems()
  }

  const handleSaveItem = async (id: string, patch: Partial<TemplateItem>) => {
    const { error } = await supabase.from('oe_checklist_items').update(patch).eq('id', id)
    if (error) return
    await loadItems()
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Remover este item do template?')) return
    await supabase.from('oe_checklist_items').delete().eq('id', id)
    await loadItems()
  }

  const handleAddItem = async () => {
    if (!newItem.description.trim()) return
    setSavingNew(true)
    setItemError(null)
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0
      const { error } = await supabase.from('oe_checklist_items').insert({
        template_id: template.id,
        description: newItem.description.trim(),
        gate: newItem.gate,
        required: newItem.required,
        requires_photo: newItem.requires_photo,
        severity: newItem.severity,
        category: newItem.category || null,
        sort_order: maxOrder,
      })
      if (error) throw error
      setNewItem({ description: '', gate: 'free', required: false, requires_photo: false, severity: 'moderate', category: '' })
      setShowAddItem(false)
      await loadItems()
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : 'Erro ao adicionar item')
    } finally {
      setSavingNew(false)
    }
  }

  const handleSaveName = async () => {
    await onRename(template.id, draftName, draftServiceType)
    setEditingName(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Template header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={handleExpand} className="flex-1 flex items-center gap-3 text-left min-w-0">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          {editingName ? (
            <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                autoFocus
                className="flex-1 px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none"
              />
              <input
                type="text"
                value={draftServiceType}
                onChange={e => setDraftServiceType(e.target.value)}
                placeholder="Tipo de serviço"
                className="w-32 px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none"
              />
              <button onClick={handleSaveName} className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingName(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 truncate">{template.name}</p>
              {template.service_type && (
                <p className="text-xs text-slate-400">{template.service_type}</p>
              )}
            </div>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {template.item_count !== undefined && (
            <span className="text-xs text-slate-400">{template.item_count} itens</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); setEditingName(true); setDraftName(template.name); setDraftServiceType(template.service_type ?? '') }}
            title="Renomear"
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDuplicate(template.id) }}
            title="Duplicar"
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onExport(template.id) }}
            title="Exportar JSON"
            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <label className="relative inline-flex items-center cursor-pointer" title={template.active ? 'Ativo' : 'Inativo'}>
            <input
              type="checkbox"
              checked={template.active}
              onChange={() => onToggleActive(template.id, !template.active)}
              className="sr-only"
            />
            <div className={`w-8 h-4 rounded-full transition-colors ${template.active ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <div className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mt-0.5 ${template.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </label>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items list */}
      {expanded && (
        <div className="border-t border-slate-50">
          {loadingItems ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onSave={handleSaveItem}
                  onDelete={handleDeleteItem}
                />
              ))}
              {items.length === 0 && !showAddItem && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum item. Adicione o primeiro abaixo.</p>
              )}
            </div>
          )}

          {/* Add item form */}
          {showAddItem ? (
            <div className="bg-slate-50 border-t border-slate-100 p-3 space-y-2">
              {itemError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {itemError}
                </p>
              )}
              <input
                type="text"
                value={newItem.description}
                onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))}
                autoFocus
                placeholder="Descrição do item de checklist"
                className={inputCls}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newItem.gate}
                  onChange={e => setNewItem(n => ({ ...n, gate: e.target.value as TemplateItem['gate'] }))}
                  className={inputCls}
                >
                  {GATE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <select
                  value={newItem.severity}
                  onChange={e => setNewItem(n => ({ ...n, severity: e.target.value as TemplateItem['severity'] }))}
                  className={inputCls}
                >
                  {SEVERITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={e => setNewItem(n => ({ ...n, category: e.target.value }))}
                  placeholder="Categoria (opcional)"
                  className={inputCls}
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newItem.required}
                      onChange={e => setNewItem(n => ({ ...n, required: e.target.checked }))}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-600">Obrigatório</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newItem.requires_photo}
                      onChange={e => setNewItem(n => ({ ...n, requires_photo: e.target.checked }))}
                      className="w-4 h-4 rounded accent-purple-600"
                    />
                    <span className="text-xs font-bold text-slate-600">Foto</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setShowAddItem(false)}
                  className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl text-button font-bold"
                >
                  Cancelar
                </button>
                <button
                  disabled={savingNew || !newItem.description.trim()}
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-xl text-button font-black hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingNew ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Adicionar
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 pb-3 pt-1">
              <button
                onClick={() => setShowAddItem(true)}
                className="flex items-center gap-2 px-3 py-2 w-full border-2 border-dashed border-slate-200 rounded-xl text-button font-bold text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const OperacionalTemplateManager: React.FC<Props> = ({ orgId }) => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newServiceType, setNewServiceType] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const importXlsxRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadTemplates() }, [orgId])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('oe_checklist_templates')
        .select(`
          id, name, service_type, active, created_at,
          oe_checklist_items(count)
        `)
        .eq('org_id', orgId)
        .order('name')
      if (fetchErr) throw fetchErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data ?? []).map((t: any) => ({
        ...t,
        item_count: t.oe_checklist_items?.[0]?.count ?? 0,
      }))
      setTemplates(mapped)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newName.trim()) return
    setSavingNew(true)
    setError(null)
    try {
      const { error: insErr } = await supabase.from('oe_checklist_templates').insert({
        org_id: orgId,
        name: newName.trim(),
        service_type: newServiceType.trim() || null,
        active: true,
      })
      if (insErr) throw insErr
      setNewName('')
      setNewServiceType('')
      setShowNewForm(false)
      await loadTemplates()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar template')
    } finally {
      setSavingNew(false)
    }
  }

  const handleToggleActive = async (id: string, active: boolean) => {
    await supabase.from('oe_checklist_templates').update({ active }).eq('id', id)
    await loadTemplates()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este template? Os itens serão removidos. OEs que o usam não serão afetadas.')) return
    await supabase.from('oe_checklist_templates').delete().eq('id', id)
    await loadTemplates()
  }

  const handleRename = async (id: string, name: string, serviceType: string) => {
    await supabase.from('oe_checklist_templates').update({
      name: name.trim(),
      service_type: serviceType.trim() || null,
    }).eq('id', id)
    await loadTemplates()
  }

  const handleDuplicate = async (id: string) => {
    const tmpl = templates.find(t => t.id === id)
    if (!tmpl) return
    const { data: items } = await supabase
      .from('oe_checklist_items')
      .select('description, required, requires_photo, gate, sort_order, severity, category')
      .eq('template_id', id)
      .order('sort_order')
    const { data: newTmpl, error: insErr } = await supabase
      .from('oe_checklist_templates')
      .insert({ org_id: orgId, name: `${tmpl.name} (cópia)`, service_type: tmpl.service_type, active: false })
      .select()
      .single()
    if (insErr || !newTmpl) { setError('Erro ao duplicar template'); return }
    if (items && items.length > 0) {
      await supabase.from('oe_checklist_items').insert(
        items.map(item => ({ ...item, template_id: newTmpl.id }))
      )
    }
    await loadTemplates()
  }

  const handleExport = async (id: string) => {
    const tmpl = templates.find(t => t.id === id)
    if (!tmpl) return
    const { data: items } = await supabase
      .from('oe_checklist_items')
      .select('description, required, requires_photo, gate, sort_order, severity, category')
      .eq('template_id', id)
      .order('sort_order')
    const payload = { name: tmpl.name, service_type: tmpl.service_type, items: items ?? [] }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checklist-${tmpl.name.toLowerCase().replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    setError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const list: { name?: string; service_type?: string | null; items?: Partial<TemplateItem>[] }[] =
        Array.isArray(parsed) ? parsed : [parsed]
      for (const tmpl of list) {
        if (!tmpl.name) continue
        const { data: newTmpl, error: insErr } = await supabase
          .from('oe_checklist_templates')
          .insert({ org_id: orgId, name: tmpl.name, service_type: tmpl.service_type ?? null, active: false })
          .select()
          .single()
        if (insErr || !newTmpl) continue
        if (tmpl.items && tmpl.items.length > 0) {
          await supabase.from('oe_checklist_items').insert(
            tmpl.items.map((item, idx) => ({
              template_id: newTmpl.id,
              description: item.description ?? '',
              gate: item.gate ?? 'free',
              required: item.required ?? false,
              requires_photo: item.requires_photo ?? false,
              severity: item.severity ?? 'moderate',
              category: item.category ?? null,
              sort_order: item.sort_order ?? idx,
            }))
          )
        }
      }
      await loadTemplates()
    } catch {
      setError('Arquivo inválido. Use o formato JSON exportado pelo sistema.')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  // ── Importar a partir de Excel (.xlsx / .xls) ────────────────────────────
  // Formato: colunas Grupo | Subgrupo | Item  (células mescladas OK — carry-forward)
  // Grupo   → nome do template (um template por grupo único)
  // Subgrupo → categoria do item; gate inferido do nome:
  //            contém "antes"/"before"/"início"  → pre_start
  //            contém "após"/"depois"/"after"     → pre_completion
  //            demais                             → free
  // Item    → descrição do item de checklist
  // Colunas extras opcionais: obrigatorio | foto | severidade
  const handleImportExcel = async (file: File) => {
    setImporting(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      // cellDates:false evita conversão automática; raw:false converte tudo para string
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false })

      // Remove acentos, lowercase, espaços → underscore
      const norm = (s: unknown) =>
        String(s ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '_')

      // Infere gate a partir do nome do subgrupo
      const gateFromSubgrupo = (sub: string): TemplateItem['gate'] => {
        const n = norm(sub)
        if (n.includes('antes') || n.includes('inicio') || n.includes('before') || n.includes('start')) return 'pre_start'
        if (n.includes('apos') || n.includes('depois') || n.includes('after') || n.includes('conclus') || n.includes('completion')) return 'pre_completion'
        return 'free'
      }
      const parseSeverity = (v: string): TemplateItem['severity'] => {
        const s = norm(v)
        if (s.includes('grave') || s.includes('major')) return 'major'
        if (s.includes('leve') || s.includes('minor')) return 'minor'
        return 'moderate'
      }
      const parseBool = (v: string) => ['sim','yes','true','1','x','✓'].includes(norm(v))

      // Mapa: grupoName → lista de itens já enriquecidos
      type ParsedItem = {
        description: string
        category: string | null
        gate: TemplateItem['gate']
        required: boolean
        requires_photo: boolean
        severity: TemplateItem['severity']
      }
      const templateMap = new Map<string, ParsedItem[]>()

      for (const sheetName of wb.SheetNames) {
        // sheet_to_json com header:1 devolve arrays (preserva ordem e células mescladas vazias)
        const rawRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
        if (rawRows.length < 2) continue

        // Descobre índices das colunas pelo cabeçalho da linha 0
        const header = rawRows[0].map(h => norm(h))
        const col = (aliases: string[]) => aliases.findIndex(a => header.includes(a)) < 0
          ? header.findIndex(h => aliases.some(a => h.includes(a)))
          : aliases.findIndex(a => header.findIndex(h => h.includes(a)) >= 0) >= 0
            ? header.findIndex(h => aliases.some(a => h.includes(a)))
            : -1

        const iGrupo    = col(['grupo', 'group', 'template'])
        const iSubgrupo = col(['subgrupo', 'subgroup', 'categoria', 'category', 'secao', 'section'])
        const iItem     = col(['item', 'descricao', 'description', 'titulo'])
        const iObrg     = col(['obrigatorio', 'required', 'obrig'])
        const iFoto     = col(['foto', 'photo', 'requires_photo'])
        const iSev      = col(['severidade', 'severity'])

        if (iItem < 0) continue // planilha sem coluna de item — pula

        let lastGrupo    = sheetName  // fallback: nome da aba
        let lastSubgrupo = ''

        for (let r = 1; r < rawRows.length; r++) {
          const row = rawRows[r]
          const rawItem = String(row[iItem] ?? '').trim()
          if (!rawItem) continue // linha em branco

          // Carry-forward para células mescladas
          if (iGrupo >= 0 && String(row[iGrupo] ?? '').trim()) lastGrupo = String(row[iGrupo]).trim()
          if (iSubgrupo >= 0 && String(row[iSubgrupo] ?? '').trim()) lastSubgrupo = String(row[iSubgrupo]).trim()

          if (!templateMap.has(lastGrupo)) templateMap.set(lastGrupo, [])
          templateMap.get(lastGrupo)!.push({
            description:    rawItem,
            category:       lastSubgrupo || null,
            gate:           gateFromSubgrupo(lastSubgrupo),
            required:       iObrg >= 0 ? parseBool(String(row[iObrg] ?? '')) : true,
            requires_photo: iFoto >= 0 ? parseBool(String(row[iFoto] ?? '')) : false,
            severity:       iSev >= 0  ? parseSeverity(String(row[iSev] ?? '')) : 'moderate',
          })
        }
      }

      if (templateMap.size === 0) {
        setError('Nenhum dado encontrado. Verifique se a planilha tem as colunas Grupo | Subgrupo | Item.')
        return
      }

      for (const [name, items] of templateMap) {
        const { data: newTmpl, error: insErr } = await supabase
          .from('oe_checklist_templates')
          .insert({ org_id: orgId, name, service_type: null, active: false })
          .select()
          .single()
        if (insErr || !newTmpl) continue

        await supabase.from('oe_checklist_items').insert(
          items.map((item, idx) => ({
            template_id:    newTmpl.id,
            description:    item.description,
            gate:           item.gate,
            required:       item.required,
            requires_photo: item.requires_photo,
            severity:       item.severity,
            category:       item.category,
            sort_order:     idx,
          }))
        )
      }

      await loadTemplates()
    } catch (e) {
      setError(`Erro ao ler planilha: ${e instanceof Error ? e.message : 'arquivo inválido'}`)
    } finally {
      setImporting(false)
      if (importXlsxRef.current) importXlsxRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900">Templates de Checklist</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Biblioteca reutilizável. Vincule um template ao criar uma OE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }}
          />
          <input
            ref={importXlsxRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportExcel(f) }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-button font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar
          </button>
          <button
            onClick={() => importXlsxRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-button font-black uppercase tracking-widest hover:bg-emerald-50 transition-colors"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Importar Excel
          </button>
          <button
            onClick={() => setShowNewForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
          >
            <Plus className="w-4 h-4" />
            Novo template
          </button>
        </div>
      </div>

      {/* New template form */}
      {showNewForm && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Novo Template</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-form-label font-bold text-slate-500">Nome *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                placeholder="Ex: Checklist de Fundação"
                className={`mt-1 ${inputCls}`}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateTemplate() }}
              />
            </div>
            <div>
              <label className="text-form-input font-bold text-slate-500">Tipo de serviço</label>
              <input
                type="text"
                value={newServiceType}
                onChange={e => setNewServiceType(e.target.value)}
                placeholder="Ex: Fundação, Elétrica..."
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setShowNewForm(false); setNewName(''); setNewServiceType('') }}
              className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-button font-bold"
            >
              Cancelar
            </button>
            <button
              disabled={savingNew || !newName.trim()}
              onClick={handleCreateTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-button font-black hover:bg-blue-700 disabled:opacity-50"
            >
              {savingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-300">
          <ClipboardList className="w-12 h-12 mb-3" />
          <p className="text-sm font-bold text-slate-400">Nenhum template criado</p>
          <p className="text-xs text-slate-400 mt-1">Crie templates para vincular às OEs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              onRename={handleRename}
              onDuplicate={handleDuplicate}
              onExport={handleExport}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default OperacionalTemplateManager
