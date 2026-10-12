/**
 * SÍMBOLOS 2D DO MOBILIÁRIO COM QUALIDADE DE PRANCHA (12/10/2026 — F16 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`; estilo aprovado na prancha `docs/spikes/simbolos-2d/prancha.svg`).
 *
 * FONTE ÚNICA do desenho de cada peça: a tela, o PDF técnico (opção Mobiliário), o PDF humanizado e a miniatura
 * da Biblioteca leem daqui (via `simboloNoMundo`). O DXF não desenha mobiliário; o 3D tem os modelos glTF.
 *
 * O que muda em relação ao desenho de antes (traços em FRAÇÃO 0..1 da caixa, uma espessura só):
 *
 * - **Em MILÍMETROS da peça.** O símbolo é função de (largura, profundidade): raio de canto, travesseiro, boca
 *   do fogão e cuba têm medida própria e NÃO deformam quando a peça é esticada. Quantas almofadas, portas ou
 *   travesseiros também sai da medida.
 * - **Curvas**: canto arredondado, elipse e Bézier cúbica — tesseladas em polilinha (o que os três destinos já
 *   desenham).
 * - **Pena** — espessura no PAPEL: `contorno` 0,25 mm, `detalhe` 0,13 mm, `textura` 0,09 mm; e `tracejado`
 *   para o que fica escondido (sob o tampo) ou acima do plano de corte.
 * - **Nível de detalhe**: traço `lod: 'detalhe'` só sai de 1:50 para cima na prancha (e, na tela, com a peça
 *   grande o bastante). Em 1:100/1:200 a versão limpa — senão vira mancha.
 * - **O contorno é do símbolo**, não da caixa: cada tipo desenha a própria silhueta (cantos arredondados, a
 *   bacia oval). A caixa continua sendo a pegada da peça (seleção, choque, área), e o canvas a contorna só
 *   quando ela está selecionada, sugerida ou numa fase de reforma.
 *
 * Referencial LOCAL: x ao longo da largura (0..L), y da FRENTE (0) ao FUNDO/encosto (P) — o mesmo de antes.
 * Todo traço fica DENTRO da caixa (teste).
 */
import { CATALOGO_DE_COMPONENTES, type TipoDeComponente } from './blueprintKernel';

export type Pena = 'contorno' | 'detalhe' | 'textura';
/** Espessura de cada pena no papel, mm. */
export const PENA_MM: Record<Pena, number> = { contorno: 0.25, detalhe: 0.13, textura: 0.09 };
/** Na tela (px), a mesma hierarquia — o canvas não tem "papel". */
export const PENA_PX: Record<Pena, number> = { contorno: 1.3, detalhe: 0.9, textura: 0.6 };
/** Até que denominador a prancha leva o detalhe fino (1:50 sim, 1:75 não). */
export const DENOMINADOR_MAXIMO_DO_DETALHE = 50;
/** Na tela: o detalhe aparece quando o MENOR lado da peça tem pelo menos isto de pixels. */
export const PX_MINIMO_DO_DETALHE = 48;

export type P2 = [number, number];
interface Base {
  pena: Pena;
  tracejado?: boolean;
  lod?: 'detalhe';
}
export type TracoDoMobiliario =
  | (Base & { tipo: 'linha'; a: P2; b: P2 })
  | (Base & { tipo: 'poli'; pontos: P2[]; fechado?: boolean })
  | (Base & { tipo: 'ret'; x0: number; y0: number; x1: number; y1: number; r?: number })
  | (Base & { tipo: 'elipse'; c: P2; rx: number; ry: number })
  | (Base & { tipo: 'bezier'; p: [P2, P2, P2, P2] });

/** Uma polilinha pronta, em mm LOCAIS da peça. */
export interface LinhaDoSimbolo {
  pts: P2[];
  pena: Pena;
  tracejado: boolean;
}

// ─── Geometria ───────────────────────────────────────────────────────────────

function arco(cx: number, cy: number, r: number, de: number, ate: number, n = 6): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const g = de + ((ate - de) * i) / n;
    out.push([cx + r * Math.cos(g), cy + r * Math.sin(g)]);
  }
  return out;
}

/** Curvas → polilinha (elipse com 40 lados, Bézier com 16, canto com 6). */
export function tesselar(t: TracoDoMobiliario): P2[] {
  switch (t.tipo) {
    case 'linha':
      return [t.a, t.b];
    case 'poli':
      return t.fechado ? [...t.pontos, t.pontos[0]] : t.pontos;
    case 'ret': {
      const r = Math.max(0, Math.min(t.r ?? 0, (t.x1 - t.x0) / 2, (t.y1 - t.y0) / 2));
      if (r <= 0) return [[t.x0, t.y0], [t.x1, t.y0], [t.x1, t.y1], [t.x0, t.y1], [t.x0, t.y0]];
      const H = Math.PI / 2;
      return [
        ...arco(t.x1 - r, t.y0 + r, r, -H, 0),
        ...arco(t.x1 - r, t.y1 - r, r, 0, H),
        ...arco(t.x0 + r, t.y1 - r, r, H, 2 * H),
        ...arco(t.x0 + r, t.y0 + r, r, 2 * H, 3 * H),
        [t.x1 - r, t.y0],
      ];
    }
    case 'elipse': {
      const out: P2[] = [];
      for (let i = 0; i <= 40; i++) {
        const g = (i / 40) * Math.PI * 2;
        out.push([t.c[0] + t.rx * Math.cos(g), t.c[1] + t.ry * Math.sin(g)]);
      }
      return out;
    }
    case 'bezier': {
      const [a, b, c, d] = t.p;
      const out: P2[] = [];
      for (let i = 0; i <= 16; i++) {
        const s = i / 16;
        const u = 1 - s;
        out.push([
          u * u * u * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s * s * s * d[0],
          u * u * u * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s * s * s * d[1],
        ]);
      }
      return out;
    }
  }
}

/** Tira de uma polilinha os trechos DENTRO do retângulo (o que fica escondido sob a caixa acoplada do vaso). */
export function recortarFora(pts: P2[], r: { x0: number; y0: number; x1: number; y1: number }): P2[][] {
  const dentro = (p: P2) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1;
  const partes: P2[][] = [];
  let atual: P2[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = 24;
    for (let k = 0; k < n; k++) {
      const p0: P2 = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const p1: P2 = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
      if (dentro([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2])) {
        if (atual.length > 1) partes.push(atual);
        atual = [];
      } else {
        if (!atual.length) atual.push(p0);
        atual.push(p1);
      }
    }
  }
  if (atual.length > 1) partes.push(atual);
  return partes;
}

// ─── Os símbolos ─────────────────────────────────────────────────────────────

const ret = (x0: number, y0: number, x1: number, y1: number, r: number, pena: Pena, extra: Partial<Base> = {}): TracoDoMobiliario => ({ tipo: 'ret', x0, y0, x1, y1, r, pena, ...extra });
const linha = (a: P2, b: P2, pena: Pena, extra: Partial<Base> = {}): TracoDoMobiliario => ({ tipo: 'linha', a, b, pena, ...extra });
const circ = (c: P2, r: number, pena: Pena, extra: Partial<Base> = {}): TracoDoMobiliario => ({ tipo: 'elipse', c, rx: r, ry: r, pena, ...extra });
const D = { lod: 'detalhe' as const };

/** Cama: cabeceira, colchão de canto arredondado, travesseiros (1 ou 2 pela largura), dobra do edredom com o canto virado. */
function cama(L: number, P: number): TracoDoMobiliario[] {
  const cab = Math.min(60, P * 0.05);
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P - cab, Math.min(50, L * 0.05), 'contorno'), ret(0, P - cab, L, P, 0, 'contorno')];
  const n = L >= 1200 ? 2 : 1;
  const folga = Math.min(70, L * 0.06);
  const largT = (L - folga * (n + 1)) / n;
  const altT = Math.min(360, P * 0.2);
  for (let i = 0; i < n; i++) {
    const x0 = folga + i * (largT + folga);
    t.push(ret(x0, P - cab - 60 - altT, x0 + largT, P - cab - 60, Math.min(110, altT * 0.3), 'detalhe'));
    t.push(ret(x0 + 45, P - cab - 60 - altT + 45, x0 + largT - 45, P - cab - 105, Math.min(80, altT * 0.22), 'textura', D));
  }
  const yD = P - cab - Math.min(560, P * 0.3);
  const c = Math.min(420, L * 0.32);
  t.push({ tipo: 'poli', pontos: [[0, yD], [L - c, yD], [L, yD - c]], pena: 'detalhe' });
  t.push(linha([L - c, yD], [L, yD], 'textura', { tracejado: true, ...D }));
  t.push(linha([0, yD - 70], [L - c - 70, yD - 70], 'textura', D));
  return t;
}

/** Sofá e poltrona: braços e encosto arredondados, almofadas de assento pela largura, almofadas de encosto no detalhe. */
function sofa(L: number, P: number): TracoDoMobiliario[] {
  const braco = Math.min(190, L * 0.12);
  const encosto = Math.min(220, P * 0.25);
  const t: TracoDoMobiliario[] = [
    ret(0, 0, L, P, Math.min(70, braco * 0.4), 'contorno'),
    { tipo: 'poli', pontos: [[braco, 0], [braco, P - encosto], [L - braco, P - encosto], [L - braco, 0]], pena: 'contorno' },
  ];
  const vao = L - 2 * braco;
  const n = vao >= 1300 ? 3 : vao >= 900 ? 2 : 1;
  const g = 14;
  const w = (vao - g * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const x0 = braco + g + i * (w + g);
    t.push(ret(x0, 40, x0 + w, P - encosto - g, 45, 'detalhe'));
    t.push(ret(x0 + 10, P - encosto + 25, x0 + w - 10, P - 35, 40, 'textura', D));
  }
  return t;
}

/** Cadeira: assento arredondado e o encosto curvo no fundo (y = P). */
function cadeira(L: number, P: number): TracoDoMobiliario[] {
  const enc = Math.min(70, P * 0.16);
  const bojo = Math.min(35, P * 0.08);
  const yi = P - enc - bojo;
  return [
    ret(0, 0, L, yi + 10, Math.min(60, L * 0.14), 'detalhe'),
    { tipo: 'bezier', p: [[0, yi], [L * 0.25, yi + bojo], [L * 0.75, yi + bojo], [L, yi]], pena: 'contorno' },
    { tipo: 'bezier', p: [[0, yi], [L * 0.2, P], [L * 0.8, P], [L, yi]], pena: 'contorno' },
  ];
}

/** Tampo de mesa: só o tampo, na medida real (as cadeiras são peças próprias — o Conjunto de jantar as traz). */
function mesa(L: number, P: number): TracoDoMobiliario[] {
  return [ret(0, 0, L, P, Math.min(25, L * 0.03), 'contorno'), ret(35, 35, L - 35, P - 35, 15, 'textura', D)];
}

/** Escrivaninha: tampo e o gaveteiro à direita (frente das gavetas no detalhe). */
function escrivaninha(L: number, P: number): TracoDoMobiliario[] {
  const g = Math.min(420, L * 0.35);
  const t = mesa(L, P);
  t.push(ret(L - g, 30, L - 30, P - 30, 10, 'detalhe'));
  for (const k of [1, 2]) t.push(linha([L - g, 30 + ((P - 60) * k) / 3], [L - 30, 30 + ((P - 60) * k) / 3], 'textura', D));
  return t;
}

/** Criado-mudo: caixa, o tampo e o puxador da gaveta. */
function criado(L: number, P: number): TracoDoMobiliario[] {
  return [ret(0, 0, L, P, Math.min(15, L * 0.04), 'contorno'), ret(30, 30, L - 30, P - 30, 10, 'textura', D), linha([L * 0.4, 18], [L * 0.6, 18], 'detalhe')];
}

/** Armário: a frente das portas, as divisões delas e o cabideiro tracejado (fica acima do plano de corte). */
function armario(L: number, P: number): TracoDoMobiliario[] {
  const frente = Math.min(40, P * 0.08);
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, 0, 'contorno'), linha([0, frente], [L, frente], 'detalhe')];
  const n = Math.max(1, Math.round(L / 450));
  for (let i = 1; i < n; i++) t.push(linha([(L * i) / n, 0], [(L * i) / n, frente], 'detalhe'));
  t.push(linha([30, P * 0.55], [L - 30, P * 0.55], 'textura', { tracejado: true }));
  // cabides
  for (let x = 120; x < L - 80; x += 160) t.push(linha([x, P * 0.55 - 110], [x + 40, P * 0.55 + 110], 'textura', D));
  return t;
}

/** Estante: montantes por módulo e o fundo; as prateleiras de cima, tracejadas, no detalhe. */
function estante(L: number, P: number): TracoDoMobiliario[] {
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, 0, 'contorno'), linha([0, P - 20], [L, P - 20], 'detalhe')];
  const n = Math.max(1, Math.round(L / 450));
  for (let i = 1; i < n; i++) t.push(linha([(L * i) / n, 0], [(L * i) / n, P - 20], 'detalhe'));
  for (let i = 0; i < n; i++) t.push(linha([(L * i) / n + 25, P * 0.35], [(L * (i + 1)) / n - 25, P * 0.35], 'textura', { tracejado: true, ...D }));
  return t;
}

/** Rack: corpo, as portas na frente e a TV (tela fina) apoiada no fundo. */
function rack(L: number, P: number): TracoDoMobiliario[] {
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, Math.min(15, L * 0.02), 'contorno'), linha([0, 30], [L, 30], 'detalhe')];
  const n = Math.max(1, Math.round(L / 550));
  for (let i = 1; i < n; i++) t.push(linha([(L * i) / n, 0], [(L * i) / n, 30], 'textura', D));
  const tv = Math.min(L * 0.75, 1450);
  t.push(ret((L - tv) / 2, P - 110, (L + tv) / 2, P - 70, 8, 'contorno'));
  t.push(ret(L / 2 - 150, P - 70, L / 2 + 150, P - 25, 10, 'textura', D));
  return t;
}

/** Bancada: o tampo e o rodabanca no fundo. */
function bancadaSeca(L: number, P: number): TracoDoMobiliario[] {
  return [ret(0, 0, L, P, 0, 'contorno'), linha([0, P - 25], [L, P - 25], 'detalhe'), linha([0, 20], [L, 20], 'textura', D)];
}

/** Bancada com pia: tampo, rodabanca, a cuba arredondada com o ralo, e a torneira no fundo. */
function bancadaComPia(L: number, P: number): TracoDoMobiliario[] {
  const t = bancadaSeca(L, P);
  const w = Math.min(560, L * 0.4);
  const x0 = Math.min(250, L * 0.1);
  const y0 = Math.max(70, P * 0.14);
  const y1 = P - Math.max(140, P * 0.24);
  t.push(ret(x0, y0, x0 + w, y1, 50, 'detalhe'));
  t.push(ret(x0 + 25, y0 + 25, x0 + w - 25, y1 - 25, 35, 'textura', D));
  t.push(circ([x0 + w / 2, (y0 + y1) / 2], 22, 'textura', D));
  t.push(circ([x0 + w / 2, P - 70], 18, 'detalhe'));
  t.push(linha([x0 + w / 2, P - 88], [x0 + w / 2, y1 + 10], 'detalhe'));
  return t;
}

/** Geladeira: corpo arredondado, a linha da porta e o puxador. */
function geladeira(L: number, P: number): TracoDoMobiliario[] {
  return [ret(0, 0, L, P, Math.min(30, L * 0.05), 'contorno'), linha([0, 45], [L, 45], 'detalhe'), linha([L * 0.82, 60], [L * 0.82, P * 0.45], 'detalhe'), ret(30, 70, L - 30, P - 30, 20, 'textura', D)];
}

/** Fogão: corpo, o painel de botões na frente e 4 bocas (com a grelha no detalhe). */
function fogao(L: number, P: number): TracoDoMobiliario[] {
  const painel = Math.min(70, P * 0.12);
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, Math.min(20, L * 0.04), 'contorno'), linha([0, painel], [L, painel], 'detalhe')];
  const r = Math.min(L, P - painel) * 0.14;
  const cols = [L * 0.28, L * 0.72];
  const rows = [painel + (P - painel) * 0.3, painel + (P - painel) * 0.72];
  for (const y of rows) for (const x of cols) {
    t.push(circ([x, y], r, 'detalhe'));
    t.push(circ([x, y], r * 0.45, 'textura', D));
  }
  for (let i = 0; i < 4; i++) t.push(circ([L * (0.2 + 0.2 * i), painel / 2], Math.min(14, painel * 0.25), 'textura', D));
  return t;
}

/** Tanque: borda, a bacia funda com o ralo e o esfregador (frisos) no detalhe. */
function tanque(L: number, P: number): TracoDoMobiliario[] {
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, Math.min(40, L * 0.07), 'contorno'), ret(60, 60, L - 60, P - 60, 50, 'detalhe'), circ([L / 2, P * 0.4], 22, 'textura', D)];
  for (let y = P * 0.62; y < P - 90; y += 35) t.push(linha([110, y], [L - 110, y], 'textura', D));
  return t;
}

/** Máquina de lavar: corpo, o painel no fundo e a tampa/porta redonda. */
function maquina(L: number, P: number): TracoDoMobiliario[] {
  const r = Math.min(L, P) * 0.32;
  return [ret(0, 0, L, P, Math.min(30, L * 0.05), 'contorno'), linha([0, P - 90], [L, P - 90], 'detalhe'), circ([L / 2, (P - 90) / 2], r, 'detalhe'), circ([L / 2, (P - 90) / 2], r * 0.72, 'textura', D)];
}

/** Vaso com caixa acoplada: bacia oval que nasce da caixa, assento e espelho d'água; tampa e botão no detalhe. */
function vaso(L: number, P: number): { tracos: TracoDoMobiliario[]; esconderSob: { x0: number; y0: number; x1: number; y1: number } } {
  const caixa = Math.min(180, P * 0.28);
  const cx = L / 2;
  const ry = (P - caixa + 30) / 2;
  return {
    tracos: [
      ret(0, P - caixa, L, P, 35, 'contorno'),
      ret(35, P - caixa + 25, L - 35, P - 25, 20, 'textura', D),
      circ([cx, P - caixa / 2], 22, 'textura', D),
      { tipo: 'elipse', c: [cx, ry], rx: L / 2 - 15, ry, pena: 'contorno' },
      { tipo: 'elipse', c: [cx, ry - 10], rx: Math.max(10, L / 2 - 75), ry: Math.max(10, ry - 85), pena: 'detalhe' },
      { tipo: 'elipse', c: [cx, ry - 25], rx: Math.max(8, L / 2 - 135), ry: Math.max(8, ry - 160), pena: 'textura', tracejado: true, lod: 'detalhe' },
    ],
    esconderSob: { x0: -1, y0: P - caixa, x1: L + 1, y1: P + 1 },
  };
}

/** Lavatório: a louça arredondada, a cuba oval com o ralo e a torneira no fundo. */
function lavatorio(L: number, P: number): TracoDoMobiliario[] {
  return [
    ret(0, 0, L, P, Math.min(90, Math.min(L, P) * 0.25), 'contorno'),
    { tipo: 'elipse', c: [L / 2, P * 0.45], rx: L * 0.34, ry: P * 0.3, pena: 'detalhe' },
    circ([L / 2, P * 0.42], 15, 'textura', D),
    circ([L / 2, P - 50], 18, 'detalhe'),
    linha([L / 2, P - 68], [L / 2, P * 0.45 + P * 0.3 - 10], 'detalhe'),
  ];
}

/** Box: o piso do box, o ralo e o caimento (diagonais) no detalhe; a porta de correr na frente. */
function box(L: number, P: number): TracoDoMobiliario[] {
  return [
    ret(0, 0, L, P, 0, 'contorno'),
    ret(40, 40, L - 40, P - 40, 0, 'detalhe'),
    circ([L / 2, P / 2], 35, 'detalhe'),
    linha([40, 40], [L / 2 - 30, P / 2 - 30], 'textura', D),
    linha([L - 40, 40], [L / 2 + 30, P / 2 - 30], 'textura', D),
    linha([40, P - 40], [L / 2 - 30, P / 2 + 30], 'textura', D),
    linha([L - 40, P - 40], [L / 2 + 30, P / 2 + 30], 'textura', D),
    linha([0, 15], [L * 0.6, 15], 'detalhe'),
    linha([L * 0.4, 28], [L, 28], 'detalhe'),
  ];
}

/** Condensadora: gabinete, o ventilador (círculo e pás) e a grade no detalhe. */
function condensadora(L: number, P: number): TracoDoMobiliario[] {
  const r = Math.min(L * 0.35, P * 0.42);
  const c: P2 = [L * 0.42, P / 2];
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, Math.min(15, P * 0.05), 'contorno'), circ(c, r, 'detalhe')];
  for (let i = 0; i < 3; i++) {
    const g = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    t.push(linha(c, [c[0] + r * 0.85 * Math.cos(g), c[1] + r * 0.85 * Math.sin(g)], 'textura'));
  }
  for (let x = L * 0.82; x < L - 30; x += 35) t.push(linha([x, 30], [x, P - 30], 'textura', D));
  return t;
}

/** Evaporadora hi-wall: corpo e as aletas de saída na frente. */
function evaporadora(L: number, P: number): TracoDoMobiliario[] {
  return [ret(0, 0, L, P, Math.min(40, P * 0.25), 'contorno'), linha([L * 0.06, P * 0.3], [L * 0.94, P * 0.3], 'detalhe'), linha([L * 0.06, P * 0.16], [L * 0.94, P * 0.16], 'textura', D)];
}

/** Exaustor: a grelha quadrada, o rotor e as pás. */
function exaustor(L: number, P: number): TracoDoMobiliario[] {
  const r = Math.min(L, P) * 0.4;
  const c: P2 = [L / 2, P / 2];
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, Math.min(15, L * 0.04), 'contorno'), circ(c, r, 'detalhe'), circ(c, r * 0.18, 'textura')];
  for (let i = 0; i < 4; i++) {
    const g = (i * Math.PI) / 2 + Math.PI / 4;
    const a: P2 = [c[0] + r * 0.18 * Math.cos(g), c[1] + r * 0.18 * Math.sin(g)];
    const b: P2 = [c[0] + r * 0.9 * Math.cos(g + 0.5), c[1] + r * 0.9 * Math.sin(g + 0.5)];
    t.push({ tipo: 'bezier', p: [a, [c[0] + r * 0.6 * Math.cos(g), c[1] + r * 0.6 * Math.sin(g)], [c[0] + r * 0.85 * Math.cos(g + 0.2), c[1] + r * 0.85 * Math.sin(g + 0.2)], b], pena: 'textura', lod: 'detalhe' });
  }
  return t;
}

/** Reserva de espaço (casa de máquinas): o contorno e as diagonais de "reservado". */
function reserva(L: number, P: number): TracoDoMobiliario[] {
  const t: TracoDoMobiliario[] = [ret(0, 0, L, P, 0, 'contorno')];
  const passo = Math.max(250, Math.min(L, P) / 4);
  for (let s = passo; s < L + P; s += passo) {
    const a: P2 = [Math.max(0, s - P), Math.min(P, s)];
    const b: P2 = [Math.min(L, s), Math.max(0, s - L)];
    t.push(linha(a, b, 'textura'));
  }
  return t;
}

/** Os traços do tipo, nas medidas da peça. Conjunto = nada (os filhos desenham). */
export function tracosDoMobiliario(tipoId: TipoDeComponente, L: number, P: number): { tracos: TracoDoMobiliario[]; esconderSob?: { x0: number; y0: number; x1: number; y1: number } } {
  const ficha = CATALOGO_DE_COMPONENTES[tipoId];
  if (!ficha || ficha.simbolo === 'CONJUNTO' || !(L > 0) || !(P > 0)) return { tracos: [] };
  switch (tipoId) {
    case 'CAMA_CASAL':
    case 'CAMA_SOLTEIRO':
      return { tracos: cama(L, P) };
    case 'SOFA':
    case 'POLTRONA':
      return { tracos: sofa(L, P) };
    case 'CADEIRA':
      return { tracos: cadeira(L, P) };
    case 'MESA_JANTAR':
      return { tracos: mesa(L, P) };
    case 'ESCRIVANINHA':
      return { tracos: escrivaninha(L, P) };
    case 'CRIADO':
      return { tracos: criado(L, P) };
    case 'ARMARIO':
      return { tracos: armario(L, P) };
    case 'ESTANTE':
      return { tracos: estante(L, P) };
    case 'RACK':
      return { tracos: rack(L, P) };
    case 'BANCADA':
      return { tracos: bancadaComPia(L, P) };
    case 'BANCADA_SECA':
      return { tracos: bancadaSeca(L, P) };
    case 'GELADEIRA':
      return { tracos: geladeira(L, P) };
    case 'FOGAO':
      return { tracos: fogao(L, P) };
    case 'TANQUE':
      return { tracos: tanque(L, P) };
    case 'MAQUINA':
      return { tracos: maquina(L, P) };
    case 'VASO':
      return vaso(L, P);
    case 'LAVATORIO':
      return { tracos: lavatorio(L, P) };
    case 'BOX':
      return { tracos: box(L, P) };
    case 'CONDENSADORA':
      return { tracos: condensadora(L, P) };
    case 'EVAPORADORA':
      return { tracos: evaporadora(L, P) };
    case 'EXAUSTOR':
      return { tracos: exaustor(L, P) };
    case 'CASA_DE_MAQUINAS':
      return { tracos: reserva(L, P) };
    default:
      // Tipo novo no catálogo sem desenho próprio: ao menos o contorno.
      return { tracos: [ret(0, 0, L, P, 0, 'contorno')] };
  }
}

/** Mantém um ponto dentro da caixa (a tesselação de canto pode passar 1e-9 da borda). */
const naCaixa = (L: number, P: number) => (p: P2): P2 => [Math.min(L, Math.max(0, p[0])), Math.min(P, Math.max(0, p[1]))];

/**
 * O símbolo PRONTO em polilinhas de mm LOCAIS. `detalhe: false` = a versão limpa (1:100 para baixo, peça pequena
 * na tela, miniatura).
 */
export function linhasDoMobiliario(tipoId: TipoDeComponente, L: number, P: number, opcoes: { detalhe: boolean }): LinhaDoSimbolo[] {
  const { tracos, esconderSob } = tracosDoMobiliario(tipoId, L, P);
  const prende = naCaixa(L, P);
  const out: LinhaDoSimbolo[] = [];
  tracos.forEach((t) => {
    if (t.lod === 'detalhe' && !opcoes.detalhe) return;
    const pts = tesselar(t).map(prende);
    // Sob a caixa acoplada do vaso some o que está atrás dela — menos a própria caixa (desenhada no fundo).
    const ehDaCaixa = esconderSob && t.tipo === 'ret' && t.y0 >= esconderSob.y0 - 1e-6;
    const ehOBotao = esconderSob && t.tipo === 'elipse' && t.c[1] > esconderSob.y0;
    const partes = esconderSob && !ehDaCaixa && !ehOBotao ? recortarFora(pts, esconderSob) : [pts];
    for (const p of partes) if (p.length > 1) out.push({ pts: p, pena: t.pena, tracejado: !!t.tracejado });
  });
  return out;
}
