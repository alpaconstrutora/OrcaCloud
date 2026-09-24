/**
 * REVISÃO GUIADA DAS PONTAS SOLTAS (24/09/2026, P2.52).
 *
 * ⚠️ O que este módulo NÃO faz é o ponto: ele não decide nada. Depois dos
 * passes automáticos sobraram 58 pontas na planta real justamente porque
 * nenhuma regra pode decidi-las sem adivinhar — a ponta a 40 cm de outra é vão
 * de propósito ou parede faltando? Aqui cada ponta ganha a lista de saídas que
 * existem NAQUELE ponto, e quem desenha escolhe.
 *
 * O que se trava:
 *   1. a opção JUNTAR move ESTA ponta (a que está sendo olhada), não a outra;
 *   2. nada que colapsaria a parede é oferecido;
 *   3. o toco só pode ser excluído quando as DUAS pontas estão livres;
 *   4. as ignoradas somem da fila sem sair do desenho;
 *   5. ponta sem saída nenhuma aparece mesmo assim, com a lista vazia — sumir
 *      seria esconder trabalho que falta.
 */
import { describe, expect, it } from 'vitest';
import {
  ALCANCE_DE_JUNTAR_MM,
  chaveDaPonta,
  pontasParaRevisar,
  TOCO_MAXIMO_MM,
} from '../utils/blueprintRevisaoDePontas';
import { applyBatch, applyCommand, emptyModel, point, pontasSoltasDoNivel, type Command } from '../utils/blueprintKernel';

function cena(paredes: [number, number, number, number, number?][]) {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyBatch(
    m,
    paredes.map(([ax, ay, bx, by, esp]): Command => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: esp ?? 150, heightMm: 2800,
    })),
  ).model;
  return { model: m, level: m.levels[0], ids: m.walls.map((w) => w.id) };
}

describe('revisão guiada de pontas soltas', () => {
  it('oferece JUNTAR com a ponta próxima — movendo ESTA ponta, a que está em foco', () => {
    // Duas paredes que quase se encontram: 400 mm de distância entre as pontas.
    const { model, level, ids } = cena([
      [0, 0, 5000, 0],
      [5400, 0, 5400, 4000],
    ]);
    const pontas = pontasParaRevisar(model, level);
    const daPrimeira = pontas.find((x) => x.wallId === ids[0] && x.end === 'b')!;
    const juntar = daPrimeira.opcoes.find((o) => o.tipo === 'JUNTAR')!;
    expect(juntar.distanciaMm).toBe(400);
    // O comando mexe na parede DESTA ponta.
    expect(juntar.comandos).toEqual([{ type: 'MoveVertex', wallId: ids[0], end: 'b', to: { x: 5400, y: 0 } }]);

    const depois = applyBatch(model, juntar.comandos).model;
    expect(pontasSoltasDoNivel(depois, depois.levels[0]).length).toBeLessThan(
      pontasSoltasDoNivel(model, level).length,
    );
  });

  it('além do alcance, não oferece juntar', () => {
    const { model, level } = cena([
      [0, 0, 5000, 0],
      [5000 + ALCANCE_DE_JUNTAR_MM + 100, 0, 9000, 0],
    ]);
    const pontas = pontasParaRevisar(model, level);
    expect(pontas.every((x) => !x.opcoes.some((o) => o.tipo === 'JUNTAR'))).toBe(true);
  });

  it('oferece ESTICAR quando há parede à frente, com a distância no rótulo', () => {
    const { model, level, ids } = cena([
      [0, 0, 0, 5000],
      [3000, 5000, 400, 5000],
    ]);
    const ponta = pontasParaRevisar(model, level).find((x) => x.wallId === ids[1] && x.end === 'b')!;
    const esticar = ponta.opcoes.find((o) => o.tipo === 'ESTICAR')!;
    expect(esticar.distanciaMm).toBe(400);
    expect(esticar.rotulo).toContain('400 mm');
  });

  it('o TOCO só pode ser excluído com as duas pontas livres — e some do desenho', () => {
    const { model, level, ids } = cena([
      [0, 0, 200, 0], // toco solto dos dois lados
      [5000, 0, 9000, 0],
    ]);
    const ponta = pontasParaRevisar(model, level).find((x) => x.wallId === ids[0])!;
    const excluir = ponta.opcoes.find((o) => o.tipo === 'EXCLUIR_TOCO')!;
    expect(excluir.rotulo).toContain('200 mm');
    const depois = applyBatch(model, excluir.comandos).model;
    expect(depois.walls.some((w) => w.id === ids[0])).toBe(false);
    expect(TOCO_MAXIMO_MM).toBe(300);
  });

  it('parede curta com uma ponta PRESA não é toco descartável', () => {
    // O trecho de 200 mm fecha um canto: uma das pontas tem encontro.
    const { model, level, ids } = cena([
      [0, 0, 5000, 0],
      [5000, 0, 5200, 0],
    ]);
    const pontas = pontasParaRevisar(model, level).filter((x) => x.wallId === ids[1]);
    expect(pontas.every((x) => !x.opcoes.some((o) => o.tipo === 'EXCLUIR_TOCO'))).toBe(true);
  });

  it('as ignoradas somem da fila sem sair do desenho', () => {
    const { model, level, ids } = cena([
      [0, 0, 5000, 0],
      [8000, 0, 12000, 0],
    ]);
    const todas = pontasParaRevisar(model, level);
    expect(todas.length).toBeGreaterThan(1);
    const ignorada = chaveDaPonta(ids[0], 'a');
    const filtradas = pontasParaRevisar(model, level, new Set([ignorada]));
    expect(filtradas).toHaveLength(todas.length - 1);
    expect(filtradas.some((x) => chaveDaPonta(x.wallId, x.end) === ignorada)).toBe(false);
    // O desenho não mudou.
    expect(model.walls).toHaveLength(2);
  });

  it('ponta sem saída nenhuma continua na fila, com a lista vazia', () => {
    // Uma parede sozinha no meio do nada: nada perto, nada à frente, e é longa
    // demais para ser toco.
    const { model, level } = cena([[0, 0, 9000, 0]]);
    const pontas = pontasParaRevisar(model, level);
    expect(pontas.length).toBe(2);
    expect(pontas.every((x) => x.opcoes.length === 0)).toBe(true);
    // E o contexto que a tela mostra vem preenchido.
    expect(pontas[0].comprimentoMm).toBe(9000);
  });
});
