// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, exigirUsuario, respostaDeErro } from '../_shared/auth.ts';
import { escapeHtml, urlSegura } from '../_shared/html.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Convite por e-mail para um integrante do Portal do Parceiro.
 *
 * Pedido de 03/10/2026: "portal do parceiro: além do acesso via token
 * implementar acesso via e-mail". Decisões do usuário: e-mail e senha; o botão
 * "Convidar Integrante" passa a mandar e-mail; entrada em /portal-parceiro.
 * Plano: docs/planos/2026-10-03-portal-parceiro-acesso-por-email.md
 *
 * O que faz:
 *  1. confere que o chamador é membro da organização dona do workspace — a
 *     mesma regra de quem gerencia integrantes (policy partner_users_manage);
 *  2. gera o link de "criar senha" com `auth.admin.generateLink` — que NÃO manda
 *     e-mail: o envio do Supabase Auth tem limite baixo e template genérico.
 *     Conta nova → `invite`; e-mail que já tem conta → `recovery` (redefine a
 *     senha). Os dois caem em /portal-parceiro com `#type=invite|recovery`, que o
 *     app já trata abrindo a tela de criar senha (useAuthSync + ResetPassword);
 *  3. manda o e-mail pelo Resend (mesma infraestrutura das outras notificações);
 *  4. grava `partner_users.invited_at`.
 *
 * O link nunca volta para o cliente — só vai no e-mail.
 *
 * REGRA #7, pergunta 3: o gate está no código (`exigirMembro` valida o JWT com
 * cliente anon e confere organization_members), não só no `verify_jwt`.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
    // Usuário de verdade ANTES de olhar o banco: com a chave anon (pública) não se
    // descobre nem se um integrante existe.
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    let partnerUserId: string | undefined;
    try {
        ({ partner_user_id: partnerUserId } = await req.json());
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }
    if (!partnerUserId || !UUID.test(partnerUserId)) {
        return json({ error: 'partner_user_id é obrigatório.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Integrante + workspace. Lidos com service_role só para descobrir a
    // organização dona; quem decide se o chamador pode agir é exigirMembro.
    const { data: pu } = await admin
        .from('partner_users')
        .select('id, email, name, is_active, organization_id, partner_workspace_id')
        .eq('id', partnerUserId)
        .maybeSingle();
    if (!pu) return json({ error: 'Integrante não encontrado.' }, 404);

    const { data: ws } = await admin
        .from('partner_workspaces')
        .select('id, organization_id, supplier_id, is_active')
        .eq('id', pu.partner_workspace_id)
        .maybeSingle();
    if (!ws) return json({ error: 'Workspace não encontrado.' }, 404);

    const organizationId: string | null = ws.organization_id ?? pu.organization_id ?? null;
    if (!organizationId) {
        return json({ error: 'O workspace não tem organização dona; não é possível convidar.' }, 400);
    }

    const vinculo = await exigirMembro(req, organizationId);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

    if (!pu.is_active) return json({ error: 'O integrante está inativo.' }, 400);
    if (!ws.is_active) return json({ error: 'O workspace está suspenso.' }, 400);

    const email = String(pu.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'O integrante não tem e-mail.' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY).' }, 500);
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    if (!frontendUrl) return json({ error: 'FRONTEND_URL não configurada.' }, 500);
    const portalUrl = `${frontendUrl}/portal-parceiro`;

    // Conta nova → convite; já existe → redefinição de senha. Nenhum dos dois
    // manda e-mail pelo Auth: generateLink só devolve o link.
    let kind: 'invite' | 'recovery' = 'invite';
    let gerado = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: portalUrl },
    });
    if (gerado.error && /already|registered|exists/i.test(gerado.error.message || '')) {
        kind = 'recovery';
        gerado = await admin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: portalUrl },
        });
    }
    const actionLink: string | undefined = gerado.data?.properties?.action_link;
    if (gerado.error || !actionLink) {
        console.error('[partner-invite-user] generateLink falhou', kind, gerado.error?.message);
        return json({ error: 'Não foi possível gerar o link de acesso.' }, 500);
    }

    // Nomes para o e-mail: quem convida (organização) e de qual parceiro.
    const [{ data: org }, { data: sup }] = await Promise.all([
        admin.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
        ws.supplier_id
            ? admin.from('suppliers').select('name').eq('id', ws.supplier_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    const orgName = org?.name || 'a construtora';
    const supplierName = sup?.name || '';
    const botao = kind === 'invite' ? 'Criar minha senha' : 'Definir nova senha';
    const subject = `Acesso ao Portal do Parceiro — ${orgName}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#f97316;padding:28px 32px;">
              <p style="margin:0;color:#ffedd5;font-size:12px;font-weight:700;letter-spacing:1px;">Portal do Parceiro</p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${escapeHtml(orgName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;color:#111827;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Olá${pu.name ? `, ${escapeHtml(pu.name)}` : ''}.</p>
              <p style="margin:0 0 16px;">
                ${kind === 'invite'
                    ? `Você foi convidado(a) para acessar o Portal do Parceiro de <strong>${escapeHtml(orgName)}</strong>${supplierName ? ` como integrante de <strong>${escapeHtml(supplierName)}</strong>` : ''}.`
                    : `Recebemos um pedido para você acessar o Portal do Parceiro de <strong>${escapeHtml(orgName)}</strong>${supplierName ? ` como integrante de <strong>${escapeHtml(supplierName)}</strong>` : ''}. Como seu e-mail já tem cadastro, defina uma nova senha.`}
              </p>
              <p style="margin:0 0 24px;">Seu login é o e-mail <strong>${escapeHtml(email)}</strong>.</p>
              <p style="margin:0 0 28px;">
                <a href="${urlSegura(actionLink)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${escapeHtml(botao)}</a>
              </p>
              <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">Depois de criar a senha, entre sempre por:</p>
              <p style="margin:0 0 24px;font-size:14px;"><a href="${urlSegura(portalUrl)}" style="color:#ea580c;">${escapeHtml(portalUrl)}</a></p>
              <p style="margin:0;color:#9ca3af;font-size:12px;">Se você não esperava este convite, ignore este e-mail.</p>
            </td>
          </tr>
          <tr><td style="padding:16px 32px 28px;"></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
    });
    if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error('[partner-invite-user] Resend recusou', sendRes.status, err.slice(0, 300));
        return json({ error: 'O provedor de e-mail recusou o envio.' }, 502);
    }

    const { error: updErr } = await admin
        .from('partner_users')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', pu.id);
    if (updErr) console.error('[partner-invite-user] invited_at não gravado', updErr.message);

    console.log('[partner-invite-user] enviado', { partner_user_id: pu.id, kind, por: vinculo.email });
    return json({ ok: true, kind, invited_at_saved: !updErr });
});
