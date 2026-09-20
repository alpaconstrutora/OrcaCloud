/**
 * ANOTAÇÕES (19/09/2026, roadmap E8.1) — a parte PURA que canvas, PDF e DXF
 * compartilham: a geometria de desenho de cada tipo (ponta da seta, linhas da
 * hachura dentro do polígono, arco e rótulo da cota angular) e o filtro por
 * vista. O dado mora no kernel (`Anotacao`); aqui não há estado.
 *
 * As três saídas usam as MESMAS funções — a hachura que aparece na tela é a
 * que sai no papel e no CAD, linha por linha. É a razão de isto não viver
 * dentro do canvas.
 */
import {
  anguloDaCota,
  mesmaVista,
  pointInPolygon,
  type Anotacao,
  type BlueprintModel,
  type PadraoDeHachura,
  type Point,
  type TracoDaAnotacao,
  type VistaDaAnotacao,
} from './blueprintKernel';

export const COR_PADRAO_DA_ANOTACAO = '#b45309';

/** As anotações de UMA vista. */
export function anotacoesDaVista(model: BlueprintModel, vista: VistaDaAnotacao): Anotacao[] {
  return (model.anotacoes ?? []).filter((a) => mesmaVista(a.vista, vista));
}

/** Padrão de tracejado em unidades do MODELO (mm) — quem desenha converte pela escala. */
export function tracejadoMm(traco: TracoDaAnotacao, alturaMm: number): number[] {
  const u = Math.max(20, alturaMm / 2);
  return traco === 'TRACEJADO' ? [u * 2, u] : traco === 'PONTILHADO' ? [u / 3, u / 1.5] : [];
}

/**
 * Ponta de seta na direção `de → para`, com o tamanho proporcional à altura
 * do texto: os dois pontos das asas (o vértice é `para`).
 */
export function pontaDaSeta(de: Point, para: Point, alturaMm: number): [Point, Point] {
  const L = Math.hypot(para.x - de.x, para.y - de.y) || 1;
  const ux = (para.x - de.x) / L;
  const uy = (para.y - de.y) / L;
  const tam = Math.max(alturaMm * 0.9, 120);
  const abre = 0.35;
  const bx = para.x - ux * tam;
  const by = para.y - uy * tam;
  return [
    { x: Math.round(bx + -uy * tam * abre), y: Math.round(by + ux * tam * abre) },
    { x: Math.round(bx - -uy * tam * abre), y: Math.round(by - ux * tam * abre) },
  ];
}

/**
 * Linhas da hachura DENTRO do polígono: família de retas a 45° (DIAGONAL),
 * 45° + 135° (CRUZADA) ou grade de pontos (PONTOS, devolvida como segmentos
 * mínimos). SOLIDA devolve vazio — quem desenha preenche o polígono.
 * Espaçamento proporcional à altura do texto (mínimo 100 mm).
 */
export function linhasDaHachura(anel: Point[], padrao: PadraoDeHachura, alturaMm: number): [Point, Point][] {
  if (anel.length < 3 || padrao === 'SOLIDA') return [];
  const passo = Math.max(100, Math.round(alturaMm * 0.8));
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const out: [Point, Point][] = [];
  if (padrao === 'PONTOS') {
    for (let y = minY + passo / 2; y < maxY; y += passo) {
      for (let x = minX + passo / 2; x < maxX; x += passo) {
        const p = { x: Math.round(x), y: Math.round(y) };
        if (pointInPolygon(anel, p)) out.push([p, { x: p.x + 1, y: p.y }]);
      }
    }
    return out;
  }
  const direcoes: [number, number][] = padrao === 'CRUZADA' ? [[1, 1], [1, -1]] : [[1, 1]];
  for (const [dx, dy] of direcoes) {
    // Retas x*dy - y*dx = c, varridas em c; recorte por amostragem contra o polígono.
    const cMin = Math.min(minX * dy - minY * dx, maxX * dy - minY * dx, minX * dy - maxY * dx, maxX * dy - maxY * dx);
    const cMax = Math.max(minX * dy - minY * dx, maxX * dy - minY * dx, minX * dy - maxY * dx, maxX * dy - maxY * dx);
    const passoC = passo * Math.SQRT2;
    for (let c = cMin + passoC / 2; c < cMax; c += passoC) {
      // Interseções da reta com as arestas do polígono → pares ordenados ao longo da reta.
      const ts: number[] = [];
      for (let i = 0; i < anel.length; i++) {
        const a = anel[i];
        const b = anel[(i + 1) % anel.length];
        const fa = a.x * dy - a.y * dx - c;
        const fb = b.x * dy - b.y * dx - c;
        if ((fa <= 0 && fb > 0) || (fa > 0 && fb <= 0)) {
          const t = fa / (fa - fb);
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          ts.push(px * dx + py * dy); // coordenada ao longo da reta
        }
      }
      ts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < ts.length; k += 2) {
        const p1 = pontoNaReta(ts[k], c, dx, dy);
        const p2 = pontoNaReta(ts[k + 1], c, dx, dy);
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) >= 1) out.push([p1, p2]);
      }
    }
  }
  return out;
}

function pontoNaReta(s: number, c: number, dx: number, dy: number): Point {
  // Resolve x*dy - y*dx = c e x*dx + y*dy = s (dx, dy ∈ {±1}) → normaliza por (dx²+dy²).
  const n = dx * dx + dy * dy;
  return { x: Math.round((s * dx + c * dy) / n), y: Math.round((s * dy - c * dx) / n) };
}

export interface CotaAngularDesenhada {
  vertice: Point;
  raioMm: number;
  /** Ângulos das duas pontas, em radianos (sentido matemático, y para cima). */
  inicioRad: number;
  fimRad: number;
  /** Graus [0, 180]. */
  graus: number;
  rotulo: string;
  /** Onde o rótulo fica (na bissetriz, fora do arco). */
  posicaoDoRotulo: Point;
  /** Pontos do arco amostrado, do início ao fim pelo lado menor. */
  arco: Point[];
}

/** O arco e o rótulo da cota angular; `null` quando degenerada. */
export function cotaAngularDesenhada(a: Anotacao): CotaAngularDesenhada | null {
  const graus = anguloDaCota(a);
  if (graus == null) return null;
  const [v, p, q] = a.pontos;
  const raioMm = Math.max(200, Math.min(Math.hypot(p.x - v.x, p.y - v.y), Math.hypot(q.x - v.x, q.y - v.y)) * 0.6);
  let a1 = Math.atan2(p.y - v.y, p.x - v.x);
  let a2 = Math.atan2(q.y - v.y, q.x - v.x);
  // Sempre pelo arco MENOR, de a1 para a2.
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  if (delta < 0) {
    [a1, a2] = [a2, a1];
    delta = -delta;
  }
  const n = Math.max(8, Math.ceil(delta / (Math.PI / 36)));
  const arco: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a1 + (delta * i) / n;
    arco.push({ x: Math.round(v.x + Math.cos(t) * raioMm), y: Math.round(v.y + Math.sin(t) * raioMm) });
  }
  const meio = a1 + delta / 2;
  const rotulo = `${graus.toFixed(graus % 1 === 0 ? 0 : 1).replace('.', ',')}°`;
  return {
    vertice: v,
    raioMm,
    inicioRad: a1,
    fimRad: a2,
    graus,
    rotulo,
    posicaoDoRotulo: { x: Math.round(v.x + Math.cos(meio) * (raioMm + a.alturaMm * 1.2)), y: Math.round(v.y + Math.sin(meio) * (raioMm + a.alturaMm * 1.2)) },
    arco,
  };
}

/** Distância de um ponto à anotação (para seleção): menor distância aos segmentos / ao ponto do texto. */
export function distanciaAAnotacao(a: Anotacao, p: Point): number {
  if (a.tipo === 'TEXTO') {
    const t = a.pontos[0];
    // caixa aproximada: largura ~ 0,6 × altura × chars
    const w = Math.max(a.alturaMm, (a.texto?.length ?? 1) * a.alturaMm * 0.6);
    const dx = Math.max(0, Math.abs(p.x - (t.x + w / 2)) - w / 2);
    const dy = Math.max(0, Math.abs(p.y - (t.y + a.alturaMm / 2)) - a.alturaMm / 2);
    return Math.hypot(dx, dy);
  }
  const segs: [Point, Point][] = [];
  const pts = a.pontos;
  if (a.tipo === 'HACHURA') {
    if (pointInPolygon(pts, p)) return 0;
    for (let i = 0; i < pts.length; i++) segs.push([pts[i], pts[(i + 1) % pts.length]]);
  } else if (a.tipo === 'COTA_ANGULAR') {
    segs.push([pts[0], pts[1]], [pts[0], pts[2]]);
  } else {
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  }
  let melhor = Infinity;
  for (const [s1, s2] of segs) melhor = Math.min(melhor, distanciaAoSegmento(s1, s2, p));
  return melhor;
}

function distanciaAoSegmento(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export interface ResumoDasAnotacoes {
  total: number;
  porTipo: Record<Anotacao['tipo'], number>;
  vistas: number;
}

export function resumirAnotacoes(model: BlueprintModel): ResumoDasAnotacoes {
  const porTipo: Record<Anotacao['tipo'], number> = { TEXTO: 0, LEADER: 0, LINHA: 0, HACHURA: 0, COTA_ANGULAR: 0 };
  const vistas = new Set<string>();
  for (const a of model.anotacoes ?? []) {
    porTipo[a.tipo]++;
    vistas.add(a.vista.tipo === 'PLANTA' ? `P:${a.vista.levelId}` : a.vista.tipo === 'CORTE' ? `C:${a.vista.corteId}` : `E:${a.vista.direcao}`);
  }
  return { total: (model.anotacoes ?? []).length, porTipo, vistas: vistas.size };
}
