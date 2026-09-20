/**
 * P2.10 (20/09/2026, backlog P2): (1) as vagas exigidas pela zona fecham em
 * regra de EDIFICAÇÃO (vagas, PCD 2 %, idoso 5 %); (2) recuo de frente
 * escalonado por pavimento — leitura, ordinal, recuos efetivos e envelope 3D.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { alvosDoEscopo, avaliarRegras, REGRAS_SEMENTE, type ContextoDeRegras } from '../utils/blueprintRegras';
import { lerRecuoEscalonado, ordinalDoPavimento, recuosEfetivos } from '../utils/blueprintZonaUrbanistica';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { envelopeVertical } from '../utils/blueprintEnvelope3d';

function predio() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Subsolo', elevationMm: -3000, defaultHeightMm: 2800 },
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '2º', elevationMm: 6000, defaultHeightMm: 3000 },
  ]).model;
  const [sub, t0, t1, t2] = m.levels.map((l) => l.id);
  const w = (lvl: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
  m = applyBatch(m, [w(t0, 0, 0, 8000, 0), w(t0, 8000, 0, 8000, 6000), w(t0, 8000, 6000, 0, 6000), w(t0, 0, 6000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala 101' }).model;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [m.labels[0].id] },
    { type: 'AddUnidade', numero: '102' },
    { type: 'AddUnidade', numero: '103' },
  ]).model;
  return { m, sub, t0, t1, t2 };
}

const estado = (model: BlueprintModel, id: string, ctx: ContextoDeRegras) => avaliarRegras(model, REGRAS_SEMENTE, ctx).find((r) => r.regra.id === id)!.estado;

describe('vagas da zona em regra (P2.10)', () => {
  it('EDIFICAÇÃO: unidades, vagas confirmadas por tipo e vagas_exigidas = teto(unidades × vagas/unidade); sementes de vagas/PCD/idoso', () => {
    const { m, sub } = predio();
    const semVagas = alvosDoEscopo(m, 'EDIFICACAO', { zona: { vagasPorUnidade: 1.5 } })[0].vars;
    expect(semVagas).toMatchObject({ unidades: 3, vagas: 0, vagas_pcd: 0, vagas_idoso: 0, vagas_por_unidade: 1.5, vagas_exigidas: 5 });
    expect(alvosDoEscopo(m, 'EDIFICACAO', {})[0].vars.vagas_exigidas).toBeUndefined();
    // Cinco vagas confirmadas (1 PCD, 1 idoso) + uma sugerida (não conta).
    const com = applyBatch(m, [
      { type: 'AddVaga', levelId: sub, at: point(2000, 3000), tipo: 'PCD' } as Command,
      { type: 'AddVaga', levelId: sub, at: point(6000, 3000), tipo: 'IDOSO' } as Command,
      { type: 'AddVaga', levelId: sub, at: point(9000, 3000) } as Command,
      { type: 'AddVaga', levelId: sub, at: point(12000, 3000) } as Command,
      { type: 'AddVaga', levelId: sub, at: point(15000, 3000) } as Command,
      { type: 'AddVaga', levelId: sub, at: point(18000, 3000), sugerida: true } as Command,
    ]).model;
    const vars = alvosDoEscopo(com, 'EDIFICACAO', { zona: { vagasPorUnidade: 1.5 } })[0].vars;
    expect(vars).toMatchObject({ vagas: 5, vagas_pcd: 1, vagas_idoso: 1, vagas_exigidas: 5 });
    const zona15: ContextoDeRegras = { zona: { vagasPorUnidade: 1.5 } };
    expect(estado(com, 'sem-vagas-zona', zona15)).toBe('CONFORME');
    expect(estado(com, 'sem-vagas-pcd', zona15)).toBe('CONFORME');
    expect(estado(com, 'sem-vagas-idoso', zona15)).toBe('CONFORME');
    // Com 2 vagas/unidade exige 6: viola. Sem zona: não avaliada.
    expect(estado(com, 'sem-vagas-zona', { zona: { vagasPorUnidade: 2 } })).toBe('VIOLADA');
    expect(estado(com, 'sem-vagas-zona', { zona: {} })).toBe('NAO_AVALIADA');
    // Sem PCD: viola a de PCD; sem vaga nenhuma, as de PCD/idoso não acusam (quando vagas >= 1).
    const semPcd = applyCommand(com, { type: 'DeleteVaga', vagaId: com.vagas!.find((v) => v.tipo === 'PCD')!.id }).model;
    expect(estado(semPcd, 'sem-vagas-pcd', zona15)).toBe('VIOLADA');
    expect(avaliarRegras(m, REGRAS_SEMENTE, {}).filter((r) => r.regra.id === 'sem-vagas-pcd' && r.estado === 'VIOLADA')).toHaveLength(0);
  });
});

describe('recuo de frente escalonado (P2.10)', () => {
  it('leitura do texto da lei, ordinal do pavimento (subsolo não conta) e recuos efetivos', () => {
    expect(lerRecuoEscalonado('5 m a partir do 3º pavimento')).toEqual({ aPartirDoPavimento: 3, recuoMm: 5000 });
    expect(lerRecuoEscalonado('a partir do 2o andar: 7,50 m')).toEqual({ aPartirDoPavimento: 2, recuoMm: 7500 });
    expect(lerRecuoEscalonado('3º pavimento: 5,00 m')).toEqual({ aPartirDoPavimento: 3, recuoMm: 5000 });
    expect(lerRecuoEscalonado('')).toBeNull();
    expect(lerRecuoEscalonado('recuo de 5 m')).toBeNull();
    const { m, sub, t0, t1, t2 } = predio();
    expect([sub, t0, t1, t2].map((id) => ordinalDoPavimento(m.levels, id))).toEqual([0, 1, 2, 3]);
    const base = { FRENTE: 4000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    const esc = { recuoFrenteEscalonado: { aPartirDoPavimento: 3, recuoMm: 6000 }, afastamentoProgressivo: null };
    expect(recuosEfetivos(base, esc, null, 2).recuos.FRENTE).toBe(4000);
    expect(recuosEfetivos(base, esc, null, 3).recuos.FRENTE).toBe(6000);
    expect(recuosEfetivos(base, esc, null, null).recuos.FRENTE).toBe(4000);
    // Recuo fixo maior que o escalonado: fica o fixo.
    expect(recuosEfetivos({ ...base, FRENTE: 8000 }, esc, null, 3).recuos.FRENTE).toBe(8000);
  });

  it('envelope 3D: a partir do 3º pavimento a frente recua mais e a área do prisma cai', () => {
    const { m } = predio();
    const t0 = m.levels.find((l) => l.name === 'Térreo')!.id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t0, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
    const comLote = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
    const terreno = medirTerreno(divisasDoLote(comLote.boundaries))!;
    const recuos = { FRENTE: 4000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    const env = envelopeVertical(comLote, terreno, comLote.boundaries, recuos, { afastamentoProgressivo: null, recuoFrenteEscalonado: { aPartirDoPavimento: 3, recuoMm: 6000 }, gabaritoAlturaMaxM: null, gabaritoPavimentos: null })!;
    const porNome = Object.fromEntries(env.prismas.map((p) => [p.nome, p]));
    expect(porNome['Térreo'].recuos.FRENTE).toBe(4000);
    expect(porNome['1º'].recuos.FRENTE).toBe(4000);
    expect(porNome['2º'].recuos.FRENTE).toBe(6000);
    expect(porNome['Subsolo'].recuos.FRENTE).toBe(4000);
    expect(porNome['2º'].areaMm2).toBe(17000 * 21000);
    expect(porNome['1º'].areaMm2).toBe(17000 * 23000);
  });
});
