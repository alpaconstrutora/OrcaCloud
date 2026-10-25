/**
 * O NÓ DE CHEGADA que só serve à peça anda com ela (25/10/2026).
 *
 * *"Ao mover o interruptor o ponto nao veio junto, pois neste caso o ponto atende
 * somente ao interruptor entao deveria vir junto."* — plano
 * `docs/planos/2026-10-25-planta-interruptor-tomada-mobiliario.md`, item 1.
 *
 * A cena é a do motor dos eletrodutos: a rede da luz chega ao nó N no forro, um toco
 * de 50 mm vai de N até o alto da descida, e a descida vertical chega ao interruptor.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, deslocamentoDasPontasPresas, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';

const N = point(2000, 50);
const S = point(2000, 0);

function cena(extras: (levelId: string) => Command[] = () => []): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  const cmds: Command[] = [
    { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(0, 3000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO' },
    { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Interruptor', at: S, cotaMm: 1100, tipoEletrico: 'INTERRUPTOR' },
    // [0] luz → N, [1] o toco N → alto da descida, [2] a descida.
    { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 3000), b: N, cotaAMm: 2700, cotaBMm: 2700, bitolaMm: 20 },
    { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: N, b: S, cotaAMm: 2700, cotaBMm: 2700, bitolaMm: 20 },
    { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: S, b: S, cotaAMm: 2700, cotaBMm: 1100, bitolaMm: 20 },
    ...extras(levelId),
  ];
  for (const c of cmds) m = applyCommand(m, c).model;
  return m;
}

const interruptor = (m: BlueprintModel) => m.terminais!.find((t) => t.tipoEletrico === 'INTERRUPTOR')!;

const mover = (m: BlueprintModel, dx: number, dy: number) =>
  applyCommand(m, {
    type: 'TranslateEntities',
    wallIds: [],
    boundaryIds: [],
    structuralIds: [],
    terminalIds: [interruptor(m).id],
    delta: point(dx, dy),
    manterJuncoes: false,
  }).model;

describe('nó de chegada · acompanha a peça', () => {
  it('⚠️ arrastar o interruptor ao longo da parede leva o nó: toco com a mesma direção, luz até o nó novo', () => {
    const m = mover(cena(), 550, 3);
    const [luz, toco, descida] = m.trechos!;
    expect(interruptor(m).at).toEqual({ x: 2550, y: 3 });
    expect(descida.a).toEqual({ x: 2550, y: 3 });
    expect(descida.b).toEqual({ x: 2550, y: 3 });
    // Só a componente perpendicular ao toco leva o nó; os 3 mm ao longo dele o encurtam.
    expect(toco.a).toEqual({ x: 2550, y: 50 });
    expect(toco.b).toEqual({ x: 2550, y: 3 });
    expect(luz.a).toEqual({ x: 0, y: 3000 });
    expect(luz.b).toEqual({ x: 2550, y: 50 });
  });

  it('⚠️ forro rebaixado (Garden): a descida vertical do forro no nó anda inteira com ele', () => {
    // Na Garden a rede corre a 2755 no forro, desce no nó até 2438 e o toco segue a 2438.
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    for (const c of [
      { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Interruptor', at: S, cotaMm: 1100, tipoEletrico: 'INTERRUPTOR' },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 3000), b: N, cotaAMm: 2755, cotaBMm: 2755, bitolaMm: 20 },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: N, b: N, cotaAMm: 2755, cotaBMm: 2438, bitolaMm: 20 },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: N, b: S, cotaAMm: 2438, cotaBMm: 2438, bitolaMm: 20 },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: S, b: S, cotaAMm: 2438, cotaBMm: 1100, bitolaMm: 20 },
    ] as Command[])
      m = applyCommand(m, c).model;
    const [luz, doForro, toco] = mover(m, 550, 0).trechos!;
    expect(luz.b).toEqual({ x: 2550, y: 50 });
    expect(doForro.a).toEqual({ x: 2550, y: 50 });
    expect(doForro.b).toEqual({ x: 2550, y: 50 });
    expect(toco.a).toEqual({ x: 2550, y: 50 });
    expect(toco.b).toEqual({ x: 2550, y: 0 });
  });

  it('arrastar AO LONGO do toco só o encurta ou alonga — o nó fica', () => {
    const m = mover(cena(), 0, -200);
    const [luz, toco] = m.trechos!;
    expect(toco.a).toEqual(N);
    expect(toco.b).toEqual({ x: 2000, y: -200 });
    expect(luz.b).toEqual(N);
  });

  it('⚠️ nó de DERIVAÇÃO (serve a outro ponto) fica — o toco estica, como antes', () => {
    const base = cena((levelId) => [
      { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(4000, 0), cotaMm: 300, tipoEletrico: 'TUG' },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: N, b: point(4000, 0), cotaAMm: 2700, cotaBMm: 300, bitolaMm: 20 },
    ]);
    const m = mover(base, 550, 0);
    const [luz, toco, , derivacao] = m.trechos!;
    expect(toco.a).toEqual(N);
    expect(toco.b).toEqual({ x: 2550, y: 0 });
    expect(luz.b).toEqual(N);
    expect(derivacao.a).toEqual(N);
  });

  it('nó com outra peça elétrica em cima fica', () => {
    const base = cena((levelId) => [
      { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Caixa', at: N, cotaMm: 2700, tipoEletrico: 'CAIXA_PASSAGEM' },
    ]);
    const m = mover(base, 550, 0);
    expect(m.trechos![1].a).toEqual(N);
    expect(m.trechos![0].b).toEqual(N);
  });

  it('a prévia do canvas lê a mesma função: deslocamento por ponta', () => {
    const m = cena();
    const [luz, toco, descida] = m.trechos!;
    const d = deslocamentoDasPontasPresas(m, [interruptor(m).id], [], point(550, 3));
    expect(d.get(descida.id)).toEqual({ a: { x: 550, y: 3 }, b: { x: 550, y: 3 } });
    expect(d.get(toco.id)).toEqual({ a: { x: 550, y: 0 }, b: { x: 550, y: 3 } });
    expect(d.get(luz.id)).toEqual({ a: null, b: { x: 550, y: 0 } });
  });

  it('hidráulica não muda: o tubo preso ao ponto só estica', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    for (const c of [
      { type: 'AddTerminal', levelId, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: S, cotaMm: 600 },
      { type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(0, 3000), b: N, cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 25 },
      { type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: N, b: S, cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 25 },
    ] as Command[])
      m = applyCommand(m, c).model;
    const d = deslocamentoDasPontasPresas(m, [m.terminais![0].id], [], point(550, 0));
    expect(d.get(m.trechos![1].id)).toEqual({ a: null, b: { x: 550, y: 0 } });
    expect(d.has(m.trechos![0].id)).toBe(false);
  });
});
