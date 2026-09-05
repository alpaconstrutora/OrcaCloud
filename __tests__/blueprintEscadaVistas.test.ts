/**
 * ESCADA E RAMPA nas VISTAS e nas SAÍDAS — o caminho da família até o desenho.
 *
 * O kernel está em `blueprintEscada.test.ts`. Aqui se prova o que as vistas
 * fazem com ele, e as armadilhas são de outra natureza:
 *
 *   1. de LADO a escada é um serrote; de FRENTE, um retângulo — e é a MESMA
 *      projeção que produz os dois, sem caso especial;
 *   2. no CORTE, o degrau cortado é retângulo e a rampa cortada é trapézio —
 *      a cota vem interpolada, não achatada na média;
 *   3. o IFC leva o número de degraus que o desenho usou, e o tipo pela
 *      contagem de vértices;
 *   4. a LAJE sai descontada do furo no quantitativo, e o desconto acompanha a
 *      escada quando ela se move;
 *   5. DXF e diff a reconhecem por nome.
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */

import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { projetarElevacao } from '../utils/blueprintElevation';
import { projetarCorte } from '../utils/blueprintCorte';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';
import { diffSnapshots } from '../utils/blueprintDiff';
import { gerarIfc } from '../utils/blueprintIfc';

const PE_DIREITO = 2800;
const COTA_PAV1 = 2920;

function doisPavimentos(): { model: BlueprintModel; terreo: string } {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: PE_DIREITO,
  });
  const b = applyCommand(a.model, {
    type: 'AddLevel',
    name: 'Pavimento 1',
    elevationMm: COTA_PAV1,
    defaultHeightMm: PE_DIREITO,
  });
  return { model: b.model, terreo: b.model.levels[0].id };
}

/**
 * O lance reto de `blueprintEscada.test.ts`: eixo (0,0)→(4600,0), 1,20 m de
 * largura. 17 espelhos de 171,76 mm, 16 pisadas de 287,5 mm. A pegada vai de
 * y = −600 a y = +600.
 */
function comLance(tipo: 'ESCADA' | 'RAMPA' = 'ESCADA'): { model: BlueprintModel; id: string } {
  const { model, terreo } = doisPavimentos();
  const r = applyCommand(model, {
    type: 'AddEscada',
    levelId: terreo,
    tipo,
    pontos: [point(0, 0), point(4600, 0)],
    larguraMm: 1200,
  });
  return { model: r.model, id: r.model.stairs[0].id };
}

const OPCOES_IFC = { titulo: 'Casa', revisao: 1, hash: 'h', studyId: 'e1' };

// ─────────────────────────────────────────────────────────────────────────────

describe('escada · 1. elevação', () => {
  it('de LADO, cada fatia é um retângulo do piso ao topo do degrau — o serrote', () => {
    // Olhando de FRENTE (direção da vista ao longo de −y, u = x), o eixo da
    // escada corre ao longo de u. A fatia 0 vai de u = 0 a 287,5, do piso (0)
    // até 171,76; a fatia 15 vai de 4312,5 a 4600, até 16 × 171,76 = 2748,2.
    const { model } = comLance();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });
    const e = proj.escadas.find((x) => x.tipo === 'ESCADA')!;

    expect(e).toBeDefined();
    expect(e.degenerada).toBe(false);
    expect(e.fatias).toHaveLength(16);

    const us0 = e.fatias[0].map((p) => p.u);
    const vs0 = e.fatias[0].map((p) => p.v);
    expect(Math.min(...us0)).toBe(0);
    expect(Math.max(...us0)).toBe(288); // 287,5 arredondado no `projU`
    expect(Math.min(...vs0)).toBe(0);
    expect(Math.max(...vs0)).toBe(172);

    const vs15 = e.fatias[15].map((p) => p.v);
    expect(Math.max(...vs15)).toBe(2748);
    // O topo da escada é o piso de cima, e a última fatia para UM espelho
    // abaixo dele: 2920 − 171,76 = 2748.
    expect(e.vMax).toBe(2748);
  });

  it('de FRENTE (na direção do eixo), a escada colapsa num retângulo da largura', () => {
    // Vista LATERAL_ESQUERDA olha ao longo de x, então u = y: toda fatia vai
    // de u = −600 a +600 e a silhueta é um retângulo de 1,20 m — nenhum
    // serrote, e é a MESMA projeção que fez o serrote acima.
    const { model } = comLance();
    const proj = projetarElevacao(model, { direcao: 'LATERAL_ESQUERDA' });
    const e = proj.escadas[0];

    expect(e.uMax - e.uMin).toBe(1200);
    for (const fatia of e.fatias) {
      const us = fatia.map((p) => p.u);
      expect(Math.max(...us) - Math.min(...us)).toBe(1200);
    }
  });

  it('a escada entra no enquadramento da elevação', () => {
    // Sem parede nenhuma, a caixa é a da escada: u de 0 a 4600 (frente).
    const { model } = comLance();
    const proj = projetarElevacao(model, { direcao: 'FRENTE' });
    expect(proj.bbox.uMin).toBe(0);
    expect(proj.bbox.uMax).toBe(4600);
    expect(proj.bbox.vMax).toBe(2748);
  });
});

describe('escada · 2. corte', () => {
  it('cortada de través, cada fatia atravessada sai como RETÂNGULO', () => {
    // Corte em x = 1000 (linha vertical), olhando para +x. O plano cruza a
    // fatia 3 (u de 862,5 a 1150) — e só ela. A face é o retângulo da largura
    // (u de −600 a 600 em planta → aqui u = y) do piso até a cota do degrau 3:
    // 4 × 171,76 = 687,06.
    const { model } = comLance();
    const comCorte = applyCommand(model, {
      type: 'AddCorte',
      a: point(1000, -2000),
      b: point(1000, 2000),
    }).model;
    const proj = projetarCorte(comCorte, { corte: comCorte.sections[0] });

    const faces = proj.cortados.filter((c) => c.familia === 'ESCADA');
    expect(faces).toHaveLength(1);
    const vs = faces[0].pontos.map((p) => p.v);
    expect(Math.min(...vs)).toBe(0);
    expect(Math.max(...vs)).toBeCloseTo(687.06, 1);
    // Retângulo: as duas cotas de topo são iguais.
    expect(faces[0].pontos[1].v).toBeCloseTo(faces[0].pontos[2].v, 6);
  });

  it('a RAMPA cortada ao longo do eixo sai como TRAPÉZIO, não como degrau', () => {
    // Corte em y = 0 (ao longo do eixo), olhando para +y. A rampa é uma fatia
    // só; a face vai do piso na partida (u = 0, v = 0) até o topo na chegada
    // (u = 4600, v = 2920). Se a cota fosse achatada na média, as duas pontas
    // teriam v = 1460 e o desenho mostraria um degrau onde há rampa.
    const { model } = comLance('RAMPA');
    const comCorte = applyCommand(model, {
      type: 'AddCorte',
      a: point(-1000, 0),
      b: point(6000, 0),
    }).model;
    const proj = projetarCorte(comCorte, { corte: comCorte.sections[0] });

    const faces = proj.cortados.filter((c) => c.familia === 'ESCADA');
    expect(faces).toHaveLength(1);
    const p = faces[0].pontos;
    // [ (ua, piso), (ua, cotaA), (ub, cotaB), (ub, piso) ]
    expect(p[0].u).toBe(0);
    expect(p[1].v).toBeCloseTo(0, 6);
    expect(p[2].u).toBe(4600);
    expect(p[2].v).toBeCloseTo(COTA_PAV1, 6);
    expect(p[1].v).not.toBeCloseTo(p[2].v, 0);
  });

  it('a escada ATRÁS do plano sai como vista, não como face cortada', () => {
    // Corte em y = 1000 olhando para −y: a escada inteira (y de −600 a 600)
    // está atrás. Nenhuma face cortada; uma silhueta na lista de vista.
    const { model } = comLance();
    const comCorte = applyCommand(model, {
      type: 'AddCorte',
      a: point(-1000, 1000),
      b: point(6000, 1000),
      olharPara: 'DIREITA',
    }).model;
    const proj = projetarCorte(comCorte, { corte: comCorte.sections[0] });

    expect(proj.cortados.filter((c) => c.familia === 'ESCADA')).toHaveLength(0);
    expect(proj.escadas).toHaveLength(1);
  });
});

describe('escada · 3. IFC', () => {
  it('sai como IfcStair com o número de degraus do desenho e o tipo pela forma', () => {
    const { model } = comLance();
    const ifc = gerarIfc(model, OPCOES_IFC);

    expect(ifc.match(/IFCSTAIR\(/g)).toHaveLength(1);
    expect(ifc).toContain('.STRAIGHT_RUN_STAIR.');
    expect(ifc).toContain("'Pset_StairCommon'");
    expect(ifc).toMatch(/'NumberOfRiser',\$,IFCINTEGER\(17\)/);
    expect(ifc).toMatch(/'NumberOfTreads',\$,IFCINTEGER\(16\)/);
    // 16 sólidos numa representação só: um por fatia.
    expect(ifc.match(/IFCEXTRUDEDAREASOLID\(/g)!.length).toBeGreaterThanOrEqual(16);
    expect(ifc).toContain("'Qto_StairBaseQuantities'");
  });

  it('a rampa sai como IfcRamp, e o L vira QUARTER_TURN', () => {
    const { model, terreo } = doisPavimentos();
    const r = applyCommand(model, {
      type: 'AddEscada',
      levelId: terreo,
      tipo: 'RAMPA',
      pontos: [point(0, 0), point(20000, 0), point(20000, 20000)],
      larguraMm: 1500,
    }).model;
    const ifc = gerarIfc(r, OPCOES_IFC);

    expect(ifc.match(/IFCRAMP\(/g)).toHaveLength(1);
    expect(ifc).toContain('.QUARTER_TURN_RAMP.');
    expect(ifc).toContain("'Pset_RampCommon'");
    expect(ifc).toContain("'Qto_RampBaseQuantities'");
    expect(ifc).not.toContain('IFCSTAIR(');
  });

  it('a cobertura passa a dizer que TEM escada — e o que continua de fora', () => {
    const { model } = comLance();
    const ifc = gerarIfc(model, OPCOES_IFC);
    expect(ifc).toMatch(/CONT[ÉE]M escada e rampa/);
    expect(ifc).toMatch(/N[ÃA]O CONT[ÉE]M forro/);
  });
});

describe('escada · 4. quantitativo', () => {
  const laje = (levelId: string, baseMm: number): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'LAJE',
    pontos: [point(-1000, -1000), point(6000, -1000), point(6000, 2000), point(-1000, 2000)],
    alturaMm: 120,
    baseMm,
  });

  it('a laje de teto sai DESCONTADA do furo, em área e em volume', () => {
    // Laje 7 × 3 m = 21 m², 120 mm → 2,52 m³. O furo é a pegada inteira da
    // escada: 4,6 × 1,2 = 5,52 m² → sobra 15,48 m² e 15,48 × 0,12 = 1,8576 m³.
    const { model, terreo } = doisPavimentos();
    const comLaje = applyBatch(model, [
      laje(terreo, 2800),
      {
        type: 'AddEscada',
        levelId: terreo,
        pontos: [point(0, 0), point(4600, 0)],
        larguraMm: 1200,
      },
    ]).model;
    const q = computeQuantities(comLaje, POLITICA_PADRAO, 'teste');

    expect(q.escadas).toHaveLength(1);
    expect(q.escadas[0].degraus).toBe(17);
    expect(q.escadas[0].areaFuroLajeM2).toBeCloseTo(5.52, 6);
    expect(q.estruturas[0].areaPlantaM2).toBeCloseTo(15.48, 6);
    expect(q.estruturas[0].volumeConcretoM3).toBeCloseTo(1.8576, 6);
    expect(q.totais.degraus).toBe(17);
    expect(q.totais.areaEscadasM2).toBeCloseTo(5.52, 6);
  });

  it('a laje de PISO não perde nada', () => {
    const { model, terreo } = doisPavimentos();
    const comLaje = applyBatch(model, [
      laje(terreo, 0),
      {
        type: 'AddEscada',
        levelId: terreo,
        pontos: [point(0, 0), point(4600, 0)],
        larguraMm: 1200,
      },
    ]).model;
    const q = computeQuantities(comLaje, POLITICA_PADRAO, 'teste');
    expect(q.estruturas[0].areaPlantaM2).toBeCloseTo(21, 6);
    expect(q.escadas[0].areaFuroLajeM2).toBe(0);
  });
});

describe('escada · 5. DXF e diff', () => {
  it('no DXF a escada tem camada própria em planta, e os espelhos saem como linhas', () => {
    const { model } = comLance();
    const dxf = gerarDxf(model, { titulo: 'Casa', revisao: 1, hash: 'h' });

    expect(dxf).toContain(`\n8\n${CAMADAS.ESCADA}\n`);
    // 17 espelhos + 1 trecho de eixo = 18 LINEs na camada, no mínimo.
    const linhasNaCamada = dxf.split('\n0\nLINE\n').filter((t) => t.startsWith(`8\n${CAMADAS.ESCADA}`));
    expect(linhasNaCamada.length).toBeGreaterThanOrEqual(18);
    expect(dxf).toContain('SOBE');
  });

  it('na elevação do DXF, um polígono por fatia em ELEVACAO-ESCADA', () => {
    const { model } = comLance();
    const dxf = gerarDxf(model, {
      titulo: 'Casa',
      revisao: 1,
      hash: 'h',
      elevacoes: [projetarElevacao(model, { direcao: 'FRENTE' })],
    });
    const polis = dxf.split('\n0\nPOLYLINE\n').filter((t) => t.startsWith(`8\n${CAMADAS.ELEV_ESCADA}`));
    expect(polis).toHaveLength(16);
  });

  it('o diff nomeia a escada pelo número de degraus e vê a cota do pavimento mudar', () => {
    // Acrescentar 200 mm ao pavimento de cima muda o desnível para 3120 e o
    // número de degraus para round(3120/175) = round(17,83) = 18. A escada não
    // foi tocada — e a frase tem de dizer que ela mudou mesmo assim.
    const { model, id } = comLance();
    const pav1 = model.levels[1];
    const depois = applyCommand(model, {
      type: 'SetLevelProps',
      levelId: pav1.id,
      elevationMm: 3120,
    }).model;
    const d = diffSnapshots(model, depois);

    const alteradas = d.alteracoes.filter((a) => a.tipo === 'ESCADA_ALTERADA');
    expect(alteradas).toHaveLength(1);
    expect(alteradas[0].descricao).toContain('17 → 18 degraus');
    expect(alteradas[0].uid).toBe(model.stairs.find((e) => e.id === id)!.uid);

    const adicionada = diffSnapshots(doisPavimentos().model, model).alteracoes.find(
      (a) => a.tipo === 'ESCADA_ADICIONADA',
    );
    expect(adicionada?.descricao).toContain('de 17 degraus');
    expect(adicionada?.pesoM2).toBeCloseTo(5.52, 6);
  });
});
