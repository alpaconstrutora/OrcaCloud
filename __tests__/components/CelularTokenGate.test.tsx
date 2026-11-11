// @vitest-environment jsdom
/**
 * Entrada do link do celular (`/celular?token=`) — `CelularTokenGate`.
 *
 *  - endereço sem token utilizável: o texto exato de recusa, sem nenhuma RPC;
 *  - link revogado/vencido COM A TELA ABERTA: a recusa do token em qualquer RPC da fonte
 *    (ou ao voltar a aba para a frente) desmonta Minhas Tarefas e mostra a recusa;
 *    outro 42501 (recusa de UMA ação) e falha de rede não derrubam a tela;
 *  - a fonte é estável entre renders (R8: ela está nas deps de efeito de TasksMobileApp);
 *  - com uma aba só ("Tarefas") não há barra de seções.
 */
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sondas = vi.hoisted(() => ({
  rpc: vi.fn(),
  fontes: [] as unknown[],
  listar: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: sondas.rpc } }))

// Minhas Tarefas de verdade é grande; aqui basta quem lê a fonte do contexto e a usa ao montar.
vi.mock('../../components/TasksMobileApp', async () => {
  const R = await import('react')
  const { useTarefasFonte } = await import('../../services/celular/tarefasFonte')
  const Sonda: React.FC<{ orgId?: string }> = ({ orgId }) => {
    const fonte = useTarefasFonte()
    sondas.fontes.push(fonte)
    R.useEffect(() => {
      sondas.listar()
      fonte.listarTarefas(orgId, null, 300).catch(() => { /* a tela real mostra o erro */ })
    }, [fonte, orgId])
    return R.createElement('div', { 'data-testid': 'tela-de-tarefas' }, `tarefas de ${orgId}`)
  }
  return { default: Sonda }
})

import CelularTokenGate, { TEXTO_LINK_INVALIDO } from '../../components/celular/CelularTokenGate'

const TOKEN = 'abcDEF_123-xyzxyzxyzxyzxyzxyzxyzxyzxyzxyz'
const SESSAO = { user_id: 'u1', nome: 'Ana Souza', org_id: 'o1', org_nome: 'Alpa' }
const RECUSA = { code: '42501', message: 'link inválido ou vencido' }
const ok = (data: unknown) => Promise.resolve({ data, error: null })
const falha = (error: unknown) => Promise.resolve({ data: null, error })

/** Respostas por RPC; `celular_tarefas_listar` padrão = lista vazia. */
function responder(por: Record<string, () => Promise<unknown>>) {
  sondas.rpc.mockImplementation((nome: string) =>
    (por[nome] ?? (() => ok({ tarefas: [], nomes_obras: {} })))())
}

const voltarAbaParaFrente = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  sondas.rpc.mockReset()
  sondas.listar.mockReset()
  sondas.fontes.length = 0
})

describe('CelularTokenGate', () => {
  it('token vazio: texto exato de recusa e nenhuma RPC', () => {
    render(<CelularTokenGate token="" />)
    expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_LINK_INVALIDO)
    expect(TEXTO_LINK_INVALIDO).toBe('Link inválido ou vencido — peça um novo ao administrador')
    expect(sondas.rpc).not.toHaveBeenCalled()
    expect(screen.queryByTestId('tela-de-tarefas')).toBeNull()
  })

  it('token recusado já na abertura: mostra a recusa', async () => {
    responder({ celular_sessao: () => falha(RECUSA) })
    render(<CelularTokenGate token={TOKEN} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_LINK_INVALIDO))
    expect(screen.queryByTestId('tela-de-tarefas')).toBeNull()
  })

  it('sessão válida: abre Minhas Tarefas com nome e organização; sem barra de seções com uma aba só', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    render(<CelularTokenGate token={TOKEN} />)
    expect(await screen.findByTestId('tela-de-tarefas')).toHaveTextContent('tarefas de o1')
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Seções' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tarefas' })).toBeNull()
  })

  it('a fonte é a mesma entre renders (não recarrega em laço)', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    const { rerender } = render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    rerender(<CelularTokenGate token={TOKEN} />)
    rerender(<CelularTokenGate token={TOKEN} />)
    expect(sondas.fontes.length).toBeGreaterThanOrEqual(3)
    expect(new Set(sondas.fontes).size).toBe(1)
    expect(sondas.listar).toHaveBeenCalledTimes(1)
  })

  it('link revogado com a tela aberta: a recusa numa RPC da fonte desmonta as tarefas', async () => {
    responder({ celular_sessao: () => ok(SESSAO), celular_tarefas_listar: () => falha(RECUSA) })
    render(<CelularTokenGate token={TOKEN} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_LINK_INVALIDO))
    expect(screen.queryByTestId('tela-de-tarefas')).toBeNull()
    expect(screen.queryByText('Ana Souza')).toBeNull()
  })

  it('outro 42501 (recusa de uma ação) NÃO derruba a tela', async () => {
    responder({
      celular_sessao: () => ok(SESSAO),
      celular_tarefas_listar: () => falha({ code: '42501', message: 'sem acesso a este espaço' }),
    })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    await waitFor(() => expect(sondas.rpc).toHaveBeenCalledWith('celular_tarefas_listar', expect.anything()))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('tela-de-tarefas')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('aba volta para a frente: reconfere a sessão e, se recusada, sai da tela', async () => {
    let recusar = false
    responder({ celular_sessao: () => (recusar ? falha(RECUSA) : ok(SESSAO)) })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')

    recusar = true
    act(() => voltarAbaParaFrente())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_LINK_INVALIDO))
    expect(screen.queryByTestId('tela-de-tarefas')).toBeNull()
    expect(sondas.rpc.mock.calls.filter(([nome]) => nome === 'celular_sessao')).toHaveLength(2)
  })

  it('aba volta para a frente sem rede: continua na tela', async () => {
    let semRede = false
    responder({
      celular_sessao: () => (semRede ? falha({ message: 'Failed to fetch' }) : ok(SESSAO)),
    })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')

    semRede = true
    act(() => voltarAbaParaFrente())
    await waitFor(() =>
      expect(sondas.rpc.mock.calls.filter(([nome]) => nome === 'celular_sessao')).toHaveLength(2))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('tela-de-tarefas')).toBeInTheDocument()
  })
})
