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

// Abre um documento do condomínio para o Portal do CLIENTE (aba Condomínio).
//
// Irmã da `condomino-portal-download`, e existe separada por um motivo concreto:
// o Portal do Condômino tem UMA identidade (`condomino_portal_access`, pessoa ×
// unidade) e o Portal do Cliente tem DUAS (link público por
// `client_portal_tokens`, e cliente logado / admin espiando por dentro). Enfiar
// as duas famílias numa function só significaria uma árvore de `if` onde cada
// ramo é uma regra de autorização diferente — e é aí que uma delas envelhece
// sozinha.
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3). Quem decide
// quais documentos este cliente pode ver é `fn_condominio_payload_for_client`,
// pela CTE `minhas` (ocupação vigente × empreendimento EM_OPERACAO) mais
// `visivel_portal`. Copiar essa regra para cá criaria uma segunda cópia que
// diverge da primeira no primeiro ajuste. Então esta function **chama a mesma
// RPC que o portal chama**, com a mesma credencial do chamador, e só aceita o
// documento se ele estiver na lista que voltou:
//
//   • com `token`  → `client_portal_get_condominio` (concedida a anon);
//   • sem `token`  → `client_portal_get_condominio_for_client`, com o
//                    Authorization DO CHAMADOR repassado, para `auth.uid()` e a
//                    checagem de e-mail/org valerem lá dentro. A service_role
//                    NUNCA é usada para autorizar — só para assinar, no fim.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { token, clientId, documentoId } = await req.json() as {
        token?: string; clientId?: string; documentoId?: string;
    };
    if (!documentoId || (!token && !clientId)) {
        return json({ error: 'documentoId e (token ou clientId) são obrigatórios' }, 400);
    }

    // Cliente com a credencial de QUEM CHAMOU — nunca a service_role.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: payload, error: erroPayload } = token
        ? await comoChamador.rpc('client_portal_get_condominio', { p_token: token })
        : await comoChamador.rpc('client_portal_get_condominio_for_client', { p_client_id: clientId });

    if (erroPayload) {
        console.error('[client-portal-condominio-download] erro na RPC:', erroPayload);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!payload?.ok) {
        return json({ error: payload?.motivo || 'Link inválido ou expirado' }, 403);
    }

    // O documento tem de estar na lista que a RPC devolveu para ESTE cliente.
    // É isso que impede pedir a convenção de outro condomínio trocando o id.
    const doc = (payload.documentos ?? []).find((d: { id: string }) => d.id === documentoId);
    if (!doc) {
        return json({ error: 'Documento não disponível para este acesso' }, 403);
    }

    // Link externo é o endereço que o síndico cadastrou — devolve como está.
    // Só arquivo nosso precisa de assinatura, e o caminho dele não vem no
    // payload (não deve vir: path de bucket privado não é dado de portal).
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: linha, error: erroLinha } = await admin
        .from('condominio_documentos')
        .select('url, storage_path')
        .eq('id', documentoId)
        .maybeSingle();

    if (erroLinha || !linha) {
        return json({ error: 'Documento não encontrado' }, 404);
    }
    if (!linha.storage_path) {
        if (!linha.url) return json({ error: 'Documento sem arquivo nem link' }, 404);
        return json({ url: linha.url });
    }

    const { data: assinado, error: erroAssinatura } = await admin.storage
        .from('condominio-documentos')
        .createSignedUrl(linha.storage_path, 60 * 15);

    if (erroAssinatura || !assinado) {
        console.error('[client-portal-condominio-download] erro ao assinar URL:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ url: assinado.signedUrl });
});
