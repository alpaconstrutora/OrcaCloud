/**
 * ÒPURA Pro público (14/11/2026, docs/planos/2026-11-14-opura-pro-publico.md, P1).
 * Regra de isolamento na TELA: o endereço do Pro monta a casca do Pro (nunca o <Layout>),
 * e a conta criada pelo Pro (só-Pro) que abrir outro endereço do ÒPURA volta para /pro.
 */
import { describe, it, expect } from 'vitest';
import { ehEnderecoDoPro, contaSoPro, destinoDaContaSoPro, proPublicoAtivo, ORIGEM_PRO } from '../utils/proPublico';

describe('ehEnderecoDoPro', () => {
  it('/pro e subcaminhos são do Pro', () => {
    expect(ehEnderecoDoPro('/pro')).toBe(true);
    expect(ehEnderecoDoPro('/pro/')).toBe(true);
    expect(ehEnderecoDoPro('/pro/entrar')).toBe(true);
  });
  it('outros endereços não são — inclusive os que só começam com "pro"', () => {
    expect(ehEnderecoDoPro('/')).toBe(false);
    expect(ehEnderecoDoPro('/proposta/123')).toBe(false);
    expect(ehEnderecoDoPro('/portal-corretor')).toBe(false);
    expect(ehEnderecoDoPro('/produtos')).toBe(false);
  });
});

describe('contaSoPro', () => {
  it('conta criada pelo Pro (user_metadata.origem = "pro")', () => {
    expect(contaSoPro({ user_metadata: { origem: ORIGEM_PRO } })).toBe(true);
  });
  it('conta interna, sem marca ou sem usuário, não é só-Pro', () => {
    expect(contaSoPro({ user_metadata: {} })).toBe(false);
    expect(contaSoPro({ user_metadata: { origem: 'convite' } })).toBe(false);
    expect(contaSoPro(null)).toBe(false);
    expect(contaSoPro(undefined)).toBe(false);
  });
});

describe('proPublicoAtivo (chave VITE_PRO_PUBLICO)', () => {
  it('desligada: /pro NÃO monta o Pro público (cai no app normal)', () => {
    expect(proPublicoAtivo('/pro', false)).toBe(false);
  });
  it('ligada: /pro monta; outros endereços continuam fora', () => {
    expect(proPublicoAtivo('/pro', true)).toBe(true);
    expect(proPublicoAtivo('/proposta/1', true)).toBe(false);
  });
});

describe('destinoDaContaSoPro', () => {
  const soPro = { user_metadata: { origem: ORIGEM_PRO } };
  const interna = { user_metadata: {} };

  it('conta só-Pro fora do Pro é mandada para /pro (chave ligada)', () => {
    expect(destinoDaContaSoPro('/', soPro, true)).toBe('/pro');
    expect(destinoDaContaSoPro('/portal-cliente', soPro, true)).toBe('/pro');
  });
  it('chave desligada: ninguém é redirecionado', () => {
    expect(destinoDaContaSoPro('/', soPro, false)).toBeNull();
  });
  it('conta só-Pro já no Pro fica onde está', () => {
    expect(destinoDaContaSoPro('/pro', soPro, true)).toBeNull();
  });
  it('conta interna nunca é redirecionada (pode usar o app e o /pro)', () => {
    expect(destinoDaContaSoPro('/', interna, true)).toBeNull();
    expect(destinoDaContaSoPro('/pro', interna, true)).toBeNull();
  });
  it('sem sessão, nada a fazer aqui (o login de cada endereço decide)', () => {
    expect(destinoDaContaSoPro('/', null, true)).toBeNull();
  });
});
