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
} from '../utils/blueprintPontosHidraulicos';
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
