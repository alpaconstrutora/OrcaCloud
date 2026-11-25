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
  it('Serviço (obra/prestação para terceiro) não mostra nenhum espelho', () => {
    expect(objetivoDe('SERVICO')).toBe('SERVICO');
    expect(espelhosDoObjetivo('SERVICO')).toEqual({ vendas: false, locacoes: false });
  });
  it('Imobilizado (imóvel mantido no ativo) não mostra nenhum espelho', () => {
    expect(objetivoDe('IMOBILIZADO')).toBe('IMOBILIZADO');
    expect(espelhosDoObjetivo('IMOBILIZADO')).toEqual({ vendas: false, locacoes: false });
  });
  it('nulo ou desconhecido conta como Misto (nenhuma aba some)', () => {
    expect(espelhosDoObjetivo(null)).toEqual({ vendas: true, locacoes: true });
    expect(espelhosDoObjetivo(undefined)).toEqual({ vendas: true, locacoes: true });
    expect(objetivoDe('QUALQUER')).toBe('MISTO');
  });
});
