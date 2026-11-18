/**
 * PA20 do prédio automático (17/11/2026, decisão do usuário 2a): a luz de teto do tipo sob a descida da laje de cima (o
 * pé do ralo seco do andar de cima — pela cópia viva, o do próprio tipo) anda no mesmo cômodo até ficar a 15 cm dela.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { LUZ_LONGE_DA_DESCIDA_MM, luzesLongeDasDescidasDeCima } from '../utils/predioAutomatico/climatizacaoERede';

/** O tipo (um cômodo 2,0 × 1,6 m e outro 3 × 3 m) e o andar de cima copiado dele; a luz no centro de cada um. */
function tipoComCopia(extras: (t: string) => Command[]): { m: BlueprintModel; tipo: string } {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Tipo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: 'Cópia', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  const [tipo, copia] = m.levels.map((l) => l.id);
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: tipo, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
  const luz = (x: number, y: number): Command => ({ type: 'AddTerminal', levelId: tipo, disciplina: 'ELETRICA', tipo: 'Luz', at: point(x, y), cotaMm: 3000, tipoEletrico: 'ILUMINACAO_TETO' }) as Command;
  m = applyBatch(m, [w(0, 0, 5000, 0), w(5000, 0, 5000, 3000), w(5000, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000), luz(1000, 1500), luz(3500, 1500), ...extras(tipo)]).model;
  return { m: { ...m, levels: m.levels.map((l) => (l.id === copia ? { ...l, tipoDeId: tipo } : l)) }, tipo };
}
const ralo = (t: string, x: number, y: number): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(x, y), b: point(x, y), cotaAMm: 0, cotaBMm: -150, bitolaMm: 40 }) as Command;

describe('PA20 — a luz de teto longe da descida da laje de cima', () => {
  it('a luz 13 mm ao lado do pé do ralo de cima anda no cômodo até 15 cm da superfície dele; a outra fica', () => {
    const { m, tipo } = tipoComCopia((t) => [ralo(t, 1008, 1490)]);
    const { comandos, luzes } = luzesLongeDasDescidasDeCima(m, tipo);
    expect(luzes).toBe(1);
    const depois = applyBatch(m, comandos).model;
    const [a, b] = (depois.terminais ?? []).filter((x) => x.tipoEletrico === 'ILUMINACAO_TETO').sort((x, y) => x.at.x - y.at.x);
    expect(Math.hypot(a.at.x - 1008, a.at.y - 1490)).toBeGreaterThanOrEqual(20 + LUZ_LONGE_DA_DESCIDA_MM);
    // O mais perto possível: anda menos de 20 cm, e no mesmo cômodo (entre as paredes x = 0 e x = 2.000).
    expect(Math.hypot(a.at.x - 1000, a.at.y - 1500)).toBeLessThan(200);
    expect(a.at.x).toBeGreaterThan(75 + 300);
    expect(a.at.x).toBeLessThan(2000 - 75 - 300);
    expect(b.at).toEqual({ x: 3500, y: 1500 });
  });

  it('sem andar de cima copiado do tipo, nada anda', () => {
    const { m, tipo } = tipoComCopia((t) => [ralo(t, 1008, 1490)]);
    const solto = { ...m, levels: m.levels.map((l) => ({ ...l, tipoDeId: undefined })) };
    expect(luzesLongeDasDescidasDeCima(solto, tipo).luzes).toBe(0);
  });

  it('não para em cima de ramal de cima: a luz desvia também do ramal que sai do pé', () => {
    // O pé sob a luz e o ramal dele indo para leste, sob o piso de cima.
    const { m, tipo } = tipoComCopia((t) => [ralo(t, 1000, 1500), { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(1000, 1500), b: point(1900, 1500), cotaAMm: -150, cotaBMm: -170, bitolaMm: 40 } as Command]);
    const depois = applyBatch(m, luzesLongeDasDescidasDeCima(m, tipo).comandos).model;
    const a = (depois.terminais ?? []).filter((x) => x.tipoEletrico === 'ILUMINACAO_TETO').sort((x, y) => x.at.x - y.at.x)[0];
    expect(Math.hypot(a.at.x - 1000, a.at.y - 1500)).toBeGreaterThanOrEqual(20 + LUZ_LONGE_DA_DESCIDA_MM);
    // Fora da faixa do ramal (y = 1.500, x de 1.000 a 1.900): o raio dele + o do eletroduto + a folga.
    expect(a.at.x < 1000 || Math.abs(a.at.y - 1500) >= 20 + 12.5 + 10).toBe(true);
  });
});
