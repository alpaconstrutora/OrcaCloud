/**
 * USO COLETIVO (E4.4 do roadmap elétrico, 29/09/2026, kernel 0.78.0).
 *
 * Oito unidades, cada uma com o seu QD alimentado pelo QGBT e o seu MEDIDOR na
 * medição: a demanda do condomínio é Σ unidades × fator de diversidade
 * (preset: "sem" = 1,00; "genérico" = fórmula, hipótese) + serviço. O
 * unifilar do QGBT lista os medidores. FORA: CODI por concessionária.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel } from '../utils/blueprintKernel';
import { FATORES_DE_DIVERSIDADE, HIPOTESES_PADRAO, fatorDeDiversidade, preDimensionarQuadroCompleto, type HipotesesEletricas } from '../utils/blueprintEletricaDimensionamento';
import { entradaDoQuadro } from '../utils/blueprintEntradaDeEnergia';
import { desenharUnifilar, montarUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { hipotesesDaColuna } from '../hooks/useBlueprintEletrica';

const N = 8;
/** QGBT (FFF 220/127) com serviço próprio de 2 kVA; N unidades com QD (1,5 kVA cada, F-N 127) e medidor; a última sem medidor quando `semUltimoMedidor`. */
function condominio(opts: { semUltimoMedidor?: boolean } = {}): { m: BlueprintModel; qgbt: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QGBT', at: point(0, 0), cotaMm: 1600, ligacao: 'FFF', tensaoV: 220, tipo: 'QGBT' }).model;
  const qgbt = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: qgbt, nome: 'C0 — serviço', tensaoV: 220, ligacao: 'FFF', secaoMm2: 4, disjuntorA: 16 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Bomba', at: point(500, 500), cotaMm: 1200, tipoEletrico: 'MOTOR_BOMBA', potenciaW: 2000 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
  for (let i = 1; i <= N; i++) {
    m = applyCommand(m, { type: 'AddUnidade', numero: `${100 + i}` }).model;
    const u = m.unidades[m.unidades.length - 1].id;
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: `QD ${100 + i}`, at: point(3000 * i, 5000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: qgbt, unidadeId: u, alimentadorM: 20 }).model;
    const qd = m.quadros[m.quadros.length - 1].id;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: qd, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5, disjuntorA: 20 }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000 * i, 5500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 1500 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[m.circuitos.length - 1].id }).model;
    if (!(opts.semUltimoMedidor && i === N)) {
      m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'kWh', at: point(-2000, 300 * i), cotaMm: 1500, tipoEletrico: 'MEDIDOR', quadroId: qgbt, unidadeId: u }).model;
    }
  }
  return { m, qgbt };
}
const GENERICO: HipotesesEletricas = { ...HIPOTESES_PADRAO, diversidade: 'GENERICO' };

describe('uso coletivo · kernel 0.78.0', () => {
  it('unidadeId no quadro e no medidor; canônico `unidade` por índice com ida e volta; só medidor mede; unidade inexistente recusada; apagar a unidade solta', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.83.0');
    const { m } = condominio();
    expect(m.quadros[1].unidadeId).toBe(m.unidades[0].id);
    const medidores = m.terminais.filter((t) => t.tipoEletrico === 'MEDIDOR');
    expect(medidores).toHaveLength(N);
    expect(medidores[0].unidadeId).toBe(m.unidades[0].id);
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"unidade":');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    const u101 = volta.unidades.find((u) => u.numero === '101')!;
    expect(volta.quadros.find((q) => q.nome === 'QD 101')!.unidadeId).toBe(u101.id);
    expect(volta.terminais.filter((t) => t.tipoEletrico === 'MEDIDOR' && t.unidadeId === u101.id)).toHaveLength(1);
    expect(canonicalPayload(volta)).toBe(texto);
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, unidadeId: m.unidades[0].id })).toThrow(/não mede unidade/);
    expect(() => applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[1].id, unidadeId: 'und_9999' })).toThrow(/Unidade/);
    const sem = applyCommand(m, { type: 'DeleteUnidade', unidadeId: m.unidades[0].id }).model;
    expect(sem.quadros[1].unidadeId ?? null).toBeNull();
    expect(sem.terminais.filter((t) => t.unidadeId === m.unidades[0].id)).toHaveLength(0);
  });

  it('⚠️ QGBT com 8 unidades: sem diversidade = 8 × 1.500 + 2.000 = 14.000 VA; genérico = 12.000 × 0,677 + 2.000; os filhos levam a unidade; a folha e o memorial dizem a conta', () => {
    const { m, qgbt } = condominio();
    const sem = preDimensionarQuadroCompleto(m, qgbt)!;
    expect(sem.unidadesAtendidas).toBe(8);
    expect(sem.fatorDeDiversidade).toBe(1);
    expect(sem.sDemandadaUnidadesVA).toBe(12000);
    expect(sem.sDemandadaServicoVA).toBe(2000);
    expect(sem.sDemandadaVA).toBe(14000);
    expect(sem.filhos.map((f) => f.unidade)).toEqual(['101', '102', '103', '104', '105', '106', '107', '108']);
    expect(FATORES_DE_DIVERSIDADE.map((f) => f.id)).toEqual(['SEM', 'GENERICO']);
    expect(fatorDeDiversidade('GENERICO').fator(1)).toBe(1);
    expect(fatorDeDiversidade('GENERICO').fator(8)).toBeCloseTo(0.677, 3);
    expect(fatorDeDiversidade('X').id).toBe('SEM');
    const gen = preDimensionarQuadroCompleto(m, qgbt, GENERICO)!;
    expect(gen.fatorDeDiversidade).toBeCloseTo(0.677, 3);
    expect(gen.sDemandadaVA).toBeCloseTo(12000 * 0.677 + 2000, 0);
    expect(gen.sDemandadaVA).toBeLessThan(sem.sDemandadaVA);
    // A unidade de um QD filho.
    expect(preDimensionarQuadroCompleto(m, m.quadros[1].id)!.unidade).toBe('101');
    const L = linhasDoQuadroDeCargas(m, GENERICO);
    expect(L.some((l) => /^  Uso coletivo: 8 unidade\(s\) x fator 0,677 = 8124 VA \+ servico 2000 VA \(genérico — hipótese de projeto\)$/.test(l))).toBe(true);
    expect(L.some((l) => /^QD 101 - unidade 101 - FN 127 V - alimentado por QGBT$/.test(l))).toBe(true);
    expect(hipotesesDaColuna({ diversidade: 'GENERICO' }).diversidade).toBe('GENERICO');
    expect(hipotesesDaColuna({ diversidade: 'CODI-X' }).diversidade).toBe('SEM');
  });

  it('o unifilar do QGBT lista os 8 medidores e a conta da diversidade; ramal do filho leva "un. 101"; a entrada avisa a unidade sem medidor', () => {
    const { m, qgbt } = condominio();
    const [dg] = montarUnifilar(m, GENERICO);
    expect(dg.medidores).toEqual(['101', '102', '103', '104', '105', '106', '107', '108']);
    expect(dg.diversidade).toEqual({ unidades: 8, fator: 0.677, unidadesVA: 8124, servicoVA: 2000 });
    expect(dg.ramais.find((r) => r.quadroFilho)!.unidade).toBe('101');
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    expect(d.textos().some((x) => x.startsWith('Medição: 101, 102') && x.includes('8 unid. × 0,677 = 8124 VA + serviço 2000 VA'))).toBe(true);
    expect(d.textos()).toContain('QD 101');
    expect(d.textos()).toContain('1500 VA dem. · un. 101');
    const e = entradaDoQuadro(m, qgbt)!;
    expect(e.unidadesAtendidas).toHaveLength(8);
    expect(e.unidadesMedidas).toHaveLength(8);
    expect(e.achados.some((a) => /sem medidor próprio/.test(a.mensagem))).toBe(false);
    const { m: falta, qgbt: q2 } = condominio({ semUltimoMedidor: true });
    const e2 = entradaDoQuadro(falta, q2)!;
    expect(e2.achados.some((a) => a.nivel === 'AVISO' && a.mensagem === 'unidade(s) sem medidor próprio: 108')).toBe(true);
    // Sem unidade nenhuma: nada de diversidade no unifilar.
    let solo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    solo = applyCommand(solo, { type: 'AddQuadro', levelId: solo.levels[0].id, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
    expect(montarUnifilar(solo)[0]).toMatchObject({ medidores: [], diversidade: null });
  });
});
