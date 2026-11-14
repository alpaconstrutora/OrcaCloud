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
  DICA_AGENDA_PESSOAL, DICA_VISIBILIDADE_TAREFA, MSG_EXCLUSAO_RECUSADA, MSG_SEM_PERMISSAO_EDITAR,
  MSG_SO_QUEM_CRIOU_EXCLUI, dicaVisibilidade, ehRecusaDoBanco, explicarErroTarefa, mensagemAoGravarTarefa,
  motivoParaNaoExcluirTarefa, resumirExclusao,
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

  // ── revisão de 13/11 ──────────────────────────────────────────────────────
  it('frase de quem vê: agenda pessoal sem responsável e fora de espaço', () => {
    expect(DICA_AGENDA_PESSOAL).toBe('Agenda pessoal: só quem criou e os Envolvidos veem esta tarefa.')
    expect(dicaVisibilidade(null, null)).toBe(DICA_AGENDA_PESSOAL)
    expect(dicaVisibilidade('', '')).toBe(DICA_AGENDA_PESSOAL)
    expect(dicaVisibilidade('e1', null)).toBe(DICA_VISIBILIDADE_TAREFA)
    expect(dicaVisibilidade(null, 's1')).toBe(DICA_VISIBILIDADE_TAREFA)
  })

  it('Excluir: motivo para quem não criou; sessão desconhecida não desliga', () => {
    expect(motivoParaNaoExcluirTarefa('u1', 'u1')).toBeNull()
    expect(motivoParaNaoExcluirTarefa(null, 'u1')).toBeNull()
    expect(motivoParaNaoExcluirTarefa('u2', 'u1')).toMatch(/^Só quem criou a tarefa pode excluí-la\. /)
    expect(MSG_EXCLUSAO_RECUSADA).toBe('Não foi possível excluir: só quem criou a tarefa pode excluí-la (ou ela já foi excluída).')
  })

  it('recusa do banco × falha de rede', () => {
    expect(ehRecusaDoBanco({ code: '42501', message: 'x' })).toBe(true)
    expect(ehRecusaDoBanco({ code: '22023', message: 'x' })).toBe(true)
    expect(ehRecusaDoBanco({ code: 'PGRST116', message: 'x' })).toBe(true)
    expect(ehRecusaDoBanco({ code: '', message: 'TypeError: Failed to fetch' })).toBe(false)
    expect(ehRecusaDoBanco(new TypeError('Failed to fetch'))).toBe(false)
    expect(ehRecusaDoBanco(null)).toBe(false)
    expect(explicarErroTarefa({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }))
      .toBe(MSG_SEM_PERMISSAO_EDITAR)
    expect(mensagemAoGravarTarefa({ code: '42501', message: 'tarefa não encontrada ou sem permissão para editar' }, 'conexão'))
      .toBe('Tarefa não encontrada ou sem permissão para editar')
    expect(mensagemAoGravarTarefa(new TypeError('Failed to fetch'), 'conexão')).toBe('conexão')
    expect(explicarErroTarefa({ code: '42501', message: 'a autoria da tarefa não muda: quem a criou, o id e a data de criação ficam como estão' }))
      .toBe('A autoria da tarefa não muda: quem a criou, o id e a data de criação ficam como estão')
  })

  it('TasksModule: arrastar recusado avisa o porquê; edição em lote explica a recusa', () => {
    const src = readFileSync(path.resolve(__dirname, '../components/TasksModule.tsx'), 'utf8')
    const fim = src.includes('\r\n') ? '\r\n  }\r\n' : '\n  }\n'
    const corpo = (inicio: string) => { const i = src.indexOf(inicio); return src.slice(i, src.indexOf(fim, i)) }
    expect(corpo('const moveCard = async')).toMatch(/if \(error\) \{ console\.error\(error\); load\(\); await avisarRecusa\(/)
    expect(corpo('const makeSubtask = async')).toMatch(/await avisarRecusa\(/)
    expect(corpo('const avisarRecusa = async')).toMatch(/message: explicarErroTarefa\(error\)[\s\S]*hideCancel: true/)
    expect(corpo('const bulkUpdate = async')).toMatch(/if \(error\) throw new Error\(explicarErroTarefa\(error\)\)/)
    expect(corpo('const bulkDone = async')).toMatch(/hideCancel: true/)
  })
})
