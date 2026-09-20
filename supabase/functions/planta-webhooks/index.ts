// supabase/functions/planta-webhooks/index.ts
//
// DESPACHANTE dos webhooks da Planta Inteligente (20/09/2026, roadmap E9.3).
//
// ─── O QUE FAZ ──────────────────────────────────────────────────────────────
//
// Entrega o que está na fila `blueprint_webhook_entregas` com status PENDENTE
// e `proxima_tentativa_at` vencida: POST no `url` do webhook com o corpo
// assinado (HMAC-SHA256 do corpo com o `segredo`, em `X-Opura-Signature`),
// 10 s de timeout. 2xx → ENTREGUE. Qualquer outra coisa → tentativa + 1 e a
// próxima tentativa pela política (1 min, 5 min, 30 min, 2 h, 12 h); na sexta
// falha, FALHOU (a pessoa reenvia pela tela). Cada resultado fica no log
// (status http, erro, horários) e no webhook (`ultimo_status`,
// `ultima_entrega_at`).
//
// ─── QUEM CHAMA ─────────────────────────────────────────────────────────────
//
// O banco: o gatilho de cada evento (pg_net, na hora) e o pg_cron (a cada
// minuto, só quando há entrega vencida). Gate = `CRON_SECRET` (REGRA #7,
// `chamadaDeCron`), nunca a service_role key. Sem corpo: a function acha o
// trabalho sozinha. Chamá-la duas vezes é inofensivo: cada entrega é
// reservada (`UPDATE … RETURNING`) antes de sair.
//
// ─── O QUE NÃO FAZ ──────────────────────────────────────────────────────────
//
// Não segue redirecionamento (um 3xx conta como falha — o destino tem de ser
// o final), não repete um 2xx, não entrega para http://.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaDeCron } from '../_shared/auth.ts';
import { assinar, esperaAposFalha, MAX_TENTATIVAS, type CorpoDoWebhook, type EventoDeWebhook } from './politica.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Quantas entregas por chamada: o cron volta em um minuto para o resto. */
const LOTE = 50;
const TIMEOUT_MS = 10_000;

interface Entrega {
  id: string;
  webhook_id: string;
  organization_id: string;
  evento: EventoDeWebhook;
  payload: Record<string, unknown>;
  tentativas: number;
  created_at: string;
}
interface Webhook {
  id: string;
  url: string;
  segredo: string;
  active: boolean;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!chamadaDeCron(req)) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

  // 1. Reservar o lote: quem lê também marca (tentativas+1, próxima tentativa
  //    empurrada), para uma segunda chamada simultânea não pegar as mesmas.
  const agora = new Date().toISOString();
  const { data: candidatas, error: e1 } = await sb
    .from('blueprint_webhook_entregas')
    .select('id, webhook_id, organization_id, evento, payload, tentativas, created_at')
    .eq('status', 'PENDENTE')
    .lte('proxima_tentativa_at', agora)
    .order('proxima_tentativa_at', { ascending: true })
    .limit(LOTE);
  if (e1) return json({ error: `fila: ${e1.message}` }, 500);
  const entregas = (candidatas ?? []) as Entrega[];
  if (entregas.length === 0) return json({ entregues: 0, falhas: 0, pendentes: 0 });

  const ids = entregas.map((e) => e.id);
  const { data: reservadas, error: e2 } = await sb
    .from('blueprint_webhook_entregas')
    .update({ proxima_tentativa_at: new Date(Date.now() + 5 * 60_000).toISOString() })
    .in('id', ids)
    .eq('status', 'PENDENTE')
    .lte('proxima_tentativa_at', agora)
    .select('id');
  if (e2) return json({ error: `reserva: ${e2.message}` }, 500);
  const minhas = new Set((reservadas ?? []).map((r: { id: string }) => r.id));

  const { data: webhooksData } = await sb.from('blueprint_webhooks').select('id, url, segredo, active').in('id', [...new Set(entregas.map((e) => e.webhook_id))]);
  const webhooks = new Map<string, Webhook>(((webhooksData ?? []) as Webhook[]).map((w) => [w.id, w]));

  let entregues = 0;
  let falhas = 0;
  let pendentes = 0;
  for (const e of entregas) {
    if (!minhas.has(e.id)) continue;
    const w = webhooks.get(e.webhook_id);
    const tentativa = e.tentativas + 1;
    let httpStatus: number | null = null;
    let erro: string | null = null;

    if (!w || !w.active) {
      erro = w ? 'webhook desativado' : 'webhook apagado';
    } else {
      const corpo: CorpoDoWebhook = { id: e.id, evento: e.evento, criado_em: e.created_at, tentativa, organizacao_id: e.organization_id, dados: e.payload };
      const texto = JSON.stringify(corpo);
      const assinatura = await assinar(w.segredo, texto);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(w.url, {
          method: 'POST',
          redirect: 'manual',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Opura-Planta-Webhooks/1.0',
            'X-Opura-Event': e.evento,
            'X-Opura-Delivery': e.id,
            'X-Opura-Attempt': String(tentativa),
            'X-Opura-Signature': assinatura,
          },
          body: texto,
        });
        httpStatus = r.status;
        if (r.status < 200 || r.status >= 300) erro = `HTTP ${r.status}${r.status >= 300 && r.status < 400 ? ' (redirecionamento não é seguido)' : ''}`;
        // Drena o corpo para liberar a conexão; o conteúdo não interessa.
        await r.arrayBuffer().catch(() => undefined);
      } catch (ex) {
        erro = ex instanceof Error ? (ex.name === 'AbortError' ? `sem resposta em ${TIMEOUT_MS / 1000} s` : ex.message) : String(ex);
      } finally {
        clearTimeout(timer);
      }
    }

    const ok = erro === null;
    const desistir = !ok && (tentativa >= MAX_TENTATIVAS || !w || !w.active);
    const espera = ok || desistir ? null : esperaAposFalha(tentativa);
    const status = ok ? 'ENTREGUE' : desistir || espera === null ? 'FALHOU' : 'PENDENTE';
    await sb
      .from('blueprint_webhook_entregas')
      .update({
        status,
        tentativas: tentativa,
        http_status: httpStatus,
        erro: erro ? erro.slice(0, 500) : null,
        proxima_tentativa_at: espera !== null ? new Date(Date.now() + espera * 1000).toISOString() : agora,
        entregue_at: ok ? new Date().toISOString() : null,
      })
      .eq('id', e.id);
    if (w) await sb.from('blueprint_webhooks').update({ ultimo_status: httpStatus, ultima_entrega_at: new Date().toISOString() }).eq('id', w.id);
    if (ok) entregues++;
    else if (status === 'FALHOU') falhas++;
    else pendentes++;
  }
  return json({ entregues, falhas, pendentes });
});
