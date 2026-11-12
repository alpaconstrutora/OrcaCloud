// @vitest-environment jsdom
/**
 * Fonte de dados do Diário no celular (logado × link do celular) e os dois
 * hooks que passam a aceitar o carregador/assinador da fonte.
 *
 * O ponto central (Review Focus 4): pelo link, NADA passa por `supabase.from`,
 * pelo upload/assinatura/remoção direta do storage nem pelo `projectService` —
 * só RPCs `celular_*` e a Edge `celular-diario-midia`, que resolvem o token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const upload            = vi.fn()
  const uploadToSignedUrl = vi.fn()
  const createSignedUrls  = vi.fn()
  const remove            = vi.fn()
  return {
    rpc:         vi.fn(),
    from:        vi.fn(),
    invoke:      vi.fn(),
    storageFrom: vi.fn(() => ({ upload, uploadToSignedUrl, createSignedUrls, remove })),
    upload, uploadToSignedUrl, createSignedUrls, remove,
    loadProject:   vi.fn(),
    saveProject:   vi.fn(),
    listEmployees: vi.fn(),
    comprimirFoto: vi.fn(async (f: File) => f),
  }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    functions: { invoke: mocks.invoke },
    storage: { from: mocks.storageFrom },
  },
}))
vi.mock('../services/projectService', () => ({
  projectService: { loadProject: mocks.loadProject, saveProject: mocks.saveProject },
}))
vi.mock('../services/laborService', () => ({
  laborService: { listEmployees: mocks.listEmployees },
}))
vi.mock('../utils/comprimirFoto', () => ({ comprimirFoto: mocks.comprimirFoto }))

import React from 'react'
import { renderToString } from 'react-dom/server'
import { renderHook, waitFor } from '@testing-library/react'
import {
  DiarioFonteContext, fonteDiarioDoLink, fonteDiarioLogado, useDiarioFonte, ehLimiteDeUsoDoLink, type DiarioFonte,
} from '../services/celular/diarioFonte'
import { MENSAGEM_LINK_RECUSADO } from '../services/celular/tarefasFonte'
import { useDiaryMediaUrls } from '../hooks/useDiaryMediaUrls'
import { useDiaryLinkedPlanning } from '../hooks/useDiaryLinkedPlanning'
import type { DiaryEntry } from '../types'
import type { ProjectSchedule } from '../types/project'

const ok = (data: unknown) => ({ data, error: null })
const PROJ = '22222222-2222-2222-2222-222222222222'

const entrada = (extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: 'e1', date: '2026-11-12', weather: 'Sol', description: 'Concretagem', images: [], ...extra,
})

const cronograma = (itens: { id: string; manualRealPct?: number }[]): ProjectSchedule => ({
  startDate: '2026-01-01', duration: 10, periods: [], distributions: [], itemSchedules: itens,
} as unknown as ProjectSchedule)

/** Resposta de erro da Edge como o supabase-js entrega: `context` é a Response. */
const erroDaEdge = (status: number, corpo: unknown) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }),
  }),
})

function zerar() {
  for (const m of [mocks.rpc, mocks.from, mocks.invoke, mocks.upload, mocks.uploadToSignedUrl,
    mocks.createSignedUrls, mocks.remove, mocks.loadProject, mocks.saveProject, mocks.listEmployees]) m.mockReset()
  mocks.storageFrom.mockClear()
  mocks.comprimirFoto.mockReset()
  mocks.comprimirFoto.mockImplementation(async (f: File) => f)
}

/** Nada do caminho logado/direto foi tocado. */
function esperarSoCaminhoDoLink() {
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.createSignedUrls).not.toHaveBeenCalled()
  expect(mocks.remove).not.toHaveBeenCalled()
  expect(mocks.loadProject).not.toHaveBeenCalled()
  expect(mocks.saveProject).not.toHaveBeenCalled()
  expect(mocks.listEmployees).not.toHaveBeenCalled()
}

describe('fonteDiarioDoLink · RPCs', () => {
  beforeEach(zerar)

  it('modo e podeAprovarNoLink vêm das opções', () => {
    expect(fonteDiarioDoLink('tk', { podeAprovar: true }).modo).toBe('link')
    expect(fonteDiarioDoLink('tk', { podeAprovar: true }).podeAprovarNoLink).toBe(true)
    expect(fonteDiarioDoLink('tk', { podeAprovar: false }).podeAprovarNoLink).toBe(false)
  })

  it('salvarRegistro → celular_diario_salvar com token, projeto e o registro', async () => {
    const e = entrada()
    mocks.rpc.mockResolvedValue(ok({ entries: [e], anterior: null }))
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).salvarRegistro('p', e)
    expect(mocks.rpc).toHaveBeenCalledWith('celular_diario_salvar', { p_token: 'tk', p_project_id: 'p', p_entry: e })
    expect(r).toEqual({ entries: [e], anterior: null })
  })

  it('excluirRegistro → celular_diario_excluir; resposta vazia vira lista vazia', async () => {
    mocks.rpc.mockResolvedValue(ok(null))
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).excluirRegistro('p', 'e1')
    expect(mocks.rpc).toHaveBeenCalledWith('celular_diario_excluir', { p_token: 'tk', p_project_id: 'p', p_entry_id: 'e1' })
    expect(r).toEqual({ entries: [], anterior: null })
  })

  it('listarProjetos, carregarDiario e listarColaboradores (org recebida é ignorada)', async () => {
    const projetos = [{ id: 'd1', name: 'Diário 1', settings: { classification: 'DIARIO' } }]
    const diario = { id: 'd1', name: 'Diário 1', organization_id: 'o1', settings: { diaryEntries: [] } }
    const efetivo = [{ id: 'c1', name: 'Ana', role: 'Pedreira', status: 'ATIVO' }]
    mocks.rpc
      .mockResolvedValueOnce(ok(projetos))
      .mockResolvedValueOnce(ok(diario))
      .mockResolvedValueOnce(ok(efetivo))
    const f = fonteDiarioDoLink('tk', { podeAprovar: false })
    expect(await f.listarProjetos()).toEqual(projetos)
    expect(await f.carregarDiario('d1')).toEqual(diario)
    expect(await f.listarColaboradores('org-da-sessao')).toEqual(efetivo)
    expect(mocks.rpc.mock.calls).toEqual([
      ['celular_diarios_listar', { p_token: 'tk' }],
      ['celular_diario_abrir',   { p_token: 'tk', p_project_id: 'd1' }],
      ['celular_efetivo_listar', { p_token: 'tk' }],
    ])
  })

  it('carregarPlanejamento → celular_planejamento_ler; nulos viram cronograma nulo e orçamento vazio', async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ schedule: cronograma([{ id: 'i1' }]), budget: [{ id: 'i1', quantity: 2 }] }))
    mocks.rpc.mockResolvedValueOnce(ok({ schedule: null, budget: null }))
    const f = fonteDiarioDoLink('tk', { podeAprovar: false })
    const r = await f.carregarPlanejamento('d1', 'pl1')
    expect(mocks.rpc).toHaveBeenCalledWith('celular_planejamento_ler', { p_token: 'tk', p_diario_id: 'd1', p_planejamento_id: 'pl1' })
    expect(r.schedule?.itemSchedules).toEqual([{ id: 'i1' }])
    expect(r.budget).toEqual([{ id: 'i1', quantity: 2 }])
    expect(await f.carregarPlanejamento('d1', 'pl1')).toEqual({ schedule: null, budget: [] })
  })

  it('gravarEvolucao sem mudança: nenhuma gravação, devolve null', async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ schedule: cronograma([{ id: 'i1', manualRealPct: 40 }]), budget: [] }))
    const entries = [entrada({ activities: [{ itemId: 'i1', evolution: 40 } as never] })]
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).gravarEvolucao('d1', 'pl1', entries)
    expect(r).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toBe('celular_planejamento_ler')
  })

  it('gravarEvolucao sem cronograma: nenhuma gravação, devolve null', async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ schedule: null, budget: [] }))
    const entries = [entrada({ activities: [{ itemId: 'i1', evolution: 40 } as never] })]
    expect(await fonteDiarioDoLink('tk', { podeAprovar: false }).gravarEvolucao('d1', 'pl1', entries)).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('gravarEvolucao com mudança: p_evolucao só com os itens mudados e devolve o cronograma gravado', async () => {
    mocks.rpc.mockResolvedValueOnce(ok({
      schedule: cronograma([{ id: 'i1', manualRealPct: 40 }, { id: 'i2', manualRealPct: 10 }, { id: 'i3', manualRealPct: 0 }]),
      budget: [],
    }))
    const gravado = cronograma([{ id: 'i1', manualRealPct: 40 }, { id: 'i2', manualRealPct: 70 }])
    mocks.rpc.mockResolvedValueOnce(ok(gravado))
    const entries = [
      entrada({ activities: [{ itemId: 'i1', evolution: 40 } as never, { itemId: 'i2', evolution: 70 } as never] }),
      entrada({ id: 'e2', activities: [{ itemId: 'novo', evolution: 15 } as never] }),
    ]
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).gravarEvolucao('d1', 'pl1', entries)
    expect(mocks.rpc).toHaveBeenLastCalledWith('celular_planejamento_gravar_evolucao', {
      p_token: 'tk', p_diario_id: 'd1', p_planejamento_id: 'pl1', p_evolucao: { i2: 70, novo: 15 },
    })
    expect(r).toBe(gravado)
    esperarSoCaminhoDoLink()
  })
})

describe('fonteDiarioDoLink · mídia pela Edge', () => {
  beforeEach(zerar)

  it('subirFoto: comprime, pede o upload assinado à Edge e sobe pelo uploadToSignedUrl', async () => {
    mocks.invoke.mockResolvedValue(ok({ path: `o1/${PROJ}/u.jpg`, token: 'up-tk' }))
    mocks.uploadToSignedUrl.mockResolvedValue(ok({ path: `o1/${PROJ}/u.jpg` }))
    const foto = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const path = await fonteDiarioDoLink('tk', { podeAprovar: false }).subirFoto({ orgId: 'org-da-sessao', projectId: PROJ, file: foto })
    expect(mocks.comprimirFoto).toHaveBeenCalledWith(foto)
    expect(mocks.invoke).toHaveBeenCalledWith('celular-diario-midia', {
      body: { acao: 'subir', token: 'tk', project_id: PROJ, ext: 'jpg' },
    })
    expect(mocks.storageFrom).toHaveBeenCalledWith('diario-midia')
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith(`o1/${PROJ}/u.jpg`, 'up-tk', foto, { contentType: 'image/jpeg' })
    expect(path).toBe(`o1/${PROJ}/u.jpg`)
    esperarSoCaminhoDoLink()
  })

  it('subirFoto: a extensão é a do arquivo JÁ comprimido (HEIC → JPEG)', async () => {
    const jpeg = new File(['y'], 'foto.jpg', { type: 'image/jpeg' })
    mocks.comprimirFoto.mockResolvedValue(jpeg)
    mocks.invoke.mockResolvedValue(ok({ path: 'o1/p/u.jpg', token: 'up-tk' }))
    mocks.uploadToSignedUrl.mockResolvedValue(ok({}))
    await fonteDiarioDoLink('tk', { podeAprovar: false })
      .subirFoto({ orgId: 'o', projectId: PROJ, file: new File(['x'], 'foto.heic', { type: 'image/heic' }) })
    expect(mocks.invoke.mock.calls[0][1].body.ext).toBe('jpg')
    expect(mocks.uploadToSignedUrl.mock.calls[0][2]).toBe(jpeg)
  })

  it('subirFoto: formato que a Edge não aceita é recusado ANTES de chamá-la', async () => {
    const pdf = new File(['%PDF'], 'laudo.pdf', { type: 'application/pdf' })
    await expect(fonteDiarioDoLink('tk', { podeAprovar: false }).subirFoto({ orgId: 'o', projectId: PROJ, file: pdf }))
      .rejects.toThrow('Formato de arquivo não aceito pelo link do celular — envie uma foto (JPG, PNG, WEBP, GIF ou HEIC).')
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('subirFoto: erro do upload assinado é lançado', async () => {
    mocks.invoke.mockResolvedValue(ok({ path: 'o1/p/u.jpg', token: 'up-tk' }))
    const erro = { message: 'falhou o envio' }
    mocks.uploadToSignedUrl.mockResolvedValue({ data: null, error: erro })
    await expect(fonteDiarioDoLink('tk', { podeAprovar: false })
      .subirFoto({ orgId: 'o', projectId: PROJ, file: new File(['x'], 'a.png', { type: 'image/png' }) }))
      .rejects.toEqual(erro)
  })

  it('assinarFotos: só path vai à Edge; o mapa volta como a Edge devolveu', async () => {
    mocks.invoke.mockResolvedValue(ok({ urls: { 'o/p/a.jpg': 'https://assinada/a' } }))
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).assinarFotos(['data:x', 'o/p/a.jpg'])
    expect(mocks.invoke).toHaveBeenCalledWith('celular-diario-midia', {
      body: { acao: 'assinar', token: 'tk', paths: ['o/p/a.jpg'] },
    })
    expect(r).toEqual({ 'o/p/a.jpg': 'https://assinada/a' })
    esperarSoCaminhoDoLink()
  })

  it('assinarFotos: sem path nenhum → {} sem chamar a Edge', async () => {
    expect(await fonteDiarioDoLink('tk', { podeAprovar: false }).assinarFotos(['data:x', 'https://y', ''])).toEqual({})
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('assinarFotos: mais de 100 paths vão em lotes de 100 (limite da Edge)', async () => {
    const paths = Array.from({ length: 230 }, (_, i) => `o/p/${i}.jpg`)
    mocks.invoke.mockImplementation(async (_fn: string, { body }: { body: { paths: string[] } }) =>
      ok({ urls: Object.fromEntries(body.paths.map(p => [p, `u:${p}`])) }))
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).assinarFotos(paths)
    expect(mocks.invoke.mock.calls.map(c => c[1].body.paths.length)).toEqual([100, 100, 30])
    expect(Object.keys(r)).toHaveLength(230)
  })

  it('removerFotos → Edge remover só com paths; falha vira console.warn, não erro', async () => {
    mocks.invoke.mockResolvedValueOnce(ok({ removidos: ['o/p/a.jpg'] }))
    const f = fonteDiarioDoLink('tk', { podeAprovar: false })
    await f.removerFotos(PROJ, ['data:x', 'o/p/a.jpg'])
    expect(mocks.invoke).toHaveBeenCalledWith('celular-diario-midia', {
      body: { acao: 'remover', token: 'tk', project_id: PROJ, paths: ['o/p/a.jpg'] },
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.invoke.mockResolvedValueOnce(erroDaEdge(500, { error: 'Erro ao remover os arquivos' }))
    await expect(f.removerFotos(PROJ, ['o/p/b.jpg'])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()

    mocks.invoke.mockClear()
    await f.removerFotos(PROJ, ['data:x'])
    expect(mocks.invoke).not.toHaveBeenCalled()
    esperarSoCaminhoDoLink()
  })

  it('assinarFotos: path acima de 300 caracteres fica fora (derrubaria o lote na Edge)', async () => {
    mocks.invoke.mockResolvedValue(ok({ urls: { 'o/p/a.jpg': 'https://assinada/a' } }))
    const r = await fonteDiarioDoLink('tk', { podeAprovar: false }).assinarFotos(['x'.repeat(301), 'o/p/a.jpg'])
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke.mock.calls[0][1].body.paths).toEqual(['o/p/a.jpg'])
    expect(r).toEqual({ 'o/p/a.jpg': 'https://assinada/a' })
  })

  it('removerFotos: 230 paths → 3 pedidos (100/100/30), disparados juntos', async () => {
    const paths = Array.from({ length: 230 }, (_, i) => `o/p/${i}.jpg`)
    const soltar: (() => void)[] = []
    mocks.invoke.mockImplementation(() => new Promise(res => { soltar.push(() => res(ok({ removidos: [] }))) }))
    const pronto = fonteDiarioDoLink('tk', { podeAprovar: false }).removerFotos(PROJ, paths)
    // Em paralelo: os 3 lotes já saíram antes de qualquer resposta chegar.
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3))
    expect(mocks.invoke.mock.calls.map(c => c[1].body.paths.length)).toEqual([100, 100, 30])
    expect(new Set(mocks.invoke.mock.calls.flatMap(c => c[1].body.paths)).size).toBe(230)
    soltar.forEach(f => f())
    await expect(pronto).resolves.toBeUndefined()
  })

  it('removerFotos: recusa do token em dois lotes → aoRecusar uma vez só; nada é lançado', async () => {
    const aoRecusar = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paths = Array.from({ length: 230 }, (_, i) => `o/p/${i}.jpg`)
    mocks.invoke
      .mockResolvedValueOnce(erroDaEdge(403, { error: MENSAGEM_LINK_RECUSADO }))
      .mockResolvedValueOnce(ok({ removidos: [] }))
      .mockResolvedValueOnce(erroDaEdge(403, { error: MENSAGEM_LINK_RECUSADO }))
    await expect(fonteDiarioDoLink('tk', { aoRecusar, podeAprovar: false }).removerFotos(PROJ, paths)).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledTimes(3)
    expect(aoRecusar).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('erro 400 da Edge vira Error com a mensagem do corpo', async () => {
    mocks.invoke.mockResolvedValue(erroDaEdge(400, { error: 'paths deve ter de 1 a 100 caminhos' }))
    await expect(fonteDiarioDoLink('tk', { podeAprovar: false }).assinarFotos(['o/p/a.jpg']))
      .rejects.toThrow('paths deve ter de 1 a 100 caminhos')
  })
})

describe('fonteDiarioDoLink · recusa do token', () => {
  beforeEach(zerar)

  it('RPC: 42501 "link inválido ou vencido" → aoRecusar e throw; outro 42501 → só throw', async () => {
    const aoRecusar = vi.fn()
    const f = fonteDiarioDoLink('tk', { aoRecusar, podeAprovar: false })
    const recusa = { code: '42501', message: MENSAGEM_LINK_RECUSADO }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: recusa })
    await expect(f.salvarRegistro('p', entrada())).rejects.toEqual(recusa)
    expect(aoRecusar).toHaveBeenCalledTimes(1)

    const aprovacao = { code: '42501', message: 'Só quem aprova o diário pode marcar o registro como Aprovado.' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: aprovacao })
    await expect(f.salvarRegistro('p', entrada({ status: 'Aprovado' }))).rejects.toEqual(aprovacao)
    expect(aoRecusar).toHaveBeenCalledTimes(1)
  })

  it('Edge: 403 com a mensagem da recusa → aoRecusar e throw com code 42501; outro 403 → só throw', async () => {
    const aoRecusar = vi.fn()
    const f = fonteDiarioDoLink('tk', { aoRecusar, podeAprovar: false })
    mocks.invoke.mockResolvedValueOnce(erroDaEdge(403, { error: MENSAGEM_LINK_RECUSADO }))
    await expect(f.assinarFotos(['o/p/a.jpg'])).rejects.toMatchObject({ code: '42501', message: MENSAGEM_LINK_RECUSADO })
    expect(aoRecusar).toHaveBeenCalledTimes(1)

    mocks.invoke.mockResolvedValueOnce(erroDaEdge(403, { error: 'projeto fora da organização do link' }))
    await expect(f.subirFoto({ orgId: 'o', projectId: PROJ, file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) }))
      .rejects.toMatchObject({ code: '42501', message: 'projeto fora da organização do link' })
    expect(aoRecusar).toHaveBeenCalledTimes(1)

    // A remoção engole o erro (best-effort), mas a recusa do token ainda avisa.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.invoke.mockResolvedValueOnce(erroDaEdge(403, { error: MENSAGEM_LINK_RECUSADO }))
    await f.removerFotos(PROJ, ['o/p/a.jpg'])
    expect(aoRecusar).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('Edge: 429 (limite de uso do link) → erro com a mensagem da Edge e code 54000; NÃO é recusa do link', async () => {
    const LIMITE = 'limite de uso do link atingido — tente de novo em alguns minutos'
    const aoRecusar = vi.fn()
    const f = fonteDiarioDoLink('tk', { aoRecusar, podeAprovar: false })
    mocks.invoke.mockResolvedValueOnce(erroDaEdge(429, { error: LIMITE }))
    const falha = await f.subirFoto({ orgId: 'o', projectId: PROJ, file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) })
      .catch((e: unknown) => e)
    expect(falha).toBeInstanceOf(Error)
    expect(falha).toMatchObject({ message: LIMITE, status: 429, code: '54000' })
    expect(ehLimiteDeUsoDoLink(falha)).toBe(true)
    expect(mocks.uploadToSignedUrl).not.toHaveBeenCalled()

    mocks.invoke.mockResolvedValueOnce(erroDaEdge(429, { error: LIMITE }))
    await expect(f.assinarFotos(['o/p/a.jpg'])).rejects.toMatchObject({ message: LIMITE, code: '54000' })
    expect(aoRecusar).not.toHaveBeenCalled()
  })

  it('ehLimiteDeUsoDoLink: só o 429/54000', () => {
    expect(ehLimiteDeUsoDoLink({ status: 429 })).toBe(true)
    expect(ehLimiteDeUsoDoLink({ code: '54000' })).toBe(true)
    expect(ehLimiteDeUsoDoLink({ status: 403, code: '42501' })).toBe(false)
    expect(ehLimiteDeUsoDoLink(new Error('qualquer'))).toBe(false)
    expect(ehLimiteDeUsoDoLink(null)).toBe(false)
  })
})

describe('fonteDiarioLogado · os serviços de hoje', () => {
  beforeEach(zerar)

  it('modo logado, sem decisão de aprovação própria', () => {
    expect(fonteDiarioLogado.modo).toBe('logado')
    expect(fonteDiarioLogado.podeAprovarNoLink).toBeNull()
  })

  it('salvar/excluir pelas RPCs diary_* de sempre', async () => {
    mocks.rpc.mockResolvedValue(ok({ entries: [], anterior: null }))
    const e = entrada()
    await fonteDiarioLogado.salvarRegistro('p', e)
    await fonteDiarioLogado.excluirRegistro('p', 'e1')
    expect(mocks.rpc.mock.calls).toEqual([
      ['diary_upsert_entry', { p_project_id: 'p', p_entry: e }],
      ['diary_delete_entry', { p_project_id: 'p', p_entry_id: 'e1' }],
    ])
  })

  it('carregarDiario = projectService.loadProject; projeto inexistente é erro', async () => {
    mocks.loadProject.mockResolvedValueOnce({ id: 'd1', name: 'D', settings: {} })
    expect(await fonteDiarioLogado.carregarDiario('d1')).toEqual({ id: 'd1', name: 'D', settings: {} })
    mocks.loadProject.mockResolvedValueOnce(null)
    await expect(fonteDiarioLogado.carregarDiario('x')).rejects.toThrow()
  })

  it('listarColaboradores = laborService.listEmployees(org) reduzido a id/nome/função/status', async () => {
    mocks.listEmployees.mockResolvedValue([{ id: 'c1', name: 'Ana', role: 'Pedreira', status: 'ATIVO', cpf: '1' }])
    expect(await fonteDiarioLogado.listarColaboradores('o1')).toEqual([{ id: 'c1', name: 'Ana', role: 'Pedreira', status: 'ATIVO' }])
    expect(mocks.listEmployees).toHaveBeenCalledWith('o1')
  })

  it('carregarPlanejamento: orçamento do próprio planejamento, senão do projeto pai', async () => {
    const sched = cronograma([{ id: 'i1' }])
    mocks.loadProject
      .mockResolvedValueOnce({ id: 'pl1', settings: { schedule: sched, linkedProjectId: 'orc1' }, budget: [] })
      .mockResolvedValueOnce({ id: 'orc1', settings: {}, budget: [{ id: 'i1' }] })
    const r = await fonteDiarioLogado.carregarPlanejamento('d1', 'pl1')
    expect(mocks.loadProject.mock.calls).toEqual([['pl1'], ['orc1']])
    expect(r).toEqual({ schedule: sched, budget: [{ id: 'i1' }] })
  })

  it('subirFoto/assinarFotos/removerFotos pelo storage direto (sessão logada)', async () => {
    mocks.upload.mockResolvedValue(ok({}))
    const path = await fonteDiarioLogado.subirFoto({ orgId: 'o1', projectId: 'p1', file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) })
    expect(path).toMatch(/^o1\/p1\/.+\.jpg$/)
    expect(mocks.upload).toHaveBeenCalled()

    mocks.createSignedUrls.mockResolvedValue(ok([{ path: 'o/p/a.jpg', signedUrl: 'https://s', error: null }]))
    expect(await fonteDiarioLogado.assinarFotos(['o/p/a.jpg'])).toEqual({ 'o/p/a.jpg': 'https://s' })

    mocks.remove.mockResolvedValue(ok([]))
    await fonteDiarioLogado.removerFotos('p1', ['o/p/a.jpg'])
    expect(mocks.remove).toHaveBeenCalledWith(['o/p/a.jpg'])
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('useDiarioFonte: padrão é a logada; o Provider troca pela do link', () => {
    const lidas: DiarioFonte[] = []
    const Sonda = () => { lidas.push(useDiarioFonte()); return null }
    renderToString(React.createElement(Sonda))
    const doLink = fonteDiarioDoLink('tk', { podeAprovar: true })
    renderToString(React.createElement(DiarioFonteContext.Provider, { value: doLink }, React.createElement(Sonda)))
    expect(lidas[0]).toBe(fonteDiarioLogado)
    expect(lidas[1]).toBe(doLink)
  })
})

describe('hooks com carregador/assinador da fonte', () => {
  beforeEach(zerar)

  it('useDiaryMediaUrls com `assinar` usa-o e não assina pelo storage', async () => {
    const assinar = vi.fn(async (paths: readonly string[]) => Object.fromEntries(paths.map(p => [p, `u:${p}`])))
    const refs = ['o/p/a.jpg']
    const { result } = renderHook(() => useDiaryMediaUrls(refs, undefined, assinar))
    await waitFor(() => expect(result.current['o/p/a.jpg']).toBe('u:o/p/a.jpg'))
    expect(assinar).toHaveBeenCalledWith(['o/p/a.jpg'])
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('useDiaryMediaUrls sem `assinar`: signDiaryMediaUrls como hoje (storage direto)', async () => {
    mocks.createSignedUrls.mockResolvedValue(ok([{ path: 'o/p/a.jpg', signedUrl: 'https://s', error: null }]))
    const refs = ['o/p/a.jpg', 'data:x']
    const { result } = renderHook(() => useDiaryMediaUrls(refs))
    await waitFor(() => expect(result.current['o/p/a.jpg']).toBe('https://s'))
    expect(result.current['data:x']).toBe('data:x')
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(['o/p/a.jpg'], 3600)
  })

  it('useDiaryMediaUrls: `assinar` estável não reassina a cada render', async () => {
    const assinar = vi.fn(async (paths: readonly string[]) => Object.fromEntries(paths.map(p => [p, `u:${p}`])))
    const { result, rerender } = renderHook(({ refs }) => useDiaryMediaUrls(refs, undefined, assinar), {
      initialProps: { refs: ['o/p/a.jpg'] },
    })
    await waitFor(() => expect(result.current['o/p/a.jpg']).toBe('u:o/p/a.jpg'))
    rerender({ refs: ['o/p/a.jpg'] })
    rerender({ refs: ['o/p/a.jpg'] })
    await waitFor(() => expect(result.current['o/p/a.jpg']).toBe('u:o/p/a.jpg'))
    expect(assinar).toHaveBeenCalledTimes(1)
  })

  it('useDiaryLinkedPlanning com `carregar`: usa-o no lugar das loadProject', async () => {
    const sched = cronograma([{ id: 'i1', manualRealPct: 30 }])
    const carregar = vi.fn(async () => ({ schedule: sched, budget: [{ id: 'i1', quantity: 5, sinapiItem: { description: 'Alvenaria' } }] as never[] }))
    const projects = [{ id: 'pl1', settings: { classification: 'PLANEJAMENTO' } }]
    const { result } = renderHook(() => useDiaryLinkedPlanning('pl1', projects, carregar))
    await waitFor(() => expect(result.current.schedule).toBe(sched))
    expect(carregar).toHaveBeenCalledWith('pl1')
    expect(carregar).toHaveBeenCalledTimes(1)
    expect(result.current.itens).toHaveLength(1)
    expect(mocks.loadProject).not.toHaveBeenCalled()
  })

  it('useDiaryLinkedPlanning sem `carregar`: as duas loadProject de hoje (orçamento do pai)', async () => {
    const sched = cronograma([{ id: 'i1' }])
    mocks.loadProject
      .mockResolvedValueOnce({ id: 'pl1', settings: { schedule: sched, linkedProjectId: 'orc1' }, budget: [] })
      .mockResolvedValueOnce({ id: 'orc1', settings: {}, budget: [{ id: 'i1', sinapiItem: { description: 'X' } }] })
    const projects = [{ id: 'pl1', settings: { classification: 'PLANEJAMENTO' } }]
    const { result } = renderHook(() => useDiaryLinkedPlanning('pl1', projects))
    await waitFor(() => expect(result.current.budget).toHaveLength(1))
    expect(result.current.schedule).toBe(sched)
    expect(mocks.loadProject.mock.calls).toEqual([['pl1'], ['orc1']])
  })

  it('carregador padrão: falha no orçamento do pai não esconde o cronograma (orçamento vazio)', async () => {
    const sched = cronograma([{ id: 'i1' }])
    mocks.loadProject
      .mockResolvedValueOnce({ id: 'pl1', settings: { schedule: sched, linkedProjectId: 'orc1' }, budget: [] })
      .mockRejectedValueOnce(new Error('rede caiu'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await fonteDiarioLogado.carregarPlanejamento('d1', 'pl1')
    expect(r).toEqual({ schedule: sched, budget: [] })
    expect(erro).toHaveBeenCalled()

    mocks.loadProject
      .mockResolvedValueOnce({ id: 'pl1', settings: { schedule: sched, linkedProjectId: 'orc1' }, budget: [] })
      .mockRejectedValueOnce(new Error('rede caiu'))
    const projects = [{ id: 'pl1', settings: { classification: 'PLANEJAMENTO' } }]
    const { result } = renderHook(() => useDiaryLinkedPlanning('pl1', projects))
    await waitFor(() => expect(result.current.schedule).toBe(sched))
    expect(result.current.budget).toEqual([])
    erro.mockRestore()
  })
})
