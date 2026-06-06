// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

const ROLE_LABELS: Record<string, string> = {
    investidor:  'Investidor',
    arquiteto:   'Arquiteto',
    engenheiro:  'Engenheiro',
    projetista:  'Projetista',
    consultor:   'Consultor',
    outro:       'Outro',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl     = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey    = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail       = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    const frontendUrl     = Deno.env.get('FRONTEND_URL') ?? '';

    if (!resendApiKey) {
        // Sem chave configurada — não é erro crítico, apenas loga e retorna ok
        console.warn('[notify-opportunity-interest] RESEND_API_KEY não configurada');
        return json({ skipped: true });
    }

    const { interestId, opportunityId, organizationId } = await req.json() as {
        interestId: string;
        opportunityId: string;
        organizationId: string;
    };

    if (!interestId || !opportunityId || !organizationId) {
        return json({ error: 'interestId, opportunityId e organizationId são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Busca dados da oportunidade, do interesse e dos admins em paralelo
    const [oppRes, interestRes, membersRes] = await Promise.all([
        admin
            .from('investor_opportunities')
            .select('title, subtitle, status, location_city, location_state')
            .eq('id', opportunityId)
            .single(),
        admin
            .from('opportunity_interests')
            .select('contact_name, contact_email, contact_phone, role, message, created_at')
            .eq('id', interestId)
            .single(),
        admin
            .from('organization_members')
            .select('email, name')
            .eq('organization_id', organizationId)
            .in('role', ['owner', 'admin']),
    ]);

    if (oppRes.error || !oppRes.data) {
        console.error('[notify-opportunity-interest] oportunidade não encontrada', oppRes.error);
        return json({ error: 'Oportunidade não encontrada' }, 404);
    }
    if (interestRes.error || !interestRes.data) {
        console.error('[notify-opportunity-interest] interesse não encontrado', interestRes.error);
        return json({ error: 'Interesse não encontrado' }, 404);
    }

    const opp      = oppRes.data as Record<string, any>;
    const interest = interestRes.data as Record<string, any>;
    const admins   = (membersRes.data ?? []) as { email: string; name?: string }[];

    if (admins.length === 0) {
        console.warn('[notify-opportunity-interest] nenhum admin encontrado para org', organizationId);
        return json({ skipped: true, reason: 'no_admins' });
    }

    const recipients = admins.map(a => a.email).filter(Boolean);
    const roleLabel  = ROLE_LABELS[interest.role] ?? interest.role;
    const location   = [opp.location_city, opp.location_state].filter(Boolean).join(', ');
    const portalLink = frontendUrl ? `${frontendUrl}/?view=investor-portal` : '';
    const createdAt  = new Date(interest.created_at).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
    });

    const subject = `[ORÇACLOUD] Novo interesse: ${opp.title}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
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
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">Novo Interesse Recebido</p>
            </td>
          </tr>

          <!-- Oportunidade -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Oportunidade</p>
              <p style="margin:0;font-size:20px;font-weight:800;color:#111827;">${opp.title}</p>
              ${opp.subtitle ? `<p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${opp.subtitle}</p>` : ''}
              ${location ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">📍 ${location}</p>` : ''}
            </td>
          </tr>

          <!-- Divisor -->
          <tr><td style="padding:20px 32px 0;"><hr style="border:none;border-top:1px solid #f3f4f6;"></td></tr>

          <!-- Dados do interessado -->
          <tr>
            <td style="padding:20px 32px 0;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Quem manifestou interesse</p>
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="padding:0 0 10px;">
                    <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">${roleLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:8px;">
                    <span style="font-size:15px;font-weight:700;color:#111827;">${interest.contact_name}</span>
                  </td>
                </tr>
                ${interest.contact_email ? `
                <tr>
                  <td style="padding-bottom:6px;">
                    <a href="mailto:${interest.contact_email}" style="font-size:13px;color:#3b82f6;text-decoration:none;">✉ ${interest.contact_email}</a>
                  </td>
                </tr>` : ''}
                ${interest.contact_phone ? `
                <tr>
                  <td style="padding-bottom:6px;">
                    <a href="tel:${interest.contact_phone}" style="font-size:13px;color:#6b7280;text-decoration:none;">📞 ${interest.contact_phone}</a>
                  </td>
                </tr>` : ''}
                ${interest.message ? `
                <tr>
                  <td style="padding-top:12px;padding-bottom:6px;">
                    <div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 8px 8px 0;">
                      <p style="margin:0;font-size:13px;color:#4b5563;font-style:italic;">"${interest.message}"</p>
                    </div>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          ${portalLink ? `
          <tr>
            <td style="padding:24px 32px;">
              <a href="${portalLink}" style="display:inline-block;background:#0B1727;color:#ffffff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
                Ver no Portal →
              </a>
            </td>
          </tr>` : '<tr><td style="padding:24px 32px 0;"></td></tr>'}

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
        body: JSON.stringify({ from: fromEmail, to: recipients, subject, html }),
    });

    if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error('[notify-opportunity-interest] Resend error', err);
        return json({ error: `Resend API: ${err}` }, 502);
    }

    console.log('[notify-opportunity-interest] enviado para', recipients);
    return json({ success: true, recipients });
});
