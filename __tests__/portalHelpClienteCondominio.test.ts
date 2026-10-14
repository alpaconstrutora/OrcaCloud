/**
 * Portal do Cliente — o Condomínio no tour e na ajuda.
 * 14/10/2026, docs/planos/2026-10-14-ajuda-tour-portal-cliente.md
 *
 * A 1ª entrega deixou o Condomínio só com um artigo genérico: nenhum passo no
 * tour do portal, nenhum "como usar esta tela", nenhuma pergunta. O usuário
 * apontou ("no tour guiado faltou todo o condominio?"; "nao so o tour mais
 * ajuda do condomínio tambem nao foi implementado").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOURS, DEFAULT_ITEMS, CHECKLIST_ITEMS, mergePortalHelp } from '../utils/portalHelpDefaults';

describe('Portal do Cliente › Condomínio', () => {
  it('o tour do portal passa pelo Condomínio e pelas seções dele', () => {
    const ancoras = TOURS.cliente.geral.map(p => p.anchor);
    expect(ancoras).toContain('aba-condominio');
    expect(ancoras).toContain('condominio-secoes');
  });

  it('o Condomínio tem o seu "como usar esta tela"', () => {
    expect(TOURS.cliente.porAba.condominio?.map(p => p.anchor)).toEqual(['condominio-predio', 'condominio-secoes', 'condominio-conteudo']);
  });

  it('a central tem artigos das seções do Condomínio e perguntas dele', () => {
    const artigos = DEFAULT_ITEMS.cliente.filter(d => d.kind === 'artigo' && d.section === 'condominio');
    expect(artigos.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_ITEMS.cliente.filter(d => d.kind === 'faq' && d.section === 'condominio').length).toBeGreaterThanOrEqual(3);
    // e só para quem tem o Condomínio liberado
    const semCondominio = mergePortalHelp('cliente', [], { visibleSections: ['dashboard', 'financeiro'] });
    expect(semCondominio.articles.some(a => a.section === 'condominio')).toBe(false);
    expect(semCondominio.tours.condominio).toBeUndefined();
  });

  it('"Primeiros passos" tem um item do Condomínio', () => {
    expect(CHECKLIST_ITEMS.cliente.some(i => i.section === 'condominio')).toBe(true);
  });

  it('Portais › Portal do Condômino (espelho do morador) tem ajuda e tour, em modo prévia', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'components/condominio/PortalCondominoAdmin.tsx'), 'utf-8');
    expect(fonte).toContain('<PortalHelp');
    expect(fonte).toContain('portal="cliente"');
    expect(fonte).toMatch(/modoPrevia\b/);
    expect(fonte).toContain("forcarTour={tourPedido > 0 ? 'condominio' : null}");
  });
});
