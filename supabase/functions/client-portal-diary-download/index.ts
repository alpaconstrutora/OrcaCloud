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

const BUCKET = 'diario-midia';
const TTL_SEGUNDOS = 60 * 60;
const MAX_PATHS = 100;

// Assina fotos/vídeos/documentos do Diário de Obras para o Portal do CLIENTE
// aberto por link público (token, sem sessão).
//
// O bucket `diario-midia` é privado e a policy de leitura exige `authenticated`
// + membro da organização — o link público não tem nem uma coisa nem outra.
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3). Quem decide o
// que este token vê é `client_portal_get_data`: ela devolve o cliente e o
// projeto vinculado, com o `settings` inteiro (e é de lá que o portal tira os
// registros do diário). Esta function chama a MESMA RPC, com a credencial do
// chamador, e só assina o path que estiver dentro do que voltou. Path que não
// está na lista é pedido de foto de outra obra — 403, sem assinar nada.
// A service_role entra só no fim, para assinar.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let body: { token?: string; storagePaths?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const token = typeof body.token === 'string' ? body.token : '';
    const pedidos = Array.isArray(body.storagePaths)
        ? body.storagePaths.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
        : [];
    if (!token || pedidos.length === 0) {
        return json({ error: 'token e storagePaths são obrigatórios' }, 400);
    }
    if (pedidos.length > MAX_PATHS) {
        return json({ error: `No máximo ${MAX_PATHS} arquivos por chamada` }, 400);
    }

    // Cliente com a credencial de QUEM CHAMOU — nunca a service_role.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: payload, error: erroPayload } = await comoChamador.rpc('client_portal_get_data', { p_token: token });
    if (erroPayload) {
        console.error('[client-portal-diary-download] erro na RPC:', erroPayload);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!payload?.valid) {
        return json({ error: payload?.error || 'Link inválido ou expirado' }, 403);
    }

    // Tudo o que o portal pode mostrar deste diário: registros do projeto
    // vinculado e registros próprios do cliente (`clients.diary_entries`).
    const permitidos = new Set<string>();
    const coletar = (entries: unknown) => {
        if (!Array.isArray(entries)) return;
        for (const e of entries as Array<Record<string, unknown>>) {
            for (const k of ['images', 'videos'] as const) {
                const lista = e?.[k];
                if (Array.isArray(lista)) for (const v of lista) if (typeof v === 'string') permitidos.add(v);
            }
            const docs = e?.documents;
            if (Array.isArray(docs)) {
                for (const d of docs as Array<Record<string, unknown>>) {
                    if (typeof d?.url === 'string') permitidos.add(d.url);
                }
            }
        }
    };
    coletar(payload?.project?.settings?.diaryEntries);
    coletar(payload?.client?.diary_entries);

    const foraDaLista = pedidos.filter(p => !permitidos.has(p));
    if (foraDaLista.length > 0) {
        return json({ error: 'Arquivo não disponível para este acesso' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: assinados, error: erroAssinatura } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(pedidos, TTL_SEGUNDOS);

    if (erroAssinatura || !assinados) {
        console.error('[client-portal-diary-download] erro ao assinar URLs:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    const urls: Record<string, string> = {};
    for (const item of assinados as Array<{ path: string | null; signedUrl: string; error: string | null }>) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
    }
    return json({ urls });
});
