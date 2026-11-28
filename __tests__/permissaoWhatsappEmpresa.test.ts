import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { podeUsarWhatsappEmpresa, MOTIVO_SEM_WHATSAPP_EMPRESA } from '../utils/permissaoWhatsappEmpresa';

// Piloto WhatsApp pelo OpenWA (23/11/2026), Tarefa 6. Regra igual à do banco (`wa_pode_usar`,
// migration aplicar_20271123100500): só a flag própria liga; acesso total sempre pode; nada herda.
describe('permissão "Usar o WhatsApp da empresa"', () => {
    it('liga só com canUseWhatsappEmpresa === true', () => {
        expect(podeUsarWhatsappEmpresa({ permissoes: { canUseWhatsappEmpresa: true }, acessoTotal: false })).toBe(true);
        expect(podeUsarWhatsappEmpresa({ permissoes: { canUseWhatsappEmpresa: false }, acessoTotal: false })).toBe(false);
        expect(podeUsarWhatsappEmpresa({ permissoes: { canUseWhatsappEmpresa: 'true' }, acessoTotal: false })).toBe(false);
        expect(podeUsarWhatsappEmpresa({ permissoes: {}, acessoTotal: false })).toBe(false);
        expect(podeUsarWhatsappEmpresa({ permissoes: null, acessoTotal: false })).toBe(false);
        expect(podeUsarWhatsappEmpresa({ permissoes: undefined, acessoTotal: false })).toBe(false);
        // nada herda: editar pedidos, gerenciar usuários ou configurações não liga o WhatsApp
        expect(podeUsarWhatsappEmpresa({
            permissoes: { canEditOrders: true, canManageUsers: true, canEditSettings: true },
            acessoTotal: false,
        })).toBe(false);
    });

    it('acesso total (superadmin) pode sempre', () => {
        expect(podeUsarWhatsappEmpresa({ permissoes: {}, acessoTotal: true })).toBe(true);
        expect(podeUsarWhatsappEmpresa({ permissoes: undefined, acessoTotal: true })).toBe(true);
    });

    it('o motivo do botão desligado diz qual permissão pedir e onde', () => {
        expect(MOTIVO_SEM_WHATSAPP_EMPRESA).toBe(
            'O envio pelo número do ÒPURA depende da permissão "Usar o WhatsApp da empresa" (Minha organização › Usuários).',
        );
    });
});

describe('Usuários › padrões e Permissões detalhadas', () => {
    it('vem desligada para todos os papéis, owner e admin inclusive (o resto do admin segue ligado)', async () => {
        const { getDefaultPermissions } = await import('../components/OrganizationUsers');
        for (const papel of ['owner', 'admin', 'member', 'viewer'] as const) {
            const p = getDefaultPermissions(papel) as Record<string, unknown>;
            expect(p.canUseWhatsappEmpresa).toBe(false);
        }
        expect((getDefaultPermissions('admin') as Record<string, unknown>).canEditOrders).toBe(true);
    });

    it('tem grupo próprio "WhatsApp": marcar o grupo "Geral" não liga o WhatsApp', async () => {
        const { DETAILED_PERMISSIONS } = await import('../components/OrganizationUsers');
        const w = DETAILED_PERMISSIONS.find(x => x.view === 'canUseWhatsappEmpresa')!;
        expect(w).toBeTruthy();
        expect(w.group).toBe('WhatsApp');
        expect(w.title).toBe('Usar o WhatsApp da empresa');
        expect(w.edit).toBeUndefined();
        expect(DETAILED_PERMISSIONS.filter(x => x.group === 'WhatsApp')).toHaveLength(1);
        expect(DETAILED_PERMISSIONS.filter(x => x.group === 'Geral').some(x => x.view === 'canUseWhatsappEmpresa')).toBe(false);
    });
});
