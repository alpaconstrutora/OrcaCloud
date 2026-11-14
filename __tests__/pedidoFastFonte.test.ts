// @vitest-environment jsdom
/**
 * Fonte do Pedido Fast pelo LINK do celular (docs/planos/2026-11-14-pedido-fast.md, Parte 2):
 * o token vai no corpo da Edge, nada de `supabase.from`; a recusa do token (403 com a
 * mensagem do banco) avisa o gate; "sem acesso a Pedidos de Compra" e o limite de uso
 * chegam como erro com a mensagem, SEM derrubar o link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  comprimirFoto: vi.fn(async (f: File) => f),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } },
}))
vi.mock('../utils/comprimirFoto', () => ({ comprimirFoto: mocks.comprimirFoto }))

import { fontePedidoFastDoLink, listarObrasDoLink, ErroPedidoFast } from '../services/pedidoFastService'

const TOKEN = 'tk_' + 'A'.repeat(30)
const LOTE = '3f2a1c4e-9b7d-4e21-8a55-0c1d2e3f4a5b'
const OBRA = '0b0b0b0b-0000-4000-8000-000000000001'

/** O erro que o supabase-js devolve para resposta HTTP não-2xx da Edge. */
function erroHttp(status: number, corpo: unknown) {
  return { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => corpo } }
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.from.mockReset()
  mocks.invoke.mockReset()
})

describe('fontePedidoFastDoLink', () => {
  it('ler e criar mandam o token no corpo e não tocam em supabase.from', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { lote: LOTE, leitura: { itens: [] }, falha: null }, error: null })
    mocks.invoke.mockResolvedValueOnce({ data: { pedidoId: 'p1', numero: 'PC-1' }, error: null })
    const fonte = fontePedidoFastDoLink(TOKEN)
    expect(fonte.modo).toBe('link')

    const foto = new File([new Uint8Array([1, 2, 3])], 'nota.jpg', { type: 'image/jpeg' })
    const lido = await fonte.ler([foto])
    expect(lido.lote).toBe(LOTE)
    const [nome, { body }] = mocks.invoke.mock.calls[0]
    expect(nome).toBe('pedido-fast')
    expect(body).toMatchObject({ acao: 'ler', token: TOKEN })
    expect(body.fotos).toEqual([{ base64: 'AQID', mediaType: 'image/jpeg' }])

    await fonte.criar(LOTE, OBRA)
    expect(mocks.invoke.mock.calls[1][1].body).toEqual({ acao: 'criar', lote: LOTE, projectId: OBRA, token: TOKEN })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('recusa do token (403 "link inválido ou vencido") avisa o gate', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: erroHttp(403, { error: 'link inválido ou vencido' }) })
    const aoRecusar = vi.fn()
    await expect(fontePedidoFastDoLink(TOKEN, { aoRecusar }).criar(LOTE, OBRA)).rejects.toBeInstanceOf(ErroPedidoFast)
    expect(aoRecusar).toHaveBeenCalledTimes(1)
  })

  it('sem acesso a Compras e limite de uso viram erro com a mensagem, sem derrubar o link', async () => {
    const aoRecusar = vi.fn()
    const fonte = fontePedidoFastDoLink(TOKEN, { aoRecusar })
    mocks.invoke.mockResolvedValueOnce({ data: null, error: erroHttp(403, { error: 'sem acesso a Pedidos de Compra' }) })
    await expect(fonte.criar(LOTE, OBRA)).rejects.toThrow('sem acesso a Pedidos de Compra')
    mocks.invoke.mockResolvedValueOnce({ data: null, error: erroHttp(429, { error: 'Limite de uso do link atingido — tente de novo na próxima hora.' }) })
    await expect(fonte.criar(LOTE, OBRA)).rejects.toThrow(/Limite de uso/)
    expect(aoRecusar).not.toHaveBeenCalled()
  })
})

describe('listarObrasDoLink', () => {
  it('chama celular_obras_listar com o token e devolve id + nome', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: OBRA, nome: 'Obra A' }], error: null })
    await expect(listarObrasDoLink(TOKEN)).resolves.toEqual([{ id: OBRA, nome: 'Obra A' }])
    expect(mocks.rpc).toHaveBeenCalledWith('celular_obras_listar', { p_token: TOKEN })
  })

  it('recusa do token avisa o gate; sem acesso não', async () => {
    const aoRecusar = vi.fn()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'link inválido ou vencido' } })
    await expect(listarObrasDoLink(TOKEN, { aoRecusar })).rejects.toThrow()
    expect(aoRecusar).toHaveBeenCalledTimes(1)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sem acesso a Pedidos de Compra' } })
    await expect(listarObrasDoLink(TOKEN, { aoRecusar })).rejects.toThrow('sem acesso a Pedidos de Compra')
    expect(aoRecusar).toHaveBeenCalledTimes(1)
  })
})
