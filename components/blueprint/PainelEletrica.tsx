import React, { useMemo, useState } from 'react';
import { UNIDADE_DE_POTENCIA } from '../../utils/blueprintRede';
import { AlertTriangle, Plus, Zap } from 'lucide-react';
import type { BlueprintModel, FaseDoCircuito, LigacaoDoCircuito, ObjectId } from '../../utils/blueprintKernel';
import { LIGACOES_DO_CIRCUITO, quadroDeCargas } from '../../utils/blueprintKernel';
import {
  HIPOTESES_PADRAO,
  preDimensionarCircuito,
  preDimensionarQuadroCompleto,
  type HipotesesEletricas,
  type PreDimensionamentoDoCircuito,
} from '../../utils/blueprintEletricaDimensionamento';
import { HipotesesDoPreDimensionamento, LinhaPreDimensionamento } from './PainelPreDimensionamento';
import PainelQuadroAlimentador from './PainelQuadroAlimentador';
import { usePersistedState } from '../ui/TableUtils';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import ActionIconButton from '../ui/ActionIconButton';
import { pontosAPreencher } from '../../utils/blueprintPotenciaPadrao';
import { proximoNumeroDeCircuito } from '../../utils/blueprintCircuitosAutomaticos';
import {
  CRITERIOS_DE_AGRUPAMENTO,
  CRITERIO_SUGERIDO,
  ROTULO_DO_CRITERIO,
  agruparPontos,
  type CriterioDeAgrupamento,
} from '../../utils/blueprintAgrupamentoDePontos';

/**
 * O painel de ELÉTRICA — quadros, circuitos e o quadro de cargas.
 *
 * ─── ⚠️ O QUE ESTA TELA NÃO FAZ, E É DECISÃO ────────────────────────────────
 *
 * Ela não sugere disjuntor, não calcula seção de fio e não aplica fator de
 * demanda normativo. Tudo o que aparece aqui foi DECLARADO por alguém, e o que
 * a tela faz é somar e contar.
 *
 * A fronteira é fina e por isso está escrita: um número "sugerido" numa tela
 * vira decisão de projeto na cabeça de quem lê, e projeto elétrico tem norma,
 * responsabilidade técnica e ART atrás. Somar é registro; decidir é projeto.
 *
 * ─── ⚠️ E ELA MOSTRA O QUE FALTA, NÃO SÓ O QUE HÁ ───────────────────────────
 *
 * Ponto sem circuito e ponto sem potência aparecem em destaque. Uma soma que
 * esconde os pontos que não entraram nela parece completa — e é a pior espécie
 * de erro, porque o número sai plausível.
 *
 * ─── A FORMA (15/09/2026) ───────────────────────────────────────────────────
 *
 * Pedido: *"transformar Quadro de cargas e NBR 5410 em tabela e aplicar o
 * padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de
 * colunas"*. A tela é `TabsBar` (§19.1) + `StandardTable` (§5.2 toolbar
 * acoplada com busca, engrenagem de colunas e autofit §6.1.2), como as
 * tabelas de RH e o Extrato:
 *
 *  - **Circuitos** — UMA tabela para todos os quadros (coluna Quadro + filtro
 *    por quadro na toolbar), uma linha por circuito com os campos DECLARADOS
 *    editáveis na célula e o pré-dimensionamento numa coluna própria;
 *  - **Pontos fora de circuito** — a pendência, com a contagem no badge da
 *    aba e a lista agrupada para ligar dali mesmo;
 *  - **Quadros** — a alimentação de cada quadro (F6);
 *  - **Conferência NBR 5410** — as regras, montadas por quem tem o estudo
 *    (`conferenciaSlot`), com faltas + avisos no badge;
 *  - **Hipóteses** — as do pré-dimensionamento.
 *
 * "Novo circuito" é a ação primária (§17) no slot da barra de abas.
 */
export type AbaDoQuadroDeCargas = 'circuitos' | 'pontos' | 'quadros' | 'conferencia' | 'hipoteses';

/** Uma linha da tabela: o circuito do quadro de cargas + o que o kernel guarda + o pré-dim. */
interface LinhaDeCircuito {
  circuitoId: ObjectId;
  quadroId: ObjectId;
  quadroNome: string;
  nome: string;
  tipo: string | null;
  tensaoV: number | null;
  ligacao: LigacaoDoCircuito;
  protecaoDR: boolean;
  disjuntorA: number | null;
  secaoMm2: number | null;
  pontos: number;
  pontosSemPotencia: number;
  potenciaW: number;
  predim: PreDimensionamentoDoCircuito | null;
}

/**
 * Larguras iniciais somam ~1230 px com um quadro só — a largura útil da tela
 * (§6.1; o autofit ajusta). ⚠️ Cada célula tem `px-6` (48 px): um campo numérico
 * precisa de ~50 px livres para "220" não sair cortado — daí 100 nas colunas de
 * número, medido no app (15/09/2026). A coluna Quadro só entra com 2+ quadros.
 */
const COLUNA_QUADRO: StandardTableColumn = { key: 'quadroNome', label: 'Quadro', width: 88 };
const COLUNAS_DE_CIRCUITO: StandardTableColumn[] = [
  { key: 'nome', label: 'Circuito', width: 200 },
  { key: 'tensaoV', label: 'Tensão (V)', width: 100, align: 'right' },
  { key: 'ligacao', label: 'Ligação', width: 124 },
  { key: 'protecaoDR', label: 'DR', width: 52, align: 'center' },
  { key: 'disjuntorA', label: 'Disjuntor (A)', width: 100, align: 'right' },
  { key: 'secaoMm2', label: 'Seção (mm²)', width: 100, align: 'right' },
  { key: 'pontos', label: 'Pontos', width: 72, align: 'right' },
  { key: 'potenciaW', label: `Carga (${UNIDADE_DE_POTENCIA})`, width: 92, align: 'right' },
  { key: 'predim', label: 'Pré-dimensionamento NBR 5410', width: 270, sortable: false },
];
const COLUNAS_COM_QUADRO: StandardTableColumn[] = [COLUNA_QUADRO, ...COLUNAS_DE_CIRCUITO];

const CAMPO_NA_CELULA =
  'w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-300 focus:border-slate-400';

export default function PainelEletrica({
  model,
  onAddCircuito,
  onCircuitoProps,
  onSelecionar,
  onLigarAoCircuito,
  onCriarCircuitoELigar,
  onExcluirCircuito,
  onAceitarSugeridas,
  onPreencherPotencias,
  hipoteses = HIPOTESES_PADRAO,
  onHipoteses,
  onQuadroProps,
  executivoSlot,
  conferenciaSlot,
  conferenciaPendencias,
}: {
  model: BlueprintModel;
  onAddCircuito: (quadroId: ObjectId, nome: string) => void;
  onCircuitoProps: (
    circuitoId: ObjectId,
    campos: {
      nome?: string;
      tipo?: string | null;
      tensaoV?: number | null;
      disjuntorA?: number | null;
      secaoMm2?: number | null;
      ligacao?: LigacaoDoCircuito | null;
      protecaoDR?: boolean | null;
      fase?: FaseDoCircuito | null;
    },
  ) => void;
  /** Hipóteses do pré-dimensionamento — ver `HipotesesEletricas`. */
  hipoteses?: HipotesesEletricas;
  onHipoteses?: (h: HipotesesEletricas) => void;
  /** F6: a alimentação do quadro (ligação, tensão, metros até a origem) — declarações. */
  onQuadroProps?: (
    quadroId: ObjectId,
    campos: { ligacao?: LigacaoDoCircuito | null; tensaoV?: number | null; alimentadorM?: number | null },
  ) => void;
  /** F7: o projeto executivo elétrico com ART, montado por quem tem o estudo em mãos. */
  executivoSlot?: React.ReactNode;
  /** A conferência NBR 5410 (aba própria), montada por quem tem o estudo e o pavimento. */
  conferenciaSlot?: React.ReactNode;
  /** O que vai no badge da aba de conferência. */
  conferenciaPendencias?: { faltas: number; avisos: number };
  onSelecionar?: (id: string) => void;
  /** Liga um ponto solto a um circuito, direto daqui. */
  onLigarAoCircuito?: (terminalId: ObjectId, circuitoId: ObjectId) => void;
  /**
   * Exclui um circuito (14/09/2026: "como exclui circuito do quadro de
   * cargas?" — não havia como). Os pontos e eletrodutos dele ficam SEM
   * circuito, não são apagados; quem confirma é o editor, que conhece a
   * contagem e o `useConfirm`.
   */
  onExcluirCircuito?: (circuitoId: ObjectId) => void;
  /**
   * "Criar novo…" no seletor (13/09/2026): cria o circuito no quadro e já liga
   * os pontos, sem ir ao quadro de cargas criar antes. Quem implementa é o
   * editor (o id do circuito novo só existe depois do comando).
   */
  onCriarCircuitoELigar?: (quadroId: ObjectId, nome: string, terminalIds: ObjectId[]) => void;
  /** Tira a marca de SUGERIDA de todos os pontos — "onde estão está bom". */
  onAceitarSugeridas?: () => void;
  /**
   * Preenche a potência da NBR 5410 nos pontos que estão SEM potência (os
   * criados antes do padrão de 13/09/2026). Nunca sobrescreve o declarado.
   */
  onPreencherPotencias?: () => void;
}) {
  const cargas = quadroDeCargas(model);
  /** A aba aberta. Estado local: a tela nasce em Circuitos a cada abertura. */
  const [aba, setAba] = useState<AbaDoQuadroDeCargas>('circuitos');
  /** Filtro por quadro na toolbar da tabela ('' = todos). */
  const [quadroFiltro, setQuadroFiltro] = useState<ObjectId | ''>('');
  /**
   * COMO a lista de pontos fora de circuito se agrupa (13/09/2026). Escolha
   * do usuário, persistida; "ambiente" é a sugestão — é como um projeto
   * elétrico se lê (cômodo a cômodo), e é a divisão que a NBR 5410 usa.
   */
  const [agrupamento, setAgrupamento] = usePersistedState<CriterioDeAgrupamento>(
    'blueprint:agruparPontosSoltos',
    CRITERIO_SUGERIDO,
  );
  const gruposDeSoltos = agruparPontos(model, cargas.soltos, agrupamento);
  /**
   * A POTÊNCIA de cada ponto solto (13/09/2026: "incluir coluna com Potência
   * (VA), já que cada ponto vem com VA definido por padrão pela NBR 5410").
   * Lida do terminal, nunca somada em silêncio: ponto sem potência mostra "—"
   * e o grupo diz quantos ficaram fora da soma.
   */
  const potenciaDoPonto = new Map((model.terminais ?? []).map((t) => [t.id, t.potenciaW ?? null]));
  const somaDoGrupo = (itens: readonly { terminalId: string }[]) => {
    let soma = 0;
    let sem = 0;
    for (const s of itens) {
      const p = potenciaDoPonto.get(s.terminalId) ?? null;
      if (p == null) sem++;
      else soma += p;
    }
    return { soma, sem };
  };
  const va = (n: number) => `${n.toLocaleString('pt-BR')} ${UNIDADE_DE_POTENCIA}`;
  /**
   * Quantos pontos a norma sabe valorar e estão sem potência — o LEGADO
   * ("verifique por que alguns pontos não têm potência", 13/09/2026: eram
   * anteriores ao padrão). O botão preenche todos de uma vez.
   */
  const semPotenciaPreenchivel = pontosAPreencher(model, null);
  const botaoPreencher =
    onPreencherPotencias && semPotenciaPreenchivel > 0 ? (
      <button
        type="button"
        onClick={onPreencherPotencias}
        title="Tomadas e luzes sem potência recebem o padrão da NBR 5410 (100/600 VA; luz pelo mínimo do cômodo), e tomadas de banheiro/cozinha abaixo de 600 VA sobem ao mínimo enquanto houver vaga nos três pontos. O resto não é tocado."
        className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
      >
        Preencher potência pela norma ({semPotenciaPreenchivel})
      </button>
    ) : null;
  /**
   * O mini-formulário de "Criar novo…" — para QUAIS pontos e com que nome
   * sugerido. Um só de cada vez: abrir outro fecha o anterior. Com
   * `terminalIds` vazio é o "Novo circuito" da barra de abas: cria sem ligar.
   */
  const [criando, setCriando] = useState<{ terminalIds: ObjectId[]; sugestao: string } | null>(null);
  const quadros = model.quadros ?? [];
  /** "C3", ou "C3 — Ambiente 1" quando é o grupo inteiro: o próximo número livre no quadro. */
  const nomeSugerido = (quadroId: ObjectId | undefined, sufixo: string | null) => {
    // A mesma conta dos Circuitos automáticos — os dois caminhos numeram igual.
    const n = proximoNumeroDeCircuito(model, quadroId ?? null);
    return sufixo ? `C${n} — ${sufixo}` : `C${n}`;
  };
  const NOVO = '__novo__';
  /** Só há o que criar com um quadro para o circuito nascer e alguém para criá-lo. */
  const podeCriar = quadros.length > 0 && !!onCriarCircuitoELigar;
  const mesmosIds = (a: readonly ObjectId[], b: readonly ObjectId[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  // ⚠️ A pendência das SUGERIDAS aparece com ou sem quadro: são pontos que o
  // sistema pôs e ninguém confirmou. Ver `Terminal.sugerida`.
  const sugeridas = (model.terminais ?? []).filter((t) => t.sugerida).length;
  const avisoSugeridas =
    sugeridas > 0 ? (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-blue-700">
        <span>
          <strong>{sugeridas}</strong> {sugeridas === 1 ? 'tomada sugerida' : 'tomadas sugeridas'} pelo
          sistema {sugeridas === 1 ? 'aguarda' : 'aguardam'} posição — mover confirma.
        </span>
        {onAceitarSugeridas && (
          <button
            type="button"
            onClick={onAceitarSugeridas}
            title="Confirma todas onde estão — a marca de sugerida some"
            className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Aceitar todas
          </button>
        )}
      </p>
    ) : null;

  /**
   * As LINHAS da tabela — todos os circuitos de todos os quadros. Memoizado
   * pela identidade: o `StandardTable` ordena e busca em cima deste array.
   */
  const linhas = useMemo<LinhaDeCircuito[]>(() => {
    const porId = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
    return cargas.quadros.flatMap((q) =>
      q.circuitos.map((c) => {
        const circuito = porId.get(c.circuitoId) ?? null;
        return {
          circuitoId: c.circuitoId,
          quadroId: q.quadroId,
          quadroNome: q.nome,
          nome: c.nome,
          tipo: circuito?.tipo ?? null,
          tensaoV: c.tensaoV ?? null,
          ligacao: circuito?.ligacao ?? 'FN',
          protecaoDR: circuito?.protecaoDR === true,
          disjuntorA: c.disjuntorA ?? null,
          secaoMm2: c.secaoMm2 ?? null,
          pontos: c.pontos,
          pontosSemPotencia: c.pontosSemPotencia,
          potenciaW: c.potenciaW,
          predim: circuito ? preDimensionarCircuito(model, circuito, hipoteses) : null,
        };
      }),
    );
  }, [model, cargas, hipoteses]);
  const linhasVisiveis = useMemo(
    () => (quadroFiltro ? linhas.filter((l) => l.quadroId === quadroFiltro) : linhas),
    [linhas, quadroFiltro],
  );
  const totais = useMemo(
    () =>
      linhasVisiveis.reduce(
        (t, l) => ({
          pontos: t.pontos + l.pontos,
          potenciaW: t.potenciaW + l.potenciaW,
          semPotencia: t.semPotencia + l.pontosSemPotencia,
        }),
        { pontos: 0, potenciaW: 0, semPotencia: 0 },
      ),
    [linhasVisiveis],
  );

  /**
   * SEM QUADRO: a aba Circuitos explica onde criar um — e as outras abas
   * continuam (a conferência de ambientes e os pontos soltos não dependem de
   * quadro). ⚠️ Os pontos soltos aparecem AQUI TAMBÉM: sem isto, um desenho
   * com tomadas e sem quadro escondia a pendência por inteiro.
   */
  const semQuadro = cargas.quadros.length === 0;
  const avisoSemQuadro = (
    <div className="space-y-1.5 rounded-[10px] border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">
        Nenhum quadro de distribuição ainda. Use <strong>Componentes → Instalações →
        Quadro de distribuição</strong> para colocar um; os circuitos nascem dele.
      </p>
      {cargas.pontosSemCircuito > 0 && (
        <p className="text-sm text-amber-700">
          E há <strong>{cargas.pontosSemCircuito}</strong>{' '}
          {cargas.pontosSemCircuito === 1 ? 'ponto elétrico' : 'pontos elétricos'} esperando
          circuito:{' '}
          {cargas.soltos
            .map((s) => {
              const p = potenciaDoPonto.get(s.terminalId);
              return p == null ? `${s.rotulo} (sem potência)` : `${s.rotulo} (${va(p)})`;
            })
            .join(', ')}
          .
        </p>
      )}
    </div>
  );

  /** Todos os circuitos, com o quadro junto — "QDC · C1" é o que se reconhece. */
  const todosOsCircuitos = (model.circuitos ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    quadro: (model.quadros ?? []).find((q) => q.id === c.quadroId)?.nome ?? '',
  }));

  const pendenciasDaConferencia = (conferenciaPendencias?.faltas ?? 0) + (conferenciaPendencias?.avisos ?? 0);
  const abas: TabsBarItem<AbaDoQuadroDeCargas>[] = [
    { id: 'circuitos', label: 'Circuitos', badge: linhas.length },
    {
      id: 'pontos',
      label: 'Pontos fora de circuito',
      badge: cargas.pontosSemCircuito,
      icon: cargas.pontosSemCircuito > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : undefined,
    },
    { id: 'quadros', label: 'Quadros', badge: cargas.quadros.length },
    ...(conferenciaSlot ? [{ id: 'conferencia' as const, label: 'Conferência NBR 5410', badge: pendenciasDaConferencia }] : []),
    ...(onHipoteses ? [{ id: 'hipoteses' as const, label: 'Hipóteses' }] : []),
  ];

  const numeroOuNulo = (v: string) => (v === '' ? null : Number(v));

  const celula = (key: string, l: LinhaDeCircuito): React.ReactNode => {
    switch (key) {
      case 'quadroNome':
        return (
          <span className="block truncate text-sm text-gray-700" title={l.quadroNome}>
            {l.quadroNome}
          </span>
        );
      case 'nome':
        return (
          <input
            type="text"
            value={l.nome}
            onChange={(e) => onCircuitoProps(l.circuitoId, { nome: e.target.value })}
            aria-label="Nome do circuito"
            title={l.nome}
            className={CAMPO_NA_CELULA}
          />
        );
      // ⚠️ Campos DECLARADOS, e vazios quando ninguém informou — nunca um valor
      // de partida "recomendado". A sugestão vive na coluna de pré-dimensionamento.
      case 'tensaoV':
        return (
          <input
            type="number"
            value={l.tensaoV ?? ''}
            onChange={(e) => onCircuitoProps(l.circuitoId, { tensaoV: numeroOuNulo(e.target.value) })}
            placeholder="V"
            aria-label={`Tensão do circuito ${l.nome}, em volts`}
            className={`${CAMPO_NA_CELULA} text-right`}
          />
        );
      case 'ligacao':
        return (
          <select
            value={l.ligacao}
            onChange={(e) => onCircuitoProps(l.circuitoId, { ligacao: e.target.value as LigacaoDoCircuito })}
            aria-label={`Ligação do circuito ${l.nome}`}
            className={CAMPO_NA_CELULA}
          >
            {LIGACOES_DO_CIRCUITO.map((lig) => (
              <option key={lig} value={lig}>
                {lig === 'FN' ? 'F-N' : lig === 'FF' ? 'F-F' : 'trifásico'}
              </option>
            ))}
          </select>
        );
      case 'protecaoDR':
        return (
          <input
            type="checkbox"
            checked={l.protecaoDR}
            onChange={(e) => onCircuitoProps(l.circuitoId, { protecaoDR: e.target.checked })}
            aria-label={`Proteção DR do circuito ${l.nome}`}
            title="Dispositivo DR de 30 mA declarado neste circuito (5.1.3.2.2)"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        );
      case 'disjuntorA':
        return (
          <input
            type="number"
            value={l.disjuntorA ?? ''}
            onChange={(e) => onCircuitoProps(l.circuitoId, { disjuntorA: numeroOuNulo(e.target.value) })}
            aria-label={`Disjuntor do circuito ${l.nome}, em ampères`}
            className={`${CAMPO_NA_CELULA} text-right`}
          />
        );
      case 'secaoMm2':
        return (
          <input
            type="number"
            step="0.5"
            value={l.secaoMm2 ?? ''}
            onChange={(e) => onCircuitoProps(l.circuitoId, { secaoMm2: numeroOuNulo(e.target.value) })}
            aria-label={`Seção do circuito ${l.nome}, em mm²`}
            className={`${CAMPO_NA_CELULA} text-right`}
          />
        );
      case 'pontos':
        return (
          <span className="text-sm tabular-nums text-gray-700">
            {l.pontos}
            {l.pontosSemPotencia > 0 && (
              <span className="ml-1 text-amber-700" title={`${l.pontosSemPotencia} sem potência informada`}>
                ⚠
              </span>
            )}
          </span>
        );
      case 'potenciaW':
        return <span className="text-sm tabular-nums text-gray-700">{l.potenciaW.toLocaleString('pt-BR')}</span>;
      case 'predim':
        // As DECLARAÇÕES (tensão, ligação, DR) ficam nas colunas ao lado; aqui o
        // que a norma pede para elas. Declarado e calculado lado a lado, nunca
        // um no lugar do outro (item 6, 13/09/2026).
        return l.predim ? (
          <div className="-mx-2 -mb-1.5">
            <LinhaPreDimensionamento
              r={l.predim}
              hipoteses={hipoteses}
              onUsarSugerido={(campos) => onCircuitoProps(l.circuitoId, campos)}
            />
          </div>
        ) : null;
      default:
        return null;
    }
  };

  const valorParaOrdenar = (key: string, l: LinhaDeCircuito) => {
    switch (key) {
      case 'protecaoDR':
        return l.protecaoDR;
      case 'predim':
        return l.predim?.achados.filter((a) => a.nivel === 'FALTA').length ?? null;
      default:
        return (l as unknown as Record<string, string | number | null>)[key];
    }
  };

  const botaoNovoCircuito = (
    <button
      type="button"
      onClick={() => setCriando({ terminalIds: [], sugestao: nomeSugerido(quadros[0]?.id, null) })}
      disabled={semQuadro}
      title={semQuadro ? 'Insira um Quadro de distribuição primeiro — o circuito nasce dele' : undefined}
      className="flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
    >
      <Plus className="h-[15px] w-[15px]" />
      Novo circuito
    </button>
  );

  return (
    <div>
      {(avisoSugeridas || botaoPreencher) && (
        <div className="mb-3 space-y-1.5">
          {avisoSugeridas}
          {botaoPreencher && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-amber-800">
              <span>
                <strong>{semPotenciaPreenchivel}</strong>{' '}
                {semPotenciaPreenchivel === 1 ? 'ponto' : 'pontos'} sem potência ou abaixo do mínimo da
                norma — anteriores ao padrão, ou criados antes de o cômodo receber o tipo.
              </span>
              {botaoPreencher}
            </p>
          )}
        </div>
      )}

      <TabsBar tabs={abas} value={aba} onChange={setAba}>
        {botaoNovoCircuito}
      </TabsBar>

      {criando && criando.terminalIds.length === 0 && (
        <div className="mb-3">
          <FormularioNovoCircuito
            quadros={quadros}
            sugestao={criando.sugestao}
            quantos={0}
            onCriar={(quadroId, nome) => {
              onAddCircuito(quadroId, nome);
              setCriando(null);
            }}
            onCancelar={() => setCriando(null)}
          />
        </div>
      )}

      {aba === 'circuitos' && semQuadro && avisoSemQuadro}

      {aba === 'circuitos' && !semQuadro && (
        <StandardTable<LinhaDeCircuito>
          columns={cargas.quadros.length > 1 ? COLUNAS_COM_QUADRO : COLUNAS_DE_CIRCUITO}
          storageKey="blueprint:quadroDeCargas"
          rows={linhasVisiveis}
          rowKey={(l) => l.circuitoId}
          renderCell={celula}
          sortValue={valorParaOrdenar}
          searchText={(l) => `${l.quadroNome} ${l.nome} ${l.tipo ?? ''}`}
          searchPlaceholder="Buscar circuito..."
          filters={
            cargas.quadros.length > 1 ? (
              <select
                value={quadroFiltro}
                onChange={(e) => setQuadroFiltro(e.target.value)}
                aria-label="Filtrar por quadro"
                className="h-9 rounded-[6px] border border-gray-200 bg-white px-2 text-sm text-gray-700"
              >
                <option value="">Todos os quadros</option>
                {cargas.quadros.map((q) => (
                  <option key={q.quadroId} value={q.quadroId}>
                    {q.nome}
                  </option>
                ))}
              </select>
            ) : undefined
          }
          actions={
            onExcluirCircuito
              ? {
                  width: 72,
                  render: (l) => (
                    // A LIXEIRA do circuito (14/09/2026). Os pontos ficam sem
                    // circuito — o editor confirma quando há.
                    <ActionIconButton
                      kind="delete"
                      onClick={() => onExcluirCircuito(l.circuitoId)}
                      aria-label={`Excluir circuito ${l.nome}`}
                      title={
                        l.pontos > 0
                          ? `Excluir o circuito ${l.nome} — ${l.pontos === 1 ? 'o ponto dele fica' : `os ${l.pontos} pontos dele ficam`} sem circuito`
                          : `Excluir o circuito ${l.nome}`
                      }
                    />
                  ),
                }
              : undefined
          }
          empty={{
            title: 'Sem circuitos ainda',
            subtitle: 'Crie um em "Novo circuito", ou deixe Instalações › Circuitos automáticos propor pelos pontos.',
          }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total {quadroFiltro ? 'do quadro' : 'dos quadros'}</span>
                  <span className="tabular-nums">
                    {totais.pontos} {totais.pontos === 1 ? 'ponto' : 'pontos'} · {va(totais.potenciaW)}
                  </span>
                </span>
              </td>
            </tr>
          )}
          footer={
            totais.semPotencia > 0 || cargas.pontosSemCircuito > 0 ? (
              <div className="space-y-0.5 border-t border-gray-100 px-6 py-2.5 text-xs text-amber-700">
                {totais.semPotencia > 0 && (
                  <p>
                    ⚠ {totais.semPotencia} {totais.semPotencia === 1 ? 'ponto entra' : 'pontos entram'} na contagem e{' '}
                    <strong>não</strong> na carga — sem potência informada. A soma acima está incompleta.
                  </p>
                )}
                {/* ⚠️ A pendência dos pontos soltos aparece TAMBÉM aqui, junto da
                    soma: uma soma que esconde os pontos que não entraram nela
                    parece completa. */}
                {cargas.pontosSemCircuito > 0 && (
                  <p>
                    ⚠ {cargas.pontosSemCircuito} {cargas.pontosSemCircuito === 1 ? 'ponto elétrico está' : 'pontos elétricos estão'} fora de
                    circuito e não {cargas.pontosSemCircuito === 1 ? 'entra' : 'entram'} em soma nenhuma —{' '}
                    <button type="button" onClick={() => setAba('pontos')} className="font-medium underline hover:text-amber-900">
                      ver a lista
                    </button>
                    .
                  </p>
                )}
              </div>
            ) : undefined
          }
          maxHeight="none"
        />
      )}

      {aba === 'pontos' &&
        (cargas.pontosSemCircuito === 0 ? (
          <div className="rounded-[10px] border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            Nenhum ponto fora de circuito. Todo ponto elétrico deste desenho entra na soma de algum circuito.
          </div>
        ) : (
          <div className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-sm">
            <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-slate-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              <span>
                <strong>{cargas.pontosSemCircuito}</strong>{' '}
                {cargas.pontosSemCircuito === 1 ? 'ponto elétrico' : 'pontos elétricos'} fora de
                circuito.
                <span className="mt-0.5 block text-xs text-slate-600">
                  Eles não entram em soma nenhuma.
                </span>
                {/* ⚠️ A LISTA, e não só o número.
                    O aviso dizia "selecione o ponto e escolha o circuito no painel
                    dele" — e quem lia tinha de ACHAR o ponto no desenho, que é
                    justamente o que ninguém consegue quando ele está fora de
                    circuito por ter passado despercebido. Relato de uso, 09/09/2026:
                    "porém não encontrou como conectar a um circuito". */}
                {/* O CRITÉRIO é do usuário (13/09/2026): "ofereça a forma que ele
                    quer agrupar; sugira por ambiente e ele decide". */}
                <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                  Agrupar por
                  <select
                    value={agrupamento}
                    onChange={(e) => setAgrupamento(e.target.value as CriterioDeAgrupamento)}
                    aria-label="Agrupar os pontos fora de circuito por"
                    className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                  >
                    {CRITERIOS_DE_AGRUPAMENTO.map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_DO_CRITERIO[c]}
                        {c === CRITERIO_SUGERIDO ? ' (sugerido)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {/* As colunas, nomeadas uma vez: ponto · potência · circuito. */}
                <span className="mt-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                  <span className="min-w-0 flex-1">Ponto</span>
                  <span className="w-20 shrink-0 text-right">Potência</span>
                  <span className="w-40 shrink-0">Circuito</span>
                </span>
                <span className="mt-1 block space-y-2">
                  {gruposDeSoltos.map((g) => (
                    <span key={g.chave} className="block space-y-1">
                      {g.titulo && (
                        <span className="flex items-center gap-1.5 border-b border-amber-200 pb-0.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {g.titulo}
                            <span className="ml-1 font-normal normal-case tracking-normal text-slate-500">
                              ({g.itens.length})
                            </span>
                          </span>
                          {/* A SOMA do grupo — e quantos ficaram fora dela. */}
                          {(() => {
                            const { soma, sem } = somaDoGrupo(g.itens);
                            return (
                              <span
                                className="w-20 shrink-0 text-right text-sm font-semibold normal-case tabular-nums tracking-normal text-slate-700"
                                title={sem > 0 ? `${sem} sem potência — fora da soma` : 'Soma das potências declaradas'}
                              >
                                {va(soma)}
                                {sem > 0 && <span className="text-amber-700"> ⚠</span>}
                              </span>
                            );
                          })()}
                          {/* Ligar o GRUPO inteiro num gesto: é o caso comum — os
                              pontos de um cômodo vão para o mesmo circuito. */}
                          {(todosOsCircuitos.length > 0 || podeCriar) && g.itens.length > 1 && (
                            <select
                              value=""
                              aria-label={`Circuito de todos em ${g.titulo}`}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                if (e.target.value === NOVO) {
                                  setCriando({
                                    terminalIds: g.itens.map((s) => s.terminalId),
                                    sugestao: nomeSugerido(quadros[0]?.id, g.titulo),
                                  });
                                  return;
                                }
                                for (const s of g.itens) onLigarAoCircuito?.(s.terminalId, e.target.value);
                              }}
                              className="w-40 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-sm"
                            >
                              <option value="">Ligar todos a…</option>
                              {todosOsCircuitos.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.quadro} · {c.nome}
                                </option>
                              ))}
                              {podeCriar && <option value={NOVO}>Criar novo…</option>}
                            </select>
                          )}
                        </span>
                      )}
                      {criando && g.itens.length > 1 && mesmosIds(criando.terminalIds, g.itens.map((s) => s.terminalId)) && (
                        <FormularioNovoCircuito
                          quadros={quadros}
                          sugestao={criando.sugestao}
                          quantos={criando.terminalIds.length}
                          onCriar={(quadroId, nome) => {
                            onCriarCircuitoELigar?.(quadroId, nome, criando.terminalIds);
                            setCriando(null);
                          }}
                          onCancelar={() => setCriando(null)}
                        />
                      )}
                      {g.itens.map((s) => (
                        <React.Fragment key={s.terminalId}>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelecionar?.(s.terminalId)}
                            title="Selecionar este ponto no desenho"
                            className="min-w-0 flex-1 truncate text-left text-sm text-blue-700 hover:underline"
                          >
                            {s.rotulo}
                          </button>
                          <span
                            className={`w-20 shrink-0 text-right text-sm tabular-nums ${
                              potenciaDoPonto.get(s.terminalId) == null ? 'text-amber-700' : 'text-slate-700'
                            }`}
                            title={
                              potenciaDoPonto.get(s.terminalId) == null
                                ? 'Sem potência declarada — informe no painel do ponto'
                                : 'Potência declarada (o padrão da NBR 5410 veio ao criar; editável no ponto)'
                            }
                          >
                            {potenciaDoPonto.get(s.terminalId) == null ? '—' : va(potenciaDoPonto.get(s.terminalId) as number)}
                          </span>
                          {todosOsCircuitos.length === 0 && !podeCriar ? (
                            <span className="shrink-0 text-xs text-slate-500">
                              crie um circuito em “Novo circuito”
                            </span>
                          ) : (
                            <select
                              value=""
                              aria-label={`Circuito de ${s.rotulo}`}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                if (e.target.value === NOVO) {
                                  setCriando({ terminalIds: [s.terminalId], sugestao: nomeSugerido(quadros[0]?.id, null) });
                                  return;
                                }
                                onLigarAoCircuito?.(s.terminalId, e.target.value);
                              }}
                              className="w-40 shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-sm"
                            >
                              <option value="">Ligar a…</option>
                              {todosOsCircuitos.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.quadro} · {c.nome}
                                </option>
                              ))}
                              {/* "Criar novo…" (13/09/2026): o circuito que ainda não existe
                                  nasce daqui, sem ir ao quadro criar antes. */}
                              {podeCriar && <option value={NOVO}>Criar novo…</option>}
                            </select>
                          )}
                        </span>
                        {criando && criando.terminalIds.length === 1 && criando.terminalIds[0] === s.terminalId && (
                          <FormularioNovoCircuito
                            quadros={quadros}
                            sugestao={criando.sugestao}
                            quantos={1}
                            onCriar={(quadroId, nome) => {
                              onCriarCircuitoELigar?.(quadroId, nome, criando.terminalIds);
                              setCriando(null);
                            }}
                            onCancelar={() => setCriando(null)}
                          />
                        )}
                        </React.Fragment>
                      ))}
                    </span>
                  ))}
                </span>
              </span>
            </p>
          </div>
        ))}

      {aba === 'quadros' && semQuadro && avisoSemQuadro}

      {aba === 'quadros' && !semQuadro && (
        <div className="space-y-3">
          {cargas.quadros.map((q) => {
            const quadro = quadros.find((x) => x.id === q.quadroId);
            const pq = onQuadroProps && q.circuitos.length > 0 ? preDimensionarQuadroCompleto(model, q.quadroId, hipoteses) : null;
            return (
              <section key={q.quadroId} aria-label={`Quadro ${q.nome}`} className="rounded-[10px] border border-gray-100 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
                  <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                  {/* ⚠️ TEXTO, e não campo. O nome é PROPRIEDADE da peça, e propriedade
                      de peça tem um lugar só: "Quadro selecionado", em Componentes.
                      Editável nos dois seria duas verdades sobre o mesmo campo. */}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{q.nome}</span>
                  <span className="text-xs tabular-nums text-gray-500">
                    {q.circuitos.length} {q.circuitos.length === 1 ? 'circuito' : 'circuitos'} · {q.pontos}{' '}
                    {q.pontos === 1 ? 'ponto' : 'pontos'} · {va(q.potenciaW)}
                  </span>
                  {onSelecionar && (
                    <button
                      type="button"
                      onClick={() => onSelecionar(q.quadroId)}
                      className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                    >
                      ver no desenho
                    </button>
                  )}
                </div>
                <div className="px-4 py-3">
                  {q.circuitos.length === 0 ? (
                    <p className="text-sm text-gray-500">Sem circuitos ainda.</p>
                  ) : pq && quadro && onQuadroProps ? (
                    // F6 — o QUADRO: alimentação declarada, demanda, alimentador, fases.
                    <PainelQuadroAlimentador
                      q={pq}
                      ligacaoDeclarada={quadro.ligacao ?? null}
                      tensaoDeclarada={quadro.tensaoV ?? null}
                      alimentadorM={quadro.alimentadorM ?? null}
                      onQuadro={(campos) => onQuadroProps(q.quadroId, campos)}
                      fasesDosCircuitos={(model.circuitos ?? [])
                        .filter((c) => c.quadroId === q.quadroId)
                        .map((c) => ({ circuitoId: c.id, nome: c.nome, ligacao: c.ligacao ?? 'FN', fase: c.fase ?? null }))}
                      onFase={(circuitoId, fase) => onCircuitoProps(circuitoId, { fase })}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">
                      {q.pontos} {q.pontos === 1 ? 'ponto' : 'pontos'} · {va(q.potenciaW)}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {aba === 'conferencia' && conferenciaSlot && (
        <div className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-sm">{conferenciaSlot}</div>
      )}

      {aba === 'hipoteses' && onHipoteses && (
        <div className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-sm">
          <HipotesesDoPreDimensionamento hipoteses={hipoteses} onChange={onHipoteses} />
        </div>
      )}

      {executivoSlot}

      {!semQuadro && (
      <p className="mt-3 text-xs text-slate-500">
        Disjuntor e seção são <strong>o que você declarou</strong>. O pré-dimensionamento ao lado
        de cada circuito é o que a NBR 5410 pede para a carga declarada, com as hipóteses
        escritas — ele sugere; quem grava é você. Dimensionamento é do responsável técnico.
      </p>
      )}
    </div>
  );
}

/**
 * O mini-formulário de "Criar novo…" (13/09/2026): nome sugerido (o próximo
 * número livre, com o ambiente quando é o grupo inteiro), o quadro quando há
 * mais de um, e "Criar e ligar". Nasce onde o seletor foi acionado — abaixo do
 * ponto ou do cabeçalho do grupo — para não obrigar a procurar o quadro de
 * cargas e voltar. Com `quantos` 0 é o "Novo circuito" da barra: só cria.
 */
function FormularioNovoCircuito({
  quadros,
  sugestao,
  quantos,
  onCriar,
  onCancelar,
}: {
  quadros: readonly { id: ObjectId; nome: string }[];
  sugestao: string;
  quantos: number;
  onCriar: (quadroId: ObjectId, nome: string) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(sugestao);
  const [quadroId, setQuadroId] = useState<ObjectId>(quadros[0]?.id ?? '');
  const podeCriar = !!nome.trim() && !!quadroId;
  return (
    <span
      role="group"
      aria-label="Novo circuito"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5"
    >
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && podeCriar) onCriar(quadroId, nome.trim());
          if (e.key === 'Escape') onCancelar();
        }}
        autoFocus
        aria-label="Nome do circuito a criar"
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm"
      />
      {quadros.length > 1 && (
        <select
          value={quadroId}
          onChange={(e) => setQuadroId(e.target.value)}
          aria-label="Quadro do novo circuito"
          className="shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
        >
          {quadros.map((q) => (
            <option key={q.id} value={q.id}>
              {q.nome}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => onCriar(quadroId, nome.trim())}
        disabled={!podeCriar}
        className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-blue-600 px-2 py-0.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
        {quantos > 1 ? `Criar e ligar ${quantos}` : quantos === 1 ? 'Criar e ligar' : 'Criar circuito'}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-sm text-slate-600 hover:bg-white"
      >
        Cancelar
      </button>
    </span>
  );
}
