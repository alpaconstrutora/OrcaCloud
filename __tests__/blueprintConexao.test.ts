/**
 * CONEXÃO AUTOMÁTICA entre pontos de conexão — a regra pura.
 *
 * Pedido do usuário (31/08/2026): *"vamos implementar snap. quando um circulo se
 * aproximar de outro, Fazer conexão automatica"*.
 *
 * O que este arquivo fixa é a decisão: QUAL par grudou e QUANTO o deslocamento
 * teve de mudar. Que o arraste de verdade chegue lá é pergunta de pixel, e vive
 * no harness `docs/spikes/conexao-automatica/`.
 */
import { describe, expect, it } from 'vitest';
import { encaixarConexao } from '../utils/blueprintConexao';

const p = (x: number, y: number) => ({ x, y });

describe('conexão · nada perto, nada acontece', () => {
  it('devolve null quando o par mais próximo está fora da tolerância', () => {
    const r = encaixarConexao([p(0, 0)], p(100, 0), [p(1000, 0)], 240);
    expect(r).toBeNull();
  });

  it('devolve null quando um dos lados está vazio', () => {
    // Peça sozinha em cena, ou seleção sem concreto nenhum: sem os dois lados
    // não há o que conectar, e o deslocamento tem de seguir intocado.
    expect(encaixarConexao([], p(0, 0), [p(0, 0)], 240)).toBeNull();
    expect(encaixarConexao([p(0, 0)], p(0, 0), [], 240)).toBeNull();
  });
});

describe('conexão · a correção faz os dois COINCIDIREM', () => {
  it('soma ao deslocamento exatamente o que falta', () => {
    // O arraste levou o ponto a (4800, 4750); o alvo está em (4800, 4800).
    const r = encaixarConexao([p(4000, 3150)], p(800, 1600), [p(4800, 4800)], 240);
    expect(r).not.toBeNull();
    expect(r!.correcao).toEqual({ x: 0, y: 50 });
    expect(r!.em).toEqual({ x: 4800, y: 4800 });

    // O ponto de conexão, deslocado pelo delta JÁ CORRIGIDO, tem de cair em cima
    // do alvo — coincidência exata é o valor inteiro da conexão. "Quase" não
    // fecha contorno, não amarra pilar com viga e não some da conferência.
    const delta = { x: 800 + r!.correcao.x, y: 1600 + r!.correcao.y };
    expect({ x: 4000 + delta.x, y: 3150 + delta.y }).toEqual({ x: 4800, y: 4800 });
  });

  it('arredonda a correção para milímetro inteiro', () => {
    // O kernel recusa coordenada fracionária; um delta com 0,4 mm deixaria a
    // coincidência a meio milímetro — invisível na tela e o bastante para o
    // ponto não ser o mesmo ponto.
    const r = encaixarConexao([p(0, 0)], p(0, 0), [p(10.4, -3.6)], 240);
    expect(r!.correcao).toEqual({ x: 10, y: -4 });
  });
});

describe('conexão · o par MAIS PRÓXIMO ganha, e só ele', () => {
  it('escolhe pela distância, não pela ordem das listas', () => {
    const r = encaixarConexao(
      [p(0, 0), p(1000, 0)],
      p(0, 0),
      // O primeiro da lista está a 200; o segundo, a 30.
      [p(200, 0), p(1030, 0)],
      240,
    );
    expect(r!.em).toEqual({ x: 1030, y: 0 });
    expect(r!.correcao).toEqual({ x: 30, y: 0 });
  });

  it('não soma duas correções — a segunda desfaria a primeira', () => {
    // Dois pares dentro da tolerância, em direções opostas. Uma peça rígida não
    // pode encostar nos dois: o resultado tem de ser UM vetor, o do par mais
    // próximo (30 mm), e não a soma dos dois (que não encostaria em nenhum).
    const r = encaixarConexao([p(0, 0), p(1000, 0)], p(0, 0), [p(-100, 0), p(1030, 0)], 240);
    expect(r!.correcao).toEqual({ x: 30, y: 0 });
  });
});
