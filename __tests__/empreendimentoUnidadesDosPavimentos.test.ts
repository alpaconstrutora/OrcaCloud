/**
 * GERAR A PARTIR DOS PAVIMENTOS com número inicial (28/10/2026): *"o botão de gerar a partir do pavimento inicia a
 * numeração sequencial a partir de 01. implemente opção de escolher iniciar de um número que o usuário decidir"*.
 * A Torre B do Garden numera 05–08 em cada andar (105, 106, 107, 108). Puro.
 */
import { describe, expect, it } from 'vitest';
import { faixasPorAndar, lerNumeroInicial, unidadesDosPavimentos } from '../utils/empreendimentoUnidadesDosPavimentos';

const TORRE = { id: 't1', units_per_floor: 4 } as never;
const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra }) as never;
const CADASTRO = [
  pav({ id: 'g', name: 'Garagem', tipo: 'GARAGEM', floor_number: -1, units_per_floor: 1 }),
  pav({ id: 't', name: 'Térreo', tipo: 'TERREO', floor_number: 0, units_per_floor: 2, sort_order: 1 }),
  pav({ id: 'p', name: 'Tipo', floor_number: 1, repeat_count: 2, sort_order: 2 }),
];

describe('unidadesDosPavimentos', () => {
  it('sem número inicial: de 01, como antes (101, 102…; térreo TR01; subsolo SS101)', () => {
    const us = unidadesDosPavimentos(TORRE, CADASTRO);
    expect(us.map((u) => u.name)).toEqual(['SS101', 'TR01', 'TR02', '101', '102', '103', '104', '201', '202', '203', '204']);
    expect(us[3]).toMatchObject({ tower_id: 't1', floor_id: 'p', floor_tipo: 'TIPO', floor: 1, sort_order: 3, status: 'DISPONIVEL', is_vendavel: true });
  });

  it('número inicial 5: cada andar começa no 05 (a Torre B do Garden: 105 a 108)', () => {
    const us = unidadesDosPavimentos(TORRE, CADASTRO, 5);
    expect(us.filter((u) => u.floor === 1).map((u) => u.name)).toEqual(['105', '106', '107', '108']);
    expect(us.filter((u) => u.floor === 0).map((u) => u.name)).toEqual(['TR05', 'TR06']);
  });

  it('passa de 99: o número cresce (198, 199, 1100) em vez de cortar', () => {
    const us = unidadesDosPavimentos(TORRE, [pav({ floor_number: 1, units_per_floor: 3 })], 98);
    expect(us.map((u) => u.name)).toEqual(['198', '199', '1100']);
  });

  it('prefixo do pavimento continua na frente', () => {
    expect(unidadesDosPavimentos(TORRE, [pav({ floor_number: 1, units_per_floor: 1, prefix: 'A' })], 3)[0].name).toBe('A-103');
  });
});

describe('lerNumeroInicial', () => {
  it('inteiro de 0 a 99; vazio vale 1; o resto é recusado', () => {
    expect(lerNumeroInicial('5')).toBe(5);
    expect(lerNumeroInicial(' 0 ')).toBe(0);
    expect(lerNumeroInicial('')).toBe(1);
    expect(lerNumeroInicial('2,5')).toBeNull();
    expect(lerNumeroInicial('-1')).toBeNull();
    expect(lerNumeroInicial('100')).toBeNull();
  });
});

describe('faixasPorAndar', () => {
  it('a prévia: a primeira e a última unidade de cada andar, de baixo para cima', () => {
    expect(faixasPorAndar(unidadesDosPavimentos(TORRE, CADASTRO, 5))).toEqual([
      { andar: -1, de: 'SS105', ate: 'SS105', quantas: 1 },
      { andar: 0, de: 'TR05', ate: 'TR06', quantas: 2 },
      { andar: 1, de: '105', ate: '108', quantas: 4 },
      { andar: 2, de: '205', ate: '208', quantas: 4 },
    ]);
  });
});
