/**
 * Plano docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md, F4: um detalhe só para o
 * investidor (link) e o gestor (app). As RPCs do link e a do gestor fazem a MESMA conta (o miolo é uma função
 * interna); muda só o portão.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve(__dirname, '../supabase/migrations/aplicar_20271125300000_oportunidade_vista_do_gestor.sql'), 'utf-8');
const corpoDe = (funcao: string) =>
    sql.split(new RegExp(String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${funcao}\(`, 'i'))[1].split(/\n\$\$;/)[0];

describe('o link e o gestor fazem a mesma conta', () => {
    it('as RPCs do link mantêm o portão (token, org do investidor, publicada) e chamam o miolo', () => {
        const pares: [string, string][] = [
            ['fn_investor_portal_get_obra', 'fn_oportunidade_obra_ao_vivo'],
            ['fn_investor_portal_get_acompanhamento', 'fn_oportunidade_acompanhamento'],
        ];
        for (const [rpc, miolo] of pares) {
            const c = corpoDe(rpc);
            expect(c, rpc).toMatch(/expires_at > NOW\(\)/);
            expect(c, rpc).toMatch(/fn_orgs_do_investidor\(v_tok\.investor_id\)/);
            expect(c, rpc).toMatch(/is_published = TRUE/);
            expect(c, rpc).toContain(`public.${miolo}(v_opp)`);
        }
    });

    it('o portão do gestor é ser membro da org da oportunidade; anon não executa; o miolo ninguém executa direto', () => {
        expect(corpoDe('fn_oportunidade_vista_do_gestor')).toMatch(/organization_id IN \(SELECT public\.minhas_orgs_membro\(\)\)/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_oportunidade_vista_do_gestor\(uuid\) FROM PUBLIC, anon;/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_oportunidade_obra_ao_vivo\(public\.investor_opportunities\) FROM PUBLIC, anon, authenticated;/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_oportunidade_acompanhamento\(public\.investor_opportunities\) FROM PUBLIC, anon, authenticated;/);
    });

    it('o miolo do acompanhamento continua só com somas (nenhum lançamento nem negociação)', () => {
        const c = corpoDe('fn_oportunidade_acompanhamento');
        expect(c).toMatch(/sum\(m\.saidas\)/);
        expect(c).not.toMatch(/jsonb_agg/);
    });
});
