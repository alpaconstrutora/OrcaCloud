/**
 * DPS NO QUADRO (E3.2 do roadmap elétrico, 29/09/2026, kernel 0.74.0, quant-1.22.0).
 *
 * O DPS é declarado no quadro (classe, In, Up, disjuntor de desconexão); a
 * 6.3.5.2 o pede no quadro de entrada conforme a EXPOSIÇÃO a descargas — que
 * é hipótese do projetista: não avaliada = aviso, exposta = falta, não exposta
 * = dispensado e dito. Unifilar, quadro de cargas, quantitativo e memorial.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyCommand, canonicalPayload, computeQuantities, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, rotuloDoDPS, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, sugerirDPS, type HipotesesEletricas } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { desenharUnifilar, montarUnifilar, rodapeDoUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { hashDaBaseEletrica, memorialEletrico, verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';

function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 20 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2000, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
  return m;
}
const DPS = { classe: 'II' as const, upKv: 1.5, inKa: 20, disjuntorDesconexaoA: 20 };
const regra = (m: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO) => conferirNbr5410(m, null, hip).regras.find((r) => r.codigo === '6.3.5.2')!;

describe('DPS · kernel 0.74.0', () => {
  it('versões; SetQuadroProps grava e tira; canônico omite sem DPS e faz ida e volta com ele; valores inválidos são recusados', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.82.0');
    expect(POLITICA_PADRAO.version).toBe('quant-1.23.0');
    const m0 = casa();
    const antes = canonicalPayload(m0) as unknown as string;
    expect(antes).not.toContain('"dps"');
    const m = applyCommand(m0, { type: 'SetQuadroProps', quadroId: m0.quadros[0].id, dps: DPS }).model;
    expect(m.quadros[0].dps).toEqual(DPS);
    expect(rotuloDoDPS(DPS)).toBe('DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A');
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"dps"');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(volta.quadros[0].dps).toEqual(DPS);
    expect(canonicalPayload(volta)).toBe(texto);
    const sem = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, dps: null }).model;
    expect(sem.quadros[0].dps ?? null).toBeNull();
    expect(canonicalPayload(sem)).toBe(antes);
    expect(() => applyCommand(m0, { type: 'SetQuadroProps', quadroId: m0.quadros[0].id, dps: { ...DPS, inKa: -1 } })).toThrow(/inKa inválido/);
  });
});

describe('6.3.5.2 · exposição é hipótese', () => {
  it('sem DPS: não avaliada → AVISO; exposta → FALTA; não exposta → nada, e "dispensado" fica dito; com DPS sem desconexão → AVISO', () => {
    const m = casa();
    const r0 = regra(m);
    expect(r0.achados).toEqual([expect.objectContaining({ nivel: 'AVISO', mensagem: expect.stringMatching(/QDC: quadro de entrada sem DPS — exposição a descargas não avaliada/) })]);
    expect(r0.titulo).toMatch(/só os quadros sem quadro-pai/);
    const rE = regra(m, { ...HIPOTESES_PADRAO, exposicaoARaios: 'EXPOSTA' });
    expect(rE.achados).toEqual([expect.objectContaining({ nivel: 'FALTA', mensagem: expect.stringMatching(/EXPOSTA.*6\.3\.5\.2\.1/) })]);
    const rN = regra(m, { ...HIPOTESES_PADRAO, exposicaoARaios: 'NAO_EXPOSTA' });
    expect(rN.achados).toEqual([]);
    expect(rN.naoAvaliado).toEqual([expect.stringMatching(/dispensado pela hipótese/)]);
    const com = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, dps: DPS }).model;
    expect(regra(com, { ...HIPOTESES_PADRAO, exposicaoARaios: 'EXPOSTA' }).achados).toEqual([]);
    const semDesc = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, dps: { ...DPS, disjuntorDesconexaoA: null } }).model;
    expect(regra(semDesc).achados).toEqual([expect.objectContaining({ nivel: 'AVISO', mensagem: expect.stringMatching(/sem disjuntor de desconexão/) })]);
    // A hipótese entra no hash da base: mudar a exposição invalida a emissão anterior.
    expect(hashDaBaseEletrica(m, HIPOTESES_PADRAO).base).not.toBe(hashDaBaseEletrica(m, { ...HIPOTESES_PADRAO, exposicaoARaios: 'EXPOSTA' }).base);
  });

  it('sugestão = o DPS padrão da hipótese (classe II, 20 kA, Up 1,5 kV, desconexão 20 A) e a regra entra na verificação do executivo', () => {
    expect(sugerirDPS()).toEqual(DPS);
    const m = casa();
    const conf = conferirNbr5410(m, null, HIPOTESES_PADRAO);
    const r = verificacoesEletricas(m, HIPOTESES_PADRAO, { nome: 'Eng.', titulo: 'Engenheiro', conselho: 'CREA', registro: '1', artNumero: '1', artData: '2026-09-29' }, conf);
    const item = r.verificacoes.find((v) => v.norma === 'NBR 5410 6.3.5.2')!;
    expect(item).toBeDefined();
    expect(item.atende).toBe(true); // aviso não é falta
    const L = memorialEletrico({ nome: 'Eng.', titulo: 'Engenheiro', conselho: 'CREA', registro: '1', artNumero: '1', artData: '2026-09-29' }, HIPOTESES_PADRAO, r, { nomeDoEstudo: 'Casa', hashDoDesenho: 'd'.repeat(64), hashDaBase: 'b'.repeat(64), emitidoEm: '2026-09-29T12:00:00Z' }, m);
    expect(L.some((l) => /Exposição a descargas atmosféricas \(6\.3\.5\.2\.1\): não avaliada/.test(l))).toBe(true);
    expect(L.some((l) => /Proteção contra surtos: sem DPS declarado — exposição a descargas não avaliada/.test(l))).toBe(true);
  });
});

describe('unifilar, quadro de cargas e quantitativo', () => {
  it('com DPS: derivação para a terra depois do geral ("DPS" + rótulo), legenda; texto do quadro de cargas com a linha; sem DPS a linha diz "sem DPS"', () => {
    const m = applyCommand(casa(), { type: 'SetQuadroProps', quadroId: casa().quadros[0].id, dps: DPS }).model;
    const [dg] = montarUnifilar(m, HIPOTESES_PADRAO);
    expect(dg.entrada.dps).toBe('DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A');
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    expect(d.textos()).toContain('DPS');
    expect(d.textos()).toContain('DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A');
    expect(rodapeDoUnifilar([dg]).some((l) => l.startsWith('DPS:'))).toBe(true);
    const [sem] = montarUnifilar(casa(), HIPOTESES_PADRAO);
    expect(sem.entrada.dps).toBeNull();
    expect(rodapeDoUnifilar([sem]).some((l) => l.startsWith('DPS:'))).toBe(false);
    expect(linhasDoQuadroDeCargas(m)).toContain('  DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A');
    expect(linhasDoQuadroDeCargas(casa())).toContain('  sem DPS');
    const q = computeQuantities(m, POLITICA_PADRAO);
    expect(q.totais.dps).toBe(1);
    expect(q.totais.porDPS).toEqual([{ classe: 'II', inKa: 20, upKv: 1.5, quantidade: 1 }]);
    expect(q.totais.porQuadro[0].dps).toBe('DPS classe II · 20 kA · Up 1,5 kV · desconexão 20 A');
    expect(computeQuantities(casa(), POLITICA_PADRAO).totais.dps).toBe(0);
  });
});
