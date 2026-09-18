/**
 * Situação · Implantação · Cobertura (18/09/2026, E0.3): que pavimento, que ids
 * escondidos, que anotações forçadas.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { AJUSTE_DA_VISTA, idsOcultosNaVista, nivelDaVista, paredesExternasDoNivel } from '../utils/blueprintVistasDePlanta';

/** Sobrado: térreo 6×4 com parede interna em x=3000, porta, pilar, tomada, trecho; andar 6×4 com telhado. */
function sobrado(): { m: BlueprintModel; t: string; s: string; interna: string; externas: string[] } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const w = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  const r = applyBatch(m, [
    w(t, 0, 0, 3000, 0), w(t, 3000, 0, 6000, 0), w(t, 6000, 0, 6000, 4000), w(t, 6000, 4000, 0, 4000), w(t, 0, 4000, 0, 0),
    w(t, 3000, 0, 3000, 4000),
    w(s, 0, 0, 6000, 0), w(s, 6000, 0, 6000, 4000), w(s, 6000, 4000, 0, 4000), w(s, 0, 4000, 0, 0),
  ]);
  m = r.model;
  const paredesT = m.walls.filter((x) => x.levelId === t);
  const interna = paredesT.find((x) => x.a.x === 3000 && x.b.x === 3000)!.id;
  const externas = paredesT.filter((x) => x.id !== interna).map((x) => x.id);
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: interna, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1500, 2000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(500, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 },
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(500, 500), b: point(500, 2000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'AddAgua', levelId: s, pontos: [point(-500, -500), point(6500, -500), point(6500, 4500), point(-500, 4500)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 150 },
  ]).model;
  return { m, t, s, interna, externas };
}

describe('nivelDaVista', () => {
  it('situação e implantação vão ao pavimento MAIS BAIXO; cobertura ao mais alto com telhado', () => {
    const { m, t, s } = sobrado();
    expect(nivelDaVista(m, 'situacao')?.id).toBe(t);
    expect(nivelDaVista(m, 'implantacao')?.id).toBe(t);
    expect(nivelDaVista(m, 'cobertura')?.id).toBe(s);
    // Sem telhado em lugar nenhum: o mais alto mesmo assim.
    const semTelhado = { ...m, roofs: [] };
    expect(nivelDaVista(semTelhado, 'cobertura')?.id).toBe(s);
    // Telhado só no térreo: a cobertura desce para ele.
    const telhadoEmbaixo = { ...m, roofs: m.roofs.map((r) => ({ ...r, levelId: t })) };
    expect(nivelDaVista(telhadoEmbaixo, 'cobertura')?.id).toBe(t);
    expect(nivelDaVista(emptyModel(), 'situacao')).toBeNull();
  });
});

describe('paredesExternasDoNivel e idsOcultosNaVista', () => {
  it('a parede interna não está no contorno; a situação esconde interna, porta, pilar, tomada e trecho — e nada do telhado', () => {
    const { m, t, s, interna, externas } = sobrado();
    const nivelT = m.levels.find((l) => l.id === t)!;
    const ext = paredesExternasDoNivel(m, nivelT);
    expect([...ext].sort()).toEqual([...externas].sort());
    expect(ext.has(interna)).toBe(false);

    const ocultos = idsOcultosNaVista(m, 'situacao', nivelT);
    expect(ocultos.has(interna)).toBe(true);
    for (const id of externas) expect(ocultos.has(id)).toBe(false);
    expect(ocultos.has(m.openings[0].id)).toBe(true);
    expect(ocultos.has(m.structures[0].id)).toBe(true);
    expect(ocultos.has(m.terminais![0].id)).toBe(true);
    expect(ocultos.has(m.trechos![0].id)).toBe(true);
    expect(ocultos.has(m.roofs[0].id)).toBe(false);
    // Os ids escondidos são só do pavimento da vista: a parede do andar não entra.
    for (const w of m.walls.filter((x) => x.levelId === s)) expect(ocultos.has(w.id)).toBe(false);
    expect(idsOcultosNaVista(m, 'situacao', null).size).toBe(0);
  });

  it('os ajustes: situação sem cota e sem envelope; implantação com os dois; cobertura com cota e sem envelope', () => {
    expect(AJUSTE_DA_VISTA.situacao).toMatchObject({ mostrarCotas: false, mostrarEnvelope: false, soContorno: true });
    expect(AJUSTE_DA_VISTA.implantacao).toMatchObject({ mostrarCotas: true, mostrarEnvelope: true, soContorno: true });
    expect(AJUSTE_DA_VISTA.cobertura).toMatchObject({ mostrarCotas: true, mostrarEnvelope: false, soContorno: true });
  });
});
