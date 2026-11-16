// @vitest-environment jsdom
/**
 * Minhas Tarefas › Painel (15/11/2026) — comportamento da tela.
 *
 * O cálculo tem teste próprio (`__tests__/tarefasPainel.test.ts`). Aqui: as duas faixas do
 * §4.5.1 (trocar o período não mexe na faixa "Hoje"), a ação "Ver na lista" das atrasadas,
 * a atrasada que abre a tarefa e os estados de falha e de recorte vazio.
 * Plano: docs/planos/2026-11-15-tarefas-painel-analise.md
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// recharts mede o container com ResizeObserver; em jsdom a largura é 0. O que se confere
// aqui é o texto e o nome acessível (aria-label com os números), não o SVG.
vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Vazio = () => null
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: Vazio, Cell: Vazio, LabelList: Vazio,
    XAxis: Vazio, YAxis: Vazio, CartesianGrid: Vazio, Tooltip: Vazio,
  }
})

import TasksDashboard from '../../components/TasksDashboard'
import type { TaskRecord } from '../../components/TaskForm'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0)) // segunda-feira, 16/11/2026
  localStorage.clear()
})
afterAll(() => { vi.useRealTimers() })

let seq = 0
const tarefa = (p: Partial<TaskRecord>): TaskRecord => ({
  id: `t${++seq}`, org_id: 'o1', user_id: 'u1', title: `Tarefa ${seq}`, description: null,
  start_date: null, due_date: null, priority: 3, status: 'open', status_id: null,
  source_module: 'manual', source_ref: null, assignee_employee_id: null, project_id: null,
  parent_task_id: null, space_id: null, folder_id: null, completed_at: null,
  created_at: new Date(2026, 10, 1, 9).toISOString(), alert_at: null,
  ...p,
})

const ATRASADA = tarefa({ title: 'Renovar contrato', due_date: '2026-11-06T12:00:00', assignee_employee_id: 'ana' })
const TAREFAS: TaskRecord[] = [
  ATRASADA,
  tarefa({ due_date: '2026-11-18T12:00:00' }),
  tarefa({}),
  // concluída em 07/09 (10 semanas atrás): fora da janela de 8 semanas (desde 28/09), dentro da de 26
  tarefa({ status: 'done', created_at: new Date(2026, 7, 1).toISOString(), completed_at: new Date(2026, 8, 7, 10).toISOString() }),
  // concluída na semana passada
  tarefa({ status: 'done', completed_at: new Date(2026, 10, 10, 10).toISOString() }),
]

const montar = (over: Partial<React.ComponentProps<typeof TasksDashboard>> = {}) => {
  const props: React.ComponentProps<typeof TasksDashboard> = {
    tasks: TAREFAS,
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    employees: [{ id: 'ana', name: 'Ana', role: 'Engenheira' }],
    obras: [],
    spaces: [],
    scopeControls: <span>controles de espaço</span>,
    emptyHint: { message: 'Nenhuma tarefa.' },
    onOpenTask: vi.fn(),
    onVerAtrasadas: vi.fn(),
    ...over,
  }
  render(<TasksDashboard {...props} />)
  return props
}

const faixa = (nome: RegExp) => screen.getByRole('region', { name: nome })
/** O cartão de KPI (moldura `rounded-xl`) cujo rótulo é `rotulo` — "Concluídas" também é
 *  rótulo de legenda de gráfico, por isso filtra pela moldura do cartão. */
const kpi = (dentro: HTMLElement, rotulo: string) => {
  const cartao = within(dentro).getAllByText(rotulo).map(el => el.closest('.rounded-xl')).find(Boolean)
  if (!cartao) throw new Error(`KPI "${rotulo}" não encontrado`)
  return cartao.textContent ?? ''
}

describe('TasksDashboard', () => {
  it('mostra a faixa Hoje com abertas e atrasadas e a ação para ver as atrasadas na lista', () => {
    const props = montar()
    const hoje = faixa(/^Hoje/)
    expect(kpi(hoje, 'Abertas')).toMatch(/^Abertas3/)
    expect(kpi(hoje, 'Atrasadas')).toMatch(/^Atrasadas1/)
    expect(within(hoje).getByText('A mais antiga há 10 dias')).toBeTruthy()
    fireEvent.click(within(hoje).getByRole('button', { name: /Ver na lista/ }))
    expect(props.onVerAtrasadas).toHaveBeenCalledTimes(1)
  })

  it('clicar numa atrasada abre a tarefa', () => {
    const props = montar()
    fireEvent.click(screen.getByRole('button', { name: /Renovar contrato/ }))
    expect(props.onOpenTask).toHaveBeenCalledWith(ATRASADA)
  })

  it('trocar o período muda só a faixa do período', () => {
    montar()
    const periodo = faixa(/^Resultado do período/)
    const hojeAntes = faixa(/^Hoje/).textContent
    const concluidas = () => kpi(periodo, 'Concluídas')

    fireEvent.click(within(periodo).getByRole('button', { name: '8 semanas' }))
    expect(concluidas()).toMatch(/^Concluídas1≈/)
    fireEvent.click(within(periodo).getByRole('button', { name: '26 semanas' }))
    expect(within(periodo).getByRole('button', { name: '26 semanas' }).getAttribute('aria-pressed')).toBe('true')
    expect(concluidas()).toMatch(/^Concluídas2≈/)
    expect(faixa(/^Hoje/).textContent).toBe(hojeAntes)
  })

  it('falha de leitura mostra "Tentar de novo", nunca um painel zerado', () => {
    const props = montar({ tasks: [], loadError: true })
    expect(screen.queryByText('Abertas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('recorte vazio explica o motivo e oferece ver todas', () => {
    const onClick = vi.fn()
    montar({ tasks: [], emptyHint: { message: 'Nenhuma tarefa no espaço Compras.', action: { label: 'Ver todas as tarefas', onClick } } })
    expect(screen.getByText(/Nenhuma tarefa no espaço Compras\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as tarefas' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('controles de espaço')).toBeTruthy() // o recorte continua à mão
  })
})
