/**
 * Ajuda dos portais — as seções da ajuda SÃO as abas de cada portal.
 * F2 (04/10/2026), docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * Se alguém criar/renomear uma aba num portal sem passar pela lista de ids
 * (utils/*PortalTabs.ts), a ajuda ficaria falando de uma seção que não existe —
 * ou filtrando (visibleSections) por um id que nunca casa.
 */
import { describe, it, expect } from 'vitest';
import { PORTAL_SECTIONS } from '../utils/portalHelpDefaults';
import { PARTNER_PORTAL_TAB_IDS } from '../utils/partnerPortalTabs';
import { SUPPLIER_PORTAL_TAB_IDS } from '../utils/supplierPortalTabs';
import { BROKER_PORTAL_TAB_IDS } from '../utils/brokerPortalTabs';

describe('PORTAL_SECTIONS ≡ ids das abas dos portais', () => {
  it('parceiro', () => {
    expect(PORTAL_SECTIONS.parceiro.map(s => s.id)).toEqual([...PARTNER_PORTAL_TAB_IDS]);
  });
  it('fornecedor', () => {
    expect(PORTAL_SECTIONS.fornecedor.map(s => s.id)).toEqual([...SUPPLIER_PORTAL_TAB_IDS]);
  });
  it('corretor', () => {
    expect(PORTAL_SECTIONS.corretor.map(s => s.id)).toEqual([...BROKER_PORTAL_TAB_IDS]);
  });
});
