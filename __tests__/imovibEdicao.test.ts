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

// Plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md, F3.2: edição de versão aberta por outra
// pessoa deixa o estudo só para leitura — inclusive para o desenvolvedor (o banco recusa do mesmo jeito).
import { travaDaEdicaoDeVersao } from '../hooks/useImovibEdicao';

describe('travaDaEdicaoDeVersao — só quem abriu a edição grava', () => {
    const aberta = { version_id: 'v1', version_label: 'Cenário banco', started_by: 'u-ana', started_by_name: 'Ana', started_at: '2026-11-19T17:05:00Z' };

    it('aberta por outra pessoa: só leitura, com quem, qual versão e desde quando', () => {
        expect(travaDaEdicaoDeVersao({ pode: true }, aberta, 'u-bruno')).toEqual({
            pode: false, motivo: '«Ana» está editando a versão «Cenário banco» desde 19/11 14:05 — o estudo está só para leitura.',
        });
    });

    it('aberta por mim: segue a permissão de sempre', () => {
        expect(travaDaEdicaoDeVersao({ pode: true }, aberta, 'u-ana')).toEqual({ pode: true });
        expect(travaDaEdicaoDeVersao({ pode: false, motivo: 'x' }, aberta, 'u-ana')).toEqual({ pode: false, motivo: 'x' });
    });

    it('sem edição aberta: não muda nada', () => {
        expect(travaDaEdicaoDeVersao({ pode: true }, null, 'u-bruno')).toEqual({ pode: true });
    });
});
