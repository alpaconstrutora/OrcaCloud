/**
 * ESGOTO AUTOMÁTICO (18/09/2026, F5). Casa térrea: banheiro (lavatório,
 * chuveiro, vaso, caixa sifonada), cozinha (pia + caixa de gordura) e a caixa
 * de inspeção fora da casa. Depois, um sobrado com banheiro em cima.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  conexoesDerivadas,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type TipoDePontoHidraulico,
} from '../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, caimentoPct, dnPorUhc, planejarEsgoto, relancarEsgoto } from '../utils/blueprintEsgotoAutomatico';

type Trecho = Extract<Command, { type: 'AddTrecho' }>;

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const w = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
const esg = (levelId: string, tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command => ({
  type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo,
});

/** Banheiro 0–2000 × 0–3000 e cozinha 2000–5000 × 0–3000, CI fora (6000, −1500), CG fora (5500, −800). */
function casa(): { m: BlueprintModel; t: string } {
  const { m, t } = nivel();
  return {
    m: applyBatch(m, [
      w(t, 0, 0, 5000, 0), w(t, 5000, 0, 5000, 3000), w(t, 5000, 3000, 0, 3000), w(t, 0, 3000, 0, 0), w(t, 2000, 0, 2000, 3000),
      esg(t, 'LAVATORIO', 600, 2500, 500),
      esg(t, 'CHUVEIRO', 1500, 2500, 0),
      esg(t, 'CAIXA_SIFONADA', 1200, 2100, 0),
      esg(t, 'VASO_SANITARIO', 600, 800, 0),
      esg(t, 'PIA_COZINHA', 3500, 2600, 500),
      esg(t, 'CAIXA_GORDURA', 5500, -800, -400),
      esg(t, 'CAIXA_INSPECAO', 6000, -1500, -700),
    ]).model,
    t,
  };
}
const novos = (p: ReturnType<typeof planejarEsgoto>) => p.comandos.filter((c): c is Trecho => c.type === 'AddTrecho');
const em = (c: Trecho, x: number, y: number) => c.a.x === x && c.a.y === y;
const horizontal = (c: Trecho) => c.a.x !== c.b.x || c.a.y !== c.b.y;

describe('tabelas', () => {
  it('DN por UHC (NBR 8160) e caimento por DN', () => {
    expect([dnPorUhc(1), dnPorUhc(3), dnPorUhc(4), dnPorUhc(6), dnPorUhc(12), dnPorUhc(21)]).toEqual([40, 40, 50, 50, 75, 100]);
    expect(caimentoPct(50, HIPOTESES_ESGOTO_PADRAO)).toBe(2);
    expect(caimentoPct(100, HIPOTESES_ESGOTO_PADRAO)).toBe(1);
  });
});

describe('planejarEsgoto — casa térrea', () => {
  it('lavatório e chuveiro → caixa sifonada (DN 40 a 2 %); vaso → CI em 100 a 1 %; caixa sifonada → CI por UHC; pia → caixa de gordura → CI', () => {
    const { m } = casa();
    const p = planejarEsgoto(m);
    expect(p.motivo).toBeNull();
    expect(p.avisos).toEqual([]);
    const tr = novos(p);
    // Do lavatório (600,2500) sai um ramal horizontal DN 40 rumo à caixa sifonada.
    const doLavatorio = tr.filter((c) => horizontal(c) && em(c, 600, 2500));
    expect(doLavatorio).toHaveLength(1);
    expect(doLavatorio[0].bitolaMm).toBe(40);
    expect(doLavatorio[0].b).toEqual({ x: 1200, y: 2100 });
    expect(doLavatorio[0].cotaBMm).toBeLessThan(doLavatorio[0].cotaAMm);
    // Do vaso sai DN 100 e chega direto à CI (nunca pela caixa sifonada).
    const doVaso = tr.filter((c) => horizontal(c) && em(c, 600, 800));
    expect(doVaso).toHaveLength(1);
    expect(doVaso[0].bitolaMm).toBe(100);
    expect(doVaso[0].b).not.toEqual({ x: 1200, y: 2100 });
    // Da caixa sifonada: UHC 1 (própria) + 1 + 2 = 4 → DN 50.
    const daCaixa = tr.filter((c) => horizontal(c) && em(c, 1200, 2100));
    expect(daCaixa).toHaveLength(1);
    expect(daCaixa[0].bitolaMm).toBe(50);
    // A pia vai à caixa de gordura, e a caixa de gordura à CI.
    const daPia = tr.find((c) => horizontal(c) && em(c, 3500, 2600))!;
    expect(daPia.b).toEqual({ x: 5500, y: -800 });
    expect(tr.some((c) => horizontal(c) && em(c, 5500, -800))).toBe(true);
    expect(p.dnMaximoMm).toBe(100);
    expect(p.uhcTotal).toBe(1 + 2 + 1 + 6 + 3);
  });

  it('toda aresta horizontal DESCE, com o caimento mínimo do seu DN em mm inteiros; a prumada do aparelho chega ao ramal', () => {
    const { m } = casa();
    const p = planejarEsgoto(m);
    for (const c of novos(p).filter(horizontal)) {
      const comp = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
      const quedaMinima = Math.round((comp * caimentoPct(c.bitolaMm, HIPOTESES_ESGOTO_PADRAO)) / 100);
      expect(c.cotaAMm - c.cotaBMm, `${c.a.x},${c.a.y}→${c.b.x},${c.b.y}`).toBeGreaterThanOrEqual(quedaMinima);
      expect(Number.isInteger(c.cotaAMm) && Number.isInteger(c.cotaBMm)).toBe(true);
    }
    // O lavatório (cota 500) desce até o ramal sob o piso.
    const prumadaLav = novos(p).find((c) => !horizontal(c) && em(c, 600, 2500))!;
    expect(prumadaLav.cotaAMm).toBe(500);
    expect(prumadaLav.cotaBMm).toBeLessThanOrEqual(-150);
    // Aplicado: o kernel aceita e não sobra ponta aberta.
    const aplicado = applyBatch(m, p.comandos).model;
    expect(conexoesDerivadas(aplicado).pontasAbertas).toHaveLength(0);
  });

  it('a chegada na CI fica acima do fundo declarado; com a CI rasa, avisa "aprofunde"', () => {
    const { m } = casa();
    const p = planejarEsgoto(m);
    expect(p.cotaDeChegadaMm).not.toBeNull();
    expect(p.cotaDeChegadaMm!).toBeGreaterThanOrEqual(-700);
    const ci = m.terminais!.find((t) => t.tipoHidraulico === 'CAIXA_INSPECAO')!;
    const rasa = applyCommand(m, { type: 'SetTerminalProps', terminalId: ci.id, cotaMm: -200 }).model;
    const p2 = planejarEsgoto(rasa);
    expect(p2.avisos.some((a) => /aprofunde/.test(a))).toBe(true);
  });

  it('sem caixa de inspeção: motivo; banheiro sem coletor: aviso e o aparelho vai direto à CI', () => {
    const { m, t } = nivel();
    expect(planejarEsgoto(m).motivo).toMatch(/caixa de inspeção/);
    const semColetor = applyBatch(m, [
      w(t, 0, 0, 2000, 0), w(t, 2000, 0, 2000, 3000), w(t, 2000, 3000, 0, 3000), w(t, 0, 3000, 0, 0),
      esg(t, 'LAVATORIO', 600, 2500, 500),
      esg(t, 'CAIXA_INSPECAO', 4000, -1000, -700),
    ]).model;
    const p = planejarEsgoto(semColetor);
    expect(p.motivo).toBeNull();
    expect(p.avisos.some((a) => /sem caixa sifonada/.test(a))).toBe(true);
    expect(novos(p).find((c) => horizontal(c) && em(c, 600, 2500))!.b).toEqual({ x: 4000, y: -1000 });
  });

  it('IDEMPOTENTE e RELANÇÁVEL: aplicado, nada a fazer; relançar apaga os sugeridos e refaz', () => {
    const { m } = casa();
    const aplicado = applyBatch(m, planejarEsgoto(m).comandos).model;
    const p2 = planejarEsgoto(aplicado);
    expect(p2.comandos).toHaveLength(0);
    expect(p2.motivo).toMatch(/já estão ligados/);
    const rel = relancarEsgoto(aplicado);
    expect(rel.comandos.filter((c) => c.type === 'DeleteTrecho')).toHaveLength(aplicado.trechos!.length);
    expect(novos(rel).length).toBeGreaterThan(0);
  });
});

describe('planejarEsgoto — sobrado', () => {
  it('o banheiro do andar desce por um TUBO DE QUEDA DN 100 (rótulo TQ) que entra na árvore do térreo; a ventilação DN 50 sobe ao teto', () => {
    let { m } = nivel();
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [terreo, superior] = m.levels.map((l) => l.id);
    m = applyBatch(m, [
      w(superior, 0, 0, 2000, 0), w(superior, 2000, 0, 2000, 3000), w(superior, 2000, 3000, 0, 3000), w(superior, 0, 3000, 0, 0),
      esg(superior, 'LAVATORIO', 600, 2500, 500),
      esg(superior, 'CAIXA_SIFONADA', 1200, 2100, 0),
      esg(superior, 'VASO_SANITARIO', 600, 800, 0),
      esg(terreo, 'CAIXA_INSPECAO', 5000, -1500, -700),
    ]).model;
    const p = planejarEsgoto(m);
    expect(p.motivo).toBeNull();
    const tr = novos(p);
    const tq = tr.find((c) => c.rotulo === 'TQ')!;
    expect(tq).toBeTruthy();
    expect(tq.levelId).toBe(terreo);
    expect(tq.bitolaMm).toBe(100);
    expect(tq.a).toEqual({ x: 600, y: 800 }); // na posição do vaso (maior UHC)
    expect(tq.cotaAMm).toBeGreaterThan(tq.cotaBMm);
    const vent = tr.find((c) => c.rotulo === 'Ventilação')!;
    expect(vent.levelId).toBe(superior);
    expect(vent.bitolaMm).toBe(50);
    expect(vent.cotaBMm).toBe(2800);
    expect(p.pavimentos.find((x) => x.nome === 'Superior')?.tuboDeQueda).toBe(true);
    // A rede fecha: do andar à CI sem ponta aberta (a laje é o encontro).
    const aplicado = applyBatch(m, p.comandos).model;
    // A única ponta aberta é o topo da ventilação — ela termina ao ar livre mesmo.
    const abertas = conexoesDerivadas(aplicado).pontasAbertas;
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toMatchObject({ levelId: superior, cotaMm: 2800, no: { x: 600, y: 800 } });
    // No térreo, o TQ chega à CI em DN 100 (o vaso passa por ele).
    const doTq = tr.find((c) => c.levelId === terreo && horizontal(c) && em(c, 600, 800))!;
    expect(doTq.bitolaMm).toBe(100);
    expect(doTq.b).toEqual({ x: 5000, y: -1500 });
  });
});
