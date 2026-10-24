import { describe, expect, it } from 'vitest';
import { EMAILS_ACESSO_TOTAL, temAcessoTotal } from '../lib/acessoTotal';

describe('temAcessoTotal', () => {
  it('libera as duas contas da regra, sem depender de caixa ou espaço', () => {
    expect(temAcessoTotal('altair.rosa@alpaconstrutora.com.br')).toBe(true);
    expect(temAcessoTotal('desenvolvedor@alpaconstrutora.com.br')).toBe(true);
    expect(temAcessoTotal(' Desenvolvedor@AlpaConstrutora.com.br ')).toBe(true);
  });

  it('não libera mais ninguém', () => {
    expect(temAcessoTotal('financeiro@alpaconstrutora.com.br')).toBe(false);
    expect(temAcessoTotal('desenvolvedor@alpaconstrutora.com')).toBe(false);
    expect(temAcessoTotal('')).toBe(false);
    expect(temAcessoTotal(null)).toBe(false);
    expect(temAcessoTotal(undefined)).toBe(false);
  });

  it('a lista fica em minúsculas, senão o includes nunca casa', () => {
    for (const e of EMAILS_ACESSO_TOTAL) expect(e).toBe(e.toLowerCase());
  });
});
