/**
 * SVG genérico para a importação de topografia (fase 15): o que o
 * `blueprintTopografiaImportacao.ts` lia por regex sobre o texto inteiro —
 * ignorando `transform` e achatando Bézier/arco só pelo ponto final — vive
 * aqui, com o que faltava:
 *
 * - `elementosDoSvg`: um tokenizer de tags SEM DOM (os testes rodam em Node)
 *   que percorre o arquivo com uma pilha de matrizes: `<g transform>` e
 *   `<svg>` aninhado empilham, e cada elemento sai com a sua CTM. O que
 *   está em `<defs>`, `<symbol>`, `<clipPath>`, `<mask>`, `<marker>` e
 *   `<pattern>` não é desenhado e não sai (antes virava marca falsa).
 * - `matrizDoTransform`: `matrix`, `translate`, `scale`, `rotate(a[,cx,cy])`,
 *   `skewX`, `skewY`, compostos na ordem da lista (SVG aplica da direita
 *   para a esquerda ao ponto; a matriz acumulada é M = M·Tᵢ).
 * - `verticesDoPath`: M/L/H/V/Z absolutos e relativos, e agora C/S/Q/T
 *   achatados por subdivisão e A pela conversão da spec (F.6.5) — a curva
 *   de nível suavizada em spline sai com o traço dela, não com as pontas.
 *
 * Puro: texto entra, números saem.
 */

/** `x' = a·x + c·y + e`, `y' = b·x + d·y + f` — a ordem do `matrix(a b c d e f)` do SVG. */
export type Matriz = [number, number, number, number, number, number];

export const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

/** `P·C`: aplica `C` primeiro e `P` depois — pai·filho ao empilhar. */
export function multiplicar(P: Matriz, C: Matriz): Matriz {
  const [a1, b1, c1, d1, e1, f1] = P;
  const [a2, b2, c2, d2, e2, f2] = C;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function aplicar(M: Matriz, p: { x: number; y: number }): { x: number; y: number } {
  return { x: M[0] * p.x + M[2] * p.y + M[4], y: M[1] * p.x + M[3] * p.y + M[5] };
}

/** Fator de escala médio (raiz do determinante): para tamanho de fonte, raio e alcance. */
export function escalaDa(M: Matriz): number {
  return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
}

const GRAU = Math.PI / 180;

/** A lista de transformações de um atributo `transform`, já composta. */
export function matrizDoTransform(texto: string): Matriz {
  let M: Matriz = IDENTIDADE;
  for (const m of texto.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const args = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number);
    let T: Matriz = IDENTIDADE;
    switch (m[1]) {
      case 'matrix':
        if (args.length >= 6) T = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        T = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args.length >= 2 ? args[1] : sx;
        T = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const a = (args[0] ?? 0) * GRAU;
        const R: Matriz = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (args.length >= 3) {
          const cx = args[1];
          const cy = args[2];
          T = multiplicar(multiplicar([1, 0, 0, 1, cx, cy], R), [1, 0, 0, 1, -cx, -cy]);
        } else {
          T = R;
        }
        break;
      }
      case 'skewX':
        T = [1, 0, Math.tan((args[0] ?? 0) * GRAU), 1, 0, 0];
        break;
      case 'skewY':
        T = [1, Math.tan((args[0] ?? 0) * GRAU), 0, 1, 0, 0];
        break;
    }
    if (T.every((v) => Number.isFinite(v))) M = multiplicar(M, T);
  }
  return M;
}

export interface ElementoSvg {
  /** Nome da tag em minúsculas. */
  tag: string;
  /** A string de atributos como escrita (para `atributo(tag, nome)`). */
  atributos: string;
  /** A matriz acumulada de todos os `transform` acima e no próprio elemento. */
  ctm: Matriz;
  /** Só em `<text>`: o conteúdo até o `</text>`. */
  conteudo?: string;
}

const NAO_DESENHADOS = new Set(['defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'metadata', 'title', 'desc', 'style', 'script']);

function atributoTexto(atributos: string, nome: string): string | null {
  const m =
    atributos.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`, 'i')) ??
    atributos.match(new RegExp(`\\b${nome}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1] : null;
}

/**
 * Os elementos desenháveis do SVG, cada um com a sua CTM. Sem DOM: um
 * tokenizer de tags com pilha. `transform` no `<svg>` raiz é ignorado (é o
 * que a spec 1.1 faz) e contado em `transformNaRaiz`; `<svg>` aninhado vale
 * como `translate(x, y)`.
 */
export function elementosDoSvg(
  texto: string,
  opcoes: { aplicarTransform?: boolean } = {},
): { elementos: ElementoSvg[]; transformNaRaiz: boolean; comTransform: number } {
  const aplicarT = opcoes.aplicarTransform ?? true;
  // Comentários, CDATA, instruções e DOCTYPE não têm tags que interessem —
  // e podem ter `<` solto dentro.
  const limpo = texto
    .replace(/<!--[\s\S]*?-->/g, (s) => ' '.repeat(s.length))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (s) => ' '.repeat(s.length))
    .replace(/<\?[\s\S]*?\?>/g, (s) => ' '.repeat(s.length))
    .replace(/<!DOCTYPE[^>]*>/gi, (s) => ' '.repeat(s.length));
  const elementos: ElementoSvg[] = [];
  const pilha: { tag: string; ctm: Matriz; oculto: boolean }[] = [];
  let transformNaRaiz = false;
  let comTransform = 0;
  let raizVista = false;
  const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpo))) {
    const fecha = m[1] === '/';
    const tag = m[2].toLowerCase();
    const atributos = m[3] ?? '';
    const autoFechada = m[4] === '/';
    if (fecha) {
      // Fecha o mais próximo com o mesmo nome (tolerante a arquivo mal formado).
      for (let i = pilha.length - 1; i >= 0; i--) {
        if (pilha[i].tag === tag) {
          pilha.length = i;
          break;
        }
      }
      continue;
    }
    const topo = pilha[pilha.length - 1];
    const ctmPai = topo?.ctm ?? IDENTIDADE;
    const ocultoPai = topo?.oculto ?? false;
    let propria: Matriz = IDENTIDADE;
    const t = atributoTexto(atributos, 'transform');
    if (tag === 'svg' && !raizVista) {
      raizVista = true;
      if (t) transformNaRaiz = true;
    } else if (tag === 'svg') {
      const x = Number(atributoTexto(atributos, 'x') ?? 0) || 0;
      const y = Number(atributoTexto(atributos, 'y') ?? 0) || 0;
      propria = [1, 0, 0, 1, x, y];
    } else if (t) {
      comTransform++;
      if (aplicarT) propria = matrizDoTransform(t);
    }
    const ctm = multiplicar(ctmPai, propria);
    const oculto = ocultoPai || NAO_DESENHADOS.has(tag);
    if (!oculto) {
      const el: ElementoSvg = { tag, atributos, ctm };
      if (tag === 'text' && !autoFechada) {
        const fim = limpo.indexOf('</text>', re.lastIndex);
        el.conteudo = fim >= 0 ? limpo.slice(re.lastIndex, fim) : '';
      }
      elementos.push(el);
    }
    if (!autoFechada) pilha.push({ tag, ctm, oculto });
  }
  return { elementos, transformNaRaiz, comTransform };
}

// ── `d` de <path> ─────────────────────────────────────────────────────────

type P2 = { x: number; y: number };

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function segmentosPara(comprimento: number, passo: number | undefined): number {
  if (!passo || !(passo > 0)) return 16;
  return clamp(Math.ceil(comprimento / passo), 4, 32);
}

function pontosDaCubica(p0: P2, p1: P2, p2: P2, p3: P2, passo?: number): P2[] {
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const n = segmentosPara(L, passo);
  const saida: P2[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    saida.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return saida;
}

function pontosDaQuadratica(p0: P2, p1: P2, p2: P2, passo?: number): P2[] {
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const n = segmentosPara(L, passo);
  const saida: P2[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    saida.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
  }
  return saida;
}

/** Arco elíptico do SVG (spec F.6.5: dos pontos finais para o centro), achatado. */
function pontosDoArco(p0: P2, rxIn: number, ryIn: number, phiDeg: number, fA: number, fS: number, p1: P2, passo?: number): P2[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (p0.x === p1.x && p0.y === p1.y)) return [p1];
  const phi = phiDeg * GRAU;
  const cosF = Math.cos(phi);
  const sinF = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cosF * dx + sinF * dy;
  const y1 = -sinF * dx + cosF * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (fA === fS) coef = -coef;
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cosF * cx1 - sinF * cy1 + (p0.x + p1.x) / 2;
  const cy = sinF * cx1 + cosF * cy1 + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(clamp(dot / len, -1, 1));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dTheta = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!fS && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (fS && dTheta < 0) dTheta += 2 * Math.PI;
  const n = passo && passo > 0 ? clamp(Math.ceil((Math.abs(dTheta) * Math.max(rx, ry)) / passo), 4, 32) : 16;
  const saida: P2[] = [];
  for (let k = 1; k <= n; k++) {
    const th = theta1 + (dTheta * k) / n;
    const ex = rx * Math.cos(th);
    const ey = ry * Math.sin(th);
    saida.push({ x: cosF * ex - sinF * ey + cx, y: sinF * ex + cosF * ey + cy });
  }
  // A ponta final é exata, não a do cosseno.
  saida[saida.length - 1] = { x: p1.x, y: p1.y };
  return saida;
}

/**
 * Vértices de um `d` de `<path>`, por subcaminho. `temCurvasBezier` diz que o
 * subcaminho tinha C/S/Q/T/A — agora achatadas em segmentos (`passo`: o
 * comprimento alvo de cada segmento, na unidade do arquivo; sem ele, 16 por
 * curva). O nome do campo é o da fase 11, que os testes leem.
 */
export function verticesDoPath(
  d: string,
  opcoes: { passo?: number } = {},
): { pontos: { x: number; y: number }[]; temCurvasBezier: boolean }[] {
  const passo = opcoes.passo;
  const sub: { pontos: P2[]; temCurvasBezier: boolean }[] = [];
  let atual: P2[] = [];
  let bezier = false;
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  // Último ponto de controle, para S/T refletirem; `ultimo` é o comando anterior.
  let ctrlX = 0;
  let ctrlY = 0;
  let ultimo = '';
  const fechar = () => {
    if (atual.length > 0) sub.push({ pontos: atual, temCurvasBezier: bezier });
    atual = [];
    bezier = false;
  };
  const tokens = d.match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (atual.length > 0 && (atual[0].x !== x || atual[0].y !== y)) atual.push({ x: inicioX, y: inicioY });
        x = inicioX;
        y = inicioY;
        fechar();
        ultimo = 'Z';
        continue;
      }
      continue;
    }
    const antes = { x, y };
    switch (cmd) {
      case 'M':
      case 'm': {
        if (cmd === 'M') {
          x = num();
          y = num();
        } else {
          x += num();
          y += num();
        }
        fechar();
        inicioX = x;
        inicioY = y;
        atual.push({ x, y });
        // Pares seguintes num M são L implícitos.
        cmd = cmd === 'M' ? 'L' : 'l';
        ultimo = 'M';
        break;
      }
      case 'L':
        x = num();
        y = num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'l':
        x += num();
        y += num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'H':
        x = num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'h':
        x += num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'V':
        y = num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'v':
        y += num();
        atual.push({ x, y });
        ultimo = 'L';
        break;
      case 'C':
      case 'c': {
        bezier = true;
        const rel = cmd === 'c';
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const ex = num();
        const ey = num();
        const p1 = rel ? { x: antes.x + x1, y: antes.y + y1 } : { x: x1, y: y1 };
        const p2 = rel ? { x: antes.x + x2, y: antes.y + y2 } : { x: x2, y: y2 };
        const p3 = rel ? { x: antes.x + ex, y: antes.y + ey } : { x: ex, y: ey };
        atual.push(...pontosDaCubica(antes, p1, p2, p3, passo));
        x = p3.x;
        y = p3.y;
        ctrlX = p2.x;
        ctrlY = p2.y;
        ultimo = 'C';
        break;
      }
      case 'S':
      case 's': {
        bezier = true;
        const rel = cmd === 's';
        const x2 = num();
        const y2 = num();
        const ex = num();
        const ey = num();
        // O primeiro controle é o reflexo do último, se o anterior foi C/S.
        const p1 = ultimo === 'C' || ultimo === 'S' ? { x: 2 * antes.x - ctrlX, y: 2 * antes.y - ctrlY } : antes;
        const p2 = rel ? { x: antes.x + x2, y: antes.y + y2 } : { x: x2, y: y2 };
        const p3 = rel ? { x: antes.x + ex, y: antes.y + ey } : { x: ex, y: ey };
        atual.push(...pontosDaCubica(antes, p1, p2, p3, passo));
        x = p3.x;
        y = p3.y;
        ctrlX = p2.x;
        ctrlY = p2.y;
        ultimo = 'S';
        break;
      }
      case 'Q':
      case 'q': {
        bezier = true;
        const rel = cmd === 'q';
        const x1 = num();
        const y1 = num();
        const ex = num();
        const ey = num();
        const p1 = rel ? { x: antes.x + x1, y: antes.y + y1 } : { x: x1, y: y1 };
        const p2 = rel ? { x: antes.x + ex, y: antes.y + ey } : { x: ex, y: ey };
        atual.push(...pontosDaQuadratica(antes, p1, p2, passo));
        x = p2.x;
        y = p2.y;
        ctrlX = p1.x;
        ctrlY = p1.y;
        ultimo = 'Q';
        break;
      }
      case 'T':
      case 't': {
        bezier = true;
        const ex = num();
        const ey = num();
        const p1 = ultimo === 'Q' || ultimo === 'T' ? { x: 2 * antes.x - ctrlX, y: 2 * antes.y - ctrlY } : antes;
        const p2 = cmd === 't' ? { x: antes.x + ex, y: antes.y + ey } : { x: ex, y: ey };
        atual.push(...pontosDaQuadratica(antes, p1, p2, passo));
        x = p2.x;
        y = p2.y;
        ctrlX = p1.x;
        ctrlY = p1.y;
        ultimo = 'T';
        break;
      }
      case 'A':
      case 'a': {
        bezier = true;
        const rx = num();
        const ry = num();
        const rot = num();
        const fA = num();
        const fS = num();
        const ex = num();
        const ey = num();
        const p1 = cmd === 'a' ? { x: antes.x + ex, y: antes.y + ey } : { x: ex, y: ey };
        if ([rx, ry, rot, fA, fS, p1.x, p1.y].every(Number.isFinite)) atual.push(...pontosDoArco(antes, rx, ry, rot, fA ? 1 : 0, fS ? 1 : 0, p1, passo));
        x = p1.x;
        y = p1.y;
        ultimo = 'A';
        break;
      }
      default:
        i++;
    }
    if (Number.isNaN(x) || Number.isNaN(y)) break;
  }
  fechar();
  return sub.filter((s) => s.pontos.length >= 2);
}
