/**
 * DR (5.1.3.2.2) e o PRÉ-DIMENSIONAMENTO dentro da Conferência NBR 5410
 * (13/09/2026, item 6).
 *
 * As duas regras leem o DECLARADO: o DR só é exigido onde o tipo do ambiente
 * (ou o chuveiro) manda; a seção/disjuntor/queda só é conferida quando há
 * tensão e pontos com potência — e o que não dá para avaliar é dito.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type TipoDeAmbiente,
} from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410, pontosQueExigemDR } from '../utils/blueprintNbr5410';

/** Duas salas 4 × 4 lado a lado; QDC na esquerda. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 8000, 0), p(8000, 0, 8000, 4000), p(8000, 4000, 0, 4000), p(0, 4000, 0, 0), p(4000, 0, 4000, 4000)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(100, 100), cotaMm: 1600 }).model;
  return m;
}

const classificar = (m: BlueprintModel, idx: number, name: string, tipoDeAmbiente: TipoDeAmbiente) =>
  applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[idx].id, name, tipoDeAmbiente }).model;

const circuito = (m: BlueprintModel, extras: Partial<Extract<Command, { type: 'AddCircuito' }>> = {}) => {
  const c = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ...extras }).model;
  return { m: c, id: c.circuitos[c.circuitos.length - 1].id };
};

const ponto = (
  m: BlueprintModel,
  x: number,
  y: number,
  tipoEletrico: 'TUG' | 'TUE' | 'LIGACAO_DIRETA' | 'ILUMINACAO_TETO',
  circuitoId: string,
  potenciaW: number | null = 100,
  tipo = tipoEletrico,
) => {
  const criado = applyCommand(m, {
    type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'ELETRICA', tipo, at: point(x, y), cotaMm: 300,
    tipoEletrico, potenciaW: potenciaW ?? undefined,
  }).model;
  const id = criado.terminais[criado.terminais.length - 1].id;
  return applyCommand(criado, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
};

const regra = (m: BlueprintModel, codigo: string) => conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((r) => r.codigo === codigo)!;

describe('5.1.3.2.2 · DR onde a norma exige', () => {
  it('⚠️ tomada no BANHEIRO sem DR declarado: FALTA; com protecaoDR true: cala', () => {
    let m = classificar(casa(), 0, 'Banho', 'BANHEIRO');
    const { m: m1, id } = circuito(m);
    m = ponto(m1, 2000, 75, 'TUG', id);
    const r = regra(m, '5.1.3.2.2');
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/sem DR declarado/);
    expect(r.achados[0].mensagem).toMatch(/tomada em Banho/);

    const comDR = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: id, protecaoDR: true }).model;
    expect(regra(comDR, '5.1.3.2.2').achados).toEqual([]);
  });

  it('declarado SEM DR onde é obrigatório é falta — e a mensagem diz que foi declarado', () => {
    let m = classificar(casa(), 0, 'Cozinha', 'COZINHA_SERVICO');
    const { m: m1, id } = circuito(m, { protecaoDR: false });
    m = ponto(m1, 2000, 75, 'TUG', id);
    expect(regra(m, '5.1.3.2.2').achados[0].mensagem).toMatch(/declarado SEM DR/);
  });

  it('tomada na SALA não exige; chuveiro (ligação direta) exige em qualquer cômodo', () => {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    const { m: m1, id } = circuito(m);
    m = ponto(m1, 2000, 75, 'TUG', id);
    expect(regra(m, '5.1.3.2.2').achados).toEqual([]);
    expect(regra(m, '5.1.3.2.2').avaliados).toBe(0);

    const { m: m2, id: c2 } = circuito(m, { nome: 'C2', tensaoV: 220 });
    const comChuveiro = ponto(m2, 3000, 75, 'LIGACAO_DIRETA', c2, 5500, 'Chuveiro');
    const exigem = pontosQueExigemDR(comChuveiro, c2, []);
    expect(exigem).toHaveLength(1);
    expect(exigem[0].motivo).toMatch(/chuveiro/);
    expect(regra(comChuveiro, '5.1.3.2.2').achados.some((a) => /C2/.test(a.mensagem))).toBe(true);
  });
});

describe('PRE-DIM · seção, disjuntor e queda dentro da conferência', () => {
  it('⚠️ circuito de tomadas declarado com 1,5 mm² e 25 A: faltas com o nome do circuito e o item da norma', () => {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    const { m: m1, id } = circuito(m, { secaoMm2: 1.5, disjuntorA: 25 });
    m = m1;
    for (const x of [1000, 2000, 3000]) m = ponto(m, x, 75, 'TUG', id, 600);
    const r = regra(m, 'PRE-DIM');
    expect(r.avaliados).toBe(1);
    const msgs = r.achados.map((a) => a.mensagem);
    expect(msgs.some((x) => /^C1 \(6\.2\.6\.1\.1 \/ Tab\. 47\)/.test(x))).toBe(true);
    expect(msgs.some((x) => /^C1 \(5\.3\.4\.1\)/.test(x))).toBe(true);
    // "ver" leva ao quadro e aos pontos do circuito.
    expect(r.achados[0].ids).toContain(m.quadros[0].id);
  });

  it('atendido (2,5 mm², 16 A, 14 A de carga): cala; sem tensão: não avaliado, dito', () => {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    const { m: m1, id } = circuito(m, { secaoMm2: 2.5, disjuntorA: 16 });
    m = m1;
    for (const x of [1000, 2000, 3000]) m = ponto(m, x, 75, 'TUG', id, 600);
    expect(regra(m, 'PRE-DIM').achados).toEqual([]);

    const semTensao = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: id, tensaoV: null }).model;
    const r = regra(semTensao, 'PRE-DIM');
    expect(r.achados).toEqual([]);
    expect(r.naoAvaliado.join(' ')).toMatch(/C1: sem tensão/);
  });

  it('as hipóteses mudam o veredito: com 3 circuitos por eletroduto (f 0,70), 2,5 mm² deixa de aguentar 18,9 A', () => {
    let m = classificar(casa(), 0, 'Sala', 'SALA_DORMITORIO');
    const { m: m1, id } = circuito(m, { secaoMm2: 2.5, disjuntorA: 20 });
    m = m1;
    for (const x of [1000, 2000, 3000, 3500]) m = ponto(m, x, 75, 'TUG', id, 600); // 2.400 VA → 18,9 A
    // Sozinho no eletroduto: Iz 24 ≥ 18,9 e In 20 cabe → nada a acusar.
    expect(conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((r) => r.codigo === 'PRE-DIM')!.achados).toEqual([]);
    // Com 2 circuitos (f 0,80) Iz = 19,2 ainda passa por 0,3 A; com 3 (f 0,70) Iz = 16,8 < 18,9.
    const agrupado = conferirNbr5410(m, null, { ...HIPOTESES_PADRAO, circuitosAgrupados: 3 });
    const r = agrupado.regras.find((x) => x.codigo === 'PRE-DIM')!;
    expect(r.achados.some((a) => /Tab\. 36/.test(a.mensagem))).toBe(true);
  });
});
