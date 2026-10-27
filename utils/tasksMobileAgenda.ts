/**
 * Agenda do app mobile de tarefas (`TasksMobileApp`) — lógica pura.
 *
 * Até 2026-10-27 a lista "Todas" mostrava só tarefas sem prazo, vencidas ou com
 * prazo NO dia selecionado numa faixa fixa de 14 dias: uma tarefa com prazo
 * daqui a 15 dias, fora de pasta, não aparecia em lugar nenhum do app — e o
 * contador "Todas" a contava. Aqui a lista é agrupada em seções e o dia vira
 * filtro explícito. "Hoje" é sempre um parâmetro: o componente o recalcula na
 * virada do dia (antes era uma constante do carregamento do módulo).
 */

export const MONTH_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const WEEKDAY_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const DAY_MS = 24 * 3600 * 1000

export function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Dia (YYYY-MM-DD) de um prazo gravado — a gravação usa meio-dia local, então o dia do ISO é o dia local. */
export function dayOf(iso: string): string {
  return iso.split('T')[0]
}

function dateOfDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Dias entre hoje e o prazo: negativo = vencida, 0 = hoje. */
export function daysUntil(dueIso: string, today: Date): number {
  return Math.round((dateOfDay(dayOf(dueIso)).getTime() - startOfDay(today).getTime()) / DAY_MS)
}

export function isOverdue(dueIso: string | null, today: Date): boolean {
  return !!dueIso && daysUntil(dueIso, today) < 0
}

/** "Nova" = criada nas últimas 48 h. */
export function isNewTask(createdAt: string, now: number): boolean {
  return new Date(createdAt).getTime() > now - 48 * 3600 * 1000
}

// ── Seções ────────────────────────────────────────────────────────────────────
export type AgendaSectionKey = 'atrasadas' | 'hoje' | 'proximos' | 'depois' | 'sem_prazo'

export const SECTION_LABEL: Record<AgendaSectionKey, string> = {
  atrasadas: 'Atrasadas',
  hoje:      'Hoje',
  proximos:  'Próximos 7 dias',
  depois:    'Depois',
  sem_prazo: 'Sem prazo',
}

const SECTION_ORDER: AgendaSectionKey[] = ['atrasadas', 'hoje', 'proximos', 'depois', 'sem_prazo']

export function sectionOf(dueIso: string | null, today: Date): AgendaSectionKey {
  if (!dueIso) return 'sem_prazo'
  const n = daysUntil(dueIso, today)
  if (n < 0)  return 'atrasadas'
  if (n === 0) return 'hoje'
  if (n <= 7) return 'proximos'
  return 'depois'
}

export interface AgendaItem { due_date: string | null; priority: number }

export interface AgendaSection<T> { key: AgendaSectionKey; label: string; items: T[] }

/** Seções não vazias, na ordem da agenda; dentro de cada uma, prazo mais próximo e depois prioridade. */
export function groupBySection<T extends AgendaItem>(tasks: T[], today: Date): AgendaSection<T>[] {
  const buckets = new Map<AgendaSectionKey, T[]>()
  for (const t of tasks) {
    const k = sectionOf(t.due_date, today)
    const list = buckets.get(k) ?? []
    list.push(t)
    buckets.set(k, list)
  }
  return SECTION_ORDER
    .filter(k => buckets.has(k))
    .map(k => ({
      key: k,
      label: SECTION_LABEL[k],
      items: [...buckets.get(k)!].sort((a, b) => {
        const da = a.due_date ? dayOf(a.due_date) : ''
        const db = b.due_date ? dayOf(b.due_date) : ''
        if (da !== db) return da < db ? -1 : 1
        return a.priority - b.priority
      }),
    }))
}

/** Tarefas com prazo no dia escolhido (o filtro explícito da faixa de dias). */
export function onDay<T extends AgendaItem>(tasks: T[], day: string): T[] {
  return tasks.filter(t => !!t.due_date && dayOf(t.due_date) === day)
}

// ── Rótulos ───────────────────────────────────────────────────────────────────
export type DueTone = 'overdue' | 'today' | 'normal'

/** O prazo em palavras: vencida diz há quanto tempo, não "Até 10/09". */
export function dueLabel(dueIso: string | null, today: Date): { text: string; tone: DueTone } | null {
  if (!dueIso) return null
  const n = daysUntil(dueIso, today)
  if (n === -1) return { text: 'Venceu ontem', tone: 'overdue' }
  if (n < 0)    return { text: `Venceu há ${-n} d`, tone: 'overdue' }
  if (n === 0)  return { text: 'Vence hoje', tone: 'today' }
  if (n === 1)  return { text: 'Vence amanhã', tone: 'normal' }
  return { text: `Até ${shortDate(dueIso, today)}`, tone: 'normal' }
}

/** dd/mm, com o ano quando não é o ano corrente (tarefa antiga deixa de ser ambígua). */
export function shortDate(iso: string, today: Date): string {
  const [y, m, d] = dayOf(iso).split('-').map(Number)
  const base = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  return y === today.getFullYear() ? base : `${base}/${y}`
}

/** "terça, 27 de outubro" — rótulo acessível de um dia. */
export function longDayLabel(day: string): string {
  const d = dateOfDay(day)
  return `${WEEKDAY_PT[d.getDay()]}, ${d.getDate()} de ${MONTH_PT[d.getMonth()].toLowerCase()}`
}

/** "ter, 27/out" — rótulo curto do chip de filtro. */
export function chipDayLabel(day: string): string {
  const d = dateOfDay(day)
  return `${WEEKDAY_PT[d.getDay()].slice(0, 3)}, ${d.getDate()}/${MONTH_PT[d.getMonth()].slice(0, 3).toLowerCase()}`
}

// ── Semana ────────────────────────────────────────────────────────────────────
/** Domingo da semana do dia. */
export function weekStartOf(d: Date): Date {
  return addDays(startOfDay(d), -startOfDay(d).getDay())
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Mês da semana (pelo meio dela): "Outubro 2026". Muda para Novembro quando a semana já é de novembro. */
export function weekMonthLabel(start: Date): string {
  const mid = addDays(start, 3)
  return `${MONTH_PT[mid.getMonth()]} ${mid.getFullYear()}`
}

export function dateFromDay(day: string): Date {
  return dateOfDay(day)
}

/** Milissegundos até a próxima meia-noite — para recalcular "hoje" sem recarregar o app. */
export function msUntilNextDay(now: Date): number {
  return addDays(startOfDay(now), 1).getTime() - now.getTime()
}
