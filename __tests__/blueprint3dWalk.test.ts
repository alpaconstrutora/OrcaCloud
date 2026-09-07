/**
 * Andar dentro do desenho — a conta do passo.
 *
 * Movimentação é o tipo de código que "parece funcionar" e está errado de um
 * jeito que se SENTE antes de se entender: a diagonal mais rápida que a reta, o
 * passo que muda de tamanho com o monitor, o olhar para cima que faz decolar.
 * Cada um tem caso próprio aqui.
 */
import { describe, expect, it } from 'vitest';
import {
  ALTURA_DO_OLHO_M,
  SEM_TECLAS,
  VELOCIDADE_M_S,
  direcaoDaTecla,
  passo,
} from '../utils/blueprint3dWalk';

const t = (over: Partial<typeof SEM_TECLAS> = {}) => ({ ...SEM_TECLAS, ...over });

describe('walk · as teclas', () => {
  it('WASD e as setas fazem a mesma coisa', () => {
    expect(direcaoDaTecla('KeyW')).toBe('frente');
    expect(direcaoDaTecla('ArrowUp')).toBe('frente');
    expect(direcaoDaTecla('KeyD')).toBe('direita');
    expect(direcaoDaTecla('ArrowRight')).toBe('direita');
  });

  it('usa `code`, não `key` — o layout do teclado não decide quem anda', () => {
    // Em ABNT2 e AZERTY o `key` do W muda; o `code` é físico.
    expect(direcaoDaTecla('KeyA')).toBe('esquerda');
    expect(direcaoDaTecla('a')).toBeNull();
  });

  it('tecla que não é de andar não vira movimento', () => {
    expect(direcaoDaTecla('Space')).toBeNull();
    expect(direcaoDaTecla('KeyQ')).toBeNull();
  });
});

describe('walk · o passo', () => {
  it('parado não anda', () => {
    expect(passo(SEM_TECLAS, 1, 0, 1)).toEqual({ dx: 0, dz: 0 });
  });

  it('frente e trás se cancelam', () => {
    expect(passo(t({ frente: true, tras: true }), 1, 0, 1)).toEqual({ dx: 0, dz: 0 });
  });

  it('andar para a frente segue o OLHAR', () => {
    const p = passo(t({ frente: true }), 0, -1, 1);
    expect(p.dx).toBeCloseTo(0, 6);
    expect(p.dz).toBeCloseTo(-VELOCIDADE_M_S, 6);
  });

  it('a DIAGONAL não é mais rápida que a reta — o bug clássico', () => {
    const reta = passo(t({ frente: true }), 1, 0, 1);
    const diagonal = passo(t({ frente: true, direita: true }), 1, 0, 1);
    expect(Math.hypot(diagonal.dx, diagonal.dz)).toBeCloseTo(
      Math.hypot(reta.dx, reta.dz),
      6,
    );
  });

  it('o passo é por TEMPO, não por quadro', () => {
    // Num monitor de 144 Hz o passo por quadro andaria mais que o dobro do de
    // 60 Hz, e a mesma sala teria tamanhos diferentes conforme a máquina.
    const meio = passo(t({ frente: true }), 1, 0, 0.5);
    const inteiro = passo(t({ frente: true }), 1, 0, 1);
    expect(Math.hypot(inteiro.dx, inteiro.dz)).toBeCloseTo(
      2 * Math.hypot(meio.dx, meio.dz),
      6,
    );
  });

  it('OLHAR PARA CIMA não faz decolar: o passo é sempre no plano', () => {
    // A direção vem achatada; quem chama passa só X e Z. Mesmo com o olhar
    // quase vertical, o que sobra no plano ainda anda a velocidade cheia.
    const quaseVertical = passo(t({ frente: true }), 0.01, 0, 1);
    expect(Math.hypot(quaseVertical.dx, quaseVertical.dz)).toBeCloseTo(VELOCIDADE_M_S, 6);
  });

  it('olhar exatamente para cima não anda para lugar nenhum', () => {
    // Sem direção no plano não há para onde ir — e inventar uma seria escolher
    // por quem está olhando.
    expect(passo(t({ frente: true }), 0, 0, 1)).toEqual({ dx: 0, dz: 0 });
  });

  it('a altura do olho é de gente em pé', () => {
    expect(ALTURA_DO_OLHO_M).toBeGreaterThan(1.4);
    expect(ALTURA_DO_OLHO_M).toBeLessThan(1.9);
  });
});
