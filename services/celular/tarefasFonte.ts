import { createContext, useContext } from 'react'
import { supabase } from '../../lib/supabase'
import { taskSpaceService, TaskSpaceWithMeta } from '../taskSpaceService'
import { taskStatusService, TaskStatus } from '../taskService'

/**
 * Fonte de dados de Minhas Tarefas (celular).
 *
 * A tela do celular não fala mais direto com o Supabase: ela lê e grava por uma
 * `TarefasFonte`, e quem decide de onde vêm os dados é o contexto:
 *  - `fonteLogada` (padrão) — o que a tela sempre fez: tabelas via RLS, com a
 *    sessão da pessoa logada;
 *  - `fonteDoLink(token)` — o link do celular (`/celular?token=`): só as RPCs
 *    `celular_*`, que resolvem o token no banco (dono e organização do link).
 *    Nunca toca em `supabase.from` nem em `supabase.auth`: um navegador logado
 *    com OUTRA pessoa abrindo o link tem de ver as tarefas do dono do link.
 *
 * Erros do banco são lançados como vieram — a tela já mostra `falha(...)`.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface Task {
  id: string
  org_id: string
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  priority: number
  status: 'open' | 'done' | 'snoozed'
  status_id: string | null
  source_module: string
  space_id: string | null
  folder_id: string | null
  project_id: string | null
  assignee_employee_id: string | null
  alert_at: string | null
  parent_task_id: string | null
  created_at: string
}

export const TASK_COLS = 'id, org_id, title, description, start_date, due_date, priority, status, status_id, source_module, space_id, folder_id, project_id, assignee_employee_id, alert_at, parent_task_id, created_at'

/** Recorte da lista: uma pasta, um espaço, ou o espaço sem pasta (`semPasta` + `spaceId`). */
export interface EscopoTarefas { spaceId?: string; folderId?: string; semPasta?: boolean }

export interface NovaTarefa {
  orgId: string
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  priority: number
  space_id: string | null
  folder_id: string | null
}

export type PatchTarefa = Partial<Pick<Task,
  'title' | 'description' | 'start_date' | 'due_date' | 'priority' | 'status' | 'status_id' | 'assignee_employee_id'>>

export interface TarefasFonte {
  modo: 'logado' | 'link'
  /** `orgId` filtra só na fonte logada; no link a organização é a do token. */
  listarTarefas(orgId: string | undefined, escopo: EscopoTarefas | null, limite: number):
    Promise<{ tarefas: Task[]; nomesObras: Map<string, string> }>
  listarEspacos(orgId: string | undefined): Promise<TaskSpaceWithMeta[]>
  listarStatus(orgId: string | undefined): Promise<TaskStatus[]>
  listarResponsaveis(orgId: string): Promise<{ id: string; name: string }[]>
  criarTarefa(dados: NovaTarefa): Promise<Task>
  atualizarTarefa(id: string, patch: PatchTarefa): Promise<Task>
}

// ── Fonte logada (o código que morava em TasksMobileApp, sem mudar consultas) ─
/** Responsáveis da organização da tarefa — mesma regra do desktop (`TasksModule.loadEmployees`). */
async function listarResponsaveisLogado(orgId: string): Promise<{ id: string; name: string }[]> {
  let q = supabase.from('employees').select('id, name').eq('status', 'ATIVO').order('name')
  if (orgId) {
    const { data: shared } = await supabase.from('employee_org_shares').select('employee_id').eq('target_org_id', orgId)
    const sharedIds = (shared ?? []).map((s: { employee_id: string }) => s.employee_id)
    q = q.or(sharedIds.length > 0 ? `org_id.eq.${orgId},id.in.(${sharedIds.join(',')})` : `org_id.eq.${orgId}`)
  }
  const { data } = await q
  return (data ?? []) as { id: string; name: string }[]
}

export const fonteLogada: TarefasFonte = {
  modo: 'logado',

  async listarTarefas(orgId, escopo, limite) {
    let q = supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('status', 'open')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .limit(limite)
    if (orgId) q = q.eq('org_id', orgId)
    if (escopo?.folderId) {
      q = q.eq('folder_id', escopo.folderId)
    } else if (escopo?.spaceId) {
      q = q.eq('space_id', escopo.spaceId)
      if (escopo.semPasta) q = q.is('folder_id', null)
    }
    const { data, error } = await q
    if (error) throw error
    const tarefas = (data ?? []) as Task[]

    // Nome da obra só das tarefas na tela (antes: as 200 primeiras obras da org).
    const nomesObras = new Map<string, string>()
    const ids = [...new Set(tarefas.map(t => t.project_id).filter((id): id is string => !!id))]
    if (ids.length) {
      const { data: pd } = await supabase.from('projects').select('id, name').in('id', ids)
      for (const p of (pd ?? []) as { id: string; name: string }[]) nomesObras.set(p.id, p.name)
    }
    return { tarefas, nomesObras }
  },

  listarEspacos: orgId => taskSpaceService.listSpaces(orgId ?? ''),

  listarStatus: orgId => (orgId ? taskStatusService.list(orgId) : taskStatusService.listAll()),

  listarResponsaveis: listarResponsaveisLogado,

  async criarTarefa(dados) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sua sessão expirou. Entre de novo para criar a tarefa.')
    const { data, error } = await supabase.from('tasks').insert({
      title:         dados.title,
      description:   dados.description,
      start_date:    dados.start_date,
      due_date:      dados.due_date,
      priority:      dados.priority,
      status:        'open',
      source_module: 'manual',
      org_id:        dados.orgId,
      user_id:       user.id,
      space_id:      dados.space_id,
      folder_id:     dados.folder_id,
    }).select(TASK_COLS).single()
    if (error) throw error
    if (!data) throw new Error('A tarefa não foi criada.')
    return data as Task
  },

  async atualizarTarefa(id, patch) {
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_COLS).single()
    if (error) throw error
    if (!data) throw new Error('A tarefa não foi atualizada.')
    return data as Task
  },
}

// ── Fonte do link (só RPCs celular_*, autorizadas pelo token) ─────────────────
export function fonteDoLink(token: string): TarefasFonte {
  /** Chama a RPC e lança o erro do banco (a recusa do token vem como 42501). */
  async function chamar<T>(rpc: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(rpc, { p_token: token, ...args })
    if (error) throw error
    return data as T
  }

  return {
    modo: 'link',

    // `orgId` e `limite` não entram: a organização é a do token e o banco limita a 300.
    async listarTarefas(_orgId, escopo) {
      const r = await chamar<{ tarefas: Task[]; nomes_obras: Record<string, string> }>('celular_tarefas_listar', {
        p_space_id:  escopo?.spaceId ?? null,
        p_folder_id: escopo?.semPasta ? null : (escopo?.folderId ?? null),
        p_sem_pasta: escopo?.semPasta ?? false,
      })
      return { tarefas: r.tarefas ?? [], nomesObras: new Map(Object.entries(r.nomes_obras ?? {})) }
    },

    listarEspacos: () => chamar<TaskSpaceWithMeta[]>('celular_espacos_listar'),

    listarStatus: () => chamar<TaskStatus[]>('celular_status_listar'),

    listarResponsaveis: () => chamar<{ id: string; name: string }[]>('celular_responsaveis_listar'),

    // Sem `orgId`: a RPC recusa chave fora da lista e a organização é a do link.
    criarTarefa: dados => chamar<Task>('celular_tarefa_criar', {
      p_dados: {
        title:       dados.title,
        description: dados.description,
        start_date:  dados.start_date,
        due_date:    dados.due_date,
        priority:    dados.priority,
        space_id:    dados.space_id,
        folder_id:   dados.folder_id,
      },
    }),

    atualizarTarefa: (id, patch) => chamar<Task>('celular_tarefa_atualizar', { p_task_id: id, p_patch: patch }),
  }
}

// ── Contexto ──────────────────────────────────────────────────────────────────
export const TarefasFonteContext = createContext<TarefasFonte>(fonteLogada)

export function useTarefasFonte(): TarefasFonte {
  return useContext(TarefasFonteContext)
}
