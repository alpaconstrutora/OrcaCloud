/**
 * P2.8 (20/09/2026, backlog P2): (1) o volume do ambiente entra no quantitativo
 * (quant-1.14.0) com o pé-direito ÚTIL — pavimento menos o rebaixo do forro
 * declarado — e sai na planilha; (2) o "cabe?" do envelope é pela FACE externa
 * da parede, não pelo eixo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, emptyModel, KERNEL_VERSION, point, POLITICA_PADRAO, type Command } from '../utils/blueprintKernel';
import { abasDoQuantitativo } from '../utils/blueprintPlanilha';
import { divisasDoLote, medirTerreno } from '../utils/blueprintTerreno';
import { envelopeVertical } from '../utils/blueprintEnvelope3d';

describe('volume do ambiente no quantitativo (quant-1.14.0)', () => {
  it('pé-direito útil = pavimento − rebaixo do forro; volume = piso líquido × pé-direito; a planilha leva as duas colunas', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    m = applyBatch(m, [w(0, 0, 4000, 0), w(4000, 0, 4000, 4000), w(4000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
    const sem = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    expect(sem.policy.version).toBe('quant-1.15.0');
    const a = sem.ambientes[0];
    expect(a.peDireitoM).toBe(2.8);
    expect(a.volumeM3).toBe(Math.round(a.areaPisoM2 * 2.8 * 100) / 100);
    // Forro rebaixado 300 mm: pé-direito útil 2,50 m; a área não muda.
    const lbl = m.labels[0];
    const comForro = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: lbl.id, acabamentos: { forro: { camadas: [{ espessuraMm: 13, itemCode: 'GESSO', descricao: 'Gesso', funcao: 'ACABAMENTO' }], rebaixoMm: 300 } } }).model;
    const com = computeQuantities(comForro, POLITICA_PADRAO, KERNEL_VERSION).ambientes[0];
    expect(com.peDireitoM).toBe(2.5);
    expect(com.volumeM3).toBe(Math.round(a.areaPisoM2 * 2.5 * 100) / 100);
    expect(com.areaPisoM2).toBe(a.areaPisoM2);
    // Planilha: aba Ambientes com "Pé-direito útil (m)" e "Volume (m³)".
    const aba = abasDoQuantitativo(computeQuantities(comForro, POLITICA_PADRAO, KERNEL_VERSION), { titulo: 'x', revisao: 1, hash: 'h', kernelVersion: KERNEL_VERSION }).find((x) => x.nome === 'Ambientes')!;
    expect(aba.linhas[0]).toContain('Pé-direito útil (m)');
    expect(aba.linhas[0]).toContain('Volume (m³)');
    const iPd = aba.linhas[0].indexOf('Pé-direito útil (m)');
    expect(Number(aba.linhas[1][iPd])).toBe(2.5);
  });
});

describe('"cabe?" pela face externa (envelope)', () => {
  it('parede de 20 cm: face exatamente na linha do recuo cabe; eixo 5 cm além (face 5 cm dentro do recuo) invade pela face', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
    m = applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
    const recuos = { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
    const zona = { afastamentoProgressivo: null, gabaritoAlturaMaxM: null, gabaritoPavimentos: null };
    const casa = (yFrente: number) => {
      const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 3000 });
      return applyBatch(m, [w(4000, yFrente, 16000, yFrente), w(16000, yFrente, 16000, 20000), w(16000, 20000, 4000, 20000), w(4000, 20000, 4000, yFrente)]).model;
    };
    const terreno = medirTerreno(divisasDoLote(m.boundaries))!;
    // Eixo a 5,10 m: a face externa fica a 5,00 m — em cima da linha do recuo: cabe.
    const naLinha = envelopeVertical(casa(5100), terreno, m.boundaries, recuos, zona)!.prismas[0];
    expect(naLinha.cabe).toBe(true);
    expect(naLinha.areaForaMm2).toBe(0);
    // Eixo a 5,05 m: pelo EIXO caberia; pela FACE (4,95 m) invade 5 cm × 12,2 m.
    const invade = envelopeVertical(casa(5050), terreno, m.boundaries, recuos, zona)!.prismas[0];
    expect(invade.cabe).toBe(false);
    expect(invade.areaForaMm2).toBe(12200 * 50);
  });
});
