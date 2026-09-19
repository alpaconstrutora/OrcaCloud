/**
 * GRAFO ESPACIAL (19/09/2026, roadmap E4.2): a planta como REDE de ambientes.
 *
 * Nós = `Space` (derivado do arranjo planar). Arestas = a PAREDE que dois
 * ambientes dividem (do arranjo: o lado do anel de um corre sobre uma parede e
 * do outro lado dela está o outro) e a PORTA/PASSAGEM (`Opening` numa parede
 * entre dois ambientes — ou entre um ambiente e o exterior: a SAÍDA). Daí saem:
 *
 * - **adjacência** (quem encosta em quem, por parede ou por porta);
 * - **percursos**: Dijkstra (`menorCaminhoEntre`, do grafo de rede) sobre os
 *   CENTROS DAS PORTAS — o caminho de um ambiente a outro é centro → porta →
 *   porta → … → centro, com a menor largura útil pelo caminho;
 * - **circulação %**: Σ área dos ambientes de uso CIRCULAÇÃO (pelo nome —
 *   `usoDoNome`) e dos CORREDORES (sem uso reconhecido, estreitos e compridos —
 *   heurística declarada em `ehCorredor`) sobre a área útil do pavimento;
 * - **largura útil de passagem**: o vão da abertura (`widthMm`, que no kernel
 *   já é o VÃO LIVRE — a mesma leitura da regra "Porta: vão livre mínimo" da
 *   E3.2 e da ficha), e a menor delas pelo percurso;
 * - **fachada** de cada ambiente: os lados do anel que dão para fora, com a
 *   ORIENTAÇÃO pela normal externa e o norte do desenho
 *   (`georreferencia.rotacaoNorteDeg`: +Y girado no anti-horário em relação ao
 *   norte; sem georreferência, +Y é o norte — a mesma convenção do IFC), e as
 *   janelas que há nela.
 *
 * Tudo derivado; nada é gravado. Alimenta a ficha da porta (E1.5), a
 * conferência do programa (E4.3) e a avaliação (E5.2).
 */
import {
  areCollinear,
  isBetween,
  pointInPolygon,
  polygonArea,
  wallLength,
  type BlueprintModel,
  type ObjectId,
  type Opening,
  type Point,
  type Space,
  type Wall,
} from './blueprintKernel';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';
import { menorCaminhoEntre, type Aresta as ArestaDeRede } from './blueprintGrafoDeRede';
import { usoDoNome, type UsoDoAmbiente } from './blueprintPrograma';

export type TipoDeArestaEspacial = 'PORTA' | 'PASSAGEM' | 'PAREDE';
export const PONTOS_CARDEAIS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'] as const;
export type PontoCardeal = (typeof PONTOS_CARDEAIS)[number];
export const ROTULO_DO_PONTO_CARDEAL: Record<PontoCardeal, string> = { N: 'Norte', NE: 'Nordeste', L: 'Leste', SE: 'Sudeste', S: 'Sul', SO: 'Sudoeste', O: 'Oeste', NO: 'Noroeste' };

/** Corredor: sem uso reconhecido, lado menor ≤ isto e comprido (≥ 2,5×). */
export const LARGURA_MAX_DE_CORREDOR_MM = 1500;

export interface FachadaDoAmbiente {
  wallId: ObjectId;
  comprimentoMm: number;
  /** Azimute da normal externa, 0–360°, 0 = norte, horário. */
  azimuteGraus: number;
  orientacao: PontoCardeal;
  /** As janelas (e portas para fora) que há neste lado. */
  aberturas: { openingId: ObjectId; kind: Opening['kind']; widthMm: number }[];
}

export interface NoEspacial {
  spaceId: ObjectId;
  levelId: ObjectId;
  nome: string;
  rotulo: string;
  uso: UsoDoAmbiente | null;
  /** O que a E4.2 chama de circulação: uso CIRCULAÇÃO pelo nome, ou corredor pela forma. */
  circulacao: boolean;
  etiquetaId: ObjectId | null;
  areaMm2: number;
  centro: Point;
  fachadas: FachadaDoAmbiente[];
  /** Portas/passagens que saem dele. */
  portas: number;
  /** Sem porta nem passagem: não se chega nele. */
  ilhado: boolean;
}

export interface ArestaEspacial {
  de: ObjectId;
  /** `null` = exterior. */
  para: ObjectId | null;
  tipo: TipoDeArestaEspacial;
  wallId: ObjectId;
  openingId?: ObjectId;
  /** PAREDE: comprimento dividido. PORTA/PASSAGEM: o vão. */
  comprimentoMm: number;
  /** PORTA/PASSAGEM: o que passa de verdade. */
  larguraUtilMm?: number;
  /** Meio da parede dividida ou centro do vão. */
  ponto: Point;
}

export interface GrafoEspacial {
  levelId: ObjectId;
  nos: NoEspacial[];
  arestas: ArestaEspacial[];
  areaUtilMm2: number;
  areaCirculacaoMm2: number;
  circulacaoPct: number;
  /** Portas/passagens para o exterior. */
  saidas: ArestaEspacial[];
  norteGraus: number | null;
}

export interface Percurso {
  mm: number;
  /** Os ambientes na ordem (o destino inclusive; `null` = exterior). */
  ambientes: (ObjectId | null)[];
  portas: ArestaEspacial[];
  /** A menor largura útil pelo caminho — `null` sem porta no caminho. */
  larguraUtilMinMm: number | null;
}

// ─── Geometria de apoio ───────────────────────────────────────────────────────

function pontoAoLado(a: Point, b: Point, dist: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2 + (-dy / c) * dist, y: (a.y + b.y) / 2 + (dx / c) * dist };
}
function dentroDoAmbiente(s: Space, p: Point): boolean {
  return pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p));
}
function paredeDoLado(paredes: Wall[], a: Point, b: Point): Wall | null {
  for (const w of paredes) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w;
  }
  return null;
}

/** Centróide do anel; se cai fora (L, U), a média dos vértices; se ainda fora, o primeiro vértice recuado. */
export function centroDoAmbiente(s: Space): Point {
  const r = s.ring;
  const a2 = polygonArea(r) * 2;
  if (Math.abs(a2) > 1) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i];
      const q = r[(i + 1) % r.length];
      const f = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * f;
      cy += (p.y + q.y) * f;
    }
    const c = { x: Math.round(cx / (3 * a2)), y: Math.round(cy / (3 * a2)) };
    if (dentroDoAmbiente(s, c)) return c;
  }
  const m = { x: Math.round(r.reduce((s2, p) => s2 + p.x, 0) / r.length), y: Math.round(r.reduce((s2, p) => s2 + p.y, 0) / r.length) };
  if (dentroDoAmbiente(s, m)) return m;
  // Um ponto certamente dentro: um pouco para dentro do meio do lado mais longo.
  let melhor = m;
  let maior = -1;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    if (c <= maior) continue;
    const esq = pontoAoLado(a, b, 100);
    const dir = pontoAoLado(a, b, -100);
    const dentro = dentroDoAmbiente(s, esq) ? esq : dentroDoAmbiente(s, dir) ? dir : null;
    if (dentro) {
      maior = c;
      melhor = { x: Math.round(dentro.x), y: Math.round(dentro.y) };
    }
  }
  return melhor;
}

/** Azimute (0–360, horário a partir do norte) de uma direção do desenho, dado o norte do desenho. */
export function azimuteDaDirecao(d: Point, rotacaoNorteDeg: number | null | undefined): number {
  const th = ((rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const norte = { x: Math.sin(th), y: Math.cos(th) };
  const leste = { x: Math.cos(th), y: -Math.sin(th) };
  const az = (Math.atan2(d.x * leste.x + d.y * leste.y, d.x * norte.x + d.y * norte.y) * 180) / Math.PI;
  return Math.round(((az % 360) + 360) % 360 * 10) / 10;
}

export function pontoCardeal(azimuteGraus: number): PontoCardeal {
  return PONTOS_CARDEAIS[Math.round((((azimuteGraus % 360) + 360) % 360) / 45) % 8];
}

/** O que passa por uma abertura: o vão livre (`widthMm`), em qualquer tipo. */
export function larguraUtilDaAbertura(o: Pick<Opening, 'kind' | 'widthMm'>): number {
  return o.widthMm;
}

/** Corredor pela forma: sem uso reconhecido, estreito (≤ 1,5 m) e comprido (≥ 2,5×). */
export function ehCorredor(s: Space): boolean {
  const xs = s.ring.map((p) => p.x);
  const ys = s.ring.map((p) => p.y);
  const lx = Math.max(...xs) - Math.min(...xs);
  const ly = Math.max(...ys) - Math.min(...ys);
  const menor = Math.min(lx, ly);
  const maior = Math.max(lx, ly);
  return menor > 0 && menor <= LARGURA_MAX_DE_CORREDOR_MM && maior / menor >= 2.5;
}

function centroDoVao(w: Wall, o: Opening): { ponto: Point; ux: number; uy: number } {
  const comp = wallLength(w) || 1;
  const ux = (w.b.x - w.a.x) / comp;
  const uy = (w.b.y - w.a.y) / comp;
  return { ponto: { x: w.a.x + ux * (o.offsetMm + o.widthMm / 2), y: w.a.y + uy * (o.offsetMm + o.widthMm / 2) }, ux, uy };
}

// ─── Construção ──────────────────────────────────────────────────────────────

export function construirGrafoEspacial(model: BlueprintModel, levelId: ObjectId): GrafoEspacial {
  const espacos = model.spaces.filter((s) => s.levelId === levelId && s.ring.length >= 3);
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const aberturasDaParede = new Map<ObjectId, Opening[]>();
  for (const o of model.openings) {
    const w = paredes.find((x) => x.id === o.wallId);
    if (w) aberturasDaParede.set(w.id, [...(aberturasDaParede.get(w.id) ?? []), o]);
  }
  const norteGraus = model.georreferencia?.rotacaoNorteDeg ?? null;
  const ambienteEm = (p: Point): Space | null => espacos.find((s) => dentroDoAmbiente(s, p)) ?? null;

  // Paredes divididas e fachadas, lado a lado do anel.
  const paredesEntre = new Map<string, ArestaEspacial>();
  const fachadasPorNo = new Map<ObjectId, Map<ObjectId, FachadaDoAmbiente & { normal: Point }>>();
  for (const s of espacos) {
    for (const anel of [s.ring, ...s.holes]) {
      const n = anel.length;
      for (let i = 0; i < n; i++) {
        const a = anel[i];
        const b = anel[(i + 1) % n];
        const w = paredeDoLado(paredes, a, b);
        if (!w) continue;
        const comprimentoMm = Math.hypot(b.x - a.x, b.y - a.y);
        if (comprimentoMm < 1) continue;
        const eps = Math.max(1, Math.min(w.thicknessMm / 2, 20));
        const esq = pontoAoLado(a, b, eps);
        const dir = pontoAoLado(a, b, -eps);
        const fora = dentroDoAmbiente(s, esq) ? dir : esq;
        const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const vizinho = espacos.find((x) => x.id !== s.id && dentroDoAmbiente(x, fora)) ?? null;
        if (vizinho) {
          // O mesmo lado aparece no anel dos DOIS ambientes: conta uma vez só.
          if (s.id.localeCompare(vizinho.id) > 0) continue;
          const chave = [s.id, vizinho.id].sort().join('|') + '|' + w.id;
          const atual = paredesEntre.get(chave);
          if (atual) atual.comprimentoMm += Math.round(comprimentoMm);
          else paredesEntre.set(chave, { de: s.id, para: vizinho.id, tipo: 'PAREDE', wallId: w.id, comprimentoMm: Math.round(comprimentoMm), ponto: { x: Math.round(meio.x), y: Math.round(meio.y) } });
        } else {
          const normal = { x: (fora.x - meio.x) / eps, y: (fora.y - meio.y) / eps };
          const porParede = fachadasPorNo.get(s.id) ?? new Map<ObjectId, FachadaDoAmbiente & { normal: Point }>();
          const f = porParede.get(w.id);
          const aberturas = (aberturasDaParede.get(w.id) ?? [])
            .filter((o) => {
              const c = centroDoVao(w, o).ponto;
              return isBetween(a, b, c) || isBetween(b, a, c);
            })
            .map((o) => ({ openingId: o.id, kind: o.kind, widthMm: o.widthMm }));
          if (f) {
            f.comprimentoMm += Math.round(comprimentoMm);
            for (const ab of aberturas) if (!f.aberturas.some((x) => x.openingId === ab.openingId)) f.aberturas.push(ab);
          } else {
            const azimuteGraus = azimuteDaDirecao(normal, norteGraus);
            porParede.set(w.id, { wallId: w.id, comprimentoMm: Math.round(comprimentoMm), azimuteGraus, orientacao: pontoCardeal(azimuteGraus), aberturas, normal });
          }
          fachadasPorNo.set(s.id, porParede);
        }
      }
    }
  }

  // Portas e passagens: os dois lados do vão.
  const portas: ArestaEspacial[] = [];
  for (const w of paredes) {
    for (const o of aberturasDaParede.get(w.id) ?? []) {
      if (o.kind === 'window') continue;
      const { ponto, ux, uy } = centroDoVao(w, o);
      const off = w.thicknessMm / 2 + 50;
      const lado1 = ambienteEm({ x: ponto.x - uy * off, y: ponto.y + ux * off });
      const lado2 = ambienteEm({ x: ponto.x + uy * off, y: ponto.y - ux * off });
      if (!lado1 && !lado2) continue; // porta numa parede solta: não liga nada
      if (lado1 && lado2 && lado1.id === lado2.id) continue; // porta interna ao mesmo ambiente (parede solta dentro dele)
      const de = lado1 ?? lado2!;
      const para = lado1 && lado2 ? lado2.id : null;
      portas.push({
        de: de.id,
        para,
        tipo: o.kind === 'passage' ? 'PASSAGEM' : 'PORTA',
        wallId: w.id,
        openingId: o.id,
        comprimentoMm: o.widthMm,
        larguraUtilMm: larguraUtilDaAbertura(o),
        ponto: { x: Math.round(ponto.x), y: Math.round(ponto.y) },
      });
    }
  }

  const arestas: ArestaEspacial[] = [...portas, ...paredesEntre.values()];
  const nos: NoEspacial[] = espacos.map((s, i) => {
    const nome = s.name ?? '';
    const uso = usoDoNome(nome);
    const fachadas = [...(fachadasPorNo.get(s.id)?.values() ?? [])].map(({ normal: _n, ...f }) => f);
    const nPortas = portas.filter((p) => p.de === s.id || p.para === s.id).length;
    return {
      spaceId: s.id,
      levelId,
      nome,
      rotulo: nome || `Ambiente ${i + 1}`,
      uso,
      circulacao: uso === 'CIRCULACAO' || (uso === null && ehCorredor(s)),
      etiquetaId: etiquetaDoAmbiente(s, model.labels)?.id ?? null,
      areaMm2: Math.round(s.areaMm2),
      centro: centroDoAmbiente(s),
      fachadas,
      portas: nPortas,
      ilhado: nPortas === 0,
    };
  });
  const areaUtilMm2 = nos.reduce((s, n) => s + n.areaMm2, 0);
  const areaCirculacaoMm2 = nos.filter((n) => n.circulacao).reduce((s, n) => s + n.areaMm2, 0);
  return {
    levelId,
    nos,
    arestas,
    areaUtilMm2,
    areaCirculacaoMm2,
    circulacaoPct: areaUtilMm2 > 0 ? Math.round((areaCirculacaoMm2 / areaUtilMm2) * 1000) / 10 : 0,
    saidas: portas.filter((p) => p.para === null),
    norteGraus,
  };
}

/** Um grafo por pavimento. */
export function grafosDoModelo(model: BlueprintModel): Map<ObjectId, GrafoEspacial> {
  const m = new Map<ObjectId, GrafoEspacial>();
  for (const l of model.levels) m.set(l.id, construirGrafoEspacial(model, l.id));
  return m;
}

/** Circulação do modelo inteiro (todos os pavimentos). */
export function circulacaoDoModelo(model: BlueprintModel): { areaUtilMm2: number; areaCirculacaoMm2: number; pct: number } {
  let util = 0;
  let circ = 0;
  for (const g of grafosDoModelo(model).values()) {
    util += g.areaUtilMm2;
    circ += g.areaCirculacaoMm2;
  }
  return { areaUtilMm2: util, areaCirculacaoMm2: circ, pct: util > 0 ? Math.round((circ / util) * 1000) / 10 : 0 };
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export function noDe(g: GrafoEspacial, spaceId: ObjectId): NoEspacial | null {
  return g.nos.find((n) => n.spaceId === spaceId) ?? null;
}

/** Vizinhos de um ambiente, com as arestas que os ligam (o exterior entra como `no: null`). */
export function vizinhosDe(g: GrafoEspacial, spaceId: ObjectId): { no: NoEspacial | null; arestas: ArestaEspacial[] }[] {
  const porVizinho = new Map<ObjectId | null, ArestaEspacial[]>();
  for (const a of g.arestas) {
    if (a.de !== spaceId && a.para !== spaceId) continue;
    const outro = a.de === spaceId ? a.para : a.de;
    porVizinho.set(outro, [...(porVizinho.get(outro) ?? []), a]);
  }
  return [...porVizinho.entries()]
    .map(([id, arestas]) => ({ no: id === null ? null : noDe(g, id), arestas }))
    .filter((v) => v.no !== null || v.arestas.some((a) => a.tipo !== 'PAREDE')) // o exterior só conta quando há porta para ele
    .sort((a, b) => (a.no?.rotulo ?? 'zzz').localeCompare(b.no?.rotulo ?? 'zzz', 'pt-BR'));
}

const NO_EXTERIOR = 'x';
const noDoAmbiente = (id: ObjectId | null) => (id === null ? NO_EXTERIOR : `s:${id}`);
const noDaPorta = (a: ArestaEspacial) => `d:${a.openingId}`;
const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** A rede de percursos: centro do ambiente ↔ porta, porta ↔ porta no mesmo ambiente, porta de saída ↔ exterior. */
function redeDePercursos(g: GrafoEspacial): { arestas: ArestaDeRede[]; portaDaAresta: (ArestaEspacial | null)[] } {
  const arestas: ArestaDeRede[] = [];
  const portaDaAresta: (ArestaEspacial | null)[] = [];
  const portas = g.arestas.filter((a) => a.tipo !== 'PAREDE');
  const empurrar = (de: string, para: string, mm: number, porta: ArestaEspacial | null) => {
    arestas.push({ ref: { novo: arestas.length }, de, para, mm: Math.round(mm) });
    portaDaAresta.push(porta);
  };
  const portasDoAmbiente = new Map<ObjectId, ArestaEspacial[]>();
  for (const p of portas) {
    for (const lado of [p.de, p.para]) {
      if (lado === null) {
        empurrar(noDaPorta(p), NO_EXTERIOR, 0, p);
        continue;
      }
      const no = noDe(g, lado);
      if (!no) continue;
      empurrar(noDoAmbiente(lado), noDaPorta(p), dist(no.centro, p.ponto), p);
      portasDoAmbiente.set(lado, [...(portasDoAmbiente.get(lado) ?? []), p]);
    }
  }
  for (const lista of portasDoAmbiente.values()) {
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) empurrar(noDaPorta(lista[i]), noDaPorta(lista[j]), dist(lista[i].ponto, lista[j].ponto), null);
  }
  return { arestas, portaDaAresta };
}

/** Menor percurso de um ambiente a outro (ou ao exterior, `para = null`) pelos centros das portas. */
export function percursoEntre(g: GrafoEspacial, de: ObjectId, para: ObjectId | null): Percurso | null {
  if (de === para) return { mm: 0, ambientes: [de], portas: [], larguraUtilMinMm: null };
  const rede = redeDePercursos(g);
  const r = menorCaminhoEntre(noDoAmbiente(de), noDoAmbiente(para), rede.arestas);
  if (!r) return null;
  const portasVistas: ArestaEspacial[] = [];
  for (const i of r.arestas) {
    const p = rede.portaDaAresta[i];
    if (p && !portasVistas.includes(p)) portasVistas.push(p);
  }
  // Ambientes na ordem: começa em `de`; cada porta leva ao outro lado dela.
  const ambientes: (ObjectId | null)[] = [de];
  let atual: ObjectId | null = de;
  for (const p of portasVistas) {
    const outro: ObjectId | null = p.de === atual ? p.para : p.para === atual ? p.de : null;
    if (outro !== atual) {
      atual = outro;
      ambientes.push(atual);
    }
  }
  const larguras = portasVistas.map((p) => p.larguraUtilMm ?? p.comprimentoMm);
  return { mm: r.mm, ambientes, portas: portasVistas, larguraUtilMinMm: larguras.length ? Math.min(...larguras) : null };
}

/** O percurso do ambiente até a saída mais próxima (porta para o exterior). */
export function percursoAteASaida(g: GrafoEspacial, spaceId: ObjectId): Percurso | null {
  if (g.saidas.length === 0) return null;
  return percursoEntre(g, spaceId, null);
}

/** Resumo de um pavimento para a tela e para as regras. */
export interface ResumoDoGrafo {
  ambientes: number;
  portas: number;
  passagens: number;
  paredesDivididas: number;
  saidas: number;
  ilhados: NoEspacial[];
  semFachada: NoEspacial[];
  circulacaoPct: number;
  /** Percurso mais longo até a saída, em mm, e de quem. */
  percursoMaisLongo: { no: NoEspacial; mm: number } | null;
  /** Portas de giro com largura útil < 800 (NBR 9050 vão livre). */
  portasEstreitas: ArestaEspacial[];
}

export const VAO_LIVRE_MINIMO_MM = 800;

export function resumirGrafo(g: GrafoEspacial): ResumoDoGrafo {
  let maisLongo: { no: NoEspacial; mm: number } | null = null;
  if (g.saidas.length > 0) {
    for (const n of g.nos) {
      const p = percursoAteASaida(g, n.spaceId);
      if (p && (!maisLongo || p.mm > maisLongo.mm)) maisLongo = { no: n, mm: p.mm };
    }
  }
  return {
    ambientes: g.nos.length,
    portas: g.arestas.filter((a) => a.tipo === 'PORTA').length,
    passagens: g.arestas.filter((a) => a.tipo === 'PASSAGEM').length,
    paredesDivididas: g.arestas.filter((a) => a.tipo === 'PAREDE').length,
    saidas: g.saidas.length,
    ilhados: g.nos.filter((n) => n.ilhado),
    semFachada: g.nos.filter((n) => n.fachadas.length === 0),
    circulacaoPct: g.circulacaoPct,
    percursoMaisLongo: maisLongo,
    portasEstreitas: g.arestas.filter((a) => a.tipo === 'PORTA' && (a.larguraUtilMm ?? 0) < VAO_LIVRE_MINIMO_MM),
  };
}

/** "N 4,00 m · L 3,20 m (2 janelas)" */
export function descreverFachadas(f: FachadaDoAmbiente[]): string {
  if (f.length === 0) return 'sem fachada';
  const porOrientacao = new Map<PontoCardeal, { mm: number; janelas: number }>();
  for (const x of f) {
    const atual = porOrientacao.get(x.orientacao) ?? { mm: 0, janelas: 0 };
    atual.mm += x.comprimentoMm;
    atual.janelas += x.aberturas.filter((a) => a.kind === 'window').length;
    porOrientacao.set(x.orientacao, atual);
  }
  return PONTOS_CARDEAIS.filter((o) => porOrientacao.has(o))
    .map((o) => {
      const v = porOrientacao.get(o)!;
      return `${o} ${(v.mm / 1000).toFixed(2).replace('.', ',')} m${v.janelas ? ` (${v.janelas} jan.)` : ''}`;
    })
    .join(' · ');
}
