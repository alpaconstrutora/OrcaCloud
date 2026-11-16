/**
 * Painel de análise de Minhas Tarefas (`components/TasksDashboard.tsx`) — lógica pura.
 *
 * Plano: `docs/planos/2026-11-15-tarefas-painel-analise.md`. O painel lê o MESMO array
 * que a Lista e o Kanban (decisão do usuário: "tudo o que vejo na lista"), já
 * recortado por organização e espaço/pasta no `TasksModule`. Por isso os números
 * batem com a Lista por construção: nada aqui consulta o banco.
 *
 * Duas leituras, como pede o guia §4.5.1:
 *  - `hoje`: o retrato atual (abertas, atraso, quem está com o quê, onde está a carga);
 *    não depende do período.
 *  - `periodo`: o que foi criado e concluído na janela de N semanas.
 *
 * Regras de conta:
 *  - aberta = `status !== 'done'` (o mesmo critério do `TasksModule`);
 *  - atraso por DIA local (`daysUntil`, de `tasksMobileAgenda`), não por instante: o
 *    prazo é gravado ao meio-dia local, e prazo de hoje não é atrasada;
 *  - subtarefa conta como tarefa (29 das 31 subtarefas têm responsável próprio);
 *  - concluída no período = `status === 'done'` com `completed_at` dentro da janela
 *    (reabrir zera o `completed_at` no gatilho, e a guarda do status cobre o resto);
 *  - "não medido" é `null`, nunca zero (§28.5).
 */
import { addDays, dayOf, daysUntil, isoDate, startOfDay } from './tasksMobileAgenda'
import { rotuloOrigem, rotuloPrioridade } from './tarefaRotulos'

const DIA_MS = 24 * 3600 * 1000

/** Quantas linhas um cartão de ranking mostra antes de juntar o resto em "Outros". */
export const LINHAS_POR_RANKING = 8
/** Quantas atrasadas a lista "mais antigas" mostra; o resto fica a um clique, na Lista. */
export const ATRASADAS_NA_LISTA = 5

export interface TarefaDoPainel {
  id: string
  title: string
  status: string
  due_date: string | null
  created_at: string
  completed_at: string | null
  assignee_employee_id: string | null
  project_id: string | null
  space_id: string | null
  source_module: string
  priority: number
  parent_task_id: string | null
}

export interface OpcoesDoPainel {
  hoje: Date
  /** Tamanho da janela do período, em semanas (segunda a domingo). */
  semanas: number
  responsaveis: { id: string; name: string }[]
  espacos: { id: string; name: string }[]
  obras: { id: string; name: string }[]
}

export type FaixaAtraso = 'no_prazo' | 'd1_7' | 'd8_30' | 'd31_90' | 'd90'

export const ROTULO_FAIXA_ATRASO: Record<FaixaAtraso, string> = {
  no_prazo: 'No prazo',
  d1_7: '1 a 7 dias',
  d8_30: '8 a 30 dias',
  d31_90: '31 a 90 dias',
  d90: 'Mais de 90 dias',
}

const ORDEM_FAIXAS: FaixaAtraso[] = ['no_prazo', 'd1_7', 'd8_30', 'd31_90', 'd90']

export type DimensaoCarga = 'espaco' | 'obra' | 'origem' | 'prioridade'

export interface LinhaDeCarga { chave: string; rotulo: string; abertas: number; atrasadas: number }

export interface LinhaPorResponsavel {
  chave: string
  rotulo: string
  abertas: number
  emDia: number
  atrasadas: number
  semPrazo: number
}

export interface LinhaConcluidas { chave: string; rotulo: string; concluidas: number }

export interface SemanaDoPainel { inicio: string; rotulo: string; criadas: number; concluidas: number }

export interface AtrasadaDoPainel<T> { tarefa: T; responsavel: string; dias: number }

export interface PainelTarefas<T extends TarefaDoPainel> {
  hoje: {
    abertas: number
    subtarefasAbertas: number
    atrasadas: number
    /** Das atrasadas, quantas são subtarefas — a contagem "Atrasadas (n)" da Lista só
     *  conta tarefas-raiz, e o painel diz a diferença em vez de divergir calado. */
    subtarefasAtrasadas: number
    /** Dias de atraso da atrasada mais antiga; null sem atrasada. */
    atrasoMaisAntigo: number | null
    /** Prazo entre hoje e daqui a 7 dias (hoje incluso). */
    vencem7: number
    venceHoje: number
    semPrazo: number
    /** Abertas com prazo — a base do gráfico de atraso. */
    comPrazo: number
    atraso: { faixa: FaixaAtraso; rotulo: string; qtd: number }[]
    maisAtrasadas: AtrasadaDoPainel<T>[]
    porResponsavel: LinhaPorResponsavel[]
    carga: Record<DimensaoCarga, LinhaDeCarga[]>
  }
  periodo: {
    /** Segunda-feira da primeira semana (YYYY-MM-DD). */
    desde: string
    /** Hoje (YYYY-MM-DD). */
    ate: string
    concluidas: number
    criadas: number
    /** Concluídas no período que tinham prazo — a base de `noPrazo`. */
    comPrazo: number
    noPrazo: number
    /** noPrazo ÷ comPrazo; null sem base (nunca 0 afirmado sobre o que não foi medido). */
    taxaNoPrazo: number | null
    /** Mediana de (conclusão − criação), em dias; null sem concluída. */
    medianaDias: number | null
    semanas: SemanaDoPainel[]
    porResponsavel: LinhaConcluidas[]
  }
}

const SEM_RESPONSAVEL = 'Sem responsável'
const COLABORADOR_INATIVO = 'Colaborador inativo'

/** Segunda-feira (00h local) da semana do dia. */
export function inicioDaSemana(d: Date): Date {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}

const rotuloDiaMes = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

const diasEntre = (de: Date, ate: Date) => Math.round((startOfDay(ate).getTime() - startOfDay(de).getTime()) / DIA_MS)

function faixaDoAtraso(diasAteOPrazo: number): FaixaAtraso {
  if (diasAteOPrazo >= 0) return 'no_prazo'
  const atraso = -diasAteOPrazo
  if (atraso <= 7) return 'd1_7'
  if (atraso <= 30) return 'd8_30'
  if (atraso <= 90) return 'd31_90'
  return 'd90'
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2
}

const compararRotulo = (a: { rotulo: string }, b: { rotulo: string }) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')

/**
 * Mantém as `limite` primeiras linhas e soma o resto numa linha "Outros (N)". As linhas
 * já chegam ordenadas; `somar` junta duas linhas campo a campo.
 */
function comOutros<L extends { chave: string; rotulo: string }>(linhas: L[], somar: (a: L, b: L) => L, limite = LINHAS_POR_RANKING): L[] {
  if (linhas.length <= limite + 1) return linhas
  const resto = linhas.slice(limite)
  const outros = resto.slice(1).reduce(somar, resto[0])
  return [...linhas.slice(0, limite), { ...outros, chave: '__outros__', rotulo: `Outros (${resto.length})` }]
}

export function montarPainelTarefas<T extends TarefaDoPainel>(tarefas: T[], opcoes: OpcoesDoPainel): PainelTarefas<T> {
  const { hoje, semanas } = opcoes
  const nomeResponsavel = new Map(opcoes.responsaveis.map(r => [r.id, r.name]))
  const nomeEspaco = new Map(opcoes.espacos.map(e => [e.id, e.name]))
  const nomeObra = new Map(opcoes.obras.map(o => [o.id, o.name]))

  const responsavelDe = (t: TarefaDoPainel): { chave: string; rotulo: string } => {
    if (!t.assignee_employee_id) return { chave: '__sem__', rotulo: SEM_RESPONSAVEL }
    const nome = nomeResponsavel.get(t.assignee_employee_id)
    return nome ? { chave: t.assignee_employee_id, rotulo: nome } : { chave: '__inativo__', rotulo: COLABORADOR_INATIVO }
  }

  const chaveDe: Record<DimensaoCarga, (t: TarefaDoPainel) => { chave: string; rotulo: string }> = {
    espaco: t => !t.space_id ? { chave: '__sem__', rotulo: 'Sem espaço' }
      : nomeEspaco.has(t.space_id) ? { chave: t.space_id, rotulo: nomeEspaco.get(t.space_id)! }
      : { chave: '__fora__', rotulo: 'Espaço fora da lista' },
    obra: t => !t.project_id ? { chave: '__sem__', rotulo: 'Sem obra' }
      : nomeObra.has(t.project_id) ? { chave: t.project_id, rotulo: nomeObra.get(t.project_id)! }
      : { chave: '__fora__', rotulo: 'Obra fora da lista' },
    origem: t => ({ chave: t.source_module || '__sem__', rotulo: rotuloOrigem(t.source_module).label }),
    prioridade: t => ({ chave: String(t.priority ?? 3), rotulo: rotuloPrioridade(t.priority) }),
  }

  // ── Hoje ────────────────────────────────────────────────────────────────────
  const abertas = tarefas.filter(t => t.status !== 'done')
  const atraso = new Map<FaixaAtraso, number>(ORDEM_FAIXAS.map(f => [f, 0]))
  const atrasadasLista: AtrasadaDoPainel<T>[] = []
  const porResponsavel = new Map<string, LinhaPorResponsavel>()
  const carga: Record<DimensaoCarga, Map<string, LinhaDeCarga>> = {
    espaco: new Map(), obra: new Map(), origem: new Map(), prioridade: new Map(),
  }
  let vencem7 = 0, venceHoje = 0, semPrazo = 0, subtarefasAbertas = 0

  for (const t of abertas) {
    if (t.parent_task_id) subtarefasAbertas += 1
    const dias = t.due_date ? daysUntil(t.due_date, hoje) : null
    const atrasada = dias != null && dias < 0
    const resp = responsavelDe(t)

    if (dias == null) semPrazo += 1
    else {
      const faixa = faixaDoAtraso(dias)
      atraso.set(faixa, (atraso.get(faixa) ?? 0) + 1)
      if (dias >= 0 && dias <= 7) vencem7 += 1
      if (dias === 0) venceHoje += 1
      if (atrasada) atrasadasLista.push({ tarefa: t, responsavel: resp.rotulo, dias: -dias })
    }

    const linha = porResponsavel.get(resp.chave) ?? { ...resp, abertas: 0, emDia: 0, atrasadas: 0, semPrazo: 0 }
    linha.abertas += 1
    if (dias == null) linha.semPrazo += 1
    else if (atrasada) linha.atrasadas += 1
    else linha.emDia += 1
    porResponsavel.set(resp.chave, linha)

    for (const dim of Object.keys(carga) as DimensaoCarga[]) {
      const k = chaveDe[dim](t)
      const l = carga[dim].get(k.chave) ?? { ...k, abertas: 0, atrasadas: 0 }
      l.abertas += 1
      if (atrasada) l.atrasadas += 1
      carga[dim].set(k.chave, l)
    }
  }

  atrasadasLista.sort((a, b) => b.dias - a.dias || a.tarefa.title.localeCompare(b.tarefa.title, 'pt-BR'))

  const porVolume = (a: LinhaDeCarga, b: LinhaDeCarga) => b.abertas - a.abertas || b.atrasadas - a.atrasadas || compararRotulo(a, b)
  const somarCarga = (a: LinhaDeCarga, b: LinhaDeCarga): LinhaDeCarga => ({ ...a, abertas: a.abertas + b.abertas, atrasadas: a.atrasadas + b.atrasadas })
  const ordenarCarga = (dim: DimensaoCarga): LinhaDeCarga[] => {
    const linhas = [...carga[dim].values()]
    // Prioridade tem ordem própria (Urgente → Baixa); as outras, por volume.
    if (dim === 'prioridade') return linhas.sort((a, b) => Number(a.chave) - Number(b.chave))
    return comOutros(linhas.sort(porVolume), somarCarga)
  }

  const linhasResponsavel = comOutros(
    [...porResponsavel.values()].sort((a, b) => b.abertas - a.abertas || b.atrasadas - a.atrasadas || compararRotulo(a, b)),
    (a, b) => ({ ...a, abertas: a.abertas + b.abertas, emDia: a.emDia + b.emDia, atrasadas: a.atrasadas + b.atrasadas, semPrazo: a.semPrazo + b.semPrazo }),
  )

  // ── Período ─────────────────────────────────────────────────────────────────
  const n = Math.max(1, Math.floor(semanas))
  const desde = addDays(inicioDaSemana(hoje), -7 * (n - 1))
  const fim = addDays(startOfDay(hoje), 1) // exclusivo: amanhã 00h
  const listaSemanas: SemanaDoPainel[] = Array.from({ length: n }, (_, i) => {
    const inicio = addDays(desde, 7 * i)
    return { inicio: isoDate(inicio), rotulo: rotuloDiaMes(inicio), criadas: 0, concluidas: 0 }
  })
  const semanaDe = (d: Date): number | null => {
    if (d < desde || d >= fim) return null
    return Math.floor(diasEntre(desde, d) / 7)
  }

  let concluidas = 0, criadas = 0, comPrazoPeriodo = 0, noPrazo = 0
  const duracoes: number[] = []
  const concluidasPorResp = new Map<string, LinhaConcluidas>()

  for (const t of tarefas) {
    const criada = new Date(t.created_at)
    const iCriada = semanaDe(criada)
    if (iCriada != null) { criadas += 1; listaSemanas[iCriada].criadas += 1 }

    if (t.status !== 'done' || !t.completed_at) continue
    const concluida = new Date(t.completed_at)
    const iConcluida = semanaDe(concluida)
    if (iConcluida == null) continue
    concluidas += 1
    listaSemanas[iConcluida].concluidas += 1
    duracoes.push(Math.max(0, (concluida.getTime() - criada.getTime()) / DIA_MS))
    if (t.due_date) {
      comPrazoPeriodo += 1
      if (isoDate(concluida) <= dayOf(t.due_date)) noPrazo += 1
    }
    const resp = responsavelDe(t)
    const l = concluidasPorResp.get(resp.chave) ?? { ...resp, concluidas: 0 }
    l.concluidas += 1
    concluidasPorResp.set(resp.chave, l)
  }

  return {
    hoje: {
      abertas: abertas.length,
      subtarefasAbertas,
      atrasadas: atrasadasLista.length,
      subtarefasAtrasadas: atrasadasLista.filter(a => a.tarefa.parent_task_id).length,
      atrasoMaisAntigo: atrasadasLista.length > 0 ? atrasadasLista[0].dias : null,
      vencem7,
      venceHoje,
      semPrazo,
      comPrazo: abertas.length - semPrazo,
      atraso: ORDEM_FAIXAS.map(f => ({ faixa: f, rotulo: ROTULO_FAIXA_ATRASO[f], qtd: atraso.get(f) ?? 0 })),
      maisAtrasadas: atrasadasLista.slice(0, ATRASADAS_NA_LISTA),
      porResponsavel: linhasResponsavel,
      carga: {
        espaco: ordenarCarga('espaco'),
        obra: ordenarCarga('obra'),
        origem: ordenarCarga('origem'),
        prioridade: ordenarCarga('prioridade'),
      },
    },
    periodo: {
      desde: isoDate(desde),
      ate: isoDate(hoje),
      concluidas,
      criadas,
      comPrazo: comPrazoPeriodo,
      noPrazo,
      taxaNoPrazo: comPrazoPeriodo > 0 ? noPrazo / comPrazoPeriodo : null,
      medianaDias: mediana(duracoes),
      semanas: listaSemanas,
      porResponsavel: comOutros(
        [...concluidasPorResp.values()].sort((a, b) => b.concluidas - a.concluidas || compararRotulo(a, b)),
        (a, b) => ({ ...a, concluidas: a.concluidas + b.concluidas }),
      ),
    },
  }
}
