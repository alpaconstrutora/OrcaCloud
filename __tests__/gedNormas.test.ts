import { describe, it, expect } from 'vitest';
import { formatarReferenciaNorma, NORMA_SITUACOES } from '../utils/gedNormas';

describe('formatarReferenciaNorma', () => {
  it('ABNT leva a sigla antes do código e a edição com dois-pontos', () => {
    expect(formatarReferenciaNorma('ABNT', 'NBR 15575-1', '2024')).toBe('ABNT NBR 15575-1:2024');
  });

  it('sem código não há referência', () => {
    expect(formatarReferenciaNorma('ABNT', '', '2024')).toBe('');
    expect(formatarReferenciaNorma('ABNT', '   ', null)).toBe('');
  });

  it('sem edição, só órgão + código', () => {
    expect(formatarReferenciaNorma('ABNT', 'NBR 6118', undefined)).toBe('ABNT NBR 6118');
  });

  it('não duplica a sigla quando o código já a traz', () => {
    expect(formatarReferenciaNorma('ABNT', 'ABNT NBR 9050', '2020')).toBe('ABNT NBR 9050:2020');
    expect(formatarReferenciaNorma('abnt', 'NBR 9050', '2020')).toBe('ABNT NBR 9050:2020');
  });

  it('não duplica a edição quando o código já a traz', () => {
    expect(formatarReferenciaNorma('ABNT', 'NBR 9050:2020', '2020')).toBe('ABNT NBR 9050:2020');
  });

  it('órgãos sem prefixo convencional usam o código como está', () => {
    expect(formatarReferenciaNorma('ISO', 'ISO 9001', '2015')).toBe('ISO 9001:2015');
    expect(formatarReferenciaNorma('MTE (NR)', 'NR-18', '')).toBe('NR-18');
    expect(formatarReferenciaNorma('Corpo de Bombeiros (IT)', 'IT 22', '2019')).toBe('IT 22:2019');
  });

  it('órgão livre (fora da lista) não é prefixado', () => {
    expect(formatarReferenciaNorma('Sabesp', 'NTS 181', '')).toBe('NTS 181');
  });

  it('edição que não começa por ano vai separada por espaço', () => {
    expect(formatarReferenciaNorma('MTE (NR)', 'NR-18', 'Portaria 3.733/2020')).toBe('NR-18 Portaria 3.733/2020');
  });

  it('normaliza espaços', () => {
    expect(formatarReferenciaNorma('  ABNT ', '  NBR   15575-1 ', ' 2024 ')).toBe('ABNT NBR 15575-1:2024');
  });
});

describe('NORMA_SITUACOES', () => {
  it('cobre as três situações aceitas pelo CHECK do banco, sem pílula (§8)', () => {
    expect(Object.keys(NORMA_SITUACOES).sort()).toEqual(['cancelada', 'em_vigor', 'substituida']);
    for (const s of Object.values(NORMA_SITUACOES)) {
      expect(s.className).not.toMatch(/rounded|bg-|uppercase/);
    }
  });
});
