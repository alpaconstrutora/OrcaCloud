// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirGestorDeQualquerOrg, respostaDeErro } from "../_shared/auth.ts"

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

/**
 * Importa uma competência SINAPI a partir de batches JSON enviados pelo browser.
 *
 * Cada chamada carrega até 200 itens pré-processados. Na última chamada
 * (is_last=true) a competência é registrada/atualizada em sinapi_references.
 *
 * Body: {
 *   items:          SinapiItem[],     // lote atual (max 200)
 *   reference_date: string,           // 'YYYY-MM-DD'
 *   label:          string,           // 'MM/AAAA'
 *   is_last:        boolean,          // true no último lote
 *   total_count:    number,           // total de itens da planilha (apenas no is_last)
 * }
 */
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Sessão e papel são validados por `exigirGestorDeQualquerOrg`, abaixo.

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Achado C2-01: aqui só se confirmava que existe um usuário — nunca
        // qual o papel dele — e logo abaixo gravava-se com service_role, que
        // ignora a RLS. E a RLS de `sinapi_items` foi escrita justamente para
        // impedir isso: leitura para todos, escrita só para service_role.
        //
        // O dado é GLOBAL (sem organization_id): é a tabela de preços que
        // alimenta os orçamentos de TODOS os tenants, e o upsert é por
        // (code, reference_date) — sobrescreve preço existente, não só acrescenta.
        // Por isso a exigência é ser gestor de alguma organização, e não
        // membro de uma específica: não existe organização dona deste dado.
        const vinculo = await exigirGestorDeQualquerOrg(req);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

        const adminClient = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { items, reference_date, label, is_last, total_count } = await req.json();

        if (!reference_date || !label) {
            return json({ error: 'reference_date e label são obrigatórios' }, 400);
        }

        // Upsert do lote
        if (Array.isArray(items) && items.length > 0) {
            const { error } = await adminClient
                .from('sinapi_items')
                .upsert(items, { onConflict: 'code,reference_date', ignoreDuplicates: false });
            if (error) throw error;
        }

        // Último lote: registra competência
        if (is_last) {
            const { count } = await adminClient
                .from('sinapi_items')
                .select('code', { count: 'exact', head: true })
                .eq('reference_date', reference_date);

            const { error: refError } = await adminClient
                .from('sinapi_references')
                .upsert({
                    reference_date,
                    label,
                    status: 'published',
                    item_count: count ?? total_count ?? 0,
                    imported_at: new Date().toISOString(),
                    notes: 'Importado via painel in-app.',
                }, { onConflict: 'reference_date' });
            if (refError) throw refError;
        }

        return json({ ok: true, count: items?.length ?? 0 });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[sinapi-import]', msg);
        return json({ error: msg }, 500);
    }
});
