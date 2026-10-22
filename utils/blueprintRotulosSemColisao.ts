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
import { posicionarAnotacoes, type CaixaNaTela } from './blueprintAnotacaoSemColisao';

export type { CaixaNaTela };

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

/**
 * Posiciona os rótulos na ordem dada (o primeiro escolhe primeiro). `obstaculos`
 * são as caixas das peças (com o id do dono, para o rótulo não fugir da própria).
 */
export function posicionarRotulos(rotulos: readonly RotuloAPosicionar[], obstaculos: readonly { id: string; caixa: CaixaNaTela }[]): RotuloPosicionado[] {
  // 22/10/2026: o motor geral (blueprintAnotacaoSemColisao) faz isto e mais; aqui, só as posições
  // coladas (raio 0, sem chamada), com a prioridade na ordem dada.
  return posicionarAnotacoes(
    rotulos.map((r, i) => ({ id: r.id, donoId: r.id, largura: r.largura, altura: r.altura, ancora: r.caixa, prioridade: i })),
    obstaculos,
    { raioMaximo: 0 },
  ).map(({ id, x, y }) => ({ id, x, y }));
}
