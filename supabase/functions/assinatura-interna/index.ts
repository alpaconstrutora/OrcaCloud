// assinatura-interna — assinatura eletrônica SEM certificado, dentro do app.
// Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F2).
//
// Ações (corpo JSON, `acao`):
//   criar        membro da org DONA do documento (JWT). Congela o PDF, cria o
//                envelope (RPC assinatura_criar) e envia os convites.
//   ver          signatário pelo seu canal: metadados + URL assinada (5 min).
//   pedir_codigo signatário: gera 6 dígitos, guarda o hash, manda por e-mail.
//   assinar      signatário: código + CPF + aceite. O último finaliza o PDF.
//   finalizar    membro: refaz a finalização de envelope preso em FINALIZANDO.
//   cancelar     membro: cancela envelope em andamento.
//
// ⚠️ REGRA #7, pergunta 3 — `verify_jwt = false` (supabase/config.toml): o portal
// do cliente/corretor e a testemunha chamam SEM sessão. O portão é este código
// + o banco:
//   • canal MEMBRO, criar, finalizar, cancelar → exigirUsuario (JWT de usuário;
//     a chave anon sozinha → 401) e a RPC confere a organização pelo user_id;
//   • canais de portal/link → a credencial vai no corpo e QUEM DECIDE é
//     `_assinatura_autorizar` no banco (token do portal da MESMA pessoa e org;
//     hash do link). A organização NUNCA vem do corpo: sai da linha.
// As RPCs são executáveis só pela service_role (REVOKE de anon/authenticated).
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { caminhoNoBucket } from "../_shared/caminhoNoBucket.ts"
import { caminhoSemTravessia } from "../_shared/caminhoSemTravessia.ts"
import { garantirTokenDoPortal } from "../_shared/portalAcesso.ts"
import { enviarEmail, base64DeBytes } from "../_shared/resend.ts"
import { propagarVersao, propagarDocumentoDaNegociacao } from "../_shared/assinaturaPropagar.ts"
import {
    validarPedido, respostaDoErroDaRpc, recusaDoMembroDeOutraConta, codigoDeSeisDigitos, materialDoCodigo, sha256Hex,
    ipDoPedido, pareceUmPdf, pastaDaOrigem, caminhoDoAssinado, linkParaAssinar, urlDeValidacao,
    dataHoraBrasilia, TERMO_DE_ACEITE, TERMO_VERSAO, ROTULO_DO_PAPEL, MAX_BYTES_PDF,
    type Canal, type OrigemDoArquivo, type Pedido,
} from "./regras.ts"
import { carimbar, contarPaginas } from "./pdf.ts"
import { emailDeConvite, emailDoCodigo, emailDeConclusao } from "./emails.ts"

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

const BUCKET_ORIGEM = 'documents';
const BUCKET = 'assinaturas';
const TTL_URL_SEGUNDOS = 5 * 60;

const erroDaRpc = (e: { code?: string; message?: string } | null) => {
    const r = respostaDoErroDaRpc(e);
    if (r.status === 500) console.error('[assinatura-interna] rpc', e?.code, e?.message);
    return json({ error: r.erro }, r.status);
};

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Lê a linha de origem e devolve org/pasta — a organização sai daqui, nunca do corpo. */
async function lerOrigem(admin: Admin, tipo: 'CDV' | 'DEAL_DOC', id: string): Promise<
    | { ok: true; origem: OrigemDoArquivo; caminho: string | null; nome: string }
    | { ok: false; status: number; erro: string }
> {
    if (tipo === 'CDV') {
        const { data: v } = await admin.from('contract_document_versions')
            .select('id, organization_id, contract_id, owner_type, owner_id, kind, name, v, url, storage_path')
            .eq('id', id).maybeSingle();
        if (!v) return { ok: false, status: 404, erro: 'Documento não encontrado.' };
        const { data: c } = await admin.from('contracts').select('id, organization_id, title').eq('id', v.contract_id).maybeSingle();
        const org = v.organization_id ?? c?.organization_id;
        if (!org) return { ok: false, status: 404, erro: 'Documento não encontrado.' };
        return {
            ok: true,
            origem: { origem_tipo: 'CDV', organization_id: org, contract_id: v.contract_id, owner_type: v.owner_type, owner_id: v.owner_id },
            caminho: caminhoNoBucket(v.storage_path || v.url, BUCKET_ORIGEM),
            nome: [v.name || (v.kind === 'ADITIVO' ? 'Aditivo' : 'Contrato'), c?.title].filter(Boolean).join(' — '),
        };
    }
    const { data: d } = await admin.from('commercial_deal_documents')
        .select('id, organization_id, deal_id, kind, nome, storage_path')
        .eq('id', id).maybeSingle();
    if (!d) return { ok: false, status: 404, erro: 'Documento não encontrado.' };
    return {
        ok: true,
        origem: { origem_tipo: 'DEAL_DOC', organization_id: d.organization_id, deal_id: d.deal_id },
        caminho: caminhoNoBucket(d.storage_path, BUCKET_ORIGEM),
        nome: d.nome,
    };
}

async function acaoCriar(req: Request, admin: Admin, p: Extract<Pedido, { acao: 'criar' }>, frontend: string): Promise<Response> {
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    const lida = await lerOrigem(admin, p.origem_tipo, p.origem_id);
    if (!lida.ok) return json({ error: lida.erro }, lida.status);
    const { origem } = lida;

    const vinculo = await exigirMembro(req, origem.organization_id);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

    // O arquivo tem de estar na pasta da origem (não se assina arquivo alheio
    // apontado por uma linha adulterada) e sem travessia.
    const pasta = pastaDaOrigem(origem);
    const caminho = lida.caminho;
    if (!pasta || !caminho || !caminho.startsWith(pasta) || !caminhoSemTravessia(caminho)) {
        return json({ error: 'O arquivo deste documento não está na pasta esperada. Suba a versão de novo.' }, 400);
    }
    const { data: blob, error: erroDown } = await admin.storage.from(BUCKET_ORIGEM).download(caminho);
    if (erroDown || !blob) return json({ error: 'Não foi possível ler o PDF do documento.' }, 400);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_BYTES_PDF) return json({ error: 'PDF maior que 20 MB.' }, 400);
    if (!pareceUmPdf(bytes)) return json({ error: 'Só PDF pode ser enviado para assinatura.' }, 400);
    let paginas: number;
    try {
        paginas = await contarPaginas(bytes);
    } catch {
        return json({ error: 'O PDF está protegido por senha ou corrompido — gere o PDF de novo.' }, 400);
    }
    const sha = await sha256Hex(bytes);

    const envelopeId = crypto.randomUUID();
    const originalPath = `${origem.organization_id}/${envelopeId}/original.pdf`;
    const { error: erroUp } = await admin.storage.from(BUCKET).upload(originalPath, bytes, { contentType: 'application/pdf', upsert: false });
    if (erroUp) {
        console.error('[assinatura-interna] upload original', erroUp.message);
        return json({ error: 'Não foi possível guardar a cópia do documento.' }, 500);
    }

    const { data: criado, error: erroCriar } = await admin.rpc('assinatura_criar', {
        p_envelope_id: envelopeId, p_origem_tipo: p.origem_tipo, p_origem_id: p.origem_id,
        p_titulo: p.titulo || lida.nome || 'Documento', p_original_path: originalPath, p_original_sha256: sha,
        p_paginas: paginas, p_signatarios: p.signatarios, p_criado_por: usuario.userId,
        p_expira_dias: p.expira_dias ?? 30,
    });
    if (erroCriar) {
        await admin.storage.from(BUCKET).remove([originalPath]);
        return erroDaRpc(erroCriar);
    }

    const { data: org } = await admin.from('organizations').select('name').eq('id', origem.organization_id).maybeSingle();
    const emitente = org?.name || 'A empresa';
    const { data: env } = await admin.from('assinatura_envelopes').select('titulo, expira_em').eq('id', envelopeId).maybeSingle();

    const envios: { id: string; nome: string; papel: string; canal: string; email_enviado: boolean; erro?: string }[] = [];
    // deno-lint-ignore no-explicit-any
    for (const s of (criado?.signatarios ?? []) as any[]) {
        let credencial: string | null = null;
        try {
            if (s.canal === 'PORTAL_CLIENTE') credencial = await garantirTokenDoPortal(admin, 'client_portal_tokens', 'client_id', s.client_id, origem.organization_id);
            else if (s.canal === 'PORTAL_CORRETOR') credencial = await garantirTokenDoPortal(admin, 'broker_portal_tokens', 'broker_id', s.broker_id, origem.organization_id);
            else if (s.canal === 'LINK') credencial = s.link_token;
        } catch (e) {
            console.error('[assinatura-interna] token do portal', e instanceof Error ? e.message : e);
            envios.push({ id: s.id, nome: s.nome, papel: s.papel, canal: s.canal, email_enviado: false, erro: 'Não foi possível liberar o portal.' });
            continue;
        }
        const convite = emailDeConvite({
            nome: s.nome, titulo: env?.titulo ?? 'Documento', emitente,
            link: linkParaAssinar(frontend, s.canal as Canal, s.id, credencial),
            expiraEm: dataHoraBrasilia(env?.expira_em), papel: ROTULO_DO_PAPEL[s.papel] ?? s.papel,
        });
        const r = await enviarEmail({ para: s.email, assunto: convite.assunto, html: convite.html });
        envios.push({ id: s.id, nome: s.nome, papel: s.papel, canal: s.canal, email_enviado: r.ok, ...(r.ok ? {} : { erro: r.erro }) });
    }

    console.log('[assinatura-interna] criado', { envelopeId, por: usuario.email, signatarios: envios.length });
    return json({ ok: true, envelope_id: envelopeId, signatarios: envios });
}

/** Quem chama age como o signatário: credencial do canal (portal/link) ou o usuário do JWT. */
async function identidade(req: Request, canal: Canal): Promise<{ ok: true; user: string | null } | { ok: false; resposta: Response }> {
    if (canal !== 'MEMBRO') return { ok: true, user: null };
    const u = await exigirUsuario(req);
    if (!u.ok) return { ok: false, resposta: respostaDeErro(u, corsHeaders) };
    return { ok: true, user: u.userId };
}

/**
 * PDF final: carimba (se ainda FINALIZANDO), copia para a pasta da origem,
 * propaga e — só na 1ª conclusão — manda a via a todos. Idempotente.
 */
async function finalizar(admin: Admin, envelopeId: string, frontend: string): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
    const { data: e } = await admin.from('assinatura_envelopes').select('*').eq('id', envelopeId).maybeSingle();
    if (!e) return { ok: false, status: 404, erro: 'Envelope não encontrado.' };
    if (e.status !== 'FINALIZANDO' && e.status !== 'CONCLUIDO') return { ok: false, status: 400, erro: 'Este envelope não está pronto para finalizar.' };

    const { data: signatarios } = await admin.from('assinatura_signatarios').select('*').eq('envelope_id', e.id).order('ordem');
    const { data: org } = await admin.from('organizations').select('name').eq('id', e.organization_id).maybeSingle();
    const emitente = org?.name || 'A empresa';
    const validacao = urlDeValidacao(frontend, e.id);
    const finalPath = `${e.organization_id}/${e.id}/final.pdf`;

    let bytesFinal: Uint8Array;
    let primeiraConclusao = false;
    if (e.status === 'FINALIZANDO') {
        if (!caminhoSemTravessia(e.original_path)) return { ok: false, status: 500, erro: 'Caminho do original inválido.' };
        const { data: blob, error } = await admin.storage.from(BUCKET).download(e.original_path);
        if (error || !blob) return { ok: false, status: 500, erro: 'Cópia congelada não encontrada.' };
        const original = new Uint8Array(await blob.arrayBuffer());
        if (await sha256Hex(original) !== e.original_sha256) {
            console.error('[assinatura-interna] original divergente', e.id);
            return { ok: false, status: 500, erro: 'A cópia congelada não confere com o hash registrado.' };
        }
        const concluidoEm = new Date().toISOString();
        bytesFinal = await carimbar(
            original,
            { id: e.id, titulo: e.titulo, emitente, criado_em: e.criado_em, concluido_em: concluidoEm, paginas: e.paginas, original_sha256: e.original_sha256 },
            // deno-lint-ignore no-explicit-any
            (signatarios ?? []).map((s: any) => ({
                nome: s.nome, representa: s.representa, papel: s.papel, canal: s.canal, email: s.email, cpf: s.cpf,
                assinado_em: s.assinado_em, ip: s.ip, user_agent: s.user_agent, termo_versao: s.termo_versao,
            })),
            validacao,
        );
        const { error: erroUp } = await admin.storage.from(BUCKET).upload(finalPath, bytesFinal, { contentType: 'application/pdf', upsert: true });
        if (erroUp) return { ok: false, status: 500, erro: 'Não foi possível guardar o PDF assinado.' };
        const { data: concl, error: erroConcl } = await admin.rpc('assinatura_concluir', {
            p_envelope: e.id, p_final_path: finalPath, p_final_sha256: await sha256Hex(bytesFinal),
        });
        if (erroConcl) return { ok: false, ...respostaDoErroDaRpc(erroConcl) };
        primeiraConclusao = !concl?.ja_concluido;
        e.concluido_em = concluidoEm;
    } else {
        if (!caminhoSemTravessia(e.final_path)) return { ok: false, status: 500, erro: 'Caminho do PDF assinado inválido.' };
        const { data: blob, error } = await admin.storage.from(BUCKET).download(e.final_path);
        if (error || !blob) return { ok: false, status: 500, erro: 'PDF assinado não encontrado.' };
        bytesFinal = new Uint8Array(await blob.arrayBuffer());
    }

    // Cópia na pasta da origem: o app e o portal abrem o assinado pelos caminhos de sempre.
    let origem: OrigemDoArquivo;
    let versao: { id: string; owner_type: string; owner_id: string; kind: string } | null = null;
    if (e.origem_tipo === 'CDV') {
        const { data: v } = await admin.from('contract_document_versions').select('id, contract_id, owner_type, owner_id, kind').eq('id', e.origem_id).maybeSingle();
        if (!v) return { ok: false, status: 404, erro: 'Versão de origem não encontrada.' };
        versao = v;
        origem = { origem_tipo: 'CDV', organization_id: e.organization_id, contract_id: v.contract_id, owner_type: v.owner_type, owner_id: v.owner_id };
    } else {
        origem = { origem_tipo: 'DEAL_DOC', organization_id: e.organization_id, deal_id: e.deal_id };
    }
    const destino = caminhoDoAssinado(origem, e.id);
    if (!destino) return { ok: false, status: 500, erro: 'Pasta de origem indefinida.' };
    const { error: erroCopia } = await admin.storage.from(BUCKET_ORIGEM).upload(destino, bytesFinal, { contentType: 'application/pdf', upsert: true });
    if (erroCopia) return { ok: false, status: 500, erro: 'Não foi possível copiar o PDF assinado para o documento.' };

    try {
        if (versao) await propagarVersao(admin, versao, { assinado: true, arquivo: destino, quando: e.concluido_em }, { envelopeId: e.id });
        else await propagarDocumentoDaNegociacao(admin, e.origem_id, e.id, { arquivo: destino, quando: e.concluido_em });
    } catch (err) {
        console.error('[assinatura-interna] propagar', err instanceof Error ? err.message : err);
        return { ok: false, status: 500, erro: 'Assinado, mas o documento de origem não foi atualizado. Use "Finalizar" de novo.' };
    }

    if (primeiraConclusao) {
        const anexo = { nome: `${e.titulo.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() || 'documento'} - assinado.pdf`, conteudoBase64: base64DeBytes(bytesFinal) };
        // deno-lint-ignore no-explicit-any
        for (const s of (signatarios ?? []) as any[]) {
            const m = emailDeConclusao({ nome: s.nome, titulo: e.titulo, emitente, urlValidacao: validacao });
            const r = await enviarEmail({ para: s.email, assunto: m.assunto, html: m.html, anexos: [anexo] });
            if (!r.ok) console.error('[assinatura-interna] via final não enviada', e.id, s.id, r.erro);
        }
    }
    return { ok: true };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    let corpo: unknown;
    try {
        corpo = await req.json();
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }
    const validado = validarPedido(corpo);
    if (!validado.ok) return json({ error: validado.erro }, 400);
    const p = validado.pedido;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const frontend = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    if (!frontend) return json({ error: 'FRONTEND_URL não configurada.' }, 500);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = ipDoPedido(req.headers);
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 500) || null;

    try {
        if (p.acao === 'criar') return await acaoCriar(req, admin, p, frontend);

        if (p.acao === 'finalizar' || p.acao === 'cancelar') {
            const usuario = await exigirUsuario(req);
            if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);
            const { data: e } = await admin.from('assinatura_envelopes').select('id, organization_id').eq('id', p.envelope_id).maybeSingle();
            if (!e) return json({ error: 'Envelope não encontrado ou sem permissão.' }, 403);
            const vinculo = await exigirMembro(req, e.organization_id);
            if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
            if (p.acao === 'cancelar') {
                const { data, error } = await admin.rpc('assinatura_cancelar', { p_envelope: e.id, p_user: usuario.userId, p_motivo: p.motivo });
                return error ? erroDaRpc(error) : json(data);
            }
            const r = await finalizar(admin, e.id, frontend);
            return r.ok ? json({ ok: true }) : json({ error: r.erro }, r.status);
        }

        // ── Ações do signatário ──────────────────────────────────────────────
        const quem = await identidade(req, p.canal);
        if (!quem.ok) return quem.resposta;
        const base = { p_signatario: p.signatario_id, p_canal: p.canal, p_credencial: p.credencial, p_user: quem.user };
        // Sem permissão no canal MEMBRO: se é outra conta da mesma empresa, diz o que fazer.
        const recusar = async (error: { code?: string; message?: string } | null) => {
            if (p.canal === 'MEMBRO' && quem.user && error?.code === '42501') {
                const { data: s } = await admin.from('assinatura_signatarios')
                    .select('canal, user_id, email, organization_id').eq('id', p.signatario_id).maybeSingle();
                const { data: m } = s
                    ? await admin.from('organization_members').select('user_id')
                        .eq('user_id', quem.user).eq('organization_id', s.organization_id).limit(1).maybeSingle()
                    : { data: null };
                const msg = recusaDoMembroDeOutraConta(s, quem.user, !!m);
                if (msg) return json({ error: msg, outro_usuario: true }, 403);
            }
            return erroDaRpc(error);
        };

        if (p.acao === 'ver') {
            const { data, error } = await admin.rpc('assinatura_ver', { ...base, p_ip: ip, p_ua: ua });
            if (error) return await recusar(error);
            const caminho = data.status === 'CONCLUIDO' && data.final_path ? data.final_path : data.original_path;
            let url: string | null = null;
            if (caminhoSemTravessia(caminho)) {
                const { data: assinada } = await admin.storage.from(BUCKET).createSignedUrl(caminho, TTL_URL_SEGUNDOS);
                url = assinada?.signedUrl ?? null;
            }
            const { original_path: _o, final_path: _f, ...documento } = data;
            return json({ ok: true, documento, url, termo: TERMO_DE_ACEITE, termo_versao: TERMO_VERSAO });
        }

        if (p.acao === 'pedir_codigo') {
            const sorteio = new Uint32Array(1);
            crypto.getRandomValues(sorteio);
            const codigo = codigoDeSeisDigitos(sorteio[0]);
            const { data, error } = await admin.rpc('assinatura_registrar_codigo', {
                ...base, p_otp_hash: await sha256Hex(materialDoCodigo(p.signatario_id, codigo)), p_ip: ip, p_ua: ua,
            });
            if (error) return await recusar(error);
            if (!data?.ok) return json({ error: data?.erro ?? 'Não foi possível enviar o código.' }, 400);
            const { data: env } = await admin.from('assinatura_signatarios').select('organization_id').eq('id', p.signatario_id).maybeSingle();
            const { data: org } = await admin.from('organizations').select('name').eq('id', env?.organization_id).maybeSingle();
            const m = emailDoCodigo({ nome: data.nome, titulo: data.titulo, emitente: org?.name || 'A empresa', codigo });
            const r = await enviarEmail({ para: data.email, assunto: m.assunto, html: m.html });
            if (!r.ok) return json({ error: 'Não conseguimos enviar o código agora. Tente de novo em 1 minuto.' }, 502);
            return json({ ok: true, email_mascarado: data.email_mascarado });
        }

        if (p.acao !== 'assinar') return json({ error: 'Ação desconhecida.' }, 400);
        const { data, error } = await admin.rpc('assinatura_confirmar', {
            ...base, p_otp_hash: await sha256Hex(materialDoCodigo(p.signatario_id, p.codigo)),
            p_cpf: p.cpf, p_aceite: p.aceite, p_termo_versao: p.termo_versao, p_ip: ip, p_ua: ua,
            p_leitura: p.leitura,
        });
        if (error) return await recusar(error);
        if (!data?.ok) return json({ error: data?.erro ?? 'Não foi possível assinar.', pedir_codigo: !!data?.pedir_codigo }, 400);
        if (!data.finalizar) return json({ ok: true, concluido: false, faltam: data.faltam });
        const r = await finalizar(admin, data.envelope_id, frontend);
        if (!r.ok) console.error('[assinatura-interna] finalizar após a última assinatura', data.envelope_id, r.erro);
        // A assinatura vale de qualquer jeito; a finalização se refaz pelo botão do gestor.
        return json({ ok: true, concluido: r.ok, faltam: 0 });
    } catch (err) {
        console.error('[assinatura-interna]', err instanceof Error ? err.message : err);
        return json({ error: 'Erro interno.' }, 500);
    }
});
