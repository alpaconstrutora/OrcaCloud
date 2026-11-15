import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Financeiro › Extratos › Credor: o colaborador aparece na conta de uma organização
 * quando é DELA ou foi disponibilizado para ela (RH › Colaboradores › "Disponibilizar
 * Colaborador" = `employee_org_shares`). Até 15/11/2026 o Extrato filtrava só por
 * `org_id IN (orgs que a conta atende)` e ignorava a disponibilização — conta que
 * atende "todas" listava todo mundo, e a Inter (só a dona) escondia Rogério e iago,
 * da Garden, disponibilizados para a Alpa.
 */

const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
let compartilhados: { employee_id: string }[] = [];
let colaboradores: { id: string; name: string }[] = [];

vi.mock('../lib/supabase', () => {
    const construtor = (tabela: string) => {
        const q: Record<string, unknown> = {};
        const registrar = (metodo: string) => (...args: unknown[]) => {
            chamadas.push({ tabela, metodo, args });
            return q;
        };
        for (const m of ['select', 'eq', 'or', 'order']) q[m] = registrar(m);
        q.then = (r: (v: unknown) => unknown) =>
            Promise.resolve({
                data: tabela === 'employee_org_shares' ? compartilhados : colaboradores,
                error: null,
            }).then(r);
        return q;
    };
    return { supabase: { from: (t: string) => construtor(t) } };
});

import { laborService } from '../services/laborService';

const doEmployees = (metodo: string) =>
    chamadas.filter(c => c.tabela === 'employees' && c.metodo === metodo).map(c => c.args);

describe('laborService.listCredoresColaboradoresDaOrg', () => {
    beforeEach(() => {
        chamadas.length = 0;
        compartilhados = [];
        colaboradores = [{ id: 'e1', name: 'Nei' }];
    });

    it('sem disponibilizados: só os colaboradores PRÓPRIOS da organização, ativos', async () => {
        const r = await laborService.listCredoresColaboradoresDaOrg('org-garden');
        expect(chamadas).toContainEqual({ tabela: 'employee_org_shares', metodo: 'eq', args: ['target_org_id', 'org-garden'] });
        expect(doEmployees('or')).toEqual([['org_id.eq.org-garden']]);
        expect(doEmployees('eq')).toEqual([['status', 'ATIVO']]);
        // CC e plano do colaborador: o Pagamento Avulso preenche o título com eles.
        expect(doEmployees('select')).toEqual([['id, name, cost_center_id, plano_de_contas_id']]);
        expect(r).toEqual([{ id: 'e1', name: 'Nei' }]);
    });

    it('com disponibilizados: próprios OU os ids disponibilizados para ela', async () => {
        compartilhados = [{ employee_id: 'e7' }, { employee_id: 'e9' }];
        await laborService.listCredoresColaboradoresDaOrg('org-alpa');
        expect(doEmployees('or')).toEqual([['org_id.eq.org-alpa,id.in.(e7,e9)']]);
    });

    it('nunca filtra pelas organizações que a conta "atende também" — só pela org pedida', async () => {
        await laborService.listCredoresColaboradoresDaOrg('org-alpa');
        expect(chamadas.some(c => c.metodo === 'in')).toBe(false);
    });
});
