/**
 * GERADOR DETERMINÍSTICO DE PLANTAS (19/09/2026, roadmap E6.2) — o coração.
 *
 * Entrada: o PROGRAMA (E4.1: itens com área ideal, largura mínima, exigências,
 * privacidade; matriz de proximidade), o ENVELOPE em planta (E3.3: o anel
 * edificável do pavimento — ou um retângulo declarado nas hipóteses quando não
 * há lote), a orientação (frente do lote e norte do desenho) e as hipóteses.
 * Saída: para cada SEMENTE, uma alternativa completa — comandos do kernel,
 * modelo, avaliação (E5.2) e o LOG DE DECISÕES (a base do "explicar solução"
 * da E6.4). Mesma entrada + mesma semente = mesma planta, sempre.
 *
 * Passos:
 *  (a) ZONA POR FLUXO — o retângulo de trabalho (o maior inscrito no envelope,
 *      eixos alinhados) é fatiado da FRENTE para os FUNDOS: faixa social +
 *      serviço à frente (social primeiro, serviço encostado nela — a cozinha
 *      quer a sala), corredor (quando o programa tem CIRCULAÇÃO) e a faixa
 *      íntima aos fundos, protegida. Cada faixa tem a profundidade
 *      proporcional à área dos seus itens.
 *  (b) ALOCAÇÃO — treemap em FAIXAS ("strip"), que preserva a ordem (a zona
 *      não se perde) e mantém as proporções razoáveis; áreas ideais escaladas
 *      para caber no retângulo (nunca abaixo da mínima quando dá).
 *  (c) REFINAMENTO — recozimento simulado com PRNG semeado (mulberry32):
 *      trocas de ordem dentro das faixas e passagem de item entre a frente e
 *      o fundo; função objetivo = proxy do score da E5.2 (largura mínima,
 *      proporção, fachada e sol de quem exige, relações da matriz,
 *      privacidade). O score completo (E5.2) entra no fim, sobre o modelo
 *      pronto — rodá-lo a cada iteração exigiria remontar o arranjo planar.
 *  (d) PAREDES — externas com a espessura externa, internas pela união dos
 *      lados dos retângulos (colineares fundidos), tudo na malha de 50 mm;
 *      NOMES e tipo NBR 5410 pelas etiquetas; PORTAS junto da circulação (ou
 *      da sala), ENTRADA na frente; JANELAS na fachada de quem exige
 *      iluminação/fachada (basculante no banheiro).
 *  (e) AUTOMÁTICOS já existentes: pilares, vigas, lajes, tomadas e luz pela
 *      NBR 5410, pontos hidráulicos. Água e esgoto precisam de reservatório e
 *      caixa de inspeção — ficam para a mão do projetista (declarado no log).
 *  (f) AVALIAÇÃO (E5.2) com o programa, as regras semente e a insolação.
 *
 * `frenteDePareto` separa as alternativas não dominadas em área construída
 * (menor), metros de parede (o proxy de custo — o orçamento é da E7) e nota.
 */
import {
  applyBatch,
  emptyModel,
  pointInPolygon,
  polygonArea,
  point,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Wall,
} from './blueprintKernel';
import { areaRecuada, uidDeterministico, wallLength } from './blueprintKernel';
import { FICHA_DO_USO, type ItemDoPrograma, type Programa, type RelacaoDoPrograma } from './blueprintPrograma';
import { avaliar, type Avaliacao, type HipotesesDaAvaliacao, HIPOTESES_DA_AVALIACAO_PADRAO } from './blueprintAvaliacao';
import { conferirPrograma } from './blueprintConferenciaDoPrograma';
import { avaliarRegras, REGRAS_SEMENTE } from './blueprintRegras';
import { planejarPilares } from './blueprintPilaresAutomaticos';
import { planejarLajes, planejarVigas } from './blueprintVigasLajesAutomaticas';
import { planejarPontosDoNivel } from './blueprintPontosHidraulicos';
import { comandosDeIluminacao, comandosParaCompletar, conferirIluminacao, conferirTomadas, distribuirAoLongo, etiquetaDoAmbiente, ladosDePiso } from './blueprintDistribuicao';
import { aplicarPotenciaPadrao } from './blueprintPotenciaPadrao';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type LadoDaFrente = 'S' | 'N' | 'L' | 'O';

export interface HipotesesDoGerador {
  sementes: number;
  iteracoes: number;
  malhaMm: number;
  espessuraExternaMm: number;
  espessuraInternaMm: number;
  peDireitoMm: number;
  larguraCorredorMm: number;
  larguraPortaMm: number;
  larguraEntradaMm: number;
  alturaPortaMm: number;
  janela: { alturaMm: number; peitorilMm: number; fracaoDoLado: number; minMm: number; maxMm: number };
  /** Quando não há envelope (sem lote): o retângulo a preencher. */
  retanguloSemEnvelope: { larguraMm: number; profundidadeMm: number };
  automaticos: boolean;
}

export const HIPOTESES_DO_GERADOR_PADRAO: HipotesesDoGerador = {
  sementes: 4,
  iteracoes: 300,
  malhaMm: 50,
  espessuraExternaMm: 200,
  espessuraInternaMm: 150,
  peDireitoMm: 2800,
  larguraCorredorMm: 1000,
  larguraPortaMm: 800,
  larguraEntradaMm: 900,
  alturaPortaMm: 2100,
  janela: { alturaMm: 1200, peitorilMm: 1000, fracaoDoLado: 0.4, minMm: 1000, maxMm: 2000 },
  retanguloSemEnvelope: { larguraMm: 10000, profundidadeMm: 12000 },
  automaticos: true,
};

export interface EntradaDoGerador {
  programa: Programa;
  /** O anel edificável do pavimento (E3.3), em mm; `null` = usa o retângulo das hipóteses. */
  envelope: Point[] | null;
  /** Direção da RUA a partir do centro do lote (unitária, no desenho) — decide a frente; `null` = sul (−Y). */
  direcaoDaFrente: Point | null;
  rotacaoNorteDeg: number | null;
  latitudeGraus: number;
  /** Hipóteses da avaliação (pesos) para a nota final. */
  hipotesesDaAvaliacao?: HipotesesDaAvaliacao;
}

export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface AmbienteGerado {
  item: ItemDoPrograma;
  /** "Dormitório 2" quando a quantidade é > 1. */
  nome: string;
  zona: 'SOCIAL' | 'SERVICO' | 'INTIMO' | 'CIRCULACAO';
  /** Retângulo no MUNDO (mm, já na malha). */
  ret: Retangulo;
  areaM2: number;
  larguraMinM: number;
  ladosExternos: LadoDaFrente[];
}

export interface ResultadoDoGerador {
  semente: number;
  hipoteses: HipotesesDoGerador;
  retangulo: Retangulo;
  frente: LadoDaFrente;
  ambientes: AmbienteGerado[];
  /** Comandos aplicados na ordem sobre um modelo vazio + pavimento. */
  comandos: Command[];
  model: BlueprintModel;
  levelId: ObjectId;
  avaliacao: Avaliacao;
  resumo: { areaConstruidaM2: number; areaUtilM2: number; paredesM: number; objetivoInicial: number; objetivoFinal: number };
  decisoes: string[];
  avisos: string[];
}

// ─── PRNG semeado ────────────────────────────────────────────────────────────

/** mulberry32: 32 bits, rápido, determinístico. */
export function prng(semente: number): () => number {
  let a = (semente >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Geometria de apoio ──────────────────────────────────────────────────────

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const snap = (v: number, malha: number) => Math.round(v / malha) * malha;

/** O maior retângulo de eixos alinhados dentro do anel (busca em grade de 250 mm sobre a caixa). */
export function maiorRetanguloInscrito(anel: Point[], passoMm = 250): Retangulo | null {
  if (anel.length < 3) return null;
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Caixa inteira dentro? (retângulo já) — o caso comum de lote retangular.
  const cantos = [point(minX, minY), point(maxX, minY), point(maxX, maxY), point(minX, maxY)];
  const dentro = (p: Point) => pointInPolygon(anel, p) || anel.some((q) => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
  if (cantos.every(dentro) && Math.abs(Math.abs(polygonArea(anel)) - (maxX - minX) * (maxY - minY)) < 1) return { x0: minX, y0: minY, x1: maxX, y1: maxY };
  // Grade de ocupação e maior retângulo por histograma.
  const nx = Math.max(1, Math.floor((maxX - minX) / passoMm));
  const ny = Math.max(1, Math.floor((maxY - minY) / passoMm));
  const ocupado: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    const linha: boolean[] = [];
    for (let i = 0; i < nx; i++) {
      const cx = minX + (i + 0.5) * passoMm;
      const cy = minY + (j + 0.5) * passoMm;
      // A célula inteira tem de estar dentro: testa o centro e os 4 cantos.
      const d = passoMm / 2 - 1;
      linha.push([point(cx, cy), point(cx - d, cy - d), point(cx + d, cy - d), point(cx + d, cy + d), point(cx - d, cy + d)].every((p) => pointInPolygon(anel, p)));
    }
    ocupado.push(linha);
  }
  let melhor: { area: number; ret: Retangulo } | null = null;
  const alturas = new Array(nx).fill(0) as number[];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) alturas[i] = ocupado[j][i] ? alturas[i] + 1 : 0;
    // maior retângulo no histograma (pilha)
    const pilha: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? alturas[i] : 0;
      while (pilha.length && alturas[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop()!;
        const altura = alturas[topo];
        const esquerda = pilha.length ? pilha[pilha.length - 1] + 1 : 0;
        const largura = i - esquerda;
        const area = altura * largura;
        if (altura > 0 && (!melhor || area > melhor.area)) {
          melhor = { area, ret: { x0: minX + esquerda * passoMm, y0: minY + (j - altura + 1) * passoMm, x1: minX + i * passoMm, y1: minY + (j + 1) * passoMm } };
        }
      }
      pilha.push(i);
    }
  }
  return melhor?.ret ?? null;
}

/** A frente: o lado do retângulo cuja normal externa mais aponta para a rua. */
export function ladoDaFrente(direcao: Point | null): LadoDaFrente {
  if (!direcao) return 'S';
  const c = Math.hypot(direcao.x, direcao.y) || 1;
  const dx = direcao.x / c;
  const dy = direcao.y / c;
  const candidatos: [LadoDaFrente, number][] = [
    ['S', -dy],
    ['N', dy],
    ['L', dx],
    ['O', -dx],
  ];
  return candidatos.sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Plano (retângulos em coordenadas canônicas: x ao longo da frente, y da frente para o fundo) ──

interface ItemPlanejado {
  item: ItemDoPrograma;
  nome: string;
  zona: AmbienteGerado['zona'];
  areaAlvoMm2: number;
}

interface CaixaCanonica {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Plano {
  frente: ItemPlanejado[];
  fundo: ItemPlanejado[];
  corredor: ItemPlanejado | null;
}

/** Treemap em faixas (ordem preservada): itens em linhas paralelas à frente, dentro de uma faixa W × D. */
function treemapEmFaixas(itens: readonly ItemPlanejado[], W: number, D: number, y0: number, umaLinha = false): Map<ItemPlanejado, CaixaCanonica> {
  const out = new Map<ItemPlanejado, CaixaCanonica>();
  const total = itens.reduce((s, i) => s + i.areaAlvoMm2, 0) || 1;
  const escala = (W * D) / total;
  let y = y0;
  let i = 0;
  while (i < itens.length) {
    // Cresce a linha enquanto a pior proporção melhora.
    let linha = [itens[i]];
    let melhorPior = Infinity;
    let j = i + 1;
    const piorDe = (ls: ItemPlanejado[]) => {
      const area = ls.reduce((s, x) => s + x.areaAlvoMm2 * escala, 0);
      const h = area / W;
      return Math.max(...ls.map((x) => {
        const w = (x.areaAlvoMm2 * escala) / h;
        return Math.max(w / h, h / w);
      }));
    };
    melhorPior = piorDe(linha);
    while (j < itens.length) {
      const teste = [...linha, itens[j]];
      const pior = piorDe(teste);
      if (umaLinha || pior <= melhorPior) {
        linha = teste;
        melhorPior = pior;
        j++;
      } else break;
    }
    const areaLinha = linha.reduce((s, x) => s + x.areaAlvoMm2 * escala, 0);
    const h = i + linha.length >= itens.length ? y0 + D - y : areaLinha / W; // a última linha fecha a faixa
    let x = 0;
    linha.forEach((x0, k) => {
      const w = k === linha.length - 1 ? W - x : ((x0.areaAlvoMm2 * escala) / areaLinha) * W;
      out.set(x0, { x0: x, y0: y, x1: x + w, y1: y + h });
      x += w;
    });
    y += h;
    i += linha.length;
  }
  return out;
}

function caixasDoPlano(plano: Plano, W: number, D: number, corredorMm: number): Map<ItemPlanejado, CaixaCanonica> {
  const areaFrente = plano.frente.reduce((s, i) => s + i.areaAlvoMm2, 0);
  const areaFundo = plano.fundo.reduce((s, i) => s + i.areaAlvoMm2, 0);
  const dCorredor = plano.corredor ? corredorMm : 0;
  const disponivel = D - dCorredor;
  const dFrente = plano.fundo.length === 0 ? disponivel : plano.frente.length === 0 ? 0 : (disponivel * areaFrente) / (areaFrente + areaFundo || 1);
  const out = new Map<ItemPlanejado, CaixaCanonica>();
  if (plano.frente.length) for (const [k, v] of treemapEmFaixas(plano.frente, W, dFrente, 0)) out.set(k, v);
  if (plano.corredor) out.set(plano.corredor, { x0: 0, y0: dFrente, x1: W, y1: dFrente + dCorredor });
  // O fundo é UMA linha: todo íntimo encosta no corredor (ou na faixa da frente) e ganha porta.
  if (plano.fundo.length) for (const [k, v] of treemapEmFaixas(plano.fundo, W, disponivel - dFrente, dFrente + dCorredor, true)) out.set(k, v);
  return out;
}

// ─── Função objetivo (proxy do score) ────────────────────────────────────────

function adjacentes(a: CaixaCanonica, b: CaixaCanonica): boolean {
  const tocaX = Math.abs(a.x1 - b.x0) < 1 || Math.abs(b.x1 - a.x0) < 1;
  const tocaY = Math.abs(a.y1 - b.y0) < 1 || Math.abs(b.y1 - a.y0) < 1;
  const sobreX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 300;
  const sobreY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 300;
  return (tocaX && sobreY) || (tocaY && sobreX);
}

function ladosExternosDe(c: CaixaCanonica, W: number, D: number): ('FRENTE' | 'FUNDO' | 'ESQ' | 'DIR')[] {
  const out: ('FRENTE' | 'FUNDO' | 'ESQ' | 'DIR')[] = [];
  if (c.y0 < 1) out.push('FRENTE');
  if (c.y1 > D - 1) out.push('FUNDO');
  if (c.x0 < 1) out.push('ESQ');
  if (c.x1 > W - 1) out.push('DIR');
  return out;
}

/** Azimute da normal externa de cada lado canônico, dado o lado da frente e o norte do desenho. */
function azimuteDoLado(lado: 'FRENTE' | 'FUNDO' | 'ESQ' | 'DIR', frente: LadoDaFrente, rotacaoNorteDeg: number | null): number {
  const azFrente: Record<LadoDaFrente, number> = { N: 0, L: 90, S: 180, O: 270 };
  const base = (azFrente[frente] - (rotacaoNorteDeg ?? 0) + 360) % 360; // azimute da normal da frente
  // Canônico: olhando da frente para o fundo, ESQ está à esquerda (−90° no sentido horário do azimute do fundo).
  const azFundo = (base + 180) % 360;
  if (lado === 'FRENTE') return base;
  if (lado === 'FUNDO') return azFundo;
  if (lado === 'DIR') return (azFundo + 90) % 360; // à direita de quem entra = à esquerda de quem olha da rua… convenção estável
  return (azFundo + 270) % 360;
}

function objetivo(plano: Plano, caixas: Map<ItemPlanejado, CaixaCanonica>, W: number, D: number, programa: Programa, frente: LadoDaFrente, rotacaoNorteDeg: number | null): number {
  let J = 0;
  const todos = [...plano.frente, ...(plano.corredor ? [plano.corredor] : []), ...plano.fundo];
  const porItemId = new Map<string, ItemPlanejado[]>();
  for (const t of todos) porItemId.set(t.item.id, [...(porItemId.get(t.item.id) ?? []), t]);
  for (const t of todos) {
    const c = caixas.get(t)!;
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const menor = Math.min(w, h);
    if (t.zona !== 'CIRCULACAO') {
      if (menor < t.item.larguraMinMm) J += (10 * (t.item.larguraMinMm - menor)) / t.item.larguraMinMm;
      const prop = Math.max(w, h) / Math.max(1, menor);
      if (prop > 2.2) J += 2 * (prop - 2.2);
    }
    const lados = ladosExternosDe(c, W, D);
    if (t.item.exigeFachada && lados.length === 0) J += 8;
    if (t.item.exigeIluminacao && lados.length === 0) J += 6;
    if (t.item.exigeIluminacao && lados.length > 0) {
      // Sol: quanto mais ao norte (hemisfério sul) a melhor fachada, menor a penalidade (0 a 2).
      const melhor = Math.min(...lados.map((l) => Math.min(azimuteDoLado(l, frente, rotacaoNorteDeg), 360 - azimuteDoLado(l, frente, rotacaoNorteDeg))));
      J += (2 * melhor) / 180;
    }
    // Privacidade: íntimo na frente (rua) pesa um pouco.
    if (t.zona === 'INTIMO' && lados.includes('FRENTE')) J += 1.5;
    // Zona por fluxo: a sala (social) quer a frente; o serviço não.
    if (t.zona === 'SOCIAL' && !lados.includes('FRENTE')) J += t.item.uso === 'SALA' ? 12 : 2;
    if (t.zona === 'SERVICO' && lados.includes('FRENTE')) J += 1;
  }
  const relacoes: RelacaoDoPrograma[] = programa.relacoes;
  for (const r of relacoes) {
    const as = porItemId.get(r.a) ?? [];
    const bs = porItemId.get(r.b) ?? [];
    if (!as.length || !bs.length) continue;
    let melhorAdj = false;
    let melhorDist = Infinity;
    for (const a of as)
      for (const b of bs) {
        const ca = caixas.get(a)!;
        const cb = caixas.get(b)!;
        if (adjacentes(ca, cb)) melhorAdj = true;
        const d = Math.hypot((ca.x0 + ca.x1 - cb.x0 - cb.x1) / 2, (ca.y0 + ca.y1 - cb.y0 - cb.y1) / 2);
        melhorDist = Math.min(melhorDist, d);
      }
    if (r.tipo === 'OBRIGATORIA' && !melhorAdj) J += 10;
    else if (r.tipo === 'PROIBIDA' && melhorAdj) J += 10;
    else if (r.tipo === 'DESEJAVEL' && !melhorAdj) J += (r.peso / 10) * Math.min(1, melhorDist / Math.hypot(W, D)) * 4;
  }
  return Math.round(J * 100) / 100;
}

// ─── Geração ─────────────────────────────────────────────────────────────────

function itensPlanejados(programa: Programa): { frente: ItemPlanejado[]; fundo: ItemPlanejado[]; corredor: ItemPlanejado | null } {
  const frente: ItemPlanejado[] = [];
  const fundo: ItemPlanejado[] = [];
  let corredor: ItemPlanejado | null = null;
  for (const item of programa.itens) {
    for (let k = 0; k < item.quantidade; k++) {
      const nome = item.quantidade > 1 ? `${item.nome} ${k + 1}` : item.nome;
      const areaAlvoMm2 = Math.max(item.areaIdealM2, item.areaMinM2) * 1e6;
      if (item.uso === 'CIRCULACAO') {
        if (!corredor) corredor = { item, nome: item.nome, zona: 'CIRCULACAO', areaAlvoMm2 };
        continue;
      }
      const zona: AmbienteGerado['zona'] = item.privacidade === 'INTIMO' ? 'INTIMO' : item.privacidade === 'SERVICO' ? 'SERVICO' : 'SOCIAL';
      (zona === 'INTIMO' ? fundo : frente).push({ item, nome, zona, areaAlvoMm2 });
    }
  }
  // Frente: social antes de serviço (a sala na rua, a cozinha encostada nela).
  frente.sort((a, b) => (a.zona === b.zona ? 0 : a.zona === 'SOCIAL' ? -1 : 1));
  return { frente, fundo, corredor };
}

function recozer(plano: Plano, W: number, D: number, programa: Programa, frente: LadoDaFrente, rotacaoNorteDeg: number | null, corredorMm: number, iteracoes: number, rnd: () => number): { plano: Plano; inicial: number; final: number } {
  let atual: Plano = { frente: [...plano.frente], fundo: [...plano.fundo], corredor: plano.corredor };
  let J = objetivo(atual, caixasDoPlano(atual, W, D, corredorMm), W, D, programa, frente, rotacaoNorteDeg);
  const inicial = J;
  let melhor = atual;
  let melhorJ = J;
  const T0 = Math.max(1, J) / 2;
  for (let it = 0; it < iteracoes; it++) {
    const T = T0 * (1 - it / iteracoes) + 0.01;
    const cand: Plano = { frente: [...atual.frente], fundo: [...atual.fundo], corredor: atual.corredor };
    const tipo = rnd();
    if (tipo < 0.45 && cand.frente.length > 1) {
      const i = Math.floor(rnd() * cand.frente.length);
      const j = Math.floor(rnd() * cand.frente.length);
      [cand.frente[i], cand.frente[j]] = [cand.frente[j], cand.frente[i]];
    } else if (tipo < 0.9 && cand.fundo.length > 1) {
      const i = Math.floor(rnd() * cand.fundo.length);
      const j = Math.floor(rnd() * cand.fundo.length);
      [cand.fundo[i], cand.fundo[j]] = [cand.fundo[j], cand.fundo[i]];
    } else if (cand.frente.length > 1 && cand.fundo.length > 0) {
      // Um serviço pode ir para o fundo (área de serviço atrás) e voltar.
      const i = cand.frente.findIndex((x) => x.zona === 'SERVICO');
      if (i >= 0 && rnd() < 0.5) cand.fundo.push(...cand.frente.splice(i, 1));
      else {
        const k = cand.fundo.findIndex((x) => x.zona === 'SERVICO');
        if (k >= 0) cand.frente.push(...cand.fundo.splice(k, 1));
        else continue;
      }
    } else continue;
    const Jc = objetivo(cand, caixasDoPlano(cand, W, D, corredorMm), W, D, programa, frente, rotacaoNorteDeg);
    if (Jc <= J || rnd() < Math.exp((J - Jc) / T)) {
      atual = cand;
      J = Jc;
      if (J < melhorJ) {
        melhor = cand;
        melhorJ = J;
      }
    }
  }
  return { plano: melhor, inicial, final: melhorJ };
}

/** Une segmentos colineares (horizontais/verticais) sobrepostos ou encostados. */
function unirSegmentos(segs: { a: Point; b: Point }[]): { a: Point; b: Point }[] {
  const porLinha = new Map<string, { ini: number; fim: number }[]>();
  for (const s of segs) {
    const vertical = Math.abs(s.a.x - s.b.x) < 1;
    const chave = vertical ? `v:${s.a.x}` : `h:${s.a.y}`;
    const ini = vertical ? Math.min(s.a.y, s.b.y) : Math.min(s.a.x, s.b.x);
    const fim = vertical ? Math.max(s.a.y, s.b.y) : Math.max(s.a.x, s.b.x);
    porLinha.set(chave, [...(porLinha.get(chave) ?? []), { ini, fim }]);
  }
  const out: { a: Point; b: Point }[] = [];
  for (const [chave, lista] of [...porLinha.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lista.sort((p, q) => p.ini - q.ini);
    const fundidos: { ini: number; fim: number }[] = [];
    for (const l of lista) {
      const ult = fundidos[fundidos.length - 1];
      if (ult && l.ini <= ult.fim + 1) ult.fim = Math.max(ult.fim, l.fim);
      else fundidos.push({ ...l });
    }
    const [tipo, coord] = chave.split(':');
    const c = Number(coord);
    for (const f of fundidos) {
      if (f.fim - f.ini < 1) continue;
      out.push(tipo === 'v' ? { a: point(c, f.ini), b: point(c, f.fim) } : { a: point(f.ini, c), b: point(f.fim, c) });
    }
  }
  return out;
}

/** A parede do modelo que contém o segmento (colinear e dentro). */
function paredeDoSegmento(paredes: readonly Wall[], a: Point, b: Point): Wall | null {
  for (const w of paredes) {
    const vertical = Math.abs(w.a.x - w.b.x) < 1;
    if (vertical) {
      if (Math.abs(a.x - w.a.x) > 1 || Math.abs(b.x - w.a.x) > 1) continue;
      const lo = Math.min(w.a.y, w.b.y) - 1;
      const hi = Math.max(w.a.y, w.b.y) + 1;
      if (a.y >= lo && a.y <= hi && b.y >= lo && b.y <= hi) return w;
    } else {
      if (Math.abs(a.y - w.a.y) > 1 || Math.abs(b.y - w.a.y) > 1) continue;
      const lo = Math.min(w.a.x, w.b.x) - 1;
      const hi = Math.max(w.a.x, w.b.x) + 1;
      if (a.x >= lo && a.x <= hi && b.x >= lo && b.x <= hi) return w;
    }
  }
  return null;
}

function offsetNaParede(w: Wall, p: Point): number {
  return Math.hypot(p.x - w.a.x, p.y - w.a.y);
}

export function gerar(entrada: EntradaDoGerador, semente: number, hipParcial: Partial<HipotesesDoGerador> = {}): ResultadoDoGerador {
  const hip: HipotesesDoGerador = { ...HIPOTESES_DO_GERADOR_PADRAO, ...hipParcial, janela: { ...HIPOTESES_DO_GERADOR_PADRAO.janela, ...(hipParcial.janela ?? {}) } };
  const decisoes: string[] = [];
  const avisos: string[] = [];
  const rnd = prng(semente);
  const { programa } = entrada;

  // Retângulo de trabalho.
  let ret: Retangulo;
  if (entrada.envelope && entrada.envelope.length >= 3) {
    const r = maiorRetanguloInscrito(entrada.envelope);
    if (!r) throw new Error('gerador: o envelope não contém um retângulo de eixos alinhados');
    ret = r;
    decisoes.push(`Retângulo de trabalho ${f2((r.x1 - r.x0) / 1000)} × ${f2((r.y1 - r.y0) / 1000)} m — o maior de eixos alinhados dentro do envelope edificável.`);
  } else {
    ret = { x0: 0, y0: 0, x1: hip.retanguloSemEnvelope.larguraMm, y1: hip.retanguloSemEnvelope.profundidadeMm };
    decisoes.push(`Sem envelope: retângulo declarado ${f2(ret.x1 / 1000)} × ${f2(ret.y1 / 1000)} m na origem.`);
  }
  ret = { x0: snap(ret.x0, hip.malhaMm), y0: snap(ret.y0, hip.malhaMm), x1: snap(ret.x1, hip.malhaMm), y1: snap(ret.y1, hip.malhaMm) };
  const frente = ladoDaFrente(entrada.direcaoDaFrente);
  const nomeDaFrente: Record<LadoDaFrente, string> = { S: 'sul (−Y)', N: 'norte (+Y)', L: 'leste (+X)', O: 'oeste (−X)' };
  decisoes.push(`Frente do lote a ${nomeDaFrente[frente]}${entrada.direcaoDaFrente ? ' (pela divisa FRENTE)' : ' (suposição: sem divisa marcada)'}; norte do desenho ${entrada.rotacaoNorteDeg == null ? '= +Y' : `girado ${entrada.rotacaoNorteDeg}°`}.`);

  // Frame canônico.
  const aoLongo = frente === 'S' || frente === 'N';
  const W = aoLongo ? ret.x1 - ret.x0 : ret.y1 - ret.y0;
  const D = aoLongo ? ret.y1 - ret.y0 : ret.x1 - ret.x0;
  const mundo = (px: number, py: number): Point => {
    switch (frente) {
      case 'S':
        return point(ret.x0 + px, ret.y0 + py);
      case 'N':
        return point(ret.x0 + px, ret.y1 - py);
      case 'O':
        return point(ret.x0 + py, ret.y0 + px);
      case 'L':
        return point(ret.x1 - py, ret.y0 + px);
    }
  };

  // (a)+(b) zona e alocação.
  const base = itensPlanejados(programa);
  if (base.frente.length + base.fundo.length === 0) throw new Error('gerador: o programa não tem ambientes (fora a circulação)');
  const areaPedida = [...base.frente, ...base.fundo].reduce((s, i) => s + i.areaAlvoMm2, 0) + (base.corredor ? W * hip.larguraCorredorMm : 0);
  const areaDisponivel = W * D;
  const fator = areaDisponivel / (areaPedida || 1);
  decisoes.push(
    `Programa pede ${f2(areaPedida / 1e6)} m² (áreas ideais${base.corredor ? ` + corredor de ${f2(hip.larguraCorredorMm / 1000)} m` : ''}); o retângulo tem ${f2(areaDisponivel / 1e6)} m² — áreas ${fator >= 1 ? 'ampliadas' : 'reduzidas'} em ${f2(fator * 100)} % para preencher.`,
  );
  if (fator < 1) {
    const abaixoDoMinimo = [...base.frente, ...base.fundo].filter((i) => i.areaAlvoMm2 * fator < i.item.areaMinM2 * 1e6).map((i) => i.nome);
    if (abaixoDoMinimo.length) avisos.push(`Cabem abaixo da área mínima: ${abaixoDoMinimo.join(', ')} — o envelope é pequeno para o programa.`);
  }
  decisoes.push(`Zonas: ${base.frente.filter((i) => i.zona === 'SOCIAL').length} social + ${base.frente.filter((i) => i.zona === 'SERVICO').length} serviço à frente; ${base.corredor ? 'corredor; ' : ''}${base.fundo.length} íntimo(s) ao fundo.`);

  // (c) recozimento — cada semente parte de uma ordem própria (embaralha dentro de
  // cada zona, mantendo social antes de serviço), senão todas convergem ao mesmo vale.
  const embaralhar = <T,>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const inicialDoPlano: Plano = {
    frente: [...embaralhar(base.frente.filter((i) => i.zona === 'SOCIAL')), ...embaralhar(base.frente.filter((i) => i.zona === 'SERVICO'))],
    fundo: embaralhar(base.fundo),
    corredor: base.corredor,
  };
  const { plano, inicial, final } = recozer(inicialDoPlano, W, D, programa, frente, entrada.rotacaoNorteDeg, hip.larguraCorredorMm, hip.iteracoes, rnd);
  decisoes.push(`Recozimento simulado: ${hip.iteracoes} iterações com a semente ${semente}; função objetivo ${f2(inicial)} → ${f2(final)} (largura mínima, proporção, fachada e sol de quem exige, matriz de proximidade, privacidade).`);
  const caixas = caixasDoPlano(plano, W, D, hip.larguraCorredorMm);

  // Malha: arredonda as coordenadas cumulativas (mantém adjacência).
  const snapC = (c: CaixaCanonica): CaixaCanonica => ({ x0: snap(c.x0, hip.malhaMm), y0: snap(c.y0, hip.malhaMm), x1: snap(c.x1, hip.malhaMm), y1: snap(c.y1, hip.malhaMm) });
  const ambientes: AmbienteGerado[] = [];
  const todos = [...plano.frente, ...(plano.corredor ? [plano.corredor] : []), ...plano.fundo];
  for (const t of todos) {
    const c = snapC(caixas.get(t)!);
    const p1 = mundo(c.x0, c.y0);
    const p2 = mundo(c.x1, c.y1);
    const r: Retangulo = { x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y), x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y) };
    const lados = ladosExternosDe(c, W, D).map((l): LadoDaFrente => {
      const az = azimuteDoLado(l, frente, entrada.rotacaoNorteDeg);
      return az < 45 || az >= 315 ? 'N' : az < 135 ? 'L' : az < 225 ? 'S' : 'O';
    });
    ambientes.push({ item: t.item, nome: t.nome, zona: t.zona, ret: r, areaM2: Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 10_000) / 100, larguraMinM: Math.min(r.x1 - r.x0, r.y1 - r.y0) / 1000, ladosExternos: lados });
  }

  // (d) paredes.
  let model = emptyModel();
  const comandos: Command[] = [];
  const aplicar = (cmds: Command[]) => {
    if (cmds.length === 0) return;
    model = applyBatch(model, cmds).model;
    comandos.push(...cmds);
  };
  aplicar([{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: hip.peDireitoMm }]);
  const levelId = model.levels[0].id;
  const externas = [
    { a: point(ret.x0, ret.y0), b: point(ret.x1, ret.y0) },
    { a: point(ret.x1, ret.y0), b: point(ret.x1, ret.y1) },
    { a: point(ret.x1, ret.y1), b: point(ret.x0, ret.y1) },
    { a: point(ret.x0, ret.y1), b: point(ret.x0, ret.y0) },
  ];
  const internas = unirSegmentos(
    ambientes.flatMap((a) => [
      { a: point(a.ret.x0, a.ret.y0), b: point(a.ret.x1, a.ret.y0) },
      { a: point(a.ret.x1, a.ret.y0), b: point(a.ret.x1, a.ret.y1) },
      { a: point(a.ret.x1, a.ret.y1), b: point(a.ret.x0, a.ret.y1) },
      { a: point(a.ret.x0, a.ret.y1), b: point(a.ret.x0, a.ret.y0) },
    ]),
  ).filter((s) => {
    const naBorda = (Math.abs(s.a.x - s.b.x) < 1 && (Math.abs(s.a.x - ret.x0) < 1 || Math.abs(s.a.x - ret.x1) < 1)) || (Math.abs(s.a.y - s.b.y) < 1 && (Math.abs(s.a.y - ret.y0) < 1 || Math.abs(s.a.y - ret.y1) < 1));
    return !naBorda;
  });
  const uidDaParede = (k: number) => uidDeterministico(`gerador:${semente}:parede:${k}`);
  aplicar(externas.map((s, k): Command => ({ type: 'AddWall', levelId, a: s.a, b: s.b, thicknessMm: hip.espessuraExternaMm, heightMm: hip.peDireitoMm, uid: uidDaParede(k) })));
  aplicar(internas.map((s, k): Command => ({ type: 'AddWall', levelId, a: s.a, b: s.b, thicknessMm: hip.espessuraInternaMm, heightMm: hip.peDireitoMm, uid: uidDaParede(externas.length + k) })));
  decisoes.push(`${externas.length} paredes externas de ${hip.espessuraExternaMm} mm e ${internas.length} internas de ${hip.espessuraInternaMm} mm, na malha de ${hip.malhaMm} mm.`);

  // Nomes.
  const centro = (r: Retangulo) => point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  const nomes: Command[] = [];
  for (const a of ambientes) {
    const s = model.spaces.find((x) => x.levelId === levelId && pointInPolygon(x.ring, centro(a.ret)));
    if (s) nomes.push({ type: 'NameSpace', spaceId: s.id, name: a.nome, tipoDeAmbiente: FICHA_DO_USO[a.item.uso].tipoNbr5410 });
    else avisos.push(`${a.nome}: o arranjo não fechou o ambiente (retângulo ${f2((a.ret.x1 - a.ret.x0) / 1000)} × ${f2((a.ret.y1 - a.ret.y0) / 1000)} m).`);
  }
  aplicar(nomes);

  // Portas e janelas.
  const paredes = () => model.walls.filter((w) => w.levelId === levelId);
  const aberturas: Command[] = [];
  const corredor = ambientes.find((a) => a.zona === 'CIRCULACAO') ?? null;
  const sala = ambientes.find((a) => a.item.uso === 'SALA') ?? ambientes.find((a) => a.zona === 'SOCIAL') ?? null;
  const ladoComum = (a: Retangulo, b: Retangulo): { a: Point; b: Point } | null => {
    if (Math.abs(a.x1 - b.x0) < 1 || Math.abs(b.x1 - a.x0) < 1) {
      const x = Math.abs(a.x1 - b.x0) < 1 ? a.x1 : a.x0;
      const lo = Math.max(a.y0, b.y0);
      const hi = Math.min(a.y1, b.y1);
      if (hi - lo >= hip.larguraPortaMm + 300) return { a: point(x, lo), b: point(x, hi) };
    }
    if (Math.abs(a.y1 - b.y0) < 1 || Math.abs(b.y1 - a.y0) < 1) {
      const y = Math.abs(a.y1 - b.y0) < 1 ? a.y1 : a.y0;
      const lo = Math.max(a.x0, b.x0);
      const hi = Math.min(a.x1, b.x1);
      if (hi - lo >= hip.larguraPortaMm + 300) return { a: point(lo, y), b: point(hi, y) };
    }
    return null;
  };
  /** Intervalos já ocupados por vão em cada parede (offset inicial, final) — dois vãos não se sobrepõem. */
  const ocupados = new Map<ObjectId, { ini: number; fim: number }[]>();
  const FOLGA = 150;
  /** O offset livre mais perto do desejado dentro de [lo, hi] (offsets na parede), ou null. */
  const encaixar = (w: Wall, desejado: number, largura: number, lo: number, hi: number): number | null => {
    const lista = ocupados.get(w.id) ?? [];
    const cabe = (off: number) => off >= lo && off + largura <= hi && !lista.some((o) => off < o.fim + FOLGA && off + largura > o.ini - FOLGA);
    const alvo = snap(desejado, hip.malhaMm);
    if (cabe(alvo)) return alvo;
    for (let d = hip.malhaMm; d <= hi - lo; d += hip.malhaMm) {
      if (cabe(alvo - d)) return alvo - d;
      if (cabe(alvo + d)) return alvo + d;
    }
    return null;
  };
  const reservar = (w: Wall, off: number, largura: number) => ocupados.set(w.id, [...(ocupados.get(w.id) ?? []), { ini: off, fim: off + largura }]);
  const porta = (seg: { a: Point; b: Point }, largura: number): Command | null => {
    const w = paredeDoSegmento(paredes(), seg.a, seg.b);
    if (!w) return null;
    const meio = point((seg.a.x + seg.b.x) / 2, (seg.a.y + seg.b.y) / 2);
    const lo = Math.min(offsetNaParede(w, seg.a), offsetNaParede(w, seg.b)) + FOLGA;
    const hi = Math.max(offsetNaParede(w, seg.a), offsetNaParede(w, seg.b)) - FOLGA;
    const off = encaixar(w, offsetNaParede(w, meio) - largura / 2, largura, lo, hi);
    if (off === null) return null;
    reservar(w, off, largura);
    return { type: 'AddOpening', wallId: w.id, wallUid: w.uid, kind: 'door', offsetMm: off, widthMm: largura, heightMm: hip.alturaPortaMm, sillMm: 0 };
  };
  // PORTAS por busca em largura a partir do HUB (corredor; senão a sala): cada
  // ambiente ganha porta para o vizinho pelo qual foi alcançado — assim todos
  // se ligam ao hub (a sala atrás da cozinha abre para a cozinha, não fica
  // ilhada). Preferência de pai: corredor > sala > mesma zona > outros.
  const portasFeitas = new Set<string>();
  const abrirPorta = (a: AmbienteGerado, b: AmbienteGerado): boolean => {
    const chave = [a.nome, b.nome].sort().join('|');
    if (portasFeitas.has(chave)) return true;
    const seg = ladoComum(a.ret, b.ret);
    if (!seg) return false;
    const cmd = porta(seg, hip.larguraPortaMm);
    if (!cmd) return false;
    aberturas.push(cmd);
    portasFeitas.add(chave);
    return true;
  };
  const hub = corredor ?? sala ?? ambientes[0];
  const alcancados = new Set<AmbienteGerado>([hub]);
  const fila: AmbienteGerado[] = [hub];
  const prioridade = (x: AmbienteGerado, de: AmbienteGerado) => (x === corredor ? 0 : x === sala ? 1 : x.zona === de.zona ? 2 : 3);
  while (fila.length) {
    const atual = fila.shift()!;
    const vizinhos = ambientes.filter((x) => !alcancados.has(x) && ladoComum(atual.ret, x.ret)).sort((p, q) => prioridade(p, atual) - prioridade(q, atual) || p.nome.localeCompare(q.nome, 'pt-BR'));
    for (const v of vizinhos) {
      if (alcancados.has(v)) continue;
      if (abrirPorta(v, atual)) {
        alcancados.add(v);
        fila.push(v);
      }
    }
  }
  for (const a of ambientes) if (!alcancados.has(a)) avisos.push(`${a.nome}: sem lado comum largo o bastante para uma porta — ficou sem acesso.`);
  // Relações OBRIGATÓRIAS da matriz = porta direta quando os dois encostam.
  for (const r of programa.relacoes) {
    if (r.tipo !== 'OBRIGATORIA') continue;
    for (const a of ambientes.filter((x) => x.item.id === r.a)) for (const b of ambientes.filter((x) => x.item.id === r.b)) if (ladoComum(a.ret, b.ret)) abrirPorta(a, b);
  }
  // Entrada: no lado da frente da sala (ou do corredor).
  const entradaEm = [sala, ...ambientes.filter((a) => a.zona === 'SOCIAL' && a !== sala), corredor, ...ambientes].find((a) => a && (frente === 'S' ? Math.abs(a.ret.y0 - ret.y0) < 1 : frente === 'N' ? Math.abs(a.ret.y1 - ret.y1) < 1 : frente === 'O' ? Math.abs(a.ret.x0 - ret.x0) < 1 : Math.abs(a.ret.x1 - ret.x1) < 1));
  if (entradaEm) {
    const r = entradaEm.ret;
    const seg = frente === 'S' ? { a: point(r.x0, r.y0), b: point(r.x1, r.y0) } : frente === 'N' ? { a: point(r.x0, r.y1), b: point(r.x1, r.y1) } : frente === 'O' ? { a: point(r.x0, r.y0), b: point(r.x0, r.y1) } : { a: point(r.x1, r.y0), b: point(r.x1, r.y1) };
    const cmd = porta(seg, hip.larguraEntradaMm);
    if (cmd) {
      aberturas.push(cmd);
      decisoes.push(`Entrada de ${f2(hip.larguraEntradaMm / 1000)} m pela frente, em ${entradaEm.nome}.`);
    }
  }
  // Janelas.
  const janelas: string[] = [];
  for (const a of ambientes) {
    if (a.zona === 'CIRCULACAO') continue;
    const precisa = a.item.exigeIluminacao || a.item.exigeFachada || a.item.exigeVentilacao;
    if (!precisa) continue;
    const ladosExt: { a: Point; b: Point; lado: LadoDaFrente }[] = [];
    const r = a.ret;
    if (Math.abs(r.y0 - ret.y0) < 1) ladosExt.push({ a: point(r.x0, r.y0), b: point(r.x1, r.y0), lado: 'S' });
    if (Math.abs(r.y1 - ret.y1) < 1) ladosExt.push({ a: point(r.x0, r.y1), b: point(r.x1, r.y1), lado: 'N' });
    if (Math.abs(r.x0 - ret.x0) < 1) ladosExt.push({ a: point(r.x0, r.y0), b: point(r.x0, r.y1), lado: 'O' });
    if (Math.abs(r.x1 - ret.x1) < 1) ladosExt.push({ a: point(r.x1, r.y0), b: point(r.x1, r.y1), lado: 'L' });
    if (ladosExt.length === 0) {
      avisos.push(`${a.nome} exige ${a.item.exigeIluminacao ? 'iluminação' : a.item.exigeFachada ? 'fachada' : 'ventilação'} e ficou sem lado externo.`);
      continue;
    }
    // Prefere o lado mais ao norte (sol de inverno no hemisfério sul); desempate pelo comprimento.
    const az = (l: LadoDaFrente) => ({ N: 0, L: 90, S: 180, O: 270 })[l];
    const escolhido = [...ladosExt].sort((p, q) => Math.min(az(p.lado), 360 - az(p.lado)) - Math.min(az(q.lado), 360 - az(q.lado)) || Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))[0];
    const comprimento = Math.hypot(escolhido.b.x - escolhido.a.x, escolhido.b.y - escolhido.a.y);
    const banheiro = a.item.uso === 'BANHEIRO' || a.item.uso === 'LAVABO';
    const largura = banheiro ? 600 : Math.max(hip.janela.minMm, Math.min(hip.janela.maxMm, snap(comprimento * hip.janela.fracaoDoLado, hip.malhaMm)));
    if (largura > comprimento - 400) continue;
    const w = paredeDoSegmento(paredes(), escolhido.a, escolhido.b);
    if (!w) continue;
    const meio = point((escolhido.a.x + escolhido.b.x) / 2, (escolhido.a.y + escolhido.b.y) / 2);
    const lo = Math.min(offsetNaParede(w, escolhido.a), offsetNaParede(w, escolhido.b)) + FOLGA;
    const hi = Math.max(offsetNaParede(w, escolhido.a), offsetNaParede(w, escolhido.b)) - FOLGA;
    const off = encaixar(w, offsetNaParede(w, meio) - largura / 2, largura, lo, hi);
    if (off === null) {
      avisos.push(`${a.nome}: não coube janela no lado ${escolhido.lado} (a porta ocupa o trecho).`);
      continue;
    }
    reservar(w, off, largura);
    aberturas.push({ type: 'AddOpening', wallId: w.id, wallUid: w.uid, kind: 'window', offsetMm: off, widthMm: largura, heightMm: banheiro ? 600 : hip.janela.alturaMm, sillMm: banheiro ? 1600 : hip.janela.peitorilMm });
    janelas.push(`${a.nome} (${escolhido.lado})`);
  }
  aplicar(aberturas);
  if (janelas.length) decisoes.push(`Janelas na fachada de quem exige, preferindo o norte: ${janelas.join(', ')}.`);

  // (e) automáticos.
  if (hip.automaticos) {
    const contagem: string[] = [];
    const tentar = (nome: string, fn: () => Command[]) => {
      try {
        const cmds = fn();
        aplicar(cmds);
        contagem.push(`${nome}: ${cmds.length}`);
      } catch (e) {
        avisos.push(`automático "${nome}" falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    tentar('pilares', () => planejarPilares(model, levelId).comandos);
    tentar('vigas', () => planejarVigas(model, levelId).comandos);
    tentar('lajes', () => planejarLajes(model, levelId).comandos);
    tentar('tomadas e luz (NBR 5410)', () => {
      const cmds: Command[] = [];
      const ws = paredes();
      for (const s of model.spaces.filter((x) => x.levelId === levelId)) {
        const tipo = etiquetaDoAmbiente(s, model.labels)?.tipoDeAmbiente ?? null;
        const areaM2 = areaRecuada(s.ring, ws).areaMm2 / 1e6;
        const conf = conferirTomadas(s, tipo, ws, model.terminais ?? [], areaM2);
        if (conf) {
          const pontos = distribuirAoLongo(ladosDePiso(s, ws), Math.max(conf.deficit, conf.deficitMedias), model.walls, model.openings, 150, []);
          cmds.push(...comandosParaCompletar(levelId, pontos, conf));
        }
        cmds.push(...comandosDeIluminacao(levelId, s, model.walls, model.openings, hip.peDireitoMm, conferirIluminacao(s, model.terminais ?? [], areaM2, tipo), model.terminais ?? []));
      }
      return aplicarPotenciaPadrao(model, cmds);
    });
    tentar('pontos hidráulicos', () => planejarPontosDoNivel(model, levelId).flatMap((p) => p.comandos));
    decisoes.push(`Automáticos: ${contagem.join(' · ')}. Água e esgoto ficam para depois (precisam de reservatório e caixa de inspeção posicionados).`);
  }

  // (f) avaliação.
  const conferencia = conferirPrograma(model, programa);
  const regras = avaliarRegras(model, REGRAS_SEMENTE, {});
  const avaliacao = avaliar(
    { model, programa, conferencia, resultadosDeRegras: regras, insolacao: { latitudeGraus: entrada.latitudeGraus, rotacaoNorteDeg: entrada.rotacaoNorteDeg, prismas: [] }, insolacaoMinimaH: null, custoTotalBRL: null },
    entrada.hipotesesDaAvaliacao ?? HIPOTESES_DA_AVALIACAO_PADRAO,
  );
  const paredesM = model.walls.reduce((s, w) => s + wallLength(w), 0) / 1000;
  const areaUtilM2 = model.spaces.reduce((s, sp) => s + areaRecuada(sp.ring, model.walls).areaMm2, 0) / 1e6;
  const areaConstruidaM2 = ((ret.x1 - ret.x0 + hip.espessuraExternaMm) * (ret.y1 - ret.y0 + hip.espessuraExternaMm)) / 1e6;
  decisoes.push(`Resultado: ${f2(areaConstruidaM2)} m² construídos, ${f2(areaUtilM2)} m² úteis, ${f2(paredesM)} m de parede; nota ${avaliacao.notaGeral ?? '—'}.`);
  return {
    semente,
    hipoteses: hip,
    retangulo: ret,
    frente,
    ambientes,
    comandos,
    model,
    levelId,
    avaliacao,
    resumo: { areaConstruidaM2: Math.round(areaConstruidaM2 * 100) / 100, areaUtilM2: Math.round(areaUtilM2 * 100) / 100, paredesM: Math.round(paredesM * 100) / 100, objetivoInicial: inicial, objetivoFinal: final },
    decisoes,
    avisos,
  };
}

/** N sementes (1..N) → N alternativas, ranqueadas pela nota (desempate: menor objetivo, menor semente). */
export function gerarAlternativas(entrada: EntradaDoGerador, hip: Partial<HipotesesDoGerador> = {}): ResultadoDoGerador[] {
  const n = Math.max(1, Math.min(12, hip.sementes ?? HIPOTESES_DO_GERADOR_PADRAO.sementes));
  const out: ResultadoDoGerador[] = [];
  for (let s = 1; s <= n; s++) out.push(gerar(entrada, s, hip));
  return out.sort((a, b) => (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.resumo.objetivoFinal - b.resumo.objetivoFinal || a.semente - b.semente);
}

/** Não dominadas em (área construída ↓, metros de parede ↓, nota ↑). */
export function frenteDePareto(resultados: readonly ResultadoDoGerador[]): Set<number> {
  const front = new Set<number>();
  for (const a of resultados) {
    const dominado = resultados.some(
      (b) =>
        b !== a &&
        b.resumo.areaConstruidaM2 <= a.resumo.areaConstruidaM2 &&
        b.resumo.paredesM <= a.resumo.paredesM &&
        (b.avaliacao.notaGeral ?? -1) >= (a.avaliacao.notaGeral ?? -1) &&
        (b.resumo.areaConstruidaM2 < a.resumo.areaConstruidaM2 || b.resumo.paredesM < a.resumo.paredesM || (b.avaliacao.notaGeral ?? -1) > (a.avaliacao.notaGeral ?? -1)),
    );
    if (!dominado) front.add(a.semente);
  }
  return front;
}

/**
 * "APLICAR AQUI": a geometria da alternativa (paredes com uid determinístico e
 * aberturas por `wallUid`) remapeada para OUTRO pavimento — cabe num lote só.
 * Os NOMES dependem dos ambientes derivados: `nomesParaOModelo` os calcula
 * sobre o modelo já com as paredes (o kernel é determinístico: aplicar o mesmo
 * lote ao mesmo modelo dá os mesmos ids, então quem chama pode simular com
 * `applyBatch` e depois rodar os dois lotes no editor).
 */
export function comandosDeGeometria(r: ResultadoDoGerador, levelId: ObjectId): Command[] {
  return r.comandos
    .filter((c) => c.type === 'AddWall' || c.type === 'AddOpening')
    .map((c) => {
      if (c.type === 'AddWall') return { ...c, levelId };
      // A abertura vai pela identidade da parede — o id é do modelo gerado.
      return { ...c, wallId: '' };
    });
}

export function nomesParaOModelo(r: ResultadoDoGerador, model: BlueprintModel, levelId: ObjectId): Command[] {
  const out: Command[] = [];
  for (const a of r.ambientes) {
    const c = point((a.ret.x0 + a.ret.x1) / 2, (a.ret.y0 + a.ret.y1) / 2);
    const s = model.spaces.find((x) => x.levelId === levelId && pointInPolygon(x.ring, c));
    if (s) out.push({ type: 'NameSpace', spaceId: s.id, name: a.nome, tipoDeAmbiente: FICHA_DO_USO[a.item.uso].tipoNbr5410 });
  }
  return out;
}
