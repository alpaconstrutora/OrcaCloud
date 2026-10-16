/**
 * F14c da casa automática (16/10/2026): os FUROS PREVISTOS — a lista para o calculista, com os critérios da NBR 6118
 * (13.2.5.1) como hipóteses: furo até 12 cm e até h/3, a 2h da face do apoio, furos a 2h entre si.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { furosPrevistos, HIPOTESES_DOS_FUROS_PADRAO } from '../utils/blueprintFurosPrevistos';

/** Uma viga de 6 m (15 × 40, fundo a 2,40 m) entre dois pilares de 20 × 20 e uma laje de 10 cm por cima. */
function vao(trechos: Command[] = []): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }]).model;
  const L = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddStructural', levelId: L, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
    { type: 'AddStructural', levelId: L, kind: 'PILAR', pontos: [point(6000, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
    { type: 'AddStructural', levelId: L, kind: 'VIGA', pontos: [point(0, 0), point(6000, 0)], larguraMm: 150, alturaMm: 400, baseMm: 2400 },
    { type: 'AddStructural', levelId: L, kind: 'LAJE', pontos: [point(-1000, -3000), point(7000, -3000), point(7000, 3000), point(-1000, 3000)], alturaMm: 100, baseMm: 2800 },
  ] as Command[]).model;
  return trechos.length ? applyBatch(m, trechos.map((t) => ({ ...t, levelId: L }) as Command)).model : m;
}
const atravessa = (disciplina: string, x: number, bitolaMm = 25): Command => ({ type: 'AddTrecho', levelId: '', disciplina, a: point(x, -300), b: point(x, 300), cotaAMm: 2600, cotaBMm: 2600, bitolaMm }) as Command;
const prumada = (disciplina: string, x: number, y: number, bitolaMm: number): Command => ({ type: 'AddTrecho', levelId: '', disciplina, a: point(x, y), b: point(x, y), cotaAMm: 3200, cotaBMm: 0, bitolaMm }) as Command;

describe('furos previstos (F14c)', () => {
  it('no meio do vão, pequeno e sozinho: dispensa a verificação; junto do pilar: verificar, com o motivo', () => {
    const furos = furosPrevistos(vao([atravessa('AGUA_FRIA', 3000), atravessa('ELETRICA', 500)]));
    const naViga = furos.filter((f) => f.tipoDaPeca === 'VIGA');
    expect(naViga).toHaveLength(2);
    // Ordenados ao longo da viga.
    expect(naViga.map((f) => f.disciplina)).toEqual(['ELETRICA', 'AGUA_FRIA']);
    const [eletrico, fria] = naViga;
    expect(fria).toMatchObject({ direcao: 'HORIZONTAL', cotaMm: 2600, dispensa: true, motivos: [] });
    expect(fria.ponto).toEqual({ x: 3000, y: 0 });
    expect(fria.distanciaAoApoioMm!).toBeGreaterThan(2 * 400);
    // O furo: o tubo e 1 cm de folga em volta.
    expect(fria.diametroMm).toBe(45);
    // 50 cm do eixo do pilar − 10 cm de meio pilar − meio furo = 37,8 cm; pede 2 × 40.
    expect(eletrico.dispensa).toBe(false);
    expect(eletrico.distanciaAoApoioMm).toBe(378);
    expect(eletrico.motivos).toEqual(['a 37,8 cm do apoio (pede 80 cm)']);
  });

  it('dois furos a menos de 2h um do outro: os dois a verificar', () => {
    const furos = furosPrevistos(vao([atravessa('AGUA_FRIA', 3000), atravessa('AGUA_QUENTE', 3200)])).filter((f) => f.tipoDaPeca === 'VIGA');
    expect(furos).toHaveLength(2);
    for (const f of furos) {
      expect(f.dispensa).toBe(false);
      expect(f.motivos.some((x) => x.startsWith('outro furo a menos de 80 cm'))).toBe(true);
    }
  });

  it('o tubo grosso (Ø acima de 12 cm) e o que DESCE pela viga: a verificar; a passagem na laje é listada sem critério', () => {
    const furos = furosPrevistos(vao([atravessa('ESGOTO', 3000, 150), prumada('ESGOTO', 1500, 0, 50), prumada('AGUA_FRIA', 1500, 1500, 25)]));
    const grosso = furos.find((f) => f.tipoDaPeca === 'VIGA' && f.direcao === 'HORIZONTAL')!;
    expect(grosso.diametroMm).toBe(170);
    expect(grosso.motivos).toContain('Ø 17 cm acima de 12 cm (12 cm e h/3)');
    const desce = furos.find((f) => f.tipoDaPeca === 'VIGA' && f.direcao === 'VERTICAL')!;
    expect(desce.dispensa).toBe(false);
    expect(desce.motivos[0]).toBe('furo VERTICAL na viga (desce por ela)');
    // As duas prumadas atravessam a laje: passagem, sem "dispensa".
    const naLaje = furos.filter((f) => f.tipoDaPeca === 'LAJE');
    expect(naLaje.map((f) => f.disciplina).sort()).toEqual(['AGUA_FRIA', 'ESGOTO']);
    for (const f of naLaje) expect(f).toMatchObject({ dispensa: null, aoLongoMm: null, distanciaAoApoioMm: null, direcao: 'VERTICAL' });
  });

  it('os critérios são hipóteses: com 20 cm de diâmetro máximo e 1h do apoio, o tubo grosso e o do pilar passam', () => {
    const hip = { ...HIPOTESES_DOS_FUROS_PADRAO, diametroMaximoMm: 200, fracaoDaAltura: 1 / 2, distanciaDoApoioEmAlturas: 0.9 };
    const furos = furosPrevistos(vao([atravessa('ESGOTO', 3000, 150), atravessa('ELETRICA', 500)]), hip).filter((f) => f.tipoDaPeca === 'VIGA');
    expect(furos.every((f) => f.dispensa)).toBe(true);
  });
});
