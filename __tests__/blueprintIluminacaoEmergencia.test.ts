/**
 * INCÊNDIO E7.3 (01/10/2026): a luminária de emergência no kernel (0.87.0) e a
 * regra — pontos obrigatórios (mudança de direção, saída, escada), espaçamento
 * ao longo da rota (CONFERIR NA NBR 10898), autonomia, e a proposta.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';
import { HIPOTESES_ILUMINACAO_PADRAO as HI, analisarIluminacao, proporIluminacao } from '../utils/blueprintIluminacaoEmergencia';

/** Corredor de 60 × 2 m com saída na ponta oeste (x = 0) e dez salas de 6 × 6 m em cima, cada uma com porta. */
function andar(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 2000), w(0, 2000, 0, 0)];
  for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
  for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
  m = applyBatch(m, cmds).model;
  const portas = m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command);
  const saida = m.walls.find((x) => x.a.x === 0 && x.b.x === 0 && x.a.y === 2000)!;
  return applyBatch(m, [...portas, { type: 'AddOpening', wallId: saida.id, kind: 'door', offsetMm: 550, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command]).model;
}
const analisar = (m: BlueprintModel, hip = HI) => {
  const p = percursoDeFuga(m, 'A', m.levels[0].id);
  return { p, a: analisarIluminacao(m, p, m.levels[0].id, hip) };
};

describe('E7.3 · o kernel (0.87.0)', () => {
  it('autonomia só na luminária de emergência, inteira de 1 a 600 min; ida e volta pelo canônico', () => {
    const base = andar();
    let m = applyCommand(base, { type: 'AddTerminal', levelId: base.levels[0].id, disciplina: 'INCENDIO', tipo: 'LUMINARIA_EMERGENCIA', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: point(1000, 1000), cotaMm: 2200, autonomiaMin: 120 } as Command).model;
    expect(m.terminais![0].autonomiaMin).toBe(120);
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, autonomiaMin: 0 } as Command)).toThrow(/Autonomia inválida/);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.terminais![0].autonomiaMin).toBe(120);
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, tipoHidraulico: 'EXTINTOR' } as Command).model;
    expect(m.terminais![0].autonomiaMin).toBeNull();
  });
});

describe('E7.3 · a regra', () => {
  it('sem luminária: a rota de 60 m do corredor fica sem luz, e a saída e as mudanças de direção pedem luminária', () => {
    const { a } = analisar(andar());
    expect(a.luminarias).toBe(0);
    expect(a.trechosSemLuz.length).toBeGreaterThan(10);
    expect(a.pontosObrigatorios.some((p) => p.tipo === 'SAIDA' && !p.coberto)).toBe(true);
    expect(a.pontosObrigatorios.some((p) => p.tipo === 'MUDANCA')).toBe(true);
  });

  it('⚠️ PRONTO QUANDO: a proposta cobre toda a rota a 15 m de espaçamento e todos os pontos obrigatórios', () => {
    const m = andar();
    const { p, a } = analisar(m);
    const lote = proporIluminacao(m, p, a);
    const depois = applyBatch(m, lote).model;
    const b = analisar(depois).a;
    expect(b.trechosSemLuz).toEqual([]);
    expect(b.pontosObrigatorios.every((x) => x.coberto)).toBe(true);
    // Sem exagero: os pontos obrigatórios + uns poucos de preenchimento no corredor de 60 m.
    expect(lote.length).toBeLessThanOrEqual(a.pontosObrigatorios.length + 4);
    // Espaçamento declarado menor pede mais.
    const dez = { espacamentoMaximoM: 10 };
    const r10 = analisar(m, dez);
    expect(proporIluminacao(m, r10.p, r10.a).length).toBeGreaterThan(lote.length);
  });

  it('autonomia abaixo de 60 min é dita; a escada pede luminária na boca de cada pavimento', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: '1', elevationMm: 3000, defaultHeightMm: 3000 }).model;
    m = applyBatch(m, [
      { type: 'AddEscada', levelId: m.levels[0].id, pontos: [point(1000, 1000), point(1000, 5000)], larguraMm: 1200 } as Command,
      { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'LUMINARIA_EMERGENCIA', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: point(1000, 1500), cotaMm: 2200, autonomiaMin: 30 } as Command,
    ]).model;
    const p = percursoDeFuga(m, 'A', m.levels[0].id);
    const a = analisarIluminacao(m, p, m.levels[0].id, HI);
    expect(a.autonomiaCurta).toEqual([m.terminais![0].id]);
    const escadas = a.pontosObrigatorios.filter((x) => x.tipo === 'ESCADA');
    expect(escadas.map((x) => [x.levelId, x.at, x.coberto])).toEqual([
      [m.levels[0].id, point(1000, 1000), true],
      [m.levels[1].id, point(1000, 5000), false],
    ]);
  });
});
