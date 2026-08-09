/**
 * Cotas da planta.
 *
 * ─── O QUE COTAR É A DECISÃO, NÃO COMO DESENHAR ─────────────────────────────
 *
 * Cotar tudo é o mesmo que não cotar: a folha vira ilegível e ninguém confere.
 * A convenção de planta baixa resolve isso com CADEIAS: uma linha de cota
 * externa por direção, quebrada nos eixos de parede, mais a cota TOTAL por fora
 * dela. Quem lê soma a cadeia e confere contra o total — se não fecha, o desenho
 * está errado, e isso aparece sem precisar de ferramenta nenhuma.
 *
 * ─── COTA DE EIXO, E ISSO PRECISA ESTAR ESCRITO ─────────────────────────────
 *
 * As cotas saem dos EIXOS das paredes, porque é o eixo que o kernel conhece. Um
 * pedreiro que mede a face vai encontrar meia espessura a menos de cada lado.
 * Não é erro — é convenção, e é a mesma que o projeto estrutural usa. Mas cota
 * sem dizer de onde é medida é cota que engana, então a legenda declara.
 *
 * O desenho e o DXF consomem as mesmas cadeias: cota que diverge entre o papel e
 * o arquivo do CAD é pior que cota nenhuma.
 */

import type { BlueprintModel } from './blueprintKernel';

export interface SegmentoDeCota {
  /** Posição inicial e final ao longo do eixo cotado, em mm reais. */
  de: number;
  ate: number;
  /** Rótulo já formatado, em metros — a convenção brasileira em planta baixa. */
  rotulo: string;
}

export interface CadeiaDeCotas {
  eixo: 'X' | 'Y';
  segmentos: SegmentoDeCota[];
  /** Cota corrida por fora da cadeia. */
  total: SegmentoDeCota | null;
  /** Coordenada transversal onde a linha de cota fica, em mm reais. */
  posicaoMm: number;
}

/**
 * Metros com dois decimais e vírgula. `4000` → `"4,00"`.
 *
 * Arredonda METADE PARA CIMA à mão, e não por `toFixed`. Em ponto flutuante
 * 0,075 é guardado como 0,07499999…, e `toFixed(2)` devolve "0,07" — meio
 * centímetro a menos numa cota, sem aviso. É a mesma convenção do `roundToMm`
 * do kernel; divergir dela faria a cota discordar do quantitativo.
 */
export function rotuloDeCota(mm: number): string {
  const cm = Math.sign(mm) * Math.round(Math.abs(mm) / 10);
  return (cm / 100).toFixed(2).replace('.', ',');
}

/**
 * Coordenadas distintas que merecem cota.
 *
 * Só pontas de parede e de limite entram. Ponto de abertura NÃO entra: cotar
 * vão de porta na mesma cadeia da estrutura dobra o número de segmentos e é
 * outra cadeia no desenho técnico, mais perto da folha de esquadrias.
 */
function coordenadas(model: BlueprintModel, eixo: 'X' | 'Y'): number[] {
  const pegar = (p: { x: number; y: number }) => (eixo === 'X' ? p.x : p.y);
  const brutas = [
    ...model.walls.flatMap((w) => [pegar(w.a), pegar(w.b)]),
    ...model.boundaries.flatMap((b) => [pegar(b.a), pegar(b.b)]),
  ];
  return [...new Set(brutas)].sort((a, b) => a - b);
}

/**
 * Monta as duas cadeias, a partir dos eixos de parede.
 *
 * `folgaMm` afasta a linha de cota do desenho — em mm REAIS, porque tudo aqui
 * está no espaço do modelo. Quem converte para papel é o renderizador.
 */
export function cadeiasDeCotas(
  model: BlueprintModel,
  folgaMm = 0,
): { x: CadeiaDeCotas | null; y: CadeiaDeCotas | null } {
  const construir = (eixo: 'X' | 'Y'): CadeiaDeCotas | null => {
    const coords = coordenadas(model, eixo);
    if (coords.length < 2) return null;

    const transversal = eixo === 'X' ? coordenadas(model, 'Y') : coordenadas(model, 'X');
    // Cadeia de X vai ABAIXO do desenho; a de Y, à ESQUERDA.
    const posicaoMm = transversal[0] - folgaMm;

    const segmentos = coords.slice(0, -1).map((de, i) => ({
      de,
      ate: coords[i + 1],
      rotulo: rotuloDeCota(coords[i + 1] - de),
    }));

    const inicio = coords[0];
    const fim = coords[coords.length - 1];

    return {
      eixo,
      segmentos,
      // Com um segmento só, a cadeia JÁ É o total — repetir seria ruído.
      total:
        segmentos.length > 1
          ? { de: inicio, ate: fim, rotulo: rotuloDeCota(fim - inicio) }
          : null,
      posicaoMm,
    };
  };

  return { x: construir('X'), y: construir('Y') };
}

/**
 * A cadeia fecha contra o total?
 *
 * É a verificação que quem lê a planta faz somando os números na mão. Fazê-la
 * aqui também transforma um desenho errado em erro, em vez de folha impressa.
 */
export function cadeiaFecha(cadeia: CadeiaDeCotas): boolean {
  if (!cadeia.total) return true;
  const soma = cadeia.segmentos.reduce((s, seg) => s + (seg.ate - seg.de), 0);
  return soma === cadeia.total.ate - cadeia.total.de;
}

export const AVISO_COTA_DE_EIXO =
  'Cotas medidas no EIXO das paredes. A medida de face é menor em meia espessura de cada lado.';
