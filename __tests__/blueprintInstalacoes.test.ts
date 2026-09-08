/**
 * Instalações no kernel — Etapa 6, fatia 1 (08/09/2026).
 *
 * ─── O QUE ESTE ARQUIVO PROVA ───────────────────────────────────────────────
 *
 * Duas coisas, e a segunda é a que justifica a fatia existir.
 *
 * 1. Que a família NÃO MOVEU O HASH do acervo. A chave é omitida quando não há
 *    instalação, então todo desenho que já existe continua produzindo
 *    exatamente o payload que produzia. É por isso que as goldens passaram com
 *    `KERNEL_VERSION` ainda em 0.17.0, com a família inteira em pé, ANTES do
 *    bump — e é essa ordem que faz a prova valer.
 *
 * 2. Que o COMPRIMENTO é medido em três dimensões. Uma rede não é plana: o
 *    eletroduto sobe pela parede e o esgoto tem caimento. Medir a sombra em
 *    planta daria ZERO para a prumada e daria a menos para o esgoto — e os dois
 *    erros são silenciosos, porque o desenho fecha igual e o número sai
 *    plausível.
 */
import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  snapshotHash,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function comNivel(): { model: BlueprintModel; nivel: string } {
  const model = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  return { model, nivel: model.levels[0].id };
}

describe('o hash do acervo não se moveu', () => {
  it('⚠️ desenho SEM instalação não ganha chave nenhuma NO QUE É HASHEADO', () => {
    // Se a chave aparecesse — mesmo como `[]` —, a forma canônica de TODO
    // desenho já publicado mudaria, e cada snapshot do acervo passaria a ter um
    // hash diferente do que foi assinado.
    //
    // ⚠️ A asserção é sobre `payloadDoHash`, e não sobre `canonicalPayload`: o
    // sidecar `identity` traz um array por família SEMPRE, inclusive vazio, e
    // ele fica FORA do hash de propósito (ver o cabeçalho de `canonical.ts`).
    // Olhar o payload inteiro confundiria "a identidade ganhou duas chaves" com
    // "o desenho mudou" — e só a segunda importa.
    const { model, nivel } = comNivel();
    const comParede = applyCommand(model, {
      type: 'AddWall',
      levelId: nivel,
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 150,
      heightMm: 2800,
    }).model;

    const hasheado = payloadDoHash(comParede);
    expect(hasheado).not.toContain('trechos');
    expect(hasheado).not.toContain('terminais');
  });

  it('e a chave aparece assim que há rede', () => {
    const { model, nivel } = comNivel();
    const comRede = applyCommand(model, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'AGUA_FRIA',
      a: point(0, 0),
      b: point(3000, 0),
      cotaAMm: 2400,
      cotaBMm: 2400,
      bitolaMm: 25,
    }).model;
    expect(payloadDoHash(comRede)).toContain('trechos');
  });
});

describe('a ida e volta pelo payload', () => {
  it('as duas cotas sobrevivem — sem elas a prumada some', () => {
    const { model, nivel } = comNivel();
    const comRede = applyCommand(model, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'ESGOTO',
      a: point(1000, 2000),
      b: point(1000, 2000),
      cotaAMm: 2600,
      cotaBMm: -400,
      bitolaMm: 100,
      rotulo: 'Coluna 1',
    }).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(comRede)));
    expect(volta.trechos).toHaveLength(1);
    const [t] = volta.trechos;
    expect(t.cotaAMm).toBe(2600);
    // ⚠️ NEGATIVA, e de propósito: esgoto sai abaixo do piso. Um invariante que
    // exigisse cota positiva recusaria desenho correto.
    expect(t.cotaBMm).toBe(-400);
    expect(t.disciplina).toBe('ESGOTO');
    expect(t.bitolaMm).toBe(100);
    expect(t.rotulo).toBe('Coluna 1');
  });

  it('o terminal também, com a cota que a tomada tem', () => {
    const { model, nivel } = comNivel();
    const com = applyCommand(model, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'ELETRICA',
      tipo: 'Tomada baixa',
      at: point(500, 0),
      cotaMm: 300,
      itemCode: '91953',
    }).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com)));
    expect(volta.terminais).toHaveLength(1);
    expect(volta.terminais[0].cotaMm).toBe(300);
    expect(volta.terminais[0].tipo).toBe('Tomada baixa');
    expect(volta.terminais[0].itemCode).toBe('91953');
  });

  it('o mesmo desenho com uids diferentes dá o MESMO hash', () => {
    // O uid fica fora do hash. Duas sessões que desenham a mesma rede têm de
    // publicar a mesma versão.
    const desenhar = () => {
      const { model, nivel } = comNivel();
      return applyCommand(model, {
        type: 'AddTrecho',
        levelId: nivel,
        disciplina: 'ELETRICA',
        a: point(0, 0),
        b: point(2000, 0),
        cotaAMm: 2500,
        cotaBMm: 2500,
        bitolaMm: 25,
      }).model;
    };
    const a = desenhar();
    const b = desenhar();
    expect(a.trechos[0].uid).not.toBe(b.trechos[0].uid);
    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });
});

describe('⚠️ o comprimento é medido em TRÊS dimensões', () => {
  it('a PRUMADA de 2,80 m mede 2,80 m — e não zero', () => {
    // As duas pontas estão no mesmo lugar em planta. Um comprimento calculado
    // só em planta daria 0,000 m, e a obra compraria zero metro de eletroduto
    // para o trecho que sobe pela parede.
    const { model, nivel } = comNivel();
    const m = applyCommand(model, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'ELETRICA',
      a: point(1000, 1000),
      b: point(1000, 1000),
      cotaAMm: 0,
      cotaBMm: 2800,
      bitolaMm: 25,
    }).model;

    const q = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    expect(q.trechos).toHaveLength(1);
    expect(q.trechos[0].comprimentoPlantaM).toBeCloseTo(0, 6);
    expect(q.trechos[0].comprimentoM).toBeCloseTo(2.8, 6);
  });

  it('o ESGOTO com caimento de 2% em 10 m mede o comprimento INCLINADO', () => {
    // 10.000 mm em planta, caindo 200 mm: √(10² + 0,2²) = 10,002 m.
    // A diferença é pequena e o ponto não é ela — é que o caimento EXISTE no
    // desenho. Um modelo que guardasse uma altura só não saberia distinguir
    // este esgoto de um sem caimento, que não funciona.
    const { model, nivel } = comNivel();
    const m = applyCommand(model, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'ESGOTO',
      a: point(0, 0),
      b: point(10000, 0),
      cotaAMm: 0,
      cotaBMm: -200,
      bitolaMm: 100,
    }).model;

    const q = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    expect(q.trechos[0].comprimentoPlantaM).toBeCloseTo(10, 6);
    expect(q.trechos[0].comprimentoM).toBeCloseTo(Math.hypot(10, 0.2), 6);
    expect(q.trechos[0].desnivelM).toBeCloseTo(-0.2, 6);
    // E a fórmula mostra a conta, para quem conferir o número não ter de
    // adivinhar de onde ele saiu.
    expect(q.trechos[0].formula).toContain('√');
  });
});

describe('a linha de compra', () => {
  it('agrupa por disciplina e BITOLA — ninguém compra "instalações"', () => {
    const { model, nivel } = comNivel();
    let m = model;
    const trecho = (
      disciplina: 'ELETRICA' | 'AGUA_FRIA',
      bitolaMm: number,
      comprimento: number,
    ) => {
      m = applyCommand(m, {
        type: 'AddTrecho',
        levelId: nivel,
        disciplina,
        a: point(0, 0),
        b: point(comprimento, 0),
        cotaAMm: 2500,
        cotaBMm: 2500,
        bitolaMm,
      }).model;
    };
    trecho('ELETRICA', 25, 3000);
    trecho('ELETRICA', 25, 2000);
    trecho('ELETRICA', 32, 4000);
    trecho('AGUA_FRIA', 25, 5000);

    const { porBitola } = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais;
    expect(porBitola).toHaveLength(3);

    const eletrica25 = porBitola.find((l) => l.disciplina === 'ELETRICA' && l.bitolaMm === 25)!;
    expect(eletrica25.comprimentoM).toBeCloseTo(5, 6);
    expect(eletrica25.trechos).toBe(2);

    // ⚠️ Mesma bitola, disciplina diferente: NÃO somam. Eletroduto de 25 mm e
    // cano de água de 25 mm são compras diferentes, de fornecedores diferentes.
    const agua25 = porBitola.find((l) => l.disciplina === 'AGUA_FRIA')!;
    expect(agua25.comprimentoM).toBeCloseTo(5, 6);
  });

  it('e os terminais por tipo', () => {
    const { model, nivel } = comNivel();
    let m = model;
    for (const [tipo, x] of [
      ['Tomada baixa', 0],
      ['Tomada baixa', 500],
      ['Interruptor', 1000],
    ] as const) {
      m = applyCommand(m, {
        type: 'AddTerminal',
        levelId: nivel,
        disciplina: 'ELETRICA',
        tipo,
        at: point(x, 0),
        cotaMm: 300,
      }).model;
    }
    const { porTerminal, terminais } = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais;
    expect(terminais).toBe(3);
    expect(porTerminal.find((t) => t.tipo === 'Tomada baixa')!.quantidade).toBe(2);
    expect(porTerminal.find((t) => t.tipo === 'Interruptor')!.quantidade).toBe(1);
  });
});

describe('o que o kernel recusa', () => {
  it('⚠️ trecho de comprimento zero NOS TRÊS EIXOS, e não só em planta', () => {
    const { model, nivel } = comNivel();
    const base = {
      type: 'AddTrecho' as const,
      levelId: nivel,
      disciplina: 'ELETRICA' as const,
      a: point(1000, 1000),
      b: point(1000, 1000),
      bitolaMm: 25,
    };
    // Mesmo ponto E mesma cota: degenerado.
    expect(() => applyCommand(model, { ...base, cotaAMm: 500, cotaBMm: 500 })).toThrow(
      /comprimento zero/,
    );
    // Mesmo ponto, cotas DIFERENTES: é uma prumada, e tem de passar.
    expect(() =>
      applyCommand(model, { ...base, cotaAMm: 0, cotaBMm: 2800 }),
    ).not.toThrow();
  });

  it('bitola não positiva, disciplina inventada e terminal sem tipo', () => {
    const { model, nivel } = comNivel();
    const t = {
      type: 'AddTrecho' as const,
      levelId: nivel,
      disciplina: 'ELETRICA' as const,
      a: point(0, 0),
      b: point(1000, 0),
      cotaAMm: 0,
      cotaBMm: 0,
    };
    expect(() => applyCommand(model, { ...t, bitolaMm: 0 })).toThrow();
    expect(() =>
      applyCommand(model, {
        ...t,
        bitolaMm: 25,
        disciplina: 'GAS' as unknown as 'ELETRICA',
      }),
    ).toThrow(/Disciplina/);
    expect(() =>
      applyCommand(model, {
        type: 'AddTerminal',
        levelId: nivel,
        disciplina: 'ELETRICA',
        tipo: '   ',
        at: point(0, 0),
        cotaMm: 300,
      }),
    ).toThrow(/tipo/);
  });
});

describe('apagar o pavimento leva a rede junto', () => {
  it('as cotas são medidas DESTE piso — sem ele, elas não significam nada', () => {
    // ⚠️ Num pavimento de CIMA: o kernel recusa apagar o único que existe, e a
    // pergunta aqui é sobre a cascata, não sobre essa recusa.
    const { model } = comNivel();
    const comSuperior = applyCommand(model, {
      type: 'AddLevel',
      name: 'Superior',
      elevationMm: 2800,
      defaultHeightMm: 2800,
    }).model;
    const nivel = comSuperior.levels[1].id;
    let m = applyCommand(comSuperior, {
      type: 'AddTrecho',
      levelId: nivel,
      disciplina: 'AGUA_FRIA',
      a: point(0, 0),
      b: point(2000, 0),
      cotaAMm: 2400,
      cotaBMm: 2400,
      bitolaMm: 25,
    }).model;
    m = applyCommand(m, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'AGUA_FRIA',
      tipo: 'Ponto de água',
      at: point(2000, 0),
      cotaMm: 1100,
    }).model;
    expect(m.trechos).toHaveLength(1);
    expect(m.terminais).toHaveLength(1);

    const semNivel = applyCommand(m, { type: 'RemoveLevel', levelId: nivel }).model;
    expect(semNivel.trechos).toHaveLength(0);
    expect(semNivel.terminais).toHaveLength(0);
  });
});
