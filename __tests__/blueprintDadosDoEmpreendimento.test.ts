import { describe, it, expect } from 'vitest';
import { dadosDoEmpreendimentoParaPlanta } from '../utils/blueprintDadosDoEmpreendimento';

/**
 * O que a Planta aproveita da ficha do empreendimento vinculado (plano
 * 2026-10-21-planta-empreendimento-vinculado-autopreencher.md, itens 3–5).
 */
describe('dadosDoEmpreendimentoParaPlanta', () => {
  it('frente e profundidade da ficha viram mm; endereço do TERRENO antes do de divulgação', () => {
    const d = dadosDoEmpreendimentoParaPlanta({
      name: '011 - Garden Cambuhy',
      terreno_frente: 18,
      terreno_profundidade: 71,
      terreno_street: 'Rua A',
      terreno_number: '10',
      terreno_neighborhood: 'Centro',
      terreno_city: 'Cambuí',
      terreno_state: 'MG',
      endereco_street: 'Av. Divulgação',
      endereco_city: 'Pouso Alegre',
    });
    expect(d.lote).toEqual({ frenteMm: 18000, profundidadeMm: 71000, origem: '011 - Garden Cambuhy' });
    expect(d.endereco).toEqual({ texto: 'Rua A, 10, Centro, Cambuí - MG', origem: '011 - Garden Cambuhy' });
    expect(d.uf).toBe('MG');
  });

  it('sem profundidade, laterais iguais servem; laterais diferentes não são chute', () => {
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_frente: 10, terreno_lateral_direita: 25, terreno_lateral_esquerda: 25 }).lote?.profundidadeMm).toBe(25000);
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_frente: 10, terreno_lateral_direita: 25, terreno_lateral_esquerda: 24 }).lote).toBeNull();
  });

  it('medida faltando ou zero: não sugere lote', () => {
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_frente: 10 }).lote).toBeNull();
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_frente: 0, terreno_profundidade: 20 }).lote).toBeNull();
  });

  it('terreno sem rua nem cidade cai no endereço de divulgação; nenhum dos dois = sem busca', () => {
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', endereco_street: 'Rua B', endereco_city: 'Cambuí', endereco_state: 'MG' }).endereco?.texto).toBe('Rua B, Cambuí - MG');
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_number: '5' }).endereco).toBeNull();
  });

  it('UF: terreno, depois divulgação; vazia = null', () => {
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', endereco_state: 'sp' }).uf).toBe('SP');
    expect(dadosDoEmpreendimentoParaPlanta({ name: 'X', terreno_state: '  ' }).uf).toBeNull();
  });

  it('sem empreendimento: nada', () => {
    expect(dadosDoEmpreendimentoParaPlanta(null)).toEqual({ lote: null, endereco: null, uf: null });
  });
});
