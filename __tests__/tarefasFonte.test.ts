import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc:     vi.fn(),
  from:    vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser } },
}))

import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  ehRecusaDoLink, fonteDoLink, fonteLogada, MENSAGEM_LINK_RECUSADO, TarefasFonteContext, TASK_COLS,
  useTarefasFonte, type TarefasFonte,
} from '../services/celular/tarefasFonte'

const ok = (data: unknown) => ({ data, error: null })

describe('fonteDoLink', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    mocks.getUser.mockReset()
  })

  it('listarTarefas por pasta chama celular_tarefas_listar e devolve nomesObras como Map', async () => {
    mocks.rpc.mockResolvedValue(ok({ tarefas: [{ id: 't1' }], nomes_obras: { p1: 'Obra Um' } }))
    const r = await fonteDoLink('tk').listarTarefas(undefined, { spaceId: 's', folderId: 'f' }, 300)
    expect(mocks.rpc).toHaveBeenCalledWith('celular_tarefas_listar', {
      p_token: 'tk', p_space_id: 's', p_folder_id: 'f', p_sem_pasta: false,
    })
    expect(r.tarefas).toEqual([{ id: 't1' }])
    expect(r.nomesObras).toBeInstanceOf(Map)
    expect(r.nomesObras.get('p1')).toBe('Obra Um')
  })

  it('semPasta: p_folder_id nulo e p_sem_pasta verdadeiro', async () => {
    mocks.rpc.mockResolvedValue(ok({ tarefas: [], nomes_obras: {} }))
    await fonteDoLink('tk').listarTarefas(undefined, { spaceId: 's', semPasta: true }, 300)
    expect(mocks.rpc).toHaveBeenCalledWith('celular_tarefas_listar', {
      p_token: 'tk', p_space_id: 's', p_folder_id: null, p_sem_pasta: true,
    })
  })

  it('sem escopo: tudo nulo e org recebida é ignorada', async () => {
    mocks.rpc.mockResolvedValue(ok({ tarefas: [], nomes_obras: {} }))
    await fonteDoLink('tk').listarTarefas('org-da-sessao', null, 300)
    expect(mocks.rpc).toHaveBeenCalledWith('celular_tarefas_listar', {
      p_token: 'tk', p_space_id: null, p_folder_id: null, p_sem_pasta: false,
    })
  })

  it('atualizarTarefa chama celular_tarefa_atualizar com o patch e devolve a tarefa', async () => {
    mocks.rpc.mockResolvedValue(ok({ id: 't1', status: 'done' }))
    const r = await fonteDoLink('tk').atualizarTarefa('t1', { status: 'done', status_id: 'd' })
    expect(mocks.rpc).toHaveBeenCalledWith('celular_tarefa_atualizar', {
      p_token: 'tk', p_task_id: 't1', p_patch: { status: 'done', status_id: 'd' },
    })
    expect(r).toEqual({ id: 't1', status: 'done' })
  })

  it('criarTarefa NÃO envia orgId no p_dados (a RPC recusa chave estranha)', async () => {
    mocks.rpc.mockResolvedValue(ok({ id: 'nova' }))
    await fonteDoLink('tk').criarTarefa({
      orgId: 'org-x', title: 'Comprar cimento', description: null, start_date: null,
      due_date: '2026-11-12T15:00:00.000Z', priority: 2, space_id: 's', folder_id: null,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('celular_tarefa_criar', {
      p_token: 'tk',
      p_dados: {
        title: 'Comprar cimento', description: null, start_date: null,
        due_date: '2026-11-12T15:00:00.000Z', priority: 2, space_id: 's', folder_id: null,
      },
    })
    const dados = mocks.rpc.mock.calls[0][1].p_dados
    expect(Object.keys(dados)).not.toContain('orgId')
    expect(Object.keys(dados)).not.toContain('org_id')
  })

  it('espaços, status e responsáveis vão pelas RPCs com o token', async () => {
    mocks.rpc.mockResolvedValueOnce(ok([{ id: 'sp1' }]))
    mocks.rpc.mockResolvedValueOnce(ok([{ id: 'st1' }]))
    mocks.rpc.mockResolvedValueOnce(ok([{ id: 'e1', name: 'Ana' }]))
    const f = fonteDoLink('tk')
    expect(await f.listarEspacos('qualquer')).toEqual([{ id: 'sp1' }])
    expect(await f.listarStatus('qualquer')).toEqual([{ id: 'st1' }])
    expect(await f.listarResponsaveis('qualquer')).toEqual([{ id: 'e1', name: 'Ana' }])
    expect(mocks.rpc.mock.calls).toEqual([
      ['celular_espacos_listar',      { p_token: 'tk' }],
      ['celular_status_listar',       { p_token: 'tk' }],
      ['celular_responsaveis_listar', { p_token: 'tk' }],
    ])
  })

  it('erro do rpc vira throw em todas as operações', async () => {
    const erro = { message: 'link inválido ou vencido', code: '42501' }
    mocks.rpc.mockResolvedValue({ data: null, error: erro })
    const f = fonteDoLink('tk')
    await expect(f.listarTarefas(undefined, null, 300)).rejects.toEqual(erro)
    await expect(f.listarEspacos(undefined)).rejects.toEqual(erro)
    await expect(f.listarStatus(undefined)).rejects.toEqual(erro)
    await expect(f.listarResponsaveis('x')).rejects.toEqual(erro)
    await expect(f.atualizarTarefa('t1', { status: 'open' })).rejects.toEqual(erro)
    await expect(f.criarTarefa({
      orgId: 'o', title: 't', description: null, start_date: null, due_date: null,
      priority: 3, space_id: null, folder_id: null,
    })).rejects.toEqual(erro)
  })

  it('aoRecusar: chamado só com 42501 + "link inválido ou vencido", e o erro ainda é lançado', async () => {
    const aoRecusar = vi.fn()
    const f = fonteDoLink('tk', { aoRecusar })
    const recusa = { code: '42501', message: 'link inválido ou vencido' }

    mocks.rpc.mockResolvedValueOnce({ data: null, error: recusa })
    await expect(f.listarTarefas(undefined, null, 300)).rejects.toEqual(recusa)
    expect(aoRecusar).toHaveBeenCalledTimes(1)

    mocks.rpc.mockResolvedValueOnce({ data: null, error: recusa })
    await expect(f.atualizarTarefa('t1', { title: 'x' })).rejects.toEqual(recusa)
    expect(aoRecusar).toHaveBeenCalledTimes(2)

    // Outro 42501 é recusa de UMA ação (o link segue valendo): não dispara.
    const semPermissao = { code: '42501', message: 'tarefa não encontrada ou sem permissão para editar' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: semPermissao })
    await expect(f.atualizarTarefa('t1', { title: 'x' })).rejects.toEqual(semPermissao)
    // A mesma mensagem com outro código também não.
    const outroCodigo = { code: '22023', message: 'link inválido ou vencido' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: outroCodigo })
    await expect(f.listarStatus(undefined)).rejects.toEqual(outroCodigo)
    // Rede/5xx: não dispara.
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    await expect(f.listarEspacos(undefined)).rejects.toBeTruthy()
    // Sucesso: não dispara.
    mocks.rpc.mockResolvedValueOnce(ok([]))
    await f.listarResponsaveis('x')

    expect(aoRecusar).toHaveBeenCalledTimes(2)
  })

  it('sem opções, a recusa do token só é lançada (aoRecusar é opcional)', async () => {
    const recusa = { code: '42501', message: 'link inválido ou vencido' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: recusa })
    await expect(fonteDoLink('tk').listarStatus(undefined)).rejects.toEqual(recusa)
  })

  it('ehRecusaDoLink: só 42501 com a mensagem exata do resolver', () => {
    expect(ehRecusaDoLink({ code: '42501', message: MENSAGEM_LINK_RECUSADO })).toBe(true)
    expect(ehRecusaDoLink({ code: '42501', message: 'Link inválido ou vencido' })).toBe(false)
    expect(ehRecusaDoLink({ code: '42501', message: 'sem acesso a este espaço' })).toBe(false)
    expect(ehRecusaDoLink({ code: 'PGRST301', message: MENSAGEM_LINK_RECUSADO })).toBe(false)
    expect(ehRecusaDoLink(null)).toBe(false)
    expect(ehRecusaDoLink('42501')).toBe(false)
  })

  it('NUNCA chama supabase.from nem auth.getUser (a sessão logada de outra pessoa não vale)', async () => {
    mocks.rpc.mockResolvedValue(ok({ tarefas: [], nomes_obras: {} }))
    const f = fonteDoLink('tk')
    await f.listarTarefas(undefined, null, 300)
    await f.listarTarefas('org', { spaceId: 's', semPasta: true }, 300)
    mocks.rpc.mockResolvedValue(ok([]))
    await f.listarEspacos('org')
    await f.listarStatus('org')
    await f.listarResponsaveis('org')
    mocks.rpc.mockResolvedValue(ok({ id: 't' }))
    await f.atualizarTarefa('t', { title: 'x' })
    await f.criarTarefa({
      orgId: 'o', title: 't', description: null, start_date: null, due_date: null,
      priority: 3, space_id: null, folder_id: null,
    })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await f.listarTarefas(undefined, null, 300).catch(() => {})
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
})

describe('fonteLogada', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    mocks.getUser.mockReset()
  })

  it('modo é "logado" e o contexto padrão é a fonte logada', () => {
    expect(fonteLogada.modo).toBe('logado')
    expect(fonteDoLink('tk').modo).toBe('link')
  })

  it('useTarefasFonte: padrão é a fonte logada; o Provider troca pela do link', () => {
    const lidas: TarefasFonte[] = []
    const Sonda = () => { lidas.push(useTarefasFonte()); return null }
    renderToString(React.createElement(Sonda))
    const doLink = fonteDoLink('tk')
    renderToString(React.createElement(TarefasFonteContext.Provider, { value: doLink }, React.createElement(Sonda)))
    expect(lidas[0]).toBe(fonteLogada)
    expect(lidas[1]).toBe(doLink)
  })

  it('criarTarefa sem usuário lança a mensagem de sessão expirada e não grava', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(fonteLogada.criarTarefa({
      orgId: 'o', title: 't', description: null, start_date: null, due_date: null,
      priority: 3, space_id: null, folder_id: null,
    })).rejects.toThrow('Sua sessão expirou. Entre de novo para criar a tarefa.')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('criarTarefa grava com org, dono e origem manual e devolve a linha', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const single = vi.fn().mockResolvedValue(ok({ id: 'nova' }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    mocks.from.mockReturnValue({ insert })
    const r = await fonteLogada.criarTarefa({
      orgId: 'o1', title: 'Tarefa', description: 'd', start_date: null, due_date: null,
      priority: 3, space_id: 's', folder_id: 'f',
    })
    expect(mocks.from).toHaveBeenCalledWith('tasks')
    expect(insert).toHaveBeenCalledWith({
      title: 'Tarefa', description: 'd', start_date: null, due_date: null, priority: 3,
      status: 'open', source_module: 'manual', org_id: 'o1', user_id: 'u1', space_id: 's', folder_id: 'f',
    })
    expect(select).toHaveBeenCalledWith(TASK_COLS)
    expect(r).toEqual({ id: 'nova' })
  })

  it('atualizarTarefa faz update por id e relança o erro', async () => {
    const erro = { message: 'falhou' }
    const single = vi.fn().mockResolvedValue({ data: null, error: erro })
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))
    mocks.from.mockReturnValue({ update })
    await expect(fonteLogada.atualizarTarefa('t1', { status: 'done' })).rejects.toEqual(erro)
    expect(update).toHaveBeenCalledWith({ status: 'done' })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })
})
