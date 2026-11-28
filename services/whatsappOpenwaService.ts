/**
 * WhatsApp pelo OpenWA — o número da PLATAFORMA (ÒPURA), compartilhado pelas
 * organizações que o ligam. Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md.
 *
 * O navegador nunca fala com o OpenWA nem escolhe destinatário ou texto do pedido:
 *   • `enviarPedido(orderId)` chama a Edge Function `whatsapp-openwa`, que confere
 *     que quem pede é membro da organização DO PEDIDO (e tem a permissão
 *     `canUseWhatsappEmpresa`, ou — no envio automático — que a organização ligou
 *     o envio automático), monta o texto a partir do pedido gravado e põe na fila.
 *     A resposta é "na fila" na hora; quem envia é o worker da máquina local.
 *   • cada envio leva um `comando_id` (crypto.randomUUID, ou o `comandoId` que a
 *     tela guardou para repetir o MESMO envio depois de um erro — comandoParaTentativa
 *     em utils/canalWhatsappDoPedido): é a chave de idempotência — a repetição não
 *     duplica a mensagem; o envio automático não leva (o servidor calcula um por
 *     transição para Enviado).
 *   • situação e uso por organização vão direto às RPCs `wa_situacao` /
 *     `wa_definir_uso` (recorte e autorização dentro delas).
 */
import { supabase } from '../lib/supabase';

/** Estado normalizado da conexão (wa_conexoes.estado). */
export type EstadoConexaoOpenwa = 'maquina_fora' | 'desconectado' | 'aguardando_qr' | 'conectado' | 'erro';

/** Uma linha por organização de que o usuário é membro. */
export interface SituacaoOpenwa {
    organizationId: string;
    estado: EstadoConexaoOpenwa | null;
    numeroExibicao: string | null;
    /** Último "estou vivo" do worker. Sem sinal há 3 min = máquina fora (a tela confere). */
    vistoEm: string | null;
    /** A organização usa o WhatsApp do ÒPURA. */
    usaNaOrg: boolean;
    /** O pedido sai sozinho ao virar Enviado. */
    envioAutomaticoPedido: boolean;
}

interface LinhaSituacao {
    estado: EstadoConexaoOpenwa | null;
    numero_exibicao: string | null;
    visto_em: string | null;
    usa_na_org: boolean | null;
    envio_automatico_pedido: boolean | null;
    organization_id: string;
}

/** Resposta do fornecedor que ainda não tem pedido (triagem do superadmin). */
export interface MensagemSemPedido {
    id: string;
    telefone: string;
    /** Primeiros 200 caracteres. */
    texto: string;
    recebidoEm: string;
}

/** Erro da function com o `codigo` dela (`sem_telefone`, `nao_usa`, `sem_permissao`…). */
export class ErroWhatsappOpenwa extends Error {
    codigo: string | null;
    constructor(mensagem: string, codigo: string | null) {
        super(mensagem);
        this.name = 'ErroWhatsappOpenwa';
        this.codigo = codigo;
    }
}

/** Chama a function; resposta não-2xx (ou corpo `{ error }`) vira Error com a mensagem dela. */
async function invocar<T>(acao: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.functions.invoke('whatsapp-openwa', { body: { acao, ...body } });
    if (error) {
        let detalhe = '';
        let codigo: string | null = null;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
            try {
                const corpo = await ctx.json() as { error?: string; codigo?: string } | null;
                detalhe = corpo?.error ?? '';
                codigo = corpo?.codigo ?? null;
            } catch { /* corpo não-JSON */ }
        }
        throw new ErroWhatsappOpenwa(detalhe || (error as { message?: string }).message || 'Erro no WhatsApp do ÒPURA.', codigo);
    }
    const corpo = data as { error?: string; codigo?: string } | null;
    if (corpo && corpo.error) throw new ErroWhatsappOpenwa(corpo.error, corpo.codigo ?? null);
    return data as T;
}

export const whatsappOpenwaService = {
    /** Uma linha por organização de que o usuário é membro. */
    async situacao(): Promise<SituacaoOpenwa[]> {
        const { data, error } = await supabase.rpc('wa_situacao');
        if (error) throw error;
        return ((data ?? []) as LinhaSituacao[]).map(l => ({
            organizationId: l.organization_id,
            estado: l.estado,
            numeroExibicao: l.numero_exibicao,
            vistoEm: l.visto_em,
            usaNaOrg: !!l.usa_na_org,
            envioAutomaticoPedido: !!l.envio_automatico_pedido,
        }));
    },

    /**
     * Põe o pedido na fila de envio ao fornecedor. O servidor escolhe telefone e
     * texto a partir do pedido. `automatico` = chamado pelo orderService logo
     * depois de marcar Enviado (vale a chave da organização, não a permissão).
     * `comandoId`: a chave que a tela guardou para repetir o mesmo envio (manual);
     * sem ela, uma nova.
     */
    async enviarPedido(orderId: string, opcoes?: { automatico?: boolean; comandoId?: string }): Promise<{ status: 'na_fila' }> {
        const corpo: Record<string, unknown> = { order_id: orderId };
        if (opcoes?.automatico) corpo.automatico = true;
        else corpo.comando_id = opcoes?.comandoId || crypto.randomUUID();
        await invocar<{ status: 'na_fila'; mensagem_id: string }>('enviar_pedido', corpo);
        return { status: 'na_fila' };
    },

    /**
     * Mensagem livre do comprador, para o fornecedor DAQUELE pedido; entra no chat do pedido.
     * `comandoId`: a chave guardada para repetir o mesmo texto depois de um erro; sem ela, uma nova.
     */
    async responderNoPedido(orderId: string, texto: string, opcoes?: { comandoId?: string }): Promise<void> {
        const limpo = (texto ?? '').trim();
        if (!limpo) throw new ErroWhatsappOpenwa('Escreva a mensagem.', 'texto_invalido');
        if (limpo.length > 4096) throw new ErroWhatsappOpenwa('Mensagem longa demais (até 4096 caracteres).', 'texto_invalido');
        await invocar('responder_no_pedido', {
            order_id: orderId, texto: limpo, comando_id: opcoes?.comandoId || crypto.randomUUID(),
        });
    },

    /** Owner/admin da organização (ou superadmin) liga/desliga o uso. `envioAutomatico` null = mantém. */
    async definirUso(orgId: string, usar: boolean, envioAutomatico: boolean | null): Promise<void> {
        const { error } = await supabase.rpc('wa_definir_uso', {
            p_org: orgId, p_usar: usar, p_envio_automatico: envioAutomatico,
        });
        if (error) throw new Error(error.message);
    },

    /** Só superadmin (a function confere): respostas sem organização dos últimos 30 dias. */
    async listarSemPedido(): Promise<MensagemSemPedido[]> {
        const r = await invocar<{ itens?: { id: string; telefone: string | null; texto: string | null; recebido_em: string }[] }>(
            'listar_sem_pedido',
        );
        return (r?.itens ?? []).map(i => ({
            id: i.id,
            telefone: i.telefone ?? '',
            texto: i.texto ?? '',
            recebidoEm: i.recebido_em,
        }));
    },

    /**
     * Pedido pelo número (único no sistema), para a triagem do superadmin escolher
     * a quem atribuir uma resposta. Lê pela RLS de `purchase_orders`; quem decide
     * a atribuição é a function. Número vazio = null, sem consulta.
     */
    async pedidoPeloNumero(numero: string): Promise<{ id: string; numero: string; organizationId: string | null } | null> {
        const n = (numero ?? '').trim();
        if (!n) return null;
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('id, number, organization_id')
            .eq('number', n)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const p = data as { id: string; number: string; organization_id: string | null } | null;
        return p ? { id: p.id, numero: p.number, organizationId: p.organization_id ?? null } : null;
    },

    /** Só superadmin: a resposta sem organização passa a ser do pedido (e entra no chat dele). */
    async atribuir(mensagemId: string, orderId: string): Promise<void> {
        await invocar('atribuir', { mensagem_id: mensagemId, order_id: orderId });
    },
};
