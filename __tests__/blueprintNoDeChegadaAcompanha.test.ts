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
    // O nó anda o deslocamento inteiro: o toco segue com 50 mm.
    expect(toco.a).toEqual({ x: 2550, y: 53 });
    expect(toco.b).toEqual({ x: 2550, y: 3 });
    expect(luz.a).toEqual({ x: 0, y: 3000 });
    expect(luz.b).toEqual({ x: 2550, y: 53 });
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

  it('⚠️ trocar de parede (movimento AO LONGO do toco) leva o nó: a luz vai direto ao lugar novo', () => {
    // Usuário, 25/10/2026: *"movi o interruptor para ao lado da porta … o trecho de eletroduto faz um caminho
    // mais longo … Isso aconteceu quando mudei o interruptor de uma parede para outra"*. A 1ª versão levava só a
    // componente perpendicular ao toco, e o nó ficava no canto antigo.
    const m = mover(cena(), 0, -1500);
    const [luz, toco] = m.trechos!;
    expect(toco.a).toEqual({ x: 2000, y: -1450 });
    expect(toco.b).toEqual({ x: 2000, y: -1500 });
    expect(luz.b).toEqual({ x: 2000, y: -1450 });
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
    expect(d.get(toco.id)).toEqual({ a: { x: 550, y: 3 }, b: { x: 550, y: 3 } });
    expect(d.get(luz.id)).toEqual({ a: null, b: { x: 550, y: 3 } });
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

describe('trecho selecionado · não se solta', () => {
  // Usuário, 25/10/2026, com print: *"é possivel arrastar um trecho do eletroduto e desconecta-lo"*.
  const moverTrecho = (m: BlueprintModel, ids: string[], dx: number, dy: number, terminalIds: string[] = []) =>
    applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], trechoIds: ids, terminalIds, delta: point(dx, dy), manterJuncoes: false }).model;

  it('⚠️ eletroduto entre a luz e o nó: a ponta na luz fica; a do nó anda e leva o toco junto', () => {
    const m0 = cena();
    const m = moverTrecho(m0, [m0.trechos![0].id], 300, -400);
    const [luz, toco] = m.trechos!;
    expect(luz.a).toEqual({ x: 0, y: 3000 });
    expect(luz.b).toEqual({ x: 2300, y: -350 });
    expect(toco.a).toEqual({ x: 2300, y: -350 });
    expect(toco.b).toEqual(S); // o toco termina no interruptor, que não andou
  });

  it('⚠️ preso a peças paradas nas DUAS pontas (luz → tomada, o print): não sai do lugar', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    for (const c of [
      { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(0, 0), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO' },
      { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 0), cotaMm: 300, tipoEletrico: 'TUG' },
      { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2800, cotaBMm: 300, bitolaMm: 20 },
    ] as Command[])
      m = applyCommand(m, c).model;
    const depois = moverTrecho(m, [m.trechos![0].id], -800, -1200);
    expect(depois.trechos![0].a).toEqual({ x: 0, y: 0 });
    expect(depois.trechos![0].b).toEqual({ x: 3000, y: 0 });
  });

  it('com a peça junto na seleção, o trecho anda inteiro', () => {
    const m0 = cena();
    const descida = m0.trechos![2];
    const m = moverTrecho(m0, [descida.id], 500, 0, [interruptor(m0).id]);
    expect(m.trechos![2].a).toEqual({ x: 2500, y: 0 });
    expect(m.trechos![2].b).toEqual({ x: 2500, y: 0 });
  });

  it('ponta solta (sem peça e sem vizinho) anda; água segue a mesma regra', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    for (const c of [
      { type: 'AddTerminal', levelId, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: point(0, 0), cotaMm: 600 },
      { type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(0, 0), b: point(2000, 0), cotaAMm: 600, cotaBMm: 600, bitolaMm: 25 },
      { type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(2000, 0), b: point(2000, 2000), cotaAMm: 600, cotaBMm: 600, bitolaMm: 25 },
    ] as Command[])
      m = applyCommand(m, c).model;
    const depois = moverTrecho(m, [m.trechos![1].id], 400, 0);
    const [ramal, coluna] = depois.trechos!;
    expect(ramal.a).toEqual({ x: 0, y: 0 });
    expect(ramal.b).toEqual({ x: 2400, y: 0 });
    expect(coluna.a).toEqual({ x: 2400, y: 0 });
    expect(coluna.b).toEqual({ x: 2400, y: 2000 });
  });
});
