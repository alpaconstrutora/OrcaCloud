/**
 * INCÊNDIO E5.4 (01/10/2026): o traçado da rede de sprinklers (espinha pela
 * ponta e pelo centro, grelha), o método das tabelas, a VGA e a demanda somada
 * de sprinklers e hidrantes na mesma bomba.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../utils/blueprintSprinklersIncendio';
import { comandosDaDistribuicao, distribuirSprinklers } from '../utils/blueprintDistribuicaoSprinklers';
import { dnPeloMetodoDasTabelas, metodoDasTabelas, tracarRedeDeSprinklers, vgasDaRede, type TipoDeTracado } from '../utils/blueprintRedeDeSprinklers';

const LEVE = criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null);

/** Salão de 12 × 8 m com a bomba no canto (0,5; 0,5) e a prumada até a cota dos ramais (2,65 m). */
function salao(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const c = [point(0, 0), point(12000, 0), point(12000, 8000), point(0, 8000)];
  m = applyBatch(m, c.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: c[(i + 1) % 4], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
  return applyBatch(m, [
    { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'BOMBA_INCENDIO', at: point(500, 500), cotaMm: 300, tipoHidraulico: 'BOMBA_INCENDIO' } as Command,
    { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(500, 500), b: point(500, 500), cotaAMm: 300, cotaBMm: 2650, bitolaMm: 65 } as Command,
  ]).model;
}

/** Distribui (a primeira alternativa) e traça junto, num lote só — o que o botão "Lançar" faz. */
function lancar(m: BlueprintModel, tipo: TipoDeTracado, sentido?: 'X' | 'Y') {
  const plano = distribuirSprinklers(m, m.spaces[0].id, LEVE, HS);
  const alt = sentido ? plano.alternativas.find((a) => a.sentido === sentido)! : plano.alternativas[0];
  const t = tracarRedeDeSprinklers(m, plano, alt, tipo, 'LEVE');
  return { m: applyBatch(m, [...comandosDaDistribuicao(plano, alt, 80), ...t.comandos]).model, t, alt };
}

describe('E5.4 · o método das tabelas', () => {
  it('DN pelo número de sprinklers a jusante (aço, CONFERIR NA NORMA); no extraordinário não vale', () => {
    expect([1, 2, 3, 4, 10, 11, 30, 31].map((n) => dnPeloMetodoDasTabelas(n, 'LEVE'))).toEqual([25, 25, 32, 40, 50, 65, 65, 80]);
    expect([20, 21, 40, 41, 100, 101].map((n) => dnPeloMetodoDasTabelas(n, 'ORDINARIO_2'))).toEqual([65, 80, 80, 90, 100, 125]);
    expect(dnPeloMetodoDasTabelas(3, 'EXTRA_1')).toBeNull();
  });
});

describe('E5.4 · o traçado', () => {
  it('espinha pela ponta: todo sprinkler entra na rede da bomba, o geral liga na prumada, o DN sai da tabela e o cálculo fecha', () => {
    const { m, t, alt } = lancar(salao(), 'PONTA');
    expect(t.motivo).toBeNull();
    expect(t.ligadoA).toEqual({ x: 500, y: 500 });
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.desligados).toEqual([]);
    expect(c.sistema).toBe('SPRINKLERS');
    expect(c.cenario!.terminais.every((x) => x.atende)).toBe(true);
    // Na árvore, o método das tabelas vale e o traçado já nasce no DN dela.
    const mt = metodoDasTabelas(m, 'LEVE');
    expect(mt.aplicavel).toBe(true);
    expect(mt.trechos.every((x) => x.atende)).toBe(true);
    // O trecho que leva todos os sprinklers (o geral) tem a contagem toda.
    expect(Math.max(...mt.trechos.map((x) => x.aJusante))).toBe(alt.contagem);
  });

  it('espinha pelo centro: o subgeral corta os ramais ao meio e o cálculo fecha', () => {
    const { m } = lancar(salao(), 'CENTRO', 'X');
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.desligados).toEqual([]);
    expect(c.cenario!.terminais.every((x) => x.atende)).toBe(true);
    expect(metodoDasTabelas(m, 'LEVE').aplicavel).toBe(true);
  });

  it('⚠️ PRONTO QUANDO: a grelha fecha no solver (laços) e o método das tabelas diz que não vale', () => {
    const { m } = lancar(salao(), 'GRELHA', 'X');
    const c = calculoDeIncendio(m, HIP, LEVE);
    expect(c.cenario!.convergiu).toBe(true);
    // Conservação: o que sai da bomba é o que os sprinklers abertos descarregam.
    expect(c.cenario!.vazaoNaFonteLmin).toBeCloseTo(c.cenario!.terminais.reduce((s, x) => s + x.vazaoLmin, 0), 6);
    expect(c.papel.size).toBeGreaterThan(0);
    expect([...c.papel.values()]).toContain('ANEL');
    const mt = metodoDasTabelas(m, 'LEVE');
    expect(mt.aplicavel).toBe(false);
    expect(mt.motivo).toMatch(/laço/);
  });

  it('sem rede de incêndio no pavimento, o geral não liga e diz por quê', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const c = [point(0, 0), point(12000, 0), point(12000, 8000), point(0, 8000)];
    m = applyBatch(m, c.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: c[(i + 1) % 4], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
    const plano = distribuirSprinklers(m, m.spaces[0].id, LEVE, HS);
    const t = tracarRedeDeSprinklers(m, plano, plano.alternativas[0], 'PONTA', 'LEVE');
    expect(t.ligadoA).toBeNull();
    expect(t.motivo).toMatch(/ligue o geral à mão/);
    expect(t.comandos.length).toBeGreaterThan(0);
  });
});

describe('E5.4 · VGA', () => {
  it('sem VGA, todo sprinkler vira FALTA; com a VGA na prumada, todos ficam a jusante dela', () => {
    const { m } = lancar(salao(), 'PONTA');
    expect(vgasDaRede(m).semVga.length).toBe(6);
    const item = (x: BlueprintModel) => conferenciaDeIncendio(x, calculoDeIncendio(x, HIP, LEVE), HIP).find((i) => i.item === 'Sprinklers a jusante de VGA')!;
    expect(item(m).estado).toBe('FALTA');
    const comVga = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'VGA', at: point(500, 500), cotaMm: 2650, tipoHidraulico: 'VGA' } as Command).model;
    const v = vgasDaRede(comVga);
    expect(v.vgas).toHaveLength(1);
    expect(v.vgas[0].sprinklers).toHaveLength(6);
    expect(v.semVga).toEqual([]);
    expect(item(comVga).estado).toBe('ATENDE');
  });
});

describe('E5.4 · a demanda somada', () => {
  /** O ramal da E5.1 (10 sprinklers) com um hidrante junto da bomba. */
  function ramal(): BlueprintModel {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    const t = (ax: number, ca: number, bx: number, cb: number, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
    const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
    const xs = Array.from({ length: 10 }, (_, i) => 3000 * (i + 1));
    return applyBatch(m, [p('BOMBA_INCENDIO', 0, 300), t(0, 300, 0, 2600, 65), ...xs.map((x) => t(x - 3000, 2600, x, 2600)), ...xs.map((x) => p('SPRINKLER', x, 2600, { fatorK: 80 })), t(0, 2600, 0, 1300, 65), p('HIDRANTE_SIMPLES', 0, 1300)]).model;
  }

  it('⚠️ PRONTO QUANDO: a rede combinada soma as demandas — a área e o hidrante abrem juntos e governam a bomba', () => {
    const m = ramal();
    const c = calculoDeIncendio(m, HIP, LEVE);
    const { hidrantes: h, sprinklers: s, combinado: k } = c.porSistema;
    expect(c.sistema).toBe('COMBINADO');
    expect(new Set(k!.abertos)).toEqual(new Set([...s!.abertos, ...h!.abertos]));
    // Cada um com a sua exigência: 7 × 85,7 L/min nos sprinklers + 300 L/min no hidrante, no mínimo.
    expect(k!.cenario!.terminais.every((t) => t.atende)).toBe(true);
    expect(k!.cenario!.vazaoNaFonteLmin).toBeGreaterThanOrEqual(7 * 4.1 * 20.9 + 300 - 1);
    expect(k!.cenario!.vazaoNaFonteLmin).toBeGreaterThan(Math.max(h!.cenario!.vazaoNaFonteLmin, s!.cenario!.vazaoNaFonteLmin));
    // A RTI soma também: a vazão combinada × a maior duração (60 min do hidrante).
    expect(c.rti.exigidaL).toBeCloseTo(k!.cenario!.vazaoNaFonteLmin * 60, 6);
    const item = conferenciaDeIncendio(m, c, HIP).find((i) => i.item === 'Demanda combinada (área de operação + hidrantes)')!;
    expect(item.estado).toBe('ATENDE');
  });
});
