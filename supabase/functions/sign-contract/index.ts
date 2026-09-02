// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, respostaDeErro } from "../_shared/auth.ts"

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

/**
 * Processa a notificação de assinatura do ZapSign.
 *
 * Separada do dispatch porque a autorização dela é de OUTRA natureza: não há
 * usuário, e o gate é o service_role (ver o chamador). Enquanto viveu dentro do
 * bloco autenticado, qualquer usuário logado marcava contrato como SIGNED
 * informando o token — achado C3-03.
 */
async function processarWebhook(adminClient: any, body: any): Promise<Response> {
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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const zapToken    = Deno.env.get('ZAPSIGN_API_TOKEN') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!zapToken) return json({ error: 'Serviço de assinatura não configurado. Configure ZAPSIGN_API_TOKEN.' }, 503);

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

        // ── WEBHOOK: gate próprio, antes de qualquer exigência de usuário ────
        // O ZapSign não tem sessão do app. Hoje esta function é publicada com
        // `verify_jwt: true`, então o ZapSign NÃO consegue alcançá-la de fato —
        // esta ação está morta na prática. Fica aceitando apenas o service_role
        // (mesmo padrão das funções de cron) até ganhar function própria com
        // `verify_jwt: false` e segredo compartilhado com o ZapSign.
        //
        // Antes, `webhook` vivia dentro do bloco autenticado: QUALQUER usuário
        // logado marcava um contrato como SIGNED informando o token.
        if (action === 'webhook') {
            const authHeader = req.headers.get('Authorization') ?? '';
            if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
                return json({ error: 'Unauthorized' }, 401);
            }
            return await processarWebhook(adminClient, body);
        }

        if (!action || (!dealId && !contractId && !addendumId && !documentVersionId) || !organizationId) {
            return json({ error: 'action, (dealId, contractId, addendumId ou documentVersionId) e organizationId são obrigatórios' }, 400);
        }

        // ── Achado C2-03/C3-03 ───────────────────────────────────────────────
        // O `organizationId` era exigido na validação acima e depois NUNCA usado
        // para validar coisa alguma. E os ids do alvo iam direto para `.eq('id',
        // ...)` num cliente service_role, que ignora a RLS. Resultado: usuário
        // autenticado de qualquer tenant sobrescrevia signature_token,
        // signature_status e signature_url de contratos alheios.
        //
        // São DUAS checagens, e nenhuma substitui a outra:
        //   1. o chamador pertence à organização que ele diz;
        //   2. o objeto alvo pertence a essa mesma organização.
        const vinculo = await exigirMembro(req, organizationId);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

        const TABELA_DO_ALVO: Record<string, string> = {
            document_version: 'contract_document_versions',
            addendum:         'contract_addendums',
            contract:         'contracts',
            deal:             'commercial_deals',
        };
        const idDoAlvo = documentVersionId ?? addendumId ?? contractId ?? dealId;
        const tabelaAlvo = TABELA_DO_ALVO[target];

        const { data: linhaAlvo } = await adminClient
            .from(tabelaAlvo)
            .select('id, organization_id')
            .eq('id', idDoAlvo)
            .maybeSingle();

        if (!linhaAlvo) {
            return json({ error: 'Documento não encontrado.' }, 404);
        }
        if (linhaAlvo.organization_id !== organizationId) {
            // 403 e não 404: não confirmamos nem negamos a existência do id.
            return json({ error: 'Documento não pertence a esta organização.' }, 403);
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

            // Achado C3-03 (leitura): o signatureToken vinha do corpo e ia direto
            // para a API do ZapSign com o token da CONTA CORPORATIVA. A resposta
            // traz `signers` e a URL do arquivo assinado — ou seja, dava para ler
            // contrato assinado de qualquer cliente daquela conta ZapSign,
            // bastando o token do documento.
            //
            // Agora o token tem de corresponder a uma linha LOCAL da organização
            // do chamador. Sem isso, não se consulta o ZapSign.
            const tabelasComToken = [
                'contract_document_versions', 'contract_addendums', 'contracts', 'commercial_deals',
            ];
            let tokenEhDaOrg = false;
            for (const tabela of tabelasComToken) {
                const { data: achado } = await adminClient
                    .from(tabela)
                    .select('id')
                    .eq('signature_token', signatureToken)
                    .eq('organization_id', organizationId)
                    .maybeSingle();
                if (achado) { tokenEhDaOrg = true; break; }
            }
            if (!tokenEhDaOrg) {
                return json({ error: 'Documento de assinatura não pertence a esta organização.' }, 403);
            }

            const zapResp = await fetch(`${ZAPSIGN_API}/docs/${signatureToken}/`, {
                headers: { 'Authorization': `Bearer ${zapToken}` },
            });

            if (!zapResp.ok) return json({ error: 'Documento não encontrado no ZapSign' }, 404);
            const zapDoc = await zapResp.json();
            return json({ status: zapDoc.status, signers: zapDoc.signers, signed_file: zapDoc.signed_file });
        }


        return json({ error: `Ação desconhecida: ${action}` }, 400);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        console.error('[sign-contract]', message);
        return json({ error: message }, 500);
    }
});
