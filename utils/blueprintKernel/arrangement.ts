/**
 * Arranjo planar e extração de ambientes (PRD §12.2).
 *
 * Pipeline: eixos de parede/limite → snap de vértices por tolerância → divisão em
 * todas as interseções → grafo planar → half-edges → faces → descarte da face
 * externa → associação de buracos (ilhas) → ambientes.
 *
 * DETERMINISMO. Toda estrutura intermediária é ordenada explicitamente antes de ser
 * percorrida. Nada aqui depende da ordem de inserção em Map/Set nem da ordem em que
 * o usuário desenhou as paredes: dois roteiros de comando que produzem a mesma
 * geometria têm que produzir o mesmo conjunto de faces, na mesma ordem, com os
 * mesmos IDs. É esse o critério de saída do Spike A.
 */

import {
  type Point,
  type Segment,
  canonicalizeRing,
  cantoEntreEixos,
  cross,
  distanceSq,
  intersectSegments,
  isInteriorCut,
  pointInPolygon,
  pointKey,
  pointsEqual,
  polygonArea,
  polygonPerimeter,
  signedArea,
} from './geom';
import { DEFAULT_TOLERANCE_MM } from './units';
import type { BlueprintModel, Level, Space } from './model';

interface Edge {
  from: number; // índice de vértice
  to: number;
}

interface HalfEdge {
  from: number;
  to: number;
  /** Ângulo de saída, usado só para ordenar o leque em torno do vértice. */
  angle: number;
  visited: boolean;
}

/**
 * Agrupa vértices a até `tolerance` mm num representante único.
 *
 * Ordena os pontos antes de agrupar. Sem essa ordenação o representante do grupo
 * dependeria de quem chegou primeiro, e desenhar as mesmas paredes em outra ordem
 * moveria um vértice por 1–2 mm — mudando o hash sem mudar o desenho.
 */
function snapVertices(
  raw: Point[],
  tolerance: number,
): { vertices: Point[]; indexOf: (p: Point) => number } {
  const sorted = [...raw].sort((p, q) => (p.x !== q.x ? p.x - q.x : p.y - q.y));

  const vertices: Point[] = [];
  const assignment = new Map<string, number>();

  // Malha uniforme de lado = tolerância. Um vértice a até `tolerance` de `p` está
  // necessariamente numa das 9 células vizinhas, então a busca deixa de varrer
  // todos os vértices já criados e passa a olhar um punhado.
  //
  // Isso era o gargalo real do arranjo: a varredura linear custava O(V²) e, numa
  // planta de 20 mil paredes, sozinha respondia pela maior parte dos 11,5 s.
  const cells = new Map<number, number[]>();
  const cellOf = (v: number) => Math.floor(v / tolerance);
  const cellKey = (cx: number, cy: number) => (cx + 250_000) * 500_001 + (cy + 250_000);

  const findNear = (p: Point): number => {
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    // Menor índice entre os candidatos: preserva exatamente o critério antigo de
    // "o primeiro vértice dentro da tolerância", e com ele o resultado canônico.
    let best = -1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = cells.get(cellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const index of bucket) {
          if (best !== -1 && index >= best) continue;
          if (distanceSq(vertices[index], p) <= tolerance * tolerance) best = index;
        }
      }
    }
    return best;
  };

  for (const p of sorted) {
    const key = pointKey(p);
    if (assignment.has(key)) continue;

    let found = findNear(p);
    if (found === -1) {
      vertices.push({ x: p.x, y: p.y });
      found = vertices.length - 1;
      const k = cellKey(cellOf(p.x), cellOf(p.y));
      const bucket = cells.get(k);
      if (bucket) bucket.push(found);
      else cells.set(k, [found]);
    }
    assignment.set(key, found);
  }

  const indexOf = (p: Point): number => {
    const direct = assignment.get(pointKey(p));
    if (direct !== undefined) return direct;
    return findNear(p);
  };

  return { vertices, indexOf };
}

/**
 * Componentes conexos do grafo, por union-find.
 *
 * Serve à contenção de buracos: num grafo CONEXO nenhuma face limitada contém
 * outra — todas são faces mínimas da mesma subdivisão. Aninhamento só existe entre
 * componentes distintos (a ilha solta dentro da sala). Saber disso derruba o teste
 * de contenção de O(F²) para "só entre componentes diferentes", que numa planta
 * comum — um único componente — é zero teste.
 */
function connectedComponents(vertexCount: number, edges: Edge[]): number[] {
  const parent = Array.from({ length: vertexCount }, (_, i) => i);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };

  for (const e of edges) {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent[a] = b;
  }

  return parent.map((_, i) => find(i));
}

/**
 * Divide cada segmento em todos os pontos onde outro segmento o toca ou cruza.
 * Depois disso, dois segmentos só compartilham vértices — nunca se cruzam no meio,
 * que é a pré-condição do grafo planar.
 */
function splitAtIntersections(segments: Segment[]): Segment[] {
  const n = segments.length;
  const cutPoints: Point[][] = segments.map(() => []);

  const boxes = segments.map((s) => ({
    minX: Math.min(s.a.x, s.b.x),
    minY: Math.min(s.a.y, s.b.y),
    maxX: Math.max(s.a.x, s.b.x),
    maxY: Math.max(s.a.y, s.b.y),
  }));

  // Malha uniforme sobre as caixas dos segmentos: dois segmentos só podem se cruzar
  // se dividirem alguma célula. Substitui as n²/2 comparações por uma varredura
  // proporcional à densidade local.
  //
  // Lado da célula = extensão média de um segmento, para que a parede típica cubra
  // poucas células. Derivado dos dados, portanto determinístico.
  let extentSum = 0;
  for (const b of boxes) extentSum += Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const cell = Math.max(1, Math.ceil(extentSum / Math.max(1, n)));

  const buckets = new Map<number, number[]>();
  const cellKey = (cx: number, cy: number) => (cx + 2_000_000) * 4_000_003 + (cy + 2_000_000);

  const candidates = new Set<number>();

  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    const x0 = Math.floor(b.minX / cell);
    const x1 = Math.floor(b.maxX / cell);
    const y0 = Math.floor(b.minY / cell);
    const y1 = Math.floor(b.maxY / cell);

    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = cellKey(cx, cy);
        const bucket = buckets.get(k);
        if (bucket) {
          for (const j of bucket) candidates.add(j * n + i); // j < i sempre
          bucket.push(i);
        } else {
          buckets.set(k, [i]);
        }
      }
    }
  }

  for (const encoded of candidates) {
    // `lo` e `hi`, não `i` e `j`: a chave é `menor * n + maior`, então o quociente é
    // o MENOR índice. Chamar `intersectSegments` sempre com (menor, maior) importa —
    // ela parametriza a interseção sobre o primeiro argumento, e o arredondamento
    // do ponto depende disso. Inverter aqui produziria cortes 1 mm diferentes dos da
    // versão sem índice, e o payload canônico deixaria de bater.
    const lo = Math.floor(encoded / n);
    const hi = encoded % n;

    // Caixas disjuntas não se cruzam: rejeição barata antes da conta cara.
    const blo = boxes[lo];
    const bhi = boxes[hi];
    if (
      blo.maxX < bhi.minX ||
      bhi.maxX < blo.minX ||
      blo.maxY < bhi.minY ||
      bhi.maxY < blo.minY
    ) {
      continue;
    }

    const hit = intersectSegments(segments[lo], segments[hi]);

    if (hit.kind === 'point' && hit.at) {
      if (isInteriorCut(segments[lo].a, segments[lo].b, hit.at)) cutPoints[lo].push(hit.at);
      if (isInteriorCut(segments[hi].a, segments[hi].b, hit.at)) cutPoints[hi].push(hit.at);
    } else if (hit.kind === 'overlap' && hit.overlap) {
      for (const end of [hit.overlap.a, hit.overlap.b]) {
        if (isInteriorCut(segments[lo].a, segments[lo].b, end)) cutPoints[lo].push(end);
        if (isInteriorCut(segments[hi].a, segments[hi].b, end)) cutPoints[hi].push(end);
      }
    }
  }

  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const s = segments[i];

    // Dedupe por chave, e ORDEM TOTAL na comparação: distância, depois x, depois y.
    //
    // Só a distância não basta. Dois cortes distintos podem empatar em distância —
    // são pontos arredondados, não exatamente sobre a reta — e aí o resultado
    // passaria a depender da ordem em que os pares foram descobertos. Com o índice
    // espacial essa ordem mudou, então a ordem total deixou de ser cosmética e
    // virou o que mantém o payload canônico idêntico ao da versão sem índice.
    const deduped: Point[] = [];
    const seen = new Set<string>();
    for (const p of cutPoints[i]) {
      const key = pointKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }

    const cuts = deduped.sort((p, q) => {
      const d = distanceSq(s.a, p) - distanceSq(s.a, q);
      if (d !== 0) return d;
      return p.x !== q.x ? p.x - q.x : p.y - q.y;
    });

    let cursor = s.a;
    for (const cut of cuts) {
      if (!pointsEqual(cursor, cut)) out.push({ a: cursor, b: cut });
      cursor = cut;
    }
    if (!pointsEqual(cursor, s.b)) out.push({ a: cursor, b: s.b });
  }
  return out;
}

/**
 * Percorre as half-edges sempre virando o mais à direita possível.
 *
 * Essa regra de giro é o que faz cada ciclo fechar uma face mínima. Trocá-la por
 * "mais à esquerda" inverteria a orientação de todas as faces e a face externa
 * mudaria de sinal — motivo pelo qual ela não é uma preferência, e sim parte do
 * contrato do kernel.
 */
function extractFaces(vertices: Point[], edges: Edge[]): number[][] {
  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();

  const addHalf = (from: number, to: number) => {
    const dx = vertices[to].x - vertices[from].x;
    const dy = vertices[to].y - vertices[from].y;
    const index = halfEdges.length;
    halfEdges.push({ from, to, angle: Math.atan2(dy, dx), visited: false });
    const list = outgoing.get(from) ?? [];
    list.push(index);
    outgoing.set(from, list);
  };

  for (const e of edges) {
    addHalf(e.from, e.to);
    addHalf(e.to, e.from);
  }

  // Leque de saída de cada vértice, ordenado por ângulo. Desempate pelo destino
  // mantém a ordem estável quando duas arestas saem exatamente na mesma direção.
  for (const [vertex, list] of outgoing) {
    list.sort((x, y) => {
      const d = halfEdges[x].angle - halfEdges[y].angle;
      return d !== 0 ? d : halfEdges[x].to - halfEdges[y].to;
    });
    outgoing.set(vertex, list);
  }

  const faces: number[][] = [];

  // Percorrer as half-edges em ordem de índice — determinístico.
  for (let start = 0; start < halfEdges.length; start++) {
    if (halfEdges[start].visited) continue;

    const cycle: number[] = [];
    let current = start;
    let guard = 0;

    while (!halfEdges[current].visited) {
      if (guard++ > halfEdges.length * 2) break; // grafo inconsistente
      halfEdges[current].visited = true;
      cycle.push(halfEdges[current].from);

      // Próxima: a gêmea da atual, girando um passo no leque do vértice de chegada.
      const arrivedAt = halfEdges[current].to;
      const twin = current % 2 === 0 ? current + 1 : current - 1;
      const fan = outgoing.get(arrivedAt) ?? [];
      const pos = fan.indexOf(twin);
      if (pos === -1) break;
      current = fan[(pos - 1 + fan.length) % fan.length];
    }

    if (cycle.length >= 3) faces.push(cycle);
  }

  return faces;
}

export interface ArrangementResult {
  spaces: Space[];
  /** Vértices de grau 1: pontas soltas que impedem o ambiente de fechar. */
  danglingVertices: Point[];
}

/**
 * Reconstrói os ambientes de um nível a partir das paredes e limites.
 *
 * A face não limitada de cada componente é descartada por ter área com sinal
 * negativo na convenção de giro adotada. Anel contido em outro vira buraco do menor
 * anel que o contém — e continua sendo ambiente por direito próprio.
 */
export function buildArrangement(
  model: BlueprintModel,
  level: Level,
  tolerance = DEFAULT_TOLERANCE_MM,
): ArrangementResult {
  const rawSegments: Segment[] = [
    ...model.walls.filter((w) => w.levelId === level.id).map((w) => ({ a: w.a, b: w.b })),
    // ⚠️ SÓ os limites `DIVISA`. O contorno de TERRENO fica FORA do arranjo, e
    // isso não é detalhe: um anel de lote em volta da casa fecharia uma face, a
    // face viraria `Space`, e `computeQuantities` derivaria PISO dela. Medido:
    // uma casa de 18,67 m² num lote de 30×30 passava a somar 900 m² de piso no
    // orçamento. Era o mesmo estrago que a ferramenta Parede faria com alvenaria
    // — só que na outra linha da planilha.
    //
    // `DIVISA` continua entrando, e é o que preserva o caso 11 (limite sem
    // material divide o ambiente como uma parede dividiria): dividir cômodo é
    // justamente o que ela sempre significou.
    ...model.boundaries
      .filter((b) => b.levelId === level.id && b.kind !== 'TERRENO')
      .map((b) => ({ a: b.a, b: b.b })),
  ];

  if (rawSegments.length === 0) return { spaces: [], danglingVertices: [] };

  const split = splitAtIntersections(rawSegments);
  const endpoints = split.flatMap((s) => [s.a, s.b]);
  const { vertices, indexOf } = snapVertices(endpoints, tolerance);

  // Arestas únicas e não degeneradas, com orientação normalizada (menor→maior).
  const edgeSet = new Map<string, Edge>();
  for (const s of split) {
    const from = indexOf(s.a);
    const to = indexOf(s.b);
    if (from === -1 || to === -1 || from === to) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    edgeSet.set(`${lo}-${hi}`, { from: lo, to: hi });
  }

  const edges = [...edgeSet.values()].sort((x, y) =>
    x.from !== y.from ? x.from - y.from : x.to - y.to,
  );

  const degree = new Map<number, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const danglingVertices = [...degree.entries()]
    .filter(([, d]) => d === 1)
    .map(([v]) => vertices[v])
    .sort((p, q) => (p.x !== q.x ? p.x - q.x : p.y - q.y));

  const cycles = extractFaces(vertices, edges);

  // Face LIMITADA tem área com sinal positivo; a face não limitada de cada
  // componente conexo vem negativa. A propriedade é do sentido de giro escolhido em
  // `extractFaces` e foi verificada contra a geometria de ilha do caso 09.
  //
  // Filtrar por SINAL, e não por "a maior área é a externa": com componentes
  // desconexos (uma ilha solta dentro de uma sala) a maior área é justamente a sala
  // externa — um ambiente real — e a heurística de tamanho a descartava.
  const component = connectedComponents(vertices.length, edges);

  const boundedCycles = cycles.filter(
    (cycle) => cycle.length >= 3 && signedArea(cycle.map((i) => vertices[i])) > 0,
  );

  // Deduplicar por Set: o mesmo anel pode ser alcançado por mais de um ponto de
  // partida. O `some()` anterior recomparava strings contra tudo que já existia —
  // O(F²) com alocação de string em cada passo.
  const unique: Point[][] = [];
  const uniqueComponent: number[] = [];
  const seen = new Set<string>();

  for (const cycle of boundedCycles) {
    const ring = canonicalizeRing(cycle.map((i) => vertices[i]));
    const key = ring.map(pointKey).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ring);
    uniqueComponent.push(component[cycle[0]]);
  }

  // Caixas envolventes, para rejeitar contenção sem tocar no polígono.
  const boxes = unique.map((ring) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  });
  const areas = unique.map(polygonArea);

  // Contenção: um anel dentro de outro é buraco do MENOR anel que o contém — o
  // imediato, não qualquer ancestral, senão um aninhamento triplo descontaria a
  // mesma área duas vezes.
  //
  // O anel contido continua sendo ambiente por direito próprio: uma sala fechada
  // dentro de um salão é ao mesmo tempo o vazio do salão e um cômodo utilizável.
  //
  // Só faces de COMPONENTES DIFERENTES podem se conter (ver `connectedComponents`),
  // e basta testar UM vértice: faces de um mesmo arranjo planar nunca se cruzam
  // parcialmente, então ou o anel está inteiro dentro ou inteiro fora.
  const holesOf = new Map<number, Point[][]>();

  for (let i = 0; i < unique.length; i++) {
    let container = -1;
    for (let j = 0; j < unique.length; j++) {
      if (i === j) continue;
      if (uniqueComponent[i] === uniqueComponent[j]) continue;
      if (areas[j] <= areas[i]) continue;
      if (container !== -1 && areas[j] >= areas[container]) continue;
      const bi = boxes[i];
      const bj = boxes[j];
      if (bi.minX < bj.minX || bi.minY < bj.minY || bi.maxX > bj.maxX || bi.maxY > bj.maxY) {
        continue;
      }
      if (!pointInPolygon(unique[j], unique[i][0])) continue;
      container = j;
    }
    if (container !== -1) {
      const list = holesOf.get(container) ?? [];
      list.push(unique[i]);
      holesOf.set(container, list);
    }
  }

  const spaces: Space[] = [];
  let ordinal = 0;

  const ordered = unique
    .map((ring, index) => ({ ring, index }))
    // Ordem canônica: pelo vértice inicial, não pela ordem de descoberta.
    .sort((a, b) => {
      const pa = a.ring[0];
      const pb = b.ring[0];
      return pa.x !== pb.x ? pa.x - pb.x : pa.y - pb.y;
    });

  for (const { ring, index } of ordered) {
    const holes = (holesOf.get(index) ?? []).sort((a, b) => {
      const pa = a[0];
      const pb = b[0];
      return pa.x !== pb.x ? pa.x - pb.x : pa.y - pb.y;
    });

    const grossArea = polygonArea(ring);
    const holeArea = holes.reduce((sum, h) => sum + polygonArea(h), 0);

    ordinal += 1;
    spaces.push({
      id: `spc_${level.id}_${String(ordinal).padStart(4, '0')}`,
      levelId: level.id,
      ring,
      holes,
      areaMm2: grossArea - holeArea,
      perimeterMm: polygonPerimeter(ring),
    });
  }

  return { spaces, danglingVertices };
}

/** Recalcula os ambientes de todos os níveis. Único caminho que escreve `spaces`. */
export function recomputeSpaces(
  model: BlueprintModel,
  tolerance = DEFAULT_TOLERANCE_MM,
): BlueprintModel {
  const levels = [...model.levels].sort((a, b) => a.id.localeCompare(b.id));
  const spaces: Space[] = [];
  for (const level of levels) {
    spaces.push(...buildArrangement(model, level, tolerance).spaces);
  }
  model.spaces = spaces;
  aplicarEtiquetas(model);
  return model;
}

/**
 * Religa as etiquetas aos ambientes, por conter o ponto.
 *
 * Roda depois de TODA rederivação, e é o que faz o nome sobreviver a mover uma
 * parede: o ambiente é outro objeto, com id novo, mas continua contendo o ponto
 * onde o usuário escreveu o nome.
 *
 * Etiqueta dentro de um buraco (ilha) não conta — ali não há piso, e o ambiente
 * que a "contém" pelo anel externo não é o que está embaixo dela.
 *
 * Duas etiquetas no mesmo ambiente: vence a de id menor, que é a mais antiga.
 * Determinístico de propósito — se dependesse da ordem de derivação, o mesmo
 * desenho poderia sair com nomes diferentes.
 */
function aplicarEtiquetas(model: BlueprintModel): void {
  const labels = [...(model.labels ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  if (labels.length === 0) return;

  for (const space of model.spaces) {
    for (const label of labels) {
      if (label.levelId !== space.levelId) continue;
      if (!pointInPolygon(space.ring, label.at)) continue;
      if (space.holes.some((h) => pointInPolygon(h, label.at))) continue;
      space.name = label.name;
      break;
    }
  }
}

/** Exposto para os testes de junção: quantas arestas incidem em cada vértice. */
export function vertexDegrees(
  model: BlueprintModel,
  level: Level,
  tolerance = DEFAULT_TOLERANCE_MM,
): Map<string, number> {
  const rawSegments: Segment[] = [
    ...model.walls.filter((w) => w.levelId === level.id).map((w) => ({ a: w.a, b: w.b })),
    // ⚠️ SÓ os limites `DIVISA`. O contorno de TERRENO fica FORA do arranjo, e
    // isso não é detalhe: um anel de lote em volta da casa fecharia uma face, a
    // face viraria `Space`, e `computeQuantities` derivaria PISO dela. Medido:
    // uma casa de 18,67 m² num lote de 30×30 passava a somar 900 m² de piso no
    // orçamento. Era o mesmo estrago que a ferramenta Parede faria com alvenaria
    // — só que na outra linha da planilha.
    //
    // `DIVISA` continua entrando, e é o que preserva o caso 11 (limite sem
    // material divide o ambiente como uma parede dividiria): dividir cômodo é
    // justamente o que ela sempre significou.
    ...model.boundaries
      .filter((b) => b.levelId === level.id && b.kind !== 'TERRENO')
      .map((b) => ({ a: b.a, b: b.b })),
  ];
  const split = splitAtIntersections(rawSegments);
  const { vertices, indexOf } = snapVertices(
    split.flatMap((s) => [s.a, s.b]),
    tolerance,
  );

  const seen = new Set<string>();
  const degree = new Map<string, number>();
  for (const s of split) {
    const from = indexOf(s.a);
    const to = indexOf(s.b);
    if (from === -1 || to === -1 || from === to) continue;
    const key = `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const v of [from, to]) {
      const k = pointKey(vertices[v]);
      degree.set(k, (degree.get(k) ?? 0) + 1);
    }
  }
  return degree;
}

/** Ângulo assinado usado nos testes de orientação de junção. */
export function turnAt(a: Point, b: Point, c: Point): number {
  return cross(a, b, c);
}

/** Uma ponta que encosta noutra parede sem alcançar a geometria dela. */
export interface EncostoSemJuncao {
  wallId: string;
  end: 'a' | 'b';
  /** O pé da perpendicular no EIXO da hospedeira — para onde a ponta tem de ir. */
  to: Point;
  hostId: string;
  /** Quanto a ponta anda, em mm. Sempre ≤ meia espessura da hospedeira. */
  distanciaMm: number;
}

/**
 * Pontas que PARECEM ligadas e não estão: morrem na FACE de outra parede, sem
 * alcançar o EIXO dela.
 *
 * ─── O DEFEITO QUE ISTO RESOLVE ─────────────────────────────────────────────
 *
 * Medido na planta de um usuário em 23/08/2026, gerada de PDF: 35 paredes, 22
 * vértices de grau 1 e **zero ambientes**. Treze dessas pontas paravam a 11–100
 * mm do eixo da parede que deveriam encontrar — exatamente meia espessura dela.
 *
 * No desenho o T parece perfeito, porque a faixa de espessura da ponta invade a
 * faixa da hospedeira e as duas se sobrepõem. No MODELO, que é feito de eixos,
 * a ponta está solta: o arranjo não divide a hospedeira, o grafo não fecha, e
 * nenhum ambiente aparece. É o pior tipo de defeito — o desenho afirma uma coisa
 * e o modelo outra, sem nada na tela denunciando a diferença.
 *
 * Levando as treze ao eixo: 0 → 5 ambientes, e os vértices de grau 3 (T de
 * verdade) sobem de 4 para 17.
 *
 * ─── POR QUE O CRITÉRIO É O ARRANJO, E NÃO A COINCIDÊNCIA DE COORDENADA ─────
 *
 * Grau 1 aqui é grau no GRAFO PLANAR, depois do snap por tolerância e da divisão
 * nas interseções. Contar coincidência exata de coordenada acharia 28 pontas
 * nessa mesma planta — seis delas já resolvidas pelo arranjo (unificadas pela
 * tolerância de 5 mm, ou já dividindo a hospedeira). Mover essas seis mexeria em
 * junção que já funciona.
 *
 * ─── AS DUAS TRAVAS ─────────────────────────────────────────────────────────
 *
 * 1. o encontro cai no INTERIOR da hospedeira (junção em T), ou no extremo dela
 *    **desde que aquele extremo já seja junção** — encostar num vértice que
 *    existe é entrar na topologia, não inventá-la. Extremo também solto é caso
 *    de `cantosEncostados`, que move as duas pontas;
 * 2. a distância é no máximo MEIA ESPESSURA da hospedeira — a ponta tem de estar
 *    DENTRO da faixa desenhada dela. Fora disso não é "parece ligado", é um vão,
 *    e fechar vão é decisão de quem conhece o projeto.
 *
 * ⚠️ A trava 1 já foi só "interior". Com ela, na planta do usuário sobravam sete
 * pontas encostadas a 25–100 mm de um vértice que JÁ era junção — o desenho
 * mostrava o canto fechado e o modelo não. Ele olhou a tela e disse "não
 * funcionou", com razão.
 */
export function encostosSemJuncao(
  model: BlueprintModel,
  level: Level,
  tolerance = DEFAULT_TOLERANCE_MM,
): EncostoSemJuncao[] {
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  if (paredes.length === 0) return [];

  const graus = vertexDegrees(model, level, tolerance);
  // Índice em malha de lado = tolerância, o mesmo truque de `snapVertices`: o
  // vértice do arranjo está a no máximo `tolerance` da ponta, logo cai numa das
  // 9 células vizinhas. Sem isto seria uma varredura de todos os vértices por
  // ponta — O(V²), que é justamente o gargalo que o arranjo já pagou para tirar.
  const celula = (v: number) => Math.floor(v / tolerance);
  const chave = (cx: number, cy: number) => `${cx}:${cy}`;
  const malha = new Map<string, { p: Point; grau: number }[]>();
  for (const [k, grau] of graus) {
    const [x, y] = k.split(',').map(Number);
    const ck = chave(celula(x), celula(y));
    const balde = malha.get(ck);
    if (balde) balde.push({ p: { x, y }, grau });
    else malha.set(ck, [{ p: { x, y }, grau }]);
  }
  const grauDe = (p: Point): number => {
    const cx = celula(p.x);
    const cy = celula(p.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const v of malha.get(chave(cx + dx, cy + dy)) ?? []) {
          if (distanceSq(v.p, p) <= tolerance * tolerance) return v.grau;
        }
      }
    }
    return 0;
  };

  const achados: EncostoSemJuncao[] = [];
  for (const w of paredes) {
    for (const end of ['a', 'b'] as const) {
      const p = w[end];
      if (grauDe(p) !== 1) continue;

      let melhor: EncostoSemJuncao | null = null;
      for (const o of paredes) {
        if (o.id === w.id) continue;
        const dx = o.b.x - o.a.x;
        const dy = o.b.y - o.a.y;
        const comp2 = dx * dx + dy * dy;
        if (comp2 === 0) continue;
        const uBruto = ((p.x - o.a.x) * dx + (p.y - o.a.y) * dy) / comp2;
        const u = Math.max(0, Math.min(1, uBruto));
        // TRAVA 1: se o encontro cai no EXTREMO da hospedeira, ele só vale quando
        // aquele extremo JÁ É JUNÇÃO — aí encostar nele é entrar num vértice que
        // existe, e o resultado é topologia a mais.
        //
        // Se o extremo também estiver solto, são DUAS pontas soltas se
        // sobrepondo, e mover só uma delas deixaria a outra pendurada no meio do
        // nada. Esse caso é `cantosEncostados`, que move as duas para o encontro
        // dos eixos.
        const noExtremo = uBruto <= 0.001 || uBruto >= 0.999;
        const extremo = uBruto <= 0.001 ? o.a : o.b;
        if (noExtremo && grauDe(extremo) <= 1) continue;
        const pe = noExtremo
          ? { x: extremo.x, y: extremo.y }
          : { x: Math.round(o.a.x + u * dx), y: Math.round(o.a.y + u * dy) };
        const d = Math.hypot(pe.x - p.x, pe.y - p.y);
        // TRAVA 2: dentro da faixa desenhada da hospedeira.
        if (d > o.thicknessMm / 2) continue;
        // Já está no eixo: o arranjo resolve sozinho, nada a mover.
        if (d === 0) continue;
        if (!melhor || d < melhor.distanciaMm) {
          melhor = { wallId: w.id, end, to: pe, hostId: o.id, distanciaMm: Math.round(d) };
        }
      }
      if (melhor) achados.push(melhor);
    }
  }

  // Ordem determinística: dois carregamentos da mesma planta têm de produzir o
  // mesmo lote, na mesma ordem, ou o hash do rascunho passa a variar sozinho.
  achados.sort((x, y) => (x.wallId === y.wallId ? x.end.localeCompare(y.end) : x.wallId.localeCompare(y.wallId)));
  return achados;
}

/** Duas pontas soltas que se encostam num canto sem chegar ao encontro dos eixos. */
export interface CantoEncostado {
  /** As duas pontas que andam. Sempre duas: canto é encontro, não encosto. */
  movimentos: { wallId: string; end: 'a' | 'b'; to: Point }[];
  distanciaMm: number;
}

/**
 * Cantos que PARECEM fechados e não estão: cada ponta morre dentro da faixa de
 * espessura da outra, sem que os dois eixos se encontrem.
 *
 * ─── POR QUE ISTO É AUTOMÁTICO E A FERRAMENTA `Juntar` NÃO É ────────────────
 *
 * A ferramenta existe para o canto que o usuário VÊ aberto — as duas pontas
 * longe uma da outra, e a decisão de fechar (ou deixar aberto, como a borda de
 * um terraço) é dele. Aqui é outra coisa: as duas pontas se sobrepõem no
 * desenho. Uma folga de 25 mm entre paredes de 20 cm não é decisão de projeto,
 * é resto do vetorizador — e o desenho já afirma que o canto está fechado.
 *
 * Medido na planta do usuário depois da primeira rodada de conexão em T: das
 * dez pontas que sobraram, SETE eram isto, com folgas de 25 a 100 mm. O usuário
 * olhou a tela e disse "não funcionou", com razão: para quem vê a planta, um
 * canto sobreposto e um canto ligado são a mesma coisa.
 *
 * ─── A TRAVA ────────────────────────────────────────────────────────────────
 *
 * As DUAS pontas têm de estar soltas (grau 1) e cada uma dentro da faixa da
 * outra. Encostar numa parede cuja ponta já está ligada a um terceiro trecho
 * não é canto aberto — é um T, e T tem `encostosEmT`, que não move a hospedeira.
 */
export function cantosEncostados(
  model: BlueprintModel,
  level: Level,
  tolerance = DEFAULT_TOLERANCE_MM,
): CantoEncostado[] {
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  if (paredes.length < 2) return [];

  const graus = vertexDegrees(model, level, tolerance);
  const grauDe = (p: Point): number => {
    for (const [k, g] of graus) {
      const [x, y] = k.split(',').map(Number);
      if (Math.hypot(x - p.x, y - p.y) <= tolerance) return g;
    }
    return 0;
  };

  const soltas: { wallId: string; end: 'a' | 'b'; p: Point; oposta: Point; meia: number }[] = [];
  for (const w of paredes) {
    for (const end of ['a', 'b'] as const) {
      if (grauDe(w[end]) !== 1) continue;
      soltas.push({
        wallId: w.id,
        end,
        p: w[end],
        oposta: end === 'a' ? w.b : w.a,
        meia: w.thicknessMm / 2,
      });
    }
  }

  const achados: CantoEncostado[] = [];
  const usada = new Set<string>();
  // Ordem determinística antes de parear: o par escolhido não pode depender da
  // ordem em que as paredes entraram no modelo.
  soltas.sort((a, b) => `${a.wallId}${a.end}`.localeCompare(`${b.wallId}${b.end}`));

  for (let i = 0; i < soltas.length; i++) {
    for (let j = i + 1; j < soltas.length; j++) {
      const a = soltas[i];
      const b = soltas[j];
      if (a.wallId === b.wallId) continue;
      const ka = `${a.wallId}:${a.end}`;
      const kb = `${b.wallId}:${b.end}`;
      if (usada.has(ka) || usada.has(kb)) continue;

      // Cada ponta dentro da faixa DESENHADA da outra — é o que faz o canto
      // parecer fechado na tela.
      const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
      if (d === 0) continue;
      if (d > a.meia + b.meia) continue;

      const canto = cantoEntreEixos(a.oposta, a.p, b.oposta, b.p);
      if (!canto) continue;

      usada.add(ka);
      usada.add(kb);
      achados.push({
        movimentos: [
          { wallId: a.wallId, end: a.end, to: canto },
          { wallId: b.wallId, end: b.end, to: canto },
        ],
        distanciaMm: Math.round(d),
      });
    }
  }
  return achados;
}
