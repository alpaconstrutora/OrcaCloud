// @vitest-environment jsdom
/**
 * Entrada do link do celular (`/celular?token=`) — `CelularTokenGate`.
 *
 *  - endereço sem token utilizável: o texto exato de recusa, sem nenhuma RPC;
 *  - link revogado/vencido COM A TELA ABERTA: a recusa do token em qualquer RPC da fonte
 *    (ou ao voltar a aba para a frente) desmonta Minhas Tarefas e mostra a recusa;
 *    outro 42501 (recusa de UMA ação) e falha de rede não derrubam a tela;
 *  - a fonte é estável entre renders (R8: ela está nas deps de efeito de TasksMobileApp);
 *  - o seletor de seções (pílula, role=tablist) fica no TOPO, antes do conteúdo, e NÃO há
 *    barra de seções embaixo; tem "Tarefas" e "Diário"; tocar "Diário" monta DiarioDoLink com a
 *    fonte do link (estável entre renders), e a recusa do token numa RPC do Diário leva
 *    ao mesmo texto de recusa das Tarefas;
 *  - cabeçalho sem nome: só a organização, sem o "·" solto.
 */
import React from 'react'
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sondas = vi.hoisted(() => ({
  rpc: vi.fn(),
  fontes: [] as unknown[],
  fontesDiario: [] as unknown[],
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

// O Diário de verdade é enorme; aqui basta quem recebe a fonte do link e a usa ao montar.
vi.mock('../../components/celular/DiarioDoLink', async () => {
  const R = await import('react')
  const Sonda: React.FC<{ fonte: { modo: string; podeAprovarNoLink: boolean | null; listarProjetos: () => Promise<unknown> } }> = ({ fonte }) => {
    sondas.fontesDiario.push(fonte)
    R.useEffect(() => { fonte.listarProjetos().catch(() => { /* a tela real mostra o erro */ }) }, [fonte])
    return R.createElement('div', { 'data-testid': 'tela-do-diario' }, `diário ${fonte.modo} aprova=${String(fonte.podeAprovarNoLink)}`)
  }
  return { default: Sonda }
})

import CelularTokenGate, { TEXTO_LINK_INVALIDO } from '../../components/celular/CelularTokenGate'
import type { SessaoCelular } from '../../services/celular/celularLinkService'

const TOKEN = 'abcDEF_123-xyzxyzxyzxyzxyzxyzxyzxyzxyzxyz'
const SESSAO: SessaoCelular = { user_id: 'u1', nome: 'Ana Souza', org_id: 'o1', org_nome: 'Alpa', pode_aprovar_diario: false }
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
  sondas.fontesDiario.length = 0
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

  it('sessão válida: abre Minhas Tarefas com nome e organização; o seletor tem Tarefas e Diário', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    render(<CelularTokenGate token={TOKEN} />)
    expect(await screen.findByTestId('tela-de-tarefas')).toHaveTextContent('tarefas de o1')
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    const seletor = screen.getByRole('tablist', { name: 'Seções' })
    expect(within(seletor).getByRole('tab', { name: 'Tarefas' })).toHaveAttribute('aria-selected', 'true')
    expect(within(seletor).getByRole('tab', { name: 'Diário' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByTestId('tela-do-diario')).toBeNull()
  })

  it('o seletor fica no topo (antes do conteúdo) e não há barra de seções embaixo', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    render(<CelularTokenGate token={TOKEN} />)
    const conteudo = await screen.findByTestId('tela-de-tarefas')
    const seletor = screen.getByRole('tablist', { name: 'Seções' })
    // O seletor precede o conteúdo no DOM.
    expect(seletor.compareDocumentPosition(conteudo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Nada de seletor (nem navegação "Seções") DEPOIS do conteúdo.
    expect(screen.queryByRole('navigation', { name: 'Seções' })).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    for (const aba of screen.getAllByRole('tab')) {
      expect(aba.compareDocumentPosition(conteudo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // O seletor está no cabeçalho, junto de nome e organização.
    const cab = seletor.parentElement as HTMLElement
    expect(cab).toHaveTextContent('Ana Souza')
    expect(cab).toHaveTextContent('Alpa')
  })

  it('cabeçalho sem nome: mostra só a organização, sem "·" solto', async () => {
    for (const nome of ['', '   ']) {
      responder({ celular_sessao: () => ok({ ...SESSAO, nome }) })
      const { container, unmount } = render(<CelularTokenGate token={TOKEN} />)
      await screen.findByTestId('tela-de-tarefas')
      const cab = container.querySelector('header') as HTMLElement
      expect(cab.querySelector('p')?.textContent).toBe('Alpa')
      expect(cab.textContent).not.toContain('·')
      unmount()
    }
  })

  it('cabeçalho com nome: "nome · organização"', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    const { container } = render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    expect((container.querySelector('header') as HTMLElement).querySelector('p')?.textContent).toBe('Ana Souza · Alpa')
  })

  it('tocar "Diário" monta o Diário com a fonte do link; voltar a "Tarefas" traz as tarefas', async () => {
    responder({ celular_sessao: () => ok({ ...SESSAO, pode_aprovar_diario: true }) })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    fireEvent.click(screen.getByRole('tab', { name: 'Diário' }))
    expect(await screen.findByTestId('tela-do-diario')).toHaveTextContent('diário link aprova=true')
    expect(screen.queryByTestId('tela-de-tarefas')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Diário' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tarefas' })).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(screen.getByRole('tab', { name: 'Tarefas' }))
    expect(await screen.findByTestId('tela-de-tarefas')).toBeInTheDocument()
    expect(screen.queryByTestId('tela-do-diario')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Tarefas' })).toHaveAttribute('aria-selected', 'true')
  })

  it('sessão com pode_aprovar_diario=false: a fonte do Diário diz que não aprova', async () => {
    responder({ celular_sessao: () => ok(SESSAO) })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    fireEvent.click(screen.getByRole('tab', { name: 'Diário' }))
    expect(await screen.findByTestId('tela-do-diario')).toHaveTextContent('aprova=false')
  })

  it('a fonte do Diário é a mesma entre renders (não recarrega em laço)', async () => {
    responder({ celular_sessao: () => ok(SESSAO), celular_diarios_listar: () => ok([]) })
    const { rerender } = render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    fireEvent.click(screen.getByRole('tab', { name: 'Diário' }))
    await screen.findByTestId('tela-do-diario')
    rerender(<CelularTokenGate token={TOKEN} />)
    rerender(<CelularTokenGate token={TOKEN} />)
    expect(sondas.fontesDiario.length).toBeGreaterThanOrEqual(3)
    expect(new Set(sondas.fontesDiario).size).toBe(1)
    expect(sondas.rpc.mock.calls.filter(([nome]) => nome === 'celular_diarios_listar')).toHaveLength(1)
  })

  it('link revogado com o Diário aberto: a recusa numa RPC do Diário desmonta a tela e mostra a recusa', async () => {
    responder({ celular_sessao: () => ok(SESSAO), celular_diarios_listar: () => falha(RECUSA) })
    render(<CelularTokenGate token={TOKEN} />)
    await screen.findByTestId('tela-de-tarefas')
    fireEvent.click(screen.getByRole('tab', { name: 'Diário' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_LINK_INVALIDO))
    expect(screen.queryByTestId('tela-do-diario')).toBeNull()
    expect(screen.queryByText('Ana Souza')).toBeNull()
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
