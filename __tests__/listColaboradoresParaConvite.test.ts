/**
 * laborService.listColaboradoresParaConvite — a lista do campo "Colaborador" do convite de
 * Usuários: colaboradores da organização + os disponibilizados para ela, só com as colunas que
 * o seletor usa (sem `*` nem alocações). Pedido de 16/11 (2º), item 7 de
 * docs/planos/2026-11-16-usuarios-convidar-colaborador.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const consultas: { tabela: string; select?: string; filtros: string[]; or?: string }[] = [];
const respostas: Record<string, { data: unknown; error: unknown }> = {};

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => {
            const c: (typeof consultas)[number] = { tabela, filtros: [] };
            consultas.push(c);
            const cadeia = {
                select: (s: string) => { c.select = s; return cadeia; },
                eq: (col: string, val: unknown) => { c.filtros.push(`${col}=${val}`); return cadeia; },
                or: (expr: string) => { c.or = expr; return cadeia; },
                order: () => cadeia,
                then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
                    Promise.resolve(respostas[tabela]).then(ok, erro),
            };
            return cadeia;
        },
    },
}));

import { laborService } from '../services/laborService';

beforeEach(() => { consultas.length = 0; });

describe('listColaboradoresParaConvite', () => {
    it('traz os da organização e os disponibilizados, com as colunas do seletor', async () => {
        respostas.employee_org_shares = { data: [{ employee_id: 'e9' }], error: null };
        respostas.employees = { data: [{ id: 'e1', name: 'Ana' }, { id: 'e9', name: 'Bia' }], error: null };
        const r = await laborService.listColaboradoresParaConvite('org-1');
        expect(r.map(e => e.id)).toEqual(['e1', 'e9']);
        expect(consultas[0]).toMatchObject({ tabela: 'employee_org_shares', filtros: ['target_org_id=org-1'] });
        const emp = consultas[1];
        expect(emp.tabela).toBe('employees');
        expect(emp.or).toBe('org_id.eq.org-1,id.in.(e9)');
        expect(emp.select!.split(',').map(s => s.trim()).sort())
            .toEqual(['email', 'id', 'name', 'org_id', 'role', 'status', 'user_id']);
    });

    it('sem disponibilizados, só a organização', async () => {
        respostas.employee_org_shares = { data: [], error: null };
        respostas.employees = { data: [], error: null };
        await laborService.listColaboradoresParaConvite('org-1');
        expect(consultas[1].or).toBe('org_id.eq.org-1');
    });

    it('erro do banco sobe (a tela desliga o campo com o motivo)', async () => {
        respostas.employee_org_shares = { data: null, error: { message: 'falhou' } };
        await expect(laborService.listColaboradoresParaConvite('org-1')).rejects.toMatchObject({ message: 'falhou' });
    });
});
