/**
 * Portão do Asaas (F59, 18/11/2026): `avaliarDisparo` recalcula a isenção de alçada NO SERVIDOR
 * (fn_org_e_condominio), não pelos campos do título que o membro edita. Título em RASCUNHO só
 * sai em condomínio de verdade; erro na consulta = não é condomínio (fecha).
 * Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md.
 */
import { describe, it, expect } from 'vitest';
import { avaliarDisparo, type TituloAPagar } from '../supabase/functions/_shared/asaasDisparo';

type Resposta = { data: unknown; error: { message: string } | null };

function adminFalso(condominio: Resposta) {
    const rpcs: { fn: string; args: unknown }[] = [];
    const consulta = () => {
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, {
            select: chain, eq: chain, in: chain, gte: chain, or: chain, limit: chain,
            maybeSingle: async () => ({ data: null, error: null }),
            then: (ok: (v: unknown) => void) => ok({ data: [], error: null }),
        });
        return q;
    };
    return {
        rpcs,
        admin: {
            rpc: async (fn: string, args: unknown) => { rpcs.push({ fn, args }); return condominio; },
            from: () => consulta(),
        },
    };
}

const TITULO: TituloAPagar = {
    id: 't1', organization_id: 'org-a', amount: 120, direction: 'DEBIT', status: 'PENDING',
    business_status: 'PREVISTO', approval_status: 'RASCUNHO', due_date: null, transaction_date: null,
    source_system: 'MANUAL', party_type: 'SUPPLIER', party_name: 'Fornecedor', supplier_id: 's1',
    employee_id: null, reference_id: null, description: 'x', darf_id: null,
};
const CONTA = { paymentAccountId: 'pa1', organizationId: 'org-a', piloto: false, tetos: null } as never;

describe('avaliarDisparo — alçada recalculada no servidor', () => {
    it('RASCUNHO fora de condomínio: bloqueado mesmo abaixo de qualquer faixa', async () => {
        const { admin, rpcs } = adminFalso({ data: false, error: null });
        const r = await avaliarDisparo(admin, { titulo: TITULO, conta: CONTA, ehGestor: true, avulso: false });
        expect(rpcs).toEqual([{ fn: 'fn_org_e_condominio', args: { p_organization_id: 'org-a' } }]);
        expect(r.bloqueios).toEqual(['O título não passou pela alçada (Financeiro › Aprovações).']);
    });

    it('título marcado RETIDO pelo membro: a marca não conta, continua bloqueado', async () => {
        const { admin } = adminFalso({ data: false, error: null });
        const r = await avaliarDisparo(admin, { titulo: { ...TITULO, business_status: 'RETIDO' }, conta: CONTA, ehGestor: true, avulso: false });
        expect(r.bloqueios.join(' ')).toMatch(/não passou pela alçada/);
    });

    it('RASCUNHO em condomínio de verdade passa', async () => {
        const { admin } = adminFalso({ data: true, error: null });
        const r = await avaliarDisparo(admin, { titulo: TITULO, conta: CONTA, ehGestor: true, avulso: false });
        expect(r.fatos.orgDeCondominio).toBe(true);
        expect(r.bloqueios).toEqual([]);
    });

    it('erro ao conferir condomínio fecha', async () => {
        const { admin } = adminFalso({ data: null, error: { message: 'x' } });
        const r = await avaliarDisparo(admin, { titulo: TITULO, conta: CONTA, ehGestor: true, avulso: false });
        expect(r.fatos.orgDeCondominio).toBe(false);
        expect(r.bloqueios.join(' ')).toMatch(/não passou pela alçada/);
    });

    it('APROVADO não consulta condomínio e passa; DARF não aprovado aponta o DARF', async () => {
        const aprovado = adminFalso({ data: false, error: null });
        const r1 = await avaliarDisparo(aprovado.admin, { titulo: { ...TITULO, approval_status: 'APROVADO' }, conta: CONTA, ehGestor: true, avulso: false });
        expect(aprovado.rpcs).toEqual([]);
        expect(r1.bloqueios).toEqual([]);
        const darf = adminFalso({ data: false, error: null });
        const r2 = await avaliarDisparo(darf.admin, { titulo: { ...TITULO, darf_id: 'd1' }, conta: CONTA, ehGestor: true, avulso: false });
        expect(r2.bloqueios[0]).toMatch(/DARF que não foi aprovado/);
    });
});
