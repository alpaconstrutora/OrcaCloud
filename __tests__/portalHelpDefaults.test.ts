/**
 * Ajuda dos portais externos — conteúdo padrão + junção com o banco.
 * Pedido de 03/10/2026, docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. chaves padrão únicas por portal e toda `section` existe nas abas do portal;
 *   2. mergePortalHelp: sobrescrita pela chave troca título/corpo; sobrescrita
 *      despublicada OCULTA o padrão; item próprio entra publicado e some
 *      despublicado; `visibleSections` tira a ajuda de aba oculta (Geral fica);
 *      ordem por sort_order;
 *   3. htmlToText não é sink e tira tags/entidades para a busca.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITEMS, PORTAL_SECTIONS, TOUR_STEPS, TOURS, mergePortalHelp, htmlToText, hashText, sectionLabel, tourLabel,
  type Portal, type PortalHelpRow,
} from '../utils/portalHelpDefaults';
import { chaveDoTour } from '../utils/portalTour';
import { PARTNER_PORTAL_TAB_IDS } from '../utils/partnerPortalTabs';

const PORTAIS: Portal[] = ['parceiro', 'fornecedor', 'corretor'];

const row = (o: Partial<PortalHelpRow> & Pick<PortalHelpRow, 'id'>): PortalHelpRow => ({
  kind: 'artigo', default_key: null, section: null, title: 't', body_html: '<p>b</p>',
  sort_order: 0, is_published: true, ...o,
});

describe('conteúdo padrão', () => {
  it.each(PORTAIS)('%s: chaves únicas, prefixadas pelo portal, e seções existentes', (portal) => {
    const keys = DEFAULT_ITEMS[portal].map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(k => k.startsWith(`${portal}.`))).toBe(true);
    const secoes = new Set(PORTAL_SECTIONS[portal].map(s => s.id));
    for (const d of DEFAULT_ITEMS[portal]) {
      if (d.section !== null) expect(secoes.has(d.section), `${d.key} → seção ${d.section}`).toBe(true);
      expect(d.title.length).toBeGreaterThan(5);
      expect(d.body_html).toMatch(/^<p>|^<ul>/);
    }
    for (const t of TOUR_STEPS[portal]) {
      expect(t.key.startsWith(`${portal}.tour.`)).toBe(true);
      if (t.section !== null) expect(secoes.has(t.section)).toBe(true);
    }
    expect(DEFAULT_ITEMS[portal].some(d => d.kind === 'faq')).toBe(true);
    expect(DEFAULT_ITEMS[portal].some(d => d.kind === 'artigo')).toBe(true);
  });

  it('seções do Parceiro são exatamente as abas do portal', () => {
    expect(PORTAL_SECTIONS.parceiro.map(s => s.id)).toEqual([...PARTNER_PORTAL_TAB_IDS]);
  });

  it('sectionLabel: id desconhecido ou null cai em Geral', () => {
    expect(sectionLabel('parceiro', null)).toBe('Geral');
    expect(sectionLabel('parceiro', 'nao-existe')).toBe('Geral');
    expect(sectionLabel('parceiro', 'contratos')).toBe('Contratos');
  });
});

describe('mergePortalHelp', () => {
  const primeiro = DEFAULT_ITEMS.parceiro.find(d => d.kind === 'artigo')!;
  const faqPadrao = DEFAULT_ITEMS.parceiro.find(d => d.kind === 'faq')!;

  it('sem linhas devolve o padrão inteiro, com origin=padrao', () => {
    const m = mergePortalHelp('parceiro', null);
    const total = DEFAULT_ITEMS.parceiro.length;
    expect(m.articles.length + m.faqs.length).toBe(total);
    expect(m.articles.every(a => a.origin === 'padrao' && a.rowId === null)).toBe(true);
    expect(m.tour).toHaveLength(TOUR_STEPS.parceiro.length);
  });

  it('sobrescrita pela chave troca título e corpo e marca personalizado', () => {
    const m = mergePortalHelp('parceiro', [row({ id: 'r1', default_key: primeiro.key, title: 'Meu título', body_html: '<p>meu</p>' })]);
    const it = m.articles.find(a => a.key === primeiro.key)!;
    expect(it.title).toBe('Meu título');
    expect(it.body_html).toBe('<p>meu</p>');
    expect(it.origin).toBe('personalizado');
    expect(it.rowId).toBe('r1');
  });

  it('sobrescrita despublicada OCULTA o padrão (e includeHidden o traz de volta para o editor)', () => {
    const rows = [row({ id: 'r1', default_key: primeiro.key, is_published: false, title: primeiro.title })];
    expect(mergePortalHelp('parceiro', rows).articles.some(a => a.key === primeiro.key)).toBe(false);
    expect(mergePortalHelp('parceiro', rows, { includeHidden: true }).articles.some(a => a.key === primeiro.key)).toBe(true);
  });

  it('item próprio entra publicado e some despublicado; vai para a lista do seu kind', () => {
    const rows = [
      row({ id: 'p1', kind: 'faq', title: 'Pergunta própria', section: 'financeiro' }),
      row({ id: 'p2', kind: 'artigo', title: 'Artigo oculto', is_published: false }),
    ];
    const m = mergePortalHelp('parceiro', rows);
    const f = m.faqs.find(x => x.rowId === 'p1')!;
    expect(f.origin).toBe('proprio');
    expect(f.key).toBeNull();
    expect(m.articles.some(x => x.rowId === 'p2')).toBe(false);
  });

  it('visibleSections tira a ajuda de aba oculta; Geral (section null) fica', () => {
    const m = mergePortalHelp('parceiro', null, { visibleSections: ['dashboard'] });
    expect(m.articles.some(a => a.section === 'contratos')).toBe(false);
    expect(m.articles.some(a => a.section === null)).toBe(true);
    expect(m.articles.some(a => a.section === 'dashboard')).toBe(true);
    // tour: passo de aba oculta sai, passo geral fica
    expect(m.tour.some(t => t.section === 'documentos')).toBe(false);
    expect(m.tour.some(t => t.section === null)).toBe(true);
  });

  it('ordem: sort_order manda; padrão segue a ordem de declaração', () => {
    const rows = [row({ id: 'p1', title: 'Primeiro de tudo', sort_order: -5 })];
    const m = mergePortalHelp('parceiro', rows);
    expect(m.articles[0].title).toBe('Primeiro de tudo');
    const semLinhas = mergePortalHelp('parceiro', null).articles.map(a => a.key);
    expect(semLinhas).toEqual(DEFAULT_ITEMS.parceiro.filter(d => d.kind === 'artigo').map(d => d.key));
  });

  it('tour: sobrescrita troca título/texto (HTML vira texto) e despublicada oculta o passo', () => {
    const passo = TOUR_STEPS.parceiro[0];
    const m = mergePortalHelp('parceiro', [row({ id: 't1', kind: 'tour', default_key: passo.key, title: 'Olá', body_html: '<p>Bem-vindo <strong>você</strong></p>' })]);
    expect(m.tour[0]).toMatchObject({ key: passo.key, title: 'Olá', body: 'Bem-vindo você', origin: 'personalizado', anchor: passo.anchor });
    const oculto = mergePortalHelp('parceiro', [row({ id: 't1', kind: 'tour', default_key: passo.key, is_published: false })]);
    expect(oculto.tour.some(t => t.key === passo.key)).toBe(false);
  });

  it('linha de tour com kind=tour sem chave não vira artigo', () => {
    const m = mergePortalHelp('parceiro', [row({ id: 'x', kind: 'tour', title: 'solto' })]);
    expect(m.articles.some(a => a.rowId === 'x')).toBe(false);
    expect(m.faqs.some(a => a.rowId === 'x')).toBe(false);
  });

  it('FAQ padrão também aceita sobrescrita', () => {
    const m = mergePortalHelp('parceiro', [row({ id: 'f1', kind: 'faq', default_key: faqPadrao.key, title: 'Trocada' })]);
    expect(m.faqs.find(f => f.key === faqPadrao.key)!.title).toBe('Trocada');
  });
});

describe('htmlToText / hashText', () => {
  it('tira tags, converte entidades e junta espaços', () => {
    expect(htmlToText('<p>Olá <strong>mundo</strong></p><ul><li>a &amp; b</li><li>c</li></ul>')).toBe('Olá mundo a & b c');
    expect(htmlToText('<img src=x onerror="alert(1)">texto')).toBe('texto');
    expect(htmlToText(null)).toBe('');
  });
  it('hash estável e distinto', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });
});

describe('tours: geral + por aba (v2, 04/10/2026)', () => {
  it('TOUR_STEPS é o tour geral (compat) e merge.tour === merge.tours.geral', () => {
    for (const p of PORTAIS) {
      expect(TOUR_STEPS[p]).toBe(TOURS[p].geral);
      const m = mergePortalHelp(p, null);
      expect(m.tour).toBe(m.tours.geral);
    }
  });

  it('tours traz o geral e só as abas com passo; cada passo sabe o seu tour', () => {
    const m = mergePortalHelp('parceiro', null);
    expect(Object.keys(m.tours)).toEqual(['geral', ...Object.keys(TOURS.parceiro.porAba)]);
    expect(m.tours.documentos.every(x => x.tour === 'documentos')).toBe(true);
    expect(m.tours.geral.every(x => x.tour === 'geral')).toBe(true);
  });

  it('visibleSections tira o mini-tour da aba oculta e os passos do geral daquela aba', () => {
    const m = mergePortalHelp('parceiro', null, { visibleSections: ['dashboard', 'documentos'] });
    expect(m.tours.contratos).toBeUndefined();
    expect(m.tours.documentos).toBeDefined();
    expect(m.tours.geral.some(x => x.section === 'contratos')).toBe(false);
    expect(m.tours.geral.some(x => x.anchor === 'documentos-enviar')).toBe(true);
  });

  it('sobrescrita despublicada oculta o passo no tour dele; mini-tour sem passo some', () => {
    const passos = TOURS.parceiro.porAba.dashboard!;
    const rows = passos.map((x, i) => row({ id: `d${i}`, kind: 'tour', default_key: x.key, is_published: false }));
    const m = mergePortalHelp('parceiro', rows);
    expect(m.tours.dashboard).toBeUndefined();
    expect(mergePortalHelp('parceiro', rows, { includeHidden: true }).tours.dashboard).toHaveLength(passos.length);
  });

  it('chave do "já viu": tour geral sem sufixo (marcas antigas valem); aba com sufixo', () => {
    expect(chaveDoTour('parceiro', 'tok')).toBe('portalHelp:tour:parceiro:tok');
    expect(chaveDoTour('parceiro', 'tok', 'geral')).toBe('portalHelp:tour:parceiro:tok');
    expect(chaveDoTour('parceiro', 'tok', 'documentos')).toBe('portalHelp:tour:parceiro:tok:documentos');
  });

  it('tourLabel', () => {
    expect(tourLabel('parceiro', 'geral')).toBe('Tour do portal');
    expect(tourLabel('parceiro', 'financeiro')).toBe('Como usar: Financeiro');
  });

  it('passo com `quando` só no que depende de dado (texto começa com "quando")', () => {
    for (const p of PORTAIS) {
      for (const lista of [TOURS[p].geral, ...Object.values(TOURS[p].porAba)]) {
        for (const x of lista ?? []) if (x.quando) expect(x.quando).toMatch(/^quando /);
      }
    }
  });
});
