/**
 * Trava das migrations da captura de boletos por e-mail (item 5.7 do plano
 * docs/planos/2026-10-15-captura-boletos-por-email.md).
 *
 * Lê o TEXTO das migrations (o CI não tem credencial do banco — mesma razão de
 * segurancaMigrations.test.ts) e exige as decisões que, se escorregarem numa
 * edição futura, abrem buraco sem quebrar nada visível:
 *  - RLS nas três tabelas, nada para anon;
 *  - a senha da caixa só sai do Vault para service_role (REVOKE literal de
 *    PUBLIC, anon E authenticated nas três funções);
 *  - authenticated não cria conta direto (é a Edge Function que testa a senha);
 *  - importação automática de remetente só para gestor;
 *  - busca de fornecedor recortada pela organização;
 *  - cron com o segredo dedicado e só com caixa ativa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'supabase', 'migrations');
const ler = (f: string) => readFileSync(join(dir, f), 'utf8');
const tabelas = ler('aplicar_20271015110000_email_capture_tabelas.sql');
const rpcs = ler('aplicar_20271015110100_email_capture_rpcs.sql');
const cron = ler('aplicar_20271015110200_email_capture_cron.sql');
const senhaPdf = ler('aplicar_20271015120000_email_capture_senha_pdf.sql');
const buscas = ler('aplicar_20271015130000_email_capture_buscas.sql');

describe('tabelas da captura', () => {
    it('RLS ligada nas três tabelas', () => {
        for (const t of ['email_capture_accounts', 'email_capture_senders', 'email_capture_messages']) {
            expect(tabelas).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
            expect(tabelas).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${t}\\s+FROM anon, authenticated`));
        }
    });

    it('nenhuma policy aberta (USING true) nem para anon', () => {
        expect(tabelas).not.toMatch(/USING\s*\(\s*true\s*\)/i);
        expect(tabelas).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
        expect(tabelas).not.toMatch(/TO\s+anon/i);
    });

    it('authenticated só LÊ conta e altera colunas de configuração — não cria, não apaga', () => {
        expect(tabelas).toMatch(/GRANT SELECT ON TABLE public\.email_capture_accounts TO authenticated/);
        expect(tabelas).toMatch(/GRANT UPDATE \(modo, data_inicial, modo_piloto, status, updated_at\) ON TABLE public\.email_capture_accounts TO authenticated/);
        expect(tabelas).not.toMatch(/GRANT[^;]*(INSERT|DELETE)[^;]*email_capture_accounts TO authenticated/);
    });

    it('mensagens: só leitura para quem está logado', () => {
        expect(tabelas).toMatch(/GRANT SELECT ON TABLE public\.email_capture_messages TO authenticated;/);
    });

    it('importação automática de remetente exige gestor (INSERT e UPDATE)', () => {
        const casos = tabelas.match(/importacao = 'revisao' OR public\.is_org_manager\(organization_id\)/g) ?? [];
        expect(casos.length).toBe(2);
    });

    it('remetente e mensagem presos à caixa da MESMA organização (FK composta)', () => {
        expect(tabelas).toMatch(/FOREIGN KEY \(account_id, organization_id\)\s+REFERENCES public\.email_capture_accounts \(id, organization_id\)/);
        expect((tabelas.match(/FOREIGN KEY \(account_id, organization_id\)/g) ?? []).length).toBe(2);
    });

    it('boletos.origem com CHECK e default upload; idempotência por anexo', () => {
        expect(tabelas).toMatch(/ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'upload'/);
        expect(tabelas).toMatch(/CHECK \(origem IN \('upload', 'email'\)\)/);
        expect(tabelas).toMatch(/UNIQUE \(account_id, uid_validity, uid, attachment_index\)/);
    });
});

describe('funções da captura', () => {
    it('as três funções de senha: só service_role, com REVOKE literal e checagem de papel dentro', () => {
        for (const f of ['email_capture_guardar_segredo(uuid, text)', 'email_capture_ler_segredo(uuid)', 'email_capture_apagar_segredo(uuid)']) {
            expect(rpcs).toContain(`REVOKE EXECUTE ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
            expect(rpcs).toContain(`GRANT  EXECUTE ON FUNCTION public.${f} TO service_role;`);
        }
        expect((rpcs.match(/coalesce\(auth\.role\(\), 'service_role'\) <> 'service_role'/g) ?? []).length).toBe(3);
    });

    it('busca de fornecedor é INVOKER e recorta pela organização pedida', () => {
        const corpo = rpcs.slice(rpcs.indexOf('find_supplier_in_org_by_document(p_organization_id uuid'));
        expect(corpo).toMatch(/SECURITY INVOKER/);
        expect(corpo).toMatch(/WHERE s\.organization_id = p_organization_id/);
        expect(rpcs).toContain('REVOKE EXECUTE ON FUNCTION public.find_supplier_in_org_by_document(uuid, text) FROM PUBLIC, anon;');
    });
});

describe('agendamento', () => {
    it('cron a cada 15 min, com o segredo dedicado, só com caixa ativa', () => {
        expect(cron).toMatch(/'email-capture-sync',\s*'\*\/15 \* \* \* \*'/);
        expect(cron).toMatch(/'Bearer ' \|\| public\.fn_cron_secret\(\)/);
        expect(cron).toMatch(/WHERE EXISTS \(SELECT 1 FROM public\.email_capture_accounts WHERE status = 'ativa'\)/);
        // O comando agendado (entre $cron$) não carrega a chave que ignora toda a RLS.
        const comando = cron.split('$cron$')[1] ?? '';
        expect(comando).toContain('fn_cron_secret');
        expect(comando).not.toMatch(/service_role/i);
    });
});

describe('senha dos PDFs por remetente (15/10/2026)', () => {
    it('senha no Vault pelo NOME do remetente — nenhuma coluna guarda segredo nem id de segredo', () => {
        expect(senhaPdf).toContain("'email_capture_pdf:' || p_sender::text");
        expect(senhaPdf).not.toMatch(/ADD COLUMN[^;]*secret/i);
    });

    it('ler: só service_role (REVOKE literal inclui authenticated) e papel checado dentro', () => {
        expect(senhaPdf).toContain('REVOKE EXECUTE ON FUNCTION public.email_capture_ler_senha_pdf(uuid) FROM PUBLIC, anon, authenticated;');
        expect(senhaPdf).toMatch(/email_capture_ler_senha_pdf[\s\S]*coalesce\(auth\.role\(\), 'service_role'\) <> 'service_role'/);
    });

    it('definir: membro da org do remetente, checado dentro; anon fora', () => {
        expect(senhaPdf).toContain('REVOKE EXECUTE ON FUNCTION public.email_capture_definir_senha_pdf(uuid, text) FROM PUBLIC, anon;');
        expect(senhaPdf).toMatch(/NOT public\.is_org_member\(v_org\)/);
    });

    it('remetente: INSERT/UPDATE por coluna, sem a data da senha', () => {
        expect(senhaPdf).toContain('REVOKE INSERT, UPDATE ON TABLE public.email_capture_senders FROM authenticated;');
        const grants = senhaPdf.match(/GRANT (INSERT|UPDATE) \([^)]*\)\s+ON TABLE public\.email_capture_senders TO authenticated/g) ?? [];
        expect(grants.length).toBe(2);
        for (const g of grants) expect(g).not.toContain('pdf_senha_atualizada_em');
    });

    it('excluir o remetente apaga a senha do cofre (gatilho com REVOKE)', () => {
        expect(senhaPdf).toMatch(/AFTER DELETE ON public\.email_capture_senders/);
        expect(senhaPdf).toContain('REVOKE EXECUTE ON FUNCTION public.fn_email_capture_sender_apaga_senha() FROM PUBLIC, anon, authenticated;');
    });
});

describe('busca por período (15/10/2026)', () => {
    it('RLS ligada; membro só LÊ; criar/avançar/cancelar é da Edge Function', () => {
        expect(buscas).toMatch(/ALTER TABLE public\.email_capture_buscas ENABLE ROW LEVEL SECURITY/);
        expect(buscas).toContain('REVOKE ALL ON TABLE public.email_capture_buscas FROM anon, authenticated;');
        expect(buscas).toContain('GRANT SELECT ON TABLE public.email_capture_buscas TO authenticated;');
        expect(buscas).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*email_capture_buscas TO authenticated/);
        expect(buscas).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.is_org_member\(organization_id\)\)/);
    });

    it('uma busca ativa por caixa; período válido; presa à caixa da mesma org', () => {
        expect(buscas).toMatch(/ON public\.email_capture_buscas \(account_id\) WHERE status IN \('pendente', 'em_andamento'\)/);
        expect(buscas).toContain('CHECK (data_de <= data_ate)');
        expect(buscas).toMatch(/FOREIGN KEY \(account_id, organization_id\)\s+REFERENCES public\.email_capture_accounts \(id, organization_id\)/);
    });
});
