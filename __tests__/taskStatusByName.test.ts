import { describe, it, expect } from 'vitest'
import type { TaskStatus } from '../services/taskService'
import {
  STATUS_NONE, uniqueStatusesByName, statusGroupKeyOf, statusOfGroupKey,
  statusByNameInOrg, openStatusOfOrg, doneStatusOfOrg,
} from '../utils/taskStatusByName'

// O cenário real de 10/10/2026: 4 organizações, cada uma com o próprio conjunto.
const st = (org: string, name: string, position: number, extra: Partial<TaskStatus> = {}): TaskStatus => ({
  id: `${org}-${name}`, org_id: org, name, color: '#000', position, is_default: false, is_done: false, ...extra,
})
const conjunto = (org: string) => [
  st(org, 'Pendente', 0, { is_default: true }),
  st(org, 'Em Andamento', 1),
  st(org, 'Concluído', 2, { is_done: true }),
]
const todas = [...conjunto('A'), ...conjunto('B'), ...conjunto('C'), ...conjunto('D')]
const statusMap = Object.fromEntries(todas.map(s => [s.id, s]))

describe('taskStatusByName', () => {
  it('em "Todas", o filtro lista cada nome uma vez, na ordem de position', () => {
    expect(uniqueStatusesByName(todas).map(s => s.name)).toEqual(['Pendente', 'Em Andamento', 'Concluído'])
  })

  it('junta por nome ignorando caixa e espaços', () => {
    const variados = [st('A', 'Pendente', 0), st('B', ' pendente ', 0)]
    expect(uniqueStatusesByName(variados)).toHaveLength(1)
  })

  it('tarefas de orgs diferentes com o mesmo status caem no MESMO grupo', () => {
    expect(statusGroupKeyOf('A-Pendente', statusMap)).toBe(statusGroupKeyOf('D-Pendente', statusMap))
    expect(statusGroupKeyOf(null, statusMap)).toBe(STATUS_NONE)
    expect(statusGroupKeyOf('id-que-sumiu', statusMap)).toBe(STATUS_NONE)
  })

  it('o representante do grupo dá nome e posição', () => {
    const key = statusGroupKeyOf('C-Em Andamento', statusMap)
    expect(statusOfGroupKey(key, todas)?.name).toBe('Em Andamento')
    expect(statusOfGroupKey(key, todas)?.position).toBe(1)
  })

  it('mover para a coluna grava o status da org DA TAREFA, nunca o de outra', () => {
    const key = statusGroupKeyOf('A-Concluído', statusMap)
    expect(statusByNameInOrg(todas, 'C', key)?.id).toBe('C-Concluído')
    expect(statusByNameInOrg(todas, 'C', key)?.org_id).toBe('C')
  })

  it('org sem aquele nome não recebe status de outra org', () => {
    const comExtra = [...todas, st('A', 'Bloqueado', 3)]
    expect(statusByNameInOrg(comExtra, 'B', 'bloqueado')).toBeUndefined()
  })

  it('concluir/reabrir usa os status da org da tarefa', () => {
    expect(doneStatusOfOrg(todas, 'D')?.id).toBe('D-Concluído')
    expect(openStatusOfOrg(todas, 'D')?.id).toBe('D-Pendente')
    expect(doneStatusOfOrg(todas, 'Z')).toBeUndefined()
  })
})
