// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import { encode as base64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { exigirMembro, respostaDeErro } from "../_shared/auth.ts"
import { escapeHtml, escapeAttr, emailValido, truncar } from "../_shared/html.ts"

/**
 * doc-gen-enviar — envia o PDF OFICIAL de um ofício emitido por e-mail (Resend,
 * com o arquivo em `attachments`) e registra o envio na tramitação.
 *
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F5).
 *
 * Portão (REGRA #7): `exigirMembro` da organização DO DOCUMENTO — o JWT do
 * usuário, nunca a chave anon. O documento é lido com service_role só depois
 * de saber a organização; os anexos só entram se forem documentos do GED da
 * MESMA organização (um id de outra organização posto à mão em `anexos` não
 * vira um jeito de exfiltrar arquivo).
 *
 * O registro do envio é feito com o JWT do próprio usuário
 * (`doc_gen_registrar_envio` confere a organização de novo), então o histórico
 * diz quem enviou.
 */

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MAX_DESTINATARIOS = 10;
const MAX_BYTES = 25 * 1024 * 1024;

interface Pedido {
    documento_id?: string;
    para?: string[];
    cc?: string[];
    mensagem?: string;
    incluir_anexos?: boolean;
}

const nomeDeArquivo = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'documento';

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL') ?? '';
    const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/+$/, '');

    // Sem Authorization não se lê nem o corpo.
    if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);

    let pedido: Pedido;
    try { pedido = await req.json(); } catch { return json({ error: 'Corpo inválido.' }, 400); }
    const documentoId = String(pedido.documento_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(documentoId)) return json({ error: 'documento_id inválido.' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: doc } = await admin.from('doc_gen_documentos')
        .select('id, organization_id, company_id, numero, assunto, status, ged_document_id, ged_version_id, anexos, destinatario_snapshot')
        .eq('id', documentoId).maybeSingle();
    // Inexistente e de outra organização respondem igual (404): a resposta não
    // confirma que o id existe. Token inválido continua 401.
    if (!doc) return json({ error: 'Documento não encontrado.' }, 404);

    const vinculo = await exigirMembro(req, doc.organization_id);
    if (!vinculo.ok) {
        if (vinculo.status === 403) return json({ error: 'Documento não encontrado.' }, 404);
        return respostaDeErro(vinculo, corsHeaders);
    }

    if (doc.status === 'RASCUNHO' || doc.status === 'CANCELADO' || !doc.numero) {
        return json({ error: 'Só ofício emitido é enviado.' }, 422);
    }
    if (!doc.ged_version_id) return json({ error: 'O PDF oficial ainda não está no GED — gere o PDF antes de enviar.' }, 422);

    const para = (pedido.para ?? []).map(emailValido).filter((e): e is string => !!e);
    const cc = (pedido.cc ?? []).map(emailValido).filter((e): e is string => !!e);
    if (para.length === 0) return json({ error: 'Informe ao menos um e-mail válido em "Para".' }, 400);
    if (para.length + cc.length > MAX_DESTINATARIOS) return json({ error: `No máximo ${MAX_DESTINATARIOS} destinatários por envio.` }, 400);
    if (!resendApiKey || !fromEmail) return json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY / REPORT_FROM_EMAIL).' }, 503);

    // ── Arquivos: o PDF oficial e, se pedido, os anexos do GED da mesma organização ──
    const arquivos: { filename: string; content: string }[] = [];
    let total = 0;
    const anexar = async (versionId: string, nome: string) => {
        const { data: versao } = await admin.from('opura_document_versions').select('storage_path, document_id').eq('id', versionId).maybeSingle();
        if (!versao?.storage_path) throw new Error(`Arquivo não encontrado: ${nome}`);
        const { data: blob, error } = await admin.storage.from('opura-docs').download(versao.storage_path);
        if (error || !blob) throw new Error(`Falha ao ler o arquivo: ${nome}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        total += bytes.length;
        if (total > MAX_BYTES) throw new Error('Os arquivos passam de 25 MB — envie sem os anexos ou separe o envio.');
        const ext = String(versao.storage_path).split('.').pop() ?? 'pdf';
        arquivos.push({ filename: `${nomeDeArquivo(nome)}.${ext.toLowerCase()}`, content: base64(bytes) });
    };

    try {
        await anexar(doc.ged_version_id, `Oficio-${doc.numero}`);
        if (pedido.incluir_anexos) {
            const lista = Array.isArray(doc.anexos) ? doc.anexos as { tipo?: string; documentId?: string; nome?: string }[] : [];
            for (const a of lista) {
                if (a.tipo !== 'GED' || !a.documentId) continue;
                const { data: ged } = await admin.from('opura_documents').select('organization_id, active_version_id').eq('id', a.documentId).maybeSingle();
                if (!ged || ged.organization_id !== doc.organization_id || !ged.active_version_id) continue;
                await anexar(ged.active_version_id, a.nome || 'anexo');
            }
        }
    } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Falha ao preparar os arquivos.' }, 422);
    }

    // ── Remetente: a empresa emitente (ou a organização) ──
    let emitente = '';
    if (doc.company_id) {
        const { data: c } = await admin.from('companies').select('nome_fantasia, razao_social').eq('id', doc.company_id).maybeSingle();
        emitente = (c?.nome_fantasia || c?.razao_social || '').trim();
    }
    if (!emitente) {
        const { data: o } = await admin.from('organizations').select('name').eq('id', doc.organization_id).maybeSingle();
        emitente = (o?.name ?? '').trim();
    }

    const linkValidacao = frontendUrl ? `${frontendUrl}/publico/validar-documento/${doc.id}` : '';
    const mensagem = truncar(pedido.mensagem ?? '', 4000);
    // O nome do remetente vai no header — sem caracteres que quebrem o formato.
    const nomeRemetente = emitente.replace(/["<>\r\n]/g, '').slice(0, 80);

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px">
<p style="font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(mensagem).replace(/\n/g, '<br>')}</p>
<p style="font-size:13px;color:#374151;margin:0 0 8px">Segue anexo o <strong>Ofício nº ${escapeHtml(doc.numero)}</strong> — ${escapeHtml(doc.assunto)}.</p>
${linkValidacao ? `<p style="font-size:12px;color:#6b7280;margin:16px 0 0">A autenticidade do documento pode ser conferida em <a href="${escapeAttr(linkValidacao)}" style="color:#1d4ed8">${escapeHtml(linkValidacao)}</a> (também pelo QR Code impresso no ofício).</p>` : ''}
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0">${escapeHtml(emitente)} · enviado por ${escapeHtml(vinculo.email)}</p>
</div></body></html>`;

    const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: nomeRemetente ? `${nomeRemetente} <${fromEmail}>` : fromEmail,
            to: para,
            cc: cc.length ? cc : undefined,
            reply_to: vinculo.email,
            // Header de e-mail, não HTML — cru de propósito.
            subject: `Ofício nº ${doc.numero} — ${String(doc.assunto).replace(/[\r\n]+/g, ' ').slice(0, 180)}`,
            html,
            attachments: arquivos,
        }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        console.error('[doc-gen-enviar] Resend recusou:', resposta.status, corpo);
        return json({ error: `O provedor de e-mail recusou o envio (${resposta.status}).` }, 502);
    }

    // Registro com o JWT do usuário: o histórico diz quem enviou.
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const { data: situacao, error: errReg } = await userClient.rpc('doc_gen_registrar_envio', {
        p_documento_id: doc.id,
        p_dados: {
            canal: 'EMAIL',
            para: [...para, ...cc.map(e => `cc: ${e}`)].join(', '),
            anexos: arquivos.length - 1,
            mensagem_id: (corpo as { id?: string }).id ?? null,
        },
    });
    if (errReg) {
        // O e-mail saiu; só o registro falhou — a tela avisa para registrar à mão.
        console.error('[doc-gen-enviar] envio feito, registro falhou:', errReg);
        return json({ ok: true, enviado: true, registrado: false, id: (corpo as { id?: string }).id ?? null, erro_registro: errReg.message });
    }

    return json({ ok: true, enviado: true, registrado: true, situacao, id: (corpo as { id?: string }).id ?? null, arquivos: arquivos.length });
});
