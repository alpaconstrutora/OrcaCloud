/**
 * ROTA DE FUGA E PERCURSO MÁXIMO (01/10/2026, E6.3 do roadmap de incêndio; vai
 * além do AltoQi).
 *
 * De cada ambiente, a distância a percorrer até uma SAÍDA DE VERDADE — porta
 * para o exterior no pavimento de DESCARGA (a porta da varanda do 5º andar não
 * é saída) —, passando pelas portas e DESCENDO pelas escadas, a partir do
 * ponto MAIS DESFAVORÁVEL do ambiente. Dentro do ambiente o caminho contorna
 * as paredes (reto quando cabe; pelos vértices do contorno no ambiente em L).
 * A rota é uma polilinha DERIVADA por pavimento — nada é gravado.
 *
 * O grafo: nós = portas (por pavimento) e "bocas" das escadas (o começo do
 * eixo na partida, o fim na chegada, e em cada pavimento intermediário de uma
 * escada multiandares); arestas = pares de nós do mesmo ambiente (a distância
 * por dentro dele), lances de escada (comprimento inclinado) e porta de saída →
 * exterior. Dijkstra a partir do exterior.
 *
 * NORMA: com os critérios da IT 08 do CBMMG (D1.2, `criterios`), o limite é o da Tabela 5 POR
 * AMBIENTE (térreo × demais, uma × mais saídas, detecção, chuveiros, tipo X/Y/Z) e a distância que
 * se compara é o CAMINHAMENTO até o local seguro — o exterior ou a ESCADA (5.5.2.1) —, não a rota
 * inteira até a rua. Nos edifícios de apartamentos (A-2) ela conta da porta da unidade (5.5.2.2):
 * os ambientes de dentro das unidades não são medidos; o corredor comum, sim. Sem critérios, o
 * limite antigo por grupo (de memória, CONFERIR).
 */
import { pointInPolygon, type BlueprintModel, type Escada, type ObjectId, type Point, type Space } from './blueprintKernel';
import { construirGrafoEspacial } from './blueprintGrafoEspacial';
import { usoDoNome } from './blueprintPrograma';
import { FONTE_IT08_MG, limiteDaTabela5, type CriteriosDoPercursoMG } from './blueprintIncendioSaidasMG';

export const FONTE_PERCURSO = 'IT de saídas de emergência do CBMMG / NBR 9077 — CONFERIR NA IT (transcrito de memória)';

/** Percurso máximo, m: [sem sprinklers, com sprinklers]. CONFERIR NA IT. */
const LIMITE_POR_GRUPO: Record<string, [number, number]> = { A: [30, 45], B: [30, 45], D: [30, 45], E: [30, 45], F: [30, 45], H: [30, 45], C: [40, 55], G: [40, 55], I: [40, 55], J: [40, 55], L: [30, 45], M: [30, 45] };

export function limiteDoPercursoM(grupo: string | null, comSprinklers: boolean, declaradoM: number | null): { limiteM: number; motivo: string } {
  if (declaradoM != null) return { limiteM: declaradoM, motivo: 'declarado nas premissas' };
  const [sem, com] = LIMITE_POR_GRUPO[grupo ?? 'A'] ?? LIMITE_POR_GRUPO.A;
  return comSprinklers ? { limiteM: com, motivo: `grupo ${grupo ?? 'A'}, com chuveiros automáticos` } : { limiteM: sem, motivo: `grupo ${grupo ?? 'A'}, sem chuveiros automáticos` };
}

// ─── Geometria dentro do ambiente ────────────────────────────────────────────

const d2 = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const dentro = (s: Space, p: Point) => pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p));

/**
 * A forma do ambiente que dispensa a amostragem (PA8a do prédio automático, 15/11/2026): o anel é convexo, e as caixas
 * dos furos. A garagem do subsolo (o retângulo do lote, com o hall do núcleo como furo) fazia o extintor testar ~100 mil
 * segmentos amostrados a cada 25 cm — 22 s de 36 s. Guardada por ambiente, como a visibilidade entre vértices.
 */
const FORMA_DO_AMBIENTE = new WeakMap<Space, { convexo: boolean; furos: { anel: Point[]; x0: number; x1: number; y0: number; y1: number }[] }>();
function formaDoAmbiente(s: Space) {
  let f = FORMA_DO_AMBIENTE.get(s);
  if (!f) {
    let sinal = 0;
    let convexo = s.ring.length >= 3;
    for (let i = 0; i < s.ring.length && convexo; i++) {
      const p = s.ring[i];
      const q = s.ring[(i + 1) % s.ring.length];
      const r = s.ring[(i + 2) % s.ring.length];
      const cruz = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
      if (Math.abs(cruz) < 1e-6) continue;
      if (sinal === 0) sinal = Math.sign(cruz);
      else if (Math.sign(cruz) !== sinal) convexo = false;
    }
    const furos = s.holes.map((h) => ({ anel: h, x0: Math.min(...h.map((p) => p.x)), x1: Math.max(...h.map((p) => p.x)), y0: Math.min(...h.map((p) => p.y)), y1: Math.max(...h.map((p) => p.y)) }));
    FORMA_DO_AMBIENTE.set(s, (f = { convexo, furos }));
  }
  return f;
}
/** Distância do ponto ao segmento. */
function aoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
/** Os segmentos se cruzam (ou se tocam)? */
function cruzam(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
/** O segmento passa a até 1 mm do furo (ou entra nele)? Longe assim, nenhuma amostra do segmento cai no furo. */
function pertoDoFuro(f: { anel: Point[]; x0: number; x1: number; y0: number; y1: number }, a: Point, b: Point): boolean {
  if (Math.max(a.x, b.x) < f.x0 - 1 || Math.min(a.x, b.x) > f.x1 + 1 || Math.max(a.y, b.y) < f.y0 - 1 || Math.min(a.y, b.y) > f.y1 + 1) return false;
  if (pointInPolygon(f.anel, a) || pointInPolygon(f.anel, b)) return true;
  for (let i = 0; i < f.anel.length; i++) {
    const c = f.anel[i];
    const d = f.anel[(i + 1) % f.anel.length];
    if (cruzam(a, b, c, d) || aoSegmento(c, a, b) <= 1 || aoSegmento(d, a, b) <= 1 || aoSegmento(a, c, d) <= 1 || aoSegmento(b, c, d) <= 1) return true;
  }
  return false;
}
/** O trecho passa a mais de 1 mm de toda aresta do anel (sem cruzá-la)? Com uma ponta dentro, ele fica todo dentro. */
function longeDasArestas(anel: Point[], a: Point, b: Point): boolean {
  const [x0, x1, y0, y1] = [Math.min(a.x, b.x) - 1, Math.max(a.x, b.x) + 1, Math.min(a.y, b.y) - 1, Math.max(a.y, b.y) + 1];
  for (let i = 0; i < anel.length; i++) {
    const c = anel[i];
    const d = anel[(i + 1) % anel.length];
    if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
    if (cruzam(a, b, c, d) || aoSegmento(c, a, b) <= 1 || aoSegmento(d, a, b) <= 1 || aoSegmento(a, c, d) <= 1 || aoSegmento(b, c, d) <= 1) return false;
  }
  return true;
}
/** O ponto está dentro do anel a mais de 1 mm de toda borda dele. */
function folgadoNoAnel(anel: Point[], p: Point): boolean {
  if (!pointInPolygon(anel, p)) return false;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= 1) return false;
  }
  return true;
}

/** O segmento cabe no ambiente (amostrado a cada 25 cm; a borda conta como dentro). */
function visivel(s: Space, a: Point, b: Point): boolean {
  // Atalho EXATO: as amostras ficam todas no trecho entre a 1ª e a última (t = 1/n e (n−1)/n). No anel convexo, com essas
  // duas a mais de 1 mm da borda, todo o trecho fica a mais de 1 mm dela (a distância à borda é côncava por dentro) — toda
  // amostra cai dentro; e com o trecho a mais de 1 mm de cada furo (sem cruzar aresta, sem ponta dentro), nenhuma cai
  // nele. A mesma resposta da amostragem, sem amostrar — vale também com a ponta na borda (porta, vértice do anel).
  // No anel que não é convexo (a garagem com a caixa da escada encostada no contorno), o mesmo vale com o trecho a mais de
  // 1 mm de toda aresta do anel: com a 1ª amostra dentro e sem chegar perto da borda, o trecho todo fica dentro.
  const f = formaDoAmbiente(s);
  const n0 = Math.max(2, Math.ceil(d2(a, b) / 250));
  const s1 = { x: a.x + (b.x - a.x) / n0, y: a.y + (b.y - a.y) / n0 };
  const s2 = { x: a.x + ((b.x - a.x) * (n0 - 1)) / n0, y: a.y + ((b.y - a.y) * (n0 - 1)) / n0 };
  if (folgadoNoAnel(s.ring, s1) && (f.convexo ? folgadoNoAnel(s.ring, s2) : longeDasArestas(s.ring, s1, s2)) && !f.furos.some((c) => pertoDoFuro(c, s1, s2))) return true;
  const n = Math.max(2, Math.ceil(d2(a, b) / 250));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!dentro(s, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/**
 * A visibilidade entre dois VÉRTICES do contorno só depende do ambiente — guardada por ambiente (PA9a do prédio
 * automático, 14/11/2026). O caminho de cada par de portas refazia o grafo de visibilidade inteiro: na circulação de um
 * prédio (dezenas de portas e de vértices) a rota de fuga de 900 ambientes levava 16 s, 15 deles aqui. O mesmo
 * resultado: `visivel` é simétrica (as mesmas amostras nos dois sentidos) e o Dijkstra abaixo não muda.
 */
const VISIBILIDADE_ENTRE_VERTICES = new WeakMap<Space, Map<number, boolean>>();

/**
 * Os caminhos que não saem retos, guardados por ambiente e pelas pontas (PA8a): o extintor mede cada ponto da garagem até a
 * porta dela UMA vez por candidata — a mesma conta centenas de vezes. Devolve cópia (quem chama pode mexer nos pontos).
 */
const CAMINHOS_GUARDADOS = new WeakMap<Space, Map<string, { mm: number; pontos: Point[] } | null>>();

/** O caminho mais curto por DENTRO do ambiente: reto se cabe, senão pelos vértices do contorno (grafo de visibilidade). */
export function caminhoDentro(s: Space, a: Point, b: Point): { mm: number; pontos: Point[] } | null {
  if (visivel(s, a, b)) return { mm: d2(a, b), pontos: [a, b] };
  let guardados = CAMINHOS_GUARDADOS.get(s);
  if (!guardados) CAMINHOS_GUARDADOS.set(s, (guardados = new Map()));
  const chave = `${a.x},${a.y},${b.x},${b.y}`;
  if (!guardados.has(chave)) {
    if (guardados.size > 200_000) guardados.clear();
    guardados.set(chave, caminhoPelosVertices(s, a, b));
  }
  const r = guardados.get(chave)!;
  return r ? { mm: r.mm, pontos: r.pontos.map((p) => ({ ...p })) } : null;
}

/** Só o comprimento do `caminhoDentro` (Infinity sem caminho) — sem copiar os pontos: o extintor mede centenas de milhares. */
export function distanciaDentro(s: Space, a: Point, b: Point): number {
  if (visivel(s, a, b)) return d2(a, b);
  let guardados = CAMINHOS_GUARDADOS.get(s);
  if (!guardados) CAMINHOS_GUARDADOS.set(s, (guardados = new Map()));
  const chave = `${a.x},${a.y},${b.x},${b.y}`;
  let r = guardados.get(chave);
  if (r === undefined) {
    if (guardados.size > 200_000) guardados.clear();
    guardados.set(chave, (r = caminhoPelosVertices(s, a, b)));
  }
  return r ? r.mm : Infinity;
}

function caminhoPelosVertices(s: Space, a: Point, b: Point): { mm: number; pontos: Point[] } | null {
  const nos = [a, b, ...s.ring, ...s.holes.flat()];
  let guardadas = VISIBILIDADE_ENTRE_VERTICES.get(s);
  if (!guardadas) VISIBILIDADE_ENTRE_VERTICES.set(s, (guardadas = new Map()));
  const N = nos.length;
  /** Os dois primeiros nós são as pontas da consulta; dali em diante, os vértices do ambiente (a mesma ordem sempre). */
  const ve = (i: number, j: number): boolean => {
    if (i < 2 || j < 2) return visivel(s, nos[i], nos[j]);
    const k = Math.min(i, j) * N + Math.max(i, j);
    let r = guardadas!.get(k);
    if (r === undefined) guardadas!.set(k, (r = visivel(s, nos[i], nos[j])));
    return r;
  };
  const dist = nos.map(() => Infinity);
  const pai = nos.map(() => -1);
  const feito = nos.map(() => false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nos.length; i++) if (!feito[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    feito[u] = true;
    for (let v = 0; v < nos.length; v++) {
      if (feito[v] || v === u) continue;
      const nd = dist[u] + d2(nos[u], nos[v]);
      if (nd < dist[v] && ve(u, v)) {
        dist[v] = nd;
        pai[v] = u;
      }
    }
  }
  if (dist[1] === Infinity) return null;
  const pontos: Point[] = [];
  for (let v = 1; v >= 0; v = pai[v]) pontos.unshift(nos[v]);
  return { mm: dist[1], pontos };
}

/**
 * Os pontos onde pode estar o "mais desfavorável" do ambiente: cada canto
 * recuado 40 cm para dentro, e o centro do retângulo envolvente (quando cai
 * dentro). A rota de fuga (E6.3) e o extintor (E7.1) partem daqui.
 */
export function candidatosDoAmbiente(s: Space): { candidatos: Point[]; centro: Point } {
  const candidatos: Point[] = [];
  for (const v of s.ring) {
    const q = [[400, 400], [-400, 400], [400, -400], [-400, -400]].map(([dx, dy]) => ({ x: v.x + dx, y: v.y + dy })).find((p) => dentro(s, p));
    if (q) candidatos.push(q);
  }
  const xs = s.ring.map((p) => p.x);
  const ys = s.ring.map((p) => p.y);
  const centro = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  if (dentro(s, centro)) candidatos.push(centro);
  return { candidatos, centro };
}

// ─── O grafo de vários pavimentos ────────────────────────────────────────────

interface Portal {
  chave: string;
  levelId: ObjectId;
  ponto: Point;
}
interface Aresta {
  para: string;
  mm: number;
  /** Os pontos do trecho, do nó de origem ao de destino, e o pavimento onde se desenham. */
  pedacos: { levelId: ObjectId; pontos: Point[] }[];
}

const SAIDA = 'EXTERIOR';

function pavimentosDaEscada(model: BlueprintModel, e: Escada): ObjectId[] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const i = niveis.findIndex((l) => l.id === e.levelId);
  if (i < 0) return [];
  // A escada de acesso (0.103.0) liga o terreno ao próprio pavimento — não serve outro.
  const j = e.desdeCotaMm != null ? i : e.ateLevelId ? niveis.findIndex((l) => l.id === e.ateLevelId) : i + 1;
  return niveis.slice(i, Math.max(i, Math.min(j, niveis.length - 1)) + 1).map((l) => l.id);
}

export interface RotaDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  /** O ponto mais desfavorável do ambiente (de onde a rota parte). */
  origem: Point;
  /** `null` = não há caminho até uma saída. */
  distanciaM: number | null;
  /** A rota, um pedaço por pavimento, na ordem. */
  rota: { levelId: ObjectId; pontos: Point[] }[];
  /** Passa por escada? */
  pelaEscada: boolean;
  atende: boolean | null;
  /**
   * D1.2 (IT 08): a distância horizontal de caminhamento até o LOCAL SEGURO (exterior ou escada),
   * m — a que a Tabela 5 limita. `null` = sem caminho, ou não se mede (dentro da unidade, A-2).
   */
  caminhamentoM?: number | null;
  /** D1.2: o limite da Tabela 5 para ESTE ambiente, e o porquê. */
  limiteM?: number;
  motivoDoLimite?: string;
}

export interface PercursoDeFuga {
  limiteM: number;
  motivo: string;
  ambientes: RotaDoAmbiente[];
  /** A pior. */
  maisLonga: RotaDoAmbiente | null;
  pendencias: string[];
  fonte: string;
}

/**
 * Os percursos de fuga de todos os ambientes. `descargaLevelId` = o pavimento
 * de descarga (o da classificação); `percursoMaximoM` declarado vence a tabela.
 */
export function percursoDeFuga(
  model: BlueprintModel,
  grupo: string | null,
  descargaLevelId: ObjectId | null,
  percursoMaximoM: number | null = null,
  /** D1.2: os critérios da Tabela 5 da IT 08 (MG). `null` = o limite antigo por grupo. */
  criterios: CriteriosDoPercursoMG | null = null,
): PercursoDeFuga {
  const comSprinklers = (model.terminais ?? []).some((t) => t.tipoHidraulico === 'SPRINKLER');
  const comDeteccao = (model.terminais ?? []).some((t) => t.tipoHidraulico === 'DETECTOR_FUMACA' || t.tipoHidraulico === 'DETECTOR_TEMPERATURA' || t.tipoHidraulico === 'DETECTOR_CHAMA');
  const { limiteM, motivo } = limiteDoPercursoM(grupo, comSprinklers, percursoMaximoM);
  const pendencias: string[] = [];
  const grafos = new Map(model.levels.map((l) => [l.id, construirGrafoEspacial(model, l.id)]));
  const adj = new Map<string, Aresta[]>();
  const ligar = (de: string, para: string, mm: number, pedacos: Aresta['pedacos']) => {
    adj.set(de, [...(adj.get(de) ?? []), { para, mm, pedacos }]);
    adj.set(para, [...(adj.get(para) ?? []), { para: de, mm, pedacos: [...pedacos].reverse().map((p) => ({ ...p, pontos: [...p.pontos].reverse() })) }]);
  };

  // Os portais de cada ambiente: portas e bocas de escada.
  const portaisDoAmbiente = new Map<ObjectId, Portal[]>();
  const pushPortal = (spaceId: ObjectId, p: Portal) => portaisDoAmbiente.set(spaceId, [...(portaisDoAmbiente.get(spaceId) ?? []), p]);
  for (const [levelId, g] of grafos) {
    for (const a of g.arestas) {
      if (!a.openingId) continue;
      const portal = { chave: `porta:${levelId}:${a.openingId}`, levelId, ponto: a.ponto };
      for (const lado of [a.de, a.para]) if (lado) pushPortal(lado, portal);
      if (a.para === null && levelId === descargaLevelId) ligar(portal.chave, SAIDA, 0, []);
    }
  }
  if (descargaLevelId && !(grafos.get(descargaLevelId)?.saidas.length ?? 0)) pendencias.push('o pavimento de descarga não tem porta para o exterior');
  const espacos = new Map(model.spaces.map((s) => [s.id, s]));
  const ambienteEm = (levelId: ObjectId, p: Point) => model.spaces.find((s) => s.levelId === levelId && dentro(s, p)) ?? null;

  // Escadas: uma boca por pavimento servido; os lances ligam bocas vizinhas.
  for (const e of model.stairs ?? []) {
    const niveis = pavimentosDaEscada(model, e);
    const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
    const horiz = e.pontos.slice(1).reduce((t, p, i) => t + d2(e.pontos[i], p), 0);
    const boca = (i: number) => (i === 0 ? e.pontos[0] : e.pontos[e.pontos.length - 1]);
    niveis.forEach((levelId, i) => {
      const chave = `escada:${e.id}:${levelId}`;
      const s = ambienteEm(levelId, boca(i));
      if (s) pushPortal(s.id, { chave, levelId, ponto: boca(i) });
      if (i > 0) {
        const desnivel = (elev.get(levelId) ?? 0) - (elev.get(niveis[i - 1]) ?? 0);
        // O lance se desenha no pavimento de baixo, pelo eixo da escada.
        ligar(`escada:${e.id}:${niveis[i - 1]}`, chave, Math.hypot(horiz, desnivel), [{ levelId: niveis[i - 1], pontos: e.pontos.map((p) => ({ ...p })) }]);
      }
    });
  }

  // Dentro de cada ambiente: todo par de portais, pelo caminho por dentro.
  for (const [spaceId, portais] of portaisDoAmbiente) {
    const s = espacos.get(spaceId)!;
    for (let i = 0; i < portais.length; i++) {
      for (let j = i + 1; j < portais.length; j++) {
        const c = caminhoDentro(s, portais[i].ponto, portais[j].ponto);
        if (c) ligar(portais[i].chave, portais[j].chave, c.mm, [{ levelId: s.levelId, pontos: c.pontos }]);
      }
    }
  }

  // Dijkstra a partir do exterior.
  const menorCaminho = (grafo: Map<string, Aresta[]>) => {
    const dist = new Map<string, number>([[SAIDA, 0]]);
    const via = new Map<string, Aresta>();
    const feitos = new Set<string>();
    for (;;) {
      let u: string | null = null;
      for (const [k, v] of dist) if (!feitos.has(k) && (u === null || v < dist.get(u)!)) u = k;
      if (u === null) break;
      feitos.add(u);
      for (const a of grafo.get(u) ?? []) {
        const nd = dist.get(u)! + a.mm;
        if (nd < (dist.get(a.para) ?? Infinity)) {
          dist.set(a.para, nd);
          // A aresta de VOLTA (de a.para para u), que é o sentido da fuga.
          via.set(a.para, (grafo.get(a.para) ?? []).find((x) => x.para === u && Math.abs(x.mm - a.mm) < 1e-6)!);
        }
      }
    }
    return { dist, via };
  };
  const { dist, via } = menorCaminho(adj);
  // D1.2: o LOCAL SEGURO da IT 08 (5.5.2.1) — fora do pavimento de descarga, a boca da escada já é
  // a chegada: um segundo Dijkstra com a escada ligada ao exterior por 0 mm.
  const adjSeguro = new Map([...adj].map(([k, v]) => [k, [...v]]));
  const escadasPorNivel = new Map<ObjectId, Set<ObjectId>>();
  for (const e of model.stairs ?? []) {
    for (const levelId of pavimentosDaEscada(model, e)) {
      escadasPorNivel.set(levelId, new Set([...(escadasPorNivel.get(levelId) ?? []), e.id]));
      if (levelId === descargaLevelId) continue;
      const chave = `escada:${e.id}:${levelId}`;
      adjSeguro.set(chave, [...(adjSeguro.get(chave) ?? []), { para: SAIDA, mm: 0, pedacos: [] }]);
      adjSeguro.set(SAIDA, [...(adjSeguro.get(SAIDA) ?? []), { para: chave, mm: 0, pedacos: [] }]);
    }
  }
  const seguro = criterios ? menorCaminho(adjSeguro).dist : null;
  const saidasDaDescarga = descargaLevelId ? (grafos.get(descargaLevelId)?.saidas.length ?? 0) : 0;
  const ocupados = new Set(model.spaces.map((s) => s.levelId));
  const edificacaoTerrea = ocupados.size <= 1;
  const DENTRO_DA_UNIDADE = new Set(['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO', 'VARANDA']);
  const limiteDoAmbiente = (s: Space) => {
    if (!criterios || percursoMaximoM != null) return { limiteM, motivo };
    const terreo = s.levelId === descargaLevelId;
    const maisDeUmaSaida = terreo ? saidasDaDescarga >= 2 : (escadasPorNivel.get(s.levelId)?.size ?? 0) >= 2;
    return limiteDaTabela5(criterios, { terreo, maisDeUmaSaida, deteccao: comDeteccao, chuveiros: comSprinklers, edificacaoTerrea });
  };

  const caminhoAteASaida = (chave: string) => {
    const pedacos: Aresta['pedacos'] = [];
    let pelaEscada = false;
    for (let k = chave; k !== SAIDA; ) {
      const a = via.get(k)!;
      if (k.startsWith('escada:') && a.para.startsWith('escada:')) pelaEscada = true;
      pedacos.push(...a.pedacos);
      k = a.para;
    }
    return { pedacos, pelaEscada };
  };

  const ambientes: RotaDoAmbiente[] = model.spaces.map((s, idx) => {
    const portais = portaisDoAmbiente.get(s.id) ?? [];
    const rotulo = s.name || `Ambiente ${idx + 1}`;
    const { candidatos, centro } = candidatosDoAmbiente(s);
    let pior: { origem: Point; mm: number; portal: Portal; dentro: Point[] } | null = null;
    for (const c of candidatos) {
      let melhor: { mm: number; portal: Portal; dentro: Point[] } | null = null;
      for (const p of portais) {
        const dp = dist.get(p.chave);
        if (dp == null) continue;
        const cam = caminhoDentro(s, c, p.ponto);
        if (cam && (!melhor || cam.mm + dp < melhor.mm)) melhor = { mm: cam.mm + dp, portal: p, dentro: cam.pontos };
      }
      if (melhor && (!pior || melhor.mm > pior.mm)) pior = { origem: c, ...melhor };
    }
    const lim = limiteDoAmbiente(s);
    // D1.2: o caminhamento até o local seguro, do ponto mais desfavorável (A-2: dentro da unidade não se mede).
    let caminhamentoM: number | null = null;
    const naUnidade = criterios?.divisao === 'A-2' && DENTRO_DA_UNIDADE.has(usoDoNome(s.name) ?? '');
    if (seguro && !naUnidade) {
      let piorSeguro: number | null = null;
      for (const c of candidatos) {
        let melhor: number | null = null;
        for (const p of portais) {
          const dp = seguro.get(p.chave);
          if (dp == null) continue;
          const cam = caminhoDentro(s, c, p.ponto);
          if (cam && (melhor == null || cam.mm + dp < melhor)) melhor = cam.mm + dp;
        }
        if (melhor != null && (piorSeguro == null || melhor > piorSeguro)) piorSeguro = melhor;
      }
      caminhamentoM = piorSeguro != null ? piorSeguro / 1000 : null;
    }
    const extras = criterios ? { caminhamentoM, limiteM: lim.limiteM, motivoDoLimite: naUnidade ? 'A-2: conta da porta da unidade (5.5.2.2) — o corredor comum é que se mede' : lim.motivo } : {};
    if (!pior) return { spaceId: s.id, levelId: s.levelId, rotulo, origem: centro, distanciaM: null, rota: [], pelaEscada: false, atende: naUnidade ? null : false, ...extras };
    const { pedacos, pelaEscada } = caminhoAteASaida(pior.portal.chave);
    // Junta os pedaços consecutivos do mesmo pavimento numa polilinha só.
    const rota: RotaDoAmbiente['rota'] = [];
    for (const p of [{ levelId: s.levelId, pontos: pior.dentro }, ...pedacos]) {
      const ult = rota[rota.length - 1];
      if (ult && ult.levelId === p.levelId) ult.pontos.push(...p.pontos.slice(ult.pontos.length && p.pontos.length && d2(ult.pontos[ult.pontos.length - 1], p.pontos[0]) < 1 ? 1 : 0));
      else rota.push({ levelId: p.levelId, pontos: p.pontos.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })) });
    }
    const distanciaM = pior.mm / 1000;
    const atende = !criterios ? distanciaM <= limiteM + 1e-9 : naUnidade ? null : caminhamentoM != null && caminhamentoM <= lim.limiteM + 1e-9;
    return { spaceId: s.id, levelId: s.levelId, rotulo, origem: { x: Math.round(pior.origem.x), y: Math.round(pior.origem.y) }, distanciaM, rota, pelaEscada, atende, ...extras };
  });
  const comRota = ambientes.filter((a) => a.distanciaM != null);
  const maisLonga = comRota.length ? comRota.reduce((a, b) => (b.distanciaM! > a.distanciaM! ? b : a)) : null;
  const semRota = ambientes.filter((a) => a.distanciaM == null);
  if (semRota.length) pendencias.push(`${semRota.length} ambiente(s) sem caminho até uma saída (porta, escada ou porta para fora na descarga faltando)`);
  if (criterios && percursoMaximoM == null) {
    // D1.2: o limite vale por ambiente; no topo, o menor deles — e a "mais longa" é a de menor folga.
    const medidos = ambientes.filter((a) => a.caminhamentoM != null && a.limiteM != null);
    const pior = medidos.length ? medidos.reduce((a, b) => (b.caminhamentoM! - b.limiteM! > a.caminhamentoM! - a.limiteM! ? b : a)) : null;
    if (criterios.construtiva == null) pendencias.push('características construtivas (X/Y/Z, IT 08 Tabela 3) não declaradas — a Tabela 5 usou X, o mais restritivo');
    const menor = medidos.length ? Math.min(...medidos.map((a) => a.limiteM!)) : limiteDaTabela5(criterios, { terreo: false, maisDeUmaSaida: false, deteccao: comDeteccao, chuveiros: comSprinklers, edificacaoTerrea }).limiteM;
    return { limiteM: menor, motivo: `por ambiente — ${FONTE_IT08_MG}, Tabela 5`, ambientes, maisLonga: pior, pendencias, fonte: `${FONTE_IT08_MG}, Tabela 5 e 5.5.2` };
  }
  return { limiteM, motivo, ambientes, maisLonga, pendencias, fonte: FONTE_PERCURSO };
}
