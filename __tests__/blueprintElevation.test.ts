/**
 * Projeção em elevação — `utils/blueprintElevation.ts`.
 *
 * Golden por VALOR: as coordenadas projetadas de fixtures fixas. Se um número
 * aqui mudar, a pergunta é "o que na projeção mudou, e era para mudar?".
 *
 * Convenção travada (decisão do usuário 2026-08-29): sem divisa marcada, FRENTE
 * olha +Y com `u = +X`; a divisa `papel: 'FRENTE'` sobrepõe os eixos fixos.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  applyBatch,
  applyCommand,
  emptyModel,
  point,
} from '../utils/blueprintKernel';
import { baseDaElevacao, perfilDaParedeComVaos, projetarElevacao } from '../utils/blueprintElevation';

const T = 150;
const H = 2800;

function comTerreo(): { model: BlueprintModel; terreoId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, terreoId: r.model.levels[0].id };
}

function parede(
  levelId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  heightMm = H,
): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm };
}

/** Sala retangular 4000 × 3000, cantos em (0,0) e (4000,3000). */
function salaRetangular(model: BlueprintModel, levelId: string): BlueprintModel {
  return applyBatch(model, [
    parede(levelId, 0, 0, 4000, 0),
    parede(levelId, 4000, 0, 4000, 3000),
    parede(levelId, 4000, 3000, 0, 3000),
    parede(levelId, 0, 3000, 0, 0),
  ]).model;
}

describe('projetarElevacao · sala retangular com porta e janela', () => {
  function fixture(): { model: BlueprintModel; terreoId: string; paredeBaixaId: string } {
    const { model, terreoId } = comTerreo();
    let m = salaRetangular(model, terreoId);
    const paredeBaixaId = m.walls[0].id;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId: paredeBaixaId, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: paredeBaixaId, kind: 'window', offsetMm: 2000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    return { model: m, terreoId, paredeBaixaId };
  }

  it('FRENTE (eixos fixos): parede da fachada e recortes na cota certa', () => {
    const { model, paredeBaixaId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });

    expect(proj.base.origem).toBe('EIXOS_FIXOS');
    expect(proj.base.u).toEqual({ x: 1, y: 0 });
    expect(proj.base.d).toEqual({ x: 0, y: 1 });

    expect(proj.paredes).toHaveLength(4);
    expect(proj.aberturas).toHaveLength(2);

    // A fachada vai de −75 a 4075, e NÃO de 0 a 4000: a parede avança meia
    // espessura em cada ponta que encontra outra (`extensaoDeCanto`), como no
    // desenho, no 3D e no PDF. De eixo a eixo a silhueta abria um degrau no
    // canto da edificação que não existe na obra — corrigido em 30/08/2026.
    //
    // A prova de que este é o número certo está duas linhas abaixo: o `bbox`
    // JÁ era −75…4075 (as paredes laterais o esticavam com a própria meia
    // espessura). Só o retângulo da fachada discordava do próprio edifício.
    const fachada = proj.paredes.find((p) => p.wallId === paredeBaixaId)!;
    expect(fachada).toMatchObject({ uMin: -75, uMax: 4075, vMin: 0, vMax: 2800, profundidade: 0, degenerada: false });

    const porta = proj.aberturas.find((o) => o.kind === 'door')!;
    expect(porta).toMatchObject({ uMin: 500, uMax: 1400, vMin: 0, vMax: 2100 });
    const janela = proj.aberturas.find((o) => o.kind === 'window')!;
    expect(janela).toMatchObject({ uMin: 2000, uMax: 3200, vMin: 1000, vMax: 2200 });

    expect(proj.linhaDoSolo.v).toBe(0);
    expect(proj.bbox).toEqual({ uMin: -75, uMax: 4075, vMin: 0, vMax: 2800 });

    // Fundo → frente: a primeira é a mais funda.
    expect(proj.paredes[0].profundidade).toBeGreaterThanOrEqual(
      proj.paredes[proj.paredes.length - 1].profundidade,
    );
    // A parede do topo (y = 3000) é a mais funda.
    expect(proj.paredes[0].profundidade).toBe(3000);
  });

  it('FUNDOS: a fachada aparece espelhada em u', () => {
    const { model, paredeBaixaId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FUNDOS' });
    expect(proj.base.d).toEqual({ x: 0, y: -1 });
    expect(proj.base.u).toEqual({ x: -1, y: 0 });

    // Espelhado, e com o mesmo avanço de canto da vista de FRENTE.
    const fachada = proj.paredes.find((p) => p.wallId === paredeBaixaId)!;
    expect(fachada).toMatchObject({ uMin: -4075, uMax: 75 });
    const porta = proj.aberturas.find((o) => o.kind === 'door')!;
    expect(porta).toMatchObject({ uMin: -1400, uMax: -500, vMin: 0, vMax: 2100 });
  });

  it('LATERAL_DIREITA: olha -X, u = -Y', () => {
    const { model } = fixture();
    const proj = projetarElevacao(model, { direcao: 'LATERAL_DIREITA' });
    expect(proj.base.d).toEqual({ x: -1, y: 0 });
    expect(proj.base.u).toEqual({ x: 0, y: 1 });
    // A parede esquerda (x = 0) é a mais funda para quem olha de +X.
    expect(proj.paredes[0].profundidade).toBe(0);
  });
});

describe('projetarElevacao · dois pavimentos empilhados', () => {
  function fixture() {
    const { model, terreoId } = comTerreo();
    let m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;
    m = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: 2800, defaultHeightMm: H }).model;
    const pav1Id = m.levels[1].id;
    m = applyCommand(m, parede(pav1Id, 0, 0, 4000, 0)).model;
    return { model: m, terreoId, pav1Id };
  }

  it('sem filtro: as duas paredes empilham pela elevationMm', () => {
    const { model } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });
    expect(proj.paredes).toHaveLength(2);
    const cotas = proj.paredes.map((p) => [p.vMin, p.vMax]).sort((a, b) => a[0] - b[0]);
    expect(cotas).toEqual([
      [0, 2800],
      [2800, 5600],
    ]);
    expect(proj.linhaDoSolo.v).toBe(0);
    expect(proj.bbox.vMax).toBe(5600);
  });

  it('com levelIds: só o nível pedido é projetado', () => {
    const { model, terreoId } = fixture();
    const proj = projetarElevacao(model, { direcao: 'FRENTE', levelIds: [terreoId] });
    expect(proj.paredes).toHaveLength(1);
    expect(proj.bbox.vMax).toBe(2800);
  });
});

describe('baseDaElevacao · divisa FRENTE sobrepõe os eixos fixos', () => {
  function comTerreno() {
    const { model, terreoId } = comTerreo();
    // Retângulo de terreno 10000 × 8000.
    const cantos: [number, number][] = [
      [0, 0],
      [10000, 0],
      [10000, 8000],
      [0, 8000],
    ];
    let m = model;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const a = cantos[i];
      const b = cantos[(i + 1) % 4];
      const r = applyCommand(m, {
        type: 'AddBoundary',
        levelId: terreoId,
        a: point(a[0], a[1]),
        b: point(b[0], b[1]),
        kind: 'TERRENO',
      });
      m = r.model;
      ids.push(r.diff.created[0]);
    }
    // Lado (10000,8000) → (0,8000): o TOPO, marcado como FRENTE.
    m = applyCommand(m, { type: 'SetBoundaryPapel', boundaryId: ids[2], papel: 'FRENTE' }).model;
    m = applyCommand(m, parede(terreoId, 1000, 1000, 9000, 1000)).model;
    return m;
  }

  it('a normal interna do topo aponta para -Y, e FUNDOS é o oposto', () => {
    const model = comTerreno();
    const frente = baseDaElevacao(model, 'FRENTE');
    expect(frente.origem).toBe('DIVISA_FRENTE');
    expect(Math.abs(frente.d.x)).toBeLessThan(1e-9);
    expect(frente.d.y).toBeCloseTo(-1, 9);

    const fundos = baseDaElevacao(model, 'FUNDOS');
    expect(fundos.d.y).toBeCloseTo(1, 9);

    // As laterais são perpendiculares à frente.
    const dir = baseDaElevacao(model, 'LATERAL_DIREITA');
    expect(Math.abs(frente.d.x * dir.d.x + frente.d.y * dir.d.y)).toBeLessThan(1e-9);
  });

  it('sem divisa marcada, cai para eixos fixos', () => {
    const { model, terreoId } = comTerreo();
    const m = applyCommand(model, parede(terreoId, 0, 0, 3000, 0)).model;
    expect(baseDaElevacao(m, 'FRENTE').origem).toBe('EIXOS_FIXOS');
  });
});

describe('projetarElevacao · avanço de canto na silhueta', () => {
  it('parede solta NÃO avança — o avanço é do canto, não da parede', () => {
    // A outra metade da régua. Sem este caso, "somar sempre meia espessura"
    // passaria: a fachada da sala retangular tem canto nas duas pontas.
    const { model, terreoId } = comTerreo();
    const m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;

    const proj = projetarElevacao(m, { direcao: 'FRENTE' });
    expect(proj.paredes[0]).toMatchObject({ uMin: 0, uMax: 4000 });
  });

  it('com canto de um lado só, avança de um lado só', () => {
    const { model, terreoId } = comTerreo();
    const m = applyBatch(model, [
      parede(terreoId, 0, 0, 4000, 0),
      parede(terreoId, 4000, 0, 4000, 3000),
    ]).model;

    const fachada = projetarElevacao(m, { direcao: 'FRENTE' }).paredes.find(
      (p) => p.wallId === m.walls[0].id,
    )!;
    expect(fachada).toMatchObject({ uMin: 0, uMax: 4075 });
  });
});

describe('perfilDaParedeComVaos', () => {
  it('devolve o retângulo da parede e os furos em coordenada local, recortados', () => {
    const { model, terreoId } = comTerreo();
    let m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;
    const paredeId = m.walls[0].id;
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: paredeId,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 1500,
      heightMm: 1200,
      sillMm: 900,
    }).model;

    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil).toMatchObject({
      comprimentoMm: 4000,
      alturaMm: 2800,
      espessuraMm: T,
      elevacaoBaseMm: 0,
    });
    expect(perfil.furos).toHaveLength(1);
    expect(perfil.furos[0]).toMatchObject({ x0: 1000, x1: 2500, y0: 900, y1: 2100, kind: 'window' });
  });
});

/**
 * AVANÇO DE CANTO NO PERFIL — o que fecha o canto na vista 3D e no IFC.
 *
 * O defeito (print do usuário em 30/08/2026): a parede em 3D era uma caixa de
 * EIXO A EIXO, então num canto em L sobrava um entalhe de meia espessura na
 * face externa. A planta baixa e o PDF já esticavam a ponta por
 * `extensaoDeCanto`; só o 3D e o IFC não.
 *
 * Estes casos existem para travar as DUAS metades da régua: que ela é o valor
 * do kernel (e não meia espessura fixa, que só acerta em 90°), e que ela só
 * enxerga vizinha do MESMO pavimento.
 */
describe('perfilDaParedeComVaos · avanço de canto', () => {
  it('ponta livre não avança', () => {
    const { model, terreoId } = comTerreo();
    const m = applyCommand(model, parede(terreoId, 0, 0, 4000, 0)).model;

    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil.avancoAMm).toBe(0);
    expect(perfil.avancoBMm).toBe(0);
  });

  it('canto reto avança meia espessura nas duas pontas', () => {
    const { model, terreoId } = comTerreo();
    const m = salaRetangular(model, terreoId);

    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil.avancoAMm).toBeCloseTo(T / 2, 6);
    expect(perfil.avancoBMm).toBeCloseTo(T / 2, 6);
    // E o eixo NÃO muda de significado: continua sendo a medida de eixo a eixo.
    expect(perfil.comprimentoMm).toBe(4000);
  });

  it('canto de 60° avança pelo ÂNGULO, não por meia espessura', () => {
    // Duas paredes saindo do mesmo vértice com 60° entre elas: o avanço é
    // (t/2)/tg(30°) ≈ 129,9 mm — quase o dobro dos 75 mm do canto reto. É o
    // caso que uma "meia espessura sempre" erraria em silêncio.
    const { model, terreoId } = comTerreo();
    const m = applyBatch(model, [
      parede(terreoId, 0, 0, 4000, 0),
      // 60° em relação ao eixo +X.
      parede(terreoId, 0, 0, 2000, 3464),
    ]).model;

    const esperado = T / 2 / Math.tan(Math.PI / 6);
    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil.avancoAMm).toBeCloseTo(esperado, 0);
    expect(perfil.avancoAMm).toBeGreaterThan(T / 2);
    // A outra ponta segue livre.
    expect(perfil.avancoBMm).toBe(0);
  });

  it('parede do pavimento de cima no mesmo vértice NÃO conta como vizinha', () => {
    const { model, terreoId } = comTerreo();
    const comSuperior = applyCommand(model, {
      type: 'AddLevel',
      name: 'Pavimento 1',
      elevationMm: H,
      defaultHeightMm: H,
    });
    const superiorId = comSuperior.model.levels[1].id;

    const m = applyBatch(comSuperior.model, [
      parede(terreoId, 0, 0, 4000, 0),
      // Mesmo vértice (0,0), outro pavimento: em planta elas se tocam, no
      // espaço não. Sem o recorte por nível a ponta livre do térreo ganharia
      // avanço e a parede cresceria para dentro do vizinho.
      parede(superiorId, 0, 0, 0, 3000),
    ]).model;

    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    expect(perfil.avancoAMm).toBe(0);
    expect(perfil.avancoBMm).toBe(0);
  });
});
