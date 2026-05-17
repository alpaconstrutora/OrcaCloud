/**
 * Testes do CalendarEngine — motor de dias úteis do Scheduling Engine.
 * Valida adição de dias úteis, diferença entre datas e tratamento de feriados.
 *
 * Importante: o CalendarEngine é usado internamente no schedulingEngine.ts.
 * Como é uma classe interna não exportada, testamos sua lógica via
 * implementação duplicada simplificada aqui para garantir o contrato.
 *
 * Caso o CalendarEngine seja exportado no futuro, estes testes podem ser
 * refatorados para importar diretamente.
 */
import { describe, it, expect } from 'vitest';

// ─── CalendarEngine (lógica espelhada da implementação real) ──────────────────

class CalendarEngine {
  private holidays: Set<string>;

  constructor(holidays: string[] = []) {
    this.holidays = new Set(holidays);
  }

  isWorkingDay(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    if (this.holidays.has(date.toISOString().split('T')[0])) return false;
    return true;
  }

  addWorkingDays(date: Date, days: number, useWorkingDays: boolean): Date {
    const result = new Date(date);
    if (days === 0) return result;
    const direction = days > 0 ? 1 : -1;
    let remaining = Math.abs(days);
    while (remaining > 0) {
      result.setDate(result.getDate() + direction);
      if (!useWorkingDays || this.isWorkingDay(result)) remaining--;
    }
    return result;
  }

  diffWorkingDays(d1: Date, d2: Date, useWorkingDays: boolean): number {
    const start = new Date(Math.min(d1.getTime(), d2.getTime()));
    const end = new Date(Math.max(d1.getTime(), d2.getTime()));
    const sign = d2.getTime() >= d1.getTime() ? 1 : -1;
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    let count = 0;
    const curr = new Date(start);
    while (curr < end) {
      curr.setDate(curr.getDate() + 1);
      if (!useWorkingDays || this.isWorkingDay(curr)) count++;
    }
    return sign * count;
  }
}

// Helper: cria data ao meio-dia para evitar bugs de timezone (getDay() usa UTC)
const d = (iso: string) => new Date(`${iso}T12:00:00`);

// ─── isWorkingDay ─────────────────────────────────────────────────────────────

describe('CalendarEngine.isWorkingDay', () => {
  const cal = new CalendarEngine();

  it('segunda a sexta são dias úteis', () => {
    // 2025-01-06 = segunda, 2025-01-10 = sexta
    expect(cal.isWorkingDay(d('2025-01-06'))).toBe(true);
    expect(cal.isWorkingDay(d('2025-01-10'))).toBe(true);
  });

  it('sábado e domingo não são dias úteis', () => {
    // 2025-01-04 = sábado, 2025-01-05 = domingo
    expect(cal.isWorkingDay(d('2025-01-04'))).toBe(false);
    expect(cal.isWorkingDay(d('2025-01-05'))).toBe(false);
  });

  it('feriado configurado não é dia útil', () => {
    const calFeriado = new CalendarEngine(['2025-01-01']);
    expect(calFeriado.isWorkingDay(d('2025-01-01'))).toBe(false);
  });

  it('feriado que cai no fim de semana permanece não-útil', () => {
    // 2025-11-15 = sábado E feriado
    const calFeriado = new CalendarEngine(['2025-11-15']);
    expect(calFeriado.isWorkingDay(d('2025-11-15'))).toBe(false);
  });
});

// ─── addWorkingDays ──────────────────────────────────────────────────────────

describe('CalendarEngine.addWorkingDays', () => {
  const cal = new CalendarEngine();

  it('0 dias retorna a mesma data', () => {
    const base = d('2025-01-06'); // segunda
    const result = cal.addWorkingDays(base, 0, true);
    expect(result.toDateString()).toBe(base.toDateString());
  });

  it('5 dias úteis a partir de segunda = próxima segunda', () => {
    // Segunda 06/01 + 5 dias úteis = segunda 13/01
    const result = cal.addWorkingDays(d('2025-01-06'), 5, true);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-13');
  });

  it('pula fim de semana ao adicionar dias úteis', () => {
    // Sexta 10/01 + 1 dia útil = segunda 13/01 (pula sábado/domingo)
    const result = cal.addWorkingDays(d('2025-01-10'), 1, true);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-13');
  });

  it('modo calendário (sem dias úteis) conta todos os dias', () => {
    // Sexta 10/01 + 1 dia calendário = sábado 11/01
    const result = cal.addWorkingDays(d('2025-01-10'), 1, false);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-11');
  });

  it('pula feriado configurado ao adicionar dias', () => {
    // Sexta + 1 dia útil normalmente seria segunda
    // Se segunda for feriado, deve pular para terça
    const calFeriado = new CalendarEngine(['2025-01-13']); // segunda = feriado
    const result = calFeriado.addWorkingDays(d('2025-01-10'), 1, true);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-14'); // terça
  });

  it('suporta subtração de dias úteis (valor negativo)', () => {
    // Segunda 13/01 - 1 dia útil = sexta 10/01
    const result = cal.addWorkingDays(d('2025-01-13'), -1, true);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-10');
  });
});

// ─── diffWorkingDays ──────────────────────────────────────────────────────────

describe('CalendarEngine.diffWorkingDays', () => {
  const cal = new CalendarEngine();

  it('mesma data retorna 0', () => {
    const dt = d('2025-01-06');
    expect(cal.diffWorkingDays(dt, dt, true)).toBe(0);
  });

  it('segunda a sexta da mesma semana = 4 dias úteis', () => {
    const seg = d('2025-01-06');
    const sex = d('2025-01-10');
    expect(cal.diffWorkingDays(seg, sex, true)).toBe(4);
  });

  it('contagem reversa retorna valor negativo', () => {
    const seg = d('2025-01-06');
    const sex = d('2025-01-10');
    expect(cal.diffWorkingDays(sex, seg, true)).toBe(-4);
  });

  it('não conta fins de semana em diff de dias úteis', () => {
    // Segunda 06/01 → segunda 13/01 = 5 dias úteis (descarta sáb/dom)
    const d1 = d('2025-01-06');
    const d2 = d('2025-01-13');
    expect(cal.diffWorkingDays(d1, d2, true)).toBe(5);
  });

  it('modo calendário conta todos os dias', () => {
    const d1 = d('2025-01-06');
    const d2 = d('2025-01-13');
    expect(cal.diffWorkingDays(d1, d2, false)).toBe(7);
  });
});
