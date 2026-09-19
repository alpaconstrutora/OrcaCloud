/**
 * E3.1 (19/09/2026): vocabulário complementar da zona e restrições em planta —
 * leitura da zona (testada, área mínima, vagas/unidade, insolação, afastamento
 * progressivo), recuos efetivos pela altura, conferência do lote, faixa
 * restrita no kernel, envelope − faixa, deriva e canônico.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { divisasDoLote, envelopeConstrutivo, faixasRestritas, medirTerreno } from '../utils/blueprintTerreno';
import { afastamentoNaAltura, conferirLote, lerAfastamentoProgressivo, lerZona, recuosEfetivos, zonaDerivou } from '../utils/blueprintZonaUrbanistica';

/** Lote retangular 20 × 30 m (frente em y = 0). */
function lote(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  return { m, t };
}

describe('vocabulário da zona', () => {
  it('lê os campos novos da zona (texto → número), o afastamento progressivo em várias grafias, e acusa o ilegível', () => {
    const { valores, naoAplicados } = lerZona({
      id: 'z1',
      zona: 'ZR-2',
      recuo_frente: '5 m',
      testada_minima: '12 m',
      area_minima_lote: '360 m²',
      vagas_por_unidade: '1,5',
      insolacao_minima: '2 h',
      afastamento_progressivo: 'acima de 6 m: (H − 6)/10',
    });
    expect(valores.testadaMinimaMm).toBe(12000);
    expect(valores.areaMinimaDoLoteM2).toBe(360);
    expect(valores.vagasPorUnidade).toBe(1.5);
    expect(valores.insolacaoMinimaH).toBe(2);
    expect(valores.afastamentoProgressivo).toEqual({ aPartirDeM: 6, formula: '(h - 6)/10' });
    expect(naoAplicados).toEqual([]);
    expect(lerAfastamentoProgressivo('H > 9: (H-9)/8')).toEqual({ aPartirDeM: 9, formula: '(h-9)/8' });
    expect(lerAfastamentoProgressivo('(H-6)/10 a partir de 6 m')).toEqual({ aPartirDeM: 6, formula: '(h-6)/10' });
    expect(lerAfastamentoProgressivo('conforme art. 42')).toBeNull();
    expect(lerZona({ id: 'z2', afastamento_progressivo: 'conforme art. 42' }).naoAplicados).toEqual([{ campo: 'afastamento_progressivo', textoOriginal: 'conforme art. 42' }]);
    // Afastamento na altura: nulo até o limiar; (h−6)/10 em 16 m = 1,00 m.
    const ap = { aPartirDeM: 6, formula: '(h - 6)/10' };
    expect(afastamentoNaAltura(ap, 5)).toBeNull();
    expect(afastamentoNaAltura(ap, 16)).toBeCloseTo(1, 9);
    expect(afastamentoNaAltura(ap, 36)).toBeCloseTo(3, 9);
    // Recuos efetivos: laterais/fundos = máx(fixo, fórmula); frente não muda.
    const r = recuosEfetivos({ FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }, { afastamentoProgressivo: ap }, 36);
    expect(r).toEqual({ recuos: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 3000, LATERAL_ESQUERDA: 3000 }, afastamentoMm: 3000 });
    expect(recuosEfetivos({ FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }, { afastamentoProgressivo: ap }, 5).afastamentoMm).toBeNull();
    // Conferência do lote: só acusa.
    const avisos = conferirLote({ areaM2: 300, testadaMm: 10000 }, { testadaMinimaMm: 12000, areaMinimaDoLoteM2: 360 });
    expect(avisos.map((a) => a.ok)).toEqual([false, false]);
    expect(avisos[0].texto).toMatch(/Testada 10,00 m < mínima 12,00 m/);
    expect(conferirLote({ areaM2: 600, testadaMm: null }, { testadaMinimaMm: 12000, areaMinimaDoLoteM2: 360 })[0].texto).toMatch(/nenhuma divisa marcada como frente/);
    // Deriva: o campo novo muda na zona → deriva; digitado à mão → não.
    // Como o estudo guarda: recuos já resolvidos (N.A. → 0), como `recuosDaZona` faz.
    const lidos = lerZona({ id: 'z1', testada_minima: '12 m' }).valores;
    const aplicados = { ...lidos, recuoMm: { FRENTE: 0, FUNDOS: 0, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 } };
    expect(zonaDerivou(aplicados, { testada_minima: 'ZONA' }, { id: 'z1', testada_minima: '15 m' })).toBe(true);
    expect(zonaDerivou(aplicados, { testada_minima: 'MANUAL' }, { id: 'z1', testada_minima: '15 m' })).toBe(false);
  });
});

describe('restrição em planta', () => {
  it('a faixa restrita na divisa de fundos (APP 30 m → 10 m) recorta o envelope; a do meio só desconta a área; canônico ida e volta; não divide ambiente', () => {
    const { m, t } = lote();
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    const recuos = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    const semRestricao = envelopeConstrutivo(terreno, m.boundaries, recuos);
    expect(semRestricao.areaMm2).toBe(17000 * 22000);
    // Restrição sobre a divisa de fundos (y = 30000), faixa de 10 m para dentro.
    const x = applyCommand(m, { type: 'AddBoundary', levelId: t, a: point(20000, 30000), b: point(0, 30000), kind: 'RESTRICAO', restricao: { tipo: 'APP', faixaMm: 10000 } }).model;
    const r = x.boundaries.find((b) => b.kind === 'RESTRICAO')!;
    expect(r.restricao).toEqual({ tipo: 'APP', faixaMm: 10000 });
    const faixas = faixasRestritas(terreno, x.boundaries);
    expect(faixas).toHaveLength(1);
    expect(faixas[0].naDivisa).toBe(true);
    expect(faixas[0].areaNoLoteMm2).toBe(20000 * 10000);
    // Toda a faixa fica para DENTRO do lote (y entre 20000 e 30000).
    expect(faixas[0].anel.every((p) => p.y >= 20000 && p.y <= 30000)).toBe(true);
    const env = envelopeConstrutivo(terreno, x.boundaries, recuos);
    // Envelope: x ∈ [1500, 18500], y ∈ [5000, 20000] (a faixa manda mais que o recuo de 3 m).
    expect(env.valido).toBe(true);
    expect(env.areaMm2).toBe(17000 * 15000);
    expect(env.areaRestritaMm2).toBe(20000 * 10000);
    expect(env.restricoesNaoRecortadas).toBe(0);
    // Servidão no MEIO do lote: área conta, anel não recorta, aviso.
    const y = applyCommand(m, { type: 'AddBoundary', levelId: t, a: point(0, 15000), b: point(20000, 15000), kind: 'RESTRICAO', restricao: { tipo: 'SERVIDAO' } }).model;
    const envMeio = envelopeConstrutivo(terreno, y.boundaries, recuos);
    expect(y.boundaries.find((b) => b.kind === 'RESTRICAO')!.restricao!.faixaMm).toBe(3000); // padrão do tipo
    expect(envMeio.areaMm2).toBe(17000 * 22000);
    expect(envMeio.areaRestritaMm2).toBe(20000 * 3000);
    expect(envMeio.restricoesNaoRecortadas).toBe(1);
    // A restrição não divide ambiente: um cômodo fechado atravessado por ela continua um só.
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    const z = applyBatch(y, [w(2000, 10000, 8000, 10000), w(8000, 10000, 8000, 20000), w(8000, 20000, 2000, 20000), w(2000, 20000, 2000, 10000)]).model;
    expect(z.spaces).toHaveLength(1);
    // SetBoundaryRestricao: trocar o tipo sem faixa leva a padrão; faixa explícita fica; recusa em divisa comum.
    const s1 = applyCommand(x, { type: 'SetBoundaryRestricao', boundaryId: r.id, tipo: 'CURSO_DAGUA' }).model;
    expect(s1.boundaries.find((b) => b.id === r.id)!.restricao).toEqual({ tipo: 'CURSO_DAGUA', faixaMm: 15000 });
    const s2 = applyCommand(x, { type: 'SetBoundaryRestricao', boundaryId: r.id, faixaMm: 12000 }).model;
    expect(s2.boundaries.find((b) => b.id === r.id)!.restricao).toEqual({ tipo: 'APP', faixaMm: 12000 });
    expect(() => applyCommand(x, { type: 'SetBoundaryRestricao', boundaryId: m.boundaries[0].id, faixaMm: 1000 })).toThrow(/Só a faixa restrita/);
    // Canônico.
    const json = canonicalPayload(x);
    const payload = parseCanonicalPayload(json);
    expect(payload.boundaries.find((b) => b.kind === 'RESTRICAO')!.restricao).toEqual({ tipo: 'APP', faixaMm: 10000 });
    expect(payload.boundaries.filter((b) => b.kind === 'TERRENO').every((b) => !('restricao' in b))).toBe(true);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(snapshotHash(volta)).toBe(snapshotHash(x));
  });
});
