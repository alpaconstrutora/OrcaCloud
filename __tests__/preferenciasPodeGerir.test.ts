/**
 * podeGerirPrancha — quem pode mudar o padrão da PRANCHA da empresa (plano
 * docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 3). Regra pura; o banco (RLS) é a trava final.
 */
import { describe, expect, it } from 'vitest';
import {
  MOTIVO_PRANCHA_SO_GESTOR,
  MOTIVO_PRANCHA_TODAS,
  podeGerirPrancha,
} from '../utils/preferencias/podeGerirPrancha';

describe('podeGerirPrancha', () => {
  it('os textos de motivo são os do plano', () => {
    expect(MOTIVO_PRANCHA_SO_GESTOR).toBe('Só quem administra a organização muda o padrão da prancha.');
    expect(MOTIVO_PRANCHA_TODAS).toBe('O padrão da prancha é de UMA empresa — escolha a organização no topo.');
  });

  it('owner e admin podem', () => {
    expect(podeGerirPrancha({ isAllOrgs: false, membro: { role: 'owner' }, membrosCarregados: true })).toEqual({ pode: true });
    expect(podeGerirPrancha({ isAllOrgs: false, membro: { role: 'admin' }, membrosCarregados: true })).toEqual({ pode: true });
  });

  it('topo em "Todas as organizações" não pode, mesmo sendo owner', () => {
    expect(podeGerirPrancha({ isAllOrgs: true, membro: { role: 'owner' }, membrosCarregados: true })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_TODAS,
    });
  });

  it('"Todas" vence "não carregado": o motivo é o da organização única', () => {
    expect(podeGerirPrancha({ isAllOrgs: true, membro: null, membrosCarregados: false })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_TODAS,
    });
  });

  it('membros ainda não carregados: travado (não libera "por engano")', () => {
    expect(podeGerirPrancha({ isAllOrgs: false, membro: null, membrosCarregados: false })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_SO_GESTOR,
    });
    // mesmo que o membro viesse preenchido, sem a lista carregada não se confia
    expect(podeGerirPrancha({ isAllOrgs: false, membro: { role: 'owner' }, membrosCarregados: false })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_SO_GESTOR,
    });
  });

  it('não é membro da organização: travado', () => {
    expect(podeGerirPrancha({ isAllOrgs: false, membro: null, membrosCarregados: true })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_SO_GESTOR,
    });
  });

  it.each(['member', 'viewer', '', null, undefined, 'ADMIN', 'dono'])('papel %p não gerencia', (role) => {
    expect(podeGerirPrancha({ isAllOrgs: false, membro: { role }, membrosCarregados: true })).toEqual({
      pode: false,
      motivo: MOTIVO_PRANCHA_SO_GESTOR,
    });
  });
});
