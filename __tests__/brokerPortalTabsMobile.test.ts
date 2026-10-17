import { describe, it, expect } from 'vitest';
import { abasDoCelular, abasHabilitadas, ABAS_DE_DEMONSTRACAO, BROKER_PORTAL_TAB_IDS } from '../utils/brokerPortalTabs';

// Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (D2, D6, D8, D9).
const REAIS = BROKER_PORTAL_TAB_IDS.filter(id => !ABAS_DE_DEMONSTRACAO.includes(id));

describe('abasHabilitadas — "Configurar abas visíveis do corretor"', () => {
  it('sem configuração = todas as que têm dados reais', () => {
    expect(abasHabilitadas(undefined)).toEqual(REAIS);
    expect(abasHabilitadas({ brokerPortalTabs: [] })).toEqual(REAIS);
  });

  it('com configuração = só as escolhidas, id desconhecido descartado', () => {
    expect(abasHabilitadas({ brokerPortalTabs: ['propostas', 'xpto', 'estoque'] })).toEqual(['estoque', 'propostas']);
  });

  it('as cinco que eram demonstração voltaram com dado real (17/10); aba de demonstração nunca entra', () => {
    expect(abasHabilitadas({ brokerPortalTabs: ['propostas', 'chat', 'leads', 'agenda', 'treinamento'] })).toEqual(['propostas', 'leads', 'treinamento', 'agenda', 'chat']);
    expect(ABAS_DE_DEMONSTRACAO).toEqual([]);
    for (const demo of ABAS_DE_DEMONSTRACAO) expect(abasHabilitadas(null)).not.toContain(demo);
  });
});

describe('abasDoCelular — barra inferior × Mais', () => {
  it('tudo habilitado: 4 na barra pela prioridade do celular, resto no Mais, sem Saúde', () => {
    const { barra, mais } = abasDoCelular(abasHabilitadas(null));
    expect(barra).toEqual(['empreendimentos', 'estoque', 'propostas', 'comissoes']);
    expect(mais).toEqual(['leads', 'chat', 'materiais', 'agenda', 'treinamento', 'ranking', 'analytics']);
    expect([...barra, ...mais]).not.toContain('saude');
  });

  it('aba oculta pela configuração não aparece nem na barra nem no Mais', () => {
    const { barra, mais } = abasDoCelular(abasHabilitadas({ brokerPortalTabs: ['estoque', 'propostas', 'comissoes', 'materiais', 'chat', 'leads'] }));
    expect(barra).toEqual(['estoque', 'propostas', 'comissoes', 'leads']);
    expect(mais).toEqual(['chat', 'materiais']);
    expect([...barra, ...mais]).not.toContain('empreendimentos');
  });

  it('o caso do print (Geleia): as 5 cabem, sem Mais (o Chat voltou com dado real em 17/10)', () => {
    expect(abasDoCelular(abasHabilitadas({ brokerPortalTabs: ['empreendimentos', 'propostas', 'comissoes', 'materiais', 'chat'] })))
      .toEqual({ barra: ['empreendimentos', 'propostas', 'comissoes', 'chat', 'materiais'], mais: [] });
  });

  it('só Saúde habilitada: nada no celular', () => {
    expect(abasDoCelular(['saude'])).toEqual({ barra: [], mais: [] });
  });
});
