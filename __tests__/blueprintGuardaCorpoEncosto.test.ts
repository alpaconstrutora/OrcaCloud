/**
 * O GUARDA-CORPO QUE NÃO ENCOSTA NA PAREDE (23/09/2026, P2.45).
 *
 * ⚠️ O caso do primeiro teste é REAL, medido no banco: o guarda-corpo que o
 * usuário inseriu na Planta 14/09 (branch principal, salvo em 24/09 01:36) vai
 * de (3480, 975) a (3480, 6470). A ponta de baixo caiu a 0 mm do eixo de uma
 * parede; a de cima parou a 163 mm da ponta de uma parede que está no MESMO
 * eixo x = 3480 — 88 mm de folga até a face. No 3D isso é um buraco de 16 cm no
 * peitoril, e nada no app avisava.
 *
 * O ímã do traçado não é a resposta: ele existe, mas alcança `SNAP_PX / escala`
 * — 12 px em milímetro, que no zoom de trabalho não chegam a 163 mm.
 */
import { describe, expect, it } from 'vitest';
import {
  alvosDeEncosto,
  encostoDaPonta,
  guardaCorposSoltos,
  pontosCorrigidos,
  MAX_ENCOSTO_MM,
  type AlvoDeEncosto,
} from '../utils/blueprintGuardaCorpoEncosto';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';

/** Um nível com as paredes dadas e, opcionalmente, guarda-corpos. */
function cena(
  paredes: [number, number, number, number, number?][],
  guardaCorpos: [number, number][][] = [],
) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(m, [
    ...paredes.map(([ax, ay, bx, by, esp]): Command => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: esp ?? 150, heightMm: 2800,
    })),
    ...guardaCorpos.map((pontos): Command => ({
      type: 'AddGuardaCorpo', levelId, tipo: 'GUARDA_CORPO', pontos: pontos.map(([x, y]) => point(x, y)),
    })),
  ]).model;
  return { model: m, levelId, paredeIds: m.walls.map((w) => w.id), grcIds: (m.guardaCorpos ?? []).map((g) => g.id) };
}

/** Alvo avulso, para os casos que não precisam de modelo. */
function alvo(id: string, ax: number, ay: number, bx: number, by: number, esp = 150): AlvoDeEncosto {
  return { id, a: { x: ax, y: ay }, b: { x: bx, y: by }, espessuraMm: esp };
}

describe('encostoDaPonta · para onde a ponta deveria ir', () => {
  it('O CASO REAL: a ponta a 163 mm da parede COLINEAR encosta na ponta dela; a que já está no eixo não mexe', () => {
    // As três paredes vizinhas da ponta, com as coordenadas do banco.
    const { model, levelId, paredeIds, grcIds } = cena(
      [
        [2000, 975, 5000, 975, 150],   // a parede onde a ponta de baixo caiu (dist 0 ao eixo)
        [3480, 6633, 3480, 8977, 150], // a COLINEAR, continuação do guarda-corpo
        [3480, 6633, 4718, 6633, 150], // a perpendicular que sai do mesmo canto
      ],
      [[[3480, 975], [3480, 6470]]],
    );

    const soltas = guardaCorposSoltos(model, levelId);
    // Uma ponta só: a de baixo está DENTRO do corpo da parede e não conta.
    expect(soltas).toHaveLength(1);
    expect(soltas[0]).toMatchObject({
      guardaCorpoId: grcIds[0],
      index: 1,
      de: { x: 3480, y: 6470 },
      to: { x: 3480, y: 6633 },
      folgaMm: 163,
      tipo: 'PONTA',
    });
    expect([paredeIds[1], paredeIds[2]]).toContain(soltas[0].alvoId);

    // Aplicar fecha: a polilinha corrigida não deixa mais ponta solta.
    const pontos = pontosCorrigidos(model.guardaCorpos![0].pontos, soltas);
    expect(pontos).toEqual([{ x: 3480, y: 975 }, { x: 3480, y: 6633 }]);
    const corrigido = applyCommand(model, { type: 'SetGuardaCorpoProps', guardaCorpoId: grcIds[0], pontos }).model;
    expect(guardaCorposSoltos(corrigido, levelId)).toEqual([]);
  });

  it('contra uma parede ATRAVESSADA, a ponta vai para o EIXO — é ali que o painel entra sem fresta', () => {
    // Guarda-corpo horizontal terminando a 88 mm da face (163 do eixo) de uma vertical.
    const encosto = encostoDaPonta({ x: 1000, y: 0 }, { x: 1, y: 0 }, [alvo('w1', 1163, -2000, 1163, 2000)]);
    expect(encosto).toMatchObject({ to: { x: 1163, y: 0 }, folgaMm: 163, tipo: 'EIXO', alvoId: 'w1' });
  });

  it('⚠️ o guarda-corpo que corre RENTE a uma parede paralela NÃO é torcido de lado', () => {
    // Paralela a 200 mm, terminando no mesmo x da ponta: grudar no canto dela
    // puxaria o traço 200 mm para o lado. O desvio lateral barra isso.
    expect(encostoDaPonta({ x: 3000, y: 0 }, { x: 1, y: 0 }, [alvo('w1', 0, 200, 3000, 200)])).toBeNull();
    // Já a paralela COLINEAR (mesma reta, à frente) é o encontro legítimo.
    expect(encostoDaPonta({ x: 3000, y: 0 }, { x: 1, y: 0 }, [alvo('w1', 3200, 0, 6000, 0)])).toMatchObject({
      to: { x: 3200, y: 0 }, folgaMm: 200, tipo: 'PONTA',
    });
  });

  it('ponta já dentro do corpo não tem o que encostar, e acima de 300 mm não é folga — é vão', () => {
    // Dentro da faixa desenhada da parede (75 mm de meia espessura).
    expect(encostoDaPonta({ x: 1000, y: 40 }, { x: 1, y: 0 }, [alvo('w1', 0, 0, 3000, 0)])).toBeNull();
    // 301 mm à frente: fora da régua.
    expect(encostoDaPonta({ x: 1000, y: 0 }, { x: 1, y: 0 }, [alvo('w1', 1301, -2000, 1301, 2000)])).toBeNull();
    expect(encostoDaPonta({ x: 1000, y: 0 }, { x: 1, y: 0 }, [alvo('w1', 1301, -2000, 1301, 2000)], 400)).toMatchObject({
      folgaMm: 301,
    });
    expect(MAX_ENCOSTO_MM).toBe(300);
  });

  it('o segundo trecho da varanda em L encosta no PRIMEIRO guarda-corpo — e nunca em si mesmo', () => {
    const { model, levelId, grcIds } = cena(
      [[0, -3000, 0, 3000, 150]],
      [
        [[300, 0], [3000, 0]],     // trecho 1, horizontal
        [[3000, 120], [3000, 2500]], // trecho 2, sobe 120 mm ACIMA da ponta do trecho 1
      ],
    );
    const soltas = guardaCorposSoltos(model, levelId);
    const doSegundo = soltas.filter((s) => s.guardaCorpoId === grcIds[1]);
    expect(doSegundo).toHaveLength(1);
    expect(doSegundo[0]).toMatchObject({ index: 0, to: { x: 3000, y: 0 }, folgaMm: 120, alvoId: grcIds[0] });

    // O primeiro tem a ponta esquerda a 300 mm do eixo da parede vertical: encosta nela, não em si mesmo.
    const doPrimeiro = soltas.filter((s) => s.guardaCorpoId === grcIds[0]);
    expect(doPrimeiro.every((s) => s.alvoId !== grcIds[0])).toBe(true);

    // `alvosDeEncosto` com `exceto` não devolve nenhum trecho da própria peça.
    expect(alvosDeEncosto(model, levelId, grcIds[0]).some((a) => a.id === grcIds[0])).toBe(false);
    expect(alvosDeEncosto(model, levelId).some((a) => a.id === grcIds[0])).toBe(true);
  });

  it('vértice do MEIO da polilinha não é ponta: dobra da própria peça não pede encontro', () => {
    // O vértice do meio está a 100 mm do eixo de uma parede — e mesmo assim não entra na lista.
    const { model, levelId } = cena(
      [[0, 1100, 4000, 1100, 150]],
      [[[0, 0], [2000, 1000], [4000, 0]]],
    );
    const soltas = guardaCorposSoltos(model, levelId);
    expect(soltas.every((s) => s.index !== 1)).toBe(true);
  });
});
