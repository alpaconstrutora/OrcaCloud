/**
 * PRANCHAS DO LOTEAMENTO (fase B4): a planta geral e a planta individual do lote.
 *
 * A planta individual é a peça que acompanha o memorial de cada lote no
 * cartório: o lote em destaque, cotado lado a lado, com os confrontantes
 * escritos e a quadra em volta para dar contexto. Hoje isso é desenhado à mão,
 * um por um.
 *
 * O desenho passa pelo `Desenhista` abstrato de `blueprintExport.ts` — o mesmo
 * que atende canvas, jsPDF e o dublê de teste. Nada aqui sabe de PDF.
 */
import type { BlueprintModel, Lote, Point } from './blueprintKernel';
import type { Desenhista, Enquadramento, EstiloTraco } from './blueprintExport';
import {
  medirLote,
  areaEmM2,
  faixaDaVia,
  centroide,
  rotuloDoLote,
  ROTULO_DO_PAPEL_DO_LADO,
  type LadoDoLote,
} from './blueprintLoteamento';
import { numeroBr, tabelaDeLotes, tabelaDeQuadras } from './blueprintMemorialLote';
import { FICHA_DA_AREA_PUBLICA } from './blueprintKernel';

/**
 * Os quatro traços do desenho de loteamento, em espessura de PAPEL.
 *
 * ⚠️ O `Desenhista` não tem tracejado: a interface é linha, polígono, texto e
 * retângulo, e inventar um quinto obrigaria as três implementações (canvas,
 * jsPDF e o dublê de teste) a acompanhar. A quadra se distingue pela espessura
 * e pela cor, que é o que o papel precisa.
 */
const FINO: EstiloTraco = { espessuraMm: 0.18, cor: '#334155' };
const GROSSO: EstiloTraco = { espessuraMm: 0.5, cor: '#0f172a' };
const LEVE: EstiloTraco = { espessuraMm: 0.13, cor: '#94a3b8' };
const DA_QUADRA: EstiloTraco = { espessuraMm: 0.35, cor: '#475569' };

export interface ContextoDoDesenho {
  /** mm de papel por mm de modelo. */
  escala: number;
  /** Canto do desenho no papel. */
  offsetXMm: number;
  offsetYMm: number;
  /** Caixa do que vai ser desenhado, em mm de modelo. */
  caixa: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Converte ponto do modelo para mm de papel. Y do papel cresce para BAIXO. */
export function paraPapel(p: Point, ctx: ContextoDoDesenho): { x: number; y: number } {
  return {
    x: ctx.offsetXMm + (p.x - ctx.caixa.minX) * ctx.escala,
    y: ctx.offsetYMm + (ctx.caixa.maxY - p.y) * ctx.escala,
  };
}

function caixaDe(pontos: Point[], folgaMm: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  return {
    minX: Math.min(...xs) - folgaMm,
    minY: Math.min(...ys) - folgaMm,
    maxX: Math.max(...xs) + folgaMm,
    maxY: Math.max(...ys) + folgaMm,
  };
}

/** O contexto que enquadra um conjunto de pontos na área útil da folha. */
export function enquadrarPontos(pontos: Point[], enq: Enquadramento, folgaMm = 2000): ContextoDoDesenho | null {
  if (pontos.length === 0) return null;
  const caixa = caixaDe(pontos, folgaMm);
  const larguraModelo = caixa.maxX - caixa.minX;
  const alturaModelo = caixa.maxY - caixa.minY;
  if (larguraModelo <= 0 || alturaModelo <= 0) return null;
  // A escala é a que faz o desenho caber nas DUAS dimensões — a menor manda.
  const escala = Math.min(enq.utilLarguraMm / larguraModelo, enq.utilAlturaMm / alturaModelo);
  // Centra o que sobrou, para o desenho não ficar encostado numa borda.
  const sobraX = enq.utilLarguraMm - larguraModelo * escala;
  const sobraY = enq.utilAlturaMm - alturaModelo * escala;
  return {
    escala,
    offsetXMm: enq.offsetXMm + sobraX / 2,
    offsetYMm: enq.offsetYMm + sobraY / 2,
    caixa,
  };
}

/** Meio de uma aresta, em mm de modelo. */
function meioDaAresta(lado: LadoDoLote): Point {
  return { x: (lado.de.x + lado.para.x) / 2, y: (lado.de.y + lado.para.y) / 2 };
}

/**
 * A PLANTA INDIVIDUAL DO LOTE.
 *
 * O lote sai preenchido e cotado; a quadra e os vizinhos ficam em traço leve,
 * só para situar. Cada lado leva a medida e, quando há, o confrontante — é essa
 * dupla que o registrador confere contra o memorial.
 */
export function desenharLote(
  d: Desenhista,
  model: BlueprintModel,
  lote: Lote,
  enq: Enquadramento,
  alturaDoTextoMm = 2.5,
): void {
  const quadra = lote.quadraId != null ? (model.quadras ?? []).find((q) => q.id === lote.quadraId) : undefined;
  // Enquadra pela QUADRA quando ela existe: o lote sozinho no meio da folha
  // perde a referência de onde fica dentro do quarteirão.
  const base = quadra ? quadra.pontos : lote.pontos;
  const ctx = enquadrarPontos(base, enq);
  if (!ctx) return;

  // 1. O contexto: os outros lotes da quadra, em traço leve.
  for (const outro of model.lotes ?? []) {
    if (outro.id === lote.id || outro.quadraId !== lote.quadraId) continue;
    const pts = outro.pontos.map((p) => paraPapel(p, ctx));
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, LEVE);
    }
    const c = paraPapel(centroide(outro.pontos), ctx);
    d.texto(c.x, c.y, outro.numero, alturaDoTextoMm * 0.8, '#94a3b8');
  }

  // 2. A quadra, tracejada.
  if (quadra) {
    const pts = quadra.pontos.map((p) => paraPapel(p, ctx));
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, DA_QUADRA);
    }
  }

  // 3. O LOTE, preenchido e em traço grosso.
  const pts = lote.pontos.map((p) => paraPapel(p, ctx));
  d.poligono(pts, '#dbeafe');
  for (let i = 0; i < pts.length; i += 1) {
    const q = pts[(i + 1) % pts.length];
    d.linha(pts[i].x, pts[i].y, q.x, q.y, GROSSO);
  }

  // 4. As cotas e os confrontantes, lado a lado.
  const medida = medirLote(model, lote);
  for (const lado of medida.lados) {
    const meio = paraPapel(meioDaAresta(lado), ctx);
    const medidaTexto = `${numeroBr(lado.comprimentoMm / 1000)} m`;
    d.texto(meio.x, meio.y - alturaDoTextoMm * 0.6, medidaTexto, alturaDoTextoMm, '#0f172a');
    if (lado.confrontante) {
      d.texto(meio.x, meio.y + alturaDoTextoMm * 0.8, lado.confrontante, alturaDoTextoMm * 0.8, '#475569');
    }
  }

  // 5. A identificação no centro.
  const centro = paraPapel(centroide(lote.pontos), ctx);
  d.texto(centro.x, centro.y - alturaDoTextoMm, rotuloDoLote(model, lote), alturaDoTextoMm * 1.4, '#0f172a');
  d.texto(centro.x, centro.y + alturaDoTextoMm, `${numeroBr(medida.areaMm2 / 1e6)} m²`, alturaDoTextoMm, '#1e3a8a');
  d.texto(
    centro.x,
    centro.y + alturaDoTextoMm * 2.4,
    `testada ${numeroBr(medida.testadaMm / 1000)} m`,
    alturaDoTextoMm * 0.85,
    '#475569',
  );
}

/**
 * A PLANTA GERAL DO LOTEAMENTO: quadras, lotes numerados, vias e áreas
 * públicas. É a folha de abertura do conjunto.
 */
export function desenharLoteamento(d: Desenhista, model: BlueprintModel, enq: Enquadramento, alturaDoTextoMm = 2): void {
  const todos: Point[] = [
    ...(model.quadras ?? []).flatMap((q) => q.pontos),
    ...(model.lotes ?? []).flatMap((l) => l.pontos),
    ...(model.areasPublicas ?? []).flatMap((a) => a.pontos),
    ...(model.vias ?? []).flatMap((v) => faixaDaVia(v.eixo, v.larguraMm)),
  ];
  const ctx = enquadrarPontos(todos, enq);
  if (!ctx) return;

  // 1. As vias, por baixo de tudo.
  for (const via of model.vias ?? []) {
    const faixa = faixaDaVia(via.eixo, via.larguraMm);
    if (faixa.length < 3) continue;
    const pts = faixa.map((p) => paraPapel(p, ctx));
    d.poligono(pts, '#f1f5f9');
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, FINO);
    }
  }

  // 2. As áreas públicas.
  for (const area of model.areasPublicas ?? []) {
    if (area.pontos.length < 3) continue;
    const pts = area.pontos.map((p) => paraPapel(p, ctx));
    d.poligono(pts, FICHA_DA_AREA_PUBLICA[area.tipo].cor);
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, FINO);
    }
    const c = paraPapel(centroide(area.pontos), ctx);
    d.texto(c.x, c.y, area.nome ?? FICHA_DA_AREA_PUBLICA[area.tipo].rotulo, alturaDoTextoMm, '#334155');
    d.texto(c.x, c.y + alturaDoTextoMm * 1.3, `${numeroBr(areaEmM2(area.pontos))} m²`, alturaDoTextoMm * 0.85, '#475569');
  }

  // 3. Os lotes.
  for (const lote of model.lotes ?? []) {
    if (lote.pontos.length < 3) continue;
    const pts = lote.pontos.map((p) => paraPapel(p, ctx));
    d.poligono(pts, '#ffffff');
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, FINO);
    }
    const c = paraPapel(centroide(lote.pontos), ctx);
    d.texto(c.x, c.y, lote.numero, alturaDoTextoMm, '#0f172a');
  }

  // 4. As quadras por cima, em traço grosso, com o nome.
  for (const quadra of model.quadras ?? []) {
    if (quadra.pontos.length < 3) continue;
    const pts = quadra.pontos.map((p) => paraPapel(p, ctx));
    for (let i = 0; i < pts.length; i += 1) {
      const q = pts[(i + 1) % pts.length];
      d.linha(pts[i].x, pts[i].y, q.x, q.y, GROSSO);
    }
    const c = paraPapel(centroide(quadra.pontos), ctx);
    d.texto(c.x, c.y - alturaDoTextoMm * 3, `QUADRA ${quadra.nome}`, alturaDoTextoMm * 1.2, '#0f172a');
  }

  // 5. O nome de cada via, no meio do eixo.
  for (const via of model.vias ?? []) {
    if (via.eixo.length < 2) continue;
    const meio = via.eixo[Math.floor((via.eixo.length - 1) / 2)];
    const seguinte = via.eixo[Math.floor((via.eixo.length - 1) / 2) + 1] ?? via.eixo[via.eixo.length - 1];
    const p = paraPapel({ x: (meio.x + seguinte.x) / 2, y: (meio.y + seguinte.y) / 2 }, ctx);
    d.texto(p.x, p.y, via.nome, alturaDoTextoMm, '#475569');
  }
}

/**
 * A FOLHA DE TABELAS do loteamento: lotes por quadra e o quadro de áreas.
 * Sai como texto posicionado — o `Desenhista` não tem primitiva de tabela, e
 * inventar uma aqui obrigaria as três implementações a acompanhar.
 */
export function desenharTabelasDoLoteamento(
  d: Desenhista,
  model: BlueprintModel,
  areaDaGlebaMm2: number | null,
  enq: Enquadramento,
  alturaDoTextoMm = 2.2,
): void {
  const linhaAltura = alturaDoTextoMm * 1.8;
  let y = enq.offsetYMm + linhaAltura;
  const x = enq.offsetXMm;
  const col = (i: number) => x + i * (enq.utilLarguraMm / 6);

  const escrever = (textos: string[], destaque = false) => {
    textos.forEach((t, i) => d.texto(col(i), y, t, alturaDoTextoMm, destaque ? '#0f172a' : '#334155'));
    y += linhaAltura;
  };

  d.texto(x, y, 'QUADRO DE LOTES', alturaDoTextoMm * 1.3, '#0f172a');
  y += linhaAltura * 1.4;
  escrever(['Quadra', 'Lote', 'Área (m²)', 'Testada (m)', 'Perímetro (m)', 'Frente para'], true);
  d.linha(x, y - linhaAltura * 0.6, x + enq.utilLarguraMm, y - linhaAltura * 0.6, FINO);

  for (const l of tabelaDeLotes(model)) {
    if (y > enq.offsetYMm + enq.utilAlturaMm - linhaAltura * 6) {
      d.texto(x, y, '… (continua)', alturaDoTextoMm, '#94a3b8');
      y += linhaAltura;
      break;
    }
    escrever([l.quadra, l.lote, numeroBr(l.areaM2), numeroBr(l.testadaM), numeroBr(l.perimetroM), l.confrontanteDaFrente]);
  }

  y += linhaAltura;
  d.texto(x, y, 'RESUMO POR QUADRA', alturaDoTextoMm * 1.3, '#0f172a');
  y += linhaAltura * 1.4;
  escrever(['Quadra', 'Lotes', 'Área (m²)', 'Menor (m²)', 'Maior (m²)'], true);
  for (const q of tabelaDeQuadras(model)) {
    escrever([q.quadra, String(q.lotes), numeroBr(q.areaM2), numeroBr(q.menorLoteM2), numeroBr(q.maiorLoteM2)]);
  }

  if (areaDaGlebaMm2 != null && areaDaGlebaMm2 > 0) {
    y += linhaAltura;
    d.texto(x, y, `Área da gleba: ${numeroBr(areaDaGlebaMm2 / 1e6)} m²`, alturaDoTextoMm, '#475569');
  }
}

export { ROTULO_DO_PAPEL_DO_LADO };
