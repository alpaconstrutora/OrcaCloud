/**
 * CURVA E Icn DO DISJUNTOR (E3.3 do roadmap elétrico, 29/09/2026, kernel 0.75.0, quant-1.23.0).
 *
 * `Circuito.curva` (B/C/D) e `Quadro.icnKa` declarados; a Ik presumida na
 * entrada é HIPÓTESE (4,5 kA, a confirmar com a concessionária); a 5.3.5.5
 * confere Icn ≥ Ik. Curva sugerida: C; D onde há motor. O disjuntor passa a
 * ser comprado por In, curva e Icn. FORA: Ik por impedância (backlog).
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyCommand, canonicalPayload, computeQuantities, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, preDimensionarCircuito, sugerirCurva } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { desenharUnifilar, montarUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { memorialEletrico, verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';

function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2', tensaoV: 220, ligacao: 'FF', secaoMm2: 4, disjuntorA: 20 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2000, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: c1 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'AC', at: point(4000, 75), cotaMm: 2200, tipoEletrico: 'AR_CONDICIONADO', potenciaW: 1400 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: c2 }).model;
  return m;
}
const RT = { nome: 'Eng.', titulo: 'Engenheiro', conselho: 'CREA' as const, registro: '1', artNumero: '1', artData: '2026-09-29' };
const regra = (m: BlueprintModel, hip = HIPOTESES_PADRAO) => conferirNbr5410(m, null, hip).regras.find((r) => r.codigo === '5.3.5.5')!;

describe('curva e Icn · kernel 0.75.0', () => {
  it('versões; curva e Icn gravam e tiram; canônico omite sem eles e faz ida e volta; valores inválidos recusados', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.90.0');
    expect(POLITICA_PADRAO.version).toBe('quant-1.24.0');
    const m0 = casa();
    const antes = canonicalPayload(m0) as unknown as string;
    expect(antes).not.toContain('"curva"');
    expect(antes).not.toContain('"icnKa"');
    let m = applyCommand(m0, { type: 'SetCircuitoProps', circuitoId: m0.circuitos[0].id, curva: 'B' }).model;
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, icnKa: 6 }).model;
    expect(m.circuitos[0].curva).toBe('B');
    expect(m.quadros[0].icnKa).toBe(6);
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"curva":"B"');
    expect(texto).toContain('"icnKa":6');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(volta.circuitos.find((c) => c.nome === 'C1')!.curva).toBe('B');
    expect(volta.quadros[0].icnKa).toBe(6);
    expect(canonicalPayload(volta)).toBe(texto);
    expect(() => applyCommand(m0, { type: 'SetQuadroProps', quadroId: m0.quadros[0].id, icnKa: 0 })).toThrow(/icnKa inválida/);
    expect(() => applyCommand(m0, { type: 'SetCircuitoProps', circuitoId: m0.circuitos[0].id, curva: 'Z' as 'B' })).toThrow(/Curva inválida/);
  });

  it('curva sugerida: C na tomada, D no ar-condicionado (hipótese); o pré-dim traz declarada e sugerida', () => {
    const m = casa();
    expect(sugerirCurva([{ tipoEletrico: 'TUG' }])).toBe('C');
    expect(sugerirCurva([{ tipoEletrico: 'MOTOR_BOMBA' }])).toBe('D');
    expect(sugerirCurva([])).toBe('C');
    const r1 = preDimensionarCircuito(m, m.circuitos[0], HIPOTESES_PADRAO);
    const r2 = preDimensionarCircuito(m, m.circuitos[1], HIPOTESES_PADRAO);
    expect(r1.curvaSugerida).toBe('C');
    expect(r1.curvaDeclarada).toBeNull();
    expect(r2.curvaSugerida).toBe('D');
    const decl = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: m.circuitos[1].id, curva: 'C' }).model;
    expect(preDimensionarCircuito(decl, decl.circuitos[1], HIPOTESES_PADRAO).curvaDeclarada).toBe('C');
  });
});

describe('5.3.5.5 · Icn ≥ Ik presumida', () => {
  it('sem Icn = AVISO com a Ik hipótese; Icn 3 kA × Ik 4,5 = FALTA citando 5.3.5.5; 6 kA passa; a hipótese muda o veredito (Ik 10 → 6 falha)', () => {
    const m = casa();
    expect(regra(m).achados).toEqual([expect.objectContaining({ nivel: 'AVISO', mensagem: expect.stringMatching(/Icn.*não declarada — Ik presumida 4,5 kA \(hipótese\)/) })]);
    expect(regra(m).titulo).toMatch(/4,5 kA — hipótese, a confirmar com a concessionária/);
    const tres = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, icnKa: 3 }).model;
    expect(regra(tres).achados).toEqual([expect.objectContaining({ nivel: 'FALTA', mensagem: expect.stringMatching(/Icn 3 kA abaixo da corrente de curto presumida 4,5 kA.*5\.3\.5\.5/) })]);
    const seis = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, icnKa: 6 }).model;
    expect(regra(seis).achados).toEqual([]);
    expect(regra(seis, { ...HIPOTESES_PADRAO, ikEntradaKa: 10 }).achados).toHaveLength(1);
  });

  it('executivo: verificação "capacidade de interrupção" por quadro (não declarada = pendência); memorial cita a Ik hipótese, a curva e o veredito', () => {
    const m = casa();
    const conf = conferirNbr5410(m, null, HIPOTESES_PADRAO);
    const r = verificacoesEletricas(m, HIPOTESES_PADRAO, RT, conf);
    const item = r.verificacoes.find((v) => v.item === 'QDC — capacidade de interrupção')!;
    expect(item.atende).toBe(false);
    expect(item.obtido).toBe('Icn não declarada');
    const seis = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, icnKa: 6 }).model;
    const r6 = verificacoesEletricas(seis, HIPOTESES_PADRAO, RT, conferirNbr5410(seis, null, HIPOTESES_PADRAO));
    expect(r6.verificacoes.find((v) => v.item === 'QDC — capacidade de interrupção')!.atende).toBe(true);
    const L = memorialEletrico(RT, HIPOTESES_PADRAO, r6, { nomeDoEstudo: 'Casa', hashDoDesenho: 'd'.repeat(64), hashDaBase: 'b'.repeat(64), emitidoEm: '2026-09-29T12:00:00Z' }, seis);
    expect(L.some((l) => /Corrente de curto-circuito presumida na entrada: 4,5 kA — hipótese/.test(l))).toBe(true);
    expect(L.some((l) => /Icn 6 kA; corrente de curto presumida na entrada 4,5 kA.*ATENDE 5\.3\.5\.5\./.test(l))).toBe(true);
    expect(L.some((l) => /C2 .*\(curva sugerida D\)/.test(l))).toBe(true);
  });
});

describe('unifilar, quadro de cargas e quantitativo', () => {
  it('ramal escreve "16 A C" (declarada) e "20 A D*" (sugerida); GERAL leva "· 6 kA"; texto do quadro de cargas com curva e a linha de Icn', () => {
    let m = casa();
    m = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: m.circuitos[0].id, curva: 'C' }).model;
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, icnKa: 6 }).model;
    const [dg] = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(dg.ramais[0]).toMatchObject({ curva: 'C', curvaOrigem: 'DECLARADA' });
    expect(dg.ramais[1]).toMatchObject({ curva: 'D', curvaOrigem: 'SUGERIDA' });
    expect(dg.entrada.icnKa).toBe(6);
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    expect(d.textos()).toContain('16 A C');
    expect(d.textos()).toContain('20 A D*');
    expect(d.textos().some((t) => /^GERAL \d+ A · 6 kA$/.test(t))).toBe(true);
    const L = linhasDoQuadroDeCargas(m);
    expect(L.some((l) => /\| 16 C \/ \d+ C \|/.test(l))).toBe(true);
    expect(L.some((l) => /\| 20 \/ \d+ D \|/.test(l))).toBe(true);
    expect(L).toContain('  Icn dos disjuntores: 6 kA - Ik presumida 4,5 kA (hipotese)');
    expect(linhasDoQuadroDeCargas(casa())).toContain('  Icn dos disjuntores: nao declarada - Ik presumida 4,5 kA (hipotese)');
    const q = computeQuantities(m, POLITICA_PADRAO);
    expect(q.totais.porDisjuntor).toEqual([
      { inA: 16, curva: 'C', icnKa: 6, quantidade: 1 },
      { inA: 20, curva: null, icnKa: 6, quantidade: 1 },
    ]);
  });
});
