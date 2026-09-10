/**
 * ILUMINAÇÃO pela NBR 5410, 9.5.2.1 — e o INTERRUPTOR (10/09/2026).
 *
 * *"implemente na ordem sugerida, 1. 2 e 3"* — o item 2: interruptor +
 * iluminação mínima, "que juntos fecham a prancha elétrica residencial".
 *
 * 9.5.2.1.1: pelo menos um ponto de luz fixo no TETO, comandado por
 * INTERRUPTOR, em cada cômodo. 9.5.2.1.2: 100 VA até 6 m², +60 VA a cada 4 m²
 * inteiros acima disso.
 *
 * ─── ⚠️ OS CASOS QUE UMA CONTA INGÊNUA ERRA ─────────────────────────────────
 *
 * · 9,9 m² → 100 VA (só 3,9 m² acima de 6: nenhum bloco INTEIRO de 4);
 * · 10 m² → 160 VA; 14 m² → 220 VA;
 * · arandela não é luz de TETO — o cômodo com só arandela ainda falta;
 * · luz sem potência: NÃO se afirma déficit de carga (a soma está incompleta);
 * · o cômodo "a classificar" também é conferido — a regra vale para todos.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type TipoDePontoEletrico,
} from '../utils/blueprintKernel';
import {
  comandosDeIluminacao,
  conferirIluminacao,
  minimoDeIluminacaoVA,
  pontoJuntoAPorta,
  proximaLetraDeComando,
} from '../utils/blueprintDistribuicao';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';

/** Sala 6 × 4 (eixo), paredes de 150, com uma porta na parede de baixo. */
function sala(comPorta = true): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)])
    .model;
  if (comPorta) {
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: m.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    }).model;
  }
  return m;
}

const ponto = (
  m: BlueprintModel,
  x: number,
  y: number,
  tipoEletrico: TipoDePontoEletrico,
  potenciaW: number | null = null,
  comando: string | null = null,
) =>
  applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: tipoEletrico,
    at: point(x, y),
    cotaMm: 2800,
    tipoEletrico,
    comando,
    potenciaW,
  }).model;

const AREA = 5.85 * 3.85; // 22,52 m² úteis

describe('9.5.2.1.2 · a carga mínima', () => {
  it('100 VA até 6 m²; +60 VA por bloco INTEIRO de 4 m²', () => {
    expect(minimoDeIluminacaoVA(4)).toBe(100);
    expect(minimoDeIluminacaoVA(6)).toBe(100);
    expect(minimoDeIluminacaoVA(9.9)).toBe(100); // 3,9 m² acima: nenhum bloco inteiro
    expect(minimoDeIluminacaoVA(10)).toBe(160);
    expect(minimoDeIluminacaoVA(14)).toBe(220);
    expect(minimoDeIluminacaoVA(22.52)).toBe(340); // 16,52 ÷ 4 = 4 blocos
  });
});

describe('conferir a iluminação de um cômodo', () => {
  it('cômodo vazio: falta luz de teto E interruptor; nada declarado', () => {
    const m = sala();
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    expect(c).toMatchObject({ faltaLuzDeTeto: true, faltaInterruptor: true, declaradoVA: 0, minimoVA: 340 });
    // Sem luz nenhuma não há déficit de carga a acusar — a falta é a da luz.
    expect(c.deficitVA).toBe(340);
  });

  it('⚠️ ARANDELA não é luz de teto: o cômodo continua faltando luz de teto', () => {
    const m = ponto(sala(), 3000, 75, 'ILUMINACAO_PAREDE', 100);
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    expect(c.luzes).toBe(1);
    expect(c.faltaLuzDeTeto).toBe(true);
  });

  it('luz de teto de 340 VA + interruptor: atende', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    m = ponto(m, 2000, 75, 'INTERRUPTOR', null, 'a');
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    expect(c).toMatchObject({ faltaLuzDeTeto: false, faltaInterruptor: false, deficitVA: 0 });
  });

  it('luz de 100 VA num cômodo que pede 340: déficit de 240', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 100);
    m = ponto(m, 2000, 75, 'INTERRUPTOR');
    expect(conferirIluminacao(m.spaces[0], m.terminais, AREA).deficitVA).toBe(240);
  });

  it('⚠️ luz SEM potência: déficit zero e `semPotencia` = 1 — não se afirma o que não se somou', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', null);
    m = ponto(m, 2000, 75, 'INTERRUPTOR');
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    expect(c.semPotencia).toBe(1);
    expect(c.deficitVA).toBe(0);
  });
});

describe('completar a iluminação', () => {
  it('cria luz de teto no MEIO do cômodo, na cota do pé-direito, com o mínimo declarado e a mesma letra do interruptor', () => {
    const m = sala();
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais);
    expect(cmds).toHaveLength(2);
    const [luz, inter] = cmds as Extract<Command, { type: 'AddTerminal' }>[];
    expect(luz).toMatchObject({ tipoEletrico: 'ILUMINACAO_TETO', cotaMm: 2800, potenciaW: 340, comando: 'a', sugerida: true });
    expect(luz.rotulo).toMatch(/mínimo da norma/);
    // Dentro do cômodo, perto do centro.
    expect(luz.at.x).toBeGreaterThan(2000);
    expect(luz.at.x).toBeLessThan(4000);
    expect(inter).toMatchObject({ tipoEletrico: 'INTERRUPTOR', cotaMm: 1100, comando: 'a', sugerida: true });
  });

  it('⚠️ o interruptor nasce JUNTO À PORTA — 200 mm depois da ombreira, na face', () => {
    const m = sala();
    const at = pontoJuntoAPorta(m.spaces[0], m.walls, m.openings)!;
    // Porta de x = 1000 a 1800 na parede de baixo; face interna em y = 75.
    expect(at.y).toBe(75);
    expect(at.x).toBe(2000);
  });

  it('sem porta, o interruptor vem com o rótulo "Posicione junto à porta"', () => {
    const m = sala(false);
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais);
    const inter = cmds.find((x) => (x as { tipoEletrico?: string }).tipoEletrico === 'INTERRUPTOR') as { rotulo?: string | null };
    expect(inter.rotulo).toMatch(/junto à porta/);
  });

  it('a letra de comando é a próxima LIVRE no cômodo', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 100, 'a');
    m = ponto(m, 2000, 75, 'INTERRUPTOR', null, 'a');
    expect(proximaLetraDeComando(m.spaces[0], m.terminais)).toBe('b');
  });

  it('só o que falta: com luz e sem interruptor, nasce só o interruptor', () => {
    const m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'AddTerminal', tipoEletrico: 'INTERRUPTOR' });
  });

  it('depois de completar, a conferência ATENDE e os pontos são sugeridos', () => {
    const m = sala();
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const depois = applyBatch(m, comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais)).model;
    const c2 = conferirIluminacao(depois.spaces[0], depois.terminais, AREA);
    expect(c2).toMatchObject({ faltaLuzDeTeto: false, faltaInterruptor: false, deficitVA: 0 });
    expect(depois.terminais.every((t) => t.sugerida)).toBe(true);
  });
});

describe('na conferência NBR 5410', () => {
  const regra = (m: BlueprintModel) => conferirNbr5410(m).regras.find((r) => r.codigo === '9.5.2.1')!;

  it('⚠️ o cômodo "a classificar" também é conferido — a regra vale para todo cômodo', () => {
    const r = regra(sala());
    expect(r.avaliados).toBe(1);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0].mensagem).toMatch(/sem ponto de luz no teto · sem interruptor/);
  });

  it('carga abaixo do mínimo: FALTA com os números; luz sem potência: não avaliado, dito', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 100);
    m = ponto(m, 2000, 75, 'INTERRUPTOR');
    expect(regra(m).achados[0].mensagem).toMatch(/100 VA declarados, mínimo 340 VA/);

    let s = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', null);
    s = ponto(s, 2000, 75, 'INTERRUPTOR');
    const r = regra(s);
    expect(r.achados).toEqual([]);
    expect(r.naoAvaliado.join(' ')).toMatch(/1 ponto de luz sem potência/);
  });

  it('atendida: cala', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    m = ponto(m, 2000, 75, 'INTERRUPTOR', null, 'a');
    expect(regra(m).achados).toEqual([]);
  });
});

// ─── O PAREAMENTO DAS LETRAS e a variante do interruptor ("como corrigir?", 10/09/2026) ───

import { conferirComandos } from '../utils/blueprintDistribuicao';

const interruptor = (
  m: BlueprintModel,
  x: number,
  y: number,
  comando: string,
  variante: 'UMA_SECAO' | 'DUAS_SECOES' | 'TRES_SECOES' | 'PARALELO' | 'INTERMEDIARIO' = 'UMA_SECAO',
) =>
  applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: 'Interruptor',
    at: point(x, y),
    cotaMm: 1100,
    tipoEletrico: 'INTERRUPTOR',
    comando,
    interruptor: variante,
  }).model;

describe('comandos · o pareamento por letra', () => {
  it('⚠️ luz "a" com interruptor "b": falta o "a", e o "b" não comanda nada (aviso)', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    m = interruptor(m, 2000, 75, 'b');
    const c = conferirComandos(m.spaces[0], m.terminais);
    expect(c.luzesSemInterruptor.map((x) => x.letra)).toEqual(['a']);
    expect(c.interruptoresSemLuz.map((x) => x.letra)).toEqual(['b']);
    const r = conferirNbr5410(m).regras.find((x) => x.codigo === '9.5.2.1')!;
    expect(r.achados.map((a) => a.nivel)).toEqual(['FALTA', 'AVISO']);
    expect(r.achados[0].mensagem).toMatch(/luz "a" sem interruptor/);
  });

  it('o de DUAS seções "ab" cobre as luzes a e b', () => {
    let m = ponto(sala(), 2000, 2000, 'ILUMINACAO_TETO', 200, 'a');
    m = ponto(m, 4000, 2000, 'ILUMINACAO_TETO', 200, 'b');
    m = interruptor(m, 2000, 75, 'ab', 'DUAS_SECOES');
    const c = conferirComandos(m.spaces[0], m.terminais);
    expect(c.luzesSemInterruptor).toEqual([]);
    expect(c.interruptoresSemLuz).toEqual([]);
  });

  it('⚠️ PARALELO sozinho é falta — three way só existe aos pares', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    m = interruptor(m, 2000, 75, 'a', 'PARALELO');
    expect(conferirComandos(m.spaces[0], m.terminais).paralelosSemPar.map((x) => x.letra)).toEqual(['a']);
    const r = conferirNbr5410(m).regras.find((x) => x.codigo === '9.5.2.1')!;
    expect(r.achados.some((a) => /paralelo "a" sem o par/.test(a.mensagem))).toBe(true);

    const comPar = interruptor(m, 4000, 75, 'a', 'PARALELO');
    expect(conferirComandos(comPar.spaces[0], comPar.terminais).paralelosSemPar).toEqual([]);
  });

  it('INTERMEDIÁRIO precisa dos dois paralelos da mesma letra', () => {
    let m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, 'a');
    m = interruptor(m, 2000, 75, 'a', 'INTERMEDIARIO');
    m = interruptor(m, 3000, 75, 'a', 'PARALELO');
    expect(conferirComandos(m.spaces[0], m.terminais).intermediariosSemParalelos).toHaveLength(1);
    const ok = interruptor(m, 4000, 75, 'a', 'PARALELO');
    expect(conferirComandos(ok.spaces[0], ok.terminais).intermediariosSemParalelos).toEqual([]);
  });
});

describe('completar · a variante sai das letras', () => {
  it('⚠️ duas luzes "a" e "b" sem interruptor → UM interruptor de DUAS seções "ab"', () => {
    let m = ponto(sala(), 2000, 2000, 'ILUMINACAO_TETO', 200, 'a');
    m = ponto(m, 4000, 2000, 'ILUMINACAO_TETO', 200, 'b');
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'AddTerminal', tipoEletrico: 'INTERRUPTOR', comando: 'ab', interruptor: 'DUAS_SECOES' });
  });

  it('três letras → três seções; quatro → uma de três e uma de uma', () => {
    let m = sala();
    for (const [i, letra] of ['a', 'b', 'c', 'd'].entries()) m = ponto(m, 1000 + i * 1200, 2000, 'ILUMINACAO_TETO', 100, letra);
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais) as Extract<Command, { type: 'AddTerminal' }>[];
    expect(cmds.map((x) => [x.comando, x.interruptor])).toEqual([
      ['abc', 'TRES_SECOES'],
      ['d', 'UMA_SECAO'],
    ]);
  });

  it('⚠️ luz de teto SEM letra e sem interruptor: a luz ganha a letra e o interruptor nasce com ela', () => {
    const m = ponto(sala(), 3000, 2000, 'ILUMINACAO_TETO', 340, null);
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais);
    expect(cmds[0]).toMatchObject({ type: 'SetTerminalProps', terminalId: m.terminais[0].id, comando: 'a' });
    expect(cmds[1]).toMatchObject({ type: 'AddTerminal', tipoEletrico: 'INTERRUPTOR', comando: 'a', interruptor: 'UMA_SECAO' });
    const depois = applyBatch(m, cmds).model;
    expect(conferirComandos(depois.spaces[0], depois.terminais).luzesSemInterruptor).toEqual([]);
  });

  it('nunca cria paralelo nem intermediário', () => {
    let m = sala();
    for (const [i, letra] of ['a', 'b'].entries()) m = ponto(m, 2000 + i * 2000, 2000, 'ILUMINACAO_TETO', 200, letra);
    const c = conferirIluminacao(m.spaces[0], m.terminais, AREA);
    const cmds = comandosDeIluminacao(m.levels[0].id, m.spaces[0], m.walls, m.openings, 2800, c, m.terminais) as Extract<Command, { type: 'AddTerminal' }>[];
    for (const cmd of cmds) expect(['PARALELO', 'INTERMEDIARIO']).not.toContain(cmd.interruptor);
  });
});
