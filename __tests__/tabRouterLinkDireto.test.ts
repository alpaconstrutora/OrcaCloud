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

/**
 * Retorno do link de convite / "esqueci a senha" (26/11/2026, provado em produção):
 * o Supabase volta com `#access_token=…&refresh_token=…&type=recovery` e o cliente
 * do Supabase só lê o hash DEPOIS de adquirir a trava de inicialização (assíncrona).
 * O sync da 1ª renderização do App rodava antes e trocava o hash por `#/central`:
 * a sessão do link se perdia, a tela "Nova senha" abria sem sessão e o salvar
 * dizia "Você não está mais conectado". O hash de retorno da autenticação é do
 * Supabase — ele mesmo o apaga depois de ler.
 */
describe('syncViewToUrl — retorno do link de acesso', () => {
  it('não apaga o hash com a sessão do link (access_token)', () => {
    const hash = '#access_token=eyJ.x.y&expires_at=1&expires_in=3600&refresh_token=abc&token_type=bearer&type=recovery';
    window.history.replaceState(null, '', hash);
    syncViewToUrl('central');
    expect(window.location.hash).toBe(hash);
  });

  it('não apaga o hash com o erro do link (link usado ou vencido)', () => {
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid';
    window.history.replaceState(null, '', hash);
    syncViewToUrl('central');
    expect(window.location.hash).toBe(hash);
  });

  it('depois que o Supabase limpa o hash, escreve a vista normalmente', () => {
    window.history.replaceState(null, '', '#');
    syncViewToUrl('central');
    expect(window.location.hash).toBe('#/central');
  });
});
