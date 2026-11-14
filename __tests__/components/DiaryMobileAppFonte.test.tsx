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
 *  - limite de uso do link (429) na foto: a tela mostra a mensagem da Edge e
 *    não tenta as fotos seguintes;
 *  - os carregadores passados aos hooks são estáveis (sem recarregar em laço);
 *  - sugestões de efetivo no link = só colaboradores do RH (D5): equipes/cargos de
 *    `organizations` do store (navegador logado como outra pessoa) não entram;
 *  - link que APROVA: registro Aprovado fica livre (lixeira e Salvar habilitados);
 *  - recusa de APROVAÇÃO do banco (42501 com a frase da permissão) aparece na folha
 *    e NÃO é a recusa do link (o `aoRecusar` do gate não é chamado);
 *  - sem Provider (contexto padrão = `fonteDiarioLogado`) a tela usa os serviços
 *    logados de sempre (`projectService`, `laborService`, `diaryEntryService`).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Só `rpc` aparece, e só no teste que monta a fonte do link de verdade.
const sondas = vi.hoisted(() => ({ supabase: {} as { rpc?: (...a: unknown[]) => unknown } }))
vi.mock('../../lib/supabase', () => ({ supabase: sondas.supabase }))
// Serviços da sessão logada: só a fonte padrão (`fonteDiarioLogado`) chega a eles.
const logado = vi.hoisted(() => ({
  loadProject: vi.fn(),
  listEmployees: vi.fn(),
  salvarRegistroDiario: vi.fn(),
  excluirRegistroDiario: vi.fn(),
}))
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: logado.loadProject } }))
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: logado.listEmployees } }))
vi.mock('../../services/diaryEntryService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/diaryEntryService')>()),
  salvarRegistroDiario: logado.salvarRegistroDiario,
  excluirRegistroDiario: logado.excluirRegistroDiario,
}))
vi.mock('../../hooks/useOrgContext', () => ({
  useOrgContext: () => ({ orgId: 'org1' }),
}))

import DiaryMobileApp from '../../components/DiaryMobileApp'
import { useStore } from '../../store/useStore'
import {
  DiarioFonteContext, fonteDiarioDoLink, type DiarioFonte, type DiarioCarregado,
} from '../../services/celular/diarioFonte'
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

beforeEach(() => {
  window.localStorage.clear()
  useStore.setState({ organizations: [] })
  delete sondas.supabase.rpc
  vi.clearAllMocks()
})

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
    // A folha fecha e o registro aparece na LISTA. A causa da falha de 12/11 não era tempo:
    // o findByText achava a textarea da folha ainda aberta (o React espelha o valor no
    // defaultValue) e, se ela fechasse entre achar e conferir, o toBeInTheDocument caía.
    await waitFor(() => expect(screen.queryByPlaceholderText('O que aconteceu na obra hoje')).toBeNull(), { timeout: 5000 })
    const achado = await screen.findByText('Alvenaria do 2º pavimento', {}, { timeout: 5000 })
    expect(achado.tagName).not.toBe('TEXTAREA')
    expect(achado).toBeInTheDocument()
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

  it('limite de uso do link na foto: mostra a mensagem da Edge e para de tentar as seguintes', async () => {
    const LIMITE = 'Limite de uso do link atingido — tente de novo na próxima hora.'
    const fonte = criarFonte()
    fonte.subirFoto
      .mockResolvedValueOnce('org1/d1/primeira.jpg')
      .mockRejectedValueOnce(Object.assign(new Error(LIMITE), { status: 429, code: '54000' }))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const fotos = ['a', 'b', 'c'].map(n => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }))
    fireEvent.change(input, { target: { files: fotos } })
    expect(await screen.findByText(`2 de 3 fotos não subiram (${LIMITE}). A outra já está no registro.`)).toBeInTheDocument()
    expect(fonte.subirFoto).toHaveBeenCalledTimes(2)
    erro.mockRestore()
  })

  it('limite de uso do link na única foto: a mensagem da Edge, sem o texto genérico', async () => {
    const LIMITE = 'Limite de uso do link atingido — tente de novo na próxima hora.'
    const fonte = criarFonte()
    fonte.subirFoto.mockRejectedValueOnce(Object.assign(new Error(LIMITE), { status: 429, code: '54000' }))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText(LIMITE)).toBeInTheDocument()
    expect(screen.queryByText('A foto não subiu. Tente novamente.')).toBeNull()
    erro.mockRestore()
  })

  it('limite de uso do link ao assinar as fotos: a tela mostra o aviso com a mensagem do servidor', async () => {
    const LIMITE = 'Limite de uso do link atingido — tente de novo na próxima hora.'
    const fonte = criarFonte()
    fonte.assinarFotos.mockRejectedValue(Object.assign(new Error(LIMITE), { status: 429, code: '54000' }))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar(fonte)
    // Folha do registro (tem a foto antiga): o cartão de Fotos avisa.
    fireEvent.click(await abrirDiario())
    expect(await screen.findByText(LIMITE)).toBeInTheDocument()
    expect(fonte.assinarFotos).toHaveBeenCalledWith(['org1/d1/foto-antiga.jpg'])
    expect(screen.queryByText('A foto não subiu. Tente novamente.')).toBeNull()
    erro.mockRestore()
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

  it('sugestões de efetivo no link: só colaboradores do RH, ignora as organizações do store (D5)', async () => {
    useStore.setState({
      organizations: [{
        id: 'outraOrg', name: 'Org de outra pessoa',
        resources: {
          roles: [{ id: 'r1', name: 'Cargo Alheio' }],
          workers: [{ id: 'w1', name: 'Operário Alheio', roleId: 'r1' }],
          teams: [{ id: 't1', name: 'Equipe Alheia', memberIds: [] }],
        },
      }] as never,
    })
    const fonte = criarFonte()
    fonte.listarColaboradores.mockResolvedValue([{ id: 'c1', name: 'Colaborador do RH', role: 'Pedreiro', status: 'ATIVO' }])
    const { container } = montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    await waitFor(() => expect(container.querySelector('#diario-mobile-efetivo option[value="Colaborador do RH"]')).not.toBeNull())
    const nomes = Array.from(container.querySelectorAll('#diario-mobile-efetivo option')).map(o => o.getAttribute('value'))
    expect(nomes).toEqual(['Colaborador do RH'])
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

  it('link que aprova: registro Aprovado fica livre — lixeira e Salvar habilitados', async () => {
    const fonte = { ...criarFonte(), podeAprovarNoLink: true }
    montar(fonte)
    fireEvent.click(await abrirDiario())
    const salvar = await screen.findByRole('button', { name: /Salvar registro/ })
    expect(salvar).toBeEnabled()
    const lixo = screen.getByTitle('Excluir registro')
    expect(lixo.tagName).toBe('BUTTON')
    expect(lixo).toBeEnabled()
    expect(screen.queryAllByTitle(MOTIVO_REGISTRO_APROVADO)).toHaveLength(0)
  })

  it('recusa de aprovação do banco (42501): a frase do banco na folha, sem a recusa do link', async () => {
    const APROVACAO = 'Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo (Usuários › Permissões Detalhadas › Operação de Obra).'
    const rpc = vi.fn(async () => ({ data: null, error: { code: '42501', message: APROVACAO } }))
    sondas.supabase.rpc = rpc
    const aoRecusar = vi.fn()
    // salvarRegistro é o da fonte do link de verdade, com o mesmo critério de recusa do gate.
    const doLink = fonteDiarioDoLink('tok', { aoRecusar, podeAprovar: false })
    const fonte = { ...criarFonte(), salvarRegistro: vi.fn(doLink.salvarRegistro) }
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar(fonte)
    await abrirDiario()
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    fireEvent.change(screen.getByPlaceholderText('O que aconteceu na obra hoje'), { target: { value: 'Alvenaria' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar registro/ }))
    expect(await screen.findByText(APROVACAO, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('celular_diario_salvar', expect.objectContaining({ p_token: 'tok', p_project_id: 'd1' }))
    expect(aoRecusar).not.toHaveBeenCalled()
    // A folha continua aberta (o rascunho segue na tela).
    expect(screen.getByPlaceholderText('O que aconteceu na obra hoje')).toHaveValue('Alvenaria')
    erro.mockRestore()
  })

  it('sem Provider (fonteDiarioLogado): abre, lista efetivo e salva pelos serviços logados', async () => {
    logado.loadProject.mockResolvedValue(DIARIO)
    logado.listEmployees.mockResolvedValue([])
    // Salvar com um pouco de rede (como no CI carregado): enquanto ele não volta, a folha de
    // edição segue aberta com o texto na textarea — e o getByText também acha textarea.
    logado.salvarRegistroDiario.mockImplementation(async (_id: string, entry: DiaryEntry) => {
      await new Promise(r => setTimeout(r, 30))
      return { entries: [APROVADO, entry], anterior: null }
    })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<DiaryMobileApp projects={PROJETOS} />)
    await abrirDiario()
    expect(logado.loadProject).toHaveBeenCalledWith('d1')
    expect(logado.listEmployees).toHaveBeenCalledWith('org1')
    fireEvent.click(screen.getByRole('button', { name: 'Novo registro' }))
    fireEvent.change(screen.getByPlaceholderText('O que aconteceu na obra hoje'), { target: { value: 'Reboco externo' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar registro/ }))
    await waitFor(() => expect(logado.salvarRegistroDiario).toHaveBeenCalledTimes(1))
    expect(logado.salvarRegistroDiario).toHaveBeenCalledWith('d1', expect.objectContaining({ description: 'Reboco externo' }))
    // A folha fecha e o registro aparece na LISTA. Sem esperar a folha fechar, o findByText
    // achava a textarea (o React espelha o valor no defaultValue) e, se a folha fechasse entre
    // achar e conferir, o toBeInTheDocument caía — a falha intermitente do CI (14/11).
    await waitFor(() => expect(screen.queryByPlaceholderText('O que aconteceu na obra hoje')).toBeNull(), { timeout: 5000 })
    const achado = await screen.findByText('Reboco externo', {}, { timeout: 5000 })
    expect(achado.tagName).not.toBe('TEXTAREA')
    expect(achado).toBeInTheDocument()
    aviso.mockRestore()
  })
})

// "Registrado por" (2026-11-13): a autoria vem carimbada pelo banco no registro;
// o cartão e a folha só exibem. Registro antigo, sem carimbo, não mostra nada.
describe('DiaryMobileApp — autoria do registro', () => {
  const emLocal = (h: number, min: number) => new Date(2026, 10, 13, h, min).toISOString()
  const CARIMBADO: DiaryEntry = {
    ...APROVADO, id: 'e2', status: 'Rascunho', description: 'Forma dos pilares', images: [],
    registradoPor: { id: 'u-iago', nome: 'Iago Marcos', em: emLocal(8, 0) },
    editadoPor: { id: 'u-ana', nome: 'Ana Souza', em: emLocal(17, 45) },
  }
  const ANTIGO: DiaryEntry = { ...APROVADO, id: 'e3', status: 'Rascunho', description: 'Registro antigo', images: [] }

  it('cartão e folha mostram quem registrou e quem editou; o antigo não mostra nada', async () => {
    const fonte = criarFonte()
    fonte.carregarDiario.mockResolvedValue({ ...DIARIO, settings: { ...DIARIO.settings, diaryEntries: [CARIMBADO, ANTIGO] } })
    montar(fonte)
    fireEvent.click(await screen.findByRole('button', { name: /Diário Torre A/ }))
    await screen.findByText('Forma dos pilares')
    const linhas = screen.getAllByTestId('diario-autoria')
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toHaveTextContent('Registrado por Iago Marcos · editado por Ana Souza em 13/11 17:45')

    fireEvent.click(screen.getByText('Forma dos pilares'))
    expect(await screen.findByText('Editar registro')).toBeInTheDocument()
    expect(screen.getByText('Registrado por Iago Marcos', { selector: '[data-testid="diario-autoria"]' })).toBeInTheDocument()
    expect(screen.getByText('editado por Ana Souza em 13/11 17:45', { selector: '[data-testid="diario-autoria"]' })).toBeInTheDocument()
  })

  it('folha do registro antigo (sem carimbo) não tem linha de autoria', async () => {
    const fonte = criarFonte()
    fonte.carregarDiario.mockResolvedValue({ ...DIARIO, settings: { ...DIARIO.settings, diaryEntries: [ANTIGO] } })
    montar(fonte)
    fireEvent.click(await screen.findByRole('button', { name: /Diário Torre A/ }))
    fireEvent.click(await screen.findByText('Registro antigo'))
    expect(await screen.findByText('Editar registro')).toBeInTheDocument()
    expect(screen.queryAllByTestId('diario-autoria')).toHaveLength(0)
  })
})
