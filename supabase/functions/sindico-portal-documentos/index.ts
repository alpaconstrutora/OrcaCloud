// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { BUCKET, caminhoDoDocumento, validarPedido } from "./regras.ts"

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

// Portal do Síndico › Assembleias — envio da ATA e da PROCURAÇÃO para os documentos do
// condomínio (decisão do usuário de 26/11; plano docs/planos/2026-11-25-condominio-
// assembleias-votacoes.md, Fase B, Task B1). O síndico não é membro da org: o upload
// direto ao bucket (RLS de storage por organização) e o INSERT em condominio_documentos
// (RLS por organização) do app não servem para ele.
//
// FormData: token?, clientId?, empreendimentoId, categoria (ATA | OUTRO), titulo,
//           visivelPortal ('true' | 'false'), file. Resposta: { documentoId }.
//
// Autorização (REGRA #7, pergunta 3 — no CÓDIGO, nunca só no gateway):
//  1. exigirUsuario: JWT de USUÁRIO de verdade (a chave anon sozinha → 401);
//  2. `sindico_portal_assembleia_autorizar_documento` chamada com a credencial de QUEM
//     CHAMOU: fn_sindico_resolver(..., 'sessao') — o síndico LOGADO, dono do cadastro —
//     e o condomínio entre os do mandato vigente dele (fn_sindico_predios). Devolve a org
//     do condomínio (fn_org_do_condominio). Só o link, sem a sessão dele → 403.
// Só DEPOIS disso a service_role grava: o arquivo em `{org}/{empreendimento}/{uuid}.{ext}`
// (o caminho de condominioComunicacaoService.uploadDocumento) e a linha em
// condominio_documentos. Se a linha falhar, o arquivo é apagado (sem órfão no bucket).
// O caminho nunca vai ao navegador (bucket privado não é dado de portal).
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    // 1. Usuário de verdade (sem header, ou só a chave anon → 401).
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    const ehMultipart = (req.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data');
    if (!ehMultipart) return json({ error: 'Envie o arquivo como multipart/form-data.' }, 400);

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return json({ error: 'Formulário inválido.' }, 400);
    }
    const file = form.get('file');
    const arquivo = file instanceof File ? file : null;
    const validacao = validarPedido({
        token: form.get('token'),
        clientId: form.get('clientId'),
        empreendimentoId: form.get('empreendimentoId'),
        categoria: form.get('categoria'),
        titulo: form.get('titulo'),
        visivelPortal: form.get('visivelPortal'),
    }, arquivo ? { name: arquivo.name, type: arquivo.type, size: arquivo.size } : null);
    if (!validacao.ok) return json({ error: validacao.erro }, validacao.status);
    const pedido = validacao.pedido;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // 2. O banco decide, com a credencial de quem chamou.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth, error: erroAuth } = await comoChamador.rpc('sindico_portal_assembleia_autorizar_documento', {
        p_token: pedido.token, p_client_id: pedido.clientId, p_empreendimento: pedido.empreendimentoId,
    });
    if (erroAuth) {
        console.error('[sindico-portal-documentos] autorizar_documento:', erroAuth);
        return json({ error: 'Não foi possível validar o acesso' }, 403);
    }
    if (!auth?.ok || typeof auth.org !== 'string') {
        return json({ error: auth?.motivo || 'Sem permissão' }, 403);
    }

    // 3. Só agora a service_role grava.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const caminho = caminhoDoDocumento(auth.org, pedido.empreendimentoId, crypto.randomUUID(), arquivo!.name);

    const { error: erroUpload } = await admin.storage.from(BUCKET)
        .upload(caminho, new Uint8Array(await arquivo!.arrayBuffer()), {
            contentType: pedido.tipo, cacheControl: '3600', upsert: false,
        });
    if (erroUpload) {
        console.error('[sindico-portal-documentos] upload:', erroUpload);
        return json({ error: 'Erro ao enviar o arquivo' }, 500);
    }

    const { data: linha, error: erroLinha } = await admin.from('condominio_documentos').insert({
        empreendimento_id: pedido.empreendimentoId,
        organization_id: auth.org,
        titulo: pedido.titulo,
        categoria: pedido.categoria,
        url: null,
        storage_path: caminho,
        file_name: arquivo!.name,
        mime_type: pedido.tipo,
        file_size: arquivo!.size,
        visivel_portal: pedido.visivelPortal,
    }).select('id').single();
    if (erroLinha || !linha?.id) {
        console.error('[sindico-portal-documentos] linha:', erroLinha);
        // Sem a linha, o arquivo seria órfão invisível no bucket.
        const { error: erroLimpeza } = await admin.storage.from(BUCKET).remove([caminho]);
        if (erroLimpeza) console.warn('[sindico-portal-documentos] arquivo órfão no bucket:', caminho, erroLimpeza.message);
        return json({ error: 'Erro ao cadastrar o documento' }, 500);
    }

    return json({ documentoId: linha.id });
});
