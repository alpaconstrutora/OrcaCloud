// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaDeCron, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { montarResumo, type DadosDoResumo } from "./resumo.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Resumo semanal da Diretoria (ÒPURA CEO) por e-mail. Plano: docs/planos/2026-11-17-opura-ceo.md.
 *
 * Dois jeitos de chamar — e NENHUM outro (verify_jwt = false no config.toml: o gate é este código,
 * REGRA #7 pergunta 3):
 *   1. Cron (pg_cron "diretoria-resumo-semanal", segunda 10:00 GMT) com `Authorization: Bearer
 *      <CRON_SECRET>` → manda para todos que ligaram "Receber toda segunda". O job já gravou a
 *      foto da semana (fn_diretoria_registrar_semana) antes de chamar.
 *   2. Prévia: usuário logado (JWT) → manda SÓ para ele, e só se ele tem a permissão Diretoria em
 *      alguma org — conferido pelo BANCO, chamando fn_diretoria_painel com o token dele.
 * Sem um dos dois: 401.
 *
 * ⚠️ Depois de publicar, provar com uma requisição SEM header que responde 401 (o arquivo local
 * não é evidência do bundle publicado):
 *   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/diretoria-resumo-semanal" -d '{}'
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromEmail      = Deno.env.get('REPORT_FROM_EMAIL') ?? 'alertas@opura.com.br';
  const linkDoApp      = Deno.env.get('APP_URL') ?? 'https://orcacloud.vercel.app';

  let destinatarios: string[] = [];
  let previa = false;

  if (chamadaDeCron(req)) {
    // segue abaixo, com a lista de quem ligou o resumo
  } else {
    const vinculo = await exigirUsuario(req);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
    // A permissão é do banco: o painel, chamado COMO o usuário, só traz org em que ele a tem.
    const comoUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: painel, error } = await comoUsuario.rpc('fn_diretoria_painel', { p_org: null });
    if (error || !Array.isArray(painel?.orgs) || painel.orgs.length === 0) {
      return json({ error: 'Sem a permissão "Diretoria (CEO)" em nenhuma organização.' }, 403);
    }
    destinatarios = [vinculo.userId];
    previa = true;
  }

  if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (!previa) {
    const { data, error } = await admin.rpc('fn_diretoria_resumo_destinatarios');
    if (error) return json({ error: error.message, passo: 'destinatarios' }, 500);
    destinatarios = ((data ?? []) as unknown[]).map(String);
  }

  const resultado: { userId: string; status: string; detalhe?: string }[] = [];
  for (const userId of destinatarios) {
    try {
      const { data, error } = await admin.rpc('fn_diretoria_resumo_dados', { p_user: userId });
      if (error) { resultado.push({ userId, status: 'erro_dados', detalhe: error.message }); continue; }
      const dados = data as DadosDoResumo | null;
      if (!dados || !dados.orgs?.length || !dados.destinatario?.email) {
        resultado.push({ userId, status: 'sem_permissao_ou_email' });
        continue;
      }
      const { assunto, html, texto } = montarResumo(dados, linkDoApp);
      const envio = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: fromEmail,
          to: [dados.destinatario.email],
          subject: previa ? `[Prévia] ${assunto}` : assunto,
          html,
          text: texto,
        }),
      });
      if (!envio.ok) {
        resultado.push({ userId, status: 'erro_email', detalhe: (await envio.text()).slice(0, 300) });
        continue;
      }
      resultado.push({ userId, status: 'enviado' });
    } catch (e) {
      resultado.push({ userId, status: 'excecao', detalhe: String(e).slice(0, 300) });
    }
  }

  return json({
    modo: previa ? 'previa' : 'cron',
    enviados: resultado.filter(r => r.status === 'enviado').length,
    resultado,
  });
});
