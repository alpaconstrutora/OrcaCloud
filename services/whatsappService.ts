/**
 * WhatsApp Cloud API — Meta Business Platform (oficial).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * ── Desde 18/11/2026 (achado F75): o token NÃO passa pelo navegador ───────────
 *
 * Antes, o token permanente de System User ficava em `localStorage` em texto
 * puro e o navegador chamava a Graph API direto. Agora:
 *   • o token mora no Vault, UM POR ORGANIZAÇÃO, e só a Edge Function
 *     `whatsapp-cloud` o lê (service_role);
 *   • quem configura é proprietário/administrador da organização (a function
 *     testa o token na Meta antes de guardar);
 *   • o envio do pedido é `enviarPedido(orderId)`: a function confere que quem
 *     pede é membro da organização DO PEDIDO e monta a mensagem a partir do
 *     pedido gravado. Vale de qualquer navegador da organização.
 *
 * O navegador só sabe "configurado: sim/não" + campos que não são segredo
 * (`whatsapp_cloud_situacao`). Não existe mais fallback de build
 * (`VITE_WA_ACCESS_TOKEN`): variável `VITE_*` vai inteira para o bundle público.
 */
import { supabase } from '../lib/supabase';
import { TEMPLATE_PEDIDO_PADRAO } from '../utils/whatsappPedido';

/** Template sugerido no formulário de configuração. O nome é por organização
 *  (cada conta WhatsApp Business aprova os seus); o valor do build só preenche. */
export const TEMPLATE_PEDIDO_SUGERIDO: string =
    import.meta.env.VITE_WA_TEMPLATE_ORDER_SENT || TEMPLATE_PEDIDO_PADRAO;

/** O que a tela pode saber da configuração de uma organização — nunca o token. */
export interface SituacaoWhatsapp {
    organizationId: string;
    configurado: boolean;
    phoneNumberId: string | null;
    numeroExibicao: string | null;
    nomeVerificado: string | null;
    templatePedido: string | null;
    tokenAtualizadoEm: string | null;
    tokenAtualizadoPor: string | null;
    /** Proprietário/administrador da organização — a mesma regra da Edge Function. */
    podeConfigurar: boolean;
}

interface LinhaSituacao {
    organization_id: string;
    configurado: boolean | null;
    phone_number_id: string | null;
    numero_exibicao: string | null;
    nome_verificado: string | null;
    template_pedido: string | null;
    token_atualizado_em: string | null;
    token_atualizado_por: string | null;
    pode_configurar: boolean | null;
}

export interface SalvarWhatsappInput {
    organizationId: string;
    phoneNumberId: string;
    /** Vazio = mantém o token já guardado (troca só número/template). */
    token?: string;
    templatePedido?: string;
}

/** Mensagem real de uma Edge Function que respondeu não-2xx (corpo `{ error }`). */
async function invocar<T>(acao: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('whatsapp-cloud', { body: { acao, ...body } });
    if (error) {
        let detalhe = '';
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
            try { detalhe = (await ctx.json())?.error ?? ''; } catch { /* corpo não-JSON */ }
        }
        throw new Error(detalhe || error.message);
    }
    if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
    return data as T;
}

export const whatsappService = {
    /** Uma linha por organização de que o usuário é membro. */
    async situacao(): Promise<SituacaoWhatsapp[]> {
        const { data, error } = await supabase.rpc('whatsapp_cloud_situacao');
        if (error) throw error;
        return ((data ?? []) as LinhaSituacao[]).map(l => ({
            organizationId: l.organization_id,
            configurado: !!l.configurado,
            phoneNumberId: l.phone_number_id,
            numeroExibicao: l.numero_exibicao,
            nomeVerificado: l.nome_verificado,
            templatePedido: l.template_pedido,
            tokenAtualizadoEm: l.token_atualizado_em,
            tokenAtualizadoPor: l.token_atualizado_por,
            podeConfigurar: !!l.pode_configurar,
        }));
    },

    /**
     * A organização tem o envio pela API oficial ligado? Não é leitura de tela: é
     * "manda ou não manda". Sem organização, ou com erro de leitura, não manda.
     */
    async apiAtivaNaOrg(organizationId: string | null | undefined): Promise<boolean> {
        try {
            const lista = organizationId ? await this.situacao() : [];
            return lista.some(s => s.organizationId === organizationId && s.configurado);
        } catch {
            return false;
        }
    },

    /** Idem, pela organização do pedido (quem vê o pedido tem a leitura dele). */
    async apiAtivaNoPedido(orderId: string): Promise<boolean> {
        const { data } = await supabase
            .from('purchase_orders')
            .select('organization_id')
            .eq('id', orderId)
            .maybeSingle();
        return this.apiAtivaNaOrg((data as { organization_id?: string | null } | null)?.organization_id);
    },

    /** Só gestor (a function confere). Testa o token na Meta antes de guardar. */
    async salvar(input: SalvarWhatsappInput): Promise<{ numeroExibicao: string | null; nomeVerificado: string | null }> {
        const r = await invocar<{ numero_exibicao: string | null; nome_verificado: string | null }>('salvar', {
            organization_id: input.organizationId,
            phone_number_id: input.phoneNumberId.trim(),
            token: (input.token ?? '').trim() || undefined,
            template_pedido: (input.templatePedido ?? '').trim() || undefined,
        });
        return { numeroExibicao: r?.numero_exibicao ?? null, nomeVerificado: r?.nome_verificado ?? null };
    },

    /** Só gestor. Apaga a configuração e o token guardado. */
    async remover(organizationId: string): Promise<void> {
        await invocar('remover', { organization_id: organizationId });
    },

    /**
     * Envia ao fornecedor o template de "pedido enviado", com link público novo.
     * Quem monta a mensagem e escolhe o telefone é o servidor, a partir do pedido.
     */
    async enviarPedido(orderId: string): Promise<{ para: string }> {
        return invocar<{ para: string }>('enviar_pedido', { order_id: orderId });
    },
};
