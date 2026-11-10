/**
 * PLANTA BAIXA POR TIPOLOGIA (Espelho de Vendas 3D, F5 — 10/11/2026): a chave que casa a tipologia da unidade com a
 * planta cadastrada, e a lista do cadastro. Puro. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { chaveDaTipologia, plantaDaUnidade, plantasPorChave, tipologiasDoEmpreendimento, type PlantaDaTipologia } from '../utils/espelhoPlantaDaTipologia';

const planta = (tipologia: string, url = `https://x/${tipologia}.png`): PlantaDaTipologia => ({ id: `p-${tipologia}`, tipologia, tipologia_chave: chaveDaTipologia(tipologia), imagem_url: url });

describe('chaveDaTipologia', () => {
  it('ignora caixa, acento e espaço sobrando', () => {
    expect([' Tipo  1 ', 'TIPO 1', 'tipo 1'].map(chaveDaTipologia)).toEqual(['tipo 1', 'tipo 1', 'tipo 1']);
    expect(chaveDaTipologia('2 Suítes')).toBe('2 suites');
  });

  it('vazio, nulo e só espaço = sem tipologia', () => {
    expect([null, undefined, '', '   '].map(chaveDaTipologia)).toEqual(['', '', '', '']);
  });

  it('"Tipo 1" e "Tipo 10" não se confundem', () => {
    expect(chaveDaTipologia('Tipo 1')).not.toBe(chaveDaTipologia('Tipo 10'));
  });
});

describe('plantaDaUnidade', () => {
  const porChave = plantasPorChave([planta('Tipo 1'), planta('Tipo 2')]);

  it('acha a planta pela tipologia, escrita de outro jeito', () => {
    expect(plantaDaUnidade(porChave, 'TIPO  1')).toBe('https://x/Tipo 1.png');
  });

  it('unidade sem tipologia, ou tipologia sem planta: null', () => {
    expect(plantaDaUnidade(porChave, null)).toBeNull();
    expect(plantaDaUnidade(porChave, '')).toBeNull();
    expect(plantaDaUnidade(porChave, 'Tipo 9')).toBeNull();
  });

  it('duas plantas com a mesma chave: vale a primeira; planta sem URL não entra', () => {
    const m = plantasPorChave([planta('Tipo 1', 'https://x/a.png'), planta('tipo 1', 'https://x/b.png'), planta('Tipo 3', '')]);
    expect(m.get('tipo 1')).toBe('https://x/a.png');
    expect(m.has('tipo 3')).toBe(false);
  });

  it('lista ausente não estoura', () => {
    expect(plantasPorChave(null).size).toBe(0);
  });
});

describe('tipologiasDoEmpreendimento', () => {
  // Garden Cambuhy em 10/11/2026: as unidades do Empreendimento só têm Tipo 1–4 (29 sem tipologia); os imóveis do
  // estoque têm Tipo 1–8. A lista do cadastro precisa das duas fontes.
  it('junta as tipologias das unidades e dos imóveis, sem contar a mesma unidade duas vezes', () => {
    const r = tipologiasDoEmpreendimento({
      unidades: ['Tipo 1', 'Tipo 1', 'Tipo 2', null, ''],
      imoveis: ['tipo 1', 'Tipo 1', 'Tipo 1', 'Tipo 5', 'Tipo 5'],
      plantas: [planta('Tipo 5')],
    });
    expect(r.map((t) => [t.rotulo, t.unidades, !!t.planta])).toEqual([
      ['Tipo 1', 3, false],
      ['Tipo 2', 1, false],
      ['Tipo 5', 2, true],
    ]);
  });

  it('ordena pelo número ("Tipo 2" antes de "Tipo 10")', () => {
    const r = tipologiasDoEmpreendimento({ unidades: ['Tipo 10', 'Tipo 2'], imoveis: [], plantas: [] });
    expect(r.map((t) => t.rotulo)).toEqual(['Tipo 2', 'Tipo 10']);
  });

  it('planta de tipologia que saiu do cadastro aparece no fim, com 0 unidades, para poder ser removida', () => {
    const r = tipologiasDoEmpreendimento({ unidades: ['Tipo 1'], imoveis: [], plantas: [planta('Antiga')] });
    expect(r.map((t) => [t.rotulo, t.unidades])).toEqual([['Tipo 1', 1], ['Antiga', 0]]);
    expect(r[1].planta?.id).toBe('p-Antiga');
  });

  it('sem tipologia em lugar nenhum: lista vazia', () => {
    expect(tipologiasDoEmpreendimento({ unidades: [null, ''], imoveis: [undefined], plantas: [] })).toEqual([]);
  });
});
