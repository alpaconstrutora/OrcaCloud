/**
 * E1.2 + E1.3 do roadmap hidrossanitário (28/09/2026): perdas localizadas e a
 * PRESSÃO em cada ponto (NBR 5626:2020). Casos pequenos, conferíveis à mão.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { KPA_POR_MCA, comprimentoEquivalenteM, perdaDistribuida, perdaNoHidrometroKpa } from '../utils/blueprintHidraulicaPressao';
import { HIPOTESES_PRESSAO_PADRAO, pressoesDaOrigem, pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { vazaoDeProjetoLs } from '../utils/blueprintAguaAutomatica';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const af = (levelId: string, ax: number, ay: number, ca: number, bx: number, by: number, cb: number, dn = 25): Command => ({
  type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn,
});
const ponto = (levelId: string, tipo: 'RESERVATORIO' | 'LAVATORIO' | 'CHUVEIRO' | 'HIDROMETRO' | 'VRP' | 'AQUECEDOR', x: number, y: number, cota: number, disciplina: 'AGUA_FRIA' | 'AGUA_QUENTE' = 'AGUA_FRIA'): Command => ({
  type: 'AddTerminal', levelId, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo,
});

/** Caixa (0,0) a 2,80 m → desce a 0,60 → 3 m em x → lavatório. */
function simples(cotaDaCaixa = 2800) {
  const { m, t } = nivel();
  const mm = applyBatch(m, [
    ponto(t, 'RESERVATORIO', 0, 0, cotaDaCaixa),
    af(t, 0, 0, cotaDaCaixa, 0, 0, 600),
    af(t, 0, 0, 600, 3000, 0, 600),
    ponto(t, 'LAVATORIO', 3000, 0, 600),
  ]).model;
  return { m: mm, t, caixa: mm.terminais![0] };
}

describe('E1.2 — comprimento equivalente e hidrômetro', () => {
  it('tabela nos DN dela, interpolada entre eles (CPVC 22), e o hidrômetro perde 100 kPa na vazão máxima', () => {
    expect(comprimentoEquivalenteM('JOELHO_90', 25)).toBe(1.2);
    expect(comprimentoEquivalenteM('TE_LATERAL', 32)).toBe(3.1);
    expect(comprimentoEquivalenteM('JOELHO_90', 22)).toBeCloseTo(1.1 + (2 / 5) * 0.1, 9);
    expect(perdaNoHidrometroKpa(3 / 3.6, 3)).toBeCloseTo(100, 6);
  });
});

describe('E1.3 — pressão nos pontos', () => {
  it('conferido à mão: 2,20 m de desnível menos a perda em 6,8 m equivalentes (2,2 + 0,4 entrada + 3,0 + 1,2 joelho)', () => {
    const { m, caixa } = simples();
    const r = pressoesDaOrigem(m, caixa);
    const q = vazaoDeProjetoLs(0.3);
    const perda = perdaDistribuida(q, 'PVC_SOLDAVEL', 25, 2.2 + 0.4 + 3.0 + 1.2).perdaMca;
    const lav = r.pontos[0];
    expect(lav.disponivelKpa!).toBeCloseTo((2.2 - perda) * KPA_POR_MCA, 6);
    expect(lav.estaticaKpa!).toBeCloseTo(2.2 * KPA_POR_MCA, 6);
    expect(lav.minimaKpa).toBe(10);
    expect(lav.estado).toBe('OK');
    expect(r.criticoId).toBe(lav.terminalId);
  });

  it('caixa só 40 cm acima do ponto → INSUFICIENTE (≈ 3,9 kPa < 10)', () => {
    const { m, caixa } = simples(1000);
    const [lav] = pressoesDaOrigem(m, caixa).pontos;
    expect(lav.estado).toBe('INSUFICIENTE');
    expect(lav.disponivelKpa!).toBeLessThan(4);
  });

  it('TÊ: a saída alinhada perde como PASSAGEM, a de lado como SAÍDA LATERAL', () => {
    const { m, t } = nivel();
    // Caixa → desce → horizontal até o tê (3000,0) → segue a (6000,0) [passagem] e sobe a (3000,2000) [lateral].
    const mm = applyBatch(m, [
      ponto(t, 'RESERVATORIO', 0, 0, 2800),
      af(t, 0, 0, 2800, 0, 0, 600),
      af(t, 0, 0, 600, 3000, 0, 600),
      af(t, 3000, 0, 600, 6000, 0, 600),
      af(t, 3000, 0, 600, 3000, 2000, 600),
      ponto(t, 'LAVATORIO', 6000, 0, 600),
      ponto(t, 'LAVATORIO', 3000, 2000, 600),
    ]).model;
    const r = pressoesDaOrigem(mm, mm.terminais![0]);
    const noTe = (b: { x: number; y: number }) => r.trechos.find((x) => {
      const tr = mm.trechos!.find((y) => y.id === x.trechoId)!;
      return tr.b.x === b.x && tr.b.y === b.y;
    })!;
    const q = vazaoDeProjetoLs(0.3);
    const passagem = noTe({ x: 6000, y: 0 });
    const lateral = noTe({ x: 3000, y: 2000 });
    expect(passagem.perdaLocalizadaMca).toBeCloseTo(perdaDistribuida(q, 'PVC_SOLDAVEL', 25, 0.8).perdaMca, 9);
    expect(lateral.perdaLocalizadaMca).toBeCloseTo(perdaDistribuida(q, 'PVC_SOLDAVEL', 25, 2.4).perdaMca, 9);
  });

  it('prédio: caixa a 45 m → estática > 400 kPa = EXCESSIVA; uma VRP no trecho segura em 200', () => {
    const { m, t } = nivel();
    const alto = applyBatch(m, [
      ponto(t, 'RESERVATORIO', 0, 0, 45000),
      af(t, 0, 0, 45000, 0, 0, 600, 32),
      af(t, 0, 0, 600, 3000, 0, 600),
      ponto(t, 'LAVATORIO', 3000, 0, 600),
    ]).model;
    expect(pressoesDaOrigem(alto, alto.terminais![0]).pontos[0].estado).toBe('EXCESSIVA');
    const comVrp = applyCommand(alto, ponto(t, 'VRP', 1500, 0, 600)).model;
    const [lav] = pressoesDaOrigem(comVrp, comVrp.terminais![0]).pontos;
    expect(lav.estaticaKpa!).toBeCloseTo(200, 6);
    expect(lav.estado).toBe('OK');
  });

  it('HIDRÔMETRO sobre o trecho perde (36·Q)²/Qmáx²', () => {
    const { m, t, caixa } = simples();
    const sem = pressoesDaOrigem(m, caixa).pontos[0].disponivelKpa!;
    const com = applyCommand(m, ponto(t, 'HIDROMETRO', 1500, 0, 600)).model;
    const comH = pressoesDaOrigem(com, caixa).pontos[0].disponivelKpa!;
    expect(sem - comH).toBeCloseTo(perdaNoHidrometroKpa(vazaoDeProjetoLs(0.3), HIPOTESES_PRESSAO_PADRAO.qMaxDoHidrometroM3h), 6);
  });

  it('ponto sem caminho até a origem: NÃO AVALIADO, e não zero', () => {
    const { m, t, caixa } = simples();
    const solto = applyCommand(m, ponto(t, 'LAVATORIO', 9000, 9000, 600)).model;
    const r = pressoesDaOrigem(solto, caixa);
    const semRede = r.pontos.find((p) => p.at.x === 9000)!;
    expect(semRede.estado).toBe('NAO_AVALIADO');
    expect(semRede.disponivelKpa).toBeNull();
  });

  it('ÁGUA QUENTE parte do que a fria entrega ao aquecedor, menos a perda dele (20 kPa)', () => {
    const { m, t } = nivel();
    const mm = applyBatch(m, [
      ponto(t, 'RESERVATORIO', 0, 0, 2800),
      af(t, 0, 0, 2800, 0, 0, 1600),
      af(t, 0, 0, 1600, 2000, 0, 1600),
      ponto(t, 'AQUECEDOR', 2000, 0, 1600),
      ponto(t, 'AQUECEDOR', 2000, 0, 1600, 'AGUA_QUENTE'),
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_QUENTE', a: point(2000, 0), b: point(2000, 0), cotaAMm: 1600, cotaBMm: 600, bitolaMm: 22 },
      ponto(t, 'LAVATORIO', 2000, 0, 600, 'AGUA_QUENTE'),
    ]).model;
    const [fria, quente] = pressoesDoModelo(mm);
    const entrada = fria.pontos.find((p) => p.nome === 'Aquecedor')!.disponivelKpa!;
    const lav = quente.pontos[0];
    expect(quente.motivo).toBeNull();
    // Carga inicial = entrada − 20 kPa; o lavatório está 1 m abaixo, menos a perda do trecho quente.
    expect(lav.disponivelKpa!).toBeLessThan(entrada - 20 + 1 * KPA_POR_MCA);
    expect(lav.disponivelKpa!).toBeGreaterThan(entrada - 20 + 1 * KPA_POR_MCA - 2);
  });
});

describe('E1.3 — a marca no desenho', () => {
  it('ponto com pressão insuficiente vira marca de ERRO com "x < 10 kPa"; sem pressões passadas, nenhuma marca de pressão', () => {
    const { m } = simples(1000);
    const pressoes = pressoesDoModelo(m);
    const marcas = marcasDeVerificacao(m, null, pressoes).filter((x) => x.tipo === 'PRESSAO_BAIXA');
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toMatchObject({ severidade: 'ERRO', disciplina: 'AGUA_FRIA' });
    expect(marcas[0].texto).toMatch(/^3,\d < 10 kPa$/);
    expect(marcasDeVerificacao(m).filter((x) => x.tipo === 'PRESSAO_BAIXA')).toEqual([]);
  });
});


describe('E1.4 — dimensionar por pressão', () => {
  /** Sala 4 × 6 m, caixa no canto a 2,80 m, lavatório perto e pia longe — a rede pelas paredes em DN 20 não segura a pia. */
  function sala() {
    const { m, t } = nivel();
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    return {
      t,
      m: applyBatch(m, [
        w(0, 0, 4000, 0), w(4000, 0, 4000, 6000), w(4000, 6000, 0, 6000), w(0, 6000, 0, 0),
        ponto(t, 'RESERVATORIO', 0, 0, 2800),
        ponto(t, 'LAVATORIO', 75, 1500, 600),
        { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Pia', at: point(3925, 5500), cotaMm: 1100, tipoHidraulico: 'PIA_COZINHA' },
        { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Máquina', at: point(2000, 5925), cotaMm: 900, tipoHidraulico: 'MAQUINA_LAVAR' },
      ]).model,
    };
  }

  it('a rede por velocidade não atende; com o ajuste, TODOS os pontos atendem — num lote só, sem mexer em confirmado', async () => {
    const { m } = sala();
    const { planejarAgua } = await import('../utils/blueprintAguaAutomatica');
    const { comAjusteDePressao } = await import('../utils/blueprintPressaoDaRede');
    const caixa = m.terminais!.find((x) => x.tipoHidraulico === 'RESERVATORIO')!;
    const plano = planejarAgua(m, caixa);
    const soVelocidade = applyBatch(m, plano.comandos).model;
    expect(pressoesDoModelo(soVelocidade)[0].pontos.some((p) => p.estado === 'INSUFICIENTE')).toBe(true);
    const ajustado = comAjusteDePressao(m, plano);
    expect(ajustado.ajustadosPorPressao).toBeGreaterThan(0);
    expect(ajustado.avisos.some((a) => /DN aumentado para atender a pressão/.test(a))).toBe(true);
    const depois = applyBatch(m, ajustado.comandos).model;
    const r = pressoesDoModelo(depois)[0];
    expect(r.pontos.map((p) => p.estado)).toEqual(r.pontos.map(() => 'OK'));
    // Todo trecho aumentado era sugerido, e o DN é comercial do PVC.
    for (const c of ajustado.comandos.filter((x) => x.type === 'SetTrechoProps')) {
      const t = depois.trechos!.find((x) => x.id === (c as { trechoId: string }).trechoId)!;
      expect(t.sugerido).toBe(true);
      expect([20, 25, 32, 40, 50, 60, 75, 85, 110]).toContain(t.bitolaMm);
    }
  });

  it('chuveiro 70 cm abaixo do fundo da caixa: nenhum diâmetro resolve — o aviso diz o que resolve', async () => {
    const { m, t } = sala();
    const comChuveiro = applyCommand(m, ponto(t, 'CHUVEIRO', 75, 3500, 2100)).model;
    const { planejarAgua } = await import('../utils/blueprintAguaAutomatica');
    const { comAjusteDePressao } = await import('../utils/blueprintPressaoDaRede');
    const caixa = comChuveiro.terminais!.find((x) => x.tipoHidraulico === 'RESERVATORIO')!;
    const ajustado = comAjusteDePressao(comChuveiro, planejarAgua(comChuveiro, caixa));
    expect(ajustado.avisos.some((a) => /Chuveiro: o desnível até a caixa dá só .* nenhum diâmetro resolve; eleve a caixa ou pressurize/.test(a))).toBe(true);
  });

  it('trecho CONFIRMADO não é mexido: o aviso manda aumentar à mão', async () => {
    const { m, caixa } = simples();
    // DN 20 e comprido demais — e confirmado (sem `sugerido`).
    const longe = applyBatch(m, [
      { type: 'SetTrechoProps', trechoId: m.trechos![1].id, bitolaMm: 20 },
      { type: 'AddTrecho', levelId: m.levels[0].id, disciplina: 'AGUA_FRIA', a: point(3000, 0), b: point(3000, 30000), cotaAMm: 600, cotaBMm: 600, bitolaMm: 20 },
      ponto(m.levels[0].id, 'LAVATORIO', 3000, 30000, 600),
    ]).model;
    const { ajustarDnPorPressao } = await import('../utils/blueprintPressaoDaRede');
    const r = ajustarDnPorPressao(longe, caixa.id);
    expect(r.comandos).toEqual([]);
    expect(r.avisos.some((a) => /não tem trecho sugerido para aumentar .* aumente à mão/.test(a))).toBe(true);
  });

  it('HIDRÔMETRO pequeno para a vazão: aviso de vazão suportada', () => {
    const { m, t, caixa } = simples();
    const com = applyCommand(m, ponto(t, 'HIDROMETRO', 1500, 0, 600)).model;
    const r = pressoesDaOrigem(com, caixa, { ...HIPOTESES_PRESSAO_PADRAO, qMaxDoHidrometroM3h: 0.5 });
    expect(r.avisos.some((a) => /hidrômetro com vazão de projeto .* acima da máxima/.test(a))).toBe(true);
  });
});

describe('Incêndio E0.4 — o anel não some calado', () => {
  /** Caixa → desce a 0,60 → quadrado de 3 m (anel) → lavatório no canto oposto. */
  function comAnel() {
    const { m, t } = nivel();
    const mm = applyBatch(m, [
      ponto(t, 'RESERVATORIO', 0, 0, 2800),
      af(t, 0, 0, 2800, 0, 0, 600),
      af(t, 0, 0, 600, 3000, 0, 600),
      af(t, 3000, 0, 600, 3000, 3000, 600),
      af(t, 0, 0, 600, 0, 3000, 600),
      af(t, 0, 3000, 600, 3000, 3000, 600),
      ponto(t, 'LAVATORIO', 3000, 3000, 600),
    ]).model;
    return { m: mm, caixa: mm.terminais![0] };
  }

  it('rede em árvore: nenhum trecho de anel, nenhum aviso de anel', () => {
    const { m, caixa } = simples();
    const r = pressoesDaOrigem(m, caixa);
    expect(r.trechosDoAnel).toEqual([]);
    expect(r.avisos.some((a) => a.includes('anel'))).toBe(false);
  });

  it('quadrado fechado: exatamente um trecho fica fora da árvore, com aviso e marca no desenho', () => {
    const { m, caixa } = comAnel();
    const r = pressoesDaOrigem(m, caixa);
    expect(r.trechosDoAnel).toHaveLength(1);
    expect(r.trechos.map((x) => x.trechoId)).not.toContain(r.trechosDoAnel[0]);
    expect(r.avisos.some((a) => a.startsWith('rede com anel: 1 trecho'))).toBe(true);
    const marcas = marcasDeVerificacao(m, null, [r]).filter((x) => x.tipo === 'ANEL_NAO_CALCULADO');
    expect(marcas.map((x) => x.alvoId)).toEqual(r.trechosDoAnel);
    expect(marcas[0].severidade).toBe('AVISO');
  });

  it('o pressoesDoModelo leva o anel para quem desenha as marcas', () => {
    const { m } = comAnel();
    const [r] = pressoesDoModelo(m, HIPOTESES_PRESSAO_PADRAO);
    expect(r.trechosDoAnel).toHaveLength(1);
  });
});
