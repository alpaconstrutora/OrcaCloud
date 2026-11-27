// @vitest-environment jsdom
/**
 * Minhas Tarefas pelo link do celular — o link vale para TODAS as organizações de que o
 * dono é membro (regra do usuário, 27/11/2026). Tarefa nova sem espaço pergunta a
 * organização quando há mais de uma (REGRA #5, como o app logado em "Todas"); com uma
 * só, cria nela sem perguntar; com espaço, a org é a do espaço.
 * Plano: docs/planos/2026-11-27-diario-link-todas-orgs.md (pedido 3).
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import TasksMobileApp from '../../components/TasksMobileApp'
import { TarefasFonteContext, type TarefasFonte, type NovaTarefa, type Task } from '../../services/celular/tarefasFonte'

const ORGS = [{ id: 'o1', name: 'Alpa Construtora' }, { id: 'o2', name: 'Garden Cambuhy SPE' }]

const montar = (organizacoesDoLink: { id: string; name: string }[]) => {
  const criadas: NovaTarefa[] = []
  const fonte: TarefasFonte = {
    modo: 'link',
    listarTarefas: async () => ({ tarefas: [], nomesObras: new Map() }),
    listarEspacos: async () => [],
    listarStatus: async () => [],
    listarResponsaveis: async () => [],
    criarTarefa: async dados => {
      criadas.push(dados)
      return { id: 'nova', org_id: dados.orgId, title: dados.title, status: 'open' } as unknown as Task
    },
    atualizarTarefa: async () => { throw new Error('não usado') },
  }
  render(
    <TarefasFonteContext.Provider value={fonte}>
      <TasksMobileApp orgId="o1" organizacoesDoLink={organizacoesDoLink} />
    </TarefasFonteContext.Provider>,
  )
  return criadas
}

const criarSemEspaco = async (titulo: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Nova tarefa' }))
  fireEvent.change(await screen.findByLabelText('Nome da tarefa'), { target: { value: titulo } })
  fireEvent.click(screen.getByRole('button', { name: /Criar tarefa/ }))
}

describe('Minhas Tarefas pelo link — todas as orgs do dono', () => {
  it('duas orgs, sem espaço: pergunta a organização e cria na escolhida', async () => {
    const criadas = montar(ORGS)
    await criarSemEspaco('Medir a laje')
    expect(await screen.findByText('Selecionar organização')).toBeTruthy()
    expect(screen.getByText('Este link vale para todas as suas organizações. Escolha onde criar a tarefa.')).toBeTruthy()
    expect(criadas).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Garden Cambuhy SPE/ }))
    await vi.waitFor(() => expect(criadas).toHaveLength(1))
    expect(criadas[0].orgId).toBe('o2')
    expect(criadas[0].space_id).toBeNull()
  })

  it('uma org só: cria nela sem perguntar', async () => {
    const criadas = montar([ORGS[1]])
    await criarSemEspaco('Medir a laje')
    await vi.waitFor(() => expect(criadas).toHaveLength(1))
    expect(criadas[0].orgId).toBe('o2')
    expect(screen.queryByText('Selecionar organização')).toBeNull()
  })
})
