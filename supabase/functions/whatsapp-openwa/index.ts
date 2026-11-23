// whatsapp-openwa — WhatsApp pelo OpenWA: a TELA põe na FILA (wa_mensagens).
//
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §3; Task 3).
// O número é da PLATAFORMA (ÒPURA), compartilhado pelas organizações que o ligam
// (wa_uso_por_org). Quem envia de fato é o worker da máquina local
// (whatsapp-openwa-worker); esta function só confere quem pede, monta a mensagem
// no servidor e grava na fila. A campainha (gatilho em wa_mensagens) acorda o worker.
//
// Ações (todas com o JWT do usuário; a org NUNCA vem do corpo — vem do pedido):
//   • enviar_pedido { order_id, comando_id?, automatico? }
//       — membro da org DO PEDIDO (organization_id; companies.org_id só para pedido
//         antigo sem ela, como whatsapp-cloud). A org precisa usar o número
//         (wa_uso_por_org) → senão 409 nao_usa.
//         Manual: exige wa_pode_usar (canUseWhatsappEmpresa ou superadmin) → 403
//         sem_permissao. Automático (orderService, logo após marcar Enviado): não
//         exige a permissão da pessoa — é decisão da organização
//         (envio_automatico_pedido) — mas exige que o pedido ESTEJA Enviado, para o
//         caminho automático não servir de atalho a quem não tem a permissão; a
//         chave é comandoIdEnvioAutomatico(id, updated_at), uma por transição.
//         Texto e telefone saem do pedido gravado: o navegador não escolhe
//         destinatário nem texto. Fornecedor sem telefone → 422 sem_telefone, sem
//         gravar nada. Conflito de comando_id → devolve a linha existente (a tela
//         repete o mesmo comando_id depois de um erro); se essa linha foi CANCELADA
//         → 409 `cancelada` (nada saiu; a tela gera outro comando_id).
//         Falha ao gravar o notification_log → cancela a linha da fila se ainda
//         `pendente` (500 `cancelada`: nada saiu) ou, se o worker já a pegou, 500
//         `registro_falhou` (a mensagem sai, só não aparece nos Logs de envio).
//   • responder_no_pedido { order_id, texto, comando_id } — membro + wa_pode_usar;
//       texto livre (1–4096) para o telefone do fornecedor DAQUELE pedido; grava em
//       order_chats (sender_role buyer, canal whatsapp) e na fila. Mesmo comando_id
//       de uma linha cancelada → 409 `cancelada`.
//   • listar_sem_pedido — só superadmin: respostas sem organização (30 dias).
//   • atribuir { mensagem_id, order_id } — só superadmin: a resposta sem
//       organização passa a ser do pedido e vira linha no chat dele.
//
// REGRA #7, pergunta 3: verify_jwt = true (supabase/config.toml) E gate no código
// (exigirUsuario antes de qualquer consulta). Sem header → 401.
// order_chats.canal = 'whatsapp' só é aceito porque esta function grava com
// service_role (gatilho trg_order_chats_canal).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, exigirSuperadmin, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"
import { chatIdDoTelefone, comandoIdEnvioAutomatico, montarTextoDoPedido } from "../../../utils/whatsappOpenwa.ts"
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
const BASE_DO_APP = (Deno.env.get('FRONTEND_URL') || 'https://opura.vercel.app').replace(/\/+$/, '');
const TEXTO_MAX = 4096;
const DIAS_SEM_PEDIDO = 30;

interface Pedido {
    id: string;
    number: string | null;
    organization_id: string | null;
    empresa_id: string | null;
    supplier_id: string | null;
    project_id: string | null;
    delivery_date: string | null;
    items: unknown;
    status: string | null;
    updated_at: string | null;
    share_token: string | null;
}

/** `comando_id` vindo da tela: 1–200 caracteres (o CHECK da tabela). */
function comandoValido(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length >= 1 && t.length <= 200 ? t : null;
}

/** Pedido + a org dele (organization_id; companies.org_id só para pedido antigo sem ela). */
async function lerPedido(admin: Admin, orderId: string | null): Promise<{ pedido: Pedido | null; org: string | null }> {
    if (!orderId) return { pedido: null, org: null };
    const { data: pedido } = await admin
        .from('purchase_orders')
        .select('id, number, organization_id, empresa_id, supplier_id, project_id, delivery_date, items, status, updated_at, share_token')
        .eq('id', orderId)
        .maybeSingle();
    let org: string | null = pedido?.organization_id ?? null;
    if (pedido && !org && pedido.empresa_id) {
        const { data: empresa } = await admin.from('companies').select('org_id').eq('id', pedido.empresa_id).maybeSingle();
        org = empresa?.org_id ?? null;
    }
    return { pedido: (pedido as Pedido | null) ?? null, org };
}

async function lerFornecedor(admin: Admin, supplierId: string | null): Promise<{ name: string | null; phone: string | null; email: string | null } | null> {
    if (!supplierId) return null;
    const { data } = await admin.from('suppliers').select('name, phone, email').eq('id', supplierId).maybeSingle();
    return data ?? null;
}

/** Linha da fila já gravada com este comando (idempotência). */
async function mensagemDoComando(admin: Admin, org: string, comandoId: string): Promise<{ id: string; status: string } | null> {
    const { data } = await admin
        .from('wa_mensagens')
        .select('id, status')
        .eq('organization_id', org)
        .eq('comando_id', comandoId)
        .maybeSingle();
    return data ?? null;
}

/**
 * Grava a saída na fila. Conflito de (organization_id, comando_id) → devolve a
 * linha que já existia (`nova: false`), sem duplicar.
 */
async function enfileirar(admin: Admin, linha: Record<string, unknown>):
    Promise<{ ok: true; id: string; nova: boolean; status: string } | { ok: false; erro: string }> {
    const { data, error } = await admin.from('wa_mensagens').insert(linha).select('id').single();
    if (!error && data?.id) return { ok: true, id: data.id, nova: true, status: 'pendente' };
    if (error?.code === '23505') {
        const existente = await mensagemDoComando(admin, linha.organization_id as string, linha.comando_id as string);
        if (existente) return { ok: true, id: existente.id, nova: false, status: existente.status };
    }
    return { ok: false, erro: error?.message || 'Erro ao gravar na fila do WhatsApp.' };
}

/** Nome de quem escreve no chat: perfil → membro da org → e-mail (como pedido-fast). */
async function nomeDoUsuario(admin: Admin, userId: string, email: string, org: string): Promise<string> {
    const { data: perfil } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
    if (perfil?.name?.trim()) return perfil.name.trim();
    const { data: membro } = await admin.from('organization_members').select('name')
        .eq('organization_id', org).eq('email', email).limit(1).maybeSingle();
    if (membro?.name?.trim()) return membro.name.trim();
    return email;
}

const semUso = () => json({
    error: 'Esta organização não usa o WhatsApp do ÒPURA. Um proprietário ou administrador liga em Configurações › WhatsApp & Integrações.',
    codigo: 'nao_usa',
}, 409);

const semPermissao = () => json({
    error: 'Você não tem permissão para usar o WhatsApp da empresa. Peça a um administrador para liberar "Usar o WhatsApp da empresa" no seu acesso.',
    codigo: 'sem_permissao',
}, 403);

const semTelefone = () => json({
    error: 'Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.',
    codigo: 'sem_telefone',
}, 422);

/**
 * O comando_id repetido é de uma linha CANCELADA (antes de sair): devolver "na fila"
 * seria mentir — nada vai sair. `cancelada` faz a tela gerar outro comando_id.
 */
const comandoCancelado = () => json({
    error: 'Este envio foi cancelado antes de sair; nada foi enviado. Tente de novo.',
    codigo: 'cancelada',
}, 409);

/** Cancela a linha da fila se ainda não saiu. true = cancelou (nada foi enviado). */
async function cancelarSeAindaPendente(admin: Admin, id: string, erro: string): Promise<boolean> {
    const { data, error } = await admin.from('wa_mensagens')
        .update({ status: 'cancelada', erro })
        .eq('id', id)
        .eq('status', 'pendente')
        .select('id')
        .maybeSingle();
    if (error) console.error('[whatsapp-openwa] cancelar a linha da fila falhou:', error.message);
    return !error && !!data;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // Sessão válida ANTES de qualquer consulta: sem isso, um id inexistente
    // responderia diferente de um existente e o anônimo mapearia o que existe.
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    const body = await req.json().catch(() => ({})) as {
        acao?: 'enviar_pedido' | 'responder_no_pedido' | 'listar_sem_pedido' | 'atribuir';
        order_id?: string;
        comando_id?: string;
        automatico?: boolean;
        texto?: string;
        mensagem_id?: string;
    };

    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Envio do pedido (membro da org DO PEDIDO) ─────────────────────
    if (body.acao === 'enviar_pedido') {
        const orderId = UUID_RE.test(body.order_id ?? '') ? body.order_id! : null;
        if (!orderId) return json({ error: 'order_id é obrigatório.' }, 400);
        const automatico = body.automatico === true;

        const { pedido, org } = await lerPedido(admin, orderId);
        // Sem pedido → nulo no gate, que responde 400 sem dizer se o id existe.
        const vinculo = await exigirMembro(req, org);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!pedido || !org) return json({ error: 'Pedido não encontrado.' }, 404);

        const { data: uso } = await admin
            .from('wa_uso_por_org')
            .select('organization_id, envio_automatico_pedido')
            .eq('organization_id', org)
            .maybeSingle();
        if (!uso) return semUso();

        let comandoId: string;
        if (automatico) {
            if (!uso.envio_automatico_pedido) {
                return json({ error: 'O envio automático do pedido está desligado nesta organização.', codigo: 'nao_usa' }, 409);
            }
            // O caminho automático não pede a permissão da pessoa; por isso só vale
            // para o pedido que está Enviado agora (a transição que o disparou).
            if (pedido.status !== 'Enviado') {
                return json({ error: 'O envio automático só vale para pedido com status Enviado.', codigo: 'status_invalido' }, 409);
            }
            if (!pedido.updated_at) {
                return json({ error: 'Pedido sem data de atualização: não dá para gerar a chave do envio automático.', codigo: 'status_invalido' }, 409);
            }
            comandoId = comandoIdEnvioAutomatico(pedido.id, pedido.updated_at);
        } else {
            const { data: pode, error: ePode } = await admin.rpc('wa_pode_usar', { p_user: vinculo.userId, p_org: org });
            if (ePode) return json({ error: ePode.message }, 500);
            if (pode !== true) return semPermissao();
            if (body.comando_id !== undefined && !comandoValido(body.comando_id)) {
                return json({ error: 'comando_id inválido (1 a 200 caracteres).' }, 400);
            }
            comandoId = comandoValido(body.comando_id) ?? crypto.randomUUID();
        }

        const fornecedor = await lerFornecedor(admin, pedido.supplier_id);
        const chatId = chatIdDoTelefone(fornecedor?.phone);
        if (!chatId) return semTelefone();
        const telefone = chatId.split('@')[0];

        // Repetição do mesmo comando (rede, retentativa, gatilho repetido): devolve a
        // linha que já existe ANTES de mexer em share_token ou montar texto.
        const jaExiste = await mensagemDoComando(admin, org, comandoId);
        if (jaExiste?.status === 'cancelada') return comandoCancelado();
        if (jaExiste) return json({ status: 'na_fila', mensagem_id: jaExiste.id });

        // Link público: reusa o do pedido; gera só se não tem. `.is(null)` evita que
        // dois envios simultâneos gerem dois links (o segundo relê o do primeiro).
        let shareToken = pedido.share_token;
        if (!shareToken) {
            const novo = crypto.randomUUID();
            const { data: gravado, error: eLink } = await admin
                .from('purchase_orders')
                .update({ share_token: novo })
                .eq('id', pedido.id)
                .is('share_token', null)
                .select('share_token')
                .maybeSingle();
            if (eLink) return json({ error: `Erro ao gerar link do pedido: ${eLink.message}` }, 500);
            shareToken = gravado?.share_token ?? null;
            if (!shareToken) {
                const { data: relido } = await admin.from('purchase_orders').select('share_token').eq('id', pedido.id).maybeSingle();
                shareToken = relido?.share_token ?? null;
            }
            if (!shareToken) return json({ error: 'Erro ao gerar link do pedido.' }, 500);
        }
        const shareUrl = `${BASE_DO_APP}/pedido/${shareToken}`;

        const [{ data: organizacao }, { data: obra }] = await Promise.all([
            admin.from('organizations').select('name').eq('id', org).maybeSingle(),
            pedido.project_id
                ? admin.from('projects').select('name').eq('id', pedido.project_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        const itens = (Array.isArray(pedido.items) ? pedido.items : []) as ItemComPrecos[];
        const texto = montarTextoDoPedido({
            empresa: organizacao?.name ?? '',
            fornecedor: fornecedor?.name ?? '',
            numero: pedido.number || pedido.id,
            obra: obra?.name ?? '',
            quantidadeDeItens: itens.length,
            total: totalEfetivoDoPedido(itens),
            dataDeEntrega: pedido.delivery_date,
            link: shareUrl,
        });

        const fila = await enfileirar(admin, {
            organization_id: org,
            direcao: 'saida',
            telefone,
            chat_id_remoto: chatId,
            texto,
            status: 'pendente',
            comando_id: comandoId,
            entidade_tipo: 'purchase_order',
            entidade_id: pedido.id,
            criado_por: vinculo.userId,
        });
        if (!fila.ok) return json({ error: fila.erro }, 500);
        if (!fila.nova && fila.status === 'cancelada') return comandoCancelado();

        if (fila.nova) {
            // Mesmo registro da aba Comunicação / Logs de envio; o worker atualiza o status.
            const { error: eLog } = await admin.from('notification_log').insert({
                order_id: pedido.id,
                channel: 'whatsapp',
                recipient: telefone,
                status: 'pending',
                body: texto,
                metadata: {
                    to: telefone, via: 'openwa', wa_mensagem_id: fila.id, comando_id: comandoId,
                    automatico, shareUrl, por: vinculo.email,
                },
            });
            if (eLog) {
                // Sem o log a mensagem sairia e o pedido não mostraria nada (a varredura do
                // worker só conserta log que existe): cancela enquanto ainda não saiu.
                console.error('[whatsapp-openwa] gravar o notification_log falhou:', eLog.message);
                if (await cancelarSeAindaPendente(admin, fila.id, `não entrou nos Logs de envio do pedido: ${eLog.message}`)) {
                    return json({
                        error: 'Não deu para registrar o envio no pedido, e ele foi cancelado: nada foi enviado. Tente de novo.',
                        codigo: 'cancelada',
                    }, 500);
                }
                // O worker já pegou a linha: a mensagem vai sair; repetir o mesmo comando
                // não duplica (devolve esta linha).
                return json({
                    error: 'A mensagem foi para o WhatsApp, mas não entrou nos Logs de envio do pedido. Não reenvie: confira no celular do número.',
                    codigo: 'registro_falhou',
                }, 500);
            }
        }
        return json({ status: 'na_fila', mensagem_id: fila.id });
    }

    // ─── Resposta do comprador no pedido (membro + permissão) ──────────
    if (body.acao === 'responder_no_pedido') {
        const orderId = UUID_RE.test(body.order_id ?? '') ? body.order_id! : null;
        if (!orderId) return json({ error: 'order_id é obrigatório.' }, 400);

        const { pedido, org } = await lerPedido(admin, orderId);
        const vinculo = await exigirMembro(req, org);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!pedido || !org) return json({ error: 'Pedido não encontrado.' }, 404);

        const comandoId = comandoValido(body.comando_id);
        if (!comandoId) return json({ error: 'comando_id é obrigatório (1 a 200 caracteres).' }, 400);
        const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
        if (texto.length < 1 || texto.length > TEXTO_MAX) {
            return json({ error: `Mensagem vazia ou longa demais (1 a ${TEXTO_MAX} caracteres).`, codigo: 'texto_invalido' }, 400);
        }

        const { data: uso } = await admin.from('wa_uso_por_org').select('organization_id').eq('organization_id', org).maybeSingle();
        if (!uso) return semUso();
        const { data: pode, error: ePode } = await admin.rpc('wa_pode_usar', { p_user: vinculo.userId, p_org: org });
        if (ePode) return json({ error: ePode.message }, 500);
        if (pode !== true) return semPermissao();

        const fornecedor = await lerFornecedor(admin, pedido.supplier_id);
        const chatId = chatIdDoTelefone(fornecedor?.phone);
        if (!chatId) return semTelefone();
        const telefone = chatId.split('@')[0];

        // O número é de todas as empresas: a mensagem diz de qual empresa e pedido é.
        const { data: organizacao } = await admin.from('organizations').select('name').eq('id', org).maybeSingle();
        const empresa = (organizacao?.name ?? '').replace(/\s+/g, ' ').trim() || '—';
        const numero = (pedido.number || pedido.id).replace(/\s+/g, ' ').trim();
        const textoNaFila = `*${empresa}* — Pedido de compra nº ${numero}\n\n${texto}`;

        const fila = await enfileirar(admin, {
            organization_id: org,
            direcao: 'saida',
            telefone,
            chat_id_remoto: chatId,
            texto: textoNaFila,
            status: 'pendente',
            comando_id: comandoId,
            entidade_tipo: 'purchase_order',
            entidade_id: pedido.id,
            criado_por: vinculo.userId,
        });
        if (!fila.ok) return json({ error: fila.erro }, 500);
        // Repetição do mesmo comando, mas a linha foi cancelada (ex.: não entrou no chat).
        if (!fila.nova && fila.status === 'cancelada') return comandoCancelado();
        // Repetição do mesmo clique: a linha do chat já foi gravada da primeira vez.
        if (!fila.nova) return json({ ok: true, mensagem_id: fila.id });

        const { error: eChat } = await admin.from('order_chats').insert({
            order_id: pedido.id,
            sender_email: vinculo.email,
            sender_name: await nomeDoUsuario(admin, vinculo.userId, vinculo.email, org),
            sender_role: 'buyer',
            message: texto,
            is_system: false,
            canal: 'whatsapp',
        });
        if (eChat) {
            // Sem a linha no chat a mensagem sairia "invisível": cancela se ainda não saiu.
            const cancelou = await cancelarSeAindaPendente(admin, fila.id, `não entrou no chat do pedido: ${eChat.message}`);
            return json({
                error: `Erro ao gravar a mensagem no chat do pedido: ${eChat.message}`,
                codigo: cancelou ? 'cancelada' : 'registro_falhou',
            }, 500);
        }
        return json({ ok: true, mensagem_id: fila.id });
    }

    // ─── Triagem do superadmin ─────────────────────────────────────────
    if (body.acao === 'listar_sem_pedido') {
        const sa = await exigirSuperadmin(req);
        if (!sa.ok) return respostaDeErro(sa, corsHeaders);

        const desde = new Date(Date.now() - DIAS_SEM_PEDIDO * 86400_000).toISOString();
        const { data, error } = await admin
            .from('wa_mensagens')
            .select('id, telefone, texto, criado_em')
            .eq('direcao', 'entrada')
            .is('organization_id', null)
            .gte('criado_em', desde)
            .order('criado_em', { ascending: false })
            .limit(200);
        if (error) return json({ error: error.message }, 500);
        const itens = ((data ?? []) as { id: string; telefone: string | null; texto: string | null; criado_em: string }[])
            .map(l => ({ id: l.id, telefone: l.telefone ?? '', texto: (l.texto ?? '').slice(0, 200), recebido_em: l.criado_em }));
        return json({ itens });
    }

    if (body.acao === 'atribuir') {
        const sa = await exigirSuperadmin(req);
        if (!sa.ok) return respostaDeErro(sa, corsHeaders);

        const mensagemId = UUID_RE.test(body.mensagem_id ?? '') ? body.mensagem_id! : null;
        const orderId = UUID_RE.test(body.order_id ?? '') ? body.order_id! : null;
        if (!mensagemId || !orderId) return json({ error: 'mensagem_id e order_id são obrigatórios.' }, 400);

        const { pedido, org } = await lerPedido(admin, orderId);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);
        if (!org) return json({ error: 'O pedido não tem organização: não dá para atribuir.' }, 422);

        const { data: msg } = await admin
            .from('wa_mensagens')
            .select('id, direcao, organization_id, texto')
            .eq('id', mensagemId)
            .maybeSingle();
        if (!msg || msg.direcao !== 'entrada') return json({ error: 'Mensagem não encontrada.' }, 404);
        if (msg.organization_id) return json({ error: 'Esta mensagem já foi atribuída a um pedido.', codigo: 'ja_atribuida' }, 409);

        // Só move quem ainda está sem organização (dois cliques não atribuem duas vezes).
        const { data: movida, error: eMover } = await admin
            .from('wa_mensagens')
            .update({ organization_id: org, entidade_tipo: 'purchase_order', entidade_id: pedido.id })
            .eq('id', mensagemId)
            .eq('direcao', 'entrada')
            .is('organization_id', null)
            .select('id')
            .maybeSingle();
        if (eMover) return json({ error: eMover.message }, 500);
        if (!movida) return json({ error: 'Esta mensagem já foi atribuída a um pedido.', codigo: 'ja_atribuida' }, 409);

        const fornecedor = await lerFornecedor(admin, pedido.supplier_id);
        const { error: eChat } = await admin.from('order_chats').insert({
            order_id: pedido.id,
            sender_email: fornecedor?.email ?? '',
            sender_name: fornecedor?.name?.trim() || 'Fornecedor',
            sender_role: 'supplier',
            message: (msg.texto ?? '').trim() || '(mensagem sem texto)',
            is_system: false,
            canal: 'whatsapp',
        });
        if (eChat) {
            // Desfaz a atribuição: sem a linha no chat ninguém da org veria a resposta.
            await admin.from('wa_mensagens')
                .update({ organization_id: null, entidade_tipo: null, entidade_id: null })
                .eq('id', mensagemId);
            return json({ error: `Erro ao gravar a mensagem no chat do pedido: ${eChat.message}` }, 500);
        }
        return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
});
