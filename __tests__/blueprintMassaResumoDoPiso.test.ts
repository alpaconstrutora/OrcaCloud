/**
 * PAVIMENTO CLICÁVEL NA MASSA (27/10/2026): *"permitir clicar em cada pavimento e identificar em propriedades"*.
 * O resumo de UM pavimento do bloco — o que o painel Propriedades mostra para o piso clicado no 3D.
 */
import { describe, expect, it } from 'vitest';
import { resumoDoPiso, type MedidaDoBloco, type PisoDoBloco } from '../utils/blueprintMassa';

const piso = (indice: number, extra: Partial<PisoDoBloco> = {}): PisoDoBloco => ({
  indice,
  baseMm: (indice - 1) * 3000,
  topoMm: indice * 3000,
  subsolo: false,
  ordinal: indice,
  acimaDoGabarito: false,
  motivoDoGabarito: null,
  pecasDoEnvelope: [],
  cabe: true,
  areaForaMm2: 0,
  afastamentoMm: null,
  ...extra,
});

const medida = (pisos: PisoDoBloco[], extra: Partial<MedidaDoBloco> = {}): MedidaDoBloco => ({
  blocoId: 'b1',
  nome: 'Torre A',
  uso: 'RESIDENCIAL',
  projecaoM2: 176,
  pavimentos: pisos.length,
  pavimentosNoSubsolo: pisos.filter((p) => p.subsolo).length,
  areaConstruidaM2: 176 * pisos.length,
  areaComputavelM2: 176 * pisos.length,
  areaNaoComputavelM2: 0,
  baseMm: pisos[0].baseMm,
  topoMm: pisos[pisos.length - 1].topoMm,
  alturaM: pisos[pisos.length - 1].topoMm / 1000,
  pisos,
  pisosAcimaDoGabarito: 0,
  pisosForaDoEnvelope: 0,
  apoiadoEm: null,
  ...extra,
});

describe('resumoDoPiso', () => {
  it('identifica o pavimento, as cotas e a área de um piso que cabe', () => {
    const r = resumoDoPiso(medida([piso(1), piso(2), piso(3)]), 2)!;
    expect(r.titulo).toBe('Torre A · 2º pavimento de 3');
    expect(r.linhas).toContain('Cota 3,00 m a 6,00 m · 176,00 m²');
    expect(r.linhas).toContain('Cabe no envelope.');
    expect(r.problema).toBe(false);
  });

  it('diz quanto sai do envelope e o motivo do gabarito', () => {
    const r = resumoDoPiso(
      medida([piso(1), piso(2, { cabe: false, areaForaMm2: 12_500_000, acimaDoGabarito: true, motivoDoGabarito: 'Passa de 18,00 m' })]),
      2,
    )!;
    expect(r.linhas).toContain('Fora do envelope: 12,50 m²');
    expect(r.linhas).toContain('Acima do gabarito: Passa de 18,00 m');
    expect(r.problema).toBe(true);
  });

  it('subsolo e lote aberto', () => {
    const r = resumoDoPiso(medida([piso(1, { baseMm: -3000, topoMm: 0, subsolo: true, ordinal: null, cabe: null })], { nome: 'Subsolo' }), 1)!;
    expect(r.titulo).toBe('Subsolo · 1º pavimento de 1 (subsolo)');
    expect(r.linhas).toContain('Cota -3,00 m a 0,00 m · 176,00 m²');
    expect(r.linhas).toContain('Sem lote fechado: o envelope não pôde ser conferido.');
  });

  it('torre sobre podium: a ordem no gabarito conta os pavimentos de baixo', () => {
    const r = resumoDoPiso(medida([piso(1, { ordinal: 4 }), piso(2, { ordinal: 5 })]), 1)!;
    expect(r.linhas).toContain('4º no gabarito (conta os pavimentos do bloco de baixo)');
  });

  it('índice que não existe no bloco', () => {
    expect(resumoDoPiso(medida([piso(1)]), 7)).toBeNull();
  });
});
