/**
 * NBR 12721 no kernel da Planta (0.100.0, 13/10/2026 — Fase 2 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): classificação na
 * etiqueta, ambiente de área declarada, acessório vinculado da unidade, as
 * invariantes que impedem a área de contar duas vezes, a limpeza quando a
 * peça some, o canônico ida e volta e as cópias (pavimento tipo, grupo).
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

/** Dois apartamentos (6 × 6 m) sobre um hall (12 × 2 m), como em `blueprintUnidades.test.ts`. */
function predio() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(6000, 0, 6000, 6000, 150), w(0, 6000, 12000, 6000, 150)]).model;
  const achar = (x: number, y: number) => m.spaces.find((s) => s.ring.some((p) => p.x === x && p.y === y) && s.areaMm2 === (y === 8000 ? 24_000_000 : 36_000_000))!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: achar(0, 0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: achar(12000, 0), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: achar(0, 8000), name: 'Hall' },
  ]).model;
  const lbl = (nome: string) => m.labels.find((l) => l.name === nome)!;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [lbl('Sala 101').id] },
    { type: 'AddUnidade', numero: '102', labelIds: [lbl('Sala 102').id] },
  ]).model;
  return { m, t };
}

const etiqueta = (m: BlueprintModel, nome: string) => m.labels.find((l) => l.name === nome)!;
const unidade = (m: BlueprintModel, numero: string) => m.unidades.find((u) => u.numero === numero)!;

describe('classificação NBR 12721 na etiqueta e no declarado', () => {
  it('em lote, com chaves vazias omitidas; null volta a "a classificar"; o modelo anterior fica intacto', () => {
    const { m, t } = predio();
    const d = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Guarita', areaMm2: 6_000_000 }).model;
    const x = applyCommand(d, {
      type: 'SetNbr12721DoAmbiente',
      labelIds: [etiqueta(d, 'Hall').id, etiqueta(d, 'Sala 101').id],
      declaradoIds: [d.ambientesDeclarados[0].id],
      nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.75, divisao: 'PROPORCIONAL', escopo: null, natureza: null },
    }).model;
    expect(etiqueta(x, 'Hall').nbr12721).toEqual({ cobertura: 'DIFERENTE', coeficiente: 0.75, divisao: 'PROPORCIONAL' });
    expect(etiqueta(x, 'Sala 101').nbr12721).toEqual(etiqueta(x, 'Hall').nbr12721);
    expect(etiqueta(x, 'Sala 101').nbr12721).not.toBe(etiqueta(x, 'Hall').nbr12721); // objeto próprio por alvo
    expect(x.ambientesDeclarados[0].nbr12721).toEqual({ cobertura: 'DIFERENTE', coeficiente: 0.75, divisao: 'PROPORCIONAL' });
    expect(etiqueta(d, 'Hall').nbr12721).toBeUndefined(); // imutável: desfazer é ficar com o anterior

    const limpo = applyCommand(x, { type: 'SetNbr12721DoAmbiente', labelIds: [etiqueta(x, 'Hall').id], nbr12721: null }).model;
    expect(etiqueta(limpo, 'Hall').nbr12721).toBeUndefined();
    expect('nbr12721' in etiqueta(limpo, 'Hall')).toBe(false);
  });

  it('recusa cobertura desconhecida, coeficiente ≤ 0 ou acima do teto, divisão inválida e lote vazio', () => {
    const { m } = predio();
    const hall = etiqueta(m, 'Hall').id;
    const set = (nbr12721: unknown) => () => applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall], nbr12721: nbr12721 as never });
    expect(set({ cobertura: 'COBERTA' })).toThrow(/cobertura desconhecida/);
    expect(set({ cobertura: 'PADRAO', coeficiente: 0 })).toThrow(/coeficiente fora/);
    expect(set({ cobertura: 'PADRAO', coeficiente: 11 })).toThrow(/coeficiente fora/);
    expect(set({ cobertura: 'PADRAO', divisao: 'METADE' })).toThrow(/divisão desconhecida/);
    expect(() => applyCommand(m, { type: 'SetNbr12721DoAmbiente', nbr12721: { cobertura: 'PADRAO' } })).toThrow(/Nenhum ambiente/);
  });
});

describe('ambiente declarado', () => {
  it('nasce com nome aparado e área inteira; recusa nome vazio e área não positiva; edita, troca de dona e apaga', () => {
    const { m, t } = predio();
    let x = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: '  Depósito 101 ', areaMm2: 4_499_999.6, unidadeId: unidade(m, '101').id }).model;
    const a = x.ambientesDeclarados[0];
    expect(a).toMatchObject({ nome: 'Depósito 101', areaMm2: 4_500_000, unidadeUid: unidade(m, '101').uid });
    expect(() => applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: '  ', areaMm2: 1 })).toThrow(/vazio/);
    expect(() => applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: 'X', areaMm2: 0 })).toThrow(/positiva/);
    expect(() => applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: 'nao-existe', nome: 'X', areaMm2: 1 })).toThrow();

    x = applyCommand(x, { type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, areaMm2: 5_000_000, unidadeId: unidade(x, '102').id }).model;
    expect(x.ambientesDeclarados[0]).toMatchObject({ areaMm2: 5_000_000, unidadeUid: unidade(x, '102').uid });
    x = applyCommand(x, { type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, unidadeId: null }).model;
    expect(x.ambientesDeclarados[0].unidadeUid).toBeUndefined();
    expect(applyCommand(x, { type: 'DeleteAmbienteDeclarado', declaradoId: a.id }).model.ambientesDeclarados).toEqual([]);
  });

  it('apagar a unidade deixa o declarado sem dona (vira comum); remover o pavimento leva o declarado junto', () => {
    const { m, t } = predio();
    const x = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Depósito', areaMm2: 3_000_000, unidadeId: unidade(m, '101').id }).model;
    const semDona = applyCommand(x, { type: 'DeleteUnidade', unidadeId: unidade(x, '101').id }).model;
    expect(semDona.ambientesDeclarados).toHaveLength(1);
    expect(semDona.ambientesDeclarados[0].unidadeUid).toBeNull();
    const outro = applyCommand(x, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    expect(applyCommand(outro, { type: 'RemoveLevel', levelId: t }).model.ambientesDeclarados).toEqual([]);
  });
});

describe('acessório vinculado da unidade', () => {
  function comVagaEDeposito() {
    const { m, t } = predio();
    const x = applyBatch(m, [
      { type: 'AddVaga', levelId: t, at: point(3000, 7000) },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Depósito 7', areaMm2: 2_000_000 },
    ]).model;
    return { m: x, t, vaga: x.vagas[0], deposito: x.ambientesDeclarados[0] };
  }

  it('vaga, etiqueta comum ou declarado; mudar de unidade TIRA da anterior', () => {
    const { m, vaga, deposito } = comVagaEDeposito();
    let x = applyCommand(m, {
      type: 'SetAcessoriosDaUnidade',
      unidadeId: unidade(m, '101').id,
      acessorios: [
        { uid: vaga.uid, afetaPrivativa: true, afetaCoeficiente: false },
        { uid: deposito.uid, afetaPrivativa: true, afetaCoeficiente: true },
      ],
    }).model;
    expect(unidade(x, '101').acessorios).toHaveLength(2);
    x = applyCommand(x, { type: 'SetAcessoriosDaUnidade', unidadeId: unidade(x, '102').id, acessorios: [{ uid: vaga.uid, afetaPrivativa: true, afetaCoeficiente: true }] }).model;
    expect(unidade(x, '101').acessorios!.map((a) => a.uid)).toEqual([deposito.uid]);
    expect(unidade(x, '102').acessorios!.map((a) => a.uid)).toEqual([vaga.uid]);
    const vazio = applyCommand(x, { type: 'SetAcessoriosDaUnidade', unidadeId: unidade(x, '101').id, acessorios: [] }).model;
    expect('acessorios' in unidade(vazio, '101')).toBe(false);
  });

  it('recusa o que contaria duas vezes: etiqueta privativa de outra unidade, declarado com dona, uid inexistente', () => {
    const { m, t } = comVagaEDeposito();
    const set = (uid: string) => () =>
      applyCommand(m, { type: 'SetAcessoriosDaUnidade', unidadeId: unidade(m, '101').id, acessorios: [{ uid, afetaPrivativa: true, afetaCoeficiente: true }] });
    expect(set(etiqueta(m, 'Sala 102').uid)).toThrow(/já é privativo/);
    const comDona = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Box', areaMm2: 1_000_000, unidadeId: unidade(m, '102').id }).model;
    expect(() =>
      applyCommand(comDona, {
        type: 'SetAcessoriosDaUnidade',
        unidadeId: unidade(comDona, '101').id,
        acessorios: [{ uid: comDona.ambientesDeclarados.find((a) => a.nome === 'Box')!.uid, afetaPrivativa: true, afetaCoeficiente: true }],
      }),
    ).toThrow(/já é privativo/);
    expect(set('uid-que-nao-existe')).toThrow(/acessório inexistente/);
    expect(() =>
      applyCommand(m, {
        type: 'SetAcessoriosDaUnidade',
        unidadeId: unidade(m, '101').id,
        acessorios: [
          { uid: m.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true },
          { uid: m.vagas[0].uid, afetaPrivativa: false, afetaCoeficiente: false },
        ],
      }),
    ).toThrow(/já está vinculado/);
  });

  it('apagar a vaga (ou o pavimento) tira o acessório da unidade sem cada comando lembrar', () => {
    const { m, vaga, deposito } = comVagaEDeposito();
    const x = applyCommand(m, {
      type: 'SetAcessoriosDaUnidade',
      unidadeId: unidade(m, '101').id,
      acessorios: [
        { uid: vaga.uid, afetaPrivativa: true, afetaCoeficiente: true },
        { uid: deposito.uid, afetaPrivativa: true, afetaCoeficiente: true },
      ],
    }).model;
    const semVaga = applyCommand(x, { type: 'DeleteVaga', vagaId: vaga.id }).model;
    expect(unidade(semVaga, '101').acessorios!.map((a) => a.uid)).toEqual([deposito.uid]);
    const semNada = applyCommand(semVaga, { type: 'DeleteAmbienteDeclarado', declaradoId: deposito.id }).model;
    expect('acessorios' in unidade(semNada, '101')).toBe(false);
  });
});

describe('canônico', () => {
  it('estudo sem nada de NBR 12721 não ganha chave nova (o hash dos estudos atuais só muda pela versão)', () => {
    const { m } = predio();
    const json = canonicalPayload(m);
    expect(json).not.toMatch(/nbr12721|ambientesDeclarados|acessorios/);
  });

  it('ida e volta byte a byte com classificação, declarados (com dona) e acessórios de três famílias; o hash muda', () => {
    const { m, t } = predio();
    let x = applyBatch(m, [
      { type: 'AddVaga', levelId: t, at: point(3000, 7000) },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Depósito 7', areaMm2: 2_000_000, nbr12721: { cobertura: 'PADRAO', natureza: 'ACESSORIA' } },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Terraço 102', areaMm2: 9_500_000, unidadeId: unidade(m, '102').id, nbr12721: { cobertura: 'DESCOBERTA', coeficiente: 0.6 } },
    ]).model;
    x = applyBatch(x, [
      { type: 'SetNbr12721DoAmbiente', labelIds: [etiqueta(x, 'Hall').id], nbr12721: { cobertura: 'PADRAO', divisao: 'PROPORCIONAL', escopo: 'GLOBAL' } },
      {
        type: 'SetAcessoriosDaUnidade',
        unidadeId: unidade(x, '101').id,
        acessorios: [
          { uid: x.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: false },
          { uid: x.ambientesDeclarados.find((a) => a.nome === 'Depósito 7')!.uid, afetaPrivativa: true, afetaCoeficiente: true },
          { uid: etiqueta(x, 'Hall').uid, afetaPrivativa: false, afetaCoeficiente: true },
        ],
      },
    ]).model;
    const json = canonicalPayload(x);
    const payload = parseCanonicalPayload(json);
    expect(payload.ambientesDeclarados!.map((a) => a.nome)).toEqual(['Depósito 7', 'Terraço 102']);
    expect(payload.ambientesDeclarados![1].unidade).toBe(payload.unidades!.findIndex((u) => u.numero === '102'));
    expect(payload.unidades!.find((u) => u.numero === '101')!.acessorios).toHaveLength(3);

    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(json);
    expect(snapshotHash(volta)).toBe(snapshotHash(x));
    expect(snapshotHash(x)).not.toBe(snapshotHash(m));
    const u101 = unidade(volta, '101');
    expect(u101.acessorios!.find((a) => a.uid === volta.vagas[0].uid)).toEqual({ uid: volta.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: false });
    expect(volta.ambientesDeclarados.find((a) => a.nome === 'Terraço 102')!.unidadeUid).toBe(unidade(volta, '102').uid);
    expect(etiqueta(volta, 'Hall').nbr12721).toEqual({ cobertura: 'PADRAO', divisao: 'PROPORCIONAL', escopo: 'GLOBAL' });
  });
});

describe('cópias levam a classificação', () => {
  it('pavimento tipo: a cópia viva nasce e acompanha com a classificação da origem', () => {
    const { m, t } = predio();
    let x = applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [etiqueta(m, 'Hall').id], nbr12721: { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' } }).model;
    x = applyCommand(x, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800, tipoDeId: t }).model;
    const copia = x.levels.find((l) => l.name === '1º')!.id;
    const hallDaCopia = () => x.labels.find((l) => l.levelId === copia && l.name === 'Hall')!;
    expect(hallDaCopia().nbr12721).toEqual({ cobertura: 'PADRAO', divisao: 'PROPORCIONAL' });
    x = applyCommand(x, { type: 'SetNbr12721DoAmbiente', labelIds: [x.labels.find((l) => l.levelId === t && l.name === 'Hall')!.id], nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' } }).model;
    expect(hallDaCopia().nbr12721).toEqual({ cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' });
  });
});

describe('acessório da unidade de andar COPIADO (0.101.0)', () => {
  function comCopia() {
    const { m, t } = predio();
    let x = applyBatch(m, [
      { type: 'AddLevel', name: '2º', elevationMm: 3000, defaultHeightMm: 2800, tipoDeId: t },
      { type: 'AddLevel', name: 'Garagem', elevationMm: -3000, defaultHeightMm: 2800 },
    ]).model;
    const garagem = x.levels.find((l) => l.name === 'Garagem')!.id;
    x = applyCommand(x, { type: 'AddVaga', levelId: garagem, at: point(3000, 3000) }).model;
    return { m: x, copia: x.levels.find((l) => l.name === '2º')!, garagem };
  }

  it('aceita o pavimento copiado; recusa pavimento que não é cópia; ida e volta no canônico; apagar o andar tira o vínculo', () => {
    const { m, copia, garagem } = comCopia();
    const u101 = unidade(m, '101');
    const x = applyCommand(m, { type: 'SetAcessoriosDaUnidade', unidadeId: u101.id, acessorios: [{ uid: m.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true, levelUid: copia.uid }] }).model;
    expect(unidade(x, '101').acessorios).toEqual([{ uid: m.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true, levelUid: copia.uid }]);
    const naoCopia = m.levels.find((l) => l.id === garagem)!.uid;
    expect(() => applyCommand(m, { type: 'SetAcessoriosDaUnidade', unidadeId: u101.id, acessorios: [{ uid: m.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true, levelUid: naoCopia }] })).toThrow(/não é cópia/);

    const json = canonicalPayload(x);
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(json));
    expect(canonicalPayload(volta)).toBe(json);
    expect(unidade(volta, '101').acessorios![0].levelUid).toBe(volta.levels.find((l) => l.name === '2º')!.uid);
    expect(snapshotHash(x)).not.toBe(snapshotHash(m));

    const semAndar = applyCommand(x, { type: 'RemoveLevel', levelId: copia.id }).model;
    expect('acessorios' in unidade(semAndar, '101')).toBe(false);
  });
});
