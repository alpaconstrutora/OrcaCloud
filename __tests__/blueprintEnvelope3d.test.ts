/**
 * Envelope 3D (19/09/2026, E3.3): prisma por pavimento com recuos efetivos na
 * altura de cada topo, gabarito em altura e em pavimentos, "cabe?" pelo
 * contorno desenhado, volume máximo, e a ponte com as regras.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { envelopePorPavimentoParaRegras, envelopeVertical } from '../utils/blueprintEnvelope3d';
import { avaliarRegras, REGRAS_SEMENTE } from '../utils/blueprintRegras';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';

/** Lote 20 × 30 m com 3 pavimentos (0 / 3 / 6 m, pé-direito 3 m) e um térreo desenhado 12 × 20 m encostado na frente. */
function torre(): { m: BlueprintModel; t: string[] } {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '2º', elevationMm: 6000, defaultHeightMm: 3000 },
  ]).model;
  const t = m.levels.map((l) => l.id);
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t[0], a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  // Térreo: 12 × 20 m de eixo, de x = 4000 a 16000, y = 2000 a 22000 (dentro do recuo de frente de 5 m? y = 2000 < 5000 → NÃO cabe).
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t[0], a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 3000 });
  m = applyBatch(m, [w(4000, 2000, 16000, 2000), w(16000, 2000, 16000, 22000), w(16000, 22000, 4000, 22000), w(4000, 22000, 4000, 2000)]).model;
  return { m, t };
}

describe('envelope vertical', () => {
  it('um prisma por pavimento com os recuos efetivos do topo; gabarito em altura e em pavimentos; cabe? pelo contorno; volume máximo', () => {
    const { m, t } = torre();
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    const recuos = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    // Afastamento progressivo (h − 3)/2 acima de 3 m: topo do 1º = 6 m → 1,5 m (= recuo lateral); topo do 2º = 9 m → 3 m.
    const env = envelopeVertical(m, terreno, m.boundaries, recuos, { afastamentoProgressivo: { aPartirDeM: 3, formula: '(h - 3) / 2' }, gabaritoAlturaMaxM: 8, gabaritoPavimentos: null })!;
    expect(env.prismas.map((p) => p.nome)).toEqual(['Térreo', '1º', '2º']);
    const [p0, p1, p2] = env.prismas;
    expect(p0.areaMm2).toBe(17000 * 22000);
    expect(p0.afastamentoMm).toBeNull();
    expect(p1.areaMm2).toBe(17000 * 22000); // 1,5 m = recuo fixo, nada muda
    expect(p1.afastamentoMm).toBe(1500);
    expect(p2.afastamentoMm).toBe(3000);
    expect(p2.areaMm2).toBe(14000 * 22000); // laterais a 3 m; fundos 3 m já era
    expect(p2.recuos).toEqual({ FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 3000, LATERAL_ESQUERDA: 3000 });
    // Gabarito 8 m: o 2º (topo 9 m) passa.
    expect(p0.acimaDoGabarito).toBe(false);
    expect(p2.acimaDoGabarito).toBe(true);
    expect(p2.motivoDoGabarito).toMatch(/topo a 9,00 m > gabarito 8,00 m/);
    // Cabe? O térreo desenhado invade o recuo de frente (y = 2000 < 5000): não cabe, com a área fora.
    expect(p0.cabe).toBe(false);
    expect(p0.areaForaMm2).toBe(12000 * 3000);
    expect(p0.areaConstruidaMm2).toBe(12200 * 20200);
    // Pavimentos sem parede cabem por definição.
    expect(p1.cabe).toBe(true);
    expect(p1.areaForaMm2).toBe(0);
    // Volume máximo só dos pavimentos dentro do gabarito: 2 × 374 m² × 3 m.
    expect(env.volumeMaxM3).toBe(2 * 374 * 3);
    expect(env.areaMaxM2).toBe(2 * 374);
    expect(env.pavimentosComProblema).toBe(2); // térreo não cabe; 2º acima do gabarito
    // Gabarito em pavimentos: 2 → o 3º (2º andar) passa; subsolo não conta.
    const comSubsolo = applyCommand(m, { type: 'AddLevel', name: 'Subsolo', elevationMm: -3000, defaultHeightMm: 3000 }).model;
    const envPav = envelopeVertical(comSubsolo, terreno, comSubsolo.boundaries, recuos, { afastamentoProgressivo: null, gabaritoAlturaMaxM: null, gabaritoPavimentos: 2 })!;
    expect(envPav.prismas.map((p) => [p.nome, p.acimaDoGabarito])).toEqual([
      ['Subsolo', false],
      ['Térreo', false],
      ['1º', false],
      ['2º', true],
    ]);
    expect(envPav.prismas[3].motivoDoGabarito).toBe('3º pavimento > gabarito de 2');
    // Sem terreno: nada.
    expect(envelopeVertical(m, null, m.boundaries, recuos, { afastamentoProgressivo: null, gabaritoAlturaMaxM: null, gabaritoPavimentos: null })).toBeNull();
    void t;
  });

  it('as regras de pavimento leem o envelope: "dentro do envelope" viola no térreo e "dentro do gabarito" no 2º; sem envelope, não avaliadas', () => {
    const { m } = torre();
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    const recuos = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    const env = envelopeVertical(m, terreno, m.boundaries, recuos, { afastamentoProgressivo: null, gabaritoAlturaMaxM: 8, gabaritoPavimentos: null });
    const r = avaliarRegras(m, REGRAS_SEMENTE.filter((x) => x.id === 'sem-pav-envelope' || x.id === 'sem-pav-gabarito'), { envelopePorPavimento: envelopePorPavimentoParaRegras(env) });
    const de = (id: string, alvo: string) => r.find((x) => x.regraId === id && x.alvoRotulo === alvo)!;
    expect(de('sem-pav-envelope', 'Térreo')).toMatchObject({ estado: 'VIOLADA', valores: 'cabe_no_envelope = não' });
    expect(de('sem-pav-envelope', '1º').estado).toBe('CONFORME');
    expect(de('sem-pav-gabarito', '2º').estado).toBe('VIOLADA');
    expect(de('sem-pav-gabarito', 'Térreo').estado).toBe('CONFORME');
    const semEnvelope = avaliarRegras(m, REGRAS_SEMENTE.filter((x) => x.id === 'sem-pav-envelope'), {});
    expect(semEnvelope.every((x) => x.estado === 'NAO_AVALIADA' && /cabe_no_envelope/.test(x.motivo ?? ''))).toBe(true);
  });
});
