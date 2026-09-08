/**
 * Circuito e quadro no kernel (08/09/2026).
 *
 * ─── POR QUE ESTA FAMÍLIA EXISTE ────────────────────────────────────────────
 *
 * Para o módulo elétrico poder SAIR. Ele é protótipo de ponta a ponta — os
 * circuitos dele se chamam `Iluminação` e `dfdfdf`, com disjuntor e seção
 * `NULL` —, mas apagá-lo levaria junto o quadro de cargas, que o kernel não
 * tinha. Construí-lo aqui é o que transforma "apagar e perder" em "apagar e não
 * perder".
 *
 * ─── ⚠️ A LINHA QUE ESTES CASOS NÃO CRUZAM ──────────────────────────────────
 *
 * Nenhum deles afirma nada sobre DIMENSIONAMENTO. O disjuntor que sai é o que
 * alguém declarou, não o que a norma exigiria; a soma é soma. Somar é registro,
 * decidir é projeto — e projeto tem norma e ART atrás.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  canonicalPayload,
  payloadDoHash,
  point,
  quadroDeCargas,
  snapshotHash,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function base(): { model: BlueprintModel; nivel: string; quadro: string } {
  const m0 = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const nivel = m0.levels[0].id;
  const m1 = applyCommand(m0, {
    type: 'AddQuadro',
    levelId: nivel,
    nome: 'QDC Principal',
    at: point(200, 200),
  }).model;
  return { model: m1, nivel, quadro: m1.quadros[0].id };
}

const comCircuito = (m: BlueprintModel, quadro: string, nome: string, extras = {}) =>
  applyCommand(m, { type: 'AddCircuito', quadroId: quadro, nome, ...extras }).model;

const comPonto = (
  m: BlueprintModel,
  nivel: string,
  x: number,
  campos: { circuitoId?: string; potenciaW?: number } = {},
) =>
  applyCommand(m, {
    type: 'AddTerminal',
    levelId: nivel,
    disciplina: 'ELETRICA',
    tipo: 'Tomada baixa',
    at: point(x, 0),
    cotaMm: 300,
  }).model;

describe('o hash do acervo não se moveu', () => {
  it('⚠️ desenho sem quadro não ganha chave nenhuma no que é hasheado', () => {
    const { model } = base();
    const semNada = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    const hasheado = payloadDoHash(semNada);
    expect(hasheado).not.toContain('quadros');
    expect(hasheado).not.toContain('circuitos');
    // E com quadro, a chave aparece.
    expect(payloadDoHash(model)).toContain('quadros');
  });

  it('⚠️ TERMINAL SEM CIRCUITO não ganha as chaves novas', () => {
    // É a parte que protege o acervo: os desenhos que já têm ponto elétrico
    // foram feitos antes de circuito existir, e emitir `circuito: null` neles
    // mudaria a forma canônica — e o hash — de cada um.
    const { model, nivel } = base();
    const hasheado = payloadDoHash(comPonto(model, nivel, 500));
    expect(hasheado).not.toContain('"circuito"');
    expect(hasheado).not.toContain('potenciaW');
  });
});

describe('a ida e volta', () => {
  it('o circuito volta ligado ao quadro certo, e o ponto ao circuito certo', () => {
    const { model, nivel, quadro } = base();
    let m = comCircuito(model, quadro, 'C1', { tipo: 'ILUMINACAO', disjuntorA: 10, secaoMm2: 1.5 });
    m = comCircuito(m, quadro, 'C2', { tipo: 'TOMADA', disjuntorA: 20, secaoMm2: 2.5 });
    const c2 = m.circuitos.find((c) => c.nome === 'C2')!.id;
    m = comPonto(m, nivel, 500);
    m = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      circuitoId: c2,
      potenciaW: 600,
    }).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.quadros).toHaveLength(1);
    expect(volta.circuitos).toHaveLength(2);
    for (const c of volta.circuitos) expect(c.quadroId).toBe(volta.quadros[0].id);

    const voltaC2 = volta.circuitos.find((c) => c.nome === 'C2')!;
    expect(voltaC2.disjuntorA).toBe(20);
    expect(voltaC2.secaoMm2).toBe(2.5);
    // ⚠️ O ponto tem de voltar no MESMO circuito. A referência vai por ÍNDICE
    // na ordem canônica, e um índice trocado ligaria a tomada ao circuito de
    // iluminação sem erro nenhum — a soma sairia no lugar errado.
    expect(volta.terminais[0].circuitoId).toBe(voltaC2.id);
    expect(volta.terminais[0].potenciaW).toBe(600);
  });

  it('o mesmo desenho com uids diferentes dá o MESMO hash', () => {
    const desenhar = () => {
      const { model, quadro } = base();
      return comCircuito(model, quadro, 'C1', { disjuntorA: 10 });
    };
    const a = desenhar();
    const b = desenhar();
    expect(a.circuitos[0].uid).not.toBe(b.circuitos[0].uid);
    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });
});

describe('o quadro de cargas', () => {
  it('soma as potências declaradas por circuito, e conta os pontos', () => {
    const { model, nivel, quadro } = base();
    let m = comCircuito(model, quadro, 'C1');
    const c1 = m.circuitos[0].id;
    for (const [x, w] of [
      [500, 100],
      [1000, 100],
      [1500, 60],
    ] as const) {
      m = comPonto(m, nivel, x);
      m = applyCommand(m, {
        type: 'SetTerminalProps',
        terminalId: m.terminais[m.terminais.length - 1].id,
        circuitoId: c1,
        potenciaW: w,
      }).model;
    }

    const q = quadroDeCargas(m);
    expect(q.quadros).toHaveLength(1);
    expect(q.quadros[0].circuitos[0].pontos).toBe(3);
    expect(q.quadros[0].circuitos[0].potenciaW).toBe(260);
    expect(q.quadros[0].potenciaW).toBe(260);
  });

  it('⚠️ ponto SEM POTÊNCIA é contado à parte — a soma sozinha mentiria', () => {
    // "160 W em 3 pontos" esconde que um deles não tem potência nenhuma, e a
    // soma pareceria completa. Os dois números juntos é que são honestos.
    const { model, nivel, quadro } = base();
    let m = comCircuito(model, quadro, 'C1');
    const c1 = m.circuitos[0].id;
    for (const [x, w] of [
      [500, 100],
      [1000, 60],
      [1500, null],
    ] as const) {
      m = comPonto(m, nivel, x);
      m = applyCommand(m, {
        type: 'SetTerminalProps',
        terminalId: m.terminais[m.terminais.length - 1].id,
        circuitoId: c1,
        ...(w === null ? {} : { potenciaW: w }),
      }).model;
    }
    const c = quadroDeCargas(m).quadros[0].circuitos[0];
    expect(c.pontos).toBe(3);
    expect(c.potenciaW).toBe(160);
    expect(c.pontosSemPotencia).toBe(1);
  });

  it('⚠️ ponto FORA DE CIRCUITO aparece, e não some', () => {
    // É pendência de projeto: alguém desenhou a tomada e não disse quem a
    // alimenta. Omiti-lo faria o quadro de cargas parecer completo.
    const { model, nivel } = base();
    const m = comPonto(model, nivel, 500);
    expect(quadroDeCargas(m).pontosSemCircuito).toBe(1);
  });

  it('ponto de OUTRA disciplina não entra no quadro de cargas', () => {
    const { model, nivel } = base();
    const m = applyCommand(model, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'AGUA_FRIA',
      tipo: 'Ponto de água',
      at: point(500, 0),
      cotaMm: 1100,
    }).model;
    expect(quadroDeCargas(m).pontosSemCircuito).toBe(0);
  });

  it('o disjuntor e a seção saem como foram DECLARADOS — nada é sugerido', () => {
    const { model, quadro } = base();
    const m = comCircuito(model, quadro, 'C1', { disjuntorA: 10, secaoMm2: 1.5, tensaoV: 127 });
    const c = quadroDeCargas(m).quadros[0].circuitos[0];
    expect(c.disjuntorA).toBe(10);
    expect(c.secaoMm2).toBe(1.5);
    expect(c.tensaoV).toBe(127);
    // E sem declaração, ficam nulos — nunca um valor "recomendado".
    const semNada = comCircuito(model, quadro, 'C2');
    const c2 = quadroDeCargas(semNada).quadros[0].circuitos[0];
    expect(c2.disjuntorA).toBeNull();
    expect(c2.secaoMm2).toBeNull();
  });
});

describe('o que o kernel recusa', () => {
  it('circuito ÓRFÃO, quadro sem nome e potência negativa', () => {
    const { model, nivel, quadro } = base();
    expect(() =>
      applyCommand(model, { type: 'AddCircuito', quadroId: 'qdr_9999', nome: 'C1' }),
    ).toThrow(/Quadro/);
    expect(() =>
      applyCommand(model, { type: 'AddQuadro', levelId: nivel, nome: '  ', at: point(0, 0) }),
    ).toThrow(/nome/);
    const m = comPonto(model, nivel, 500);
    expect(() =>
      applyCommand(m, {
        type: 'SetTerminalProps',
        terminalId: m.terminais[0].id,
        potenciaW: -10,
      }),
    ).toThrow(/Pot/);
    void quadro;
  });

  it('⚠️ ponto apontando para circuito INEXISTENTE', () => {
    // Um ponto alimentado por nada não some da tela: ele some do QUADRO DE
    // CARGAS, e a soma sai menor sem ninguém saber por quê.
    const { model, nivel } = base();
    const m = comPonto(model, nivel, 500);
    expect(() =>
      applyCommand(m, {
        type: 'SetTerminalProps',
        terminalId: m.terminais[0].id,
        circuitoId: 'cir_9999',
      }),
    ).toThrow(/circuito inexistente/);
  });
});

describe('apagar o pavimento', () => {
  it('⚠️ leva o quadro, os circuitos DELE, e desliga os pontos que sobram', () => {
    // O circuito não tem pavimento, então ele não sai pela regra de nível — sai
    // porque o quadro dele saiu. E um ponto de OUTRO pavimento que citasse esse
    // circuito ficaria apontando para o vazio.
    const m0 = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    const terreo = m0.levels[0].id;
    let m = applyCommand(m0, {
      type: 'AddLevel',
      name: 'Superior',
      elevationMm: 2800,
      defaultHeightMm: 2800,
    }).model;
    const superior = m.levels[1].id;

    m = applyCommand(m, {
      type: 'AddQuadro',
      levelId: superior,
      nome: 'QDC',
      at: point(100, 100),
    }).model;
    m = comCircuito(m, m.quadros[0].id, 'C1');
    const c1 = m.circuitos[0].id;
    // O ponto fica no TÉRREO, alimentado por um circuito do quadro de cima.
    m = comPonto(m, terreo, 500);
    m = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      circuitoId: c1,
    }).model;

    const semSuperior = applyCommand(m, { type: 'RemoveLevel', levelId: superior }).model;
    expect(semSuperior.quadros).toHaveLength(0);
    expect(semSuperior.circuitos).toHaveLength(0);
    // O ponto SOBREVIVE — ele é do térreo — mas desligado, e não apontando
    // para um circuito que já não existe.
    expect(semSuperior.terminais).toHaveLength(1);
    expect(semSuperior.terminais[0].circuitoId).toBeNull();
    expect(quadroDeCargas(semSuperior).pontosSemCircuito).toBe(1);
  });
});
