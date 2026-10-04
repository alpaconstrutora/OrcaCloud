/**
 * EXPOSIÇÃO TÉRMICA (04/10/2026, E1.3 da climatização): um sobrado — térreo com
 * Sala e Cozinha lado a lado, Quarto em cima da Sala, telhado sobre tudo — e
 * cada face respondendo o que há do outro lado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { exposicaoDoAmbiente, exposicaoDoNivel, resumirExposicao } from '../utils/blueprintExposicaoTermica';

function sobrado(opts: { telhado?: boolean; camadasDoTelhado?: boolean } = {}): { m: BlueprintModel; terreo: string; superior: string } {
  const niveis = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 },
  ]).model;
  const [t, su] = niveis.levels.map((l) => l.id);
  const w = (lvl: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(niveis, [
    // Térreo 8 × 4 com uma parede no meio: Sala (0–4000) e Cozinha (4000–8000).
    w(t, 0, 0, 8000, 0), w(t, 8000, 0, 8000, 4000), w(t, 8000, 4000, 0, 4000), w(t, 0, 4000, 0, 0), w(t, 4000, 0, 4000, 4000),
    // Superior 4 × 4 sobre a Sala.
    w(su, 0, 0, 4000, 0), w(su, 4000, 0, 4000, 4000), w(su, 4000, 4000, 0, 4000), w(su, 0, 4000, 0, 0),
  ]).model;
  const sala = m.spaces.find((s) => s.levelId === t && s.ring.every((p) => p.x <= 4000 + 100))!;
  const cozinha = m.spaces.find((s) => s.levelId === t && s.id !== sala.id)!;
  const quarto = m.spaces.find((s) => s.levelId === su)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: cozinha.id, name: 'Cozinha' },
    { type: 'NameSpace', spaceId: quarto.id, name: 'Quarto' },
    // Janela na parede sul da Sala (y = 0), com vidro declarado.
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 1000, widthMm: 1200, heightMm: 1100, sillMm: 1000 } as never,
  ]).model;
  m = applyCommand(m, { type: 'SetOpeningVidro', openingId: m.openings[0].id, vidro: { fatorSolar: 0.87, uWm2K: 5.7, protecao: 'PELICULA', fatorSombreamento: null } }).model;
  if (opts.telhado !== false) {
    m = applyCommand(m, { type: 'AddAgua', levelId: su, pontos: [point(-500, -500), point(8500, -500), point(8500, 4500), point(-500, 4500)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 150 } as never).model;
    if (opts.camadasDoTelhado) m = applyCommand(m, { type: 'SetAguaProps', aguaId: m.roofs![0].id, camadas: [{ espessuraMm: 20, itemCode: 'telha', descricao: 'Telha', funcao: 'ACABAMENTO' }] }).model;
  }
  return { m, terreo: t, superior: su };
}

describe('exposição térmica', () => {
  it('Sala: 3 faces externas orientadas (S, O, N), a divisa com a Cozinha como interna, janela com vidro na face sul; teto = Quarto; piso = solo', () => {
    const { m, terreo } = sobrado();
    const e = exposicaoDoNivel(m, terreo).find((x) => x.nome === 'Sala')!;
    const externas = e.faces.filter((f) => f.externa === true);
    const internas = e.faces.filter((f) => f.externa === false);
    expect(externas.map((f) => f.orientacao).sort()).toEqual(['N', 'O', 'S']);
    expect(internas).toHaveLength(1);
    expect(internas[0].vizinho?.nome).toBe('Cozinha');
    expect(internas[0].vizinho?.labelUid).toBeTruthy();
    const sul = externas.find((f) => f.orientacao === 'S')!;
    expect(sul.vaos).toHaveLength(1);
    expect(sul.vaos[0]).toMatchObject({ kind: 'window', areaM2: 1.32, vidro: { protecao: 'PELICULA', fatorSolar: 0.87 } });
    expect(sul.areaLiquidaM2).toBeCloseTo(sul.areaBrutaM2 - 1.32, 2);
    expect(e.teto).toMatchObject({ tipo: 'AMBIENTE', vizinho: { nome: 'Quarto' } });
    expect(e.piso).toMatchObject({ tipo: 'SOLO', vizinho: null });
    expect(e.pendencias).toEqual([]);
  });

  it('Cozinha: há pavimento acima mas nenhum ambiente sobre ela — o telhado a cobre; sem camadas, a pendência diz que o U não foi avaliado', () => {
    const { m, terreo } = sobrado();
    const e = exposicaoDoNivel(m, terreo).find((x) => x.nome === 'Cozinha')!;
    expect(e.teto.tipo).toBe('COBERTURA');
    expect(e.teto.aguaIds).toHaveLength(1);
    expect(e.teto.camadas).toBeNull();
    expect(e.pendencias.join(' ')).toMatch(/Cobertura sem camadas/);
    const com = sobrado({ camadasDoTelhado: true });
    const e2 = exposicaoDoNivel(com.m, com.terreo).find((x) => x.nome === 'Cozinha')!;
    expect(e2.teto.camadas).toHaveLength(1);
    expect(e2.pendencias).toEqual([]);
  });

  it('Quarto: teto sob a cobertura, piso sobre a Sala; sem telhado vira laje exposta (último pavimento) — e a Cozinha vira exterior descoberto', () => {
    const { m, superior, terreo } = sobrado();
    const q = exposicaoDoNivel(m, superior).find((x) => x.nome === 'Quarto')!;
    expect(q.teto.tipo).toBe('COBERTURA');
    expect(q.piso).toMatchObject({ tipo: 'AMBIENTE', vizinho: { nome: 'Sala' } });
    expect(q.faces.every((f) => f.externa === true)).toBe(true);
    const sem = sobrado({ telhado: false });
    expect(exposicaoDoNivel(sem.m, sem.superior)[0].teto.tipo).toBe('LAJE_EXPOSTA');
    expect(exposicaoDoNivel(sem.m, sem.terreo).find((x) => x.nome === 'Cozinha')!.teto.tipo).toBe('EXTERIOR');
    expect(exposicaoDoAmbiente(sem.m, 'spc_inexistente')).toBeNull();
  });

  it('ambiente sem etiqueta do outro lado é pendência, não silêncio; o resumo conta por tipo', () => {
    const { m, terreo } = sobrado();
    const semNome = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces.find((s) => s.name === 'Quarto')!.id, name: '' }).model;
    const sala = exposicaoDoNivel(semNome, terreo).find((x) => x.nome === 'Sala')!;
    expect(sala.teto.vizinho?.labelUid).toBeNull();
    expect(sala.pendencias.join(' ')).toMatch(/Ambiente acima "Ambiente" sem etiqueta/);
    const r = resumirExposicao(exposicaoDoNivel(m, terreo));
    expect(r.teto).toEqual({ AMBIENTE: 1, COBERTURA: 1 });
    expect(r.piso).toEqual({ SOLO: 2 });
    expect(r.comPendencia).toBe(1);
  });
});
