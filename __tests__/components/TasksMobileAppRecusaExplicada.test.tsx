// @vitest-environment jsdom
/**
 * Minhas Tarefas no celular — recusa do banco sai explicada (2026-11-13).
 *
 * Antes, salvar/concluir recusado pelo banco (gatilho ou RPC do link, com SQLSTATE) caía
 * na frase de conexão ("Verifique a conexão…"), igual a uma queda de rede. Agora a recusa
 * passa por `explicarErroTarefa` (utils/tarefaPermissoes); só a falha de rede segue com a
 * frase de conexão.
 * Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
 *        (Ajustes — visibilidade pelo responsável, revisão de 13/11).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}))

import TasksMobileApp from '../../components/TasksMobileApp'
import { TarefasFonteContext, type TarefasFonte, type Task } from '../../services/celular/tarefasFonte'

const TAREFA = {
  id: 't1', org_id: 'o1', title: 'Comprar cimento', description: null, start_date: null, due_date: null,
  priority: 3, status: 'open', status_id: null, source_module: 'manual', space_id: null, folder_id: null,
  project_id: null, assignee_employee_id: 'e1', alert_at: null, parent_task_id: null,
  created_at: '2026-11-12T10:00:00Z',
} as unknown as Task

const RECUSA = { code: '42501', message: 'o responsável só altera título, descrição, datas, prioridade e status da tarefa' }

const montar = (erro: unknown) => {
  const fonte: TarefasFonte = {
    modo: 'link',
    listarTarefas: async () => ({ tarefas: [TAREFA], nomesObras: new Map() }),
    listarEspacos: async () => [],
    listarStatus: async () => [],
    listarResponsaveis: async () => [{ id: 'e1', name: 'Ana' }, { id: 'e2', name: 'Bruno' }],
    criarTarefa: async () => { throw new Error('não usado') },
    atualizarTarefa: async () => { throw erro },
  }
  render(
    <TarefasFonteContext.Provider value={fonte}>
      <TasksMobileApp orgId="o1" />
    </TarefasFonteContext.Provider>,
  )
}

const abrirEditar = async () => {
  fireEvent.click(await screen.findByText('Comprar cimento'))
  return screen.findByRole('dialog', { name: 'Editar tarefa' })
}

describe('Minhas Tarefas (celular) — recusa explicada', () => {
  it('salvar recusado pelo banco: mostra a regra, não a frase de conexão', async () => {
    montar(RECUSA)
    const folha = await abrirEditar()
    fireEvent.click(within(folha).getByRole('button', { name: /Salvar alterações/ }))
    expect(await within(folha).findByText(
      'O responsável só altera título, descrição, datas, prioridade e status da tarefa')).toBeTruthy()
    expect(within(folha).queryByText(/Verifique a conexão/)).toBeNull()
  })

  it('salvar com falha de rede: continua a frase de conexão', async () => {
    montar(new TypeError('Failed to fetch'))
    const folha = await abrirEditar()
    fireEvent.click(within(folha).getByRole('button', { name: /Salvar alterações/ }))
    expect(await within(folha).findByText('Não foi possível salvar a tarefa. Verifique a conexão e tente de novo.')).toBeTruthy()
  })

  it('concluir recusado pelo banco: o aviso diz o porquê', async () => {
    montar({ code: '42501', message: 'tarefa não encontrada ou sem permissão para editar' })
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir: Comprar cimento' }))
    expect(await screen.findByText('Tarefa não encontrada ou sem permissão para editar', {}, { timeout: 3000 })).toBeTruthy()
  })
})
