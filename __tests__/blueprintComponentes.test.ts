/**
 * O INVENTÁRIO do painel "Componentes" — o gerenciador do que já está desenhado
 * (pedido de 31/08/2026).
 *
 * O que este arquivo cobre é justamente o que o clique no canvas não deixa
 * testar: pegar uma peça exige acertar um pixel, e o canvas é opaco em jsdom.
 * As perguntas são as que a lista precisa acertar para ser útil:
 *
 *   1. numeração POR TIPO — "Porta 1, Porta 2, Janela 1", não uma fila global;
 *   2. a esquadria diz em QUE PAREDE mora;
 *   3. cada família mostra a medida que a identifica;
 *   4. o rótulo do calculista (P1, V3) vence a numeração automática;
 *   5. a chave casa com o catálogo do menu — é o que garante o mesmo ícone dos
 *      dois lados.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { linhasDeComponentes } from '../utils/blueprintComponentes';

function comNivel(): BlueprintModel {
  return applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
}

/** Duas paredes de 4 m e 3 m, com porta, porta, janela e um pilar. */
function planta(): BlueprintModel {
  const base = comNivel();
  const levelId = base.levels[0].id;
  const comParedes = applyBatch(base, [
    {
      type: 'AddWall',
      levelId,
      a: { x: 0, y: 0 },
      b: { x: 4000, y: 0 },
      thicknessMm: 150,
      heightMm: 2800,
    },
    {
      type: 'AddWall',
      levelId,
      a: { x: 4000, y: 0 },
      b: { x: 4000, y: 3000 },
      thicknessMm: 150,
      heightMm: 2800,
    },
  ] as Command[]).model;

  const [p1, p2] = comParedes.walls;
  return applyBatch(comParedes, [
    {
      type: 'AddOpening',
      wallId: p1.id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    },
    {
      type: 'AddOpening',
      wallId: p2.id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    },
    {
      type: 'AddOpening',
      wallId: p1.id,
      kind: 'window',
      offsetMm: 2500,
      widthMm: 1200,
      heightMm: 1100,
      sillMm: 900,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [{ x: 500, y: 500 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 2800,
    },
  ] as Command[]).model;
}

function inventario(m: BlueprintModel) {
  return linhasDeComponentes(m.walls, m.openings, m.structures);
}

describe('componentes · 1. numeração por tipo', () => {
  it('numera cada família na própria sequência', () => {
    const linhas = inventario(planta());
    const rotulos = linhas.map((l) => l.rotulo);

    expect(rotulos).toContain('Parede 1');
    expect(rotulos).toContain('Parede 2');
    // A segunda porta é "Porta 2" mesmo tendo entrado depois de outra
    // abertura — quem lê a lista procura "a segunda porta", não "a terceira
    // abertura".
    expect(rotulos).toContain('Porta 1');
    expect(rotulos).toContain('Porta 2');
    expect(rotulos).toContain('Janela 1');
  });
});

describe('componentes · 2. a esquadria diz onde mora', () => {
  it('aponta a parede hospedeira pelo mesmo rótulo da lista', () => {
    const linhas = inventario(planta());
    const porta2 = linhas.find((l) => l.rotulo === 'Porta 2');

    // "Porta 2" sozinho não localiza nada: o detalhe é o que faz a lista
    // substituir a caçada com zoom no canvas.
    expect(porta2?.detalhe).toBe('Parede 2');
    expect(linhas.find((l) => l.rotulo === 'Janela 1')?.detalhe).toBe(
      'Parede 1 · peitoril 90 cm',
    );
  });
});

describe('componentes · 3. a medida que identifica cada família', () => {
  it('parede em metro, esquadria em vão, pilar em seção', () => {
    const linhas = inventario(planta());

    expect(linhas.find((l) => l.rotulo === 'Parede 1')?.medida).toBe('4,00 m');
    expect(linhas.find((l) => l.rotulo === 'Parede 1')?.detalhe).toBe(
      '15 cm de espessura · 2 esquadrias',
    );
    expect(linhas.find((l) => l.rotulo === 'Porta 1')?.medida).toBe('0,90 × 2,10 m');
    expect(linhas.find((l) => l.chave === 'PILAR')?.medida).toBe('20 × 40 cm');
  });

  it('pilar redondo mostra diâmetro, não dois lados', () => {
    const base = comNivel();
    const m = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: base.levels[0].id,
        kind: 'ESTACA',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 300,
        profundidadeMm: 300,
        alturaMm: 8000,
        baseMm: -9100,
        circular: true,
      },
    ] as Command[]).model;

    const linha = inventario(m)[0];
    expect(linha.medida).toBe('Ø 30 cm');
    // A cota é o que distingue a peça de fundação — e por isso ela aparece
    // aqui, mas não numa peça assentada no piso do pavimento.
    expect(linha.detalhe).toContain('cota -9,10 m');
  });
});

describe('componentes · 4. o rótulo do calculista vence', () => {
  it('usa `rotulo` quando a peça tem um, e numera só quando não tem', () => {
    const m = planta();
    const pilar = m.structures[0];
    const comRotulo = applyBatch(m, [
      { type: 'SetStructuralProps', structuralId: pilar.id, rotulo: 'P12' },
    ] as Command[]).model;

    expect(inventario(comRotulo).find((l) => l.chave === 'PILAR')?.rotulo).toBe(
      'P12 · Pilar',
    );
    expect(inventario(m).find((l) => l.chave === 'PILAR')?.rotulo).toBe('P1 · Pilar');
  });
});

describe('componentes · 5. a chave casa com o catálogo do menu', () => {
  it('parede, tipo de abertura e tipo estrutural — nada inventado', () => {
    const chaves = inventario(planta()).map((l) => l.chave);
    expect(new Set(chaves)).toEqual(new Set(['parede', 'door', 'window', 'PILAR']));
  });
});
