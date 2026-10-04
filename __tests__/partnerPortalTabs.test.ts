import { describe, expect, it } from 'vitest';
import {
  PARTNER_PORTAL_TAB_IDS,
  PARTNER_CONTRACT_TAB_IDS,
  enabledPartnerPortalTabs,
  togglePartnerPortalTab,
  enabledPartnerContractTabs,
  togglePartnerContractTab,
} from '../utils/partnerPortalTabs';

describe('enabledPartnerPortalTabs', () => {
  it('sem configuração, todas as abas ficam visíveis', () => {
    expect(enabledPartnerPortalTabs(undefined)).toEqual([...PARTNER_PORTAL_TAB_IDS]);
    expect(enabledPartnerPortalTabs(null)).toEqual([...PARTNER_PORTAL_TAB_IDS]);
    expect(enabledPartnerPortalTabs({})).toEqual([...PARTNER_PORTAL_TAB_IDS]);
    expect(enabledPartnerPortalTabs({ partnerPortalTabs: null })).toEqual([...PARTNER_PORTAL_TAB_IDS]);
  });

  it('lista vazia é "nenhuma aba", não "todas"', () => {
    expect(enabledPartnerPortalTabs({ partnerPortalTabs: [] })).toEqual([]);
  });

  it('respeita a ordem canônica e descarta ids desconhecidos', () => {
    expect(enabledPartnerPortalTabs({ partnerPortalTabs: ['solicitacoes', 'xpto', 'dashboard'] }))
      .toEqual(['dashboard', 'solicitacoes']);
  });
});

describe('togglePartnerPortalTab', () => {
  it('desliga uma aba ligada', () => {
    expect(togglePartnerPortalTab(['dashboard', 'contratos'], 'contratos')).toEqual(['dashboard']);
  });

  it('liga uma aba desligada na posição canônica', () => {
    expect(togglePartnerPortalTab(['dashboard', 'financeiro'], 'contratos'))
      .toEqual(['dashboard', 'contratos', 'financeiro']);
  });

  it('desligar a última aba deixa a lista vazia', () => {
    expect(togglePartnerPortalTab(['dashboard'], 'dashboard')).toEqual([]);
  });
});

describe('enabledPartnerContractTabs (sub-abas do detalhe do contrato)', () => {
  // 8 desde 04/10/2026: + 'documentos' (versões emitidas na aba Emissão).
  it('sem configuração, as 8 sub-abas ficam visíveis', () => {
    expect(PARTNER_CONTRACT_TAB_IDS).toHaveLength(8);
    expect(PARTNER_CONTRACT_TAB_IDS).toContain('documentos');
    expect(enabledPartnerContractTabs(undefined)).toEqual([...PARTNER_CONTRACT_TAB_IDS]);
    expect(enabledPartnerContractTabs({ partnerContractTabs: null })).toEqual([...PARTNER_CONTRACT_TAB_IDS]);
  });

  it('lista vazia é "nenhuma sub-aba", não "todas"', () => {
    expect(enabledPartnerContractTabs({ partnerContractTabs: [] })).toEqual([]);
  });

  it('respeita a ordem canônica e descarta ids desconhecidos', () => {
    expect(enabledPartnerContractTabs({ partnerContractTabs: ['penalties', 'dashboard', 'items'] }))
      .toEqual(['items', 'penalties']);
  });

  it('a lista do contrato e a do portal são independentes', () => {
    const settings = { partnerPortalTabs: ['contratos'], partnerContractTabs: ['measurements'] };
    expect(enabledPartnerPortalTabs(settings)).toEqual(['contratos']);
    expect(enabledPartnerContractTabs(settings)).toEqual(['measurements']);
    expect(enabledPartnerContractTabs({ partnerPortalTabs: [] })).toEqual([...PARTNER_CONTRACT_TAB_IDS]);
  });
});

describe('togglePartnerContractTab', () => {
  it('liga na posição canônica e desliga', () => {
    expect(togglePartnerContractTab(['overview', 'retention'], 'items')).toEqual(['overview', 'items', 'retention']);
    expect(togglePartnerContractTab(['overview', 'items'], 'overview')).toEqual(['items']);
  });
});
