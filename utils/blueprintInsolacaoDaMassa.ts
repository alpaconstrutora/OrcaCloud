/**
 * ESTUDO DE MASSA — a INSOLAÇÃO da massa (fase M5b do plano
 * `2026-10-01-estudo-de-massa.md`, §11 e §12 do pedido).
 *
 * Três perguntas, com o sol de `blueprintInsolacao` (latitude, dia, hora solar,
 * norte do desenho) e os blocos como PRISMAS (base e topo absolutos):
 *
 *  1. FACHADAS — quantas horas de sol cada fachada de bloco com unidades recebe
 *     no inverno (21/06, o pior sol) e no verão; a média ponderada pela área de
 *     fachada; as fachadas CRÍTICAS (abaixo do mínimo, 2 h por padrão). A sombra
 *     vem do entorno declarado E dos outros blocos E do próprio bloco (a asa do
 *     L faz sombra na outra) — ao contrário da análise por ambiente da E5.1, que
 *     ignora a própria edificação.
 *  2. LOTE — que parte do terreno livre (fora das projeções) fica com sol
 *     suficiente no inverno: o pátio, o playground, a área permeável.
 *  3. VIZINHOS — quantas horas de sol o térreo de cada divisa PERDE por causa da
 *     massa: com os blocos menos sem os blocos, a 1 m para fora da divisa.
 *
 * Mais os indicadores do §12, por bloco: a orientação da fachada maior e a
 * profundidade (a menor dimensão — o que a ventilação cruzada atravessa).
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * O teste de sombra é EXATO: o raio horizontal do ponto até o sol cruza o
 * polígono do prisma num conjunto de intervalos (par-ímpar); há sombra se em
 * algum deles a altura do raio está entre a base e o topo do prisma. Sem
 * marcha em passos — o gerador (M5) pode medir centenas de cenários.
 *
 * Amostragem: RÁPIDA (o meio de cada fachada no 1º pavimento acima do solo, só
 * o inverno, vizinhos com 3 pontos por divisa — o que o gerador e o comparador
 * usam) ou COMPLETA (3 pontos ao longo × 3 alturas, inverno e verão, o lote em
 * grade — a gaveta). Os números de uma e de outra não se misturam: a régua do
 * comparador é sempre a RÁPIDA.
 */
import { pointInPolygon, signedArea, type BlueprintModel, type Boundary, type BoundaryPapel, type ObjectId, type Point } from './blueprintKernel';
import { ALTURA_DO_PEITORIL_MM, ALTURA_MINIMA_UTIL_GRAUS, DATAS_DE_REFERENCIA, direcaoDoSol, PASSO_H, posicaoSolar, type PrismaDoEntorno } from './blueprintInsolacao';
import { azimuteDaDirecao, pontoCardeal, type PontoCardeal } from './blueprintGrafoEspacial';
import { divisasDoLote, medirTerreno } from './blueprintTerreno';

export interface OpcoesDaInsolacaoDaMassa {
  latitudeGraus: number;
  rotacaoNorteDeg: number | null;
  /** Os vizinhos declarados (prismas do chão até a altura deles). */
  entorno: readonly PrismaDoEntorno[];
  /** Mínimo de horas de sol no inverno; abaixo, a fachada é crítica. */
  minimaH: number;
  amostragem: 'RAPIDA' | 'COMPLETA';
}

/** Prisma com base: o bloco sobre o embasamento começa no alto. */
export interface PrismaDaMassa {
  id: string;
  anel: Point[];
  baseMm: number;
  topoMm: number;
}

export interface FachadaDaMassa {
  /** Índice do lado no contorno do bloco. */
  lado: number;
  comprimentoM: number;
  /** Azimute da normal externa, graus a partir do norte. */
  azimuteGraus: number;
  orientacao: PontoCardeal;
  horasInverno: number;
  /** null na amostragem RÁPIDA. */
  horasVerao: number | null;
  critica: boolean;
}

export interface InsolacaoDoBloco {
  blocoId: ObjectId;
  nome: string;
  fachadas: FachadaDaMassa[];
  /** Média ponderada pelo comprimento das fachadas, inverno. */
  horasInverno: number;
  fachadasCriticas: number;
  /**
   * Para onde olha a fachada MAIOR (§12). Empate de comprimento (a lâmina tem
   * duas fachadas maiores, opostas): a que recebe MAIS sol no inverno — é a
   * fachada que o projeto quer voltar para a sala.
   */
  orientacaoPrincipal: PontoCardeal | null;
  /** A menor dimensão do bloco (largura do retângulo mínimo orientado pelo lado maior), m. */
  profundidadeM: number;
}

export interface SolDoVizinho {
  lado: BoundaryPapel;
  /** Horas de sol no térreo do vizinho, no inverno, sem e com a massa. */
  semMassaH: number;
  comMassaH: number;
  perdidasH: number;
}

export interface InsolacaoDaMassa {
  blocos: InsolacaoDoBloco[];
  /** Média ponderada pela ÁREA de fachada (comprimento × pavimentos) de todos os blocos com unidades, inverno. */
  horasInverno: number | null;
  /** % da área de fachada abaixo do mínimo no inverno. */
  fachadaCriticaPct: number | null;
  /** % do lote LIVRE com sol ≥ mínimo no inverno; null na amostragem RÁPIDA ou sem lote. */
  loteComSolPct: number | null;
  /** Horas médias de sol no lote livre, inverno; null como acima. */
  loteHorasInverno: number | null;
  vizinhos: SolDoVizinho[];
  /** A maior perda entre as divisas, h; null sem lote. */
  maiorPerdaDoVizinhoH: number | null;
  minimaH: number;
  avisos: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const USOS_COM_FACHADA_UTIL = new Set(['RESIDENCIAL', 'COMERCIAL', 'MISTO', 'LAZER']);

// ─── Raio × prisma, exato ────────────────────────────────────────────────────

/**
 * Intervalos de t (distância em planta, mm) em que o raio p + u·t (t > 0) está
 * DENTRO do polígono. Par-ímpar sobre os cruzamentos com as arestas.
 */
function intervalosDentro(p: Point, u: Point, anel: readonly Point[]): [number, number][] {
  const ts: number[] = [];
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = u.x * ey - u.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a.x - p.x;
    const wy = a.y - p.y;
    const t = (wx * ey - wy * ex) / den;
    const s = (wx * u.y - wy * u.x) / den;
    // Semiaberto em s: o vértice compartilhado conta uma vez só.
    if (s >= 0 && s < 1 && t > 0) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const dentro = pointInPolygon(anel as Point[], p);
  const out: [number, number][] = [];
  let ini = dentro ? 0 : null;
  for (const t of ts) {
    if (ini === null) ini = t;
    else {
      out.push([ini, t]);
      ini = null;
    }
  }
  if (ini !== null) out.push([ini, Infinity]);
  return out;
}

/** O raio do ponto ao sol (direção unitária 3D) bate em algum prisma? */
export function raioBloqueado(p: { x: number; y: number; zMm: number }, dir: { x: number; y: number; z: number }, prismas: readonly PrismaDaMassa[]): boolean {
  if (dir.z <= 0) return true;
  const hor = Math.hypot(dir.x, dir.y);
  if (hor < 1e-9) return false; // sol a pino: nada na frente
  const u = { x: dir.x / hor, y: dir.y / hor };
  const tan = dir.z / hor;
  for (const pr of prismas) {
    if (pr.topoMm <= p.zMm) continue;
    // Faixa de t em que a altura do raio está entre a base e o topo do prisma.
    const t0 = Math.max(0, (pr.baseMm - p.zMm) / tan);
    const t1 = (pr.topoMm - p.zMm) / tan;
    if (t1 <= t0) continue;
    for (const [a, b] of intervalosDentro(p, u, pr.anel)) if (a < t1 && b > t0) return true;
  }
  return false;
}

// ─── Sol ao longo do dia ─────────────────────────────────────────────────────

interface Passo {
  dir: { x: number; y: number; z: number };
}

function passosDoDia(o: OpcoesDaInsolacaoDaMassa, dia: number): Passo[] {
  const out: Passo[] = [];
  for (let h = 0; h < 24; h += PASSO_H) {
    const pos = posicaoSolar(o.latitudeGraus, dia, h);
    if (pos.alturaGraus < ALTURA_MINIMA_UTIL_GRAUS) continue;
    out.push({ dir: direcaoDoSol(pos, o.rotacaoNorteDeg) });
  }
  return out;
}

/** Horas de sol num ponto; `normal` = só conta o sol à frente da fachada. */
function horasNoPonto(p: { x: number; y: number; zMm: number }, normal: Point | null, passos: readonly Passo[], prismas: readonly PrismaDaMassa[]): number {
  let n = 0;
  for (const s of passos) {
    if (normal && normal.x * s.dir.x + normal.y * s.dir.y <= 0) continue;
    if (!raioBloqueado(p, s.dir, prismas)) n++;
  }
  return n * PASSO_H;
}

// ─── Prismas da massa ────────────────────────────────────────────────────────

/** Um prisma por bloco (base e topo ABSOLUTOS — pavimento de referência + cota). Subsolo fica de fora (enterrado). */
export function prismasDaMassa(model: BlueprintModel): PrismaDaMassa[] {
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  return (model.blocos ?? [])
    .map((b) => {
      const base = (elev.get(b.levelId) ?? 0) + b.cotaBaseMm;
      return { id: b.id, anel: b.pontos, baseMm: Math.max(0, base), topoMm: base + b.pavimentos * b.peDireitoMm };
    })
    .filter((p) => p.topoMm > 0);
}

const doEntorno = (e: readonly PrismaDoEntorno[]): PrismaDaMassa[] => e.map((p) => ({ id: p.id, anel: p.anel, baseMm: 0, topoMm: p.alturaMm }));

/** Profundidade: a menor largura do retângulo orientado pelo lado mais longo. */
function profundidadeDoAnel(anel: readonly Point[]): number {
  let maior = 0;
  let ang = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    if (c > maior) {
      maior = c;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const vs = anel.map((p) => p.x * nx + p.y * ny);
  return Math.max(...vs) - Math.min(...vs);
}

// ─── A análise ───────────────────────────────────────────────────────────────

export function insolacaoDaMassa(model: BlueprintModel, o: OpcoesDaInsolacaoDaMassa): InsolacaoDaMassa {
  const avisos: string[] = [];
  const completa = o.amostragem === 'COMPLETA';
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const daMassa = prismasDaMassa(model);
  const todos = [...daMassa, ...doEntorno(o.entorno)];
  const inverno = passosDoDia(o, DATAS_DE_REFERENCIA.INVERNO.dia);
  const verao = completa ? passosDoDia(o, DATAS_DE_REFERENCIA.VERAO.dia) : [];

  const blocos: InsolacaoDoBloco[] = [];
  let somaArea = 0;
  let somaHoras = 0;
  let areaCritica = 0;
  for (const b of model.blocos ?? []) {
    if (!USOS_COM_FACHADA_UTIL.has(b.uso)) continue;
    const base = (elev.get(b.levelId) ?? 0) + b.cotaBaseMm;
    // Pisos acima do solo: o 1º (o mais sombreado), o do meio e o do topo.
    const pisos: number[] = [];
    for (let i = 0; i < b.pavimentos; i++) if (base + i * b.peDireitoMm >= 0) pisos.push(base + i * b.peDireitoMm);
    if (pisos.length === 0) continue;
    const alturas = completa ? [...new Set([pisos[0], pisos[Math.floor(pisos.length / 2)], pisos[pisos.length - 1]])] : [pisos[0]];
    const fracoes = completa ? [0.25, 0.5, 0.75] : [0.5];
    const horario = signedArea(b.pontos) < 0;
    const fachadas: FachadaDaMassa[] = [];
    for (let i = 0; i < b.pontos.length; i++) {
      const a = b.pontos[i];
      const c = b.pontos[(i + 1) % b.pontos.length];
      const comp = Math.hypot(c.x - a.x, c.y - a.y);
      if (comp < 1000) continue;
      // Normal externa: à direita do sentido do contorno se anti-horário.
      const normal = horario ? { x: -(c.y - a.y) / comp, y: (c.x - a.x) / comp } : { x: (c.y - a.y) / comp, y: -(c.x - a.x) / comp };
      let hi = 0;
      let hv = 0;
      let n = 0;
      for (const f of fracoes) {
        for (const z of alturas) {
          // 5 cm para fora: o raio nasce fora do próprio prisma.
          const p = { x: a.x + (c.x - a.x) * f + normal.x * 50, y: a.y + (c.y - a.y) * f + normal.y * 50, zMm: z + ALTURA_DO_PEITORIL_MM };
          hi += horasNoPonto(p, normal, inverno, todos);
          if (completa) hv += horasNoPonto(p, normal, verao, todos);
          n++;
        }
      }
      const az = azimuteDaDirecao(normal, o.rotacaoNorteDeg);
      const horasInverno = r2(hi / n);
      fachadas.push({ lado: i, comprimentoM: r2(comp / 1000), azimuteGraus: az, orientacao: pontoCardeal(az), horasInverno, horasVerao: completa ? r2(hv / n) : null, critica: horasInverno < o.minimaH });
    }
    const compTotal = fachadas.reduce((s, f) => s + f.comprimentoM, 0);
    const maiorComp = Math.max(0, ...fachadas.map((f) => f.comprimentoM));
    const maior = fachadas.filter((f) => f.comprimentoM >= maiorComp * 0.99).sort((x, y) => y.horasInverno - x.horasInverno || x.lado - y.lado)[0];
    blocos.push({
      blocoId: b.id,
      nome: b.nome,
      fachadas,
      horasInverno: compTotal > 0 ? r2(fachadas.reduce((s, f) => s + f.horasInverno * f.comprimentoM, 0) / compTotal) : 0,
      fachadasCriticas: fachadas.filter((f) => f.critica).length,
      orientacaoPrincipal: maior?.orientacao ?? null,
      profundidadeM: r2(profundidadeDoAnel(b.pontos) / 1000),
    });
    for (const f of fachadas) {
      const area = f.comprimentoM * pisos.length;
      somaArea += area;
      somaHoras += f.horasInverno * area;
      if (f.critica) areaCritica += area;
    }
  }

  // ── O lote livre e os vizinhos ──
  const terreno = medirTerreno(divisasDoLote(model.boundaries));
  let loteComSolPct: number | null = null;
  let loteHorasInverno: number | null = null;
  const vizinhos: SolDoVizinho[] = [];
  if (terreno && terreno.anel.length >= 3) {
    const sobreOChao = daMassa.filter((p) => p.baseMm <= 0);
    if (completa) {
      const xs = terreno.anel.map((p) => p.x);
      const ys = terreno.anel.map((p) => p.y);
      const passo = Math.max(1000, Math.sqrt(terreno.areaMm2) / 25);
      let livres = 0;
      let comSol = 0;
      let horas = 0;
      for (let x = Math.min(...xs) + passo / 2; x < Math.max(...xs); x += passo) {
        for (let y = Math.min(...ys) + passo / 2; y < Math.max(...ys); y += passo) {
          const q = { x, y };
          if (!pointInPolygon(terreno.anel, q)) continue;
          if (sobreOChao.some((p) => pointInPolygon(p.anel, q))) continue;
          livres++;
          const h = horasNoPonto({ x, y, zMm: 0 }, null, inverno, todos);
          horas += h;
          if (h >= o.minimaH) comSol++;
        }
      }
      loteComSolPct = livres > 0 ? Math.round((comSol / livres) * 1000) / 10 : null;
      loteHorasInverno = livres > 0 ? r2(horas / livres) : null;
    }
    // Vizinhos: a 1 m para fora de cada divisa com papel, no térreo; com a massa − sem a massa (o entorno conta nos dois).
    const centro = terreno.anel.reduce((s, p) => ({ x: s.x + p.x / terreno.anel.length, y: s.y + p.y / terreno.anel.length }), { x: 0, y: 0 });
    const doLote = new Set(terreno.ladosIds);
    const porLado = new Map<BoundaryPapel, Boundary[]>();
    for (const d of model.boundaries) if (doLote.has(d.id) && d.papel) porLado.set(d.papel, [...(porLado.get(d.papel) ?? []), d]);
    const entorno = doEntorno(o.entorno);
    const fr = completa ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.2, 0.5, 0.8];
    for (const [lado, ds] of porLado) {
      let sem = 0;
      let com = 0;
      let n = 0;
      for (const d of ds) {
        const c = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) || 1;
        let nx = -(d.b.y - d.a.y) / c;
        let ny = (d.b.x - d.a.x) / c;
        const mx = (d.a.x + d.b.x) / 2;
        const my = (d.a.y + d.b.y) / 2;
        if ((centro.x - mx) * nx + (centro.y - my) * ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        for (const f of fr) {
          const p = { x: d.a.x + (d.b.x - d.a.x) * f + nx * 1000, y: d.a.y + (d.b.y - d.a.y) * f + ny * 1000, zMm: ALTURA_DO_PEITORIL_MM };
          sem += horasNoPonto(p, null, inverno, entorno);
          com += horasNoPonto(p, null, inverno, todos);
          n++;
        }
      }
      if (n === 0) continue;
      const semMassaH = r2(sem / n);
      const comMassaH = r2(com / n);
      vizinhos.push({ lado, semMassaH, comMassaH, perdidasH: r2(Math.max(0, semMassaH - comMassaH)) });
    }
  } else {
    avisos.push('Sem lote fechado: a sombra no terreno e nos vizinhos não se mede.');
  }
  if (o.entorno.length === 0) avisos.push('Sem vizinhos declarados: a sombra do entorno não entra (declare-os na gaveta Insolação).');

  const ordem: BoundaryPapel[] = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'];
  vizinhos.sort((a, b) => ordem.indexOf(a.lado) - ordem.indexOf(b.lado));
  return {
    blocos,
    horasInverno: somaArea > 0 ? r2(somaHoras / somaArea) : null,
    fachadaCriticaPct: somaArea > 0 ? Math.round((areaCritica / somaArea) * 1000) / 10 : null,
    loteComSolPct,
    loteHorasInverno,
    vizinhos,
    maiorPerdaDoVizinhoH: vizinhos.length ? Math.max(...vizinhos.map((v) => v.perdidasH)) : null,
    minimaH: o.minimaH,
    avisos,
  };
}
