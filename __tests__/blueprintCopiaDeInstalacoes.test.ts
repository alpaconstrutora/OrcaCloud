/**
 * INSTALAÇÕES NA CÓPIA VIVA (kernel 0.106.0 — PA1 do prédio automático, plano docs/planos/2026-11-12-predio-automatico.md).
 * Com `Level.copiaInstalacoes` no pavimento TIPO, as cópias re-derivam pontos, trechos, quadros, componentes e os
 * circuitos desses quadros, com os ids internos trocados pelos da cópia e o que aponta para fora (o QGBT do térreo, a
 * unidade) mantido. Opt-in, recusa ligar com instalação própria nas cópias, e editar a cópia é recusado (LEVEL_LINKED).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, snapshotHash, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, ordinalDoTipo } from '../utils/blueprintPavimentoTipoDaMassa';
import { dividirPavimentoDoBloco, montarPavimentoTipoDoBloco } from '../utils/blueprintPavimentoOrtogonal';
import { preDimensionarQuadroCompleto } from '../utils/blueprintEletricaDimensionamento';
import { unidadeNoPavimento } from '../utils/blueprintUnidadesDoPredio';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** O prédio R4 do marco (térreo, tipo e 2 cópias), sem instalação. */
function predio(pavimentos = 4): { m: BlueprintModel; terreo: string; tipo: string; copias: string[]; unidade101: string } {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, 30000, 0, 'FRENTE'), div(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), div(30000, 40000, 0, 40000, 'FUNDOS'), div(0, 40000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], pavimentos },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const pb = distribuirProduto(m, massa, MEDIO).blocos[0];
  const b = m.blocos![0];
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord)!;
  const r = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(m) });
  if (!r.ok) throw new Error(r.motivo);
  const mont = montarPavimentoTipoDoBloco(m, b, r.divisao);
  const tipo = mont.tipoLevelId;
  const copias = mont.model.levels.filter((l) => l.tipoDeId === tipo).sort((a, c) => a.elevationMm - c.elevationMm).map((l) => l.id);
  const unidade101 = (mont.model.unidades ?? []).find((u) => u.numero === '101')!.id;
  return { m: mont.model, terreo: t, tipo, copias, unidade101 };
}

/** O QGBT no térreo, o QD da unidade 101 no tipo (filho do QGBT), um circuito, um ponto nele e um eletroduto. */
function comInstalacao(p: ReturnType<typeof predio>) {
  // O id que o comando criou é o 1º do diff (as cópias, quando há, vêm depois, na sincronização).
  let m = p.m;
  const criar = (c: Command) => {
    const r = applyCommand(m, c);
    m = r.model;
    return r.diff.created[0];
  };
  const qgbt = criar({ type: 'AddQuadro', levelId: p.terreo, nome: 'QGBT', at: point(6000, 16000), tipo: 'QGBT' });
  const qd = criar({ type: 'AddQuadro', levelId: p.tipo, nome: 'QD 101', at: point(6000, 16500), quadroPaiId: qgbt, unidadeId: p.unidade101 });
  const c1 = criar({ type: 'AddCircuito', quadroId: qd, nome: 'C1', tipo: 'TUG' });
  const tomada = criar({ type: 'AddTerminal', levelId: p.tipo, disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(7000, 16500), cotaMm: 300, potenciaW: 100 });
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: tomada, circuitoId: c1 }).model;
  const trecho = criar({ type: 'AddTrecho', levelId: p.tipo, disciplina: 'ELETRICA', a: point(6000, 16500), b: point(7000, 16500), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 20, circuitoIds: [c1] });
  return { m, qgbt, qd, c1, tomada, trecho };
}

const ligar = (m: BlueprintModel, tipo: string) => applyCommand(m, { type: 'SetLevelProps', levelId: tipo, copiaInstalacoes: true }).model;

describe('instalações na cópia viva (0.106.0)', () => {
  it('sem a marca, nada muda: as cópias continuam sem instalação', () => {
    const p = predio();
    const i = comInstalacao(p);
    for (const c of p.copias) expect([i.m.terminais, i.m.trechos, i.m.quadros].map((l) => l.filter((x) => x.levelId === c).length)).toEqual([0, 0, 0]);
  });

  it('com a marca, cada cópia ganha quadro, circuito, ponto e trecho — com os ids da cópia, e o quadro pai de FORA mantido', () => {
    const p = predio();
    const i = comInstalacao(p);
    const m = ligar(i.m, p.tipo);
    for (const c of p.copias) {
      const qd = m.quadros.filter((q) => q.levelId === c);
      expect(qd).toHaveLength(1);
      expect(qd[0].quadroPaiId).toBe(i.qgbt);
      expect(qd[0].unidadeId).toBe(p.unidade101);
      const circ = m.circuitos.filter((x) => x.quadroId === qd[0].id);
      expect(circ).toHaveLength(1);
      const [t] = m.terminais.filter((x) => x.levelId === c);
      expect(t.circuitoId).toBe(circ[0].id);
      expect(t.potenciaW).toBe(100);
      const [tr] = m.trechos.filter((x) => x.levelId === c);
      expect(tr.circuitoIds).toEqual([circ[0].id]);
    }
  });

  it('a edição do tipo propaga e o apagado some nas cópias', () => {
    const p = predio();
    const i = comInstalacao(p);
    let m = ligar(i.m, p.tipo);
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: i.tomada, potenciaW: 600 }).model;
    for (const c of p.copias) expect(m.terminais.find((x) => x.levelId === c)!.potenciaW).toBe(600);
    m = applyCommand(m, { type: 'DeleteCircuito', circuitoId: i.c1 }).model;
    for (const c of p.copias) {
      const qd = m.quadros.find((q) => q.levelId === c)!;
      expect(m.circuitos.filter((x) => x.quadroId === qd.id)).toHaveLength(0);
    }
    m = applyCommand(m, { type: 'DeleteQuadro', quadroId: i.qd }).model;
    for (const c of p.copias) expect(m.quadros.filter((q) => q.levelId === c)).toHaveLength(0);
  });

  it('editar a instalação de uma cópia é recusado (LEVEL_LINKED); sem a marca, é livre', () => {
    const p = predio();
    const i = comInstalacao(p);
    const m = ligar(i.m, p.tipo);
    const daCopia = m.terminais.find((x) => x.levelId === p.copias[0])!;
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: daCopia.id, potenciaW: 1 })).toThrow(/copia as instalações/);
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: p.copias[0], disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(8000, 17000), cotaMm: 300 })).toThrow(/copia as instalações/);
    // Sem a marca, a cópia aceita instalação própria (como sempre).
    expect(() => applyCommand(i.m, { type: 'AddTerminal', levelId: p.copias[0], disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(8000, 17000), cotaMm: 300 })).not.toThrow();
  });

  it('ligar com instalação própria nas cópias é recusado, com a lista; desligar deixa o que foi copiado, agora editável', () => {
    const p = predio();
    const i = comInstalacao(p);
    const sujo = applyCommand(i.m, { type: 'AddTerminal', levelId: p.copias[0], disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(8000, 17000), cotaMm: 300 }).model;
    expect(() => ligar(sujo, p.tipo)).toThrow(/1 ponto\(s\)/);
    const ligado = ligar(i.m, p.tipo);
    const desligado = applyCommand(ligado, { type: 'SetLevelProps', levelId: p.tipo, copiaInstalacoes: false }).model;
    const daCopia = desligado.terminais.find((x) => x.levelId === p.copias[0])!;
    expect(() => applyCommand(desligado, { type: 'SetTerminalProps', terminalId: daCopia.id, potenciaW: 1 })).not.toThrow();
  });

  it('a marca só vale no tipo, e o canônico a guarda (ida e volta), sem mudar o hash de quem não a tem', () => {
    const p = predio();
    expect(() => applyCommand(p.m, { type: 'SetLevelProps', levelId: p.copias[0], copiaInstalacoes: true })).toThrow(/cópia de outro pavimento/);
    const m = ligar(comInstalacao(p).m, p.tipo);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.levels.filter((l) => l.copiaInstalacoes)).toHaveLength(1);
    expect(snapshotHash(volta)).toBe(snapshotHash(m));
    expect(canonicalPayload(p.m)).not.toMatch(/copiaInstalacoes/);
  });

  it('a ordem não importa: ligar antes ou depois de lançar a instalação dá o mesmo modelo', () => {
    const p = predio();
    const depois = ligar(comInstalacao(p).m, p.tipo);
    const antes = comInstalacao({ ...p, m: ligar(p.m, p.tipo) }).m;
    expect(snapshotHash(antes)).toBe(snapshotHash(depois));
  });

  it('a demanda conta as unidades DO ANDAR: o QGBT atende a 101, a 201 e a 301 (eram 1 pelo número da origem)', () => {
    const p = predio();
    const i = comInstalacao(p);
    const m = ligar(i.m, p.tipo);
    const r = preDimensionarQuadroCompleto(m, i.qgbt);
    expect(r?.unidadesAtendidas).toBe(1 + p.copias.length);
    expect(p.copias.map((c) => unidadeNoPavimento(m, p.unidade101, c)!.numero)).toEqual(['201', '301']);
  });

  it('desempenho: com 300 pontos no tipo de um prédio de 12 pavimentos, um comando comum não refaz as cópias', () => {
    const p = predio(12);
    let m = comInstalacao(p).m;
    m = applyBatch(m, Array.from({ length: 300 }, (_, k) => ({ type: 'AddTerminal', levelId: p.tipo, disciplina: 'ELETRICA', tipo: 'Tomada baixa', at: point(5500 + (k % 30) * 600, 15500 + Math.floor(k / 30) * 1000), cotaMm: 300 }) as Command)).model;
    m = ligar(m, p.tipo);
    expect(m.terminais.filter((t) => p.copias.includes(t.levelId))).toHaveLength(301 * p.copias.length);
    // Um comando comum (fora das instalações) não refaz as cópias delas: medido 40 ms com a cópia ligada × 36 ms com o
    // mesmo modelo desligado (o resto é o tamanho do modelo, que o kernel clona a cada comando); mudar um ponto do tipo,
    // que refaz as 10 cópias, 79 ms. O limite aqui é folgado para a CI.
    const parede = { type: 'AddWall', levelId: p.terreo, a: point(1000, 1000), b: point(3000, 1000), thicknessMm: 150, heightMm: 3000 } as Command;
    applyCommand(m, parede);
    const t0 = performance.now();
    applyCommand(m, parede);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
