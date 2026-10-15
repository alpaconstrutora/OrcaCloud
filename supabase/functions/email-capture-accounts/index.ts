/**
 * email-capture-accounts — conectar, testar, reautenticar e desconectar a caixa
 * de e-mail monitorada pela captura de boletos.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 3.4).
 *
 * A senha (senha de app do Google) trafega UMA vez, do formulário para cá,
 * é testada no IMAP e vai para o Vault (`email_capture_guardar_segredo`, só
 * service_role). Nunca volta ao navegador e não fica em coluna nenhuma.
 *
 * Entradas (POST, JSON, Authorization: Bearer <JWT do usuário>):
 *   { acao: 'conectar', organizationId, usuario, senha, host?, porta?, modo?, data_inicial? }  gestor
 *   { acao: 'reautenticar', accountId, senha }                                                  gestor
 *   { acao: 'desconectar', accountId }                                                          gestor
 *   { acao: 'testar', accountId }                                                               membro
 *
 * REGRA #7 pergunta 3: publicada com --no-verify-jwt; o gate é exigirGestor /
 * exigirMembro, sempre com a org DONA da conta (lida da linha, nunca do corpo).
 */
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirGestor, exigirMembro, respostaDeErro } from "../_shared/auth.ts";
import { testarLoginImap } from "../_shared/imapCaptura.ts";

declare const Deno: { env: { get(key: string): string | undefined } };
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Colunas que voltam ao navegador — nunca o vault_secret_id. */
const COLUNAS_PUBLICAS = 'id, organization_id, provedor, host, porta, usuario, status, modo, data_inicial, modo_piloto, last_sync_at, ultimo_erro, created_by_email, created_at, updated_at';

const MODOS = ['favoritos', 'todos', 'hibrido'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Hosts aceitos: impede usar a function como "testador de senha" contra qualquer servidor. */
const HOSTS_PERMITIDOS = ['imap.gmail.com'];

interface Corpo {
    acao?: string;
    organizationId?: string;
    accountId?: string;
    usuario?: string;
    senha?: string;
    host?: string;
    porta?: number;
    modo?: string;
    data_inicial?: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);

    const admin: SupabaseLike = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    let b: Corpo = {};
    try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    // ── conectar ────────────────────────────────────────────────────────────
    if (b.acao === 'conectar') {
        const vinculo = await exigirGestor(req, b.organizationId);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

        const usuario = (b.usuario ?? '').trim().toLowerCase();
        const senha = (b.senha ?? '').replace(/\s+/g, ''); // o Google exibe a senha de app em blocos com espaço
        const host = (b.host ?? 'imap.gmail.com').trim().toLowerCase();
        const porta = Number(b.porta ?? 993);
        const modo = b.modo ?? 'hibrido';
        const dataInicial = b.data_inicial ?? new Date().toISOString().slice(0, 10);

        if (!EMAIL.test(usuario)) return json({ error: 'Informe o endereço de e-mail da caixa.' }, 400);
        if (!senha) return json({ error: 'Informe a senha de app.' }, 400);
        if (!HOSTS_PERMITIDOS.includes(host)) return json({ error: `Servidor não suportado: ${host}. Hoje a captura lê caixas do Gmail.` }, 400);
        if (porta !== 993) return json({ error: 'Porta IMAP deve ser 993 (TLS).' }, 400);
        if (!MODOS.includes(modo)) return json({ error: 'Modo inválido.' }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicial)) return json({ error: 'Data inicial inválida.' }, 400);

        const { data: jaExiste } = await admin.from('email_capture_accounts').select('id, status')
            .eq('organization_id', b.organizationId).eq('usuario', usuario).maybeSingle();
        if (jaExiste && jaExiste.status !== 'desconectada') {
            return json({ error: 'Esta caixa já está conectada nesta organização. Use "Reautenticar" para trocar a senha.' }, 409);
        }

        const teste = await testarLoginImap({ host, porta, usuario, senha });
        if (!teste.ok) return json({ error: teste.motivo, autenticacao: teste.autenticacao }, 400);

        // Reconectar uma caixa desconectada reaproveita a linha (histórico e
        // remetentes continuam); senão, cria.
        let contaId: string;
        if (jaExiste) {
            const { error } = await admin.from('email_capture_accounts').update({
                host, porta, modo, data_inicial: dataInicial, status: 'ativa', ultimo_erro: null,
                updated_at: new Date().toISOString(),
            }).eq('id', jaExiste.id);
            if (error) return json({ error: error.message }, 500);
            contaId = jaExiste.id;
        } else {
            const { data: nova, error } = await admin.from('email_capture_accounts').insert({
                organization_id: b.organizationId, provedor: 'imap', host, porta, usuario, modo,
                data_inicial: dataInicial, status: 'ativa', modo_piloto: true, created_by_email: vinculo.email,
            }).select('id').single();
            if (error) return json({ error: error.message }, 500);
            contaId = nova.id;
        }

        const { error: errSegredo } = await admin.rpc('email_capture_guardar_segredo', { p_account: contaId, p_senha: senha });
        if (errSegredo) {
            if (!jaExiste) await admin.from('email_capture_accounts').delete().eq('id', contaId);
            else await admin.from('email_capture_accounts').update({ status: 'desconectada' }).eq('id', contaId);
            return json({ error: `Não consegui guardar a senha no cofre: ${errSegredo.message}` }, 500);
        }

        const { data: conta } = await admin.from('email_capture_accounts').select(COLUNAS_PUBLICAS).eq('id', contaId).single();
        return json({ conta });
    }

    // ── ações sobre conta existente ─────────────────────────────────────────
    if (!b.accountId) return json({ error: 'accountId é obrigatório.' }, 400);
    const { data: conta } = await admin.from('email_capture_accounts')
        .select('id, organization_id, host, porta, usuario, status').eq('id', b.accountId).maybeSingle();
    // Conta inexistente responde como sem acesso (não revela se existe).
    const orgDaConta = conta?.organization_id ?? '00000000-0000-0000-0000-000000000000';

    if (b.acao === 'testar') {
        const vinculo = await exigirMembro(req, orgDaConta);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!conta) return json({ error: 'Conta não encontrada' }, 404);
        const { data: senha, error } = await admin.rpc('email_capture_ler_segredo', { p_account: conta.id });
        if (error || !senha) return json({ ok: false, motivo: 'Senha não encontrada no cofre — reconecte a caixa.' });
        const teste = await testarLoginImap({ host: conta.host, porta: conta.porta, usuario: conta.usuario, senha });
        if (!teste.ok && teste.autenticacao) {
            await admin.from('email_capture_accounts').update({ status: 'reautenticar', ultimo_erro: teste.motivo }).eq('id', conta.id);
        }
        return json(teste.ok ? { ok: true } : { ok: false, motivo: teste.motivo });
    }

    if (b.acao === 'reautenticar') {
        const vinculo = await exigirGestor(req, orgDaConta);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!conta) return json({ error: 'Conta não encontrada' }, 404);
        const senha = (b.senha ?? '').replace(/\s+/g, '');
        if (!senha) return json({ error: 'Informe a nova senha de app.' }, 400);
        const teste = await testarLoginImap({ host: conta.host, porta: conta.porta, usuario: conta.usuario, senha });
        if (!teste.ok) return json({ error: teste.motivo, autenticacao: teste.autenticacao }, 400);
        const { error } = await admin.rpc('email_capture_guardar_segredo', { p_account: conta.id, p_senha: senha });
        if (error) return json({ error: `Não consegui guardar a senha no cofre: ${error.message}` }, 500);
        await admin.from('email_capture_accounts').update({ status: 'ativa', ultimo_erro: null, updated_at: new Date().toISOString() }).eq('id', conta.id);
        const { data: atualizada } = await admin.from('email_capture_accounts').select(COLUNAS_PUBLICAS).eq('id', conta.id).single();
        return json({ conta: atualizada });
    }

    if (b.acao === 'desconectar') {
        const vinculo = await exigirGestor(req, orgDaConta);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!conta) return json({ error: 'Conta não encontrada' }, 404);
        const { error } = await admin.rpc('email_capture_apagar_segredo', { p_account: conta.id });
        if (error) return json({ error: error.message }, 500);
        // A linha fica: mensagens e boletos capturados apontam para ela (trilha).
        await admin.from('email_capture_accounts').update({ status: 'desconectada', updated_at: new Date().toISOString() }).eq('id', conta.id);
        return json({ ok: true });
    }

    return json({ error: 'acao deve ser conectar, testar, reautenticar ou desconectar.' }, 400);
});
