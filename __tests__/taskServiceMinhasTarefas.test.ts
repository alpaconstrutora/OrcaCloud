/**
 * Tarefas — badge e alerta só das MINHAS tarefas (revisão de 13/11/2026).
 *
 * Com a visibilidade pelo responsável (aplicar_20271112998000), o proprietário/admin VÊ as
 * tarefas da org que têm responsável ou estão num espaço. Ver não é ser dele: o badge
 * (taskService.openCount) e o alerta do Layout (checkAlerts) contam/disparam só para o que
 * eu criei ou de que sou o responsável (colaborador meu: employees.user_id = eu, ou sem
 * vínculo com o e-mail da conta — espelho de is_employee_do_usuario_de).
 * E o badge conta tarefas de RAIZ: o filtro antigo `.not('parent_task_id','is',null)`
 * contava só as subtarefas.
 * Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
 *        (Ajustes — visibilidade pelo responsável, revisão de 13/11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> }
const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ tabela: string; ops: Array<[string, unknown[]]> }>,
  sessao: null as null | { user: { id: string; email?: string } },
  porVinculo: [] as Array<{ id: string }>,
  porEmail: [] as Array<{ id: string }>,
}))

vi.mock('../lib/supabase', () => {
  const from = (tabela: string) => {
    const c: Chamada = { tabela, ops: [] }
    estado.chamadas.push(c)
    const q: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'is', 'not', 'or', 'ilike', 'lte', 'neq', 'limit']) {
      q[op] = (...args: unknown[]) => { c.ops.push([op, args]); return q }
    }
    q.then = (ok: (v: unknown) => unknown) => {
      let r: unknown
      if (tabela === 'tasks') r = { count: 7, error: null }
      else if (c.ops.some(([op]) => op === 'ilike')) r = { data: estado.porEmail, error: null }
      else r = { data: estado.porVinculo, error: null }
      return Promise.resolve(r).then(ok)
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: estado.sessao } }) } } }
})

import {
  _esquecerIdentidadeDeTarefas, escaparIlike, filtroMinhasTarefas, minhaIdentidadeDeTarefas, taskService,
} from '../services/taskService'

beforeEach(() => {
  estado.chamadas.length = 0
  estado.sessao = { user: { id: 'u1', email: 'joao_silva@x.com' } }
  estado.porVinculo = []
  estado.porEmail = []
  _esquecerIdentidadeDeTarefas()
})

const opsDe = (tabela: string) => estado.chamadas.filter(c => c.tabela === tabela).flatMap(c => c.ops)

describe('filtro de minhas tarefas', () => {
  it('sem colaborador vinculado: só as que criei', () => {
    expect(filtroMinhasTarefas('u1', [])).toBe('user_id.eq.u1')
  })
  it('com colaboradores: criei OU sou o responsável (sem repetir id)', () => {
    expect(filtroMinhasTarefas('u1', ['e1', 'e2', 'e1'])).toBe('user_id.eq.u1,assignee_employee_id.in.(e1,e2)')
  })
  it('escapa curinga de ILIKE no e-mail', () => {
    expect(escaparIlike('joao_silva%1@x.com')).toBe('joao\\_silva\\%1@x.com')
  })
})

describe('minhaIdentidadeDeTarefas', () => {
  it('sem sessão: null, sem consultar', async () => {
    estado.sessao = null
    expect(await minhaIdentidadeDeTarefas()).toBeNull()
    expect(estado.chamadas).toHaveLength(0)
  })
  it('colaboradores por vínculo e, sem vínculo, pelo e-mail (escapado)', async () => {
    estado.porVinculo = [{ id: 'e1' }]
    estado.porEmail = [{ id: 'e2' }, { id: 'e1' }]
    expect(await minhaIdentidadeDeTarefas()).toEqual({ userId: 'u1', employeeIds: ['e1', 'e2'] })
    const ops = opsDe('employees')
    expect(ops).toContainEqual(['eq', ['user_id', 'u1']])
    expect(ops).toContainEqual(['is', ['user_id', null]])
    expect(ops).toContainEqual(['ilike', ['email', 'joao\\_silva@x.com']])
  })
})

describe('taskService.openCount — badge', () => {
  it('conta só tarefas de raiz, abertas, até hoje, e só as minhas', async () => {
    estado.porVinculo = [{ id: 'e9' }]
    expect(await taskService.openCount()).toBe(7)
    const ops = opsDe('tasks')
    expect(ops).toContainEqual(['eq', ['status', 'open']])
    expect(ops).toContainEqual(['is', ['parent_task_id', null]])
    expect(ops.some(([op, a]) => op === 'not' && a[0] === 'parent_task_id')).toBe(false)
    expect(ops).toContainEqual(['or', ['user_id.eq.u1,assignee_employee_id.in.(e9)']])
    expect(ops.some(([op, a]) => op === 'or' && String(a[0]).startsWith('due_date.is.null,due_date.lte.'))).toBe(true)
  })
  it('sem sessão: 0, sem consultar tasks', async () => {
    estado.sessao = null
    expect(await taskService.openCount()).toBe(0)
    expect(opsDe('tasks')).toHaveLength(0)
  })
})

describe('Layout.checkAlerts — alerta', () => {
  it('pede só as minhas tarefas (criei ou sou o responsável)', () => {
    const src = readFileSync(path.resolve(__dirname, '../components/Layout.tsx'), 'utf8')
    const i = src.indexOf('const checkAlerts = async')
    const corpo = src.slice(i, src.indexOf('checkAlerts();', i))
    expect(corpo).toMatch(/await minhaIdentidadeDeTarefas\(\)/)
    expect(corpo).toMatch(/if \(!eu\) return;/)
    expect(corpo).toMatch(/\.or\(filtroMinhasTarefas\(eu\.userId, eu\.employeeIds\)\)/)
  })
})
