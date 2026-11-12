// @vitest-environment jsdom
/**
 * `DiarioDoLink` — aba Diário do link do celular.
 *
 *  - carrega `fonte.listarProjetos()` UMA vez por fonte (não por render);
 *  - o `projects` entregue ao `DiaryMobileApp` tem a mesma identidade entre renders
 *    (ele está nas deps dos efeitos de carga do diário);
 *  - falha de carga: mensagem + "Tentar de novo".
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sondas = vi.hoisted(() => ({
  projetos: [] as unknown[],
  fontes: [] as unknown[],
}))

vi.mock('../../components/DiaryMobileApp', async () => {
  const R = await import('react')
  const { useDiarioFonte } = await import('../../services/celular/diarioFonte')
  const Sonda: React.FC<{ projects: unknown[] }> = ({ projects }) => {
    sondas.projetos.push(projects)
    sondas.fontes.push(useDiarioFonte())
    return R.createElement('div', { 'data-testid': 'tela-do-diario' }, `${projects.length} diários`)
  }
  return { default: Sonda }
})

import DiarioDoLink from '../../components/celular/DiarioDoLink'
import type { DiarioFonteDoLink } from '../../services/celular/diarioFonte'

const LISTA = [{ id: 'd1', name: 'Obra A', settings: {} }, { id: 'd2', name: 'Obra B', settings: {} }]

function fonteCom(listarProjetos: () => Promise<unknown>): DiarioFonteDoLink {
  return { modo: 'link', podeAprovarNoLink: false, listarProjetos } as unknown as DiarioFonteDoLink
}

beforeEach(() => {
  sondas.projetos.length = 0
  sondas.fontes.length = 0
})

describe('DiarioDoLink', () => {
  it('mostra o carregando, carrega os diários e entrega ao DiaryMobileApp com a fonte do link', async () => {
    const listar = vi.fn(() => Promise.resolve(LISTA))
    const fonte = fonteCom(listar)
    render(<DiarioDoLink fonte={fonte} />)
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo o diário…')
    expect(await screen.findByTestId('tela-do-diario')).toHaveTextContent('2 diários')
    expect(sondas.fontes.every(f => f === fonte)).toBe(true)
  })

  it('carrega UMA vez por fonte e mantém a identidade de `projects` entre renders', async () => {
    const listar = vi.fn(() => Promise.resolve(LISTA))
    const fonte = fonteCom(listar)
    const { rerender } = render(<DiarioDoLink fonte={fonte} />)
    await screen.findByTestId('tela-do-diario')
    rerender(<DiarioDoLink fonte={fonte} />)
    rerender(<DiarioDoLink fonte={fonte} />)
    expect(listar).toHaveBeenCalledTimes(1)
    expect(sondas.projetos.length).toBeGreaterThanOrEqual(3)
    expect(new Set(sondas.projetos).size).toBe(1)
  })

  it('fonte nova (token mudou) carrega de novo', async () => {
    const a = vi.fn(() => Promise.resolve(LISTA))
    const b = vi.fn(() => Promise.resolve([LISTA[0]]))
    const { rerender } = render(<DiarioDoLink fonte={fonteCom(a)} />)
    await screen.findByText('2 diários')
    rerender(<DiarioDoLink fonte={fonteCom(b)} />)
    await screen.findByText('1 diários')
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('falha ao carregar: mostra o erro e "Tentar de novo" recarrega', async () => {
    const listar = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(LISTA)
    render(<DiarioDoLink fonte={fonteCom(listar)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o diário. Verifique a conexão.')
    expect(screen.queryByTestId('tela-do-diario')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByTestId('tela-do-diario')).toBeInTheDocument()
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('resposta que chega depois de trocar a fonte não sobrescreve a nova', async () => {
    let soltarA: (v: unknown) => void = () => {}
    const a = vi.fn(() => new Promise(r => { soltarA = r }))
    const b = vi.fn(() => Promise.resolve([LISTA[0]]))
    const { rerender } = render(<DiarioDoLink fonte={fonteCom(a)} />)
    rerender(<DiarioDoLink fonte={fonteCom(b)} />)
    await screen.findByText('1 diários')
    soltarA(LISTA)
    await waitFor(() => expect(screen.getByText('1 diários')).toBeInTheDocument())
  })
})
