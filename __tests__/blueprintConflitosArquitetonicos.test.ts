/**
 * Clash arquitetônico (18/09/2026, E0.4): pilar no vão da porta, viga como
 * verga (não é conflito), pilar dentro da escada, viga baixa sobre o degrau.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ALTURA_LIVRE_MIN_MM, conflitosArquitetonicos } from '../utils/blueprintKernel';

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const pilar = (levelId: string, x: number, y: number, lado = 200, baseMm = 0, alturaMm = 2800): Command => ({
  type: 'AddStructural', levelId, kind: 'PILAR', pontos: [point(x, y)], larguraMm: lado, profundidadeMm: lado, alturaMm, baseMm,
});

describe('vão × estrutura', () => {
  it('pilar dentro do vão da porta é conflito com a largura tomada; pilar fora do vão e viga-verga acima da janela não são', () => {
    const { m, t } = nivel();
    let r = applyCommand(m, { type: 'AddWall', levelId: t, a: point(0, 0), b: point(8000, 0), thicknessMm: 150, heightMm: 2800 });
    const wallId = r.diff.created[0];
    r = applyBatch(r.model, [
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId, kind: 'window', offsetMm: 5000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
      // Pilar de 200 centrado em x=1800: ocupa 1700–1900 e o vão vai até 1900 → 200 mm tomados.
      pilar(t, 1800, 0),
      // Pilar em x=3000: na parede, mas fora de qualquer vão.
      pilar(t, 3000, 0),
      // Viga sobre a janela (base 2200): cruza em planta, não em altura — é a verga.
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(4500, 0), point(7000, 0)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2200 },
    ]);
    const c = conflitosArquitetonicos(r.model);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ classe: 'VAO_X_ESTRUTURA', familia: 'opening', medidaMm: 200, levelId: t });
    expect(c[0].pecaId).toBe(r.model.openings[0].id);
    expect(c[0].em).toEqual({ x: 1800, y: 0 });
    // Baixando a viga para dentro da janela (base 1500), ela passa a conflitar.
    const viga = r.model.structures.find((s) => s.kind === 'VIGA')!;
    const baixa = applyCommand(r.model, { type: 'SetStructuralProps', structuralId: viga.id, baseMm: 1500 }).model;
    const c2 = conflitosArquitetonicos(baixa);
    expect(c2.some((x) => x.outroId === viga.id && x.classe === 'VAO_X_ESTRUTURA')).toBe(true);
  });
});

describe('escada × estrutura', () => {
  function comEscada(): { m: BlueprintModel; t: string; s: string } {
    let { m } = nivel();
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [t, s] = m.levels.map((l) => l.id);
    // Escada reta de 1,20 m de largura, de (1000,1000) a (5000,1000), no térreo.
    m = applyCommand(m, { type: 'AddEscada', levelId: t, pontos: [point(1000, 1000), point(5000, 1000)], larguraMm: 1200 }).model;
    return { m, t, s };
  }

  it('pilar dentro do percurso é conflito; pilar ao lado não é', () => {
    const { m, t } = comEscada();
    const dentro = applyBatch(m, [pilar(t, 3000, 1000), pilar(t, 3000, 3000)]).model;
    const c = conflitosArquitetonicos(dentro);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ classe: 'ESCADA_X_PILAR', familia: 'stair', medidaMm: 200 });
    expect(c[0].em).toEqual({ x: 3000, y: 1000 });
  });

  it('viga no teto sobre o começo da escada é livre; sobre o fim, onde o degrau já subiu, falta altura livre', () => {
    const { m, t } = comEscada();
    // Viga transversal a x=1100 (1º degrau, cota 175): livre 2400−175 ≥ 2100 → nada.
    const inicio = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(1100, 0), point(1100, 2000)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400,
    }).model;
    expect(conflitosArquitetonicos(inicio)).toHaveLength(0);
    // Viga a x=4800 (fim, degrau ~2700): livre 2400−2700 < 0 → conflito, e a falta é ≥ 2100.
    const fim = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(4800, 0), point(4800, 2000)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400,
    }).model;
    const c = conflitosArquitetonicos(fim);
    expect(c).toHaveLength(1);
    expect(c[0].classe).toBe('ESCADA_X_ALTURA_LIVRE');
    expect(c[0].medidaMm).toBeGreaterThan(ALTURA_LIVRE_MIN_MM); // o degrau está ACIMA da face inferior da viga
    // Viga de fundação (abaixo do degrau) não é cabeçada.
    const fundacao = applyCommand(m, {
      type: 'AddStructural', levelId: t, kind: 'VIGA_FUNDACAO', pontos: [point(4800, 0), point(4800, 2000)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: -600,
    }).model;
    expect(conflitosArquitetonicos(fundacao)).toHaveLength(0);
  });
});
