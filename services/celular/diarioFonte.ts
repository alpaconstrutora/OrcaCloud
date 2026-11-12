import { createContext, useContext } from 'react'
import { supabase } from '../../lib/supabase'
import type { BudgetEntry, DiaryEntry } from '../../types'
import type { ProjectSchedule } from '../../types/project'
import {
  salvarRegistroDiario, excluirRegistroDiario, sincronizarEvolucaoNoPlanejamento, type DiaryWriteResult,
} from '../diaryEntryService'
import {
  uploadDiaryMedia, removeDiaryMedia, signDiaryMediaUrls, isDiaryStoragePath, diaryMediaExtension, DIARY_MEDIA_BUCKET,
} from '../diaryMediaService'
import { projectService } from '../projectService'
import { laborService } from '../laborService'
import { comprimirFoto } from '../../utils/comprimirFoto'
import { aplicarEvolucaoNoCronograma } from '../../utils/diaryPlanningLink'
import { carregarPlanejamentoPorProjeto } from '../../hooks/useDiaryLinkedPlanning'
import { ehRecusaDoLink } from './tarefasFonte'

/**
 * Fonte de dados do Diário de Obras no celular (`DiaryMobileApp`).
 *
 * Mesmo desenho de `tarefasFonte.ts`: a tela lê e grava por uma `DiarioFonte`,
 * e o contexto decide de onde vêm os dados:
 *  - `fonteDiarioLogado` (padrão) — os serviços de sempre, sem mudar consulta:
 *    RPCs `diary_*`, `projectService`, storage direto com a sessão logada;
 *  - `fonteDiarioDoLink(token)` — o link do celular (`/celular?token=`): só as
 *    RPCs `celular_*` e a Edge `celular-diario-midia`, que resolvem o token no
 *    banco. Nunca `supabase.from`, nunca upload/assinatura/remoção direta no
 *    storage, nunca `projectService`: um navegador logado com OUTRA pessoa abrindo
 *    o link tem de gravar como o dono do link, na organização do link.
 *
 * Erros do banco são lançados como vieram — a tela decide a frase.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface DiarioCarregado {
  id: string
  name: string
  organization_id?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: Record<string, any>
}

export interface ColaboradorRh { id: string; name: string; role: string | null; status: string }

/** Item de `celular_diarios_listar` — compatível com o `projects` do `DiaryMobileApp`. */
export interface ProjetoDoLink {
  id: string
  name: string
  code?: string
  updated_at?: string
  created_at?: string
  settings: {
    classification?: string
    linkedProjectId?: string | null
    linkedProjectName?: string | null
    organizationId?: string | null
    /** Só o resumo que a lista usa (contagem, último registro, impedimentos). */
    diaryEntries?: Pick<DiaryEntry, 'id' | 'date' | 'impediments'>[]
  }
}

export interface DiarioFonte {
  modo: 'logado' | 'link'
  /** null no logado (vale useDiaryAprovacao); no link, o que celular_sessao disse. */
  podeAprovarNoLink: boolean | null
  carregarDiario(projectId: string): Promise<DiarioCarregado>
  salvarRegistro(projectId: string, entry: DiaryEntry): Promise<DiaryWriteResult>
  excluirRegistro(projectId: string, entryId: string): Promise<DiaryWriteResult>
  /** `orgId` vale só no logado; no link a organização é a do token. */
  listarColaboradores(orgId: string | null): Promise<ColaboradorRh[]>
  carregarPlanejamento(diarioId: string, planejamentoId: string): Promise<{ schedule: ProjectSchedule | null; budget: BudgetEntry[] }>
  /** Empurra a evolução das atividades vinculadas; `null` = nada mudou (ou não há cronograma). */
  gravarEvolucao(diarioId: string, planejamentoId: string, entries: DiaryEntry[]): Promise<ProjectSchedule | null>
  /** Devolve o PATH no bucket (o que se grava no registro). */
  subirFoto(args: { orgId: string; projectId: string; file: File }): Promise<string>
  assinarFotos(paths: readonly string[]): Promise<Record<string, string>>
  /** Best-effort: falha só vira `console.warn`. */
  removerFotos(projectId: string, paths: readonly string[]): Promise<void>
}

export interface DiarioFonteDoLink extends DiarioFonte {
  listarProjetos(): Promise<ProjetoDoLink[]>
}

// ── Fonte logada (os serviços de hoje, sem mudar consultas) ───────────────────
export const fonteDiarioLogado: DiarioFonte = {
  modo: 'logado',
  podeAprovarNoLink: null,

  async carregarDiario(projectId) {
    const p = await projectService.loadProject(projectId)
    if (!p) throw new Error('Diário não encontrado.')
    return p as DiarioCarregado
  },

  salvarRegistro: salvarRegistroDiario,

  excluirRegistro: excluirRegistroDiario,

  async listarColaboradores(orgId) {
    const lista = await laborService.listEmployees(orgId)
    return lista.map(e => ({ id: e.id, name: e.name, role: e.role ?? null, status: e.status }))
  },

  async carregarPlanejamento(_diarioId, planejamentoId) {
    return (await carregarPlanejamentoPorProjeto(planejamentoId)) ?? { schedule: null, budget: [] }
  },

  gravarEvolucao: (_diarioId, planejamentoId, entries) => sincronizarEvolucaoNoPlanejamento(planejamentoId, entries),

  subirFoto: args => uploadDiaryMedia(args),

  assinarFotos: paths => signDiaryMediaUrls(paths),

  removerFotos: (_projectId, paths) => removeDiaryMedia(paths),
}

// ── Fonte do link (só RPCs celular_* e a Edge celular-diario-midia) ───────────
const EDGE_MIDIA = 'celular-diario-midia'

/** Limites da Edge (`supabase/functions/celular-diario-midia/regras.ts`): 1–100 paths de até 300 caracteres. */
const MAX_PATHS_POR_PEDIDO = 100
const MAX_TAMANHO_PATH = 300

/** Extensões que a Edge aceita no `subir` — só imagem (`EXTENSOES_PERMITIDAS` em regras.ts). */
const EXTENSOES_DO_LINK: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']

export const MENSAGEM_FORMATO_NAO_ACEITO =
  'Formato de arquivo não aceito pelo link do celular — envie uma foto (JPG, PNG, WEBP, GIF ou HEIC).'

export interface OpcoesFonteDiarioDoLink {
  /** Chamado quando o banco recusa o token com a tela aberta (link revogado ou vencido no meio do uso). */
  aoRecusar?: () => void
  /** Se o dono do link aprova registro (`celular_sessao`). */
  podeAprovar: boolean
}

function comoResultado(data: unknown): DiaryWriteResult {
  const d = (data || {}) as { entries?: DiaryEntry[] | null; anterior?: DiaryEntry | null }
  return { entries: d.entries || [], anterior: d.anterior || null }
}

/** Só path de bucket, sem repetir e dentro do teto da Edge (um path inválido derrubaria o lote inteiro). */
function pathsParaEdge(refs: readonly string[]): string[] {
  const out: string[] = []
  for (const r of refs) {
    if (isDiaryStoragePath(r) && r.length <= MAX_TAMANHO_PATH && !out.includes(r)) out.push(r)
  }
  return out
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}

/**
 * Limite de uso do link (banco: `_celular_cota`, ERRCODE 54000; Edge: 429).
 * NÃO é recusa do link: o token segue válido, é só esperar. A mensagem do erro
 * é a do banco ("limite de uso do link atingido — tente de novo em alguns minutos").
 */
export function ehLimiteDeUsoDoLink(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false
  const { status, code } = erro as { status?: unknown; code?: unknown }
  return status === 429 || code === '54000'
}

/**
 * Erro HTTP da Edge (supabase-js: `FunctionsHttpError`, com a Response em
 * `context`) → erro com a mensagem do corpo `{ error }`. 403 é o 42501 do banco
 * repassado pela Edge: ganha `code: '42501'`, e assim `ehRecusaDoLink` reconhece
 * a recusa do token pelo mesmo critério das RPCs. 429 é o 54000 (limite de uso):
 * ganha `code: '54000'` — nunca vira recusa do link.
 */
async function erroDaEdge(error: unknown): Promise<unknown> {
  const ctx = (error as { context?: unknown } | null)?.context as
    { status?: unknown; json?: () => Promise<unknown> } | undefined
  if (!ctx || typeof ctx.status !== 'number' || typeof ctx.json !== 'function') return error
  let mensagem: string | null = null
  try {
    const corpo = (await ctx.json()) as { error?: unknown } | null
    if (corpo && typeof corpo.error === 'string' && corpo.error.trim() !== '') mensagem = corpo.error
  } catch { /* corpo não é JSON: fica a mensagem genérica */ }
  const falha = new Error(mensagem ?? `Falha ao tratar a foto pelo link do celular (HTTP ${ctx.status}).`)
  const code = ctx.status === 403 ? '42501' : ctx.status === 429 ? '54000' : undefined
  return Object.assign(falha, { status: ctx.status, ...(code ? { code } : {}) })
}

export function fonteDiarioDoLink(token: string, opts: OpcoesFonteDiarioDoLink): DiarioFonteDoLink {
  /** Chama a RPC e lança o erro do banco; se for a recusa do token, avisa `aoRecusar` antes. */
  async function chamar<T>(rpc: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(rpc, { p_token: token, ...args })
    if (error) {
      if (ehRecusaDoLink(error)) opts.aoRecusar?.()
      throw error
    }
    return data as T
  }

  /** Chama a Edge de mídia; mesma regra de recusa do token. */
  async function midia<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(EDGE_MIDIA, { body: { ...body, token } })
    if (error) {
      const falha = await erroDaEdge(error)
      if (ehRecusaDoLink(falha)) opts.aoRecusar?.()
      throw falha
    }
    return data as T
  }

  async function carregarPlanejamento(diarioId: string, planejamentoId: string) {
    const r = await chamar<{ schedule?: ProjectSchedule | null; budget?: BudgetEntry[] | null } | null>(
      'celular_planejamento_ler', { p_diario_id: diarioId, p_planejamento_id: planejamentoId },
    )
    return { schedule: r?.schedule ?? null, budget: r?.budget ?? [] }
  }

  return {
    modo: 'link',
    podeAprovarNoLink: opts.podeAprovar,

    listarProjetos: async () => (await chamar<ProjetoDoLink[] | null>('celular_diarios_listar')) ?? [],

    carregarDiario: projectId => chamar<DiarioCarregado>('celular_diario_abrir', { p_project_id: projectId }),

    salvarRegistro: async (projectId, entry) =>
      comoResultado(await chamar('celular_diario_salvar', { p_project_id: projectId, p_entry: entry })),

    excluirRegistro: async (projectId, entryId) =>
      comoResultado(await chamar('celular_diario_excluir', { p_project_id: projectId, p_entry_id: entryId })),

    // `orgId` não entra: o efetivo é o da organização do token.
    listarColaboradores: async () => (await chamar<ColaboradorRh[] | null>('celular_efetivo_listar')) ?? [],

    carregarPlanejamento,

    /** Relê o cronograma na hora (não usa cópia da tela) e manda só o que mudou. */
    async gravarEvolucao(diarioId, planejamentoId, entries) {
      const { schedule } = await carregarPlanejamento(diarioId, planejamentoId)
      if (!schedule) return null
      const { schedule: novo, mudou } = aplicarEvolucaoNoCronograma(schedule, entries)
      if (!mudou) return null
      const antes = new Map((schedule.itemSchedules || []).map(is => [is.id, is.manualRealPct]))
      const evolucao: Record<string, number> = {}
      for (const is of novo.itemSchedules || []) {
        if (typeof is.manualRealPct !== 'number') continue
        if (!antes.has(is.id) || antes.get(is.id) !== is.manualRealPct) evolucao[is.id] = is.manualRealPct
      }
      if (Object.keys(evolucao).length === 0) return null
      const gravado = await chamar<ProjectSchedule | null>('celular_planejamento_gravar_evolucao', {
        p_diario_id: diarioId, p_planejamento_id: planejamentoId, p_evolucao: evolucao,
      })
      return gravado ?? null
    },

    // `orgId` não entra: o path é montado pela Edge com a organização do token.
    async subirFoto({ projectId, file }) {
      if (!projectId) throw new Error('Diário sem projeto: não há onde guardar o arquivo.')
      const enviar = await comprimirFoto(file)
      const ext = diaryMediaExtension(enviar)
      if (!EXTENSOES_DO_LINK.includes(ext)) throw new Error(MENSAGEM_FORMATO_NAO_ACEITO)
      const { path, token: tokenDeEnvio } = await midia<{ path: string; token: string }>({
        acao: 'subir', project_id: projectId, ext,
      })
      const { error } = await supabase.storage
        .from(DIARY_MEDIA_BUCKET)
        .uploadToSignedUrl(path, tokenDeEnvio, enviar, { contentType: enviar.type || undefined })
      if (error) throw error
      return path
    },

    async assinarFotos(refs) {
      const paths = pathsParaEdge(refs)
      const out: Record<string, string> = {}
      for (const lote of emLotes(paths, MAX_PATHS_POR_PEDIDO)) {
        const r = await midia<{ urls?: Record<string, string> } | null>({ acao: 'assinar', paths: lote })
        Object.assign(out, r?.urls ?? {})
      }
      return out
    },

    async removerFotos(projectId, refs) {
      const paths = pathsParaEdge(refs)
      for (const lote of emLotes(paths, MAX_PATHS_POR_PEDIDO)) {
        try {
          await midia({ acao: 'remover', project_id: projectId, paths: lote })
        } catch (err) {
          console.warn('[diaryMedia] falha ao remover objetos pelo link do celular:', (err as { message?: string })?.message ?? err)
        }
      }
    },
  }
}

// ── Contexto ──────────────────────────────────────────────────────────────────
export const DiarioFonteContext = createContext<DiarioFonte>(fonteDiarioLogado)

export function useDiarioFonte(): DiarioFonte {
  return useContext(DiarioFonteContext)
}
