/**
 * F4 do plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md` (24/10/2026): o esgoto grava com que escolhas foi
 * lançado, diz o que mudou (regra B — o DESTINO inclusive, sem aviso duplicado), nunca fica sem ação com rede existente
 * (regra A) e o Refazer apaga só a rede do motor (confirmada inclusive) — nunca os aparelhos, os ralos, a caixa
 * confirmada nem tubo de outra disciplina — e relança num lote só, com o registro.
 */
import { describe, expect, it } from 'vitest';
import { ModelHistory, applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { planejarEsgotoCompleto } from '../utils/blueprintEsgotoCompleto';
import { HIPOTESES_HIDRO_PADRAO, type HipotesesHidro } from '../utils/blueprintMemorialHidro';
import { registroDe, textoDasDiferencas } from '../utils/blueprintRegistroDeLancamento';
import {
  ESCOLHAS_DO_ESGOTO,
  MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO,
  botaoDeLancarEsgoto,
  comRegistroDoEsgoto,
  comandosDeRefazerEsgoto,
  diferencasDoEsgoto,
  escolhasDoEsgoto,
  esgotoARefazer,
  lancamentoDoEsgoto,
  opcoesDoEsgoto,
  redeDoEsgotoDoSistema,
  textoDaConfirmacaoDoEsgoto,
  type PremissasDoEsgoto,
} from '../utils/blueprintEscolhasDoEsgoto';

const H = HIPOTESES_HIDRO_PADRAO;
const premissas = (esgoto: Partial<HipotesesHidro['esgoto']> = {}, resto: Partial<PremissasDoEsgoto> = {}): PremissasDoEsgoto => ({
  esgoto: { ...H.esgoto, ...esgoto },
  tratamento: H.tratamento,
  reservatorio: H.reservatorio,
  agua: H.agua,
  ...resto,
});
const P = premissas();
const TRATAMENTO = premissas({ destino: 'TRATAMENTO' });

/** Térreo 2 × 3 m com lavatório, caixa sifonada e vaso; o lote com a frente ao sul (sem caixa nem ligação). */
function planta(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
  const divisa = (ax: number, ay: number, bx: number, by: number, frente = false) =>
    ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(frente ? { papel: 'FRENTE' as const } : {}) }) as const;
  m = applyBatch(m, [
    w(0, 0, 2000, 0), w(2000, 0, 2000, 3000), w(2000, 3000, 0, 3000), w(0, 3000, 0, 0),
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Lavatório', at: point(600, 2500), cotaMm: 500, tipoHidraulico: 'LAVATORIO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Caixa sifonada', at: point(1200, 2100), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Vaso', at: point(600, 800), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' },
    divisa(-3000, -8000, 7500, -8000, true), divisa(7500, -8000, 7500, 6000), divisa(7500, 6000, -3000, 6000), divisa(-3000, 6000, -3000, -8000),
  ]).model;
  return m;
}

/** O esgoto lançado pelo "Lançar" com as premissas dadas — o lote leva o registro (salvo `semRegistro`). */
function esgotoLancado(p: PremissasDoEsgoto = P, m = planta(), semRegistro = false): BlueprintModel {
  const plano = planejarEsgotoCompleto(m, p.esgoto, null, opcoesDoEsgoto(m, p));
  expect(plano.comandos.length).toBeGreaterThan(0);
  return applyBatch(m, semRegistro ? plano.comandos : comRegistroDoEsgoto(m, plano.comandos, p)).model;
}

/** Aceita tudo: tubos confirmados e peças aceitas. */
function aceitar(m: BlueprintModel): BlueprintModel {
  return applyBatch(m, [
    ...(m.trechos ?? []).map((x): Command => ({ type: 'SetTrechoProps', trechoId: x.id, sugerido: false })),
    ...(m.terminais ?? []).filter((x) => x.sugerida).map((x): Command => ({ type: 'SetTerminalProps', terminalId: x.id, sugerida: false })),
  ]).model;
}

const aparelhos = (m: BlueprintModel) =>
  (m.terminais ?? [])
    .filter((x) => ['LAVATORIO', 'CAIXA_SIFONADA', 'VASO_SANITARIO'].includes(x.tipoHidraulico ?? ''))
    .map((x) => x.id)
    .sort();

describe('esgoto — as escolhas e o aviso (regra B)', () => {
  it('as mesmas premissas → nenhuma diferença; outro caimento → a diferença, só com o valor de cada lado', () => {
    const m = esgotoLancado();
    expect(registroDe(m, 'ESGOTO', null)?.escolhas).toMatchObject({ destino: 'REDE_PUBLICA', caimentoPctAte75: 2, profundidadeDaRedeMm: 1500 });
    expect(diferencasDoEsgoto(m, P)).toEqual([]);
    const d = diferencasDoEsgoto(m, premissas({ caimentoPctAte75: 3 }));
    expect(d).toEqual([{ item: 'caimentoPctAte75', rotulo: 'Caimento até DN 75', antes: '2 %', agora: '3 %' }]);
    expect(textoDasDiferencas(d)).toBe('Caimento até DN 75 — lançado com: 2 % · agora: 3 %');
  });

  it('chave ausente vale o padrão; a altura da válvula só entra com a válvula ligada; "sem limite" de rota é escolha', () => {
    // Registro antigo sem as premissas opcionais (ventilação até a parede, válvula…): no padrão, nada a avisar.
    const minimo = { destino: 'REDE_PUBLICA', caimentoPctAte75: 2, caimentoPctDe100: 1, cotaMinimaSobPisoMm: -150, dnTuboQuedaMm: 100, dnVentilacaoMm: 50, rotaMaximaVezes: 1.5 };
    const m = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'ESGOTO', alvoId: null, escolhas: minimo }).model;
    expect(diferencasDoEsgoto(m, P)).toEqual([]);
    const semValvula = escolhasDoEsgoto(premissas({ valvulaDeAdmissaoDeAr: false, valvulaAbaixoDoTetoMm: 500 }));
    expect(semValvula).not.toHaveProperty('valvulaAbaixoDoTetoMm');
    expect(diferencasDoEsgoto(m, premissas({ valvulaDeAdmissaoDeAr: false })).map((d) => d.item)).toEqual(['valvulaDeAdmissaoDeAr']);
    expect(diferencasDoEsgoto(m, premissas({ rotaMaximaVezes: null }))).toEqual([{ item: 'rotaMaximaVezes', rotulo: 'Rota máxima do ramal', antes: '1,5× a linha reta', agora: 'sem limite' }]);
  });

  it('⚠️ o DESTINO é uma escolha: a troca aparece sozinha (sem as premissas da rede pública nem as do tratamento)', () => {
    const m = esgotoLancado(premissas({ profundidadeDaRedeMm: 2000 }));
    const d = diferencasDoEsgoto(m, TRATAMENTO);
    expect(d).toEqual([{ item: 'destino', rotulo: 'Destino do esgoto', antes: 'rede pública', agora: 'tratamento individual' }]);
    // Com o tratamento dos dois lados, as premissas dele se comparam.
    const t = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'ESGOTO', alvoId: null, escolhas: escolhasDoEsgoto(TRATAMENTO) }).model;
    expect(diferencasDoEsgoto(t, { ...TRATAMENTO, tratamento: { ...H.tratamento, comFiltro: false } })).toEqual([
      { item: 'comFiltro', rotulo: 'Filtro anaeróbio', antes: 'com filtro', agora: 'sem filtro' },
    ]);
    // Toda chave com rótulo tem padrão (a regra "ausente = padrão" vale para todas).
    for (const k of Object.keys(ESCOLHAS_DO_ESGOTO.rotulos)) expect(ESCOLHAS_DO_ESGOTO.padroes, k).toHaveProperty(k);
  });

  it('rede SEM registro (lançada antes): nenhum aviso, e o botão relança (regra A)', () => {
    const antiga = aceitar(esgotoLancado(P, planta(), true));
    expect(registroDe(antiga, 'ESGOTO', null)).toBeNull();
    expect(diferencasDoEsgoto(antiga, premissas({ caimentoPctAte75: 3 }))).toEqual([]);
    const plano = planejarEsgotoCompleto(antiga, P.esgoto, null, opcoesDoEsgoto(antiga, P));
    expect(plano.comandos).toEqual([]);
    expect(botaoDeLancarEsgoto(antiga, plano, [], null)).toEqual({ modo: 'RELANCAR', motivo: null });
  });
});

describe('esgoto — os lotes levam o registro', () => {
  it('o lote de lançar leva o registro; um Ctrl+Z volta rede e registro juntos', () => {
    const m = planta();
    const plano = planejarEsgotoCompleto(m, P.esgoto, null, opcoesDoEsgoto(m, P));
    const lote = comRegistroDoEsgoto(m, plano.comandos, P);
    expect(lote.at(-1)).toMatchObject({ type: 'RegistrarLancamento', motor: 'ESGOTO', alvoId: null });
    const h = new ModelHistory(m);
    h.applyMany(lote);
    expect(registroDe(h.current, 'ESGOTO', null)).not.toBeNull();
    h.undo();
    expect(h.current).toEqual(m);
  });

  it('⚠️ lote PARCIAL não regrava o registro enquanto sobra rede lançada com outra escolha: o aviso continua', () => {
    const aceita = aceitar(esgotoLancado());
    const novo = applyCommand(aceita, { type: 'AddTerminal', levelId: aceita.levels[0].id, disciplina: 'ESGOTO', tipo: 'Chuveiro', at: point(1500, 2600), cotaMm: 0, tipoHidraulico: 'CHUVEIRO' }).model;
    const outra = premissas({ caimentoPctAte75: 3 });
    const plano = planejarEsgotoCompleto(novo, outra.esgoto, null, opcoesDoEsgoto(novo, outra));
    expect(plano.comandos.some((c) => c.type === 'AddTrecho')).toBe(true);
    const lote = comRegistroDoEsgoto(novo, plano.comandos, outra);
    expect(lote.some((c) => c.type === 'RegistrarLancamento')).toBe(false);
    expect(diferencasDoEsgoto(applyBatch(novo, lote).model, outra).map((d) => d.item)).toEqual(['caimentoPctAte75']);
    // Controle: com as MESMAS escolhas do registro, o lançamento parcial regrava.
    const igual = planejarEsgotoCompleto(novo, P.esgoto, null, opcoesDoEsgoto(novo, P));
    expect(comRegistroDoEsgoto(novo, igual.comandos, P).at(-1)).toMatchObject({ type: 'RegistrarLancamento', motor: 'ESGOTO' });
  });
});

describe('esgoto — o Refazer', () => {
  it('⚠️ apaga a rede do motor (confirmada inclusive) e relança com as escolhas atuais; preserva aparelhos, a caixa confirmada e a água; Ctrl+Z volta tudo', () => {
    let m = aceitar(esgotoLancado());
    const ci = (m.terminais ?? []).find((x) => x.tipoHidraulico === 'CAIXA_INSPECAO' && x.rotulo !== 'CI do coletor')!;
    expect(ci.sugerida).toBeFalsy();
    // Um tubo de ÁGUA encostado na caixa e um joelho posto à mão sobre um tubo do esgoto.
    const ramal = (m.trechos ?? []).find((t) => t.disciplina === 'ESGOTO' && t.rotulo == null && (t.a.x !== t.b.x || t.a.y !== t.b.y))!;
    m = applyBatch(m, [
      { type: 'AddTrecho', levelId: ci.levelId, disciplina: 'AGUA_FRIA', a: point(ci.at.x, ci.at.y), b: point(ci.at.x + 2000, ci.at.y), cotaAMm: ci.cotaMm, cotaBMm: ci.cotaMm, bitolaMm: 25 },
      { type: 'AddTerminal', levelId: ramal.levelId, disciplina: 'ESGOTO', tipo: 'Joelho 90°', at: point(ramal.a.x, ramal.a.y), cotaMm: ramal.cotaAMm, tipoHidraulico: 'CONEXAO_JOELHO_90' },
    ]).model;
    const agua = (m.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA').map((t) => t.id);
    const outra = premissas({ caimentoPctAte75: 3 });

    const r = esgotoARefazer(m, outra);
    expect(r.tubosConfirmados).toBe(r.tubos);
    expect(r.pecasPorNome).toContain('1 joelho(s) de 90°');
    expect(r.pecasPorNome.some((x) => /caixa\(s\) de inspeção sugerida/.test(x))).toBe(false);
    const texto = textoDaConfirmacaoDoEsgoto(r)!;
    expect(texto).toMatch(new RegExp(`^Esgoto: ${r.tubos} tubo\\(s\\) \\(${r.tubos} confirmado\\(s\\)\\), inclusive .*coletor \\(\\d+\\)`));
    expect(texto).toContain('1 joelho(s) de 90°');
    expect(texto).toContain('O que mudou: Caimento até DN 75 — lançado com: 2 % · agora: 3 %.');

    const { comandos } = comandosDeRefazerEsgoto(m, outra, null);
    expect(comandos.at(-1)).toMatchObject({ type: 'RegistrarLancamento', motor: 'ESGOTO', escolhas: { caimentoPctAte75: 3 } });
    const h = new ModelHistory(m);
    h.applyMany(comandos);
    const depois = h.current;
    expect(aparelhos(depois)).toEqual(aparelhos(m));
    expect((depois.terminais ?? []).some((x) => x.id === ci.id)).toBe(true);
    expect((depois.terminais ?? []).some((x) => x.tipoHidraulico === 'CONEXAO_JOELHO_90')).toBe(false);
    expect((depois.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA').map((t) => t.id)).toEqual(agua);
    // Nenhum tubo confirmado sobra: tudo sugerido de novo, e o aviso some.
    expect((depois.trechos ?? []).filter((t) => t.disciplina === 'ESGOTO' && !t.sugerido)).toEqual([]);
    expect(diferencasDoEsgoto(depois, outra)).toEqual([]);
    h.undo();
    expect(h.current).toEqual(m);
  });

  it('só sugeridos → a confirmação é `null` (refaz direto)', () => {
    expect(textoDaConfirmacaoDoEsgoto(esgotoARefazer(esgotoLancado(), premissas({ caimentoPctAte75: 3 })))).toBeNull();
  });

  it('⚠️ DESTINO trocado com a ligação CONFIRMADA: botão RELANCAR (um caminho só); o Refazer apaga a ligação, o coletor e as caixas dele e lança o tratamento', () => {
    const m = aceitar(esgotoLancado());
    expect((m.terminais ?? []).some((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO' && !x.sugerida)).toBe(true);
    const d = diferencasDoEsgoto(m, TRATAMENTO);
    const plano = planejarEsgotoCompleto(m, TRATAMENTO.esgoto, null, opcoesDoEsgoto(m, TRATAMENTO));
    expect(plano.confirmadosDoOutroDestino.length).toBeGreaterThan(0);
    expect(botaoDeLancarEsgoto(m, plano, d, null)).toEqual({ modo: 'RELANCAR', motivo: null });
    const texto = textoDaConfirmacaoDoEsgoto(esgotoARefazer(m, TRATAMENTO))!;
    expect(texto).toContain('1 ligação(ões) à rede pública');
    expect(texto).toContain('O que mudou: Destino do esgoto — lançado com: rede pública · agora: tratamento individual.');
    const depois = applyBatch(m, comandosDeRefazerEsgoto(m, TRATAMENTO, null).comandos).model;
    expect((depois.terminais ?? []).some((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO')).toBe(false);
    expect((depois.trechos ?? []).some((t) => t.rotulo === 'Coletor predial')).toBe(false);
    expect((depois.terminais ?? []).filter((x) => x.tipoHidraulico === 'TANQUE_SEPTICO' || x.tipoHidraulico === 'SUMIDOURO')).toHaveLength(2);
    expect(registroDe(depois, 'ESGOTO', null)?.escolhas).toMatchObject({ destino: 'TRATAMENTO', comFiltro: true });
    expect(diferencasDoEsgoto(depois, TRATAMENTO)).toEqual([]);
  });

  it('o mesmo caso SEM registro: o caminho antigo (o "Lançar" pede a autorização), sem aviso', () => {
    const m = aceitar(esgotoLancado(P, planta(), true));
    const plano = planejarEsgotoCompleto(m, TRATAMENTO.esgoto, null, opcoesDoEsgoto(m, TRATAMENTO));
    expect(diferencasDoEsgoto(m, TRATAMENTO)).toEqual([]);
    expect(botaoDeLancarEsgoto(m, plano, [], null)).toEqual({ modo: 'LANCAR', motivo: null });
  });

  it('⚠️ com a ligação CONFIRMADA e a rede pública de destino, o Refazer a mantém (só a sugerida é refeita)', () => {
    const m = aceitar(esgotoLancado());
    const ligacao = (m.terminais ?? []).find((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO')!;
    expect(redeDoEsgotoDoSistema(m, 'REDE_PUBLICA').pecas.some((x) => x.id === ligacao.id)).toBe(false);
    const depois = applyBatch(m, comandosDeRefazerEsgoto(m, premissas({ caimentoPctAte75: 3 }), null).comandos).model;
    expect((depois.terminais ?? []).filter((x) => x.tipoHidraulico === 'LIGACAO_ESGOTO').map((x) => x.id)).toEqual([ligacao.id]);
    expect((depois.trechos ?? []).some((t) => t.rotulo === 'Coletor predial')).toBe(true);
  });
});

describe('esgoto — regra A', () => {
  it('sem ponto: desligado com o motivo; com o que lançar: LANCAR; bloqueio: desligado com ele', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const b = botaoDeLancarEsgoto(vazio, planejarEsgotoCompleto(vazio), [], null);
    expect(b.modo).toBe('LANCAR');
    expect(b.motivo).toBeTruthy();
    const m = planta();
    expect(botaoDeLancarEsgoto(m, planejarEsgotoCompleto(m), [], null)).toEqual({ modo: 'LANCAR', motivo: null });
    expect(botaoDeLancarEsgoto(m, planejarEsgotoCompleto(m), [], 'x')).toEqual({ modo: 'LANCAR', motivo: 'x' });
  });
});

describe('esgoto — a Casa Automática (faixa, tubo de queda por grupo, raio do shaft)', () => {
  const EXTRAS = { faixa: { x: -60, y: -60 }, tuboDeQuedaPorGrupoMm: 2500, raioDoShaftMm: 1200 };

  it('o registro guarda os extras da casa SEM rótulo; `lancamentoDoEsgoto` os devolve, sem aviso; mudou o raio no estudo, vale o novo', () => {
    const m = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'ESGOTO', alvoId: null, escolhas: escolhasDoEsgoto(P, EXTRAS) }).model;
    expect(registroDe(m, 'ESGOTO', null)?.escolhas).toMatchObject({ faixaX: -60, faixaY: -60, tuboDeQuedaPorGrupoMm: 2500, raioDoShaftDaCasaMm: 1200, raioDoShaftMm: 3000 });
    const { hip, escolhas } = lancamentoDoEsgoto(m, P);
    expect(hip).toMatchObject({ faixa: { x: -60, y: -60 }, tuboDeQuedaPorGrupoMm: 2500, raioDoShaftMm: 1200 });
    expect(escolhas).toMatchObject({ faixaX: -60, raioDoShaftDaCasaMm: 1200 });
    expect(diferencasDoEsgoto(m, P)).toEqual([]);
    const outroRaio = premissas({ raioDoShaftMm: 4000 });
    expect(lancamentoDoEsgoto(m, outroRaio).hip.raioDoShaftMm).toBe(4000);
    expect(diferencasDoEsgoto(m, outroRaio).map((d) => d.item)).toEqual(['raioDoShaftMm']);
  });

  /** A planta com um forro de gesso (rebaixo `rebaixo`) e a água fria da caixa correndo a `cota` (a faixa da fria da casa). */
  function casaAntiga(rebaixo = 300, cota = 2598): BlueprintModel {
    let m = esgotoLancado(P, planta(), true);
    m = applyCommand(m, {
      type: 'NameSpace',
      spaceId: m.spaces[0].id,
      name: 'Banheiro',
      acabamentos: { forro: { camadas: [{ espessuraMm: 13, itemCode: '', descricao: 'Placa de PVC', funcao: 'ACABAMENTO' }], rebaixoMm: rebaixo } },
    }).model;
    const t = m.levels[0].id;
    return applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(1000, 1000), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 500 },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(1000, 1000), b: point(1000, 1000), cotaAMm: 2800, cotaBMm: cota, bitolaMm: 25, sugerido: true },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(1000, 1000), b: point(1800, 1000), cotaAMm: cota, cotaBMm: cota, bitolaMm: 25, sugerido: true },
    ]).model;
  }
  const FORRO_DA_AGUA = {
    aguaFria: { abaixoDoTetoMm: 202, afastamentoDaFaceMm: 250, degrauNaParedeMm: 60 },
    aguaQuente: { abaixoDoTetoMm: 170, afastamentoDaFaceMm: 200, degrauNaParedeMm: 120 },
    folgaSobAVigaMm: 20,
    rebaixoMm: 300,
  };

  it('⚠️ esgoto SEM registro numa casa (a água no forro dela): com as premissas da casa, relança com a faixa dela, e o registro a grava', () => {
    const antiga = casaAntiga();
    const comCasa = premissas({}, { esgotoDaCasa: { ...EXTRAS, forroDaAgua: FORRO_DA_AGUA } });
    const { hip, escolhas, motivo } = lancamentoDoEsgoto(antiga, comCasa);
    expect(motivo).toBeNull();
    expect(hip).toMatchObject({ faixa: { x: -60, y: -60 }, tuboDeQuedaPorGrupoMm: 2500, raioDoShaftMm: 1200 });
    expect(escolhas).toMatchObject({ faixaX: -60, faixaY: -60 });
    expect(comandosDeRefazerEsgoto(antiga, comCasa, null).comandos.at(-1)).toMatchObject({ type: 'RegistrarLancamento', escolhas: { faixaX: -60, raioDoShaftDaCasaMm: 1200 } });
    // Sem verificar a casa (o chamador não passou nada): só o estudo.
    expect(lancamentoDoEsgoto(antiga, P).hip.faixa).toBeUndefined();
  });

  it('⚠️ esgoto SEM registro numa casa: sem as premissas (erro de leitura) ou sem a assinatura da casa — BLOQUEADO com o motivo', () => {
    const antiga = casaAntiga();
    const semPremissas = lancamentoDoEsgoto(antiga, premissas({}, { esgotoDaCasa: null }));
    expect(semPremissas.motivo).toBe(`${MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO} Não foi possível ler as premissas da casa.`);
    expect(comandosDeRefazerEsgoto(antiga, premissas({}, { esgotoDaCasa: null }), null).comandos).toEqual([]);
    // Outro rebaixo no forro dos ambientes: não é a casa dessas premissas.
    const outroRebaixo = lancamentoDoEsgoto(casaAntiga(250), premissas({}, { esgotoDaCasa: { ...EXTRAS, forroDaAgua: FORRO_DA_AGUA } }));
    expect(outroRebaixo.motivo).toMatch(/^Esgoto lançado antes do registro numa casa .* O forro dos ambientes \(rebaixo 250 mm\) difere das premissas da casa \(rebaixo 300 mm\)/);
    // Forro desligado nas premissas da casa.
    expect(lancamentoDoEsgoto(antiga, premissas({}, { esgotoDaCasa: { ...EXTRAS, forroDaAgua: null } })).motivo).toBe(`${MOTIVO_ESGOTO_DA_CASA_SEM_REGISTRO} O forro está desligado nas premissas da casa.`);
    // Sem água no forro (não é casa): relança pelo estudo, sem motivo, mesmo sem as premissas.
    expect(lancamentoDoEsgoto(esgotoLancado(P, planta(), true), premissas({}, { esgotoDaCasa: null })).motivo).toBeNull();
  });
});
