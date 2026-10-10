// Status de tarefa são POR ORGANIZAÇÃO: cada org tem o próprio Pendente/Em Andamento/
// Concluído (ids diferentes). Em "Todas as organizações" a tela recebe os conjuntos de
// todas juntos — então tudo que a tela MOSTRA (filtro, grupos, colunas) junta por NOME,
// e tudo que ela GRAVA resolve o status com aquele nome na organização DA TAREFA.
// Antes disso o filtro repetia cada nome uma vez por org, e o Kanban/concluir gravavam
// um status_id de outra organização.

import type { TaskStatus } from '../services/taskService'

export const STATUS_NONE = '__none__'

export const statusNameKey = (name: string) => name.trim().toLowerCase()

/** Um status por nome, na ordem de `position` — o primeiro de cada nome representa o grupo. */
export function uniqueStatusesByName(statuses: TaskStatus[]): TaskStatus[] {
  const byName = new Map<string, TaskStatus>()
  for (const s of [...statuses].sort((a, b) => a.position - b.position)) {
    if (!byName.has(statusNameKey(s.name))) byName.set(statusNameKey(s.name), s)
  }
  return [...byName.values()]
}

/** Chave de grupo/coluna de uma tarefa: o nome do status dela (junta as organizações). */
export function statusGroupKeyOf(statusId: string | null | undefined, statusMap: Record<string, TaskStatus>): string {
  const s = statusId ? statusMap[statusId] : undefined
  return s ? statusNameKey(s.name) : STATUS_NONE
}

/** Representante (nome/cor/posição) de uma chave de grupo. */
export function statusOfGroupKey(key: string, statuses: TaskStatus[]): TaskStatus | undefined {
  return uniqueStatusesByName(statuses).find(s => statusNameKey(s.name) === key)
}

export function statusesOfOrg(statuses: TaskStatus[], orgId: string | null | undefined): TaskStatus[] {
  return statuses.filter(s => s.org_id === orgId)
}

/** O status com aquele nome NA organização informada — nunca o de outra org. */
export function statusByNameInOrg(statuses: TaskStatus[], orgId: string | null | undefined, nameKey: string): TaskStatus | undefined {
  return statusesOfOrg(statuses, orgId).find(s => statusNameKey(s.name) === nameKey)
}

/** Status de "aberta" da org (o padrão, senão o primeiro não concluído, senão o primeiro). */
export function openStatusOfOrg(statuses: TaskStatus[], orgId: string | null | undefined): TaskStatus | undefined {
  const own = statusesOfOrg(statuses, orgId)
  return own.find(s => s.is_default) ?? own.find(s => !s.is_done) ?? own[0]
}

export function doneStatusOfOrg(statuses: TaskStatus[], orgId: string | null | undefined): TaskStatus | undefined {
  return statusesOfOrg(statuses, orgId).find(s => s.is_done)
}
