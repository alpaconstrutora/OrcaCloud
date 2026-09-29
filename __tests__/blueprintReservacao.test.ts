/**
 * E4.1 — CONSUMO E VOLUME DE RESERVAÇÃO (29/09/2026): população pelos nomes
 * dos ambientes, consumo diário, volume a reservar na série comercial e a
 * comparação com a caixa do desenho.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  HIPOTESES_RESERVATORIO_PADRAO,
  dimensionarReservacao,
  populacaoDoModelo,
  volumeComercialL,
  volumeDoReservatorioL,
} from '../utils/blueprintReservacao';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';

/** Uma fileira de cômodos 3 × 3 m com os nomes dados; `caixa` põe uma caixa d'água. */
function casa(nomes: string[], caixa?: { volumeL?: number; medidas?: boolean }): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  const L = nomes.length * 3000;
  m = applyBatch(m, [w(0, 0, L, 0), w(L, 0, L, 3000), w(L, 3000, 0, 3000), w(0, 3000, 0, 0), ...nomes.slice(1).map((_, i) => w((i + 1) * 3000, 0, (i + 1) * 3000, 3000))]).model;
  m = recomputeSpaces(m);
  for (const s of m.spaces) {
    const i = Math.floor(Math.min(...s.ring.map((p) => p.x)) / 3000);
    m = applyCommand(m, { type: 'NameSpace', spaceId: s.id, name: nomes[i] }).model;
  }
  if (caixa) {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(100, 100), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' }).model;
    const id = m.terminais![m.terminais!.length - 1].id;
    if (caixa.volumeL) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, volumeL: caixa.volumeL }).model;
    if (caixa.medidas) m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, larguraMm: 1200, profundidadeMm: 1000, alturaMm: 800 }).model;
  }
  return m;
}

const H = HIPOTESES_RESERVATORIO_PADRAO;

describe('E4.1 — população', () => {
  it('2 por dormitório e suíte, 1 pela dependência; sala e banheiro não contam', () => {
    const p = populacaoDoModelo(casa(['Suíte master', 'Dorm. 2', 'Quarto 3', 'Sala', 'Banheiro', 'Dependência de empregada']), H);
    expect(p.ambientes.map((a) => [a.tipo, a.pessoas])).toEqual([
      ['SUITE', 2],
      ['DORMITORIO', 2],
      ['DORMITORIO', 2],
      ['DEPENDENCIA', 1],
    ]);
    expect(p.contada).toBe(7);
    expect(p.pessoas).toBe(7);
    expect(p.declarada).toBe(false);
  });

  it('a população declarada substitui a contada', () => {
    const p = populacaoDoModelo(casa(['Quarto']), { ...H, populacaoDeclarada: 30 });
    expect(p).toMatchObject({ contada: 2, pessoas: 30, declarada: true });
  });
});

describe('E4.1 — volume', () => {
  it('série comercial: arredonda para cima; acima da série, múltiplo de 1000 L', () => {
    expect(volumeComercialL(800)).toBe(1000);
    expect(volumeComercialL(1000)).toBe(1000);
    expect(volumeComercialL(1001)).toBe(1500);
    expect(volumeComercialL(22500)).toBe(23000);
    expect(volumeComercialL(0)).toBe(0);
  });

  it('volume da caixa: o comercial declarado vence as medidas; sem nenhum, null', () => {
    const [comVolume] = casa(['Quarto'], { volumeL: 1000, medidas: true }).terminais!;
    const [soMedidas] = casa(['Quarto'], { medidas: true }).terminais!;
    const [nada] = casa(['Quarto'], {}).terminais!;
    expect(volumeDoReservatorioL(comVolume)).toBe(1000);
    expect(volumeDoReservatorioL(soMedidas)).toBe(960);
    expect(volumeDoReservatorioL(nada)).toBeNull();
  });

  it('situações: sem população, sem caixa, caixa sem volume, insuficiente e atende', () => {
    expect(dimensionarReservacao(casa(['Sala']), H).situacao).toBe('SEM_POPULACAO');
    const semCaixa = dimensionarReservacao(casa(['Quarto', 'Quarto']), H);
    expect(semCaixa).toMatchObject({ situacao: 'SEM_RESERVATORIO', consumoDiarioL: 800, volumeNecessarioL: 800, volumeSugeridoL: 1000 });
    expect(dimensionarReservacao(casa(['Quarto'], {}), H).situacao).toBe('SEM_VOLUME');
    const pequena = dimensionarReservacao(casa(['Suíte', 'Quarto', 'Quarto'], { volumeL: 1000 }), H);
    expect(pequena).toMatchObject({ situacao: 'INSUFICIENTE', volumeNecessarioL: 1200, declaradoL: 1000, volumeSugeridoL: 1500 });
    expect(pequena.texto).toBe('Reservar 1.200 L; o desenho tem 1.000 L — faltam 200 L (sugerida: 1.500 L).');
    expect(dimensionarReservacao(casa(['Quarto', 'Quarto'], { volumeL: 1000 }), H).situacao).toBe('ATENDE');
  });

  it('dias de reserva multiplicam; com reservatório INFERIOR o volume se divide 60/40', () => {
    const m = casa(['Quarto', 'Quarto'], { volumeL: 1000 });
    const dois = dimensionarReservacao(m, { ...H, diasDeReserva: 2 });
    expect(dois).toMatchObject({ volumeNecessarioL: 1600, situacao: 'INSUFICIENTE', inferiorNecessarioL: 0, superiorNecessarioL: 1600 });
    const comInferior = dimensionarReservacao(m, { ...H, diasDeReserva: 2 }, new Set([m.terminais![0].id]));
    expect(comInferior.inferiorNecessarioL).toBeCloseTo(960);
    expect(comInferior.superiorNecessarioL).toBeCloseTo(640);
  });
});

describe('E4.1 — premissas do estudo', () => {
  it('a coluna antiga (sem `reservatorio`) completa com o padrão; valor gravado vale', () => {
    expect(hipotesesHidroDaColuna({ agua: {} }).reservatorio).toEqual(H);
    expect(hipotesesHidroDaColuna({ reservatorio: { perCapitaLDia: 150, diasDeReserva: 2 } }).reservatorio).toMatchObject({ perCapitaLDia: 150, diasDeReserva: 2, pessoasPorDormitorio: 2 });
  });
});
