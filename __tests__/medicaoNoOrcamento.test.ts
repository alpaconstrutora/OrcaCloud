/**
 * A Medição Inteligente escrevendo em `projects.budget`.
 *
 * ─── A DÍVIDA QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * `projects.budget` tinha dois escritores com convenções incompatíveis. O da
 * Planta é idempotente por construção (id determinístico + substituição por
 * prefixo). O da Medição criava a linha com `crypto.randomUUID()`, e a ÚNICA
 * coisa que impedia duplicata ao reexportar era casar pelo texto da descrição.
 *
 * Renomear o item na biblioteca — ou só corrigir um acento — passava a criar
 * uma linha nova ao lado da antiga, sem aviso. O orçamento crescia sozinho, e
 * o segundo caso abaixo é exatamente isso.
 */
import { describe, expect, it } from 'vitest';
import type { BudgetEntry } from '../types';
import {
  aplicarMedicaoNoOrcamento,
  idDaMedicao,
  type ItemMedido,
} from '../utils/medicaoNoOrcamento';

const item = (over: Partial<ItemMedido> = {}): ItemMedido => ({
  itemId: 'lib_1',
  nome: 'Alvenaria de vedação',
  unidade: 'M2',
  valorUnitario: 50,
  categoria: 'Alvenaria',
  total: 10,
  ...over,
});

const linha = (over: Partial<BudgetEntry> = {}): BudgetEntry =>
  ({
    id: 'x',
    sinapiItem: { code: 'C', description: 'D', unit: 'm²', price: 1 },
    quantity: 1,
    phase: '',
    group: '',
    ...over,
  }) as BudgetEntry;

describe('medição → orçamento · não duplicar', () => {
  it('a primeira exportação adiciona, com id DETERMINÍSTICO', () => {
    const r = aplicarMedicaoNoOrcamento([], [item()]);
    expect(r.adicionadas).toBe(1);
    expect(r.budget[0].id).toBe(idDaMedicao('lib_1'));
  });

  it('EXPORTAR DE NOVO atualiza, não duplica', () => {
    const um = aplicarMedicaoNoOrcamento([], [item()]);
    const dois = aplicarMedicaoNoOrcamento(um.budget, [item({ total: 25 })]);
    expect(dois.budget).toHaveLength(1);
    expect(dois.adicionadas).toBe(0);
    expect(dois.atualizadas).toBe(1);
    expect(dois.budget[0].quantity).toBe(25);
  });

  it('RENOMEAR o item não duplica — era o defeito', () => {
    // Com id aleatório, a descrição era o único elo. Trocá-la criava uma linha
    // nova ao lado da antiga, e o orçamento crescia a cada exportação.
    const um = aplicarMedicaoNoOrcamento([], [item()]);
    const dois = aplicarMedicaoNoOrcamento(um.budget, [
      item({ nome: 'Alvenaria de vedação (bloco 14)', total: 30 }),
    ]);
    expect(dois.budget).toHaveLength(1);
    expect(dois.budget[0].quantity).toBe(30);
  });

  it('o CÓDIGO também é estável entre exportações', () => {
    // Era `MED-<4 dígitos aleatórios>`, sorteado a cada vez: o mesmo serviço
    // aparecia com dois códigos e nada os ligava.
    const um = aplicarMedicaoNoOrcamento([], [item()]);
    const dois = aplicarMedicaoNoOrcamento([], [item()]);
    expect(um.budget[0].sinapiItem.code).toBe(dois.budget[0].sinapiItem.code);
  });
});

describe('medição → orçamento · o que ela NÃO pode fazer', () => {
  it('só a QUANTIDADE muda — preço e fase ajustados no orçamento sobrevivem', () => {
    // A medição não tem autoridade sobre preço nem sobre onde a linha mora na
    // EAP. Sobrescrever apagaria trabalho de quem mantém o orçamento.
    const existente = linha({
      id: idDaMedicao('lib_1'),
      sinapiItem: { code: 'MED-LIB_1', description: 'Alvenaria', unit: 'm²', price: 999 },
      phase: 'Estrutura',
      group: 'Contratado',
    });
    const r = aplicarMedicaoNoOrcamento([existente], [item({ total: 7 })]);
    expect(r.budget[0].quantity).toBe(7);
    expect(r.budget[0].sinapiItem.price).toBe(999);
    expect(r.budget[0].phase).toBe('Estrutura');
    expect(r.budget[0].group).toBe('Contratado');
  });

  it('não toca em linha alheia', () => {
    const manual = linha({ id: 'digitada-a-mao', quantity: 3 });
    const r = aplicarMedicaoNoOrcamento([manual], [item()]);
    expect(r.budget).toHaveLength(2);
    expect(r.budget.find((b) => b.id === 'digitada-a-mao')).toStrictEqual(manual);
  });
});

describe('medição → orçamento · a ordem de casamento', () => {
  it('a REFERÊNCIA MANUAL ganha do id determinístico', () => {
    // Alguém disse explicitamente qual linha é; a escolha da pessoa vence.
    const alvo = linha({ id: 'escolhida-a-mao', quantity: 1 });
    const outra = linha({ id: idDaMedicao('lib_1'), quantity: 1 });
    const r = aplicarMedicaoNoOrcamento(
      [alvo, outra],
      [item({ referenciaManual: 'escolhida-a-mao', total: 42 })],
    );
    expect(r.budget.find((b) => b.id === 'escolhida-a-mao')!.quantity).toBe(42);
    expect(r.budget.find((b) => b.id === idDaMedicao('lib_1'))!.quantity).toBe(1);
  });

  it('a DESCRIÇÃO ainda casa — é o que reencontra as linhas antigas', () => {
    // Linhas exportadas antes da correção têm id aleatório. Sem este degrau, a
    // primeira exportação depois dela duplicaria tudo o que já existe.
    const antiga = linha({
      id: 'b6f0e0c2-aleatorio',
      sinapiItem: { code: 'MED-4821', description: 'Alvenaria de vedação', unit: 'm²', price: 50 },
      quantity: 10,
    });
    const r = aplicarMedicaoNoOrcamento([antiga], [item({ total: 18 })]);
    expect(r.budget).toHaveLength(1);
    expect(r.budget[0].quantity).toBe(18);
  });

  it('e o id da linha antiga NÃO é reescrito', () => {
    // ⚠️ O id de uma linha de orçamento é o id da TAREFA no cronograma.
    // Trocá-lo romperia o vínculo com o planejamento em silêncio.
    const antiga = linha({
      id: 'b6f0e0c2-aleatorio',
      sinapiItem: { code: 'MED-4821', description: 'Alvenaria de vedação', unit: 'm²', price: 50 },
    });
    const r = aplicarMedicaoNoOrcamento([antiga], [item()]);
    expect(r.budget[0].id).toBe('b6f0e0c2-aleatorio');
  });

  it('descrição casa ignorando caixa e espaços em volta', () => {
    const antiga = linha({
      id: 'aleatorio',
      sinapiItem: { code: 'C', description: '  ALVENARIA DE VEDAÇÃO ', unit: 'm²', price: 1 },
    });
    const r = aplicarMedicaoNoOrcamento([antiga], [item({ total: 5 })]);
    expect(r.budget).toHaveLength(1);
    expect(r.budget[0].quantity).toBe(5);
  });
});
