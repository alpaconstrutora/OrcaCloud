/**
 * F3 do plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md` (24/10/2026): a água e o pluvial gravam com que
 * escolhas foram lançados, dizem o que mudou (regra B), nunca ficam sem ação com rede existente (regra A) e ganham o
 * Refazer — que apaga a rede do sistema (confirmados inclusive), NUNCA os aparelhos e pontos, e relança num lote só.
 */
import { describe, expect, it } from 'vitest';
import { ModelHistory, applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { planejarAguaCompleta } from '../utils/blueprintAguaCompleta';
import { planejarPluvialCompleta } from '../utils/blueprintPluvialCompleto';
import { HIPOTESES_HIDRO_PADRAO, type HipotesesHidro } from '../utils/blueprintMemorialHidro';
import { registroDe, textoDasDiferencas } from '../utils/blueprintRegistroDeLancamento';
import {
  ESCOLHAS_DA_AGUA,
  MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO,
  aguaARefazer,
  botaoDeLancarAgua,
  botaoDeLancarPluvial,
  comRegistroDaAgua,
  comRegistroDoPluvial,
  comandosDeRefazerAgua,
  comandosDeRefazerPluvial,
  diferencasDaAgua,
  diferencasDoPluvial,
  escolhasDaAgua,
  escolhasDoPluvial,
  lancamentoDaAgua,
  lancamentoDoPluvial,
  motivoParaNaoRelancarAgua,
  pluvialARefazer,
  textoDaConfirmacaoDoSistema,
} from '../utils/blueprintEscolhasDaAguaEPluvial';

const H = HIPOTESES_HIDRO_PADRAO;
const comAgua = (agua: Partial<HipotesesHidro['agua']>): HipotesesHidro => ({ ...H, agua: { ...H.agua, ...agua } });
const comPluvial = (pluvial: Partial<HipotesesHidro['pluvial']>): HipotesesHidro => ({ ...H, pluvial: { ...H.pluvial, ...pluvial } });

/** Térreo com caixa d'água, chuveiro e lavatório, um telhado de uma água e o lote com frente (o hidrômetro e a saída). */
function planta(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const divisa = (ax: number, ay: number, bx: number, by: number, frente = false) =>
    ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(frente ? { papel: 'FRENTE' as const } : {}) }) as const;
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(500, 500), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 1000 },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro', at: point(1000, 2500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: point(1600, 2500), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
    { type: 'AddAgua', levelId: t, pontos: [point(0, 0), point(10000, 0), point(10000, 4000), point(0, 4000)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 100 },
    divisa(-3000, -8000, 13000, -8000, true),
    divisa(13000, -8000, 13000, 12000),
    divisa(13000, 12000, -3000, 12000),
    divisa(-3000, 12000, -3000, -8000),
  ] as never).model;
  return m;
}

/** A água lançada pelo "Lançar tudo" com as hipóteses dadas — o lote leva o registro. */
function aguaLancada(h: HipotesesHidro = H, m = planta()): BlueprintModel {
  const p = planejarAguaCompleta(m, h, null);
  expect(p.comandos.length).toBeGreaterThan(0);
  return applyBatch(m, comRegistroDaAgua(m, p.comandos, h)).model;
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
    .filter((x) => ['RESERVATORIO', 'CHUVEIRO', 'LAVATORIO', 'HIDROMETRO', 'TORNEIRA_BOIA'].includes(x.tipoHidraulico ?? ''))
    .map((x) => x.id)
    .sort();
const tubosDeAgua = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE');

describe('água — as escolhas e o aviso (regra B)', () => {
  it('as mesmas premissas → nenhuma diferença; outra velocidade → a diferença, só com o valor de cada lado', () => {
    const m = aguaLancada();
    expect(registroDe(m, 'AGUA', null)?.escolhas).toMatchObject({ velocidadeMaxMs: 2, pelasParedes: true, cotaEnterradaMm: -300 });
    expect(diferencasDaAgua(m, H)).toEqual([]);
    const d = diferencasDaAgua(m, comAgua({ velocidadeMaxMs: 2.5, pelasParedes: false }));
    expect(textoDasDiferencas(d)).toBe('Velocidade máxima na rede — lançado com: 2 m/s · agora: 2,5 m/s; Traçado dos ramais — lançado com: pelas paredes · agora: reto');
  });

  it('registro antigo sem a chave conta como lançado no padrão; o que só mexe em aviso (pressão da rede pública) não acende', () => {
    const { velocidadeMaxMs: _v, ...semVelocidade } = escolhasDaAgua(H);
    const m = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null, escolhas: semVelocidade }).model;
    expect(diferencasDaAgua(m, H)).toEqual([]);
    expect(diferencasDaAgua(m, { ...H, alimentacao: { ...H.alimentacao, pressaoDaRedePublicaKpa: 250 } })).toEqual([]);
    expect(ESCOLHAS_DA_AGUA.rotulos.pressaoDaRedePublicaKpa).toBeUndefined();
  });

  it('rede sem registro (lançada antes): nenhuma diferença — só a regra A', () => {
    const m = planta();
    const p = planejarAguaCompleta(m, H, null);
    const antiga = applyBatch(m, p.comandos).model;
    expect(registroDe(antiga, 'AGUA', null)).toBeNull();
    expect(diferencasDaAgua(antiga, comAgua({ velocidadeMaxMs: 3 }))).toEqual([]);
    expect(botaoDeLancarAgua(antiga, { comandos: [], pendencias: [] })).toEqual({ modo: 'RELANCAR', motivo: null });
  });
});

describe('água — os lotes levam o registro', () => {
  it('o lote de lançar leva o registro; um Ctrl+Z volta rede e registro juntos', () => {
    const m = planta();
    const p = planejarAguaCompleta(m, H, null);
    const lote = comRegistroDaAgua(m, p.comandos, H);
    expect(lote.at(-1)).toMatchObject({ type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null });
    const h = new ModelHistory(m);
    h.applyMany(lote);
    expect(registroDe(h.current, 'AGUA', null)).not.toBeNull();
    h.undo();
    expect(h.current).toEqual(m);
  });

  it('⚠️ lote PARCIAL não regrava o registro enquanto sobra rede lançada com outra escolha: o aviso continua', () => {
    const aceita = aceitar(aguaLancada());
    // O usuário muda a velocidade e põe um ponto novo; "Lançar tudo" liga só o ponto novo (o confirmado fica).
    const novo = applyCommand(aceita, { type: 'AddTerminal', levelId: aceita.levels[0].id, disciplina: 'AGUA_FRIA', tipo: 'Pia', at: point(4000, 2500), cotaMm: 1000, tipoHidraulico: 'PIA_COZINHA' }).model;
    const outra = comAgua({ velocidadeMaxMs: 2.5 });
    const p = planejarAguaCompleta(novo, outra, null);
    expect(p.comandos.some((c) => c.type === 'AddTrecho')).toBe(true);
    const lote = comRegistroDaAgua(novo, p.comandos, outra);
    expect(lote.some((c) => c.type === 'RegistrarLancamento')).toBe(false);
    expect(diferencasDaAgua(applyBatch(novo, lote).model, outra).map((d) => d.item)).toEqual(['velocidadeMaxMs']);
    // Controle: com as MESMAS escolhas do registro, o lote parcial regrava (nada mudou).
    expect(comRegistroDaAgua(novo, planejarAguaCompleta(novo, H, null).comandos, H).at(-1)).toMatchObject({ type: 'RegistrarLancamento' });
  });
});

describe('água — Refazer', () => {
  it('⚠️ apaga a rede do sistema (confirmados inclusive), NÃO apaga aparelhos nem pontos, e relança com as escolhas atuais', () => {
    const aceita = aceitar(aguaLancada());
    expect(tubosDeAgua(aceita).every((t) => !t.sugerido)).toBe(true);
    expect(tubosDeAgua(aceita).some((t) => t.rotulo === 'Alimentador')).toBe(true);
    const antes = aparelhos(aceita);
    const dn32 = comAgua({ dnMinimoAguaFriaMm: 32 });

    const { comandos } = comandosDeRefazerAgua(aceita, dn32, null);
    const apagados = new Set(comandos.flatMap((c) => (c.type === 'DeleteTrecho' ? [c.trechoId] : [])));
    expect(tubosDeAgua(aceita).every((t) => apagados.has(t.id))).toBe(true);
    expect(comandos.some((c) => c.type === 'DeleteTerminal' && antes.includes(c.terminalId))).toBe(false);

    const h = new ModelHistory(aceita);
    h.applyMany(comandos);
    const depois = h.current;
    expect(aparelhos(depois)).toEqual(antes);
    // A limpeza relançada traz o registro dela — e o antigo saiu junto (não duplica).
    expect((depois.terminais ?? []).filter((x) => x.tipoHidraulico === 'REGISTRO_GAVETA')).toHaveLength(1);
    // Relançada com as escolhas de agora: nasce sugerida, a distribuição no DN mínimo novo, o registro é o de agora.
    const distribuicao = tubosDeAgua(depois).filter((t) => !['Alimentador', 'Extravasor', 'Limpeza'].includes(t.rotulo ?? ''));
    expect(distribuicao.length).toBeGreaterThan(0);
    expect(distribuicao.every((t) => t.sugerido && (t.bitolaMm ?? 0) >= 32)).toBe(true);
    expect(registroDe(depois, 'AGUA', null)?.escolhas.dnMinimoAguaFriaMm).toBe(32);
    expect(diferencasDaAgua(depois, dn32)).toEqual([]);
    // UM Ctrl+Z volta tudo.
    h.undo();
    expect(h.current).toEqual(aceita);
  });

  it('a confirmação diz quanto será refeito e o que mudou; só sugeridos → sem confirmação', () => {
    const lancada = aguaLancada();
    const dn25 = comAgua({ dnMinimoAguaFriaMm: 25 });
    expect(textoDaConfirmacaoDoSistema('Água', aguaARefazer(lancada, dn25))).toBeNull();
    const aceita = aceitar(lancada);
    const r = aguaARefazer(aceita, dn25);
    expect(r.tubos).toBe(tubosDeAgua(aceita).length);
    expect(r.tubosConfirmados).toBe(r.tubos);
    expect(textoDaConfirmacaoDoSistema('Água', r)).toBe(
      `Água: ${r.tubos} tubo(s) (${r.tubos} confirmado(s)) e 1 peça(s) (1 aceita(s)). O que mudou: DN mínimo da água fria — lançado com: DN 20 · agora: DN 25.`,
    );
  });
});

describe('água — regra A', () => {
  it('há o que lançar → LANCAR; rede completa e nada a lançar → RELANCAR; sem nada → desligado com o motivo', () => {
    const m = planta();
    const p = planejarAguaCompleta(m, H, null);
    expect(botaoDeLancarAgua(m, p)).toEqual({ modo: 'LANCAR', motivo: null });
    const lancada = aceitar(aguaLancada());
    expect(botaoDeLancarAgua(lancada, { comandos: [], pendencias: [] })).toEqual({ modo: 'RELANCAR', motivo: null });
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const pv = planejarAguaCompleta(vazio, H, null);
    expect(botaoDeLancarAgua(vazio, pv)).toEqual({ modo: 'LANCAR', motivo: pv.pendencias[0] });
    expect(botaoDeLancarAgua(vazio, null).motivo).toMatch(/^Nada a lançar/);
  });
});

describe('água — forro (Casa Automática)', () => {
  const FORRO = {
    aguaFria: { abaixoDoTetoMm: 202, afastamentoDaFaceMm: 250, degrauNaParedeMm: 60 },
    aguaQuente: { abaixoDoTetoMm: 170, afastamentoDaFaceMm: 200, degrauNaParedeMm: 120 },
    folgaSobAVigaMm: 20,
  };

  it('o registro guarda o forro, a faixa da quente e a subida SEM rótulo; `lancamentoDaAgua` os devolve, sem aviso', () => {
    const daCasa: HipotesesHidro = { ...comAgua({ noForro: FORRO, faixaDaAguaQuente: { x: 80, y: 80 } }), alimentacao: { ...H.alimentacao, subida: 'FACHADA' } };
    const m = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null, escolhas: escolhasDaAgua(daCasa, { cotaEnterradaAjustadaMm: -450 }) }).model;
    const { hip, escolhas } = lancamentoDaAgua(m, H);
    expect(hip.agua.noForro).toEqual(FORRO);
    expect(hip.agua.faixaDaAguaQuente).toEqual({ x: 80, y: 80 });
    expect(hip.alimentacao.subida).toBe('FACHADA');
    // A cota ajustada vale enquanto a premissa do estudo for a mesma; o registro continua com a do estudo.
    expect(hip.alimentacao.cotaEnterradaMm).toBe(-450);
    expect(escolhas).toMatchObject({ cotaEnterradaMm: -300, cotaEnterradaAjustadaMm: -450 });
    expect(diferencasDaAgua(m, H)).toEqual([]);
    // Mudou a premissa: vale a nova, e o aviso acende.
    const outra: HipotesesHidro = { ...H, alimentacao: { ...H.alimentacao, cotaEnterradaMm: -600 } };
    expect(lancamentoDaAgua(m, outra).hip.alimentacao.cotaEnterradaMm).toBe(-600);
    expect(diferencasDaAgua(m, outra).map((d) => d.item)).toEqual(['cotaEnterradaMm']);
  });

  /** Sala 6 × 4 com forro de gesso (rebaixo 30 cm) e a água fria descendo da caixa à faixa do forro (2,598 m, acima da face). */
  function noForroSemRegistro(comForro = true): BlueprintModel {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    if (comForro) {
      m = applyCommand(m, {
        type: 'NameSpace',
        spaceId: m.spaces[0].id,
        name: 'Sala',
        acabamentos: { forro: { camadas: [{ espessuraMm: 13, itemCode: '', descricao: 'Placa de gesso acartonado', funcao: 'ACABAMENTO' }], rebaixoMm: 300 } },
      }).model;
    }
    return applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(1000, 1000), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 500 },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(1000, 1000), b: point(1000, 1000), cotaAMm: 2800, cotaBMm: 2598, bitolaMm: 25, sugerido: true },
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(1000, 1000), b: point(4000, 1000), cotaAMm: 2598, cotaBMm: 2598, bitolaMm: 25, sugerido: true },
    ]).model;
  }

  it('⚠️ água no forro lançada ANTES do registro: o motivo desliga o relançar e o Refazer não faz nada; sem forro de verdade, ou com registro, relança', () => {
    const antiga = noForroSemRegistro();
    expect(motivoParaNaoRelancarAgua(antiga, H)).toBe(MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO);
    expect(botaoDeLancarAgua(antiga, { comandos: [], pendencias: [] }, H)).toEqual({ modo: 'LANCAR', motivo: MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO });
    expect(comandosDeRefazerAgua(antiga, H, null).comandos).toEqual([]);
    expect(motivoParaNaoRelancarAgua(noForroSemRegistro(false), H)).toBeNull();
    const comRegistro = applyCommand(antiga, { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null, escolhas: escolhasDaAgua(comAgua({ noForro: FORRO })) }).model;
    expect(motivoParaNaoRelancarAgua(comRegistro, H)).toBeNull();
  });
});

describe('pluvial', () => {
  const COM_CHUVA = comPluvial({ intensidadeMmH: 150 }).pluvial;
  function pluvialLancado(hp = COM_CHUVA, m = planta()): BlueprintModel {
    const p = planejarPluvialCompleta(m, hp, null);
    expect(p.comandos.length).toBeGreaterThan(0);
    return applyBatch(m, comRegistroDoPluvial(m, p.comandos, hp)).model;
  }
  const pluviais = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'PLUVIAL');
  const bocais = (m: BlueprintModel) => (m.terminais ?? []).filter((x) => x.tipoHidraulico === 'RALO_PLUVIAL' && x.rotulo === 'Bocal');

  it('as escolhas: a intensidade que vale (informada, senão a da tabela) — trocar a cidade com a informada não acende', () => {
    expect(escolhasDoPluvial(COM_CHUVA).intensidadeMmH).toBe(150);
    expect(escolhasDoPluvial({ ...COM_CHUVA, intensidadeMmH: null, cidade: 'Belo Horizonte', periodoDeRetornoAnos: 5 }).intensidadeMmH).toBe(227);
    const m = pluvialLancado();
    expect(diferencasDoPluvial(m, { ...COM_CHUVA, cidade: 'Curitiba' })).toEqual([]);
    expect(textoDasDiferencas(diferencasDoPluvial(m, { ...COM_CHUVA, secaoDaCalha: 'RETANGULAR' }))).toBe('Seção da calha — lançado com: meia-cana · agora: retangular');
  });

  it('⚠️ Refazer apaga calhas, condutores e bocais (confirmados inclusive), NÃO o ralo posto à mão, e relança com as escolhas atuais', () => {
    let m = aceitar(pluvialLancado());
    // Um ralo pluvial do terraço, posto à mão (fonte de condutor — entrada do motor).
    m = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'PLUVIAL', tipo: 'Ralo', at: point(8000, 3000), cotaMm: 0, tipoHidraulico: 'RALO_PLUVIAL' }).model;
    const ralo = m.terminais!.at(-1)!.id;
    expect(pluviais(m).every((t) => !t.sugerido)).toBe(true);
    const retangular = { ...COM_CHUVA, secaoDaCalha: 'RETANGULAR' as const };
    const r = pluvialARefazer(m, retangular);
    expect(textoDaConfirmacaoDoSistema('Pluvial', r)).toContain(`Pluvial: ${pluviais(m).length} tubo(s) (${pluviais(m).length} confirmado(s)) e ${bocais(m).length} peça(s)`);
    expect(textoDaConfirmacaoDoSistema('Pluvial', r)).toContain('O que mudou: Seção da calha — lançado com: meia-cana · agora: retangular.');

    const { comandos } = comandosDeRefazerPluvial(m, retangular, null);
    const h = new ModelHistory(m);
    h.applyMany(comandos);
    const depois = h.current;
    expect(depois.terminais!.some((x) => x.id === ralo)).toBe(true);
    const antigos = new Set([...pluviais(m), ...bocais(m)].map((x) => x.id));
    expect([...pluviais(depois), ...bocais(depois)].some((x) => antigos.has(x.id))).toBe(false);
    expect(pluviais(depois).filter((t) => t.secaoCalha).every((t) => t.secaoCalha === 'RETANGULAR' && t.sugerido)).toBe(true);
    expect(diferencasDoPluvial(depois, retangular)).toEqual([]);
    h.undo();
    expect(h.current).toEqual(m);
  });

  it('lote parcial (só as calhas) com outra escolha e condutor confirmado: não regrava; regra A', () => {
    const m = aceitar(pluvialLancado());
    const retangular = { ...COM_CHUVA, secaoDaCalha: 'RETANGULAR' as const };
    const parcial: Command[] = [{ type: 'DeleteTrecho', trechoId: pluviais(m).find((t) => t.secaoCalha)!.id }];
    expect(comRegistroDoPluvial(m, parcial, retangular).some((c) => c.type === 'RegistrarLancamento')).toBe(false);
    expect(botaoDeLancarPluvial(m, { comandos: [], pendencias: [] })).toEqual({ modo: 'RELANCAR', motivo: null });
    expect(botaoDeLancarPluvial(planta(), { comandos: [], pendencias: ['Desenhe o telhado'] })).toEqual({ modo: 'LANCAR', motivo: 'Desenhe o telhado' });
  });

  it('a profundidade ajustada pela casa vale enquanto a do estudo for a mesma', () => {
    const m = applyCommand(planta(), { type: 'RegistrarLancamento', motor: 'PLUVIAL', alvoId: null, escolhas: escolhasDoPluvial(COM_CHUVA, { profundidadeAjustadaDoCondutorMm: 240 }) }).model;
    expect(lancamentoDoPluvial(m, COM_CHUVA).hip.profundidadeDoCondutorMm).toBe(240);
    expect(diferencasDoPluvial(m, COM_CHUVA)).toEqual([]);
    expect(lancamentoDoPluvial(m, { ...COM_CHUVA, profundidadeDoCondutorMm: 500 }).hip.profundidadeDoCondutorMm).toBe(500);
  });
});
