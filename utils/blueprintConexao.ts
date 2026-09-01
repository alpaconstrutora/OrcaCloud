import type { Point } from './blueprintKernel';

/**
 * CONEXÃO AUTOMÁTICA — o ponto que anda gruda no ponto que está parado.
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * Usuário, 31/08/2026: *"vamos implementar snap. quando um circulo se aproximar
 * de outro, Fazer conexão automatica"*. Os "círculos" são os pontos de conexão
 * que a peça de concreto desenha quando está selecionada
 * (`pontosDeConexaoEstrutural`): as pontas do eixo e os cantos do corpo.
 *
 * ─── POR QUE ISSO NÃO É O ÍMÃ QUE JÁ EXISTIA ────────────────────────────────
 *
 * O `capturar` do canvas encaixa o CURSOR: ele responde "que ponto eu estou
 * apontando?". Serve para desenhar, onde o que nasce nasce debaixo do ponteiro.
 *
 * Arrastando uma peça pronta, a pergunta é outra — "que ponto DELA está perto
 * de que ponto de outra?" —, e o cursor não tem nada a ver com a resposta:
 * quem agarra uma viga pelo meio para encostá-la num pilar está com o ponteiro
 * a um metro de qualquer canto. Encaixar o cursor ali não aproximaria as duas
 * peças de nada. Por isso a conta é entre CONJUNTOS de pontos, e o que sai dela
 * é uma correção do DESLOCAMENTO.
 *
 * ─── POR QUE SÓ SERVE PARA TRANSLAÇÃO ───────────────────────────────────────
 *
 * A correção é um vetor somado ao delta do arraste, e isso só faz dois pontos
 * coincidirem porque a peça inteira anda RÍGIDA: os cantos guardam a mesma
 * relação com o eixo antes e depois. Arrastar UM vértice é outro problema —
 * mover a ponta de uma viga gira a seção, e os cantos daquele lado se deslocam
 * de um jeito que não é a translação do vértice. Encostar um canto num ponto
 * ali seria resolver equação não linear, e um "quase coincidente" não serve
 * para nada: o valor inteiro da conexão é a coincidência EXATA.
 */

export interface ConexaoEncaixada {
  /** Onde os dois pontos se encontram, já no destino. */
  em: Point;
  /** O ponto parado que atraiu — o mesmo `em`, pela definição de coincidir. */
  alvo: Point;
  /** Quanto somar ao deslocamento para eles coincidirem. */
  correcao: Point;
  /** A que distância os dois estavam ANTES da correção, em mm. */
  distanciaMm: number;
}

/**
 * O melhor encontro entre os pontos que andam e os que ficam.
 *
 * `null` = nenhum par dentro da tolerância; o deslocamento segue como estava.
 *
 * ─── O MAIS PRÓXIMO GANHA, E SÓ ELE ─────────────────────────────────────────
 *
 * Um par só. Duas correções não se somam — a segunda desfaria a primeira —, e
 * escolher "o par que alinha mais pontos de uma vez" premiaria a peça grande:
 * uma laje encostaria por quatro cantos ao mesmo tempo e ganharia de um pilar
 * que estava a 2 mm do lugar certo. A distância é o critério porque é o que o
 * usuário está enxergando na tela.
 *
 * ─── A TOLERÂNCIA VEM EM MILÍMETRO, MAS NASCE EM PIXEL ──────────────────────
 *
 * Quem chama converte: `SNAP_PX / escala`. É o mesmo raio do ímã do cursor, e é
 * em pixel porque "perto" é o que o olho vê — a 1:200 dois pontos a 20 cm são o
 * mesmo ponto na tela, e a 1:20 não são.
 */
export function encaixarConexao(
  pontosQueAndam: Point[],
  delta: Point,
  pontosParados: Point[],
  toleranciaMm: number,
): ConexaoEncaixada | null {
  if (pontosQueAndam.length === 0 || pontosParados.length === 0) return null;

  let melhor: ConexaoEncaixada | null = null;

  for (const p of pontosQueAndam) {
    const x = p.x + delta.x;
    const y = p.y + delta.y;
    for (const q of pontosParados) {
      const dx = q.x - x;
      const dy = q.y - y;
      const d = Math.hypot(dx, dy);
      if (d > toleranciaMm) continue;
      if (melhor && d >= melhor.distanciaMm) continue;
      melhor = {
        em: { x: q.x, y: q.y },
        alvo: { x: q.x, y: q.y },
        // Arredondado: o kernel só aceita coordenada em milímetro INTEIRO, e um
        // delta fracionário deixaria a coincidência a 0,4 mm de distância —
        // invisível na tela e o bastante para o ponto não ser o mesmo ponto.
        correcao: { x: Math.round(dx), y: Math.round(dy) },
        distanciaMm: d,
      };
    }
  }

  return melhor;
}
