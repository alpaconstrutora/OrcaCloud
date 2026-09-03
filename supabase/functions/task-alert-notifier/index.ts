// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaDeCron } from "../_shared/auth.ts"

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

  const supabaseUrl     = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendApiKey    = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromEmail       = Deno.env.get('REPORT_FROM_EMAIL') ?? 'alertas@opura.com.br';

  // Gate: só o cron do banco invoca esta função. `chamadaDeCron` compara com
  // CRON_SECRET (segredo dedicado), não com a service_role key — ver o porquê
  // em _shared/auth.ts.
  //
  // ⚠️ Esta função já esteve ABERTA na internet: o gate existia no repositório
  // mas não no bundle publicado, e com `verify_jwt: false` não havia mais nada
  // barrando. Ao mexer aqui, prove com uma requisição SEM header que o deploy
  // levou o gate junto — o arquivo local não é evidência.
  if (!chamadaDeCron(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!resendApiKey) {
    return json({ error: 'RESEND_API_KEY não configurada.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca tarefas com alerta vencido que ainda não foram notificadas
  const now = new Date().toISOString();
  const { data: tasks, error: tasksError } = await admin
    .from('tasks')
    .select('id, title, description, alert_at, due_date, user_id, org_id, assignee_employee_id')
    .lte('alert_at', now)
    .is('alert_sent_at', null)
    .neq('status', 'done')
    .limit(50);

  if (tasksError) {
    return json({ error: tasksError.message, step: 'query' }, 500);
  }

  if (!tasks || tasks.length === 0) {
    return json({ sent: 0 });
  }

  const results: { taskId: string; status: string }[] = [];

  for (const task of tasks) {
    try {
      // Obtém e-mail do criador da tarefa via auth admin
      const { data: authData, error: authErr } = await admin.auth.admin.getUserById(task.user_id);
      const recipientEmail = authData?.user?.email;

      if (!recipientEmail || authErr) {
        console.warn(`Sem e-mail para tarefa ${task.id} (user ${task.user_id})`);
        await admin.from('tasks').update({ alert_sent_at: now }).eq('id', task.id);
        results.push({ taskId: task.id, status: 'skipped_no_email' });
        continue;
      }

      const alertDate = new Date(task.alert_at).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const htmlBody = `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px 28px;">
            <div style="display: inline-flex; align-items: center; gap: 10px; background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.3); border-radius: 8px; padding: 8px 14px; margin-bottom: 16px;">
              <span style="font-size: 18px;">🔔</span>
              <span style="color: #fbbf24; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Alerta de Tarefa</span>
            </div>
            <h1 style="color: #f1f5f9; font-size: 20px; font-weight: 800; margin: 0; line-height: 1.3;">${task.title}</h1>
          </div>
          <div style="padding: 28px;">
            ${task.description ? `<p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">${task.description}</p>` : ''}
            <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <span style="font-size: 16px;">⏰</span>
              <div>
                <div style="font-size: 11px; color: #9a3412; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Alerta agendado para</div>
                <div style="font-size: 15px; color: #c2410c; font-weight: 800;">${alertDate}</div>
              </div>
            </div>
            ${task.due_date ? `
            <div style="font-size: 12px; color: #64748b; margin-bottom: 20px;">
              📅 <strong>Prazo:</strong> ${new Date(task.due_date).toLocaleDateString('pt-BR')}
            </div>` : ''}
            <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
              <a href="https://orcacloud.vercel.app" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.03em;">
                Abrir no Òpura
              </a>
            </div>
          </div>
          <div style="background: #f1f5f9; padding: 16px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">Você recebeu este e-mail porque configurou um alerta nesta tarefa.</p>
          </div>
        </div>
      `;

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipientEmail],
          subject: `🔔 Alerta: ${task.title}`,
          html: htmlBody,
        }),
      });

      const resendBody = await sendRes.text();

      if (!sendRes.ok) {
        results.push({ taskId: task.id, status: 'email_error' });
        continue;
      }

      // Cria notificação in-app
      await admin.from('notifications').insert({
        recipient_email: recipientEmail,
        title: `🔔 Lembrete: ${task.title}`,
        message: task.description
          ? task.description.slice(0, 120)
          : `Alerta agendado para ${alertDate}`,
        type: 'task_alert',
        is_read: false,
      });

      // Marca como enviado
      await admin.from('tasks').update({ alert_sent_at: now }).eq('id', task.id);
      results.push({ taskId: task.id, status: 'sent' });

    } catch (err) {
      console.error(`Erro ao processar tarefa ${task.id}:`, err);
      results.push({ taskId: task.id, status: 'exception' });
    }
  }

  return json({ sent: results.filter(r => r.status === 'sent').length, results });
});
