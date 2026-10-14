import { describe, it, expect } from 'vitest';
import { formatarReferenciaNorma, NORMA_SITUACOES, extrairNormaDoNomeDoArquivo, opcoesEdicaoNorma } from '../utils/gedNormas';

describe('opcoesEdicaoNorma', () => {
  it('lista do ano seguinte ao atual até 1970, do mais recente ao mais antigo', () => {
    const o = opcoesEdicaoNorma('', 2026);
    expect(o[0]).toBe('2027');
    expect(o[1]).toBe('2026');
    expect(o[o.length - 1]).toBe('1970');
  });

  it('valor que já é um ano da lista não duplica', () => {
    const o = opcoesEdicaoNorma('2015', 2026);
    expect(o.filter(x => x === '2015')).toHaveLength(1);
  });

  it('valor antigo fora da lista entra no topo, para não ser apagado em silêncio', () => {
    const o = opcoesEdicaoNorma('Portaria 3.733/2020', 2026);
    expect(o[0]).toBe('Portaria 3.733/2020');
    expect(o[1]).toBe('2027');
  });
});

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

describe('extrairNormaDoNomeDoArquivo', () => {
  const casos: [string, { orgao?: string; codigo?: string; edicao?: string }][] = [
    ['NBR 15575-1_2024.pdf', { orgao: 'ABNT', codigo: 'NBR 15575-1', edicao: '2024' }],
    ['ABNT NBR 6118-2023.pdf', { orgao: 'ABNT', codigo: 'NBR 6118', edicao: '2023' }],
    ['ABNT-NBR-6118:2023.pdf', { orgao: 'ABNT', codigo: 'NBR 6118', edicao: '2023' }],
    ['NBR15575-1-2024.PDF', { orgao: 'ABNT', codigo: 'NBR 15575-1', edicao: '2024' }],
    ['nbr_9050.pdf', { orgao: 'ABNT', codigo: 'NBR 9050' }],
    ['ABNT_NBR_ISO_9001-2015.pdf', { orgao: 'ABNT', codigo: 'NBR ISO 9001', edicao: '2015' }],
    ['NBR ISO-IEC 17025 2017.pdf', { orgao: 'ABNT', codigo: 'NBR ISO/IEC 17025', edicao: '2017' }],
    ['NBR ISO/IEC 17025 2017.pdf', { orgao: 'ABNT', codigo: 'NBR ISO/IEC 17025', edicao: '2017' }],
    ['NR-18.pdf', { orgao: 'MTE (NR)', codigo: 'NR-18' }],
    ['NR 35 - Trabalho em Altura.pdf', { orgao: 'MTE (NR)', codigo: 'NR-35' }],
    ['ISO 9001 2015.pdf', { orgao: 'ISO', codigo: 'ISO 9001', edicao: '2015' }],
    ['IEC 60364-5-52.pdf', { orgao: 'IEC', codigo: 'IEC 60364-5-52' }],
    ['IT-22_2019.pdf', { orgao: 'Corpo de Bombeiros (IT)', codigo: 'IT 22', edicao: '2019' }],
    ['ASTM C150.pdf', { orgao: 'ASTM', codigo: 'ASTM C150' }],
    ['NBR 5410 ed 2004.pdf', { orgao: 'ABNT', codigo: 'NBR 5410', edicao: '2004' }],
    // Nomes reais enviados em lote na Alpa em 13/10/2026, antes de existir a extração:
    ['NBR 6492 -REPRESENTACAO DE PROJETOS DE ARQUITETURA.pdf', { orgao: 'ABNT', codigo: 'NBR 6492' }],
    ['NBR-13532-Projeto-de-Arquitetura-.pdf', { orgao: 'ABNT', codigo: 'NBR 13532' }],
    ['Norma-ABNT-NBR-16280.pdf', { orgao: 'ABNT', codigo: 'NBR 16280' }],
    ['NBR 6492 -REPRESENTACAO DE PROJETOS DE ARQUITETURA (1).pdf', { orgao: 'ABNT', codigo: 'NBR 6492' }],
    ['nbr-6118.pdf', { orgao: 'ABNT', codigo: 'NBR 6118' }],
    ['NBR 6122-2010.pdf', { orgao: 'ABNT', codigo: 'NBR 6122', edicao: '2010' }],
  ];
  it.each(casos)('%s', (nome, esperado) => {
    expect(extrairNormaDoNomeDoArquivo(nome)).toEqual(esperado);
  });

  it('nome sem norma reconhecível devolve vazio', () => {
    expect(extrairNormaDoNomeDoArquivo('Memorial descritivo.pdf')).toEqual({});
    expect(extrairNormaDoNomeDoArquivo('Item 3 - Planilha.xlsx')).toEqual({});
    expect(extrairNormaDoNomeDoArquivo('Edital 2024.pdf')).toEqual({});
  });

  it('ano que não vem logo depois do código não é edição', () => {
    expect(extrairNormaDoNomeDoArquivo('NBR 6118 comentada (2019).pdf')).toEqual({ orgao: 'ABNT', codigo: 'NBR 6118' });
  });
});
