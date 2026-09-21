/**
 * SKETCHUP — EXPORTAÇÃO COLLADA (.dae) (21/09/2026, backlog P2 — "SKP").
 *
 * ─── POR QUE COLLADA E NÃO .SKP ─────────────────────────────────────────────
 *
 * O `.skp` é formato binário fechado da Trimble: só o SDK em C dela lê e
 * escreve, e não há como embarcá-lo no navegador nem numa Edge Function. O
 * caminho HONESTO para "levar a planta ao SketchUp" é o formato que o próprio
 * SketchUp importa nativamente em TODAS as edições (Arquivo › Importar, sem
 * plugin): COLLADA 1.4.1. Este módulo gera esse arquivo — e diz no cabeçalho
 * e na cobertura o que levou e o que não levou.
 *
 * ─── O QUE VAI ──────────────────────────────────────────────────────────────
 *
 * Malhas trianguladas, em METROS, eixo Z para cima (o do SketchUp), agrupadas
 * por pavimento (um nó por pavimento, um nó por peça dentro dele, nomeado
 * "Parede W-1234" etc. — é o que aparece no Outliner):
 *
 * - **Paredes** como prismas, com o VÃO aberto de verdade: a parede é fatiada
 *   ao longo do eixo em trechos cheios, peitoril (abaixo do vão) e verga
 *   (acima do vão). Parede curva já é facetada no kernel. Cortina de vidro
 *   recebe material de vidro.
 * - **Esquadrias** como painel fino no meio da espessura (porta 40 mm madeira,
 *   janela 6 mm vidro) — para o SketchUp mostrar onde a porta está, sem
 *   modelar a folha.
 * - **Estrutura** (pilar, viga, laje, fundação) pelas mesmas regras do 3D do
 *   editor: `baseMm` é a cota de nascimento, pilar redondo vira cilindro.
 * - **Telhado** (águas) com espessura, pela normal do plano — como o 3D.
 * - **Instalações** (P2.31): trecho = cilindro pela bitola (raio mínimo 15 mm;
 *   o eletroduto anda em "L" como no 3D — `segmentosDoEletroduto`), ponto e
 *   quadro = caixa (`medidasDoTerminal`/`medidasDoQuadro`, centrada na cota,
 *   girada) — cor por disciplina.
 * - **Mobiliário** (P2.31): caixa largura × profundidade × altura, girada, na
 *   cota — cor por família; conjuntos (pai) não vão, só as peças.
 *
 * A cena é pavimento → GRUPO (Arquitetura / Estrutura / Telhado / Instalações
 * / Mobiliário) → peça: no Outliner do SketchUp, um clique esconde o grupo.
 *
 * ─── O QUE NÃO VAI (declarado) ──────────────────────────────────────────────
 *
 * Terreno, escadas, guarda-corpos, rodapés, anotações, cotas e texturas.
 * Cada malha leva um material de cor chapada por família. A importação existe
 * desde a P2.26 (paredes) e P2.29 (aberturas); os nós de instalação/mobiliário
 * levam nome que o importador reconhece e ignora.
 *
 * Puro: modelo → string XML. O download e a cobertura ficam no serviço.
 */
import type { Agua, BlueprintModel, Opening, Point, Structural, Wall } from './blueprintKernel';
import { cantosDaParede, contornoDaAguaEm3d, contornoEmPlanta, ehConjunto, FORMA_ESTRUTURAL, nomeDoTipoEstrutural, normalDaAgua, signedArea } from './blueprintKernel';
import { giroDaPeca, medidasDoQuadro, medidasDoTerminal, segmentosDoEletroduto } from './blueprintRede';

export interface OpcoesCollada {
  titulo: string;
  revisao: number;
  hash: string;
  kernelVersion?: string;
  /** P2.31: o que vai além da arquitetura/estrutura/telhado. Padrão: tudo. */
  incluir?: { instalacoes?: boolean; mobiliario?: boolean };
}

export type GrupoCollada = 'Arquitetura' | 'Estrutura' | 'Telhado' | 'Instalações' | 'Mobiliário';

export interface MaterialCollada {
  id: string;
  nome: string;
  /** RGB 0–1. */
  cor: [number, number, number];
  /** 1 = opaco. */
  opacidade: number;
}

export interface MalhaCollada {
  id: string;
  nome: string;
  levelId: string;
  /** P2.31: o nó intermediário da cena (pavimento → grupo → peça). */
  grupo: GrupoCollada;
  material: MaterialCollada['id'];
  /** XYZ em metros, Z para cima, achatado (3 por vértice). */
  posicoes: number[];
  /** Índices dos triângulos (3 por triângulo), sentido anti-horário visto de fora. */
  triangulos: number[];
}

export const MATERIAIS_COLLADA: Record<'parede' | 'vidro' | 'porta' | 'estrutura' | 'laje' | 'telhado' | 'eletrica' | 'aguaFria' | 'aguaQuente' | 'esgoto' | 'mecanica' | 'louca' | 'equipamento' | 'armario' | 'climatizacao' | 'mobiliario', MaterialCollada> = {
  parede: { id: 'mat-parede', nome: 'Parede', cor: [0.93, 0.92, 0.88], opacidade: 1 },
  vidro: { id: 'mat-vidro', nome: 'Vidro', cor: [0.6, 0.8, 0.95], opacidade: 0.4 },
  porta: { id: 'mat-porta', nome: 'Porta', cor: [0.6, 0.42, 0.25], opacidade: 1 },
  estrutura: { id: 'mat-estrutura', nome: 'Concreto', cor: [0.72, 0.72, 0.7], opacidade: 1 },
  laje: { id: 'mat-laje', nome: 'Laje', cor: [0.8, 0.8, 0.78], opacidade: 1 },
  telhado: { id: 'mat-telhado', nome: 'Telhado', cor: [0.7, 0.35, 0.28], opacidade: 1 },
  // P2.31 — instalações: as cores de `COR_DA_DISCIPLINA` (blueprintRede) e do 3D.
  eletrica: { id: 'mat-eletrica', nome: 'Elétrica', cor: [0.92, 0.7, 0.03], opacidade: 1 },
  aguaFria: { id: 'mat-agua-fria', nome: 'Água fria', cor: [0.15, 0.39, 0.92], opacidade: 1 },
  aguaQuente: { id: 'mat-agua-quente', nome: 'Água quente', cor: [0.86, 0.15, 0.15], opacidade: 1 },
  esgoto: { id: 'mat-esgoto', nome: 'Esgoto', cor: [0.29, 0.33, 0.39], opacidade: 1 },
  mecanica: { id: 'mat-mecanica', nome: 'Mecânica', cor: [0.05, 0.58, 0.53], opacidade: 1 },
  // P2.31 — mobiliário por família, como o 3D.
  louca: { id: 'mat-louca', nome: 'Louça', cor: [0.97, 0.98, 0.99], opacidade: 1 },
  equipamento: { id: 'mat-equipamento', nome: 'Equipamento', cor: [0.8, 0.84, 0.88], opacidade: 1 },
  armario: { id: 'mat-armario', nome: 'Armário', cor: [0.69, 0.54, 0.41], opacidade: 1 },
  climatizacao: { id: 'mat-climatizacao', nome: 'Climatização', cor: [0.37, 0.92, 0.83], opacidade: 1 },
  mobiliario: { id: 'mat-mobiliario', nome: 'Mobiliário', cor: [0.64, 0.69, 0.54], opacidade: 1 },
};

export const COBERTURA_COLLADA: string[] = [
  'CONTÉM: paredes (prismas com os vãos abertos; cortina de vidro como vidro), esquadrias (painel fino: porta 40 mm, janela 6 mm), estrutura (pilar, viga, laje, fundação — pilar redondo como cilindro), telhado (águas com espessura), instalações (trechos como cilindros pela bitola — o eletroduto em L —, pontos e quadros como caixas nas medidas e na cota, cor por disciplina) e mobiliário (caixa largura × profundidade × altura, girada, cor por família; conjuntos só pelas peças), agrupados por pavimento e por grupo (Arquitetura / Estrutura / Telhado / Instalações / Mobiliário), em metros, eixo Z para cima.',
  'NÃO CONTÉM: terreno e sub-regiões, escadas, guarda-corpos, rodapés, anotações, cotas, texturas e materiais reais (cor chapada por família). Caixa é caixa: o vaso sanitário e a luminária saem como o volume que ocupam, não como a peça.',
  'FORMATO: COLLADA 1.4.1 (.dae) — o SketchUp importa nativamente em todas as edições (Arquivo › Importar › COLLADA), assim como Blender, Rhino e Revit (via plugin). Não é .skp: o formato binário do SketchUp só o SDK da Trimble escreve.',
];

const M = 1 / 1000;

// ─── Triangulação por orelhas (polígono simples, sem furos) ─────────────────

function dentroDoTriangulo(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Índices dos triângulos de um anel simples (qualquer sentido); anel degenerado → []. */
export function triangularAnel(anel: readonly Point[]): number[] {
  const n = anel.length;
  if (n < 3) return [];
  // Trabalha em sentido anti-horário matemático (área positiva).
  const idx = anel.map((_, i) => i);
  if (signedArea([...anel]) < 0) idx.reverse();
  const saida: number[] = [];
  let guarda = 0;
  while (idx.length > 3 && guarda++ < 10_000) {
    let cortou = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = anel[i0];
      const b = anel[i1];
      const c = anel[i2];
      const cruz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cruz <= 0) continue; // reflexo
      let temPonta = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (dentroDoTriangulo(anel[j], a, b, c)) {
          temPonta = true;
          break;
        }
      }
      if (temPonta) continue;
      saida.push(i0, i1, i2);
      idx.splice(i, 1);
      cortou = true;
      break;
    }
    if (!cortou) break; // polígono ruim: devolve o que deu
  }
  if (idx.length === 3) saida.push(idx[0], idx[1], idx[2]);
  return saida;
}

// ─── Prismas ────────────────────────────────────────────────────────────────

/** Um prisma vertical: `anel` em planta (mm), de `z0` a `z1` (mm absolutos). */
export function prisma(anel: readonly Point[], z0Mm: number, z1Mm: number): Pick<MalhaCollada, 'posicoes' | 'triangulos'> {
  const n = anel.length;
  const posicoes: number[] = [];
  const triangulos: number[] = [];
  if (n < 3 || z1Mm <= z0Mm) return { posicoes, triangulos };
  // Anti-horário em planta (Y do SketchUp = -y do kernel: o sentido inverte, então
  // garantimos área NEGATIVA no kernel para virar anti-horária vista de cima em Z-up).
  const ordenado = signedArea([...anel]) > 0 ? [...anel].reverse() : [...anel];
  for (const p of ordenado) posicoes.push(p.x * M, -p.y * M, z0Mm * M);
  for (const p of ordenado) posicoes.push(p.x * M, -p.y * M, z1Mm * M);
  // Tampa de cima (normal +Z) e de baixo (normal -Z).
  const tri = triangularAnel(ordenado.map((p) => ({ x: p.x, y: -p.y })));
  for (let i = 0; i < tri.length; i += 3) {
    triangulos.push(n + tri[i], n + tri[i + 1], n + tri[i + 2]);
    triangulos.push(tri[i], tri[i + 2], tri[i + 1]);
  }
  // Laterais.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangulos.push(i, j, n + j);
    triangulos.push(i, n + j, n + i);
  }
  return { posicoes, triangulos };
}

/** Cilindro vertical facetado (para pilar/estaca redondos). */
function cilindro(centro: Point, diametroMm: number, z0Mm: number, z1Mm: number, facetas = 24): Pick<MalhaCollada, 'posicoes' | 'triangulos'> {
  const r = diametroMm / 2;
  const anel: Point[] = [];
  for (let i = 0; i < facetas; i++) {
    const t = (i / facetas) * Math.PI * 2;
    anel.push({ x: Math.round(centro.x + r * Math.cos(t)), y: Math.round(centro.y + r * Math.sin(t)) });
  }
  return prisma(anel, z0Mm, z1Mm);
}

/** Cilindro entre dois pontos 3D (mm, referencial do kernel), com tampas; normais para fora. */
export function cilindroEntre(p0: [number, number, number], p1: [number, number, number], raioMm: number, facetas = 12): Pick<MalhaCollada, 'posicoes' | 'triangulos'> {
  // Tudo no referencial do SketchUp desde o início (y invertido): a base (u, v, w) é destra e o anel sai anti-horário visto de +w.
  const a: [number, number, number] = [p0[0], -p0[1], p0[2]];
  const b: [number, number, number] = [p1[0], -p1[1], p1[2]];
  const eixo = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(eixo[0], eixo[1], eixo[2]);
  const posicoes: number[] = [];
  const triangulos: number[] = [];
  if (L < 1 || raioMm <= 0) return { posicoes, triangulos };
  const w = [eixo[0] / L, eixo[1] / L, eixo[2] / L];
  const ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]];
  const lu = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / lu, u[1] / lu, u[2] / lu];
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  // Vértices: anel em a (0..n-1), anel em b (n..2n-1), centros (2n, 2n+1).
  const emitir = (p: number[]) => posicoes.push(p[0] * M, p[1] * M, p[2] * M);
  for (const base of [a, b]) {
    for (let i = 0; i < facetas; i++) {
      const t = (i / facetas) * Math.PI * 2;
      const c = Math.cos(t) * raioMm;
      const s = Math.sin(t) * raioMm;
      emitir([base[0] + u[0] * c + v[0] * s, base[1] + u[1] * c + v[1] * s, base[2] + u[2] * c + v[2] * s]);
    }
  }
  emitir(a);
  emitir(b);
  const n = facetas;
  const c0 = 2 * n;
  const c1 = 2 * n + 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Laterais como no prisma (anel anti-horário visto de +w → normal para fora).
    triangulos.push(i, j, n + j);
    triangulos.push(i, n + j, n + i);
    // Tampas: a de baixo olha para −w, a de cima para +w.
    triangulos.push(c0, j, i);
    triangulos.push(c1, n + i, n + j);
  }
  return { posicoes, triangulos };
}

/** Caixa em planta `largura × profundidade` centrada em `centro`, girada `giroGraus`, de `z0` a `z1` (mm). */
export function caixaGirada(centro: Point, larguraMm: number, profundidadeMm: number, giroGraus: number, z0Mm: number, z1Mm: number): Pick<MalhaCollada, 'posicoes' | 'triangulos'> {
  const r = (giroGraus * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hx = larguraMm / 2;
  const hy = profundidadeMm / 2;
  const anel: Point[] = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => ({ x: Math.round(centro.x + x * c - y * s), y: Math.round(centro.y + x * s + y * c) })) as Point[];
  return prisma(anel, z0Mm, z1Mm);
}

// ─── Paredes fatiadas em torno dos vãos ─────────────────────────────────────

interface Fatia {
  t0: number;
  t1: number;
  z0: number;
  z1: number;
}

/** As fatias (ao longo do eixo, em mm de `a`) de uma parede com os vãos abertos. */
export function fatiasDaParede(comprimentoMm: number, alturaMm: number, vaos: readonly Pick<Opening, 'offsetMm' | 'widthMm' | 'sillMm' | 'heightMm'>[]): Fatia[] {
  const L = comprimentoMm;
  const ordenados = [...vaos]
    .map((v) => ({ t0: Math.max(0, v.offsetMm), t1: Math.min(L, v.offsetMm + v.widthMm), z0: Math.max(0, v.sillMm), z1: Math.min(alturaMm, v.sillMm + v.heightMm) }))
    .filter((v) => v.t1 - v.t0 > 1)
    .sort((x, y) => x.t0 - y.t0);
  const saida: Fatia[] = [];
  let cursor = 0;
  for (const v of ordenados) {
    if (v.t0 - cursor > 1) saida.push({ t0: cursor, t1: v.t0, z0: 0, z1: alturaMm });
    const ini = Math.max(cursor, v.t0);
    if (v.t1 - ini > 1) {
      if (v.z0 > 1) saida.push({ t0: ini, t1: v.t1, z0: 0, z1: v.z0 });
      if (alturaMm - v.z1 > 1) saida.push({ t0: ini, t1: v.t1, z0: v.z1, z1: alturaMm });
    }
    cursor = Math.max(cursor, v.t1);
  }
  if (L - cursor > 1) saida.push({ t0: cursor, t1: L, z0: 0, z1: alturaMm });
  return saida;
}

function pontoNoEixo(w: Pick<Wall, 'a' | 'b'>, tMm: number): Point {
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  return { x: w.a.x + ((w.b.x - w.a.x) / L) * tMm, y: w.a.y + ((w.b.y - w.a.y) / L) * tMm };
}

function juntar(partes: Pick<MalhaCollada, 'posicoes' | 'triangulos'>[]): Pick<MalhaCollada, 'posicoes' | 'triangulos'> {
  const posicoes: number[] = [];
  const triangulos: number[] = [];
  for (const p of partes) {
    const base = posicoes.length / 3;
    posicoes.push(...p.posicoes);
    for (const i of p.triangulos) triangulos.push(base + i);
  }
  return { posicoes, triangulos };
}

// ─── Malhas do modelo ───────────────────────────────────────────────────────

export interface ResumoCollada {
  paredes: number;
  esquadrias: number;
  estruturas: number;
  aguas: number;
  /** P2.31 */
  trechos: number;
  terminais: number;
  quadros: number;
  componentes: number;
  triangulos: number;
}

export function malhasDoModelo(model: BlueprintModel, incluir: { instalacoes?: boolean; mobiliario?: boolean } = {}): { malhas: MalhaCollada[]; resumo: ResumoCollada } {
  const malhas: MalhaCollada[] = [];
  const resumo: ResumoCollada = { paredes: 0, esquadrias: 0, estruturas: 0, aguas: 0, trechos: 0, terminais: 0, quadros: 0, componentes: 0, triangulos: 0 };
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const peDireito = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm ?? 2800]));
  const comInstalacoes = incluir.instalacoes !== false;
  const comMobiliario = incluir.mobiliario !== false;
  const vaosPorParede = new Map<string, Opening[]>();
  for (const o of model.openings) {
    const lista = vaosPorParede.get(o.wallId) ?? [];
    lista.push(o);
    vaosPorParede.set(o.wallId, lista);
  }

  for (const w of model.walls) {
    const z = elevacao.get(w.levelId) ?? 0;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (L < 1 || w.heightMm <= 0) continue;
    const vaos = vaosPorParede.get(w.id) ?? [];
    const partes = fatiasDaParede(L, w.heightMm, vaos).map((f) => prisma(cantosDaParede(pontoNoEixo(w, f.t0), pontoNoEixo(w, f.t1), w.thicknessMm), z + f.z0, z + f.z1));
    const malha = juntar(partes);
    if (malha.triangulos.length === 0) continue;
    malhas.push({ id: `parede-${w.uid}`, nome: `Parede ${w.uid}`, levelId: w.levelId, grupo: 'Arquitetura', material: w.cortina ? MATERIAIS_COLLADA.vidro.id : MATERIAIS_COLLADA.parede.id, ...malha });
    resumo.paredes++;
    // Esquadrias: painel fino no meio da espessura.
    for (const o of vaos) {
      const t0 = Math.max(0, o.offsetMm);
      const t1 = Math.min(L, o.offsetMm + o.widthMm);
      if (t1 - t0 < 1 || o.heightMm <= 0) continue;
      const espessura = o.kind === 'window' ? 6 : 40;
      const anel = cantosDaParede(pontoNoEixo(w, t0), pontoNoEixo(w, t1), espessura);
      const p = prisma(anel, z + o.sillMm, z + Math.min(w.heightMm, o.sillMm + o.heightMm));
      if (p.triangulos.length === 0) continue;
      const janela = o.kind === 'window';
      malhas.push({ id: `vao-${o.uid}`, nome: `${janela ? 'Janela' : o.kind === 'door' ? 'Porta' : o.kind === 'sliding' ? 'Porta de correr' : 'Vão'} ${o.uid}`, levelId: w.levelId, grupo: 'Arquitetura', material: janela || o.kind === 'passage' ? MATERIAIS_COLLADA.vidro.id : MATERIAIS_COLLADA.porta.id, ...p });
      resumo.esquadrias++;
    }
  }

  for (const s of model.structures ?? []) {
    const z = (elevacao.get(s.levelId) ?? 0) + s.baseMm;
    if (s.alturaMm <= 0) continue;
    const forma = FORMA_ESTRUTURAL[s.kind];
    let malha: Pick<MalhaCollada, 'posicoes' | 'triangulos'>;
    if (forma === 'PONTO' && s.circular) malha = cilindro(s.pontos[0], s.larguraMm, z, z + s.alturaMm);
    else malha = prisma(contornoEmPlanta(s as Structural), z, z + s.alturaMm);
    if (malha.triangulos.length === 0) continue;
    malhas.push({ id: `estrutura-${s.uid}`, nome: `${nomeDoTipoEstrutural(s.kind)} ${s.uid}`, levelId: s.levelId, grupo: 'Estrutura', material: s.kind === 'LAJE' ? MATERIAIS_COLLADA.laje.id : MATERIAIS_COLLADA.estrutura.id, ...malha });
    resumo.estruturas++;
  }

  for (const a of model.roofs ?? []) {
    const malha = malhaDaAgua(a, elevacao.get(a.levelId) ?? 0);
    if (!malha || malha.triangulos.length === 0) continue;
    malhas.push({ id: `agua-${a.uid}`, nome: `Água ${a.uid}`, levelId: a.levelId, grupo: 'Telhado', material: MATERIAIS_COLLADA.telhado.id, ...malha });
    resumo.aguas++;
  }

  // ── INSTALAÇÕES (P2.31) ──────────────────────────────────────────────────
  const materialDaDisciplina: Record<string, string> = { ELETRICA: MATERIAIS_COLLADA.eletrica.id, AGUA_FRIA: MATERIAIS_COLLADA.aguaFria.id, AGUA_QUENTE: MATERIAIS_COLLADA.aguaQuente.id, ESGOTO: MATERIAIS_COLLADA.esgoto.id, MECANICA: MATERIAIS_COLLADA.mecanica.id };
  if (comInstalacoes) {
    for (const t of model.trechos ?? []) {
      const z = elevacao.get(t.levelId) ?? 0;
      const raio = Math.max(t.bitolaMm / 2, 15);
      const partes = segmentosDoEletroduto(t, peDireito.get(t.levelId) ?? 2800).map((seg) => cilindroEntre([seg.a.x, seg.a.y, z + seg.cotaAMm], [seg.b.x, seg.b.y, z + seg.cotaBMm], raio));
      const malha = juntar(partes);
      if (malha.triangulos.length === 0) continue;
      malhas.push({ id: `trecho-${t.uid}`, nome: `Trecho ${t.rotulo?.trim() || t.disciplina} ${t.uid}`, levelId: t.levelId, grupo: 'Instalações', material: materialDaDisciplina[t.disciplina] ?? MATERIAIS_COLLADA.mecanica.id, ...malha });
      resumo.trechos++;
    }
    for (const t of model.terminais ?? []) {
      const z = elevacao.get(t.levelId) ?? 0;
      const m = medidasDoTerminal(t);
      // O 3D centra a caixa na cota do ponto.
      const malha = caixaGirada(t.at, m.larguraMm, m.profundidadeMm, giroDaPeca(t), z + t.cotaMm - m.alturaMm / 2, z + t.cotaMm + m.alturaMm / 2);
      if (malha.triangulos.length === 0) continue;
      malhas.push({ id: `ponto-${t.uid}`, nome: `Ponto ${t.rotulo?.trim() || t.tipo} ${t.uid}`, levelId: t.levelId, grupo: 'Instalações', material: materialDaDisciplina[t.disciplina] ?? MATERIAIS_COLLADA.mecanica.id, ...malha });
      resumo.terminais++;
    }
    for (const q of model.quadros ?? []) {
      const z = elevacao.get(q.levelId) ?? 0;
      const m = medidasDoQuadro(q);
      const malha = caixaGirada(q.at, m.larguraMm, m.profundidadeMm, giroDaPeca(q), z + q.cotaMm - m.alturaMm / 2, z + q.cotaMm + m.alturaMm / 2);
      if (malha.triangulos.length === 0) continue;
      malhas.push({ id: `quadro-${q.uid}`, nome: `Quadro ${q.nome} ${q.uid}`, levelId: q.levelId, grupo: 'Instalações', material: MATERIAIS_COLLADA.eletrica.id, ...malha });
      resumo.quadros++;
    }
  }

  // ── MOBILIÁRIO (P2.31) ───────────────────────────────────────────────────
  const materialDaFamilia: Record<string, string> = { LOUCA: MATERIAIS_COLLADA.louca.id, EQUIPAMENTO: MATERIAIS_COLLADA.equipamento.id, ARMARIO: MATERIAIS_COLLADA.armario.id, CLIMATIZACAO: MATERIAIS_COLLADA.climatizacao.id };
  if (comMobiliario) {
    for (const c of model.componentes ?? []) {
      if (ehConjunto(c.tipoId)) continue; // o pai é só o agrupador; as peças vão
      const z = elevacao.get(c.levelId) ?? 0;
      const z0 = z + (c.cotaMm ?? 0);
      const malha = caixaGirada(c.at, c.larguraMm, c.profundidadeMm, c.rotacaoGraus, z0, z0 + c.alturaMm);
      if (malha.triangulos.length === 0) continue;
      malhas.push({ id: `mobiliario-${c.uid}`, nome: `Mobiliário ${c.rotulo?.trim() || c.tipoId} ${c.uid}`, levelId: c.levelId, grupo: 'Mobiliário', material: materialDaFamilia[c.familia] ?? MATERIAIS_COLLADA.mobiliario.id, ...malha });
      resumo.componentes++;
    }
  }

  resumo.triangulos = malhas.reduce((s, m) => s + m.triangulos.length / 3, 0);
  return { malhas, resumo };
}

/** A água como placa: face de cima pelo contorno 3D, a de baixo deslocada `espessuraMm` pela normal. */
function malhaDaAgua(a: Agua, elevacaoMm: number): Pick<MalhaCollada, 'posicoes' | 'triangulos'> | null {
  if (a.pontos.length < 3 || a.espessuraMm <= 0) return null;
  const topo = contornoDaAguaEm3d(a);
  const n = normalDaAgua(a);
  // Normal para CIMA (o kernel pode devolvê-la para baixo conforme o sentido do anel).
  const sinal = n.z < 0 ? -1 : 1;
  const nz = { x: n.x * sinal, y: n.y * sinal, z: n.z * sinal };
  const cima = topo.map((p) => ({ x: p.x, y: p.y, z: elevacaoMm + p.z }));
  const baixo = cima.map((p) => ({ x: p.x - nz.x * a.espessuraMm, y: p.y - nz.y * a.espessuraMm, z: p.z - nz.z * a.espessuraMm }));
  const k = cima.length;
  // Sentido: anti-horário visto de cima no sistema do SketchUp (y invertido).
  const emPlanta = a.pontos.map((p) => ({ x: p.x, y: -p.y }));
  const inverter = signedArea(emPlanta) < 0;
  const ordem = inverter ? [...Array(k).keys()].reverse() : [...Array(k).keys()];
  const posicoes: number[] = [];
  for (const i of ordem) posicoes.push(cima[i].x * M, -cima[i].y * M, cima[i].z * M);
  for (const i of ordem) posicoes.push(baixo[i].x * M, -baixo[i].y * M, baixo[i].z * M);
  const tri = triangularAnel(ordem.map((i) => emPlanta[i]));
  const triangulos: number[] = [];
  for (let i = 0; i < tri.length; i += 3) {
    triangulos.push(tri[i], tri[i + 1], tri[i + 2]);
    triangulos.push(k + tri[i], k + tri[i + 2], k + tri[i + 1]);
  }
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    triangulos.push(i, k + i, k + j);
    triangulos.push(i, k + j, j);
  }
  return { posicoes, triangulos };
}

// ─── XML ────────────────────────────────────────────────────────────────────

function xml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const num = (v: number) => (Math.abs(v) < 1e-9 ? '0' : Number(v.toFixed(4)).toString());

/** O arquivo COLLADA 1.4.1 inteiro. Determinístico para o mesmo modelo/opções (sem data). */
export function gerarCollada(model: BlueprintModel, o: OpcoesCollada): string {
  const { malhas, resumo } = malhasDoModelo(model, o.incluir ?? {});
  const materiais = Object.values(MATERIAIS_COLLADA);
  const linhas: string[] = [];
  linhas.push('<?xml version="1.0" encoding="UTF-8"?>');
  linhas.push('<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">');
  linhas.push('  <asset>');
  linhas.push(`    <contributor><authoring_tool>OrçaCloud Planta Inteligente${o.kernelVersion ? ` (${xml(o.kernelVersion)})` : ''}</authoring_tool><comments>${xml(`${o.titulo} — rev. ${o.revisao} — hash ${o.hash}\n${COBERTURA_COLLADA.join('\n')}`)}</comments></contributor>`);
  linhas.push('    <unit name="meter" meter="1"/>');
  linhas.push('    <up_axis>Z_UP</up_axis>');
  linhas.push('  </asset>');
  // Efeitos e materiais.
  linhas.push('  <library_effects>');
  for (const m of materiais) {
    linhas.push(`    <effect id="${m.id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${m.cor.map(num).join(' ')} 1</color></diffuse><transparency><float>${num(m.opacidade)}</float></transparency></lambert></technique></profile_COMMON></effect>`);
  }
  linhas.push('  </library_effects>');
  linhas.push('  <library_materials>');
  for (const m of materiais) linhas.push(`    <material id="${m.id}" name="${xml(m.nome)}"><instance_effect url="#${m.id}-fx"/></material>`);
  linhas.push('  </library_materials>');
  // Geometrias.
  linhas.push('  <library_geometries>');
  for (const g of malhas) {
    const nv = g.posicoes.length / 3;
    linhas.push(`    <geometry id="${g.id}" name="${xml(g.nome)}"><mesh>`);
    linhas.push(`      <source id="${g.id}-pos"><float_array id="${g.id}-pos-array" count="${g.posicoes.length}">${g.posicoes.map(num).join(' ')}</float_array><technique_common><accessor source="#${g.id}-pos-array" count="${nv}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`);
    linhas.push(`      <vertices id="${g.id}-vtx"><input semantic="POSITION" source="#${g.id}-pos"/></vertices>`);
    linhas.push(`      <triangles count="${g.triangulos.length / 3}" material="${g.material}"><input semantic="VERTEX" source="#${g.id}-vtx" offset="0"/><p>${g.triangulos.join(' ')}</p></triangles>`);
    linhas.push('    </mesh></geometry>');
  }
  linhas.push('  </library_geometries>');
  // Cena: um nó por pavimento, um por peça.
  linhas.push('  <library_visual_scenes>');
  linhas.push(`    <visual_scene id="cena" name="${xml(o.titulo)}">`);
  for (const l of model.levels) {
    const doNivel = malhas.filter((g) => g.levelId === l.id);
    if (doNivel.length === 0) continue;
    linhas.push(`      <node id="pav-${l.uid}" name="${xml(l.name)}">`);
    // P2.31: um nó por GRUPO dentro do pavimento — o Outliner do SketchUp esconde "Instalações" com um clique.
    for (const grupo of ['Arquitetura', 'Estrutura', 'Telhado', 'Instalações', 'Mobiliário'] as const) {
      const doGrupo = doNivel.filter((g) => g.grupo === grupo);
      if (doGrupo.length === 0) continue;
      linhas.push(`        <node id="grp-${l.uid}-${grupo.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}" name="${xml(grupo)}">`);
      for (const g of doGrupo) {
        linhas.push(`          <node id="no-${g.id}" name="${xml(g.nome)}"><instance_geometry url="#${g.id}"><bind_material><technique_common><instance_material symbol="${g.material}" target="#${g.material}"/></technique_common></bind_material></instance_geometry></node>`);
      }
      linhas.push('        </node>');
    }
    linhas.push('      </node>');
  }
  linhas.push('    </visual_scene>');
  linhas.push('  </library_visual_scenes>');
  linhas.push('  <scene><instance_visual_scene url="#cena"/></scene>');
  linhas.push(`  <!-- ${resumo.paredes} parede(s), ${resumo.esquadrias} esquadria(s), ${resumo.estruturas} peça(s) estrutural(is), ${resumo.aguas} água(s), ${resumo.trechos} trecho(s), ${resumo.terminais} ponto(s), ${resumo.quadros} quadro(s), ${resumo.componentes} componente(s), ${resumo.triangulos} triângulos -->`);
  linhas.push('</COLLADA>');
  return linhas.join('\n');
}
