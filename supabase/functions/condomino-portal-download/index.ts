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

// Abre um documento do condomínio para quem entrou no Portal do Condômino.
//
// Mesmo problema — e mesma solução — de `portal-ged-download`,
// `supplier-portal-download` e `partner-portal-download`: a sessão do portal é
// anon/token, e a policy de `storage.objects` do bucket `condominio-documentos`
// exige `authenticated` + `is_org_member`. Era essa a razão de os documentos do
// condomínio só aceitarem link público até 04/09/2026.
//
// ⚠️ A AUTORIZAÇÃO É ESTE CÓDIGO, não o `verify_jwt` do gateway (REGRA #7,
// pergunta 3): o gateway só confere que o token é uma chave válida DO PROJETO, e
// a chave anon vai no bundle do frontend. O que decide aqui são as três
// checagens abaixo, nesta ordem, e só depois delas o service_role entra:
//   1. o token existe, está ativo e não expirou;
//   2. o documento pedido é do MESMO empreendimento do acesso — sem isso, um
//      condômino do prédio A pediria a convenção do prédio B só trocando o id;
//   3. o documento está marcado como visível no portal — documento interno
//      (laudo em análise, minuta) não sai daqui.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { token, documentoId } = await req.json() as { token?: string; documentoId?: string };
    if (!token || !documentoId) {
        return json({ error: 'token e documentoId são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1 — o acesso
    const { data: acesso, error: erroAcesso } = await admin
        .from('condomino_portal_access')
        .select('unit_id, is_active, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (erroAcesso || !acesso || !acesso.is_active || new Date(acesso.expires_at) < new Date()) {
        return json({ error: 'Link inválido ou expirado' }, 403);
    }

    // 2 — de qual empreendimento é a unidade do acesso.
    // Duas consultas em vez de um embed aninhado de propósito: `empreendimento_units`
    // tem mais de um caminho para chegar a empreendimento, e embed ambíguo no
    // PostgREST responde PGRST201 dentro de um HTTP 300 — que passa despercebido
    // por qualquer checagem de `status >= 400`.
    const { data: unidade, error: erroUnidade } = await admin
        .from('empreendimento_units')
        .select('tower_id')
        .eq('id', acesso.unit_id)
        .maybeSingle();

    if (erroUnidade || !unidade) {
        return json({ error: 'Unidade do acesso não encontrada' }, 403);
    }

    const { data: torre, error: erroTorre } = await admin
        .from('empreendimento_towers')
        .select('empreendimento_id')
        .eq('id', unidade.tower_id)
        .maybeSingle();

    if (erroTorre || !torre) {
        return json({ error: 'Empreendimento do acesso não encontrado' }, 403);
    }

    // 3 — o documento, preso ao empreendimento do acesso e visível no portal
    const { data: doc, error: erroDoc } = await admin
        .from('condominio_documentos')
        .select('url, storage_path, visivel_portal, empreendimento_id')
        .eq('id', documentoId)
        .maybeSingle();

    if (erroDoc || !doc || doc.empreendimento_id !== torre.empreendimento_id || !doc.visivel_portal) {
        return json({ error: 'Documento não disponível para este acesso' }, 403);
    }

    // Link externo continua sendo o que sempre foi: o endereço que o síndico
    // cadastrou. Só o arquivo enviado precisa de assinatura.
    if (!doc.storage_path) {
        if (!doc.url) return json({ error: 'Documento sem arquivo nem link' }, 404);
        return json({ url: doc.url });
    }

    const { data: assinado, error: erroAssinatura } = await admin.storage
        .from('condominio-documentos')
        .createSignedUrl(doc.storage_path, 60 * 15);

    if (erroAssinatura || !assinado) {
        console.error('[condomino-portal-download] erro ao assinar URL:', erroAssinatura);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ url: assinado.signedUrl });
});
