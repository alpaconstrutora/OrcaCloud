// @vitest-environment jsdom
/**
 * Diário de Obras no celular lê e grava SÓ pela `DiarioFonte` (link do celular, Parte 2).
 *
 * `lib/supabase` vira `{}`: qualquer acesso direto da tela (projectService,
 * laborService, storage) quebra o teste. Com a fonte do link:
 *  - abrir o diário chama `carregarDiario`, e os registros aparecem;
 *  - salvar chama `salvarRegistro` uma vez;
 *  - registro Aprovado sem permissão de aprovar no link: lixeira e Salvar travados com o motivo;
 *  - a foto sobe por `subirFoto` com a org do diário e o id do diário;
 *  - os carregadores passados aos hooks são estáveis (sem recarregar em laço).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgContext: () => ({ orgId: 'org1' }),
}))

import DiaryMobileApp from '../../components/DiaryMobileApp'
import { DiarioFonteContext, type DiarioFonte, type DiarioCarregado } from '../../services/celular/diarioFonte'
import { MOTIVO_REGISTRO_APROVADO } from '../../utils/diaryAprovacao'
import type { DiaryEntry } from '../../types'

const APROVADO: DiaryEntry = {
  id: 'e1', date: '2026-11-10', weather: 'Ensolarado', temperature: '', description: 'Concretagem da laje',
  status: 'Aprovado', weatherShifts: [], activities: [], labor: [],
  images: ['org1/d1/foto-antiga.jpg'], videos: [], documents: [], impediments: '',
}

const DIARIO: DiarioCarregado = {
  id: 'd1', name: 'Diário Torre A', organization_id: 'org1',
  settings: { classification: 'DIARIO', linkedProjectId: 'p1', diaryEntries: [APROVADO] },
}

const PROJETOS = [{ id: 'd1', name: 'Diário Torre A', settings: { classification: 'DIARIO', diaryEntries: [APROVADO] } }]

function criarFonte() {
  const fonte = {
    modo: 'link' as const,
    podeAprovarNoLink: false,
    carregarDiario: vi.fn(async () => DIARIO),
    salvarRegistro: vi.fn(async (_id: string, entry: DiaryEntry) => ({ entries: [APROVADO, entry], anterior: null })),
    excluirRegistro: vi.fn(async () => ({ entries: [], anterior: null })),
    listarColaboradores: vi.fn(async () => []),
    carregarPlanejamento: vi.fn(async () => ({ schedule: null, budget: [] })),
    gravarEvolucao: vi.fn(async () => null),
    subirFoto: vi.fn(async () => 'org1/d1/nova.jpg'),
    assinarFotos: vi.fn(async (paths: readonly string[]) =>
      Object.fromEntries(paths.map(p => [p, `https://assinada/${p}`]))),
    removerFotos: vi.fn(async () => {}),
  } satisfies DiarioFonte
  return fonte
}

const montar = (fonte: DiarioFonte) => render(
  <DiarioFonteContext.Provider value={fonte}>
    <DiaryMobileApp projects={PROJETOS} />
  </DiarioFonteContext.Provider>,
)

async function abrirDiario() {
  fireEvent.click(await screen.findByRole('button', { name: /Diário Torre A/ }))
  return screen.findByText('Concretagem da laje')
}

beforeEach(() => { window.localStorage.clear() })

describe('DiaryMobileApp — lê e grava pela DiarioFonte', () => {
  it('abrir o diário chama carregarDiario e mostra os registros', async () => {
    const fonte = criarFonte()
    montar(fonte)
    await abrirDiario()
    expect(fonte.carregarDiario).toHaveBeenCalledWith('d1')
    expect(fonte.listarColaboradores).toHaveBeenCalledWith('org1')
    await waitFor(() => expect(fonte.carregarPlanejamento).toHaveBeenCalledWith('d1', 'p1'))
  })

  it('criar registro e salvar chama salvarRegistro uma vez', async () => {
    const fonte = criarFonte()
    montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    fireEvent.change(screen.getByPlaceholderText('O que aconteceu na obra hoje'), { target: { value: 'Alvenaria do 2º pavimento' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar registro/ }))
    await waitFor(() => expect(fonte.salvarRegistro).toHaveBeenCalledTimes(1))
    expect(fonte.salvarRegistro).toHaveBeenCalledWith('d1', expect.objectContaining({ description: 'Alvenaria do 2º pavimento' }))
    expect(await screen.findByText('Alvenaria do 2º pavimento')).toBeInTheDocument()
  })

  it('registro Aprovado sem permissão no link: lixeira e Salvar desabilitados com o motivo', async () => {
    const fonte = criarFonte()
    montar(fonte)
    fireEvent.click(await abrirDiario())
    const travados = (await screen.findAllByTitle(MOTIVO_REGISTRO_APROVADO)).filter(el => el.tagName === 'BUTTON')
    const salvar = travados.find(b => /Registro aprovado/.test(b.textContent || ''))
    const lixo = travados.find(b => (b.textContent || '').trim() === '')
    expect(salvar).toBeDefined()
    expect(salvar).toBeDisabled()
    expect(lixo).toBeDefined()
    expect(lixo).toBeDisabled()
  })

  it('foto sobe por subirFoto com a org e o id do diário', async () => {
    const fonte = criarFonte()
    const { container } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [arquivo] } })
    await waitFor(() => expect(fonte.subirFoto).toHaveBeenCalledTimes(1))
    expect(fonte.subirFoto).toHaveBeenCalledWith({ orgId: 'org1', projectId: 'd1', file: arquivo })
    // A foto nova é assinada pela fonte (via useDiaryMediaUrls), nunca pelo storage direto.
    await waitFor(() => expect(fonte.assinarFotos).toHaveBeenCalledWith(['org1/d1/nova.jpg']))
  })

  it('cancelar depois da foto remove pela fonte, com o id do diário', async () => {
    const fonte = criarFonte()
    const { container } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(fonte.subirFoto).toHaveBeenCalledTimes(1))
    await screen.findByRole('button', { name: /Salvar registro/ })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(fonte.removerFotos).toHaveBeenCalledWith('d1', ['org1/d1/nova.jpg'])
  })

  it('abrir diário que falha mostra o aviso, sem rejeição solta', async () => {
    const fonte = criarFonte()
    fonte.carregarDiario.mockRejectedValueOnce(new Error('Diário não encontrado.'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar(fonte)
    fireEvent.click(await screen.findByRole('button', { name: /Diário Torre A/ }))
    expect(await screen.findByText('Não foi possível abrir o diário.')).toBeInTheDocument()
    erro.mockRestore()
  })

  it('carregadores estáveis: re-render não recarrega diário, planejamento nem assinatura', async () => {
    const fonte = criarFonte()
    const { rerender } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: /Resumo/ }))
    await waitFor(() => expect(fonte.assinarFotos).toHaveBeenCalled())
    await waitFor(() => expect(fonte.carregarPlanejamento).toHaveBeenCalled())
    const antes = {
      diario: fonte.carregarDiario.mock.calls.length,
      plan: fonte.carregarPlanejamento.mock.calls.length,
      assinar: fonte.assinarFotos.mock.calls.length,
      colab: fonte.listarColaboradores.mock.calls.length,
    }
    for (let i = 0; i < 5; i++) {
      rerender(
        <DiarioFonteContext.Provider value={fonte}>
          <DiaryMobileApp projects={PROJETOS} />
        </DiarioFonteContext.Provider>,
      )
      await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    }
    expect(fonte.carregarDiario.mock.calls.length).toBe(antes.diario)
    expect(fonte.carregarPlanejamento.mock.calls.length).toBe(antes.plan)
    expect(fonte.assinarFotos.mock.calls.length).toBe(antes.assinar)
    expect(fonte.listarColaboradores.mock.calls.length).toBe(antes.colab)
    expect(antes.diario).toBe(1)
    expect(antes.plan).toBe(1)
  })
})
