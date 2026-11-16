import React, { useMemo } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, CalendarX, ListTodo } from 'lucide-react'
import {
  BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts'
import { KpiCard, type KpiTom } from './ui/KpiCard'
import { usePersistedState } from './ui/TableUtils'
import {
  niceTicks, decimalBR, plural,
  GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, END_LABEL,
  SERIE_PRINCIPAL, SERIE_CONTEXTO, AGING_COLORS,
  ChartCard, ChartEmpty, ChartSourceState, Legend,
} from './analysis/chartKit'
import {
  montarPainelTarefas, type DimensaoCarga, type LinhaDeCarga, type PainelTarefas, type SemanaDoPainel,
} from '../utils/tarefasPainel'
import type { TaskRecord, EmployeeOption, ProjectOption } from './TaskForm'

/**
 * Minhas Tarefas › Painel — terceira visão do `TasksModule` (Lista | Kanban | Painel).
 * Plano: docs/planos/2026-11-15-tarefas-painel-analise.md.
 *
 * Lê o MESMO array da Lista (já recortado por organização e espaço/pasta no módulo) e
 * responde às quatro perguntas do pedido: estou dando conta? · o que está atrasando? ·
 * quem está com o quê? · onde está a carga?
 *
 * Painel analítico, então §4.5/§4.5.1: duas faixas — "Hoje" (não depende do período) e
 * "Resultado do período" (o seletor de semanas mora na linha dela) —, indicadores
 * `destaque` neutros com cor só por limiar, e gráficos no vocabulário do §28.
 */

/** Hipóteses de gestão num lugar só (§4.5): mudar aqui muda a tela inteira. */
const LIMIAR = {
  /** Qualquer atrasada já pinta o indicador de vermelho. */
  atrasadasAlerta: 0,
} as const

/** Situação do prazo — validada com o `validate_palette.js` (guia §28.4). */
const COR_EM_DIA = SERIE_PRINCIPAL
const COR_ATRASADA = '#ef4444'
const COR_SEM_PRAZO = SERIE_CONTEXTO

const PERIODOS = [8, 12, 26] as const
const PERIODO_PADRAO = 12

const DIMENSOES: { id: DimensaoCarga; label: string }[] = [
  { id: 'espaco', label: 'Espaço' },
  { id: 'obra', label: 'Obra' },
  { id: 'origem', label: 'Origem' },
  { id: 'prioridade', label: 'Prioridade' },
]

/** Até aqui as semanas cabem com rótulo direto e todos os ticks do eixo. */
const SEMANAS_COM_ROTULO = 12
/** Com até este número de semanas com movimento, a série vira lista (§28.5). */
const POUCAS_SEMANAS = 2

const dataBR = (d: Date) => d.toLocaleDateString('pt-BR')
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const encurtar = (s: string, max = 24) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
const porcento = (fracao: number) => `${Math.round(fracao * 100)}%`
const dias = (n: number) => plural(n, 'dia', 'dias')

/** Eixo de contagem: inteiros, no mínimo 0–4 (com máximo 1, o niceTicks daria 0,25). */
const ticksDeContagem = (max: number) => niceTicks(Math.max(4, max))

function tempoAteConcluir(medianaDias: number | null): string {
  if (medianaDias == null) return '—'
  if (medianaDias < 1) return 'menos de 1 dia'
  return dias(Math.round(medianaDias))
}

interface Props {
  /** Tarefas do recorte da tela (organização do topo + espaço/pasta), com subtarefas. */
  tasks: TaskRecord[]
  loading: boolean
  loadError: boolean
  onRetry: () => void
  employees: EmployeeOption[]
  obras: ProjectOption[]
  spaces: { id: string; name: string }[]
  /** Espaço / Pasta / gerenciar espaços — os mesmos controles da Lista e do Kanban. */
  scopeControls: React.ReactNode
  /** Frase do recorte vazio, com "Ver todas as tarefas" quando há recorte ativo. */
  emptyHint: { message: string; action?: { label: string; onClick: () => void } }
  onOpenTask: (t: TaskRecord) => void
  /** Leva à Lista com Prazo = Atrasadas. */
  onVerAtrasadas: () => void
}

const TasksDashboard: React.FC<Props> = ({
  tasks, loading, loadError, onRetry, employees, obras, spaces, scopeControls, emptyHint, onOpenTask, onVerAtrasadas,
}) => {
  const [semanasSalvas, setSemanas] = usePersistedState<number>('tasksPainel:semanas', PERIODO_PADRAO)
  const semanas = (PERIODOS as readonly number[]).includes(semanasSalvas) ? semanasSalvas : PERIODO_PADRAO
  const [dimensaoSalva, setDimensao] = usePersistedState<DimensaoCarga>('tasksPainel:carga', 'espaco')
  const dimensao = DIMENSOES.some(d => d.id === dimensaoSalva) ? dimensaoSalva : 'espaco'

  // "Hoje" é recalculado a cada carga — a tela não fica aberta de um dia para o outro.
  const hoje = useMemo(() => new Date(), [tasks])
  const painel = useMemo(() => montarPainelTarefas(tasks, {
    hoje,
    semanas,
    responsaveis: employees.map(e => ({ id: e.id, name: e.name })),
    espacos: spaces,
    obras,
  }), [tasks, hoje, semanas, employees, spaces, obras])

  const barraDeEscopo = (
    <div className="flex flex-wrap items-center gap-2.5 bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
      {scopeControls}
    </div>
  )

  if (loadError) {
    return (
      <div className="space-y-6">
        {barraDeEscopo}
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
          <ChartSourceState state="error" onRetry={onRetry} what="as tarefas" />
        </div>
      </div>
    )
  }
  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-6">
        {barraDeEscopo}
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
          <ChartSourceState state="loading" onRetry={onRetry} what="as tarefas" />
        </div>
      </div>
    )
  }
  if (tasks.length === 0) {
    return (
      <div className="space-y-6">
        {barraDeEscopo}
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
          <ChartEmpty>
            <span>
              {emptyHint.message}
              {emptyHint.action && (
                <>
                  {' '}
                  <button type="button" onClick={emptyHint.action.onClick} className="text-blue-600 hover:text-blue-800 font-medium">
                    {emptyHint.action.label}
                  </button>
                </>
              )}
            </span>
          </ChartEmpty>
        </div>
      </div>
    )
  }

  const h = painel.hoje
  const p = painel.periodo
  const tomAtrasadas: KpiTom = h.atrasadas > LIMIAR.atrasadasAlerta ? 'alerta' : 'neutro'

  return (
    <div className="space-y-6">
      {barraDeEscopo}

      {/* ── Hoje: não depende do período ── */}
      <section aria-labelledby="painel-tarefas-hoje" className="space-y-3">
        <FaixaTitulo id="painel-tarefas-hoje" titulo="Hoje" resumo={dataBR(hoje)} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            destaque
            label="Abertas"
            icon={<ListTodo />}
            value={h.abertas}
            sub={h.subtarefasAbertas > 0 ? `Inclui ${plural(h.subtarefasAbertas, 'subtarefa', 'subtarefas')}` : undefined}
          />
          <KpiCard
            destaque
            label="Atrasadas"
            icon={<AlertTriangle />}
            value={h.atrasadas}
            sub={h.atrasoMaisAntigo == null
              ? 'Nenhuma tarefa atrasada'
              // A contagem da Lista ("Atrasadas (n)") é só de tarefas-raiz: dizer a diferença.
              : `A mais antiga há ${dias(h.atrasoMaisAntigo)}${h.subtarefasAtrasadas > 0 ? ` · inclui ${plural(h.subtarefasAtrasadas, 'subtarefa', 'subtarefas')}` : ''}`}
            tom={tomAtrasadas}
            acao={h.atrasadas > 0 ? { label: 'Ver na lista', onClick: onVerAtrasadas } : undefined}
          />
          <KpiCard
            destaque
            label="Vencem em até 7 dias"
            icon={<CalendarClock />}
            value={h.vencem7}
            sub={h.venceHoje > 0 ? `${plural(h.venceHoje, 'vence', 'vencem')} hoje` : 'Nenhuma vence hoje'}
          />
          <KpiCard
            destaque
            label="Sem prazo"
            icon={<CalendarX />}
            value={h.semPrazo}
            sub={h.abertas > 0 ? `${porcento(h.semPrazo / h.abertas)} das abertas · ficam fora do atraso` : undefined}
          />
        </div>

        {/* Linhas pareadas pela altura: os dois gráficos de barra juntos; a lista das mais
            antigas (até 8 itens) ao lado da carga, que também cresce por linha. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AtrasoDasAbertas painel={painel} />
          <QuemEstaComOQue painel={painel} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AtrasadasMaisAntigas painel={painel} onOpenTask={onOpenTask} onVerAtrasadas={onVerAtrasadas} />
          <OndeEstaACarga linhas={h.carga[dimensao]} dimensao={dimensao} onDimensao={setDimensao} abertas={h.abertas} />
        </div>
      </section>

      {/* ── Resultado do período: o seletor mora na linha da faixa que ele recorta ── */}
      <section aria-labelledby="painel-tarefas-periodo" className="space-y-3">
        <FaixaTitulo id="painel-tarefas-periodo" titulo="Resultado do período" resumo={`${diaMes(p.desde)} a ${diaMes(p.ate)}`}>
          <Alternador
            rotulo="Tamanho do período"
            opcoes={PERIODOS.map(n => ({ id: n, label: `${n} semanas` }))}
            valor={semanas}
            onChange={setSemanas}
          />
        </FaixaTitulo>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard size="sm" color="gray" label="Concluídas" value={p.concluidas}
            sub={`≈ ${decimalBR(p.concluidas / semanas, 1)} por semana`} />
          <KpiCard size="sm" color="gray" label="Criadas" value={p.criadas}
            sub={`≈ ${decimalBR(p.criadas / semanas, 1)} por semana`} />
          <KpiCard size="sm" color="gray" label="Concluídas no prazo"
            value={p.taxaNoPrazo == null ? '—' : porcento(p.taxaNoPrazo)}
            sub={p.comPrazo > 0
              ? `${p.noPrazo} de ${plural(p.comPrazo, 'concluída com prazo', 'concluídas com prazo')}`
              : 'Nenhuma concluída tinha prazo'} />
          <KpiCard size="sm" color="gray" label="Tempo até concluir" value={tempoAteConcluir(p.medianaDias)}
            sub={p.medianaDias == null ? 'Nenhuma concluída no período' : 'Mediana, da criação à conclusão'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <CriadasConcluidas className="lg:col-span-3" semanas={p.semanas} />
          <ConcluidasPorResponsavel className="lg:col-span-2" painel={painel} />
        </div>
      </section>
    </div>
  )
}

// ── Peças da tela ─────────────────────────────────────────────────────────────

/** Título de faixa (§4.5.1): h2 fora de card, com o controle da faixa à direita. */
const FaixaTitulo: React.FC<{ id: string; titulo: string; resumo?: string; children?: React.ReactNode }> = ({ id, titulo, resumo, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <h2 id={id} className="text-base font-semibold text-gray-900">
      {titulo}
      {resumo && <span className="font-normal text-gray-500"> · {resumo}</span>}
    </h2>
    {children}
  </div>
)

/** Alternador de escolha única no vocabulário de abas (§19.1, `h-7` no trilho). */
function Alternador<V extends string | number>({ rotulo, opcoes, valor, onChange }: {
  rotulo: string
  opcoes: { id: V; label: string }[]
  valor: V
  onChange: (v: V) => void
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
      {opcoes.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            valor === o.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

type PainelDeTarefas = PainelTarefas<TaskRecord>

/** O que está atrasando: as abertas com prazo pela faixa de atraso (rampa do §28.4). */
const AtrasoDasAbertas: React.FC<{ painel: PainelDeTarefas }> = ({ painel }) => {
  const h = painel.hoje
  const data = h.atraso.map(f => ({ ...f }))
  return (
    <ChartCard
      title="Atraso das abertas"
      subtitle={h.comPrazo > 0
        ? `${plural(h.comPrazo, 'tarefa aberta com prazo', 'tarefas abertas com prazo')}, pelo tempo de atraso.${h.semPrazo > 0 ? ` ${plural(h.semPrazo, 'sem prazo fica', 'sem prazo ficam')} fora.` : ''}`
        : 'Tarefas abertas com prazo, pelo tempo de atraso.'}
    >
      {h.abertas === 0 ? (
        <ChartEmpty>Nenhuma tarefa aberta neste recorte.</ChartEmpty>
      ) : h.comPrazo === 0 ? (
        <ChartEmpty>Nenhuma tarefa aberta tem prazo: sem prazo, não há atraso para medir.</ChartEmpty>
      ) : (
        <div
          style={{ height: data.length * 32 + 8 }}
          role="img"
          aria-label={`Atraso das abertas: ${data.map(d => `${d.rotulo}, ${plural(d.qtd, 'tarefa', 'tarefas')}`).join('; ')}.`}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="rotulo" width={112} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
              <RechartsTooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                formatter={(val) => [plural(Number(val), 'tarefa', 'tarefas'), 'Abertas']}
              />
              <Bar dataKey="qtd" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} label={END_LABEL}>
                {data.map((d, i) => <Cell key={d.faixa} fill={AGING_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

/** As atrasadas mais antigas — clicar abre a tarefa no formulário (não grava nada). */
const AtrasadasMaisAntigas: React.FC<{ painel: PainelDeTarefas; onOpenTask: (t: TaskRecord) => void; onVerAtrasadas: () => void }> = ({ painel, onOpenTask, onVerAtrasadas }) => {
  const h = painel.hoje
  const itens = h.maisAtrasadas
  return (
    <ChartCard
      title="Atrasadas mais antigas"
      subtitle={h.atrasadas > itens.length
        ? `As ${itens.length} com mais dias de atraso, de ${h.atrasadas}. Clique para abrir a tarefa.`
        : 'Clique para abrir a tarefa.'}
    >
      {itens.length === 0 ? (
        <ChartEmpty>Nenhuma tarefa atrasada neste recorte.</ChartEmpty>
      ) : (
        <ul className="divide-y divide-gray-100 -mx-1">
          {itens.map(a => (
            <li key={a.tarefa.id}>
              <button
                type="button"
                onClick={() => onOpenTask(a.tarefa)}
                title={a.tarefa.title}
                className="w-full flex items-center gap-3 py-2 px-1 text-left rounded-[6px] hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-800 truncate">{a.tarefa.title}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {a.responsavel}{a.tarefa.parent_task_id ? ' · subtarefa' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-red-700 tabular-nums">
                  {dias(a.dias)} de atraso
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {h.atrasadas > itens.length && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onVerAtrasadas}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Ver as {h.atrasadas} atrasadas na lista
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </ChartCard>
  )
}

type Segmento = 'emDia' | 'atrasadas' | 'semPrazo'
const ultimoSegmento = (l: { emDia: number; atrasadas: number; semPrazo: number }): Segmento =>
  l.semPrazo > 0 ? 'semPrazo' : l.atrasadas > 0 ? 'atrasadas' : 'emDia'

/** Total na ponta da pilha. Um `LabelList` no último `<Bar>` some quando esse segmento é
 *  zero (a linha só com atrasadas ficava sem número); aqui cada segmento desenha o rótulo
 *  só se for o último não-vazio da sua linha. */
const totalNaPonta = (segmento: Segmento, linhas: { emDia: number; atrasadas: number; semPrazo: number; fim: string }[]) =>
  (props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }) => {
    const linha = linhas[props.index ?? -1]
    if (!linha || ultimoSegmento(linha) !== segmento) return null
    return (
      <text
        x={Number(props.x ?? 0) + Number(props.width ?? 0) + 6}
        y={Number(props.y ?? 0) + Number(props.height ?? 0) / 2}
        dominantBaseline="central"
        fontSize={END_LABEL.fontSize}
        fill={END_LABEL.fill}
      >
        {linha.fim}
      </text>
    )
  }

/** Quem está com o quê: abertas por responsável, empilhadas pela situação do prazo. */
const QuemEstaComOQue: React.FC<{ painel: PainelDeTarefas }> = ({ painel }) => {
  const linhas = painel.hoje.porResponsavel
  const total = linhas.reduce((s, l) => ({ emDia: s.emDia + l.emDia, atrasadas: s.atrasadas + l.atrasadas, semPrazo: s.semPrazo + l.semPrazo }), { emDia: 0, atrasadas: 0, semPrazo: 0 })
  const data = linhas.map(l => ({
    ...l,
    nome: encurtar(l.rotulo, 22),
    fim: l.atrasadas > 0 ? `${l.abertas} · ${plural(l.atrasadas, 'atrasada', 'atrasadas')}` : String(l.abertas),
  }))
  return (
    <ChartCard
      title="Quem está com o quê"
      subtitle="Tarefas abertas por responsável, pela situação do prazo."
    >
      {linhas.length === 0 ? (
        <ChartEmpty>Nenhuma tarefa aberta neste recorte.</ChartEmpty>
      ) : (
        <>
          {/* A legenda leva os totais: quem não distingue as cores lê ali (§28.3). */}
          <Legend items={[
            { label: `Em dia (${total.emDia})`, color: COR_EM_DIA },
            { label: `Atrasadas (${total.atrasadas})`, color: COR_ATRASADA },
            { label: `Sem prazo (${total.semPrazo})`, color: COR_SEM_PRAZO },
          ]} />
          <div
            style={{ height: data.length * 32 + 8 }}
            role="img"
            aria-label={`Abertas por responsável: ${linhas.map(l => `${l.rotulo}, ${plural(l.abertas, 'aberta', 'abertas')} (${l.emDia} em dia, ${plural(l.atrasadas, 'atrasada', 'atrasadas')}, ${l.semPrazo} sem prazo)`).join('; ')}.`}
          >
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
              <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 108, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={150} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                <RechartsTooltip
                  cursor={TOOLTIP_CURSOR}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.rotulo ?? '')}
                  formatter={(val, name) => [plural(Number(val), 'tarefa', 'tarefas'), String(name)]}
                />
                {/* Segmentos retos, com 2px de respiro na cor da superfície entre eles. */}
                <Bar dataKey="emDia" name="Em dia" stackId="prazo" fill={COR_EM_DIA} stroke="#ffffff" strokeWidth={2} barSize={16} isAnimationActive={false}>
                  <LabelList dataKey="fim" content={totalNaPonta('emDia', data)} />
                </Bar>
                <Bar dataKey="atrasadas" name="Atrasadas" stackId="prazo" fill={COR_ATRASADA} stroke="#ffffff" strokeWidth={2} barSize={16} isAnimationActive={false}>
                  <LabelList dataKey="fim" content={totalNaPonta('atrasadas', data)} />
                </Bar>
                <Bar dataKey="semPrazo" name="Sem prazo" stackId="prazo" fill={COR_SEM_PRAZO} stroke="#ffffff" strokeWidth={2} barSize={16} isAnimationActive={false}>
                  <LabelList dataKey="fim" content={totalNaPonta('semPrazo', data)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  )
}

/** Onde está a carga: abertas por espaço, obra, origem ou prioridade. */
const OndeEstaACarga: React.FC<{
  linhas: LinhaDeCarga[]
  dimensao: DimensaoCarga
  onDimensao: (d: DimensaoCarga) => void
  abertas: number
}> = ({ linhas, dimensao, onDimensao, abertas }) => {
  const nomeDimensao = DIMENSOES.find(d => d.id === dimensao)?.label.toLowerCase() ?? ''
  const data = linhas.map(l => ({
    ...l,
    nome: encurtar(l.rotulo, 22),
    fim: l.atrasadas > 0 ? `${l.abertas} · ${plural(l.atrasadas, 'atrasada', 'atrasadas')}` : String(l.abertas),
  }))
  return (
    <ChartCard title="Onde está a carga" subtitle={`Tarefas abertas por ${nomeDimensao}, com quantas delas estão atrasadas.`}>
      <div className="mb-3">
        <Alternador rotulo="Agrupar a carga por" opcoes={DIMENSOES} valor={dimensao} onChange={onDimensao} />
      </div>
      {abertas === 0 ? (
        <ChartEmpty>Nenhuma tarefa aberta neste recorte.</ChartEmpty>
      ) : (
        <div
          style={{ height: data.length * 32 + 8 }}
          role="img"
          aria-label={`Abertas por ${nomeDimensao}: ${linhas.map(l => `${l.rotulo}, ${l.abertas}${l.atrasadas > 0 ? ` (${plural(l.atrasadas, 'atrasada', 'atrasadas')})` : ''}`).join('; ')}.`}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 108, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="nome" width={150} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
              <RechartsTooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.rotulo ?? '')}
                formatter={(val) => [plural(Number(val), 'tarefa', 'tarefas'), 'Abertas']}
              />
              <Bar dataKey="abertas" fill={SERIE_PRINCIPAL} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                <LabelList dataKey="fim" position="right" fontSize={END_LABEL.fontSize} fill={END_LABEL.fill} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

/** Estou dando conta? Criadas × concluídas por semana — forma "ênfase" do §28.4. */
const CriadasConcluidas: React.FC<{ semanas: SemanaDoPainel[]; className?: string }> = ({ semanas, className }) => {
  const comMovimento = semanas.filter(s => s.criadas + s.concluidas > 0)
  const ticks = ticksDeContagem(Math.max(0, ...semanas.flatMap(s => [s.criadas, s.concluidas])))
  const largas = semanas.length <= SEMANAS_COM_ROTULO
  return (
    <ChartCard
      className={className}
      title="Criadas × concluídas por semana"
      subtitle="Semanas de segunda a domingo, pela data de criação e pela data de conclusão. Inclui subtarefas."
    >
      {comMovimento.length === 0 ? (
        <ChartEmpty>Nenhuma tarefa criada ou concluída no período.</ChartEmpty>
      ) : comMovimento.length <= POUCAS_SEMANAS ? (
        // Uma ou duas semanas com movimento num eixo de 12: a lista diz o mesmo sem as colunas vazias.
        <ul className="flex flex-col divide-y divide-gray-100">
          {comMovimento.map(s => (
            <li key={s.inicio} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-gray-700">Semana de {s.rotulo}</span>
              <span className="text-gray-500">{plural(s.criadas, 'criada', 'criadas')}</span>
              <span className="font-medium text-gray-800 tabular-nums">{plural(s.concluidas, 'concluída', 'concluídas')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <Legend items={[{ label: 'Concluídas', color: SERIE_PRINCIPAL }, { label: 'Criadas', color: SERIE_CONTEXTO }]} />
          <div
            style={{ height: 200 }}
            role="img"
            aria-label={`Criadas e concluídas por semana: ${comMovimento.map(s => `semana de ${s.rotulo}, ${plural(s.criadas, 'criada', 'criadas')} e ${plural(s.concluidas, 'concluída', 'concluídas')}`).join('; ')}; as demais semanas sem movimento.`}
          >
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
              <BarChart accessibilityLayer={false} data={semanas} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={TICK} interval={largas ? 0 : 1} />
                <YAxis axisLine={false} tickLine={false} tick={TICK} width={28} allowDecimals={false}
                  ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
                <RechartsTooltip
                  cursor={TOOLTIP_CURSOR}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(l) => `Semana de ${l}`}
                  formatter={(val, name) => [String(val), String(name)]}
                />
                {/* Duas séries = barSize FIXO: com maxBarSize o par engorda e encosta no vizinho. */}
                <Bar dataKey="concluidas" name="Concluídas" fill={SERIE_PRINCIPAL} radius={[4, 4, 0, 0]} barSize={largas ? 10 : 5} isAnimationActive={false}>
                  {/* Valor de coluna visível nunca só no tooltip (§28.3): contagem de 1–2 dígitos cabe
                      até nas 26 semanas. Só a série principal leva rótulo. */}
                  <LabelList dataKey="concluidas" position="top" fontSize={END_LABEL.fontSize} fill={END_LABEL.fill}
                    formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
                </Bar>
                <Bar dataKey="criadas" name="Criadas" fill={SERIE_CONTEXTO} radius={[4, 4, 0, 0]} barSize={largas ? 10 : 5} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  )
}

/** Concluídas no período por responsável — fica na faixa do período para nenhum
 *  número da faixa "Hoje" mudar ao trocar as semanas (§4.5.1). */
const ConcluidasPorResponsavel: React.FC<{ painel: PainelDeTarefas; className?: string }> = ({ painel, className }) => {
  const linhas = painel.periodo.porResponsavel
  const data = linhas.map(l => ({ ...l, nome: encurtar(l.rotulo, 22) }))
  return (
    <ChartCard className={className} title="Concluídas por responsável" subtitle="Tarefas concluídas no período, pelo responsável de cada uma.">
      {linhas.length === 0 ? (
        <ChartEmpty>Nenhuma tarefa concluída no período.</ChartEmpty>
      ) : (
        <div
          style={{ height: data.length * 32 + 8 }}
          role="img"
          aria-label={`Concluídas por responsável: ${linhas.map(l => `${l.rotulo}, ${l.concluidas}`).join('; ')}.`}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="nome" width={150} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
              <RechartsTooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(_, payload) => String(payload?.[0]?.payload?.rotulo ?? '')}
                formatter={(val) => [plural(Number(val), 'tarefa', 'tarefas'), 'Concluídas']}
              />
              <Bar dataKey="concluidas" fill={SERIE_PRINCIPAL} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} label={END_LABEL} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

export default TasksDashboard
