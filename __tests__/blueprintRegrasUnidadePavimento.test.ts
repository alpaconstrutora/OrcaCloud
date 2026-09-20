/**
 * Regras de UNIDADE e PAVIMENTO com mais variáveis (20/09/2026, backlog P2 — P2.9):
 * área útil, dormitórios/banheiros/cozinhas/varandas, pavimentos, geminada e
 * área por dormitório na unidade; unidades, privativa, comum, eficiência,
 * escadas, elevadores, vagas e banheiros no pavimento; e as quatro sementes novas.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { alvosDoEscopo, avaliarRegras, REGRAS_SEMENTE, VARIAVEIS_DO_ESCOPO } from '../utils/blueprintRegras';

/** Pavimento tipo 12 × 6 m com duas unidades geminadas: 101 (sala, quarto, banheiro, cozinha) e 102 (sala, quarto). */
function tipo(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '4º', elevationMm: 13000, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [
    w(0, 0, 12000, 0), w(12000, 0, 12000, 6000), w(12000, 6000, 0, 6000), w(0, 6000, 0, 0),
    w(6000, 0, 6000, 6000), // geminação
    w(0, 3000, 6000, 3000), w(3000, 3000, 3000, 6000), w(3000, 0, 3000, 3000), // 101: 4 ambientes
    w(6000, 3000, 12000, 3000), // 102: 2 ambientes
  ]).model;
  const centro = (x: number, y: number) => m.spaces.find((s) => { const xs = s.ring.map((p) => p.x); const ys = s.ring.map((p) => p.y); return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys); })!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: centro(1500, 1500).id, name: 'Sala 101', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: centro(4500, 1500).id, name: 'Quarto 101', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: centro(1500, 4500).id, name: 'Banho 101', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'NameSpace', spaceId: centro(4500, 4500).id, name: 'Cozinha 101', tipoDeAmbiente: 'COZINHA_SERVICO' },
    { type: 'NameSpace', spaceId: centro(9000, 1500).id, name: 'Sala 102', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: centro(9000, 4500).id, name: 'Suíte 102', tipoDeAmbiente: 'SALA_DORMITORIO' },
  ]).model;
  const lbl = (nome: string) => m.labels.find((l) => l.name === nome)!.id;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', tipologia: '1 dorm.', labelIds: [lbl('Sala 101'), lbl('Quarto 101'), lbl('Banho 101'), lbl('Cozinha 101')] },
    { type: 'AddUnidade', numero: '102', labelIds: [lbl('Sala 102'), lbl('Suíte 102')] },
    { type: 'AddVaga', levelId: t, at: point(15000, 2000) } as Command,
    { type: 'AddVaga', levelId: t, at: point(15000, 8000), sugerida: true } as Command,
  ]).model;
  return { m, t };
}

describe('regras de unidade e pavimento (P2.9)', () => {
  it('as variáveis novas estão documentadas e saem nos alvos', () => {
    expect(VARIAVEIS_DO_ESCOPO.UNIDADE.map((v) => v.nome)).toEqual(expect.arrayContaining(['area_util', 'dormitorios', 'banheiros', 'cozinhas', 'varandas', 'pavimentos', 'geminada', 'area_por_dormitorio']));
    expect(VARIAVEIS_DO_ESCOPO.PAVIMENTO.map((v) => v.nome)).toEqual(expect.arrayContaining(['unidades', 'area_privativa', 'area_comum', 'eficiencia', 'escadas', 'elevadores', 'vagas', 'banheiros']));
    const { m } = tipo();
    const [u101, u102] = alvosDoEscopo(m, 'UNIDADE', {});
    expect(u101.vars).toMatchObject({ numero: '101', ambientes: 4, dormitorios: 1, banheiros: 1, cozinhas: 1, varandas: 0, pavimentos: 1, geminada: true });
    expect(u101.vars.area_util as number).toBeGreaterThan(0);
    expect(u101.vars.area_util as number).toBeLessThan(u101.vars.area_privativa as number);
    expect(u101.vars.area_por_dormitorio).toBe(u101.vars.area_privativa);
    expect(u102.vars).toMatchObject({ dormitorios: 1, banheiros: 0, geminada: true }); // "Suíte" conta como dormitório
    const [pav] = alvosDoEscopo(m, 'PAVIMENTO', {});
    expect(pav.vars).toMatchObject({ unidades: 2, escadas: 0, elevadores: 0, vagas: 1, banheiros: 1 });
    expect(pav.vars.area_privativa as number).toBeGreaterThan(0);
    expect((pav.vars.area_privativa as number) + (pav.vars.area_comum as number)).toBeCloseTo(pav.vars.area_construida as number, 1);
    expect(pav.vars.eficiencia as number).toBeGreaterThan(70);
  });

  it('sementes: 102 sem banheiro é ERRO; eficiência do tipo conforme; pavimento a 13 m sem elevador é ERRO — e com elevador fica conforme', () => {
    const { m, t } = tipo();
    const r = avaliarRegras(m, REGRAS_SEMENTE, {});
    const por = (id: string) => r.filter((x) => x.regra.id === id);
    const banheiro = por('sem-unidade-banheiro');
    expect(banheiro.map((x) => [x.alvoRotulo, x.estado])).toEqual([['Un. 101', 'CONFORME'], ['Un. 102', 'VIOLADA']]);
    expect(por('sem-unidade-dormitorio').every((x) => x.estado === 'CONFORME')).toBe(true);
    expect(por('sem-pavimento-eficiencia')[0].estado).toBe('CONFORME');
    expect(por('sem-pavimento-elevador')[0].estado).toBe('VIOLADA');
    const comElevador = applyCommand(m, { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring: [point(13000, 0), point(14800, 0), point(14800, 2000), point(13000, 2000)] }).model;
    expect(avaliarRegras(comElevador, REGRAS_SEMENTE, {}).find((x) => x.regra.id === 'sem-pavimento-elevador')!.estado).toBe('CONFORME');
    // Sem unidade nenhuma, a regra de eficiência não se aplica (quando: unidades >= 2) e a de banheiro não tem alvo.
    const semUnidades = applyBatch(m, (m.unidades ?? []).map((u) => ({ type: 'DeleteUnidade', unidadeId: u.id }) as Command)).model;
    const r2 = avaliarRegras(semUnidades, REGRAS_SEMENTE, {});
    expect(r2.filter((x) => x.regra.id === 'sem-unidade-banheiro')).toHaveLength(0);
    // `quando: unidades >= 2` falso: a regra não acusa (fora do `quando`, o motor não avalia).
    expect(r2.filter((x) => x.regra.id === 'sem-pavimento-eficiencia').every((x) => x.estado !== 'VIOLADA')).toBe(true);
  });
});
