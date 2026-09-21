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
  signedArea,
  DATA_ISO_DA_REVISAO,
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
  if (a.tipo === 'HACHURA' || a.tipo === 'NUVEM') {
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
  const porTipo: Record<Anotacao['tipo'], number> = { TEXTO: 0, LEADER: 0, LINHA: 0, HACHURA: 0, COTA_ANGULAR: 0, NUVEM: 0 };
  const vistas = new Set<string>();
  for (const a of model.anotacoes ?? []) {
    porTipo[a.tipo]++;
    vistas.add(a.vista.tipo === 'PLANTA' ? `P:${a.vista.levelId}` : a.vista.tipo === 'CORTE' ? `C:${a.vista.corteId}` : `E:${a.vista.direcao}`);
  }
  return { total: (model.anotacoes ?? []).length, porTipo, vistas: vistas.size };
}

// ── NUVEM DE REVISÃO (P2.15) ────────────────────────────────────────────────

/** Arcos por metro de contorno: o "recorte" da nuvem. A corda de cada arco é ~2,5 × a altura do texto. */
export function cordaDaNuvemMm(alturaMm: number): number {
  return Math.max(150, Math.round(alturaMm * 2.5));
}

/**
 * O contorno RECORTADO da nuvem: cada lado do polígono vira uma fila de arcos
 * de meia-lua para FORA (anel anti-horário → normal à direita do sentido do
 * lado). Devolve uma polilinha fechada, já discretizada (8 segmentos por
 * arco) — a mesma geometria para a tela, o PDF e o DXF.
 */
export function contornoDaNuvem(pontos: Point[], alturaMm: number): Point[] {
  if (pontos.length < 3) return pontos.map((p) => ({ ...p }));
  const corda = cordaDaNuvemMm(alturaMm);
  const orient = signedArea(pontos) >= 0 ? 1 : -1; // anti-horário → +1
  const saida: Point[] = [];
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const arcos = Math.max(1, Math.round(L / corda));
    const passo = L / arcos;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    // Normal para FORA do polígono.
    const nx = orient * uy;
    const ny = -orient * ux;
    const r = passo / 2;
    for (let k = 0; k < arcos; k++) {
      const cx = a.x + ux * (k * passo + r);
      const cy = a.y + uy * (k * passo + r);
      for (let j = 0; j <= 8; j++) {
        // do início ao fim da corda (−u → +u) passando pela normal externa (meia-lua)
        const t = Math.PI * (j / 8);
        const px = cx + ux * r * -Math.cos(t) + nx * r * Math.sin(t);
        const py = cy + uy * r * -Math.cos(t) + ny * r * Math.sin(t);
        if (j === 0 && saida.length > 0) continue; // emenda com o arco anterior
        saida.push({ x: Math.round(px), y: Math.round(py) });
      }
    }
  }
  return saida;
}

/** Onde vai a ETIQUETA "Δn" da nuvem: o vértice mais alto (maior y no modelo), um pouco acima. */
export function posicaoDaEtiquetaDaNuvem(pontos: Point[], alturaMm: number): Point {
  const topo = pontos.reduce((m, p) => (p.y > m.y ? p : m), pontos[0]);
  return { x: topo.x, y: topo.y + cordaDaNuvemMm(alturaMm) / 2 + alturaMm };
}

export interface RevisaoDaPrancha {
  numero: number;
  /** ISO AAAA-MM-DD — a mais recente entre as nuvens do mesmo número. */
  data: string;
  /** Descrições das nuvens (sem repetir), na ordem em que aparecem. */
  descricoes: string[];
  nuvens: number;
}

/** A tabela de revisões do carimbo: uma linha por número, das nuvens dadas. */
export function revisoesDasAnotacoes(anotacoes: readonly Anotacao[]): RevisaoDaPrancha[] {
  const porNumero = new Map<number, RevisaoDaPrancha>();
  for (const a of anotacoes) {
    if (a.tipo !== 'NUVEM' || !a.revisao) continue;
    const r = porNumero.get(a.revisao.numero) ?? { numero: a.revisao.numero, data: a.revisao.data, descricoes: [], nuvens: 0 };
    r.nuvens++;
    if (a.revisao.data > r.data) r.data = a.revisao.data;
    const d = (a.texto ?? '').trim();
    if (d && !r.descricoes.includes(d)) r.descricoes.push(d);
    porNumero.set(a.revisao.numero, r);
  }
  return [...porNumero.values()].sort((x, y) => x.numero - y.numero);
}

export function revisoesDoModelo(model: BlueprintModel): RevisaoDaPrancha[] {
  return revisoesDasAnotacoes(model.anotacoes ?? []);
}

/** O próximo número de revisão: o maior existente + 1 (1 quando não há nuvem). */
export function proximaRevisao(model: BlueprintModel): number {
  const r = revisoesDoModelo(model);
  return r.length ? r[r.length - 1].numero + 1 : 1;
}

/** "dd/mm/aaaa" de uma data ISO, sem fuso. */
export function dataDaRevisaoBr(iso: string): string {
  const m = DATA_ISO_DA_REVISAO.exec(iso);
  return m ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}
