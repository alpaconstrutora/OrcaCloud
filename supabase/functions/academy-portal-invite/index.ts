// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, exigirUsuario, respostaDeErro } from '../_shared/auth.ts';
import { escapeHtml, urlSegura } from '../_shared/html.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Convite por e-mail para o Portal de Treinamentos.
 *
 * Pedido de 15/10/2026: "recursos humanos > treinamento: criar portal para
 * treinamentos". Decisão do usuário: entrada por e-mail e senha com convite.
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 *
 * Clone deliberado da `partner-invite-user` (03/10/2026), trocando a
 * identidade (`academy_portal_users`) e o destino (`/portal-treinamentos`):
 *  1. confere que o chamador é membro da organização dona do acesso;
 *  2. gera o link de "criar senha" com `auth.admin.generateLink` — que NÃO
 *     manda e-mail. Conta nova → `invite`; e-mail que já tem conta →
 *     `recovery`. Os dois caem em /portal-treinamentos com
 *     `#type=invite|recovery`, que o app trata abrindo a tela de criar senha;
 *  3. manda o e-mail pelo Resend;
 *  4. grava `academy_portal_users.invited_at`.
 *
 * O link nunca volta para o cliente — só vai no e-mail.
 *
 * REGRA #7, pergunta 3: o gate está no código (`exigirMembro`), não só no
 * `verify_jwt` do gateway.
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

    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    let portalUserId: string | undefined;
    try {
        ({ portal_user_id: portalUserId } = await req.json());
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }
    if (!portalUserId || !UUID.test(portalUserId)) {
        return json({ error: 'portal_user_id é obrigatório.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Lido com service_role só para descobrir a organização dona; quem decide
    // se o chamador pode agir é exigirMembro.
    const { data: pu } = await admin
        .from('academy_portal_users')
        .select('id, email, name, tipo, empresa_terceira, is_active, org_id')
        .eq('id', portalUserId)
        .maybeSingle();
    if (!pu) return json({ error: 'Acesso não encontrado.' }, 404);

    const vinculo = await exigirMembro(req, pu.org_id);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

    if (!pu.is_active) return json({ error: 'O acesso está desativado.' }, 400);

    const email = String(pu.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'O acesso não tem e-mail.' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY).' }, 500);
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    if (!frontendUrl) return json({ error: 'FRONTEND_URL não configurada.' }, 500);
    const portalUrl = `${frontendUrl}/portal-treinamentos`;

    let kind: 'invite' | 'recovery' = 'invite';
    let gerado = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: portalUrl, data: { name: pu.name } },
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
        console.error('[academy-portal-invite] generateLink falhou', kind, gerado.error?.message);
        return json({ error: 'Não foi possível gerar o link de acesso.' }, 500);
    }

    const { data: org } = await admin.from('organizations').select('name').eq('id', pu.org_id).maybeSingle();
    const orgName = org?.name || 'a construtora';
    const empresa = pu.tipo === 'TERCEIRO' && pu.empresa_terceira ? String(pu.empresa_terceira) : '';
    const botao = kind === 'invite' ? 'Criar minha senha' : 'Definir nova senha';
    const subject = `Acesso ao Portal de Treinamentos — ${orgName}`;

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
            <td style="background:#0d9488;padding:28px 32px;">
              <p style="margin:0;color:#ccfbf1;font-size:12px;font-weight:700;letter-spacing:1px;">Portal de Treinamentos</p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${escapeHtml(orgName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;color:#111827;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Olá${pu.name ? `, ${escapeHtml(pu.name)}` : ''}.</p>
              <p style="margin:0 0 16px;">
                ${kind === 'invite'
                    ? `Você foi convidado(a) para o Portal de Treinamentos de <strong>${escapeHtml(orgName)}</strong>${empresa ? ` como integrante de <strong>${escapeHtml(empresa)}</strong>` : ''}. Lá ficam os treinamentos atribuídos a você, as aulas, as provas e os certificados.`
                    : `Recebemos um pedido para você acessar o Portal de Treinamentos de <strong>${escapeHtml(orgName)}</strong>${empresa ? ` como integrante de <strong>${escapeHtml(empresa)}</strong>` : ''}. Como seu e-mail já tem cadastro, defina uma nova senha.`}
              </p>
              <p style="margin:0 0 24px;">Seu login é o e-mail <strong>${escapeHtml(email)}</strong>.</p>
              <p style="margin:0 0 28px;">
                <a href="${urlSegura(actionLink)}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${escapeHtml(botao)}</a>
              </p>
              <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">Depois de criar a senha, entre sempre por:</p>
              <p style="margin:0 0 24px;font-size:14px;"><a href="${urlSegura(portalUrl)}" style="color:#0f766e;">${escapeHtml(portalUrl)}</a></p>
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
        console.error('[academy-portal-invite] Resend recusou', sendRes.status, err.slice(0, 300));
        return json({ error: 'O provedor de e-mail recusou o envio.' }, 502);
    }

    const { error: updErr } = await admin
        .from('academy_portal_users')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', pu.id);
    if (updErr) console.error('[academy-portal-invite] invited_at não gravado', updErr.message);

    console.log('[academy-portal-invite] enviado', { portal_user_id: pu.id, kind, por: vinculo.email });
    return json({ ok: true, kind, invited_at_saved: !updErr });
});
