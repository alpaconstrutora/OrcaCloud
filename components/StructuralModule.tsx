import React, { useState, useMemo } from 'react'
import {
  Layers, Loader2, Plus, Trash2, Pencil, Lock, X, Check,
  Construction, Scissors, Calculator, ClipboardList, Building2, ChevronRight,
} from 'lucide-react'
import { useSteelCatalog } from '../hooks/useStructuralQueries'
import { useUpsertSteel, useDeleteSteel } from '../hooks/useStructuralMutations'
import type { SteelCatalogItem, SteelType, UpsertSteelInput, StructuralAssembly, StructuralElement } from '../types/structural'
import StructuralAssemblies from './structural/StructuralAssemblies'
import StructuralElements from './structural/StructuralElements'
import StructuralRebars from './structural/StructuralRebars'
import StructuralCutTable from './structural/StructuralCutTable'
import StructuralQuantitative from './structural/StructuralQuantitative'

interface Props {
  activeOrganizationId?: string
  projectId?: string | null
  projects?: Array<{ id: string; name: string; settings?: { organizationId?: string } }>
  onChangeView?: (view: string) => void
}

type ModuleTab = 'catalogo' | 'obra' | 'corte' | 'quantitativo'

const STEEL_TYPES: SteelType[] = ['CA-50', 'CA-60', 'tela', 'trelica']

/** Peso linear teórico (kg/m) ≈ 0.006165 · bitola²  — NBR 7480. Usado só para pré-preencher. */
function theoreticalLinearWeight(bitolaMm: number): number {
  return Number((0.006165 * bitolaMm * bitolaMm).toFixed(3))
}

// ── Tab bar (mesmo estilo do OperacionalModule) ───────────────────────────────
const TabBtn: React.FC<{
  active: boolean
  icon: React.ElementType
  label: string
  disabled?: boolean
  onClick: () => void
}> = ({ active, icon: Icon, label, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
      ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
        : disabled
          ? 'text-slate-300 cursor-not-allowed'
          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
)

// ── Form de aço (criar/editar item da org) ────────────────────────────────────
interface SteelFormState {
  id?: string
  tipo: SteelType
  bitolaMm: string
  pesoLinearKgM: string
  comprimentoBarraM: string
  custoKg: string
  perdaPctPadrao: string
}

const emptyForm: SteelFormState = {
  tipo: 'CA-50', bitolaMm: '', pesoLinearKgM: '',
  comprimentoBarraM: '12', custoKg: '', perdaPctPadrao: '10',
}

const SteelForm: React.FC<{
  initial: SteelFormState
  saving: boolean
  onCancel: () => void
  onSubmit: (s: SteelFormState) => void
}> = ({ initial, saving, onCancel, onSubmit }) => {
  const [f, setF] = useState<SteelFormState>(initial)

  const set = (k: keyof SteelFormState, v: string) => setF(prev => ({ ...prev, [k]: v }))

  // Auto-preenche o peso linear teórico ao digitar a bitola (se peso ainda vazio)
  const onBitolaBlur = () => {
    const b = parseFloat(f.bitolaMm)
    if (b > 0 && !f.pesoLinearKgM) set('pesoLinearKgM', String(theoreticalLinearWeight(b)))
  }

  const valid = parseFloat(f.bitolaMm) > 0 && parseFloat(f.pesoLinearKgM) > 0

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Tipo
        <select
          value={f.tipo}
          onChange={e => set('tipo', e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium text-slate-900 bg-white"
        >
          {STEEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Bitola (mm)
        <input
          type="number" step="0.1" value={f.bitolaMm}
          onChange={e => set('bitolaMm', e.target.value)} onBlur={onBitolaBlur}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
        />
      </label>
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Peso (kg/m)
        <input
          type="number" step="0.001" value={f.pesoLinearKgM}
          onChange={e => set('pesoLinearKgM', e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
        />
      </label>
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Barra (m)
        <input
          type="number" step="0.5" value={f.comprimentoBarraM}
          onChange={e => set('comprimentoBarraM', e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
        />
      </label>
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Custo/kg (R$)
        <input
          type="number" step="0.01" value={f.custoKg}
          onChange={e => set('custoKg', e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
        />
      </label>
      <label className="text-xs font-bold text-slate-500 flex flex-col gap-1">
        Perda (%)
        <input
          type="number" step="1" value={f.perdaPctPadrao}
          onChange={e => set('perdaPctPadrao', e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSubmit(f)}
          disabled={!valid || saving}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-lg p-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Catálogo de aço ───────────────────────────────────────────────────────────
const SteelCatalog: React.FC<{ orgId: string }> = ({ orgId }) => {
  const { data: catalog = [], isLoading } = useSteelCatalog(orgId)
  const upsert = useUpsertSteel(orgId)
  const remove = useDeleteSteel(orgId)

  const [editing, setEditing] = useState<SteelFormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => [...catalog].sort((a, b) => a.bitola_mm - b.bitola_mm),
    [catalog],
  )

  const startNew = () => { setError(null); setEditing({ ...emptyForm }) }
  // Copia uma linha global para a org: prefill SEM id → cria nova linha da organização.
  const startCopy = (item: SteelCatalogItem) => {
    setError(null)
    setEditing({
      tipo: item.tipo,
      bitolaMm: String(item.bitola_mm),
      pesoLinearKgM: String(item.peso_linear_kg_m),
      comprimentoBarraM: String(item.comprimento_barra_m),
      custoKg: '',
      perdaPctPadrao: String(item.perda_pct_padrao),
    })
  }
  const startEdit = (item: SteelCatalogItem) => {
    setError(null)
    setEditing({
      id: item.id,
      tipo: item.tipo,
      bitolaMm: String(item.bitola_mm),
      pesoLinearKgM: String(item.peso_linear_kg_m),
      comprimentoBarraM: String(item.comprimento_barra_m),
      custoKg: item.custo_kg != null ? String(item.custo_kg) : '',
      perdaPctPadrao: String(item.perda_pct_padrao),
    })
  }

  const submit = (s: SteelFormState) => {
    const input: UpsertSteelInput = {
      id: s.id,
      orgId,
      tipo: s.tipo,
      bitolaMm: parseFloat(s.bitolaMm),
      pesoLinearKgM: parseFloat(s.pesoLinearKgM),
      comprimentoBarraM: s.comprimentoBarraM ? parseFloat(s.comprimentoBarraM) : 12,
      custoKg: s.custoKg ? parseFloat(s.custoKg) : null,
      perdaPctPadrao: s.perdaPctPadrao ? parseFloat(s.perdaPctPadrao) : 10,
    }
    upsert.mutate(input, {
      onSuccess: () => setEditing(null),
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  const onDelete = (item: SteelCatalogItem) => {
    if (!window.confirm(`Excluir ${item.tipo} Ø${item.bitola_mm} mm do catálogo da organização?`)) return
    remove.mutate(item.id, {
      onError: (e) => setError(e instanceof Error ? e.message : 'Erro ao excluir'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Catálogo de Aço</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Linhas <span className="font-bold">Global (NBR 7480)</span> são padrão; adicione as bitolas/custos da sua organização.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Novo aço
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm font-medium">
          {error}
        </div>
      )}

      {editing && (
        <SteelForm
          key={editing.id ?? 'new'}
          initial={editing}
          saving={upsert.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Bitola (mm)</th>
                <th className="px-4 py-3">Peso (kg/m)</th>
                <th className="px-4 py-3">Barra (m)</th>
                <th className="px-4 py-3">Custo/kg</th>
                <th className="px-4 py-3">Perda %</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(item => {
                const isGlobal = item.org_id === null
                return (
                  <tr key={item.id} className="text-slate-700">
                    <td className="px-4 py-3 font-bold">{item.tipo}</td>
                    <td className="px-4 py-3">Ø {item.bitola_mm}</td>
                    <td className="px-4 py-3">{item.peso_linear_kg_m}</td>
                    <td className="px-4 py-3">{item.comprimento_barra_m}</td>
                    <td className="px-4 py-3">
                      {item.custo_kg != null
                        ? item.custo_kg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">{item.perda_pct_padrao}%</td>
                    <td className="px-4 py-3">
                      {isGlobal ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                          <Lock className="w-3 h-3" /> Global
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
                          Organização
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isGlobal ? (
                          <button
                            onClick={() => startCopy(item)}
                            title="Copiar para a organização (definir custo)"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onDelete(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Placeholder das abas futuras ─────────────────────────────────────────────
const ComingSoon: React.FC<{ icon: React.ElementType; title: string; desc: string }> = ({ icon: Icon, title, desc }) => (
  <div className="flex flex-col items-center justify-center h-64 text-slate-300">
    <Icon className="w-12 h-12 mb-3 opacity-40" />
    <p className="font-black text-slate-500">{title}</p>
    <p className="text-xs mt-1 text-slate-400 max-w-md text-center">{desc}</p>
  </div>
)

// ── Aba Obra & Armaduras ──────────────────────────────────────────────────────
const ObraTab: React.FC<{
  orgId: string
  projectId: string | null
}> = ({ orgId, projectId }) => {
  const [assembly, setAssembly] = useState<StructuralAssembly | null>(null)
  const [element, setElement] = useState<StructuralElement | null>(null)

  if (!projectId) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-300">
        <Building2 className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm font-bold text-slate-400">Selecione uma obra acima para começar</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb de estrutura/elemento */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-bold text-slate-500">Estruturas</span>
        {assembly && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <button onClick={() => setElement(null)}
              className="font-bold text-slate-700 hover:text-blue-600">{assembly.nome}</button>
          </>
        )}
        {element && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <span className="font-bold text-slate-700">{element.nome}</span>
          </>
        )}
      </div>

      {/* Painel de 3 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_240px_1fr] gap-4">
        {/* Coluna 1: Estruturas */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <StructuralAssemblies
            orgId={orgId} projectId={projectId}
            selected={assembly}
            onSelect={a => { setAssembly(a); setElement(null) }}
          />
        </div>

        {/* Coluna 2: Elementos (só quando estrutura selecionada) */}
        <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-opacity
          ${assembly ? 'border-slate-100 opacity-100' : 'border-dashed border-slate-200 opacity-50'}`}>
          {assembly ? (
            <StructuralElements
              orgId={orgId} assembly={assembly}
              selected={element}
              onSelect={setElement}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
              <ChevronRight className="w-6 h-6 opacity-40" />
              <p className="text-xs text-slate-300 mt-2">Selecione uma estrutura</p>
            </div>
          )}
        </div>

        {/* Coluna 3: Armaduras (só quando elemento selecionado) */}
        <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-opacity
          ${element ? 'border-slate-100 opacity-100' : 'border-dashed border-slate-200 opacity-50'}`}>
          {element ? (
            <StructuralRebars orgId={orgId} element={element} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
              <ChevronRight className="w-6 h-6 opacity-40" />
              <p className="text-xs text-slate-300 mt-2">Selecione um elemento</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Container do módulo ───────────────────────────────────────────────────────
const StructuralModule: React.FC<Props> = ({ activeOrganizationId, projects = [] }) => {
  const [tab, setTab] = useState<ModuleTab>('catalogo')
  const [projectId, setProjectId] = useState<string | null>(null)

  if (!activeOrganizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Construction className="w-12 h-12 mb-3 opacity-30" />
        <p className="font-bold">Selecione uma organização</p>
        <p className="text-xs mt-1">O catálogo de aço é por organização.</p>
      </div>
    )
  }

  const obras = projects.filter(p => {
    const s = (p as { settings?: { organizationId?: string; classification?: string; isSystemProject?: boolean } }).settings
    return s?.organizationId === activeOrganizationId && s?.classification === 'OBRA' && !s?.isSystemProject
  })
  const projectName = obras.find(p => p.id === projectId)?.name ?? ''

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 text-white rounded-xl p-2.5">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Estrutural · Ferragem Armada</h1>
          <p className="text-sm text-slate-400">Quantitativo de aço, corte/dobra e otimização — quantifica, não dimensiona.</p>
        </div>
      </div>

      {/* Seletor de obra — compartilhado por todas as abas exceto Catálogo */}
      {tab !== 'catalogo' && (
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          {obras.length === 0 ? (
            <span className="text-sm text-slate-400">Nenhuma obra nesta organização — crie uma em Engenharia → Obras</span>
          ) : (
            <select
              value={projectId ?? ''}
              onChange={e => setProjectId(e.target.value || null)}
              className="flex-1 text-sm font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="">— Selecione uma obra —</option>
              {obras.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn active={tab === 'catalogo'} icon={Layers} label="Catálogo de Aço" onClick={() => setTab('catalogo')} />
        <TabBtn active={tab === 'obra'} icon={ClipboardList} label="Obra & Armaduras" onClick={() => setTab('obra')} />
        <TabBtn active={tab === 'corte'} icon={Scissors} label="Corte & Dobra" onClick={() => setTab('corte')} />
        <TabBtn active={tab === 'quantitativo'} icon={Calculator} label="Quantitativo" onClick={() => setTab('quantitativo')} />
      </div>

      {tab === 'catalogo' && <SteelCatalog orgId={activeOrganizationId} />}
      {tab === 'obra' && (
        <ObraTab orgId={activeOrganizationId} projectId={projectId} />
      )}
      {tab === 'corte' && (
        <StructuralCutTable orgId={activeOrganizationId} projectId={projectId} projectName={projectName} />
      )}
      {tab === 'quantitativo' && (
        <StructuralQuantitative orgId={activeOrganizationId} projectId={projectId} projectName={projectName} />
      )}
    </div>
  )
}

export default StructuralModule
