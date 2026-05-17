import { describe, it, expect } from 'vitest';
import { calculateProjectProgress } from '../utils/projectUtils';
import { BudgetEntry, DiaryEntry } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeBudgetItem = (id: string, quantity: number, price: number): BudgetEntry => ({
  id,
  code: `CODE-${id}`,
  description: `Item ${id}`,
  quantity,
  unit: 'un',
  sinapiItem: { id, code: `CODE-${id}`, description: `Item ${id}`, price, unit: 'un' } as any,
  category: 'TEST',
  subcategory: 'TEST',
});

const makeDiaryEntry = (
  itemId: string,
  realizedQty: number,
  status: 'Aprovado' | 'Recusado' | 'Pendente' = 'Aprovado'
): DiaryEntry => ({
  id: `diary-${itemId}`,
  projectId: 'proj-1',
  date: '2025-01-01',
  status,
  activities: [{ itemId, realizedQty, plannedQty: realizedQty, description: '' }],
  weather: 'Ensolarado',
  workers: 0,
  notes: '',
  createdAt: '',
  createdBy: '',
} as any);

// ─── calculateProjectProgress ──────────────────────────────────────────────────

describe('calculateProjectProgress', () => {
  it('retorna 0 quando orçamento está vazio', () => {
    expect(calculateProjectProgress([])).toBe(0);
    expect(calculateProjectProgress([], [])).toBe(0);
  });

  it('retorna 0 quando não há entradas de diário', () => {
    const budget = [makeBudgetItem('A', 100, 50)];
    expect(calculateProjectProgress(budget, [])).toBe(0);
  });

  it('retorna 100 quando todos os itens estão 100% realizados', () => {
    const budget = [
      makeBudgetItem('A', 100, 50),
      makeBudgetItem('B', 200, 30),
    ];
    const diary = [
      makeDiaryEntry('A', 100),
      makeDiaryEntry('B', 200),
    ];
    expect(calculateProjectProgress(budget, diary)).toBe(100);
  });

  it('retorna progresso parcial proporcional ao valor financeiro', () => {
    // Item A: qty=100, price=100 → valor=10.000 (80% realizado = 8.000)
    // Item B: qty=50,  price=200 → valor=10.000 (0% realizado = 0)
    // Progresso = 8.000 / 20.000 = 40%
    const budget = [
      makeBudgetItem('A', 100, 100),
      makeBudgetItem('B', 50, 200),
    ];
    const diary = [makeDiaryEntry('A', 80)];
    expect(calculateProjectProgress(budget, diary)).toBe(40);
  });

  it('ignora entradas de diário com status Recusado', () => {
    const budget = [makeBudgetItem('A', 100, 50)];
    const diary = [makeDiaryEntry('A', 100, 'Recusado')];
    expect(calculateProjectProgress(budget, diary)).toBe(0);
  });

  it('limita progresso por item a 100% mesmo com qty realizada maior', () => {
    // 150 unidades realizadas de 100 planejadas → cap em 100%
    const budget = [makeBudgetItem('A', 100, 50)];
    const diary = [makeDiaryEntry('A', 150)];
    expect(calculateProjectProgress(budget, diary)).toBe(100);
  });

  it('acumula realizações de múltiplas entradas do mesmo item', () => {
    // 40 + 40 = 80 de 100 → 80%
    const budget = [makeBudgetItem('A', 100, 100)];
    const diary = [
      makeDiaryEntry('A', 40),
      makeDiaryEntry('A', 40),
    ];
    expect(calculateProjectProgress(budget, diary)).toBe(80);
  });

  it('retorna 0 quando todos os itens têm price = 0 (sem valor financeiro)', () => {
    const budget = [makeBudgetItem('A', 100, 0)];
    const diary = [makeDiaryEntry('A', 100)];
    expect(calculateProjectProgress(budget, diary)).toBe(0);
  });

  it('pondera corretamente itens de alto e baixo valor', () => {
    // Item caro (80% realizado) pesa mais que item barato (0% realizado)
    const budget = [
      makeBudgetItem('CARO', 10, 1000),  // valor = 10.000
      makeBudgetItem('BARATO', 100, 10), // valor =  1.000
    ];
    const diary = [makeDiaryEntry('CARO', 8)]; // 80% do item caro
    // Realizado = 8.000 / 11.000 ≈ 72.7%
    const result = calculateProjectProgress(budget, diary);
    expect(result).toBeCloseTo(72.7, 0);
  });

  it('retorna valor com no máximo 1 casa decimal', () => {
    const budget = [makeBudgetItem('A', 3, 1)]; // valor = 3
    const diary = [makeDiaryEntry('A', 1)];      // realizado = 1 → 33.3%
    const result = calculateProjectProgress(budget, diary);
    expect(result).toBe(33.3);
  });
});
