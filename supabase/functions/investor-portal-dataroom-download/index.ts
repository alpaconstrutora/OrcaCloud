// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { caminhoSemTravessia } from "../_shared/caminhoSemTravessia.ts"

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

// Desde 21/11/2026 (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 3) o Data Room
// são documentos do GED compartilhados com a oportunidade: a versão ATIVA, no bucket do GED.
const BUCKET = 'opura-docs';
const TTL_SEGUNDOS = 60 * 15;
const MAX_PATHS = 50;

// Assina documentos do Data Room de uma oportunidade para o Portal do INVESTIDOR aberto por link
// (token, sem sessão) — plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md,
// Fase 7. O bucket `opportunity-dataroom` é privado e a policy de leitura exige membro da
// organização; o link não tem isso.
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3; molde: client-portal-diary-download).
// Quem decide o que este token vê é `fn_investor_portal_get_dataroom`: oportunidade PUBLICADA da
// organização do link. Esta function chama a MESMA RPC, com a credencial do chamador, e só assina
// o path que estiver na lista que voltou. Path fora da lista → 403, sem assinar nada. A
// service_role entra só no fim, para assinar.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let body: { token?: string; opportunityId?: string; filePaths?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const token = typeof body.token === 'string' ? body.token : '';
    const opportunityId = typeof body.opportunityId === 'string' ? body.opportunityId : '';
    const pedidos = Array.isArray(body.filePaths)
        ? body.filePaths.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
        : [];
    if (!token || !opportunityId || pedidos.length === 0) {
        return json({ error: 'token, opportunityId e filePaths são obrigatórios' }, 400);
    }
    if (pedidos.length > MAX_PATHS) {
        return json({ error: `No máximo ${MAX_PATHS} arquivos por chamada` }, 400);
    }

    // Cliente com a credencial de QUEM CHAMOU — nunca a service_role.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: payload, error: erroPayload } = await comoChamador.rpc('fn_investor_portal_get_dataroom', {
        p_token: token,
        p_opportunity_id: opportunityId,
    });
    if (erroPayload) {
        console.error('[investor-portal-dataroom-download] erro na RPC:', erroPayload);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!payload?.valid) {
        return json({ error: payload?.error || 'Link inválido ou expirado' }, 403);
    }

    const permitidos = new Set<string>(
        (Array.isArray(payload.documents) ? payload.documents : [])
            .map((d: Record<string, unknown>) => d?.file_path)
            .filter((p: unknown): p is string => typeof p === 'string'),
    );
    if (pedidos.some(p => !permitidos.has(p))) {
        return json({ error: 'Arquivo não disponível para este acesso' }, 403);
    }
    // O caminho vem do GED (gravado por quem usa o app): com `..`/`%2e%2e` a assinatura da service_role
    // sairia da pasta (o mesmo cuidado de portal-ged-download, F53).
    if (pedidos.some(p => !caminhoSemTravessia(p))) {
        return json({ error: 'Caminho de arquivo inválido' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: assinados, error: erroAssinatura } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(pedidos, TTL_SEGUNDOS);

    if (erroAssinatura || !assinados) {
        console.error('[investor-portal-dataroom-download] erro ao assinar URLs:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    const urls: Record<string, string> = {};
    for (const item of assinados as Array<{ path: string | null; signedUrl: string; error: string | null }>) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
    }
    return json({ urls });
});
