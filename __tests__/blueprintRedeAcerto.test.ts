/**
 * Selecionar instalação com o cursor (09/09/2026).
 *
 * ─── O DEFEITO, ACHADO NO USO ───────────────────────────────────────────────
 *
 * "os componentes elétrica e hidráulica, parece que não consigo selecioná-los e
 * não consigo movê-los."
 *
 * ⚠️ E a causa não era o mover. `TranslateEntities` já aceitava
 * `trechoIds`/`terminalIds`/`quadroIds`, o `Delete` já emitia `DeleteTrecho` e
 * companhia, o painel de propriedades já existia — **tudo o que vem depois da
 * seleção estava pronto, e a seleção nunca acontecia**: a cadeia de acerto do
 * clique testava abertura, limite, estrutura, escada, parede, água, medição e
 * corte, e nenhuma das quatro famílias de rede.
 *
 * A lição, que vale mais que a correção: uma família nova precisa de DUAS
 * ligações — a que a desenha e a que a alcança. A primeira é visível na hora, e
 * a segunda só falha quando alguém tenta usar.
 */
import { describe, expect, it } from 'vitest';
import { quadroSob, terminalSob, trechoSob } from '../utils/blueprintRede';

const ALCANCE = 100; // mm — o equivalente a 8 px numa escala qualquer

const ponto = (id: string, x: number, y: number) => ({ id, at: { x, y } });
const linha = (id: string, ax: number, ay: number, bx: number, by: number) => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

describe('acerto do cursor · QUADRO e TERMINAL', () => {
  it('pega o que está sob o cursor e ignora o que está longe', () => {
    const quadros = [ponto('q1', 1000, 1000), ponto('q2', 5000, 5000)];
    expect(quadroSob(quadros, { x: 1050, y: 1000 }, ALCANCE)?.id).toBe('q1');
    expect(quadroSob(quadros, { x: 5000, y: 5030 }, ALCANCE)?.id).toBe('q2');
    expect(quadroSob(quadros, { x: 3000, y: 3000 }, ALCANCE)).toBeNull();
  });

  it('a borda conta, e um passo além não', () => {
    // ⚠️ O terceiro argumento é FOLGA de clique, e não o alcance inteiro: desde
    // 09/09 a peça tem medidas e é desenhada em escala, então o que se pega é a
    // PEGADA mais a folga. Enquanto o quadro era um símbolo de 9 px os dois
    // eram a mesma coisa; com a caixa em escala, um quadro de 400 mm só seria
    // pego perto do centro — "não consigo selecionar" pela outra ponta.
    const q = [{ ...ponto('q1', 0, 0), larguraMm: 400, profundidadeMm: 200 }];
    expect(quadroSob(q, { x: 200 + ALCANCE, y: 0 }, ALCANCE)?.id).toBe('q1');
    expect(quadroSob(q, { x: 200 + ALCANCE + 1, y: 0 }, ALCANCE)).toBeNull();
  });

  it('⚠️ o desenhado POR CIMA vence — é o que a ordem de desenho promete ao olho', () => {
    // Dois pontos no mesmo lugar acontece: a tomada duplicada por engano, ou o
    // terminal encaixado exatamente sobre outro. Devolver o de baixo faria o
    // clique selecionar o que está escondido.
    const empilhados = [ponto('debaixo', 0, 0), ponto('emcima', 0, 0)];
    expect(terminalSob(empilhados, { x: 0, y: 0 }, ALCANCE)?.id).toBe('emcima');
  });

  it('lista vazia devolve nulo, não estoura', () => {
    expect(terminalSob([], { x: 0, y: 0 }, ALCANCE)).toBeNull();
  });
});

describe('acerto do cursor · TRECHO', () => {
  it('pega pelo meio do traço, e não só pelas pontas', () => {
    const t = [linha('t1', 0, 0, 10000, 0)];
    expect(trechoSob(t, { x: 5000, y: 40 }, ALCANCE)?.id).toBe('t1');
  });

  it('⚠️ a PRUMADA é clicável — as duas pontas no MESMO ponto em planta', () => {
    // O caso que quebra a implementação ingênua. Uma conta de distância a
    // segmento sem tratar o degenerado devolve NaN, e `NaN <= alcance` é falso:
    // o trecho MAIS COMUM de uma instalação seria o único inclicável, e sem
    // erro nenhum na tela.
    const prumada = [linha('p1', 3000, 2000, 3000, 2000)];
    expect(trechoSob(prumada, { x: 3000, y: 2000 }, ALCANCE)?.id).toBe('p1');
    expect(trechoSob(prumada, { x: 3060, y: 2000 }, ALCANCE)?.id).toBe('p1');
    expect(trechoSob(prumada, { x: 3200, y: 2000 }, ALCANCE)).toBeNull();
  });

  it('não pega o prolongamento da reta além da ponta', () => {
    // Sem o `clamp` do parâmetro, a distância medida seria à RETA infinita e o
    // clique a dez metros do fim do cano o selecionaria.
    const t = [linha('t1', 0, 0, 1000, 0)];
    expect(trechoSob(t, { x: 10000, y: 0 }, ALCANCE)).toBeNull();
  });

  it('o traço de cima vence quando dois se cruzam', () => {
    const cruzados = [linha('debaixo', -1000, 0, 1000, 0), linha('emcima', 0, -1000, 0, 1000)];
    expect(trechoSob(cruzados, { x: 0, y: 0 }, ALCANCE)?.id).toBe('emcima');
  });

  it('⚠️ o alcance é o MESMO em qualquer escala — quem chama converte de pixels', () => {
    // O símbolo tem tamanho fixo na tela. Com um alcance fixo em milímetros, o
    // zoom afastado pegaria metros de área e o zoom perto pegaria menos que o
    // próprio desenho; nos dois o clique deixaria de casar com o que se vê.
    const t = [linha('t1', 0, 0, 1000, 0)];
    const HIT_PX = 8;
    for (const escala of [0.01, 0.1, 1]) {
      const alcance = HIT_PX / escala;
      // Um ponto a 7 px do traço acerta em QUALQUER escala…
      expect(trechoSob(t, { x: 500, y: 7 / escala }, alcance)?.id, `escala ${escala}`).toBe('t1');
      // …e um a 9 px não acerta em nenhuma.
      expect(trechoSob(t, { x: 500, y: 9 / escala }, alcance), `escala ${escala}`).toBeNull();
    }
  });
});
