import { describe, it, expect } from 'vitest';
import { agruparZonas } from '../utils/zonaRegulatoriaGrupos';

const ZONAS = [
  { id: '1', macroarea: 'Qualificação Urbana', zona: 'ZM 1', nivel_confianca: 'Alto' },
  { id: '2', macroarea: 'Urbanização Consolidada', zona: 'ZC', nivel_confianca: 'Baixo' },
  { id: '3', macroarea: 'qualificação urbana', zona: 'ZM 2', nivel_confianca: undefined },
];
const ESCALA = ['Baixo', 'Médio', 'Alto'];

describe('agruparZonas', () => {
  it('por macroárea: A→Z, sem diferenciar caixa', () => {
    expect(agruparZonas(ZONAS, 'macroarea', 'asc').map(g => [g.label, g.itens.length]))
      .toEqual([['Qualificação Urbana', 2], ['Urbanização Consolidada', 1]]);
  });
  it('nível de confiança na ordem da escala; Decrescente inverte; "Sem …" no fim', () => {
    expect(agruparZonas(ZONAS, 'nivel_confianca', 'asc', ESCALA).map(g => g.label)).toEqual(['Baixo', 'Alto', 'Sem nível de confiança']);
    expect(agruparZonas(ZONAS, 'nivel_confianca', 'desc', ESCALA).map(g => g.label)).toEqual(['Alto', 'Baixo', 'Sem nível de confiança']);
  });
  it('dentro do grupo, as zonas ficam na ordem que entraram (sort_order do documento legal)', () => {
    const g = agruparZonas(ZONAS, 'macroarea', 'asc');
    expect(g[0].itens.map(z => z.id)).toEqual(['1', '3']);
  });
});
