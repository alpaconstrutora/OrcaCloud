import React, { useState } from 'react'
import { Plus, Trash2, Pencil, X, Check, Loader2, Layers } from 'lucide-react'
import { useElements } from '../../hooks/useStructuralQueries'
import { useUpsertElement, useDeleteElement } from '../../hooks/useStructuralMutations'
import type {
  StructuralAssembly, StructuralElement, ElementType,
  UpsertElementInput, ElementGeometry,
} from '../../types/structural'
import { ELEMENT_TYPES, DEFAULT_COVER_CM } from '../../types/structural'

interface Props {
  orgId: string
  assembly: StructuralAssembly
  selected: StructuralElement | null
  onSelect: (el: StructuralElement | null) => void
}

// Campos de geometria necessários por tipo de elemento
const GEO_FIELDS: Record<ElementType, { key: keyof ElementGeometry; label: string }[]> = {
  viga:     [{ key: 'b', label: 'Largura b (cm)' }, { key: 'h', label: 'Altura h (cm)' }, { key: 'comprimento', label: 'Comprimento (cm)' }],
  pilar:    [{ key: 'b', label: 'Lado b (cm)' },    { key: 'h', label: 'Lado h (cm)' },   { key: 'comprimento', label: 'Altura (cm)' }],
  sapata:   [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Comprimento (cm)' }, { key: 'comprimento', label: 'Espessura (cm)' }],
  bloco:    [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Comprimento (cm)' }, { key: 'comprimento', label: 'Espessura (cm)' }],
  radier:   [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Comprimento (cm)' }, { key: 'comprimento', label: 'Espessura (cm)' }],
  laje:     [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Comprimento (cm)' }, { key: 'comprimento', label: 'Espessura (cm)' }],
  escada:   [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Altura total (cm)' }, { key: 'comprimento', label: 'Comprimento (cm)' }],
  muro:     [{ key: 'b', label: 'Espessura (cm)' }, { key: 'h', label: 'Altura (cm)' },     { key: 'comprimento', label: 'Comprimento (cm)' }],
  baldrame: [{ key: 'b', label: 'Largura (cm)' },   { key: 'h', label: 'Altura (cm)' },     { key: 'comprimento', label: 'Comprimento (cm)' }],
}

interface ElemFormState {
  id?: string
  tipo: ElementType
  nome: string
  quantidade: string
  cobrimentoCm: string
  geo: Partial<Record<keyof ElementGeometry, string>>
}

const emptyForm = (tipo: ElementType = 'viga'): ElemFormState => ({
  tipo, nome: '', quantidade: '1',
  cobrimentoCm: String(DEFAULT_COVER_CM[tipo]),
  geo: {},
})

const ElementForm: React.FC<{
  initial: ElemFormState
  saving: boolean
  onCancel: () => void
  onSubmit: (f: ElemFormState) => void
}> = ({ initial, saving, onCancel, onSubmit }) => {
  const [f, setF] = useState<ElemFormState>(initial)
  const set = <K extends keyof ElemFormState>(k: K, v: ElemFormState[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const onTipoChange = (tipo: ElementType) =>
    setF(prev => ({ ...prev, tipo, cobrimentoCm: String(DEFAULT_COVER_CM[tipo]) }))

  const valid = f.nome.trim().length > 0

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Tipo
          <select value={f.tipo} onChange={e => onTipoChange(e.target.value as ElementType)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white">
            {ELEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Nome / código *
          <input autoFocus value={f.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Ex.: V1, P3, S-01"
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Qtd. de peças iguais
          <input type="number" min="1" value={f.quantidade} onChange={e => set('quantidade', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Cobrimento (cm)
          <input type="number" step="0.5" value={f.cobrimentoCm} onChange={e => set('cobrimentoCm', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
        </label>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Geometria</p>
        <div className="grid grid-cols-3 gap-3">
          {GEO_FIELDS[f.tipo].map(field => (
            <label key={field.key} className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              {field.label}
              <input
                type="number" step="0.1"
                value={f.geo[field.key] ?? ''}
                onChange={e => setF(prev => ({ ...prev, geo: { ...prev.geo, [field.key]: e.target.value } }))}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSubmit(f)} disabled={!valid || saving}
          className="flex items-center gap-2 bg-blue-600 disabled:bg-slate-300 text-white rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar elemento
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 text-slate-500 text-xs font-bold hover:text-slate-800">
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </div>
  )
}

const StructuralElements: React.FC<Props> = ({ orgId, assembly, selected, onSelect }) => {
  const { data: elements = [], isLoading } = useElements(assembly.id)
  const upsert = useUpsertElement(assembly.id)
  const remove = useDeleteElement(assembly.id)

  const [editing, setEditing] = useState<ElemFormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startNew = () => { setError(null); setEditing(emptyForm()) }
  const startEdit = (el: StructuralElement) => {
    setError(null)
    setEditing({
      id: el.id,
      tipo: el.tipo,
      nome: el.nome,
      quantidade: String(el.quantidade),
      cobrimentoCm: String(el.cobrimento_cm),
      geo: Object.fromEntries(
        Object.entries(el.geometria).map(([k, v]) => [k, v != null ? String(v) : ''])
      ) as Record<string, string>,
    })
  }

  const submit = (f: ElemFormState) => {
    const geo: ElementGeometry = {}
    Object.entries(f.geo).forEach(([k, v]) => {
      if (v && v !== '') geo[k] = parseFloat(v)
    })
    const input: UpsertElementInput = {
      id: f.id,
      orgId, assemblyId: assembly.id,
      tipo: f.tipo, nome: f.nome.trim(),
      quantidade: parseInt(f.quantidade) || 1,
      cobrimentoCm: parseFloat(f.cobrimentoCm) || DEFAULT_COVER_CM[f.tipo],
      geometria: geo,
    }
    upsert.mutate(input, {
      onSuccess: (saved) => { setEditing(null); onSelect(saved) },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  const onDelete = (el: StructuralElement) => {
    if (!window.confirm(`Excluir "${el.nome}" e todas as suas armaduras?`)) return
    if (selected?.id === el.id) onSelect(null)
    remove.mutate(el.id, {
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao excluir'),
    })
  }

  const typeLabel = (t: ElementType) => ELEMENT_TYPES.find(x => x.value === t)?.label ?? t

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Elementos</p>
          <p className="text-[11px] text-slate-400 font-medium">{assembly.nome}</p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700">
          <Plus className="w-3.5 h-3.5" /> Novo
        </button>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {editing && (
        <ElementForm initial={editing} saving={upsert.isPending}
          onCancel={() => setEditing(null)} onSubmit={submit} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-6 text-slate-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : elements.length === 0 && !editing ? (
        <div className="flex flex-col items-center py-8 text-slate-300">
          <Layers className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-medium text-slate-400">Nenhum elemento</p>
          <p className="text-[11px] text-slate-300">Adicione vigas, pilares, sapatas…</p>
        </div>
      ) : (
        <div className="space-y-1">
          {elements.map(el => (
            <button key={el.id} onClick={() => onSelect(el)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl group transition-all
                ${selected?.id === el.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0
                ${selected?.id === el.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {typeLabel(el.tipo)}
              </span>
              <span className="flex-1 text-sm font-bold truncate">{el.nome}</span>
              {el.quantidade > 1 && (
                <span className={`text-[10px] font-bold ${selected?.id === el.id ? 'text-white/60' : 'text-slate-400'}`}>
                  ×{el.quantidade}
                </span>
              )}
              <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity
                ${selected?.id === el.id ? 'text-white/70' : 'text-slate-400'}`}>
                <button onClick={e => { e.stopPropagation(); startEdit(el) }}
                  className="p-1 rounded hover:bg-black/10"><Pencil className="w-3 h-3" /></button>
                <button onClick={e => { e.stopPropagation(); onDelete(el) }}
                  className="p-1 rounded hover:bg-black/10"><Trash2 className="w-3 h-3" /></button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default StructuralElements
