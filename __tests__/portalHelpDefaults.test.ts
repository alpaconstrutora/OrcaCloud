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
  DEFAULT_ITEMS, PORTAL_SECTIONS, TOUR_STEPS, TOURS, CHECKLIST_ITEMS, mergePortalHelp, htmlToText, hashText, sectionLabel, tourLabel, ancorasDoTour, todosOsPassos,
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

describe('tour: passos próprios e ordem (F6, 04/10/2026)', () => {
  const docs = TOURS.parceiro.porAba.documentos!;

  it('passo próprio (kind=tour sem default_key, com âncora) entra no tour dele, origem proprio, key null', () => {
    const m = mergePortalHelp('parceiro', [row({ id: 'p1', kind: 'tour', anchor: 'documentos-busca', tour_id: 'documentos', section: 'documentos', title: 'Da casa', body_html: '<p>oi <strong>você</strong></p>', sort_order: 15 })]);
    const t = m.tours.documentos;
    expect(t.map(x => x.title)).toEqual([docs[0].title, 'Da casa', ...docs.slice(1).map(x => x.title)]);
    const meu = t[1];
    expect(meu).toMatchObject({ key: null, rowId: 'p1', origin: 'proprio', anchor: 'documentos-busca', tour: 'documentos', body: 'oi você' });
    expect(m.tours.geral.some(x => x.rowId === 'p1')).toBe(false);
  });

  it('tour_id nulo = tour do portal; sem âncora o passo próprio não entra; sort_order 0 vai para o fim', () => {
    const m = mergePortalHelp('parceiro', [
      row({ id: 'g1', kind: 'tour', anchor: 'ajuda', tour_id: null, title: 'No fim' }),
      row({ id: 'x', kind: 'tour', title: 'Sem âncora' }),
    ]);
    expect(m.tours.geral[m.tours.geral.length - 1].title).toBe('No fim');
    expect(Object.values(m.tours).flat().some(x => x.rowId === 'x')).toBe(false);
  });

  it('passo próprio cria o "como usar" de uma aba que não tinha passo padrão', () => {
    const m = mergePortalHelp('corretor', [row({ id: 'r1', kind: 'tour', anchor: 'aba-ranking', tour_id: 'ranking', section: 'ranking', title: 'Seu ranking' })]);
    expect(m.tours.ranking?.map(x => x.title)).toEqual(['Seu ranking']);
    // e some se a aba estiver oculta para o externo
    expect(mergePortalHelp('corretor', [row({ id: 'r1', kind: 'tour', anchor: 'aba-ranking', tour_id: 'ranking', section: 'ranking', title: 'x' })], { visibleSections: ['estoque'] }).tours.ranking).toBeUndefined();
  });

  it('sobrescrita com sort_order reposiciona o padrão; 0 mantém; só mover NÃO personaliza', () => {
    const g = TOURS.parceiro.geral;
    const m = mergePortalHelp('parceiro', [row({ id: 'o1', kind: 'tour', default_key: g[0].key, title: g[0].title, body_html: g[0].body, sort_order: 25 })]);
    // 25 fica entre o 2º (20) e o 3º (30)
    expect(m.tours.geral.map(x => x.key).slice(0, 3)).toEqual([g[1].key, g[0].key, g[2].key]);
    expect(m.tours.geral[1]).toMatchObject({ origin: 'padrao', rowId: 'o1', sort_order: 25 });
    const zero = mergePortalHelp('parceiro', [row({ id: 'o1', kind: 'tour', default_key: g[0].key, title: 'Outro título', sort_order: 0 })]);
    expect(zero.tours.geral[0]).toMatchObject({ key: g[0].key, title: 'Outro título', origin: 'personalizado', sort_order: 10 });
  });

  it('catálogo de âncoras: todo elemento dos passos padrão + o botão de cada aba, sem repetir', () => {
    for (const p of PORTAIS) {
      const cat = ancorasDoTour(p);
      const ancoras = cat.map(c => c.anchor);
      expect(new Set(ancoras).size).toBe(ancoras.length);
      for (const passo of todosOsPassos(p)) expect(ancoras, `${p}: ${passo.anchor}`).toContain(passo.anchor);
      for (const aba of PORTAL_SECTIONS[p]) expect(ancoras).toContain(`aba-${aba.id}`);
      // cromo vem primeiro e com nome legível
      expect(cat[0].section).toBeNull();
      expect(cat.find(c => c.anchor === 'menu')?.label).toBe('Menu do portal');
    }
  });
});

describe('Primeiros passos (F8, 04/10/2026)', () => {
  it.each(PORTAIS)('%s: itens com chave única do portal, aba existente e evento válido', (portal) => {
    const itens = CHECKLIST_ITEMS[portal];
    expect(itens.length).toBeGreaterThanOrEqual(3);
    const chaves = itens.map(i => i.key);
    expect(new Set(chaves).size).toBe(chaves.length);
    const abas = new Set(PORTAL_SECTIONS[portal].map(x => x.id));
    for (const i of itens) {
      expect(i.key.startsWith(`${portal}.checklist.`)).toBe(true);
      expect(abas.has(i.section), `${i.key}: aba ${i.section}`).toBe(true);
      expect(i.evento).toMatch(/^(aba|acao):[a-z-]+$/);
      if (i.evento.startsWith('aba:')) expect(abas.has(i.evento.slice(4))).toBe(true);
    }
    // um evento marca um item só (senão o "x de n" pula de dois em dois)
    const eventos = itens.map(i => i.evento);
    expect(new Set(eventos).size).toBe(eventos.length);
  });

  it('a construtora renomeia e oculta pela chave; aba oculta tira o item', () => {
    const c = CHECKLIST_ITEMS.parceiro;
    const m = mergePortalHelp('parceiro', [
      row({ id: 'k1', kind: 'checklist', default_key: c[0].key, title: 'Veja os contratos da obra' }),
      row({ id: 'k2', kind: 'checklist', default_key: c[1].key, title: c[1].title, is_published: false }),
    ]);
    expect(m.checklist[0]).toMatchObject({ key: c[0].key, title: 'Veja os contratos da obra', origin: 'personalizado', rowId: 'k1' });
    expect(m.checklist.some(x => x.key === c[1].key)).toBe(false);
    expect(mergePortalHelp('parceiro', null, { visibleSections: ['documentos'] }).checklist.map(x => x.key)).toEqual(c.filter(x => x.section === 'documentos').map(x => x.key));
  });

  it('linha kind=checklist não vira artigo nem pergunta', () => {
    const m = mergePortalHelp('parceiro', [row({ id: 'z', kind: 'checklist', default_key: null, title: 'solto' })]);
    expect(m.articles.some(a => a.rowId === 'z')).toBe(false);
    expect(m.faqs.some(a => a.rowId === 'z')).toBe(false);
  });
});
