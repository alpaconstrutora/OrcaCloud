// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, respostaDeErro } from "../_shared/auth.ts"
import { montarRelatorioBI } from "./relatorio.ts"
import { conferirDestinatarios, dataValida, uuidOpcional } from "./regras.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * BI Executivo › IA & Relatórios › "Enviar agora".
 *
 * ─── Histórico de defeitos ───────────────────────────────────────────────────
 *
 * C2-02 (auditoria 01/09/2026): era RELAY DE E-MAIL ABERTO — bastava existir um
 * usuário, e destinatários, assunto e HTML vinham crus do cliente. Ganhou
 * `exigirMembro` e uma lista de permitidos.
 *
 * F11/F55 (varredura 15/11/2026): a lista de permitidos incluía
 * `bi_report_schedules.recipients`, que QUALQUER membro grava — e qualquer conta
 * cria a própria organização. Gravava-se um endereço de fora num agendamento e o
 * assunto e o HTML do atacante saíam pelo domínio verificado da empresa.
 *
 * ─── O que vale agora ────────────────────────────────────────────────────────
 *
 *  1. Quem chama é membro da organização (`exigirMembro`).
 *  2. Quem recebe é membro da organização, conferido NA HORA pelo banco
 *     (`_bi_relatorio_destinatarios`: conta por user_id — ou pelo e-mail na linha
 *     legada — com e-mail confirmado). A lista do agendamento é só preferência.
 *  3. O conteúdo NÃO vem do cliente. O cliente diz qual relatório (organização,
 *     período, id da narrativa); os números saem de `fn_bi_executive` e
 *     `fn_bi_trend` chamadas COMO o usuário (a mesma conta e a mesma RLS da tela),
 *     o nome da organização sai do banco, e o resumo de IA é o texto GUARDADO pela
 *     `bi-narrative` (`bi_narrativas`), reutilizado literalmente — sem regenerar.
 *     Assunto e HTML saem do molde fixo de `relatorio.ts`, com tudo escapado.
 *  4. Teto diário de envios (`_bi_relatorio_envio_cota`).
 *
 * ⚠️ Limite conhecido: o cadastro no app é auto-confirmado (Auth › "Confirm
 * email" desligado), então "e-mail confirmado" ainda não prova posse da caixa de
 * quem se cadastrou sozinho. Fecha quando a confirmação de e-mail for ligada.
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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!resendApiKey) {
        return json({ error: 'Serviço de e-mail não configurado. Configure RESEND_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    let corpo: Record<string, unknown>;
    try {
        const lido = await req.json();
        if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return json({ error: 'Corpo inválido.' }, 400);
        corpo = lido as Record<string, unknown>;
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }

    // 1. Quem chama.
    const organizationId = typeof corpo.organizationId === 'string' ? corpo.organizationId : null;
    const vinculo = await exigirMembro(req, organizationId);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
    const orgId = organizationId as string;

    // O app antigo mandava `subject`/`htmlBody` e nenhum período: avisa em vez de
    // mandar um e-mail que não é o que a pessoa via na tela.
    const dateFrom = dataValida(corpo.dateFrom);
    const dateTo   = dataValida(corpo.dateTo);
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
        return json({ error: 'Período do relatório inválido. Recarregue a página e tente de novo.' }, 400);
    }
    const narrativeId = uuidOpcional(corpo.narrativeId);
    const scheduleId  = uuidOpcional(corpo.scheduleId);
    if (narrativeId === 'invalido' || scheduleId === 'invalido') return json({ error: 'Corpo inválido.' }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Quem recebe: membros da organização, AGORA.
    const { data: membros, error: errMembros } = await admin.rpc('_bi_relatorio_destinatarios', { p_org: orgId });
    if (errMembros) {
        console.error('[send-bi-report] membros:', errMembros);
        return json({ error: 'Falha ao conferir os destinatários. Tente de novo.' }, 500);
    }
    const conferidos = conferirDestinatarios(
        corpo.recipients,
        ((membros ?? []) as { email: string | null }[]).map(m => m.email ?? ''),
    );
    if (!conferidos.ok) {
        return json({ error: conferidos.erro, recusados: conferidos.recusados }, conferidos.status);
    }

    // 3a. O resumo de IA: o texto guardado pela bi-narrative, deste usuário, desta
    //     organização e deste período. Nunca regenerado aqui.
    let narrativa: string | null = null;
    if (narrativeId) {
        const { data: n, error: errNarr } = await admin
            .from('bi_narrativas')
            .select('texto, date_from, date_to')
            .eq('id', narrativeId)
            .eq('user_id', vinculo.userId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (errNarr) {
            console.error('[send-bi-report] narrativa:', errNarr);
            return json({ error: 'Falha ao ler o resumo de IA. Tente de novo.' }, 500);
        }
        if (!n) return json({ error: 'Resumo de IA não encontrado. Gere o resumo de novo.' }, 404);
        const guardada = n as { texto: string; date_from: string | null; date_to: string | null };
        if (guardada.date_from !== dateFrom || guardada.date_to !== dateTo) {
            return json({ error: 'O resumo de IA foi gerado para outro período. Gere o resumo de novo para este período.' }, 409);
        }
        narrativa = guardada.texto;
    }

    // 3b. Os números, COMO o usuário: as duas funções são SECURITY INVOKER e
    //     recortam pelo auth.uid() — é a mesma conta da tela.
    const comoUsuario = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const [executivo, tendencia] = await Promise.all([
        comoUsuario.rpc('fn_bi_executive', { p_organization_id: orgId, p_date_from: dateFrom, p_date_to: dateTo }),
        comoUsuario.rpc('fn_bi_trend', { p_organization_id: orgId, p_months: 12 }),
    ]);
    if (executivo.error) {
        console.error('[send-bi-report] fn_bi_executive:', executivo.error);
        return json({ error: 'Não foi possível ler os indicadores do BI. Tente de novo.' }, 500);
    }
    // Como na tela (biService.getSummary): a tendência é complementar.
    if (tendencia.error) console.warn('[send-bi-report] fn_bi_trend:', tendencia.error);

    // 3c. O nome da organização vem do banco.
    const { data: org, error: errOrg } = await admin
        .from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (errOrg) console.error('[send-bi-report] organização:', errOrg);

    // 4. Teto diário — contado só quando o envio vai de fato sair.
    const { error: errCota } = await admin.rpc('_bi_relatorio_envio_cota', { p_user: vinculo.userId, p_org: orgId });
    if (errCota) {
        if (errCota.code === '54000') {
            return json({ error: errCota.message || 'Limite diário de envios do relatório atingido — tente de novo amanhã.' }, 429);
        }
        console.error('[send-bi-report] limite de uso:', errCota);
        return json({ error: 'Falha ao conferir o limite de envios. Tente de novo.' }, 500);
    }

    const { assunto, html } = montarRelatorioBI({
        nomeOrganizacao: (org as { name?: string | null } | null)?.name ?? '',
        dateFrom,
        dateTo,
        geradoEm: new Date(),
        kpis: executivo.data,
        tendencia: tendencia.error ? [] : tendencia.data,
        narrativa,
    });

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
            to: conferidos.destinatarios,
            subject: assunto,
            html,
        }),
    });

    if (!sendRes.ok) {
        const err = await sendRes.text();
        return json({ error: `Resend API: ${err}` }, 502);
    }

    // Atualiza last_sent_at do schedule. O filtro por organização não é
    // decorativo: sem ele, um membro de qualquer organização carimbava o
    // agendamento de outra (o cliente é service_role, a RLS não recorta).
    if (scheduleId) {
        await admin
            .from('bi_report_schedules')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('id', scheduleId)
            .eq('org_id', orgId);   // esta tabela usa `org_id`, não `organization_id`
    }

    return json({ success: true, recipients: conferidos.destinatarios, incluiuResumo: !!narrativa });
});
