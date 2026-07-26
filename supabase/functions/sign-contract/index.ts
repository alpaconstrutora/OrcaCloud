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

const ZAPSIGN_API = 'https://api.zapsign.com.br/api/v1';

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const zapToken   = Deno.env.get('ZAPSIGN_API_TOKEN') ?? '';

    if (!zapToken) return json({ error: 'Serviço de assinatura não configurado. Configure ZAPSIGN_API_TOKEN.' }, 503);

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Token inválido' }, 401);

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, serviceKey);

    try {
        const body = await req.json();
        const { action, organizationId } = body;

        // Alvos suportados, do mais específico para o legado:
        //   documentVersionId → contract_document_versions (versão de documento)
        //   addendumId        → contract_addendums (aditivo)
        //   contractId        → contracts
        //   dealId            → commercial_deals (compat)
        const dealId: string | undefined = body.dealId;
        const contractId: string | undefined = body.contractId;
        const addendumId: string | undefined = body.addendumId;
        const documentVersionId: string | undefined = body.documentVersionId;
        const target = documentVersionId ? 'document_version'
                     : addendumId ? 'addendum'
                     : contractId ? 'contract'
                     : 'deal';

        if (!action || (!dealId && !contractId && !addendumId && !documentVersionId) || !organizationId) {
            return json({ error: 'action, (dealId, contractId, addendumId ou documentVersionId) e organizationId são obrigatórios' }, 400);
        }

        // ── ENVIAR DOCUMENTO PARA ASSINATURA ─────────────────────────────────
        if (action === 'send') {
            const { documentBase64, documentName, signers } = body;
            if (!documentBase64 || !documentName || !signers?.length) {
                return json({ error: 'documentBase64, documentName e signers são obrigatórios para send' }, 400);
            }

            const zapPayload = {
                name: documentName,
                url_pdf: null,
                base64_pdf: documentBase64,
                signers: signers.map((s: { name: string; email: string; phone?: string }) => ({
                    name: s.name,
                    email: s.email,
                    phone_country: 'BR',
                    phone_number: s.phone ?? '',
                    send_automatic_email: true,
                    send_automatic_whatsapp: !!s.phone,
                    auth_mode: 'assinaturaTela',
                })),
                lang: 'pt-br',
                disable_signer_emails: false,
                signed_file_only_finished: true,
            };

            const zapResp = await fetch(`${ZAPSIGN_API}/docs/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${zapToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(zapPayload),
            });

            if (!zapResp.ok) {
                const err = await zapResp.text();
                console.error('[sign-contract] ZapSign error:', err);
                return json({ error: 'Erro ao criar documento no ZapSign', detail: err }, 502);
            }

            const zapDoc = await zapResp.json();
            const signUrl = zapDoc.signers?.[0]?.sign_url ?? null;

            if (target === 'document_version') {
                await adminClient.from('contract_document_versions').update({
                    signature_token: zapDoc.token,
                    signature_status: 'SENT',
                    signature_url: signUrl,
                }).eq('id', documentVersionId);

                // Denormaliza no aditivo quando a versão pertence a um: a lista
                // de aditivos mostra o status sem precisar carregar as versões.
                const { data: ver } = await adminClient
                    .from('contract_document_versions')
                    .select('owner_type, owner_id')
                    .eq('id', documentVersionId)
                    .maybeSingle();
                if (ver?.owner_type === 'ADDENDUM') {
                    await adminClient.from('contract_addendums').update({
                        signature_token: zapDoc.token,
                        signature_status: 'SENT',
                        signature_url: signUrl,
                    }).eq('id', ver.owner_id);
                }
            } else if (target === 'addendum') {
                await adminClient.from('contract_addendums').update({
                    signature_token: zapDoc.token,
                    signature_status: 'SENT',
                    signature_url: signUrl,
                }).eq('id', addendumId);
            } else if (target === 'contract') {
                await adminClient.from('contracts').update({
                    signature_token: zapDoc.token,
                    signature_status: 'SENT',
                    signature_url: signUrl,
                }).eq('id', contractId);
            } else {
                await adminClient.from('commercial_deals').update({
                    signature_token: zapDoc.token,
                    signature_status: 'PENDING',
                    signature_url: signUrl,
                }).eq('id', dealId);
            }

            return json({ success: true, token: zapDoc.token, sign_url: signUrl, signers: zapDoc.signers });
        }

        // ── CONSULTAR STATUS ──────────────────────────────────────────────────
        if (action === 'status') {
            const { signatureToken } = body;
            if (!signatureToken) return json({ error: 'signatureToken obrigatório' }, 400);

            const zapResp = await fetch(`${ZAPSIGN_API}/docs/${signatureToken}/`, {
                headers: { 'Authorization': `Bearer ${zapToken}` },
            });

            if (!zapResp.ok) return json({ error: 'Documento não encontrado no ZapSign' }, 404);
            const zapDoc = await zapResp.json();
            return json({ status: zapDoc.status, signers: zapDoc.signers, signed_file: zapDoc.signed_file });
        }

        // ── WEBHOOK (chamado pelo ZapSign — sem auth de usuário, mas validado por token) ──
        if (action === 'webhook') {
            const { token, status, signed_file } = body;
            if (!token) return json({ error: 'token obrigatório' }, 400);

            const isSigned = status === 'finished';

            // O token do ZapSign é único e há índice único parcial em
            // signature_token nas quatro tabelas — o UPDATE é no-op onde não casa.

            // 1) Versão de documento (contrato ou aditivo)
            const { data: signedVersions } = await adminClient.from('contract_document_versions')
                .update({
                    signature_status: isSigned ? 'SIGNED' : 'SENT',
                    ...(isSigned ? { signature_completed_at: new Date().toISOString() } : {}),
                    ...(isSigned && signed_file ? { signed_file_url: signed_file } : {}),
                })
                .eq('signature_token', token)
                .select('id, contract_id, owner_type, owner_id, kind');

            const version = signedVersions?.[0];

            // 2) Aditivo — por token direto e pela versão que pertence a ele
            await adminClient.from('contract_addendums')
                .update({
                    signature_status: isSigned ? 'SIGNED' : 'SENT',
                    ...(isSigned ? { signature_completed_at: new Date().toISOString() } : {}),
                    ...(isSigned && signed_file ? { signed_document_url: signed_file } : {}),
                })
                .eq('signature_token', token);

            // 3) Contrato. ⚠️ A versão só propaga para o contrato quando é o
            // CONTRATO em si — minuta e aditivo assinados não podem sobrescrever
            // o status de assinatura nem o PDF do contrato principal.
            const versionIsContract = version && version.kind === 'CONTRATO' && version.owner_type === 'CONTRACT';
            if (versionIsContract) {
                await adminClient.from('contracts')
                    .update({
                        signature_status: isSigned ? 'SIGNED' : 'SENT',
                        ...(isSigned ? { signature_completed_at: new Date().toISOString() } : {}),
                        ...(isSigned && signed_file ? { signed_contract_url: signed_file } : {}),
                    })
                    .eq('id', version.owner_id);
            } else if (!version) {
                // Fluxo legado: token gravado direto em contracts.
                await adminClient.from('contracts')
                    .update({
                        signature_status: isSigned ? 'SIGNED' : 'SENT',
                        ...(isSigned ? { signature_completed_at: new Date().toISOString() } : {}),
                        ...(isSigned && signed_file ? { signed_contract_url: signed_file } : {}),
                    })
                    .eq('signature_token', token);
            }

            // 4) Atualizar commercial_deals (backward compat)
            await adminClient.from('commercial_deals')
                .update({ signature_status: isSigned ? 'SIGNED' : 'PENDING' })
                .eq('signature_token', token);

            return json({ received: true });
        }

        return json({ error: `Ação desconhecida: ${action}` }, 400);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        console.error('[sign-contract]', message);
        return json({ error: message }, 500);
    }
});
