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
import { TOURS, TOUR_STEPS, DEFAULT_ITEMS, PORTAL_SECTIONS, todosOsPassos, type Portal } from '../utils/portalHelpDefaults';
import { PARTNER_PORTAL_TAB_IDS } from '../utils/partnerPortalTabs';
import { SUPPLIER_PORTAL_TAB_IDS } from '../utils/supplierPortalTabs';
import { BROKER_PORTAL_TAB_IDS } from '../utils/brokerPortalTabs';

// Arquivos onde as âncoras de cada portal podem estar: a casca + os filhos que
// desenham o conteúdo das abas. O primeiro é o arquivo do portal.
const ARQUIVOS: Record<Portal, string[]> = {
  parceiro: ['components/partner/PartnerPortal.tsx', 'components/partner/PartnerPortalFinanceiro.tsx'],
  fornecedor: ['components/SupplierDashboard.tsx'],
  corretor: ['components/BrokerPortal.tsx'],
};
const fonteDe = (portal: Portal) =>
  ARQUIVOS[portal].map(f => readFileSync(resolve(__dirname, '..', f), 'utf-8')).join('\n');
const ABAS: Record<Portal, readonly string[]> = {
  parceiro: PARTNER_PORTAL_TAB_IDS,
  fornecedor: SUPPLIER_PORTAL_TAB_IDS,
  corretor: BROKER_PORTAL_TAB_IDS,
};
const PORTAIS: Portal[] = ['parceiro', 'fornecedor', 'corretor'];

describe('âncoras do tour existem nos portais', () => {
  it.each(PORTAIS)('%s', (portal) => {
    const fonte = fonteDe(portal);
    expect(fonte).toContain('data-tour={`aba-${');
    for (const passo of todosOsPassos(portal)) {
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

  it.each(PORTAIS)('%s: mini-tours só de abas que existem, com passos da própria aba', (portal) => {
    const abas = new Set(PORTAL_SECTIONS[portal].map(x => x.id));
    for (const [aba, passos] of Object.entries(TOURS[portal].porAba)) {
      expect(abas.has(aba), `mini-tour de aba inexistente: ${aba}`).toBe(true);
      for (const passo of passos ?? []) {
        expect(passo.tour).toBe(aba);
        expect(passo.section, `${passo.key} aponta para outra aba`).toBe(aba);
      }
      // sem âncora repetida dentro do mesmo tour
      const ancoras = (passos ?? []).map(x => x.anchor);
      expect(new Set(ancoras).size).toBe(ancoras.length);
    }
    const geral = TOURS[portal].geral.map(x => x.anchor);
    expect(new Set(geral).size).toBe(geral.length);
  });

  it.each(PORTAIS)('%s: chaves de passo únicas no portal', (portal) => {
    const chaves = todosOsPassos(portal).map(x => x.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('toda seção tem artigo padrão', () => {
  it.each(PORTAIS)('%s', (portal) => {
    const comArtigo = new Set(DEFAULT_ITEMS[portal].filter(d => d.kind === 'artigo').map(d => d.section));
    const semArtigo = PORTAL_SECTIONS[portal].filter(s => !comArtigo.has(s.id)).map(s => s.id);
    expect(semArtigo).toEqual([]);
  });
});
