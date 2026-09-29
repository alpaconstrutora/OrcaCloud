/**
 * A SEÇÃO DE CADA CONDUTOR e o FIO POR TIPO (E2.3 do roadmap elétrico, 29/09/2026, kernel 0.72.0, quant-1.20.0).
 *
 * PE pela Tabela 58, neutro igual à fase (6.2.6.2, sem a redução do trifásico
 * — hipótese conservadora), declarados que vencem, canônico que omite, e o
 * quantitativo que lê a fiação DERIVADA: numa casa ligada de verdade, o
 * retorno vira metro de fio e o ramal da luz não compra fase.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, point, secaoDoNeutroMm2, secaoDoPeMm2, secoesDosCondutores, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { condutoresDoRamal } from '../utils/blueprintUnifilar';

describe('seção por condutor · a norma', () => {
  it('kernel 0.72.0 e quant-1.20.0', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.78.0');
    expect(POLITICA_PADRAO.version).toBe('quant-1.23.0');
  });

  it('Tabela 58: até 16 igual à fase; 16–35 → 16; acima → metade, na nominal acima (95 → 50; 120 → 70)', () => {
    expect(secaoDoPeMm2(1.5)).toBe(1.5);
    expect(secaoDoPeMm2(2.5)).toBe(2.5);
    expect(secaoDoPeMm2(16)).toBe(16);
    expect(secaoDoPeMm2(25)).toBe(16);
    expect(secaoDoPeMm2(35)).toBe(16);
    expect(secaoDoPeMm2(50)).toBe(25);
    expect(secaoDoPeMm2(70)).toBe(35);
    expect(secaoDoPeMm2(95)).toBe(50);
    expect(secaoDoPeMm2(120)).toBe(70);
  });

  it('neutro = fase (6.2.6.2), inclusive no trifásico acima de 25 (hipótese conservadora); o declarado vence os dois', () => {
    expect(secaoDoNeutroMm2(4, 'FN')).toBe(4);
    expect(secaoDoNeutroMm2(50, 'FFF')).toBe(50);
    expect(secoesDosCondutores({ ligacao: 'FN' }, 50)).toEqual({ faseMm2: 50, neutroMm2: 50, peMm2: 25, neutroDerivado: true, peDerivado: true });
    expect(secoesDosCondutores({ ligacao: 'FN', secaoNeutroMm2: 25, secaoPeMm2: 35 }, 50)).toEqual({ faseMm2: 50, neutroMm2: 25, peMm2: 35, neutroDerivado: false, peDerivado: false });
    expect(secoesDosCondutores({}, null)).toEqual({ faseMm2: null, neutroMm2: null, peMm2: null, neutroDerivado: true, peDerivado: true });
  });

  it('unifilar: "2#2,5 + T2,5"; fase 50 → "2#50 + T25"; neutro declarado diferente → "1#4 + N2,5 + T4"', () => {
    expect(condutoresDoRamal('FN', 2.5)).toBe('2#2,5 + T2,5');
    expect(condutoresDoRamal('FN', 50)).toBe('2#50 + T25');
    expect(condutoresDoRamal('FFF', 70)).toBe('3#70 + T35');
    expect(condutoresDoRamal('FN', 4, 2.5)).toBe('1#4 + N2,5 + T4');
    expect(condutoresDoRamal('FN', 4, null, 6)).toBe('2#4 + T6');
  });
});

describe('seção por condutor · kernel', () => {
  it('AddCircuito/SetCircuitoProps gravam neutro e PE; o canônico omite quando ausentes e emite quando declarados', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', secaoMm2: 50 }).model;
    const texto = (x: BlueprintModel) => { const p = canonicalPayload(x) as unknown; return typeof p === 'string' ? p : JSON.stringify(p); };
    expect(texto(m)).not.toContain('secaoPeMm2');
    m = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: m.circuitos[0].id, secaoPeMm2: 35, secaoNeutroMm2: 25 }).model;
    expect(m.circuitos[0].secaoPeMm2).toBe(35);
    expect(texto(m)).toContain('"secaoPeMm2":35');
    m = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: m.circuitos[0].id, secaoPeMm2: null }).model;
    expect(m.circuitos[0].secaoPeMm2 ?? null).toBeNull();
  });
});

describe('fio por tipo · a casa LIGADA (quant-1.20.0)', () => {
  /** Quadro (0,0,1500) → teto → tronco 4 m → ramal da luz 2 m (luz no nó) e ramal do interruptor 2 m + prumada 1,7 m. C1 em 2,5 mm². */
  function casa(): BlueprintModel {
    const TETO = 2800;
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: TETO }).model;
    const t = base.levels[0].id;
    let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5 }).model;
    const c1 = m.circuitos[0].id;
    const trecho = (a: [number, number], ca: number, b: [number, number], cb: number): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25, circuitoIds: [c1] });
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(4000, 2000), cotaMm: TETO, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100, comando: 'a' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Int', at: point(6000, 0), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR', comando: 'a' },
      trecho([0, 0], 1500, [0, 0], TETO),
      trecho([0, 0], TETO, [4000, 0], TETO),
      trecho([4000, 0], TETO, [4000, 2000], TETO),
      trecho([4000, 0], TETO, [6000, 0], TETO),
      trecho([6000, 0], TETO, [6000, 0], 1100),
    ]).model;
    m = applyBatch(m, m.terminais.map((x) => ({ type: 'SetTerminalProps' as const, terminalId: x.id, circuitoId: c1 }))).model;
    return m;
  }

  it('⚠️ o RETORNO vira metro de fio e o ramal da luz não compra fase: F 7,0 m · N 7,3 m · R 5,7 m · T 7,3 m, tudo em 2,5', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO);
    const por = new Map(q.totais.porCondutor.map((c) => [`${c.tipo}:${c.secaoMm2}`, c.comprimentoM]));
    // A fase vai ao INTERRUPTOR, não à luz: quadro→teto 1,3 m + tronco 4,0 m + ramal do interruptor 2,0 m + prumada 1,7 m = 9,0 m.
    expect(por.get('FASE:2.5')).toBeCloseTo(1.3 + 4 + 2 + 1.7, 6);
    // Neutro e terra vão à LUZ: 1,3 + 4 + 2 (ramal da luz) = 7,3 m.
    expect(por.get('NEUTRO:2.5')).toBeCloseTo(7.3, 6);
    expect(por.get('TERRA:2.5')).toBeCloseTo(7.3, 6);
    // Retorno: interruptor → luz = prumada 1,7 + ramal do interruptor 2 + ramal da luz 2 = 5,7 m.
    expect(por.get('RETORNO:2.5')).toBeCloseTo(5.7, 6);
    expect(q.trechos.filter((t) => t.disciplina === 'ELETRICA').every((t) => t.origemDaFiacao === 'DERIVADO')).toBe(true);
    // O ramal da luz tem 3 condutores (N, R, T); o do interruptor, 2 (F, R).
    const ramalLuz = q.trechos.find((t) => t.comprimentoM === 2 && q.trechos.indexOf(t) === 2)!;
    expect(ramalLuz.condutores).toBe(3);
    expect(ramalLuz.condutoresPorSecao.map((c) => c.tipo).sort()).toEqual(['NEUTRO', 'RETORNO', 'TERRA']);
  });

  it('PE declarado diferente muda só a linha do terra', () => {
    let m = casa();
    m = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: m.circuitos[0].id, secaoPeMm2: 4 }).model;
    const q = computeQuantities(m, POLITICA_PADRAO);
    const por = new Map(q.totais.porCondutor.map((c) => [`${c.tipo}:${c.secaoMm2}`, c.comprimentoM]));
    expect(por.get('TERRA:4')).toBeCloseTo(7.3, 6);
    expect(por.has('TERRA:2.5')).toBe(false);
    expect(por.get('FASE:2.5')).toBeCloseTo(9, 6);
  });
});
