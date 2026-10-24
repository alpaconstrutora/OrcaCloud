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

/** Teto e tipos do bucket `financeiro-anexos` (os mesmos do pagamento avulso). */
const BUCKET = 'financeiro-anexos';
const MAX_BYTES = 20 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mesmo saneamento de `nomeSeguroDeArquivo` (utils/pagamentoAvulso.ts). */
function nomeSeguro(nome: string): string {
    const limpo = nome
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return limpo.slice(-120) || 'documento';
}

// Portal do Síndico › Financeiro — os ARQUIVOS dos títulos do condomínio.
// Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
//
// Quatro ações, todas autorizadas por RPC com a credencial de QUEM CHAMOU
// (REGRA #7, pergunta 3 — a service_role só grava/assina DEPOIS):
//  • upload (multipart)      → `sindico_portal_autorizar_upload` (exige LOGIN do
//                              síndico); grava em `{org}/sindico/{grupo}/…`, a pasta
//                              que as RPCs de escrita aceitam;
//  • descartar               → idem; apaga um anexo dessa pasta quando o
//                              lançamento que o usaria foi recusado;
//  • documentos { ids }      → `sindico_portal_titulos_autorizados` (link, login ou
//                              prévia do admin); devolve código + nome do arquivo;
//  • abrir { tituloId }      → idem; assina 15 min.
// O documento sai do MESMO resolvedor da aba Despesas do admin e do PDF do
// rateio (`_shared/origemDoLancamento.ts`) — uma regra, três leitores. O
// caminho do arquivo nunca vai ao navegador (bucket privado não é dado de portal).
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const ehMultipart = (req.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data');

    // ── Upload ────────────────────────────────────────────────────────────
    if (ehMultipart) {
        const form = await req.formData();
        const token = (form.get('token') as string | null) || null;
        const clientId = (form.get('clientId') as string | null) || null;
        const empreendimentoId = form.get('empreendimentoId') as string | null;
        const file = form.get('file') as File | null;
        if (!file || !empreendimentoId || !UUID.test(empreendimentoId)) {
            return json({ error: 'file e empreendimentoId são obrigatórios' }, 400);
        }
        const { data: auth, error } = await comoChamador.rpc('sindico_portal_autorizar_upload', {
            p_token: token, p_client_id: token ? null : clientId, p_empreendimento_id: empreendimentoId,
        });
        if (error) {
            console.error('[sindico-portal-financeiro] autorizar_upload:', error);
            return json({ error: 'Não foi possível validar o acesso' }, 403);
        }
        if (!auth?.ok) return json({ error: auth?.motivo || 'Sem permissão' }, 403);

        const tipo = (file.type || '').toLowerCase();
        if (!TIPOS.includes(tipo)) return json({ error: 'O anexo precisa ser PDF ou imagem (PNG, JPG, WEBP).' }, 415);
        if (file.size > MAX_BYTES) return json({ error: 'O anexo passa de 20 MB.' }, 413);

        const path = `${auth.org}/sindico/${crypto.randomUUID()}/${Date.now()}-${nomeSeguro(file.name)}`;
        const { error: erroUpload } = await admin.storage.from(BUCKET)
            .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: tipo, upsert: false });
        if (erroUpload) {
            console.error('[sindico-portal-financeiro] upload:', erroUpload);
            return json({ error: 'Erro ao enviar o anexo' }, 500);
        }
        return json({ path, nome: file.name });
    }

    const corpo = await req.json().catch(() => ({})) as {
        acao?: string; token?: string; clientId?: string; ids?: string[]; tituloId?: string;
        empreendimentoId?: string; path?: string;
    };
    const p_token = corpo.token || null;
    const p_client_id = p_token ? null : (corpo.clientId || null);

    // ── Descartar anexo de lançamento recusado ───────────────────────────
    if (corpo.acao === 'descartar') {
        if (!corpo.empreendimentoId || !UUID.test(corpo.empreendimentoId) || !corpo.path) {
            return json({ error: 'empreendimentoId e path são obrigatórios' }, 400);
        }
        const { data: auth } = await comoChamador.rpc('sindico_portal_autorizar_upload', {
            p_token, p_client_id, p_empreendimento_id: corpo.empreendimentoId,
        });
        if (!auth?.ok) return json({ error: auth?.motivo || 'Sem permissão' }, 403);
        // Só a pasta do síndico nesta org — e só arquivo que NENHUM título usa.
        if (!corpo.path.startsWith(`${auth.org}/sindico/`) || corpo.path.includes('..')) {
            return json({ error: 'Caminho fora da pasta do síndico' }, 403);
        }
        const { count } = await admin.from('internal_transactions')
            .select('id', { count: 'exact', head: true }).eq('documento_path', corpo.path);
        if ((count ?? 0) > 0) return json({ ok: true, mantido: true });
        await admin.storage.from(BUCKET).remove([corpo.path]);
        return json({ ok: true });
    }

    // ── Documentos / abrir ───────────────────────────────────────────────
    const ids = corpo.acao === 'abrir' ? [corpo.tituloId ?? ''] : (corpo.ids ?? []);
    if (!['documentos', 'abrir'].includes(corpo.acao ?? '') || ids.length === 0 || !ids.every(i => UUID.test(i))) {
        return json({ error: 'acao inválida ou ids ausentes' }, 400);
    }
    if (!p_token && !p_client_id) return json({ error: 'token ou clientId é obrigatório' }, 400);

    const { data: auth, error } = await comoChamador.rpc('sindico_portal_titulos_autorizados', {
        p_token, p_client_id, p_ids: ids,
    });
    if (error) {
        console.error('[sindico-portal-financeiro] titulos_autorizados:', error);
        return json({ error: 'Erro ao validar o acesso' }, 500);
    }
    if (!auth?.ok) return json({ error: auth?.motivo || 'Link inválido ou expirado' }, 403);
    const autorizados: string[] = auth.ids ?? [];
    if (autorizados.length === 0) return json({ error: 'Título não disponível para este acesso' }, 403);

    const { data: linhas, error: erroLinhas } = await admin.from('internal_transactions')
        .select('id, source_system, reference_id').in('id', autorizados);
    if (erroLinhas) return json({ error: 'Erro ao ler os títulos' }, 500);
    const origens = await resolverOrigens(admin, linhas ?? []);

    if (corpo.acao === 'documentos') {
        const documentos: Record<string, { codigo: string | null; nome: string | null }> = {};
        for (const id of autorizados) {
            const o = origens.get(id);
            documentos[id] = { codigo: o?.codigo ?? null, nome: o?.documento?.nome ?? null };
        }
        return json({ documentos });
    }

    const doc = origens.get(autorizados[0])?.documento;
    if (!doc) return json({ error: 'Este título não tem documento anexado' }, 404);
    const { data: assinado, error: erroAss } = await admin.storage.from(doc.bucket).createSignedUrl(doc.path, 60 * 15);
    if (erroAss || !assinado) {
        console.error('[sindico-portal-financeiro] assinar:', erroAss);
        return json({ error: 'Erro ao gerar o link do documento' }, 500);
    }
    return json({ url: assinado.signedUrl, nome: doc.nome });
});
