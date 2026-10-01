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
 * ⚠️ NORMA (CONFERIR NA IT de saídas do CBMMG / NBR 9077): o limite do percurso
 * por divisão, com e sem chuveiros automáticos, foi transcrito de memória.
 */
import { pointInPolygon, type BlueprintModel, type Escada, type ObjectId, type Point, type Space } from './blueprintKernel';
import { construirGrafoEspacial } from './blueprintGrafoEspacial';

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

/** O segmento cabe no ambiente (amostrado a cada 25 cm; a borda conta como dentro). */
function visivel(s: Space, a: Point, b: Point): boolean {
  const n = Math.max(2, Math.ceil(d2(a, b) / 250));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!dentro(s, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** O caminho mais curto por DENTRO do ambiente: reto se cabe, senão pelos vértices do contorno (grafo de visibilidade). */
export function caminhoDentro(s: Space, a: Point, b: Point): { mm: number; pontos: Point[] } | null {
  if (visivel(s, a, b)) return { mm: d2(a, b), pontos: [a, b] };
  const nos = [a, b, ...s.ring, ...s.holes.flat()];
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
      if (nd < dist[v] && visivel(s, nos[u], nos[v])) {
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
  const j = e.ateLevelId ? niveis.findIndex((l) => l.id === e.ateLevelId) : i + 1;
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
export function percursoDeFuga(model: BlueprintModel, grupo: string | null, descargaLevelId: ObjectId | null, percursoMaximoM: number | null = null): PercursoDeFuga {
  const comSprinklers = (model.terminais ?? []).some((t) => t.tipoHidraulico === 'SPRINKLER');
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
  const dist = new Map<string, number>([[SAIDA, 0]]);
  const via = new Map<string, Aresta>();
  const feitos = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [k, v] of dist) if (!feitos.has(k) && (u === null || v < dist.get(u)!)) u = k;
    if (u === null) break;
    feitos.add(u);
    for (const a of adj.get(u) ?? []) {
      const nd = dist.get(u)! + a.mm;
      if (nd < (dist.get(a.para) ?? Infinity)) {
        dist.set(a.para, nd);
        // A aresta de VOLTA (de a.para para u), que é o sentido da fuga.
        via.set(a.para, (adj.get(a.para) ?? []).find((x) => x.para === u && Math.abs(x.mm - a.mm) < 1e-6)!);
      }
    }
  }

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
    if (!pior) return { spaceId: s.id, levelId: s.levelId, rotulo, origem: centro, distanciaM: null, rota: [], pelaEscada: false, atende: false };
    const { pedacos, pelaEscada } = caminhoAteASaida(pior.portal.chave);
    // Junta os pedaços consecutivos do mesmo pavimento numa polilinha só.
    const rota: RotaDoAmbiente['rota'] = [];
    for (const p of [{ levelId: s.levelId, pontos: pior.dentro }, ...pedacos]) {
      const ult = rota[rota.length - 1];
      if (ult && ult.levelId === p.levelId) ult.pontos.push(...p.pontos.slice(ult.pontos.length && p.pontos.length && d2(ult.pontos[ult.pontos.length - 1], p.pontos[0]) < 1 ? 1 : 0));
      else rota.push({ levelId: p.levelId, pontos: p.pontos.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })) });
    }
    const distanciaM = pior.mm / 1000;
    return { spaceId: s.id, levelId: s.levelId, rotulo, origem: { x: Math.round(pior.origem.x), y: Math.round(pior.origem.y) }, distanciaM, rota, pelaEscada, atende: distanciaM <= limiteM + 1e-9 };
  });
  const comRota = ambientes.filter((a) => a.distanciaM != null);
  const maisLonga = comRota.length ? comRota.reduce((a, b) => (b.distanciaM! > a.distanciaM! ? b : a)) : null;
  const semRota = ambientes.filter((a) => a.distanciaM == null);
  if (semRota.length) pendencias.push(`${semRota.length} ambiente(s) sem caminho até uma saída (porta, escada ou porta para fora na descarga faltando)`);
  return { limiteM, motivo, ambientes, maisLonga, pendencias, fonte: FONTE_PERCURSO };
}
