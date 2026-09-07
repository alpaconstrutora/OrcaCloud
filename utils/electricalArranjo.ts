// utils/electricalArranjo.ts
//
// O editor elétrico passa a usar O MESMO motor de arranjo planar da Planta
// Inteligente. Este arquivo é a ponte — e é fino de propósito.
//
// ─── POR QUE HAVIA DOIS, E POR QUE O SEGUNDO SAI ─────────────────────────────
//
// `utils/geometry/roomDetection.ts` (232 linhas, ZERO testes) era um segundo
// motor de arranjo planar: extrair segmentos, fundir vértices próximos, ordenar
// vizinhos por ângulo, percorrer faces pela regra da mão direita. Mesma família
// de algoritmo de `blueprintKernel/arrangement.ts`.
//
// Dois motores para a mesma pergunta já seriam ruim. Mas o segundo era PIOR de
// cinco jeitos, e quatro deles estavam escritos nos comentários dele:
//
//   1. NÃO partia segmentos que se cruzam — o próprio comentário admitia que
//      "users generally draw segments connecting at endpoints". Parede que
//      morre no MEIO de outra não gerava nó, e o ambiente não fechava;
//   2. o sinal da área foi ADIVINHADO, com um `area > 500` mágico em pixel²;
//   3. a busca de vértice era O(n) dentro de laço — O(n²) nas pontas;
//   4. a tolerância era 5 PIXELS, então o resultado dependia do zoom da planta;
//   5. e a comparação de ambientes era por área e centroide, que não é
//      identidade: um L e o seu espelho passavam por iguais.
//
// ─── A ÚNICA PARTE DIFÍCIL É A UNIDADE ──────────────────────────────────────
//
// O elétrico desenha em PIXELS de uma imagem; o kernel exige milímetro INTEIRO
// e limita coordenada a ±1.000.000. O fator abaixo é o que traduz um no outro —
// e ele decide, de quebra, o que conta como "a mesma ponta".

import {
  DEFAULT_TOLERANCE_MM,
  emptyModel,
  novoUid,
  recomputeSpaces,
  type BlueprintModel,
  type Wall,
} from './blueprintKernel';

/** O mínimo que esta conta precisa saber de uma parede do elétrico. */
export interface ParedeDoEletrico {
  /** Polilinha achatada: `[x0, y0, x1, y1, …]`, em pixels. */
  points: unknown;
}

/**
 * Quantas unidades do kernel vale UM PIXEL.
 *
 * ⚠️ Não é enfeite: é ele que fixa a tolerância efetiva. O kernel funde pontas a
 * menos de `DEFAULT_TOLERANCE_MM` (5) uma da outra; com 10 unidades por pixel,
 * isso vira meio pixel. O motor antigo fundia a 5 PIXELS — dez vezes mais
 * frouxo —, e é por isso que ele juntava cantos que o desenhista tinha separado
 * de propósito.
 *
 * Dez, e não mil: a coordenada do kernel é limitada a ±1.000.000, e uma planta
 * de 5.000 px de largura já ocupa 50.000. Mil estouraria o limite e a detecção
 * inteira seria recusada.
 */
export const UNIDADES_POR_PIXEL = 10;

/** Meio pixel, que é a tolerância efetiva — documentada para quem for ajustar. */
export const TOLERANCIA_EM_PIXEL = DEFAULT_TOLERANCE_MM / UNIDADES_POR_PIXEL;

/** Espessura nominal das paredes sintéticas. O arranjo usa o EIXO; ela não muda o anel. */
const ESPESSURA = 100;
const ALTURA = 2800;

const paraKernel = (v: number) => Math.round(v * UNIDADES_POR_PIXEL);
const paraPixel = (v: number) => v / UNIDADES_POR_PIXEL;

/**
 * Um modelo do kernel montado a partir das paredes do elétrico.
 *
 * Sintético e descartável: existe para o arranjo rodar, e nada dele é gravado.
 * A polilinha vira um trecho por lado, como o kernel espera — ele não tem
 * parede de vários vértices.
 */
export function modeloSinteticoDoEletrico(paredes: ParedeDoEletrico[]): BlueprintModel {
  const model = emptyModel();
  model.levels = [
    { id: 'lvl_0001', uid: novoUid(), name: 'Elétrico', elevationMm: 0, defaultHeightMm: ALTURA },
  ];

  const walls: Wall[] = [];
  for (const parede of paredes) {
    const pts = parede.points;
    if (!Array.isArray(pts) || pts.length < 4) continue;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const a = { x: paraKernel(Number(pts[i])), y: paraKernel(Number(pts[i + 1])) };
      const b = { x: paraKernel(Number(pts[i + 2])), y: paraKernel(Number(pts[i + 3])) };
      if (!Number.isFinite(a.x) || !Number.isFinite(b.y)) continue;
      if (a.x === b.x && a.y === b.y) continue;
      walls.push({
        id: `wal_${String(walls.length + 1).padStart(5, '0')}`,
        uid: novoUid(),
        levelId: 'lvl_0001',
        a,
        b,
        thicknessMm: ESPESSURA,
        heightMm: ALTURA,
      });
    }
  }
  model.walls = walls;
  return model;
}

/**
 * Os ambientes que as paredes fecham, em PIXELS.
 *
 * Cada anel volta como polilinha achatada e FECHADA (`[x0,y0,…,x0,y0]`), que é o
 * formato que `OpuraElectricalRoom.polygonPoints` já usa — o adaptador não
 * inventa contrato novo do lado do elétrico.
 */
export function ambientesDoEletrico(paredes: ParedeDoEletrico[]): number[][] {
  const model = recomputeSpaces(modeloSinteticoDoEletrico(paredes));
  return (model.spaces ?? []).map((espaco) => {
    const plano: number[] = [];
    for (const p of espaco.ring) plano.push(paraPixel(p.x), paraPixel(p.y));
    // Fecha o anel repetindo o primeiro ponto: é como o elétrico grava hoje.
    if (espaco.ring.length > 0) {
      plano.push(paraPixel(espaco.ring[0].x), paraPixel(espaco.ring[0].y));
    }
    return plano;
  });
}

/**
 * Dois anéis descrevem o MESMO ambiente?
 *
 * ⚠️ Isto substitui `arePolygonsSimilar`, que comparava ÁREA e CENTROIDE. Aquilo
 * não é identidade: um L e o seu espelho têm a mesma área e o mesmo centroide, e
 * passavam por iguais — então um ambiente novo deixava de ser detectado, em
 * silêncio.
 *
 * Aqui a comparação é do CONJUNTO DE VÉRTICES, com a tolerância do arranjo. Dois
 * anéis iguais podem começar em vértices diferentes e girar em sentidos opostos,
 * e continuam sendo o mesmo cômodo — por isso a comparação é por conjunto, e não
 * por sequência.
 */
export function mesmoAmbiente(a: number[], b: number[], toleranciaPx = TOLERANCIA_EM_PIXEL): boolean {
  const vertices = (plano: number[]) => {
    const saida: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < plano.length; i += 2) saida.push({ x: plano[i], y: plano[i + 1] });
    // O anel fechado repete o primeiro ponto no fim; ele não conta duas vezes.
    if (saida.length > 1) {
      const p = saida[0];
      const u = saida[saida.length - 1];
      if (Math.abs(p.x - u.x) <= toleranciaPx && Math.abs(p.y - u.y) <= toleranciaPx) saida.pop();
    }
    return saida;
  };

  const va = vertices(a);
  const vb = vertices(b);
  if (va.length === 0 || va.length !== vb.length) return false;

  const usados = new Set<number>();
  for (const p of va) {
    const i = vb.findIndex(
      (q, k) => !usados.has(k) && Math.abs(p.x - q.x) <= toleranciaPx && Math.abs(p.y - q.y) <= toleranciaPx,
    );
    if (i === -1) return false;
    usados.add(i);
  }
  return true;
}

/** Os ambientes que as paredes fecham e que ainda não estão cadastrados. */
export function ambientesNovos(
  paredes: ParedeDoEletrico[],
  existentes: { polygonPoints?: number[] | null }[],
): number[][] {
  const achados = ambientesDoEletrico(paredes);
  return achados.filter(
    (anel) => !existentes.some((r) => r.polygonPoints && mesmoAmbiente(anel, r.polygonPoints)),
  );
}
