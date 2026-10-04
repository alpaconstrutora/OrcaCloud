/**
 * Tour guiado — toda âncora de TOUR_STEPS existe no portal correspondente.
 * F3 (04/10/2026), docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * Âncoras: `aba-<id>` vem do botão de aba (`data-tour={`aba-${…}`}` + id na
 * lista de abas do portal); as demais (`menu`, `ajuda`, `conta`) têm que estar
 * literalmente como `data-tour="…"` no arquivo. Quem remover um `data-tour` do
 * portal derruba este teste em vez de deixar o tour pular o passo em silêncio.
 * Também: toda seção de todo portal tem pelo menos um artigo padrão (pedido de
 * 04/10/2026 — Empreendimentos e Chat do Corretor estavam sem).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOUR_STEPS, DEFAULT_ITEMS, PORTAL_SECTIONS, type Portal } from '../utils/portalHelpDefaults';
import { PARTNER_PORTAL_TAB_IDS } from '../utils/partnerPortalTabs';
import { SUPPLIER_PORTAL_TAB_IDS } from '../utils/supplierPortalTabs';
import { BROKER_PORTAL_TAB_IDS } from '../utils/brokerPortalTabs';

const ARQUIVO: Record<Portal, string> = {
  parceiro: 'components/partner/PartnerPortal.tsx',
  fornecedor: 'components/SupplierDashboard.tsx',
  corretor: 'components/BrokerPortal.tsx',
};
const ABAS: Record<Portal, readonly string[]> = {
  parceiro: PARTNER_PORTAL_TAB_IDS,
  fornecedor: SUPPLIER_PORTAL_TAB_IDS,
  corretor: BROKER_PORTAL_TAB_IDS,
};
const PORTAIS: Portal[] = ['parceiro', 'fornecedor', 'corretor'];

describe('âncoras do tour existem nos portais', () => {
  it.each(PORTAIS)('%s', (portal) => {
    const fonte = readFileSync(resolve(__dirname, '..', ARQUIVO[portal]), 'utf-8');
    expect(fonte).toContain('data-tour={`aba-${');
    for (const passo of TOUR_STEPS[portal]) {
      if (passo.anchor.startsWith('aba-')) {
        expect(ABAS[portal], `${passo.key}: aba ${passo.anchor}`).toContain(passo.anchor.slice(4));
      } else {
        expect(fonte, `${passo.key}: data-tour="${passo.anchor}"`).toContain(`data-tour="${passo.anchor}"`);
      }
    }
    // o tour sempre começa pelo menu e todo portal tem o botão de ajuda ancorado
    expect(TOUR_STEPS[portal][0].anchor).toBe('menu');
    expect(fonte).toContain('data-tour="ajuda"');
  });
});

describe('toda seção tem artigo padrão', () => {
  it.each(PORTAIS)('%s', (portal) => {
    const comArtigo = new Set(DEFAULT_ITEMS[portal].filter(d => d.kind === 'artigo').map(d => d.section));
    const semArtigo = PORTAL_SECTIONS[portal].filter(s => !comArtigo.has(s.id)).map(s => s.id);
    expect(semArtigo).toEqual([]);
  });
});
