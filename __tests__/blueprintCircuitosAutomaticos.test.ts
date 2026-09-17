/**
 * Criação automática de circuitos (14/09/2026): *"1.1 por ambiente 1.2 Por
 * carga máxima 1.3 Por função: Iluminação, TUGs e TUEs devem ficar em
 * circuitos independentes"* + seção mínima *"TUG 2,5 · TUE 4,0 · Iluminação
 * 1,5 (quando em circuito exclusivo)"*.
 *
 * O que se prova: a função nunca se mistura; o critério só divide luz e TUG;
 * TUE é um por ponto; cozinha fica exclusiva (9.5.3.2) em qualquer critério;
 * os ids previstos batem com os que o kernel dá; o lote é um só e atômico;
 * rodar de novo não religa nada.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type Command, type ObjectId } from '../utils/blueprintKernel';
import {
  cargaMaximaEfetivaVA,
  conferirPlano,
  funcaoDoPonto,
  HIPOTESES_CIRCUITOS_PADRAO,
  idsPrevistos,
  planejarCircuitos,
  pontosElegiveis,
  proximoNumeroDeCircuito,
  quadrosDoNivel,
  secaoMinimaDaFuncaoMm2,
  type HipotesesDeCircuitos,
} from '../utils/blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';

type Tipo = 'TUG' | 'TUE' | 'ILUMINACAO_TETO' | 'ILUMINACAO_PAREDE' | 'INTERRUPTOR' | 'LIGACAO_DIRETA' | 'DADOS_TV';
const ponto = (
  t: string,
  x: number,
  y: number,
  tipoEletrico: Tipo | null,
  potenciaW?: number | null,
  rotulo?: string,
): Command => ({
  type: 'AddTerminal',
  levelId: t,
  disciplina: 'ELETRICA',
  tipo: tipoEletrico ?? 'TUG',
  at: point(x, y),
  cotaMm: 300,
  tipoEletrico,
  ...(potenciaW !== undefined ? { potenciaW } : {}),
  ...(rotulo ? { rotulo } : {}),
});

/**
 * Sala 6 × 4 (0–6000) e Cozinha 4 × 4 (6000–10000), QDC 127 V FN na sala.
 * Pontos na ordem canônica (a ordem de criação):
 *   luz Sala 160 · interruptor Sala · TUG Sala 100 · TUG Sala 100 · luz Cozinha 100
 *   · TUG Cozinha 600 ×3 · TUE "Micro-ondas" 1200 · ligação direta "Chuveiro" 5500
 *   FORA de ambiente · DADOS_TV · TUG sem tipo · TUG Sala sem potência
 *   · TUG Sala já em C1.
 */
function casa(opts: { tensaoV?: number | null; ligacao?: 'FN' | 'FF' | 'FFF' | null } = {}) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [w(0, 0, 10000, 0), w(10000, 0, 10000, 4000), w(10000, 4000, 0, 4000), w(0, 4000, 0, 0), w(6000, 0, 6000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const cozinha = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyCommand(m, { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: cozinha.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' }).model;
  const tensaoV = opts.tensaoV === undefined ? 127 : opts.tensaoV;
  m = applyCommand(m, {
    type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(500, 500), cotaMm: 1500, tensaoV, ligacao: opts.ligacao === undefined ? 'FN' : opts.ligacao,
  }).model;
  const quadroId = m.quadros![0].id;
  const [c1] = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1 — Existente' }).diff.created;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1 — Existente' }).model;
  m = applyBatch(m, [
    ponto(t, 3000, 2000, 'ILUMINACAO_TETO', 160),
    ponto(t, 200, 1000, 'INTERRUPTOR', null),
    ponto(t, 1000, 200, 'TUG', 100),
    ponto(t, 2000, 200, 'TUG', 100),
    ponto(t, 8000, 2000, 'ILUMINACAO_TETO', 100),
    ponto(t, 7000, 200, 'TUG', 600),
    ponto(t, 8000, 200, 'TUG', 600),
    ponto(t, 9000, 200, 'TUG', 600),
    ponto(t, 9500, 1000, 'TUE', 1200, 'Micro-ondas'),
    ponto(t, 12000, 2000, 'LIGACAO_DIRETA', 5500, 'Chuveiro'),
    ponto(t, 4000, 200, 'DADOS_TV', null),
    ponto(t, 4500, 200, null, 100),
    ponto(t, 5000, 200, 'TUG'),
    ponto(t, 5500, 200, 'TUG', 100),
  ]).model;
  const terminais = m.terminais!;
  const jaLigado = terminais[terminais.length - 1];
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: jaLigado.id, circuitoId: c1 }).model;
  return { m, t, quadroId, c1, ids: terminais.map((x) => x.id) };
}

const HIP: HipotesesDeCircuitos = { ...HIPOTESES_CIRCUITOS_PADRAO };
const planejar = (m: ReturnType<typeof casa>['m'], t: string, quadroId: ObjectId | null, hip: Partial<HipotesesDeCircuitos> = {}) =>
  planejarCircuitos(m, t, quadroId, { ...HIP, ...hip }, HIPOTESES_PADRAO);

describe('funcaoDoPonto e elegíveis', () => {
  it('luz → ILUMINACAO; TUG → TUG; TUE e ligação direta → TUE; interruptor → COMANDO; dados e sem tipo → nada', () => {
    expect(funcaoDoPonto('ILUMINACAO_TETO')).toBe('ILUMINACAO');
    expect(funcaoDoPonto('ILUMINACAO_PAREDE')).toBe('ILUMINACAO');
    expect(funcaoDoPonto('ILUMINACAO_PISO')).toBe('ILUMINACAO');
    expect(funcaoDoPonto('TUG')).toBe('TUG');
    expect(funcaoDoPonto('TUE')).toBe('TUE');
    expect(funcaoDoPonto('LIGACAO_DIRETA')).toBe('TUE');
    expect(funcaoDoPonto('INTERRUPTOR')).toBe('COMANDO');
    for (const d of ['DADOS_TELEFONE', 'DADOS_TV', 'DADOS_REDE', 'DADOS_USB'] as const) expect(funcaoDoPonto(d)).toBeNull();
    expect(funcaoDoPonto(null)).toBeNull();
    expect(funcaoDoPonto(undefined)).toBeNull();
  });

  it('elegíveis: soltos do pavimento com função — fora o já ligado, o de dados, o sem tipo e o de outro pavimento', () => {
    const { m, t, ids } = casa();
    const outro = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const t1 = outro.levels[1].id;
    const m2 = applyCommand(outro, ponto(t1, 1000, 1000, 'TUG', 100)).model;
    const elegiveis = pontosElegiveis(m2, t).map((x) => x.id);
    // 14 pontos criados: 11 elegíveis (sai DADOS_TV, sem tipo e o já ligado).
    expect(elegiveis).toHaveLength(11);
    expect(elegiveis).not.toContain(ids[10]);
    expect(elegiveis).not.toContain(ids[11]);
    expect(elegiveis).not.toContain(ids[13]);
    expect(pontosElegiveis(m2, t1)).toHaveLength(1);
  });
});

describe('planejarCircuitos — por ambiente (sugerido)', () => {
  it('luz e TUG por cômodo, TUE um por ponto; nomes continuam do C1; tipo, tensão, ligação e seção da função', () => {
    const { m, t, quadroId, ids } = casa();
    const plano = planejar(m, t, quadroId);
    expect(plano.motivo).toBeNull();
    expect(plano.circuitos.map((c) => c.nome)).toEqual([
      'C2 — Iluminação Sala',
      'C3 — Iluminação Cozinha',
      'C4 — TUG Sala',
      'C5 — TUG Cozinha 1',
      'C6 — TUG Cozinha 2',
      'C7 — TUE Micro-ondas',
      'C8 — TUE Chuveiro',
    ]);
    const [luzSala, luzCoz, tugSala, tugCoz1, tugCoz2, micro, chuveiro] = plano.circuitos;
    // A luz da sala leva o interruptor junto (comando, não carga).
    expect(luzSala.terminalIds).toEqual([ids[0], ids[1]]);
    expect(luzSala.somaVA).toBe(160);
    expect(luzSala.secaoMm2).toBe(1.5);
    expect(luzCoz.terminalIds).toEqual([ids[4]]);
    // TUG da sala: as duas de 100 e a sem potência (conta 0, marcada).
    expect(tugSala.terminalIds).toEqual([ids[2], ids[3], ids[12]]);
    expect(tugSala.somaVA).toBe(200);
    expect(tugSala.pontosSemPotencia).toBe(1);
    expect(tugSala.secaoMm2).toBe(2.5);
    // 1.800 VA na cozinha passa de 1.270: divide (D2) — o teste seguinte detalha.
    expect(tugCoz1.somaVA + tugCoz2.somaVA).toBe(1800);
    expect(micro.funcao).toBe('TUE');
    expect(micro.secaoMm2).toBe(4);
    expect(micro.ambiente).toBe('Cozinha');
    expect(chuveiro.ambiente).toBeNull();
    expect(chuveiro.secaoMm2).toBe(4);
    for (const c of plano.circuitos) {
      expect(c.tensaoV).toBe(127);
    }
    const adds = plano.comandos.filter((c) => c.type === 'AddCircuito');
    expect(adds).toHaveLength(7);
    expect(adds.map((c) => (c.type === 'AddCircuito' ? [c.tipo, c.ligacao, c.secaoMm2] : null))).toEqual([
      ['ILUMINACAO', 'FN', 1.5],
      ['ILUMINACAO', 'FN', 1.5],
      ['TUG', 'FN', 2.5],
      ['TUG', 'FN', 2.5],
      ['TUG', 'FN', 2.5],
      ['TUE', 'FN', 4],
      ['TUE', 'FN', 4],
    ]);
    // Primeiro todos os AddCircuito, depois os SetTerminalProps — a ordem que o lote exige.
    const tipos = plano.comandos.map((c) => c.type);
    expect(tipos.lastIndexOf('AddCircuito')).toBeLessThan(tipos.indexOf('SetTerminalProps'));
    // Dados e sem tipo ficam de fora, com motivo; o já ligado nem aparece.
    expect(plano.foraDoPlano.map((f) => f.terminalId)).toEqual([ids[10], ids[11]]);
    expect(plano.circuitos.flatMap((c) => c.terminalIds)).not.toContain(ids[13]);
  });

  it('a TUG da cozinha estoura 1.270 VA e divide em "TUG Cozinha 1/2" — ponto único acima do máximo fica sozinho', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId);
    // 600+600 = 1200 ≤ 1270; +600 passa → [600,600] [600]
    const coz = plano.circuitos.filter((c) => c.nome.includes('TUG Cozinha'));
    expect(coz.map((c) => c.nome)).toEqual(['C5 — TUG Cozinha 1', 'C6 — TUG Cozinha 2']);
    expect(coz.map((c) => c.somaVA)).toEqual([1200, 600]);
    const chuveiro = plano.circuitos.find((c) => c.nome.includes('Chuveiro'))!;
    expect(chuveiro.somaVA).toBe(5500);
    expect(chuveiro.aviso).toBeNull(); // TUE não tem carga máxima — é um por ponto
  });

  it('com carga máxima declarada de 1.000 VA a cozinha vira três circuitos', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId, { cargaMaximaVA: 1000 });
    expect(plano.cargaMaxima).toMatchObject({ va: 1000, origem: 'DECLARADA' });
    const coz = plano.circuitos.filter((c) => c.nome.includes('TUG Cozinha'));
    expect(coz.map((c) => c.nome)).toEqual(['C5 — TUG Cozinha 1', 'C6 — TUG Cozinha 2', 'C7 — TUG Cozinha 3']);
  });
});

describe('planejarCircuitos — por carga máxima e um por função', () => {
  it('por carga: TUG de cozinha/serviço fica exclusiva (9.5.3.2); as demais enchem na ordem, nome lista os ambientes', () => {
    const { m, t, quadroId, ids } = casa();
    const plano = planejar(m, t, quadroId, { criterio: 'carga' });
    const tugs = plano.circuitos.filter((c) => c.funcao === 'TUG');
    expect(tugs.map((c) => c.nome)).toEqual(['C3 — TUG (Sala)', 'C4 — TUG Cozinha 1', 'C5 — TUG Cozinha 2']);
    expect(tugs[0].terminalIds).toEqual([ids[2], ids[3], ids[12]]);
    expect(tugs[0].ambiente).toBe('Sala');
    const luz = plano.circuitos.filter((c) => c.funcao === 'ILUMINACAO');
    expect(luz.map((c) => c.nome)).toEqual(['C2 — Iluminação (Sala, Cozinha)']);
    expect(luz[0].terminalIds).toEqual([ids[0], ids[4], ids[1]]); // as duas luzes e o interruptor
    expect(luz[0].ambiente).toBeNull();
  });

  it('um por função: uma iluminação, uma TUG, a TUG da cozinha e os dois TUE — com aviso quando a soma passa', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId, { criterio: 'funcao' });
    expect(plano.circuitos.map((c) => c.nome)).toEqual([
      'C2 — Iluminação',
      'C3 — TUG',
      'C4 — TUG Cozinha',
      'C5 — TUE Micro-ondas',
      'C6 — TUE Chuveiro',
    ]);
    const coz = plano.circuitos[2];
    expect(coz.somaVA).toBe(1800);
    expect(coz.aviso).toMatch(/1800 VA acima da carga máxima 1270 VA/);
    expect(plano.circuitos[1].aviso).toBeNull();
  });

  it('interruptor sem luz no ambiente vai para a primeira iluminação do plano; sem luz nenhuma fica de fora', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = base.levels[0].id;
    let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127 }).model;
    const quadroId = m.quadros![0].id;
    m = applyBatch(m, [ponto(t, 100, 100, 'INTERRUPTOR', null), ponto(t, 5000, 5000, 'ILUMINACAO_TETO', 100)]).model;
    const plano = planejar(m, t, quadroId);
    expect(plano.circuitos).toHaveLength(1);
    expect(plano.circuitos[0].terminalIds).toHaveLength(2);

    const soInterruptor = applyCommand(
      applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(0, 0), cotaMm: 1500, tensaoV: 127 }).model,
      ponto(t, 100, 100, 'INTERRUPTOR', null),
    ).model;
    const plano2 = planejar(soInterruptor, t, soInterruptor.quadros![0].id);
    expect(plano2.circuitos).toHaveLength(0);
    expect(plano2.motivo).toBe('nenhum ponto sem circuito');
  });
});

describe('planejarCircuitos — o lote', () => {
  it('os ids previstos são os que o kernel dá; cada ponto aponta para o seu; seq avança N; conferirPlano diz ok', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId);
    expect(idsPrevistos(m, 2)).toEqual(['cir_0002', 'cir_0003']); // C1 já consumiu cir_0001
    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created.filter((id) => id.startsWith('cir_'))).toEqual(plano.circuitos.map((c) => c.idPrevisto));
    const terminais = new Map(r.model.terminais!.map((x) => [x.id, x]));
    for (const c of plano.circuitos) {
      for (const id of c.terminalIds) expect(terminais.get(id)!.circuitoId).toBe(c.idPrevisto);
      const gravado = r.model.circuitos!.find((x) => x.id === c.idPrevisto)!;
      expect(gravado.nome).toBe(c.nome);
      expect(gravado.secaoMm2).toBe(c.secaoMm2);
      expect(gravado.tipo).toBe(c.funcao);
    }
    expect(r.model.seq['cir']).toBe((m.seq['cir'] ?? 0) + plano.circuitos.length);
    expect(conferirPlano(m, plano)).toEqual({ ok: true });
  });

  it('o lote é atômico: ponto antes do seu circuito derruba tudo e o modelo original fica intacto', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId);
    const antes = snapshotHash(m);
    const invertido = [...plano.comandos].reverse();
    expect(() => applyBatch(m, invertido)).toThrow();
    expect(snapshotHash(m)).toBe(antes);
    expect(conferirPlano(m, { ...plano, comandos: invertido }).ok).toBe(false);
  });

  it('rodar de novo depois de aplicar não religa nada: "nenhum ponto sem circuito"', () => {
    const { m, t, quadroId } = casa();
    const plano = planejar(m, t, quadroId);
    const depois = applyBatch(m, plano.comandos).model;
    const plano2 = planejar(depois, t, quadroId);
    expect(plano2.circuitos).toHaveLength(0);
    expect(plano2.comandos).toHaveLength(0);
    expect(plano2.motivo).toBe('nenhum ponto sem circuito');
    // Os de fora continuam de fora, listados.
    expect(plano2.foraDoPlano).toHaveLength(2);
  });

  it('determinístico: dois planos do mesmo desenho são iguais', () => {
    const { m, t, quadroId } = casa();
    expect(JSON.stringify(planejar(m, t, quadroId))).toBe(JSON.stringify(planejar(m, t, quadroId)));
  });
});

describe('planejarCircuitos — quadro, tensão e hipóteses', () => {
  it('sem quadro nenhum: motivo e nenhum comando', () => {
    const { m, t } = casa();
    expect(planejar(m, t, null)).toMatchObject({ motivo: 'sem quadro no desenho', comandos: [] });
  });

  it('quadro de OUTRO pavimento vale (17/09/2026): os pontos do andar de cima nascem no QDC do térreo', () => {
    // "elimine essa regra. não faz nenhum sentido: exige um quadro no mesmo pavimento"
    const { m, quadroId } = casa();
    let outro = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const cima = outro.levels[1].id;
    outro = applyCommand(outro, {
      type: 'AddTerminal', levelId: cima, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1000, 1000), cotaMm: 300,
      tipoEletrico: 'TUG', potenciaW: 100,
    }).model;
    const plano = planejar(outro, cima, quadroId);
    expect(plano.motivo).toBeNull();
    expect(plano.circuitos).toHaveLength(1);
    expect(plano.quadroId).toBe(quadroId);
    // E a lista de candidatos traz o quadro do térreo para o andar de cima.
    expect(quadrosDoNivel(outro, cima).map((q) => q.id)).toEqual([quadroId]);
  });

  it('carga máxima: 10 A × tensão do quadro (127 → 1270; 220 → 2200); sem tensão assume 127 e avisa; declarada vence', () => {
    expect(cargaMaximaEfetivaVA({ tensaoV: 127 }, HIP)).toEqual({ va: 1270, origem: 'CALCULADA', tensaoV: 127, tensaoAssumida: false });
    expect(cargaMaximaEfetivaVA({ tensaoV: 220 }, HIP)).toMatchObject({ va: 2200 });
    expect(cargaMaximaEfetivaVA({ tensaoV: null }, HIP)).toMatchObject({ va: 1270, tensaoAssumida: true });
    expect(cargaMaximaEfetivaVA({ tensaoV: 220 }, { ...HIP, cargaMaximaVA: 3000 })).toMatchObject({ va: 3000, origem: 'DECLARADA' });
    const { m, t, quadroId } = casa({ tensaoV: null });
    const plano = planejar(m, t, quadroId);
    expect(plano.cargaMaxima?.tensaoAssumida).toBe(true);
    expect(plano.circuitos[0].tensaoV).toBeNull();
  });

  it('quadro FFF: os circuitos nascem sem ligação declarada — três fases não se herdam sem decisão', () => {
    const { m, t, quadroId } = casa({ ligacao: 'FFF' });
    const adds = planejar(m, t, quadroId).comandos.filter((c) => c.type === 'AddCircuito');
    for (const a of adds) expect(a.type === 'AddCircuito' ? a.ligacao : 'x').toBeNull();
  });

  it('seção mínima por função: 1,5 · 2,5 · TUE pela hipótese (nunca abaixo de 2,5)', () => {
    expect(secaoMinimaDaFuncaoMm2('ILUMINACAO', HIPOTESES_PADRAO)).toBe(1.5);
    expect(secaoMinimaDaFuncaoMm2('TUG', HIPOTESES_PADRAO)).toBe(2.5);
    expect(secaoMinimaDaFuncaoMm2('TUE', HIPOTESES_PADRAO)).toBe(4);
    expect(secaoMinimaDaFuncaoMm2('TUE', { ...HIPOTESES_PADRAO, secaoMinimaTueMm2: 6 })).toBe(6);
    expect(secaoMinimaDaFuncaoMm2('TUE', { ...HIPOTESES_PADRAO, secaoMinimaTueMm2: 1.5 })).toBe(2.5);
  });

  it('proximoNumeroDeCircuito conta os do quadro (+1)', () => {
    const { m, quadroId } = casa();
    expect(proximoNumeroDeCircuito(m, quadroId)).toBe(2);
    expect(proximoNumeroDeCircuito(m, null)).toBe(2);
  });
});
