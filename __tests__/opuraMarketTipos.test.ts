import { describe, expect, it } from 'vitest';
import {
  TIPOS_DE_IMOVEL,
  TIPOS_PADRAO,
  descricaoDosTipos,
  mesmosTipos,
  normalizarTipos,
  resumoDosTipos,
  tiposDoEstudo,
} from '../utils/opuraMarketTipos';

// Plano: docs/planos/2026-10-19-opura-market-media-por-tipo.md, item 2.

describe('tipos de imóvel das médias do ÒPURA Market', () => {
  it('padrão é tudo menos Terreno', () => {
    expect(TIPOS_PADRAO).toEqual(['Apartamento', 'Casa', 'Comercial', 'Outro']);
    expect(TIPOS_PADRAO).not.toContain('Terreno');
  });

  it('o vocabulário é o que a importação grava', () => {
    // supabase/functions/opura-market-import/logica.ts — TIPOS_GRAVAVEIS
    expect([...TIPOS_DE_IMOVEL].sort()).toEqual(['Apartamento', 'Casa', 'Comercial', 'Outro', 'Terreno']);
  });

  it('normaliza: ordem do vocabulário, sem desconhecido nem repetido', () => {
    expect(normalizarTipos(['Terreno', 'Casa', 'Casa', 'Galpão'])).toEqual(['Casa', 'Terreno']);
  });

  it('lista vazia, nula ou que não é lista vira o padrão', () => {
    expect(normalizarTipos([])).toEqual([...TIPOS_PADRAO]);
    expect(normalizarTipos(null)).toEqual([...TIPOS_PADRAO]);
    expect(normalizarTipos('Casa')).toEqual([...TIPOS_PADRAO]);
    expect(normalizarTipos(['Galpão'])).toEqual([...TIPOS_PADRAO]);
  });

  it('o padrão devolvido é cópia: mexer nele não muda o padrão', () => {
    const lista = normalizarTipos([]);
    lista.push('Terreno');
    expect(TIPOS_PADRAO).not.toContain('Terreno');
  });

  it('compara listas sem depender da ordem', () => {
    expect(mesmosTipos(['Casa', 'Apartamento'], ['Apartamento', 'Casa'])).toBe(true);
    expect(mesmosTipos(['Casa'], ['Casa', 'Terreno'])).toBe(false);
  });

  it('resumo curto para o gatilho', () => {
    expect(resumoDosTipos([...TIPOS_DE_IMOVEL])).toBe('Todos');
    expect(resumoDosTipos([...TIPOS_PADRAO])).toBe('Sem terreno');
    expect(resumoDosTipos(['Apartamento', 'Casa', 'Terreno', 'Outro'])).toBe('Sem comercial');
    expect(resumoDosTipos(['Terreno'])).toBe('Só Terreno');
    expect(resumoDosTipos(['Casa', 'Apartamento'])).toBe('Apartamento, Casa');
    expect(resumoDosTipos(['Casa', 'Apartamento', 'Terreno'])).toBe('3 tipos');
  });

  it('descrição por extenso', () => {
    expect(descricaoDosTipos([...TIPOS_PADRAO])).toBe('Apartamento, Casa, Comercial e Outro');
    expect(descricaoDosTipos(['Terreno'])).toBe('Terreno');
    expect(descricaoDosTipos([...TIPOS_DE_IMOVEL])).toBe('todos os tipos');
  });

  it('estudo salvo antes de 19/10/2026 não tem tipos: null (média de todos)', () => {
    expect(tiposDoEstudo({ totalListings: 10 } as { tipos?: unknown })).toBeNull();
    expect(tiposDoEstudo(null)).toBeNull();
    expect(tiposDoEstudo({ tipos: ['Casa', 'Apartamento'] })).toEqual(['Apartamento', 'Casa']);
  });
});
