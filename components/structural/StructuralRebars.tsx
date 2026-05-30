import React, { useState } from 'react'
import { Plus, Trash2, Pencil, X, Check, Loader2, Hammer } from 'lucide-react'
import { useRebars, useSteelCatalog } from '../../hooks/useStructuralQueries'
import { useUpsertRebar, useDeleteRebar } from '../../hooks/useStructuralMutations'
import type {
  Rebar, StructuralElement, RebarFunction,
  UpsertRebarInput, SteelCatalogItem,
} from '../../types/structural'

interface Props {
  orgId: string
  element: StructuralElement
}

const REBAR_FUNCS: { value: RebarFunction; label: string }[] = [
  { value: 'longitudinal',   label: 'Longitudinal' },
  { value: 'estribo',        label: 'Estribo' },
  { value: 'porta_estribo',  label: 'Porta-estribo' },
  { value: 'distribuicao',   label: 'Distribuição' },
  { value: 'ancoragem',      label: 'Ancoragem' },
]

const FORMATS = ['reta', 'L', 'U', 'estribo_fechado', 'estribo_aberto', 'gancho']

interface RebarFormState {
  id?: string
  bitolaId: string
  funcao: RebarFunction
  posicao: string
  quantidade: string
  espacamentoCm: string
  comprimentoUnitCm: string
  formatoDobra: string
}

const emptyRebar = (defaultBitolaId = ''): RebarFormState => ({
  bitolaId: defaultBitolaId,
  funcao: 'longitudinal',
  posicao: '', quantidade: '1',
  espacamentoCm: '', comprimentoUnitCm: '',
  formatoDobra: 'reta',
})

const RebarForm: React.FC<{
  initial: RebarFormState
  catalog: SteelCatalogItem[]
  saving: boolean
  onCancel: () => void
  onSubmit: (f: RebarFormState) => void
}> = ({ initial, catalog, saving, onCancel, onSubmit }) => {
  const [f, setF] = useState<RebarFormState>(initial)
  const set = <K extends keyof RebarFormState>(k: K, v: RebarFormState[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const isEstribo = f.funcao === 'estribo' || f.funcao === 'porta_estribo'
  const valid = f.bitolaId && parseInt(f.quantidade) > 0

  // Label bitola no select
  const bitolaLabel = (item: SteelCatalogItem) =>
    `${item.tipo} Ø${item.bitola_mm} (${item.peso_linear_kg_m} kg/m)${item.org_id ? ' ★' : ''}`

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Bitola *
          <select value={f.bitolaId} onChange={e => set('bitolaId', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white">
            <option value="">— selecione —</option>
            {catalog.map(c => <option key={c.id} value={c.id}>{bitolaLabel(c)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Função
          <select value={f.funcao} onChange={e => set('funcao', e.target.value as RebarFunction)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white">
            {REBAR_FUNCS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Formato / dobra
          <select value={f.formatoDobra} onChange={e => set('formatoDobra', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white">
            {FORMATS.map(fm => <option key={fm} value={fm}>{fm}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          Posição (nº)
          <input type="number" min="1" value={f.posicao} onChange={e => set('posicao', e.target.value)}
            placeholder="Ex.: 1"
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          {isEstribo ? 'Qtd. de estribos *' : 'Qtd. de barras *'}
          <input type="number" min="1" value={f.quantidade} onChange={e => set('quantidade', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
        </label>
        {isEstribo ? (
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Espaçamento (cm)
            <input type="number" step="1" value={f.espacamentoCm} onChange={e => set('espacamentoCm', e.target.value)}
              placeholder="Ex.: 20"
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Comprimento unit. (cm)
            <input type="number" step="1" value={f.comprimentoUnitCm} onChange={e => set('comprimentoUnitCm', e.target.value)}
              placeholder="Calculado se vazio"
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" />
          </label>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSubmit(f)} disabled={!valid || saving}
          className="flex items-center gap-2 bg-blue-600 disabled:bg-slate-300 text-white rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar armadura
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 text-slate-500 text-xs font-bold hover:text-slate-800">
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </div>
  )
}

const StructuralRebars: React.FC<Props> = ({ orgId, element }) => {
  const { data: rebars = [], isLoading } = useRebars(element.id)
  const { data: catalog = [] } = useSteelCatalog(orgId)
  const upsert = useUpsertRebar(element.id)
  const remove = useDeleteRebar(element.id)

  const [editing, setEditing] = useState<RebarFormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const defaultBitolaId = catalog.find(c => c.bitola_mm === 12.5)?.id
    ?? catalog[0]?.id ?? ''

  const startNew = () => { setError(null); setEditing(emptyRebar(defaultBitolaId)) }
  const startEdit = (r: Rebar) => {
    setError(null)
    setEditing({
      id: r.id,
      bitolaId: r.bitola_id,
      funcao: r.funcao,
      posicao: r.posicao != null ? String(r.posicao) : '',
      quantidade: String(r.quantidade),
      espacamentoCm: r.espacamento_cm != null ? String(r.espacamento_cm) : '',
      comprimentoUnitCm: r.comprimento_unit_cm != null ? String(r.comprimento_unit_cm) : '',
      formatoDobra: r.formato_dobra,
    })
  }

  const submit = (f: RebarFormState) => {
    const input: UpsertRebarInput = {
      id: f.id, orgId,
      elementId: element.id,
      bitolaId: f.bitolaId,
      funcao: f.funcao,
      posicao: f.posicao ? parseInt(f.posicao) : null,
      quantidade: parseInt(f.quantidade) || 1,
      espacamentoCm: f.espacamentoCm ? parseFloat(f.espacamentoCm) : null,
      comprimentoUnitCm: f.comprimentoUnitCm ? parseFloat(f.comprimentoUnitCm) : null,
      formatoDobra: f.formatoDobra,
      dobras: [],
    }
    upsert.mutate(input, {
      onSuccess: () => setEditing(null),
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  const onDelete = (r: Rebar) => {
    if (!window.confirm(`Excluir posição ${r.posicao ?? '—'}?`)) return
    remove.mutate(r.id, {
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao excluir'),
    })
  }

  const bitolaLabel = (bitolaId: string) => {
    const c = catalog.find(x => x.id === bitolaId)
    return c ? `${c.tipo} Ø${c.bitola_mm}` : bitolaId.slice(0, 8)
  }

  const funcLabel = (f: RebarFunction) => REBAR_FUNCS.find(x => x.value === f)?.label ?? f

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Armaduras</p>
          <p className="text-[11px] text-slate-400 font-medium">{element.nome} · {element.tipo} · ×{element.quantidade}</p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700">
          <Plus className="w-3.5 h-3.5" /> Nova chamada
        </button>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {editing && (
        <RebarForm initial={editing} catalog={catalog} saving={upsert.isPending}
          onCancel={() => setEditing(null)} onSubmit={submit} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-6 text-slate-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : rebars.length === 0 && !editing ? (
        <div className="flex flex-col items-center py-8 text-slate-300">
          <Hammer className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-medium text-slate-400">Nenhuma armadura cadastrada</p>
          <p className="text-[11px] text-slate-300">Adicione as chamadas da prancha estrutural</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 text-left">
                <th className="px-3 py-2.5">Pos.</th>
                <th className="px-3 py-2.5">Bitola</th>
                <th className="px-3 py-2.5">Função</th>
                <th className="px-3 py-2.5">Qtd</th>
                <th className="px-3 py-2.5">Espaç./Compr.</th>
                <th className="px-3 py-2.5">Formato</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rebars.map(r => (
                <tr key={r.id} className="text-slate-700 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-slate-500">{r.posicao ?? '—'}</td>
                  <td className="px-3 py-2.5 font-bold">{bitolaLabel(r.bitola_id)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{funcLabel(r.funcao)}</td>
                  <td className="px-3 py-2.5">{r.quantidade}</td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">
                    {r.espacamento_cm != null ? `@${r.espacamento_cm} cm` : ''}
                    {r.comprimento_unit_cm != null ? `${r.comprimento_unit_cm} cm` : ''}
                    {!r.espacamento_cm && !r.comprimento_unit_cm ? '—' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">{r.formato_dobra}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(r)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(r)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default StructuralRebars
