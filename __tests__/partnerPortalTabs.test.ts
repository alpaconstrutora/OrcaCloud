import { describe, expect, it } from 'vitest';
import {
  PARTNER_PORTAL_TAB_IDS,
  enabledPartnerPortalTabs,
  togglePartnerPortalTab,
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
