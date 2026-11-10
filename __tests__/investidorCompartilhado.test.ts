/**
 * Minha Organização › Investidores (10/11/2026): campo Organização + "Disponível em todas as organizações".
 * Plano: docs/planos/2026-11-10-investidor-organizacao-compartilhado.md.
 *
 * Duas metades: o serviço (quem aparece na lista de cada organização, e o campo derivado que não vai ao banco) e a
 * migration (o compartilhamento diz COM QUEM, e o portal só sai da organização do link para investidor MARCADO).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ALPA = 'org-alpa';
const SPE = 'org-spe';
const OUTRA = 'org-outra';

let linhas: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];

vi.mock('../lib/supabase', () => {
    const chain = (data: unknown) => {
        const c: Record<string, unknown> = {};
        c.eq = () => c;
        c.select = () => c;
        c.single = () => Promise.resolve({ data, error: null });
        c.order = () => Promise.resolve({ data: linhas, error: null });
        return c;
    };
    return {
        supabase: {
            from: () => ({
                select: () => chain(null),
                update: (payload: Record<string, unknown>) => { updates.push(payload); return chain({ id: 'i1' }); },
            }),
            rpc: () => Promise.resolve({ data: '001', error: null }),
        },
    };
});
vi.mock('../services/documentDuplicateCheck', () => ({ assertDocumentNotDuplicated: async () => undefined }));
vi.mock('../services/sinapiService', () => ({ sinapiService: {} }));

import { investorService } from '../services/investorService';

beforeEach(() => {
    updates.length = 0;
    linhas = [
        { id: 'tiago', name: 'Tiago', organization_id: ALPA, is_shared: true, investor_org_shares: [{ target_org_id: ALPA }, { target_org_id: SPE }] },
        { id: 'ana', name: 'Ana', organization_id: ALPA, is_shared: false, investor_org_shares: [] },
        // Desmarcado: destino que sobrou não basta (o gatilho apaga, mas a tela não depende disso).
        { id: 'bia', name: 'Bia', organization_id: OUTRA, is_shared: false, investor_org_shares: [{ target_org_id: SPE }] },
    ];
});

describe('investorService.listInvestors — quem aparece em cada organização', () => {
    it('na organização dona: os dela, compartilhados ou não', async () => {
        expect((await investorService.listInvestors(ALPA)).map(i => i.id)).toEqual(['tiago', 'ana']);
    });

    it('num destino: só o MARCADO e compartilhado com ela', async () => {
        expect((await investorService.listInvestors(SPE)).map(i => i.id)).toEqual(['tiago']);
    });

    it('em "Todas": tudo o que a RLS entregou, com os destinos achatados e sem o embed', async () => {
        const todos = await investorService.listInvestors(undefined);
        expect(todos.map(i => i.id)).toEqual(['tiago', 'ana', 'bia']);
        expect(todos[0]._shared_org_ids).toEqual([ALPA, SPE]);
        expect(todos[0]).not.toHaveProperty('investor_org_shares');
    });

    it('editar: os destinos (derivados) não vão no UPDATE; a marca vai', async () => {
        await investorService.saveInvestor({ id: 'i1', name: 'Tiago', is_shared: true, _shared_org_ids: [SPE] });
        expect(updates[0]).not.toHaveProperty('_shared_org_ids');
        expect(updates[0].is_shared).toBe(true);
    });
});

/** A migration sem os comentários de linha (o CI não tem credencial do banco: a trava é no texto). */
const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', 'aplicar_20271110950000_investidor_compartilhado.sql'), 'utf-8',
).replace(/^\s*--.*$/gm, ' ');
const funcao = (nome: string) => {
    const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
    return sql.slice(i, sql.indexOf('$function$;', i));
};

describe('migration do investidor compartilhado', () => {
    it('a leitura do cadastro nunca libera por `is_shared` sozinho, nem por organização nula', () => {
        const policy = sql.slice(sql.indexOf('CREATE POLICY "investors_select"'), sql.indexOf(';', sql.indexOf('CREATE POLICY "investors_select"')));
        expect(policy).toMatch(/is_shared AND EXISTS \(/);
        expect(policy).not.toMatch(/OR\s+is_shared\s*\)/);
        expect(policy).not.toMatch(/IS NULL/);
    });

    it('a tabela de destino não tem policy de escrita e fecha para anon', () => {
        expect(sql.match(/CREATE POLICY[^;]*ON public\.investor_org_shares[^;]*;/g)).toHaveLength(1);
        expect(sql).toMatch(/CREATE POLICY "ios_select" ON public\.investor_org_shares\s+FOR SELECT TO authenticated/);
        expect(sql).toMatch(/REVOKE ALL ON TABLE public\.investor_org_shares FROM anon;/);
        expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.investor_org_shares FROM authenticated;/);
    });

    it('o destino são as organizações DE QUEM MARCOU (nunca `CROSS JOIN organizations`), e desmarcar apaga', () => {
        const gatilho = funcao('fn_investor_compartilhamento');
        expect(gatilho).toMatch(/FROM public\.organization_members om/);
        expect(gatilho).not.toMatch(/CROSS JOIN/i);
        expect(gatilho).toMatch(/DELETE FROM public\.investor_org_shares WHERE investor_id = NEW\.id/);
    });

    it('as organizações do portal só passam da dona quando o investidor está marcado', () => {
        expect(funcao('fn_orgs_do_investidor')).toMatch(/WHERE i\.id = p_investor_id AND i\.is_shared/);
        expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_orgs_do_investidor\(uuid\) FROM authenticated;/);
        expect(sql).not.toMatch(/GRANT[^;]*fn_orgs_do_investidor/);
    });

    it('as funções do portal deixam de filtrar pela organização do link; a fronteira segue o vínculo do investidor', () => {
        for (const nome of ['fn_investor_portal_get_summary', 'fn_investor_portal_get_milestones', 'fn_investor_portal_get_spes']) {
            const corpo = funcao(nome);
            expect(corpo, nome).toMatch(/v_orgs\s+:= public\.fn_orgs_do_investidor\(v_inv_id\)/);
            expect(corpo, nome).not.toMatch(/v_org_id/);
        }
        for (const nome of ['fn_investor_portal_get_espelho', 'fn_investor_get_espelho']) {
            expect(funcao(nome), nome).toMatch(/unnest\(public\.fn_orgs_do_investidor\(/);
        }
    });

    it('não reescreve as duas funções do espelho (a definição vigente é a da migration das vistas)', () => {
        expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fn_espelho_de_vendas_das_obras/);
        expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fn_obras_do_investidor/);
    });

    it('o link do portal segue sendo de anon; a do app, só de authenticated', () => {
        for (const f of ['fn_investor_portal_get_espelho', 'fn_investor_portal_get_summary', 'fn_investor_portal_get_milestones', 'fn_investor_portal_get_spes']) {
            expect(sql, f).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\(TEXT\\) TO anon, authenticated;`));
        }
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_investor_get_espelho\(UUID\) TO authenticated;/);
    });
});
