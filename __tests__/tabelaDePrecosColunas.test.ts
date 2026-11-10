/**
 * Tabela de Preços do LOTE (10/11/2026): "quando o tipo for lote as colunas Vagas, banheiro,
 * pavimento e posição devem ser ocultadas e Quadra e Nº do lote exibidas".
 * Plano: docs/planos/2026-11-10-tabela-precos-colunas-do-lote.md.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colunasForaDaTabelaDePrecos } from '../utils/tabelaDePrecosColunas';

// Respostas do banco por tabela; cada consulta devolve a próxima da fila.
const respostas: Record<string, unknown[]> = {};
const filtros: Record<string, [string, unknown][]> = {};
vi.mock('../lib/supabase', () => {
  const consulta = (tabela: string) => {
    const resposta = () => ({ data: (respostas[tabela] ?? []).shift() ?? null, error: null });
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (col: string, v: unknown) => { (filtros[tabela] ??= []).push([col, v]); return q; },
      in: (col: string, v: unknown) => { (filtros[tabela] ??= []).push([col, v]); return q; },
      or: () => q,
      maybeSingle: () => Promise.resolve(resposta()),
      then: (ok: any, erro: any) => Promise.resolve(resposta()).then(ok, erro),
    };
    return q;
  };
  return { supabase: { from: consulta } };
});

const { empreendimentoService } = await import('../services/empreendimentoService');

beforeEach(() => {
  for (const k of Object.keys(respostas)) delete respostas[k];
  for (const k of Object.keys(filtros)) delete filtros[k];
});

describe('colunasForaDaTabelaDePrecos', () => {
  it('no LOTE esconde Vagas, Banheiros, Pavimento e Posição', () => {
    expect([...colunasForaDaTabelaDePrecos('LOTE')].sort()).toEqual(['bathrooms', 'floor', 'parking', 'position']);
  });

  it('fora do LOTE esconde Quadra e Nº do lote (prédio, casa, chácara)', () => {
    for (const e of ['TORRES', 'IMOVEL_UNICO'] as const) {
      expect([...colunasForaDaTabelaDePrecos(e)].sort()).toEqual(['lote', 'quadra']);
    }
  });
});

describe('empreendimentoService.loteDoPredio', () => {
  it('prédio sem empreendimento (cadastro direto no Comercial) → TORRES', async () => {
    respostas.empreendimentos = [null];
    expect(await empreendimentoService.loteDoPredio('predio-1', 'SALE')).toEqual({ estrutura: 'TORRES', quadraLote: {} });
  });

  it('LOTE: quadra/lote por imóvel do Comercial, e o tipo pela org do empreendimento', async () => {
    respostas.empreendimentos = [{ id: 'emp-1', organization_id: 'org-a', tipo: 'lote' }];
    respostas.empreendimento_types = [[
      { slug: 'lote', organization_id: 'org-b', estrutura: 'TORRES' },
      { slug: 'lote', organization_id: 'org-a', estrutura: 'LOTE' },
    ]];
    respostas.empreendimento_towers = [[{ id: 'torre-1' }]];
    respostas.empreendimento_units = [[
      { quadra: 'A', lote: '4B', commercial_property_id: 'imovel-1', rental_property_id: 'loc-1' },
      { quadra: null, lote: '5', commercial_property_id: null, rental_property_id: null },
    ]];
    const r = await empreendimentoService.loteDoPredio('predio-1', 'SALE');
    expect(r).toEqual({ estrutura: 'LOTE', quadraLote: { 'imovel-1': { quadra: 'A', lote: '4B' } } });
    expect(filtros.empreendimentos).toEqual([['commercial_building_id', 'predio-1']]);
  });

  it('Locações procura pelo prédio de locação e pelo imóvel de locação', async () => {
    respostas.empreendimentos = [{ id: 'emp-1', organization_id: 'org-a', tipo: 'lote' }];
    respostas.empreendimento_types = [[{ slug: 'lote', organization_id: null, estrutura: 'LOTE' }]];
    respostas.empreendimento_towers = [[{ id: 'torre-1' }]];
    respostas.empreendimento_units = [[{ quadra: 'A', lote: '4B', commercial_property_id: 'imovel-1', rental_property_id: 'loc-1' }]];
    const r = await empreendimentoService.loteDoPredio('predio-loc', 'RENTAL');
    expect(r.quadraLote).toEqual({ 'loc-1': { quadra: 'A', lote: '4B' } });
    expect(filtros.empreendimentos).toEqual([['commercial_rental_building_id', 'predio-loc']]);
  });

  it('tipo que não é LOTE não lê as unidades', async () => {
    respostas.empreendimentos = [{ id: 'emp-1', organization_id: 'org-a', tipo: 'vertical' }];
    respostas.empreendimento_types = [[{ slug: 'vertical', organization_id: null, estrutura: 'TORRES' }]];
    expect(await empreendimentoService.loteDoPredio('predio-1', 'SALE')).toEqual({ estrutura: 'TORRES', quadraLote: {} });
    expect(filtros.empreendimento_units).toBeUndefined();
  });
});
