/**
 * E7.2 — DIMENSIONAMENTO DO TRATAMENTO INDIVIDUAL (29/09/2026, NBR 7229/13969):
 * V = 1000 + N(C·T + K·Lf), o filtro Vu = 1,6·N·C·T, a área do sumidouro
 * N·C/Ci; o lançamento nas medidas dimensionadas, a conferência e o memorial.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, type BlueprintModel } from '../utils/blueprintKernel';
import {
  HIPOTESES_TRATAMENTO_PADRAO,
  dimensionarTratamento,
  medidasDimensionadas,
  planejarTratamento,
  verificarTratamento,
} from '../utils/blueprintTratamento';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../utils/blueprintReservacao';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO, memorialDeCalculoHidro, memorialDescritivoHidro, type BlocoDoMemorial } from '../utils/blueprintMemorialHidro';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
const hip = HIPOTESES_TRATAMENTO_PADRAO;
const base = () => sobrado(true, { cotaDaCaixaMm: 4500, ventilacao: true });
const lancar = (m: BlueprintModel) => {
  const d = dimensionarTratamento(m, hip, HIPOTESES_RESERVATORIO_PADRAO);
  return applyBatch(m, planejarTratamento(m, { comFiltro: true, medidas: medidasDimensionadas(d) }).comandos).model;
};
const textos = (b: BlocoDoMemorial[]) => b.map((x) => ('texto' in x ? x.texto : 'cabecalho' in x ? x.cabecalho.join('|') + '\n' + x.linhas.map((l) => l.join('|')).join('\n') : '')).join('\n');

describe('E7.2 — as contas', () => {
  it('sobrado de 4 pessoas, padrão médio, 18 °C, limpeza anual: tanque 1780 L, filtro 1000 L (mínimo), sumidouro 10,4 m²', () => {
    const d = dimensionarTratamento(base(), hip, HIPOTESES_RESERVATORIO_PADRAO);
    expect(d).toMatchObject({ pessoas: 4, C: 130, Lf: 1, contribuicaoDiariaL: 520 });
    // T = 1,00 (até 1500 L/dia); K = 65 (10–20 °C, 1 ano); V = 1000 + 4·(130 + 65).
    expect(d.tanque).toMatchObject({ T: 1, K: 65, volumeL: 1780, profundidadeUtilMm: 1200, larguraMm: 900, comprimentoMm: 1800 });
    // Vu = 1,6·4·130·1,0 = 832 → mínimo 1000 L; leito 1,20 m → ø 1,05 m.
    expect(d.filtro).toMatchObject({ T: 1, volumeUtilL: 1000, diametroMm: 1050, leitoMm: 1200 });
    // A = 520/50 = 10,4 m²; ø 1,50: fundo 1,77 m² + parede π·1,5·h → h 1,85 m.
    expect(d.sumidouro.areaM2).toBeCloseTo(10.4, 9);
    expect(d.sumidouro).toMatchObject({ diametroMm: 1500, alturaUtilMm: 1850 });
    expect(d.avisos).toEqual([]);
  });

  it('as faixas de temperatura são as de CADA norma: 12 °C é 10–20 no lodo (K 65) e < 15 no filtro (T 1,17)', () => {
    const d = dimensionarTratamento(base(), { ...hip, temperaturaC: 12, intervaloDeLimpezaAnos: 2 }, HIPOTESES_RESERVATORIO_PADRAO);
    expect(d.tanque.K).toBe(105);
    expect(d.filtro.T).toBe(1.17);
  });

  it('solo pouco permeável: o sumidouro passa de 3 m e o aviso manda dividir', () => {
    const d = dimensionarTratamento(base(), { ...hip, taxaDeInfiltracaoLM2Dia: 20 }, HIPOTESES_RESERVATORIO_PADRAO);
    expect(d.sumidouro.alturaUtilMm).toBeGreaterThan(3000);
    expect(d.avisos[0]).toMatch(/divida em mais sumidouros/);
  });
});

describe('E7.2 — o lançamento dimensionado e a conferência', () => {
  it('as peças nascem nas medidas dimensionadas e atendem; a conferência NBR 7229 passa', () => {
    const m = lancar(base());
    const ts = m.terminais!.find((t) => t.tipoHidraulico === 'TANQUE_SEPTICO')!;
    expect(ts).toMatchObject({ larguraMm: 1800, profundidadeMm: 900, alturaMm: 1600 });
    const d = dimensionarTratamento(m, hip, HIPOTESES_RESERVATORIO_PADRAO);
    expect(verificarTratamento(m, d).every((u) => u.atende)).toBe(true);
    const g = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.filter((v) => v.grupo === 'NBR7229');
    expect(g.map((v) => v.item)).toEqual(['População de projeto', 'Tanque séptico: volume útil', 'Filtro anaeróbio: volume do leito', 'Sumidouro: área de infiltração']);
    expect(g.every((v) => v.atende)).toBe(true);
  });

  it('o tanque encolhido à mão não atende: a conferência diz quanto tem e quanto precisa', () => {
    const m0 = lancar(base());
    const ts = m0.terminais!.find((t) => t.tipoHidraulico === 'TANQUE_SEPTICO')!;
    const m = applyCommand(m0, { type: 'SetTerminalProps', terminalId: ts.id, larguraMm: 1000 }).model;
    const item = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.find((v) => v.item === 'Tanque séptico: volume útil')!;
    // 1,00 × 0,90 × 1,20 = 1,08 m³.
    expect(item).toMatchObject({ atende: false, obtido: '1.080 de 1.780 L' });
  });

  it('sem o filtro no desenho mas pedido nas premissas: pendência; sem pedir, o item some', () => {
    const d = dimensionarTratamento(base(), hip, HIPOTESES_RESERVATORIO_PADRAO);
    const m = applyBatch(base(), planejarTratamento(base(), { comFiltro: false, medidas: medidasDimensionadas(d) }).comandos).model;
    const com = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.find((v) => v.item === 'Filtro anaeróbio: volume do leito');
    expect(com).toMatchObject({ atende: false, obtido: 'não está no desenho' });
    const sem = verificacoesHidro(m, { ...HIPOTESES_HIDRO_PADRAO, tratamento: { ...hip, comFiltro: false } }, RESP).verificacoes.map((v) => v.item);
    expect(sem).not.toContain('Filtro anaeróbio: volume do leito');
  });
});

describe('E7.2 — memoriais e premissas', () => {
  it('cálculo: a subseção do tratamento no lugar do coletor; descritivo: as normas e o sistema', () => {
    const m = lancar(base());
    const calc = textos(memorialDeCalculoHidro(m, HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'Sobrado', geradoEm: '2026-09-29T12:00:00Z' }));
    expect(calc).toContain('Tratamento individual (NBR 7229 / NBR 13969)');
    expect(calc).toContain('Tanque — V = 1000 + N·(C·T + K·Lf)|1.780 L → 1,80 × 0,90 m, profundidade útil 1,20 m');
    expect(calc).not.toContain('Coletor predial e ligação à rede pública');
    const desc = textos(memorialDescritivoHidro(m, HIPOTESES_HIDRO_PADRAO, { nomeDoEstudo: 'Sobrado', geradoEm: '2026-09-29T12:00:00Z' }));
    expect(desc).toContain('ABNT NBR 7229:1993');
    expect(desc).toContain('ABNT NBR 13969:1997');
    expect(desc).toMatch(/tanque séptico de 1\.780 L, um filtro anaeróbio de 1\.000 L de leito e um sumidouro com 10,40 m²/);
  });

  it('premissas gravadas: o padrão fora da norma volta ao médio; números passam', () => {
    expect(hipotesesHidroDaColuna({}).tratamento).toEqual(HIPOTESES_TRATAMENTO_PADRAO);
    expect(hipotesesHidroDaColuna({ tratamento: { padrao: 'ALTO', temperaturaC: 25, taxaDeInfiltracaoLM2Dia: 80 } }).tratamento).toMatchObject({ padrao: 'ALTO', temperaturaC: 25, taxaDeInfiltracaoLM2Dia: 80 });
    expect(hipotesesHidroDaColuna({ tratamento: { padrao: 'LUXO' } }).tratamento.padrao).toBe('MEDIO');
  });
});
