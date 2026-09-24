/**
 * UNIFICAR TIPOS DE ESQUADRIA PRÓXIMOS (24/09/2026, P2.50).
 *
 * ⚠️ O caso é real: a planta do usuário fechou a P2.49 com **90 esquadrias em
 * 41 tipos**. Não são 41 caixilhos — é o DXF, onde a mesma porta sai 800, 802 e
 * 815 mm e cada milímetro vira um tipo no quadro.
 *
 * Esta é a única fase do módulo que muda GEOMETRIA em lote, então o que se
 * trava aqui é justamente o que pode dar errado:
 *
 *   1. o alvo é o tipo mais numeroso (e desempata pela medida redonda);
 *   2. a tolerância NÃO é transitiva — 800 e 804 não se juntam por causa de um
 *      802 no meio, senão 2 mm de cada vez arrastariam 800 até 840;
 *   3. peça que não CABE com a medida do alvo fica fora do lote, contada à
 *      parte — um lote com ela dentro seria recusado inteiro pelo kernel;
 *   4. o nome do alvo vai junto com a medida, senão a fragmentação volta
 *      disfarçada (mesma medida, nomes diferentes).
 */
import { describe, expect, it } from 'vitest';
import {
  comandosDaUnificacao,
  gruposDoNivel,
  TOLERANCIA_PADRAO_MM,
  unificacoesPropostas,
} from '../utils/blueprintUnificarEsquadrias';
import { applyBatch, applyCommand, computeQuantities, emptyModel, KERNEL_VERSION, point, POLITICA_PADRAO, type Command } from '../utils/blueprintKernel';

/** Um nível com uma parede longa e as aberturas pedidas. */
function cena(
  aberturas: { offsetMm: number; widthMm: number; heightMm?: number; kind?: 'door' | 'window'; nome?: string }[],
  paredeMm = 40000,
  alturaParedeMm = 2800,
) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: alturaParedeMm }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddWall', levelId, a: point(0, 0), b: point(paredeMm, 0), thicknessMm: 150, heightMm: alturaParedeMm },
  ]).model;
  const wallId = m.walls[0].id;
  m = applyBatch(
    m,
    aberturas.map((a): Command => ({
      type: 'AddOpening',
      wallId,
      kind: a.kind ?? 'door',
      offsetMm: a.offsetMm,
      widthMm: a.widthMm,
      heightMm: a.heightMm ?? 2100,
      sillMm: 0,
    })),
  ).model;
  // Nomes, quando o caso pede.
  const comNome = aberturas.map((a, i) => ({ a, o: m.openings[i] })).filter((x) => x.a.nome);
  if (comNome.length > 0) {
    m = applyBatch(
      m,
      comNome.map(({ a, o }): Command => ({
        type: 'SetOpeningEsquadria',
        openingId: o.id,
        esquadria: { nome: a.nome!, itemCode: '90843', descricao: 'Porta' },
      })),
    ).model;
  }
  return { model: m, levelId };
}

describe('unificar esquadrias próximas', () => {
  it('o alvo é o tipo MAIS NUMEROSO, e as próximas viram ele', () => {
    // 3 portas de 800 e 1 de 802: o padrão de fato é 800.
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 800 },
      { offsetMm: 2000, widthMm: 800 },
      { offsetMm: 4000, widthMm: 800 },
      { offsetMm: 6000, widthMm: 802 },
    ]);
    const [u] = unificacoesPropostas(model, levelId);
    expect(u.larguraMm).toBe(800);
    expect(u.origem).toBe('DESENHO');
    expect(u.pecas).toBe(1);
    expect(u.grupos[0].larguraMm).toBe(802);

    const depois = applyBatch(model, comandosDaUnificacao([u])).model;
    expect(depois.openings.every((o) => o.widthMm === 800)).toBe(true);
    // E o quadro deixa de ter dois tipos.
    expect(computeQuantities(depois, POLITICA_PADRAO, KERNEL_VERSION).totais.porEsquadria).toHaveLength(1);
  });

  it('empate resolve pela medida REDONDA — 800 ganha de 795', () => {
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 795 },
      { offsetMm: 2000, widthMm: 800 },
    ]);
    const [u] = unificacoesPropostas(model, levelId);
    expect(u.larguraMm).toBe(800);
  });

  it('⚠️ a tolerância NÃO é transitiva: 800 e 840 não se juntam por causa dos vizinhos', () => {
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 800 },
      { offsetMm: 2000, widthMm: 800 },
      { offsetMm: 4000, widthMm: 820 },
      { offsetMm: 6000, widthMm: 840 },
    ]);
    const u = unificacoesPropostas(model, levelId, 20);
    // 820 está a 20 do 800 e entra; 840 está a 40 e fica fora deste agrupamento.
    const alvo800 = u.find((x) => x.larguraMm === 800)!;
    expect(alvo800.grupos.map((g) => g.larguraMm)).toEqual([820]);
    const depois = applyBatch(model, comandosDaUnificacao(u)).model;
    expect(depois.openings.map((o) => o.widthMm).sort((a, b) => a - b)).toEqual([800, 800, 800, 840]);
  });

  it('⚠️ peça que NÃO CABE fica fora do lote — com ela dentro, o kernel recusaria tudo', () => {
    // Parede de 10 m. O alvo é 790 (2 peças). Duas seriam absorvidas:
    //   • a de 780 no meio da parede — cabe;
    //   • a de 770 que começa a 9230 mm e termina no fim da parede — sobram 770
    //     mm dali, então 790 NÃO cabe. Ela está dentro da tolerância e seria
    //     absorvida; com ela no lote, o kernel recusaria o lote INTEIRO.
    const { model, levelId } = cena(
      [
        { offsetMm: 0, widthMm: 790 },
        { offsetMm: 2000, widthMm: 790 },
        { offsetMm: 4000, widthMm: 780 },
        { offsetMm: 9230, widthMm: 770 },
      ],
      10000,
    );
    const u = unificacoesPropostas(model, levelId, 20);
    const alvo = u[0];
    expect(alvo.larguraMm).toBe(790);
    // A que cabe entra; a que não cabe é contada à parte, com o motivo.
    expect(alvo.pecas).toBe(1);
    expect(alvo.naoCabem).toHaveLength(1);
    expect(alvo.naoCabem[0].motivo).toMatch(/não cabe: sobram 770 mm de parede/);

    // E o lote resultante é aceito pelo kernel — que era o ponto.
    const depois = applyBatch(model, comandosDaUnificacao(u)).model;
    expect(depois.openings.map((o) => o.widthMm).sort((a, b) => a - b)).toEqual([770, 790, 790, 790]);
  });

  it('a altura também entra na conta, e a peça alta demais fica de fora', () => {
    // Pé-direito 2300: a porta de 2290 não pode virar 2300 se o peitoril é 0? cabe.
    // Já 2310 passaria — então o alvo 2290 é quem absorve, e nada estoura.
    const { model, levelId } = cena(
      [
        { offsetMm: 0, widthMm: 800, heightMm: 2290 },
        { offsetMm: 2000, widthMm: 800, heightMm: 2290 },
        { offsetMm: 4000, widthMm: 800, heightMm: 2280 },
      ],
      40000,
      2300,
    );
    const [u] = unificacoesPropostas(model, levelId, 20);
    expect(u.alturaMm).toBe(2290);
    const depois = applyBatch(model, comandosDaUnificacao([u])).model;
    expect(depois.openings.every((o) => o.heightMm === 2290)).toBe(true);
  });

  it('⚠️ o NOME do alvo vai junto: senão a fragmentação volta com a medida igual', () => {
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 800, nome: 'P1' },
      { offsetMm: 2000, widthMm: 800, nome: 'P1' },
      { offsetMm: 4000, widthMm: 810, nome: 'P7' },
    ]);
    const [u] = unificacoesPropostas(model, levelId, 20);
    const depois = applyBatch(model, comandosDaUnificacao([u])).model;
    expect(depois.openings.every((o) => o.esquadria?.nome === 'P1')).toBe(true);
    expect(computeQuantities(depois, POLITICA_PADRAO, KERNEL_VERSION).totais.porEsquadria).toHaveLength(1);
  });

  it('porta e janela nunca se unificam, e sem nada perto não há proposta', () => {
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 800, kind: 'door' },
      { offsetMm: 2000, widthMm: 810, kind: 'window', heightMm: 2100 },
      { offsetMm: 4000, widthMm: 1500, kind: 'door' },
    ]);
    expect(unificacoesPropostas(model, levelId, 20)).toEqual([]);
    // Tolerância zero desliga a proposta.
    expect(unificacoesPropostas(model, levelId, 0)).toEqual([]);
    expect(TOLERANCIA_PADRAO_MM).toBe(20);
  });

  it('vão livre não entra: não há caixilho a unificar', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    m = applyBatch(m, [{ type: 'AddWall', levelId, a: point(0, 0), b: point(10000, 0), thicknessMm: 150, heightMm: 2800 }]).model;
    const wallId = m.walls[0].id;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId, kind: 'passage', offsetMm: 0, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId, kind: 'passage', offsetMm: 2000, widthMm: 910, heightMm: 2100, sillMm: 0 },
    ] as Command[]).model;
    expect(gruposDoNivel(m, levelId)).toEqual([]);
    expect(unificacoesPropostas(m, levelId, 20)).toEqual([]);
  });

  /**
   * ⚠️ MIRAR O CATÁLOGO (P2.54). A prova no app mostrou que unificar pela medida
   * do DESENHO e depois sugerir item brigavam: 14 dos 41 tipos casavam com o
   * catálogo antes de unificar, e só 8 dos 29 depois — porque o alvo virava
   * `219,4 × 120`, medida que não existe no catálogo de ninguém.
   */
  it('com medidas comerciais, o alvo é a COMERCIAL mais próxima — e o grupo todo anda', () => {
    // 3 portas de 798 e 1 de 802: pela medida do desenho, o alvo seria 798.
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 798 },
      { offsetMm: 2000, widthMm: 798 },
      { offsetMm: 4000, widthMm: 798 },
      { offsetMm: 6000, widthMm: 802 },
    ]);
    const semCatalogo = unificacoesPropostas(model, levelId, 20)[0];
    expect(semCatalogo.larguraMm).toBe(798);
    expect(semCatalogo.pecas).toBe(1); // só a de 802 anda

    const [comCatalogo] = unificacoesPropostas(model, levelId, 20, [{ larguraMm: 800, alturaMm: 2100 }]);
    expect(comCatalogo.larguraMm).toBe(800);
    expect(comCatalogo.origem).toBe('CATALOGO');
    // ⚠️ TODAS as quatro peças andam — inclusive as três do tipo mais numeroso.
    expect(comCatalogo.pecas).toBe(4);

    const depois = applyBatch(model, comandosDaUnificacao([comCatalogo])).model;
    expect(depois.openings.every((o) => o.widthMm === 800)).toBe(true);
  });

  it('a medida comercial só vale se servir a TODO o agrupamento', () => {
    // 700 e 718 (18 mm de diferença, dentro da tolerância de 20). Uma comercial
    // de 700 serve aos dois; uma de 730 serviria ao 718 e não ao 700.
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 700 },
      { offsetMm: 2000, widthMm: 718 },
    ]);
    const [so730] = unificacoesPropostas(model, levelId, 20, [{ larguraMm: 730, alturaMm: 2100 }]);
    // 730 está a 30 mm do 700: não serve ao grupo todo, então cai para o desenho.
    expect(so730.origem).toBe('DESENHO');
    const [com700] = unificacoesPropostas(model, levelId, 20, [{ larguraMm: 700, alturaMm: 2100 }]);
    expect(com700.origem).toBe('CATALOGO');
    expect(com700.larguraMm).toBe(700);
  });

  it('⚠️ medida comercial que não cabe na parede não é aplicada àquela peça', () => {
    // A segunda porta termina no fim da parede: 800 não cabe ali.
    const { model, levelId } = cena(
      [
        { offsetMm: 0, widthMm: 790 },
        { offsetMm: 2210, widthMm: 790 },
      ],
      3000,
    );
    const [u] = unificacoesPropostas(model, levelId, 20, [{ larguraMm: 800, alturaMm: 2100 }]);
    expect(u.origem).toBe('CATALOGO');
    expect(u.naoCabem.length).toBeGreaterThan(0);
    // E o lote que sobra é aceito pelo kernel.
    expect(() => applyBatch(model, comandosDaUnificacao([u]))).not.toThrow();
  });

  it('sem medida comercial perto, continua mirando o desenho', () => {
    const { model, levelId } = cena([
      { offsetMm: 0, widthMm: 800 },
      { offsetMm: 2000, widthMm: 810 },
    ]);
    const [u] = unificacoesPropostas(model, levelId, 20, [{ larguraMm: 1500, alturaMm: 2100 }]);
    expect(u.origem).toBe('DESENHO');
    expect(u.larguraMm).toBe(800);
  });
});
