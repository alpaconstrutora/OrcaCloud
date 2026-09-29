/**
 * O UNIFILAR EM ÁRVORE e o UNIFILAR NO DXF (E4.5 do roadmap elétrico, 29/09/2026).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { ARVORE, desenharUnifilarEmArvore, layoutDaArvore, medidasDoUnifilar, montarUnifilar, niveisDaArvore, temHierarquia } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDoUnifilar, enquadrar, orientar } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';

/** QGBT → QD1, QD2; QD2 → QD2.1. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const quadro = (nome: string, x: number, pai: string | null, extras: Record<string, unknown> = {}) => {
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome, at: point(x, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: pai, alimentadorM: 10, ...extras } as never).model;
    const id = m.quadros[m.quadros.length - 1].id;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: id, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, 1000), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[m.circuitos.length - 1].id }).model;
    return id;
  };
  const qgbt = quadro('QGBT', 0, null, { tipo: 'QGBT' });
  quadro('QD1', 4000, qgbt);
  const qd2 = quadro('QD2', 8000, qgbt);
  quadro('QD2.1', 12000, qd2);
  return m;
}

describe('unifilar em árvore', () => {
  it('três linhas: [QGBT], [QD1, QD2], [QD2.1]; a largura da árvore é a da linha mais larga; o traço em L e o rótulo "QGBT → QD1 · condutores · 10 m"', () => {
    const m = predio();
    const diagramas = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(temHierarquia(diagramas)).toBe(true);
    expect(niveisDaArvore(diagramas).map((l) => l.map((d) => d.nome))).toEqual([['QGBT'], ['QD1', 'QD2'], ['QD2.1']]);
    const lay = layoutDaArvore(diagramas);
    const [qd1, qd2] = diagramas.filter((d) => d.nome === 'QD1' || d.nome === 'QD2');
    expect(lay.larguraMm).toBe(medidasDoUnifilar(qd1).larguraMm + ARVORE.vaoMm + medidasDoUnifilar(qd2).larguraMm);
    expect(lay.posicoes.get(qd1.quadroId)!.y).toBe(medidasDoUnifilar(diagramas[0]).alturaMm + ARVORE.entreLinhasMm);
    const d = new DesenhistaDeProva();
    const m2 = desenharUnifilarEmArvore(d, diagramas, 0, 0, 1);
    expect(m2).toEqual({ larguraMm: lay.larguraMm, alturaMm: lay.alturaMm });
    const textos = d.textos();
    for (const n of ['QGBT — FN 127 V', 'QD1 — FN 127 V', 'QD2 — FN 127 V', 'QD2.1 — FN 127 V']) expect(textos.some((t) => t.startsWith(n))).toBe(true);
    expect(textos.some((t) => /^QGBT → QD1 · 2#\d+(,\d+)? \+ T\d+(,\d+)? · 10 m$/.test(t))).toBe(true);
    expect(textos.some((t) => /^QD2 → QD2\.1/.test(t))).toBe(true);
    // Sem hierarquia, não há árvore.
    let solo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    solo = applyCommand(solo, { type: 'AddQuadro', levelId: solo.levels[0].id, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
    expect(temHierarquia(montarUnifilar(solo))).toBe(false);
    expect(niveisDaArvore(montarUnifilar(solo)).map((l) => l.length)).toEqual([1]);
  });

  it('a folha do unifilar usa a árvore com hierarquia e volta a "por quadro" com `unifilarPorQuadro`; o DXF leva o unifilar em UNIFILAR / UNIFILAR-TEXTO', () => {
    const m = predio();
    const papel = orientar(PAPEIS.find((p) => p.id === 'A1') ?? PAPEIS[0], true);
    const o = { denominador: 50, papel, titulo: 'Prédio', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-29T12:00:00Z'), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO };
    const enq = enquadrar(m, 50, papel, false);
    const arvore = new DesenhistaDeProva();
    desenharFolhaDoUnifilar(arvore, m, o, enq);
    expect(arvore.textos()).toContain('DIAGRAMA UNIFILAR');
    expect(arvore.textos().some((t) => /^QGBT → QD1/.test(t))).toBe(true);
    const porQuadro = new DesenhistaDeProva();
    desenharFolhaDoUnifilar(porQuadro, m, { ...o, unifilarPorQuadro: true }, enq);
    expect(porQuadro.textos().some((t) => /^QGBT → QD1/.test(t))).toBe(false);
    expect(porQuadro.textos().filter((t) => /^GERAL /.test(t))).toHaveLength(4);
    const dxf = gerarDxf(m, { titulo: 'Prédio', revisao: 1, hash: 'p'.repeat(64), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO });
    expect(dxf).toMatch(/LAYER[\s\S]*\bUNIFILAR\b/);
    expect(dxf).toMatch(/8\s+UNIFILAR-TEXTO[\s\S]*?DIAGRAMA UNIFILAR/);
    expect(dxf).toMatch(/8\s+UNIFILAR-TEXTO[\s\S]*?QGBT → QD1/);
    const sem = gerarDxf(m, { titulo: 'Prédio', revisao: 1, hash: 'p'.repeat(64) });
    expect(sem).not.toMatch(/8\s+UNIFILAR-TEXTO[\s\S]*?DIAGRAMA UNIFILAR/);
  });
});
