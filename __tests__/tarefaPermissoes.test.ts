/**
 * Tarefas — quem vê, quem apaga (2026-11-12, aplicar_20271112998000).
 * A tela diz o porquê quando o banco recusa: excluir é só de quem criou; deixar a
 * tarefa sem responsável e fora de espaço é só de quem criou.
 * Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
 *        (Ajustes — visibilidade pelo responsável).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  DICA_VISIBILIDADE_TAREFA, MSG_SO_QUEM_CRIOU_EXCLUI, explicarErroTarefa, resumirExclusao,
} from '../utils/tarefaPermissoes'

describe('tarefaPermissoes', () => {
  it('textos da regra', () => {
    expect(MSG_SO_QUEM_CRIOU_EXCLUI).toBe('Só quem criou a tarefa pode excluí-la.')
    expect(DICA_VISIBILIDADE_TAREFA).toBe(
      'Visível para quem criou, o responsável, os Envolvidos (só consulta) e o proprietário/admin da organização.')
  })

  it('exclusão em lote: conta as que o banco não apagou e diz por quê', () => {
    expect(resumirExclusao(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ recusadas: [], mensagem: null })
    const r = resumirExclusao(['a', 'b', 'c'], ['b'])
    expect(r.recusadas).toEqual(['a', 'c'])
    expect(r.mensagem).toBe('2 de 3 tarefas não foram excluídas. Só quem criou a tarefa pode excluí-la.')
    expect(resumirExclusao(['a'], []).mensagem).toBe('A tarefa não foi excluída. Só quem criou a tarefa pode excluí-la.')
    expect(resumirExclusao(['a', 'b'], ['a']).mensagem).toBe('1 de 2 tarefas não foi excluída. Só quem criou a tarefa pode excluí-la.')
  })

  it('erro do banco ao gravar: recusa explicada sai com inicial maiúscula; RLS genérico vira frase', () => {
    expect(explicarErroTarefa({
      code: '42501',
      message: 'só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)',
    })).toBe('Só quem criou a tarefa pode deixá-la sem responsável e fora de espaço (ela vira a agenda pessoal de quem a criou)')
    expect(explicarErroTarefa({ code: '42501', message: 'new row violates row-level security policy for table "tasks"' }))
      .toMatch(/^Sem permissão para gravar a tarefa assim/)
    expect(explicarErroTarefa({ message: 'outra coisa' })).toBe('Outra coisa')
    expect(explicarErroTarefa({ details: 'detalhe' })).toBe('Detalhe')
    expect(explicarErroTarefa({})).toBe('Erro desconhecido')
  })

  it('TasksModule.bulkDelete compara o que pediu com o que o banco apagou e avisa', () => {
    const src = readFileSync(path.resolve(__dirname, '../components/TasksModule.tsx'), 'utf8')
    const i = src.indexOf('const bulkDelete = async')
    const corpo = src.slice(i, src.indexOf('\n  }\n', i))
    expect(corpo).toMatch(/\.delete\(\)\.in\('id', ids\)\.select\('id'\)/)
    expect(corpo).toMatch(/resumirExclusao\(ids,/)
    expect(corpo).toMatch(/hideCancel: true/)
  })
})
