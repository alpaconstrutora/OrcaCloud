/**
 * `portal-invite-user` · morador convidado pelo Portal do Síndico (G6, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O síndico é EXTERNO e o link do Portal do Cliente abre tudo o que a pessoa tem com a
 * organização. Trava de fonte (a Edge é Deno; o portão tem de estar no CÓDIGO — REGRA #7):
 *  • a autorização do banco (`sindico_portal_morador_autorizar_convite`, credencial de quem
 *    chamou) vem ANTES de garantir o token e de gerar o link;
 *  • pela porta do síndico, só portal cliente;
 *  • o link (`action_link`) só vai no e-mail — a resposta nunca o traz.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fonte = readFileSync(path.join(process.cwd(), 'supabase', 'functions', 'portal-invite-user', 'index.ts'), 'utf8');

describe('portal-invite-user · porta do síndico', () => {
    it('o banco autoriza com a credencial de quem chamou ANTES do token e do link', () => {
        const usuario = fonte.indexOf('await exigirUsuario(req)');
        const rpc = fonte.indexOf("rpc('sindico_portal_morador_autorizar_convite'");
        expect(usuario).toBeGreaterThan(0);
        expect(rpc).toBeGreaterThan(usuario);
        expect(fonte.indexOf('await garantirTokenDoPortal(')).toBeGreaterThan(rpc);
        expect(fonte.indexOf('admin.auth.admin.generateLink(')).toBeGreaterThan(rpc);
        expect(fonte).toMatch(/comoChamador = createClient\(supabaseUrl, Deno\.env\.get\('SUPABASE_ANON_KEY'\) \?\? '', \{\s*global: \{ headers: \{ Authorization: req\.headers\.get\('Authorization'\)/);
    });

    it('pela porta do síndico só se convida morador (portal cliente)', () => {
        expect(fonte).toMatch(/pelaPortaDoSindico !== undefined && portal !== 'cliente'/);
    });

    it('o link nunca volta na resposta — só no e-mail', () => {
        const respostas = [...fonte.matchAll(/return json\(\{([^}]*)\}/g)].map(m => m[1]);
        expect(respostas.length).toBeGreaterThan(0);
        for (const r of respostas) expect(r).not.toMatch(/actionLink|action_link/);
    });
});
