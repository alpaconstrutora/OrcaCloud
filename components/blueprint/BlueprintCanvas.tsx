import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  travarOrtogonal,
  isFreeWallEnd,
  extensaoDeCanto,
  cantosDaParede,
  eixoDaParede,
  poligonoPeloLado,
  retanguloPorCantos,
  intersectSegments,
  pointInPolygon,
  type AlinhamentoParede,
  type BlueprintModel,
  type Boundary,
  type BoundaryKind,
  type Opening,
  type Point,
  type Wall,
  point,
  pontasDeslocadas,
  wallLength,
} from '../../utils/blueprintKernel';
import {
  DIMENSAO_POR_TIPO,
  medir,
  pontosMinimos,
  type FormaMedida,
  type TipoMedida,
} from '../../utils/blueprintMedicoes';
import {
  modeloParaPixel,
  pixelParaModelo,
  type PontoPx,
  type Underlay,
} from '../../utils/blueprintUnderlay';
import { anelDoTerreno } from '../../utils/blueprintTerreno';
import type { BlueprintTool } from '../../hooks/useBlueprintEditor';

/**
 * Canvas do editor de plantas (épico E3).
 *
 * Renderer: CANVAS 2D, por decisão DP-03. O Spike B mediu os três candidatos com
 * 20 mil objetos em Chrome real: SVG, Canvas 2D e WebGL entregam 60 fps, mas o
 * custo do SVG se concentra justamente na operação mais frequente do editor —
 * mudança por elemento (0,40 ms no Canvas 2D contra 1,10 ms no SVG) — e ele ainda
 * carrega um nó de DOM por parede. WebGL não resolve problema que exista hoje.
 *
 * O que o canvas NÃO faz: alterar o modelo. Ele traduz gesto em intenção e chama
 * `onCommand`. Quem valida e transforma é o kernel (ADR-01).
 *
 * Acessibilidade: canvas é opaco para leitor de tela. A camada focável vive fora
 * daqui, em `BlueprintEditor` — é o "híbrido" que o Spike B recomendou. Aqui só
 * garantimos que o elemento é focável e que Esc/Delete funcionam por teclado.
 */

const COR_PAREDE = '#334155';
const COR_SELECIONADA = '#dc2626';
const COR_PREVIA = '#2563eb';
/** Âmbar: vão em aberto e ponta solta. Mesma cor do aviso no painel. */
const COR_ALERTA = '#d97706';
const COR_AMBIENTE = 'rgba(37, 99, 235, 0.08)';
const COR_GRADE = '#e2e8f0';
const COR_GRADE_FORTE = '#cbd5e1';
/** Cinza neutro para a cota de parede — distinto do preto da própria parede e
 * do azul/vermelho de prévia/seleção, para não competir com eles. */
const COR_COTA = '#64748b';
/** Divisa do LOTE. Verde de topografia, distante do azul da prévia e do vermelho da seleção. */
const COR_TERRENO = '#15803d';
/** Preenchimento do lote — fraco, só para dizer "a área é esta". */
const COR_TERRENO_FUNDO = 'rgba(21, 128, 61, 0.06)';
/** Envelope construtivo — restrição, não construção. Hachura, nunca preenchimento. */
const COR_ENVELOPE = 'rgba(217, 119, 6, 0.45)';

/**
 * Abaixo disto, em pixels de tela, a parede não ganha rótulo de comprimento.
 *
 * Uma parede cortada em vários trechos curtos (perto de aberturas, ou depois de
 * `SplitWall`) mostraria uma cota por fragmento — números pequenos demais para
 * ler, empilhados uns sobre os outros. Sem o limiar, "mostrar medidas" numa
 * planta com esses cortes vira mancha de texto, não informação.
 */
const MIN_PX_COTA_PAREDE = 24;

/**
 * Escada de passos de grade, em mm — série 1-2-5, que é a que o olho lê como
 * "redonda" em qualquer escala (1 cm, 2 cm, 5 cm, 10 cm, 20 cm…).
 */
const ESCADA_MM = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];

/** Espaçamento mínimo em tela, em pixels, para uma linha de grade valer a pena. */
const MIN_PX_ENTRE_LINHAS = 9;

/**
 * Passo adaptativo: o MENOR da escada cujo espaçamento em tela ainda é legível.
 *
 * Era daqui que vinha o bug de a grade sumir no zoom out. Com passo fixo de
 * 100 mm, afastar a vista fazia o espaçamento cair abaixo do limiar e o desenho
 * da grade era pulado inteiro — inclusive as linhas de metro. Escolhendo o passo
 * em função da escala, a grade nunca desaparece: ela muda de granularidade.
 */
function passoAdaptativo(escala: number): number {
  for (const passo of ESCADA_MM) {
    if (passo * escala >= MIN_PX_ENTRE_LINHAS) return passo;
  }
  return ESCADA_MM[ESCADA_MM.length - 1];
}

/** Rótulo curto do passo, para o usuário saber a que ele está encaixando. */
export function rotuloPasso(mm: number): string {
  return mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`;
}
/** Raio de captura de extremidade, em PIXELS de tela — não em mm. */
const SNAP_PX = 12;
/** Distância máxima, em pixels, para o clique selecionar uma parede. */
const HIT_PX = 8;
/** Espessura da linha de contorno da parede, em pixels de tela. */
const LINHA_PAREDE_PX = 1.2;
/** Mesmo teto do kernel (MAX_COORD_MM). Ver o comentário em `capturar`. */
const LIMITE_MM = 1_000_000;
/**
 * Quanto o ponteiro pode andar, em pixels, e o gesto ainda contar como clique.
 *
 * Sem essa folga, todo clique no vazio abriria um laço de área zero — e um laço
 * de área zero não pega nada, mas também não limpa a seleção, que é o que o
 * clique no vazio sempre fez.
 */
const FOLGA_CLIQUE_PX = 3;

/** Folga entre a borda do desenho e o rótulo, em pixels de tela. */
const FOLGA_ROTULO_PX = 11;

interface PontoTela {
  x: number;
  y: number;
}

/**
 * Escreve um valor no desenho, com fundo claro atrás.
 *
 * O fundo não é enfeite: sobre a planta de fundo, número sem fundo se mistura às
 * linhas do escaneamento e deixa de ser legível justamente onde ele importa —
 * conferindo a cota do projetista contra a que se está traçando.
 *
 * `x`/`y` são o CENTRO do rótulo, não o canto do texto: só assim quem chama pode
 * posicionar a partir de uma conta geométrica (meio do traço, deslocado pela
 * normal) sem precisar adivinhar a largura do texto.
 */
function escreverRotulo(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  cor: string,
  tamanhoPx = 12,
): void {
  ctx.save();
  ctx.font = `600 ${tamanhoPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const largura = ctx.measureText(texto).width;
  const altura = tamanhoPx + 5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fillRect(x - largura / 2 - 4, y - altura / 2, largura + 8, altura);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
  ctx.restore();
}

/**
 * Rótulo de comprimento ao lado de um traço, FORA da faixa desenhada.
 *
 * O afastamento é PERPENDICULAR ao traço e proporcional à espessura em tela, não
 * um deslocamento fixo em diagonal. Com os 8 px fixos que havia aqui, o número
 * caía dentro da própria parede assim que a espessura desenhada passava de 16 px
 * — e sobre a planta de fundo, em zoom, é exatamente o que acontecia: a medida
 * ficava ilegível por cima do trecho que ela mede.
 *
 * O lado é escolhido por regra fixa (acima do traço; à direita, no traço
 * vertical) em vez de acompanhar o cursor: rótulo que troca de lado durante o
 * gesto pisca e desloca o olhar de quem está mirando o clique.
 */
function rotuloDoTraco(
  ctx: CanvasRenderingContext2D,
  texto: string,
  a: PontoTela,
  b: PontoTela,
  espessuraPx: number,
  cor: string,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy) || 1;
  let nx = -dy / comp;
  let ny = dx / comp;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const afastamento = Math.max(espessuraPx, 2) / 2 + FOLGA_ROTULO_PX;
  escreverRotulo(
    ctx,
    texto,
    (a.x + b.x) / 2 + nx * afastamento,
    (a.y + b.y) / 2 + ny * afastamento,
    cor,
  );
}

/**
 * Ponto do mundo em milímetro inteiro e dentro do alcance do kernel.
 *
 * `point()` recusa fração e coordenada fora de ±1.000.000 mm com exceção, e
 * estas contas rodam a cada movimento do ponteiro — sem limitar antes, afastar
 * a vista e mexer o mouse derrubaria a aba de dentro de um handler.
 */
function arredondar(p: { x: number; y: number }): Point {
  const limitar = (v: number) => Math.max(-LIMITE_MM, Math.min(LIMITE_MM, Math.round(v)));
  return point(limitar(p.x), limitar(p.y));
}

/** Distância de um ponto ao segmento `a`–`b`, em mm. */
function distanciaAoSegmento(a: Point, b: Point, p: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return Math.hypot(a.x - p.x, a.y - p.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comp2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** As arestas de uma sequência de pontos. `fechado` acrescenta a de volta. */
function arestas(pontos: Point[], fechado: boolean) {
  const saida: { a: Point; b: Point }[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) saida.push({ a: pontos[i], b: pontos[i + 1] });
  if (fechado && pontos.length > 2) {
    saida.push({ a: pontos[pontos.length - 1], b: pontos[0] });
  }
  return saida;
}

/** Todos os vértices caem dentro do retângulo? — o laço "janela". */
function anelDentroDe(pontos: Point[], ret: Point[]): boolean {
  return pontos.length > 0 && pontos.every((p) => pointInPolygon(ret, p));
}

/**
 * A figura encosta no retângulo? — o laço "interseção".
 *
 * Três testes, e os três são necessários: vértice dentro do retângulo (figura
 * parcialmente dentro), canto do retângulo dentro da figura (retângulo pequeno
 * inteiramente dentro de uma parede grossa) e cruzamento de arestas (a figura
 * atravessa o retângulo de lado a lado, sem nenhum vértice dentro).
 */
function anelToca(pontos: Point[], ret: Point[], fechado: boolean): boolean {
  if (pontos.length === 0) return false;
  if (pontos.some((p) => pointInPolygon(ret, p))) return true;
  if (fechado && pontos.length > 2 && ret.some((p) => pointInPolygon(pontos, p))) return true;
  for (const s of arestas(pontos, fechado)) {
    for (const t of arestas(ret, true)) {
      if (intersectSegments(s, t).kind !== 'none') return true;
    }
  }
  return false;
}

/** Correção de uma ponta já criada, para o canto fechar mitrado. */
export interface AjustePonta {
  wallId: string;
  end: 'a' | 'b';
  to: Point;
}

interface Props {
  model: BlueprintModel;
  tool: BlueprintTool;
  levelId: string | null;
  /**
   * A seleção inteira, com ids HETEROGÊNEOS: parede, abertura ou medição.
   *
   * É uma lista, e não um id, porque o gesto que o módulo não tinha era
   * justamente "pegue este bloco e ande com ele". As operações de cardinalidade
   * 1 (alça de ponta, arrastar abertura) continuam existindo e são consultadas
   * por `unicoSelecionado`, logo abaixo.
   */
  selectedIds: string[];
  onSelecionar: (ids: string[]) => void;
  /**
   * Desloca paredes e limites selecionados. Sem isto o arraste mostra a prévia e
   * não grava nada — o mesmo contrato de `onMoveVertex`.
   *
   * As duas famílias numa chamada só porque elas têm de andar no MESMO comando:
   * separadas, a vizinhança do modo Esticar não enxergaria a outra e o anel do
   * lote abriria em silêncio.
   */
  onMoverSelecao?: (wallIds: string[], boundaryIds: string[], delta: Point) => void;
  /** Desloca as medições selecionadas. Camada separada, gravação separada. */
  onMoverMedicoes?: (ids: string[], delta: Point) => void;
  /**
   * Modo ESTICAR: as pontas de paredes não selecionadas que compartilham
   * vértice com a seleção andam junto.
   *
   * Chega até aqui porque a PRÉVIA tem de aplicar a mesma regra do commit —
   * mostrar o bloco desprendendo e gravar as vizinhas coladas faria o desenho
   * "pular" ao soltar.
   */
  arrastarVizinhas?: boolean;
  /**
   * Anel do envelope construtivo, já recuado. Vazio não desenha nada.
   *
   * Vem pronto de fora em vez de ser calculado aqui: os recuos são do painel, o
   * papel de cada divisa é do modelo, e a conta é do kernel. O canvas desenha.
   */
  envelope?: Point[];
  /**
   * Confirma um trecho de parede, com o eixo JÁ resolvido pelo alinhamento.
   *
   * `ajustes` corrige a ponta de paredes já criadas — é o que mitra o canto no
   * traçado pela face (ver `eixoDaParede`). Deve entrar no MESMO passo de
   * histórico do trecho novo, senão um "desfazer" desfaz meio gesto.
   *
   * O retorno é o id da parede criada. Sem ele o trecho seguinte não tem como
   * corrigir o canto deste, e a junção fica com folga de meia espessura — por
   * isso quem não souber informar deve devolver `null` explicitamente.
   */
  onAddWall: (a: Point, b: Point, ajustes?: AjustePonta[]) => string | null | void;
  /** Onde o clique cai: no eixo da parede ou na face (canto). */
  alinhamento?: AlinhamentoParede;
  /** Quantos lados a ferramenta Polígono cria. */
  ladosPoligono?: number;
  /**
   * Fecha o polígono: recebe os eixos JÁ resolvidos, um por lado, na ordem do
   * contorno. Os cantos já vêm mitrados — quem chama só precisa gravar as N
   * paredes num lote só, para o polígono ser um passo de desfazer, e não N.
   */
  onAddPoligono?: (eixos: { a: Point; b: Point }[]) => void;
  /**
   * Inverte o lado do traçado. Chamado pela BARRA DE ESPAÇO, como no Revit.
   *
   * A tecla é tratada aqui, e não num ouvinte de `window`, por dois motivos: o
   * canvas é quem tem o foco enquanto se desenha, e espaço no `window` seria um
   * sequestro — é ele que aciona botão e abre select, e a barra de ferramentas
   * desta tela É a camada acessível por teclado.
   */
  onInverterLado?: () => void;
  /** Coloca abertura na parede indicada, com o offset ja medido a partir de `a`. */
  onAddOpening: (wallId: string, offsetMm: number) => void;
  onDelete: () => void;
  /** Largura da abertura em curso, para previa e para o comando. */
  larguraAberturaMm: number;
  espessuraMm: number;
  /** `null` = automático pelo zoom. Número = passo fixo em mm, escolhido pelo usuário. */
  passoGradeMm: number | null;
  /** Informa de volta qual passo está valendo, para a barra mostrar no modo automático. */
  onPassoEfetivo?: (mm: number) => void;
  /** Vãos que a lista do painel oferece para fechar — destacados aqui. */
  vaos?: { a: Point; b: Point; mm: number }[];
  /** Pontas de parede sem encontro. São elas que impedem o ambiente de fechar. */
  pontasSoltas?: Point[];
  /** Trava ortogonal ligada. Shift INVERTE o estado, como em todo CAD. */
  ortogonal?: boolean;
  /** Escreve o comprimento de CADA parede junto dela, como uma cota de planta. */
  mostrarMedidasParedes?: boolean;
  /** Planta de fundo já carregada, com o posicionamento aferido. */
  fundo?: { imagem: HTMLImageElement; underlay: Underlay; opacidade: number } | null;
  /** Em calibração: recebe os dois pontos clicados, em PIXEL DA IMAGEM. */
  onCalibrar?: (p1: PontoPx, p2: PontoPx) => void;
  /** Formas MEDIDAS já gravadas, para desenhar. */
  medicoes?: FormaMedida[];
  /** Conclui uma forma medida. `null` em `pontos` cancela. */
  onMedicaoPronta?: (tipo: TipoMedida, pontos: Point[]) => void;
  /** Id da medição escolhida na LISTA lateral, para destacar junto com a seleção. */
  medicaoSelecionada?: string | null;
  /** Move a ponta de uma parede. Sem isto, a alça é desenhada e não faz nada. */
  onMoveVertex?: (wallId: string, end: 'a' | 'b', to: Point) => void;
  /**
   * Confirma um trecho de LIMITE — divisa de terreno.
   *
   * Sem `ajustes` como o de parede: limite não tem espessura, logo não tem canto
   * para mitrar. O vértice clicado é o vértice, e é isso.
   */
  onAddLimite?: (a: Point, b: Point, kind: BoundaryKind) => void;
  /** Move a ponta de um limite. Espelha `onMoveVertex`. */
  onMoveBoundaryVertex?: (boundaryId: string, end: 'a' | 'b', to: Point) => void;
  /**
   * Desliza a abertura ao longo da parede que já a hospeda. Sem isto, o arraste
   * mostra a prévia e não grava nada.
   */
  onMoveOpening?: (openingId: string, offsetMm: number) => void;
}

interface Vista {
  /** Pixels por milímetro. */
  escala: number;
  /** Deslocamento em pixels. */
  dx: number;
  dy: number;
}

/** Distância de clique para pegar a alça de uma ponta, em pixels de tela. */
const ALCA_PX = 9;

/** Folga entre a origem do modelo e a borda da área de desenho, em pixels. */
const MARGEM_INICIAL_PX = 60;

export default function BlueprintCanvas({
  model,
  tool,
  levelId,
  selectedIds,
  onSelecionar,
  onMoverSelecao,
  onMoverMedicoes,
  arrastarVizinhas = false,
  envelope = [],
  onAddWall,
  alinhamento = 'EIXO',
  ladosPoligono = 6,
  onAddPoligono,
  onInverterLado,
  onAddOpening,
  onDelete,
  larguraAberturaMm,
  espessuraMm,
  passoGradeMm,
  onPassoEfetivo,
  vaos = [],
  pontasSoltas = [],
  ortogonal = false,
  mostrarMedidasParedes = false,
  fundo = null,
  onMoveVertex,
  onAddLimite,
  onMoveBoundaryVertex,
  onMoveOpening,
  onCalibrar,
  medicoes = [],
  onMedicaoPronta,
  medicaoSelecionada = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [vista, setVista] = useState<Vista>({
    escala: 0.05,
    dx: MARGEM_INICIAL_PX,
    dy: MARGEM_INICIAL_PX,
  });
  /** A origem já foi levada para o rodapé? Só na primeira medida do container. */
  const enquadrado = useRef(false);
  const [tamanho, setTamanho] = useState({ w: 800, h: 600 });
  /**
   * Traçado em curso, na ordem dos cliques. É uma POLILINHA, não só o último
   * ponto: para mitrar o canto, o trecho que está sendo desenhado precisa saber
   * de onde veio (o ponto anterior) e, ao fechar o contorno, para onde o primeiro
   * trecho foi. Guardando só `inicio`, o canto de fechamento ficaria sempre com
   * folga de meia espessura — e é justamente ele que fecha o ambiente.
   */
  const [cadeia, setCadeia] = useState<Point[]>([]);
  /**
   * Trechos já criados nesta cadeia, na ordem: a parede e o LADO com que ela foi
   * traçada. É por eles que o canto é corrigido.
   *
   * O lado entra aqui porque a barra de espaço pode invertê-lo no meio do
   * contorno. Duas paredes de lados diferentes não têm canto para mitrar — a
   * interseção das faces seria calculada com um lado só, e corrigir a ponta da
   * anterior por essa conta a deixaria TORTA, com o eixo fora de paralelo com a
   * linha que a pessoa traçou. Guardado o lado, a junção onde o lado mudou
   * simplesmente não mitra: fica um degrau, que é a consequência honesta de
   * mudar de lado ali.
   */
  const [trechos, setTrechos] = useState<{ wallId: string; lado: AlinhamentoParede }[]>([]);
  /**
   * Ponta em arraste num LIMITE. Estado separado de `movendo` (que é de parede)
   * porque o commit vai para outro comando — `MoveBoundaryVertex`, não
   * `MoveVertex`. Um estado só, com o tipo decidido no fim, esconderia essa
   * bifurcação no lugar mais fácil de errar.
   */
  const [movendoLimite, setMovendoLimite] = useState<{ boundaryId: string; end: 'a' | 'b' } | null>(
    null,
  );
  const inicio = cadeia.length > 0 ? cadeia[cadeia.length - 1] : null;
  const antesDoInicio = cadeia.length > 1 ? cadeia[cadeia.length - 2] : null;
  const ultimoTrecho = trechos.length > 0 ? trechos[trechos.length - 1] : null;
  /** Dá para mitrar a junção com o trecho anterior? Só se o lado não mudou. */
  const mesmoLado = !ultimoTrecho || ultimoTrecho.lado === alinhamento;
  const [cursor, setCursor] = useState<Point | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /**
   * Laço em curso, em MILÍMETRO do modelo.
   *
   * A DIREÇÃO decide o modo, como em todo CAD: da esquerda para a direita pega
   * só o que está inteiramente dentro ("janela"); da direita para a esquerda
   * pega tudo que o retângulo toca ("interseção"). Guardar os dois pontos, em
   * vez de um retângulo normalizado, é o que preserva essa direção.
   */
  const [laco, setLaco] = useState<{ origem: Point; atual: Point } | null>(null);
  /**
   * Arraste da seleção inteira: de onde o gesto partiu e quanto já andou.
   *
   * O deslocamento é guardado como VETOR, não como posição de destino, porque é
   * o vetor que se aplica igual a todas as entidades — encaixar cada uma na
   * grade individualmente destruiria as relações internas do conjunto.
   */
  const [movendoSelecao, setMovendoSelecao] = useState<
    { origem: Point; delta: Point } | null
  >(null);
  const [previaAbertura, setPreviaAbertura] = useState<{ wallId: string; offsetMm: number } | null>(null);
  /** Ponta em arraste, e para onde ela iria se soltasse agora. */
  const [movendo, setMovendo] = useState<{ wallId: string; end: 'a' | 'b' } | null>(null);
  const [destinoPonta, setDestinoPonta] = useState<Point | null>(null);
  /** Abertura em arraste, e o offset em que ela pararia se soltasse agora. */
  const [movendoAbertura, setMovendoAbertura] = useState<
    { openingId: string; offsetMm: number } | null
  >(null);
  /**
   * Primeiro ponto da forma fechada em curso — polígono ou retângulo.
   *
   * O que ele SIGNIFICA muda com a ferramenta: no polígono é o CENTRO (o cursor
   * dá a apótema e o giro), no retângulo é um CANTO (o cursor dá o oposto).
   * Um estado só porque o resto do gesto é idêntico nos dois: prévia, `Escape`,
   * e o mesmo lote de paredes mitradas no fim.
   */
  const [ancoraDaForma, setAncoraDaForma] = useState<Point | null>(null);
  /** Primeiro ponto da aferição, em milímetro do modelo. */
  const [calibP1, setCalibP1] = useState<Point | null>(null);
  /** Vértices da forma medida em curso. */
  const [medindo, setMedindo] = useState<Point[]>([]);

  // Passo em vigor: o escolhido pelo usuario, ou o adaptativo se ele deixou em
  // automatico. E o MESMO valor usado para desenhar e para encaixar — a grade
  // que se ve tem que ser a grade em que se encaixa, senao o clique "pula".
  const passoEfetivo = passoGradeMm ?? passoAdaptativo(vista.escala);

  useEffect(() => {
    onPassoEfetivo?.(passoEfetivo);
  }, [passoEfetivo, onPassoEfetivo]);

  // Memoizadas porque o efeito de DESENHO depende delas: um filtro solto devolve
  // array novo a cada render e faria a planta ser repintada por qualquer mudança
  // de estado da tela, inclusive as que não mexem em geometria nenhuma.
  const paredesReais = useMemo(
    () => model.walls.filter((w) => !levelId || w.levelId === levelId),
    [model.walls, levelId],
  );
  const limitesReais = useMemo(
    () => model.boundaries.filter((b) => !levelId || b.levelId === levelId),
    [model.boundaries, levelId],
  );
  const ambientesDoNivel = useMemo(
    () => model.spaces.filter((s) => !levelId || s.levelId === levelId),
    [model.spaces, levelId],
  );

  // ── Seleção ───────────────────────────────────────────────────────────────
  //
  // `selectedIds` é a fonte; tudo o mais aqui é derivado dela. `unicoSelecionado`
  // existe porque duas operações do editor são, por definição, de UM item só —
  // arrastar a alça de uma ponta e deslizar uma abertura. Com N selecionados
  // elas simplesmente não se oferecem, em vez de agirem sobre um item arbitrário
  // do conjunto.
  const selecao = useMemo(() => new Set(selectedIds), [selectedIds]);
  const unicoSelecionado = selectedIds.length === 1 ? selectedIds[0] : null;
  const idsDeParedesSelecionadas = paredesReais.filter((w) => selecao.has(w.id)).map((w) => w.id);
  const idsDeLimitesSelecionados = limitesReais.filter((b) => selecao.has(b.id)).map((b) => b.id);
  const idsDeMedicoesSelecionadas = medicoes.filter((f) => selecao.has(f.id)).map((f) => f.id);

  /**
   * Onde cada ponta PARARIA se o arraste fosse solto agora — vazio fora dele.
   *
   * ⚠️ Paredes e limites entram JUNTOS na conta, exatamente como no comando
   * `TranslateEntities`. Calcular separado faria a vizinhança de uma família não
   * enxergar a outra, e a prévia mostraria a divisa desprendendo da parede
   * enquanto o commit as manteria coladas — a linha "pularia" ao soltar, e o
   * usuário aprenderia a não confiar na prévia.
   *
   * A conta vem do KERNEL (`pontasDeslocadas`), a mesma que o comando aplica.
   * Reimplementá-la aqui seria a cópia que diverge em silêncio.
   */
  const destinosDoArraste = useMemo(() => {
    const d = movendoSelecao?.delta;
    const ids = [...idsDeParedesSelecionadas, ...idsDeLimitesSelecionados];
    if (!d || (d.x === 0 && d.y === 0) || ids.length === 0) return null;
    return pontasDeslocadas([...paredesReais, ...limitesReais], ids, d, arrastarVizinhas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paredesReais, limitesReais, movendoSelecao, selecao, arrastarVizinhas]);

  /**
   * As paredes COMO ELAS APARECEM AGORA na tela.
   *
   * Durante o arraste, é o conjunto já deslocado — a mesma escolha que o arraste
   * de abertura faz (desenhar a porta no offset novo, e não um fantasma ao lado
   * dela): o que se vê durante o gesto é exatamente o que fica ao soltar. O
   * modelo só muda no `pointerup`.
   */
  const paredesDoNivel = useMemo(() => {
    if (!destinosDoArraste) return paredesReais;
    return paredesReais.map((w) => {
      const destino = destinosDoArraste.get(w.id);
      return destino ? { ...w, a: destino.a, b: destino.b } : w;
    });
  }, [paredesReais, destinosDoArraste]);

  /** Os limites como aparecem agora — mesma regra das paredes. */
  const limitesDoNivel = useMemo(() => {
    if (!destinosDoArraste) return limitesReais;
    return limitesReais.map((b) => {
      const destino = destinosDoArraste.get(b.id);
      return destino ? { ...b, a: destino.a, b: destino.b } : b;
    });
  }, [limitesReais, destinosDoArraste]);

  /** As medições como aparecem agora — deslocadas junto durante o arraste. */
  const medicoesDoNivel = useMemo(() => {
    const d = movendoSelecao?.delta;
    if (!d || (d.x === 0 && d.y === 0)) return medicoes;
    return medicoes.map((f) =>
      selecao.has(f.id)
        ? { ...f, pontos: f.pontos.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) }
        : f,
    );
  }, [medicoes, movendoSelecao, selecao]);

  // ── Conversões ────────────────────────────────────────────────────────────
  //
  // O Y DO MODELO CRESCE PARA CIMA; o da tela, para baixo. A inversão vive
  // AQUI, nestas duas funções, e em nenhum outro lugar.
  //
  // Ela faltava. O modelo é Y para cima em todo o resto do sistema — a
  // exportação em PDF inverte explicitamente, o DXF grava Y cru porque DXF
  // também é Y para cima, e `blueprintUnderlay` converte pixel de imagem para
  // milímetro invertendo o sinal. Só a tela somava Y direto, e o resultado era
  // desenhar tudo espelhado na vertical em relação ao que sai no papel.
  //
  // Numa planta retangular isso não salta aos olhos: o retângulo virado de
  // cabeça para baixo é o mesmo retângulo. O que denunciou foi a planta de
  // fundo, que tem conteúdo assimétrico — a marca do canto superior da imagem
  // aparecia embaixo. Ver `docs/spikes/medicoes/passeio.mjs`.
  const paraTela = useCallback(
    (p: Point) => ({ x: p.x * vista.escala + vista.dx, y: -p.y * vista.escala + vista.dy }),
    [vista],
  );

  const paraMundo = useCallback(
    (px: number, py: number) => ({
      x: (px - vista.dx) / vista.escala,
      y: -(py - vista.dy) / vista.escala,
    }),
    [vista],
  );

  /**
   * Captura em três etapas: extremidade de EIXO, CANTO do corpo da parede e, por
   * último, grade. Geometria existente sempre ganha da grade — cair na grade a
   * 1 mm de distância deixa um vão que não fecha e o usuário não vê.
   *
   * O canto existe porque a extremidade do eixo fica no MEIO da espessura: quem
   * copia uma planta de fundo aponta o canto que está na tela, e ali não havia
   * ponto de encaixe nenhum. Quando o clique também está sendo interpretado como
   * face (`preferirCanto`), o canto passa na frente do eixo; desenhando pelo
   * eixo, a ordem se inverte. Assim o ímã sempre puxa para o mesmo tipo de ponto
   * que o traçado está produzindo.
   */
  const capturar = useCallback(
    (mundo: { x: number; y: number }, preferirCanto = false): Point => {
      const limite = SNAP_PX / vista.escala;
      let melhorEixo: Point | null = null;
      let distEixo = Infinity;
      let melhorCanto: Point | null = null;
      let distCanto = Infinity;

      for (const w of paredesDoNivel) {
        for (const end of ['a', 'b'] as const) {
          const extremo = w[end];
          const d = Math.hypot(extremo.x - mundo.x, extremo.y - mundo.y);
          if (d < limite && d < distEixo) {
            melhorEixo = extremo;
            distEixo = d;
          }

          // PORTÃO DE DISTÂNCIA antes de qualquer conta de canto. `isFreeWallEnd`
          // varre todas as paredes, então chamá-la para cada ponta seria
          // quadrático a cada movimento do mouse — com 20 mil paredes é o que
          // trava a aba (Spike B). O canto mais afastado da ponta do eixo está a
          // uma espessura dela, então nada além disso pode ganhar.
          if (d > limite + w.thicknessMm) continue;

          // A MESMA medida que o desenho usa. `extensaoDeCanto` já devolve 0 na
          // ponta livre, então não há mais o que perguntar sobre junção aqui —
          // e o canto oferecido ao clique é, por construção, o canto que está
          // na tela.
          const cantos = cantosDaParede(
            w.a,
            w.b,
            w.thicknessMm,
            extensaoDeCanto(paredesDoNivel, w, 'a'),
            extensaoDeCanto(paredesDoNivel, w, 'b'),
          );
          for (const c of cantos) {
            const dc = Math.hypot(c.x - mundo.x, c.y - mundo.y);
            if (dc < limite && dc < distCanto) {
              melhorCanto = c;
              distCanto = dc;
            }
          }
        }
      }

      const primeiro = preferirCanto ? melhorCanto : melhorEixo;
      const segundo = preferirCanto ? melhorEixo : melhorCanto;
      const achado = primeiro ?? segundo;
      if (achado) return point(achado.x, achado.y);

      // LIMITAR antes de chamar `point()`. O kernel recusa coordenada fora de
      // ±1.000.000 mm com KernelError, e `capturar` roda a cada movimento do
      // mouse — sem o limite, afastar a vista e mover o cursor levantaria uma
      // exceção não tratada dentro do handler de ponteiro e derrubaria a aba.
      const limitar = (v: number) => Math.max(-LIMITE_MM, Math.min(LIMITE_MM, v));

      return point(
        limitar(Math.round(mundo.x / passoEfetivo) * passoEfetivo),
        limitar(Math.round(mundo.y / passoEfetivo) * passoEfetivo),
      );
    },
    [paredesDoNivel, vista.escala, passoEfetivo],
  );

  /**
   * Ponto do traçado de parede: a captura normal, mais o FECHAMENTO do contorno.
   *
   * Sem tratar o fechamento, voltar ao ponto de partida dependeria de acertar o
   * mesmo milímetro duas vezes — e 1 mm de diferença não se vê na tela, mas deixa
   * o contorno aberto e o ambiente sem aparecer. Grudar no primeiro ponto da
   * cadeia também é o que permite mitrar o canto de fechamento.
   */
  const capturarTracado = useCallback(
    (mundo: { x: number; y: number }): Point => {
      const p = capturar(mundo, alinhamento !== 'EIXO');
      const zero = cadeia[0];
      if (
        zero &&
        cadeia.length >= 3 &&
        Math.hypot(zero.x - p.x, zero.y - p.y) < SNAP_PX / vista.escala
      ) {
        return zero;
      }
      return p;
    },
    [capturar, alinhamento, cadeia, vista.escala],
  );

  /**
   * O polígono em curso, do centro até o cursor. `[]` enquanto não houver um.
   *
   * O cursor fica no MEIO DE UM LADO, não num vértice: o lado sob ele nasce
   * perpendicular ao arraste, e com a trava ortogonal todo polígono de lados
   * pares sai alinhado aos eixos da planta. Medindo pelo vértice — como era —
   * um quadrado saía como losango, girado 45°, que foi o defeito relatado em
   * uso. O porquê completo está em `poligonoPeloLado`.
   */
  const verticesPoligono = useMemo(() => {
    if (!ancoraDaForma || !cursor) return [];
    if (tool === 'retangulo') return retanguloPorCantos(ancoraDaForma, cursor);

    const dx = cursor.x - ancoraDaForma.x;
    const dy = cursor.y - ancoraDaForma.y;
    return poligonoPeloLado(
      ancoraDaForma,
      Math.hypot(dx, dy),
      ladosPoligono,
      Math.atan2(dy, dx),
    );
  }, [ancoraDaForma, cursor, ladosPoligono, tool]);

  /**
   * Os eixos das N paredes do polígono, com os cantos MITRADOS.
   *
   * É o mesmo caminho do fechamento manual: cada lado consulta os dois vizinhos
   * do contorno, e por isso as pontas coincidem em vez de ficarem a meia
   * espessura umas das outras. Um polígono cujos cantos não fecham não deriva
   * ambiente nenhum — e o sintoma apareceria longe daqui, na lista vazia.
   */
  const eixosDoPoligono = useCallback(
    (vertices: Point[]) =>
      vertices.map((_, i) => {
        const n = vertices.length;
        return eixoDaParede(
          { a: vertices[i], b: vertices[(i + 1) % n] },
          espessuraMm,
          alinhamento,
          { antes: vertices[(i + n - 1) % n], depois: vertices[(i + 2) % n] },
        );
      }),
    [espessuraMm, alinhamento],
  );

  /** O ponto fecha o contorno em curso? Exige triângulo — dois pontos não fecham. */
  const fechandoContorno = useCallback(
    (p: Point) => cadeia.length >= 3 && p.x === cadeia[0].x && p.y === cadeia[0].y,
    [cadeia],
  );

  /**
   * Onde, ao longo do eixo da parede, cai o cursor — em mm a partir de `a`.
   *
   * A LARGURA VEM POR PARÂMETRO, e isso não é detalhe: ela era lida de
   * `larguraAberturaMm`, que é a largura do seletor da BARRA — a da próxima
   * abertura a inserir. Arrastar uma porta de 700 com a barra em 2000 grampearia
   * o movimento pela largura errada, e a porta pararia longe da ponta da parede
   * sem explicação na tela.
   *
   * O resultado ja vem preso dentro dos limites uteis para uma abertura dessa
   * largura: e o kernel que recusaria, e recusar depois do clique seria pior do
   * que nao deixar errar.
   */
  const offsetNaParede = useCallback(
    (w: Wall, mundo: { x: number; y: number }, larguraMm: number): number => {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const comp2 = dx * dx + dy * dy;
      if (comp2 === 0) return 0;
      const t = ((mundo.x - w.a.x) * dx + (mundo.y - w.a.y) * dy) / comp2;
      const comp = wallLength(w);
      const centro = t * comp;
      const bruto = centro - larguraMm / 2;
      return Math.round(Math.max(0, Math.min(comp - larguraMm, bruto)));
    },
    [],
  );

  /** Distância do cursor ao longo do eixo, em mm a partir de `a`. Sem grampo. */
  const distanciaNoEixo = useCallback((w: Wall, mundo: { x: number; y: number }): number => {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const comp2 = dx * dx + dy * dy;
    if (comp2 === 0) return 0;
    const t = ((mundo.x - w.a.x) * dx + (mundo.y - w.a.y) * dy) / comp2;
    return t * wallLength(w);
  }, []);

  /**
   * Qual abertura daquela parede está SOB o cursor.
   *
   * Teste preciso: o cursor caiu dentro do vão, entre `offsetMm` e
   * `offsetMm + widthMm`. O teste antigo comparava a distância até o começo do
   * vão com a maior das duas larguras (a da abertura e a do seletor da barra), e
   * acertava a quase um metro de distância. Isso passava para SELECIONAR, mas
   * não serve para decidir "o usuário pegou ESTA porta para arrastar" — com ele,
   * apertar na parede ao lado da porta empurraria a porta.
   */
  const aberturaSob = useCallback(
    (w: Wall, mundo: { x: number; y: number }): Opening | null => {
      const d = distanciaNoEixo(w, mundo);
      return (
        model.openings.find(
          (o) => o.wallId === w.id && d >= o.offsetMm && d <= o.offsetMm + o.widthMm,
        ) ?? null
      );
    },
    [model.openings, distanciaNoEixo],
  );

  const paredeSob = useCallback(
    (mundo: { x: number; y: number }): Wall | null => {
      const limite = HIT_PX / vista.escala;
      for (const w of paredesDoNivel) {
        const dx = w.b.x - w.a.x;
        const dy = w.b.y - w.a.y;
        const comp2 = dx * dx + dy * dy;
        if (comp2 === 0) continue;
        let t = ((mundo.x - w.a.x) * dx + (mundo.y - w.a.y) * dy) / comp2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(w.a.x + t * dx - mundo.x, w.a.y + t * dy - mundo.y);
        if (d < limite + espessuraMm / 2) return w;
      }
      return null;
    },
    [paredesDoNivel, vista.escala, espessuraMm],
  );

  /**
   * Qual LIMITE está sob o cursor.
   *
   * Sem meia espessura na conta, ao contrário de `paredeSob`: limite não tem
   * corpo — é uma linha. A tolerância é só a folga de clique.
   */
  const limiteSob = useCallback(
    (mundo: { x: number; y: number }): Boundary | null => {
      const limite = HIT_PX / vista.escala;
      for (const b of limitesDoNivel) {
        if (distanciaAoSegmento(b.a, b.b, mundo) <= limite) return b;
      }
      return null;
    },
    [limitesDoNivel, vista.escala],
  );

  /**
   * Qual forma MEDIDA está sob o cursor.
   *
   * Existia a prop para avisar da seleção e não existia o teste que a dispara —
   * medição só era selecionável pela lista lateral. Sem isto, uma medição não
   * pode ser pega para arrastar, e "selecionar parte e mover" deixaria de fora
   * justamente a camada que fica por cima da planta de fundo.
   */
  const medicaoSob = useCallback(
    (mundo: { x: number; y: number }): FormaMedida | null => {
      const limite = HIT_PX / vista.escala;
      for (const f of medicoes) {
        if (f.pontos.length === 0) continue;
        if (f.tipo === 'PONTO') {
          if (f.pontos.some((p) => Math.hypot(p.x - mundo.x, p.y - mundo.y) <= limite)) return f;
          continue;
        }
        // Dentro do polígono conta: é uma área, e clicar no meio dela é o gesto
        // natural. A borda entra pelo teste de distância logo abaixo.
        if (f.tipo === 'POLIGONO' && pointInPolygon(f.pontos, arredondar(mundo))) return f;
        for (let i = 0; i + 1 < f.pontos.length; i++) {
          if (distanciaAoSegmento(f.pontos[i], f.pontos[i + 1], mundo) <= limite) return f;
        }
        if (f.tipo === 'POLIGONO' && f.pontos.length > 2) {
          const ultimo = f.pontos[f.pontos.length - 1];
          if (distanciaAoSegmento(ultimo, f.pontos[0], mundo) <= limite) return f;
        }
      }
      return null;
    },
    [medicoes, vista.escala],
  );

  /**
   * O que o laço pegou.
   *
   * A parede é testada pelo CORPO, não pelo eixo: parede grossa raspando a borda
   * do retângulo se comportaria de um jeito que ninguém consegue explicar
   * olhando para a tela. `cantosDaParede` é a mesma função que o desenho usa,
   * então o que se vê e o que o laço pega são a mesma figura.
   */
  const idsNoLaco = useCallback(
    (origem: Point, atual: Point): string[] => {
      const ret = retanguloPorCantos(origem, atual);
      if (ret.length === 0) return [];
      // Esquerda → direita: só o que está INTEIRO dentro. Direita → esquerda:
      // tudo que TOCA. É a convenção do AutoCAD, e o rótulo na tela a anuncia.
      const soDentro = atual.x >= origem.x;
      const pegos: string[] = [];

      for (const w of paredesDoNivel) {
        const corpo = cantosDaParede(w.a, w.b, w.thicknessMm);
        if (corpo.length === 0) continue;
        if (soDentro ? anelDentroDe(corpo, ret) : anelToca(corpo, ret, true)) pegos.push(w.id);
      }

      // Limite é uma linha sem corpo: o "anel" dele são as duas pontas.
      for (const b of limitesDoNivel) {
        const seg = [b.a, b.b];
        if (soDentro ? anelDentroDe(seg, ret) : anelToca(seg, ret, false)) pegos.push(b.id);
      }

      for (const f of medicoes) {
        if (f.pontos.length === 0) continue;
        const fechado = f.tipo === 'POLIGONO';
        const dentro = f.pontos.every((p) => pointInPolygon(ret, p));
        if (soDentro ? dentro : anelToca(f.pontos, ret, fechado)) pegos.push(f.id);
      }

      return pegos;
    },
    [paredesDoNivel, limitesDoNivel, medicoes],
  );

  // ── Tamanho ───────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Com Y para cima, a origem do modelo tem de nascer PERTO DO RODAPÉ da
    // área de desenho — é a convenção de CAD, e é o que mantém visível tanto o
    // que já foi desenhado (que vive em Y positivo) quanto o que se desenha
    // agora. Deixar a origem no topo daria uma faixa de 60 px de área útil e o
    // resto da planta acima da borda, invisível sem arrastar.
    const medir = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setTamanho({ w, h });
      if (!enquadrado.current && h > 0) {
        enquadrado.current = true;
        setVista((v) => ({ ...v, dy: h - MARGEM_INICIAL_PX }));
      }
    };

    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    return () => ro.disconnect();
  }, []);

  // ── Desenho ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // devicePixelRatio: sem isso a planta fica borrada em tela de alta densidade.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = tamanho.w * dpr;
    canvas.height = tamanho.h * dpr;
    canvas.style.width = `${tamanho.w}px`;
    canvas.style.height = `${tamanho.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, tamanho.w, tamanho.h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tamanho.w, tamanho.h);

    // ── Planta de fundo ──────────────────────────────────────────────────────
    //
    // ANTES de tudo, inclusive da grade. Geometria nunca pode ficar atrás da
    // imagem: o que se está desenhando sumiria sob o que se está copiando.
    //
    // A matriz sai da composição de duas transformações que já existem —
    // pixel da imagem → milímetro do modelo (a aferição) e milímetro → tela (a
    // vista). Compor evita reimplementar escala e deslocamento aqui, que é como
    // o fundo e o desenho saem de sincronia ao dar zoom.
    if (fundo) {
      // Os vetores da matriz saem de três pontos: onde cai a origem da imagem e
      // para onde apontam um pixel em x e um em y. Compor assim, em vez de
      // reconstruir escala e deslocamento à mão, é o que mantém o fundo colado
      // no desenho ao dar zoom — reimplementar a conta aqui é como os dois saem
      // de sincronia.
      const o = paraTela(pixelParaModelo(fundo.underlay, { px: 0, py: 0 }));
      const ex = paraTela(pixelParaModelo(fundo.underlay, { px: 1, py: 0 }));
      const ey = paraTela(pixelParaModelo(fundo.underlay, { px: 0, py: 1 }));

      ctx.save();
      ctx.globalAlpha = fundo.opacidade;
      ctx.setTransform(
        (ex.x - o.x) * dpr,
        (ex.y - o.y) * dpr,
        (ey.x - o.x) * dpr,
        (ey.y - o.y) * dpr,
        o.x * dpr,
        o.y * dpr,
      );
      ctx.drawImage(fundo.imagem, 0, 0);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Grade. Duas granularidades: fina no passo em vigor, forte a cada 5 —
    // a forte dá a referência de leitura sem que a fina precise ser densa.
    //
    // Sem `if` que possa pular o bloco inteiro: no modo automático o passo já é
    // escolhido para caber na tela, e no modo fixo a densidade é escolha do
    // usuário. Era o antigo `if (passoTela > 4)` que fazia a grade evaporar no
    // zoom out — o pior tipo de sumiço, porque parece que a tela quebrou.
    const passoTela = passoEfetivo * vista.escala;
    const desenhar = passoTela >= 3;

    if (desenhar) {
      const x0 = Math.floor(-vista.dx / passoTela);
      const y0 = Math.floor(-vista.dy / passoTela);
      const nx = Math.ceil(tamanho.w / passoTela) + 1;
      const ny = Math.ceil(tamanho.h / passoTela) + 1;
      // Com a grade muito fina, só as linhas fortes — senão vira mancha cinza.
      const soFortes = passoTela < 6;

      ctx.lineWidth = 1;
      for (let i = 0; i <= nx; i++) {
        const indice = x0 + i;
        const forte = indice % 5 === 0;
        if (soFortes && !forte) continue;
        ctx.strokeStyle = forte ? COR_GRADE_FORTE : COR_GRADE;
        const gx = Math.round(indice * passoTela + vista.dx) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, tamanho.h);
        ctx.stroke();
      }
      for (let i = 0; i <= ny; i++) {
        const indice = y0 + i;
        const forte = indice % 5 === 0;
        if (soFortes && !forte) continue;
        ctx.strokeStyle = forte ? COR_GRADE_FORTE : COR_GRADE;
        const gy = Math.round(indice * passoTela + vista.dy) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(tamanho.w, gy);
        ctx.stroke();
      }
    }

    // Ambientes derivados — pintados antes das paredes para ficarem por baixo.
    ctx.fillStyle = COR_AMBIENTE;
    for (const s of ambientesDoNivel) {
      if (s.ring.length < 3) continue;
      ctx.beginPath();
      const p0 = paraTela(s.ring[0]);
      ctx.moveTo(p0.x, p0.y);
      for (const p of s.ring.slice(1)) {
        const t = paraTela(p);
        ctx.lineTo(t.x, t.y);
      }
      ctx.closePath();
      for (const buraco of s.holes) {
        if (buraco.length < 3) continue;
        const h0 = paraTela(buraco[0]);
        ctx.moveTo(h0.x, h0.y);
        // Sentido inverso: é o que faz o `evenodd` recortar em vez de preencher.
        for (const p of [...buraco].slice(1).reverse()) {
          const t = paraTela(p);
          ctx.lineTo(t.x, t.y);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    // Paredes — desenhadas VAZADAS, na convencao de planta arquitetonica: duas
    // linhas paralelas com o miolo vazio, e nao um traco cheio.
    //
    // Feito em duas passadas em vez de calcular a uniao booleana dos corpos:
    //
    //   1. traco GROSSO na espessura da parede -> silhueta cheia. Nas junçoes as
    //      pinceladas se sobrepoem e a uniao sai de graca, sem geometria nenhuma.
    //   2. traco BRANCO mais fino por cima -> escava o miolo, deixando so a borda.
    //
    // O miolo escavado tambem se une nas junçoes, entao o interior fica continuo
    // de um comodo para o outro — que e exatamente o que a planta de referencia
    // mostra, sem linha cruzando dentro do encontro de paredes.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';


    // O AVANÇO DA PONTA vive no KERNEL, não aqui.
    //
    // Ele tinha uma cópia neste arquivo e outra na exportação, as duas com a
    // mesma conta — meia espessura sempre — que só fecha o canto em 90°. Num
    // hexágono a pincelada ultrapassava o canto e sobrava farpa em cada
    // vértice. A conta certa e o porquê estão em `extensaoDeCanto`.

    // Geometria de desenho de cada parede.
    //
    // O detalhe que faz o canto funcionar: ESTENDER a pincelada em meia espessura
    // nas pontas que encontram outra parede. Com corte reto terminando no eixo,
    // sobra um quadrado vazio de meia espessura no canto externo — era o degrau
    // que aparecia em cada esquina. Estendendo, as pinceladas das duas paredes
    // cobrem esse quadrado exatamente, e o canto sai VIVO, não arredondado.
    //
    // Na ponta LIVRE não se estende: a parede ficaria meia espessura mais longa
    // do que é.
    const traco = paredesDoNivel.map((w) => {
      const a = paraTela(w.a);
      const b = paraTela(w.b);
      const comp = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = comp > 0 ? (b.x - a.x) / comp : 0;
      const uy = comp > 0 ? (b.y - a.y) / comp : 0;
      const cheia = Math.max(1, w.thicknessMm * vista.escala);
      const meia = cheia / 2;
      return {
        w,
        a,
        b,
        ux,
        uy,
        comp,
        cheia,
        // Em MILÍMETRO no kernel, em PIXEL aqui: a pincelada é desenhada em
        // tela. Em 90° isto dá exatamente `meia`, como antes.
        extA: extensaoDeCanto(paredesDoNivel, w, 'a') * vista.escala,
        extB: extensaoDeCanto(paredesDoNivel, w, 'b') * vista.escala,
      };
    });

    // Passada 1 — silhueta
    for (const t of traco) {
      if (t.comp < 0.5) continue;
      ctx.strokeStyle = selecao.has(t.w.id) ? COR_SELECIONADA : COR_PAREDE;
      ctx.lineWidth = t.cheia;
      ctx.beginPath();
      ctx.moveTo(t.a.x - t.ux * t.extA, t.a.y - t.uy * t.extA);
      ctx.lineTo(t.b.x + t.ux * t.extB, t.b.y + t.uy * t.extB);
      ctx.stroke();
    }

    // Passada 2 — escavar o miolo, com a MESMA extensão nas junções para que o
    // interior de um cômodo continue no outro sem linha atravessando o encontro.
    ctx.strokeStyle = '#ffffff';
    for (const t of traco) {
      const miolo = t.cheia - 2 * LINHA_PAREDE_PX;
      // Muito longe, a parede vira uma linha e não há miolo para escavar. Deixar
      // sólida é o certo: contorno de meio pixel viraria sujeira cinza.
      if (miolo < 1 || t.comp < 0.5) continue;

      // O miolo avança MENOS que a silhueta — exatamente uma espessura de linha.
      //
      // Era daqui que vinha o canto aberto: estendendo o branco tanto quanto o
      // escuro, a escavação de uma parede alcançava a borda EXTERNA da outra e
      // apagava a linha dela. A silhueta estava certa o tempo todo; o branco é
      // que comia o contorno do vizinho.
      //
      // A mesma conta serve para a ponta livre, onde `ext` é 0 e o resultado fica
      // negativo — ou seja, recua e deixa borda fechando a extremidade.
      const recA = t.extA - LINHA_PAREDE_PX;
      const recB = t.extB - LINHA_PAREDE_PX;
      if (t.comp + recA + recB <= 0) continue;

      ctx.lineWidth = miolo;
      ctx.beginPath();
      ctx.moveTo(t.a.x - t.ux * recA, t.a.y - t.uy * recA);
      ctx.lineTo(t.b.x + t.ux * recB, t.b.y + t.uy * recB);
      ctx.stroke();
    }

    // Aberturas — desenhadas DEPOIS das paredes, em tres etapas:
    //   1. vao: branco atravessando a espessura inteira, abrindo o buraco;
    //   2. batentes: as duas linhas que fecham a parede nas laterais do vao;
    //   3. simbolo: arco de giro na porta, folha fina na janela.
    //
    // Sem os batentes o vao ficaria com as bordas da parede correndo soltas por
    // dentro dele, que e o erro classico de quem so apaga o trecho.
    const paredePorId = new Map(paredesDoNivel.map((w) => [w.id, w]));

    for (const o of model.openings) {
      const w = paredePorId.get(o.wallId);
      if (!w) continue;

      const comp = wallLength(w);
      if (comp <= 0) continue;
      const ux = (w.b.x - w.a.x) / comp;
      const uy = (w.b.y - w.a.y) / comp;
      // Normal do eixo, para atravessar a espessura.
      const nx = -uy;
      const ny = ux;
      const meia = w.thicknessMm / 2;

      // ARRASTE: a própria abertura é desenhada no offset novo, em vez de um
      // fantasma ao lado dela. Assim vão, batentes e arco de giro acompanham o
      // gesto inteiro — e o que se vê durante o arraste é exatamente o que fica
      // ao soltar. O modelo só muda no `pointerup`.
      const offsetMm =
        movendoAbertura?.openingId === o.id ? movendoAbertura.offsetMm : o.offsetMm;

      const ini = { x: w.a.x + ux * offsetMm, y: w.a.y + uy * offsetMm };
      const fim = {
        x: w.a.x + ux * (offsetMm + o.widthMm),
        y: w.a.y + uy * (offsetMm + o.widthMm),
      };

      const t1 = paraTela({ x: ini.x + nx * meia, y: ini.y + ny * meia } as Point);
      const t2 = paraTela({ x: ini.x - nx * meia, y: ini.y - ny * meia } as Point);
      const t3 = paraTela({ x: fim.x - nx * meia, y: fim.y - ny * meia } as Point);
      const t4 = paraTela({ x: fim.x + nx * meia, y: fim.y + ny * meia } as Point);

      // 1. abrir o vao
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.lineTo(t4.x, t4.y);
      ctx.closePath();
      ctx.fill();

      // 2. batentes
      ctx.strokeStyle = selecao.has(o.id) ? COR_SELECIONADA : COR_PAREDE;
      ctx.lineWidth = LINHA_PAREDE_PX;
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.moveTo(t3.x, t3.y);
      ctx.lineTo(t4.x, t4.y);
      ctx.stroke();

      const larguraTela = Math.hypot(t4.x - t1.x, t4.y - t1.y);
      if (larguraTela < 4) continue;

      // 3. simbolo
      if (o.kind === 'passage') {
        // VÃO LIVRE não tem símbolo: é o buraco na parede, e os batentes que a
        // etapa 2 já desenhou são tudo que existe para mostrar. Desenhar folha
        // ou arco aqui afirmaria uma esquadria que ninguém vai comprar.
      } else if (o.kind === 'window') {
        // Janela: folha fina no eixo da parede.
        const e1 = paraTela(ini as Point);
        const e2 = paraTela(fim as Point);
        ctx.beginPath();
        ctx.moveTo(e1.x, e1.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.stroke();
      } else {
        // Porta: folha aberta a 90 graus mais o arco de giro, como em planta.
        //
        // DOIS EIXOS INDEPENDENTES — `hingeAtStart` (girar) e `swingReversed`
        // (espelhar) — ver o comentário de `Opening` em `model.ts`. Cada um
        // troca o SINAL de um dos dois vetores a partir do pivô:
        //
        //   eixoRef  aponta da dobradiça para a OUTRA ponta do vão (onde a
        //            folha fica quando fechada, encostada na parede);
        //   folha    aponta da dobradiça para DENTRO do cômodo em que abre.
        //
        // O pivô em si também muda: com a dobradiça na ponta final, ele nasce
        // em `fim`, não em `ini`.
        const pivMm = o.hingeAtStart
          ? { x: ini.x + nx * meia * (o.swingReversed ? -1 : 1), y: ini.y + ny * meia * (o.swingReversed ? -1 : 1) }
          : { x: fim.x + nx * meia * (o.swingReversed ? -1 : 1), y: fim.y + ny * meia * (o.swingReversed ? -1 : 1) };
        const piv = paraTela(pivMm as Point);
        const raio = larguraTela;

        const eixoRefX = o.hingeAtStart ? ux : -ux;
        const eixoRefY = o.hingeAtStart ? uy : -uy;
        const folhaX = o.swingReversed ? -nx : nx;
        const folhaY = o.swingReversed ? -ny : ny;

        // Os ângulos são de TELA, e os vetores acima são de modelo: o Y entra
        // negado, como em `paraTela`.
        const angEixo = Math.atan2(-eixoRefY, eixoRefX);
        const angFolha = Math.atan2(-folhaY, folhaX);

        ctx.beginPath();
        ctx.moveTo(piv.x, piv.y);
        ctx.lineTo(piv.x + Math.cos(angFolha) * raio, piv.y + Math.sin(angFolha) * raio);
        ctx.stroke();

        // `eixoRef` e `folha` são sempre perpendiculares entre si (um é a
        // rotação de 90° do outro, com sinais próprios), então o arco entre os
        // dois é sempre um quarto de círculo — falta só escolher o SENTIDO
        // certo, o da volta curta. Invertendo QUALQUER um dos dois vetores
        // sozinho, a volta curta troca de sentido; invertendo os DOIS ao mesmo
        // tempo, ela volta a ser a de antes — por isso o teste é um XOR dos
        // dois flags, não a soma de cada um isolado.
        const antiHorario = o.hingeAtStart !== o.swingReversed;
        ctx.beginPath();
        ctx.arc(piv.x, piv.y, raio, angEixo, angFolha, antiHorario);
        ctx.stroke();
      }

      // Durante o arraste, a distância até o início da parede — é o número que
      // decide onde soltar, e conferi-lo só depois de soltar seria tarde. Mesma
      // razão do comprimento em tempo real no arraste de ponta de parede.
      if (movendoAbertura?.openingId === o.id) {
        // `rotuloDoTraco`, e não uma conta própria: ele afasta PERPENDICULAR ao
        // vão. Deslocar "para cima" na tela funcionaria só em parede
        // horizontal — numa parede vertical o número cairia em cima dela.
        rotuloDoTraco(
          ctx,
          `${(offsetMm / 1000).toFixed(2).replace('.', ',')} m`,
          paraTela(ini as Point),
          paraTela(fim as Point),
          Math.max(w.thicknessMm * vista.escala, 2),
          COR_SELECIONADA,
        );
      }
    }

    // Medidas das paredes — opcional, ligado pelo botão "Medidas" da barra.
    //
    // Reaproveita o MESMO `traco` da silhueta: os pontos em tela já saem
    // corretos para qualquer zoom/deslocamento, e a espessura em pixel
    // (`t.cheia`) é o que `rotuloDoTraco` usa para afastar o número de cima da
    // faixa da parede — o defeito que motivou `rotuloDoTraco` para começo de
    // conversa (a cota caindo por cima da própria parede em zoom out).
    //
    // Cota de EIXO, não de face: é o que o kernel guarda e o que o campo
    // "Comprimento" do painel de propriedades já mostra. Cotar a face exigiria
    // descontar espessura aqui E lá, e as duas cópias divergem cedo ou tarde.
    if (mostrarMedidasParedes) {
      for (const t of traco) {
        if (t.comp < MIN_PX_COTA_PAREDE) continue;
        const mm = wallLength(t.w);
        rotuloDoTraco(
          ctx,
          `${(mm / 1000).toFixed(2).replace('.', ',')} m`,
          t.a,
          t.b,
          t.cheia,
          COR_COTA,
        );
      }
    }

    // ── LIMITES (divisas de terreno) ─────────────────────────────────────────
    //
    // Traço fino TRACEJADO, nunca a faixa cheia da parede. A distinção não é
    // estética: limite não tem material, não entra no orçamento e não se
    // constrói. Desenhá-lo com a mesma gramática da parede faria alguém cotar
    // alvenaria em cima de uma divisa jurídica.
    //
    // O anel do TERRENO ganha preenchimento fraco — é a única figura da tela
    // cuja ÁREA é o produto, e vê-la preenchida é o que diz "este é o lote".
    if (limitesDoNivel.length > 0) {
      // Durante o traçado quem preenche é a PRÉVIA, que já mostra o lote com o
      // lado em curso. Preencher os dois empilha alpha sobre alpha e produz uma
      // cunha mais escura que não significa nada.
      const tracandoTerreno = tool === 'terreno' && cadeia.length > 0;
      const anel = tracandoTerreno ? [] : anelDoTerreno(limitesDoNivel);
      if (anel.length >= 3) {
        ctx.fillStyle = COR_TERRENO_FUNDO;
        ctx.beginPath();
        const t0 = paraTela(anel[0]);
        ctx.moveTo(t0.x, t0.y);
        for (const p of anel.slice(1)) {
          const t = paraTela(p);
          ctx.lineTo(t.x, t.y);
        }
        ctx.closePath();
        ctx.fill();
      }

      for (const b of limitesDoNivel) {
        const a = paraTela(b.a);
        const z = paraTela(b.b);
        const selecionado = selecao.has(b.id);
        ctx.strokeStyle = selecionado
          ? COR_SELECIONADA
          : b.kind === 'TERRENO'
            ? COR_TERRENO
            : COR_COTA;
        ctx.lineWidth = selecionado ? 2.5 : 1.5;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(z.x, z.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cota de cada divisa, no MESMO botão "Medidas" das paredes. É a medida
        // que se confere contra o memorial descritivo, e ela não pode depender
        // de outro controle que ninguém liga.
        const compPx = Math.hypot(z.x - a.x, z.y - a.y);
        if (mostrarMedidasParedes && compPx >= MIN_PX_COTA_PAREDE) {
          const mm = Math.round(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y));
          rotuloDoTraco(
            ctx,
            `${(mm / 1000).toFixed(2).replace('.', ',')} m`,
            a,
            z,
            2,
            selecionado ? COR_SELECIONADA : COR_TERRENO,
          );
        }
      }

      // Alças da divisa selecionada, pela mesma convenção da parede: só na que
      // está SOZINHA na seleção, e desenhadas — ponta arrastável sem marca é
      // ação que ninguém encontra.
      const limiteParaAlca = limitesDoNivel.find((b) => b.id === unicoSelecionado);
      if (limiteParaAlca && !movendoLimite && !movendoSelecao) {
        for (const extremo of [limiteParaAlca.a, limiteParaAlca.b]) {
          const t = paraTela(extremo);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = COR_SELECIONADA;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(t.x - 4, t.y - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // ── Envelope construtivo ─────────────────────────────────────────────────
    //
    // Hachurado, e não preenchido cheio: é uma RESTRIÇÃO, não uma construção.
    // Preenchido sólido, ele competiria visualmente com os ambientes derivados e
    // alguém acabaria lendo "o que pode ser construído" como "o que foi".
    if (envelope.length >= 3) {
      const pts = envelope.map(paraTela);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
      ctx.closePath();
      ctx.clip();

      // Hachura a 45°, varrendo a área de desenho inteira e recortada pelo anel.
      ctx.strokeStyle = COR_ENVELOPE;
      ctx.lineWidth = 1;
      const passo = 14;
      for (let d = -tamanho.h; d < tamanho.w + tamanho.h; d += passo) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + tamanho.h, tamanho.h);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = COR_ENVELOPE;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Prévia do arraste de ponta de LIMITE.
    if (movendoLimite && destinoPonta) {
      const b = limitesDoNivel.find((x) => x.id === movendoLimite.boundaryId);
      if (b) {
        const fixa = paraTela(movendoLimite.end === 'a' ? b.b : b.a);
        const solta = paraTela(destinoPonta);
        const ancora = movendoLimite.end === 'a' ? b.b : b.a;

        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(fixa.x, fixa.y);
        ctx.lineTo(solta.x, solta.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const comp = Math.hypot(destinoPonta.x - ancora.x, destinoPonta.y - ancora.y);
        rotuloDoTraco(
          ctx,
          `${(comp / 1000).toFixed(2).replace('.', ',')} m`,
          fixa,
          solta,
          2,
          COR_SELECIONADA,
        );
      }
    }

    // Prévia da forma fechada em curso — a faixa de cada lado, já no eixo
    // mitrado, e a medida que interessa a cada ferramenta.
    if (ancoraDaForma && verticesPoligono.length >= 3) {
      const eixos = eixosDoPoligono(verticesPoligono);
      const espessuraPx = Math.max(1.5, espessuraMm * vista.escala);

      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = espessuraPx;
      ctx.setLineDash([6, 4]);
      for (const e of eixos) {
        const a = paraTela(e.a);
        const b = paraTela(e.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const medida = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
      const lado = (i: number, j: number) =>
        Math.round(
          Math.hypot(
            verticesPoligono[j].x - verticesPoligono[i].x,
            verticesPoligono[j].y - verticesPoligono[i].y,
          ),
        );

      if (tool === 'retangulo') {
        // AS DUAS MEDIDAS, uma em cada lado: é assim que se confere um cômodo
        // contra a planta, e uma só não diria nada sobre a outra.
        rotuloDoTraco(
          ctx,
          `${medida(lado(0, 1))} m`,
          paraTela(verticesPoligono[0]),
          paraTela(verticesPoligono[1]),
          espessuraPx,
          COR_PREVIA,
        );
        rotuloDoTraco(
          ctx,
          `${medida(lado(1, 2))} m`,
          paraTela(verticesPoligono[1]),
          paraTela(verticesPoligono[2]),
          espessuraPx,
          COR_PREVIA,
        );
      } else {
        // O raio pontilhado explica o gesto do polígono: sem ele, a forma
        // parece nascer do nada.
        const c = paraTela(ancoraDaForma);
        const v = paraTela(verticesPoligono[0]);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // O LADO, não o raio: é a medida que a planta cota e que se confere
        // contra o projeto. O raio é meio de construção, não dimensão de obra.
        rotuloDoTraco(
          ctx,
          `${ladosPoligono} lados · ${medida(lado(0, 1))} m`,
          paraTela(verticesPoligono[0]),
          paraTela(verticesPoligono[1]),
          espessuraPx,
          COR_PREVIA,
        );
      }
    }

    // Prévia do contorno de TERRENO / DIVISA em curso.
    //
    // A diferença entre as duas ferramentas vive AQUI e em nenhum outro lugar:
    // o terreno mostra o lado de fechamento e a área se formando, para a pessoa
    // ver o lote nascer; a divisa mostra só o lado em curso, porque ela é um
    // traçado aberto e desenhar um fechamento prometeria algo que não vai
    // acontecer.
    if ((tool === 'terreno' || tool === 'divisa') && inicio && cursor) {
      const pontos = [...cadeia, cursor];
      const emTela = pontos.map(paraTela);

      if (tool === 'terreno' && pontos.length >= 3) {
        ctx.fillStyle = COR_TERRENO_FUNDO;
        ctx.beginPath();
        ctx.moveTo(emTela[0].x, emTela[0].y);
        for (const t of emTela.slice(1)) ctx.lineTo(t.x, t.y);
        ctx.closePath();
        ctx.fill();
      }

      // SÓ o que ainda não existe: o lado em curso e, no terreno, o de
      // fechamento. Redesenhar a cadeia inteira sobrepõe tracejado a tracejado
      // em fases diferentes, e o resultado na tela é uma linha CHEIA — os lados
      // já criados pareceriam de outro tipo, bem no meio do gesto.
      const emCurso: { de: Point; para: Point }[] = [{ de: inicio, para: cursor }];
      if (tool === 'terreno' && pontos.length >= 3) {
        emCurso.push({ de: cursor, para: cadeia[0] });
      }

      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      for (const lado of emCurso) {
        const a = paraTela(lado.de);
        const b = paraTela(lado.para);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // A cota do lado em curso, em tempo real: é a medida que se confere contra
      // o memorial, e conferi-la depois de clicar seria tarde.
      const mm = Math.round(Math.hypot(cursor.x - inicio.x, cursor.y - inicio.y));
      if (mm > 0) {
        rotuloDoTraco(
          ctx,
          `${(mm / 1000).toFixed(2).replace('.', ',')} m`,
          paraTela(inicio),
          paraTela(cursor),
          2,
          COR_PREVIA,
        );
      }

      // O primeiro vértice fica marcado: é onde se clica para FECHAR.
      if (cadeia.length >= 2) {
        const zero = paraTela(cadeia[0]);
        ctx.strokeStyle = COR_PREVIA;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(zero.x, zero.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Prévia da parede em curso.
    //
    // A faixa é desenhada sobre o EIXO RESOLVIDO, não sobre o traçado: no
    // alinhamento por face, mostrar a faixa em cima da linha clicada faria a
    // parede "pular" meia espessura ao soltar o clique — e prévia que não bate
    // com o resultado é prévia em que ninguém confia. A linha fina contínua marca
    // o traçado em si, para o canto clicado continuar visível sob a faixa.
    if (tool === 'parede' && inicio && cursor) {
      const eixoPrevia = eixoDaParede({ a: inicio, b: cursor }, espessuraMm, alinhamento, {
        antes: mesmoLado ? antesDoInicio : null,
        depois: fechandoContorno(cursor) && trechos[0]?.lado === alinhamento ? cadeia[1] : null,
      });
      const a = paraTela(eixoPrevia.a);
      const b = paraTela(eixoPrevia.b);
      const espessuraPx = Math.max(1.5, espessuraMm * vista.escala);

      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = espessuraPx;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const ta = paraTela(inicio);
      const tb = paraTela(cursor);
      if (alinhamento !== 'EIXO') {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ta.x, ta.y);
        ctx.lineTo(tb.x, tb.y);
        ctx.stroke();
      }

      // A medida é a do TRAÇADO, não a do eixo. É a distância entre os dois
      // pontos clicados, que é a cota que se está conferindo contra a planta de
      // fundo; o eixo mitrado é mais curto ou mais longo por causa do canto.
      // Nada de "0,00 m": entre o clique e o primeiro movimento do mouse o cursor
      // ainda está sobre o ponto de partida, e um rótulo zerado no meio do desenho
      // só polui.
      const comprimento = Math.round(Math.hypot(cursor.x - inicio.x, cursor.y - inicio.y));
      if (comprimento > 0) {
        rotuloDoTraco(
          ctx,
          `${(comprimento / 1000).toFixed(2)} m`,
          ta,
          tb,
          espessuraPx,
          COR_PREVIA,
        );
      }
    }

    // ── Formas MEDIDAS ───────────────────────────────────────────────────────
    //
    // Desenhadas com traço TRACEJADO e preenchimento fraco, para não se
    // confundirem com a geometria derivada. A distinção não é estética: uma é
    // recalculável e a outra é a afirmação de uma pessoa, e quem olha a tela
    // precisa saber qual está vendo.
    for (const f of medicoesDoNivel) {
      const pts = f.pontos.map(paraTela);
      if (pts.length === 0) continue;

      const selecionada = selecao.has(f.id) || f.id === medicaoSelecionada;
      ctx.strokeStyle = f.cor;
      ctx.lineWidth = selecionada ? 2.5 : 1.5;
      ctx.setLineDash([6, 4]);

      if (f.tipo === 'PONTO') {
        for (const t of pts) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, selecionada ? 7 : 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
        if (f.tipo === 'POLIGONO') {
          ctx.closePath();
          ctx.fillStyle = `${f.cor}22`;
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // O valor medido, no próprio desenho: conferir na lista lateral obriga a
      // procurar qual forma é qual.
      const m = medir(f);
      const cx = pts.reduce((soma, t) => soma + t.x, 0) / pts.length;
      const cy = pts.reduce((soma, t) => soma + t.y, 0) / pts.length;
      const rotulo =
        DIMENSAO_POR_TIPO[f.tipo] === 'UN'
          ? `${m.valor} un`
          : `${m.valor.toFixed(2).replace('.', ',')} ${DIMENSAO_POR_TIPO[f.tipo] === 'M2' ? 'm²' : 'm'}`;
      escreverRotulo(
        ctx,
        f.nome ? `${f.nome}: ${rotulo}` : rotulo,
        cx,
        cy,
        f.cor,
        selecionada ? 12 : 11,
      );
    }

    // Forma medida em curso.
    if (medindo.length > 0) {
      const pts = medindo.map(paraTela);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
      if (cursor) {
        const c = paraTela(cursor);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // O primeiro vértice fica marcado: é onde se clica para FECHAR.
      ctx.fillStyle = COR_ALERTA;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Alças da parede selecionada.
    //
    // Desenhá-las é o que torna o arraste DESCOBRÍVEL. Uma ponta arrastável sem
    // marca na tela é a mesma classe de defeito de um botão que não funciona: a
    // ação existe e ninguém encontra.
    // Só na parede que está SOZINHA na seleção: com um bloco selecionado, a
    // alça de uma ponta seria uma segunda ação disputando o mesmo pixel do
    // arraste do conjunto.
    const selecionadaParaAlca = paredesDoNivel.find((w) => w.id === unicoSelecionado);
    if (selecionadaParaAlca && !movendo && !movendoSelecao) {
      for (const extremo of [selecionadaParaAlca.a, selecionadaParaAlca.b]) {
        const t = paraTela(extremo);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(t.x - 4, t.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Prévia do arraste: a parede como ficaria se soltasse agora.
    if (movendo && destinoPonta) {
      const w = paredePorId.get(movendo.wallId);
      if (w) {
        const fixa = paraTela(movendo.end === 'a' ? w.b : w.a);
        const solta = paraTela(destinoPonta);
        const espessuraPx = Math.max(1, w.thicknessMm * vista.escala);

        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = espessuraPx;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(fixa.x, fixa.y);
        ctx.lineTo(solta.x, solta.y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Comprimento em tempo real: é a informação que decide o arraste, e
        // conferi-la depois de soltar seria tarde.
        const comp = Math.hypot(destinoPonta.x - (movendo.end === 'a' ? w.b.x : w.a.x),
                                destinoPonta.y - (movendo.end === 'a' ? w.b.y : w.a.y));
        rotuloDoTraco(
          ctx,
          `${(comp / 1000).toFixed(2)} m`,
          fixa,
          solta,
          espessuraPx,
          COR_SELECIONADA,
        );

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(solta.x - 4, solta.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Linha de aferição em curso.
    if (tool === 'calibrar' && calibP1) {
      const a = paraTela(calibP1);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (cursor) {
        const b = paraTela(cursor);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COR_ALERTA;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pontas soltas e vãos candidatos.
    //
    // Desenhados por último, por cima de tudo: são o que impede o ambiente de
    // aparecer, e o usuário precisa achá-los sem procurar. Uma ponta solta de
    // 3 mm é invisível na planta e explica sozinha por que a área não saiu.
    if (pontasSoltas.length > 0) {
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 1.5;
      for (const p of pontasSoltas) {
        const t = paraTela(p);
        ctx.beginPath();
        ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const v of vaos) {
      const a = paraTela(v.a);
      const b = paraTela(v.b);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      rotuloDoTraco(ctx, `${(v.mm / 1000).toFixed(2)} m`, a, b, 2, COR_ALERTA);
    }

    // Prévia da abertura sob o cursor
    if (previaAbertura) {
      const w = paredePorId.get(previaAbertura.wallId);
      if (w) {
        const comp = wallLength(w);
        const ux = (w.b.x - w.a.x) / comp;
        const uy = (w.b.y - w.a.y) / comp;
        const a = paraTela({
          x: w.a.x + ux * previaAbertura.offsetMm,
          y: w.a.y + uy * previaAbertura.offsetMm,
        } as Point);
        const b = paraTela({
          x: w.a.x + ux * (previaAbertura.offsetMm + larguraAberturaMm),
          y: w.a.y + uy * (previaAbertura.offsetMm + larguraAberturaMm),
        } as Point);
        ctx.strokeStyle = COR_PREVIA;
        ctx.lineWidth = Math.max(2, w.thicknessMm * vista.escala);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ── Laço de seleção ──────────────────────────────────────────────────────
    //
    // Os dois modos precisam ser DISTINGUÍVEIS na tela. A convenção direcional
    // do CAD é invisível para quem não a conhece: sem o traço tracejado e sem o
    // rótulo, a pessoa descobre por acidente que arrastar para trás pega mais
    // coisa — e passa a evitar o laço.
    // Rótulo que segue o cursor tem de caber na tela. Laçar de baixo para cima
    // levava o texto para trás da faixa de ajuda do rodapé — e um rótulo que
    // não se lê é um rótulo que não existe.
    const dentroDaTela = (x: number, y: number) => ({
      x: Math.max(70, Math.min(tamanho.w - 70, x)),
      y: Math.max(14, Math.min(tamanho.h - 44, y)),
    });

    if (laco) {
      const a = paraTela(laco.origem);
      const b = paraTela(laco.atual);
      const soDentro = laco.atual.x >= laco.origem.x;
      const cor = soDentro ? COR_PREVIA : COR_ALERTA;

      ctx.strokeStyle = cor;
      ctx.fillStyle = `${cor}18`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(soDentro ? [] : [6, 4]);
      ctx.beginPath();
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      const posLaco = dentroDaTela(b.x, b.y - 14);
      escreverRotulo(ctx, soDentro ? 'Inteiro dentro' : 'Tudo que tocar', posLaco.x, posLaco.y, cor, 11);
    }

    // Cota do deslocamento, durante o arraste da seleção.
    //
    // É a informação que decide o gesto — "andei 2 m para a direita?" — e
    // conferi-la depois de soltar seria tarde.
    if (movendoSelecao && (movendoSelecao.delta.x !== 0 || movendoSelecao.delta.y !== 0)) {
      const { delta } = movendoSelecao;
      const de = paraTela(movendoSelecao.origem);
      const para = paraTela({
        x: movendoSelecao.origem.x + delta.x,
        y: movendoSelecao.origem.y + delta.y,
      } as Point);

      ctx.strokeStyle = COR_SELECIONADA;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(de.x, de.y);
      ctx.lineTo(para.x, para.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vírgula, não ponto: é a convenção do país e a mesma dos outros rótulos
      // desta tela. Duas grafias de decimal no mesmo desenho fazem parecer que
      // uma delas veio de outro sistema.
      const emMetros = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
      const distancia = Math.hypot(delta.x, delta.y);
      const posCota = dentroDaTela(para.x, para.y - 14);
      escreverRotulo(
        ctx,
        `${emMetros(distancia)} m · Δx ${emMetros(delta.x)} · Δy ${emMetros(delta.y)}`,
        posCota.x,
        posCota.y,
        COR_SELECIONADA,
        11,
      );
    }

    // Marcador de captura
    if (
      cursor &&
      (tool === 'parede' ||
        tool === 'poligono' ||
        tool === 'retangulo' ||
        tool === 'terreno' ||
        tool === 'divisa')
    ) {
      const c = paraTela(cursor);
      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    model,
    tamanho,
    vista,
    inicio,
    antesDoInicio,
    cadeia,
    trechos,
    mesmoLado,
    fechandoContorno,
    alinhamento,
    cursor,
    selecao,
    unicoSelecionado,
    tool,
    espessuraMm,
    larguraAberturaMm,
    previaAbertura,
    vaos,
    pontasSoltas,
    mostrarMedidasParedes,
    fundo,
    calibP1,
    medicoesDoNivel,
    limitesDoNivel,
    movendoLimite,
    envelope,
    medicaoSelecionada,
    medindo,
    movendo,
    destinoPonta,
    movendoAbertura,
    movendoSelecao,
    laco,
    ancoraDaForma,
    verticesPoligono,
    eixosDoPoligono,
    ladosPoligono,
    passoEfetivo,
    paraTela,
    paredesDoNivel,
    ambientesDoNivel,
  ]);

  // ── Interação ─────────────────────────────────────────────────────────────
  function posicao(e: React.PointerEvent | React.MouseEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  /**
   * Orto em vigor. Shift INVERTE o modo, como em todo CAD: com orto ligado ele
   * libera o traço livre; com orto desligado ele trava. Ter um botão que só liga
   * e uma tecla que só liga seria duas formas de fazer a mesma coisa.
   */
  function ortoAtivo(e: { shiftKey: boolean }): boolean {
    return ortogonal !== e.shiftKey;
  }

  /**
   * Onde a abertura arrastada pode parar, em mm a partir de `a`.
   *
   * Grampeia entre as VIZINHAS da mesma parede, e não só nas pontas dela. O
   * kernel recusaria a sobreposição de qualquer jeito (`assertModelInvariants`),
   * mas recusar no fim do arraste faria a porta saltar de volta ao soltar — e
   * arraste que reverte sozinho é arraste em que ninguém confia. Grampeado, o
   * gesto simplesmente para onde tem de parar.
   */
  function faixaDoArraste(o: Opening, w: Wall): { min: number; max: number } {
    const comp = wallLength(w);
    let min = 0;
    let max = comp - o.widthMm;

    for (const outra of model.openings) {
      if (outra.id === o.id || outra.wallId !== o.wallId) continue;
      const fimDaOutra = outra.offsetMm + outra.widthMm;
      // Vizinha ATRÁS: o arraste não pode começar antes do fim dela.
      if (fimDaOutra <= o.offsetMm) min = Math.max(min, fimDaOutra);
      // Vizinha À FRENTE: o arraste tem de terminar antes do começo dela.
      if (outra.offsetMm >= o.offsetMm + o.widthMm) {
        max = Math.min(max, outra.offsetMm - o.widthMm);
      }
    }
    return { min, max: Math.max(min, max) };
  }

  /** Ponta OPOSTA à que está sendo arrastada — é dela que a trava se mede. */
  function ancoraDoArraste(): Point | null {
    if (!movendo) return null;
    const w = model.walls.find((x) => x.id === movendo.wallId);
    if (!w) return null;
    return movendo.end === 'a' ? w.b : w.a;
  }

  /**
   * O deslocamento do arraste, já encaixado e travado.
   *
   * O encaixe é no DESLOCAMENTO, não na posição de destino: arredondar cada
   * entidade para a grade destruiria as relações internas do conjunto — duas
   * paredes a 1350 mm uma da outra ficariam a 1300 ou 1400 sem ninguém pedir.
   * Deslocando todo mundo pelo mesmo vetor, o bloco anda inteiro.
   *
   * A trava ortogonal entra DEPOIS do encaixe e sobre o próprio vetor: zerar uma
   * componente de um vetor que já é múltiplo do passo o mantém na grade.
   */
  function deltaDoArraste(origem: Point, mundo: { x: number; y: number }, e: { shiftKey: boolean }) {
    const limitar = (v: number) => Math.max(-LIMITE_MM, Math.min(LIMITE_MM, v));
    const passo = passoEfetivo;
    let dx = limitar(Math.round((mundo.x - origem.x) / passo) * passo);
    let dy = limitar(Math.round((mundo.y - origem.y) / passo) * passo);
    if (ortoAtivo(e)) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    return { x: dx, y: dy };
  }

  function aoMover(e: React.PointerEvent) {
    const { px, py } = posicao(e);

    if (arrastando) {
      setVista((v) => ({ ...v, dx: v.dx + e.movementX, dy: v.dy + e.movementY }));
      return;
    }

    if (movendoSelecao) {
      const mundo = paraMundo(px, py);
      setMovendoSelecao((atual) =>
        atual ? { ...atual, delta: deltaDoArraste(atual.origem, mundo, e) } : atual,
      );
      return;
    }

    if (laco) {
      setLaco((atual) => (atual ? { ...atual, atual: arredondar(paraMundo(px, py)) } : atual));
      return;
    }

    if (movendo) {
      const ancora = ancoraDoArraste();
      let alvo = capturar(paraMundo(px, py));
      if (ancora && ortoAtivo(e)) alvo = travarOrtogonal(ancora, alvo);
      setDestinoPonta(alvo);
      return;
    }

    if (movendoLimite) {
      const b = limitesDoNivel.find((x) => x.id === movendoLimite.boundaryId);
      const ancora = b ? (movendoLimite.end === 'a' ? b.b : b.a) : null;
      let alvo = capturar(paraMundo(px, py));
      if (ancora && ortoAtivo(e)) alvo = travarOrtogonal(ancora, alvo);
      setDestinoPonta(alvo);
      return;
    }

    if (movendoAbertura) {
      const o = model.openings.find((x) => x.id === movendoAbertura.openingId);
      const w = o ? model.walls.find((x) => x.id === o.wallId) : null;
      if (o && w) {
        // SEM encaixe na grade, porque a inserção também não encaixa: duas
        // regras diferentes para posicionar a mesma abertura seriam piores do
        // que nenhuma.
        const bruto = offsetNaParede(w, paraMundo(px, py), o.widthMm);
        const faixa = faixaDoArraste(o, w);
        setMovendoAbertura({
          openingId: o.id,
          offsetMm: Math.max(faixa.min, Math.min(faixa.max, bruto)),
        });
      }
      return;
    }
    if (tool === 'abertura') {
      const mundo = paraMundo(px, py);
      const w = paredeSob(mundo);
      setPreviaAbertura(
        w ? { wallId: w.id, offsetMm: offsetNaParede(w, mundo, larguraAberturaMm) } : null,
      );
      setCursor(null);
      return;
    }
    setPreviaAbertura(null);

    if (
      tool === 'calibrar' ||
      tool === 'medir-area' ||
      tool === 'medir-linha' ||
      tool === 'contar'
    ) {
      setCursor(paraMundo(px, py) as Point);
      return;
    }

    if (tool === 'poligono' || tool === 'retangulo') {
      // Mesma captura da parede: o ponto encaixa na grade e nos cantos já
      // desenhados, para a forma poder encostar no que existe.
      let alvo = capturar(paraMundo(px, py), alinhamento !== 'EIXO');
      // A trava ortogonal vale só para o POLÍGONO, onde ela alinha o giro. No
      // retângulo ela colapsaria o gesto: prender o segundo canto no eixo do
      // primeiro zera um dos lados, e não sobra retângulo nenhum.
      if (tool === 'poligono' && ancoraDaForma && ortoAtivo(e)) {
        alvo = travarOrtogonal(ancoraDaForma, alvo);
      }
      setCursor(alvo);
      return;
    }

    if (tool === 'terreno' || tool === 'divisa') {
      // A prévia tem de aplicar a MESMA trava do clique, senão a linha "pula"
      // ao soltar e o usuário aprende a não confiar nela.
      let alvo = capturarTracado(paraMundo(px, py));
      if (inicio && ortoAtivo(e)) alvo = travarOrtogonal(inicio, alvo);
      setCursor(alvo);
      return;
    }

    if (tool !== 'parede') {
      setCursor(null);
      return;
    }
    // A PRÉVIA TEM QUE APLICAR A MESMA TRAVA DO CLIQUE. Se ela mostrasse o traço
    // livre e o clique gravasse o travado, a linha "pularia" ao soltar — e o
    // usuário aprenderia a não confiar na prévia. Pela mesma razão ela usa o
    // MESMO `capturarTracado` do clique, com fechamento e tudo.
    let alvo = capturarTracado(paraMundo(px, py));
    if (inicio && ortoAtivo(e)) alvo = travarOrtogonal(inicio, alvo);
    setCursor(alvo);
  }

  function aoApertar(e: React.PointerEvent) {
    // Botão do meio ou direito: panorâmica, em qualquer ferramenta.
    if (e.button === 1 || e.button === 2) {
      setArrastando(true);
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const { px, py } = posicao(e);
    const mundo = paraMundo(px, py);

    if (tool === 'medir-area' || tool === 'medir-linha' || tool === 'contar') {
      // SEM encaixe na grade: a pessoa está apontando um canto no DESENHO de
      // fundo, não construindo geometria. Encaixar deslocaria o vértice para o
      // ponto mais próximo da grade e a área medida sairia errada.
      const p = { x: mundo.x, y: mundo.y } as Point;

      if (tool === 'contar') {
        // Contagem fecha a cada clique: cada ponto é uma unidade.
        onMedicaoPronta?.('PONTO', [p]);
        return;
      }

      const tipo: TipoMedida = tool === 'medir-area' ? 'POLIGONO' : 'LINHA';
      const novos = [...medindo, p];

      // Clicar de novo no primeiro vértice FECHA a forma — é como se fecha
      // polilinha em qualquer CAD, e evita depender de um botão fora do desenho.
      const fechou =
        medindo.length >= pontosMinimos(tipo) &&
        Math.hypot(medindo[0].x - p.x, medindo[0].y - p.y) < SNAP_PX / vista.escala;

      if (fechou) {
        onMedicaoPronta?.(tipo, medindo);
        setMedindo([]);
        return;
      }
      setMedindo(novos);
      return;
    }

    if (tool === 'calibrar') {
      // SEM encaixe na grade, de propósito: aqui o usuário está apontando um
      // pixel da imagem, não desenhando. Encaixar deslocaria o ponto da cota e
      // a aferição sairia errada — justamente o número que tudo depois usa.
      if (!fundo) return;
      const p = { x: mundo.x, y: mundo.y };

      if (!calibP1) {
        setCalibP1(p);
        return;
      }
      onCalibrar?.(
        modeloParaPixel(fundo.underlay, calibP1.x, calibP1.y),
        modeloParaPixel(fundo.underlay, p.x, p.y),
      );
      setCalibP1(null);
      return;
    }

    if (tool === 'poligono' || tool === 'retangulo') {
      if (!ancoraDaForma) {
        setAncoraDaForma(capturar(mundo, alinhamento !== 'EIXO'));
        return;
      }
      // `verticesPoligono` sai vazio no gesto degenerado — raio pequeno demais
      // para o número de lados, ou os dois cantos do retângulo na mesma linha.
      // Nesse caso o clique não fecha nada e o gesto continua, o que é melhor
      // que gravar uma forma que o kernel recusaria em seguida.
      if (verticesPoligono.length >= 3) {
        onAddPoligono?.(eixosDoPoligono(verticesPoligono));
        setAncoraDaForma(null);
      }
      return;
    }

    if (tool === 'abertura') {
      const w = paredeSob(mundo);
      if (w) onAddOpening(w.id, offsetNaParede(w, mundo, larguraAberturaMm));
      return;
    }

    if (tool === 'selecionar') {
      // ALÇA ANTES DE SELEÇÃO. As alças só existem na parede JÁ selecionada —
      // é a convenção de CAD (selecionar, depois pegar o grip) e evita que um
      // clique para selecionar vire um arraste acidental de geometria.
      const selecionada = model.walls.find((w) => w.id === unicoSelecionado);
      if (selecionada) {
        const limite = ALCA_PX / vista.escala;
        for (const end of ['a', 'b'] as const) {
          const p = selecionada[end];
          if (Math.hypot(p.x - mundo.x, p.y - mundo.y) <= limite) {
            setMovendo({ wallId: selecionada.id, end });
            setDestinoPonta(p);
            canvasRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Alça do LIMITE selecionado, pela mesma convenção da parede logo acima.
      const limiteSelecionado = limitesDoNivel.find((b) => b.id === unicoSelecionado);
      if (limiteSelecionado) {
        const alcance = ALCA_PX / vista.escala;
        for (const end of ['a', 'b'] as const) {
          const p = limiteSelecionado[end];
          if (Math.hypot(p.x - mundo.x, p.y - mundo.y) <= alcance) {
            setMovendoLimite({ boundaryId: limiteSelecionado.id, end });
            setDestinoPonta(p);
            canvasRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Abertura antes de parede: ela esta POR CIMA e e menor, entao se o
      // clique cair nas duas o usuario quis a de cima.
      const w = paredeSob(mundo);
      const aberturaClicada = w ? aberturaSob(w, mundo) : null;

      // ARRASTAR A ABERTURA JÁ SELECIONADA — mesma convenção da alça de parede
      // logo acima: seleciona, depois pega. Sem o "já selecionada", todo clique
      // para escolher a parede perto de uma porta viraria um empurrão nela.
      if (aberturaClicada && aberturaClicada.id === unicoSelecionado && w) {
        setMovendoAbertura({ openingId: aberturaClicada.id, offsetMm: aberturaClicada.offsetMm });
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Limite antes de parede: ele é uma LINHA sobre a planta e costuma cair
      // por cima de uma parede encostada nele. Quem clica numa divisa quer a
      // divisa — a parede continua alcançável a meia espessura de distância.
      const limiteClicado = limiteSob(mundo);
      const f = medicaoSob(mundo);
      const clicado = aberturaClicada?.id ?? limiteClicado?.id ?? w?.id ?? f?.id ?? null;
      const acumular = e.ctrlKey || e.metaKey || e.shiftKey;

      // ARRASTAR O QUE JÁ ESTÁ SELECIONADO. Apertar sobre um item do conjunto
      // pega o conjunto INTEIRO — é o MOVE do CAD. Vem depois dos dois testes
      // de alça acima, e antes da seleção: sem essa ordem, pegar o bloco
      // primeiro reduziria a seleção ao item apertado e o gesto viraria "mover
      // uma parede só", calado.
      if (clicado && selecao.has(clicado) && !acumular) {
        setMovendoSelecao({ origem: arredondar(mundo), delta: { x: 0, y: 0 } });
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      if (clicado) {
        onSelecionar(
          acumular
            ? selecao.has(clicado)
              ? selectedIds.filter((id) => id !== clicado)
              : [...selectedIds, clicado]
            : [clicado],
        );
        return;
      }

      // Vazio: começa o LAÇO. Só vira seleção de fato ao soltar — um clique sem
      // arrastar continua limpando a seleção, como sempre limpou.
      setLaco({ origem: arredondar(mundo), atual: arredondar(mundo) });
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // ── TERRENO e DIVISA ─────────────────────────────────────────────────────
    //
    // Mesmo motor de encadeamento do traçado de parede — `cadeia`, captura,
    // fechamento pelo primeiro vértice — emitindo `AddBoundary` em vez de
    // `AddWall`, e SEM MITRA: limite não tem espessura, logo não tem canto para
    // mitrar. O vértice clicado é o vértice.
    if (tool === 'terreno' || tool === 'divisa') {
      let ponto = capturarTracado(mundo);
      if (!inicio) {
        setCadeia([ponto]);
        setTrechos([]);
        return;
      }
      if (ortoAtivo(e)) ponto = travarOrtogonal(inicio, ponto);
      if (ponto.x === inicio.x && ponto.y === inicio.y) return;

      const kind: BoundaryKind = tool === 'terreno' ? 'TERRENO' : 'DIVISA';
      onAddLimite?.(inicio, ponto, kind);

      // Voltar ao primeiro vértice FECHA o contorno e encerra a polilinha — o
      // lado que acabou de nascer é o de fechamento. É como se fecha contorno em
      // qualquer CAD, e evita depender de um botão fora do desenho.
      if (fechandoContorno(ponto)) {
        setCadeia([]);
        setTrechos([]);
        return;
      }
      setCadeia((c) => [...c, ponto]);
      return;
    }

    let capturado = capturarTracado(mundo);
    if (!inicio) {
      setCadeia([capturado]);
      setTrechos([]);
      return;
    }
    if (ortoAtivo(e)) capturado = travarOrtogonal(inicio, capturado);
    if (capturado.x === inicio.x && capturado.y === inicio.y) return;

    // O EIXO sai do traçado pelo kernel, com os vizinhos da polilinha — é o que
    // mitra o canto. No alinhamento `EIXO` isso devolve o próprio traçado, então
    // o caminho antigo continua idêntico, sem ajuste nenhum.
    const fecha = fechandoContorno(capturado);
    // Mitrar o fechamento exige que o PRIMEIRO trecho tenha sido traçado do mesmo
    // lado — senão a correção da ponta dele o deixaria torto.
    const fechaMitrado = fecha && trechos[0]?.lado === alinhamento;
    const eixo = eixoDaParede({ a: inicio, b: capturado }, espessuraMm, alinhamento, {
      antes: mesmoLado ? antesDoInicio : null,
      depois: fechaMitrado ? cadeia[1] : null,
    });

    // As paredes já criadas terminam onde a ponta foi deslocada em RETA, porque na
    // hora em que nasceram o trecho seguinte não existia. Agora existe: corrigir a
    // ponta é o que faz as duas se encontrarem no mesmo vértice em vez de ficarem
    // a meia espessura uma da outra.
    const ajustes: AjustePonta[] = [];
    const empurrar = (wallId: string | undefined, end: 'a' | 'b', to: Point) => {
      if (!wallId) return;
      const w = model.walls.find((x) => x.id === wallId);
      if (!w || (w[end].x === to.x && w[end].y === to.y)) return;
      ajustes.push({ wallId, end, to });
    };
    if (mesmoLado) empurrar(ultimoTrecho?.wallId, 'b', eixo.a);
    if (fechaMitrado) empurrar(trechos[0]?.wallId, 'a', eixo.b);

    const criada = onAddWall(eixo.a, eixo.b, ajustes.length > 0 ? ajustes : undefined);
    const idCriado = typeof criada === 'string' ? criada : null;

    if (fecha) {
      // Contorno fechado encerra a polilinha: o clique seguinte começa outra, e
      // não um trecho pendurado no vértice de fechamento.
      setCadeia([]);
      setTrechos([]);
      return;
    }
    // Encadeia: a ponta vira o início da próxima, que é como se desenha
    // um contorno sem reclicar no mesmo vértice.
    setCadeia((c) => [...c, capturado]);
    // Entra sempre, mesmo sem id — a lista tem que ficar em passo com `cadeia`.
    // Pular a posição faria o trecho seguinte corrigir a ponta de uma parede que
    // não é sua vizinha, mexendo em geometria que ninguém pediu para mexer.
    setTrechos((t) => [...t, { wallId: idCriado ?? '', lado: alinhamento }]);
  }

  /** Duplo clique encerra a forma em curso — a saída para quem não quer fechar. */
  function aoDuploClique() {
    // TERRENO fecha sozinho no duplo clique: o lado de volta ao primeiro vértice
    // é gerado sem precisar acertar o clique em cima dele. É a saída para quem
    // desenhou o contorno e não quer mirar no ponto de partida.
    if (tool === 'terreno' && cadeia.length >= 3 && inicio) {
      const primeiro = cadeia[0];
      if (inicio.x !== primeiro.x || inicio.y !== primeiro.y) {
        onAddLimite?.(inicio, primeiro, 'TERRENO');
      }
      setCadeia([]);
      setTrechos([]);
      return;
    }
    // DIVISA não fecha sozinha — ela é um traçado aberto por natureza, e fechar
    // por conta própria inventaria um lado que ninguém desenhou.
    if (tool === 'divisa') {
      setCadeia([]);
      setTrechos([]);
      return;
    }

    if (medindo.length === 0) return;
    const tipo: TipoMedida = tool === 'medir-area' ? 'POLIGONO' : 'LINHA';
    if (medindo.length >= pontosMinimos(tipo)) onMedicaoPronta?.(tipo, medindo);
    setMedindo([]);
  }

  /** Grava o deslocamento da seleção. Vale para o arraste e para as setas. */
  function comitarDeslocamento(delta: Point) {
    if (delta.x === 0 && delta.y === 0) return;
    if (idsDeParedesSelecionadas.length > 0 || idsDeLimitesSelecionados.length > 0) {
      onMoverSelecao?.(idsDeParedesSelecionadas, idsDeLimitesSelecionados, delta);
    }
    if (idsDeMedicoesSelecionadas.length > 0) {
      onMoverMedicoes?.(idsDeMedicoesSelecionadas, delta);
    }
  }

  function aoSoltar(e: React.PointerEvent) {
    if (arrastando) {
      setArrastando(false);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (movendoSelecao) {
      // Delta zero não emite nada: um clique sem arrastar cai aqui, e gravar
      // isso encheria o histórico de passos que não mudam nada — cada um deles
      // um "desfazer" que parece travado.
      comitarDeslocamento(movendoSelecao.delta);
      setMovendoSelecao(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (laco) {
      const { origem, atual } = laco;
      // Arraste menor que a folga de clique É clique: sem isto, todo clique no
      // vazio viraria um laço de área zero e a seleção nunca se limparia.
      const arrastou =
        Math.abs(atual.x - origem.x) * vista.escala > FOLGA_CLIQUE_PX ||
        Math.abs(atual.y - origem.y) * vista.escala > FOLGA_CLIQUE_PX;
      const pegos = arrastou ? idsNoLaco(origem, atual) : [];
      const acumular = e.ctrlKey || e.metaKey || e.shiftKey;
      onSelecionar(acumular ? [...new Set([...selectedIds, ...pegos])] : pegos);
      setLaco(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (movendo) {
      const w = model.walls.find((x) => x.id === movendo.wallId);
      const outra = w ? (movendo.end === 'a' ? w.b : w.a) : null;
      // Soltar em cima da outra ponta faria uma parede de comprimento zero, que
      // o kernel recusa com erro. Descartar em silêncio é o certo: o usuário
      // desistiu do arraste, não pediu uma parede degenerada.
      if (
        destinoPonta &&
        outra &&
        (destinoPonta.x !== outra.x || destinoPonta.y !== outra.y)
      ) {
        onMoveVertex?.(movendo.wallId, movendo.end, destinoPonta);
      }
      setMovendo(null);
      setDestinoPonta(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (movendoLimite) {
      const b = limitesDoNivel.find((x) => x.id === movendoLimite.boundaryId);
      const outra = b ? (movendoLimite.end === 'a' ? b.b : b.a) : null;
      // Soltar em cima da outra ponta faria um limite de comprimento zero, que o
      // kernel recusa. Descartar em silêncio: o usuário desistiu do arraste.
      if (destinoPonta && outra && (destinoPonta.x !== outra.x || destinoPonta.y !== outra.y)) {
        onMoveBoundaryVertex?.(movendoLimite.boundaryId, movendoLimite.end, destinoPonta);
      }
      setMovendoLimite(null);
      setDestinoPonta(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (movendoAbertura) {
      const o = model.openings.find((x) => x.id === movendoAbertura.openingId);
      // Só emite se a abertura de fato andou. Um clique sem arrastar cai aqui
      // com o mesmo offset, e gravar isso encheria o histórico de passos que não
      // mudam nada — cada um deles um "desfazer" que parece travado.
      if (o && o.offsetMm !== movendoAbertura.offsetMm) {
        onMoveOpening?.(movendoAbertura.openingId, movendoAbertura.offsetMm);
      }
      setMovendoAbertura(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }
  }

  function aoRolar(e: React.WheelEvent) {
    const { px, py } = posicao(e);
    const antes = paraMundo(px, py);
    const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const escala = Math.max(0.002, Math.min(2, vista.escala * fator));

    // Mantém sob o cursor o mesmo ponto do mundo — zoom "para onde se olha".
    // O sinal do Y acompanha `paraTela`: resolver `-antes.y * escala + dy = py`.
    setVista({
      escala,
      dx: px - antes.x * escala,
      dy: py + antes.y * escala,
    });
  }

  function aoTeclar(e: React.KeyboardEvent) {
    // Espaço INVERTE o lado, e vale no meio do gesto: a prévia troca de lado na
    // hora, sem soltar o traçado em curso. `preventDefault` porque espaço rola a
    // página por padrão — a planta sairia de vista a cada inversão.
    if ((e.key === ' ' || e.code === 'Space') && tool === 'parede' && onInverterLado) {
      e.preventDefault();
      onInverterLado();
      return;
    }
    // Ctrl+A seleciona o nível inteiro — paredes e medições. É o caminho para
    // "mover a planta toda" sem laçar de canto a canto com o zoom afastado.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      onSelecionar([
        ...paredesDoNivel.map((w) => w.id),
        ...limitesDoNivel.map((b) => b.id),
        ...medicoes.map((f) => f.id),
      ]);
      return;
    }

    // Setas deslocam a seleção um passo de grade (Shift = 10 passos). É o único
    // jeito de mover com precisão sem mira: o arraste depende da mão.
    const passos: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const direcao = passos[e.key];
    if (direcao && selectedIds.length > 0 && !movendoSelecao) {
      e.preventDefault();
      const fator = passoEfetivo * (e.shiftKey ? 10 : 1);
      comitarDeslocamento({ x: direcao[0] * fator, y: direcao[1] * fator } as Point);
      return;
    }

    if (e.key === 'Escape') {
      setCadeia([]);
      setTrechos([]);
      // Desistir do arraste em curso: a abertura fica onde estava, porque o
      // modelo só muda ao soltar. Vale igual para o arraste da seleção e para o
      // laço — os dois só produzem efeito no `pointerup`.
      setMovendoAbertura(null);
      setMovendo(null);
      setMovendoLimite(null);
      setDestinoPonta(null);
      setMovendoSelecao(null);
      setLaco(null);
      setAncoraDaForma(null);
      setCalibP1(null);
      setMedindo([]);
      onSelecionar([]);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault();
      onDelete();
    }
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Área de desenho da planta. Use a lista de ambientes ao lado para navegar por teclado."
        className="block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        style={{
          cursor: arrastando || movendo || movendoLimite || movendoAbertura || movendoSelecao
            ? 'grabbing'
            : laco
              ? 'crosshair'
              : tool !== 'selecionar' && tool !== 'abertura'
                ? 'crosshair'
                : 'default',
        }}
        onPointerMove={aoMover}
        onPointerDown={aoApertar}
        onDoubleClick={aoDuploClique}
        onPointerUp={aoSoltar}
        onWheel={aoRolar}
        onKeyDown={aoTeclar}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">
        {tool === 'terreno' || tool === 'divisa'
          ? inicio
            ? cadeia.length >= 2
              ? tool === 'terreno'
                ? 'Clique no 1º vértice para FECHAR o lote · duplo clique fecha sozinho · Esc cancela'
                : 'Clique para o próximo trecho · volte ao 1º vértice para fechar · Esc cancela'
              : 'Clique para o próximo vértice · Esc cancela'
            : tool === 'terreno'
              ? 'Clique no 1º vértice do terreno'
              : 'Clique onde a divisa começa'
          : tool === 'retangulo'
          ? ancoraDaForma
            ? 'Arraste até o canto OPOSTO · clique fecha o ambiente · Esc cancela'
            : 'Clique num CANTO do ambiente'
          : tool === 'poligono'
          ? ancoraDaForma
            ? `Arraste para dar o tamanho e o giro · clique fecha o polígono de ${ladosPoligono} lados · Esc cancela`
            : 'Clique no CENTRO do polígono'
          : tool === 'parede'
            ? inicio
              ? cadeia.length >= 3
                ? 'Clique para fechar o trecho · volte ao 1º ponto para fechar o contorno · Esc cancela'
                : 'Clique para fechar o trecho · Esc cancela'
              : 'Clique para iniciar a parede'
            : tool === 'selecionar'
              ? selectedIds.length > 1
                ? `${selectedIds.length} selecionados · arraste para mover · setas ajustam · Delete remove`
                : 'Clique para selecionar · arraste no vazio para laçar (← pega o que tocar) · Ctrl+A tudo'
              : 'Clique numa parede para selecionar · Delete remove'}
        <span className="ml-2 text-slate-400">
          · grade {rotuloPasso(passoEfetivo)}
          {tool === 'parede'
            ? alinhamento === 'EIXO'
              ? ' · clique no eixo (espaço desenha pela face)'
              : ` · clique na face, parede ${alinhamento === 'DIREITA' ? 'à direita' : 'à esquerda'} (espaço inverte)`
            : ''}
          {ortogonal ? ' · orto (Shift libera)' : ' · Shift trava em 90°'} · botão direito arrasta · roda dá zoom
        </span>
      </div>
    </div>
  );
}
