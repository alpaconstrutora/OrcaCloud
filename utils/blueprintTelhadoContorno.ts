/**
 * "GERAR DO CONTORNO DO PAVIMENTO" — a água única que cobre a casa inteira, com
 * beiral, sem desenhar vértice por vértice.
 *
 * ─── O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────────
 *
 * É um ATALHO DE DESENHO: pega o contorno externo do nível (pelo EIXO das
 * paredes) e o expande para a FACE mais o beiral. O resultado é UM polígono —
 * uma água só, plana ou de caimento único — que o usuário depois inclina,
 * divide ou ajusta. Não é gerador de telhado: quem quer duas águas desenha a
 * segunda (ou duplica e move vértices). Ver o cabeçalho de `telhado.ts` para
 * por que o esqueleto reto ficou de fora.
 *
 * ─── DO EIXO À FACE, LADO A LADO ────────────────────────────────────────────
 *
 * `contornoExternoDoNivel` devolve o anel pelo EIXO das paredes. O beiral se
 * mede da FACE externa, então cada lado precisa recuar (para fora) meia
 * espessura DA PAREDE DAQUELE LADO mais o beiral. Uma casa com fachada de 20 cm
 * e divisórias externas de 15 não pode usar uma meia espessura só — o beiral
 * sairia 2,5 cm mais curto num lado e ninguém veria.
 *
 * O lado do anel é casado com a parede pelo PONTO MÉDIO: está sobre o eixo de
 * qual parede? `anelRecuado` já faz a mitra dos cantos com recuos diferentes por
 * lado — é a mesma função do envelope do lote, com o sinal trocado.
 *
 * Quando o ponto médio não cai em parede nenhuma (aresta do contorno que veio
 * de uma divisa `DIVISA`, ou empate de tolerância), vale a MEDIANA das
 * espessuras do nível — não zero, que produziria um beiral curto exatamente na
 * aresta que já era a exceção.
 */

import {
  anelRecuado,
  contornoExternoDoNivel,
  DEFAULT_TOLERANCE_MM,
  envelopeValido,
  type BlueprintModel,
  type Level,
  type Point,
  type Wall,
} from './blueprintKernel';

/** Distância de um ponto ao segmento `a→b`, em mm. */
function distanciaAoSegmento(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comp2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 150;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

/**
 * A meia espessura de cada LADO do anel, pela parede cujo eixo o contém.
 *
 * Exportada para o teste conferir o casamento sem passar pela mitra.
 */
export function meiaEspessuraPorLado(anel: Point[], paredes: Wall[]): number[] {
  const padrao = mediana(paredes.map((w) => w.thicknessMm)) / 2;
  const n = anel.length;
  return anel.map((a, i) => {
    const b = anel[(i + 1) % n];
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let melhor: Wall | null = null;
    let menor = Infinity;
    for (const w of paredes) {
      const d = distanciaAoSegmento(w.a, w.b, meio);
      if (d <= DEFAULT_TOLERANCE_MM && d < menor) {
        menor = d;
        melhor = w;
      }
    }
    return melhor ? melhor.thicknessMm / 2 : padrao;
  });
}

export interface ContornoParaTelhado {
  /** O polígono da água: face externa + beiral, cantos mitrados. */
  pontos: Point[];
  /**
   * `false` quando o recuo negativo virou o anel do avesso — só acontece com
   * beiral absurdo num contorno minúsculo, mas quando acontece o polígono não
   * significa nada e não deve virar água.
   */
  valido: boolean;
}

/**
 * Um polígono de telhado por componente conexo do nível: casa e edícula soltas
 * dão dois contornos, e fundi-los cobriria o quintal entre elas.
 *
 * `beiralMm` é a distância da FACE da parede à ponta da telha, em mm. Zero é
 * legítimo (platibanda): a água nasce exatamente na face.
 */
export function contornosParaTelhado(
  model: BlueprintModel,
  level: Level,
  beiralMm: number,
): ContornoParaTelhado[] {
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  return contornoExternoDoNivel(model, level)
    .filter((anel) => anel.length >= 3)
    .map((anel) => {
      const meias = meiaEspessuraPorLado(anel, paredes);
      // NEGATIVO: `anelRecuado` recua para DENTRO por contrato; para fora é o
      // mesmo cálculo com o sinal trocado — a mitra não distingue.
      const recuos = meias.map((meia) => -(meia + beiralMm));
      const pontos = anelRecuado(anel, recuos);
      return {
        pontos,
        valido: pontos.length >= 3 && envelopeValido(anel, pontos),
      };
    });
}
