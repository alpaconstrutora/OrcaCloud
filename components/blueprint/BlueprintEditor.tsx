import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  MousePointer2,
  Minus,
  Eye,
  Plus,
  DoorOpen,
  Redo2,
  Undo2,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calculator,
  Pencil,
  Grid3x3,
  Hexagon,
  RectangleHorizontal,
  MoveHorizontal,
  Ruler,
  Tag,
  Square,
  Spline,
  Hash,
  Move,
  MoveDiagonal,
  LandPlot,
  Waypoints,
  CornerDownRight,
  Grid2x2,
  PaintBucket,
  Palette,
  Contrast,
  Copy,
  ClipboardPaste,
  Layers,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import MenuExibir, { type ItemDeExibicao } from './MenuExibir';
import MenuComponentes from './MenuComponentes';
import ModalSobreposicao, { type EscolhaSobreposicao } from './ModalSobreposicao';
import PainelComponentes from './PainelComponentes';
import { linhasDeComponentesPorNivel } from '../../utils/blueprintComponentes';
import PainelEstruturaSelecionada from './PainelEstruturaSelecionada';
import PainelAguaSelecionada from './PainelAguaSelecionada';
import { contornosParaTelhado } from '../../utils/blueprintTelhadoContorno';
import { useBlueprintEditor, type BlueprintTool } from '../../hooks/useBlueprintEditor';
import BlueprintCanvas, { rotuloPasso, type AjustePonta } from './BlueprintCanvas';
import ElevationCanvas from './ElevationCanvas';
import Blueprint3DTab from './Blueprint3DTab';
import PainelPavimentos from './PainelPavimentos';
import SeletorDeVista, {
  type VistaBlueprint,
  DIRECAO_DA_VISTA,
  ehVistaDeElevacao,
} from './SeletorDeVista';
import PainelOrcamento from './PainelOrcamento';
import PainelVersoes from './PainelVersoes';
import ControlesDeFundo, { ResumoDaAfericao } from './ControlesDeFundo';
import SecaoAccordion from './SecaoAccordion';
import { usePainelRedimensionavel } from './LarguraDoPainel';
import PainelMedicoes from './PainelMedicoes';
import PainelParedeSelecionada from './PainelParedeSelecionada';
import PainelCamadasParede from './PainelCamadasParede';
import PainelSelecaoMultipla from './PainelSelecaoMultipla';
import PainelGerarParedes from './PainelGerarParedes';
import PainelTerreno from './PainelTerreno';
import PainelZonaUrbanistica from './PainelZonaUrbanistica';
import QuadroDeDivisas from './QuadroDeDivisas';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgContext } from '../../hooks/useOrgContext';
import { empreendimentoService } from '../../services/empreendimentoService';
import type { Empreendimento } from '../../types/empreendimento';
import {
  areaEmM2,
  calcularAproveitamento,
  divergente,
  envelopeConstrutivo,
  linhasDoQuadro,
  medidasPorPapel,
  medirTerreno,
  papeisSugeridos,
  ROTULO_DO_PAPEL,
} from '../../utils/blueprintTerreno';
import {
  comandoDeColagem,
  copiarSelecao,
  type AreaDeTransferencia,
  type DestinoDeColagem,
} from '../../utils/blueprintAreaDeTransferencia';
import { useBlueprintMedicoes } from '../../hooks/useBlueprintMedicoes';
import { useBlueprintZonaUrbanistica } from '../../hooks/useBlueprintZonaUrbanistica';
import { useBlueprintUnderlay } from '../../hooks/useBlueprintUnderlay';
import type { PontoPx } from '../../utils/blueprintUnderlay';
import type { ParedeGerada, PortaGerada } from '../../utils/blueprintVetor';
import { extrairSegmentosPdf } from '../../services/blueprintUnderlayService';
import type { BlueprintQuantitySnapshot, BlueprintStudy } from '../../types/blueprint';
import {
  computeAndStoreQuantities,
  getQuantitySnapshot,
  listSnapshots,
} from '../../services/blueprintService';
import {
  POLITICA_PADRAO,
  KernelError,
  applyBatch,
  areCollinear,
  cantoEntreEixos,
  cantosEncostados,
  pontasSoltasDoNivel,
  juntasParalelasSemCanto,
  computeQuantities,
  deslocamentoParaManterFace,
  somaDasCamadas,
  type CamadaParede,
  encostosSemJuncao,
  formatarQuantidade,
  isFreeWallEnd,
  faceInternaMm,
  areaRecuada,
  areaConstruidaMm2,
  pontaEsticada,
  point,
  roundToMm,
  verticeDeAcompanhamento,
  FORMA_ESTRUTURAL,
  nomeDoTipoEstrutural,
  pontasEncurtadasPorEstrutura,
  sobreposicoesDe,
  prefixoDeRotulo,
  type BoundaryKind,
  type AlinhamentoParede,
  type Command,
  type Opening,
  type Point,
  type StructuralKind,
  type Wall,
} from '../../utils/blueprintKernel';

/**
 * Tela do editor de plantas (épico E3).
 *
 * A camada FOCÁVEL do "híbrido" do Spike B mora aqui: o canvas é opaco para
 * leitor de tela, então a barra de ferramentas, a lista de ambientes e o estado
 * do salvamento são DOM de verdade — navegáveis por teclado e anunciáveis. O
 * canvas cuida da massa de geometria; o DOM cuida de tudo que precisa ter foco.
 */

/**
 * Inverte o lado do traçado. Do EIXO ele passa a desenhar pela face, porque "o
 * outro lado do eixo" não existe: quem aperta a tecla está pedindo um lado, e
 * devolver o mesmo estado faria a tecla parecer quebrada.
 */
function inverterLado(atual: AlinhamentoParede): AlinhamentoParede {
  return atual === 'ESQUERDA' ? 'DIREITA' : atual === 'DIREITA' ? 'ESQUERDA' : 'DIREITA';
}

/** Os três tipos de abertura, na ordem em que a barra os oferece. */
type TipoAbertura = Opening['kind'];

/**
 * Um vão candidato: o par de pontas soltas e as paredes donas delas.
 *
 * `wallIds` existe para o vão da LISTA saber apontar o que lhe corresponde no
 * DESENHO. Sem ele a linha "Vão 3" era um texto solto — media, oferecia fechar,
 * e não dizia onde fica.
 */
type Vao = { a: Point; b: Point; mm: number; wallIds: string[] };

/**
 * Ponta solta: onde ela está, de quem é, QUAL extremo é e onde fica o outro.
 *
 * `end` existe para `MoveVertex`, que move um extremo nomeado — sem ele a junção
 * de canto teria de redescobrir por comparação de coordenada qual das duas pontas
 * da parede é esta. `oposta` dá a direção do eixo, que é o que a junção segue e o
 * que o detector de vãos usa para exigir que as duas pontas estejam na mesma
 * linha.
 */
type PontaSolta = { p: Point; wallId: string; end: 'a' | 'b'; oposta: Point };


/**
 * Quanto a ponta parceira pode sair da linha da parede e ainda contar como
 * continuação dela, em milímetro.
 *
 * Uma espessura de parede. Dois trechos da mesma parede saem do vetorizador
 * deslocados alguns centímetros um do outro (as faces do PDF não são exatas), e
 * recusar isso mataria vãos legítimos.
 */
const DESALINHO_MAX_MM = 150;

/**
 * A ponta `outra` está na LINHA da parede de `de`, adiante dela?
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * O detector emparelhava pontas soltas só por DISTÂNCIA. Numa planta real
 * (23/08/2026) o resultado foi um leque de diagonais: a ombreira de cima de uma
 * porta oferecida como "vão" contra o canto de uma parede a 1,86 m dali, do
 * outro lado do arco de abertura. Duas das três ofertas eram geometricamente
 * impossíveis, e aceitar qualquer uma criava uma PAREDE DIAGONAL atravessando o
 * cômodo — foi assim que o usuário topou com isto, lendo o desenho como bug da
 * geração de paredes.
 *
 * Abertura é interrupção de uma LINHA de parede: as duas pontas são as duas
 * ombreiras, e o vão entre elas continua o eixo das duas. O que não continua
 * eixo nenhum é canto aberto — e canto se resolve movendo a ponta, não fechando
 * com um trecho enviesado.
 *
 * ⚠️ Isto NÃO é o "fechar por colinearidade" que o Spike C reprovou. Lá a
 * máquina DECIDIA fechar sozinha, e fechava a borda de terraço que devia ficar
 * aberta. Aqui ela só deixa de OFERECER o que não pode ser abertura; a borda do
 * terraço continua na lista, e quem decide continua sendo quem conhece o
 * projeto.
 */
function naMesmaLinha(de: PontaSolta, outra: PontaSolta): boolean {
  const ux = de.p.x - de.oposta.x;
  const uy = de.p.y - de.oposta.y;
  const comp = Math.hypot(ux, uy) || 1;
  const vx = outra.p.x - de.p.x;
  const vy = outra.p.y - de.p.y;

  // Para FRENTE: o vão continua a parede ALÉM da ponta. Sem este teste, uma
  // parede que corre rente a outra e termina antes dela emparelharia para trás,
  // por cima de si mesma.
  if ((vx * ux + vy * uy) / comp <= 0) return false;

  // Desvio LATERAL, não angular. Dois trechos deslocados 5 cm um do outro são a
  // mesma linha em qualquer tamanho de vão; em ângulo, esses mesmos 5 cm são 7°
  // num vão de 40 cm e 1° num de 3 m — o mesmo desenho seria aceito ou recusado
  // conforme o tamanho do vão, que é justamente o que não pode variar.
  return Math.abs((vx * uy - vy * ux) / comp) <= DESALINHO_MAX_MM;
}

const ESPESSURA_PADRAO_MM = 150;
const ALTURA_PADRAO_MM = 2800;

/** O que a barra edita numa peça estrutural. Tudo em milímetro inteiro. */
export interface MedidasEstruturais {
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  baseMm: number;
  circular: boolean;
}

/**
 * Com que medidas cada peça NASCE.
 *
 * Números de obra corrente, não de norma: pilar 20×40, viga 15×50, laje maciça
 * de 12 cm, estaca ⌀30 de 8 m, bloco 80×80×60, baldrame 20×40. Servem para o
 * primeiro clique não exigir preencher cinco campos — todos continuam
 * editáveis na barra antes do clique e no painel depois dele.
 *
 * `baseMm` NEGATIVO é o que põe a fundação abaixo do piso sem exigir um
 * pavimento "Fundação" só para ela. O bloco começa a 1,10 m de profundidade e
 * tem 60 cm de altura, então seu topo fica a −0,50 m; a estaca desce 8 m a
 * partir de −1,10 m, que é onde o bloco a encontra. Os dois números conversam
 * de propósito: um deles isolado poria a estaca boiando.
 */
const PADRAO_ESTRUTURAL: Record<StructuralKind, MedidasEstruturais> = {
  PILAR: { larguraMm: 200, profundidadeMm: 400, alturaMm: ALTURA_PADRAO_MM, baseMm: 0, circular: false },
  VIGA: { larguraMm: 150, profundidadeMm: 0, alturaMm: 500, baseMm: ALTURA_PADRAO_MM - 500, circular: false },
  LAJE: { larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: ALTURA_PADRAO_MM, circular: false },
  ESTACA: { larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true },
  BLOCO_COROAMENTO: { larguraMm: 800, profundidadeMm: 800, alturaMm: 600, baseMm: -1100, circular: false },
  VIGA_FUNDACAO: { larguraMm: 200, profundidadeMm: 0, alturaMm: 400, baseMm: -900, circular: false },
};

/**
 * As seções do painel lateral.
 *
 * Foram abas até 29/08/2026 — uma barra de navegação e um corpo que trocava de
 * conteúdo. Viraram seções irmãs de accordion a pedido do usuário: o painel é
 * multi-aberto, então "ver as medições SEM perder os ambientes de vista" deixou
 * de exigir ir e voltar. O nome de cada uma é o rótulo que a aba tinha.
 *
 * `naVista` = a seção sobrevive fora da planta baixa. As que editam o modelo
 * somem na elevação/3D, que são read-only — é o mesmo recorte que a barra de
 * abas fazia (só Quantitativos e Versões).
 *
 * `no3d` = sobrevive SÓ no 3D. Um segundo eixo, e não um `naVista: true`, porque
 * "Componentes" no 3D não é a mesma seção de sempre reaparecendo: ela vira uma
 * lista read-only com o olho de exibir/ocultar (pedido de 01/09/2026), e isso só
 * faz sentido onde há volume para esconder. Na elevação a peça já é filtrada
 * pelos toggles próprios da vista (paredes internas, estrutura), e uma terceira
 * régua de visibilidade ali seria duas fontes para a mesma pergunta.
 *
 * "Do PDF" nomeia a ORIGEM, não a ação: um verbo no meio dos substantivos
 * ("Gerar") leria como botão perdido entre cabeçalhos de seção.
 */
const SECOES_DO_PAINEL = [
  { id: 'pavimentos', rotulo: 'Pavimentos', naVista: true, no3d: false },
  // Antes de "Ambientes" porque é a ordem do trabalho e a do vocabulário: aqui
  // está o que se DESENHA, ali o que a topologia DERIVA do desenho.
  { id: 'componentes', rotulo: 'Componentes', naVista: false, no3d: true },
  { id: 'ambientes', rotulo: 'Ambientes', naVista: false, no3d: false },
  { id: 'vetor', rotulo: 'Do PDF', naVista: false, no3d: false },
  { id: 'medicoes', rotulo: 'Medições', naVista: false, no3d: false },
  { id: 'quantitativos', rotulo: 'Quantitativos', naVista: true, no3d: false },
  { id: 'orcamento', rotulo: 'Orçamento', naVista: false, no3d: false },
  { id: 'versoes', rotulo: 'Versões', naVista: true, no3d: false },
] as const;

type SecaoDoPainel = (typeof SECOES_DO_PAINEL)[number]['id'];

/**
 * Os dois recortes, resolvidos uma vez.
 *
 * Conjuntos e não um `.find()` dentro do callback: com a tabela `as const`, o
 * `find` devolve a UNIÃO dos oito literais, e encadear `secao?.naVista || …`
 * estreita essa união a cada operando até o compilador perder a propriedade
 * seguinte. Filtrar aqui só toca `id`, que existe em todas as entradas.
 */
const SECOES_NA_VISTA = new Set<SecaoDoPainel>(
  SECOES_DO_PAINEL.filter((s) => s.naVista).map((s) => s.id),
);
const SECOES_NO_3D = new Set<SecaoDoPainel>(
  SECOES_DO_PAINEL.filter((s) => s.no3d).map((s) => s.id),
);

/**
 * Quais nascem abertas.
 *
 * Não são todas: sete seções abertas dariam uma coluna de rolagem interminável
 * na primeira visita. Estas duas reproduzem o que o painel mostrava antes —
 * Pavimentos no topo e o conteúdo em "Ambientes", que era a aba inicial.
 */
const SECOES_ABERTAS_PADRAO: Record<SecaoDoPainel, boolean> = {
  pavimentos: true,
  // Aberta por padrão porque é onde as propriedades da peça selecionada passaram
  // a morar: fechada, clicar numa parede no canvas não teria resposta visível
  // nenhuma. O editor também a abre sozinho ao selecionar um componente.
  componentes: true,
  ambientes: true,
  vetor: false,
  medicoes: false,
  quantitativos: false,
  orcamento: false,
  versoes: false,
};

interface Props {
  study: BlueprintStudy;
  branchId: string;
  onBack: () => void;
}

export default function BlueprintEditor({ study, branchId, onBack }: Props) {
  const editor = useBlueprintEditor(branchId);
  const [espessura, setEspessura] = useState(ESPESSURA_PADRAO_MM);
  // `null` = automatico: o passo acompanha o zoom. Qualquer numero fixa o passo.
  const [passoGrade, setPassoGrade] = useState<number | null>(null);
  const [passoEmVigor, setPassoEmVigor] = useState(100);
  const [larguraAbertura, setLarguraAbertura] = useState(900);
  const [renomeando, setRenomeando] = useState<string | null>(null);

  // ── Seções do painel lateral (accordion multi-aberto) ─────────────────────
  // Persistido porque quem trabalha na planta reabre o editor dezenas de vezes
  // ao dia; refazer o arranjo do painel a cada carga é atrito puro.
  //
  // A chave carrega `:v2` porque a forma do objeto mudou quando as abas viraram
  // seções: o `:v1` guardava `{pavimentos, navegacao, conteudo}`, e reaproveitar
  // a chave faria o painel de quem já usou o editor nascer com as seis seções
  // novas em `undefined` — todas fechadas, o painel aparentemente vazio.
  const [secoesSalvas, setSecoes] = usePersistedState(
    'blueprint:secoesDoPainel:v2',
    SECOES_ABERTAS_PADRAO,
  );
  // Mesclado com o padrão a cada leitura: assim, acrescentar uma seção no futuro
  // não exige outro `:v3` — a que faltar no armazenado cai no default.
  const secoes: Record<SecaoDoPainel, boolean> = {
    ...SECOES_ABERTAS_PADRAO,
    ...secoesSalvas,
  };
  const alternarSecao = useCallback(
    (qual: SecaoDoPainel) => setSecoes((s) => ({ ...s, [qual]: !(s[qual] ?? false) })),
    [setSecoes],
  );
  /** O formulário de novo pavimento — o botão que o abre mora no cabeçalho da seção. */
  const [adicionandoPavimento, setAdicionandoPavimento] = useState(false);

  // Largura arrastável do painel. Persistida, com limites e duplo clique para
  // voltar ao padrão — mesmo gesto da régua de coluna das tabelas.
  const {
    largura: larguraDoPainel,
    caixaRef: caixaDoPainel,
    Puxador: PuxadorDeLargura,
  } = usePainelRedimensionavel();

  // ── Vista: planta baixa (editável) ou uma das derivadas (read-only) ───────
  const [vista, setVista] = usePersistedState<VistaBlueprint>('blueprint:vista', 'planta');
  /** Nível que as ferramentas de desenho editam. `null` = o primeiro. */
  const [nivelAtivoId, setNivelAtivoId] = usePersistedState<string | null>(
    'blueprint:nivelAtivo',
    null,
  );
  /** Ids dos níveis que a elevação/3D empilham. Sincronizado com os níveis reais. */
  const [niveisVisiveis, setNiveisVisiveis] = useState<string[]>([]);
  const [enquadrarVistaToken, setEnquadrarVistaToken] = useState(0);
  const [mostrarCotasAltura, setMostrarCotasAltura] = usePersistedState(
    'blueprint:vistaCotasAltura',
    true,
  );
  const [mostrarRotulosEsquadria, setMostrarRotulosEsquadria] = usePersistedState(
    'blueprint:vistaRotulosEsquadria',
    true,
  );
  const [mostrarParedesInternas, setMostrarParedesInternas] = usePersistedState(
    'blueprint:vistaParedesInternas',
    false,
  );
  /**
   * LIGADO por padrão, ao contrário das paredes internas.
   *
   * Paredes internas nascem desligadas porque poluem a fachada com linhas que a
   * fachada não mostra. A estrutura é o oposto: quem desenhou um pilar quer
   * vê-lo, e uma elevação que esconde por padrão o que acabou de ser desenhado
   * parece defeito, não preferência.
   */
  const [mostrarEstruturaVista, setMostrarEstruturaVista] = usePersistedState(
    'blueprint:vistaEstrutura',
    true,
  );
  const [mostrarLaje3d, setMostrarLaje3d] = usePersistedState('blueprint:vista3dLaje', false);
  const [mostrarArestas3d, setMostrarArestas3d] = usePersistedState(
    'blueprint:vista3dArestas',
    true,
  );
  const [mostrarTerreno3d, setMostrarTerreno3d] = usePersistedState(
    'blueprint:vista3dTerreno',
    false,
  );

  const emVista = vista !== 'planta';
  const vistaEhElevacao = ehVistaDeElevacao(vista);
  const em3d = vista === '3d';
  const [ortogonal, setOrtogonal] = useState(true);
  /**
   * O que acontece nas junções quando se move PARTE do desenho.
   *
   * `MANTER` é o padrão, e a razão não é preferência de CAD: aqui a topologia É o
   * dado. Ambiente, área, perímetro e o de-para do orçamento derivam do anel
   * fechado — desencostar uma junção apaga tudo isso sem erro nenhum na tela. A
   * conexão é INTENÇÃO; o comprimento da vizinha é consequência. O padrão antigo
   * (`MOVER`) descartava a intenção para preservar a consequência, e ainda exigia
   * "Conectar automaticamente" depois para desfazer o estrago.
   *
   * O custo do erro também é assimétrico: quem queria soltar e manteve desfaz com
   * um Ctrl+Z sobre um modelo que nunca ficou inválido; quem queria manter e
   * soltou pode só descobrir várias edições depois.
   *
   * `SOLTAR` continua existindo porque desprender um bloco é legítimo — só não é
   * o que se quer na maioria das vezes.
   */
  const [modoJuncao, setModoJuncao] = usePersistedState<'MANTER' | 'SOLTAR'>(
    'blueprint:modoJuncao',
    'MANTER',
  );
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [gravandoArea, setGravandoArea] = useState(false);
  const [erroArea, setErroArea] = useState<string | null>(null);
  // ── O QUE APARECE NO DESENHO ─────────────────────────────────────────────
  //
  // Todos em `usePersistedState`, e não em `useState`: são preferências de
  // trabalho, não estado de gesto. Quem trabalha com Cotas ligado as ligava de
  // novo a cada vez que voltava ao editor, porque remontar o componente zerava
  // tudo. A chave `blueprint:*` é a mesma família de `blueprint:modoJuncao`.

  /** Mostra o comprimento de cada parede no desenho, como uma cota de planta. */
  const [mostrarMedidas, setMostrarMedidas] = usePersistedState(
    'blueprint:mostrarMedidas',
    false,
  );
  /**
   * Pinta as faixas de material dentro da espessura de cada parede.
   *
   * Desligado por padrão: numa vista geral a composição vira listra sobre
   * listra e come a leitura do partido. Quem está detalhando a parede liga, e a
   * escolha sobrevive à navegação como as demais desta família.
   */
  const [mostrarCamadas, setMostrarCamadas] = usePersistedState(
    'blueprint:mostrarCamadas',
    false,
  );
  /** Cadeias de cota por lado — total/parcial/interna, a convenção de prancha. */
  const [mostrarCotas, setMostrarCotas] = usePersistedState('blueprint:mostrarCotas', false);
  /**
   * Só a cadeia INTERNA — cada ambiente de face a face.
   *
   * Botão próprio porque é a medida que se lê numa planta ("quanto tem esta
   * cozinha?") e a cadeia completa é densa demais para ficar ligada sempre.
   * Também é o que desfaz a confusão com o `livre` do botão Medidas, que mede a
   * PAREDE inteira e ignora as divisórias que a cortam.
   */
  const [mostrarCotaInterna, setMostrarCotaInterna] = usePersistedState(
    'blueprint:mostrarCotaInterna',
    false,
  );
  /** Nome, área e perímetro escritos dentro de cada ambiente. */
  const [mostrarRotulos, setMostrarRotulos] = usePersistedState(
    'blueprint:mostrarRotulos',
    false,
  );
  /**
   * A grade.
   *
   * ⚠️ Liga e desliga o DESENHO da grade, não o ENCAIXE. Quem esconde a grade
   * quer conferir o traçado contra a planta de fundo sem o quadriculado por
   * cima — não quer desenhar fora de medida.
   */
  const [mostrarGrade, setMostrarGrade] = usePersistedState('blueprint:mostrarGrade', true);
  /** O azul claro por dentro dos ambientes derivados. */
  const [mostrarPreenchimento, setMostrarPreenchimento] = usePersistedState(
    'blueprint:mostrarPreenchimento',
    true,
  );
  /**
   * O verde fraco por dentro do anel do LOTE.
   *
   * Chave própria, separada da do preenchimento dos ambientes: o lote é o chão
   * sob tudo, e apagá-lo é justamente o gesto de quem vai conferir o traçado
   * contra o levantamento topográfico. Um toggle só para os dois obrigaria a
   * perder a cor dos cômodos junto.
   */
  const [mostrarPreenchimentoTerreno, setMostrarPreenchimentoTerreno] = usePersistedState(
    'blueprint:mostrarPreenchimentoTerreno',
    true,
  );
  /**
   * A hachura do envelope construtivo (área construível, terreno menos recuos).
   *
   * Chave própria: é uma restrição calculada, diferente do preenchimento do
   * lote. Antes desligava-se junto com "Preenchimento do terreno" sem querer,
   * porque não tinha item nenhum no menu — a hachura ficava desenhada por
   * cima mesmo com tudo desligado.
   */
  const [mostrarEnvelope, setMostrarEnvelope] = usePersistedState(
    'blueprint:mostrarEnvelope',
    true,
  );
  /** Uma cor por ambiente em vez do azul único — separa cômodos vizinhos. */
  const [coresPorAmbiente, setCoresPorAmbiente] = usePersistedState(
    'blueprint:coresPorAmbiente',
    false,
  );
  /** Cota em preto sobre fundo opaco, para planta de fundo escaneada carregada. */
  const [cotaAltoContraste, setCotaAltoContraste] = usePersistedState(
    'blueprint:cotaAltoContraste',
    false,
  );
  /**
   * Passo do MOVER. `'grade'` = segue o seletor de Grade (que em automático
   * segue o zoom); qualquer número fixa o passo em mm, independente do zoom.
   *
   * Nasce em `'grade'` para não mudar o comportamento de quem já usava o editor:
   * quem quer precisão fixa agora tem onde pedir, e quem não pediu segue igual.
   */
  const [passoMover, setPassoMover] = usePersistedState<number | 'grade'>(
    'blueprint:passoMover',
    'grade',
  );
  /** Lados da ferramenta Polígono. 6 porque quem escolhe a ferramenta quer o
   * que o traçado manual não dá de graça — retângulo já sai fácil à mão. */
  const [ladosPoligono, setLadosPoligono] = useState(6);
  /**
   * Onde o clique cai: no eixo ou na face da parede.
   *
   * O padrão é a FACE À DIREITA porque o trabalho real aqui é copiar planta de
   * fundo: quem copia aponta o canto que está desenhado, e contornando o perímetro
   * no sentido do relógio a parede nasce para dentro. Desenhar pelo eixo continua
   * a um clique de distância, para quem está criando planta nova.
   */
  const [alinhamento, setAlinhamento] = useState<AlinhamentoParede>('DIREITA');
  /** Aferição em curso: os dois pontos já clicados, esperando a distância. */
  const [afericao, setAfericao] = useState<{ p1: PontoPx; p2: PontoPx } | null>(null);
  const [distanciaDigitada, setDistanciaDigitada] = useState('');
  const [alinharNaAfericao, setAlinharNaAfericao] = useState(false);
  const [qtdOficial, setQtdOficial] = useState<BlueprintQuantitySnapshot | null>(null);
  const [gerando, setGerando] = useState(false);
  const [tipoAbertura, setTipoAbertura] = useState<TipoAbertura>('door');
  /**
   * Vão sob o cursor na LISTA, aceso no desenho.
   *
   * Sem isso, casar a linha "Vão 3" com o vão certo na planta dependia da
   * medida — e a medida se repete: numa planta real havia quatro vãos de
   * 0,98 m. O número no desenho resolve o caso parado; acender resolve o caso
   * em movimento, que é o de quem está revisando a lista de cima a baixo.
   */
  const [vaoEmDestaque, setVaoEmDestaque] = useState<number | null>(null);
  /**
   * Só vale para porta de correr: a folha entra na parede (bolso) ou corre
   * sobre a face.
   *
   * Nasce em POR FORA porque é a forma comum, e porque bolso exige parede
   * preparada — quem tem bolso sabe que tem; quem não pensou no assunto não
   * tem, e o padrão não pode inventar uma parede oca que ninguém construiu.
   */
  const [correrEmbutida, setCorrerEmbutida] = useState(false);

  /**
   * Que peça o menu Estrutural está apontando, e com que medidas ela nasce.
   *
   * O TIPO é estado da barra, não valor de `BlueprintTool` — a mesma decisão do
   * `tipoAbertura` logo acima, e pelo mesmo motivo: seis ferramentas para uma
   * família obrigariam todo `switch` de gesto no canvas a enumerá-las.
   *
   * As MEDIDAS são um estado só, trocado inteiro quando o tipo muda
   * (`PADRAO_ESTRUTURAL`). Guardar uma seção por tipo pareceria mais gentil e
   * seria pior: quem ajustou a viga para 15×60, foi lançar um pilar e voltou,
   * encontraria a viga em 20×40 de novo se o estado fosse compartilhado — e
   * encontraria seis conjuntos para conferir se fossem separados. Um estado que
   * o menu reinicia é previsível: o tipo novo vem como o tipo novo nasce.
   */
  const [tipoEstrutural, setTipoEstrutural] = useState<StructuralKind>('PILAR');
  /**
   * A PRÓXIMA água: inclinação em % e beiral em mm. Estado da barra, como as
   * medidas da estrutura — a peça já lançada se edita no painel lateral.
   */
  const [inclinacaoTelhado, setInclinacaoTelhado] = useState(30);
  const [beiralTelhado, setBeiralTelhado] = useState(500);
  const [medidasEstruturais, setMedidasEstruturais] = useState<MedidasEstruturais>(
    PADRAO_ESTRUTURAL.PILAR,
  );
  /** Rótulo da PRÓXIMA peça ("P1"). Some ao lançar — ver `adicionarEstrutural`. */
  const [rotuloEstrutural, setRotuloEstrutural] = useState('');

  /**
   * ─── SOBREPOSIÇÃO ENTRE COMPONENTES (01/09/2026) ────────────────────────────
   *
   * Pedido do usuário, com print do 3D: peça criada em cima de outra tem de
   * AVISAR, oferecendo desfazer ou descontar o volume de um dos dois lados.
   *
   * Dois estados, e a separação é o que faz o aviso funcionar: `recemCriado`
   * guarda o id até o modelo novo chegar (o `run` agenda o estado, não devolve
   * o modelo), e `disputa` é o que abre o modal.
   */
  const [recemCriado, setRecemCriado] = useState<string | null>(null);
  /** Recado quando o kernel recusa o corte. `null` = nada a dizer. */
  const [erroDoCorte, setErroDoCorte] = useState<string | null>(null);
  const [disputa, setDisputa] = useState<{
    pecaId: string;
    nome: string;
    paredeIds: string[];
    volumeM3: number;
    quantos: number;
  } | null>(null);

  /**
   * O nível que as ferramentas de desenho editam. Era fixo em `levels[0]`; agora
   * segue o pavimento escolhido no `PainelPavimentos` e volta ao primeiro quando
   * o escolhido é removido.
   */
  const levelId = useMemo(() => {
    const ids = editor.model.levels.map((l) => l.id);
    if (nivelAtivoId && ids.includes(nivelAtivoId)) return nivelAtivoId;
    return ids[0] ?? null;
  }, [editor.model.levels, nivelAtivoId]);

  // Persiste o nível resolvido quando ele diverge do guardado (remoção, primeira
  // abertura do estudo).
  useEffect(() => {
    if (levelId && levelId !== nivelAtivoId) setNivelAtivoId(levelId);
  }, [levelId, nivelAtivoId, setNivelAtivoId]);

  // Mantém `niveisVisiveis` alinhado aos níveis reais: tira os que sumiram e, se
  // ficar vazio, volta a mostrar todos.
  useEffect(() => {
    const ids = editor.model.levels.map((l) => l.id);
    setNiveisVisiveis((prev) => {
      const filtrado = prev.filter((id) => ids.includes(id));
      return filtrado.length ? filtrado : ids;
    });
  }, [editor.model.levels]);

  /** `undefined` = todos (é o que `projetarElevacao`/3D entendem). */
  const levelIdsDaVista = niveisVisiveis.length ? niveisVisiveis : undefined;

  /**
   * Quais seções a vista atual comporta.
   *
   * Fora da planta baixa só sobrevivem Pavimentos, Quantitativos e Versões — as
   * demais editam o modelo, e elevação/3D são read-only. Antes esse recorte
   * apagava abas da barra; agora apaga seções inteiras, que é a mesma regra
   * dita no vocabulário novo.
   *
   * O 3D ganha ainda as marcadas `no3d` — hoje só "Componentes", que ali serve
   * de régua de visibilidade da cena e não de editor (ver `SECOES_DO_PAINEL`).
   */
  const secaoVisivel = useCallback(
    (id: SecaoDoPainel) =>
      !emVista || SECOES_NA_VISTA.has(id) || (vista === '3d' && SECOES_NO_3D.has(id)),
    [emVista, vista],
  );

  /**
   * O retângulo visível, em milímetro do modelo — a região da geração de
   * paredes. Vem do canvas porque é ele que tem a vista.
   */
  const [limitesDaVista, setLimitesDaVista] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  /**
   * A JANELA marcada à mão, e a arma que a define.
   *
   * Separada de `limitesDaVista` de propósito: o enquadramento muda a cada
   * rolagem de zoom, sem intenção; a janela é afirmada e sobrevive ao zoom. É
   * ela que permite escolher a espessura por tentativa e erro sem o conjunto
   * mudar por baixo.
   */
  const [regiao, setRegiao] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [regiaoArmada, setRegiaoArmada] = useState(false);

  /**
   * Aplica as paredes derivadas do PDF em UM passo de histórico.
   *
   * `runBatch` e não N chamadas de `run`: gerar 58 paredes com um comando cada
   * encheria o histórico de 58 passos, e desfazer uma escolha errada de
   * espessura viraria 58 Ctrl+Z. O painel promete que um desfazer remove tudo,
   * e é esta linha que cumpre a promessa.
   */
  const aplicarParedesGeradas = useCallback(
    (paredes: ParedeGerada[]) => {
      if (!levelId || paredes.length === 0) return;
      const novas = paredes.map((p) => ({
        type: 'AddWall' as const,
        levelId,
        a: p.a,
        b: p.b,
        // A espessura vem MEDIDA do desenho, não do seletor da barra: é o
        // dado que o pareamento produz, e ignorá-lo em favor do padrão de
        // 15 cm jogaria fora a informação mais confiável da extração.
        thicknessMm: p.espessuraMm,
        heightMm: ALTURA_PADRAO_MM,
      }));

      // A GERAÇÃO É A ORIGEM DO PROBLEMA DO T. O vetorizador deriva cada eixo do
      // par de faces que o desenha, e cada parede sai com o comprimento das faces
      // DELA — então o montante termina onde a face da hospedeira começa, e não no
      // eixo dela. Em planta o T fica perfeito; no modelo a ponta está solta, e
      // nenhum ambiente fecha. Medido na planta de um usuário: 13 pontas assim, e
      // zero ambientes até corrigi-las.
      //
      // ⚠️ SIMULAR ANTES DE GRAVAR, e não chamar a correção depois do `runBatch`.
      // `editor.model` é estado do React: logo depois de gravar ele ainda é o
      // modelo ANTIGO, sem as paredes novas — a correção rodaria sobre um arranjo
      // onde os T nem existem ainda, e não acharia nada. `applyBatch` do kernel dá
      // o modelo resultante na hora, e os IDs batem porque o contador de ids é
      // determinístico: o mesmo roteiro de comandos produz os mesmos ids.
      let correcoes: Command[] = [];
      try {
        correcoes = comandosDeConexao(applyBatch(editor.model, novas).model);
      } catch {
        // Se a simulação for recusada, o `runBatch` abaixo recusa igual e mostra o
        // erro. Gravar sem a correção é melhor que não gravar nada.
        correcoes = [];
      }

      // UM lote só: as paredes já nascem conectadas, e um Desfazer devolve o
      // estado anterior à geração inteira. Dois lotes deixariam um passo
      // intermediário — "geradas mas soltas" — que ninguém quer visitar.
      editor.runBatch([...novas, ...correcoes]);
      if (correcoes.length > 0) {
        setAvisoConexaoT(
          `${correcoes.length} ponta(s) das paredes geradas paravam na face da parede vizinha, sem alcançar ` +
            'o eixo — foram encostadas. Sem isso o desenho parece ligado e nenhum ambiente fecha.',
        );
      }
    },
    // `comandosDeConexao` fica FORA da lista de propósito: ele é declarado mais
    // abaixo no corpo, e citá-lo aqui seria lê-lo antes da inicialização — erro em
    // tempo de render. Não pode ficar obsoleto: ele é memoizado em `[levelId]`, que
    // já está nesta lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, levelId],
  );

  /**
   * As paredes do nível, como o gerador de portas precisa delas.
   *
   * A porta é hospedada numa parede QUE JÁ EXISTE — `AddOpening` exige
   * `wallId`. Por isso a ordem é parede primeiro, porta depois, e o painel diz
   * isso em vez de deixar o usuário descobrir com uma lista vazia.
   */
  const paredesParaPortas = useMemo(
    () =>
      editor.model.walls
        .filter((w) => w.levelId === levelId)
        // A espessura vai junto porque a dobradiça é medida até a FACE da
        // parede, não até o eixo — sem ela, três das cinco portas da prancha
        // real não casavam. Ver `FOLGA_DOBRADICA_MM`.
        .map((w) => ({ id: w.id, a: w.a, b: w.b, espessuraMm: w.thicknessMm })),
    [editor.model.walls, levelId],
  );

  /**
   * Aplica as portas derivadas dos arcos, em UM passo de histórico.
   *
   * Mesmo motivo do lote das paredes: gerar 12 portas com um comando cada
   * encheria o histórico de 12 passos e desfazer viraria 12 Ctrl+Z.
   *
   * Altura e peitoril são os mesmos que a ferramenta Abertura usa para porta
   * (2100 / 0). O arco do PDF é uma planta baixa: ele diz largura e posição, e
   * não sabe nada sobre altura — inventar um número diferente aqui criaria uma
   * porta que não se parece com as feitas à mão, sem nenhuma razão.
   */
  const aplicarPortasGeradas = useCallback(
    (portas: PortaGerada[]) => {
      if (portas.length === 0) return;
      editor.runBatch(
        portas.map((p) => ({
          type: 'AddOpening' as const,
          wallId: p.wallId,
          kind: 'door' as const,
          offsetMm: p.offsetMm,
          widthMm: p.widthMm,
          heightMm: 2100,
          sillMm: 0,
          hingeAtStart: p.hingeAtStart,
        })),
      );
    },
    [editor],
  );

  const confirmar = useConfirm();
  const { orgId } = useOrgContext();

  /**
   * Empreendimentos do CONTEXTO DO TOPO — para a zona urbanística e para o
   * write-back da área do terreno.
   *
   * ⚠️ `orgId` do `useOrgContext`, NÃO `study.organization_id`. O seletor do topo
   * é a autoridade (REGRA #5): em "Todas as organizações" ele vale `null`, o
   * service não aplica `.eq()` e a RLS recorta o resto. Filtrar pela org DO
   * ESTUDO parecia certo — o estudo pertence a uma org só — mas escondia
   * empreendimentos que o usuário estava vendo no topo, e o incorporador que
   * mantém a obra numa org e a incorporação em outra não achava o alvo.
   *
   * Carregados aqui, e não no painel, porque o painel é apresentacional — a
   * mesma divisão de `PainelParedeSelecionada`, que é o que permitiu testá-lo
   * sem canvas.
   */
  useEffect(() => {
    let vivo = true;
    empreendimentoService
      .list(orgId ?? undefined)
      .then((lista) => vivo && setEmpreendimentos(lista))
      // Silencioso de propósito: não poder listar empreendimento não pode
      // impedir de desenhar. O bloco de gravação simplesmente não aparece.
      .catch(() => vivo && setEmpreendimentos([]));
    return () => {
      vivo = false;
    };
  }, [orgId]);

  /**
   * O empreendimento sugerido pela OBRA do estudo.
   *
   * `blueprint_studies.project_id` aponta para a obra, e `empreendimentos`
   * também guarda `project_id`. É por aí que se sugere — e é só sugestão: quem
   * grava é o usuário, escolhendo na lista. Inferir e gravar calado poria a área
   * do terreno na ficha errada, e isso só apareceria no memorial de incorporação.
   */
  const empreendimentoSugerido = useMemo(() => {
    if (!study.project_id) return null;
    return empreendimentos.find((e) => e.project_id === study.project_id)?.id ?? null;
  }, [empreendimentos, study.project_id]);

  /**
   * Recuos e limites — agora vindos do Mapa Regulatório, não mais digitados do zero.
   *
   * Continuam FORA do payload canônico pela razão de sempre: são parâmetro
   * urbanístico do município, não geometria, e gravá-los no snapshot faria o
   * hash da planta mudar porque alguém digitou um recuo. O que mudou é que
   * agora eles têm casa própria (`blueprint_study_urban_context`) e sobrevivem
   * ao recarregar. O que É do desenho — qual lado é a frente — segue no modelo,
   * em `Boundary.papel`.
   */
  const zona = useBlueprintZonaUrbanistica(
    study.id,
    study.organization_id,
    empreendimentoSugerido,
    orgId,
  );
  const recuos = zona.recuos;

  /**
   * Altura do que está desenhado, em metros — para confrontar com o gabarito.
   *
   * Topo do nível mais alto: `elevationMm + defaultHeightMm`. Usar só a maior
   * `elevationMm` mediria até o PISO do último pavimento e deixaria a última
   * altura de pé-direito de fora, o que subestima justamente onde o gabarito
   * costuma apertar.
   */
  const alturaDesenhadaM = useMemo(() => {
    if (editor.model.levels.length === 0) return null;
    const topoMm = Math.max(...editor.model.levels.map((l) => l.elevationMm + l.defaultHeightMm));
    return Number((topoMm / 1000).toFixed(2));
  }, [editor.model.levels]);

  const fundo = useBlueprintUnderlay(study.id, study.organization_id, levelId);
  const [camadaAtiva, setCamadaAtiva] = useState('Geral');
  /** Camadas desligadas. Estado de TELA — preferência de quem olha, não do dado. */
  const [camadasOcultas, setCamadasOcultas] = useState<Set<string>>(new Set());
  const medicoes = useBlueprintMedicoes(
    study.id,
    study.organization_id,
    levelId,
    fundo.ativaId,
    camadaAtiva,
  );

  /**
   * O que aparece na tela: a prancha ativa, menos as camadas desligadas.
   *
   * O recorte por prancha não é cosmético. As coordenadas de uma forma só fazem
   * sentido sob a aferição da prancha em que foi traçada; mostrar as do térreo
   * sobre a cobertura desenharia contornos no lugar errado, com o número certo
   * ao lado — que é o pior jeito de errar.
   *
   * A FORMA SEM PRANCHA aparece em TODAS. Ela foi traçada sem fundo nenhum, então
   * não há aferição de outra prancha que a contradiga — e escondê-la a deixaria
   * inalcançável: some da lista, e não sobra nenhum controle para religá-la a
   * coisa alguma. O banco tem duas assim (`orfas=2` na conferência da 000014).
   */
  const medicoesVisiveis = useMemo(
    () =>
      medicoes.formas.filter(
        (f) =>
          (f.underlayId === null || f.underlayId === fundo.ativaId) &&
          !camadasOcultas.has(f.camada || 'Geral'),
      ),
    [medicoes.formas, fundo.ativaId, camadasOcultas],
  );

  const alternarCamada = (camada: string) =>
    setCamadasOcultas((atual) => {
      const nova = new Set(atual);
      if (nova.has(camada)) nova.delete(camada);
      else nova.add(camada);
      return nova;
    });

  // Atalhos de desfazer/refazer. Ctrl+Z / Ctrl+Shift+Z, como todo editor.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // F8 alterna a trava ortogonal — é a tecla que todo CAD usa, e quem
      // desenha planta chega aqui com o dedo já treinado nela.
      if (e.key === 'F8') {
        e.preventDefault();
        setOrtogonal((v) => !v);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [editor.undo, editor.redo]);

  const ambientes = useMemo(
    () =>
      editor.model.spaces
        .filter((s) => !levelId || s.levelId === levelId)
        .map((s, i) => ({
          id: s.id,
          nome: s.name ?? '',
          rotulo: s.name ?? `Ambiente ${i + 1}`,
          // ÁREA ÚTIL, pela face interna — é a que se habita e a que se
          // reveste. A de EIXO (`s.areaMm2`) continua existindo: ela é a
          // primitiva do arranjo planar e entra no payload canônico, logo no
          // HASH da versão publicada, então não pode ser substituída. Quem
          // quiser vê-la tem a aba Quantitativos, que mostra as duas lado a
          // lado.
          areaM2:
            areaRecuada(
              s.ring,
              editor.model.walls.filter((w) => w.levelId === s.levelId),
            ).areaMm2 / 1_000_000,
          perimetroM: s.perimeterMm / 1000,
        })),
    [editor.model.spaces, editor.model.walls, levelId],
  );

  const areaTotal = ambientes.reduce((soma, a) => soma + a.areaM2, 0);

  /**
   * Os rótulos escritos DENTRO de cada ambiente no desenho.
   *
   * Derivados de `ambientes` — a MESMA lista que o painel mostra —, e não de um
   * cálculo próprio. É a disciplina que `pontoDaCota` já impõe às cotas: o
   * mesmo cômodo não pode ter um número na lista e outro no desenho. Se a área
   * da lista mudar de definição amanhã, o desenho acompanha sozinho.
   */
  const rotulosDeAmbiente = useMemo(
    () =>
      ambientes.map((a) => ({
        spaceId: a.id,
        linhas: [
          a.rotulo,
          `${a.areaM2.toFixed(2).replace('.', ',')} m²`,
          `${a.perimetroM.toFixed(2).replace('.', ',')} m`,
        ],
      })),
    [ambientes],
  );

  /**
   * ÁREA CONSTRUÍDA do nível — pela face externa.
   *
   * Não é a soma das áreas úteis: entre elas está a alvenaria, que ocupa lugar
   * e é justamente o que separa "o que se habita" de "o que se constrói".
   */
  const areaConstruidaM2 = useMemo(() => {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    if (!nivel) return 0;
    return areaConstruidaMm2(editor.model, nivel) / 1_000_000;
  }, [editor.model, levelId]);

  const quant = useMemo(
    () => computeQuantities(editor.model, POLITICA_PADRAO),
    [editor.model],
  );
  const fmt = (v: number) => formatarQuantidade(v, POLITICA_PADRAO);

  /**
   * Quantitativo OFICIAL da última versão publicada.
   *
   * O painel calcula ao vivo enquanto se desenha, e isso é útil — mas número que
   * o orçamento vai citar não pode vir de geometria que ainda muda. O oficial sai
   * do snapshot publicado e fica gravado com a política que o produziu.
   */
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (editor.baseRevision === 0) {
        setQtdOficial(null);
        return;
      }
      try {
        const snaps = await listSnapshots(study.id);
        if (cancelado || snaps.length === 0) return;
        setQtdOficial(await getQuantitySnapshot(snaps[0].id, POLITICA_PADRAO.version));
      } catch {
        /* silencioso: a ausência do oficial não impede desenhar */
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [study.id, editor.baseRevision]);

  async function gerarQuantitativoOficial() {
    setGerando(true);
    try {
      const snaps = await listSnapshots(study.id);
      if (snaps.length === 0) return;
      setQtdOficial(await computeAndStoreQuantities(snaps[0].id, POLITICA_PADRAO));
    } catch (e) {
      console.error('falha ao gerar quantitativo:', e);
    } finally {
      setGerando(false);
    }
  }

  /**
   * Grava o trecho de parede e as correções de canto que ele exige.
   *
   * UM passo de histórico para o gesto todo (`runBatch`): a parede nova e a ponta
   * mitrada da anterior são o mesmo ato do usuário, e desfazer metade dele
   * deixaria um canto que ninguém desenhou.
   *
   * Se o lote for recusado — o caso real é abertura que não caberia mais na parede
   * encurtada — a parede entra SEM a mitra. O canto fica com folga visível, que se
   * arruma arrastando a ponta; perder o clique inteiro em silêncio seria pior.
   */
  function adicionarParede(a: Point, b: Point, ajustes?: AjustePonta[]): string | null {
    if (!levelId) return null;
    const nova: Command = {
      type: 'AddWall',
      levelId,
      a,
      b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
      // `a`/`b` JÁ são o eixo resolvido por `eixoDaParede`. Isto aqui não move
      // nada: grava de que lado estava o traço, para que uma troca de espessura
      // depois saiba qual face o usuário apontou. Sem isso o lado era esquecido
      // no instante do clique.
      alinhamento,
    };
    const correcoes: Command[] = (ajustes ?? []).map((aj) => ({
      type: 'MoveVertex',
      wallId: aj.wallId,
      end: aj.end,
      to: aj.to,
    }));

    const lote: Command[] = [...correcoes, nova];

    // ── ENCOSTAR A PONTA NOVA, NO MESMO LOTE ────────────────────────────────
    //
    // Uma parede desenhada terminando DENTRO do corpo de outra parece ligada na
    // tela e não está no modelo: o arranjo planar monta o grafo pelos EIXOS, a
    // ponta fica com grau 1, o anel não fecha e o ambiente some — junto com a
    // área e o quantitativo. Reportado em 27/08/2026, com print: a alça da ponta
    // aparecia solta no vão entre as paredes.
    //
    // O passe de conexão já existia e já rodava em três lugares — ao ABRIR a
    // planta, no botão, e nas paredes geradas do PDF — mas NÃO depois de um
    // traçado manual. Quem desenhava ficava com a ponta pendurada até recarregar.
    //
    // ⚠️ Recortado ao que ACABOU de ser desenhado. `comandosDeConexao` varre o
    // modelo inteiro; aplicá-lo cru aqui mexeria também em pontas soltas antigas
    // que o usuário não tocou — mudança silenciosa longe de onde ele clicou. O
    // botão "conectar agora" existe justamente para o passe completo, e ali é
    // pedido.
    let conexoes: Command[] = [];
    try {
      const simulado = applyBatch(editor.model, lote);
      const novaId = simulado.diff.created.find((id) => id.startsWith('wal'));
      if (novaId) {
        conexoes = comandosDeConexao(simulado.model).filter(
          (c) => c.type === 'MoveVertex' && c.wallId === novaId,
        );
      }
    } catch {
      // Simulação recusada: o `runBatch` abaixo recusa igual e mostra o erro.
      conexoes = [];
    }

    const criados = editor.runBatch([...lote, ...conexoes]);
    if (criados.length === 0 && correcoes.length > 0) return adicionarParede(a, b);
    return criados.find((id) => id.startsWith('wal')) ?? null;
  }

  /**
   * Troca a espessura MANTENDO PARADA a face que o usuário traçou.
   *
   * ─── O DEFEITO QUE ISTO RESOLVE ─────────────────────────────────────────────
   *
   * `SetThickness` mexe só na espessura, e a parede cresce simetricamente a
   * partir do EIXO — as duas faces andam meia espessura cada. Quem desenhou
   * clicando NA FACE (o padrão da barra) mirou numa delas: engrossar a parede
   * tirava do lugar exatamente a face que ele havia apontado. O lado do traço
   * não sobrevivia ao clique; agora sobrevive (`Wall.alinhamento`), e o eixo
   * pode ser levado para onde a face fique parada.
   *
   * ─── POR QUE UM LOTE, E POR QUE `manterJuncoes` ─────────────────────────────
   *
   * São dois comandos e um gesto só: espessura + translação do eixo. Separados,
   * "desfazer" desfaria meio ato e deixaria a parede grossa no lugar errado.
   *
   * `TranslateEntities` com `manterJuncoes` é o que torna isto SEGURO. Mover o
   * eixo de lado desencaixaria o vértice compartilhado com a vizinha, o anel
   * abriria e o ambiente sumiria com área e quantitativo junto — o mesmo modo de
   * falha que a decisão de 27/08/2026 descreve. Com ele ligado, a ponta da
   * vizinha acompanha pela componente paralela ao EIXO DELA: a vizinha muda de
   * comprimento, nunca de direção, e a junta continua fechada.
   *
   * No alinhamento `EIXO` (parede antiga, ou traçada pelo eixo) o deslocamento é
   * zero e sobra só o `SetThickness` — o comportamento de sempre, intacto.
   */
  function mudarEspessura(parede: Wall, mm: number) {
    const delta = deslocamentoParaManterFace(parede, mm);
    const lote: Command[] = [{ type: 'SetThickness', wallId: parede.id, thicknessMm: mm }];
    if (delta.x !== 0 || delta.y !== 0) {
      lote.push({
        type: 'TranslateEntities',
        wallIds: [parede.id],
        boundaryIds: [],
        // Estrutura não acompanha a troca de espessura: quem mudou a parede de
        // grossura não pediu para mover o pilar embutido nela.
        structuralIds: [],
        delta,
        manterJuncoes: true,
      });
    }
    editor.runBatch(lote);
  }

  /**
   * Troca a COMPOSIÇÃO da parede — e, com ela, a espessura.
   *
   * Espelha `mudarEspessura` linha a linha, e pelo MESMO motivo: mexer nas
   * camadas muda a espessura total (a soma), e numa parede traçada pela face o
   * eixo precisa andar para que a face apontada fique parada. Sem o
   * `TranslateEntities` com `manterJuncoes`, o eixo sai do vértice
   * compartilhado, o anel abre e o ambiente some com área e quantitativo junto.
   *
   * `camadas: null` volta a parede a homogênea preservando a espessura — a soma
   * não muda, o deslocamento dá zero e sobra só o `SetWallLayers`.
   */
  function mudarCamadas(parede: Wall, camadas: CamadaParede[] | null) {
    const novaEspessura = camadas ? somaDasCamadas(camadas) : parede.thicknessMm;
    const delta = deslocamentoParaManterFace(parede, novaEspessura);
    const lote: Command[] = [{ type: 'SetWallLayers', wallId: parede.id, camadas }];
    if (delta.x !== 0 || delta.y !== 0) {
      lote.push({
        type: 'TranslateEntities',
        wallIds: [parede.id],
        boundaryIds: [],
        structuralIds: [],
        delta,
        manterJuncoes: true,
      });
    }
    editor.runBatch(lote);
  }

  /**
   * Grava o polígono inteiro: N paredes num ÚNICO passo de histórico.
   *
   * Um lote, e não N comandos: o polígono é um gesto só, e desfazê-lo tem que
   * devolver a planta ao que era — não tirar um lado por vez, deixando um
   * contorno aberto que ninguém desenhou. Os cantos já vêm mitrados do canvas.
   */
  function adicionarPoligono(eixos: { a: Point; b: Point }[]) {
    if (!levelId || eixos.length < 3) return;
    editor.runBatch(
      eixos.map((e): Command => ({
        type: 'AddWall',
        levelId,
        a: e.a,
        b: e.b,
        thicknessMm: espessura,
        heightMm: ALTURA_PADRAO_MM,
      })),
    );
  }

  // Cardinalidade 1: `selectedId` é `null` quando há mais de um selecionado, e
  // é isso que faz o painel de parede sumir sozinho em favor do de conjunto.
  const paredeSel = editor.model.walls.find((w) => w.id === editor.selectedId) ?? null;
  const aberturaSel = editor.model.openings.find((o) => o.id === editor.selectedId) ?? null;

  const selecionados = useMemo(() => new Set(editor.selectedIds), [editor.selectedIds]);
  const paredesSelecionadas = editor.model.walls.filter((w) => selecionados.has(w.id));
  const limitesSelecionados = editor.model.boundaries.filter((b) => selecionados.has(b.id));
  const aberturasSelecionadas = editor.model.openings.filter((o) => selecionados.has(o.id));
  const medicoesSelecionadas = medicoes.formas.filter((f) => selecionados.has(f.id));

  const estruturasSelecionadas = editor.model.structures.filter((s) => selecionados.has(s.id));

  /** A divisa sozinha na seleção — cardinalidade 1, como `paredeSel`. */
  const limiteSel = editor.model.boundaries.find((b) => b.id === editor.selectedId) ?? null;
  /** A peça estrutural sozinha na seleção — mesma cardinalidade 1. */
  const estruturaSel = editor.model.structures.find((s) => s.id === editor.selectedId) ?? null;
  const aguaSel = (editor.model.roofs ?? []).find((r) => r.id === editor.selectedId) ?? null;

  /**
   * Quanto volume a peça selecionada divide com outra, em m³. `0` = nenhuma.
   *
   * É o que decide se o controle "cede o volume sobreposto" aparece no painel:
   * um interruptor em toda parede seria ruído, e ruído que não faz nada — sem
   * sobreposição não há volume a ceder.
   */
  const sobreposicaoDoSelecionado = useMemo(() => {
    const id = estruturaSel?.id ?? paredeSel?.id ?? null;
    if (!id) return 0;
    return (
      sobreposicoesDe(editor.model, id).reduce((t, s) => t + s.volumeMm3, 0) / 1_000_000_000
    );
  }, [editor.model, estruturaSel, paredeSel]);

  /**
   * As PAREDES que a peça selecionada atravessa e que dá para cortar.
   *
   * ⚠️ Só peça de PONTO que cruza o piso entra: é ela que empresta a ponte ao
   * arranjo planar (`pontesEstruturais`). Cortar a parede por causa de uma viga
   * — que passa por cima da alvenaria — abriria o anel sem nada para fechá-lo, e
   * o ambiente sumiria. Oferecer o botão ali seria oferecer a destruição do
   * cômodo com outro nome.
   */
  const paredesQueAPecaAtravessa = useMemo(() => {
    const nada = { aCortar: [] as string[], jaInterrompidas: 0 };
    if (!estruturaSel) return nada;
    if (FORMA_ESTRUTURAL[estruturaSel.kind] !== 'PONTO') return nada;
    if (!(estruturaSel.baseMm <= 0 && estruturaSel.baseMm + estruturaSel.alturaMm > 0)) return nada;

    const atravessadas = sobreposicoesDe(editor.model, estruturaSel.id)
      .map((so) => (so.aId === estruturaSel.id ? so.bId : so.aId))
      .map((id) => editor.model.walls.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => !!w);

    // ⚠️ SEPARADO entre o que FALTA e o que JÁ ESTÁ. Sem esse corte, o botão
    // aparecia oferecendo cortar paredes que já cediam — e o clique mandava um
    // comando que não mudava nada. Botão morto, e foi assim que o usuário o
    // encontrou em 01/09/2026: "botao cortar paredes nao esta funcionando".
    //
    // As duas paredes do estudo dele já estavam marcadas desde a versão
    // anterior, então NADA podia acontecer — e a tela não dizia isso em lugar
    // nenhum.
    return {
      aCortar: atravessadas.filter((w) => !w.cedeSobreposicao).map((w) => w.id),
      jaInterrompidas: atravessadas.filter((w) => w.cedeSobreposicao).length,
    };
  }, [editor.model, estruturaSel]);

  /**
   * PONTAS que o corte destrutivo deixou curtas em volta da peça selecionada.
   *
   * O corte deixou de ser destrutivo, mas os desenhos já cortados continuam por
   * aí — o do usuário inclusive, com uma parede parando 100 mm antes da face do
   * pilar. Sem esta ação, aquele vão só sairia arrastando a ponta à mão, e ele
   * nem sabe que a parede está curta: o buraco parece parte do desenho.
   */
  const pontasCurtasDaSelecionada = useMemo(() => {
    if (!estruturaSel) return [];
    return pontasEncurtadasPorEstrutura(
      editor.model.walls.filter((w) => w.levelId === estruturaSel.levelId),
      estruturaSel,
    );
  }, [editor.model, estruturaSel]);

  /** Devolve cada ponta curta ao lugar de onde o corte a tirou. */
  function emendarPontasDaSelecionada() {
    if (pontasCurtasDaSelecionada.length === 0) return;
    editor.runBatch(
      pontasCurtasDaSelecionada.map(
        (p) => ({ type: 'MoveVertex', wallId: p.wallId, end: p.end, to: p.ate }) as const,
      ),
    );
  }

  /**
   * Corta TODAS as paredes que a peça selecionada atravessa, num lote só.
   *
   * Mesmo caminho que o aviso da criação usa — e existe porque aquele aviso só
   * aparece uma vez, na criação. Sem esta ação, a planta que JÁ estava desenhada
   * não tinha como ser cortada: foi exatamente o que aconteceu com o usuário,
   * que relatou a sobreposição três vezes com a peça já criada em cena.
   */
  function cortarParedesDaSelecionada() {
    if (!estruturaSel || paredesQueAPecaAtravessa.aCortar.length === 0) return;
    try {
      // Mesma decisão do aviso: grava a RELAÇÃO, não o corte. Ver o comentário
      // em `resolverDisputa`.
      editor.runBatch(
        paredesQueAPecaAtravessa.aCortar.map(
          (id) => ({ type: 'SetCedeSobreposicao', id, cede: true }) as const,
        ),
      );
    } catch (e) {
      setErroDoCorte(
        e instanceof Error && /abertura/i.test(e.message)
          ? 'O corte partiria uma porta ou janela. Mova a esquadria ou o pilar e tente de novo.'
          : 'Não foi possível cortar a parede neste ponto.',
      );
    }
  }

  /**
   * O inventário do pavimento ativo — o que a seção "Componentes" gerencia.
   *
   * O recorte por nível é feito AQUI e não dentro do painel porque a abertura
   * não guarda `levelId`: ela mora numa parede, e é a parede que diz de que
   * pavimento ela é. Quem recorta precisa do modelo inteiro.
   */
  const componentesDoNivel = useMemo(() => {
    const paredes = editor.model.walls.filter((w) => !levelId || w.levelId === levelId);
    const idsDeParede = new Set(paredes.map((w) => w.id));
    const aberturas = editor.model.openings.filter((o) => idsDeParede.has(o.wallId));
    const estruturas = editor.model.structures.filter(
      (s) => !levelId || s.levelId === levelId,
    );
    const aguas = (editor.model.roofs ?? []).filter((r) => !levelId || r.levelId === levelId);
    return { paredes, aberturas, estruturas, aguas };
  }, [editor.model.walls, editor.model.openings, editor.model.structures, editor.model.roofs, levelId]);

  /**
   * O inventário da vista 3D — os pavimentos EMPILHADOS na cena, não o ativo.
   *
   * Recorte diferente do de cima porque a pergunta é outra: na planta baixa a
   * lista serve ao pavimento que se edita; no 3D ela serve ao que se VÊ, e a
   * cena empilha todos os níveis marcados. Listar só o ativo deixaria a parede
   * do 2º piso visível na tela sem nenhuma linha capaz de escondê-la.
   *
   * Só calcula em 3D: nas outras vistas o resultado seria jogado fora a cada
   * comando do editor.
   */
  const componentesDo3d = useMemo(
    () => (vista === '3d' ? linhasDeComponentesPorNivel(editor.model, levelIdsDaVista) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vista, editor.model, levelIdsDaVista?.join(',')],
  );

  /**
   * Peças escondidas na vista 3D (pedido de 01/09/2026).
   *
   * `useState` e NÃO `usePersistedState`, pela mesma razão já documentada em
   * `camadasOcultas`: são ids de peça, e id não sobrevive a troca de branch nem
   * a publicação de versão. Um conjunto persistido apontaria para peças que não
   * existem mais e, pior, faria o usuário abrir outro estudo com metade do
   * desenho escondido sem lembrar de tê-lo escondido.
   *
   * Filtra o DESENHO e nada mais: não é comando de kernel, não entra no
   * histórico, não muda quantitativo.
   */
  const [ocultosNo3d, setOcultosNo3d] = useState<Set<string>>(new Set());

  /**
   * Alterna em LOTE — a linha manda um id, o cabeçalho da família manda todos os
   * dela. Um `setState` por id faria o clique em "Alvenaria" numa planta de
   * quarenta paredes disparar quarenta atualizações em sequência.
   */
  const alternarOcultoNo3d = useCallback((ids: string[], ocultar: boolean) => {
    setOcultosNo3d((atual) => {
      const proximo = new Set(atual);
      for (const id of ids) {
        if (ocultar) proximo.add(id);
        else proximo.delete(id);
      }
      return proximo;
    });
  }, []);

  /**
   * Selecionar uma peça no canvas ABRE a seção que mostra as propriedades dela.
   *
   * O corpo de uma seção fechada é desmontado (ver `SecaoAccordion`), então sem
   * isto o clique numa parede com "Componentes" fechado não teria resposta
   * visível nenhuma — o mesmo defeito que a barra de abas tinha quando o painel
   * de propriedades vivia atrás de uma aba.
   *
   * A dependência é um BOOLEANO, não a seleção: assim o efeito só dispara na
   * virada "nada selecionado → algum componente", e não a cada troca de peça,
   * que reabriria a seção que o usuário acabou de fechar de propósito.
   */
  const selecaoTemComponente =
    paredesSelecionadas.length > 0 ||
    aberturasSelecionadas.length > 0 ||
    estruturasSelecionadas.length > 0;
  useEffect(() => {
    if (!selecaoTemComponente) return;
    setSecoes((s) => (s.componentes ? s : { ...s, componentes: true }));
  }, [selecaoTemComponente, setSecoes]);

  /**
   * O lote medido a partir das divisas. `null` enquanto não houver nenhuma.
   *
   * A área NÃO vem de `Space`: um anel em volta da casa daria a área do quintal,
   * porque ambiente desconta buraco. Ver o cabeçalho de `blueprintTerreno`.
   */
  const limitesDoNivel = useMemo(
    () => editor.model.boundaries.filter((b) => !levelId || b.levelId === levelId),
    [editor.model.boundaries, levelId],
  );
  const terreno = useMemo(() => medirTerreno(limitesDoNivel), [limitesDoNivel]);

  /**
   * Há lote desenhado — a guarda do toggle "Terreno" da vista 3D.
   *
   * Olha `model.boundaries` INTEIRO, e não `limitesDoNivel`, porque é isso que o
   * viewer 3D projeta: o lote é um só, e não uma divisa por pavimento. Ligar o
   * toggle sem divisa nenhuma não desenharia nada e pareceria falha.
   */
  const temTerreno = useMemo(
    () => editor.model.boundaries.some((b) => b.kind === 'TERRENO'),
    [editor.model.boundaries],
  );

  /** O que sobra para construir depois dos recuos. `null` sem lote. */
  const envelope = useMemo(
    () => (terreno ? envelopeConstrutivo(terreno, limitesDoNivel, recuos) : null),
    [terreno, limitesDoNivel, recuos],
  );

  const aproveitamento = useMemo(
    () =>
      terreno
        ? calcularAproveitamento(
            terreno,
            editor.model.spaces.filter((sp) => !levelId || sp.levelId === levelId),
          )
        : null,
    [terreno, editor.model.spaces, levelId],
  );

  // ── Quadro de divisas — papéis, medidas da escritura e confrontantes ──────

  const [quadroAberto, setQuadroAberto] = useState(false);
  /** Lado aceso pelo foco no quadro. Destacar não é selecionar — ver o canvas. */
  const [limiteEmDestaque, setLimiteEmDestaque] = useState<string | null>(null);

  const linhasDoLote = useMemo(
    () => (terreno ? linhasDoQuadro(terreno, limitesDoNivel) : []),
    [terreno, limitesDoNivel],
  );
  const ladosSemPapel = linhasDoLote.filter((l) => l.papel === null).length;
  const ladosDivergentes = linhasDoLote.filter(divergente).length;

  /**
   * O quadro abre SOZINHO quando o contorno acabou de fechar sem papel nenhum.
   *
   * É o "ao criar um terreno" do pedido: sem isso, classificar os lados continua
   * sendo uma coisa que dá para esquecer — e lado sem papel não recua, produzindo
   * um envelope errado sem nenhum aviso na tela.
   *
   * ⚠️ A guarda `jaAbriuOQuadro` é o que impede o painel de reabrir a cada
   * edição. Sem ela, apagar o papel dos quatro lados (ou desfazer até antes da
   * classificação) traria o painel de volta por cima do desenho, no meio de outro
   * trabalho.
   */
  const jaAbriuOQuadro = useRef(false);
  useEffect(() => {
    if (!terreno?.fechado) return;
    if (jaAbriuOQuadro.current) return;
    if (linhasDoLote.some((l) => l.papel !== null)) {
      // Lote que veio de um snapshot já classificado não precisa do passo de
      // criação — mas também não pode disparar depois, se alguém limpar tudo.
      jaAbriuOQuadro.current = true;
      return;
    }
    jaAbriuOQuadro.current = true;
    setQuadroAberto(true);
  }, [terreno?.fechado, linhasDoLote]);

  /** Aplica a frente apontada e deriva os demais — UM passo de histórico. */
  function apontarFrente(boundaryId: string) {
    if (!terreno) return;
    const papeis = papeisSugeridos(terreno, boundaryId);
    if (!papeis) return;
    editor.runBatch(
      [...papeis].map(([id, papel]) => ({ type: 'SetBoundaryPapel' as const, boundaryId: id, papel })),
    );
  }

  function adicionarAbertura(wallId: string, offsetMm: number) {
    // Vão livre nasce como porta: do piso (peitoril zero) até a altura de verga.
    // Passa-prato — vão sem esquadria com peitoril alto — se faz subindo o
    // peitoril depois, no painel.
    const comoPorta =
      tipoAbertura === 'door' || tipoAbertura === 'passage' || tipoAbertura === 'sliding';
    const [id] = editor.run({
      type: 'AddOpening',
      wallId,
      kind: tipoAbertura,
      embutida: tipoAbertura === 'sliding' ? correrEmbutida : undefined,
      offsetMm,
      widthMm: larguraAbertura,
      heightMm: comoPorta ? 2100 : 1200,
      sillMm: comoPorta ? 0 : 900,
    });
    // JÁ NASCE SELECIONADA.
    //
    // Tudo que se faz com uma abertura logo depois de inserir — girar, espelhar,
    // acertar a largura, subir o peitoril, trocar o tipo — mora no painel do
    // selecionado. Sem isto, cada porta custava um clique a mais só para dizer
    // "esta que acabei de pôr", e esse clique tem que acertar o vão: perto da
    // ombreira ele pega a PAREDE, e o painel mostra a coisa errada.
    //
    // A ferramenta continua sendo Abertura: quem está pondo uma fileira de portas
    // segue pondo, e a seleção acompanha a última. Trocar para Selecionar aqui
    // interromperia justamente o trabalho em série.
    if (id) selecionar([id]);
  }

  /**
   * Gira ou espelha a folha da porta selecionada — de abrir ou de correr.
   *
   * Um comando só para as duas: na de abrir, `hinge` é a dobradiça e `swing` é o
   * lado para onde abre; na de correr, `hinge` é a ponta para onde a folha
   * recolhe e `swing` é a face por onde ela desliza. O painel escolhe as
   * palavras; o eixo é o mesmo.
   */
  function flipAbertura(axis: 'hinge' | 'swing') {
    if (!aberturaSel) return;
    editor.run({ type: 'FlipOpening', openingId: aberturaSel.id, axis });
  }

  /**
   * Muda largura/altura/peitoril da abertura selecionada.
   *
   * Sem tratamento de erro aqui de propósito: o kernel recusa o que não couber
   * (largura além da parede, altura além do pé-direito, sobreposição com outra
   * abertura) e `editor.run` transforma o `KernelError` na faixa de aviso do
   * topo — que já traz a medida máxima no texto.
   */
  function redimensionarAbertura(campos: {
    widthMm?: number;
    heightMm?: number;
    sillMm?: number;
  }) {
    if (!aberturaSel) return;
    editor.run({ type: 'SetOpeningSize', openingId: aberturaSel.id, ...campos });
  }

  function dividirSelecionada() {
    if (!paredeSel) return;
    // Divide no meio: e o unico ponto que sempre existe e nunca coincide com
    // ponta, entao nao depende de o usuario acertar um clique no eixo.
    editor.run({
      type: 'SplitWall',
      wallId: paredeSel.id,
      at: {
        x: Math.round((paredeSel.a.x + paredeSel.b.x) / 2),
        y: Math.round((paredeSel.a.y + paredeSel.b.y) / 2),
      },
    });
    editor.setSelectedId(null);
  }

  /**
   * A vizinha que pode ser unida à selecionada.
   *
   * Precisa ser COLINEAR, e não só encostada. A primeira versão pegava qualquer
   * parede que compartilhasse uma ponta — mas numa sala retangular toda vizinha
   * é perpendicular, então ela escolhia a errada e o kernel recusava com
   * "Paredes não são colineares". O botão ficava quebrado no caso mais comum, e
   * o erro aparecia depois do clique em vez de antes.
   *
   * Calculado como memo para a UI poder DESABILITAR o botão quando não houver
   * candidata, em vez de deixar o usuário descobrir clicando.
   */
  const vizinhaParaUnir = useMemo(() => {
    if (!paredeSel) return null;
    const mesmaPonta = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
    return (
      editor.model.walls.find((o) => {
        if (o.id === paredeSel.id || o.levelId !== paredeSel.levelId) return false;
        if (o.thicknessMm !== paredeSel.thicknessMm) return false;
        const encosta =
          mesmaPonta(o.a, paredeSel.b) ||
          mesmaPonta(o.b, paredeSel.a) ||
          mesmaPonta(o.a, paredeSel.a) ||
          mesmaPonta(o.b, paredeSel.b);
        if (!encosta) return false;
        // Os quatro pontos têm que estar na mesma reta — testado com os dois
        // extremos da vizinha, senão uma parede que só toca de raspão passa.
        return (
          areCollinear(paredeSel.a, paredeSel.b, o.a) &&
          areCollinear(paredeSel.a, paredeSel.b, o.b)
        );
      }) ?? null
    );
  }, [paredeSel, editor.model.walls]);

  function unirSelecionada() {
    if (!paredeSel || !vizinhaParaUnir) return;
    editor.run({ type: 'MergeWalls', firstId: paredeSel.id, secondId: vizinhaParaUnir.id });
    editor.setSelectedId(null);
  }

  /**
   * A ponta escolhida À MÃO no painel, se houver.
   *
   * Guarda o `wallId` junto de propósito: assim a escolha morre sozinha ao
   * trocar de parede, sem `useEffect` de limpeza. Escolha que vazasse para a
   * parede seguinte seria pior que não ter escolha nenhuma — o campo passaria a
   * esticar a ponta errada em silêncio.
   */
  const [ancoraManual, setAncoraManual] = useState<{ wallId: string; end: 'a' | 'b' } | null>(null);
  /** Ponta apontada no painel agora, para o desenho mostrar QUAL é. */
  const [pontaDestacada, setPontaDestacada] = useState<'a' | 'b' | null>(null);

  /**
   * Qual ponta anda ao digitar um novo comprimento, e se isso arrasta o canto.
   *
   * Decisão de produto (12/08/2026): se uma das pontas está LIVRE, é ela que
   * anda — a correção feita à mão, logo depois de desenhar, não deve mexer em
   * nada já encaixado. Se as duas estão livres, ou as duas presas, anda a
   * FINAL (`b`, a última clicada ao desenhar): é a regra mais fácil de prever
   * quando não há uma ponta obviamente "solta".
   *
   * Isso é o PADRÃO, não a sentença (28/08/2026). Numa parede com os dois cantos
   * fechados a regra sempre puxava a final, e "final" depende de qual ponta foi
   * clicada primeiro ao desenhar — informação que não aparece em lugar nenhum
   * depois. Os botões Início/Fim do painel sobrepõem a escolha.
   */
  const esticamento = useMemo(() => {
    if (!paredeSel) {
      return {
        pontaQueAnda: null as 'a' | 'b' | null,
        arrastaCanto: false,
        aLivre: false,
        bLivre: false,
        escolhidaAMao: false,
      };
    }
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const aLivre = isFreeWallEnd(nivel, paredeSel.a, paredeSel.id);
    const bLivre = isFreeWallEnd(nivel, paredeSel.b, paredeSel.id);
    const automatica: 'a' | 'b' = aLivre && !bLivre ? 'a' : 'b';
    const manual = ancoraManual?.wallId === paredeSel.id ? ancoraManual.end : null;
    const pontaQueAnda = manual ?? automatica;
    return {
      pontaQueAnda,
      arrastaCanto: !(pontaQueAnda === 'a' ? aLivre : bLivre),
      aLivre,
      bLivre,
      escolhidaAMao: manual !== null,
    };
  }, [paredeSel, editor.model.walls, ancoraManual]);

  /**
   * Aplica o comprimento digitado no painel.
   *
   * A ponta escolhida (`esticamento.pontaQueAnda`) anda ao longo do PRÓPRIO
   * EIXO — `pontaEsticada` preserva a direção, a parede nunca gira.
   *
   * Se aquela ponta ENCONTRA outras paredes, elas andam JUNTO, no MESMO lote de
   * histórico (`runBatch`): mover só a nossa abriria o canto e apagaria o
   * ambiente e o quantitativo em silêncio — a mesma razão pela qual o traçado
   * pela face mitra o canto num lote só. `runBatch` aborta o lote inteiro se
   * alguma correção for recusada, então o canto nunca fica pior do que estava.
   *
   * O acompanhamento é do KERNEL (`MoveVertex` com `manterJuncoes`), não um laço
   * daqui. Enquanto era um laço, ele casava vizinha por coordenada EXATA, e numa
   * junção em T a ponta que morre no meio do corpo de outra parede não é vértice
   * de ninguém — não havia `MoveVertex` de vizinha para disparar e o encontro
   * simplesmente desencostava. No kernel a mesma conta cobre vértice e T, e o
   * gesto de arrastar a alça passa a fazer exatamente isto.
   */
  function esticarParede(comprimentoMm: number) {
    if (!paredeSel) return;
    // `esticamento.pontaQueAnda` só é `null` quando `paredeSel` é `null` — mas o
    // memo devolve um tipo próprio, e o TypeScript não enxerga essa relação
    // entre as duas variáveis. A guarda é redundante em runtime, não em tipo.
    const { pontaQueAnda } = esticamento;
    if (!pontaQueAnda) return;
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const ancora = pontaQueAnda === 'a' ? paredeSel.b : paredeSel.a;
    const pontaAtual = pontaQueAnda === 'a' ? paredeSel.a : paredeSel.b;

    let novaPonta: Point;
    try {
      novaPonta = pontaEsticada(ancora, pontaAtual, comprimentoMm);
    } catch (e) {
      // Coordenada fora de ±1.000.000 mm (alguém digitou metros achando que
      // eram milímetros). Recusa silenciosa: o campo já ressincroniza com o
      // valor atual no próximo render, então não há necessidade de expor o
      // erro do kernel para um dígito a mais.
      if (e instanceof KernelError) return;
      throw e;
    }

    const lote: Command[] = [
      {
        type: 'MoveVertex',
        wallId: paredeSel.id,
        end: pontaQueAnda,
        to: novaPonta,
        manterJuncoes: true,
      },
    ];

    // ── O LADO OPOSTO ACOMPANHA, quando isto é um retângulo ─────────────────
    //
    // Sem isto, mover a ponta arrasta UM canto: a parede perpendicular fica
    // oblíqua e o retângulo vira um quadrilátero irregular. Transladando também
    // o outro extremo do lado perpendicular, o LADO INTEIRO anda — os dois
    // lados paralelos ao editado ficam com o comprimento novo e os quatro
    // ângulos seguem retos.
    //
    // Vai no MESMO lote: um Desfazer devolve o retângulo inteiro. Em dois
    // lotes existiria um passo intermediário com a planta torta, que ninguém
    // quer visitar.
    const acompanha = verticeDeAcompanhamento(nivel, paredeSel, pontaQueAnda);
    if (acompanha) {
      const dx = novaPonta.x - pontaAtual.x;
      const dy = novaPonta.y - pontaAtual.y;
      let destino: Point;
      try {
        destino = point(roundToMm(acompanha.x + dx), roundToMm(acompanha.y + dy));
      } catch (e) {
        if (e instanceof KernelError) return;
        throw e;
      }
      for (const w of nivel) {
        for (const end of ['a', 'b'] as const) {
          if (w[end].x === acompanha.x && w[end].y === acompanha.y) {
            lote.push({ type: 'MoveVertex', wallId: w.id, end, to: destino });
          }
        }
      }
    }

    editor.runBatch(lote);
  }

  /**
   * Vãos candidatos: pares de pontas de parede que não encontram nada e estão
   * perto o bastante para ser abertura.
   *
   * O sistema NÃO decide qual fechar — só apresenta. Cinco rodadas do Spike C
   * mostraram que essa decisão é justamente a que a máquina erra: fechar por
   * proximidade junta parede com guarda-corpo; fechar por colinearidade fecha a
   * borda de terraço, que devia ficar aberta. Porta, guarda-corpo e limite do
   * envelope têm geometria parecida demais.
   *
   * O que a máquina faz bem é ACHAR os candidatos e medir. Quem sabe se aquele
   * vão de 90 cm é porta ou passagem é quem conhece o projeto.
   */
  const vaosCandidatos = useMemo(() => {
    // ⚠️ A VERDADE É O ARRANJO, não a contagem de coordenadas repetidas.
    //
    // Aqui havia um mapa de "quantas paredes terminam exatamente neste ponto", e
    // grau 1 virava bolinha âmbar. Isso erra na junção em T, que é a mais comum
    // de todas: o montante morre no MEIO da hospedeira, não divide vértice com
    // ninguém, e a contagem o declarava solto — enquanto o arranjo planar, que
    // divide a hospedeira na interseção, já o via com grau 3 e ligado.
    //
    // O ESTRAGO FOI REAL. Numa planta do usuário com 9 ambientes fechados e UMA
    // ponta solta de verdade, este painel desenhava QUINZE círculos. Quatorze
    // eram junções em T perfeitas. Ele passou quatro rodadas de correção olhando
    // para marcações que não deviam existir — e a cada rodada a geometria era
    // mexida, porque o marcador é que estava mentindo.
    //
    // O critério tem de ser o do arranjo porque é ele que responde a pergunta
    // que o aviso faz — "o contorno fecha?" —, e é dele que saem área, piso e
    // rodapé.
    const level = editor.model.levels.find((l) => l.id === levelId);
    const soltas: PontaSolta[] = level
      ? pontasSoltasDoNivel(editor.model, level).map((s) => ({
          p: s.p,
          wallId: s.wallId,
          end: s.end,
          oposta: s.oposta,
        }))
      : [];
    const pontas = soltas;

    // Faixa de abertura de verdade: de 40 cm (passagem estreita) a 3 m (vão de
    // sala). Fora disso não é abertura — é parede faltando ou desenho separado.
    const MIN = 400;
    const MAX = 3000;
    const pares: Vao[] = [];
    for (let i = 0; i < pontas.length; i++) {
      for (let j = i + 1; j < pontas.length; j++) {
        const a = pontas[i];
        const b = pontas[j];
        const mm = Math.round(Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y));
        if (mm < MIN || mm > MAX) continue;
        // Perto NÃO basta — as duas pontas têm que estar na mesma linha.
        if (!naMesmaLinha(a, b) || !naMesmaLinha(b, a)) continue;
        // `Set` porque as duas pontas podem ser da MESMA parede — um trecho
        // curto e solto, com os dois extremos livres. Selecionar o id repetido
        // faria o painel anunciar "2 paredes" onde há uma.
        pares.push({ a: a.p, b: b.p, mm, wallIds: [...new Set([a.wallId, b.wallId])] });
      }
    }
    // Cada ponta entra num par só: o mais curto ganha.
    pares.sort((p, q) => p.mm - q.mm);
    const usada = new Set<string>();
    const escolhidos: Vao[] = [];
    for (const par of pares) {
      const ka = `${par.a.x},${par.a.y}`;
      const kb = `${par.b.x},${par.b.y}`;
      if (usada.has(ka) || usada.has(kb)) continue;
      usada.add(ka);
      usada.add(kb);
      escolhidos.push(par);
    }
    return { soltas, vaos: escolhidos };
  }, [editor.model.walls, levelId]);

  /**
   * O beco sem saída, nomeado: pontas soltas contra um segmento PARALELO.
   *
   * A conta mora no kernel (`juntasParalelasSemCanto`), junto de
   * `encostosSemJuncao` e `cantosEncostados` — é diagnóstico de topologia, e a
   * régua de paralelismo tem de ser a MESMA que `cantoEntreEixos` usa para
   * recusar. Reimplementada aqui, o aviso apareceria em casos que a ferramenta
   * Juntar resolve, ou calaria em casos que ela recusa.
   */
  const juntasParalelas = useMemo(() => {
    const level = editor.model.levels.find((l) => l.id === levelId);
    return level ? juntasParalelasSemCanto(editor.model, level) : [];
  }, [editor.model, levelId]);

  /**
   * ─── CONEXÃO EM T, AUTOMÁTICA ───────────────────────────────────────────────
   *
   * Pedido de 23/08/2026, com print: "a conexão de paredes em T aparentemente não
   * está acontecendo". Estava certo, e o defeito era pior do que o print mostrava.
   *
   * MEDIDO NA PLANTA DO USUÁRIO (gerada de PDF): 35 paredes, 22 vértices de grau 1
   * e ZERO ambientes. Treze pontas paravam a 11–100 mm do eixo da parede que
   * deveriam encontrar — meia espessura dela. Em planta o T parecia perfeito,
   * porque as faixas de espessura se sobrepõem; no modelo, feito de eixos, a ponta
   * estava solta. Levando as treze ao eixo: 0 → 5 ambientes.
   *
   * ─── POR QUE AUTOMÁTICO ─────────────────────────────────────────────────────
   *
   * Decisão do usuário, escolhida contra a alternativa de um botão no painel. O
   * risco que eu levantei — mover parede sem ninguém pedir — está mitigado por
   * três coisas, e não some:
   *
   *   1. entra pelo HISTÓRICO (`runBatch`), então Desfazer reverte o lote inteiro;
   *   2. avisa DEPOIS, na faixa de status: "sem perguntar" não é "sem contar";
   *   3. o critério é estreito — a ponta tem de estar DENTRO da faixa de espessura
   *      desenhada da outra parede. É essa a definição de "parece ligado".
   *
   * Roda UMA vez por carregamento. Rodar a cada mudança do modelo brigaria com
   * quem está editando: bastaria arrastar uma ponta para perto de outra parede
   * para ela ser puxada para o eixo no meio do gesto.
   *
   * ─── DUAS FORMAS, E POR QUE ITERA ───────────────────────────────────────────
   *
   * `encostosSemJuncao` pega a ponta que morre contra outra parede; `cantosEncostados`
   * pega as duas pontas que se sobrepõem num CANTO. As duas são o mesmo defeito —
   * desenho afirmando ligação que o modelo não tem — e o usuário não distingue uma
   * da outra olhando a tela.
   *
   * O LAÇO não é zelo: corrigir muda a topologia, e a topologia é o critério.
   * Na planta do usuário a primeira passada resolveu 13 pontas e, ao mudar o
   * arranjo, revelou uma 14ª que antes nem aparecia como solta. Rodando uma vez
   * só, ela sobrava na tela — e foi exatamente o "não funcionou" que ele reportou.
   */
  const [avisoConexaoT, setAvisoConexaoT] = useState<string | null>(null);
  const conexaoTFeitaEm = useRef<string | null>(null);

  /**
   * Os comandos que faltam para o modelo afirmar o que o desenho já afirma.
   *
   * Itera sobre uma cópia SIMULADA (`applyBatch`), e não sobre o estado do React:
   * `editor.model` só muda no próximo render, então um laço que dependesse dele
   * releria o mesmo modelo a cada volta e nunca convergiria.
   */
  const comandosDeConexao = useCallback(
    (partida: typeof editor.model): Command[] => {
      const todos: Command[] = [];
      let atual = partida;
      // Teto de segurança. Cada volta só é dada se a anterior mudou alguma coisa,
      // então convergir é o caso normal; o teto existe para o caso patológico em
      // que duas correções se desfazem mutuamente, e vale mais parar com o que já
      // deu certo do que travar a abertura da planta.
      for (let volta = 0; volta < 6; volta++) {
        const level = atual.levels.find((l) => l.id === levelId);
        if (!level) break;
        const lote: Command[] = [
          ...encostosSemJuncao(atual, level).map((e) => ({
            type: 'MoveVertex' as const,
            wallId: e.wallId,
            end: e.end,
            to: e.to,
          })),
          ...cantosEncostados(atual, level).flatMap((c) =>
            c.movimentos.map((m) => ({
              type: 'MoveVertex' as const,
              wallId: m.wallId,
              end: m.end,
              to: m.to,
            })),
          ),
        ];
        if (lote.length === 0) break;
        try {
          atual = applyBatch(atual, lote).model;
        } catch {
          // Uma correção recusada pelo kernel (uma porta que cairia fora da parede
          // encurtada, por exemplo) não pode derrubar as que já deram certo.
          break;
        }
        todos.push(...lote);
      }
      return todos;
    },
    [levelId],
  );

  /**
   * O mesmo passe, agora sob demanda.
   *
   * Diz o que fez — inclusive quando não fez nada, que é o caso em que o usuário
   * mais precisa de resposta: um botão que aceita o clique e fica em silêncio
   * ensina a desconfiar do botão.
   */
  function conectarAgora() {
    const comandos = comandosDeConexao(editor.model);
    if (comandos.length === 0) {
      setAvisoConexaoT(
        'Nenhuma ponta se sobrepõe a outra parede no desenho — não há o que encostar sem adivinhar. ' +
          'As que sobram estão longe o bastante para serem vão de verdade: use a ferramenta Juntar, ' +
          'que deixa a decisão com você.',
      );
      return;
    }
    editor.runBatch(comandos);
    setAvisoConexaoT(
      `${comandos.length} ponta(s) encostadas. Desfazer reverte tudo de uma vez.`,
    );
  }

  useEffect(() => {
    if (editor.loading || !branchId || !levelId) return;
    if (conexaoTFeitaEm.current === branchId) return;
    conexaoTFeitaEm.current = branchId;

    const comandos = comandosDeConexao(editor.model);
    if (comandos.length === 0) return;
    editor.runBatch(comandos);
    setAvisoConexaoT(
      `${comandos.length} ponta(s) encostavam noutra parede sem alcançar o eixo dela — o desenho parecia ` +
        'ligado, o modelo não estava, e por isso os ambientes não fechavam. Foram encostadas. ' +
        'Desfazer reverte tudo de uma vez.',
    );
    // `editor` muda a cada render; incluí-lo faria o efeito disparar de novo logo
    // depois de mexer no modelo. A trava real é `conexaoTFeitaEm`, e a identidade
    // do carregamento é `branchId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.loading, branchId, levelId]);

  /**
   * ─── JUNTAR DUAS PONTAS SOLTAS NUM CANTO ────────────────────────────────────
   *
   * Pedido de 23/08/2026: clicar num círculo âmbar, clicar no outro, e as duas
   * paredes se encontrarem sozinhas. Até aqui a ponta solta era só AVISO — fechar
   * o canto exigia selecionar a parede, pegar a alça e arrastar a olho, em pixel.
   *
   * O detector de vãos não cobre este caso de propósito: ele só oferece pares na
   * MESMA LINHA, e canto aberto por definição não está (ver `naMesmaLinha`).
   */
  const [pontaEmJuncao, setPontaEmJuncao] = useState<PontaSolta | null>(null);
  const [avisoJuncao, setAvisoJuncao] = useState<string | null>(null);

  /**
   * O que está copiado. Estado, e não `ref`: a barra mostra "Colar" habilitado
   * ou não a partir dele, e um `ref` não redesenharia o botão.
   *
   * NÃO usa a área de transferência do sistema operacional. O que se copia aqui
   * são ids de um modelo de kernel, não texto — e passar por `navigator
   * .clipboard` exigiria permissão do navegador para colar o que o próprio
   * editor acabou de guardar.
   */
  const [areaDeTransferencia, setAreaDeTransferencia] = useState<AreaDeTransferencia | null>(null);
  const [avisoColar, setAvisoColar] = useState<string | null>(null);

  /**
   * Trocar de ferramenta esquece a ponta escolhida.
   *
   * Uma escolha que sobrevive à troca volta a agir num clique que o usuário já
   * esqueceu ter dado — e o que ela faz é mover geometria.
   */
  useEffect(() => {
    if (editor.tool !== 'juntar') {
      setPontaEmJuncao(null);
      setAvisoJuncao(null);
    }
  }, [editor.tool]);

  /**
   * Leva as duas pontas ao cruzamento dos próprios eixos.
   *
   * NENHUMA parede gira: cada uma anda no eixo em que já está, uma encurtando e a
   * outra esticando, até o ponto onde as duas retas se cruzam. Se a planta veio
   * torta do PDF o canto sai com 89° — e sai FECHADO, que é o que decide se o
   * ambiente aparece e se o quantitativo sai. Endireitar o desenho é outro
   * problema; resolvê-lo aqui giraria uma parede que ninguém mandou girar.
   *
   * `runBatch`, e não dois `run`: UM passo de desfazer, e o lote inteiro aborta se
   * o kernel recusar qualquer um dos dois — o canto nunca fica pior do que estava.
   * Mesmo argumento de `esticarParede`. A recusa do kernel (uma porta que cairia
   * fora da parede encurtada) aparece sozinha na faixa vermelha.
   */
  function juntarPontas(primeira: PontaSolta, segunda: PontaSolta) {
    setAvisoJuncao(null);

    if (primeira.wallId === segunda.wallId) {
      setAvisoJuncao('São as duas pontas da MESMA parede — uma parede não faz canto consigo mesma.');
      setPontaEmJuncao(null);
      return;
    }

    const canto = cantoEntreEixos(primeira.oposta, primeira.p, segunda.oposta, segunda.p);
    if (!canto) {
      setAvisoJuncao(
        'Estas duas não formam canto: os eixos são paralelos (ou quase), ou se cruzariam longe demais. ' +
          'Se elas estão na MESMA LINHA, o caso é vão — use a lista do painel âmbar.',
      );
      setPontaEmJuncao(null);
      return;
    }

    editor.runBatch([
      { type: 'MoveVertex', wallId: primeira.wallId, end: primeira.end, to: canto },
      { type: 'MoveVertex', wallId: segunda.wallId, end: segunda.end, to: canto },
    ]);
    setPontaEmJuncao(null);
  }

  /**
   * Da SELEÇÃO no desenho de volta para a linha da lista — o caminho inverso do
   * clique.
   *
   * Sem ele o casamento só funcionava num sentido: quem achasse a ponta solta na
   * planta (que é onde ela salta aos olhos, em âmbar) tinha de descobrir sozinho
   * qual das linhas "Vão N" oferecia fechá-la, e numa planta real as medidas se
   * repetem — havia quatro vãos de 0,98 m.
   *
   * É um conjunto, e não um índice: uma parede com as DUAS pontas soltas
   * participa de dois vãos, e apagar um deles da lista seria mentir sobre o que
   * a seleção alcança. Para o desenho e para a rolagem vale o primeiro.
   */
  const vaosDaSelecao = useMemo(() => {
    const sel = new Set(editor.selectedIds);
    const marcados = new Set<number>();
    if (sel.size === 0) return marcados;
    vaosCandidatos.vaos.forEach((v, i) => {
      if (v.wallIds.some((id) => sel.has(id))) marcados.add(i);
    });
    return marcados;
  }, [editor.selectedIds, vaosCandidatos.vaos]);

  const primeiroVaoDaSelecao = vaosDaSelecao.size > 0 ? Math.min(...vaosDaSelecao) : null;

  /**
   * Traz a linha correspondente para dentro da vista.
   *
   * `'nearest'` de propósito: se a linha já está visível, nada se mexe. Rolar o
   * painel a cada clique no desenho embaralharia a leitura de quem está
   * revisando a lista de cima a baixo.
   */
  const linhasDeVao = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (primeiroVaoDaSelecao === null) return;
    linhasDeVao.current.get(primeiroVaoDaSelecao)?.scrollIntoView({ block: 'nearest' });
  }, [primeiroVaoDaSelecao]);

  /**
   * Da linha da lista para o desenho: seleciona as paredes das duas pontas.
   *
   * Passa pelo funil `selecionar` como qualquer outra seleção — a lista não tem
   * um estado de seleção próprio, senão painel e canvas voltariam a mostrar
   * coisas diferentes.
   */
  function selecionarParedesDoVao(vao: Vao) {
    if (vao.wallIds.length === 0) return;
    selecionar(vao.wallIds);
  }

  /** Fecha o vão com parede cheia. Use quando a interrupção era só desenho. */
  function fecharComParede(vao: { a: Point; b: Point }) {
    if (!levelId) return;
    editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
  }

  /**
   * Fecha o vão e marca que ali existe uma porta.
   *
   * Duas operações porque são dois fatos: o contorno passa a fechar (e o
   * ambiente aparece com a área certa) E fica registrado que aquele trecho é
   * abertura, não alvenaria. Sem a segunda, o quantitativo contaria parede onde
   * há porta.
   */
  /**
   * Fecha o vão com uma abertura do tipo escolhido.
   *
   * ─── POR QUE NÃO SÃO SÓ "PORTA" E "PAREDE" ──────────────────────────────
   *
   * Era assim, e o usuário topou com o limite na revisão de uma planta gerada:
   * em planta, JANELA interrompe a face da parede exatamente como porta, então
   * o detector oferece o vão dela junto com os outros. Sem "é janela" na lista,
   * a única saída era fechar como porta (e ganhar uma porta que não existe, com
   * peitoril zero interrompendo o rodapé) ou como parede (e perder a janela do
   * quantitativo de esquadrias).
   *
   * As duas erram, e erram calado. A lista precisa oferecer o que o desenho
   * pode ser.
   *
   * ⚠️ Janela nasce com peitoril: é o que a distingue de porta no rodapé —
   * `quantities.ts` interrompe o rodapé por peitoril ZERO, não por tipo.
   */
  function fecharComAbertura(
    vao: { a: Point; b: Point; mm: number },
    kind: 'door' | 'window' | 'passage' | 'sliding',
    embutida?: boolean,
  ) {
    if (!levelId) return;
    // O ID VEM DO COMANDO, não de `editor.model`.
    //
    // Aqui estava `editor.model.walls[antes]` depois do `run`, e `editor.model` é
    // estado de React: dentro deste mesmo tratador ele ainda é o modelo ANTERIOR,
    // então a leitura devolvia `undefined`, o `if` não entrava e a porta nunca era
    // criada. O vão fechava com alvenaria cheia e o quantitativo contava parede
    // onde havia porta — em silêncio, que é o pior jeito de errar.
    const [idParede] = editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
    if (!idParede) return;
    const comoPorta = kind !== 'window';
    const [idAbertura] = editor.run({
      type: 'AddOpening',
      wallId: idParede,
      kind,
      embutida: kind === 'sliding' ? embutida : undefined,
      offsetMm: 0,
      widthMm: vao.mm,
      heightMm: comoPorta ? 2100 : 1200,
      sillMm: comoPorta ? 0 : 900,
    });
    // A abertura, não a parede que a hospeda: quem clicou "É porta" na lista de
    // vãos decidiu sobre a ESQUADRIA, e é o painel dela que traz girar, espelhar
    // e o tamanho. Selecionar a parede aqui responderia outra pergunta.
    if (idAbertura) selecionar([idAbertura]);
  }

  /**
   * Move a ponta de uma parede.
   *
   * O comando já existia no kernel desde o Spike A — com undo e rederivação de
   * ambientes — e nenhuma parte da tela o acionava. Consertar uma parede torta
   * exigia apagar e redesenhar, e redesenhar é justamente onde o erro nasce.
   */
  /**
   * Fecha a aferição com a distância digitada.
   *
   * O valor entra em METROS porque é assim que a cota vem escrita na planta, e
   * vai para o serviço em milímetros — a conversão fica num lugar só, aqui.
   */
  function aplicarAfericao() {
    const metros = Number(distanciaDigitada);
    if (!afericao || !(metros > 0)) return;

    // A escala ANTERIOR precisa ser capturada antes de aplicar a nova: é dela
    // que as medições já traçadas são transformadas. Sem isso, corrigir a
    // escala deixaria cada contorno flutuando fora do que foi traçado.
    const escalaAnterior = fundo.underlay;

    void fundo
      .aplicarCalibracao(afericao.p1, afericao.p2, Math.round(metros * 1000), alinharNaAfericao)
      .then((nova) => {
        // `nova` VEM DA CHAMADA, não do estado: ler `fundo.underlay` aqui
        // devolveria o valor velho, porque o React só atualiza o closure na
        // renderização seguinte — e as medições seriam transformadas de uma
        // escala para ela mesma, ou seja, não seriam transformadas.
        if (escalaAnterior && nova)
          void medicoes.reposicionar(escalaAnterior, nova, fundo.ativaId);
      });
    setAfericao(null);
    setDistanciaDigitada('');
    editor.setTool('selecionar');
  }

  /**
   * Arrastar a ALÇA de uma ponta. Leva as vizinhas junto quando o modo é MANTER.
   *
   * Até aqui este era o único gesto de junção que NUNCA levava ninguém, enquanto
   * digitar o comprimento no painel sempre levava — a mesma parede se comportava
   * de dois jeitos conforme o caminho, e a alça é justamente o gesto que mais
   * desfazia junção.
   */
  function moverPonta(wallId: string, end: 'a' | 'b', to: Point) {
    editor.run({ type: 'MoveVertex', wallId, end, to, manterJuncoes: modoJuncao === 'MANTER' });
  }

  /** Nasce uma divisa. `TERRENO` entra no anel do lote; `DIVISA` fica solta. */
  function adicionarLimite(a: Point, b: Point, kind: BoundaryKind) {
    editor.run({ type: 'AddBoundary', levelId: levelId ?? '', a, b, kind });
  }

  /**
   * Nasce uma peça estrutural, com as medidas que a barra está mostrando.
   *
   * O canvas manda só os PONTOS — ele é quem conta os cliques e sabe quando o
   * contorno fechou. As medidas ficam aqui, exatamente como a espessura da
   * parede fica: são estado da barra, e passá-las pelo canvas obrigaria o
   * renderer a saber de seção e de cota, que não são assunto dele (ADR-01).
   *
   * ⚠️ O RÓTULO É CONSUMIDO ao lançar. Sem isso, digitar "P1" e clicar cinco
   * vezes criaria cinco peças chamadas "P1" — cinco linhas idênticas no
   * quantitativo e no orçamento, impossíveis de conferir contra a prancha. O
   * campo esvaziar depois do clique é o que torna óbvio que o rótulo é da
   * PRÓXIMA peça, não da ferramenta.
   */
  function adicionarEstrutural(kind: StructuralKind, pontos: Point[]) {
    const criados = editor.run({
      type: 'AddStructural',
      levelId: levelId ?? '',
      kind,
      pontos,
      ...medidasEstruturais,
      rotulo: rotuloEstrutural.trim() || null,
    });
    if (rotuloEstrutural.trim()) setRotuloEstrutural('');
    // A peça nasce SELECIONADA — é ela que se ajusta em seguida, e é o mesmo
    // comportamento que colar já tem.
    if (criados.length > 0) {
      selecionar(criados);
      // A conferência de sobreposição fica para o efeito abaixo, e não aqui:
      // `editor.model` ainda é o modelo ANTERIOR neste ponto — `run` agenda o
      // estado novo, não o devolve. Perguntar agora acharia zero sempre.
      setRecemCriado(criados[0]);
    }
  }

  /**
   * A peça que acabou de nascer atravessa alguém? — a conferência do aviso.
   *
   * Roda no efeito porque só aqui o modelo novo existe. E limpa `recemCriado`
   * em qualquer desfecho, inclusive quando não há sobreposição: deixar o id
   * pendurado faria o aviso reaparecer na próxima mudança de modelo, apontando
   * uma peça que o usuário já esqueceu.
   */
  useEffect(() => {
    if (!recemCriado) return;
    const peca = editor.model.structures.find((s) => s.id === recemCriado);
    setRecemCriado(null);
    if (!peca) return;

    const achadas = sobreposicoesDe(editor.model, peca.id);
    if (achadas.length === 0) return;

    const paredeIds = achadas
      .map((s) => (s.aId === peca.id ? s.bId : s.aId))
      .filter((id) => editor.model.walls.some((w) => w.id === id));

    setDisputa({
      pecaId: peca.id,
      nome: nomeDoTipoEstrutural(peca.kind),
      paredeIds,
      volumeM3: achadas.reduce((t, s) => t + s.volumeMm3, 0) / 1_000_000_000,
      quantos: achadas.length,
    });
  }, [recemCriado, editor.model]);

  /**
   * O que fazer com a disputa. Cada saída é um comando só, e nenhuma delas
   * grava volume: o quantitativo recalcula a interseção a cada leitura, então
   * mover o pilar depois corrige o desconto sozinho.
   */
  function resolverDisputa(escolha: EscolhaSobreposicao) {
    const atual = disputa;
    setDisputa(null);
    if (!atual) return;

    if (escolha === 'DESFAZER') {
      // `undo` e não `DeleteStructural`: a criação foi UM passo de histórico, e
      // desfazer é literalmente o que o usuário pediu — some também o rótulo
      // consumido e a seleção que nasceu com ela.
      editor.undo();
      return;
    }
    if (escolha === 'CORTAR_PAREDE') {
      // TODAS as paredes atravessadas, não só a primeira: um pilar no encontro
      // de duas paredes atravessa as duas, e cortar uma só deixaria metade do
      // problema de pé, em silêncio.
      //
      // Um LOTE, e não um comando por parede: o corte é um gesto, e desfazê-lo
      // tem de ser um Ctrl+Z, não três. E o kernel recusa o lote inteiro se uma
      // das paredes tiver abertura no caminho — o que é melhor do que cortar
      // metade e parar.
      // ─── NÃO É MAIS CORTE DESTRUTIVO (01/09/2026) ────────────────────────
      //
      // Era `CutWallAtStructural`, que partia a parede de verdade. O usuário
      // achou o defeito de projeto: *"o recorte acontece no momento que o pilar
      // é inserido, mas muitas vezes o pilar precisa de reajuste de posição com
      // snap, e o recorte acaba ficando no local errado. E como o recorte é
      // destrutivo fica um vão onde não deveria e ainda com sobreposição"*.
      //
      // Medido no estudo dele: a parede #18 acabou 100 mm ANTES da face do
      // pilar (cortada mais de uma vez, cada vez pela posição do instante) e a
      // #31 terminou no CENTRO do pilar — o snap a levou até lá depois do corte.
      //
      // "Esta parede é interrompida por este pilar" é uma RELAÇÃO VIVA, e
      // gravá-la como coordenada morta é o que produz vão órfão. Agora só a
      // decisão é gravada; a interrupção é recalculada a cada leitura, então
      // mover o pilar leva o vão junto.
      try {
        editor.runBatch(
          atual.paredeIds.map((id) => ({ type: 'SetCedeSobreposicao', id, cede: true }) as const),
        );
      } catch (e) {
        // A recusa mais provável é abertura partida, e ela precisa CHEGAR ao
        // usuário: um corte que não aconteceu e não avisou é pior do que o
        // desenho sobreposto que ele já estava vendo.
        setErroDoCorte(
          e instanceof Error && /abertura/i.test(e.message)
            ? 'O corte partiria uma porta ou janela. Mova a esquadria ou o pilar e tente de novo.'
            : 'Não foi possível cortar a parede neste ponto.',
        );
      }
      return;
    }
    if (escolha === 'PECA_CEDE') {
      editor.run({ type: 'SetCedeSobreposicao', id: atual.pecaId, cede: true });
    }
    // 'MANTER' não emite comando nenhum: o estado sem decisão já é o padrão, e
    // a disputa continua listada no quantitativo com `quemCede: 'NINGUEM'`.
  }

  /**
   * Move um vértice de uma peça estrutural.
   *
   * SEM o arrasto de vizinha que `moverPontaLimite` faz: estrutura não forma
   * anel com ninguém e não entra no arranjo planar, então não há canto para
   * abrir. Mover o vértice de um pilar reposiciona o pilar, e é só isso.
   */
  /**
   * Lança uma ÁGUA com o contorno que o canvas fechou. A cota do beiral nasce no
   * PÉ-DIREITO do pavimento — a água apoiada no topo da parede é o caso comum, e
   * quem quer platibanda ou beiral rebaixado ajusta no painel.
   */
  function adicionarAgua(pontos: Point[]) {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    const criados = editor.run({
      type: 'AddAgua',
      levelId: levelId ?? '',
      pontos,
      inclinacaoPct: inclinacaoTelhado,
      baseMm: nivel?.defaultHeightMm ?? 0,
    });
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * "Gerar do contorno": uma água por construção do pavimento, pela face das
   * paredes mais o beiral (ver `blueprintTelhadoContorno.ts`). É atalho de
   * desenho, não gerador de telhado — nasce com um caimento só, beiral no lado
   * 0, e o usuário ajusta ou divide.
   */
  function gerarTelhadoDoContorno() {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    if (!nivel) return;
    const contornos = contornosParaTelhado(editor.model, nivel, beiralTelhado).filter(
      (c) => c.valido,
    );
    if (contornos.length === 0) return;
    const criados = editor.runBatch(
      contornos.map(
        (c) =>
          ({
            type: 'AddAgua',
            levelId: nivel.id,
            pontos: c.pontos,
            inclinacaoPct: inclinacaoTelhado,
            baseMm: nivel.defaultHeightMm,
          }) as const,
      ),
    );
    if (criados.length > 0) selecionar(criados);
  }

  function moverPontaAgua(aguaId: string, index: number, to: Point) {
    editor.run({ type: 'MoveAguaVertex', aguaId, index, to });
  }

  function moverPontaEstrutural(structuralId: string, index: number, to: Point) {
    editor.run({ type: 'MoveStructuralVertex', structuralId, index, to });
  }

  /**
   * Move a ponta de uma divisa E ARRASTA A VIZINHA JUNTO.
   *
   * O lote é um anel: mexer numa ponta sem levar a divisa que compartilha aquele
   * vértice abre o canto, e um contorno aberto não tem área — o painel passaria
   * a acusar erro de fechamento por causa de um gesto que parecia inofensivo.
   * Mesmo lote de comandos, mesma disciplina de `esticarParede`.
   */
  function moverPontaLimite(boundaryId: string, end: 'a' | 'b', to: Point) {
    const divisa = editor.model.boundaries.find((b) => b.id === boundaryId);
    if (!divisa) return;
    const pontaAtual = divisa[end];

    const lote: Command[] = [{ type: 'MoveBoundaryVertex', boundaryId, end, to }];
    for (const outra of editor.model.boundaries) {
      if (outra.id === boundaryId || outra.levelId !== divisa.levelId) continue;
      if (outra.a.x === pontaAtual.x && outra.a.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'a', to });
      }
      if (outra.b.x === pontaAtual.x && outra.b.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'b', to });
      }
    }
    editor.runBatch(lote);
  }

  /**
   * Muda o COMPRIMENTO da divisa selecionada, digitando.
   *
   * Anda a ponta `b` sobre o mesmo eixo, com `pontaEsticada` — a mesma função
   * que estica parede. Qual ponta anda importa menos aqui do que na parede:
   * numa divisa de lote as duas costumam estar presas ao anel, e o arraste da
   * vizinha (acima) mantém o contorno fechado de qualquer jeito.
   */
  function esticarDivisa(comprimentoMm: number) {
    if (!limiteSel) return;
    let nova: Point;
    try {
      nova = pontaEsticada(limiteSel.a, limiteSel.b, comprimentoMm);
    } catch (e) {
      // Coordenada fora de ±1.000.000 mm (alguém digitou metros achando que eram
      // milímetros). Recusa silenciosa: o campo ressincroniza no próximo render.
      if (e instanceof KernelError) return;
      throw e;
    }
    moverPontaLimite(limiteSel.id, 'b', nova);
  }

  /**
   * O funil ÚNICO da seleção.
   *
   * A seleção do desenho e a da lista de medições são dois estados diferentes —
   * medição vive fora do modelo canônico e fora do histórico. Passar as duas por
   * aqui é o que impede que a lista lateral mostre uma coisa e o canvas outra.
   * A lista destaca uma medição só, então só a seleção de UMA a alimenta.
   */
  function selecionar(ids: string[]) {
    editor.setSelectedIds(ids);
    const unica = ids.length === 1 ? ids[0] : null;
    medicoes.setSelecionada(unica && medicoes.formas.some((f) => f.id === unica) ? unica : null);
  }

  /**
   * Desloca paredes E limites selecionados — o gesto que faltava no módulo.
   *
   * UM comando, e não um lote de `MoveVertex`: o lote recomputaria o arranjo
   * planar a cada ponta e, pior, passaria por estados intermediários em que a
   * parede está mais curta — o bastante para uma porta colada no limite cair
   * fora e derrubar o gesto inteiro. Ver o cabeçalho de `TranslateEntities`.
   *
   * As duas famílias vão no MESMO comando porque a vizinhança do modo Manter
   * junções precisa enxergar as duas: dividindo, uma divisa encostada numa parede
   * ficaria para trás e o anel do lote abriria em silêncio.
   */
  function moverSelecao(
    wallIds: string[],
    boundaryIds: string[],
    structuralIds: string[],
    aguaIds: string[],
    delta: Point,
  ) {
    editor.run({
      type: 'TranslateEntities',
      wallIds,
      boundaryIds,
      structuralIds,
      aguaIds,
      delta,
      manterJuncoes: modoJuncao === 'MANTER',
    });
  }

  /**
   * Desloca as medições selecionadas.
   *
   * ⚠️ Camada separada, gravação separada: medição NÃO entra no histórico de
   * desfazer (a decisão está em `useBlueprintMedicoes` — Ctrl+Z apagando um
   * levantamento seria irrecuperável). Movendo paredes e medições juntas, um
   * Ctrl+Z reverte só as paredes. Avisar é mais honesto que disfarçar: duas
   * pilhas coordenadas por uma tecla se desalinham no terceiro desfazer.
   */
  function moverMedicoes(ids: string[], delta: Point) {
    void medicoes.deslocar(ids, delta);
  }

  /**
   * Leva a área medida na planta para a ficha do empreendimento.
   *
   * Mostra o valor ATUAL antes de trocar. Substituir um número que alguém
   * digitou, sem dizer qual era, é o tipo de gravação que só se descobre quando
   * já não dá para voltar — a ficha não tem histórico.
   */
  /**
   * Leva o lote desenhado para a ficha do empreendimento: área e as quatro medidas.
   *
   * ⚠️ Grava o DESENHADO, não o escriturado. É o que este botão sempre afirmou
   * levar, e o quadro de divisas é onde se prova que os dois batem. Divergência
   * **avisa e não bloqueia** — o dono do número é o usuário, e travar a gravação
   * por causa de uma diferença de campo é o erro que já custou uma reversão.
   *
   * ⚠️ Papel sem nenhum lado fica FORA do update, não vai como zero: as colunas
   * também são preenchidas à mão na ficha, e zero apagaria o que alguém digitou.
   */
  async function gravarAreaNoEmpreendimento(empreendimentoId: string) {
    if (!terreno || !terreno.fechado) return;
    const alvo = empreendimentos.find((e) => e.id === empreendimentoId);
    if (!alvo) return;

    const nova = Number(areaEmM2(terreno).toFixed(2));
    const atual = alvo.terreno_area ?? null;
    const emMetros = (mm: number) => Number((mm / 1000).toFixed(2));

    const medidas = medidasPorPapel(terreno, limitesDoNivel);
    const campoDoPapel = {
      FRENTE: 'terreno_frente',
      FUNDOS: 'terreno_fundos',
      LATERAL_DIREITA: 'terreno_lateral_direita',
      LATERAL_ESQUERDA: 'terreno_lateral_esquerda',
    } as const;

    const patch: Partial<Empreendimento> = { terreno_area: nova };
    const linhasDaConfirmacao = [
      atual === null
        ? `Área: ${nova.toFixed(2).replace('.', ',')} m² (hoje sem registro)`
        : `Área: ${Number(atual).toFixed(2).replace('.', ',')} → ${nova.toFixed(2).replace('.', ',')} m²`,
    ];

    for (const [papel, campo] of Object.entries(campoDoPapel) as [
      keyof typeof campoDoPapel,
      (typeof campoDoPapel)[keyof typeof campoDoPapel],
    ][]) {
      const mm = medidas[papel];
      if (mm === undefined) continue;
      const valor = emMetros(mm);
      (patch as Record<string, unknown>)[campo] = valor;
      const antes = alvo[campo] ?? null;
      linhasDaConfirmacao.push(
        antes === null
          ? `${ROTULO_DO_PAPEL[papel]}: ${valor.toFixed(2).replace('.', ',')} m (hoje sem registro)`
          : `${ROTULO_DO_PAPEL[papel]}: ${Number(antes).toFixed(2).replace('.', ',')} → ${valor
              .toFixed(2)
              .replace('.', ',')} m`,
      );
    }

    const semPapel = ladosSemPapel > 0 ? `\n\n${ladosSemPapel} lado(s) sem papel não entram.` : '';
    const divergem =
      ladosDivergentes > 0
        ? `\n\n⚠️ ${ladosDivergentes} lado(s) divergem da escritura — o valor gravado é o DESENHADO.`
        : '';

    const ok = await confirmar({
      title: `Gravar as medidas do lote em ${alvo.name}?`,
      message: `${linhasDaConfirmacao.join('\n')}${semPapel}${divergem}`,
      confirmLabel: 'Gravar',
      variant: atual === null && linhasDaConfirmacao.length === 1 ? 'default' : 'warning',
    });
    if (!ok) return;

    setGravandoArea(true);
    setErroArea(null);
    try {
      const salvo = await empreendimentoService.update(empreendimentoId, patch);
      // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
      setEmpreendimentos((lista) => lista.map((e) => (e.id === salvo.id ? salvo : e)));
    } catch (e) {
      // A falha aparece ONDE a ação foi pedida. Mandá-la para a faixa de erro do
      // kernel, no topo, misturaria "o desenho é inválido" com "a rede caiu".
      setErroArea(e instanceof Error ? e.message : String(e));
    } finally {
      setGravandoArea(false);
    }
  }

  /**
   * Desliza a abertura ao longo da parede. O canvas já grampeia o arraste entre
   * as vizinhas, então a recusa do kernel aqui é rede de segurança — e, se vier,
   * já aparece na faixa de aviso do topo com a distância máxima no texto.
   */
  function moverAbertura(openingId: string, offsetMm: number) {
    editor.run({ type: 'MoveOpening', openingId, offsetMm });
  }

  function removerSelecionada() {
    const ids = editor.selectedIds;
    if (ids.length === 0) return;

    const paredes = ids.filter((id) => editor.model.walls.some((w) => w.id === id));
    const naSelecao = new Set(paredes);
    // ⚠️ `DeleteWall` JÁ APAGA as aberturas que a parede hospeda. Mandar
    // `DeleteOpening` depois procuraria uma abertura que não existe mais e
    // abortaria o lote inteiro — levando junto as exclusões que já estavam
    // certas. Só entram no lote as aberturas cuja parede FICA.
    const aberturas = ids.filter((id) => {
      const o = editor.model.openings.find((x) => x.id === id);
      return o ? !naSelecao.has(o.wallId) : false;
    });

    const limites = ids.filter((id) => editor.model.boundaries.some((b) => b.id === id));
    const estruturas = ids.filter((id) => editor.model.structures.some((s) => s.id === id));
    const aguas = ids.filter((id) => (editor.model.roofs ?? []).some((r) => r.id === id));

    const lote: Command[] = [
      ...aberturas.map((openingId) => ({ type: 'DeleteOpening', openingId }) as const),
      ...paredes.map((wallId) => ({ type: 'DeleteWall', wallId }) as const),
      ...limites.map((boundaryId) => ({ type: 'DeleteBoundary', boundaryId }) as const),
      // Estrutura não depende de parede nem hospeda nada, então a ordem dentro
      // do lote é indiferente para ela — ao contrário da abertura, que tem de
      // sair antes da parede que a segura.
      ...estruturas.map((structuralId) => ({ type: 'DeleteStructural', structuralId }) as const),
      ...aguas.map((aguaId) => ({ type: 'DeleteAgua', aguaId }) as const),
    ];
    if (lote.length > 0) editor.runBatch(lote);

    // Medições são de outra camada e de outro serviço — apagar uma parede não
    // pode apagar um levantamento por tabela, então elas saem por fora do lote.
    for (const id of ids) {
      if (medicoes.formas.some((f) => f.id === id)) void medicoes.remover(id);
    }

    selecionar([]);
  }

  /**
   * Exclui UMA peça, pela lixeira da lista de Componentes.
   *
   * Separado de `removerSelecionada` de propósito: lá o alvo é a SELEÇÃO, e usar
   * aquele caminho obrigaria a lista a selecionar a peça antes de apagá-la —
   * trocando a seleção do usuário por efeito colateral de um clique que ele deu
   * na lixeira, não na linha.
   *
   * `DeleteWall` já apaga as aberturas hospedadas (ver `removerSelecionada`),
   * então elas só saem da SELEÇÃO aqui; mandar `DeleteOpening` para elas
   * procuraria algo que não existe mais.
   */
  function excluirComponente(id: string) {
    const parede = editor.model.walls.find((w) => w.id === id);
    const abertura = editor.model.openings.find((o) => o.id === id);
    const estrutura = editor.model.structures.find((s) => s.id === id);
    const agua = (editor.model.roofs ?? []).find((r) => r.id === id);

    if (parede) editor.run({ type: 'DeleteWall', wallId: parede.id });
    else if (abertura) editor.run({ type: 'DeleteOpening', openingId: abertura.id });
    else if (estrutura) editor.run({ type: 'DeleteStructural', structuralId: estrutura.id });
    else if (agua) editor.run({ type: 'DeleteAgua', aguaId: agua.id });
    else return;

    const some = new Set<string>([id]);
    if (parede) {
      for (const o of editor.model.openings) if (o.wallId === parede.id) some.add(o.id);
    }
    if (editor.selectedIds.some((x) => some.has(x))) {
      selecionar(editor.selectedIds.filter((x) => !some.has(x)));
    }
  }

  /**
   * ─── COPIAR E COLAR ────────────────────────────────────────────────────────
   *
   * Pedido de 29/08/2026: copiar e colar objetos (paredes, portas, janelas…).
   *
   * A REGRA vive em `utils/blueprintAreaDeTransferencia.ts`, e não aqui: o que
   * entra na cópia, onde fica a âncora e em que offset a porta cai é decisão
   * pura, testável sem navegador. Aqui fica só o que é deste componente — o
   * estado, o recado na tela e a seleção do que acabou de nascer.
   */
  function copiar() {
    const r = copiarSelecao(editor.model, editor.selectedIds);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    setAreaDeTransferencia(r.area);
    setAvisoColar(null);
  }

  /** Cola no cursor. O canvas entrega o ponto e a parede que estiver embaixo. */
  function colar(destino: DestinoDeColagem) {
    if (!areaDeTransferencia || !levelId) return;
    const r = comandoDeColagem(editor.model, areaDeTransferencia, destino, levelId);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      // O que sumiu, sumiu: manter a área de transferência apontando para ids
      // apagados só faria o mesmo aviso reaparecer a cada Ctrl+V.
      setAreaDeTransferencia(null);
      return;
    }
    const criados = editor.run(r.comando);
    setAvisoColar(r.aviso);
    // A cópia nasce SELECIONADA — é ela que a pessoa quer ajustar em seguida,
    // e sem isso o próximo arraste pegaria o original de volta.
    if (criados.length > 0) selecionar(criados);
  }


  const rotuloSalvamento: Record<string, string> = {
    limpo: 'Sem alterações',
    pendente: 'Alterações não salvas',
    salvando: 'Salvando…',
    salvo: 'Rascunho salvo',
    erro: 'Falha ao salvar',
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Cabeçalho */}
      {/* UMA LINHA, ~32px em vez de ~57 (pedido de 27/08/2026: o topo comia
          espaço de desenho). "Revisão N · unidades em milímetros" saiu da tela
          para o `title` do nome — é referência, consultada uma vez, não algo que
          se lê a cada segundo.

          O ESTADO DE SALVAMENTO fica visível, e isso não é inconsistência: é
          retorno de ação. Esconder "Falha ao salvar" num tooltip seria esconder
          justamente o que precisa interromper quem está desenhando. */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-1.5">
        <BotaoBarra icone={ArrowLeft} rotulo="Voltar para a lista" onClick={onBack} />

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1
            className="truncate text-sm font-semibold text-slate-800"
            title={`${study.name} · Revisão publicada ${editor.baseRevision} · unidades em milímetros`}
          >
            {study.name}
          </h1>
          <span
            className={`shrink-0 text-xs ${
              editor.saveState === 'erro'
                ? 'text-red-600'
                : editor.saveState === 'salvo'
                  ? 'text-emerald-600'
                  : 'text-slate-500'
            }`}
          >
            {rotuloSalvamento[editor.saveState]}
          </span>
        </div>

        <button
          type="button"
          onClick={() => editor.publish()}
          disabled={editor.publishing || !editor.dirtySincePublish}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          title={
            editor.dirtySincePublish
              ? 'Publica uma versão imutável desta planta'
              : 'Nada mudou desde a última publicação'
          }
        >
          {editor.publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Publicar versão
        </button>
      </header>

      {/* Barra principal — uma linha só. Começa pelo seletor de vista e depois,
          conforme a vista: as ferramentas de desenho (planta baixa) OU os
          controles da vista (Exibir + Enquadrar). Antes o seletor tinha uma
          linha separada só para ele, o que o afastava do resto.
          `flex-wrap`: a barra tem muitos controles e sem quebra de linha
          transborda em tela estreita — foi assim que duas abas já sumiram aqui. */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"
        role="toolbar"
        aria-label="Ferramentas de desenho"
      >
        <SeletorDeVista vista={vista} onEscolher={setVista} />
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />

        {emVista ? (
          <>
            <MenuExibir
              grupos={[
                vistaEhElevacao
                  ? [
                      {
                        chave: 'cotas-altura',
                        rotulo: 'Cotas de altura',
                        icone: MoveHorizontal,
                        ligado: mostrarCotasAltura,
                        alternar: () => setMostrarCotasAltura((v) => !v),
                        ajuda: 'A cadeia vertical à esquerda, do piso ao topo da edificação.',
                      },
                      {
                        chave: 'rotulos-esquadria',
                        rotulo: 'Rótulos de esquadria',
                        icone: Tag,
                        ligado: mostrarRotulosEsquadria,
                        alternar: () => setMostrarRotulosEsquadria((v) => !v),
                        ajuda: 'Escreve "Porta"/"Janela" dentro de cada vão.',
                      },
                      {
                        chave: 'paredes-internas',
                        rotulo: 'Paredes internas',
                        icone: Grid2x2,
                        ligado: mostrarParedesInternas,
                        alternar: () => setMostrarParedesInternas((v) => !v),
                        ajuda:
                          'Desligado, a elevação mostra só a silhueta e os vãos de fachada — o caso comum. Ligado, desenha também as paredes do miolo (sem remoção de linha oculta).',
                      },
                      {
                        chave: 'estrutura-elevacao',
                        rotulo: 'Estrutura',
                        icone: Square,
                        ligado: mostrarEstruturaVista,
                        alternar: () => setMostrarEstruturaVista((v) => !v),
                        desabilitado: editor.model.structures.length === 0,
                        ajuda:
                          editor.model.structures.length === 0
                            ? 'Não há peça estrutural desenhada — use o menu Estrutural na planta baixa.'
                            : 'Pilares, vigas e lajes na fachada. A fundação aparece tracejada, abaixo da linha do solo.',
                      },
                    ]
                  : [
                      {
                        chave: 'laje-3d',
                        rotulo: 'Piso / laje',
                        icone: RectangleHorizontal,
                        ligado: mostrarLaje3d,
                        alternar: () => setMostrarLaje3d((v) => !v),
                        ajuda: 'Uma laje fina no contorno externo de cada pavimento.',
                      },
                      {
                        chave: 'arestas-3d',
                        rotulo: 'Arestas',
                        icone: Spline,
                        ligado: mostrarArestas3d,
                        alternar: () => setMostrarArestas3d((v) => !v),
                        ajuda: 'Realça as quinas das paredes com um traço.',
                      },
                      {
                        chave: 'terreno-3d',
                        rotulo: 'Terreno',
                        icone: LandPlot,
                        ligado: mostrarTerreno3d,
                        alternar: () => setMostrarTerreno3d((v) => !v),
                        desabilitado: !temTerreno,
                        ajuda: temTerreno
                          ? 'O polígono do lote como plano de chão, sob a edificação. O enquadramento passa a incluir o lote inteiro.'
                          : 'Não há divisa de terreno desenhada — use a ferramenta Terreno na planta baixa.',
                      },
                    ],
              ]}
            />
            {vistaEhElevacao && (
              <button
                type="button"
                onClick={() => setEnquadrarVistaToken((t) => t + 1)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                <MoveDiagonal className="h-3.5 w-3.5" />
                Enquadrar
              </button>
            )}
          </>
        ) : (
          <>
        <Ferramenta
          atual={editor.tool}
          valor="selecionar"
          icone={MousePointer2}
          rotulo="Selecionar"
          onClick={editor.setTool}
        />
        {/* COMPONENTES — parede, esquadria, estrutura e fundação num menu só.
            (Decisão do usuário, 31/08/2026.)

            Substitui CINCO controles que faziam a mesma pergunta em dois
            lugares: os botões Parede/Retângulo/Polígono/Abertura e o menu
            Estrutural, mais o select de Tipo que escondia porta, janela e vão
            dentro da barra. Quem procurava "janela" precisava saber que ela
            morava num select ao lado de um botão chamado "Abertura".

            A ferramenta continua sendo a de sempre: o menu escolhe o par
            (ferramenta, subtipo), porque é isso que um componente é aqui —
            "parede em retângulo" é a ferramenta `retangulo`, "janela" é
            `abertura` com `tipoAbertura: 'window'`. */}
        <MenuComponentes
          tool={editor.tool}
          tipoAbertura={tipoAbertura}
          tipoEstrutural={tipoEstrutural}
          onEscolher={(e) => {
            editor.setTool(e.tool);
            if (e.tool === 'abertura') setTipoAbertura(e.abertura);
            if (e.tool === 'estrutural') {
              setTipoEstrutural(e.estrutural);
              // As medidas do tipo novo vêm inteiras — ver `PADRAO_ESTRUTURAL`.
              setMedidasEstruturais(PADRAO_ESTRUTURAL[e.estrutural]);
            }
          }}
        />

        {/* JUNTAR não desenha — CORRIGE. Fica junto das de desenho mesmo assim
            porque é onde o erro que ela conserta nasce: contorno traçado à mão,
            ou gerado do PDF, com o canto passando do encontro. O ícone é um
            canto, que é literalmente o que o botão produz. */}
        <Ferramenta
          atual={editor.tool}
          valor="juntar"
          icone={CornerDownRight}
          rotulo="Juntar"
          onClick={editor.setTool}
        />

        {/* TERRENO. Separado das ferramentas de desenho porque o que sai daqui
            NÃO é construção: é divisa, sem espessura e sem custo. Desenhar lote
            com a ferramenta Parede poria o perímetro do terreno no orçamento
            como alvenaria. */}
        <span className="h-5 w-px bg-slate-200" aria-hidden />

        <Ferramenta
          atual={editor.tool}
          valor="terreno"
          icone={LandPlot}
          rotulo="Terreno"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="divisa"
          icone={Waypoints}
          rotulo="Divisa"
          onClick={editor.setTool}
        />

        {/* MEDIR ≠ DESENHAR. Estas três não produzem geometria: produzem uma
            AFIRMAÇÃO sobre a planta de fundo. O separador existe para isso — na
            barra, a fronteira entre derivar e afirmar precisa ser visível. */}
        <span className="h-5 w-px bg-slate-200" aria-hidden />

        <Ferramenta
          atual={editor.tool}
          valor="medir-area"
          icone={Square}
          rotulo="Área"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="medir-linha"
          icone={Spline}
          rotulo="Linha"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="contar"
          icone={Hash}
          rotulo="Contar"
          onClick={editor.setTool}
        />

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        {editor.tool === 'telhado' ? (
          /* A PRÓXIMA água: inclinação e beiral, mais o atalho do contorno. No
             mesmo lugar dos campos da estrutura, pela mesma razão. */
          <CamposDoTelhado
            inclinacaoPct={inclinacaoTelhado}
            onInclinacao={setInclinacaoTelhado}
            beiralMm={beiralTelhado}
            onBeiral={setBeiralTelhado}
            onGerarDoContorno={gerarTelhadoDoContorno}
            temParedes={componentesDoNivel.paredes.length > 0}
          />
        ) : editor.tool === 'estrutural' ? (
          /* As medidas da PRÓXIMA peça. Aparecem no mesmo lugar em que as da
             abertura aparecem, e pela mesma razão: são estado da barra, não da
             peça já lançada — essa se edita no painel lateral.

             O que cada campo mostra depende da FORMA, não do tipo: profundidade
             só existe no PONTO (a segunda dimensão em planta), e nem lá quando a
             seção é redonda. Um campo sempre visível que não faz nada em duas
             das três formas ensina o usuário a ignorá-lo — a mesma lição do
             sub-tipo da porta de correr. */
          <CamposDaEstrutura
            kind={tipoEstrutural}
            medidas={medidasEstruturais}
            onMedidas={setMedidasEstruturais}
            rotulo={rotuloEstrutural}
            onRotulo={setRotuloEstrutural}
          />
        ) : editor.tool === 'abertura' ? (
          <>
            {/* O select "Tipo" saiu daqui em 31/08/2026: escolher entre porta,
                janela e vão passou a ser o menu Componentes, e manter os dois
                deixaria dois lugares desacordáveis para a mesma escolha. O que
                fica na barra é só o que o menu NÃO diz — a folha da correr e as
                medidas do vão. */}

            {/* O SUB-TIPO só aparece com correr escolhida. Um controle sempre
                visível que não faz nada em três dos quatro tipos ensina o
                usuário a ignorá-lo. */}
            {tipoAbertura === 'sliding' && (
              <label
                className="flex items-center gap-2 text-xs text-slate-600"
                title="Embutida: a folha entra num vão dentro da parede — exige parede preparada. Por fora: a folha corre sobre a face, e essa faixa de parede precisa ficar livre de armário, quadro e interruptor."
              >
                Folha
                <select
                  value={correrEmbutida ? 'embutida' : 'fora'}
                  onChange={(e) => setCorrerEmbutida(e.target.value === 'embutida')}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="fora">Corre por fora</option>
                  <option value="embutida">Embutida na parede</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Largura
              <select
                value={larguraAbertura}
                onChange={(e) => setLarguraAbertura(Number(e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {[600, 700, 800, 900, 1000, 1200, 1500, 2000].map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} mm
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
        <>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Espessura
          <select
            value={espessura}
            onChange={(e) => setEspessura(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {[100, 150, 200, 250].map((mm) => (
              <option key={mm} value={mm}>
                {mm} mm
              </option>
            ))}
          </select>
        </label>

        {/* ONDE O CLIQUE CAI. O kernel guarda a parede pelo EIXO, mas quem copia
            uma planta de fundo aponta o CANTO — e com o clique no eixo a parede
            nascia meia espessura para fora do que estava desenhado. O canto de
            junção é mitrado pelo kernel (`eixoDaParede`), senão o contorno não
            fecharia e o ambiente não apareceria. */}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Clique
          <select
            value={alinhamento}
            onChange={(e) => setAlinhamento(e.target.value as AlinhamentoParede)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="Onde o ponto clicado cai na parede. Pela face, o clique é o canto da parede e ela cresce toda para o lado escolhido — contorne no sentido do relógio com 'à direita' para a parede nascer para dentro. A BARRA DE ESPAÇO inverte o lado sem sair do desenho."
          >
            <option value="DIREITA">Na face · parede à direita</option>
            <option value="ESQUERDA">Na face · parede à esquerda</option>
            <option value="EIXO">No eixo (meio da parede)</option>
          </select>
        </label>

        {editor.tool === 'poligono' && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Lados
            <select
              value={ladosPoligono}
              onChange={(e) => setLadosPoligono(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              title="Clique no centro e arraste até o MEIO DE UM LADO: o lado nasce perpendicular ao arraste, então com o orto ligado o polígono sai alinhado à planta. Os cantos saem mitrados e o contorno já fecha, derivando o ambiente."
            >
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        </>
        )}

        <ControlesDeFundo
          linhas={fundo.linhas}
          linha={fundo.linha}
          underlay={fundo.underlay}
          opacidade={fundo.opacidade}
          calibrando={editor.tool === 'calibrar'}
          ocupado={fundo.ocupado}
          totalPaginas={fundo.totalPaginas}
          onSelecionar={fundo.selecionar}
          onImportar={(arquivo, pagina) => void fundo.importar(arquivo, pagina)}
          // A escala declarada NÃO passa por `reposicionar` das medições como a
          // recalibração passa: quem declara a escala está corrigindo o número,
          // e as formas devem acompanhar. `declararEscala` pivota no mesmo
          // ponto de referência da aferição anterior, então o traçado fica.
          onDeclararEscala={(n) => void fundo.declararEscala(n)}
          onCalibrar={() => {
            setAfericao(null);
            editor.setTool(editor.tool === 'calibrar' ? 'selecionar' : 'calibrar');
          }}
          onOpacidade={fundo.setOpacidade}
          onRemover={() => void fundo.remover()}
        />

        <span className="h-5 w-px bg-slate-200" aria-hidden />

        {/* ORTO. Encaixar na grade NÃO impede parede torta: impede só que a
            ponta pare fora da grade. Um desvio de um passo é invisível na escala
            da tela e só aparece no CAD — ou na obra. Foi assim que uma parede
            saiu 200 mm fora do esquadro sem ninguém notar. */}
        <button
          type="button"
          onClick={() => setOrtogonal((v) => !v)}
          aria-pressed={ortogonal}
          title={
            ortogonal
              ? 'Orto LIGADO: as paredes travam em 90°. Shift libera; F8 alterna.'
              : 'Orto desligado: a parede segue o cursor. Shift trava; F8 alterna.'
          }
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            ortogonal
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          Orto
        </button>

        {/* MANTER JUNÇÕES × SOLTAR. Só aparece na ferramenta de seleção: fora
            dela não há conjunto para mover, e um botão que não faz nada na
            ferramenta em uso é ruído numa barra que já quebra linha. */}
        {editor.tool === 'selecionar' ? (
          <button
            type="button"
            onClick={() => setModoJuncao((v) => (v === 'MANTER' ? 'SOLTAR' : 'MANTER'))}
            aria-pressed={modoJuncao === 'MANTER'}
            title={
              modoJuncao === 'MANTER'
                ? 'MANTER JUNÇÕES: o que estava preso ao bloco acompanha, mudando de comprimento sem sair do esquadro. Onde a junção não puder ser mantida, um anel âmbar avisa durante o arraste.'
                : 'SOLTAR: o bloco anda inteiro, mantendo as medidas. Onde encostava em parede não selecionada, desencosta — e o ambiente derivado dali some.'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
              modoJuncao === 'MANTER'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {modoJuncao === 'MANTER' ? (
              <MoveDiagonal className="h-3.5 w-3.5" />
            ) : (
              <Move className="h-3.5 w-3.5" />
            )}
            {modoJuncao === 'MANTER' ? 'Manter junções' : 'Soltar'}
          </button>
        ) : null}

        <label className="flex items-center gap-2 text-xs text-slate-600">
          Grade
          <select
            value={passoGrade === null ? 'auto' : String(passoGrade)}
            onChange={(e) =>
              setPassoGrade(e.target.value === 'auto' ? null : Number(e.target.value))
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="Passo de encaixe. Em automático, acompanha o zoom."
          >
            <option value="auto">Automática ({rotuloPasso(passoEmVigor)})</option>
            {[10, 50, 100, 250, 500, 1000].map((mm) => (
              <option key={mm} value={mm}>
                {rotuloPasso(mm)}
              </option>
            ))}
          </select>
        </label>

        {/* PRECISÃO DO MOVER — separada da Grade de propósito.
            A Grade em automático amarra o passo ao ZOOM: afastar a vista fazia o
            arraste andar de 500 mm ou 1 m por vez, e nada na tela dizia por quê.
            Quem estava movendo lia isso como imprecisão da ferramenta.
            Fixando aqui, o passo do mover para de depender do zoom — e traçar
            parede nova continua no passo da Grade, que é o que permite desenhar
            grosso e ajustar fino. */}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Precisão
          <select
            value={passoMover === 'grade' ? 'grade' : String(passoMover)}
            onChange={(e) =>
              setPassoMover(e.target.value === 'grade' ? 'grade' : Number(e.target.value))
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="De quanto em quanto o que já está desenhado se desloca — arraste, alça de ponta e setas do teclado. Fixando um valor, deixa de depender do zoom."
          >
            <option value="grade">Igual à grade ({rotuloPasso(passoEmVigor)})</option>
            {/* 1 mm é o piso: o kernel só aceita coordenada inteira em mm. */}
            {[1, 5, 10, 25, 50, 100, 500, 1000].map((mm) => (
              <option key={mm} value={mm}>
                {rotuloPasso(mm)}
              </option>
            ))}
          </select>
        </label>

        {/* O QUE APARECE NO DESENHO.
            Eram quatro botões soltos aqui (Medidas, Cotas, Interna, Nomes). Com
            os quatro novos, a barra iria a três linhas e Desfazer/Refazer — os
            mais usados — desceriam para o fim dela. A explicação de cada um não
            se perdeu: virou o `title` do item, porque a diferença entre Medidas,
            Cotas e Interna é exatamente o que se confunde. */}
        <MenuExibir
          grupos={[
            [
              {
                chave: 'medidas',
                rotulo: 'Medidas das paredes',
                icone: Ruler,
                ligado: mostrarMedidas,
                alternar: () => setMostrarMedidas((v) => !v),
                ajuda:
                  'O comprimento de cada PAREDE, escrito junto dela. Mede a parede entre as faces das pontas DELA e ignora as divisórias que a cortam no meio — numa fachada que atravessa três cômodos, dá os três somados.',
              },
              {
                chave: 'camadas',
                rotulo: 'Camadas das paredes',
                icone: Layers,
                ligado: mostrarCamadas,
                alternar: () => setMostrarCamadas((v) => !v),
                ajuda:
                  'Pinta as faixas de material dentro da espessura — bloco, reboco, isolamento. Só aparece com zoom suficiente: em vista geral as faixas somariam menos de 12 px e virariam um borrão cinza. Parede sem composição continua sólida.',
              },
              {
                chave: 'cotas',
                rotulo: 'Cadeias de cota',
                icone: MoveHorizontal,
                ligado: mostrarCotas,
                alternar: () => setMostrarCotas((v) => !v),
                ajuda:
                  'Cota os LADOS da edificação, na borda do desenho: total pela face externa, parcial nos eixos das divisórias. Parede do miolo que não encosta no contorno não aparece aqui.',
              },
              {
                chave: 'interna',
                rotulo: 'Cota interna dos ambientes',
                icone: MoveHorizontal,
                ligado: mostrarCotaInterna,
                alternar: () => setMostrarCotaInterna((v) => !v),
                ajuda:
                  'Cota cada AMBIENTE por dentro, de face a face, desenhada no próprio cômodo. É a que responde "quanto tem esta cozinha?".',
              },
              {
                chave: 'nomes',
                rotulo: 'Nome, área e perímetro',
                icone: Tag,
                ligado: mostrarRotulos,
                alternar: () => setMostrarRotulos((v) => !v),
                ajuda: 'Escreve nome, área e perímetro dentro de cada ambiente.',
              },
            ],
            [
              {
                chave: 'grade',
                rotulo: 'Grade',
                icone: Grid2x2,
                ligado: mostrarGrade,
                alternar: () => setMostrarGrade((v) => !v),
                ajuda:
                  'Desenha o quadriculado. ⚠️ Esconder a grade NÃO desliga o encaixe: o ponto continua caindo no passo escolhido em "Grade".',
              },
              {
                chave: 'preenchimento',
                rotulo: 'Preenchimento dos ambientes',
                icone: PaintBucket,
                ligado: mostrarPreenchimento,
                alternar: () => setMostrarPreenchimento((v) => !v),
                ajuda:
                  'A cor por dentro de cada ambiente derivado. Desligado, sobra só a geometria — útil para conferir o traçado contra a planta de fundo.',
              },
              {
                chave: 'preenchimento-terreno',
                rotulo: 'Preenchimento do terreno',
                icone: LandPlot,
                ligado: mostrarPreenchimentoTerreno,
                alternar: () => setMostrarPreenchimentoTerreno((v) => !v),
                // Desabilitado por AUSÊNCIA DE DIVISA, não por "lote não
                // fechado": a prévia do traçado também é preenchida, então o
                // toggle precisa estar vivo enquanto o lote está nascendo.
                desabilitado: !limitesDoNivel.some((b) => b.kind === 'TERRENO'),
                ajuda: limitesDoNivel.some((b) => b.kind === 'TERRENO')
                  ? 'O verde fraco por dentro do lote. Desligado, restam as divisas — é como se confere o traçado contra o levantamento topográfico ou a planta de fundo, sem perder a cor dos ambientes.'
                  : 'Não há divisa de terreno desenhada — use a ferramenta Terreno para criar o lote.',
              },
              {
                chave: 'envelope',
                rotulo: 'Envelope construtivo',
                icone: Hexagon,
                ligado: mostrarEnvelope,
                alternar: () => setMostrarEnvelope((v) => !v),
                ajuda:
                  'A hachura diagonal da área construível — o terreno já descontado os recuos. É uma restrição calculada, separada do preenchimento do lote.',
              },
              {
                chave: 'cores',
                rotulo: 'Uma cor por ambiente',
                icone: Palette,
                ligado: coresPorAmbiente,
                alternar: () => setCoresPorAmbiente((v) => !v),
                desabilitado: !mostrarPreenchimento,
                ajuda: mostrarPreenchimento
                  ? 'Cada ambiente ganha uma cor da paleta, em vez do azul único — separa cômodos vizinhos de relance. A cor não significa tipo de cômodo: ela distingue.'
                  : 'Ligue "Preenchimento dos ambientes" primeiro — sem preenchimento não há o que colorir.',
              },
            ],
            [
              {
                chave: 'contraste',
                rotulo: 'Cota em alto contraste',
                icone: Contrast,
                ligado: cotaAltoContraste,
                alternar: () => setCotaAltoContraste((v) => !v),
                ajuda:
                  'Cota em preto sobre fundo branco opaco. Para planta de fundo escaneada carregada, em que até o cinza escuro se mistura ao desenho por baixo.',
              },
            ],
          ]}
        />

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        <BotaoBarra
          icone={Undo2}
          rotulo="Desfazer (Ctrl+Z)"
          onClick={editor.undo}
          disabled={!editor.canUndo}
        />
        <BotaoBarra
          icone={Redo2}
          rotulo="Refazer (Ctrl+Shift+Z)"
          onClick={editor.redo}
          disabled={!editor.canRedo}
        />
        {/* COPIAR / COLAR. Ficam ao lado de desfazer/refazer porque são da mesma
            família — editam o desenho sem desenhar nada. O atalho está no
            rótulo porque o gesto de verdade é o teclado: colar acontece SOB O
            CURSOR, e um clique no botão da barra tira o cursor da planta. */}
        <BotaoBarra
          icone={Copy}
          rotulo="Copiar seleção (Ctrl+C)"
          onClick={copiar}
          disabled={editor.selectedIds.length === 0}
        />
        <BotaoBarra
          icone={ClipboardPaste}
          rotulo={
            areaDeTransferencia
              ? 'Colar no cursor (Ctrl+V) — mova o mouse sobre a planta e use o atalho'
              : 'Colar (Ctrl+V) — nada copiado'
          }
          onClick={() => {
            // Sem cursor sobre a planta não há destino. O botão existe para
            // ANUNCIAR o recurso e mostrar que há algo copiado; quem clica
            // recebe a instrução em vez de uma cópia num lugar arbitrário.
            setAvisoColar('Passe o cursor sobre a planta e pressione Ctrl+V — a cópia cai ali.');
          }}
          disabled={!areaDeTransferencia}
        />
        {/* Excluir é ação de linha no vocabulário do ActionIconButton, então usa
            o componente padrão. Desfazer/refazer/voltar não estão na taxonomia
            dele (`ActionKind` não tem esses casos) — forçar um `kind` só para
            reaproveitar o estilo mentiria na semântica do componente. */}
        <ActionIconButton
          kind="delete"
          title="Excluir parede selecionada (Delete)"
          onClick={removerSelecionada}
          disabled={!editor.selectedId}
        />

        <div className="ml-auto text-xs text-slate-500">
          {editor.model.walls.length} parede(s) · {ambientes.length} ambiente(s)
        </div>
          </>
        )}
      </div>

      {editor.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{editor.lastError}</span>
          {editor.hasConflict ? (
            <button
              type="button"
              onClick={editor.reload}
              className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Recarregar do servidor
            </button>
          ) : (
            <button
              type="button"
              onClick={editor.clearError}
              className="text-xs font-medium underline"
            >
              dispensar
            </button>
          )}
        </div>
      )}

      {/* A conexão em T aconteceu SOZINHA, então ela tem de se anunciar.
          "Sem perguntar" foi decisão do usuário; "sem contar" seria outra coisa —
          o editor teria movido parede dele e nada na tela diria isso. AZUL, e não
          âmbar: não é problema pendente, é trabalho já feito. */}
      {avisoConexaoT && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoConexaoT}</span>
          <button
            type="button"
            onClick={() => setAvisoConexaoT(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Recusa da junção. ÂMBAR e não vermelho: nada quebrou — o par apontado
          simplesmente não forma canto, e o texto diz para onde ir. Faixa própria,
          separada de `lastError`, porque `clearError` é do kernel e limpar um
          apagaria o outro. */}
      {avisoJuncao && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoJuncao}</span>
          <button
            type="button"
            onClick={() => setAvisoJuncao(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Recado da colagem. Faixa própria pelo mesmo motivo da de junção: quem
          limpa uma não pode apagar a outra. Âmbar porque nada quebrou — ou não
          havia onde colar a abertura, ou o original já não existe. */}
      {avisoColar && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoColar}</span>
          <button
            type="button"
            onClick={() => setAvisoColar(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* A RECUSA DO CORTE, na mesma faixa do aviso de colar.
          Um corte que não aconteceu precisa dizer isso: sem o recado, o usuário
          escolhe "Cortar a parede", nada muda na tela, e ele conclui que o
          botão não funciona. */}
      {erroDoCorte && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{erroDoCorte}</span>
          <button
            type="button"
            onClick={() => setErroDoCorte(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Corpo */}
      {fundo.linha && fundo.underlay && (
        <ResumoDaAfericao linha={fundo.linha} underlay={fundo.underlay} />
      )}
      {fundo.erro && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {fundo.erro}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* Aferição: os dois pontos já foram clicados, falta a distância real.
              O diálogo aparece SOBRE o desenho, junto de onde o usuário acabou
              de clicar — mandá-lo procurar um campo na lateral quebraria o
              gesto no meio. */}
          {afericao && (
            <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2 rounded-lg border border-amber-300 bg-white p-3 shadow-lg">
              <p className="text-xs font-semibold text-slate-800">
                Qual a distância real entre os dois pontos?
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Use uma cota escrita na planta. Quanto mais longa, melhor a aferição.
              </p>

              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  value={distanciaDigitada}
                  onChange={(e) => setDistanciaDigitada(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') aplicarAfericao();
                    if (e.key === 'Escape') setAfericao(null);
                  }}
                  aria-label="Distância real em metros"
                  placeholder="0,00"
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-600">metros</span>

                <button
                  type="button"
                  onClick={aplicarAfericao}
                  disabled={!(Number(distanciaDigitada) > 0)}
                  className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Aferir
                </button>
                <button
                  type="button"
                  onClick={() => setAfericao(null)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>

              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={alinharNaAfericao}
                  onChange={(e) => setAlinharNaAfericao(e.target.checked)}
                />
                Estes dois pontos são horizontais (endireita a planta torta)
              </label>
            </div>
          )}

          {editor.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando planta…
            </div>
          ) : vista === '3d' ? (
            <Blueprint3DTab
              model={editor.model}
              levelIds={levelIdsDaVista}
              mostrarLaje={mostrarLaje3d}
              mostrarArestas={mostrarArestas3d}
              // A guarda vive aqui, e não só no menu: o estado é persistido, e
              // ligar o terreno num estudo que tem lote e depois abrir outro que
              // não tem deixaria a combinação gravada no localStorage.
              mostrarTerreno={mostrarTerreno3d && temTerreno}
              ocultos={ocultosNo3d}
            />
          ) : vistaEhElevacao ? (
            <ElevationCanvas
              model={editor.model}
              direcao={DIRECAO_DA_VISTA[vista]!}
              levelIds={levelIdsDaVista}
              mostrarCotasAltura={mostrarCotasAltura}
              mostrarRotulosEsquadria={mostrarRotulosEsquadria}
              mostrarParedesInternas={mostrarParedesInternas}
              mostrarEstrutura={mostrarEstruturaVista}
              enquadrarToken={enquadrarVistaToken}
            />
          ) : (
            <BlueprintCanvas
              model={editor.model}
              tool={editor.tool}
              levelId={levelId}
              selectedIds={editor.selectedIds}
              onSelecionar={selecionar}
              onMoverSelecao={moverSelecao}
              onMoverMedicoes={moverMedicoes}
              manterJuncoes={modoJuncao === 'MANTER'}
              destaqueDePonta={
                paredeSel && pontaDestacada ? { wallId: paredeSel.id, end: pontaDestacada } : null
              }
              onAddWall={adicionarParede}
              alinhamento={alinhamento}
              ladosPoligono={ladosPoligono}
              onAddPoligono={adicionarPoligono}
              onInverterLado={() => setAlinhamento(inverterLado)}
              onAddOpening={adicionarAbertura}
              larguraAberturaMm={larguraAbertura}
              onDelete={removerSelecionada}
              onCopiar={copiar}
              onColar={colar}
              espessuraMm={espessura}
              passoGradeMm={passoGrade}
              onPassoEfetivo={setPassoEmVigor}
              vaos={vaosCandidatos.vaos}
              // O cursor na lista manda; na falta dele, quem acende é a
              // SELEÇÃO. Sem a segunda metade, clicar "Vão 3" selecionava as
              // duas paredes e o vão entre elas — que é justamente o assunto da
              // linha — continuava apagado no desenho.
              vaoEmDestaque={vaoEmDestaque ?? primeiroVaoDaSelecao}
              pontasSoltas={vaosCandidatos.soltas}
              pontaEmJuncao={pontaEmJuncao}
              onEscolherPontaJuncao={(ponta) => {
                setPontaEmJuncao(ponta);
                // Escolher de novo limpa a recusa anterior: o aviso é sobre o par
                // que falhou, e ele deixou de existir.
                setAvisoJuncao(null);
              }}
              onJuntarPontas={juntarPontas}
              ortogonal={ortogonal}
              mostrarMedidasParedes={mostrarMedidas}
              mostrarCamadasParedes={mostrarCamadas}
              mostrarCotas={mostrarCotas}
              mostrarCotaInterna={mostrarCotaInterna}
              mostrarRotulosAmbiente={mostrarRotulos}
              rotulosDeAmbiente={rotulosDeAmbiente}
              mostrarGrade={mostrarGrade}
              mostrarPreenchimentoAmbientes={mostrarPreenchimento}
              mostrarPreenchimentoTerreno={mostrarPreenchimentoTerreno}
              // Só colore se houver preenchimento. A guarda vive aqui, e não só
              // no menu: o estado é persistido, e ligar Cores e depois desligar
              // Preenchimento deixaria a combinação gravada no localStorage.
              coresPorAmbiente={mostrarPreenchimento && coresPorAmbiente}
              cotaAltoContraste={cotaAltoContraste}
              passoMoverMm={passoMover === 'grade' ? null : passoMover}
              onMoveVertex={moverPonta}
              envelope={envelope?.valido ? envelope.anel : []}
              mostrarEnvelope={mostrarEnvelope}
              onAddLimite={adicionarLimite}
              onMoveBoundaryVertex={moverPontaLimite}
              limiteEmDestaque={limiteEmDestaque}
              onMoveOpening={moverAbertura}
              estruturalKind={tipoEstrutural}
              onAddEstrutural={adicionarEstrutural}
              onMoveStructuralVertex={moverPontaEstrutural}
              onAddAgua={adicionarAgua}
              onMoveAguaVertex={moverPontaAgua}
              fundo={
                fundo.imagem && fundo.underlay
                  ? {
                      imagem: fundo.imagem,
                      underlay: fundo.underlay,
                      opacidade: fundo.opacidade,
                    }
                  : null
              }
              // O id da prancha ATIVA, e não um gatilho de "enquadre agora":
              // importar e trocar de prancha mudam o id (e devem enquadrar),
              // aferir a escala mantém o id (e não deve — recalibrar pivota
              // em `p1` justamente para o traçado não se mexer).
              enquadrarPrancha={fundo.ativaId}
              onVistaMudou={setLimitesDaVista}
              // A arma morre junto com a SEÇÃO (era: junto com a aba). Sem este
              // recorte, armar e fechar "Do PDF" deixaria o próximo arraste em
              // QUALQUER ferramenta virar uma marcação de região invisível — o
              // botão que a armou não está mais na tela para explicar o que
              // aconteceu.
              regiaoArmada={secoes.vetor && regiaoArmada}
              // A região só aparece com a seção que a usa aberta. Desenhá-la
              // sempre deixaria um retângulo violeta sobre a planta enquanto se
              // traça parede, sem nada na tela explicando de onde ele veio.
              regiao={secoes.vetor ? regiao : null}
              onRegiaoDefinida={(r) => {
                // `null` = desistiu do gesto. Só desarma — apagar a região
                // confirmada por causa de um Escape seria perder trabalho.
                setRegiaoArmada(false);
                if (r) setRegiao(r);
              }}
              onCalibrar={(p1, p2) => setAfericao({ p1, p2 })}
              medicoes={medicoesVisiveis}
              medicaoSelecionada={medicoes.selecionada}
              onMedicaoPronta={(tipo, pontos) => void medicoes.criar(tipo, pontos)}
            />
          )}
        </div>

        {/* Painel lateral — é aqui que a planta vira navegável por teclado. */}
        {/* 307 px = 384 × 0,8. Encolhido em 20% a pedido (27/08/2026): a área de
            desenho é o produto desta tela, e o painel é referência. Desde
            29/08/2026 esse número é só o PADRÃO: a largura é arrastável pelo
            puxador da borda esquerda (`LarguraDoPainel.tsx`), e o duplo clique
            nele volta para cá. */}
        {/* ROLAGEM ÚNICA, e é consequência do accordion multi-aberto: antes
            Pavimentos e a barra de abas eram `shrink-0` e só o conteúdo rolava.
            Com SETE seções irmãs podendo estar abertas ao mesmo tempo, a soma
            passa da altura da tela, e um `overflow-hidden` aqui recortaria a
            última — o mesmo defeito que a antiga barra de abas já teve duas
            vezes (ver `AbasDoPainel`, ainda usado pelo spike de medições). */}
        {/* A caixa é quem tem a largura; o puxador se ancora nela por `absolute`
            e o `<aside>` rola por dentro. Pôr o puxador DENTRO do `<aside>` o
            faria rolar junto com o conteúdo e sumir da vista. */}
        <div ref={caixaDoPainel} className="relative shrink-0" style={{ width: larguraDoPainel }}>
          <PuxadorDeLargura />
          <aside
            className="h-full overflow-y-auto border-l border-slate-200 bg-white"
            aria-label="Ambientes derivados"
          >
          <SecaoAccordion
            titulo="Pavimentos"
            contagem={editor.model.levels.length}
            aberta={secoes.pavimentos}
            onAlternar={() => alternarSecao('pavimentos')}
            acoes={
              !adicionandoPavimento && (
                <button
                  type="button"
                  onClick={() => {
                    // Abre a seção junto: pedir um pavimento novo com a seção
                    // fechada esconderia o formulário que acabou de nascer.
                    setSecoes((s) => ({ ...s, pavimentos: true }));
                    setAdicionandoPavimento(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              )
            }
          >
            <PainelPavimentos
              model={editor.model}
              modoVista={emVista}
              nivelAtivoId={levelId}
              onEscolherAtivo={setNivelAtivoId}
              niveisVisiveis={niveisVisiveis}
              onNiveisVisiveis={setNiveisVisiveis}
              run={editor.run}
              adicionando={adicionandoPavimento}
              onAdicionando={setAdicionandoPavimento}
            />
          </SecaoAccordion>

          {secaoVisivel('componentes') && (
            <SecaoAccordion
              titulo="Componentes"
              contagem={
                em3d
                  ? componentesDo3d.reduce((n, b) => n + b.linhas.length, 0)
                  : componentesDoNivel.paredes.length +
                    componentesDoNivel.aberturas.length +
                    componentesDoNivel.estruturas.length
              }
              aberta={secoes.componentes}
              onAlternar={() => alternarSecao('componentes')}
              acoes={
                // A saída de emergência de quem escondeu trinta peças e não quer
                // reacender uma a uma. Só aparece quando há o que devolver.
                em3d && ocultosNo3d.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOcultosNo3d(new Set())}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Eye className="h-3 w-3" /> Mostrar tudo
                  </button>
                ) : undefined
              }
            >
              <PainelComponentes
                paredes={componentesDoNivel.paredes}
                aberturas={componentesDoNivel.aberturas}
                estruturas={componentesDoNivel.estruturas}
                aguas={componentesDoNivel.aguas}
                selecionados={editor.selectedIds}
                onSelecionar={selecionar}
                onExcluir={excluirComponente}
                // No 3D a lista troca de fonte (os pavimentos empilhados) e ganha
                // o olho; na planta baixa nada disso é passado e o painel se
                // comporta exatamente como antes.
                blocos={em3d ? componentesDo3d : undefined}
                ocultos={em3d ? ocultosNo3d : undefined}
                onAlternarOculto={em3d ? alternarOcultoNo3d : undefined}
                somenteLeitura={em3d}
                propriedades={
                  em3d ? undefined : (
                  <>
                    {editor.selectedIds.length > 1 ? (
                      <PainelSelecaoMultipla
                        paredes={paredesSelecionadas}
                        limites={limitesSelecionados.length}
                        aberturas={aberturasSelecionadas.length}
                        medicoes={medicoesSelecionadas}
                        modo={modoJuncao}
                        onMover={(dx, dy) => {
                          const aguasSelecionadas = (editor.model.roofs ?? []).filter((r) =>
                            editor.selectedIds.includes(r.id),
                          );
                          if (
                            paredesSelecionadas.length > 0 ||
                            limitesSelecionados.length > 0 ||
                            estruturasSelecionadas.length > 0 ||
                            aguasSelecionadas.length > 0
                          ) {
                            moverSelecao(
                              paredesSelecionadas.map((w) => w.id),
                              limitesSelecionados.map((b) => b.id),
                              estruturasSelecionadas.map((s) => s.id),
                              aguasSelecionadas.map((r) => r.id),
                              { x: dx, y: dy } as Point,
                            );
                          }
                          if (medicoesSelecionadas.length > 0) {
                            moverMedicoes(medicoesSelecionadas.map((f) => f.id), {
                              x: dx,
                              y: dy,
                            } as Point);
                          }
                        }}
                        onExcluir={removerSelecionada}
                      />
                    ) : null}

                    <PainelEstruturaSelecionada
                      estrutura={estruturaSel}
                      onMedidas={(campos) =>
                        estruturaSel &&
                        editor.run({
                          type: 'SetStructuralProps',
                          structuralId: estruturaSel.id,
                          ...campos,
                        })
                      }
                      onTipo={(kind) =>
                        estruturaSel &&
                        editor.run({
                          type: 'SetStructuralKind',
                          structuralId: estruturaSel.id,
                          kind,
                        })
                      }
                      onExcluir={removerSelecionada}
                      sobreposicaoM3={sobreposicaoDoSelecionado}
                      onCedeSobreposicao={(cede) =>
                        estruturaSel &&
                        editor.run({ type: 'SetCedeSobreposicao', id: estruturaSel.id, cede })
                      }
                      paredesParaCortar={paredesQueAPecaAtravessa.aCortar.length}
                      paredesJaInterrompidas={paredesQueAPecaAtravessa.jaInterrompidas}
                      onCortarParedes={cortarParedesDaSelecionada}
                      pontasCurtas={pontasCurtasDaSelecionada.length}
                      onEmendarPontas={emendarPontasDaSelecionada}
                    />

                    <PainelAguaSelecionada
                      agua={aguaSel}
                      onProps={(campos) =>
                        aguaSel && editor.run({ type: 'SetAguaProps', aguaId: aguaSel.id, ...campos })
                      }
                      onExcluir={removerSelecionada}
                    />

                    <PainelParedeSelecionada
                      parede={paredeSel}
                      abertura={aberturaSel}
                      pontaQueAnda={esticamento.pontaQueAnda}
                      arrastaCanto={esticamento.arrastaCanto}
                      aLivre={esticamento.aLivre}
                      bLivre={esticamento.bLivre}
                      onEscolherPonta={(end) =>
                        paredeSel && setAncoraManual({ wallId: paredeSel.id, end })
                      }
                      onDestacarPonta={setPontaDestacada}
                      onComprimento={esticarParede}
                      onEspessura={(mm) => paredeSel && mudarEspessura(paredeSel, mm)}
                      // As camadas MEDIDAS saem do quantitativo que já roda ao
                      // vivo aqui. Refazer a conta dentro do painel seria uma
                      // segunda fórmula de área de face — e a primeira a
                      // divergir no dia em que o desconto de vão mudar.
                      camadasSlot={
                        paredeSel ? (
                          <PainelCamadasParede
                            parede={paredeSel}
                            medidas={
                              quant.paredes.find((p) => p.wallId === paredeSel.id)
                                ?.camadas ?? []
                            }
                            aoMudar={(camadas) => mudarCamadas(paredeSel, camadas)}
                          />
                        ) : null
                      }
                      podeUnir={!!vizinhaParaUnir}
                      // O comprimento LIVRE depende da espessura das VIZINHAS, então sai
                      // daqui, que conhece o nível inteiro — o painel só vê a selecionada.
                      livreMm={
                        paredeSel
                          ? faceInternaMm(
                              editor.model.walls.filter((w) => w.levelId === paredeSel.levelId),
                              paredeSel,
                            )
                          : null
                      }
                      onDividir={dividirSelecionada}
                      onUnir={unirSelecionada}
                      onFlipAbertura={flipAbertura}
                      onTamanhoAbertura={redimensionarAbertura}
                      onTipoAbertura={(kind, embutida) => {
                        if (!aberturaSel) return;
                        editor.run({
                          type: 'SetOpeningKind',
                          openingId: aberturaSel.id,
                          kind,
                          embutida,
                        });
                      }}
                      sobreposicaoM3={sobreposicaoDoSelecionado}
                      onCedeSobreposicao={(cede) =>
                        paredeSel &&
                        editor.run({ type: 'SetCedeSobreposicao', id: paredeSel.id, cede })
                      }
                    />
                  </>
                  )
                }
              />
            </SecaoAccordion>
          )}

          {secaoVisivel('ambientes') && (
          <SecaoAccordion
            titulo="Ambientes"
            contagem={ambientes.length}
            aberta={secoes.ambientes}
            onAlternar={() => alternarSecao('ambientes')}
          >
          <div>
          <div className="border-b border-slate-200 px-4 py-2">
            {/* Sem <h2> "Ambientes": o cabeçalho da seção já o diz. Sobra o
                subtítulo, que carrega o que o título não conta. */}
            <p className="text-xs text-slate-500">
              Derivados da topologia — não são desenhados à mão.
            </p>
          </div>

          {/* A seleção — uma peça ou o conjunto — passou para a seção
              "Componentes" (31/08/2026). Aqui ficou o que a topologia DERIVA do
              desenho: o terreno, os vãos que impedem o anel de fechar e a lista
              de ambientes. */}
          <PainelTerreno
            terreno={terreno}
            divisaSelecionada={limiteSel}
            onComprimento={esticarDivisa}
            onPapel={(papel) =>
              limiteSel && editor.run({ type: 'SetBoundaryPapel', boundaryId: limiteSel.id, papel })
            }
            recuos={recuos}
            onRecuo={zona.ajustarRecuo}
            envelope={envelope}
            aproveitamento={aproveitamento}
            taxaOcupacaoMax={zona.taxaOcupacaoMax}
            coeficienteMax={zona.coeficienteMax}
            onTaxaOcupacaoMax={zona.ajustarTaxaOcupacaoMax}
            onCoeficienteMax={zona.ajustarCoeficienteMax}
            empreendimentos={empreendimentos.map((e) => ({
              id: e.id,
              nome: e.name,
              areaAtualM2: e.terreno_area ?? null,
            }))}
            empreendimentoId={zona.empreendimentoId}
            onEmpreendimento={zona.setEmpreendimentoId}
            onGravarArea={(id) => void gravarAreaNoEmpreendimento(id)}
            gravando={gravandoArea}
            erro={erroArea}
            onAbrirQuadro={() => setQuadroAberto(true)}
            ladosSemPapel={ladosSemPapel}
            ladosDivergentes={ladosDivergentes}
            gabaritoAlturaMaxM={zona.gabaritoAlturaMaxM}
            gabaritoPavimentos={zona.gabaritoPavimentos}
            taxaPermeabilidadeMin={zona.taxaPermeabilidadeMin}
            pavimentosDesenhados={editor.model.levels.length}
            alturaDesenhadaM={alturaDesenhadaM}
            zonaSlot={
              <PainelZonaUrbanistica
                origemDaZona={zona.origemDaZona}
                onOrigemDaZona={zona.setOrigemDaZona}
                empreendimentos={empreendimentos.map((e) => ({ id: e.id, nome: e.name }))}
                empreendimentoId={zona.empreendimentoId}
                onEmpreendimento={zona.setEmpreendimentoId}
                cidade={zona.cidade}
                onCidade={zona.setCidade}
                mapas={zona.mapas}
                mapaId={zona.mapaId}
                onMapa={zona.setMapaId}
                carregandoMapas={zona.carregandoMapas}
                zonas={zona.zonas}
                carregandoZonas={zona.carregandoZonas}
                zonaAplicadaId={zona.zonaAplicadaId}
                zonaRotuloSalvo={zona.zonaRotuloSalvo}
                ajustadoAMao={zona.ajustadoAMao}
                derivou={zona.derivou}
                onAplicar={zona.aplicarZona}
                onDesligar={zona.desligar}
                salvando={zona.salvando}
              />
            }
          />

          {vaosCandidatos.soltas.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                <strong>{vaosCandidatos.soltas.length} ponta(s) solta(s).</strong> Enquanto
                houver ponta sem encontro, o contorno não fecha e o ambiente não aparece.
              </p>

              {/* CONECTAR SOB DEMANDA.
                  O passe automático roda uma vez, no carregamento — de propósito,
                  porque rodar a cada mudança puxaria a ponta para o eixo no meio
                  do gesto de quem está arrastando. Só que EDITAR CRIA ENCOSTO
                  NOVO, e sem este botão não havia como pegá-lo: a planta ia
                  acumulando junção falsa até o próximo carregamento.

                  E a ferramenta Juntar não substitui isto. Numa planta real as
                  duas pontas de um canto ficavam a 10 mm uma da outra; o raio de
                  clique é 9 px, então em zoom de trabalho as duas bolinhas SÃO o
                  mesmo pixel. O usuário teve de ampliar ao extremo para vê-las
                  separadas, e ainda assim errar o alvo cancelava a escolha. Um
                  botão não erra a mira. */}
              <button
                type="button"
                onClick={conectarAgora}
                title="Encosta as pontas que já se sobrepõem no desenho, sem precisar mirar"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                Conectar automaticamente
              </button>

              {/* O BECO SEM SAÍDA, nomeado.
                  Sem isto o usuário vê a bolinha âmbar, clica no botão acima,
                  nada acontece, e o painel não diz por quê — porque eixos
                  paralelos não se cruzam e não há canto para calcular. */}
              {juntasParalelas.length > 0 && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-800">
                  <strong>
                    {juntasParalelas.length}{' '}
                    {juntasParalelas.length === 1 ? 'ponta encostava' : 'pontas encostavam'} em algo{' '}
                    <span className="whitespace-nowrap">PARALELO</span>
                  </strong>{' '}
                  — o botão acima e a ferramenta Juntar não refazem esse encontro: dois eixos
                  paralelos não se cruzam, então não há canto para calcular.
                  {juntasParalelas.some((j) => j.temDivisa) ? (
                    <>
                      {' '}
                      Há uma <strong>divisa</strong> envolvida, e ela não acompanha a parede sozinha
                      de propósito: entortá-la mudaria a medida e o rumo de uma linha da escritura.
                      Para levá-la junto, <strong>selecione a divisa com a parede</strong> (Ctrl+clique,
                      ou laço em volta das duas) e mova as duas — aí as duas andam rígidas e o
                      encontro se mantém.
                    </>
                  ) : (
                    <>
                      {' '}
                      Para as duas andarem juntas, <strong>selecione as duas</strong> (Ctrl+clique, ou
                      laço em volta) e mova o conjunto. Se a intenção era outra, arraste a ponta até
                      encostar ou desenhe o trecho que falta.
                    </>
                  )}
                </p>
              )}

              {vaosCandidatos.vaos.length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">
                  Nenhum par de pontas <strong>na mesma linha</strong>, na faixa de
                  abertura (40 cm a 3 m). Ponta que não continua o eixo de outra parede é
                  canto aberto, não vão: arraste a ponta até encostar, ou desenhe o
                  trecho que falta. Fechar na diagonal criaria uma parede enviesada.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-amber-700">
                    {vaosCandidatos.vaos.length} vão(s) encontrado(s). O sistema não decide
                    qual fechar — porta, guarda-corpo e limite externo têm a mesma
                    geometria. Você decide:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {vaosCandidatos.vaos.map((v, i) => (
                      <li
                        key={`${v.a.x},${v.a.y}-${v.b.x},${v.b.y}`}
                        ref={(el) => {
                          if (el) linhasDeVao.current.set(i, el);
                          else linhasDeVao.current.delete(i);
                        }}
                        // Acende o vão no desenho enquanto o cursor está na
                        // linha. `onFocus`/`onBlur` junto porque a lista é
                        // percorrível por Tab — quem navega por teclado precisa
                        // do mesmo retorno que quem usa mouse.
                        onMouseEnter={() => setVaoEmDestaque(i)}
                        onMouseLeave={() => setVaoEmDestaque((atual) => (atual === i ? null : atual))}
                        onFocus={() => setVaoEmDestaque(i)}
                        onBlur={() => setVaoEmDestaque((atual) => (atual === i ? null : atual))}
                        // Três estados, e a ordem importa: o SELECIONADO é o mais
                        // forte porque persiste depois que o cursor sai da linha
                        // — é ele que responde "qual vão é este que acabei de
                        // clicar na planta".
                        className={`rounded-md border p-2 transition-colors ${
                          vaosDaSelecao.has(i)
                            ? 'border-amber-600 bg-amber-100 ring-1 ring-amber-500'
                            : vaoEmDestaque === i
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-amber-300 bg-white'
                        }`}
                      >
                        {/* Botão, e não parágrafo: clicar na linha SELECIONA no
                            desenho as paredes das duas pontas. Fica no título e
                            não no `<li>` inteiro porque a linha já tem cinco
                            botões de decisão — um clique que fizesse as duas
                            coisas escolheria por engano. */}
                        <button
                          type="button"
                          onClick={() => selecionarParedesDoVao(v)}
                          aria-pressed={vaosDaSelecao.has(i)}
                          title="Selecionar na planta as paredes deste vão"
                          className="w-full rounded text-left text-xs font-medium text-slate-700 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          Vão {i + 1} · {(v.mm / 1000).toFixed(2).replace('.', ',')} m
                        </button>
                        {/* CINCO saídas, porque são cinco as coisas que o vão
                            pode ser. Com duas — porta ou parede — a janela não
                            tinha para onde ir, e as duas saídas disponíveis
                            erravam calado: porta ganha peitoril zero e come o
                            rodapé, parede perde a esquadria do orçamento. */}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'door')}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É porta
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'sliding')}
                            title="Porta de correr que desliza sobre a face da parede. Depois dá para trocar para embutida no painel da abertura."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É de correr
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'window')}
                            title="Janela: nasce com peitoril de 90 cm, que é o que a distingue da porta no rodapé."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <RectangleHorizontal className="h-3 w-3" /> É janela
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'passage')}
                            title="Vão livre: passagem sem esquadria. Não entra em área de esquadrias, mas interrompe o rodapé."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Hash className="h-3 w-3" /> É vão livre
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComParede(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Minus className="h-3 w-3" /> É parede
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Vão que é limite externo (varanda, terraço) deve ficar aberto — não
                    feche.
                  </p>
                </>
              )}
            </div>
          )}

          <div aria-live="polite" className="px-4 py-2 text-xs text-slate-600">
            {ambientes.length === 0 ? (
              'Nenhum ambiente fechado ainda.'
            ) : (
              <>
                {ambientes.length} ambiente(s) ·{' '}
                <strong className="font-medium text-slate-700">
                  {areaTotal.toFixed(2).replace('.', ',')} m²
                </strong>{' '}
                <span title="Soma das áreas úteis, medidas pela face interna">úteis</span>
                {areaConstruidaM2 > 0 && (
                  <>
                    {' · '}
                    <strong className="font-medium text-slate-700">
                      {areaConstruidaM2.toFixed(2).replace('.', ',')} m²
                    </strong>{' '}
                    <span title="Contorno externo da edificação, medido pela face externa das paredes">
                      construídos
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <ul className="divide-y divide-slate-100">
            {ambientes.map((a) => (
              <li key={a.id}>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {renomeando === a.id ? (
                      // O nome é ancorado num PONTO dentro do ambiente, não no id
                      // dele: ambiente é derivado e o id muda a cada rederivação.
                      <input
                        autoFocus
                        defaultValue={a.nome}
                        aria-label={`Nome do ambiente ${a.rotulo}`}
                        onBlur={(e) => {
                          editor.run({ type: 'NameSpace', spaceId: a.id, name: e.target.value });
                          setRenomeando(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenomeando(null);
                        }}
                        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-sm"
                      />
                    ) : (
                      <>
                        <span className="truncate text-sm font-medium text-slate-700">
                          {a.rotulo}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRenomeando(a.id)}
                          title="Renomear ambiente"
                          aria-label={`Renomear ${a.rotulo}`}
                          className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                  <dl className="mt-1 flex gap-4 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Área </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.areaM2.toFixed(2)} m²
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Perímetro </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.perimetroM.toFixed(2)} m
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>

          {ambientes.length === 0 && !editor.loading && (
            <p className="px-4 py-3 text-xs text-slate-400">
              Feche um contorno de paredes para que um ambiente apareça. Pontas soltas
              não fecham área.
            </p>
          )}
          </div>
          </SecaoAccordion>
          )}

          {secaoVisivel('vetor') && (
            <SecaoAccordion
              titulo="Do PDF"
              aberta={secoes.vetor}
              onAlternar={() => alternarSecao('vetor')}
            >
              <PainelGerarParedes
                underlay={fundo.underlay}
                temFundo={!!fundo.linha}
                semAfericao={fundo.semAfericao}
                pranchaId={fundo.ativaId}
                limitesDaVista={limitesDaVista}
                regiao={regiao}
                regiaoArmada={regiaoArmada}
                onArmarRegiao={() => setRegiaoArmada((a) => !a)}
                onLimparRegiao={() => setRegiao(null)}
                ocupado={fundo.ocupado}
                onExtrair={(arquivo, pag) => extrairSegmentosPdf(arquivo, pag)}
                onVetorGuardado={fundo.vetorDaPranchaAtiva}
                onRegravar={(segs, larg, alt, m, arcos) =>
                  void fundo.regravarVetor(segs, larg, alt, m, arcos)
                }
                onGerar={aplicarParedesGeradas}
                paredesDoNivel={paredesParaPortas}
                onGerarPortas={aplicarPortasGeradas}
              />
            </SecaoAccordion>
          )}

          {secaoVisivel('medicoes') && (
            <SecaoAccordion
              titulo="Medições"
              contagem={medicoes.formas.length}
              aberta={secoes.medicoes}
              onAlternar={() => alternarSecao('medicoes')}
            >
              <PainelMedicoes
                formas={medicoesVisiveis}
                todas={medicoes.formas}
                selecionada={medicoes.selecionada}
                temFundo={!!fundo.linha}
                ocupado={medicoes.ocupado}
                camadasOcultas={camadasOcultas}
                camadaAtiva={camadaAtiva}
                onAlternarCamada={alternarCamada}
                onCamadaAtiva={setCamadaAtiva}
                onSelecionar={medicoes.setSelecionada}
                onRenomear={(id, nome) => void medicoes.atualizar(id, { nome })}
                onEditarItem={(id, campos) => void medicoes.atualizar(id, campos)}
                onRemover={(id) => void medicoes.remover(id)}
                onEnviarOrcamento={() =>
                  void medicoes.enviarAoOrcamento(
                    study.project_id,
                    study.name,
                    fundo.linha?.file_sha256 ?? null,
                    fundo.underlay?.mmPorPixel ?? null,
                  )
                }
                aviso={medicoes.aviso}
                erro={medicoes.erro}
              />
            </SecaoAccordion>
          )}

          {secaoVisivel('quantitativos') && (
            <SecaoAccordion
              titulo="Quantitativos"
              aberta={secoes.quantitativos}
              onAlternar={() => alternarSecao('quantitativos')}
            >
              <PainelQuantitativos
                quant={quant}
                fmt={fmt}
                revisao={editor.baseRevision}
                oficial={qtdOficial}
                gerando={gerando}
                onGerar={gerarQuantitativoOficial}
                dirty={editor.dirtySincePublish}
              />
            </SecaoAccordion>
          )}

          {secaoVisivel('orcamento') && (
            <SecaoAccordion
              titulo="Orçamento"
              aberta={secoes.orcamento}
              onAlternar={() => alternarSecao('orcamento')}
            >
              <PainelOrcamento
                study={study}
                revisao={editor.baseRevision}
                dirty={editor.dirtySincePublish}
              />
            </SecaoAccordion>
          )}

          {secaoVisivel('versoes') && (
            <SecaoAccordion
              titulo="Versões"
              aberta={secoes.versoes}
              onAlternar={() => alternarSecao('versoes')}
            >
              <PainelVersoes study={study} />
            </SecaoAccordion>
          )}
          </aside>
        </div>
      </div>

      {/* Fora da coluna do painel de propriedades: é um Sheet sobre a tela
          inteira, e aninhá-lo numa `aside` com `overflow` recortaria o painel. */}
      {/* Fora da coluna do painel, como o Quadro de Divisas: é camada sobre a
          tela inteira, e aninhá-la numa `aside` com `overflow` a recortaria. */}
      <ModalSobreposicao
        aberto={disputa !== null}
        nomeDaPeca={disputa?.nome ?? ''}
        quantos={disputa?.quantos ?? 0}
        volumeM3={disputa?.volumeM3 ?? 0}
        temParede={(disputa?.paredeIds.length ?? 0) > 0}
        onEscolher={resolverDisputa}
      />

      <QuadroDeDivisas
        aberto={quadroAberto}
        onFechar={() => {
          setQuadroAberto(false);
          setLimiteEmDestaque(null);
        }}
        terreno={terreno}
        limites={limitesDoNivel}
        areaEscrituraMm2={editor.model.areaEscrituraMm2 ?? null}
        onAreaEscritura={(areaMm2) => editor.run({ type: 'SetAreaEscritura', areaMm2 })}
        onPapel={(boundaryId, papel) => editor.run({ type: 'SetBoundaryPapel', boundaryId, papel })}
        onApontarFrente={apontarFrente}
        onEscritura={(boundaryId, medidaMm, confrontante) =>
          editor.run({ type: 'SetBoundaryEscritura', boundaryId, medidaMm, confrontante })
        }
        onDestacar={setLimiteEmDestaque}
      />
    </div>
  );
}

/** Controle de barra: voltar, desfazer, refazer. `title` + `aria-label` porque
 *  botão só com ícone não tem nome acessível nenhum sem isso. */
function BotaoBarra({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icone className="h-4 w-4" />
    </button>
  );
}

/**
 * Quantitativos derivados do desenho.
 *
 * Mostra a área de EIXO ao lado da de PISO de propósito. Elas diferem em ~9% numa
 * planta comum, e quem confere o orçamento precisa ver as duas para entender de
 * onde veio o número — a de eixo é a que aparece na aba Ambientes, a de piso é a
 * que vira material comprado.
 */
function PainelQuantitativos({
  quant,
  fmt,
  revisao,
  oficial,
  gerando,
  onGerar,
  dirty,
}: {
  quant: ReturnType<typeof computeQuantities>;
  fmt: (v: number) => string;
  revisao: number;
  oficial: BlueprintQuantitySnapshot | null;
  gerando: boolean;
  onGerar: () => void;
  dirty: boolean;
}) {
  const t = quant.totais;
  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Quantitativos</h2>
        <p className="text-xs text-slate-500">
          Do desenho atual. Política {quant.policy.version}.
        </p>
      </div>

      {/* Oficial × ao vivo. A distinção é o ponto: o orçamento cita o oficial. */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        {revisao === 0 ? (
          <p className="text-xs text-slate-500">
            Publique uma versão para gerar o quantitativo oficial — o orçamento não
            cita rascunho.
          </p>
        ) : oficial ? (
          <>
            <p className="text-xs text-emerald-700">
              <strong>Oficial da revisão {revisao}</strong> gerado em{' '}
              {new Date(oficial.computed_at).toLocaleDateString('pt-BR')}.
            </p>
            {dirty && (
              <p className="mt-1 text-xs text-amber-700">
                O desenho mudou desde então. Publique de novo para gerar o oficial da
                próxima revisão.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              A revisão {revisao} ainda não tem quantitativo oficial.
            </p>
            <BotaoTexto icone={Calculator} rotulo={gerando ? 'Gerando…' : 'Gerar oficial'} onClick={onGerar} disabled={gerando} />
          </>
        )}
      </div>

      {/* A GUARDA OLHA AS DUAS COISAS. Antes ela perguntava só por ambiente, e
          com estrutura no desenho isso passou a esconder um número que existe:
          uma planta de fôrmas — pilares e vigas, sem parede fechando cômodo —
          cairia no aviso de "nenhum ambiente" com dezenas de m³ de concreto
          calculados e invisíveis. */}
      {quant.ambientes.length === 0 && quant.estruturas.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-400">
          Nenhum ambiente fechado — sem contorno fechado não há área para quantificar.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-slate-100">
            {quant.ambientes.length > 0 ? (
              <>
                <Linha rotulo="Área de piso" valor={`${fmt(t.areaPisoM2)} m²`} forte />
                <Linha
                  rotulo={`Piso + perda ${(quant.policy.perdaRevestimento * 100).toFixed(0)}%`}
                  valor={`${fmt(t.areaPisoComPerdaM2)} m²`}
                />
                <Linha
                  rotulo="Parede (2 faces)"
                  valor={`${fmt(t.areaParedeDuasFacesM2)} m²`}
                  forte
                />
                <Linha rotulo="Alvenaria" valor={`${fmt(t.volumeAlvenariaM3)} m³`} />
                {/* POR MATERIAL, logo abaixo da alvenaria — é a decomposição
                    dela, e ler os dois juntos é o que deixa conferir que a soma
                    fecha. Só aparece quando alguma parede tem composição: numa
                    planta homogênea a lista seria vazia e a linha, ruído.
                    Recuadas, para se lerem como detalhe do total acima. */}
                {t.porMaterial.map((m) => (
                  <Linha
                    key={`${m.itemCode}-${m.funcao}`}
                    rotulo={`↳ ${m.descricao || m.itemCode || 'Sem material'}`}
                    valor={`${fmt(m.volumeM3)} m³ · ${fmt(m.areaFaceM2)} m²`}
                  />
                ))}
                <Linha rotulo="Rodapé" valor={`${fmt(t.comprimentoRodapeM)} m`} />
                <Linha
                  rotulo="Aberturas"
                  valor={`${t.portas} porta(s), ${t.janelas} janela(s) · ${fmt(t.areaAberturasM2)} m²`}
                />
              </>
            ) : null}

            {/* Concreto e fôrma SEPARADOS por família, como os totais do kernel:
                pilar, viga, laje e fundação são itens de catálogo diferentes, e
                um total único devolveria um número que não compra nada. Cada
                linha só aparece se houver a peça — quatro zeros empilhados
                seriam ruído em toda planta sem estrutura. */}
            {quant.estruturas.length > 0 ? (
              <>
                {t.volumeConcretoPilarM3 > 0 ? (
                  <Linha
                    rotulo="Concreto — pilares"
                    valor={`${fmt(t.volumeConcretoPilarM3)} m³ · ${fmt(t.areaFormaPilarM2)} m² fôrma`}
                    forte
                  />
                ) : null}
                {t.volumeConcretoVigaM3 > 0 ? (
                  <Linha
                    rotulo="Concreto — vigas"
                    valor={`${fmt(t.volumeConcretoVigaM3)} m³ · ${fmt(t.areaFormaVigaM2)} m² fôrma`}
                    forte
                  />
                ) : null}
                {t.volumeConcretoLajeM3 > 0 ? (
                  <Linha
                    rotulo="Concreto — lajes"
                    valor={`${fmt(t.volumeConcretoLajeM3)} m³ · ${fmt(t.areaLajeM2)} m²`}
                    forte
                  />
                ) : null}
                {t.volumeConcretoFundacaoM3 > 0 ? (
                  <Linha
                    rotulo="Concreto — fundação"
                    valor={`${fmt(t.volumeConcretoFundacaoM3)} m³ · ${fmt(t.areaFormaFundacaoM2)} m² fôrma`}
                    forte
                  />
                ) : null}
                {t.estacas > 0 ? (
                  <Linha
                    rotulo="Estacas"
                    valor={`${t.estacas} un · ${fmt(t.comprimentoEstacasM)} m perfurado`}
                  />
                ) : null}
                {t.pilares > 0 || t.blocosCoroamento > 0 ? (
                  <Linha
                    rotulo="Peças"
                    valor={`${t.pilares} pilar(es), ${t.blocosCoroamento} bloco(s)`}
                  />
                ) : null}
              </>
            ) : null}
          </dl>

          {quant.estruturas.length > 0 ? (
            <div className="border-t border-slate-200 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Por peça estrutural
              </h3>
              <ul className="mt-2 space-y-2">
                {quant.estruturas.map((s, i) => (
                  <li key={s.structuralId} className="rounded-md border border-slate-200 p-2">
                    <p className="text-xs font-medium text-slate-700">
                      {s.rotulo
                        ? `${s.rotulo} · ${nomeDoTipoEstrutural(s.kind)}`
                        : `${nomeDoTipoEstrutural(s.kind)} ${i + 1}`}
                    </p>
                    <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      <dt>Concreto</dt>
                      <dd className="text-right font-medium text-slate-700">
                        {fmt(s.volumeConcretoM3)} m³
                      </dd>
                      <dt>Fôrma</dt>
                      <dd className="text-right">{fmt(s.areaFormaM2)} m²</dd>
                      {/* A FÓRMULA junto do número, como manda a rastreabilidade
                          (RF-121): um volume de concreto que não diz de onde
                          veio não pode ser conferido contra a prancha. */}
                      <dt className="col-span-2 pt-0.5 text-[10px] italic text-slate-400">
                        {s.formula}
                      </dt>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* SOBREPOSIÇÃO — o volume que dois componentes dividem.
              A linha "contado duas vezes" é a razão desta seção existir: sem
              ela, "Manter os dois" no aviso da criação sumiria de vista e o
              orçamento sairia com o mesmo m³ pago em dobro, sem nada na tela
              dizendo isso. Resolvida, a linha vira registro do que se decidiu. */}
          {quant.sobreposicoes.length > 0 ? (
            <div className="border-t border-slate-200 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sobreposição entre peças
              </h3>
              <ul className="mt-2 space-y-1.5">
                {quant.sobreposicoes.map((s) => (
                  <li
                    key={`${s.aId}-${s.bId}`}
                    className={`rounded-md border p-2 text-[11px] ${
                      s.quemCede === 'NINGUEM'
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="font-medium tabular-nums">{fmt(s.volumeM3)} m³</span>{' '}
                    {s.quemCede === 'NINGUEM' ? (
                      <>
                        <strong>contados duas vezes</strong> — como concreto e como
                        alvenaria. Selecione uma das duas peças e escolha quem cede.
                      </>
                    ) : s.quemCede === 'PAREDE' ? (
                      'descontados da alvenaria.'
                    ) : (
                      'descontados do concreto.'
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {quant.ambientes.length > 0 ? (
          <div className="border-t border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Por ambiente
            </h3>
            <ul className="mt-2 space-y-2">
              {quant.ambientes.map((a, i) => (
                <li key={a.spaceId} className="rounded-md border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-700">
                    {a.nome ?? `Ambiente ${i + 1}`}
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <dt>Piso</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {fmt(a.areaPisoM2)} m²
                    </dd>
                    <dt title="Inclui meia espessura de parede em volta">Eixo</dt>
                    <dd className="text-right">{fmt(a.areaEixoM2)} m²</dd>
                    {/* SÓ QUANDO HÁ DESCONTO. A linha existe para explicar uma
                        área de piso menor do que a conta do contorno daria — e
                        um "− 0,00 m²" em todo ambiente sem pilar seria ruído
                        que ensina a ignorar a linha justamente onde ela importa. */}
                    {a.areaEstruturaM2 > 0 ? (
                      <>
                        <dt title="Seção dos pilares que atravessam o piso deste ambiente. Já descontada da área de piso acima.">
                          Pilares
                        </dt>
                        <dd className="text-right">− {fmt(a.areaEstruturaM2)} m²</dd>
                      </>
                    ) : null}
                    <dt>Rodapé</dt>
                    <dd className="text-right">{fmt(a.comprimentoRodapeM)} m</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>
          ) : null}

          <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-400">
            Estudo preliminar assistido; requer validação de profissional habilitado.
            {quant.ambientes[0]
              ? ` Área de piso = ${quant.ambientes[0].formulaAreaPiso}`
              : ''}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Um campo numérico em milímetro, para a barra.
 *
 * `<input type="number">` e não `<select>`, ao contrário da espessura da parede:
 * a espessura tem quatro valores de catálogo (10, 15, 20, 25 cm) e a seção
 * estrutural não tem catálogo nenhum — ela vem da prancha do calculista, e uma
 * lista fechada obrigaria a arredondar 17×42 para o valor mais próximo, o que
 * é exatamente o erro que este módulo existe para não cometer.
 */
function CampoMm({
  rotulo,
  valor,
  onChange,
  titulo,
  permiteNegativo = false,
}: {
  rotulo: string;
  valor: number;
  onChange: (mm: number) => void;
  titulo?: string;
  permiteNegativo?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600" title={titulo}>
      {rotulo}
      <input
        type="number"
        value={valor}
        step={10}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isFinite(n)) return;
          // Zero e negativo são recusados pelos invariantes do kernel, mas a
          // cota (`baseMm`) É negativa em fundação — por isso a trava é por
          // campo, e não uma regra só para todos.
          onChange(permiteNegativo ? n : Math.max(1, n));
        }}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
    </label>
  );
}

/**
 * As medidas da próxima peça estrutural, na barra.
 *
 * Os campos seguem a FORMA (ver `FORMA_ESTRUTURAL`), não o tipo: é o que faz um
 * sétimo tipo não precisar tocar neste componente.
 */
/**
 * Os campos da PRÓXIMA água, na barra: inclinação em %, beiral em mm e o atalho
 * "Do contorno". Espelha `CamposDaEstrutura` — estado da barra, editado antes do
 * gesto; a peça lançada se edita no painel.
 */
function CamposDoTelhado({
  inclinacaoPct,
  onInclinacao,
  beiralMm,
  onBeiral,
  onGerarDoContorno,
  temParedes,
}: {
  inclinacaoPct: number;
  onInclinacao: (v: number) => void;
  beiralMm: number;
  onBeiral: (v: number) => void;
  onGerarDoContorno: () => void;
  temParedes: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <label className="flex items-center gap-1">
        Inclinação
        <input
          type="number"
          min={0}
          max={300}
          step={1}
          value={inclinacaoPct}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onInclinacao(v);
          }}
          aria-label="Inclinação da próxima água, em por cento"
          className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        %
      </label>
      <label className="flex items-center gap-1">
        Beiral
        <input
          type="number"
          min={0}
          step={50}
          value={beiralMm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onBeiral(Math.max(0, Math.round(v)));
          }}
          aria-label="Beiral da água gerada do contorno, em milímetros a partir da face da parede"
          title="Só o atalho 'Do contorno' usa o beiral: no traçado à mão, o contorno que você desenha já é a ponta da telha."
          className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        mm
      </label>
      <button
        type="button"
        onClick={onGerarDoContorno}
        disabled={!temParedes}
        title={
          temParedes
            ? 'Uma água por construção do pavimento: face das paredes + beiral, cantos mitrados. Ajuste o lado do beiral e a inclinação no painel.'
            : 'Desenhe paredes primeiro — o contorno sai delas.'
        }
        className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        Do contorno
      </button>
    </div>
  );
}

function CamposDaEstrutura({
  kind,
  medidas,
  onMedidas,
  rotulo,
  onRotulo,
}: {
  kind: StructuralKind;
  medidas: MedidasEstruturais;
  onMedidas: (m: MedidasEstruturais) => void;
  rotulo: string;
  onRotulo: (v: string) => void;
}) {
  const forma = FORMA_ESTRUTURAL[kind];
  const mudar = (parcial: Partial<MedidasEstruturais>) => onMedidas({ ...medidas, ...parcial });

  return (
    <>
      {forma === 'PONTO' ? (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Seção
          <select
            value={medidas.circular ? 'redonda' : 'retangular'}
            onChange={(e) => mudar({ circular: e.target.value === 'redonda' })}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="retangular">Retangular</option>
            <option value="redonda">Redonda</option>
          </select>
        </label>
      ) : null}

      {forma !== 'AREA' ? (
        <CampoMm
          rotulo={medidas.circular && forma === 'PONTO' ? 'Diâmetro' : 'Largura'}
          valor={medidas.larguraMm}
          onChange={(mm) => mudar({ larguraMm: mm })}
          titulo={
            forma === 'LINHA'
              ? 'A base da seção (b), perpendicular ao eixo, em mm.'
              : 'A primeira dimensão da seção em planta, em mm.'
          }
        />
      ) : null}

      {forma === 'PONTO' && !medidas.circular ? (
        <CampoMm
          rotulo="Profundidade"
          valor={medidas.profundidadeMm}
          onChange={(mm) => mudar({ profundidadeMm: mm })}
          titulo="A segunda dimensão da seção em planta, em mm."
        />
      ) : null}

      <CampoMm
        rotulo={forma === 'AREA' ? 'Espessura' : 'Altura'}
        valor={medidas.alturaMm}
        onChange={(mm) => mudar({ alturaMm: mm })}
        titulo={
          forma === 'AREA'
            ? 'A espessura da laje, em mm.'
            : forma === 'LINHA'
              ? 'A altura da seção (h), em mm.'
              : 'A extensão vertical: pé-direito do pilar, profundidade da estaca.'
        }
      />

      <CampoMm
        rotulo="Cota"
        valor={medidas.baseMm}
        onChange={(mm) => mudar({ baseMm: mm })}
        permiteNegativo
        titulo="Cota da face INFERIOR, medida do piso do pavimento. Negativa em fundação."
      />

      <label
        className="flex items-center gap-1.5 text-xs text-slate-600"
        title="Como a prancha do calculista chama a peça: P1, V3, L2. Some depois de lançar — o rótulo é da PRÓXIMA peça."
      >
        Rótulo
        <input
          type="text"
          value={rotulo}
          onChange={(e) => onRotulo(e.target.value)}
          placeholder={`${prefixoDeRotulo(kind)}1`}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
      </label>
    </>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-xs text-slate-600">{rotulo}</dt>
      <dd className={`text-xs ${forte ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
        {valor}
      </dd>
    </div>
  );
}

/** Botão pequeno com ícone e rótulo, para ações do painel. */
function BotaoTexto({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
  titulo,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo ?? rotulo}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icone className="h-3.5 w-3.5" />
      {rotulo}
    </button>
  );
}

function Ferramenta({
  atual,
  valor,
  icone: Icone,
  rotulo,
  onClick,
}: {
  atual: BlueprintTool;
  valor: BlueprintTool;
  icone: React.ElementType;
  rotulo: string;
  onClick: (t: BlueprintTool) => void;
}) {
  const ativo = atual === valor;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={() => onClick(valor)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  );
}
