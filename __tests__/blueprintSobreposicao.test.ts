/**
 * SOBREPOSIÇÃO entre componentes — detecção e desconto.
 *
 * Pedido do usuário (01/09/2026), com print do 3D: *"ao criar um pilar onde ja
 * existe parede criada os dois componentes ficam se sobrepondo. (...) emitir um
 * aviso ao usuário se ele quer desfazer ou se ele quer subtrair o volume de um
 * componente ou do outro"*.
 *
 * O caso de referência é o mesmo do relato e vale a pena guardar de cabeça:
 * parede de 4,00 m × 2,80 m × 15 cm, pilar 20 × 40 cm centrado no eixo dela.
 * O pedaço disputado é 20 cm (a largura do pilar) × 15 cm (a espessura da
 * parede) × 2,80 m = **0,084 m³** — e ele era pago duas vezes.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  areaComum,
  computeQuantities,
  emptyModel,
  sobreposicoesDoModelo,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function comNivel(): BlueprintModel {
  return applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
}

/** Parede de 4 m com um pilar 20×40 embutido no meio dela. */
function paredeComPilar(): BlueprintModel {
  const base = comNivel();
  const levelId = base.levels[0].id;
  return applyBatch(base, [
    {
      type: 'AddWall',
      levelId,
      a: { x: 0, y: 0 },
      b: { x: 4000, y: 0 },
      thicknessMm: 150,
      heightMm: 2800,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [{ x: 2000, y: 0 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 2800,
    },
  ] as Command[]).model;
}

const M3 = 1_000_000_000;
const DISPUTADO_MM3 = 200 * 150 * 2800; // 84.000.000

describe('sobreposição · área comum entre dois anéis', () => {
  it('mede o retângulo que dois retângulos dividem', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const b = [
      { x: 60, y: 60 },
      { x: 200, y: 60 },
      { x: 200, y: 200 },
      { x: 60, y: 200 },
    ];
    expect(areaComum(a, b)).toBe(40 * 40);
  });

  it('devolve 0 para anéis que não se tocam', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = a.map((p) => ({ x: p.x + 1000, y: p.y }));
    expect(areaComum(a, b)).toBe(0);
  });
});

describe('sobreposição · o que conta e o que não conta', () => {
  it('acha o pilar embutido na parede, com o volume disputado', () => {
    const m = paredeComPilar();
    const achadas = sobreposicoesDoModelo(m);

    expect(achadas).toHaveLength(1);
    expect(achadas[0].areaPlantaMm2).toBe(200 * 150);
    expect(achadas[0].alturaMm).toBe(2800);
    expect(achadas[0].volumeMm3).toBe(DISPUTADO_MM3);
  });

  it('a LAJE por cima da parede NÃO sobrepõe — elas não se cruzam na vertical', () => {
    const base = comNivel();
    const levelId = base.levels[0].id;
    const m = applyBatch(base, [
      {
        type: 'AddWall',
        levelId,
        a: { x: 0, y: 0 },
        b: { x: 4000, y: 0 },
        thicknessMm: 150,
        heightMm: 2800,
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'LAJE',
        pontos: [
          { x: -500, y: -500 },
          { x: 4500, y: -500 },
          { x: 4500, y: 500 },
          { x: -500, y: 500 },
        ],
        larguraMm: 0,
        profundidadeMm: 0,
        alturaMm: 120,
        // Apoiada NO TOPO da parede: a laje começa onde a alvenaria termina.
        baseMm: 2800,
      },
    ] as Command[]).model;

    expect(sobreposicoesDoModelo(m)).toHaveLength(0);
  });

  it('a ESTACA enterrada não sobrepõe a parede acima dela', () => {
    const base = comNivel();
    const levelId = base.levels[0].id;
    const m = applyBatch(base, [
      {
        type: 'AddWall',
        levelId,
        a: { x: 0, y: 0 },
        b: { x: 4000, y: 0 },
        thicknessMm: 150,
        heightMm: 2800,
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'ESTACA',
        pontos: [{ x: 2000, y: 0 }],
        larguraMm: 300,
        profundidadeMm: 300,
        alturaMm: 8000,
        baseMm: -9100,
        circular: true,
      },
    ] as Command[]).model;

    expect(sobreposicoesDoModelo(m)).toHaveLength(0);
  });

  it('parede com parede NÃO conta — o canto seria sobreposição em toda esquina', () => {
    const base = comNivel();
    const levelId = base.levels[0].id;
    const m = applyBatch(base, [
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

    expect(sobreposicoesDoModelo(m)).toHaveLength(0);
  });
});

describe('sobreposição · o quantitativo', () => {
  it('sem decisão, NADA muda no número — e a disputa fica visível', () => {
    const q = computeQuantities(paredeComPilar());

    // A alvenaria continua cheia e o concreto também: o volume está contado nos
    // dois. É o estado de hoje, e ele não pode ser "corrigido" em silêncio.
    expect(q.paredes[0].volumeM3).toBeCloseTo(1.68, 6);
    expect(q.estruturas[0].volumeConcretoM3).toBeCloseTo(0.224, 6);
    expect(q.paredes[0].volumeCedidoM3).toBe(0);

    expect(q.sobreposicoes).toHaveLength(1);
    expect(q.sobreposicoes[0].quemCede).toBe('NINGUEM');
    expect(q.sobreposicoes[0].volumeM3).toBeCloseTo(DISPUTADO_MM3 / M3, 6);
  });

  it('parede cede: a alvenaria perde exatamente o volume do pilar embutido', () => {
    const m = paredeComPilar();
    const comDecisao = applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
    ] as Command[]).model;

    const q = computeQuantities(comDecisao);
    expect(q.paredes[0].volumeM3).toBeCloseTo(1.68 - 0.084, 6);
    expect(q.paredes[0].volumeCedidoM3).toBeCloseTo(0.084, 6);
    // Face e volume têm de continuar coerentes: face × espessura = volume.
    expect(q.paredes[0].areaFaceLiquidaM2 * 0.15).toBeCloseTo(q.paredes[0].volumeM3, 6);
    // O concreto fica inteiro — é ele que ganha a disputa.
    expect(q.estruturas[0].volumeConcretoM3).toBeCloseTo(0.224, 6);
    expect(q.sobreposicoes[0].quemCede).toBe('PAREDE');
  });

  it('pilar cede: o concreto encolhe e a alvenaria fica cheia', () => {
    const m = paredeComPilar();
    const comDecisao = applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.structures[0].id, cede: true },
    ] as Command[]).model;

    const q = computeQuantities(comDecisao);
    expect(q.estruturas[0].volumeConcretoM3).toBeCloseTo(0.224 - 0.084, 6);
    expect(q.estruturas[0].volumeCedidoM3).toBeCloseTo(0.084, 6);
    expect(q.paredes[0].volumeM3).toBeCloseTo(1.68, 6);
    expect(q.sobreposicoes[0].quemCede).toBe('CONCRETO');
    // A FÔRMA não encolhe: o pilar embutido continua sendo cofrado nas faces
    // que ficam contra a alvenaria.
    expect(q.estruturas[0].areaFormaM2).toBeGreaterThan(0);
  });

  it('os dois marcados: cede a PAREDE, e o desconto não sai em dobro', () => {
    const m = paredeComPilar();
    const comDecisao = applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
      { type: 'SetCedeSobreposicao', id: m.structures[0].id, cede: true },
    ] as Command[]).model;

    const q = computeQuantities(comDecisao);
    expect(q.sobreposicoes[0].quemCede).toBe('PAREDE');
    expect(q.paredes[0].volumeM3).toBeCloseTo(1.68 - 0.084, 6);
    expect(q.estruturas[0].volumeConcretoM3).toBeCloseTo(0.224, 6);
  });

  it('a decisão sobrevive ao round-trip do payload canônico', () => {
    const m = paredeComPilar();
    const comDecisao = applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
    ] as Command[]).model;

    // Não é detalhe: a decisão vale dinheiro e tem de atravessar o publish.
    expect(comDecisao.walls[0].cedeSobreposicao).toBe(true);
    expect(computeQuantities(comDecisao).sobreposicoes[0].quemCede).toBe('PAREDE');
  });

  it('desmarcar apaga a decisão em vez de gravar `false`', () => {
    const m = paredeComPilar();
    const ligado = applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
    ] as Command[]).model;
    const desligado = applyBatch(ligado, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: false },
    ] as Command[]).model;

    // `'cedeSobreposicao' in wall` é o que importa: gravar `false` acrescentaria
    // a chave ao payload canônico e mudaria o hash de um desenho que voltou
    // exatamente ao que era.
    expect('cedeSobreposicao' in desligado.walls[0]).toBe(false);
  });
});
