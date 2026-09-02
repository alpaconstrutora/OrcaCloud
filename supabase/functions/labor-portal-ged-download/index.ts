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

// Gera link assinado para um documento do GED compartilhado com o colaborador
// no Portal do Colaborador. A policy de storage.objects do bucket 'opura-docs'
// só vale para authenticated, e a sessão do portal é anon — daí o service role,
// usado só DEPOIS da checagem manual abaixo.
//
// 2026-09-02 (achado C3-02): até esta data a função aceitava `employeeId` cru e
// a única checagem era "o colaborador existe". Quem tivesse o UUID baixava os
// documentos de RH de qualquer pessoa. Agora o recorte vem do token
// (portal_tokens), no mesmo desenho de academy-portal-media — que já
// documentava, nas suas linhas 32-33, por que passar employeeId é enumerável.
//
// `employeeId` ainda é aceito, mas SÓ com Authorization de usuário autenticado
// (o admin simulando o portal pelo módulo de RH). Sem sessão, só token.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const { token, employeeId: employeeIdBruto, storagePath } = await req.json() as {
        token?: string; employeeId?: string; storagePath?: string;
    };
    if (!storagePath || (!token && !employeeIdBruto)) {
        return json({ error: 'storagePath e (token ou employeeId autenticado) são obrigatórios' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Resolve QUEM é o colaborador, sem confiar no corpo da requisição ──
    let employeeId: string | null = null;

    if (token) {
        const { data: tok, error: tokError } = await admin
            .from('portal_tokens')
            .select('employee_id, is_active, expires_at')
            .eq('token', token)
            .maybeSingle();

        if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) < new Date()) {
            return json({ error: 'Link inválido ou expirado' }, 403);
        }
        employeeId = tok.employee_id;
    } else {
        // Caminho interno: exige sessão autenticada de verdade. A chave anon é
        // pública e NÃO satisfaz getUser(), então não serve de burla aqui.
        const authHeader = req.headers.get('Authorization') ?? '';
        if (!authHeader) {
            return json({ error: 'employeeId exige sessão autenticada' }, 401);
        }
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user?.email) {
            return json({ error: 'Sessão inválida' }, 401);
        }

        // E que o usuário seja membro da organização DONA do colaborador.
        const { data: emp } = await admin
            .from('employees')
            .select('id, org_id')
            .eq('id', employeeIdBruto)
            .maybeSingle();
        if (!emp) return json({ error: 'Colaborador não encontrado' }, 404);

        const { data: vinculo } = await admin
            .from('organization_members')
            .select('role')
            .eq('organization_id', emp.org_id)
            .eq('email', user.email.toLowerCase())
            .maybeSingle();
        if (!vinculo) {
            return json({ error: 'Sem acesso a este colaborador' }, 403);
        }
        employeeId = emp.id;
    }

    // Confirma que o arquivo pedido é de fato a versão ativa de um documento
    // atualmente compartilhado com este colaborador (não deixa passar path arbitrário).
    const { data: shared, error: sharedError } = await admin
        .from('opura_document_portal_shares')
        .select('document:opura_documents!inner(active_version:opura_document_versions!fk_active_version(storage_path))')
        .eq('audience', 'colaborador')
        .eq('employee_id', employeeId);

    if (sharedError) {
        console.error('[labor-portal-ged-download] erro ao validar vínculo:', sharedError);
        return json({ error: 'Erro ao validar acesso ao documento' }, 500);
    }

    const allowed = (shared || []).some((row: any) => row.document?.active_version?.storage_path === storagePath);
    if (!allowed) {
        return json({ error: 'Documento não compartilhado com este colaborador' }, 403);
    }

    const { data: signed, error: signError } = await admin.storage
        .from('opura-docs')
        .createSignedUrl(storagePath, 60 * 15);

    if (signError || !signed) {
        console.error('[labor-portal-ged-download] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    return json({ signedUrl: signed.signedUrl });
});
