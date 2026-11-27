// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { BUCKET, caminhoDoDocumento, descricaoDoEnvio, recusaPeloTamanhoDoCorpo, validarPedido, validarRemocao } from "./regras.ts"

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
//           visivelPortal ('true' | 'false'; a procuração OUTRO é sempre false), file.
//           Resposta: { documentoId }. Corpo acima de 51 MB → 413 antes de ler.
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
//
// G5 (26/11/2026, aba Documentos do portal): `finalidade=documento` no FormData → as 7
// categorias do condomínio e a autorização `sindico_portal_documento_autorizar` (o síndico
// logado OU a administradora pelo app — modo 'operar'). E `{ acao: 'remover' }` em JSON
// (`removerDocumento`, no fim): o banco apaga a linha e devolve o caminho; o arquivo sai
// depois, pela service_role — o Storage não deixa apagar objeto por SQL.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    // 1. Usuário de verdade (sem header, ou só a chave anon → 401).
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    if ((req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
        return await removerDocumento(req);
    }

    const ehMultipart = (req.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data');
    if (!ehMultipart) return json({ error: 'Envie o arquivo como multipart/form-data.' }, 400);

    // Corpo acima de 50 MB + 1 MB: recusa ANTES de ler (formData() carregaria tudo na memória).
    const grande = recusaPeloTamanhoDoCorpo(req.headers.get('content-length'));
    if (grande) return json({ error: grande.erro }, grande.status);

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
        finalidade: form.get('finalidade'),
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
    const { data: auth, error: erroAuth } = pedido.finalidade === 'documento'
        ? await comoChamador.rpc('sindico_portal_documento_autorizar', {
            p_token: pedido.token, p_client_id: pedido.clientId, p_empreendimento: pedido.empreendimentoId,
            p_titulo: pedido.titulo, p_categoria: pedido.categoria,
        })
        : await comoChamador.rpc('sindico_portal_assembleia_autorizar_documento', {
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
    // Autor do envio (descrição do documento): o nome do cadastro do síndico que o banco
    // resolveu. Best-effort — sem o nome, a frase sai sem ele.
    const { data: cadastro } = typeof auth.clientId === 'string'
        ? await admin.from('clients').select('name').eq('id', auth.clientId).maybeSingle()
        : { data: null };
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
        // Pela aba Documentos o banco devolve o AUTOR (`nome`: o síndico, ou "Fulano
        // (administradora)") e `como`; pela assembleia, o nome do cadastro do síndico.
        descricao: pedido.finalidade === 'documento'
            ? descricaoDoEnvio(typeof auth.nome === 'string' ? auth.nome : null, new Date(), { administradora: auth.como === 'administradora' })
            : descricaoDoEnvio(cadastro?.name ?? null, new Date()),
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

// ── Remover (G5) ─────────────────────────────────────────────────────────────
// O banco decide e apaga a linha com a credencial de QUEM CHAMOU
// (`sindico_portal_documento_remover`: síndico logado OU a administradora; documento do
// condomínio; nunca a ata vinculada a uma assembleia nem uma procuração). Só depois a
// service_role tira o arquivo. Falha ao tirar o arquivo não desfaz a remoção (a linha já
// foi): fica registrada no log, como no `removeDocumento` do app.
async function removerDocumento(req: Request): Promise<Response> {
    let corpo: unknown;
    try {
        corpo = await req.json();
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }
    const validacao = validarRemocao(corpo);
    if (!validacao.ok) return json({ error: validacao.erro }, validacao.status);
    const pedido = validacao.pedido;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: r, error } = await comoChamador.rpc('sindico_portal_documento_remover', {
        p_token: pedido.token, p_client_id: pedido.clientId, p_empreendimento: pedido.empreendimentoId,
        p_documento: pedido.documentoId,
    });
    if (error) {
        console.error('[sindico-portal-documentos] documento_remover:', error);
        return json({ error: 'Não foi possível validar o acesso' }, 403);
    }
    if (!r?.ok) return json({ error: r?.motivo || 'Sem permissão' }, 403);

    if (typeof r.storagePath === 'string' && r.storagePath) {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: erroArquivo } = await admin.storage.from(BUCKET).remove([r.storagePath]);
        if (erroArquivo) console.warn('[sindico-portal-documentos] arquivo órfão no bucket:', r.storagePath, erroArquivo.message);
    }
    return json({ ok: true });
}
