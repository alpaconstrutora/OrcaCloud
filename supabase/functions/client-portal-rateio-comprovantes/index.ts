// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolverOrigens } from "../_shared/origemDoLancamento.ts"

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

// Os COMPROVANTES de um rateio (boleto, XML de NF-e, minuta), assinados para o
// Portal do CLIENTE anexar ao PDF do rateio — o mesmo anexo que o síndico põe
// no relatório dele.
//
// Existe porque o condômino não alcança os arquivos sozinho: o bucket `boletos`
// só abre para membro da organização (policy `boletos_select_org`), e ele entra
// por link público ou como cliente logado — nenhum dos dois é membro.
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI — o mesmo desenho da irmã
// `client-portal-condominio-download`. Quem decide quais rateios este cliente
// vê é `fn_condominio_payload_for_client`; esta function chama a MESMA RPC que
// o portal chama, com a credencial do chamador, e só aceita o rateio (e só as
// despesas dele) que estiverem na resposta:
//
//   • com `token`  → `client_portal_get_condominio` (concedida a anon);
//   • sem `token`  → `client_portal_get_condominio_for_client`, com o
//                    Authorization DO CHAMADOR repassado.
//
// A service_role entra DEPOIS, para ler a origem e assinar. E a origem é
// resolvida pelo MESMO código da aba Despesas do síndico
// (`_shared/origemDoLancamento.ts`): o PDF do condômino anexa o mesmo arquivo
// que o síndico abre na tela, não um parecido.
//
// Devolve URL assinada, nunca o path: path de bucket privado não é dado de
// portal. 15 minutos bastam — o navegador baixa na sequência.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const { token, clientId, rateioId } = await req.json() as {
        token?: string; clientId?: string; rateioId?: string;
    };
    if (!rateioId || (!token && !clientId)) {
        return json({ error: 'rateioId e (token ou clientId) são obrigatórios' }, 400);
    }

    // Cliente com a credencial de QUEM CHAMOU — nunca a service_role.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: payload, error: erroPayload } = token
        ? await comoChamador.rpc('client_portal_get_condominio', { p_token: token })
        : await comoChamador.rpc('client_portal_get_condominio_for_client', { p_client_id: clientId });

    if (erroPayload) {
        console.error('[client-portal-rateio-comprovantes] erro na RPC:', erroPayload);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!payload?.ok) {
        return json({ error: payload?.motivo || 'Link inválido ou expirado' }, 403);
    }

    // O rateio tem de estar na lista que a RPC devolveu para ESTE cliente —
    // é o que impede pedir os boletos de outro condomínio trocando o id.
    const rateio = (payload.rateios ?? []).find((r: { id: string }) => r.id === rateioId);
    if (!rateio) {
        return json({ error: 'Rateio não disponível para este acesso' }, 403);
    }
    const despesaIds: string[] = (rateio.despesas ?? []).map((d: { id: string }) => d.id);
    if (despesaIds.length === 0) return json({ comprovantes: [] });

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Filtrar pelo rateio E pelos ids do payload: as duas coisas, para uma
    // despesa só entrar se a RPC a mostrou e se ela é mesmo deste rateio.
    const { data: despesas, error: erroDespesas } = await admin
        .from('condominio_rateio_despesas')
        .select('id, transaction_id')
        .eq('rateio_id', rateioId)
        .in('id', despesaIds);
    if (erroDespesas) {
        console.error('[client-portal-rateio-comprovantes] erro nas despesas:', erroDespesas);
        return json({ error: 'Erro ao carregar as despesas' }, 500);
    }

    const txIds = [...new Set((despesas ?? []).map((d: { transaction_id: string | null }) => d.transaction_id).filter(Boolean))];
    if (txIds.length === 0) return json({ comprovantes: [] });

    const { data: lancamentos, error: erroLancamentos } = await admin
        .from('internal_transactions')
        .select('id, source_system, reference_id')
        .in('id', txIds);
    if (erroLancamentos) {
        console.error('[client-portal-rateio-comprovantes] erro nos lançamentos:', erroLancamentos);
        return json({ error: 'Erro ao carregar os lançamentos' }, 500);
    }

    const origens = await resolverOrigens(admin, lancamentos ?? []);

    const comprovantes: { despesaId: string; url: string; nome: string }[] = [];
    for (const d of despesas ?? []) {
        const documento = d.transaction_id ? origens.get(d.transaction_id)?.documento : null;
        if (!documento) continue;
        const { data: assinado, error: erroAssinatura } = await admin.storage
            .from(documento.bucket)
            .createSignedUrl(documento.path, 60 * 15);
        // Um arquivo que não assina não derruba os outros: a despesa volta
        // sem URL e o PDF a lista em "Comprovantes que não entraram".
        if (erroAssinatura || !assinado) {
            console.error('[client-portal-rateio-comprovantes] erro ao assinar:', erroAssinatura);
            comprovantes.push({ despesaId: d.id, url: '', nome: documento.nome });
            continue;
        }
        comprovantes.push({ despesaId: d.id, url: assinado.signedUrl, nome: documento.nome });
    }

    return json({ comprovantes });
});
