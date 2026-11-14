/**
 * O MEDIDOR DA UNIDADE DE UM ANDAR COPIADO (kernel 0.107.0 — PA5 do prédio automático, plano
 * docs/planos/2026-11-12-predio-automatico.md). As unidades dos andares copiados do tipo não existem como registro: o 501
 * é a 101 no 5º pavimento. O medidor do térreo que mede o 501 aponta a 101 (`unidadeId`) e o 5º pavimento
 * (`unidadeLevelId`); a entrada de energia conta "unidades medidas" pelo número DAQUELE andar.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, ordinalDoTipo } from '../utils/blueprintPavimentoTipoDaMassa';
import { dividirPavimentoDoBloco, montarPavimentoTipoDoBloco } from '../utils/blueprintPavimentoOrtogonal';
import { entradaDoQuadro } from '../utils/blueprintEntradaDeEnergia';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** O R4 do marco (térreo, tipo e 2 cópias), sem instalação — o mesmo de `blueprintCopiaDeInstalacoes.test.ts`. */
function predio(): { m: BlueprintModel; terreo: string; tipo: string; copias: string[]; unidade101: string } {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, 30000, 0, 'FRENTE'), div(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), div(30000, 40000, 0, 40000, 'FUNDOS'), div(0, 40000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], pavimentos: 4 },
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
  return { m: mont.model, terreo: t, tipo, copias, unidade101: (mont.model.unidades ?? []).find((u) => u.numero === '101')!.id };
}

/** QGBT no térreo; o QD da 101 no tipo (vai às cópias), com uma tomada; um medidor por andar no térreo. */
function comMedicao(p: ReturnType<typeof predio>, porAndar = true) {
  let m = p.m;
  const criar = (c: Command) => {
    const r = applyCommand(m, c);
    m = r.model;
    return r.diff.created[0];
  };
  const qgbt = criar({ type: 'AddQuadro', levelId: p.terreo, nome: 'QGBT', at: point(6000, 16000), tipo: 'QGBT', ligacao: 'FFF', tensaoV: 220 });
  m = applyCommand(m, { type: 'SetLevelProps', levelId: p.tipo, copiaInstalacoes: true }).model;
  const qd = criar({ type: 'AddQuadro', levelId: p.tipo, nome: 'QD 101', at: point(6000, 16500), quadroPaiId: qgbt, unidadeId: p.unidade101, ligacao: 'FN', tensaoV: 127 });
  const c1 = criar({ type: 'AddCircuito', quadroId: qd, nome: 'C1', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5, disjuntorA: 20 });
  const tug = criar({ type: 'AddTerminal', levelId: p.tipo, disciplina: 'ELETRICA', tipo: 'TUG', at: point(7000, 16500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 1500 });
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: tug, circuitoId: c1 }).model;
  const medidores: string[] = [];
  for (const [i, L] of [p.tipo, ...p.copias].entries()) {
    medidores.push(criar({ type: 'AddTerminal', levelId: p.terreo, disciplina: 'ELETRICA', tipo: 'kWh', at: point(8000 + 400 * i, 16000), cotaMm: 1500, tipoEletrico: 'MEDIDOR', quadroId: qgbt, unidadeId: p.unidade101, ...(porAndar ? { unidadeLevelId: L } : {}) }));
  }
  return { m, qgbt, medidores };
}

describe('medidor da unidade de um andar copiado (0.107.0)', () => {
  it('cada andar pede o seu medidor, e o medidor com o pavimento mede o número daquele andar', () => {
    const p = predio();
    const { m, qgbt } = comMedicao(p);
    const e = entradaDoQuadro(m, qgbt)!;
    expect([...e.unidadesAtendidas].sort()).toEqual(['101', '201', '301']);
    expect([...e.unidadesMedidas].sort()).toEqual(['101', '201', '301']);
    expect(e.achados.some((a) => /sem medidor próprio/.test(a.mensagem))).toBe(false);
  });

  it('sem o pavimento, os três medidores medem a 101 — e o 201 e o 301 ficam sem medidor', () => {
    const p = predio();
    const { m, qgbt } = comMedicao(p, false);
    const e = entradaDoQuadro(m, qgbt)!;
    expect(e.unidadesMedidas).toEqual(['101']);
    expect(e.achados.find((a) => /sem medidor próprio/.test(a.mensagem))?.mensagem).toMatch(/201, 301/);
  });

  it('canônico: `nivelDaUnidade` por índice, com ida e volta; ausente, a chave não aparece', () => {
    const p = predio();
    const { m } = comMedicao(p);
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"nivelDaUnidade":');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(canonicalPayload(volta)).toBe(texto);
    const doCincoPorCento = volta.terminais.filter((t) => t.tipoEletrico === 'MEDIDOR').map((t) => volta.levels.find((l) => l.id === t.unidadeLevelId)?.name ?? null);
    expect(doCincoPorCento).toEqual(['Torre · 2º pav (tipo)', 'Torre · 3º pav', 'Torre · 4º pav']);
    const sem = comMedicao(predio(), false).m;
    expect(canonicalPayload(sem) as unknown as string).not.toContain('nivelDaUnidade');
  });

  it('recusas e limpezas: sem unidade não há pavimento; pavimento inexistente recusado; tirar a unidade, apagá-la ou remover o andar limpa', () => {
    const p = predio();
    const { m, medidores } = comMedicao(p);
    const [, m201] = medidores;
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: p.terreo, disciplina: 'ELETRICA', tipo: 'kWh', at: point(0, 0), cotaMm: 1500, tipoEletrico: 'MEDIDOR', unidadeLevelId: p.copias[0] })).not.toThrow();
    expect(applyCommand(m, { type: 'AddTerminal', levelId: p.terreo, disciplina: 'ELETRICA', tipo: 'kWh', at: point(0, 0), cotaMm: 1500, tipoEletrico: 'MEDIDOR', unidadeLevelId: p.copias[0] }).model.terminais.at(-1)!.unidadeLevelId).toBeUndefined();
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: m201, unidadeLevelId: 'lvl_9999' })).toThrow(/pavimento inexistente/);
    const semUnidade = applyCommand(m, { type: 'SetTerminalProps', terminalId: m201, unidadeId: null }).model;
    expect(semUnidade.terminais.find((t) => t.id === m201)!.unidadeLevelId).toBeUndefined();
    const semAndar = applyCommand(m, { type: 'RemoveLevel', levelId: p.copias[0] }).model;
    const t = semAndar.terminais.find((x) => x.id === m201)!;
    expect(t.unidadeId).toBe(p.unidade101);
    expect(t.unidadeLevelId).toBeUndefined();
    const semA101 = applyCommand(m, { type: 'DeleteUnidade', unidadeId: p.unidade101 }).model;
    expect(semA101.terminais.filter((x) => x.unidadeLevelId)).toHaveLength(0);
  });
});
