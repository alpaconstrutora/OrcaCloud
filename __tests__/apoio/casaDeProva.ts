/**
 * A CASA DE PROVA — o modelo mais completo que sabemos montar.
 *
 * Ela nasceu para gerar o arquivo que alguém abre num visualizador de terceiro
 * (`ifcArquivoDeProva.test.ts`), e mora aqui porque passou a servir a mais de
 * um teste: o portão de contagem de atributos precisa dela para alcançar o
 * maior número possível de entidades DISTINTAS, e ele roda na suíte inteira,
 * não só com `IFC_PROVA=1`.
 *
 * Cada peça existe por causa de UMA pergunta da conferência — nada aqui é
 * decoração. O que cada uma responde está anotado onde ela é criada.
 */
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../utils/blueprintKernel';

export const H = 2800;
export const T = 200;

/**
 * A casa de prova.
 *
 * Cada peça existe por causa de UMA pergunta da conferência — nada aqui é
 * decoração.
 */
export function casaDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;

  const comSuperior = applyCommand(base, {
    type: 'AddLevel',
    name: 'Superior',
    elevationMm: H,
    defaultHeightMm: H,
  }).model;
  const s = comSuperior.levels[1].id;

  const parede = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  // Uma sala de 10 × 6 m. A fachada de baixo (y = 0) leva as portas, para todas
  // ficarem lado a lado na mesma parede — assim a comparação é entre vizinhas,
  // e não entre lados diferentes da casa.
  const m1 = applyBatch(comSuperior, [
    parede(t, 0, 0, 10000, 0),
    parede(t, 10000, 0, 10000, 6000),
    parede(t, 10000, 6000, 0, 6000),
    parede(t, 0, 6000, 0, 0),
  ]).model;

  const fachada = m1.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;

  const porta = (offsetMm: number, hingeAtStart: boolean, nome: string): Command => ({
    type: 'AddOpening',
    wallId: fachada.id,
    kind: 'door',
    offsetMm,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    hingeAtStart,
    swingReversed: false,
    esquadria: { nome, itemCode: '', descricao: '' },
  });

  const m2 = applyBatch(m1, [
    // 1. MÃOS OPOSTAS. Mesma medida, mesma parede, dobradiça em pontas
    //    diferentes: se o OperationType sair igual nas duas, a mão está perdida.
    porta(1000, true, 'PORTA-ESQUERDA'),
    porta(2500, false, 'PORTA-DIREITA'),
    // 2. IDÊNTICAS. Mesmo nome e mesma medida: têm de cair sob UM tipo só.
    porta(4500, true, 'P1-IGUAL'),
    porta(6000, true, 'P1-IGUAL'),
    // 3. Uma janela com PEITORIL, para conferir que ela não nasce no chão.
    {
      type: 'AddOpening',
      wallId: fachada.id,
      kind: 'window',
      offsetMm: 7500,
      widthMm: 1500,
      heightMm: 1200,
      sillMm: 1000,
    },
  ]).model;

  // 4. ESCADA subindo do térreo ao superior, no sentido +x.
  const m3 = applyCommand(m2, {
    type: 'AddEscada',
    levelId: t,
    tipo: 'ESCADA',
    pontos: [point(2000, 4000), point(6000, 4000)],
    larguraMm: 1200,
    desnivelMm: H,
  }).model;

  // 6. INSTALAÇÕES: um ponto, uma prumada até ele e uma corrida no forro.
  //
  // ⚠️ Elas entraram aqui em 08/09/2026 por um motivo específico: o portão de
  // contagem de atributos usa ESTE modelo, e sem instalação nele ele passava
  // sem nunca olhar `IfcFlowSegment`, `IfcFlowTerminal` nem
  // `IfcDistributionSystem`. Um portão que passa sem tocar no que deveria
  // guardar é pior que nenhum: ele dá a impressão de cobertura.
  // ⚠️ QUADRO e CIRCUITO entraram em 09/09/2026 pela MESMA razão das
  // instalações: sem eles aqui, o portão de contagem de atributos passava sem
  // nunca olhar `IfcDistributionBoard` nem `IfcDistributionCircuit`. É a
  // segunda vez que essa armadilha aparece, e ela é sempre a mesma — um portão
  // que passa sem tocar no que deveria guardar dá impressão de cobertura.
  const m3a0 = applyCommand(m3, {
    type: 'AddQuadro',
    levelId: t,
    nome: 'QDC',
    at: point(300, 300),
  }).model;
  const m3a = applyCommand(m3a0, {
    type: 'AddCircuito',
    quadroId: m3a0.quadros[0].id,
    nome: 'C1 — Tomadas',
    tipo: 'TOMADA',
    tensaoV: 127,
    disjuntorA: 20,
    secaoMm2: 2.5,
  }).model;

  const m3b = applyBatch(m3a, [
    {
      type: 'AddTerminal',
      levelId: t,
      disciplina: 'ELETRICA',
      tipo: 'Tomada baixa',
      at: point(1500, 300),
      cotaMm: 300,
    },
    {
      type: 'AddTrecho',
      levelId: t,
      disciplina: 'ELETRICA',
      a: point(1500, 300),
      b: point(1500, 300),
      cotaAMm: 300,
      cotaBMm: 2500,
      bitolaMm: 25,
    },
    {
      type: 'AddTrecho',
      levelId: t,
      disciplina: 'ESGOTO',
      a: point(1500, 300),
      b: point(8000, 300),
      cotaAMm: -100,
      cotaBMm: -230,
      bitolaMm: 100,
    },
  ]).model;

  // 5. TELHADO de uma água só, caindo para o lado de y = 0 (a fachada das
  //    portas), com beiral avançando 600 mm para fora.
  return applyCommand(m3b, {
    type: 'AddAgua',
    levelId: s,
    pontos: [point(-600, -600), point(10600, -600), point(10600, 6600), point(-600, 6600)],
    inclinacaoPct: 30,
    // A água cai NA DIREÇÃO deste vetor: para o −y, que é a fachada das portas.
    caimento: point(0, -1),
    beiralMm: 600,
  }).model;
}
