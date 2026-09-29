/**
 * DEMANDA E QUEDA ACUMULADAS (E4.2 do roadmap elétrico, 29/09/2026, sem bump).
 *
 * A queda da origem ao pior ponto (6.2.7.1) soma os alimentadores de TODOS os
 * quadros da cadeia — QGBT → QD → circuito —, não só o do quadro que tem o
 * circuito. O limite é 5 % (rede pública) ou 7 % com transformador próprio
 * (hipótese). A tabela de demanda leva fonte e data para o memorial.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, PRESETS_DE_DEMANDA, limiteQuedaTotalEfetivoPct, preDimensionarQuadroCompleto, quedaDeTensaoPct, type HipotesesEletricas } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { hashDaBaseEletrica, memorialEletrico, verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';
import { hipotesesDaColuna } from '../hooks/useBlueprintEletrica';

/**
 * QGBT (alimentador 40 m) → QD (alimentador 40 m) → C1 com um chuveiro de 5.000 W a 30 m.
 * 127 V F-N em tudo. As quedas saem grandes de propósito: a soma passa de 5 %.
 */
function cadeia(opts: { alimQd?: number | null } = {}): { m: BlueprintModel; qgbt: string; qd: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QGBT', at: point(0, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, tipo: 'QGBT', alimentadorM: 40 }).model;
  const qgbt = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QD', at: point(30000, 0), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, quadroPaiId: qgbt, alimentadorM: opts.alimQd === undefined ? 40 : opts.alimQd }).model;
  const qd = m.quadros[1].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: qd, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 10, disjuntorA: 50 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Chuveiro', at: point(60000, 0), cotaMm: 2200, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: 5000 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
  return { m, qgbt, qd };
}
const TRAFO: HipotesesEletricas = { ...HIPOTESES_PADRAO, origemComTransformador: true };

describe('queda acumulada até a origem', () => {
  it('⚠️ QGBT → QD → C1: a queda do QD soma o alimentador do QGBT; a cadeia sai elo a elo; a FALTA 6.2.7.1 cita os dois; com trafo (7 %) o limite muda e a mensagem diz', () => {
    const { m, qgbt, qd } = cadeia();
    const pai = preDimensionarQuadroCompleto(m, qgbt)!;
    const filho = preDimensionarQuadroCompleto(m, qd)!;
    expect(pai.cadeia.map((e) => e.nome)).toEqual(['QGBT']);
    expect(filho.cadeia.map((e) => e.nome)).toEqual(['QGBT', 'QD']);
    expect(filho.cadeia[0].quedaAlimentadorPct).toBeCloseTo(pai.quedaAlimentadorPct!, 9);
    expect(filho.quedaAcumuladaPct).toBeCloseTo(pai.quedaAlimentadorPct! + filho.quedaAlimentadorPct!, 9);
    const terminal = filho.circuitos[0].quedaPct!;
    expect(filho.quedaTotalMaxPct).toBeCloseTo(filho.quedaAcumuladaPct! + terminal, 9);
    // Os números: IB 39,4 A; alimentador do QGBT e do QD em 10 mm² (Tab. 36) a 40 m ≈ 2,6 % cada; terminal 30 m em 10 mm² ≈ 1,9 %.
    expect(filho.quedaTotalMaxPct!).toBeGreaterThan(5);
    expect(filho.limiteQuedaEfetivoPct).toBe(5);
    const falta = filho.achados.find((a) => a.referencia === '6.2.7.1')!;
    expect(falta.nivel).toBe('FALTA');
    expect(falta.mensagem).toMatch(/queda da origem ao pior ponto [\d,]+ % \(QGBT [\d,]+ % \+ QD [\d,]+ % \+ terminal [\d,]+ %\), limite 5,0 %/);
    // O QGBT também estoura SOZINHO (40 m em 6 mm² a 39 A ≈ 8,5 %) — e a mensagem dele tem só o próprio elo, sem "+ QD".
    const faltaPai = pai.achados.find((a) => a.referencia === '6.2.7.1')!;
    expect(faltaPai.mensagem).toMatch(/\(QGBT [\d,]+ % \+ terminal 0,0 %\), limite 5,0 %/);
    expect(faltaPai.mensagem).not.toMatch(/QD/);
    // Sem o pai a conta seria só QD + terminal — e é esse o erro que a cadeia corrige.
    const soQd = filho.quedaAlimentadorPct! + terminal;
    expect(filho.quedaTotalMaxPct!).toBeGreaterThan(soQd);
    // Com transformador próprio: limite 7 %, dito.
    expect(limiteQuedaTotalEfetivoPct(TRAFO)).toBe(7);
    expect(limiteQuedaTotalEfetivoPct({ limiteQuedaTotalPct: 8, origemComTransformador: true })).toBe(8);
    const comTrafo = preDimensionarQuadroCompleto(m, qd, TRAFO)!;
    expect(comTrafo.limiteQuedaEfetivoPct).toBe(7);
    const f2 = comTrafo.achados.find((a) => a.referencia === '6.2.7.1');
    if (f2) expect(f2.mensagem).toMatch(/limite 7,0 % \(transformador próprio\)/);
    else expect(comTrafo.quedaTotalMaxPct!).toBeLessThanOrEqual(7);
    // A conferência repete a falta com o nome do quadro.
    const r = conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((x) => x.codigo === '6.2.7.1')!;
    expect(r.achados.some((a) => /^QD \(6\.2\.7\.1\): queda da origem ao pior ponto .*QGBT .* \+ QD /.test(a.mensagem))).toBe(true);
    // E a hipótese do trafo entra no hash da base.
    expect(hashDaBaseEletrica(m, HIPOTESES_PADRAO).base).not.toBe(hashDaBaseEletrica(m, TRAFO).base);
  });

  it('elo sem comprimento: a soma fica indefinida, avalia só deste quadro para baixo e diz qual elo faltou', () => {
    const { m, qgbt, qd } = cadeia();
    const semPai = applyCommand(m, { type: 'SetQuadroProps', quadroId: qgbt, alimentadorM: null }).model;
    const filho = preDimensionarQuadroCompleto(semPai, qd)!;
    expect(filho.cadeia.map((e) => [e.nome, e.quedaAlimentadorPct == null])).toEqual([['QGBT', true], ['QD', false]]);
    expect(filho.quedaAcumuladaPct).toBeNull();
    expect(filho.naoAvaliado.some((x) => /QGBT sem comprimento de alimentador; avaliado só deste quadro para baixo/.test(x))).toBe(true);
    expect(filho.quedaTotalMaxPct).toBeCloseTo(filho.quedaAlimentadorPct! + filho.circuitos[0].quedaPct!, 9);
  });

  it('memorial: limite que valeu e por quê, a cadeia elo a elo, fonte e data da demanda com "CONFERIR"; presets têm só o "sem demanda"; coluna gravada lê fonte/data/trafo', () => {
    const { m } = cadeia();
    const hip: HipotesesEletricas = { ...TRAFO, demanda: { nome: 'NT residencial', ILUMINACAO: 1, TUG: 0.8, FORCA: 1, MOTOR: 1, fonte: 'NTD-001 rev. 3', dataISO: '2025-03-10' } };
    const RT = { nome: 'Eng.', titulo: 'Engenheiro', conselho: 'CREA' as const, registro: '1', artNumero: '1', artData: '2026-09-29' };
    const r = verificacoesEletricas(m, hip, RT, conferirNbr5410(m, null, hip));
    const L = memorialEletrico(RT, hip, r, { nomeDoEstudo: 'Prédio', hashDoDesenho: 'd'.repeat(64), hashDaBase: 'b'.repeat(64), emitidoEm: '2026-09-29T12:00:00Z' }, m);
    expect(L.some((l) => /fonte NTD-001 rev\. 3 \(10\/03\/2025\) — CONFERIR na norma da concessionária/.test(l))).toBe(true);
    expect(L.some((l) => /Queda da origem ao pior ponto \(6\.2\.7\.1\): limite 7 % — instalação com transformador próprio/.test(l))).toBe(true);
    expect(L.some((l) => /^Queda até a origem: QGBT [\d,]+ % \+ QD [\d,]+ % = [\d,]+ % nos alimentadores\.$/.test(l))).toBe(true);
    expect(PRESETS_DE_DEMANDA.map((p) => p.id)).toEqual(['SEM']);
    const lida = hipotesesDaColuna({ demanda: { nome: 'NT', fonte: 'NTD-001', dataISO: '2025-03-10' }, origemComTransformador: true });
    expect(lida.demanda.fonte).toBe('NTD-001');
    expect(lida.demanda.dataISO).toBe('2025-03-10');
    expect(lida.origemComTransformador).toBe(true);
    expect(hipotesesDaColuna({}).origemComTransformador).toBe(false);
    expect(hipotesesDaColuna({ demanda: { dataISO: 'ontem' } }).demanda.dataISO).toBeNull();
    void quedaDeTensaoPct;
  });
});
