/**
 * Modelo canônico do kernel — as entidades do PRD §12.1.
 *
 * Regra estrutural: IDs são atribuídos por um contador determinístico do próprio
 * modelo, NUNCA por `crypto.randomUUID()`. Um UUID aleatório mudaria o payload
 * canônico a cada execução e tornaria o critério do Spike A (igualdade bit a bit)
 * impossível de satisfazer por construção.
 */

import { KernelError, assertIntegerMm } from './units';
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
  kind: 'door' | 'window' | 'passage';
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
export function nomeDoTipoDeAbertura(kind: Opening['kind']): string {
  if (kind === 'door') return 'Porta';
  if (kind === 'window') return 'Janela';
  return 'Vão livre';
}

/** Limite sem material físico — divide ambiente sem existir como parede. */
export interface Boundary {
  id: ObjectId;
  levelId: ObjectId;
  a: Point;
  b: Point;
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

/**
 * Onde cada ponta PARA depois de deslocar um conjunto de paredes.
 *
 * Devolve só as paredes que se mexem, com as pontas novas. Não altera nada: é
 * a conta, separada de quem a aplica.
 *
 * Existe separada do comando `TranslateWalls` para que a PRÉVIA do arraste e o
 * COMANDO gravado sejam a mesma geometria. Uma prévia que não bate com o
 * resultado ensina o usuário a não confiar nela — e a alternativa, reimplementar
 * a regra no renderizador, é a cópia que diverge em silêncio (foi assim que a
 * regra de ponta livre ficou certa na tela e errada no papel).
 *
 * `arrastarVizinhas` distingue MOVER de ESTICAR: ligado, a ponta de uma parede
 * NÃO selecionada que compartilha vértice com a seleção anda junto; desligado, o
 * bloco se desprende, mantendo as próprias medidas.
 */
export function pontasDeslocadas(
  walls: Wall[],
  wallIds: ObjectId[],
  delta: Point,
  arrastarVizinhas: boolean,
): Map<ObjectId, { a: Point; b: Point }> {
  const selecionadas = new Set(wallIds);
  const alvos = walls.filter((w) => selecionadas.has(w.id));

  // OS VÉRTICES ORIGINAIS, ANTES DE QUALQUER DESLOCAMENTO. Deslocar primeiro e
  // procurar as vizinhas depois casaria com o lugar novo — e o lugar novo é
  // justamente onde a vizinha NÃO está.
  const vertices = new Set<string>();
  for (const w of alvos) {
    vertices.add(pointKey(w.a));
    vertices.add(pointKey(w.b));
  }

  const andar = (p: Point): Point => ({ x: p.x + delta.x, y: p.y + delta.y });
  const saida = new Map<ObjectId, { a: Point; b: Point }>();

  for (const w of alvos) saida.set(w.id, { a: andar(w.a), b: andar(w.b) });

  if (arrastarVizinhas) {
    for (const w of walls) {
      if (selecionadas.has(w.id)) continue;
      // Igualdade EXATA de coordenada, o mesmo casamento que o editor já usa
      // para esticar uma parede arrastando o canto junto: no kernel os vértices
      // são milímetro inteiro, e uma junção só existe quando as duas pontas
      // caem no mesmo ponto.
      const mexeA = vertices.has(pointKey(w.a));
      const mexeB = vertices.has(pointKey(w.b));
      if (!mexeA && !mexeB) continue;
      saida.set(w.id, { a: mexeA ? andar(w.a) : w.a, b: mexeB ? andar(w.b) : w.b });
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
}
