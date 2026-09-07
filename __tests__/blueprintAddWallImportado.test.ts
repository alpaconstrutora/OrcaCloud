/**
 * `AddWall` recebendo IDENTIDADE e COMPOSIÇÃO de fora.
 *
 * ─── POR QUE OS DOIS CAMPOS ENTRARAM ────────────────────────────────────────
 *
 * Quem importa um arquivo IFC monta a lista INTEIRA de comandos antes de
 * aplicar — é o que faz a importação ser "ou tudo, ou nada". Nesse momento não
 * existe `wallId` nenhum, então `SetWallLayers`, que exige um, não serve; e o
 * `uid` precisa ser o do arquivo, não um novo.
 *
 * O `uid` de fora é o que faz a ida e volta com o Revit fechar: `GlobalId` é um
 * UUID comprimido, então a parede volta com o MESMO identificador e o Revit a
 * reconhece em vez de criar outra.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type CamadaParede } from '../utils/blueprintKernel';

const CAMADAS: CamadaParede[] = [
  { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
  { espessuraMm: 140, itemCode: '', descricao: 'Bloco', funcao: 'VEDACAO' },
  { espessuraMm: 25, itemCode: '', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
];

const comNivel = () =>
  applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;

const parede = (extra: Record<string, unknown> = {}) => {
  const base = comNivel();
  return applyCommand(base, {
    type: 'AddWall',
    levelId: base.levels[0].id,
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
    ...extra,
  } as Parameters<typeof applyCommand>[1]).model.walls[0];
};

describe('AddWall · identidade vinda de fora', () => {
  it('o uid do arquivo é o uid da parede', () => {
    const uid = '2b5f9f4a-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(parede({ uid }).uid).toBe(uid);
  });

  it('sem uid, nasce um novo — o desenho feito à mão não muda', () => {
    const p = parede();
    expect(p.uid).toMatch(/^[0-9a-f]{8}-/);
  });

  it('uid fora de formato é RECUSADO, não corrigido', () => {
    // Aceitar "quase um UUID" produziria um identificador que não volta para o
    // IFC e não casa com `blueprint_objects.element_uid`.
    expect(() => parede({ uid: '2XPyKWY018sA1ygZKgQPtU' })).toThrow(/uid/i);
  });

  it('duas paredes com o MESMO uid são recusadas', () => {
    const uid = '2b5f9f4a-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    const base = comNivel();
    const um = applyCommand(base, {
      type: 'AddWall',
      levelId: base.levels[0].id,
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 150,
      heightMm: 2800,
      uid,
    }).model;
    expect(() =>
      applyCommand(um, {
        type: 'AddWall',
        levelId: um.levels[0].id,
        a: point(0, 1000),
        b: point(4000, 1000),
        thicknessMm: 150,
        heightMm: 2800,
        uid,
      }),
    ).toThrow();
  });
});

describe('AddWall · composição na criação', () => {
  it('a espessura vem da SOMA das camadas, e não do campo', () => {
    // O campo é ignorado de propósito: é a mesma regra de `SetWallLayers`, que
    // recusa `SetThickness` numa parede composta. Duas verdades sobre a
    // espessura é como o desenho e o orçamento passam a discordar.
    const p = parede({ camadas: CAMADAS, thicknessMm: 999 });
    expect(p.thicknessMm).toBe(190);
    expect(p.camadas).toHaveLength(3);
  });

  it('as camadas são CÓPIA — mexer na lista de fora não muda a parede', () => {
    const lista = [...CAMADAS];
    const p = parede({ camadas: lista });
    lista[0].espessuraMm = 1;
    expect(p.camadas![0].espessuraMm).toBe(25);
  });

  it('sem camadas, a espessura é a do campo — nada regrediu', () => {
    const p = parede();
    expect(p.thicknessMm).toBe(150);
    expect(p.camadas).toBeUndefined();
  });

  it('lista de camadas VAZIA é recusada, e não tratada como ausente', () => {
    expect(() => parede({ camadas: [] })).toThrow();
  });
});
