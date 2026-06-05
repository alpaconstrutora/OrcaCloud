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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!resendApiKey) {
        return json({ error: 'Serviço de e-mail não configurado. Configure RESEND_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    // Valida o usuário
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Token inválido' }, 401);

    const {
        recipients,       // string[]
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

    if (!recipients?.length) return json({ error: 'Nenhum destinatário informado.' }, 400);

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

    // Atualiza last_sent_at do schedule se fornecido
    if (scheduleId) {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const adminClient = createClient(supabaseUrl, serviceKey);
        await adminClient
            .from('bi_report_schedules')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('id', scheduleId);
    }

    return json({ success: true, recipients });
});
