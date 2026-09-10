/**
 * O eletroduto segue a parede, o teto ou o piso (10/09/2026).
 *
 * *"na planta 3D o eletroduto deve ser representado seguindo a parede, teto ou
 * piso"* — e mais: o nome "eletroduto", e o Ø e o sobe/desce da NBR 5410.
 *
 * ─── ⚠️ O QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * Um trecho de (a, 300) a (b, 2800) saía como uma DIAGONAL no espaço: um tubo
 * atravessando o cômodo em linha reta da tomada à luminária, no ar. Eletroduto
 * embutido sobe pela parede e corre pela laje — sempre em "L".
 *
 * ─── ⚠️ E O QUE QUASE FICOU ERRADO POR EXCESSO ──────────────────────────────
 *
 * Apliquei o "L" às quatro disciplinas. O esgoto com caimento é uma diagonal
 * DE VERDADE — o cano corre inclinado, é assim que escoa —, e os testes do
 * caimento de 2 % em 10 m pegaram na hora. O "L" é só do eletroduto.
 */
import { describe, expect, it } from 'vitest';
import { point } from '../utils/blueprintKernel';
import {
  NOME_DO_TRECHO,
  comprimentoDoEletroduto,
  comprimentoDoTrecho,
  segmentosDoEletroduto,
  sentidoDoEletroduto,
} from '../utils/blueprintRede';

const PE_DIREITO = 2800;
const eletrico = (ax: number, ay: number, bx: number, by: number, cotaA: number, cotaB: number) => ({
  a: point(ax, ay),
  b: point(bx, by),
  cotaAMm: cotaA,
  cotaBMm: cotaB,
  disciplina: 'ELETRICA' as const,
});

describe('eletroduto · o caminho em L', () => {
  it('⚠️ tomada (300) → luminária (2.800): SOBE na tomada e corre no TETO', () => {
    // 2.800 está NO teto (distância zero); 300 está a 300 do piso. A horizontal
    // fica onde está mais perto de uma laje — o teto —, e a vertical na tomada.
    const segs = segmentosDoEletroduto(eletrico(0, 0, 4000, 0, 300, 2800), PE_DIREITO);
    expect(segs).toHaveLength(2);
    // Primeiro a vertical em A…
    expect(segs[0]).toEqual({ a: point(0, 0), b: point(0, 0), cotaAMm: 300, cotaBMm: 2800 });
    // …depois a horizontal no teto até B.
    expect(segs[1]).toEqual({ a: point(0, 0), b: point(4000, 0), cotaAMm: 2800, cotaBMm: 2800 });
  });

  it('quadro (1.600) → tomada (300): corre a 300 e sobe até o quadro', () => {
    // 300 está a 300 do piso; 1.600 está a 1.200 do teto. A horizontal fica na
    // tomada, e a vertical no quadro.
    const segs = segmentosDoEletroduto(eletrico(0, 0, 3000, 0, 1600, 300), PE_DIREITO);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ a: point(0, 0), b: point(0, 0), cotaAMm: 1600, cotaBMm: 300 });
    expect(segs[1]).toEqual({ a: point(0, 0), b: point(3000, 0), cotaAMm: 300, cotaBMm: 300 });
  });

  it('a PRUMADA e o HORIZONTAL já são retos e voltam inteiros', () => {
    expect(segmentosDoEletroduto(eletrico(0, 0, 0, 0, 300, 2500), PE_DIREITO)).toHaveLength(1);
    expect(segmentosDoEletroduto(eletrico(0, 0, 4000, 0, 2800, 2800), PE_DIREITO)).toHaveLength(1);
  });

  it('⚠️ o ESGOTO com caimento NÃO vira L — ele corre inclinado de verdade', () => {
    const esgoto = { ...eletrico(0, 0, 10000, 0, 0, -200), disciplina: 'ESGOTO' as const };
    const segs = segmentosDoEletroduto(esgoto, PE_DIREITO);
    expect(segs).toHaveLength(1);
    expect(segs[0].cotaAMm).toBe(0);
    expect(segs[0].cotaBMm).toBe(-200);
  });

  it('os dois segmentos são CONTÍNUOS — o fim de um é o começo do outro', () => {
    for (const t of [eletrico(0, 0, 4000, 0, 300, 2800), eletrico(0, 0, 3000, 0, 1600, 300)]) {
      const [s1, s2] = segmentosDoEletroduto(t, PE_DIREITO);
      expect(s2.a).toEqual(s1.b);
      expect(s2.cotaAMm).toBe(s1.cotaBMm);
      // E o caminho começa em A e termina em B, com as cotas certas.
      expect(s1.a).toEqual(t.a);
      expect(s1.cotaAMm).toBe(t.cotaAMm);
      expect(s2.b).toEqual(t.b);
      expect(s2.cotaBMm).toBe(t.cotaBMm);
    }
  });
});

describe('eletroduto · o comprimento REAL', () => {
  it('⚠️ o L mede planta + prumada, não a diagonal', () => {
    // Sobe 2,5 m e corre 4 m: 6,5 m de tubo. A diagonal dizia 4,72.
    const t = eletrico(0, 0, 4000, 0, 300, 2800);
    expect(comprimentoDoEletroduto(t, PE_DIREITO)).toBe(6500);
    expect(comprimentoDoTrecho({ ...t, id: 'x', uid: 'u', levelId: 'l', bitolaMm: 25 })).toBe(6500);
  });

  it('a soma NÃO depende de qual ponta hospeda a horizontal', () => {
    const a = eletrico(0, 0, 4000, 0, 300, 2800);
    const b = eletrico(0, 0, 4000, 0, 2800, 300);
    expect(comprimentoDoEletroduto(a, PE_DIREITO)).toBe(comprimentoDoEletroduto(b, PE_DIREITO));
  });

  it('⚠️ o esgoto continua medindo a diagonal', () => {
    const esgoto = { ...eletrico(0, 0, 10000, 0, 0, -200), disciplina: 'ESGOTO' as const };
    expect(comprimentoDoTrecho({ ...esgoto, id: 'x', uid: 'u', levelId: 'l', bitolaMm: 100 }))
      .toBeCloseTo(Math.hypot(10000, 200), 6);
  });
});

describe('eletroduto · sobe / desce, e o nome', () => {
  it('sobe quando a cota de B é maior, desce quando é menor, nada no horizontal', () => {
    expect(sentidoDoEletroduto({ cotaAMm: 300, cotaBMm: 2800 })).toBe('SOBE');
    expect(sentidoDoEletroduto({ cotaAMm: 2800, cotaBMm: 300 })).toBe('DESCE');
    expect(sentidoDoEletroduto({ cotaAMm: 300, cotaBMm: 300 })).toBeNull();
  });

  it('para quem lê a tela, o da elétrica é ELETRODUTO', () => {
    expect(NOME_DO_TRECHO.ELETRICA).toBe('Eletroduto');
    // As outras não viraram "eletroduto" por tabela.
    expect(NOME_DO_TRECHO.ESGOTO).not.toContain('Eletroduto');
  });
});
