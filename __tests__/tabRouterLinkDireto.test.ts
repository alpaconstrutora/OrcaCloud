// @vitest-environment jsdom
/**
 * O sync da vista com o hash não pode apagar a query do link direto
 * (`#/blueprint?studyId=…`): a vista carregada sob demanda monta depois do
 * sync e lê o parâmetro dali. Achado da prova no app real (02/10/2026).
 */
import { describe, expect, it } from 'vitest';
import { parseHashView, syncViewToUrl } from '../lib/tabRouter';

describe('syncViewToUrl', () => {
  it('mesma vista: preserva a query do link direto', () => {
    window.history.replaceState(null, '', '#/blueprint?studyId=abc');
    syncViewToUrl('blueprint');
    expect(window.location.hash).toBe('#/blueprint?studyId=abc');
    expect(parseHashView(window.location.hash)).toBe('blueprint');
  });

  it('outra vista: reescreve (e a query da vista anterior vai embora)', () => {
    window.history.replaceState(null, '', '#/blueprint?studyId=abc');
    syncViewToUrl('empreendimentos');
    expect(window.location.hash).toBe('#/empreendimentos');
  });

  it('sem hash: escreve a vista', () => {
    window.history.replaceState(null, '', '#');
    syncViewToUrl('central');
    expect(window.location.hash).toBe('#/central');
  });
});
