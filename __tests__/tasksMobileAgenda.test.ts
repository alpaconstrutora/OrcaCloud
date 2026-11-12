import { describe, it, expect } from 'vitest'
import {
  groupBySection, sectionOf, dueLabel, shortDate, onDay, weekStartOf, weekDays,
  weekMonthLabel, longDayLabel, chipDayLabel, isNewTask, msUntilNextDay, isOverdue,
  ordenarTarefas, groupByPriority, lerOrdemTarefas, salvarOrdemTarefas, ORDEM_LABEL,
} from '../utils/tasksMobileAgenda'

// Prazo gravado como o app grava: meio-dia local.
const due = (day: string) => new Date(day + 'T12:00:00').toISOString()
const TODAY = new Date(2026, 9, 27, 9, 30)   // terça, 27/10/2026

describe('agenda mobile — seções', () => {
  it('tarefa com prazo daqui a 15 dias aparece em "Depois" (antes sumia da Entrada)', () => {
    const t = { id: 'a', due_date: due('2026-11-11'), priority: 3 }
    const s = groupBySection([t], TODAY)
    expect(s.map(x => x.key)).toEqual(['depois'])
    expect(s[0].items).toEqual([t])
  })

  it('separa atrasadas, hoje, próximos 7 dias, depois e sem prazo — nessa ordem', () => {
    const tasks = [
      { id: 'sem', due_date: null, priority: 3 },
      { id: 'dep', due_date: due('2026-11-04'), priority: 3 },
      { id: 'prox', due_date: due('2026-11-03'), priority: 3 },
      { id: 'hoje', due_date: due('2026-10-27'), priority: 3 },
      { id: 'atr', due_date: due('2026-09-10'), priority: 3 },
    ]
    const s = groupBySection(tasks, TODAY)
    expect(s.map(x => x.key)).toEqual(['atrasadas', 'hoje', 'proximos', 'depois', 'sem_prazo'])
    expect(s.map(x => x.label)).toEqual(['Atrasadas', 'Hoje', 'Próximos 7 dias', 'Depois', 'Sem prazo'])
  })

  it('dentro da seção: prazo mais próximo primeiro, depois a prioridade', () => {
    const tasks = [
      { id: 'b', due_date: due('2026-07-03'), priority: 3 },
      { id: 'a', due_date: due('2026-07-03'), priority: 1 },
      { id: 'c', due_date: due('2026-09-10'), priority: 1 },
    ]
    expect(groupBySection(tasks, TODAY)[0].items.map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('omite seção vazia', () => {
    expect(groupBySection([{ id: 'x', due_date: null, priority: 3 }], TODAY).map(s => s.key)).toEqual(['sem_prazo'])
    expect(groupBySection([], TODAY)).toEqual([])
  })

  it('"hoje" é parâmetro: a mesma tarefa muda de seção na virada do dia', () => {
    const d = due('2026-10-27')
    expect(sectionOf(d, TODAY)).toBe('hoje')
    expect(sectionOf(d, new Date(2026, 9, 28, 0, 1))).toBe('atrasadas')
    expect(isOverdue(d, TODAY)).toBe(false)
    expect(isOverdue(d, new Date(2026, 9, 28, 0, 1))).toBe(true)
  })

  it('filtro por dia traz só as que vencem naquele dia', () => {
    const tasks = [
      { id: 'a', due_date: due('2026-12-15'), priority: 3 },
      { id: 'b', due_date: due('2026-12-16'), priority: 3 },
      { id: 'c', due_date: null, priority: 3 },
    ]
    expect(onDay(tasks, '2026-12-15').map(t => t.id)).toEqual(['a'])
  })
})

// Para "Classificar" e a aba "Prioridade".
const MIX = [
  { id: 'a', title: 'Bloco',     due_date: due('2026-11-02'), priority: 3, created_at: '2026-10-01T10:00:00Z' },
  { id: 'b', title: 'armação',   due_date: due('2026-10-30'), priority: 2, created_at: '2026-10-20T10:00:00Z' },
  { id: 'c', title: 'Concreto',  due_date: null,              priority: 1, created_at: '2026-10-25T10:00:00Z' },
  { id: 'd', title: 'Álvenaria', due_date: due('2026-10-30'), priority: 1, created_at: '2026-10-10T10:00:00Z' },
]
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('agenda mobile — Classificar', () => {
  it('Prazo: data mais próxima, depois prioridade; sem prazo por último', () => {
    expect(ids(ordenarTarefas(MIX, 'prazo'))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('Prioridade: urgente primeiro, desempate pelo prazo (sem prazo por último)', () => {
    expect(ids(ordenarTarefas(MIX, 'prioridade'))).toEqual(['d', 'c', 'b', 'a'])
  })

  it('Título: A–Z sem diferença de caixa nem de acento', () => {
    expect(ids(ordenarTarefas(MIX, 'titulo'))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('Mais recentes: criada por último primeiro', () => {
    expect(ids(ordenarTarefas(MIX, 'recentes'))).toEqual(['c', 'b', 'd', 'a'])
  })

  it('não mexe no array recebido', () => {
    const copia = [...MIX]
    ordenarTarefas(MIX, 'titulo')
    expect(MIX).toEqual(copia)
  })

  it('a ordem vale dentro de cada seção de prazo', () => {
    const s = groupBySection(MIX, TODAY, 'titulo')
    expect(s.map(x => x.key)).toEqual(['proximos', 'sem_prazo'])
    expect(ids(s[0].items)).toEqual(['d', 'b', 'a'])
  })

  it('sem ordem, as seções de prazo seguem como antes', () => {
    expect(ids(groupBySection(MIX, TODAY)[0].items)).toEqual(['d', 'b', 'a'])
  })

  it('rótulos das opções', () => {
    expect(ORDEM_LABEL).toEqual({ prazo: 'Prazo', prioridade: 'Prioridade', titulo: 'Título (A–Z)', recentes: 'Mais recentes' })
  })
})

describe('agenda mobile — aba Prioridade', () => {
  it('seções Urgente · Alta · Normal · Baixa, sem as vazias', () => {
    const s = groupByPriority(MIX, 'prazo')
    expect(s.map(x => x.key)).toEqual(['urgente', 'alta', 'normal'])
    expect(s.map(x => x.label)).toEqual(['Urgente', 'Alta', 'Normal'])
    expect(ids(s[0].items)).toEqual(['d', 'c'])
  })

  it('dentro da seção vale a ordem escolhida', () => {
    expect(ids(groupByPriority(MIX, 'recentes')[0].items)).toEqual(['c', 'd'])
  })

  it('prioridade fora de 1–4 cai em Normal', () => {
    const s = groupByPriority([{ id: 'x', due_date: null, priority: 9 }], 'prazo')
    expect(s.map(x => x.key)).toEqual(['normal'])
  })

  it('lista vazia, nenhuma seção', () => {
    expect(groupByPriority([], 'prazo')).toEqual([])
  })
})

describe('agenda mobile — ordem lembrada no aparelho', () => {
  const memoria = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
  }

  it('grava e lê a ordem escolhida', () => {
    const st = memoria()
    salvarOrdemTarefas('titulo', st)
    expect(lerOrdemTarefas(st)).toBe('titulo')
  })

  it('sem nada gravado, valor desconhecido ou armazenamento indisponível → Prazo', () => {
    expect(lerOrdemTarefas(memoria())).toBe('prazo')
    const st = memoria(); st.setItem('orcacloud:tarefas-celular:ordem', 'qualquer')
    expect(lerOrdemTarefas(st)).toBe('prazo')
    st.setItem('orcacloud:tarefas-celular:ordem', 'toString')
    expect(lerOrdemTarefas(st)).toBe('prazo')
    expect(lerOrdemTarefas(null)).toBe('prazo')
    const quebrado = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    expect(lerOrdemTarefas(quebrado)).toBe('prazo')
    expect(() => salvarOrdemTarefas('titulo', quebrado)).not.toThrow()
  })
})

describe('agenda mobile — rótulos de prazo', () => {
  it('vencida diz há quanto tempo, não "Até"', () => {
    expect(dueLabel(due('2026-09-10'), TODAY)).toEqual({ text: 'Venceu há 47 d', tone: 'overdue' })
    expect(dueLabel(due('2026-10-26'), TODAY)).toEqual({ text: 'Venceu ontem', tone: 'overdue' })
  })

  it('hoje, amanhã e futuro', () => {
    expect(dueLabel(due('2026-10-27'), TODAY)).toEqual({ text: 'Vence hoje', tone: 'today' })
    expect(dueLabel(due('2026-10-28'), TODAY)).toEqual({ text: 'Vence amanhã', tone: 'normal' })
    expect(dueLabel(due('2026-11-03'), TODAY)).toEqual({ text: 'Até 03/11', tone: 'normal' })
    expect(dueLabel(null, TODAY)).toBeNull()
  })

  it('mostra o ano quando não é o ano corrente', () => {
    expect(shortDate(due('2026-07-03'), TODAY)).toBe('03/07')
    expect(shortDate(due('2025-07-03'), TODAY)).toBe('03/07/2025')
    expect(shortDate(due('2027-01-05'), TODAY)).toBe('05/01/2027')
  })

  it('rótulos de dia por extenso e no chip', () => {
    expect(longDayLabel('2026-10-27')).toBe('terça, 27 de outubro')
    expect(chipDayLabel('2026-10-27')).toBe('ter, 27/out')
  })
})

describe('agenda mobile — semana', () => {
  it('semana começa no domingo e tem 7 dias', () => {
    const start = weekStartOf(TODAY)
    expect(start.getDay()).toBe(0)
    expect(start.getDate()).toBe(25)
    expect(weekDays(start).map(d => d.getDate())).toEqual([25, 26, 27, 28, 29, 30, 31])
  })

  it('rótulo do mês acompanha a semana (não fica preso no mês de hoje)', () => {
    expect(weekMonthLabel(weekStartOf(TODAY))).toBe('Outubro 2026')
    expect(weekMonthLabel(weekStartOf(new Date(2026, 10, 3)))).toBe('Novembro 2026')
    expect(weekMonthLabel(weekStartOf(new Date(2026, 11, 30)))).toBe('Dezembro 2026')
  })
})

describe('agenda mobile — tempo', () => {
  it('"Nova" vale por 48 h a partir de agora', () => {
    const now = TODAY.getTime()
    expect(isNewTask(new Date(now - 47 * 3600e3).toISOString(), now)).toBe(true)
    expect(isNewTask(new Date(now - 49 * 3600e3).toISOString(), now)).toBe(false)
  })

  it('tempo até a meia-noite', () => {
    expect(msUntilNextDay(new Date(2026, 9, 27, 23, 59, 0))).toBe(60_000)
  })
})
