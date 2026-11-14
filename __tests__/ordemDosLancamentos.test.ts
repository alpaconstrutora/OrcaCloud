import { describe, expect, it } from 'vitest';
import { porDataDoLancamento } from '../utils/ordemDosLancamentos';

describe('porDataDoLancamento (Negociação › Parcelas)', () => {
  it('ordena pela data, mais antiga primeiro', () => {
    const l = [{ id: 'b', transaction_date: '2026-03-10' }, { id: 'a', transaction_date: '2026-01-10' }];
    expect([...l].sort(porDataDoLancamento).map(x => x.id)).toEqual(['a', 'b']);
  });

  it('lançamento SEM data não derruba a ordenação e vai para o fim', () => {
    const l = [
      { id: 'sem', transaction_date: undefined },
      { id: 'jan', transaction_date: '2026-01-10' },
      { id: 'nulo', transaction_date: null },
      { id: 'fev', transaction_date: '2026-02-10' },
    ];
    // O que existia antes (`a.transaction_date.localeCompare`) lançava TypeError aqui.
    expect(() => [...l].sort((a, b) => (a.transaction_date as string).localeCompare(b.transaction_date as string))).toThrow(TypeError);
    expect([...l].sort(porDataDoLancamento).map(x => x.id)).toEqual(['jan', 'fev', 'sem', 'nulo']);
  });
});
