/**
 * O clique que seleciona no 3D, e o que o distingue de orbitar.
 *
 * A regra é de UMA linha e mesmo assim merece teste, porque o defeito que ela
 * evita é silencioso nos dois sentidos: tolerância de menos faz cliques
 * legítimos não fazerem nada (parece intermitente), e tolerância de mais faz a
 * cena selecionar sozinha depois de cada órbita.
 */
import { describe, expect, it } from 'vitest';
import { TOLERANCIA_DE_CLIQUE_PX, deslocamentoDoArrasteNoPiso, ehClique, pontoNoPlanoHorizontal } from '../utils/blueprint3dSelecao';

describe('3d · clique ou órbita', () => {
  it('parado é clique', () => {
    expect(ehClique({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it('a tremida da mão ainda é clique — exigir imobilidade seria pior', () => {
    expect(ehClique({ x: 100, y: 100 }, { x: 102, y: 102 })).toBe(true);
  });

  it('exatamente na tolerância ainda conta', () => {
    expect(ehClique({ x: 0, y: 0 }, { x: TOLERANCIA_DE_CLIQUE_PX, y: 0 })).toBe(true);
  });

  it('arrastar NÃO é clique — girar a cena não pode selecionar', () => {
    expect(ehClique({ x: 100, y: 100 }, { x: 160, y: 130 })).toBe(false);
  });

  it('a distância é diagonal, não por eixo', () => {
    // 3 e 3 dão 4,24 — passa da tolerância, embora nenhum eixo sozinho passe.
    expect(ehClique({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
  });

  it('sem ponto de partida, NÃO seleciona — não se adivinha', () => {
    expect(ehClique(null, { x: 100, y: 100 })).toBe(false);
  });
});

describe('3d · arrastar a peça no piso, como no 2D (13/10/2026)', () => {
  it('o raio corta o plano horizontal na altura pedida', () => {
    const d = Math.SQRT1_2;
    expect(pontoNoPlanoHorizontal([0, 10, 0], [d, -d, 0], 2)).toEqual([8, 2, 0]);
  });

  it('raio paralelo, para cima ou cortando além do alcance = sem ponto (não salta a peça)', () => {
    expect(pontoNoPlanoHorizontal([0, 10, 0], [1, 0, 0], 0)).toBeNull();
    expect(pontoNoPlanoHorizontal([0, 10, 0], [0, 1, 0], 0)).toBeNull();
    const rasante = [Math.cos(0.001), -Math.sin(0.001), 0] as [number, number, number];
    expect(pontoNoPlanoHorizontal([0, 10, 0], rasante, 0)).toBeNull();
    expect(pontoNoPlanoHorizontal([0, 10, 0], rasante, 0, 20000)).not.toBeNull();
  });

  it('arrastar para o NORTE do mundo (−Z) é +y no modelo; leste é +x', () => {
    expect(deslocamentoDoArrasteNoPiso([5, 0, 5], [5, 0, 3], false).modelo).toEqual({ x: 0, y: 2000 });
    expect(deslocamentoDoArrasteNoPiso([5, 0, 5], [6.5, 0, 5], false).modelo).toEqual({ x: 1500, y: 0 });
  });

  it('sem a trava anda na diagonal; com a trava fica só o eixo maior', () => {
    const livre = deslocamentoDoArrasteNoPiso([0, 1, 0], [1.234, 1, -0.5], false);
    expect(livre.modelo).toEqual({ x: 1230, y: 500 });
    // A prévia vive no espaço do desenho (z = +y), no mesmo grupo espelhado da cena.
    expect(livre.desenho).toEqual([1.23, 0, 0.5]);
    expect(deslocamentoDoArrasteNoPiso([0, 1, 0], [1.234, 1, -0.5], true).modelo).toEqual({ x: 1230, y: 0 });
    expect(deslocamentoDoArrasteNoPiso([0, 1, 0], [0.2, 1, -0.9], true).modelo).toEqual({ x: 0, y: 900 });
  });

  it('a altura do ponteiro não entra: o piso não sobe nem desce', () => {
    expect(deslocamentoDoArrasteNoPiso([0, 0, 0], [0.5, 7, 0], false).desenho[1]).toBe(0);
  });
});
