// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') ?? 'https://oxedkknreghxrgenyjiu.supabase.co',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        console.log("Starting automated billing ruler check...");

        // 1. Fetch all projects that have financialInfo and billingRules
        // Use service role to bypass RLS and see all projects
        const { data: projects, error: fetchError } = await supabaseClient
            .from('projects')
            .select('id, name, organization_id, settings')
            .not('settings->financialInfo', 'is', null);

        if (fetchError) throw fetchError;

        const saoPauloLocale = 'America/Sao_Paulo';
        const now = new Date();
        const today = now.toLocaleDateString('en-CA', { timeZone: saoPauloLocale });
        const currentHour = parseInt(now.toLocaleTimeString('en-US', {
            timeZone: saoPauloLocale,
            hour12: false,
            hour: '2-digit'
        }));

        console.log(`Processing for date: ${today}, Current Hour (BRT): ${currentHour}`);

        let totalProcessed = 0;
        let totalSent = 0;
        let totalErrors = 0;

        for (const project of (projects || [])) {
            const financialInfo = project.settings?.financialInfo;
            const scheduledHour = financialInfo?.billingTriggerHour ?? 9; // Default to 09:00

            if (currentHour !== scheduledHour) {
                console.log(`Skipping project ${project.name}: scheduled for ${scheduledHour}:00, current is ${currentHour}:00`);
                continue;
            }

            const installments = financialInfo?.installments || [];
            const rules = financialInfo?.billingRules || [];

            if (rules.length === 0 || installments.length === 0) continue;

            const pendingInsts = installments.filter((i: Record<string, unknown>) => i.status === 'PENDING' || i.status === 'PENDENTE');

            for (const inst of pendingInsts) {
                const dueDate = inst.dueDate || inst.due_date;
                if (!dueDate) continue;

                for (const rule of rules) {
                    if (!rule.active) continue;
                    if (rule.minValue && inst.value < rule.minValue) continue;

                    // Normalize date to midday to avoid timezone shift issues during calculation
                    const targetDate = new Date(dueDate + 'T12:00:00');
                    targetDate.setDate(targetDate.getDate() + (rule.days || 0));

                    const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                    if (targetDateStr === today) {
                        totalProcessed++;
                        console.log(`Triggering billing for project ${project.name}: ${inst.description} (${inst.value})`);

                        // Trigger Webhook
                        const billingUrl = financialInfo.billingWebhookUrl || project.settings?.billingWebhookUrl;

                        if (!billingUrl || billingUrl.includes('your-webhook-id')) {
                            console.warn(`[WEBHOOK] Billing Webhook URL not configured for project ${project.id}. Skipping.`);
                            continue;
                        }

                        const renderTemplate = (template: string, data: { cliente: string; valor: string; vencimento: string; descricao: string; projeto: string }) => {
                            if (!template) return '';
                            return template
                                .replace(/{{cliente}}/g, data.cliente)
                                .replace(/{{valor}}/g, data.valor)
                                .replace(/{{vencimento}}/g, data.vencimento)
                                .replace(/{{descricao}}/g, data.descricao)
                                .replace(/{{projeto}}/g, data.projeto);
                        };

                        const dueDateStr = inst.dueDate || inst.due_date;
                        const formattedDate = dueDateStr ? new Date(dueDateStr + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A';
                        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value);

                        const renderedMessage = renderTemplate(rule.messageTemplate || '', {
                            cliente: inst.clientName || 'Cliente',
                            valor: formattedValue,
                            vencimento: formattedDate,
                            descricao: inst.description || 'Parcela',
                            projeto: project.name || 'Projeto'
                        });

                        const payload = {
                            event: 'billing_triggered',
                            timestamp: new Date().toISOString(),
                            renderedMessage,
                            installment: {
                                id: inst.id,
                                value: inst.value,
                                dueDate: dueDate,
                                description: inst.description,
                                clientName: inst.clientName,
                                propertyName: inst.propertyName,
                                status: inst.status
                            },
                            rule: {
                                id: rule.id,
                                days: rule.days,
                                triggerMode: rule.triggerMode
                            },
                            project: {
                                id: project.id,
                                name: project.name,
                                organizationId: project.organization_id
                            }
                        };

                        try {
                            const response = await fetch(billingUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });

                            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                            // Log success
                            await supabaseClient.from('automation_history').insert({
                                project_id: project.id,
                                organization_id: project.organization_id,
                                event_type: 'billing_triggered',
                                reference_id: inst.id,
                                reference_name: `${inst.clientName} - ${inst.description || 'Parcela'}`,
                                status: 'success',
                                payload
                            });
                            totalSent++;
                        } catch (err: unknown) {
                            console.error(`Error triggering billing for projects ${project.id}:`, err);
                            // Log error
                            await supabaseClient.from('automation_history').insert({
                                project_id: project.id,
                                organization_id: project.organization_id,
                                event_type: 'billing_triggered',
                                reference_id: inst.id,
                                reference_name: `${inst.clientName} - ${inst.description || 'Parcela'}`,
                                status: 'error',
                                error_message: err instanceof Error ? err.message : String(err),
                                payload
                            });
                            totalErrors++;
                        }
                    }
                }
            }
        }

        return new Response(
            JSON.stringify({
                message: "Automated billing run complete",
                stats: { totalProcessed, totalSent, totalErrors }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error: unknown) {
        console.error("Error in process-billing-ruler:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
