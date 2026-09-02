// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, respostaDeErro } from "../_shared/auth.ts"

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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // Sessão e vínculo com a organização são validados por `exigirMembro`,
    // depois de ler o corpo (precisa do organizationId).
    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!resendApiKey) {
        return json({ error: 'Serviço de e-mail não configurado. Configure RESEND_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    const {
        recipients,       // string[] — pedido pelo cliente, VALIDADO abaixo
        subject,          // string
        htmlBody,         // string — HTML do relatório gerado no client
        scheduleId,       // string | null — para atualizar last_sent_at
        organizationId,   // string
    } = await req.json() as {
        recipients: string[];
        subject: string;
        htmlBody: string;
        scheduleId?: string | null;
        organizationId: string;
    };

    // Achado C2-02: esta function era um RELAY DE E-MAIL ABERTO. Depois de só
    // confirmar que existe um usuário, repassava à Resend três campos crus do
    // cliente — destinatários, assunto e corpo HTML — assinando com o domínio
    // verificado da empresa. Qualquer conta recém-criada mandava phishing com a
    // reputação do domínio. O `organizationId` era recebido e nunca usado.
    const vinculo = await exigirMembro(req, organizationId);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

    if (!recipients?.length) return json({ error: 'Nenhum destinatário informado.' }, 400);

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Os destinatários têm de ser conhecidos da organização: ou estão num
    // agendamento de relatório dela, ou são membros dela. Não basta o remetente
    // ser membro — senão o relay continua aberto, só que autenticado.
    const permitidos = new Set<string>();

    // ⚠️ A tabela é `report_schedules`. `bi_report_schedules` — que o código
    // original desta function e o `services/biReportService.ts` referenciam —
    // NÃO EXISTE no banco (verificado em pg_class: nem tabela, nem view). Por
    // isso o UPDATE de `last_sent_at` daqui nunca funcionou: o erro era
    // descartado. Ver a nota sobre `biReportService` no plano da auditoria.
    const { data: agendamentos } = await adminClient
        .from('report_schedules')
        .select('recipients')
        .eq('organization_id', organizationId);
    for (const ag of agendamentos ?? []) {
        for (const e of (ag.recipients ?? []) as string[]) {
            if (e) permitidos.add(String(e).trim().toLowerCase());
        }
    }

    const { data: membros } = await adminClient
        .from('organization_members')
        .select('email')
        .eq('organization_id', organizationId);
    for (const m of membros ?? []) {
        if (m.email) permitidos.add(String(m.email).trim().toLowerCase());
    }

    const recusados = recipients.filter(e => !permitidos.has(String(e).trim().toLowerCase()));
    if (recusados.length > 0) {
        return json({
            error: 'Destinatário não pertence a esta organização nem a um agendamento dela.',
            recusados,
        }, 403);
    }

    // Envio via Resend API (fetch direto — sem SDK)
    const from = Deno.env.get('REPORT_FROM_EMAIL') ?? 'relatorios@opura.com.br';

    const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
            from,
            to: recipients,
            subject,
            html: htmlBody,
        }),
    });

    if (!sendRes.ok) {
        const err = await sendRes.text();
        return json({ error: `Resend API: ${err}` }, 502);
    }

    // Atualiza last_sent_at do schedule. O filtro por organization_id não é
    // decorativo: sem ele, um membro de qualquer organização carimbava o
    // agendamento de outra (o cliente é service_role, a RLS não recorta).
    if (scheduleId) {
        await adminClient
            .from('report_schedules')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('id', scheduleId)
            .eq('organization_id', organizationId);
    }

    return json({ success: true, recipients });
});
