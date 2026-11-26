import React, { useState, useEffect } from 'react'
import { AlertTriangle, Plus, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { workOrderService } from '../services/workOrderService'
import type { NCEficacia, NonConformanceHistoryRow } from '../types/operational-control'
import { errorMessage } from '../hooks/useOrgContext'
import { useToast } from '../hooks/useToast'
import { useNomeDoUsuario } from '../hooks/usePermissaoQualidadeDaOE'
import Button from './ui/Button'
import { useConfirm } from './ui/confirm'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from './ui/sheet'

interface NonConformance {
  id: string
  description: string
  severity: 'minor' | 'moderate' | 'major'
  status: 'open' | 'in_treatment' | 'closed'
  due_date: string | null
  corrective_action: string | null
  causa: string | null
  eficacia: NCEficacia | null
  eficacia_em: string | null
  eficacia_por: string | null
  /** Motivo da última verificação de eficácia (gravado no "não eficaz"). */
  eficacia_motivo: string | null
  resolution_evidence_id: string | null
  created_at: string
  closed_at: string | null
  checklist_item_description?: string | null
}

interface Props {
  workOrderId: string
}

const SEVERITY_CONFIG = {
  minor: { label: 'Leve', cls: 'text-yellow-700' },
  moderate: { label: 'Moderada', cls: 'text-orange-700' },
  major: { label: 'Grave', cls: 'text-red-700' },
}

const STATUS_CONFIG = {
  open: { label: 'Aberta', cls: 'text-red-700', icon: AlertTriangle },
  in_treatment: { label: 'Em tratamento', cls: 'text-amber-700', icon: Clock },
  closed: { label: 'Encerrada', cls: 'text-green-700', icon: CheckCircle2 },
}

const EFICACIA_LABELS: Record<NCEficacia, string> = {
  pendente: 'pendente',
  eficaz: 'eficaz',
  nao_eficaz: 'não eficaz',
}

const MOTIVO_SEM_CAUSA = 'Informe a causa para encerrar a não conformidade.'
const MOTIVO_SEM_ACAO = 'Informe a ação corretiva para encerrar a não conformidade.'
const MOTIVO_NAO_EFICAZ_SEM_MOTIVO = 'Informe o motivo para registrar a correção como não eficaz.'

const fmtDataHora = (d: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const CAMPO_TEXTO = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-red-400 resize-none'
const CAMPO_LINHA = 'w-full px-3 h-9 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-900 focus:outline-none focus:border-red-400'
const ROTULO = 'text-xs font-semibold text-slate-500'

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
    causa: '',
    correctiveAction: '',
  })

  // Encerrar (Sheet): causa e ação corretiva obrigatórias, foto da correção opcional.
  const [encerrarDe, setEncerrarDe] = useState<NonConformance | null>(null)
  const [encerrarForm, setEncerrarForm] = useState({ causa: '', acao: '' })
  const [foto, setFoto] = useState<File | null>(null)
  /** Foto já enviada nesta tentativa: se o encerramento falhar, tentar de novo não sobe outra. */
  const [fotoEnviada, setFotoEnviada] = useState<{ file: File; id: string } | null>(null)
  const [encerrando, setEncerrando] = useState(false)

  // Verificar eficácia (Sheet)
  const [eficaciaDe, setEficaciaDe] = useState<NonConformance | null>(null)
  const [motivoNaoEficaz, setMotivoNaoEficaz] = useState('')
  const [registrandoEficacia, setRegistrandoEficacia] = useState(false)

  // Histórico (Sheet)
  const [historicoDe, setHistoricoDe] = useState<NonConformance | null>(null)
  const [historico, setHistorico] = useState<NonConformanceHistoryRow[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  const confirm = useConfirm()
  const { showToast, localToast } = useToast()
  const nomeDoUsuario = useNomeDoUsuario()

  useEffect(() => {
    loadNCs()
  }, [workOrderId])

  /** `silencioso`: recarrega depois de uma ação sem trocar a lista pelo "carregando". */
  const loadNCs = async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('non_conformances')
        .select(`
          *,
          oe_checklist_responses!nc_id(
            oe_checklist_items(description)
          )
        `)
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false })
      if (fetchErr) throw fetchErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data ?? []).map((nc: any) => ({
        ...nc,
        checklist_item_description:
          nc.oe_checklist_responses?.[0]?.oe_checklist_items?.description ?? null,
      }))
      setNcs(mapped)
    } catch (e: unknown) {
      setError(errorMessage(e, 'Erro ao carregar NCs'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await workOrderService.createNonConformance({
        workOrderId,
        description: form.description,
        severity: form.severity,
        dueDate: form.dueDate || undefined,
        causa: form.causa || undefined,
        correctiveAction: form.correctiveAction || undefined,
      })
      setForm({ description: '', severity: 'minor', dueDate: '', causa: '', correctiveAction: '' })
      setShowForm(false)
      await loadNCs(true)
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao registrar NC'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const iniciarTratamento = async (id: string) => {
    try {
      const { error: updErr } = await supabase.from('non_conformances').update({ status: 'in_treatment' }).eq('id', id)
      if (updErr) throw updErr
      await loadNCs(true)
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao atualizar NC'), 'error')
    }
  }

  // ── Encerrar ────────────────────────────────────────────────────────────────

  const abrirEncerrar = (nc: NonConformance) => {
    setEncerrarDe(nc)
    setEncerrarForm({ causa: nc.causa ?? '', acao: nc.corrective_action ?? '' })
    setFoto(null)
    setFotoEnviada(null)
  }

  const motivoSemEncerrar = !encerrarForm.causa.trim()
    ? MOTIVO_SEM_CAUSA
    : !encerrarForm.acao.trim()
      ? MOTIVO_SEM_ACAO
      : null

  const encerrarSujo = Boolean(encerrarDe) && (
    encerrarForm.causa !== (encerrarDe?.causa ?? '') ||
    encerrarForm.acao !== (encerrarDe?.corrective_action ?? '') ||
    foto !== null
  )

  /** X e "Cancelar": com texto/foto, pergunta antes de descartar (Esc e clique fora: `dirty` do Sheet). */
  const confirmarDescarte = () => confirm({
    title: 'Sair sem salvar?',
    message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
    variant: 'warning',
    confirmLabel: 'Sair e descartar',
    cancelLabel: 'Continuar editando',
  })

  const fecharEncerrar = async () => {
    if (encerrarSujo && !encerrando && !(await confirmarDescarte())) return
    setEncerrarDe(null)
  }

  const handleEncerrar = async () => {
    const nc = encerrarDe
    if (!nc || motivoSemEncerrar || encerrando) return
    setEncerrando(true)
    try {
      let evidenciaId: string | undefined
      if (foto) {
        if (fotoEnviada?.file === foto) {
          evidenciaId = fotoEnviada.id
        } else {
          // A pasta é a da org DA OE (o service lê work_orders.org_id) — não a do topo (REGRA #5).
          evidenciaId = await workOrderService.enviarFotoEvidencia({
            workOrderId,
            file: foto,
            prefixo: `nc_${nc.id}`,
            gate: 'free',
            description: `Correção da NC: ${nc.description}`,
          })
          setFotoEnviada({ file: foto, id: evidenciaId })
        }
      }
      await workOrderService.encerrarNC(nc.id, {
        causa: encerrarForm.causa,
        acaoCorretiva: encerrarForm.acao,
        ...(evidenciaId ? { evidenciaId } : {}),
      })
      setEncerrarDe(null)
      showToast('Não conformidade encerrada — a eficácia fica pendente de verificação.')
      await loadNCs(true)
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao encerrar a NC'), 'error')
    } finally {
      setEncerrando(false)
    }
  }

  // ── Eficácia ────────────────────────────────────────────────────────────────

  const abrirEficacia = (nc: NonConformance) => {
    setEficaciaDe(nc)
    setMotivoNaoEficaz('')
  }

  const eficaciaSujo = Boolean(eficaciaDe) && motivoNaoEficaz.trim() !== ''

  const fecharEficacia = async () => {
    if (eficaciaSujo && !registrandoEficacia && !(await confirmarDescarte())) return
    setEficaciaDe(null)
  }

  const handleEficacia = async (eficaz: boolean) => {
    const nc = eficaciaDe
    if (!nc || registrandoEficacia) return
    const motivo = motivoNaoEficaz.trim()
    if (!eficaz && !motivo) return
    // O motivo é do "não eficaz": registrar eficaz com motivo digitado descarta o texto — pergunta antes.
    if (eficaz && motivo) {
      const ok = await confirm({
        title: 'Registrar como eficaz?',
        message: 'O motivo digitado é para o "não eficaz" e não será gravado.',
        variant: 'warning',
        confirmLabel: 'Registrar eficaz',
        cancelLabel: 'Voltar',
      })
      if (!ok) return
    }
    setRegistrandoEficacia(true)
    try {
      if (eficaz) await workOrderService.registrarEficacia(nc.id, true)
      else await workOrderService.registrarEficacia(nc.id, false, motivo)
      setEficaciaDe(null)
      showToast(eficaz ? 'Correção verificada como eficaz.' : 'Não eficaz: a não conformidade foi reaberta.')
      await loadNCs(true)
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao registrar a eficácia'), 'error')
    } finally {
      setRegistrandoEficacia(false)
    }
  }

  // ── Histórico ───────────────────────────────────────────────────────────────

  const abrirHistorico = async (nc: NonConformance) => {
    setHistoricoDe(nc)
    setHistorico([])
    setCarregandoHistorico(true)
    try {
      setHistorico(await workOrderService.listarHistoricoNC(nc.id))
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao carregar o histórico da NC'), 'error')
    } finally {
      setCarregandoHistorico(false)
    }
  }

  const avisoLocal = localToast && (
    <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
      localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      {localToast.message}
    </div>
  )

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

      <Button
        variant="danger"
        onClick={() => setShowForm(s => !s)}
        className="flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        {showForm ? 'Cancelar' : 'Registrar NC'}
      </Button>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-[10px] p-4 border border-slate-100">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="nc-nova-descricao" className={ROTULO}>Descrição</label>
              <textarea
                id="nc-nova-descricao"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
                rows={2}
                placeholder="Descreva a não conformidade..."
                className={CAMPO_TEXTO}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nc-nova-severidade" className={ROTULO}>Severidade</label>
              <select
                id="nc-nova-severidade"
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof form.severity }))}
                className={CAMPO_LINHA}
              >
                <option value="minor">Leve</option>
                <option value="moderate">Moderada</option>
                <option value="major">Grave</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nc-nova-prazo" className={ROTULO}>Prazo</label>
              <input
                id="nc-nova-prazo"
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className={CAMPO_LINHA}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="nc-nova-causa" className={ROTULO}>Causa (opcional)</label>
              <textarea
                id="nc-nova-causa"
                value={form.causa}
                onChange={e => setForm(f => ({ ...f, causa: e.target.value }))}
                rows={2}
                placeholder="Se já conhecida — para encerrar, a causa é obrigatória"
                className={CAMPO_TEXTO}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="nc-nova-acao" className={ROTULO}>Ação corretiva</label>
              <textarea
                id="nc-nova-acao"
                value={form.correctiveAction}
                onChange={e => setForm(f => ({ ...f, correctiveAction: e.target.value }))}
                rows={2}
                placeholder="Descreva a ação corretiva planejada..."
                className={CAMPO_TEXTO}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <span className="inline-flex" title={saving ? 'Registrando…' : undefined}>
              <Button
                variant="danger"
                type="submit"
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Registrar
              </Button>
            </span>
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
            const podeVerificarEficacia = nc.status === 'closed' && nc.eficacia !== 'eficaz'

            return (
              <div key={nc.id} data-nc className="bg-white rounded-[10px] border border-slate-100 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : nc.id)}
                  className="w-full flex items-start justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3 text-left">
                    <StsIcon className={`w-4 h-4 mt-0.5 shrink-0 ${nc.status === 'open' ? 'text-red-500' : nc.status === 'in_treatment' ? 'text-amber-500' : 'text-green-500'}`} />
                    <div>
                      <p className="text-sm font-bold text-slate-800 whitespace-pre-line">{nc.description}</p>
                      <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
                        <span className={`text-sm font-normal ${sevCfg.cls}`}>{sevCfg.label}</span>
                        <span className={`text-sm font-normal ${stsCfg.cls}`}>{stsCfg.label}</span>
                        {nc.status === 'closed' && (
                          <span className={`text-sm font-normal ${nc.eficacia === 'eficaz' ? 'text-green-700' : 'text-amber-700'}`}>
                            Eficácia {nc.eficacia === 'eficaz' ? 'verificada' : 'pendente'}
                          </span>
                        )}
                        {nc.due_date && (
                          <span className="text-xs text-slate-500">
                            Prazo: {new Date(nc.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {nc.checklist_item_description && (
                          <span className="text-xs font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                            Checklist: {nc.checklist_item_description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 space-y-3 border-t border-slate-50">
                    {nc.causa && (
                      <div className="space-y-0.5">
                        <p className={ROTULO}>Causa</p>
                        <p className="text-sm text-slate-800 whitespace-pre-line">{nc.causa}</p>
                      </div>
                    )}
                    {nc.corrective_action && (
                      <div className="space-y-0.5">
                        <p className={ROTULO}>Ação corretiva</p>
                        <p className="text-sm text-slate-800 whitespace-pre-line">{nc.corrective_action}</p>
                      </div>
                    )}
                    {nc.resolution_evidence_id && (
                      <p className="text-xs text-slate-600">Foto da correção anexada (aba Evidências).</p>
                    )}
                    {nc.status === 'closed' && nc.eficacia === 'eficaz' && (
                      <p className="text-xs text-slate-600">
                        Eficácia verificada: eficaz · {nomeDoUsuario(nc.eficacia_por)} · {fmtDataHora(nc.eficacia_em)}
                      </p>
                    )}
                    {nc.status !== 'closed' && nc.eficacia === 'nao_eficaz' && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-red-700">
                          Reaberta: a correção anterior foi verificada como não eficaz
                          ({nomeDoUsuario(nc.eficacia_por)} · {fmtDataHora(nc.eficacia_em)}).
                        </p>
                        {nc.eficacia_motivo && (
                          <p className="text-sm text-slate-800 whitespace-pre-line">Motivo: {nc.eficacia_motivo}</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {nc.status === 'open' && (
                        <Button size="sm" variant="secondary" onClick={() => iniciarTratamento(nc.id)}>
                          Iniciar tratamento
                        </Button>
                      )}
                      {nc.status !== 'closed' && (
                        <Button size="sm" variant="secondary" onClick={() => abrirEncerrar(nc)}>
                          Encerrar NC
                        </Button>
                      )}
                      {podeVerificarEficacia && (
                        <Button size="sm" variant="secondary" onClick={() => abrirEficacia(nc)}>
                          Verificar eficácia
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => abrirHistorico(nc)}>
                        Histórico
                      </Button>
                    </div>
                    {nc.closed_at && (
                      <p className="text-xs text-slate-500">
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

      {/* Encerrar NC */}
      <Sheet open={Boolean(encerrarDe)} onClose={() => setEncerrarDe(null)} size="lg" dirty={encerrarSujo && !encerrando}>
        {encerrarDe && (
          <>
            <SheetHeader onClose={fecharEncerrar}>
              <SheetTitle>Encerrar não conformidade</SheetTitle>
              <SheetDescription>{encerrarDe.description}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">
                Causa e ação corretiva são obrigatórias. Depois de encerrada, a eficácia da correção fica pendente de verificação.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="nc-encerrar-causa" className={ROTULO}>Causa</label>
                <textarea
                  id="nc-encerrar-causa"
                  value={encerrarForm.causa}
                  onChange={e => setEncerrarForm(f => ({ ...f, causa: e.target.value }))}
                  rows={3}
                  placeholder="Por que a não conformidade aconteceu?"
                  className={CAMPO_TEXTO}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nc-encerrar-acao" className={ROTULO}>Ação corretiva</label>
                <textarea
                  id="nc-encerrar-acao"
                  value={encerrarForm.acao}
                  onChange={e => setEncerrarForm(f => ({ ...f, acao: e.target.value }))}
                  rows={3}
                  placeholder="O que foi feito para corrigir?"
                  className={CAMPO_TEXTO}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nc-encerrar-foto" className={ROTULO}>Foto da correção (opcional)</label>
                <input
                  id="nc-encerrar-foto"
                  type="file"
                  accept="image/*"
                  onChange={e => setFoto(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-900 file:mr-3 file:h-9 file:px-3 file:rounded-[6px] file:border-0 file:bg-slate-100 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                {encerrarDe.resolution_evidence_id && !foto && (
                  <p className="text-xs text-slate-600">Já há foto de um encerramento anterior; sem foto nova, ela continua.</p>
                )}
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button variant="secondary" onClick={fecharEncerrar}>Cancelar</Button>
              <span className="inline-flex" title={motivoSemEncerrar ?? (encerrando ? 'Encerrando…' : undefined)}>
                <Button onClick={handleEncerrar} disabled={Boolean(motivoSemEncerrar) || encerrando} className="flex items-center gap-2">
                  {encerrando && <Loader2 className="w-3 h-3 animate-spin" />}
                  Encerrar
                </Button>
              </span>
            </SheetFooter>
          </>
        )}
      </Sheet>

      {/* Verificar eficácia */}
      <Sheet open={Boolean(eficaciaDe)} onClose={() => setEficaciaDe(null)} size="lg" dirty={eficaciaSujo && !registrandoEficacia}>
        {eficaciaDe && (
          <>
            <SheetHeader onClose={fecharEficacia}>
              <SheetTitle>Verificar eficácia</SheetTitle>
              <SheetDescription>{eficaciaDe.description}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
              <div className="rounded-[10px] border border-slate-200 p-3 space-y-2">
                <div className="space-y-0.5">
                  <p className={ROTULO}>Causa</p>
                  <p className="text-sm text-slate-800 whitespace-pre-line">{eficaciaDe.causa || '—'}</p>
                </div>
                <div className="space-y-0.5">
                  <p className={ROTULO}>Ação corretiva</p>
                  <p className="text-sm text-slate-800 whitespace-pre-line">{eficaciaDe.corrective_action || '—'}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                A correção resolveu a não conformidade? Não eficaz reabre a NC; o motivo fica na NC e no histórico.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="nc-eficacia-motivo" className={ROTULO}>Motivo (obrigatório se não eficaz)</label>
                <textarea
                  id="nc-eficacia-motivo"
                  value={motivoNaoEficaz}
                  onChange={e => setMotivoNaoEficaz(e.target.value)}
                  rows={3}
                  placeholder="O que mostra que a correção não resolveu?"
                  className={CAMPO_TEXTO}
                />
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button variant="secondary" onClick={fecharEficacia}>Cancelar</Button>
              <span
                className="inline-flex"
                title={!motivoNaoEficaz.trim() ? MOTIVO_NAO_EFICAZ_SEM_MOTIVO : (registrandoEficacia ? 'Registrando…' : undefined)}
              >
                <Button
                  variant="danger"
                  onClick={() => handleEficacia(false)}
                  disabled={!motivoNaoEficaz.trim() || registrandoEficacia}
                >
                  Não eficaz
                </Button>
              </span>
              <span className="inline-flex" title={registrandoEficacia ? 'Registrando…' : undefined}>
                <Button onClick={() => handleEficacia(true)} disabled={registrandoEficacia}>
                  Eficaz
                </Button>
              </span>
            </SheetFooter>
          </>
        )}
      </Sheet>

      {/* Histórico */}
      <Sheet open={Boolean(historicoDe)} onClose={() => setHistoricoDe(null)} size="lg">
        {historicoDe && (
          <>
            <SheetHeader onClose={() => setHistoricoDe(null)}>
              <SheetTitle>Histórico da não conformidade</SheetTitle>
              <SheetDescription>{historicoDe.description}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
              {carregandoHistorico ? (
                <div className="text-center py-12"><Loader2 className="w-5 h-5 text-blue-600 animate-spin inline" /></div>
              ) : historico.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma mudança registrada desde a abertura.</p>
              ) : (
                <ol className="space-y-3">
                  {[...historico].reverse().map((h, i, lista) => {
                    // Descrição só aparece quando muda em relação à linha anterior (mais antiga).
                    const anterior = lista[i + 1]
                    const descricaoMudou = Boolean(h.description) && (anterior ? anterior.description !== h.description : false)
                    const status = h.status && h.status in STATUS_CONFIG
                      ? STATUS_CONFIG[h.status as keyof typeof STATUS_CONFIG].label
                      : (h.status ?? '—')
                    return (
                      <li key={h.id} className="rounded-[10px] border border-slate-200 p-3 space-y-0.5">
                        <p className="text-sm font-semibold text-slate-900">
                          {h.evento === 'exclusao' ? 'Não conformidade apagada' : status}
                        </p>
                        {h.causa && <p className="text-xs text-slate-700">Causa: {h.causa}</p>}
                        {h.corrective_action && <p className="text-xs text-slate-700">Ação corretiva: {h.corrective_action}</p>}
                        {h.eficacia && <p className="text-xs text-slate-700">Eficácia: {EFICACIA_LABELS[h.eficacia] ?? h.eficacia}</p>}
                        {h.eficacia_motivo && <p className="text-xs text-slate-700">Motivo: {h.eficacia_motivo}</p>}
                        {descricaoMudou && <p className="text-xs text-slate-700">Descrição: {h.description}</p>}
                        <p className="text-xs text-slate-500">
                          {nomeDoUsuario(h.alterado_por)} · {fmtDataHora(h.created_at)}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              )}
            </SheetPanel>
          </>
        )}
      </Sheet>

      {avisoLocal}
    </div>
  )
}

export default OperacionalNC
