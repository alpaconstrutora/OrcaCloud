// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml, urlSegura, emailValido, truncar } from "../_shared/html.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    const frontendUrl    = Deno.env.get('FRONTEND_URL') ?? '';

    // Achado C3-06: esta function NÃO lia o header Authorization em momento
    // algum. Qualquer um que conhecesse um par válido de ids disparava
    // notificação in-app e e-mail para todos os owners/admins da organização,
    // quantas vezes quisesse — amplificador de spam e de phishing interno, com
    // conteúdo vindo de formulário público (ver C5-03). O `verify_jwt` da
    // plataforma não ajuda: ele é satisfeito pela chave anon, que é pública.
    //
    // Gate igual ao das funções de cron (process-billing-ruler,
    // quality-sla-enforcement, task-alert-notifier): só o service_role invoca.
    // Estas funções são chamadas por serviço/trigger, nunca pelo navegador.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const { proposalId, organizationId } = await req.json() as {
        proposalId: string;
        organizationId: string;
    };

    if (!proposalId || !organizationId) {
        return json({ error: 'proposalId e organizationId são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Busca proposta + admins da org em paralelo
    const [proposalRes, membersRes] = await Promise.all([
        admin
            .from('broker_portal_proposals')
            .select('id, broker_email, buyer_name, total_value, down_payment, status, created_at, property_id, notes')
            .eq('id', proposalId)
            .eq('organization_id', organizationId)
            .single(),
        admin
            .from('organization_members')
            .select('email, name')
            .eq('organization_id', organizationId)
            .in('role', ['owner', 'admin']),
    ]);

    if (proposalRes.error || !proposalRes.data) {
        console.error('[notify-broker-proposal] proposta não encontrada', proposalRes.error);
        return json({ error: 'Proposta não encontrada' }, 404);
    }

    const proposal = proposalRes.data as Record<string, any>;
    const admins   = (membersRes.data ?? []) as { email: string; name?: string }[];

    if (admins.length === 0) {
        console.warn('[notify-broker-proposal] nenhum admin para org', organizationId);
        return json({ skipped: true, reason: 'no_admins' });
    }

    const adminEmails = admins.map(a => a.email).filter(Boolean);

    const createdAt = new Date(proposal.created_at).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
    });

    const portalLink = frontendUrl ? `${frontendUrl}/?view=broker-proposals` : '';

    // 1. Notificação in-app para cada admin
    const notifRows = adminEmails.map(email => ({
        recipient_email: email,
        title: 'Nova proposta de corretor',
        message: `${proposal.broker_email} enviou proposta para ${proposal.buyer_name} — ${fmt(proposal.total_value ?? 0)}`,
        link: portalLink || null,
        type: 'broker_proposal',
    }));

    const { error: notifErr } = await admin.from('notifications').insert(notifRows);
    if (notifErr) {
        console.error('[notify-broker-proposal] erro ao inserir notificações', notifErr);
    }

    // 2. E-mail via Resend (opcional — sem chave apenas loga)
    if (!resendApiKey) {
        console.warn('[notify-broker-proposal] RESEND_API_KEY não configurada — apenas notificação in-app');
        return json({ success: true, notif_only: true, recipients: adminEmails });
    }

    // O assunto vai no header do e-mail (não é HTML) — cru de propósito.
    const subject = `[ORÇACLOUD] Nova proposta de corretor — ${proposal.buyer_name}`;

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

          <!-- Header -->
          <tr>
            <td style="background:#0B1727;padding:28px 32px;">
              <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;">ORÇACLOUD</p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">Nova Proposta de Corretor</p>
            </td>
          </tr>

          <!-- Dados da proposta -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Corretor</p>
              <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(proposal.broker_email)}</p>

              <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Comprador</p>
              <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(proposal.buyer_name)}</p>

              <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-right:1px solid #f3f4f6;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Valor Total</p>
                    <p style="margin:0;font-size:20px;font-weight:800;color:#111827;">${fmt(proposal.total_value ?? 0)}</p>
                  </td>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Entrada</p>
                    <p style="margin:0;font-size:20px;font-weight:800;color:#111827;">${fmt(proposal.down_payment ?? 0)}</p>
                  </td>
                </tr>
              </table>

              ${proposal.notes ? `
              <div style="margin-top:20px;background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 8px 8px 0;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Observações</p>
                <p style="margin:0;font-size:13px;color:#4b5563;font-style:italic;">"${escapeHtml(truncar(proposal.notes))}"</p>
              </div>` : ''}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 32px;">
              ${portalLink ? `<a href="${urlSegura(portalLink)}" style="display:inline-block;background:#0B1727;color:#ffffff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">Analisar proposta →</a>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">Recebido em ${createdAt} • ORÇACLOUD • Esta mensagem é automática.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({ from: fromEmail, to: adminEmails, subject, html }),
    });

    if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error('[notify-broker-proposal] Resend error', err);
        // Não falha: notificação in-app já foi enviada
        return json({ success: true, email_error: err, recipients: adminEmails });
    }

    console.log('[notify-broker-proposal] enviado para', adminEmails);
    return json({ success: true, recipients: adminEmails });
});
