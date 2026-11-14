// @vitest-environment jsdom
/**
 * Formulário de tarefa — visibilidade pelo responsável (2026-11-12).
 *  - ao lado do Responsável, a frase de quem vê a tarefa;
 *  - Envolvidos marcados como visualização;
 *  - excluir que o banco recusa (0 linhas) mostra o motivo e não fecha o formulário.
 * Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
 *        (Ajustes — visibilidade pelo responsável).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apagadas = { ids: [] as Array<{ id: string }> }
const chamadas: string[] = []

vi.mock('../../lib/supabase', () => {
  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {}
    const fim = (dados: unknown) => Promise.resolve({ data: dados, error: null })
    q.select = () => q
    q.eq = () => q
    q.then = (ok: (v: unknown) => unknown) => fim([]).then(ok)
    q.delete = () => {
      chamadas.push(`delete:${tabela}`)
      return {
        eq: () => ({ select: () => fim(apagadas.ids), then: (ok: (v: unknown) => unknown) => fim(null).then(ok) }),
      }
    }
    return q
  }
  return { supabase: { from: (t: string) => consulta(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } }
})
vi.mock('../../services/notificationService', () => ({ notificationService: { sendNotification: vi.fn() } }))

import TaskForm, { type TaskRecord } from '../../components/TaskForm'
import { ConfirmProvider } from '../../components/ui/confirm'

const tarefa: TaskRecord = {
  id: 't1', org_id: 'o1', user_id: 'outro', title: 'Comprar cimento', description: null,
  start_date: null, due_date: null, priority: 3, status: 'open', status_id: null,
  source_module: 'manual', source_ref: null, assignee_employee_id: 'e1', project_id: null,
  parent_task_id: null, space_id: null, folder_id: null, completed_at: null,
  created_at: '2026-11-12T10:00:00Z', alert_at: null,
}

const montar = (onSaved = vi.fn()) => {
  render(
    <ConfirmProvider>
      <TaskForm orgId="o1" orgs={[{ id: 'o1', name: 'Org' }]} employees={[{ id: 'e1', name: 'Ana', role: '' }]}
        projects={[]} task={tarefa} onClose={() => {}} onSaved={onSaved} />
    </ConfirmProvider>,
  )
  return onSaved
}

// O modal de confirmação abre com um segundo botão "Excluir": clica o do modal (o último).
const confirmarNoModal = async () => {
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Excluir' }).length).toBe(2))
  const botoes = screen.getAllByRole('button', { name: 'Excluir' })
  fireEvent.click(botoes[botoes.length - 1])
}

describe('TaskForm — visibilidade pelo responsável', () => {
  beforeEach(() => { apagadas.ids = []; chamadas.length = 0 })

  it('mostra ao lado do Responsável quem vê a tarefa, e Envolvidos como visualização', () => {
    montar()
    expect(screen.getByText(
      'Visível para quem criou, o responsável, os Envolvidos (só consulta) e o proprietário/admin da organização.')).toBeTruthy()
    expect(screen.getByText('Envolvidos (visualização)')).toBeTruthy()
  })

  it('excluir recusado pelo banco (0 linhas): mostra o motivo e não fecha', async () => {
    const onSaved = montar()
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }))
    await confirmarNoModal()
    await waitFor(() => expect(screen.getByText('Só quem criou a tarefa pode excluí-la.')).toBeTruthy())
    expect(chamadas).toContain('delete:tasks')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('excluir aceito (1 linha): fecha', async () => {
    apagadas.ids = [{ id: 't1' }]
    const onSaved = montar()
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }))
    await confirmarNoModal()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(screen.queryByText('Só quem criou a tarefa pode excluí-la.')).toBeNull()
  })
})
