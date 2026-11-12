import { describe, it, expect } from 'vitest';
import { motivoVinculoUsuarioBloqueado, MOTIVO_VINCULO_SO_GESTOR } from '../lib/vinculoColaboradorUsuario';

// Espelha o gatilho trg_employees_vinculo_so_gestor
// (aplicar_20271112800000_vinculo_colaborador_e_envolvidos_trava.sql).
describe('motivoVinculoUsuarioBloqueado', () => {
    it('owner e admin vinculam', () => {
        expect(motivoVinculoUsuarioBloqueado({ desenvolvedor: false, orgCarregada: true, papel: 'owner' })).toBeNull();
        expect(motivoVinculoUsuarioBloqueado({ desenvolvedor: false, orgCarregada: true, papel: 'admin' })).toBeNull();
    });

    it('member, viewer e quem não é membro não vinculam — com o motivo', () => {
        for (const papel of ['member', 'viewer', null, undefined]) {
            expect(motivoVinculoUsuarioBloqueado({ desenvolvedor: false, orgCarregada: true, papel }))
                .toBe(MOTIVO_VINCULO_SO_GESTOR);
        }
    });

    it('desenvolvedor vincula em qualquer org', () => {
        expect(motivoVinculoUsuarioBloqueado({ desenvolvedor: true, orgCarregada: true, papel: 'member' })).toBeNull();
    });

    it('org ainda não carregada não trava a tela (o banco segue valendo)', () => {
        expect(motivoVinculoUsuarioBloqueado({ desenvolvedor: false, orgCarregada: false, papel: null })).toBeNull();
    });

    it('o motivo diz quem pode', () => {
        expect(MOTIVO_VINCULO_SO_GESTOR).toMatch(/owner ou admin/);
    });
});
