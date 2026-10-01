/**
 * DISTRIBUIÇÃO DE PONTOS HIDRÁULICOS por ambiente (18/09/2026, F3).
 *
 * Casa térrea com três cômodos em fila, cada um com porta na parede da frente:
 * banheiro 2×3 m, cozinha 3×3 m e área de serviço 2×3 m.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  pointInPolygon,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  HIPOTESES_PONTOS_PADRAO,
  kitDoAmbiente,
  planejarPontosDoAmbiente,
  planejarPontosDoNivel,
  pontosDaLouca,
  pontosEletricosDoComponente,
  pontosDasLoucasCriadas,
} from '../utils/blueprintPontosHidraulicos';
import { planejarEsgoto } from '../utils/blueprintEsgotoAutomatico';
import { ladosDePiso } from '../utils/blueprintDistribuicao';

function casa(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  // Três cômodos: x 0–2000 (banheiro), 2000–5000 (cozinha), 5000–7000 (serviço); y 0–3000.
  m = applyBatch(m, [
    w(0, 0, 7000, 0), w(7000, 0, 7000, 3000), w(7000, 3000, 0, 3000), w(0, 3000, 0, 0),
    w(2000, 0, 2000, 3000), w(5000, 0, 5000, 3000),
  ]).model;
  // Portas na parede da frente (y = 0), uma em cada cômodo.
  const frente = m.walls[0].id;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: frente, kind: 'door', offsetMm: 600, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: frente, kind: 'door', offsetMm: 3100, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: frente, kind: 'door', offsetMm: 5600, widthMm: 700, heightMm: 2100, sillMm: 0 },
  ]).model;
  const porX = (x: number) => m.spaces.find((s) => pointInPolygon(s.ring, point(x, 1500)))!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: porX(1000).id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'NameSpace', spaceId: porX(3500).id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' },
    { type: 'NameSpace', spaceId: porX(6000).id, name: 'Área de serviço', tipoDeAmbiente: 'COZINHA_SERVICO' },
  ]).model;
  return { m, t };
}

const espaco = (m: BlueprintModel, nome: string) => m.spaces.find((s) => s.name === nome)!;

describe('kit por ambiente', () => {
  it('banheiro → BANHEIRO; cozinha/serviço decide pelo NOME; sem tipo → nenhum', () => {
    const { m } = casa();
    expect(kitDoAmbiente(espaco(m, 'Banho'), m.labels)).toBe('BANHEIRO');
    expect(kitDoAmbiente(espaco(m, 'Cozinha'), m.labels)).toBe('COZINHA');
    expect(kitDoAmbiente(espaco(m, 'Área de serviço'), m.labels)).toBe('AREA_SERVICO');
  });
});

describe('planejarPontosDoAmbiente', () => {
  it('banheiro: vaso (AF+ESG), lavatório (AF+AQ+ESG), chuveiro (AF+AQ) e caixa sifonada (ESG) — sugeridos, nas cotas da ficha', () => {
    const { m } = casa();
    const plano = planejarPontosDoAmbiente(m, espaco(m, 'Banho'));
    expect(plano.kit).toBe('BANHEIRO');
    expect(plano.motivo).toBeNull();
    const porTipo = (tipo: string) => plano.pecas.find((p) => p.tipo === tipo)!;
    expect(porTipo('VASO_SANITARIO').disciplinas).toEqual(['AGUA_FRIA', 'ESGOTO']);
    expect(porTipo('LAVATORIO').disciplinas).toEqual(['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO']);
    expect(porTipo('CHUVEIRO').disciplinas).toEqual(['AGUA_FRIA', 'AGUA_QUENTE']); // esgoto pelo coletor
    expect(porTipo('CAIXA_SIFONADA').disciplinas).toEqual(['ESGOTO']);
    expect(plano.aCriar).toBe(2 + 3 + 2 + 1);
    const cmds = plano.comandos as Extract<Command, { type: 'AddTerminal' }>[];
    expect(cmds.every((c) => c.type === 'AddTerminal' && c.sugerida === true)).toBe(true);
    const chuveiroAF = cmds.find((c) => c.tipoHidraulico === 'CHUVEIRO' && c.disciplina === 'AGUA_FRIA')!;
    expect(chuveiroAF.cotaMm).toBe(2100);
    const vasoEsg = cmds.find((c) => c.tipoHidraulico === 'VASO_SANITARIO' && c.disciplina === 'ESGOTO')!;
    expect(vasoEsg.cotaMm).toBe(0);
    // Os pontos do mesmo aparelho ficam no MESMO (x, y).
    const lav = cmds.filter((c) => c.tipoHidraulico === 'LAVATORIO');
    expect(new Set(lav.map((c) => `${c.at.x},${c.at.y}`)).size).toBe(1);
  });

  it('todos os pontos caem DENTRO do anel recuado do ambiente, longe da face', () => {
    const { m } = casa();
    for (const nome of ['Banho', 'Cozinha', 'Área de serviço']) {
      const s = espaco(m, nome);
      const plano = planejarPontosDoAmbiente(m, s);
      const anel = ladosDePiso(s, m.walls.filter((w) => w.levelId === s.levelId)).map((l) => l.a);
      for (const p of plano.pecas) {
        expect(pointInPolygon(anel, p.ponto), `${nome} · ${p.tipo}`).toBe(true);
      }
      // Sem duas peças no mesmo lugar.
      const lugares = plano.pecas.map((p) => `${p.ponto.x},${p.ponto.y}`);
      expect(new Set(lugares).size, nome).toBe(lugares.length);
    }
  });

  it('cozinha: só a pia (AF+AQ+ESG); serviço: tanque, máquina e ralo seco', () => {
    const { m } = casa();
    const coz = planejarPontosDoAmbiente(m, espaco(m, 'Cozinha'));
    expect(coz.pecas.map((p) => p.tipo)).toEqual(['PIA_COZINHA']);
    expect(coz.pecas[0].disciplinas).toEqual(['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO']);
    const serv = planejarPontosDoAmbiente(m, espaco(m, 'Área de serviço'));
    expect(serv.pecas.map((p) => p.tipo)).toEqual(['TANQUE', 'MAQUINA_LAVAR', 'RALO_SECO']);
    expect(serv.pecas.find((p) => p.tipo === 'TANQUE')!.disciplinas).toEqual(['AGUA_FRIA', 'ESGOTO']);
  });

  it('água quente só nos tipos da hipótese; o coletor pode ser ralo sifonado', () => {
    const { m } = casa();
    const plano = planejarPontosDoAmbiente(m, espaco(m, 'Banho'), { ...HIPOTESES_PONTOS_PADRAO, aguaQuenteEm: [], coletorDoBanheiro: 'RALO_SIFONADO' });
    expect(plano.pecas.find((p) => p.tipo === 'CHUVEIRO')!.disciplinas).toEqual(['AGUA_FRIA']);
    expect(plano.pecas.some((p) => p.tipo === 'RALO_SIFONADO')).toBe(true);
    expect(plano.aCriar).toBe(2 + 2 + 1 + 1);
  });

  it('IDEMPOTENTE: aplicado, rodar de novo não cria nada; ligar a AQ depois cria só ela, no lugar do irmão', () => {
    const { m } = casa();
    const s = espaco(m, 'Banho');
    const semAQ = { ...HIPOTESES_PONTOS_PADRAO, aguaQuenteEm: [] as never[] };
    const p1 = planejarPontosDoAmbiente(m, s, semAQ);
    const aplicado = applyBatch(m, p1.comandos).model;
    const p2 = planejarPontosDoAmbiente(aplicado, espaco(aplicado, 'Banho'), semAQ);
    expect(p2.aCriar).toBe(0);
    expect(p2.motivo).toMatch(/já está completo/);
    const p3 = planejarPontosDoAmbiente(aplicado, espaco(aplicado, 'Banho'));
    expect(p3.aCriar).toBe(2); // AQ do lavatório e do chuveiro
    const cmds = p3.comandos as Extract<Command, { type: 'AddTerminal' }>[];
    const chuveiroExistente = aplicado.terminais!.find((t) => t.tipoHidraulico === 'CHUVEIRO')!;
    expect(cmds.find((c) => c.tipoHidraulico === 'CHUVEIRO')!.at).toEqual(chuveiroExistente.at);
  });

  it('ambiente sem tipo: motivo; kit FORÇADO na gaveta vale mesmo sem tipo', () => {
    const { m } = casa();
    const semTipo = applyCommand(m, { type: 'NameSpace', spaceId: espaco(m, 'Cozinha').id, name: 'Copa', tipoDeAmbiente: null }).model;
    const copa = semTipo.spaces.find((s) => s.name === 'Copa')!;
    expect(planejarPontosDoAmbiente(semTipo, copa).motivo).toMatch(/sem tipo hidráulico/);
    expect(planejarPontosDoAmbiente(semTipo, copa, HIPOTESES_PONTOS_PADRAO, 'COZINHA').aCriar).toBe(3);
  });

  it('o pavimento inteiro: um plano por ambiente classificado, num único lote válido no kernel', () => {
    const { m, t } = casa();
    const planos = planejarPontosDoNivel(m, t);
    expect(planos.map((p) => p.nome).sort()).toEqual(['Banho', 'Cozinha', 'Área de serviço'].sort());
    const lote = planos.flatMap((p) => p.comandos);
    const r = applyBatch(m, lote);
    expect(r.diff.created).toHaveLength(8 + 3 + 5);
    expect(r.model.terminais!.every((x) => x.sugerida)).toBe(true);
  });
});

describe('pontosDaLouca (27/09/2026): a peça desenhada lança os pontos dela', () => {
  // "na planta tem uma vaso sanitaria. o sistema nao reconheceu?"
  const terreo = () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    return { m, t: m.levels[0].id };
  };
  const colocar = (m: BlueprintModel, cmd: Command) => {
    const r = applyCommand(m, cmd);
    const pontos = pontosDasLoucasCriadas(r.model, r.diff.created);
    return { m: applyBatch(r.model, pontos).model, pontos };
  };

  it('A5 (plano pós-roadmap): box grande AFASTADO da parede — rodar de novo não duplica a água da face', () => {
    // O ponto de água nasce na FACE da parede (a 800 mm do centro do box); o "já lançado" media só
    // 600 mm a partir do centro, não achava o irmão e lançava outro no mesmo lugar.
    const { m: m0, t } = terreo();
    const m = applyCommand(m0, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(5000, 0), thicknessMm: 150, heightMm: 2800 } as Command).model;
    const { m: comBox } = colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'BOX', at: point(2500, 875), larguraMm: 1200, profundidadeMm: 1200 } as Command);
    const box = comBox.componentes!.find((c) => c.tipoId === 'BOX')!;
    const agua = comBox.terminais!.filter((x) => x.disciplina === 'AGUA_FRIA');
    expect(agua).toHaveLength(1);
    expect(Math.hypot(agua[0].at.x - box.at.x, agua[0].at.y - box.at.y)).toBeGreaterThan(600);
    expect(pontosDaLouca(comBox, box)).toEqual([]);
  });

  it('A5: a evaporadora afastada da parede — rodar de novo não duplica o ponto de ar-condicionado', () => {
    const { m: m0, t } = terreo();
    const m = applyCommand(m0, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(5000, 0), thicknessMm: 150, heightMm: 2800 } as Command).model;
    const { m: comEvap } = colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(2500, 750), profundidadeMm: 1200 } as Command);
    const evap = comEvap.componentes!.find((c) => c.tipoId === 'EVAPORADORA')!;
    expect((comEvap.terminais ?? []).filter((x) => x.tipoEletrico === 'AR_CONDICIONADO')).toHaveLength(1);
    expect(pontosEletricosDoComponente(comEvap, evap)).toEqual([]);
  });

  it('vaso → água fria + esgoto, no centro da peça, na cota da ficha; o esgoto automático passa a enxergá-lo', () => {
    const { m, t } = terreo();
    const { m: comVaso, pontos } = colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(6200, 5400) });
    expect(pontos.map((p) => p.disciplina).sort()).toEqual(['AGUA_FRIA', 'ESGOTO']);
    expect(pontos.every((p) => p.tipoHidraulico === 'VASO_SANITARIO' && p.at.x === 6200 && p.at.y === 5400)).toBe(true);
    expect(pontos.find((p) => p.disciplina === 'AGUA_FRIA')!.cotaMm).toBe(300);
    expect(pontos.some((p) => 'sugerida' in p)).toBe(false);
    const comCi = applyCommand(comVaso, {
      type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Caixa de inspeção', at: point(12800, 5200), cotaMm: -600, tipoHidraulico: 'CAIXA_INSPECAO',
    }).model;
    const plano = planejarEsgoto(comCi);
    expect(plano.motivo).toBeNull();
    expect(plano.aLigar).toBe(1);
  });

  it('lavatório ganha água quente (hipótese do kit); box não ganha esgoto (vai pelo coletor); peça sem ponto → nada', () => {
    const { m, t } = terreo();
    expect(colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'LAVATORIO', at: point(0, 0) }).pontos.map((p) => p.disciplina).sort())
      .toEqual(['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO']);
    expect(colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'BOX', at: point(0, 0) }).pontos.map((p) => p.disciplina))
      .not.toContain('ESGOTO');
    expect(colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'CAMA_CASAL', at: point(0, 0) }).pontos).toEqual([]);
  });

  it('IDEMPOTENTE: segunda chamada não duplica; a água que falta nasce junto da água irmã, o esgoto no centro', () => {
    const { m, t } = terreo();
    const { m: comVaso } = colocar(m, { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(1000, 1000) });
    const vaso = comVaso.componentes!.find((c) => c.tipoId === 'VASO')!;
    expect(pontosDaLouca(comVaso, vaso)).toEqual([]);
    // Só a água fria, a 300 mm do centro (o caso da planta do usuário: o ponto já lançado à mão).
    const r = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(1000, 1000) });
    const soAf = applyCommand(r.model, {
      type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Vaso sanitário', at: point(1300, 1000), cotaMm: 300, tipoHidraulico: 'VASO_SANITARIO',
    }).model;
    const faltam = pontosDaLouca(soAf, soAf.componentes![0]);
    expect(faltam).toHaveLength(1);
    expect(faltam[0].disciplina).toBe('ESGOTO');
    // O esgoto do vaso é no piso, no centro da peça — não junto da água.
    expect(faltam[0].at).toEqual({ x: 1000, y: 1000 });
    // Lavatório com só a água fria a 300 mm: a QUENTE nasce junto da fria.
    const lav = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'LAVATORIO', at: point(1000, 1000) }).model;
    const soAfLav = applyCommand(lav, {
      type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: point(1300, 1000), cotaMm: 600, tipoHidraulico: 'LAVATORIO',
    }).model;
    const aq = pontosDaLouca(soAfLav, soAfLav.componentes![0]).find((c) => c.disciplina === 'AGUA_QUENTE')!;
    expect(aq.at).toEqual({ x: 1300, y: 1000 });
  });

  it('"agua fria e quente passam embutidas nas paredes": junto da parede, a ÁGUA nasce na FACE atrás da peça; o esgoto, no centro', () => {
    const { m, t } = terreo();
    // Parede em y = 5725 (face interna em 5650); lavatório com o centro a 325 mm do eixo — a planta do usuário.
    const comParede = applyCommand(m, { type: 'AddWall', levelId: t, a: point(3475, 5725), b: point(11925, 5725), thicknessMm: 150, heightMm: 2800 }).model;
    const { pontos } = colocar(comParede, { type: 'AddComponente', levelId: t, tipoId: 'LAVATORIO', at: point(6600, 5400) });
    for (const d of ['AGUA_FRIA', 'AGUA_QUENTE'] as const) expect(pontos.find((c) => c.disciplina === d)!.at).toEqual({ x: 6600, y: 5650 });
    expect(pontos.find((c) => c.disciplina === 'ESGOTO')!.at).toEqual({ x: 6600, y: 5400 });
  });

  it('conjunto de banheiro: os filhos (vaso, lavatório, box) lançam os pontos de cada um', () => {
    const { m, t } = terreo();
    const { pontos } = colocar(m, { type: 'AddConjunto', levelId: t, tipoId: 'CONJUNTO_BANHEIRO', at: point(3000, 3000) });
    const tipos = new Set(pontos.map((p) => p.tipoHidraulico));
    expect(tipos).toEqual(new Set(['VASO_SANITARIO', 'LAVATORIO', 'CHUVEIRO']));
  });
});
