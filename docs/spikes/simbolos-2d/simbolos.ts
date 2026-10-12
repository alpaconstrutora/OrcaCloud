/**
 * SPIKE — símbolos 2D de mobiliário com qualidade de prancha (12/10/2026).
 *
 * Protótipo do formato proposto para substituir `tracosDoComponente` (utils/blueprintHumanizada.ts):
 *
 * - **Em MILÍMETROS da peça**, não em fração 0..1: o símbolo é uma função de (largura, profundidade). Raio de
 *   canto, travesseiro e cuba têm medida própria e não deformam quando a peça é esticada.
 * - **Curvas**: canto arredondado, elipse, arco e Bézier cúbica (tesseladas em polilinha — o que a tela, o PDF e
 *   o DXF já sabem desenhar).
 * - **Pena** (espessura no PAPEL): `contorno` 0,25 mm, `detalhe` 0,13 mm, `textura` 0,09 mm; e `tracejado`
 *   para o que está acima do plano de corte.
 * - **Nível de detalhe**: `lod: 'detalhe'` só aparece de 1:50 para cima; em 1:100/1:200 sai a versão limpa.
 *
 * Referencial LOCAL (o mesmo de hoje): x ao longo da largura (0..L), y da FRENTE (0) ao FUNDO/encosto (P).
 */

export type Pena = 'contorno' | 'detalhe' | 'textura';
export const PENA_MM: Record<Pena, number> = { contorno: 0.25, detalhe: 0.13, textura: 0.09 };

type P2 = [number, number];
interface Base {
  pena: Pena;
  tracejado?: boolean;
  lod?: 'detalhe';
}
export type Traco =
  | (Base & { tipo: 'linha'; a: P2; b: P2 })
  | (Base & { tipo: 'poli'; pontos: P2[]; fechado?: boolean })
  | (Base & { tipo: 'ret'; x0: number; y0: number; x1: number; y1: number; r?: number })
  | (Base & { tipo: 'elipse'; c: P2; rx: number; ry: number })
  | (Base & { tipo: 'bezier'; p: [P2, P2, P2, P2] });

/** Uma polilinha pronta para desenhar, com a pena e o tracejado. */
export interface Linha {
  pts: P2[];
  pena: Pena;
  tracejado: boolean;
}

function arcoDeCanto(cx: number, cy: number, r: number, de: number, ate: number, n = 6): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const g = de + ((ate - de) * i) / n;
    out.push([cx + r * Math.cos(g), cy + r * Math.sin(g)]);
  }
  return out;
}

/** Curvas → polilinhas. */
export function tesselar(t: Traco): P2[] {
  switch (t.tipo) {
    case 'linha':
      return [t.a, t.b];
    case 'poli':
      return t.fechado ? [...t.pontos, t.pontos[0]] : t.pontos;
    case 'ret': {
      const r = Math.min(t.r ?? 0, (t.x1 - t.x0) / 2, (t.y1 - t.y0) / 2);
      if (r <= 0) return [[t.x0, t.y0], [t.x1, t.y0], [t.x1, t.y1], [t.x0, t.y1], [t.x0, t.y0]];
      const H = Math.PI / 2;
      return [
        ...arcoDeCanto(t.x1 - r, t.y0 + r, r, -H, 0),
        ...arcoDeCanto(t.x1 - r, t.y1 - r, r, 0, H),
        ...arcoDeCanto(t.x0 + r, t.y1 - r, r, H, 2 * H),
        ...arcoDeCanto(t.x0 + r, t.y0 + r, r, 2 * H, 3 * H),
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

/** Tira de uma polilinha os trechos DENTRO de um retângulo (o que fica escondido sob o tampo da mesa). */
export function recortarFora(pts: P2[], r: { x0: number; y0: number; x1: number; y1: number }): P2[][] {
  const dentro = (p: P2) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1;
  const partes: P2[][] = [];
  let atual: P2[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // Subdivide o segmento e fica com o que está fora (precisão de 1/40 do segmento — basta para desenho).
    const n = 40;
    for (let k = 0; k < n; k++) {
      const s0 = k / n;
      const s1 = (k + 1) / n;
      const p0: P2 = [a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0];
      const p1: P2 = [a[0] + (b[0] - a[0]) * s1, a[1] + (b[1] - a[1]) * s1];
      const meio: P2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (dentro(meio)) {
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

// ─── Os quatro símbolos da prancha de comparação ─────────────────────────────

/** Cama: cabeceira, colchão de canto arredondado, travesseiros, a dobra do edredom com o canto virado. */
function cama(L: number, P: number): Traco[] {
  const cab = 60;
  const t: Traco[] = [
    { tipo: 'ret', x0: 0, y0: 0, x1: L, y1: P - cab, r: 50, pena: 'contorno' },
    { tipo: 'ret', x0: -10, y0: P - cab, x1: L + 10, y1: P, pena: 'contorno' },
  ];
  const n = L >= 1200 ? 2 : 1;
  const folga = 70;
  const largT = (L - folga * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const x0 = folga + i * (largT + folga);
    t.push({ tipo: 'ret', x0, y0: P - cab - 60 - 360, x1: x0 + largT, y1: P - cab - 60, r: 110, pena: 'detalhe' });
    // a "costura" do travesseiro
    t.push({ tipo: 'ret', x0: x0 + 45, y0: P - cab - 60 - 315, x1: x0 + largT - 45, y1: P - cab - 105, r: 80, pena: 'textura', lod: 'detalhe' });
  }
  // Dobra do edredom e o canto virado.
  const yD = P - cab - 560;
  const c = Math.min(420, L * 0.32);
  t.push({ tipo: 'poli', pontos: [[0, yD], [L - c, yD]], pena: 'detalhe' });
  t.push({ tipo: 'poli', pontos: [[L - c, yD], [L, yD - c]], pena: 'detalhe' });
  t.push({ tipo: 'linha', a: [L - c, yD], b: [L, yD], pena: 'textura', tracejado: true, lod: 'detalhe' });
  t.push({ tipo: 'linha', a: [0, yD - 70], b: [L - c - 70, yD - 70], pena: 'textura', lod: 'detalhe' });
  return t;
}

/** Sofá: braços e encosto arredondados, almofadas de assento separadas, almofadas de encosto no detalhe. */
function sofa(L: number, P: number): Traco[] {
  const braco = Math.min(190, L * 0.1);
  const encosto = Math.min(220, P * 0.25);
  const r = 70;
  const t: Traco[] = [
    { tipo: 'ret', x0: 0, y0: 0, x1: L, y1: P, r, pena: 'contorno' },
    { tipo: 'poli', pontos: [[braco, 0], [braco, P - encosto], [L - braco, P - encosto], [L - braco, 0]], pena: 'contorno' },
  ];
  const n = L >= 1600 ? 3 : L >= 1100 ? 2 : 1;
  const g = 14;
  const w = (L - 2 * braco - g * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const x0 = braco + g + i * (w + g);
    t.push({ tipo: 'ret', x0, y0: 40, x1: x0 + w, y1: P - encosto - g, r: 45, pena: 'detalhe' });
    // almofada de encosto (só no detalhe)
    t.push({ tipo: 'ret', x0: x0 + 10, y0: P - encosto + 25, x1: x0 + w - 10, y1: P - 35, r: 40, pena: 'textura', lod: 'detalhe' });
  }
  return t;
}

/** Cadeira 440 × 440 com o encosto curvo voltado para FORA (y=0 = frente, onde se senta). */
function cadeira(cx: number, y0: number, viradaPara: 1 | -1): Traco[] {
  const w = 440;
  const d = 440;
  const x0 = cx - w / 2;
  const Y = (y: number) => (viradaPara === 1 ? y0 + y : y0 - y);
  const assento: Traco = { tipo: 'ret', x0, y0: Math.min(Y(0), Y(d - 70)), x1: x0 + w, y1: Math.max(Y(0), Y(d - 70)), r: 60, pena: 'detalhe' };
  // Encosto: duas Béziers (face de fora e de dentro) abauladas para fora.
  const yi = Y(d - 70);
  const ye = Y(d);
  const bojo = viradaPara === 1 ? 40 : -40;
  return [
    assento,
    { tipo: 'bezier', p: [[x0 - 10, yi], [x0 + w * 0.25, yi + bojo], [x0 + w * 0.75, yi + bojo], [x0 + w + 10, yi]], pena: 'contorno' },
    { tipo: 'bezier', p: [[x0 - 10, yi], [x0 + w * 0.2, ye + bojo], [x0 + w * 0.8, ye + bojo], [x0 + w + 10, yi]], pena: 'contorno' },
  ];
}

/**
 * Mesa de jantar: o TAMPO na medida real da peça (hoje ele encolhe para as cadeiras caberem na caixa) e as
 * cadeiras puxadas para fora, com a parte que fica sob o tampo escondida.
 */
function mesa(L: number, P: number): { tracos: Traco[]; tampo: { x0: number; y0: number; x1: number; y1: number } } {
  const tampo = { x0: 0, y0: 0, x1: L, y1: P };
  const t: Traco[] = [{ tipo: 'ret', ...tampo, r: 25, pena: 'contorno' }];
  const n = Math.max(1, Math.floor(L / 650));
  const passo = L / n;
  for (let i = 0; i < n; i++) {
    const cx = passo * (i + 0.5);
    t.push(...cadeira(cx, P - 150, 1)); // fundo: a cadeira sai para trás
    t.push(...cadeira(cx, 150, -1)); // frente
  }
  // cabeceiras
  if (P >= 800) {
    for (const [lado, x] of [[1, L - 150], [-1, 150]] as const) {
      const c = cadeira(0, 0, 1).map((tr) => girar90(tr, lado, x, P / 2));
      t.push(...c);
    }
  }
  return { tracos: t, tampo };
}

/** Gira um traço de cadeira (feito em torno de x=0, y=0, virado para +y) 90° e o põe em (x, y). */
function girar90(t: Traco, lado: 1 | -1, x: number, y: number): Traco {
  const R = (p: P2): P2 => (lado === 1 ? [x + p[1], y - p[0]] : [x - p[1], y + p[0]]);
  if (t.tipo === 'bezier') return { ...t, p: t.p.map(R) as [P2, P2, P2, P2] };
  if (t.tipo === 'ret') {
    const a = R([t.x0, t.y0]);
    const b = R([t.x1, t.y1]);
    return { ...t, x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
  }
  return t;
}

/** Vaso com caixa acoplada: bacia oval que nasce da caixa, assento e espelho d'água; tampa e botão no detalhe. */
function vaso(L: number, P: number): Traco[] {
  const caixa = 180;
  const cx = L / 2;
  const fundoBacia = P - caixa;
  const ry = (fundoBacia + 30) / 2;
  return [
    { tipo: 'ret', x0: 0, y0: P - caixa, x1: L, y1: P, r: 35, pena: 'contorno' },
    { tipo: 'ret', x0: 35, y0: P - caixa + 25, x1: L - 35, y1: P - 25, r: 20, pena: 'textura', lod: 'detalhe' },
    { tipo: 'elipse', c: [cx, P - caixa / 2], rx: 22, ry: 22, pena: 'textura', lod: 'detalhe' },
    // bacia (a parte sob a caixa é recortada no desenho)
    { tipo: 'elipse', c: [cx, ry], rx: L / 2 - 15, ry, pena: 'contorno' },
    { tipo: 'elipse', c: [cx, ry - 10], rx: L / 2 - 75, ry: ry - 85, pena: 'detalhe' },
    { tipo: 'elipse', c: [cx, ry - 25], rx: L / 2 - 135, ry: ry - 160, pena: 'textura', tracejado: true, lod: 'detalhe' },
  ];
}

export type TipoDaPrancha = 'CAMA_CASAL' | 'SOFA' | 'MESA_JANTAR' | 'VASO';

/** O símbolo PROPOSTO, já em polilinhas, para a escala pedida (o nível de detalhe sai da escala). */
export function simboloProposto(tipo: TipoDaPrancha, L: number, P: number, denominador: number): Linha[] {
  const comDetalhe = denominador <= 50;
  let tracos: Traco[];
  let esconder: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (tipo === 'CAMA_CASAL') tracos = cama(L, P);
  else if (tipo === 'SOFA') tracos = sofa(L, P);
  else if (tipo === 'VASO') {
    tracos = vaso(L, P);
    esconder = { x0: -1, y0: P - 180, x1: L + 1, y1: P + 1 };
  } else {
    const m = mesa(L, P);
    tracos = m.tracos;
    esconder = m.tampo;
  }
  const out: Linha[] = [];
  tracos.forEach((t, k) => {
    if (t.lod === 'detalhe' && !comDetalhe) return;
    const pts = tesselar(t);
    // O que fica sob o tampo / a caixa não aparece — menos o próprio tampo/caixa (o 1º traço de cada um).
    const ehOProprio = (tipo === 'MESA_JANTAR' && k === 0) || (tipo === 'VASO' && k <= 2);
    const partes = esconder && !ehOProprio ? recortarFora(pts, esconder) : [pts];
    for (const p of partes) out.push({ pts: p, pena: t.pena, tracejado: !!t.tracejado });
  });
  return out;
}
