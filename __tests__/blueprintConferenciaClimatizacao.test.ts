/**
 * CONFERÊNCIA DA CARGA TÉRMICA (04/10/2026, E2.3): três estados + não avaliado,
 * sobre o resultado do motor — sem TBS é FALTA; tabela de memória é AVISO;
 * tudo declarado é OK.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { FAIXA_PLAUSIVEL_W_POR_M2, conferenciaDeCargaTermica } from '../utils/blueprintConferenciaClimatizacao';

function sala() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 4000, 0), w(4000, 0, 4000, 4000), w(4000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' },
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 1000, widthMm: 1500, heightMm: 1200, sillMm: 1000 } as never,
  ]).model;
  return { m, t };
}
const porItem = (c: ReturnType<typeof conferenciaDeCargaTermica>) => Object.fromEntries(c.itens.map((i) => [i.codigo, i.estado]));

describe('conferência da carga térmica', () => {
  it('sem TBS: FALTA em TBS, densidade não avaliada, e a conferência não fecha', () => {
    const { m, t } = sala();
    const c = conferenciaDeCargaTermica(cargaTermicaDoNivel(m, HIPOTESES_CLIMATIZACAO_PADRAO, t));
    expect(porItem(c)).toMatchObject({ TBS: 'FALTA', TBU: 'AVISO', CLIMATIZADOS: 'OK', DENSIDADE: 'NAO_AVALIADO' });
    expect(c.fecha).toBe(false);
    expect(c.faltas).toBe(1);
  });

  it('cidade da tabela: TBS/TBU em AVISO (memória), vidro e envoltória típicos em AVISO; fecha sem faltas', () => {
    const { m, t } = sala();
    const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: 'São Paulo', tbsExternaC: null, tbuExternaC: null, altitudeM: null } };
    const c = conferenciaDeCargaTermica(cargaTermicaDoNivel(m, hip, t));
    expect(porItem(c)).toMatchObject({ TBS: 'AVISO', TBU: 'AVISO', VIDRO: 'AVISO', ENVOLTORIA: 'AVISO', ETIQUETAS: 'OK' });
    expect(c.fecha).toBe(true);
    expect(c.faltas).toBe(0);
    expect(c.itens.find((i) => i.codigo === 'VIDRO')!.spaceIds).toEqual([m.spaces[0].id]);
  });

  it('TBS/TBU declaradas e vidro declarado: TBS, TBU e VIDRO ficam OK; densidade dentro da faixa plausível', () => {
    const { m, t } = sala();
    const com = applyCommand(m, { type: 'SetOpeningVidro', openingId: m.openings[0].id, vidro: { fatorSolar: 0.6, uWm2K: 3, protecao: 'PELICULA', fatorSombreamento: null } }).model;
    const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 33, tbuExternaC: 24, altitudeM: 700 } };
    const n = cargaTermicaDoNivel(com, hip, t);
    const c = conferenciaDeCargaTermica(n);
    expect(porItem(c)).toMatchObject({ TBS: 'OK', TBU: 'OK', VIDRO: 'OK', DENSIDADE: 'OK' });
    const sala1 = n.ambientes[0];
    expect(sala1.wPorM2).toBeGreaterThanOrEqual(FAIXA_PLAUSIVEL_W_POR_M2.min);
    expect(sala1.wPorM2).toBeLessThanOrEqual(FAIXA_PLAUSIVEL_W_POR_M2.max);
  });
});
