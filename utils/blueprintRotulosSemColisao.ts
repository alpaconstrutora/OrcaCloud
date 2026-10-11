/**
 * Onde escrever o RÓTULO de uma peça sem cobrir outra coisa (11/10/2026, teste do
 * usuário no app real: "EV-1" encostado em "SF-1", "CD-1" por cima do desenho da
 * condensadora).
 *
 * O canvas escrevia a sigla a meio "raio" do centro — e o raio era a MENOR medida
 * da peça: numa peça comprida (a evaporadora, 90 × 22 cm) o texto caía em cima
 * dela. Agora o rótulo sai FORA da caixa da peça, na primeira posição livre de
 * outros rótulos e de outras peças; sem nenhuma livre, a primeira (a de sempre:
 * acima, à direita).
 *
 * Em pixels de TELA (y para baixo). Puro — o canvas só desenha o que sai daqui.
 */
export interface CaixaNaTela {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RotuloAPosicionar {
  id: string;
  largura: number;
  altura: number;
  /** A caixa da peça dona do rótulo. */
  caixa: CaixaNaTela;
}

/** O canto superior esquerdo do texto. */
export interface RotuloPosicionado {
  id: string;
  x: number;
  y: number;
}

const FOLGA_PX = 3;

const cruza = (a: CaixaNaTela, b: CaixaNaTela) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** As posições candidatas, na ordem de preferência: os quatro cantos de fora, depois acima, abaixo e dos lados. */
function candidatas(r: RotuloAPosicionar): { x: number; y: number }[] {
  const { x0, y0, x1, y1 } = r.caixa;
  const w = r.largura;
  const h = r.altura;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [
    { x: x1 + FOLGA_PX, y: y0 - h }, // acima, à direita (o lugar de sempre, na diagonal da caixa)
    { x: x0 - FOLGA_PX - w, y: y0 - h }, // acima, à esquerda
    { x: x1 + FOLGA_PX, y: y1 }, // abaixo, à direita
    { x: x0 - FOLGA_PX - w, y: y1 }, // abaixo, à esquerda
    { x: cx - w / 2, y: y0 - h - FOLGA_PX }, // acima, no meio
    { x: cx - w / 2, y: y1 + FOLGA_PX }, // abaixo, no meio
    { x: x1 + FOLGA_PX, y: cy - h / 2 }, // à direita, no meio
    { x: x0 - FOLGA_PX - w, y: cy - h / 2 }, // à esquerda, no meio
  ];
}

/**
 * Posiciona os rótulos na ordem dada (o primeiro escolhe primeiro). `obstaculos`
 * são as caixas das peças (com o id do dono, para o rótulo não fugir da própria).
 */
export function posicionarRotulos(rotulos: readonly RotuloAPosicionar[], obstaculos: readonly { id: string; caixa: CaixaNaTela }[]): RotuloPosicionado[] {
  const postos: CaixaNaTela[] = [];
  const saida: RotuloPosicionado[] = [];
  for (const r of rotulos) {
    const opcoes = candidatas(r);
    const livre = opcoes.find((p) => {
      const caixa = { x0: p.x, y0: p.y, x1: p.x + r.largura, y1: p.y + r.altura };
      return !postos.some((q) => cruza(caixa, q)) && !obstaculos.some((o) => o.id !== r.id && cruza(caixa, o.caixa)) && !cruza(caixa, r.caixa);
    });
    const p = livre ?? opcoes[0];
    postos.push({ x0: p.x, y0: p.y, x1: p.x + r.largura, y1: p.y + r.altura });
    saida.push({ id: r.id, x: p.x, y: p.y });
  }
  return saida;
}
