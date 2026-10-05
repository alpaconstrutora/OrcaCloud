/**
 * CLIMATIZAÇÃO E3.1/E3.2/E3.3 (04/10/2026, kernel 0.92.0): o EQUIPAMENTO como
 * peça da REDE — evaporadora, condensadora, derivador, exaustor, bomba e ponto
 * de dreno, terminais de ar — com CAPACIDADE declarada e o SISTEMA
 * (evaporadora → condensadora); as disciplinas FRIGORIGENA e DRENO_AC; o trecho
 * com sucção e isolamento. Invariantes recusam o que não faz sentido; o canônico
 * leva e traz tudo; apagar a condensadora solta a evaporadora.
 */
import { describe, expect, it } from 'vitest';
import {
  DISCIPLINAS,
  DISCIPLINAS_DO_PONTO_HIDRAULICO,
  KernelError,
  MATERIAIS_DA_DISCIPLINA,
  TIPOS_COM_CAPACIDADE,
  TIPOS_DE_CLIMATIZACAO,
  TIPOS_DE_CONDENSADORA,
  TIPOS_DE_EVAPORADORA,
  TIPOS_DE_PONTO_HIDRAULICO,
  TIPOS_DE_TERMINAL_DE_AR,
  applyBatch,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  limparCondensadorasOrfas,
  materialPadraoDaDisciplina,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO, GRUPO_DO_PONTO_HIDRAULICO } from '../utils/blueprintHidraulica';
import { conexoesDerivadas } from '../utils/blueprintKernel/conexoes';

function terreo(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const peca = (levelId: string, tipoHidraulico: string, disciplina: string, x: number, y: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId, disciplina, tipo: tipoHidraulico, at: point(x, y), cotaMm: 2200, tipoHidraulico, ...extra }) as Command;

describe('climatização E3 · taxonomia e disciplinas', () => {
  it('as disciplinas novas existem, com material padrão e materiais admitidos', () => {
    expect(DISCIPLINAS).toContain('FRIGORIGENA');
    expect(DISCIPLINAS).toContain('DRENO_AC');
    expect(materialPadraoDaDisciplina('FRIGORIGENA')).toBe('COBRE');
    expect(materialPadraoDaDisciplina('DRENO_AC')).toBe('PVC_SOLDAVEL');
    expect(MATERIAIS_DA_DISCIPLINA.FRIGORIGENA).toEqual(['COBRE']);
    expect(MATERIAIS_DA_DISCIPLINA.DRENO_AC).toContain('PVC_SOLDAVEL');
  });

  it('os 20 tipos têm ficha, grupo de climatização e disciplina coerente com a família', () => {
    expect(TIPOS_DE_CLIMATIZACAO).toHaveLength(20);
    for (const t of TIPOS_DE_CLIMATIZACAO) {
      expect(TIPOS_DE_PONTO_HIDRAULICO).toContain(t);
      expect(FICHA_DO_PONTO_HIDRAULICO[t].rotulo.length).toBeGreaterThan(2);
      expect(GRUPO_DO_PONTO_HIDRAULICO[t].startsWith('Climatização')).toBe(true);
    }
    for (const t of [...TIPOS_DE_EVAPORADORA, ...TIPOS_DE_CONDENSADORA, 'DERIVADOR_VRF'] as const) expect(DISCIPLINAS_DO_PONTO_HIDRAULICO[t]).toEqual(['FRIGORIGENA']);
    for (const t of TIPOS_DE_TERMINAL_DE_AR) expect(DISCIPLINAS_DO_PONTO_HIDRAULICO[t]).toEqual(['MECANICA']);
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.BOMBA_DRENO).toEqual(['DRENO_AC']);
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.PONTO_DRENO).toEqual(['DRENO_AC']);
    // O personalizado liga em qualquer uma das três.
    expect(DISCIPLINAS_DO_PONTO_HIDRAULICO.EQUIPAMENTO_CLIMATIZACAO).toEqual(['FRIGORIGENA', 'DRENO_AC', 'MECANICA']);
    // Quem troca calor tem capacidade; terminal de ar e dreno, não.
    expect(TIPOS_COM_CAPACIDADE).toContain('EVAPORADORA_CASSETE');
    expect(TIPOS_COM_CAPACIDADE).not.toContain('DIFUSOR');
    expect(TIPOS_COM_CAPACIDADE).not.toContain('BOMBA_DRENO');
  });

  it('a evaporadora na linha errada é recusada (BAD_POINT_KIND), como qualquer ponto tipado', () => {
    const { m, t } = terreo();
    expect(() => applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 'AGUA_FRIA', 0, 0))).toThrow(KernelError);
    expect(() => applyCommand(m, peca(t, 'DIFUSOR', 'FRIGORIGENA', 0, 0))).toThrow(KernelError);
    expect(() => applyCommand(m, peca(t, 'EVAPORADORA_HI_WALL', 'FRIGORIGENA', 0, 0))).not.toThrow();
  });
});

describe('climatização E3.1 · capacidade e sistema', () => {
  function split() {
    const { m, t } = terreo();
    const mm = applyBatch(m, [
      peca(t, 'CONDENSADORA_SPLIT', 'FRIGORIGENA', 9000, 0, { capacidadeBtuH: 12000 }),
      peca(t, 'EVAPORADORA_HI_WALL', 'FRIGORIGENA', 1000, 2000, { capacidadeBtuH: 12000 }),
    ]).model;
    const cond = mm.terminais!.find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const evap = mm.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    return { m: mm, t, cond, evap };
  }

  it('AddTerminal grava a capacidade arredondada; SetTerminalProps liga a evaporadora à condensadora', () => {
    const { m, cond, evap } = split();
    expect(evap.capacidadeBtuH).toBe(12000);
    const mm = applyCommand(m, { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cond.id }).model;
    expect(mm.terminais!.find((x) => x.id === evap.id)!.condensadoraId).toBe(cond.id);
    // Capacidade fracionária arredonda; zero/negativa é recusada pela invariante.
    const m2 = applyCommand(mm, { type: 'SetTerminalProps', terminalId: evap.id, capacidadeBtuH: 9000.4 }).model;
    expect(m2.terminais!.find((x) => x.id === evap.id)!.capacidadeBtuH).toBe(9000);
    expect(() => applyCommand(mm, { type: 'SetTerminalProps', terminalId: evap.id, capacidadeBtuH: 0 })).toThrow(/BAD_CAPACITY|Capacidade/);
  });

  it('as invariantes: capacidade só em quem troca calor; condensadora só evaporadora/derivador, e ela tem de SER condensadora', () => {
    const { m, t, cond, evap } = split();
    const mDif = applyCommand(m, peca(t, 'DIFUSOR', 'MECANICA', 3000, 3000)).model;
    const dif = mDif.terminais!.find((x) => x.tipoHidraulico === 'DIFUSOR')!;
    expect(() => applyCommand(mDif, { type: 'SetTerminalProps', terminalId: dif.id, capacidadeBtuH: 5000 })).toThrow(/BAD_CAPACITY|não tem capacidade/);
    expect(() => applyCommand(mDif, { type: 'SetTerminalProps', terminalId: dif.id, condensadoraId: cond.id })).toThrow(/BAD_CONDENSER|não liga/);
    // A evaporadora apontando para OUTRA evaporadora (não é condensadora): o comando a SOLTA
    // (`limparCondensadorasOrfas` roda em todo comando — é o que livra a evaporadora quando a
    // condensadora muda de tipo), e a invariante recusa o modelo montado à mão.
    const m2 = applyCommand(m, peca(t, 'EVAPORADORA_CASSETE', 'FRIGORIGENA', 5000, 2000)).model;
    const cas = m2.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_CASSETE')!;
    const r = applyCommand(m2, { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cas.id });
    expect(r.model.terminais!.find((x) => x.id === evap.id)!.condensadoraId ?? null).toBeNull();
    const torto = structuredClone(m2);
    torto.terminais!.find((x) => x.id === evap.id)!.condensadoraId = cas.id;
    expect(() => assertModelInvariants(torto)).toThrow(/não é condensadora/);
    expect(() => assertModelInvariants(m)).not.toThrow();
  });

  it('trocar o TIPO limpa o que o tipo novo não carrega: derivador perde a capacidade e guarda o sistema; condensadora perde o sistema', () => {
    const { m, cond, evap } = split();
    const ligada = applyCommand(m, { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cond.id }).model;
    const virouDerivador = applyCommand(ligada, { type: 'SetTerminalProps', terminalId: evap.id, tipoHidraulico: 'DERIVADOR_VRF' }).model;
    const d = virouDerivador.terminais!.find((x) => x.id === evap.id)!;
    expect(d.capacidadeBtuH ?? null).toBeNull();
    expect(d.condensadoraId).toBe(cond.id);
    const virouCondensadora = applyCommand(ligada, { type: 'SetTerminalProps', terminalId: evap.id, tipoHidraulico: 'CONDENSADORA_SPLIT' }).model;
    const c = virouCondensadora.terminais!.find((x) => x.id === evap.id)!;
    expect(c.capacidadeBtuH).toBe(12000);
    expect(c.condensadoraId ?? null).toBeNull();
  });

  it('apagar a condensadora SOLTA a evaporadora (limparCondensadorasOrfas no DeleteTerminal)', () => {
    const { m, cond, evap } = split();
    const ligada = applyCommand(m, { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cond.id }).model;
    const r = applyCommand(ligada, { type: 'DeleteTerminal', terminalId: cond.id });
    const e = r.model.terminais!.find((x) => x.id === evap.id)!;
    expect(e.condensadoraId ?? null).toBeNull();
    expect(r.diff.updated).toContain(evap.id);
    expect(() => assertModelInvariants(r.model)).not.toThrow();
    // E a função pura responde o mesmo num modelo montado à mão.
    const quebrado = structuredClone(ligada);
    quebrado.terminais = quebrado.terminais!.filter((x) => x.id !== cond.id);
    expect(limparCondensadorasOrfas(quebrado)).toEqual([evap.id]);
  });

  it('canônico: capacidade e condensadora (por índice) vão e voltam; sem elas, as chaves não aparecem', () => {
    const { m, cond, evap } = split();
    const ligada = applyCommand(m, { type: 'SetTerminalProps', terminalId: evap.id, condensadoraId: cond.id }).model;
    const payload = JSON.parse(canonicalPayload(ligada)) as { terminais: { capacidadeBtuH?: number; condensadora?: number }[] };
    const iEvap = payload.terminais.findIndex((x) => x.condensadora != null);
    expect(iEvap).toBeGreaterThanOrEqual(0);
    expect(payload.terminais[iEvap].capacidadeBtuH).toBe(12000);
    expect(payload.terminais[payload.terminais[iEvap].condensadora!].capacidadeBtuH).toBe(12000);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(ligada)));
    const e2 = volta.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const c2 = volta.terminais!.find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(e2.capacidadeBtuH).toBe(12000);
    expect(e2.condensadoraId).toBe(c2.id);
    // Sem declaração: nada de chave nova (desenho antigo não muda de forma).
    const { m: m0, t } = terreo();
    const semNada = applyCommand(m0, peca(t, 'DIFUSOR', 'MECANICA', 0, 0)).model;
    const p0 = JSON.parse(canonicalPayload(semNada)) as { terminais: Record<string, unknown>[] };
    expect('capacidadeBtuH' in p0.terminais[0]).toBe(false);
    expect('condensadora' in p0.terminais[0]).toBe(false);
  });
});

describe('climatização E3.2 · linha frigorígena e dreno', () => {
  const linha = (levelId: string, disciplina: string, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTrecho', levelId, disciplina, a: point(0, 0), b: point(4000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, ...extra }) as Command;

  it('a linha tem sucção e isolamento; o dreno e o duto só isolamento; a água fria nenhum dos dois', () => {
    const { m, t } = terreo();
    const ok = applyCommand(m, linha(t, 'FRIGORIGENA', { bitolaSuccaoMm: 10, isolamentoMm: 9 })).model;
    expect(ok.trechos![0]).toMatchObject({ disciplina: 'FRIGORIGENA', bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9 });
    expect(() => applyCommand(m, linha(t, 'DRENO_AC', { bitolaMm: 25, bitolaSuccaoMm: 10 }))).toThrow(/BAD_PIPE_SIZE|sucção/);
    expect(() => applyCommand(m, linha(t, 'DRENO_AC', { bitolaMm: 25, isolamentoMm: 5 }))).not.toThrow();
    expect(() => applyCommand(m, linha(t, 'MECANICA', { bitolaMm: 200, isolamentoMm: 25 }))).not.toThrow();
    expect(() => applyCommand(m, linha(t, 'AGUA_FRIA', { bitolaMm: 25, isolamentoMm: 5 }))).toThrow(/BAD_PIPE_SIZE|Isolamento/);
    expect(() => applyCommand(m, linha(t, 'FRIGORIGENA', { isolamentoMm: -1 }))).toThrow(/Isolamento inválido/);
  });

  it('SetTrechoProps troca e apaga; o canônico leva e traz; sem declarar, as chaves não existem', () => {
    const { m, t } = terreo();
    const um = applyCommand(m, linha(t, 'FRIGORIGENA')).model;
    const p0 = JSON.parse(canonicalPayload(um)) as { trechos: Record<string, unknown>[] };
    expect('bitolaSuccaoMm' in p0.trechos[0]).toBe(false);
    expect('isolamentoMm' in p0.trechos[0]).toBe(false);
    const dois = applyCommand(um, { type: 'SetTrechoProps', trechoId: um.trechos![0].id, bitolaSuccaoMm: 12.4, isolamentoMm: 13 }).model;
    expect(dois.trechos![0]).toMatchObject({ bitolaSuccaoMm: 12, isolamentoMm: 13 });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(dois)));
    expect(volta.trechos![0]).toMatchObject({ bitolaSuccaoMm: 12, isolamentoMm: 13 });
    const tres = applyCommand(dois, { type: 'SetTrechoProps', trechoId: um.trechos![0].id, bitolaSuccaoMm: null, isolamentoMm: null }).model;
    expect(tres.trechos![0].bitolaSuccaoMm ?? null).toBeNull();
    expect(tres.trechos![0].isolamentoMm ?? null).toBeNull();
  });

  it('as conexões derivadas enxergam a linha, o dreno e o duto (curva no cotovelo)', () => {
    const { m, t } = terreo();
    const cot = (d: string, b: number): Command[] => [
      ({ type: 'AddTrecho', levelId: t, disciplina: d, a: point(0, 0), b: point(3000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: b }) as Command,
      ({ type: 'AddTrecho', levelId: t, disciplina: d, a: point(3000, 0), b: point(3000, 3000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: b }) as Command,
    ];
    for (const [d, b] of [['FRIGORIGENA', 6], ['DRENO_AC', 25], ['MECANICA', 200]] as const) {
      const mm = applyBatch(m, cot(d, b)).model;
      const cx = conexoesDerivadas(mm);
      const curvas = cx.conexoes.filter((c) => c.disciplina === d && /CURVA|JOELHO|COTOVELO/i.test(c.tipo));
      expect(curvas.length, d).toBeGreaterThanOrEqual(1);
    }
  });
});
