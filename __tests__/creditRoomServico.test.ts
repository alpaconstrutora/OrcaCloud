/**
 * Resumo do serviço de um empreendimento (objetivo Serviço): quais contratos valem e a conta
 * faturado / a faturar. Decisão do usuário (22/11/2026): só Ativo e Concluído; Minuta, Rascunho e Revisão não.
 */
import { describe, expect, it } from 'vitest';
import { STATUS_SERVICO_VALIDOS, resumirServico, type ContratoDeServico } from '../utils/creditRoomServico';

const c = (id: string, status: string | null, valor: number | null): ContratoDeServico => ({ id, status, current_value: valor });

describe('resumirServico', () => {
  it('só Ativo e Concluído (texto exato)', () => {
    expect([...STATUS_SERVICO_VALIDOS]).toEqual(['Ativo', 'Concluído']);
  });

  it('soma valor e faturado dos contratos válidos; a faturar = valor − faturado', () => {
    const r = resumirServico(
      [c('a', 'Ativo', 300_000), c('b', 'Concluído', 200_000)],
      new Map([['a', 100_000], ['b', 80_000]]),
    );
    expect(r).toEqual({ n_contratos: 2, valor_contratos: 500_000, faturado: 180_000, a_faturar: 320_000 });
  });

  it.each(['Minuta', 'Rascunho', 'Revisão', 'Cancelado', 'Suspenso', null])('contrato em %s não entra, nem o faturado dele', status => {
    const r = resumirServico([c('a', 'Ativo', 100_000), c('x', status, 900_000)], new Map([['a', 10_000], ['x', 900_000]]));
    expect(r).toEqual({ n_contratos: 1, valor_contratos: 100_000, faturado: 10_000, a_faturar: 90_000 });
  });

  it('faturado maior que o contrato: a faturar fica em 0, nunca negativo', () => {
    const r = resumirServico([c('a', 'Ativo', 100_000)], new Map([['a', 130_000]]));
    expect(r.faturado).toBe(130_000);
    expect(r.a_faturar).toBe(0);
  });

  it('contrato sem título gerado: faturado 0 e a faturar = valor inteiro', () => {
    const r = resumirServico([c('a', 'Ativo', 466_622.84)], new Map());
    expect(r).toEqual({ n_contratos: 1, valor_contratos: 466_622.84, faturado: 0, a_faturar: 466_622.84 });
  });

  it('só contratos fora do status válido (ex.: o único está em Minuta): n_contratos 0', () => {
    const r = resumirServico([c('a', 'Minuta', 466_622.84)], new Map());
    expect(r).toEqual({ n_contratos: 0, valor_contratos: 0, faturado: 0, a_faturar: 0 });
  });

  it('valor nulo conta como 0 e não vira NaN; faturado de contrato fora da lista é ignorado', () => {
    const r = resumirServico([c('a', 'Ativo', null)], new Map([['a', 5], ['z', 999]]));
    expect(r).toEqual({ n_contratos: 1, valor_contratos: 0, faturado: 5, a_faturar: 0 });
  });

  it('arredonda a centavos (sem 0,1 + 0,2)', () => {
    const r = resumirServico([c('a', 'Ativo', 0.3), c('b', 'Ativo', 0.1)], new Map([['a', 0.1], ['b', 0.2]]));
    expect(r.faturado).toBe(0.3);
    expect(r.valor_contratos).toBe(0.4);
    expect(r.a_faturar).toBe(0.1);
  });
});
