/**
 * Modelo canônico do kernel — as entidades do PRD §12.1.
 *
 * Regra estrutural: IDs são atribuídos por um contador determinístico do próprio
 * modelo, NUNCA por `crypto.randomUUID()`. Um UUID aleatório mudaria o payload
 * canônico a cada execução e tornaria o critério do Spike A (igualdade bit a bit)
 * impossível de satisfazer por construção.
 */

import { KernelError, assertIntegerMm, roundToMm } from './units';
import { pointKey, type Point } from './geom';

export type ObjectId = string;

export interface Level {
  id: ObjectId;
  name: string;
  elevationMm: number;
  defaultHeightMm: number;
}

/**
 * Parede pelo EIXO, não pelas faces. Espessura é propriedade, não geometria —
 * é o que permite mudar a espessura sem reconstruir a topologia.
 */
export interface Wall {
  id: ObjectId;
  levelId: ObjectId;
  a: Point;
  b: Point;
  thicknessMm: number;
  heightMm: number;
}

/** Abertura hospedada numa parede. `offsetMm` é medido a partir de `wall.a`. */
export interface Opening {
  id: ObjectId;
  wallId: ObjectId;
  /**
   * `passage` é o vão SEM ESQUADRIA — "vão livre" na tela. Não é decoração de
   * porta: ele muda o orçamento em dois lugares. Não entra em área de
   * esquadrias (não há caixilho para comprar) e, quando nasce no piso,
   * interrompe o rodapé como uma porta interrompe.
   */
  kind: 'door' | 'window' | 'passage' | 'sliding';
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  /**
   * Só o SÍMBOLO da porta lê estes dois campos — janela não tem dobradiça nem
   * lado de giro, e continua desenhada como uma linha simétrica através da
   * parede. Existem em toda abertura mesmo assim, pela mesma razão de `sillMm`
   * estar presente em porta: um campo condicional ao `kind` bifurcaria o tipo
   * sem necessidade.
   *
   * Os dois são EIXOS INDEPENDENTES, não um único "girar 180°": um vão de porta
   * tem 4 variações válidas de símbolo (a mesma convenção do Revit/ArchiCAD —
   * "flip hand" e "flip facing" — dois botões, quatro estados), e colapsar os
   * dois numa única ação impediria alcançar metade delas sem combinar botões.
   */
  /** De qual ponta do vão sai o eixo de giro. `true` = `wall.a` + `offsetMm`. */
  hingeAtStart: boolean;
  /** Para qual lado da parede a folha abre. `false` = normal positiva (padrão). */
  swingReversed: boolean;
  /**
   * Só para `sliding`: a folha corre DENTRO da parede (bolso) ou sobre a face.
   *
   * ─── POR QUE UM BOOLEANO, E NÃO DOIS `kind` ─────────────────────────────
   *
   * Dois tipos duplicariam todo `switch` do desenho e do orçamento por uma
   * diferença que não muda o que se COMPRA — folha, trilho e puxador são os
   * mesmos. O que muda é onde a folha vai parar, e isso é um eixo, não uma
   * família.
   *
   * ─── OS DOIS BOOLEANOS DE CIMA SERVEM SEM MUDAR DE SIGNIFICADO ──────────
   *
   * `hingeAtStart` já diz "de qual ponta do vão": na de correr, para qual
   * ponta a folha recolhe. `swingReversed` já diz "para qual lado da parede":
   * na de correr POR FORA, sobre qual face ela desliza. Na EMBUTIDA ele não se
   * aplica, porque a folha vai para dentro — e não se aplica é diferente de
   * não existir, pela mesma razão que `sillMm` existe em porta.
   */
  embutida: boolean;
}

/**
 * Como cada tipo de abertura se chama na tela.
 *
 * FONTE ÚNICA. O rótulo era escrito à mão em quatro lugares (painel, diff,
 * de-para do orçamento, barra), todos com o mesmo ternário `door ? 'Porta' :
 * 'Janela'` — que, com um terceiro tipo, passa a chamar vão livre de "Janela"
 * em cada um deles. Um ternário de dois ramos não sobrevive a um tipo novo, e
 * quatro cópias dele são quatro lugares para esquecer.
 */
export function nomeDoTipoDeAbertura(kind: Opening['kind'], embutida = false): string {
  if (kind === 'door') return 'Porta';
  if (kind === 'window') return 'Janela';
  if (kind === 'sliding') return embutida ? 'Porta de correr embutida' : 'Porta de correr';
  return 'Vão livre';
}

/**
 * Que tipo de limite este é.
 *
 * `TERRENO` participa do anel do LOTE — é dele que saem área, perímetro e
 * recuos. `DIVISA` é um limite solto: alinhamento, servidão, divisão interna
 * sem material. A distinção existe porque só o anel do lote tem área com
 * significado jurídico, e misturar os dois faria a área do terreno mudar quando
 * alguém traçasse uma divisória qualquer.
 */
export type BoundaryKind = 'TERRENO' | 'DIVISA';

/**
 * Papel da divisa no lote, para os recuos.
 *
 * Recuo de frente, de fundos e de lateral são medidas DIFERENTES, e não há como
 * inferir qual é qual só pela geometria — a frente é a que dá para a rua, e isso
 * é informação do mundo, não do desenho.
 */
export type BoundaryPapel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Limite sem material físico — divide ambiente sem existir como parede. */
export interface Boundary {
  id: ObjectId;
  levelId: ObjectId;
  a: Point;
  b: Point;
  /**
   * Omitido em payload gravado sob kernel ≤ 0.4.0, quando o campo não existia.
   * Lido como `DIVISA` na volta — o comportamento de antes, que é o que aquele
   * desenho significava.
   */
  kind: BoundaryKind;
  papel?: BoundaryPapel | null;
  /**
   * A medida deste lado COMO ESTÁ NA MATRÍCULA, em mm inteiro.
   *
   * Deliberadamente separada da medida desenhada (que sai de `a` e `b`): a
   * divergência entre as duas É o produto. Guardar uma só, ou "corrigir" o
   * desenho para a escritura, apagaria justamente a informação que se quer ver —
   * levantamento e título discordam com frequência, e quem decide o que fazer
   * com isso é o incorporador, não o software.
   *
   * `null` = ninguém informou. Nada é comparado, nada é acusado.
   */
  medidaEscrituraMm?: number | null;
  /**
   * Com quem este lado confronta, como a escritura descreve: "Rua das Acácias",
   * "lote 12", "Córrego do Meio". Texto livre porque a matrícula é texto livre —
   * um catálogo de confrontantes obrigaria a cadastrar a rua antes de desenhar.
   */
  confrontante?: string | null;
}

/** Ambiente derivado do arranjo planar. Contorno NUNCA é declarado pelo usuário. */
export interface Space {
  id: ObjectId;
  levelId: ObjectId;
  ring: Point[];
  holes: Point[][];
  areaMm2: number;
  perimeterMm: number;
  name?: string;
}

/**
 * Nome de ambiente ancorado num PONTO, não no id do ambiente.
 *
 * Ambiente é derivado: mover uma parede recria todos os `Space`, com ids novos.
 * Um nome guardado por `spaceId` sobreviveria a zero edições — ou pior,
 * reapareceria colado no ambiente errado quando a ordem de derivação mudasse.
 *
 * Ancorar num ponto é o que os CAD fazem com etiqueta de ambiente: o nome fica
 * onde o usuário clicou e, a cada rederivação, vai para o ambiente que contém
 * aquele ponto. Se uma reforma engolir o ambiente, a etiqueta fica órfã e
 * visível — que é melhor do que sumir em silêncio.
 */
export interface SpaceLabel {
  id: ObjectId;
  levelId: ObjectId;
  at: Point;
  name: string;
}

export interface BlueprintModel {
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  boundaries: Boundary[];
  /** Etiquetas de ambiente. Persistidas; o `Space.name` é que é derivado delas. */
  labels: SpaceLabel[];
  /** Derivado. Recalculado por `recomputeSpaces`, jamais editado à mão. */
  spaces: Space[];
  /**
   * Área do lote NA ESCRITURA, em mm² inteiro. `null` = ninguém informou.
   *
   * Mora no modelo, e não em estado local da tela como os recuos, porque não é
   * parâmetro urbanístico do município — é CONTEÚDO do lote. Mudá-la muda o que
   * o desenho afirma, e portanto tem que mudar o hash; é o mesmo argumento que
   * pôs os nomes de ambiente (`labels`) no payload canônico.
   *
   * Em mm², não em m², pela disciplina do kernel: 0,01 m² são exatos 10.000 mm²,
   * então a conversão não perde nada e o número continua inteiro. A faixa de
   * `assertIntegerMm` não se aplica — ela limita COORDENADA a ±1.000.000 mm, e um
   * lote modesto de 360 m² já são 360.000.000 mm².
   */
  areaEscrituraMm2?: number | null;
  /** Contador determinístico de IDs, por prefixo. */
  seq: Record<string, number>;
}

export function emptyModel(): BlueprintModel {
  return {
    levels: [],
    walls: [],
    openings: [],
    boundaries: [],
    labels: [],
    spaces: [],
    areaEscrituraMm2: null,
    seq: {},
  };
}

/**
 * Próximo ID de um prefixo. Determinístico: o mesmo roteiro de comandos produz
 * exatamente os mesmos IDs, em qualquer máquina.
 */
export function nextId(model: BlueprintModel, prefix: string): ObjectId {
  const n = (model.seq[prefix] ?? 0) + 1;
  model.seq[prefix] = n;
  return `${prefix}_${String(n).padStart(4, '0')}`;
}

export function cloneModel(model: BlueprintModel): BlueprintModel {
  return {
    levels: model.levels.map((l) => ({ ...l })),
    walls: model.walls.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
    openings: model.openings.map((o) => ({ ...o })),
    boundaries: model.boundaries.map((b) => ({ ...b, a: { ...b.a }, b: { ...b.b } })),
    labels: (model.labels ?? []).map((l) => ({ ...l, at: { ...l.at } })),
    spaces: model.spaces.map((s) => ({
      ...s,
      ring: s.ring.map((p) => ({ ...p })),
      holes: s.holes.map((h) => h.map((p) => ({ ...p }))),
    })),
    areaEscrituraMm2: model.areaEscrituraMm2 ?? null,
    seq: { ...model.seq },
  };
}

export function findWall(model: BlueprintModel, id: ObjectId): Wall {
  const wall = model.walls.find((w) => w.id === id);
  if (!wall) throw new KernelError('WALL_NOT_FOUND', `Parede inexistente: ${id}`);
  return wall;
}

export function findLevel(model: BlueprintModel, id: ObjectId): Level {
  const level = model.levels.find((l) => l.id === id);
  if (!level) throw new KernelError('LEVEL_NOT_FOUND', `Nível inexistente: ${id}`);
  return level;
}

export function findBoundary(model: BlueprintModel, id: ObjectId): Boundary {
  const boundary = model.boundaries.find((b) => b.id === id);
  if (!boundary) throw new KernelError('BOUNDARY_NOT_FOUND', `Limite inexistente: ${id}`);
  return boundary;
}

/** O mínimo que `pontasDeslocadas` precisa saber: um id e duas pontas. */
export interface SegmentoIdentificado {
  id: ObjectId;
  a: Point;
  b: Point;
}

/**
 * Onde cada ponta PARA depois de deslocar um conjunto de segmentos.
 *
 * Devolve só os que se mexem, com as pontas novas. Não altera nada: é a conta,
 * separada de quem a aplica.
 *
 * Existe separada do comando `TranslateEntities` para que a PRÉVIA do arraste e
 * o COMANDO gravado sejam a mesma geometria. Uma prévia que não bate com o
 * resultado ensina o usuário a não confiar nela — e a alternativa, reimplementar
 * a regra no renderizador, é a cópia que diverge em silêncio (foi assim que a
 * regra de ponta livre ficou certa na tela e errada no papel).
 *
 * ⚠️ **Recebe PAREDES E LIMITES juntos, e isso não é generalização gratuita.**
 * Enquanto só olhava paredes, arrastar um bloco com `arrastarVizinhas` deixava
 * para trás qualquer divisa encostada nele — o anel do lote abria e o ambiente
 * derivado sumia, sem erro nenhum na tela. As duas famílias têm de estar na
 * MESMA conta para que a vizinhança seja vista.
 *
 * `arrastarVizinhas` distingue MOVER de ESTICAR: ligado, a ponta de um segmento
 * NÃO selecionado que compartilha vértice com a seleção anda junto; desligado,
 * o bloco se desprende, mantendo as próprias medidas.
 */
export function pontasDeslocadas(
  segmentos: SegmentoIdentificado[],
  idsSelecionados: ObjectId[],
  delta: Point,
  arrastarVizinhas: boolean,
): Map<ObjectId, { a: Point; b: Point }> {
  const selecionados = new Set(idsSelecionados);
  const alvos = segmentos.filter((s) => selecionados.has(s.id));

  // OS VÉRTICES ORIGINAIS, ANTES DE QUALQUER DESLOCAMENTO. Deslocar primeiro e
  // procurar as vizinhas depois casaria com o lugar novo — e o lugar novo é
  // justamente onde a vizinha NÃO está.
  const vertices = new Set<string>();
  for (const s of alvos) {
    vertices.add(pointKey(s.a));
    vertices.add(pointKey(s.b));
  }

  const andar = (p: Point): Point => ({ x: p.x + delta.x, y: p.y + delta.y });
  const saida = new Map<ObjectId, { a: Point; b: Point }>();

  for (const s of alvos) saida.set(s.id, { a: andar(s.a), b: andar(s.b) });

  if (arrastarVizinhas) {
    for (const s of segmentos) {
      if (selecionados.has(s.id)) continue;
      // Igualdade EXATA de coordenada, o mesmo casamento que o editor já usa
      // para esticar uma parede arrastando o canto junto: no kernel os vértices
      // são milímetro inteiro, e uma junção só existe quando as duas pontas
      // caem no mesmo ponto.
      const mexeA = vertices.has(pointKey(s.a));
      const mexeB = vertices.has(pointKey(s.b));
      if (!mexeA && !mexeB) continue;
      saida.set(s.id, { a: mexeA ? andar(s.a) : s.a, b: mexeB ? andar(s.b) : s.b });
    }
  }

  return saida;
}

/** Comprimento do eixo da parede, em mm inteiros. */
export function wallLength(wall: Wall): number {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/**
 * Uma ponta de parede é LIVRE quando nada a encosta.
 *
 * Serve ao desenho: em ponta que encontra outra parede, a pincelada precisa ser
 * ESTENDIDA em meia espessura, senão sobra um quadrado vazio no canto externo —
 * o degrau que já apareceu em uso duas vezes, uma na tela e outra no papel.
 *
 * Contar só PONTAS não basta: numa junção em T a divisória termina no MEIO da
 * parede que a recebe, e aquele ponto não é ponta de ninguém. Sem o teste de
 * pertinência ao corpo das outras, ela seria classificada como livre e ganharia
 * um tampo, desenhando uma linha atravessada dentro da junção.
 *
 * Vive no kernel, e não em cada renderizador, porque é GEOMETRIA — não estilo.
 * Duas cópias divergem: foi exatamente o que aconteceu quando a exportação
 * nasceu sem esta regra e o canto voltou a falhar só no papel.
 */
export function isFreeWallEnd(walls: Wall[], p: Point, exceptId: ObjectId): boolean {
  let encontros = 0;
  for (const w of walls) {
    if (w.a.x === p.x && w.a.y === p.y) encontros++;
    if (w.b.x === p.x && w.b.y === p.y) encontros++;
  }
  if (encontros > 1) return false;

  for (const o of walls) {
    if (o.id === exceptId) continue;
    const dx = o.b.x - o.a.x;
    const dy = o.b.y - o.a.y;
    const comp2 = dx * dx + dy * dy;
    if (comp2 === 0) continue;
    let t = ((p.x - o.a.x) * dx + (p.y - o.a.y) * dy) / comp2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(o.a.x + t * dx - p.x, o.a.y + t * dy - p.y);
    if (d <= o.thicknessMm / 2) return false;
  }
  return true;
}

/**
 * Teto do avanço, em múltiplos de meia espessura. Canto muito agudo pede avanço
 * que tende ao infinito; sem teto vira farpa. Mesmo espírito da mitra do eixo.
 */
const AVANCO_MAX = 4;

/**
 * Quanto a pincelada da parede avança ALÉM do eixo, na ponta que encontra
 * outra — em milímetros.
 *
 * ─── POR QUE NÃO É SEMPRE MEIA ESPESSURA ────────────────────────────────────
 *
 * Era. E meia espessura fecha o canto EXATAMENTE em 90°, que é o ângulo de
 * quase toda planta — por isso passou despercebido. Em qualquer outro ângulo a
 * conta erra: no canto obtuso (o hexágono tem 120°) a pincelada ultrapassa o
 * canto verdadeiro e sobra uma farpa; no agudo, falta e abre um degrau.
 *
 * A conta certa sai da geometria do canto. Com as duas paredes formando ângulo
 * θ no vértice, as faces externas se cruzam a `(t/2)/sen(θ/2)` dele; para a
 * tampa da pincelada passar por esse cruzamento, ela tem de avançar
 * `(t/2)/tg(θ/2)`. Em θ = 90° isso dá meia espessura — ou seja, toda planta
 * ortogonal desenha exatamente como desenhava.
 *
 * ─── ONDE ELA NÃO SE APLICA ─────────────────────────────────────────────────
 *
 * Só há canto quando DUAS paredes se encontram na ponta. Junção em X (três ou
 * mais) não tem um canto único para mitrar, e junção em T (a ponta morre no
 * meio da outra) não tem vértice compartilhado. Nos dois casos fica meia
 * espessura, que é o comportamento já verificado em uso.
 *
 * Vive no kernel, e não em cada renderizador, porque é GEOMETRIA. A regra
 * estava COPIADA na tela e na exportação, com a mesma conta errada nas duas —
 * e cópia de regra geométrica é o que já deixou o canto certo na tela e aberto
 * no papel uma vez.
 */
export function extensaoDeCanto(walls: Wall[], wall: Wall, end: 'a' | 'b'): number {
  const p = wall[end];
  if (isFreeWallEnd(walls, p, wall.id)) return 0;

  const meia = wall.thicknessMm / 2;

  const vizinhas = walls.filter(
    (o) =>
      o.id !== wall.id &&
      ((o.a.x === p.x && o.a.y === p.y) || (o.b.x === p.x && o.b.y === p.y)),
  );
  if (vizinhas.length !== 1) return meia;

  /** Direção que sai do vértice ao longo do eixo. */
  const versor = (w: Wall) => {
    const longe = w.a.x === p.x && w.a.y === p.y ? w.b : w.a;
    const dx = longe.x - p.x;
    const dy = longe.y - p.y;
    const comp = Math.hypot(dx, dy);
    return comp === 0 ? null : { x: dx / comp, y: dy / comp };
  };

  const u1 = versor(wall);
  const u2 = versor(vizinhas[0]);
  if (!u1 || !u2) return meia;

  const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const tg = Math.tan(Math.acos(cos) / 2);
  if (!Number.isFinite(tg) || tg <= 1e-9) return meia * AVANCO_MAX;
  return Math.min(meia / tg, meia * AVANCO_MAX);
}

/**
 * RECUO ATÉ A FACE DA VIZINHA — quanto desta parede é engolido pela junção.
 *
 * ⚠️ NÃO confundir com `extensaoDeCanto`. São duas grandezas diferentes, e
 * confundi-las foi um defeito real (reportado em 27/08/2026, com print):
 *
 * | | fórmula | depende de |
 * |---|---|---|
 * | avanço de mitra (DESENHO) | `(t_própria/2) / tg(θ/2)` | espessura PRÓPRIA |
 * | recuo até a face (MEDIDA) | `(t_vizinha/2) / sen(θ)` | espessura da VIZINHA |
 *
 * Com espessura uniforme e canto reto as duas valem `t/2` e coincidem — foi por
 * isso que o erro passou por toda uma bateria de testes: todos usavam espessura
 * uniforme. Numa divisória de 10 cm morrendo numa parede de 30 cm, o recuo é
 * 15 cm (metade DA OUTRA), não 5.
 *
 * Acha a vizinha das duas formas que a junção existe: **vértice compartilhado**
 * (canto) e **pertinência ao corpo** (junção em T, onde a divisória morre no
 * meio da hospedeira e aquele ponto não é ponta de ninguém).
 *
 * Vizinha COLINEAR não conta: sem ângulo não há face atravessada, e dividir por
 * `sen(0)` estouraria.
 */
export function recuoAteFace(walls: Wall[], wall: Wall, end: 'a' | 'b'): number {
  const p = wall[end];
  if (isFreeWallEnd(walls, p, wall.id)) return 0;

  const longe = end === 'a' ? wall.b : wall.a;
  const dx = longe.x - p.x;
  const dy = longe.y - p.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return 0;
  const ux = dx / comp;
  const uy = dy / comp;

  let maior = 0;
  for (const o of walls) {
    if (o.id === wall.id) continue;

    const compartilhaVertice =
      (o.a.x === p.x && o.a.y === p.y) || (o.b.x === p.x && o.b.y === p.y);

    // Junção em T: o vértice cai DENTRO da faixa desenhada da hospedeira.
    const odx = o.b.x - o.a.x;
    const ody = o.b.y - o.a.y;
    const ocomp2 = odx * odx + ody * ody;
    if (ocomp2 === 0) continue;
    let t = ((p.x - o.a.x) * odx + (p.y - o.a.y) * ody) / ocomp2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(o.a.x + t * odx - p.x, o.a.y + t * ody - p.y);
    const noCorpo = dist <= o.thicknessMm / 2;

    if (!compartilhaVertice && !noCorpo) continue;

    const ocomp = Math.sqrt(ocomp2);
    // |u × v| = sen do ângulo entre os eixos.
    const sen = Math.abs(ux * (ody / ocomp) - uy * (odx / ocomp));
    if (sen < 1e-6) continue; // colinear: não atravessa face nenhuma

    const recuo = o.thicknessMm / 2 / sen;
    if (recuo > maior) maior = recuo;
  }
  return maior;
}

/**
 * Comprimento da FACE INTERNA da parede — o vão livre entre as faces vizinhas.
 *
 * É o que se constrói e o que se confere com a trena: a parede vai da face de
 * uma vizinha até a face da outra, não de eixo a eixo.
 *
 * ⚠️ Usa `recuoAteFace`, e NÃO `extensaoDeCanto`. A primeira versão desta
 * função usava a segunda, o que fazia o desconto sair pela espessura da própria
 * parede em vez da vizinha — certo só quando todas as paredes têm a mesma
 * espessura. Ver o quadro em `recuoAteFace`.
 *
 * Nunca negativa: numa parede mais curta que os próprios recuos (fragmento
 * entre duas aberturas) o vão livre é zero, não um número negativo.
 */
export function faceInternaMm(walls: Wall[], wall: Wall): number {
  const bruto =
    wallLength(wall) - recuoAteFace(walls, wall, 'a') - recuoAteFace(walls, wall, 'b');
  return Math.max(0, roundToMm(bruto));
}

/** Tolerância de ortogonalidade do laço, em cosseno. ~0,6° de folga. */
const COS_RETO = 0.01;

/**
 * O laço FECHADO de quatro paredes com os quatro cantos retos que contém esta
 * parede — em ordem de percurso. `null` quando não há.
 *
 * Serve ao vínculo entre lados opostos do retângulo: editar um lado tem de
 * mover o LADO inteiro do outro extremo, senão o canto abre e o retângulo vira
 * um quadrilátero irregular.
 *
 * ⚠️ **Só retângulo, e isso é decisão de produto, não preguiça.** Num laço de
 * quatro lados não retos "manter a geometria" não tem definição única — dá
 * para preservar os ângulos, os lados opostos ou a área, e as três dão
 * resultados diferentes. Fora do retângulo, o comportamento antigo continua.
 */
export function retanguloDoLaco(walls: Wall[], wall: Wall): Wall[] | null {
  const doNivel = walls.filter((w) => w.levelId === wall.levelId);
  const mesmo = (p: Point, q: Point) => p.x === q.x && p.y === q.y;

  // Caminha a partir de `wall`, sempre para a ponta ainda não visitada.
  const laco: Wall[] = [wall];
  let atual = wall;
  let vertice = wall.b;

  for (let i = 0; i < 4; i++) {
    const vizinhas = doNivel.filter(
      (o) => o.id !== atual.id && (mesmo(o.a, vertice) || mesmo(o.b, vertice)),
    );
    // Vértice com zero ou mais de uma continuação não é canto de retângulo: é
    // ponta solta ou junção em X, e nos dois casos não há laço único.
    if (vizinhas.length !== 1) return null;
    const proxima = vizinhas[0];
    if (proxima.id === wall.id) {
      // Voltou ao início: o laço fecha aqui.
      return laco.length === 4 && cantosRetos(laco) ? laco : null;
    }
    if (laco.length >= 4) return null;
    laco.push(proxima);
    vertice = mesmo(proxima.a, vertice) ? proxima.b : proxima.a;
    atual = proxima;
  }
  return null;
}

/** Os quatro cantos do laço são retos? */
function cantosRetos(laco: Wall[]): boolean {
  for (let i = 0; i < laco.length; i++) {
    const w = laco[i];
    const prox = laco[(i + 1) % laco.length];
    const u1 = versorDaParede(w);
    const u2 = versorDaParede(prox);
    if (!u1 || !u2) return false;
    if (Math.abs(u1.x * u2.x + u1.y * u2.y) > COS_RETO) return false;
  }
  return true;
}

function versorDaParede(w: Wall): { x: number; y: number } | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const comp = Math.hypot(dx, dy);
  return comp === 0 ? null : { x: dx / comp, y: dy / comp };
}

/**
 * O vértice que precisa andar JUNTO para o retângulo continuar retângulo.
 *
 * Movendo a ponta `ponta` de `wall`, o canto que ela forma anda. Sozinho, isso
 * inclina o lado perpendicular. Transladando também o OUTRO extremo desse lado
 * pelo mesmo vetor, o lado inteiro anda: os dois lados paralelos ao editado
 * ficam com o mesmo comprimento novo e os quatro ângulos seguem retos.
 *
 * `null` quando a parede não está num retângulo — e aí o chamador mantém o
 * comportamento antigo.
 */
export function verticeDeAcompanhamento(
  walls: Wall[],
  wall: Wall,
  ponta: 'a' | 'b',
): Point | null {
  const laco = retanguloDoLaco(walls, wall);
  if (!laco) return null;

  const p = wall[ponta];
  const mesmo = (x: Point, y: Point) => x.x === y.x && x.y === y.y;

  // O lado perpendicular que nasce no vértice que vai andar.
  const perpendicular = laco.find(
    (o) => o.id !== wall.id && (mesmo(o.a, p) || mesmo(o.b, p)),
  );
  if (!perpendicular) return null;

  // O outro extremo desse lado — é ele que translada junto.
  return mesmo(perpendicular.a, p) ? perpendicular.b : perpendicular.a;
}

/**
 * Invariantes do PRD §9.1 que o kernel se recusa a violar.
 * Roda a cada comando aplicado — barato, e transforma bug silencioso em erro.
 */
export function assertModelInvariants(model: BlueprintModel): void {
  for (const wall of model.walls) {
    if (wall.a.x === wall.b.x && wall.a.y === wall.b.y) {
      throw new KernelError('DEGENERATE_WALL', `Parede de comprimento zero: ${wall.id}`);
    }
    if (wall.thicknessMm <= 0) {
      throw new KernelError('BAD_THICKNESS', `Espessura não positiva em ${wall.id}`);
    }
    assertIntegerMm(wall.thicknessMm, `${wall.id}.thicknessMm`);
  }

  const seen = new Set<ObjectId>();
  for (const opening of model.openings) {
    if (seen.has(opening.id)) {
      throw new KernelError('DUPLICATE_ID', `Abertura duplicada: ${opening.id}`);
    }
    seen.add(opening.id);

    const wall = model.walls.find((w) => w.id === opening.wallId);
    if (!wall) {
      // §9.1: cada abertura tem no máximo uma parede hospedeira na mesma versão.
      throw new KernelError('ORPHAN_OPENING', `Abertura ${opening.id} sem parede hospedeira`);
    }

    const limit = wallLength(wall);
    if (opening.offsetMm < 0 || opening.offsetMm + opening.widthMm > limit) {
      throw new KernelError(
        'OPENING_OUT_OF_BOUNDS',
        `Abertura ${opening.id} excede a parede ${wall.id} (${opening.offsetMm}+${opening.widthMm} > ${limit})`,
      );
    }

    // A abertura também tem que caber na ALTURA da parede, e isso não é
    // preciosismo: o quantitativo desconta `largura × altura` da face
    // (`quantities.ts`), então uma porta mais alta que a parede produziria área
    // líquida e VOLUME NEGATIVOS — número absurdo saindo calado, no orçamento.
    //
    // A trava nasce agora porque só agora a altura virou editável. Enquanto ela
    // era um 2100 fixo dentro de uma parede de 2800, o caso era inalcançável.
    if (opening.heightMm <= 0) {
      throw new KernelError('BAD_OPENING_HEIGHT', `Altura não positiva em ${opening.id}`);
    }
    if (opening.sillMm < 0) {
      throw new KernelError('BAD_SILL', `Peitoril negativo em ${opening.id}`);
    }
    if (opening.sillMm + opening.heightMm > wall.heightMm) {
      throw new KernelError(
        'OPENING_TALLER_THAN_WALL',
        `Abertura ${opening.id} não cabe na altura da parede ${wall.id} (${opening.sillMm}+${opening.heightMm} > ${wall.heightMm})`,
      );
    }
  }

  // Duas aberturas não podem ocupar o mesmo trecho da mesma parede.
  const byWall = new Map<ObjectId, Opening[]>();
  for (const opening of model.openings) {
    const list = byWall.get(opening.wallId) ?? [];
    list.push(opening);
    byWall.set(opening.wallId, list);
  }
  for (const [wallId, list] of byWall) {
    const sorted = [...list].sort((x, y) => x.offsetMm - y.offsetMm);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.offsetMm + prev.widthMm > curr.offsetMm) {
        throw new KernelError(
          'OPENING_OVERLAP',
          `Aberturas ${prev.id} e ${curr.id} se sobrepõem na parede ${wallId}`,
        );
      }
    }
  }

  // ── Limites ──────────────────────────────────────────────────────────────
  //
  // Este laço faltava. Enquanto `AddBoundary` não tinha chamador na UI, um
  // limite degenerado era inalcançável; agora que se desenha terreno, ele passa
  // a ser um clique duplo no mesmo vértice. Limite de comprimento zero entra no
  // arranjo planar como aresta nula e some do anel do lote SEM ERRO — a área
  // sairia menor e nada na tela explicaria por quê.
  const idsDeLimite = new Set<ObjectId>();
  for (const b of model.boundaries) {
    if (idsDeLimite.has(b.id)) {
      throw new KernelError('DUPLICATE_ID', `Limite duplicado: ${b.id}`);
    }
    idsDeLimite.add(b.id);

    if (b.a.x === b.b.x && b.a.y === b.b.y) {
      throw new KernelError('DEGENERATE_BOUNDARY', `Limite de comprimento zero: ${b.id}`);
    }
    for (const [ponta, p] of [
      ['a', b.a],
      ['b', b.b],
    ] as const) {
      assertIntegerMm(p.x, `${b.id}.${ponta}.x`);
      assertIntegerMm(p.y, `${b.id}.${ponta}.y`);
    }
    if (!model.levels.some((l) => l.id === b.levelId)) {
      throw new KernelError('LEVEL_NOT_FOUND', `Limite ${b.id} num nível inexistente: ${b.levelId}`);
    }

    // Medida de escritura: mesma disciplina de milímetro inteiro do resto do
    // kernel. Não é preciosismo — ela é SUBTRAÍDA da medida desenhada para dar a
    // divergência, e um 12000,4 ali produziria um Δ fracionário que nenhuma das
    // duas medidas tem. `null` é ausência e passa direto: não se compara desenho
    // com escritura que ninguém informou.
    if (b.medidaEscrituraMm !== null && b.medidaEscrituraMm !== undefined) {
      assertIntegerMm(b.medidaEscrituraMm, `${b.id}.medidaEscrituraMm`);
      if (b.medidaEscrituraMm <= 0) {
        throw new KernelError(
          'BAD_MEDIDA_ESCRITURA',
          `Medida de escritura não positiva em ${b.id}: ${b.medidaEscrituraMm}`,
        );
      }
    }
  }

  // Área da escritura, quando informada. Inteira porque é mm², e positiva porque
  // lote de área zero não existe em matrícula nenhuma. Sem o teto de
  // `assertIntegerMm`: aquele limite é de COORDENADA, e uma área o ultrapassa
  // por construção.
  const areaEscritura = model.areaEscrituraMm2;
  if (areaEscritura !== null && areaEscritura !== undefined) {
    if (!Number.isSafeInteger(areaEscritura) || areaEscritura <= 0) {
      throw new KernelError(
        'BAD_AREA_ESCRITURA',
        `Área de escritura deve ser mm² inteiro positivo; recebido ${areaEscritura}`,
      );
    }
  }
}
