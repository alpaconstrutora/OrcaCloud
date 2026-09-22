// utils/dxfParaFundo.ts
//
// O DXF/DWG como PLANTA DE FUNDO (P2.36): o desenho original rasterizado e
// posicionado por baixo das paredes que a importação gerou, para comparar e
// corrigir — o mesmo calco da importação de PDF.
//
// ─── A DIFERENÇA PARA O PDF, E POR QUE ELA IMPORTA ───────────────────────────
//
// O PDF nasce SEM aferição (`mmPorPixel = 1`, obviamente errado) e obriga a
// pessoa a aferir com duas medidas antes de traçar. O DXF tem medida: a
// unidade foi escolhida no painel e cada traço está em milímetro. Então o fundo
// entra JÁ AFERIDO — a transformação pixel→modelo é a que este módulo calcula,
// com a mesma ancoragem (dx, dy) das paredes importadas. Onde a parede gerada
// não coincidir com o traço do fundo, é o reconhecimento que errou, e a pessoa
// vê onde.
//
// ─── SÓ POSICIONA; NÃO PRODUZ GEOMETRIA ─────────────────────────────────────
//
// Como `blueprintUnderlay`, nada daqui vira coordenada de parede. O raster é
// referência visual; a resolução é escolhida para caber num PNG razoável
// (`LADO_MAX_PX`), e o passo em mm por pixel é o único número que sai.

import type { ArcoDxf, LeituraDxf, SegmentoDxf } from './dxfLeitor';
import type { Underlay } from './blueprintUnderlay';

/** Lado maior do PNG. 4096 cabe em qualquer GPU de notebook; acima disso o fundo trava o canvas. */
export const LADO_MAX_PX = 4096;
/** Margem em torno do desenho, em pixels, para o traço da borda não ficar cortado. */
const MARGEM_PX = 8;

export interface PlanoDoFundo {
  /** Caixa do desenho no MODELO (mm, já com a ancoragem), sem a margem. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  mmPorPixel: number;
  larguraPx: number;
  alturaPx: number;
  /** A transformação do fundo — pixel (0,0) é o canto superior esquerdo da imagem, com margem. */
  underlay: Underlay;
}

export interface OpcoesDoFundo {
  /** Milímetros por unidade do arquivo (o que a pessoa confirmou no painel). */
  mmPorUnidade: number;
  /** Ancoragem aplicada às paredes importadas — o fundo anda junto. */
  dx: number;
  dy: number;
  /** Camadas a desenhar; omitido = todas. */
  camadas?: ReadonlySet<string> | null;
  /** Camada de parede escolhida — sai mais escura, para o olho achar o que foi lido. */
  camadaDestaque?: string | null;
  ladoMaxPx?: number;
}

/**
 * Onde o fundo cai e em que resolução. `null` quando não há traço nenhum.
 *
 * A resolução vem do lado maior: `LADO_MAX_PX` pixels para ele, com um piso de
 * 1 mm/px — mais fino que isso não se vê e só engorda o PNG.
 */
export function planejarFundo(leitura: Pick<LeituraDxf, 'segmentos' | 'arcos'>, o: OpcoesDoFundo): PlanoDoFundo | null {
  const mm = o.mmPorUnidade;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const inclui = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const s of leitura.segmentos) {
    if (o.camadas && !o.camadas.has(s.camada)) continue;
    inclui(s.a.x * mm + o.dx, s.a.y * mm + o.dy);
    inclui(s.b.x * mm + o.dx, s.b.y * mm + o.dy);
  }
  for (const a of leitura.arcos) {
    if (o.camadas && !o.camadas.has(a.camada)) continue;
    const r = a.raio * mm;
    inclui(a.centro.x * mm + o.dx - r, a.centro.y * mm + o.dy - r);
    inclui(a.centro.x * mm + o.dx + r, a.centro.y * mm + o.dy + r);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const largura = Math.max(1, maxX - minX);
  const altura = Math.max(1, maxY - minY);
  const ladoMax = o.ladoMaxPx ?? LADO_MAX_PX;
  const mmPorPixel = Math.max(1, Math.max(largura, altura) / (ladoMax - 2 * MARGEM_PX));
  const larguraPx = Math.ceil(largura / mmPorPixel) + 2 * MARGEM_PX;
  const alturaPx = Math.ceil(altura / mmPorPixel) + 2 * MARGEM_PX;
  // Pixel (0,0) = canto superior ESQUERDO: x mínimo menos a margem, y MÁXIMO mais a margem (o Y da imagem cresce para baixo).
  const underlay: Underlay = { origemXMm: minX - MARGEM_PX * mmPorPixel, origemYMm: maxY + MARGEM_PX * mmPorPixel, mmPorPixel, rotacaoMrad: 0 };
  return { minX, minY, maxX, maxY, mmPorPixel, larguraPx, alturaPx, underlay };
}

/** O que o desenho precisa de um contexto 2D — o subconjunto, para testar sem canvas. */
export interface ContextoDeTraco {
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineCap: CanvasLineCap;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, anticlockwise?: boolean): void;
  stroke(): void;
}

/** Cor do traço comum e da camada em destaque. Cinza-azulado para não competir com a parede gerada. */
export const COR_DO_FUNDO = '#5b6b86';
export const COR_DO_DESTAQUE = '#1f2937';

/**
 * Desenha segmentos e arcos no contexto, em pixels do plano. A camada em
 * destaque sai por último e mais escura. Devolve quantos traços saíram.
 */
export function desenharFundo(ctx: ContextoDeTraco, plano: PlanoDoFundo, leitura: Pick<LeituraDxf, 'segmentos' | 'arcos'>, o: OpcoesDoFundo): { segmentos: number; arcos: number } {
  const mm = o.mmPorUnidade;
  const u = plano.underlay;
  const px = (x: number) => (x * mm + o.dx - u.origemXMm) / u.mmPorPixel;
  const py = (y: number) => (u.origemYMm - (y * mm + o.dy)) / u.mmPorPixel;
  const passa = (camada: string) => !o.camadas || o.camadas.has(camada);
  const destaque = o.camadaDestaque ?? null;
  let segmentos = 0;
  let arcos = 0;
  ctx.lineCap = 'round';
  const tracar = (segs: SegmentoDxf[], arcs: ArcoDxf[], cor: string, largura: number) => {
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(px(s.a.x), py(s.a.y));
      ctx.lineTo(px(s.b.x), py(s.b.y));
      segmentos++;
    }
    for (const a of arcs) {
      // Y invertido: o arco anti-horário do DXF vira horário na imagem, e os ângulos trocam de sinal.
      const r = (a.raio * mm) / u.mmPorPixel;
      ctx.moveTo(px(a.centro.x) + r * Math.cos((-a.anguloInicial * Math.PI) / 180), py(a.centro.y) + r * Math.sin((-a.anguloInicial * Math.PI) / 180));
      ctx.arc(px(a.centro.x), py(a.centro.y), r, (-a.anguloInicial * Math.PI) / 180, (-a.anguloFinal * Math.PI) / 180, true);
      arcos++;
    }
    ctx.stroke();
  };
  const comuns = leitura.segmentos.filter((s) => passa(s.camada) && s.camada !== destaque);
  const comunsArcos = leitura.arcos.filter((a) => passa(a.camada) && a.camada !== destaque);
  // ⚠️ ESPESSURA EM MILÍMETROS DO MODELO, não em pixels. Um traço de 1 px numa imagem a 3,7 mm/px vira
  // 0,3 px na tela quando a planta inteira cabe no canvas — invisível, e foi o que a primeira prova
  // mostrou. 20 mm (30 na camada em destaque) é o traço de caneta 0,4 mm numa planta 1:50: se vê
  // enquadrado e não engorda no zoom além do que uma planta impressa tem.
  const largura = (mmDeTraco: number, minPx: number) => Math.max(minPx, mmDeTraco / u.mmPorPixel);
  tracar(comuns, comunsArcos, COR_DO_FUNDO, largura(20, 1.5));
  if (destaque) {
    tracar(leitura.segmentos.filter((s) => s.camada === destaque && passa(s.camada)), leitura.arcos.filter((a) => a.camada === destaque && passa(a.camada)), COR_DO_DESTAQUE, largura(30, 2));
  }
  return { segmentos, arcos };
}

/**
 * O PNG do fundo, no navegador. `null` quando não há traço ou o ambiente não
 * tem canvas 2D (teste sem DOM, navegador sem suporte) — nesse caso a
 * importação segue sem fundo, e o painel diz isso.
 */
export async function rasterizarDxf(leitura: Pick<LeituraDxf, 'segmentos' | 'arcos'>, o: OpcoesDoFundo): Promise<{ blob: Blob; plano: PlanoDoFundo; tracos: { segmentos: number; arcos: number } } | null> {
  const plano = planejarFundo(leitura, o);
  if (!plano) return null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = plano.larguraPx;
  canvas.height = plano.alturaPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tracos = desenharFundo(ctx, plano, leitura, o);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) return null;
  return { blob, plano, tracos };
}
