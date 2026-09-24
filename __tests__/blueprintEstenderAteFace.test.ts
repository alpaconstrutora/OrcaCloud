/**
 * ESTENDER A PAREDE ATÉ A FACE (24/09/2026, P2.58) · pedido do usuário.
 *
 * *"Crie uma funcionalidade de estender parede até encontrar a face de outra
 * parede ou um componente."*
 *
 * ⚠️ Já existia `extensoesAteEncontrar` (P2.42), e ela NÃO resolve isto: para no
 * **eixo** da parede da frente, porque o objetivo lá é fechar o contorno, e é no
 * eixo que o arranjo enxerga o encontro. Quem desenha quer a **face** — é o que
 * se vê e o que se constrói; parar no eixo faz a alvenaria nova invadir meia
 * espessura da existente. E quer alcançar o **pilar**, que aquela função nem
 * olha.
 *
 * O que se trava aqui:
 *   1. para na FACE, a meia espessura antes do eixo;
 *   2. alcança peça ESTRUTURAL (o caso de obra: parede morre no pilar);
 *   3. para na PRIMEIRA face do caminho, não na mais conveniente;
 *   4. sem nada à frente, devolve `null` — não estica para o vazio;
 *   5. carrega também o ponto no EIXO, porque é ele que fecha o ambiente.
 */
import { describe, expect, it } from 'vitest';
import {
  ALCANCE_PADRAO_MM,
  comandoDeEstender,
  extensaoAteFace,
  extensoesDaParede,
} from '../utils/blueprintEstenderAteFace';
import { applyBatch, applyCommand, emptyModel, point, pontasSoltasDoNivel, type Command } from '../utils/blueprintKernel';

function cena(
  paredes: [number, number, number, number, number?][],
  estruturas: { kind: 'PILAR'; x: number; y: number; larguraMm: number; profundidadeMm: number }[] = [],
) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(m, [
    ...paredes.map(([ax, ay, bx, by, esp]): Command => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: esp ?? 150, heightMm: 2800,
    })),
    ...estruturas.map((s): Command => ({
      type: 'AddStructural', levelId, kind: s.kind, pontos: [point(s.x, s.y)], larguraMm: s.larguraMm, profundidadeMm: s.profundidadeMm, alturaMm: 2800,
    })),
  ]).model;
  return { model: m, level: m.levels[0], ids: m.walls.map((w) => w.id), estruturaIds: (m.structures ?? []).map((s) => s.id) };
}

describe('estender até a face', () => {
  it('para na FACE da parede da frente — meia espessura antes do eixo', () => {
    // Horizontal indo para a direita, parando a 1 m de uma vertical de 200 mm
    // cujo eixo está em x = 5000. A face mais próxima está em x = 4900.
    const { model, level, ids } = cena([
      [0, 0, 4000, 0, 150],
      [5000, -3000, 5000, 3000, 200],
    ]);
    const e = extensaoAteFace(model, level, ids[0], 'b')!;
    expect(e.to).toEqual({ x: 4900, y: 0 });
    expect(e.distanciaMm).toBe(900);
    expect(e.tipo).toBe('PAREDE');
    expect(e.alvoId).toBe(ids[1]);
    // ⚠️ E o eixo vem junto: é ele que fecha o ambiente.
    expect(e.noEixo).toEqual({ x: 5000, y: 0 });

    const depois = applyBatch(model, [comandoDeEstender(e)]).model;
    expect(depois.walls.find((w) => w.id === ids[0])!.b).toMatchObject({ x: 4900, y: 0 });
  });

  it('⚠️ o caso de obra: a parede morre no PILAR', () => {
    // Pilar 40×40 centrado em (5000, 0): a face esquerda está em x = 4800.
    const { model, level, ids, estruturaIds } = cena(
      [[0, 0, 4000, 0, 150]],
      [{ kind: 'PILAR', x: 5000, y: 0, larguraMm: 400, profundidadeMm: 400 }],
    );
    const e = extensaoAteFace(model, level, ids[0], 'b')!;
    expect(e.tipo).toBe('ESTRUTURA');
    expect(e.alvoId).toBe(estruturaIds[0]);
    expect(e.to).toEqual({ x: 4800, y: 0 });
    // Estrutura não tem eixo no sentido do arranjo.
    expect(e.noEixo).toBeNull();
  });

  it('para na PRIMEIRA face do caminho, não na mais distante', () => {
    const { model, level, ids } = cena([
      [0, 0, 1000, 0, 150],
      [3000, -2000, 3000, 2000, 200], // face em 2900
      [6000, -2000, 6000, 2000, 200], // atrás dela
    ]);
    const e = extensaoAteFace(model, level, ids[0], 'b')!;
    expect(e.to.x).toBe(2900);
    expect(e.alvoId).toBe(ids[1]);
  });

  it('sem nada à frente, devolve null — não estica para o vazio', () => {
    const { model, level, ids } = cena([[0, 0, 1000, 0]]);
    expect(extensaoAteFace(model, level, ids[0], 'b')).toBeNull();
    // E fora do alcance também não. A face da vertical está em x = 4925 (eixo
    // 5000, espessura 150), ou seja, a 3.925 mm da ponta em x = 1000 — além dos
    // 3 m padrão. Com alcance de 4 m, ela aparece.
    const longe = cena([
      [0, 0, 1000, 0],
      [5000, -2000, 5000, 2000],
    ]);
    expect(extensaoAteFace(longe.model, longe.level, longe.ids[0], 'b')).toBeNull();
    const comAlcance = extensaoAteFace(longe.model, longe.level, longe.ids[0], 'b', 4000)!;
    expect(comAlcance.to).toEqual({ x: 4925, y: 0 });
    expect(comAlcance.distanciaMm).toBe(3925);
    expect(ALCANCE_PADRAO_MM).toBe(3000);
  });

  it('a ponta que aponta para o lado oposto não acha nada — a direção é a da parede', () => {
    const { model, level, ids } = cena([
      [0, 0, 1000, 0],
      [3000, -2000, 3000, 2000],
    ]);
    // A ponta 'a' aponta para x negativo, onde não há nada.
    expect(extensaoAteFace(model, level, ids[0], 'a')).toBeNull();
    // E `extensoesDaParede` devolve só a que tem alvo.
    const das = extensoesDaParede(model, level, ids[0]);
    expect(das).toHaveLength(1);
    expect(das[0].end).toBe('b');
  });

  it('⚠️ ir até o EIXO é o que fecha o ambiente; parar na face, não', () => {
    // Um "U" com o quarto lado faltando 900 mm.
    const { model, level, ids } = cena([
      [0, 0, 5000, 0, 200],
      [5000, 0, 5000, 4000, 200],
      [5000, 4000, 0, 4000, 200],
      [0, 4000, 0, 900, 200],
    ]);
    const e = extensaoAteFace(model, level, ids[3], 'b')!;
    const naFace = applyBatch(model, [comandoDeEstender(e)]).model;
    const noEixo = applyBatch(model, [comandoDeEstender(e, true)]).model;
    // Na face sobra a ponta solta; no eixo, não.
    expect(pontasSoltasDoNivel(naFace, naFace.levels[0]).length).toBeGreaterThan(
      pontasSoltasDoNivel(noEixo, noEixo.levels[0]).length,
    );
  });
});
