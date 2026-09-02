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

const MAX_SIZE = 50 * 1024 * 1024; // mesmo limite do bucket opura-docs

// Recebe um arquivo do acesso via link público do Portal do Parceiro (sessão anon) e faz o
// upload usando o service role -- a policy de RLS de storage.objects para upload de parceiro
// (storage_docs_insert_partner) exige sessão authenticated com partner_users correspondente,
// que uma sessão anon/token nunca tem. Aqui a validação do token substitui essa checagem.
//
// target='invoice' (opcional): NF de uma medição do Portal Financeiro. Diferente do anexo
// padrão (bucket privado opura-docs), a NF vai para o bucket público 'documents', no mesmo
// caminho/formato que ContractMeasurementModal.tsx grava no admin
// (invoices/{contract_id}/{ts}_{nome} + URL pública) — senão o link salvo em
// contract_measurements.invoice_url ficaria morto quando aberto pela tela interna.
// Aceita também Authorization: Bearer <jwt> no lugar do token, para o modo autenticado
// (login de partner_users) reusar a mesma função em vez de duplicar a lógica de upload.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const formData = await req.formData();
    const token = formData.get('token') as string | null;
    const file = formData.get('file') as File | null;
    const target = formData.get('target') as string | null; // 'invoice' | null (padrão)
    const contractId = formData.get('contractId') as string | null;

    if (!file || (!token && !req.headers.get('Authorization'))) {
        return json({ error: 'file e (token ou sessão autenticada) são obrigatórios' }, 400);
    }
    if (file.size > MAX_SIZE) {
        return json({ error: 'Arquivo excede o limite de 50MB' }, 400);
    }

    let workspaceId: string | null = null;

    if (token) {
        const { data: tok, error: tokError } = await admin
            .from('partner_portal_tokens')
            .select('workspace_id, is_active, expires_at')
            .eq('token', token)
            .maybeSingle();

        if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) < new Date()) {
            return json({ error: 'Link inválido ou expirado' }, 403);
        }
        workspaceId = tok.workspace_id;
    } else {
        const authHeader = req.headers.get('Authorization') || '';
        const jwt = authHeader.replace(/^Bearer\s+/i, '');
        const { data: userData, error: userError } = await admin.auth.getUser(jwt);
        if (userError || !userData?.user?.email) {
            return json({ error: 'Sessão inválida' }, 403);
        }
        const { data: pu } = await admin
            .from('partner_users')
            .select('partner_workspace_id, is_active')
            .eq('email', userData.user.email)
            .eq('is_active', true)
            .maybeSingle();
        if (!pu) {
            return json({ error: 'Usuário não é um parceiro ativo' }, 403);
        }
        workspaceId = pu.partner_workspace_id;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (target === 'invoice') {
        if (!contractId) return json({ error: 'contractId é obrigatório para envio de NF' }, 400);

        // Achado C3-07: o `contractId` ia direto para o caminho, sem nunca ser
        // conferido contra o workspace do token — diferente do ramo padrão, que
        // usa o workspaceId derivado do token. Um parceiro gravava arquivo na
        // pasta de QUALQUER contrato.
        const { data: contrato } = await admin
            .from('contracts')
            .select('id, supplier_id, organization_id')
            .eq('id', contractId)
            .maybeSingle();

        if (!contrato) return json({ error: 'Contrato não encontrado.' }, 404);

        const { data: workspace } = await admin
            .from('partner_workspaces')
            .select('supplier_id, organization_id')
            .eq('id', workspaceId)
            .maybeSingle();

        const doWorkspace = workspace
            && contrato.supplier_id === workspace.supplier_id
            && contrato.organization_id === workspace.organization_id;

        if (!doWorkspace) {
            return json({ error: 'Contrato não pertence a este parceiro.' }, 403);
        }

        // O bucket `documents` é PÚBLICO. Confiar no `file.type` informado pelo
        // cliente permitia publicar text/html numa URL do domínio de storage da
        // organização — phishing com ar de legitimidade. A allowlist aqui espelha
        // o `allowed_mime_types` que a migration aplicar_20270918000008 pôs no
        // bucket; as duas camadas de propósito, porque o bucket também recebe
        // upload por outros caminhos.
        const TIPOS_NF = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
        const tipo = (file.type || '').toLowerCase();
        if (!TIPOS_NF.includes(tipo)) {
            return json({
                error: `Tipo de arquivo não aceito para nota fiscal: ${tipo || '(vazio)'}. Envie PDF ou imagem.`,
            }, 415);
        }

        const path = `invoices/${contractId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await admin.storage
            .from('documents')
            .upload(path, bytes, {
                contentType: tipo,
                upsert: false,
            });
        if (uploadError) {
            console.error('[partner-portal-upload] erro ao enviar NF:', uploadError);
            return json({ error: 'Erro ao enviar nota fiscal' }, 500);
        }
        const { data: pub } = admin.storage.from('documents').getPublicUrl(path);
        return json({ publicUrl: pub.publicUrl });
    }

    const path = `partner-uploads/${workspaceId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await admin.storage
        .from('opura-docs')
        .upload(path, bytes, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) {
        console.error('[partner-portal-upload] erro ao enviar arquivo:', uploadError);
        return json({ error: 'Erro ao enviar arquivo' }, 500);
    }

    return json({ storagePath: path });
});
