// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validarPedido, montarPath } from "./regras.ts"

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

// Mídia do Diário de Obras para o celular aberto por link (`/celular?token=`),
// sem login: subir, ver (assinar) e remover fotos.
//
// ⚠️ A AUTORIZAÇÃO NÃO É REESCRITA AQUI (REGRA #7, pergunta 3). Quem decide o
// que o token pode é o banco: `celular_diario_autoriza` (projeto da org do link),
// `celular_diario_midia_permitida` (path citado em registro da org) e
// `celular_diario_midia_orfa` (path do projeto que nenhum registro cita mais).
// As RPCs são chamadas com a chave anon e SEM repassar o Authorization do
// pedido — um navegador logado como outra pessoa não pode mudar de quem é o
// link. A service_role entra só no fim, para assinar/remover no storage.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    let corpo: unknown;
    try {
        corpo = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const validado = validarPedido(corpo);
    if (!validado.ok) return json({ error: validado.erro }, 400);
    const pedido = validado.pedido;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Cliente anon puro: sem o Authorization do pedido.
    const comoAnon = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Erro de RPC → resposta. 42501 (token recusado / fora da org) é 403 com a
    // mensagem do banco; 22023 é pedido inválido; o resto é 500 sem detalhe.
    const erroDaRpc = (erro: { code?: string; message?: string }) => {
        if (erro.code === '42501') return json({ error: erro.message || 'Acesso negado' }, 403);
        if (erro.code === '22023') return json({ error: erro.message || 'Pedido inválido' }, 400);
        console.error('[celular-diario-midia] erro na RPC:', erro);
        return json({ error: 'Erro ao processar o pedido' }, 500);
    };

    try {
        if (pedido.acao === 'subir') {
            const { data: org, error } = await comoAnon.rpc('celular_diario_autoriza', {
                p_token: pedido.token,
                p_project_id: pedido.project_id,
            });
            if (error) return erroDaRpc(error);

            const path = montarPath(String(org), pedido.project_id, crypto.randomUUID(), pedido.ext);
            const { data, error: erroUpload } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
            if (erroUpload || !data?.token) {
                console.error('[celular-diario-midia] erro ao criar upload assinado:', erroUpload);
                return json({ error: 'Erro ao preparar o envio' }, 500);
            }
            return json({ path, token: data.token });
        }

        if (pedido.acao === 'assinar') {
            const { data: permitidos, error } = await comoAnon.rpc('celular_diario_midia_permitida', {
                p_token: pedido.token,
                p_paths: pedido.paths,
            });
            if (error) return erroDaRpc(error);

            const lista = (Array.isArray(permitidos) ? permitidos : []) as string[];
            const urls: Record<string, string> = {};
            if (lista.length === 0) return json({ urls });

            const { data: assinados, error: erroAssinatura } = await admin.storage
                .from(BUCKET)
                .createSignedUrls(lista, TTL_SEGUNDOS);
            if (erroAssinatura || !assinados) {
                console.error('[celular-diario-midia] erro ao assinar URLs:', erroAssinatura);
                return json({ error: 'Erro ao gerar link de acesso' }, 500);
            }
            for (const item of assinados as Array<{ path: string | null; signedUrl: string; error: string | null }>) {
                if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
            }
            return json({ urls });
        }

        // remover
        const { data: orfas, error } = await comoAnon.rpc('celular_diario_midia_orfa', {
            p_token: pedido.token,
            p_project_id: pedido.project_id,
            p_paths: pedido.paths,
        });
        if (error) return erroDaRpc(error);

        const aRemover = (Array.isArray(orfas) ? orfas : []) as string[];
        if (aRemover.length === 0) return json({ removidos: [] });

        const { data: removidos, error: erroRemocao } = await admin.storage.from(BUCKET).remove(aRemover);
        if (erroRemocao) {
            console.error('[celular-diario-midia] erro ao remover:', erroRemocao);
            return json({ error: 'Erro ao remover os arquivos' }, 500);
        }
        return json({ removidos: (removidos ?? []).map((o: { name: string }) => o.name) });
    } catch (e) {
        console.error('[celular-diario-midia] erro inesperado:', e);
        return json({ error: 'Erro ao processar o pedido' }, 500);
    }
});
