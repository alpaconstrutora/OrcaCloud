/**
 * O `id` da tarefa do cronograma É o `id` da linha de orçamento.
 *
 * ─── POR QUE ISTO MERECE UM ARQUIVO SÓ ──────────────────────────────────────
 *
 * Não é uma propriedade interna do Planejamento: é o ELO DO MEIO de uma cadeia
 * que a Planta Inteligente usa para ligar uma parede desenhada à atividade que
 * a executa.
 *
 *   elemento da planta (uid)
 *     → linha de orçamento (`bp:<estudo>:<mapeamento>:<uid>`)
 *       → tarefa do cronograma (o mesmo id)
 *
 * É por ela que o 4D existe SEM tabela de vínculo — o vínculo é derivado, e não
 * algo que alguém preencheu. Medido em 06/09/2026, ao planejar a Etapa 3.
 *
 * Trocar `id: item.id` por um id gerado romperia a ponte em SILÊNCIO: nenhuma
 * tela dá erro, nada fica vermelho, e o elemento simplesmente deixa de casar com
 * a tarefa. Este arquivo existe para que esse dia produza um teste vermelho.
 */
import { describe, expect, it } from 'vitest';
import { ensureFullScheduleList } from '../utils/schedulingEngine';
import type { BudgetEntry, ItemScheduleDetails } from '../types';

/** Uma linha como a Planta gera: o id carrega o uid do elemento. */
const UID = '9f1fda2c-0991-4b5f-913f-4c9c399e3b64';
const linhaDaPlanta = (over: Partial<BudgetEntry> = {}): BudgetEntry =>
  ({
    id: `bp:std_1:map_1:${UID}`,
    sinapiItem: { code: '87251', description: 'Alvenaria', unit: 'M2', price: 50 },
    quantity: 10,
    phase: 'Estrutura',
    subPhase: 'Alvenaria',
    ...over,
  }) as BudgetEntry;

describe('cronograma · o id da tarefa é o id da linha', () => {
  it('A PONTE DA PLANTA: o uid do elemento sobrevive dentro do id da tarefa', () => {
    const [tarefa] = ensureFullScheduleList([], [linhaDaPlanta()]);
    expect(tarefa.id).toBe(`bp:std_1:map_1:${UID}`);
    // O que a Planta faz para achar a tarefa de uma parede: casar pelo uid.
    expect(tarefa.id.endsWith(UID)).toBe(true);
  });

  it('id de linha comum também é preservado — não é regra só do prefixo bp:', () => {
    const [tarefa] = ensureFullScheduleList([], [linhaDaPlanta({ id: 'digitada-a-mao' })]);
    expect(tarefa.id).toBe('digitada-a-mao');
  });

  it('não duplica tarefa para uma linha que já tem a sua', () => {
    const existente = { id: `bp:std_1:map_1:${UID}`, phase: 'Estrutura' } as ItemScheduleDetails;
    const lista = ensureFullScheduleList([existente], [linhaDaPlanta()]);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toBe(existente);
  });

  it('propaga fase e subfase da linha ao criar a tarefa', () => {
    const [tarefa] = ensureFullScheduleList([], [linhaDaPlanta()]);
    expect(tarefa.phase).toBe('Estrutura');
    expect(tarefa.subPhase).toBe('Alvenaria');
  });

  it('faz backfill de fase em tarefa antiga, casando pelo MESMO id', () => {
    // O backfill só funciona porque os dois lados usam o id da linha. Se a
    // tarefa tivesse id próprio, ela nunca encontraria a linha dela.
    const antiga = { id: `bp:std_1:map_1:${UID}` } as ItemScheduleDetails;
    const [tarefa] = ensureFullScheduleList([antiga], [linhaDaPlanta()]);
    expect(tarefa.phase).toBe('Estrutura');
  });

  it('duas linhas de elementos diferentes viram duas tarefas distintas', () => {
    const outro = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
    const lista = ensureFullScheduleList([], [
      linhaDaPlanta(),
      linhaDaPlanta({ id: `bp:std_1:map_1:${outro}` }),
    ]);
    expect(lista.map((t) => t.id)).toEqual([
      `bp:std_1:map_1:${UID}`,
      `bp:std_1:map_1:${outro}`,
    ]);
  });
});
