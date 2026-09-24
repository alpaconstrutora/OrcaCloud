/**
 * A ASSINATURA DA ESQUADRIA É AMBÍGUA (24/09/2026, P2.48).
 *
 * ⚠️ `assinaturaDaEsquadria` junta cinco campos com `|`, e os DOIS ÚLTIMOS são
 * texto livre digitado pelo usuário: o nome do tipo ("P1") e o código do item.
 * Dois campos livres adjacentes com um separador que pode aparecer dentro deles
 * é a definição de chave ambígua — e uma busca exaustiva sobre um alfabeto que
 * inclui `|` acha a colisão em segundos:
 *
 *     nome "A"  + item "|A"   →  door|800|2100|A||A
 *     nome "A|" + item "A"    →  door|800|2100|A||A
 *
 * Isso não é teoria de string: a assinatura AGRUPA o quadro de esquadrias, e o
 * quadro é o que vira linha de orçamento e `IfcDoorType`. Duas esquadrias
 * diferentes viram uma linha só, com a quantidade somada — silenciosamente.
 *
 * ⚠️ E havia um segundo uso, pior: `blueprintBudget` REABRIA a chave com
 * `e.assinatura.split('|')[3] !== ''` para decidir se o tipo foi declarado. Um
 * `|` no nome desloca os campos e a resposta sai errada. Chave de agrupamento
 * não é formato de dados: quem precisa do campo tem de lê-lo do objeto.
 *
 * ─── POR QUE ESCAPAR, E NÃO TROCAR O SEPARADOR ──────────────────────────────
 *
 * A assinatura vira o `id` da linha de orçamento
 * (`bp:<studyId>:esquadria:<assinatura>`), que é o de-para persistido. Trocar
 * `|` por outro caractere mudaria TODOS os ids de uma vez e desligaria os
 * de-para existentes. Escapando, a assinatura de qualquer dado sem `|` fica
 * idêntica byte a byte — e hoje nenhum código de item do banco tem `|` (24 de
 * 24 verificados) —, enquanto o caso que colidia passa a ser distinto.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  assinaturaDaEsquadria,
  computeQuantities,
  emptyModel,
  KERNEL_VERSION,
  point,
  POLITICA_PADRAO,
  type Command,
} from '../utils/blueprintKernel';

const base = { kind: 'door' as const, widthMm: 800, heightMm: 2100, embutida: false };

describe('assinatura da esquadria', () => {
  it('⚠️ o par que colidia — nome "A"/item "|A" e nome "A|"/item "A" — agora é distinto', () => {
    const a = assinaturaDaEsquadria({ ...base, esquadria: { nome: 'A', itemCode: '|A', descricao: '' } });
    const b = assinaturaDaEsquadria({ ...base, esquadria: { nome: 'A|', itemCode: 'A', descricao: '' } });
    expect(a).not.toBe(b);
  });

  it('a barra invertida também é escapada — senão ela mesma cria o par ambíguo seguinte', () => {
    const a = assinaturaDaEsquadria({ ...base, esquadria: { nome: 'A\\', itemCode: 'B', descricao: '' } });
    const b = assinaturaDaEsquadria({ ...base, esquadria: { nome: 'A', itemCode: '\\B', descricao: '' } });
    expect(a).not.toBe(b);
  });

  it('⚠️ COMPATIBILIDADE: sem `|` no dado, a assinatura é a mesma de antes, byte a byte', () => {
    // É o que preserva o id da linha de orçamento (`bp:...:esquadria:<assinatura>`).
    expect(assinaturaDaEsquadria({ ...base, esquadria: { nome: 'P1', itemCode: '87879', descricao: 'x' } })).toBe(
      'door|800|2100|P1|87879',
    );
    expect(assinaturaDaEsquadria({ ...base })).toBe('door|800|2100||');
    expect(assinaturaDaEsquadria({ ...base, kind: 'window', widthMm: 1200, heightMm: 1000 })).toBe(
      'window|1200|1000||',
    );
  });

  it('duas esquadrias que colidiam contam DUAS linhas no quadro, não uma somada', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
    ]).model;
    const wallId = m.walls[0].id;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 500, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 3000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    ] as Command[]).model;
    const [o1, o2] = m.openings;
    m = applyBatch(m, [
      { type: 'SetOpeningEsquadria', openingId: o1.id, esquadria: { nome: 'A', itemCode: '|A', descricao: '' } },
      { type: 'SetOpeningEsquadria', openingId: o2.id, esquadria: { nome: 'A|', itemCode: 'A', descricao: '' } },
    ] as Command[]).model;

    const quadro = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais.porEsquadria;
    // Antes da correção: UMA linha com quantidade 2.
    expect(quadro).toHaveLength(2);
    expect(quadro.every((e) => e.quantidade === 1)).toBe(true);
  });

  it('⚠️ "tem tipo declarado?" sai do OBJETO, não de um split da chave', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
    ]).model;
    const wallId = m.walls[0].id;
    m = applyBatch(m, [
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 500, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId, kind: 'door', offsetMm: 3000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    ] as Command[]).model;
    const [comTipo, semTipo] = m.openings;
    m = applyCommand(m, {
      type: 'SetOpeningEsquadria',
      openingId: comTipo.id,
      // Um nome com `|`: é exatamente o caso em que `split('|')[3]` errava.
      esquadria: { nome: 'P|1', itemCode: '87879', descricao: 'Porta' },
    }).model;

    const quadro = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION).totais.porEsquadria;
    const declaradas = quadro.filter((e) => e.declarada);
    expect(declaradas).toHaveLength(1);
    expect(declaradas[0].nome).toBe('P|1');
    // A que ninguém nomeou continua fora: nome derivado, `declarada` falso.
    expect(quadro.find((e) => e.nome.startsWith('Porta 90'))?.declarada).toBe(false);
    void semTipo;
  });
});
