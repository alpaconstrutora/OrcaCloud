/**
 * A CHAVE do nó da rede entre pavimentos (`fazerChave`, utils/blueprintKernel/grafoDeRede.ts). PE6b do prédio pelo
 * Empreendimento (18/11/2026): o recalque do esgoto da Torre B do Garden sobe da garagem (−3) até a caixa na cota da rua,
 * atravessando o −2 (o tipo) e o −1 (cópia) — onde nada pode ser desenhado. O trecho do lote desce com cota bem negativa;
 * a ponta dele tem de ser o mesmo nó que o topo do trecho da garagem, três pavimentos abaixo.
 */
import { describe, expect, it } from 'vitest';
import type { Level } from '../utils/blueprintKernel';
import { fazerChave } from '../utils/blueprintGrafoDeRede';

const nivel = (id: string, elevationMm: number): Level => ({ id, uid: id, name: id, elevationMm, defaultHeightMm: 3000 }) as Level;

describe('fazerChave — a cota abaixo do piso desce quantos pavimentos ela pedir', () => {
  const niveis = [nivel('lote', 0), nivel('m1', -3000), nivel('m2', -6000), nivel('g3', -9000)];
  const chave = fazerChave(niveis);

  it('cota ≤ 0 é o teto do de baixo (como sempre)', () => {
    expect(chave('lote', 10, 20, 0)).toBe(chave('m1', 10, 20, 3000));
    expect(chave('lote', 10, 20, -150)).toBe(chave('m1', 10, 20, 2850));
  });

  it('cota mais funda que o pavimento de baixo continua descendo: −6000 no lote é o teto da garagem do −3', () => {
    expect(chave('lote', 10, 20, -6000)).toBe(chave('g3', 10, 20, 3000));
    expect(chave('lote', 10, 20, -4500)).toBe(chave('m2', 10, 20, 1500));
  });

  it('no pavimento mais baixo, a cota negativa fica nele (não há para onde descer)', () => {
    expect(chave('g3', 10, 20, -600)).toBe('-9000|10,20|-600');
  });

  // PE7 (18/11/2026): duas torres no mesmo estudo têm pavimentos na MESMA cota (a garagem −1 da Torre A e o −1 da Torre
  // B, a −3 m). O mesmo ponto físico visto de um ou de outro é o mesmo nó — senão o coletor da B, que desce do lote até a
  // ligação da A, ficava solto conforme o pavimento que a descida escolhesse.
  it('dois pavimentos na mesma cota: o mesmo ponto (x, y, cota) é o mesmo nó, e a descida do lote cai nele', () => {
    const niveis2 = [nivel('lote', 0), nivel('garagemA', -3000), nivel('copiaB', -3000)];
    const ch = fazerChave(niveis2);
    expect(ch('garagemA', 10, 20, 1500)).toBe(ch('copiaB', 10, 20, 1500));
    expect(ch('lote', 10, 20, -1500)).toBe(ch('garagemA', 10, 20, 1500));
  });

  // PE7 (revisão): o cavalete fica no pavimento MAIS BAIXO, com a cota da rua acima dele (600 mm acima do 0) — na Torre A
  // o −2 a 6600, na Torre B o −4 a 12600. O mesmo ponto físico: a cota acima do pé-direito SOBE de pavimento.
  it('cota acima do pé-direito sobe ao pavimento de cima: 12600 no −4 é 600 no 0, como 6600 no −2', () => {
    const niveis3 = [nivel('lote', 0), nivel('m1', -3000), nivel('m2', -6000), nivel('m3', -9000), nivel('m4', -12000)];
    const ch = fazerChave(niveis3);
    expect(ch('m4', 1, 2, 12600)).toBe(ch('lote', 1, 2, 600));
    expect(ch('m2', 1, 2, 6600)).toBe(ch('lote', 1, 2, 600));
    // No pavimento mais alto, a cota acima do pé-direito fica nele (não há para onde subir).
    expect(ch('lote', 1, 2, 4000)).toBe('0|1,2|4000');
  });

  // PE8a (19/11/2026): duas torres com pé-direito DIFERENTE — a garagem da A no −2700 (2700) e o −1 da B no −2880
  // (2880). Do 0 (o lote, os térreos) a descida tem de ir ao pavimento da torre em que o ponto está: a pegada desempata
  // entre os vizinhos de baixo (os que chegam até esta laje), sem pular para um mais fundo.
  it('pé-direito diferente entre torres: a pegada escolhe o pavimento de baixo da torre do ponto', () => {
    const niveis4 = [nivel('lote', 0), { ...nivel('garA', -2700), defaultHeightMm: 2700 }, { ...nivel('m1B', -2880), defaultHeightMm: 2880 }, nivel('fundo', -6000)];
    const pegadas = new Map([
      ['garA', { x0: 0, y0: 0, x1: 10000, y1: 10000 }],
      ['m1B', { x0: 20000, y0: 0, x1: 30000, y1: 10000 }],
      ['fundo', { x0: 0, y0: 0, x1: 30000, y1: 10000 }],
    ]);
    const ch = fazerChave(niveis4, pegadas);
    expect(ch('lote', 25000, 5, -150)).toBe(ch('m1B', 25000, 5, 2730));
    expect(ch('lote', 5000, 5, -150)).toBe(ch('garA', 5000, 5, 2550));
    // Fora de toda pegada: o de sempre (o mais perto abaixo) — e nunca o mais fundo, mesmo contendo o ponto.
    expect(ch('lote', 15000, 5, -150)).toBe(ch('garA', 15000, 5, 2550));
  });
});

