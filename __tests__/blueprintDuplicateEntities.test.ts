/**
 * `DuplicateEntities` — o copiar/colar do editor de plantas.
 *
 * Pedido do usuário em 2026-08-29: "funcionalidade de copiar e colar objetos
 * (paredes, portas, janelas...)". Ver
 * `docs/planos/2026-08-29-planta-copiar-colar-e-orto-terreno.md`.
 *
 * O que estes testes protegem, e que um lote de `AddWall`+`AddOpening` não
 * conseguiria garantir:
 *
 * 1. a PORTA acompanha a parede copiada, com o mesmo offset — sem que quem
 *    monta o comando precise adivinhar o id que `nextId` vai gerar;
 * 2. copiar não mexe no original (o teste que denuncia uma cópia rasa: um
 *    `a`/`b` compartilhado faria o arraste da cópia mover o original junto);
 * 3. um id inexistente derruba o comando INTEIRO, sem colar metade;
 * 4. a abertura avulsa cai na parede e no offset que a UI mandou, e não num
 *    deslocamento no plano — que não significa nada para ela.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  KernelError,
  applyBatch,
  applyCommand,
  emptyModel,
  point,
} from '../utils/blueprintKernel';

const T = 150;
const H = 2800;

function base(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function wall(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  };
}

/** Uma parede de 6 m com uma porta de 900 no meio. */
function paredeComPorta(): { model: BlueprintModel; levelId: string; wallId: string; openingId: string } {
  const { model, levelId } = base();
  const comParede = applyCommand(model, wall(levelId, 0, 0, 6000, 0));
  const wallId = comParede.diff.created[0];
  const comPorta = applyCommand(comParede.model, {
    type: 'AddOpening',
    wallId,
    kind: 'PORTA',
    offsetMm: 2000,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
  });
  return { model: comPorta.model, levelId, wallId, openingId: comPorta.diff.created[0] };
}

describe('DuplicateEntities — paredes', () => {
  it('copia a parede deslocada e devolve o id novo no diff', () => {
    const { model, levelId, wallId } = paredeComPorta();
    const r = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 3000),
    });

    expect(r.model.walls).toHaveLength(2);
    const copia = r.model.walls.find((w) => w.id !== wallId)!;
    expect(copia.a).toEqual({ x: 0, y: 3000 });
    expect(copia.b).toEqual({ x: 6000, y: 3000 });
    expect(copia.thicknessMm).toBe(T);
    expect(r.diff.created).toContain(copia.id);
  });

  it('A PORTA VEM JUNTO, no mesmo offset e na parede copiada', () => {
    const { model, levelId, wallId, openingId } = paredeComPorta();
    const r = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 3000),
    });

    expect(r.model.openings).toHaveLength(2);
    const copiaParede = r.model.walls.find((w) => w.id !== wallId)!;
    const copiaPorta = r.model.openings.find((o) => o.id !== openingId)!;
    expect(copiaPorta.wallId).toBe(copiaParede.id);
    expect(copiaPorta.offsetMm).toBe(2000);
    expect(copiaPorta.widthMm).toBe(900);
    expect(copiaPorta.kind).toBe('PORTA');
  });

  it('não faz cópia da cópia quando a mesma parede é colada duas vezes', () => {
    const { model, levelId, wallId } = paredeComPorta();
    const uma = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 3000),
    });
    const duas = applyCommand(uma.model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 6000),
    });
    // 3 paredes e 3 portas — não 3 e 4, que é o que sai quando o laço das
    // aberturas enxerga o que ele mesmo acabou de acrescentar.
    expect(duas.model.walls).toHaveLength(3);
    expect(duas.model.openings).toHaveLength(3);
  });

  it('a cópia é PROFUNDA: mover a cópia não mexe no original', () => {
    const { model, levelId, wallId } = paredeComPorta();
    const r = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 3000),
    });
    const copia = r.model.walls.find((w) => w.id !== wallId)!;
    const movido = applyCommand(r.model, {
      type: 'MoveVertex',
      wallId: copia.id,
      end: 'b',
      to: point(9000, 3000),
      manterJuncoes: false,
    });
    expect(movido.model.walls.find((w) => w.id === wallId)!.b).toEqual({ x: 6000, y: 0 });
  });

  it('cola num pavimento DIFERENTE do de origem', () => {
    const { model, levelId, wallId } = paredeComPorta();
    const comSuperior = applyCommand(model, {
      type: 'AddLevel',
      name: 'Pavimento 1',
      elevationMm: 2800,
      defaultHeightMm: H,
    });
    const superiorId = comSuperior.diff.created[0];
    const r = applyCommand(comSuperior.model, {
      type: 'DuplicateEntities',
      levelId: superiorId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: point(0, 0),
    });
    const copia = r.model.walls.find((w) => w.id !== wallId)!;
    expect(copia.levelId).toBe(superiorId);
    expect(r.model.openings.find((o) => o.wallId === copia.id)).toBeTruthy();
  });
});

describe('DuplicateEntities — abertura avulsa', () => {
  it('cai na parede e no offset que a UI mandou, ignorando o delta', () => {
    const { model, levelId, wallId, openingId } = paredeComPorta();
    const comSegunda = applyCommand(model, wall(levelId, 0, 4000, 6000, 4000));
    const outraParede = comSegunda.diff.created[0];

    const r = applyCommand(comSegunda.model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [],
      boundaryIds: [],
      openings: [{ openingId, wallId: outraParede, offsetMm: 4200 }],
      // Delta absurdo de propósito: a abertura avulsa não o consulta.
      delta: point(999_000, 999_000),
    });

    const copia = r.model.openings.find((o) => o.id !== openingId)!;
    expect(copia.wallId).toBe(outraParede);
    expect(copia.offsetMm).toBe(4200);
    expect(copia.widthMm).toBe(900);
  });

  it('recusa quando não cabe, com a medida na mensagem', () => {
    const { model, levelId, wallId, openingId } = paredeComPorta();
    expect(() =>
      applyCommand(model, {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [],
        boundaryIds: [],
        openings: [{ openingId, wallId, offsetMm: 5500 }],
        delta: point(0, 0),
      }),
    ).toThrow(/não cabe em 6000/);
  });

  it('recusa quando a cópia cairia em cima de outra abertura', () => {
    const { model, levelId, wallId, openingId } = paredeComPorta();
    expect(() =>
      applyCommand(model, {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [],
        boundaryIds: [],
        // Encosta na porta que já está em 2000+900.
        openings: [{ openingId, wallId, offsetMm: 2500 }],
        delta: point(0, 0),
      }),
    ).toThrow(KernelError);
  });
});

describe('DuplicateEntities — limites e recusas', () => {
  it('copia divisa de terreno deslocada', () => {
    const { model, levelId } = base();
    const r1 = applyCommand(model, {
      type: 'AddBoundary',
      levelId,
      a: point(0, 0),
      b: point(12_000, 0),
      kind: 'TERRENO',
    });
    const bndId = r1.diff.created[0];
    const r2 = applyCommand(r1.model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [],
      boundaryIds: [bndId],
      openings: [],
      delta: point(0, 10_000),
    });
    const copia = r2.model.boundaries.find((b) => b.id !== bndId)!;
    expect(copia.a).toEqual({ x: 0, y: 10_000 });
    expect(copia.b).toEqual({ x: 12_000, y: 10_000 });
    expect(copia.kind).toBe('TERRENO');
  });

  it('um id inexistente derruba o comando INTEIRO — nada é colado', () => {
    const { model, levelId, wallId } = paredeComPorta();
    expect(() =>
      applyCommand(model, {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [wallId, 'wal-999'],
        boundaryIds: [],
        openings: [],
        delta: point(0, 3000),
      }),
    ).toThrow(KernelError);
    // O modelo de entrada é imutável: `applyCommand` trabalha sobre uma cópia.
    expect(model.walls).toHaveLength(1);
  });

  it('recusa colagem vazia em vez de virar passo de histórico sem efeito', () => {
    const { model, levelId } = base();
    expect(() =>
      applyCommand(model, {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [],
        boundaryIds: [],
        openings: [],
        delta: point(1000, 0),
      }),
    ).toThrow(KernelError);
  });

  it('recusa delta fracionário — coordenada quebrada envenena o hash canônico', () => {
    const { model, levelId, wallId } = paredeComPorta();
    expect(() =>
      applyCommand(model, {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [wallId],
        boundaryIds: [],
        openings: [],
        delta: { x: 1000.4, y: 0 } as never,
      }),
    ).not.toThrow();
    // `roundToMm` arredonda antes de conferir: 1000,4 vira 1000, e a cópia
    // continua inteira. O que não pode passar é coordenada com casa decimal
    // sobrevivendo até o payload.
    const r = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId,
      wallIds: [wallId],
      boundaryIds: [],
      openings: [],
      delta: { x: 1000.4, y: 0 } as never,
    });
    const copia = r.model.walls.find((w) => w.id !== wallId)!;
    expect(Number.isInteger(copia.a.x)).toBe(true);
    expect(copia.a.x).toBe(1000);
  });

  it('um gesto = UM passo de desfazer', () => {
    const { model, levelId, wallId } = paredeComPorta();
    const r = applyBatch(model, [
      {
        type: 'DuplicateEntities',
        levelId,
        wallIds: [wallId],
        boundaryIds: [],
        openings: [],
        delta: point(0, 3000),
      },
    ]);
    // Duas paredes e duas portas saíram de UM comando — não de quatro.
    expect(r.model.walls).toHaveLength(2);
    expect(r.model.openings).toHaveLength(2);
    expect(r.diff.created).toHaveLength(2);
  });
});
