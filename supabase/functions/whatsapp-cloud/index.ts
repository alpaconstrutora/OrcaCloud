// whatsapp-cloud — WhatsApp Cloud API (Meta) com o token NO SERVIDOR, por organização.
//
// Achado F75 (varredura Claude Security, 15/11/2026; plano
// docs/planos/2026-11-18-seguranca-fase2-achados-restantes.md, PR I). Até aqui o
// token permanente de System User morava em texto puro no localStorage do
// navegador (sobrevivia ao "Sair", voltava preenchido para o próximo usuário e
// valia para todas as organizações daquele navegador). Agora ele fica no Vault,
// por organização (migration aplicar_20271118917000_whatsapp_cloud_token_no_servidor),
// e só esta function o lê — com service_role.
//
// Ações (todas com o JWT do usuário; a org NUNCA é confiada ao corpo quando há
// registro de onde tirá-la):
//   • salvar { organization_id, phone_number_id, token?, template_pedido? }
//       — só proprietário/administrador da org (exigirGestor). TESTA o token na
//       Meta (GET /{phone_number_id}) e só então guarda no Vault. Token vazio =
//       mantém o guardado (troca só número/template, testando com ele).
//   • remover { organization_id } — só gestor. Apaga a linha e o segredo.
//   • enviar_pedido { order_id } — membro da org DO PEDIDO (exigirMembro, org
//       lida do pedido, não do corpo). Monta o template no servidor a partir do
//       pedido gravado: o navegador não escolhe destinatário nem texto, então a
//       function não vira um "mande qualquer coisa para qualquer número".
//
// O token nunca volta para o navegador: as respostas trazem só número exibido,
// nome verificado e o resultado.
//
// REGRA #7, pergunta 3: verify_jwt = true (supabase/config.toml) E gate no código.
// Sem header → 401.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirGestor, exigirMembro, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import {
    GRAPH_API_VERSAO_PADRAO, TEMPLATE_PEDIDO_PADRAO,
    montarMensagemDoPedido, nomeDeTemplateValido, normalizarTelefoneWhatsapp, phoneNumberIdValido,
} from "../../../utils/whatsappPedido.ts"
import { totalEfetivoDoPedido, type ItemComPrecos } from "../../../utils/pedidoItemValor.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH = `https://graph.facebook.com/${Deno.env.get('WA_GRAPH_VERSION') || GRAPH_API_VERSAO_PADRAO}`;
/** Só para o registro do envio — o link de verdade é a URL do botão do template, na Meta. */
const BASE_DO_APP = (Deno.env.get('FRONTEND_URL') || 'https://opura.vercel.app').replace(/\/+$/, '');

/** Mensagem de erro da Graph API, sem nada do pedido feito (o token vai no header, nunca no texto). */
async function erroDaMeta(r: Response): Promise<string> {
    const corpo = await r.json().catch(() => null) as { error?: { message?: string; code?: number } } | null;
    const msg = corpo?.error?.message || `HTTP ${r.status}`;
    return corpo?.error?.code ? `${msg} (código ${corpo.error.code})` : msg;
}

/** O token abre este número? Devolve o que a Meta mostra dele. */
async function testarNaMeta(phoneNumberId: string, token: string):
    Promise<{ ok: true; numero: string | null; nome: string | null } | { ok: false; status: number; erro: string }> {
    let r: Response;
    try {
        r = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        return { ok: false, status: 0, erro: e instanceof Error ? e.message : String(e) };
    }
    if (!r.ok) return { ok: false, status: r.status, erro: await erroDaMeta(r) };
    const d = await r.json().catch(() => ({})) as { display_phone_number?: string; verified_name?: string };
    return { ok: true, numero: d.display_phone_number ?? null, nome: d.verified_name ?? null };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // Sessão válida ANTES de qualquer consulta: sem isso, um id inexistente
    // responderia diferente de um existente e o anônimo mapearia o que existe.
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    const body = await req.json().catch(() => ({})) as {
        acao?: 'salvar' | 'remover' | 'enviar_pedido';
        organization_id?: string;
        phone_number_id?: string;
        token?: string;
        template_pedido?: string;
        order_id?: string;
    };

    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Configuração (só gestor) ──────────────────────────────────────
    if (body.acao === 'salvar' || body.acao === 'remover') {
        const org = UUID_RE.test(body.organization_id ?? '') ? body.organization_id! : null;
        const vinculo = await exigirGestor(req, org);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

        if (body.acao === 'remover') {
            const { error } = await admin.rpc('whatsapp_cloud_remover', { p_org: org });
            if (error) return json({ error: error.message }, 500);
            return json({ ok: true });
        }

        const phoneNumberId = (body.phone_number_id ?? '').trim();
        const template = (body.template_pedido ?? '').trim() || TEMPLATE_PEDIDO_PADRAO;
        const tokenNovo = (body.token ?? '').trim();
        if (!phoneNumberIdValido(phoneNumberId)) {
            return json({ error: 'Phone Number ID inválido: são só dígitos (Meta for Developers › WhatsApp › API Setup).' }, 400);
        }
        if (!nomeDeTemplateValido(template)) {
            return json({ error: 'Nome do template inválido: use o nome exato aprovado na Meta (minúsculas, dígitos e _).' }, 400);
        }

        let tokenParaTestar = tokenNovo;
        if (!tokenParaTestar) {
            const { data: guardado, error } = await admin.rpc('whatsapp_cloud_ler_token', { p_org: org });
            if (error || !guardado) return json({ error: 'Informe o token: esta organização ainda não tem token guardado.' }, 400);
            tokenParaTestar = guardado as string;
        }

        const teste = await testarNaMeta(phoneNumberId, tokenParaTestar);
        if (!teste.ok) {
            return json({
                error: teste.status === 401 || teste.status === 403 || teste.status === 400
                    ? `A Meta recusou este token para o Phone Number ID ${phoneNumberId}: ${teste.erro}. Confira se o token é do System User com acesso a este número e se não foi revogado.`
                    : `Não foi possível testar o token na Meta: ${teste.erro}`,
            }, 422);
        }

        const { error: eGuardar } = await admin.rpc('whatsapp_cloud_guardar', {
            p_org: org,
            p_phone_number_id: phoneNumberId,
            p_token: tokenNovo || null,
            p_template: template,
            p_numero_exibicao: teste.numero,
            p_nome_verificado: teste.nome,
            p_por: vinculo.email,
        });
        if (eGuardar) return json({ error: eGuardar.message }, 500);
        return json({ ok: true, numero_exibicao: teste.numero, nome_verificado: teste.nome });
    }

    // ─── Envio do pedido (membro da org DO PEDIDO) ─────────────────────
    if (body.acao === 'enviar_pedido') {
        const orderId = UUID_RE.test(body.order_id ?? '') ? body.order_id! : null;
        if (!orderId) return json({ error: 'order_id é obrigatório.' }, 400);

        const { data: pedido } = await admin
            .from('purchase_orders')
            .select('id, number, organization_id, empresa_id, supplier_id, project_id, delivery_date, items')
            .eq('id', orderId)
            .maybeSingle();

        // Mesmo critério de orderService (gancho P2P): a org é a DO PEDIDO; a da
        // empresa só para pedido antigo sem organization_id.
        let org: string | null = pedido?.organization_id ?? null;
        if (pedido && !org && pedido.empresa_id) {
            const { data: empresa } = await admin.from('companies').select('org_id').eq('id', pedido.empresa_id).maybeSingle();
            org = empresa?.org_id ?? null;
        }
        // Sem pedido → nulo no gate, que responde 400 sem dizer se o id existe.
        const vinculo = await exigirMembro(req, org);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);

        const { data: config } = await admin
            .from('whatsapp_cloud_config')
            .select('phone_number_id, template_pedido, vault_secret_id')
            .eq('organization_id', org)
            .maybeSingle();
        if (!config?.vault_secret_id) {
            return json({
                error: 'WhatsApp não configurado nesta organização. Um proprietário ou administrador cadastra o token em Configurações › WhatsApp & Integrações.',
                codigo: 'nao_configurado',
            }, 409);
        }

        const { data: fornecedor } = pedido.supplier_id
            ? await admin.from('suppliers').select('name, phone').eq('id', pedido.supplier_id).maybeSingle()
            : { data: null };
        const para = normalizarTelefoneWhatsapp(fornecedor?.phone);
        if (!para) {
            return json({
                error: 'Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.',
                codigo: 'sem_telefone',
            }, 422);
        }
        const { data: obra } = pedido.project_id
            ? await admin.from('projects').select('name').eq('id', pedido.project_id).maybeSingle()
            : { data: null };

        const { data: token, error: eToken } = await admin.rpc('whatsapp_cloud_ler_token', { p_org: org });
        if (eToken || !token) return json({ error: eToken?.message || 'Token do WhatsApp não encontrado.' }, 500);

        // Link público novo a cada envio — o mesmo que o app fazia no navegador.
        const shareToken = crypto.randomUUID();
        const { error: eLink } = await admin.from('purchase_orders').update({ share_token: shareToken }).eq('id', pedido.id);
        if (eLink) return json({ error: `Erro ao gerar link do pedido: ${eLink.message}` }, 500);
        const shareUrl = `${BASE_DO_APP}/pedido/${shareToken}`;

        const itens = (Array.isArray(pedido.items) ? pedido.items : []) as ItemComPrecos[];
        const mensagem = montarMensagemDoPedido({
            para,
            template: config.template_pedido || TEMPLATE_PEDIDO_PADRAO,
            fornecedor: fornecedor?.name ?? '',
            numeroDoPedido: pedido.number || pedido.id,
            obra: obra?.name ?? '',
            quantidadeDeItens: itens.length,
            total: totalEfetivoDoPedido(itens),
            dataDeEntrega: pedido.delivery_date,
            shareToken,
        });

        let falha: string | null = null;
        let wamid: string | null = null;
        try {
            const r = await fetch(`${GRAPH}/${config.phone_number_id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(mensagem),
            });
            if (!r.ok) {
                falha = await erroDaMeta(r);
            } else {
                const d = await r.json().catch(() => ({})) as { messages?: { id?: string }[] };
                wamid = d.messages?.[0]?.id ?? null;
            }
        } catch (e) {
            falha = e instanceof Error ? e.message : String(e);
        }

        // Mesmo registro que o navegador gravava (aba Comunicação / Logs de envio).
        await admin.from('notification_log').insert(falha
            ? {
                order_id: pedido.id, channel: 'whatsapp', recipient: para, status: 'failed',
                error: falha, metadata: { to: para, por: vinculo.email },
            }
            : {
                order_id: pedido.id, channel: 'whatsapp', recipient: para, status: 'sent',
                body: `Template: ${mensagem.template.name} | Link: ${shareUrl}`,
                metadata: { to: para, phoneNumberId: config.phone_number_id, shareUrl, wamid, por: vinculo.email },
            });

        if (falha) return json({ error: falha }, 502);
        return json({ ok: true, para });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
});
