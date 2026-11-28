// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirUsuario } from "../_shared/auth.ts"
import {
    BUCKET_COMPROVANTE, BUCKET_DOCUMENTO, MENSAGEM_LINK_RECUSADO,
    validarPedido, acaoDaCota, respostaDoErro, pathDoDocumento, type PedidoDaEdge,
} from "./regras.ts"
import {
    saldoPorItem, montarLinhas, statusDoRecebimento, statusDoPedidoApos, divergenciasDe, relatorioLegado,
    caminhoDoComprovante, ErroDeRecebimento, type ItemDoPedido, type RecebimentoAnterior,
} from "../../../lib/recebimento.ts"
import { criarFinanceiroDoPedido } from "../../../services/pedidoFinanceiroMotor.ts"
import { criarEfeitosDoStatus, depsComBanco, type ResultadoDosEfeitos } from "../../../services/pedidoStatusEfeitos.ts"
import { criarMotor } from "../../../services/processMotor.ts"
import { APP_SETTINGS_DEFAULTS } from "../../../services/appSettingsService.ts"
import { sanitizeFileName } from "../../../utils/storageUtils.ts"

/**
 * pedido-recebimento — Recebimento de pedido de compra, uma regra para dois chamadores
 * (docs/planos/2026-11-27-recebimento-mobile.md, Fase 3):
 *   · app logado (celular e computador): JWT de usuário (`exigirUsuario`);
 *   · link do celular `/celular` (aba "Receber"): `token` no corpo →
 *     `_celular_recebimento_autoriza(token, ação)` (resolve o dono, cota por hora,
 *     acesso a Compras em alguma org). O Authorization do pedido é IGNORADO nesse
 *     modo: um navegador logado como outra pessoa não muda de quem é o link.
 *
 * Ações:
 *   receber            {orderId, receiptId, versao, itens[], notas?, foto?}
 *   retirada           {orderId, versao, data, employeeId}               (FOB)
 *   comprovante_subir  {orderId, receiptId} → upload assinado no bucket `receipts`
 *   documento_subir    {orderId, nome, tamanho} → upload assinado (NF/recibo)
 *   documento_registrar{orderId, path, nome, tamanho, tipo?, categoria, descricao?}
 *   assinar            {orderId, paths[]} → URLs só dos arquivos DO pedido
 *
 * ⚠️ AUTORIZAÇÃO NO CÓDIGO E NO BANCO (REGRA #7, pergunta 3) — deploy com
 * --no-verify-jwt: sem Authorization → 401 antes de ler o corpo; em TODO pedido,
 * `_recebimento_autoriza_de(user, pedido)` (membro da org do pedido com Compras,
 * não o próprio fornecedor); a gravação é dos núcleos SQL atômicos
 * (`_recebimento_registrar_core`, `_pedido_retirada_core`). A regra (saldo,
 * parcial, divergências) vem de lib/recebimento.ts, a mesma da tela; os efeitos
 * (aviso ao fornecedor, parcelas, processos) dos motores que o navegador também usa.
 */

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Erro já traduzido para resposta HTTP. */
class Recusa extends Error {
    constructor(public status: number, public corpo: { error: string }) { super(corpo.error); }
}

async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) {
        const r = respostaDoErro(error);
        if (r.logar) console.error(`[pedido-recebimento] ${fn}:`, error);
        throw new Recusa(r.status, r.corpo);
    }
    return data as T;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    // Sem Authorization nenhum: 401 antes de ler o corpo (prova pós-deploy).
    if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);

    let corpo: unknown;
    try { corpo = await req.json(); } catch { return json({ error: 'Corpo inválido.' }, 400); }
    const validado = validarPedido(corpo);
    if (!validado.ok) return json({ error: validado.erro }, 400);
    const pedido = validado.pedido;

    const admin: Admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    try {
        // Quem confere: o dono do LINK (token no corpo) ou o usuário do JWT.
        let userId: string;
        let email: string;
        if (pedido.token) {
            const linhas = await rpc<{ user_id: string; email: string | null }[]>(admin, '_celular_recebimento_autoriza',
                { p_token: pedido.token, p_acao: acaoDaCota(pedido.acao) });
            const linha = (linhas ?? [])[0];
            if (!linha?.user_id) return json({ error: MENSAGEM_LINK_RECUSADO }, 403);
            userId = linha.user_id;
            email = (linha.email ?? '').toLowerCase();
        } else {
            const usuario = await exigirUsuario(req);
            if (!usuario.ok) return json({ error: usuario.erro }, usuario.status);
            userId = usuario.userId;
            email = usuario.email;
        }

        // Todo pedido: o ator pode conferir ESTE pedido (org dele, Compras, não é o fornecedor).
        await rpc(admin, '_recebimento_autoriza_de', { p_user: userId, p_order: pedido.orderId });

        switch (pedido.acao) {
            case 'receber': return await acaoReceber(admin, userId, pedido);
            case 'retirada': return await acaoRetirada(admin, userId, pedido);
            case 'comprovante_subir': return await subirAssinado(admin, BUCKET_COMPROVANTE, caminhoDoComprovante(pedido.orderId, pedido.receiptId), true);
            case 'documento_subir':
                return await subirAssinado(admin, BUCKET_DOCUMENTO,
                    pathDoDocumento(pedido.orderId, crypto.randomUUID(), sanitizeFileName(pedido.nome)), false);
            case 'documento_registrar': return await acaoDocumentoRegistrar(admin, userId, email, pedido);
            case 'assinar': return await acaoAssinar(admin, pedido);
        }
    } catch (e) {
        if (e instanceof Recusa) return json(e.corpo, e.status);
        if (e instanceof ErroDeRecebimento) return json({ error: e.message }, 400);
        console.error('[pedido-recebimento] falha:', e);
        return json({ error: 'Falha ao registrar o recebimento. Tente de novo.' }, 500);
    }
});

// ── efeitos (aviso, parcelas, processos) — os mesmos do navegador ────────────
function efeitos(admin: Admin) {
    return criarEfeitosDoStatus(depsComBanco(admin, {
        financeiro: criarFinanceiroDoPedido(admin),
        processos: criarMotor(admin),
        textos: {
            assunto: p => APP_SETTINGS_DEFAULTS.emailStatusChangeSubject.replace(/{pedido}/g, p.orderNumber).replace(/{status}/g, p.newStatus),
            corpo: p => APP_SETTINGS_DEFAULTS.emailStatusChangeBody.replace(/{pedido}/g, p.orderNumber).replace(/{status}/g, p.newStatus),
        },
    }));
}

async function pedidoDosEfeitos(admin: Admin, orderId: string) {
    const { data, error } = await admin.from('purchase_orders')
        .select('id, number, supplier_id, organization_id, empresa_id, project_id')
        .eq('id', orderId).single();
    if (error) throw error;
    return data;
}

async function aplicarEfeitos(admin: Admin, orderId: string, status: string, jaExistia: boolean): Promise<ResultadoDosEfeitos> {
    try {
        const p = await pedidoDosEfeitos(admin, orderId);
        return await efeitos(admin).aplicar(p, status, jaExistia ? { avisarFornecedor: false, abrirProcessos: false } : {});
    } catch (e) {
        // A conferência JÁ está gravada: efeito que falha não desfaz nem derruba a resposta.
        console.error('[pedido-recebimento] efeitos:', e);
        return { financeiro: { falhou: e instanceof Error ? e.message : String(e) } };
    }
}

// ── receber ──────────────────────────────────────────────────────────────────
async function acaoReceber(admin: Admin, userId: string, p: Extract<PedidoDaEdge, { acao: 'receber' }>) {
    const { data: po, error } = await admin.from('purchase_orders').select('id, items').eq('id', p.orderId).single();
    if (error || !po) return json({ error: 'pedido não encontrado ou sem permissão' }, 403);

    // Saldo pelas conferências anteriores (só as Parciais contam — lib/recebimento.ts).
    const { data: recs, error: recErr } = await admin.from('purchase_receipts')
        .select('id, status, purchase_receipt_items(order_item_index, order_item_code, quantity_received)')
        .eq('order_id', p.orderId);
    if (recErr) throw recErr;
    const anteriores: RecebimentoAnterior[] = ((recs ?? []) as {
        id: string; status: string; purchase_receipt_items: { order_item_index: number | null; order_item_code: string | null; quantity_received: number }[];
    }[]).filter(r => r.id !== p.receiptId).map(r => ({
        status: r.status,
        itens: (r.purchase_receipt_items ?? []).map(i => ({ indice: i.order_item_index, code: i.order_item_code, quantidadeRecebida: Number(i.quantity_received) })),
    }));

    const itensDoPedido: ItemDoPedido[] = (Array.isArray(po.items) ? po.items : []).map((i: Record<string, unknown>) => ({
        code: (i.code as string) ?? '', description: (i.description as string) ?? '', unit: (i.unit as string) ?? '',
        quantity: Number(i.quantity) || 0,
    }));

    // Reenvio da MESMA conferência (a rede caiu depois de gravar): responde com o que
    // já está gravado, sem revalidar (o saldo já mudou) — refaz só as parcelas.
    const jaGravada = ((recs ?? []) as { id: string; status: string }[]).find(r => r.id === p.receiptId);
    if (jaGravada) {
        const { data: atual, error: atualErr } = await admin.from('purchase_orders').select('status, version').eq('id', p.orderId).single();
        if (atualErr) throw atualErr;
        const ef = await aplicarEfeitos(admin, p.orderId, atual.status, true);
        return json({
            receiptId: p.receiptId, status: jaGravada.status, statusPedido: atual.status, versao: atual.version ?? 0,
            jaExistia: true, financeiro: ef.financeiro ?? null,
        });
    }

    const linhas = montarLinhas(itensDoPedido, saldoPorItem(itensDoPedido, anteriores), p.itens);
    const status = statusDoRecebimento(linhas);

    if (p.foto) {
        if (p.foto !== caminhoDoComprovante(p.orderId, p.receiptId)) return json({ error: 'Foto fora do lugar.' }, 400);
        const { data: existe } = await admin.storage.from(BUCKET_COMPROVANTE).list(p.orderId, { search: `receipt_${p.receiptId}.jpg` });
        if (!Array.isArray(existe) || existe.length === 0) return json({ error: 'A foto não chegou. Envie de novo.' }, 400);
    }

    // Duas chamadas ao mesmo tempo: o núcleo (pedido travado) devolve "já existia" à segunda.
    const r = await rpc<{ ja_existia: boolean; receipt_id: string; status: string; status_pedido: string; versao: number }>(
        admin, '_recebimento_registrar_core', {
            p_ator: userId, p_order: p.orderId, p_receipt: p.receiptId, p_versao: p.versao,
            p_status: status, p_status_pedido: statusDoPedidoApos(status),
            p_notas: p.notas, p_photo_path: p.foto,
            p_itens: linhas.map(l => ({
                order_item_index: l.indice, order_item_code: l.code, description: l.description, unit: l.unit,
                quantity_ordered: l.pedida, quantity_received: l.recebida, issue: l.problema, notes: l.obs,
            })),
            p_divergencias: divergenciasDe(linhas).map(d => ({
                order_item_code: d.orderItemCode, description: d.description, unit: d.unit,
                issue: d.issue, quantity: d.quantity, notes: d.notes,
            })),
            p_relatorio: relatorioLegado(linhas),
            p_origem: p.token ? 'LINK' : 'APP',
        });

    const ef = await aplicarEfeitos(admin, p.orderId, r.status_pedido, r.ja_existia);
    return json({
        receiptId: r.receipt_id, status: r.status, statusPedido: r.status_pedido, versao: r.versao,
        jaExistia: r.ja_existia, financeiro: ef.financeiro ?? null,
    });
}

// ── retirada (FOB) ───────────────────────────────────────────────────────────
async function acaoRetirada(admin: Admin, userId: string, p: Extract<PedidoDaEdge, { acao: 'retirada' }>) {
    const r = await rpc<{ ja_existia: boolean; status_pedido: string; versao: number }>(admin, '_pedido_retirada_core', {
        p_ator: userId, p_order: p.orderId, p_versao: p.versao, p_data: p.data, p_employee: p.employeeId,
    });
    const ef = await aplicarEfeitos(admin, p.orderId, r.status_pedido, r.ja_existia);
    return json({ statusPedido: r.status_pedido, versao: r.versao, jaExistia: r.ja_existia, financeiro: ef.financeiro ?? null });
}

// ── uploads assinados ────────────────────────────────────────────────────────
async function subirAssinado(admin: Admin, bucket: string, path: string, sobrescrever: boolean) {
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, sobrescrever ? { upsert: true } : undefined);
    if (error || !data?.token) {
        console.error('[pedido-recebimento] upload assinado:', error);
        return json({ error: 'Não foi possível preparar o envio do arquivo.' }, 500);
    }
    return json({ path, token: data.token });
}

async function acaoDocumentoRegistrar(admin: Admin, userId: string, email: string, p: Extract<PedidoDaEdge, { acao: 'documento_registrar' }>) {
    const [pasta, nomeNoBucket] = p.path.split('/');
    const { data: existe } = await admin.storage.from(BUCKET_DOCUMENTO).list(pasta, { search: nomeNoBucket });
    if (!Array.isArray(existe) || !existe.some((o: { name: string }) => o.name === nomeNoBucket)) {
        return json({ error: 'O arquivo não chegou. Envie de novo.' }, 400);
    }
    // Sem sessão, o gatilho de autoria não preenche — a Edge grava quem enviou (como a pedido-fast).
    const { data: perfil } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    const { data, error } = await admin.from('purchase_order_documents').insert({
        order_id: p.orderId, categoria: p.categoria, descricao: p.descricao,
        file_path: p.path, file_name: p.nome, mime_type: p.tipo, size_bytes: p.tamanho,
        enviado_por_lado: 'COMPRADOR', uploaded_by: userId,
        enviado_por: (perfil?.name as string | undefined)?.trim() || email || null,
    }).select('id, categoria, descricao, file_name, file_path, mime_type, enviado_por_lado, enviado_por, created_at').single();
    if (error) {
        await admin.storage.from(BUCKET_DOCUMENTO).remove([p.path]);
        throw error;
    }
    return json({ documento: data });
}

async function acaoAssinar(admin: Admin, p: Extract<PedidoDaEdge, { acao: 'assinar' }>) {
    const permitidos = await rpc<{ path: string; bucket: string }[]>(admin, '_recebimento_paths_permitidos', { p_order: p.orderId, p_paths: p.paths });
    const urls: Record<string, string> = {};
    for (const bucket of [BUCKET_COMPROVANTE, BUCKET_DOCUMENTO]) {
        const paths = (permitidos ?? []).filter(x => x.bucket === bucket).map(x => x.path);
        if (paths.length === 0) continue;
        const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, 3600);
        if (error) { console.error('[pedido-recebimento] assinar:', error); continue; }
        for (const item of (data ?? []) as { path: string | null; signedUrl: string; error: string | null }[]) {
            if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
        }
    }
    return json({ urls });
}
