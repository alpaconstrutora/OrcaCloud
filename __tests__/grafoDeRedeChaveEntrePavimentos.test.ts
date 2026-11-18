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
    expect(chave('g3', 10, 20, -600)).toBe('g3|10,20|-600');
  });
});
