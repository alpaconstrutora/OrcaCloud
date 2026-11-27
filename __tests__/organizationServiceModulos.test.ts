/**
 * organizationService.salvarModulosDaOrganizacao (27/11/2026) — grava SÓ a chave dos
 * módulos, sobre o `settings` lido do banco agora. docs/planos/2026-11-27-modulos-por-organizacao.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
    settingsNoBanco: {} as Record<string, unknown>,
    gravado: null as null | Record<string, unknown>,
    linhasAtualizadas: [{ id: 'o1' }] as unknown[],
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: { settings: estado.settingsNoBanco }, error: null }) }) }),
            update: (valores: Record<string, unknown>) => {
                estado.gravado = valores;
                return { eq: () => ({ select: async () => ({ data: estado.linhasAtualizadas, error: null }) }) };
            },
        }),
    },
}));

import { organizationService } from '../services/organizationService';

beforeEach(() => {
    estado.settingsNoBanco = {};
    estado.gravado = null;
    estado.linhasAtualizadas = [{ id: 'o1' }];
});

describe('salvarModulosDaOrganizacao', () => {
    it('mantém o resto do settings do banco e guarda só os desligados', async () => {
        estado.settingsNoBanco = { tax_recognition_regime: 'COMPETENCIA', module_visibility: { platform: {} }, modulos_da_organizacao: { rh: false } };
        await organizationService.salvarModulosDaOrganizacao('o1', { obras: false, rh: true, financeiro: true });
        expect(estado.gravado).toEqual({
            settings: { tax_recognition_regime: 'COMPETENCIA', module_visibility: { platform: {} }, modulos_da_organizacao: { obras: false } },
        });
    });

    it('update recusado pela RLS (nenhuma linha) vira erro com o motivo', async () => {
        estado.linhasAtualizadas = [];
        await expect(organizationService.salvarModulosDaOrganizacao('o1', { obras: false }))
            .rejects.toThrow(/proprietário ou um administrador/);
    });
});
