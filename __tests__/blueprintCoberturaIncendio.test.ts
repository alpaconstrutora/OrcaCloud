/**
 * INCÊNDIO E3.3 (30/09/2026): a cobertura dos hidrantes pelo percurso das
 * portas (mangueira + jato) e a proposta gulosa de hidrantes que cobre o resto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP } from '../utils/blueprintCalculoIncendio';
import { coberturaDosHidrantes, proporHidrantes } from '../utils/blueprintCoberturaIncendio';

/**
 * Corredor de 60 × 2 m (y 0–2000) com 10 salas de 6 × 6 m acima, uma porta de
 * 0,90 m do corredor para cada sala, e um hidrante no corredor perto de x = 1 m.
 */
function corredor(comHidrante = true): { m: BlueprintModel; l: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 0)];
  for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
  for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
  m = applyBatch(m, cmds).model;
  const portas: Command[] = m.walls
    .filter((x) => x.a.y === 2000 && x.b.y === 2000)
    .map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command);
  m = applyBatch(m, portas).model;
  m = applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? 'Corredor' : `Sala ${Math.round(Math.min(...s.ring.map((p) => p.x)) / 6000) + 1}` }) as Command)).model;
  if (comHidrante) m = applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'H', at: point(1000, 1000), cotaMm: 1300, tipoHidraulico: 'HIDRANTE_SIMPLES' } as Command).model;
  return { m, l };
}

describe('E3.3 · cobertura por alcance', () => {
  it('⚠️ PRONTO QUANDO: com 30 m de mangueira + 10 m de jato, as salas perto cobrem e as do fundo não', () => {
    const { m } = corredor();
    const c = coberturaDosHidrantes(m, HIP);
    expect(c.alcanceHidranteM).toBe(40);
    const sala = (n: number) => c.ambientes.find((a) => a.nome === `Sala ${n}`)!;
    expect(sala(1).coberto).toBe(true);
    expect(sala(10).coberto).toBe(false);
    // A distância é pelo percurso (porta da sala 10 fica a ~56 m pelo corredor), não em linha reta.
    expect(sala(10).distanciaM!).toBeGreaterThan(55);
    expect(c.descobertos.length).toBeGreaterThan(0);
  });

  it('a distância passa pela PORTA: a sala ao lado do hidrante, sem porta direta, conta o caminho até a porta dela', () => {
    const { m } = corredor();
    const c = coberturaDosHidrantes(m, HIP);
    const s1 = c.ambientes.find((a) => a.nome === 'Sala 1')!;
    // Hidrante em (1, 1); porta da sala 1 em x ≈ 2,95 m; canto mais longe da sala ~6,3 m depois.
    expect(s1.distanciaM!).toBeGreaterThan(8);
    expect(s1.distanciaM!).toBeLessThan(11);
  });

  it('sem hidrante, tudo descoberto; a proposta cobre TUDO com UM hidrante no meio do corredor (30 m + 6 m < 40 m)', () => {
    const { m } = corredor(false);
    expect(coberturaDosHidrantes(m, HIP).descobertos.length).toBe(11);
    const p = proporHidrantes(m, HIP);
    expect(p.semSolucao).toEqual([]);
    expect(p.comandos).toHaveLength(1);
    const at = (p.comandos[0] as unknown as { at: { x: number; y: number } }).at;
    expect(at.y).toBeLessThan(2000); // no corredor (a circulação tem preferência)
    expect(at.x).toBeGreaterThan(20000);
    expect(at.x).toBeLessThan(40000);
    const depois = applyBatch(m, p.comandos).model;
    expect(coberturaDosHidrantes(depois, HIP).descobertos).toEqual([]);
    expect(depois.terminais!.every((t) => t.sugerida)).toBe(true);
  });

  it('o alcance é premissa: com mangueira de 60 m, o hidrante da ponta cobre o corredor inteiro', () => {
    const { m } = corredor();
    expect(coberturaDosHidrantes(m, { ...HIP, comprimentoMangueiraHidranteM: 60 }).descobertos).toEqual([]);
  });

  it('com mangueira de 15 m, um hidrante não basta: a proposta põe mais de um', () => {
    const { m } = corredor(false);
    const hip = { ...HIP, comprimentoMangueiraHidranteM: 15 };
    const p = proporHidrantes(m, hip);
    expect(p.comandos.length).toBeGreaterThan(1);
    expect(coberturaDosHidrantes(applyBatch(m, p.comandos).model, hip).descobertos).toEqual([]);
  });
});
