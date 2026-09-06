/**
 * O clique que seleciona no 3D, e o que o distingue de orbitar.
 *
 * A regra é de UMA linha e mesmo assim merece teste, porque o defeito que ela
 * evita é silencioso nos dois sentidos: tolerância de menos faz cliques
 * legítimos não fazerem nada (parece intermitente), e tolerância de mais faz a
 * cena selecionar sozinha depois de cada órbita.
 */
import { describe, expect, it } from 'vitest';
import { TOLERANCIA_DE_CLIQUE_PX, ehClique } from '../utils/blueprint3dSelecao';

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
