import { describe, it, expect } from 'vitest';
import { espelhosDoObjetivo, objetivoDe } from '../utils/empreendimentoObjetivo';

describe('espelhosDoObjetivo', () => {
  it('Vendas esconde o Espelho de Locações', () => {
    expect(espelhosDoObjetivo('VENDAS')).toEqual({ vendas: true, locacoes: false });
  });
  it('Locação esconde o Espelho de Vendas', () => {
    expect(espelhosDoObjetivo('LOCACAO')).toEqual({ vendas: false, locacoes: true });
  });
  it('Misto mostra os dois', () => {
    expect(espelhosDoObjetivo('MISTO')).toEqual({ vendas: true, locacoes: true });
  });
  it('nulo ou desconhecido conta como Misto (nenhuma aba some)', () => {
    expect(espelhosDoObjetivo(null)).toEqual({ vendas: true, locacoes: true });
    expect(espelhosDoObjetivo(undefined)).toEqual({ vendas: true, locacoes: true });
    expect(objetivoDe('QUALQUER')).toBe('MISTO');
  });
});
