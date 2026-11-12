// @vitest-environment jsdom
/**
 * Minhas Tarefas no celular — aba "Prioridade" e botão "Classificar" (2026-11-12).
 *
 *  - a aba Prioridade conta urgentes + altas e troca as seções de prazo por
 *    Urgente · Alta · Normal · Baixa (sem as vazias);
 *  - o Classificar muda a ordem dentro da seção e a escolha fica no aparelho.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}))

import TasksMobileApp from '../../components/TasksMobileApp'
import { TarefasFonteContext, type TarefasFonte, type Task } from '../../services/celular/tarefasFonte'
import { addDays, isoDate } from '../../utils/tasksMobileAgenda'

const prazo = (dias: number) => `${isoDate(addDays(new Date(), dias))}T12:00:00.000Z`

const tarefa = (id: string, title: string, priority: number, due_date: string | null, created_at: string): Task => ({
  id, org_id: 'o1', title, description: null, start_date: null, due_date, priority, status: 'open',
  status_id: null, source_module: 'manual', space_id: null, folder_id: null, project_id: null,
  assignee_employee_id: null, alert_at: null, parent_task_id: null, created_at,
} as unknown as Task)

const TAREFAS = [
  tarefa('t1', 'Bloco',     3, prazo(2),  '2026-10-01T10:00:00Z'),
  tarefa('t2', 'armação',   2, prazo(1),  '2026-10-20T10:00:00Z'),
  tarefa('t3', 'Concreto',  1, null,      '2026-10-25T10:00:00Z'),
  tarefa('t4', 'Álvenaria', 1, prazo(-1), '2026-10-10T10:00:00Z'),
]

const fonte: TarefasFonte = {
  modo: 'link',
  listarTarefas: async () => ({ tarefas: TAREFAS, nomesObras: new Map() }),
  listarEspacos: async () => [],
  listarStatus: async () => [],
  listarResponsaveis: async () => [],
  criarTarefa: async () => { throw new Error('não usado') },
  atualizarTarefa: async () => { throw new Error('não usado') },
}

const montar = () => render(
  <TarefasFonteContext.Provider value={fonte}>
    <TasksMobileApp orgId="o1" />
  </TarefasFonteContext.Provider>
)

/** Ordem em que os títulos aparecem dentro de um elemento. */
const ordemDosTitulos = (el: HTMLElement, titulos: string[]) =>
  [...titulos].sort((a, b) => el.textContent!.indexOf(a) - el.textContent!.indexOf(b))

beforeEach(() => { window.localStorage.clear() })

describe('Minhas Tarefas (celular) — Prioridade e Classificar', () => {
  it('aba Prioridade: conta urgentes + altas e agrupa por prioridade', async () => {
    montar()
    const aba = await screen.findByRole('tab', { name: /Prioridade/ })
    expect(aba).toHaveTextContent('3')
    fireEvent.click(aba)
    expect(aba).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Urgente' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Alta' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Normal' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Baixa' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Atrasadas' })).toBeNull()
    // Ordem padrão (Prazo): a vencida antes da sem prazo.
    expect(ordemDosTitulos(screen.getByRole('region', { name: 'Urgente' }), ['Concreto', 'Álvenaria']))
      .toEqual(['Álvenaria', 'Concreto'])
  })

  it('Classificar: escolher "Mais recentes" reordena a seção e fica lembrado', async () => {
    montar()
    fireEvent.click(await screen.findByRole('tab', { name: /Prioridade/ }))
    const botao = screen.getByRole('button', { name: 'Classificar — ordem atual: Prazo' })
    fireEvent.click(botao)
    const sheet = screen.getByRole('dialog', { name: 'Classificar' })
    expect(within(sheet).getByRole('radio', { name: 'Prazo' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Mais recentes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Classificar' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Classificar — ordem atual: Mais recentes' })).toBeInTheDocument()
    expect(ordemDosTitulos(screen.getByRole('region', { name: 'Urgente' }), ['Concreto', 'Álvenaria']))
      .toEqual(['Concreto', 'Álvenaria'])
    expect(window.localStorage.getItem('orcacloud:tarefas-celular:ordem')).toBe('recentes')
  })

  it('a ordem lembrada vale ao abrir de novo, também na aba Todas', async () => {
    window.localStorage.setItem('orcacloud:tarefas-celular:ordem', 'titulo')
    montar()
    expect(await screen.findByRole('button', { name: 'Classificar — ordem atual: Título (A–Z)' })).toBeInTheDocument()
    // Todas: seção "Próximos 7 dias" com armação (amanhã) e Bloco (depois de amanhã) — por título, armação antes.
    const proximos = screen.getByRole('region', { name: 'Próximos 7 dias' })
    expect(ordemDosTitulos(proximos, ['Bloco', 'armação'])).toEqual(['armação', 'Bloco'])
  })
})
