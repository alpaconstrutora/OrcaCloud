/**
 * Gestão de treinamentos fora do RH — permissão própria, herdando do RH.
 * Plano: docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md
 */
import { describe, it, expect } from 'vitest';
import { podeVerTreinamentos, podeEditarTreinamentos } from '../utils/permissaoTreinamentos';

describe('podeVerTreinamentos', () => {
  it('sem nada gravado herda do RH (quem gerenciava continua gerenciando)', () => {
    expect(podeVerTreinamentos({ permissoes: {}, matrizDoCargo: {}, podeVerRh: true })).toBe(true);
    expect(podeVerTreinamentos({ permissoes: null, matrizDoCargo: null, podeVerRh: false })).toBe(false);
  });
  it('permissão própria vence o RH nos dois sentidos', () => {
    // segurança do trabalho: sem RH, com Treinamentos
    expect(podeVerTreinamentos({ permissoes: { canViewLabor: false, canViewTrainings: true }, matrizDoCargo: {}, podeVerRh: false })).toBe(true);
    // RH sem Treinamentos
    expect(podeVerTreinamentos({ permissoes: { canViewTrainings: false }, matrizDoCargo: {}, podeVerRh: true })).toBe(false);
  });
  it('matriz do cargo entra antes da herança, depois da permissão do usuário', () => {
    expect(podeVerTreinamentos({ permissoes: {}, matrizDoCargo: { treinamentos: true }, podeVerRh: false })).toBe(true);
    expect(podeVerTreinamentos({ permissoes: { canViewTrainings: false }, matrizDoCargo: { treinamentos: true }, podeVerRh: true })).toBe(false);
  });
});

describe('podeEditarTreinamentos', () => {
  it('admin sempre edita', () => {
    expect(podeEditarTreinamentos({ permissoes: { canEditTrainings: false }, administrador: true })).toBe(true);
  });
  it('própria → RH → como era (quem vê, edita)', () => {
    expect(podeEditarTreinamentos({ permissoes: { canEditTrainings: false, canEditLabor: true }, administrador: false })).toBe(false);
    expect(podeEditarTreinamentos({ permissoes: { canEditLabor: false }, administrador: false })).toBe(false);
    expect(podeEditarTreinamentos({ permissoes: {}, administrador: false })).toBe(true);
  });
});
