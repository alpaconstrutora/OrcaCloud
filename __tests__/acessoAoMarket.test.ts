// Quem entra no ÒPURA Market (decisão D5: só administrador e usuário interno).
//
// Até 10/10/2026 esta regra só se provava lendo o código: a única conta de teste
// era do grupo USUARIO. Aqui cada valor de `ProfileGroup` tem resposta esperada,
// e um grupo novo no enum quebra o teste até alguém decidir se ele entra.
import { describe, it, expect } from 'vitest';
import { ProfileGroup } from '../types';
import { podeAcessarMarket } from '../utils/acessoAoMarket';

const ESPERADO: Record<ProfileGroup, boolean> = {
  [ProfileGroup.USER]: true,
  [ProfileGroup.DEVELOPER]: true,
  [ProfileGroup.CLIENT]: false,
  [ProfileGroup.INVESTOR]: false,
  [ProfileGroup.SUPPLIER]: false,
  [ProfileGroup.BROKER]: false,
  [ProfileGroup.PARTNER]: false,
  [ProfileGroup.LENDER]: false,
};

describe('ÒPURA Market — quem entra', () => {
  it('todo grupo do enum tem resposta decidida aqui', () => {
    expect(Object.keys(ESPERADO).sort()).toEqual(Object.values(ProfileGroup).sort());
  });

  it.each(Object.entries(ESPERADO))('grupo %s → %s', (grupo, entra) => {
    expect(podeAcessarMarket(grupo, false)).toBe(entra);
  });

  it('e-mail de desenvolvedor entra em qualquer grupo', () => {
    for (const grupo of Object.values(ProfileGroup)) expect(podeAcessarMarket(grupo, true)).toBe(true);
  });

  it('sem grupo (sessão carregando) não entra', () => {
    expect(podeAcessarMarket(null, false)).toBe(false);
    expect(podeAcessarMarket(undefined, false)).toBe(false);
  });
});
