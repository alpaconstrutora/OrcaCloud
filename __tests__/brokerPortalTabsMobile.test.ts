import { describe, it, expect } from 'vitest';
import { abasDoCelular, abasHabilitadas, BROKER_PORTAL_TAB_IDS } from '../utils/brokerPortalTabs';

// Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (D2, D6, D8).
describe('abasHabilitadas — "Configurar abas visíveis do corretor"', () => {
  it('sem configuração = todas', () => {
    expect(abasHabilitadas(undefined)).toEqual([...BROKER_PORTAL_TAB_IDS]);
    expect(abasHabilitadas({ brokerPortalTabs: [] })).toEqual([...BROKER_PORTAL_TAB_IDS]);
  });

  it('com configuração = só as escolhidas, id desconhecido descartado', () => {
    expect(abasHabilitadas({ brokerPortalTabs: ['propostas', 'xpto', 'estoque'] })).toEqual(['estoque', 'propostas']);
  });
});

describe('abasDoCelular — barra inferior × Mais', () => {
  it('tudo habilitado: 4 na barra pela prioridade do celular, resto no Mais, sem Saúde', () => {
    const { barra, mais } = abasDoCelular(abasHabilitadas(null));
    expect(barra).toEqual(['empreendimentos', 'estoque', 'propostas', 'comissoes']);
    expect(mais).toEqual(['leads', 'materiais', 'chat', 'agenda', 'ranking', 'treinamento', 'analytics']);
    expect([...barra, ...mais]).not.toContain('saude');
  });

  it('aba oculta pela configuração não aparece nem na barra nem no Mais', () => {
    const { barra, mais } = abasDoCelular(['estoque', 'propostas', 'comissoes', 'materiais', 'chat', 'leads']);
    expect(barra).toEqual(['estoque', 'propostas', 'comissoes', 'leads']);
    expect(mais).toEqual(['materiais', 'chat']);
    expect([...barra, ...mais]).not.toContain('empreendimentos');
  });

  it('até 5 habilitadas: todas na barra, sem Mais (o caso do print)', () => {
    expect(abasDoCelular(['empreendimentos', 'propostas', 'comissoes', 'materiais', 'chat']))
      .toEqual({ barra: ['empreendimentos', 'propostas', 'comissoes', 'materiais', 'chat'], mais: [] });
    expect(abasDoCelular(['propostas', 'chat'])).toEqual({ barra: ['propostas', 'chat'], mais: [] });
  });

  it('só Saúde habilitada: nada no celular', () => {
    expect(abasDoCelular(['saude'])).toEqual({ barra: [], mais: [] });
  });
});
