/**
 * Permissão de editar as Áreas NBR 12721 (Fase 10 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`) — a mesma regra que o
 * banco aplica em `fn_pode_editar_areas_nbr12721` (provada lá num bloco que
 * aborta: member+false não, member+true sim, member sem chave sim, viewer sem
 * chave não, admin+false sim, outra org não).
 */
import { describe, expect, it } from 'vitest';
import { avaliarEdicaoAreasNbr12721, MOTIVO_SEM_PERMISSAO_AREAS } from '../hooks/useAreasNbr12721Edicao';

const a = (membro: { role?: string; permissions?: Record<string, unknown> } | null, extra: Partial<{ desenvolvedor: boolean; orgCarregada: boolean }> = {}) =>
  avaliarEdicaoAreasNbr12721({ desenvolvedor: false, orgCarregada: true, membro, ...extra });

describe('avaliarEdicaoAreasNbr12721', () => {
  it('papel × chave, como no banco', () => {
    expect(a({ role: 'member', permissions: { canEditAreaEngine: false } })).toEqual({ pode: false, motivo: MOTIVO_SEM_PERMISSAO_AREAS });
    expect(a({ role: 'member', permissions: { canEditAreaEngine: true } }).pode).toBe(true);
    expect(a({ role: 'member', permissions: {} }).pode).toBe(true);
    expect(a({ role: 'viewer', permissions: {} }).pode).toBe(false);
    expect(a({ role: 'admin', permissions: { canEditAreaEngine: false } }).pode).toBe(true);
    expect(a({ role: 'owner' }).pode).toBe(true);
  });

  it('não-membro não pode (com o motivo); org não carregada e desenvolvedor passam', () => {
    expect(a(null).pode).toBe(false);
    expect(a(null).motivo).toMatch(/não é membro/);
    expect(a(null, { orgCarregada: false }).pode).toBe(true);
    expect(a({ role: 'viewer' }, { desenvolvedor: true }).pode).toBe(true);
  });
});
