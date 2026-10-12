import { describe, it, expect } from 'vitest';
import { avaliarEdicaoImovib } from '../hooks/useImovibEdicao';

/** Item 4.6 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md. */

const base = { desenvolvedor: false, orgCarregada: true };

describe('avaliarEdicaoImovib — permissão canEditImovib na org do estudo', () => {
    it('desenvolvedor sempre edita', () => {
        expect(avaliarEdicaoImovib({ ...base, desenvolvedor: true, membro: null }).pode).toBe(true);
    });

    it('org ainda não carregada: libera (a RLS continua valendo no banco)', () => {
        expect(avaliarEdicaoImovib({ ...base, orgCarregada: false, membro: null }).pode).toBe(true);
    });

    it('não é membro da org do estudo: só leitura, com motivo', () => {
        const r = avaliarEdicaoImovib({ ...base, membro: null });
        expect(r.pode).toBe(false);
        expect(r.motivo).toMatch(/não é membro/);
    });

    it('admin e owner editam mesmo com canEditImovib = false', () => {
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'admin', permissions: { canEditImovib: false } } }).pode).toBe(true);
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'owner', permissions: { canEditImovib: false } } }).pode).toBe(true);
    });

    it('canEditImovib definido no membro vale', () => {
        const negado = avaliarEdicaoImovib({ ...base, membro: { role: 'member', permissions: { canEditImovib: false } } });
        expect(negado.pode).toBe(false);
        expect(negado.motivo).toMatch(/Permissões Detalhadas/);
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'viewer', permissions: { canEditImovib: true } } }).pode).toBe(true);
    });

    it('sem definição: padrão do papel — member edita, viewer não (getDefaultPermissions)', () => {
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'member', permissions: {} } }).pode).toBe(true);
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'member', permissions: null } }).pode).toBe(true);
        expect(avaliarEdicaoImovib({ ...base, membro: { role: 'viewer', permissions: {} } }).pode).toBe(false);
    });
});
