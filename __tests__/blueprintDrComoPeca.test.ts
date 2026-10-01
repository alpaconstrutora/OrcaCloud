/**
 * DR COMO PEÇA DO QUADRO (E3.1 do roadmap elétrico, 29/09/2026, kernel 0.73.0, quant-1.21.0).
 *
 * O DR deixa de ser uma marca no circuito e vira dispositivo do quadro — In,
 * IΔn, polos, escopo (geral ou grupo). O legado `protecaoDR: true` continua
 * lendo igual (DR individual de 30 mA sem In). A 5.1.3.2.2 lê a peça; a peça é
 * conferida (In × proteção a montante; tamanho do grupo); o unifilar a põe na
 * posição certa; o quantitativo a compra por In/IΔn/polos.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  drDoCircuito,
  drsDoQuadro,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  rotuloDoDR,
  type BlueprintModel,
  type Command,
  type TipoDeAmbiente,
} from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO, sugerirInDoDR } from '../utils/blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from '../utils/blueprintNbr5410';
import { desenharUnifilar, montarUnifilar } from '../utils/blueprintUnifilar';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { gerarLancamentos, type MapeamentoOrcamento } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

/** Duas salas 4 × 4 (a da direita é BANHEIRO); QDC; C1 (tomada no banheiro, 20 A) e C2 (luz, 10 A). */
function casa(): { m: BlueprintModel; c1: string; c2: string; q: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(base, [p(0, 0, 8000, 0), p(8000, 0, 8000, 4000), p(8000, 4000, 0, 4000), p(0, 4000, 0, 0), p(4000, 0, 4000, 4000)]).model;
  const banheiro = m.spaces.find((s) => s.ring.some((v) => v.x > 4000))!;
  m = applyCommand(m, { type: 'NameSpace', spaceId: banheiro.id, name: 'Banheiro', tipoDeAmbiente: 'BANHEIRO' as TipoDeAmbiente }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(100, 100), cotaMm: 1600, ligacao: 'FN', tensaoV: 127 }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 20 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C2', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(6000, 75), cotaMm: 1100, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: c1 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(2000, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, circuitoId: c2 }).model;
  return { m, c1, c2, q };
}
const regra = (m: BlueprintModel) => conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((r) => r.codigo === '5.1.3.2.2')!;

describe('DR como peça · kernel 0.73.0', () => {
  it('versões', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.82.0');
    expect(POLITICA_PADRAO.version).toBe('quant-1.23.0');
  });

  it('AddDR / SetDRProps / DeleteDR; geral não lista circuitos; circuito de outro quadro é recusado; DeleteCircuito tira o circuito do DR', () => {
    const { m: m0, c1, c2, q } = casa();
    let m = applyCommand(m0, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, polos: 2, circuitoIds: [c1] }).model;
    const dr = m.quadros[0].drs![0];
    expect(dr).toMatchObject({ inA: 40, idnMa: 30, polos: 2, geral: false, circuitoIds: [c1] });
    expect(rotuloDoDR(dr)).toBe('40 A / 30 mA · 2P');
    expect(drDoCircuito(m, m.circuitos[0])!.id).toBe(dr.id);
    expect(drDoCircuito(m, m.circuitos[1])).toBeNull();
    m = applyCommand(m, { type: 'SetDRProps', drId: dr.id, geral: true }).model;
    expect(m.quadros[0].drs![0]).toMatchObject({ geral: true, circuitoIds: [] });
    expect(drDoCircuito(m, m.circuitos[1])!.geral).toBe(true);
    m = applyCommand(m, { type: 'SetDRProps', drId: dr.id, geral: false, circuitoIds: [c1, c2] }).model;
    expect(m.quadros[0].drs![0].circuitoIds).toEqual([c1, c2]);
    // Outro quadro
    const m2 = applyCommand(m, { type: 'AddQuadro', levelId: m.levels[0].id, nome: 'QF', at: point(3000, 100), cotaMm: 1600 }).model;
    expect(() => applyCommand(m2, { type: 'AddDR', quadroId: m2.quadros[1].id, circuitoIds: [c1] })).toThrow(/não é do quadro/);
    // Apagar o circuito tira do DR
    m = applyCommand(m, { type: 'DeleteCircuito', circuitoId: c2 }).model;
    expect(m.quadros[0].drs![0].circuitoIds).toEqual([c1]);
    m = applyCommand(m, { type: 'DeleteDR', drId: dr.id }).model;
    expect(m.quadros[0].drs ?? null).toBeNull();
    expect(() => applyCommand(m, { type: 'DeleteDR', drId: dr.id })).toThrow(/não encontrado/);
  });

  it('canônico: chave `drs` omitida sem DR (hash intacto) e presente com índices; ida e volta preserva a peça', () => {
    const { m: m0, c1, q } = casa();
    const antes = canonicalPayload(m0) as unknown as string;
    expect(antes).not.toContain('"drs"');
    const m = applyCommand(m0, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, polos: 2, circuitoIds: [c1] }).model;
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"drs"');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(volta.quadros[0].drs).toHaveLength(1);
    expect(volta.quadros[0].drs![0]).toMatchObject({ inA: 40, idnMa: 30, polos: 2, geral: false });
    expect(volta.quadros[0].drs![0].circuitoIds).toEqual([volta.circuitos.find((c) => c.nome === 'C1')!.id]);
    expect(canonicalPayload(volta)).toBe(texto);
  });

  it('⚠️ legado: `protecaoDR: true` lê como DR individual de 30 mA sem In — e some quando um DR declarado passa a cobrir o circuito', () => {
    const { m: m0, c1, q } = casa();
    const m = applyCommand(m0, { type: 'SetCircuitoProps', circuitoId: c1, protecaoDR: true }).model;
    const drs = drsDoQuadro(m, q);
    expect(drs).toHaveLength(1);
    expect(drs[0]).toMatchObject({ legado: true, inA: null, idnMa: 30, circuitoIds: [c1] });
    expect(regra(m).achados).toEqual([]);
    const comPeca = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, circuitoIds: [c1] }).model;
    expect(drsDoQuadro(comPeca, q)).toHaveLength(1);
    expect(drsDoQuadro(comPeca, q)[0].legado).toBe(false);
  });
});

describe('5.1.3.2.2 lê a peça e confere a peça', () => {
  it('tomada no banheiro sem DR = FALTA; DR de 100 mA no grupo NÃO basta e a mensagem diz; 30 mA geral basta', () => {
    const { m, c1, q } = casa();
    expect(regra(m).achados.map((a) => a.mensagem)).toEqual([expect.stringMatching(/C1 sem DR declarado — exige DR de 30 mA \(tomada em Banheiro\)/)]);
    const cem = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 100, circuitoIds: [c1] }).model;
    expect(regra(cem).achados[0].mensagem).toMatch(/protegido por DR de 100 mA \(do grupo\)/);
    const geral = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 63, idnMa: 30, geral: true }).model;
    expect(regra(geral).achados).toEqual([]);
  });

  it('⚠️ In do DR abaixo da proteção a montante = FALTA (grupo: soma dos disjuntores 30 A > 25 A; geral: disjuntor geral); sem In = não avaliado; grupo grande = AVISO', () => {
    const { m, c1, c2, q } = casa();
    const pequeno = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 25, idnMa: 30, circuitoIds: [c1, c2] }).model;
    const r = regra(pequeno);
    expect(r.achados.some((a) => a.nivel === 'FALTA' && /25 A \/ 30 mA com In abaixo da proteção a montante \(soma dos disjuntores 30 A\)/.test(a.mensagem))).toBe(true);
    const ok = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, circuitoIds: [c1, c2] }).model;
    expect(regra(ok).achados).toEqual([]);
    const semIn = applyCommand(m, { type: 'AddDR', quadroId: q, idnMa: 30, circuitoIds: [c1, c2] }).model;
    expect(regra(semIn).naoAvaliado.some((x) => /sem corrente nominal/.test(x))).toBe(true);
    // Geral: contra o disjuntor GERAL sugerido. Com 700 VA o geral é 10 A e 25 A passa;
    // com um chuveiro de 5.000 W (IB ≈ 45 A → geral 50 A) o DR de 25 A fica abaixo.
    const geralOk = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 25, idnMa: 30, geral: true }).model;
    expect(regra(geralOk).achados).toEqual([]);
    let chuveiro = applyCommand(geralOk, { type: 'AddCircuito', quadroId: q, nome: 'C3', tensaoV: 127, secaoMm2: 10, disjuntorA: 50 }).model;
    chuveiro = applyCommand(chuveiro, { type: 'AddTerminal', levelId: chuveiro.levels[0].id, disciplina: 'ELETRICA', tipo: 'Chuveiro', at: point(7000, 3000), cotaMm: 2200, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: 5000 }).model;
    chuveiro = applyCommand(chuveiro, { type: 'SetTerminalProps', terminalId: chuveiro.terminais[chuveiro.terminais.length - 1].id, circuitoId: chuveiro.circuitos[2].id }).model;
    expect(regra(chuveiro).achados.some((a) => a.nivel === 'FALTA' && /25 A \/ 30 mA com In abaixo da proteção a montante \(geral 50 A\)/.test(a.mensagem))).toBe(true);
    // Grupo com mais circuitos que a hipótese (padrão 5): aviso.
    let grande = ok;
    const extras: string[] = [];
    for (let i = 3; i <= 7; i++) {
      grande = applyCommand(grande, { type: 'AddCircuito', quadroId: q, nome: `C${i}`, tensaoV: 127, disjuntorA: 10 }).model;
      extras.push(grande.circuitos[grande.circuitos.length - 1].id);
    }
    grande = applyCommand(grande, { type: 'SetDRProps', drId: grande.quadros[0].drs![0].id, inA: 125, circuitoIds: [c1, c2, ...extras] }).model;
    expect(regra(grande).achados.some((a) => a.nivel === 'AVISO' && /agrupa 7 circuitos \(hipótese: até 5/.test(a.mensagem))).toBe(true);
    const semCircuito = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30 }).model;
    expect(regra(semCircuito).achados.some((a) => a.nivel === 'AVISO' && /sem circuito/.test(a.mensagem))).toBe(true);
  });

  it('sugestão: um DR individual de 30 mA por circuito exigido, In do catálogo ≥ disjuntor (20 A → 25 A); os comandos criam a peça e a falta some', () => {
    const { m, c1, q } = casa();
    expect(sugerirInDoDR(20)).toBe(25);
    expect(sugerirInDoDR(63)).toBe(63);
    expect(sugerirInDoDR(200)).toBeNull();
    const s = sugerirDRs(m, q);
    expect(s).toEqual([{ quadroId: q, circuitoId: c1, nome: 'C1', inA: 25, idnMa: 30, motivo: 'tomada em Banheiro' }]);
    const com = applyBatch(m, comandosDasSugestoesDeDR(s)).model;
    expect(com.quadros[0].drs![0]).toMatchObject({ inA: 25, idnMa: 30, circuitoIds: [c1] });
    expect(regra(com).achados).toEqual([]);
    expect(sugerirDRs(com, q)).toEqual([]);
  });
});

describe('unifilar, quantitativo e orçamento', () => {
  it('DR de ramal desenha no ramal com o rótulo ("grupo" quando compartilhado); DR geral vai para a entrada', () => {
    const { m, c1, c2, q } = casa();
    const grupo = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, circuitoIds: [c1, c2] }).model;
    const [dg] = montarUnifilar(grupo, HIPOTESES_PADRAO);
    expect(dg.ramais[0].dr).toEqual({ rotulo: '40 A / 30 mA', compartilhado: true, legado: false });
    expect(dg.entrada.drGeral).toBeNull();
    expect(dg.comDR).toBe(true);
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    expect(d.textos().filter((t) => t === 'DR')).toHaveLength(2);
    expect(d.textos()).toContain('40 A / 30 mA grupo');
    const geral = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 63, idnMa: 30, polos: 2, geral: true }).model;
    const [dgg] = montarUnifilar(geral, HIPOTESES_PADRAO);
    expect(dgg.entrada.drGeral).toBe('63 A / 30 mA · 2P');
    expect(dgg.ramais.every((r) => r.dr === null)).toBe(true);
    expect(dgg.comDR).toBe(true);
    const d2 = new DesenhistaDeProva();
    desenharUnifilar(d2, dgg, 0, 0, 1);
    expect(d2.textos().filter((t) => t === 'DR')).toHaveLength(1);
    expect(d2.textos()).toContain('63 A / 30 mA · 2P');
  });

  it('quantitativo: `porDR` por In/IΔn/polos, `drs` conta dispositivos (peça + legado); orçamento uma linha por combinação', () => {
    const { m, c1, c2, q } = casa();
    let x = applyCommand(m, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, polos: 2, circuitoIds: [c1] }).model;
    x = applyCommand(x, { type: 'AddDR', quadroId: q, inA: 40, idnMa: 30, polos: 2, circuitoIds: [c2] }).model;
    x = applyCommand(x, { type: 'AddCircuito', quadroId: q, nome: 'C3', tensaoV: 127, protecaoDR: true }).model;
    const qt = computeQuantities(x, POLITICA_PADRAO);
    expect(qt.totais.drs).toBe(3);
    expect(qt.totais.porDR).toEqual([
      { inA: 40, idnMa: 30, polos: 2, quantidade: 2 },
      { inA: null, idnMa: 30, polos: null, quantidade: 1 },
    ]);
    expect(qt.totais.porQuadro[0].porDR).toEqual(qt.totais.porDR);
    const mapa: MapeamentoOrcamento = { id: 'm1', organization_id: 'org', medida: 'CONTAGEM_DR', item_code: '1', phase: 'Instalações', budget_group: 'Elétrica', agrupamento: 'POR_ELEMENTO', filtro_ambiente: [], active: true };
    const item: SinapiItem = { code: 'DR', description: 'DR', unit: 'UN', price: 10, type: SinapiType.COMPOSITION, category: 'Material' };
    const lanc = gerarLancamentos(qt, [{ mapeamento: mapa, item }], { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 });
    expect(lanc.entries.map((e) => e.quantity)).toEqual([2, 1]);
    expect(lanc.entries.map((e) => e.location?.room ?? e.description).join(' | ')).toMatch(/DR 40 A \/ 30 mA 2P.*DR 30 mA \(In não declarado\)/);
  });
});
