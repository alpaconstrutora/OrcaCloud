/**
 * A REDE PELAS PAREDES (27/09/2026, pedido com print: "tubulacao de agua fria
 * e quente deve passar pelas paredes").
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Wall } from '../utils/blueprintKernel';
import { arvorePelasParedes } from '../utils/blueprintRotaPelasParedes';
import { planejarAgua } from '../utils/blueprintAguaAutomatica';

function sala(): { m: BlueprintModel; t: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  // Sala 4 × 3 m e uma parede interna em T no meio (x = 2000).
  return { m: applyBatch(base, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000)]).model, t };
}

/** O segmento a→b está sobre o eixo de alguma parede? */
const sobreParede = (paredes: readonly Wall[], a: { x: number; y: number }, b: { x: number; y: number }) =>
  paredes.some((w) => {
    const cruz = (p: { x: number; y: number }) => (w.b.x - w.a.x) * (p.y - w.a.y) - (w.b.y - w.a.y) * (p.x - w.a.x);
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const dentro = (p: { x: number; y: number }) => {
      const t = ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / (L * L);
      return t >= -1e-6 && t <= 1 + 1e-6;
    };
    return Math.abs(cruz(a)) / L <= 1 && Math.abs(cruz(b)) / L <= 1 && dentro(a) && dentro(b);
  });

describe('arvorePelasParedes', () => {
  it('liga a raiz ao ponto da parede oposta PELAS paredes (nunca pelo meio da sala)', () => {
    const { m } = sala();
    const r = arvorePelasParedes({ paredes: m.walls, raiz: { x: 75, y: 1500 }, pendentes: [{ x: 3925, y: 1500 }], raioDeEncaixeMm: 700 });
    expect(r.raiz).toEqual({ x: 0, y: 1500 });
    expect(r.encaixe.get('3925,1500')).toEqual({ x: 4000, y: 1500 });
    expect(r.arestas.length).toBeGreaterThan(0);
    for (const a of r.arestas) expect(sobreParede(m.walls, a.de, a.para), `${a.de.x},${a.de.y}→${a.para.x},${a.para.y}`).toBe(true);
  });

  it('trecho reto ao longo da mesma parede sai INTEIRO (o nó de passagem some)', () => {
    const { m } = sala();
    // Da ponta esquerda à direita da parede de baixo: passa pelo encontro do T em x = 2000.
    const r = arvorePelasParedes({ paredes: m.walls, raiz: { x: 500, y: 75 }, pendentes: [{ x: 3500, y: 75 }], raioDeEncaixeMm: 700 });
    expect(r.arestas).toEqual([{ de: { x: 500, y: 0 }, para: { x: 3500, y: 0 } }]);
  });

  it('ponto longe de qualquer parede (a ilha) fica de fora', () => {
    const { m } = sala();
    const r = arvorePelasParedes({ paredes: m.walls, raiz: { x: 75, y: 1500 }, pendentes: [{ x: 1000, y: 1500 }], raioDeEncaixeMm: 700 });
    expect(r.foraDaParede).toEqual([{ x: 1000, y: 1500 }]);
    expect(r.arestas).toEqual([]);
  });
});

describe('planejarAgua pelas paredes', () => {
  it("caixa d'água no canto, lavatório e chuveiro na face: todo horizontal novo está no EIXO de uma parede; a descida é no eixo e sai à face", () => {
    const { m, t } = sala();
    const mm = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LV', at: point(3925, 1000), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'CH', at: point(3925, 2500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
    ]).model;
    const plano = planejarAgua(mm, mm.terminais![0]);
    expect(plano.motivo).toBeNull();
    const trechos = plano.comandos.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    const horizontais = trechos.filter((c) => c.a.x !== c.b.x || c.a.y !== c.b.y);
    // Os tocos de saída (eixo → face, 75 mm) são os únicos fora do eixo.
    const naCotaDoRamal = horizontais.filter((c) => c.cotaAMm === 2200 && c.cotaBMm === 2200);
    expect(naCotaDoRamal.length).toBeGreaterThan(0);
    for (const c of naCotaDoRamal) expect(sobreParede(mm.walls, c.a, c.b), `${c.a.x},${c.a.y}→${c.b.x},${c.b.y}`).toBe(true);
    // O lavatório: desce no eixo (4000, 1000) e sai a 600 para a face (3925, 1000).
    expect(trechos.some((c) => c.a.x === 4000 && c.a.y === 1000 && c.b.x === 4000 && c.b.y === 1000 && Math.min(c.cotaAMm, c.cotaBMm) === 600)).toBe(true);
    expect(trechos.some((c) => c.cotaAMm === 600 && c.cotaBMm === 600 && c.b.x === 3925 && c.b.y === 1000)).toBe(true);
    expect(plano.avisos.filter((a) => /linha reta/.test(a))).toEqual([]);
  });

  it('BARRILETE também pelas paredes: com uma pia do outro lado da sala, nada no teto cruza o cômodo', () => {
    const { m, t } = sala();
    const mm = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LV', at: point(75, 1800), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Pia', at: point(3925, 2600), cotaMm: 1100, tipoHidraulico: 'PIA_COZINHA' },
    ]).model;
    const plano = planejarAgua(mm, mm.terminais![0]);
    const trechos = plano.comandos.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    const noAlto = trechos.filter((c) => (c.a.x !== c.b.x || c.a.y !== c.b.y) && c.cotaAMm >= 2200 && c.cotaBMm >= 2200);
    expect(noAlto.some((c) => c.cotaAMm === 2800)).toBe(true);
    for (const c of noAlto) expect(sobreParede(mm.walls, c.a, c.b), `${c.a.x},${c.a.y}→${c.b.x},${c.b.y} @${c.cotaAMm}`).toBe(true);
  });

  it('pelasParedes: false volta ao traçado reto de antes', () => {
    const { m, t } = sala();
    const mm = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LV', at: point(3925, 1000), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
    ]).model;
    const reto = planejarAgua(mm, mm.terminais![0], { velocidadeMaxMs: 2, dnMinimoAguaFriaMm: 20, dnMinimoAguaQuenteMm: 22, cotaRamalMm: 2200, raioDaColunaMm: 1500, rotaMaximaVezes: 1.5, pelasParedes: false });
    const trechos = reto.comandos.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho');
    // A coluna fica no ponto (face), como antes: prumada em (3925, 1000).
    expect(trechos.some((c) => c.a.x === 3925 && c.b.x === 3925 && c.a.y === 1000 && c.b.y === 1000)).toBe(true);
  });
});
