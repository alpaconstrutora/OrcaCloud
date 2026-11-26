import React, { useState, useEffect, useRef } from 'react'
import {
  CheckSquare, Loader2, AlertCircle, ChevronDown, ChevronRight, Wand2,
  CheckCircle2, XCircle, MinusCircle, Ban, Camera, ClipboardList, RefreshCw, History, Lock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TipoObra, ProjectTypeTemplate } from '../types/project'
import type { OeChecklistResponseHistoryRow } from '../types/operational-control'
import { projectTypeTemplatesService } from '../services/projectTypeTemplatesService'
import { workOrderService } from '../services/workOrderService'
import { qualidadeSiacService } from '../services/qualidadeSiacService'
import { errorMessage } from '../hooks/useOrgContext'
import { useToast } from '../hooks/useToast'
import { useNomeDoUsuario, usePermissaoQualidadeDaOE } from '../hooks/usePermissaoQualidadeDaOE'
import Button from './ui/Button'
import { useConfirm } from './ui/confirm'
import { Sheet, SheetDescription, SheetHeader, SheetPanel, SheetTitle } from './ui/sheet'

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
  /** Critério de aceitação (tolerância) e método de verificação — Qualidade SiAC fase 2. */
  criterio: string | null
  metodo: string | null
  /** Item desativado: some da ficha se não tem resposta; com resposta, fica (é registro). */
  ativo: boolean
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
  /** Gravados pelo banco quando a resposta muda (auth.uid / now). */
  respondido_por: string | null
  respondido_em: string | null
}

interface AvailableTemplate {
  id: string
  name: string
  service_type: string | null
  item_count?: number
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

/** Rótulo completo da resposta (o botão usa "N/A"; o histórico escreve por extenso). */
const RESPOSTA_LABELS: Record<ResponseStatus, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  parcial: 'Parcial',
  nao_aplicavel: 'Não aplicável',
}

/** O banco recusa (work_orders_ficha_travada, 42501) — o botão desliga antes, com a mesma frase. */
const MOTIVO_FICHA_TRAVADA =
  'A ficha de verificação de uma OE de serviço controlado com registro de inspeção (resposta, histórico de resposta, NC ou validação) não pode ser trocada nem retirada.'

/**
 * OE de serviço controlado: a ficha é a do serviço (Qualidade › serviço › ficha de verificação) — o banco
 * só deixa ir à inspeção com ela (`_oe_portoes`, migration 130000). Trocar aqui pularia a ficha do serviço.
 */
const MOTIVO_FICHA_DO_SERVICO =
  'A ficha de uma OE de serviço controlado vem do serviço controlado (Qualidade) — não se troca aqui; para mudar, edite a ficha do serviço na Qualidade ou o serviço da OE.'

/** OE controlada sem ficha: o caminho é criar a ficha do serviço, não escolher um modelo qualquer. */
const AVISO_SERVICO_SEM_FICHA =
  'Crie a ficha de verificação do serviço na Qualidade e salve a OE de novo: esta OE é de serviço controlado e está sem ficha (a ficha vem do serviço).'

const MOTIVO_NA_SEM_OBSERVACAO =
  'Escreva a observação: item obrigatório só conta como cumprido em "não aplicável" com o motivo.'

const fmtDataHora = (d: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

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

  // Template selector state
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplate[]>([])
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)

  // Qualidade SiAC (fase 2): OE de serviço controlado
  const [controlledItemId, setControlledItemId] = useState<string | null>(null)
  const controlada = controlledItemId !== null
  /**
   * Por que a ficha não se troca aqui (null = troca livre — OE comum). OE controlada: sempre travada
   * (a ficha vem do serviço); com registro de inspeção, a frase do gatilho do banco; sem conseguir
   * conferir o registro, o erro (fecha, não abre — e a ficha carrega mesmo assim).
   */
  const [motivoFichaTravada, setMotivoFichaTravada] = useState<string | null>(null)
  const fichaTravada = motivoFichaTravada !== null
  /** A ficha é do SGQ de outra organização que o usuário não lê (RLS): os itens não vêm. */
  const [fichaSemAcesso, setFichaSemAcesso] = useState(false)
  // "Não aplicável" em item obrigatório: observação obrigatória antes de gravar
  const [expandedNAItemId, setExpandedNAItemId] = useState<string | null>(null)
  const [naNotas, setNaNotas] = useState<Record<string, string>>({})
  // Histórico do item (Sheet)
  const [historicoDe, setHistoricoDe] = useState<{ item: ChecklistItem; resp: ChecklistResponse } | null>(null)
  const [historico, setHistorico] = useState<OeChecklistResponseHistoryRow[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  const confirm = useConfirm()
  const { showToast, localToast } = useToast()
  const permissao = usePermissaoQualidadeDaOE(controlledItemId)
  const nomeDoUsuario = useNomeDoUsuario()

  /** Motivo de as respostas estarem desligadas (null = ligadas). Régua só da OE controlada. */
  const motivoSemResposta = controlada ? permissao.motivoSemInspecao : null

  useEffect(() => { loadData() }, [workOrderId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load available active templates for this org in parallel with work order
      const [woRes, tmplsRes] = await Promise.all([
        supabase.from('work_orders').select('checklist_template_id, project_id, org_id, controlled_item_id').eq('id', workOrderId).single(),
        orgId
          ? supabase.from('oe_checklist_templates').select('id, name, service_type').eq('org_id', orgId).eq('active', true).order('name')
          : Promise.resolve({ data: [], error: null }),
      ])

      if (woRes.error) throw woRes.error
      const wo = woRes.data

      setAvailableTemplates(tmplsRes.data ?? [])
      setCurrentTemplateId(wo.checklist_template_id ?? null)
      setSelectedTemplateId(wo.checklist_template_id ?? '')
      const ehControlada = Boolean(wo.controlled_item_id)
      setControlledItemId((wo.controlled_item_id as string | null) ?? null)
      setFichaSemAcesso(false)
      if (ehControlada) {
        // A mesma régua do gatilho que recusa trocar a ficha (resposta, histórico, NC ou validação).
        // Falha ao conferir NÃO derruba a ficha: trava a troca com o motivo e segue carregando.
        let motivo = MOTIVO_FICHA_DO_SERVICO
        try {
          if (await qualidadeSiacService.oeTemRegistro(workOrderId)) motivo = MOTIVO_FICHA_TRAVADA
        } catch (e: unknown) {
          motivo = `Não foi possível conferir se a OE tem registro de inspeção: ${errorMessage(e, 'erro desconhecido')}`
        }
        setMotivoFichaTravada(motivo)
      } else {
        setMotivoFichaTravada(null)
      }

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
          .select('id, description, required, requires_photo, gate, sort_order, severity, category, criterio, metodo, ativo')
          .eq('template_id', wo.checklist_template_id)
          .order('sort_order'),
        supabase
          .from('oe_checklist_responses')
          .select('id, item_id, completed, response_status, notes, evidence_id, nc_id, completed_at, respondido_por, respondido_em')
          .eq('work_order_id', workOrderId),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (responsesRes.error) throw responsesRes.error

      setItems(itemsRes.data ?? [])
      const respMap: Record<string, ChecklistResponse> = {}
      for (const r of responsesRes.data ?? []) respMap[r.item_id] = r
      setResponses(respMap)

      // Ficha de OE controlada sem itens legíveis: é do SGQ de outra organização e a RLS os esconde
      // de quem é membro só da SPE — a tela explica, em vez de mostrar "nenhum checklist".
      if (ehControlada && (itemsRes.data ?? []).length === 0 && wo.org_id) {
        const sgq = await qualidadeSiacService.sgqDaOrganizacao(wo.org_id)
        setFichaSemAcesso(sgq !== wo.org_id && !(await qualidadeSiacService.sgqLegivel(sgq)))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar checklist')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return
    if (fichaTravada) return // botão desligado com o motivo; o banco recusaria (42501)
    const apagaRespostas = Object.keys(responses).length > 0 && selectedTemplateId !== currentTemplateId
    if (apagaRespostas) {
      const ok = await confirm({
        title: 'Trocar a ficha?',
        message: 'Trocar a ficha apaga as respostas já registradas nesta OE.',
        variant: 'danger',
        confirmLabel: 'Trocar ficha',
      })
      if (!ok) return
    }
    setApplyingTemplate(true)
    setError(null)
    try {
      if (apagaRespostas) {
        // Exclusão que falha NÃO troca a ficha: trocar com as respostas antigas ainda lá deixaria
        // a OE com respostas de itens de outra ficha.
        const { error: delErr } = await supabase.from('oe_checklist_responses').delete().eq('work_order_id', workOrderId)
        if (delErr) throw delErr
      }
      const { error: woErr } = await supabase
        .from('work_orders')
        .update({ checklist_template_id: selectedTemplateId || null })
        .eq('id', workOrderId)
      if (woErr) throw woErr
      setShowTemplateSelector(false)
      await loadData()
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao aplicar template'), 'error')
    } finally {
      setApplyingTemplate(false)
    }
  }

  const handleSeedFromTemplate = async () => {
    if (!template || !tipoObra || !orgId) return
    if (controlada) return // a ficha da OE controlada vem do serviço (botão nem aparece)
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

  /**
   * Grava a resposta. `nc_id` só vai quando há NC nova (antes ia `null` a cada troca e desfazia o
   * vínculo da NC do item); a resposta anterior vai para o histórico pelo banco. `notes` só vai
   * quando a tela a pediu (não aplicável de item obrigatório). Devolve se gravou.
   */
  const saveResponse = async (
    item: ChecklistItem,
    status: ResponseStatus,
    extras: { ncId?: string; notes?: string } = {},
  ): Promise<boolean> => {
    setSaving(item.id)
    setError(null)
    try {
      const current = responses[item.id]
      const notas = extras.notes ?? current?.notes ?? null
      // "Cumprido": não aplicável só com observação; as demais respostas contam como respondidas.
      const isComplete = status !== 'nao_aplicavel' || Boolean(notas?.trim())
      const payload: Record<string, unknown> = {
        response_status: status,
        completed: isComplete,
        completed_at: isComplete ? new Date().toISOString() : null,
      }
      if (extras.ncId) payload.nc_id = extras.ncId
      if (extras.notes !== undefined) payload.notes = extras.notes

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
      return true
    } catch (e: unknown) {
      // 42501 (sem permissão de inspecionar) / P0001: a mensagem do banco, não um texto genérico.
      showToast(errorMessage(e, 'Erro ao salvar resposta'), 'error')
      return false
    } finally {
      setSaving(null)
    }
  }

  const handleStatusSelect = (item: ChecklistItem, status: ResponseStatus) => {
    if (motivoSemResposta) return
    const current = responses[item.id]
    if (current?.response_status === status) return

    // Item obrigatório: "não aplicável" só conta com o motivo — abre a observação antes de gravar.
    if (status === 'nao_aplicavel' && item.required) {
      setExpandedNCItemId(null)
      setExpandedNAItemId(item.id)
      setNaNotas(n => ({ ...n, [item.id]: current?.notes ?? '' }))
      return
    }

    if (status === 'nao_conforme') {
      setExpandedNAItemId(null)
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

    setExpandedNAItemId(null)
    saveResponse(item, status)
  }

  const handleNASubmit = async (item: ChecklistItem) => {
    const notas = naNotas[item.id]?.trim()
    if (!notas) return
    const ok = await saveResponse(item, 'nao_aplicavel', { notes: notas })
    if (ok) {
      setExpandedNAItemId(null)
      setNaNotas(n => { const x = { ...n }; delete x[item.id]; return x })
    }
  }

  const abrirHistorico = async (item: ChecklistItem, resp: ChecklistResponse) => {
    setHistoricoDe({ item, resp })
    setHistorico([])
    setCarregandoHistorico(true)
    try {
      setHistorico(await workOrderService.listarHistoricoResposta(resp.id))
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao carregar o histórico da resposta'), 'error')
    } finally {
      setCarregandoHistorico(false)
    }
  }

  const handleNCSubmit = async (item: ChecklistItem) => {
    const ncForm = ncForms[item.id]
    if (!ncForm) return
    setSaving(item.id)
    setError(null)
    try {
      const nc = await workOrderService.createNonConformance({
        workOrderId,
        description: ncForm.description,
        severity: ncForm.severity,
        dueDate: ncForm.dueDate || undefined,
        correctiveAction: ncForm.correctiveAction || undefined,
      })

      const ok = await saveResponse(item, 'nao_conforme', { ncId: nc.id })
      if (!ok) return
      setExpandedNCItemId(null)
      setNcForms(f => { const n = { ...f }; delete n[item.id]; return n })
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao registrar NC'), 'error')
      setSaving(null)
    }
  }

  const handlePhotoUpload = async (item: ChecklistItem, file: File) => {
    setUploading(item.id)
    setError(null)
    try {
      // Mesmo upload da foto da correção da NC: bucket privado, evidence_files.file_url = PATH, na
      // pasta da org DA OE (o service lê work_orders.org_id) — não a do topo (REGRA #5).
      const evidenciaId = await workOrderService.enviarFotoEvidencia({
        workOrderId,
        file,
        prefixo: `cl_${item.id}`,
        gate: item.gate,
        description: `Checklist: ${item.description}`,
      })

      const current = responses[item.id]
      // Erro aqui (ex.: 42501 de OE controlada) não pode passar calado: a foto subiu, o vínculo não.
      const { error: respErr } = current
        ? await supabase.from('oe_checklist_responses').update({ evidence_id: evidenciaId }).eq('id', current.id)
        : await supabase.from('oe_checklist_responses').insert({
          work_order_id: workOrderId,
          item_id: item.id,
          evidence_id: evidenciaId,
          completed: false,
        })
      if (respErr) throw respErr

      await loadData()
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Erro ao enviar foto'), 'error')
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

  // ── Aviso (guia §13) — sem ToastProvider montado, o próprio componente desenha ──
  const avisoLocal = localToast && (
    <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
      localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      {localToast.message}
    </div>
  )

  // ── Ficha do SGQ de outra organização, ilegível para quem é membro só da SPE ──

  if (fichaSemAcesso) {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-[10px]">
        <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          A ficha deste serviço é do sistema da qualidade de {permissao.nomeOrgDoServico ?? 'outra organização'} — você não tem acesso para inspecionar
        </p>
      </div>
    )
  }

  // Item desativado sem resposta sai da ficha; com resposta fica (é registro da inspeção).
  const visibleItems = items.filter(i => i.ativo !== false || Boolean(responses[i.id]))

  // ── Empty state ───────────────────────────────────────────────────────────

  if (visibleItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-4">
        {avisoLocal}
        <CheckSquare className="w-10 h-10 mb-2" />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-400">Nenhum checklist vinculado</p>
          <p className="text-xs mt-1 text-slate-400">Selecione um template abaixo ou use o padrão do tipo de obra</p>
        </div>

        {controlada && (
          <p className="flex items-start gap-2 max-w-sm text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            {AVISO_SERVICO_SEM_FICHA}
          </p>
        )}

        {/* Template selector no empty state */}
        {availableTemplates.length > 0 && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <select
              aria-label="Modelo de checklist"
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="flex-1 px-3 h-9 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400"
            >
              <option value="">Selecione um template...</option>
              {availableTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {/* OE controlada: a ficha vem do serviço (com registro, o banco recusa — 42501) — desligado, dizendo por quê. */}
            <span className="inline-flex" title={motivoFichaTravada ?? undefined}>
              <Button
                onClick={handleApplyTemplate}
                disabled={!selectedTemplateId || applyingTemplate || fichaTravada}
                className="flex items-center gap-1.5 rounded-xl text-button font-black disabled:opacity-40"
              >
                {applyingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                Aplicar
              </Button>
            </span>
          </div>
        )}

        {tipoObra && template && template.checklist_template.length > 0 && orgId && !controlada && (
          <button
            onClick={handleSeedFromTemplate}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-button font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
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
  for (const item of visibleItems) {
    if (!byGate[item.gate]) byGate[item.gate] = []
    byGate[item.gate].push(item)
  }

  const totalAnswered = Object.values(responses).filter(r => r.response_status !== null).length
  const conformeCount = Object.values(responses).filter(r => r.response_status === 'conforme').length
  const ncCount       = Object.values(responses).filter(r => r.response_status === 'nao_conforme').length
  const pct = visibleItems.length > 0 ? Math.min(100, Math.round((totalAnswered / visibleItems.length) * 100)) : 0

  return (
    <div className="space-y-4">
      {avisoLocal}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Template selector inline */}
      {availableTemplates.length > 0 && (
        <div className="flex items-center gap-2">
          {showTemplateSelector ? (
            <>
              <select
                aria-label="Modelo de checklist"
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="flex-1 px-3 h-9 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400"
              >
                <option value="">Sem checklist</option>
                {availableTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <span className="inline-flex" title={motivoFichaTravada ?? undefined}>
                <Button
                  onClick={handleApplyTemplate}
                  disabled={applyingTemplate || fichaTravada}
                  className="flex items-center gap-1.5 rounded-xl text-button font-black disabled:opacity-40"
                >
                  {applyingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                  Aplicar
                </Button>
              </span>
              <button
                onClick={() => { setShowTemplateSelector(false); setSelectedTemplateId(currentTemplateId ?? '') }}
                className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-button font-bold"
              >
                Cancelar
              </button>
            </>
          ) : (
            // OE controlada: a ficha vem do serviço (com registro, o banco recusa — 42501) — desligado, dizendo por quê.
            <span className="inline-flex" title={motivoFichaTravada ?? undefined}>
              <button
                onClick={() => setShowTemplateSelector(true)}
                disabled={fichaTravada}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-button font-bold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Trocar template
              </button>
            </span>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-slate-700">{totalAnswered} / {visibleItems.length} respondidos</span>
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
                <span className={`text-form-input font-black px-2 py-0.5 rounded-lg ${GATE_COLORS[gate]}`}>
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
                  const isNAExpanded = expandedNAItemId === item.id
                  const naNota = naNotas[item.id] ?? ''

                  return (
                    <div key={item.id} data-item-ficha={item.id} className="px-4 py-3 space-y-3">
                      {/* Description + meta */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.description}</p>
                          {item.criterio && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              <span className="font-semibold">Critério:</span> {item.criterio}
                            </p>
                          )}
                          {item.metodo && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              <span className="font-semibold">Método:</span> {item.metodo}
                            </p>
                          )}
                          {item.ativo === false && (
                            <p className="text-xs text-slate-500 mt-0.5">Item desativado na ficha — mantido porque já tem resposta</p>
                          )}
                          {currentStatus === 'nao_aplicavel' && resp?.notes && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              <span className="font-semibold">Observação:</span> {resp.notes}
                            </p>
                          )}
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
                            <span key={opt.value} className="inline-flex" title={motivoSemResposta ?? undefined}>
                              <button
                                disabled={isSaving || Boolean(motivoSemResposta)}
                                onClick={() => handleStatusSelect(item, opt.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-black border transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                  ${isActive
                                    ? opt.activeCls + ' shadow-sm'
                                    : 'border-slate-200 text-slate-500 ' + opt.hoverCls}`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {opt.label}
                              </button>
                            </span>
                          )
                        })}

                        {/* Histórico do item: as respostas anteriores (reinspeções), gravadas pelo banco */}
                        {resp && (
                          <button
                            type="button"
                            onClick={() => abrirHistorico(item, resp)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <History className="w-3.5 h-3.5" />
                            Histórico
                          </button>
                        )}

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
                            {/* A foto grava evidence_id na resposta: na OE controlada, o banco exige inspecionar. */}
                            <span className="inline-flex" title={motivoSemResposta ?? undefined}>
                              <button
                                disabled={isUploadingThis || Boolean(motivoSemResposta)}
                                onClick={() => fileRefs.current[item.id]?.click()}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-form-input font-black border transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                  ${hasPhoto
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                              >
                                {isUploadingThis
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Camera className="w-3.5 h-3.5" />}
                                {hasPhoto ? 'Foto OK' : 'Foto'}
                              </button>
                            </span>
                          </>
                        )}
                      </div>

                      {/* "Não aplicável" em item obrigatório: só conta como cumprido com o motivo */}
                      {isNAExpanded && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                          <div className="space-y-1.5">
                            <label htmlFor={`na-${item.id}`} className="text-xs font-semibold text-slate-500">
                              Observação do não aplicável (obrigatória)
                            </label>
                            <textarea
                              id={`na-${item.id}`}
                              value={naNota}
                              onChange={e => setNaNotas(n => ({ ...n, [item.id]: e.target.value }))}
                              rows={2}
                              placeholder="Por que este item não se aplica a esta OE"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 resize-none"
                            />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setExpandedNAItemId(null)}
                              className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl text-button font-bold"
                            >
                              Cancelar
                            </button>
                            <span className="inline-flex" title={!naNota.trim() ? MOTIVO_NA_SEM_OBSERVACAO : undefined}>
                              <Button
                                disabled={isSaving || !naNota.trim()}
                                onClick={() => handleNASubmit(item)}
                                className="flex items-center gap-1.5"
                              >
                                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                Confirmar não aplicável
                              </Button>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* NC inline form */}
                      {isNCExpanded && ncForm && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-3">
                          <p className="text-xs font-black text-red-600 uppercase tracking-widest">
                            Registrar Não Conformidade
                          </p>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs font-semibold text-slate-500">Descrição</label>
                              <textarea
                                value={ncForm.description}
                                onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], description: e.target.value } }))}
                                rows={2}
                                className="mt-1 w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-slate-500">Severidade</label>
                                <select
                                  value={ncForm.severity}
                                  onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], severity: e.target.value as NCFormState['severity'] } }))}
                                  className="mt-1 w-full px-3 h-9 bg-white border border-red-200 rounded-[6px] text-sm focus:outline-none focus:border-red-400"
                                >
                                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500">Prazo</label>
                                <input
                                  type="date"
                                  value={ncForm.dueDate}
                                  onChange={e => setNcForms(f => ({ ...f, [item.id]: { ...f[item.id], dueDate: e.target.value } }))}
                                  className="mt-1 w-full px-3 h-9 bg-white border border-red-200 rounded-[6px] text-sm focus:outline-none focus:border-red-400"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-500">Ação corretiva</label>
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
                              className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl text-button font-bold"
                            >
                              Cancelar
                            </button>
                            <Button
                              variant="danger"
                              disabled={isSaving || !ncForm.description.trim()}
                              onClick={() => handleNCSubmit(item)}
                              className="flex items-center gap-1.5 rounded-xl text-button font-black disabled:opacity-50"
                            >
                              {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                              Confirmar NC
                            </Button>
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

      {/* Histórico do item — só leitura: cada linha é a resposta que foi substituída (ou apagada) */}
      <Sheet open={Boolean(historicoDe)} onClose={() => setHistoricoDe(null)} size="lg">
        {historicoDe && (
          <>
            <SheetHeader onClose={() => setHistoricoDe(null)}>
              <SheetTitle>Histórico da resposta</SheetTitle>
              <SheetDescription>{historicoDe.item.description}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
              <div className="rounded-[10px] border border-blue-100 bg-blue-50/60 p-3 space-y-0.5">
                <p className="text-xs font-semibold text-slate-500">Resposta atual</p>
                <p className="text-sm font-semibold text-slate-900">
                  {historicoDe.resp.response_status ? RESPOSTA_LABELS[historicoDe.resp.response_status] : 'Sem resposta'}
                </p>
                <p className="text-xs text-slate-600">
                  {nomeDoUsuario(historicoDe.resp.respondido_por)} · {fmtDataHora(historicoDe.resp.respondido_em)}
                </p>
                {historicoDe.resp.notes && <p className="text-xs text-slate-700">Observação: {historicoDe.resp.notes}</p>}
              </div>

              {carregandoHistorico ? (
                <div className="text-center py-12"><Loader2 className="w-5 h-5 text-blue-600 animate-spin inline" /></div>
              ) : historico.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma resposta anterior: este item foi respondido uma vez só.</p>
              ) : (
                <ol className="space-y-3">
                  {[...historico].reverse().map(h => {
                    const criterio = typeof h.copia?.item_criterio === 'string' ? h.copia.item_criterio : null
                    const revisao = typeof h.copia?.procedimento_revisao === 'string' ? h.copia.procedimento_revisao : null
                    return (
                      <li key={h.id} className="rounded-[10px] border border-slate-200 p-3 space-y-0.5">
                        <p className="text-sm font-semibold text-slate-900">
                          {h.response_status ? RESPOSTA_LABELS[h.response_status] : 'Sem resposta'}
                        </p>
                        <p className="text-xs text-slate-600">
                          Respondido por {nomeDoUsuario(h.respondido_por)} · {fmtDataHora(h.respondido_em)}
                        </p>
                        {h.notes && <p className="text-xs text-slate-700">Observação: {h.notes}</p>}
                        {criterio && <p className="text-xs text-slate-600">Critério na época: {criterio}</p>}
                        {revisao && <p className="text-xs text-slate-600">Procedimento: revisão {revisao}</p>}
                        <p className="text-xs text-slate-500">
                          {h.evento === 'exclusao' ? 'Resposta apagada' : 'Substituída'} por {nomeDoUsuario(h.alterado_por)} · {fmtDataHora(h.created_at)}
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
    </div>
  )
}

export default OperacionalChecklist
