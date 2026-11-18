/**
 * WhatsApp Cloud API — regras puras do envio do pedido ao fornecedor.
 *
 * Roda nos dois lados: na Edge Function `whatsapp-cloud` (Deno, que é quem fala
 * com a Meta desde 18/11/2026 — achado F75) e nos testes/tela do app. Por isso
 * não importa nada além de utilitário puro.
 *
 * Até 18/11/2026 esta montagem morava em `services/whatsappService.ts` e rodava
 * no NAVEGADOR, com o token permanente da Meta lido do localStorage. O token foi
 * para o Vault, por organização; o navegador agora só pede "envie o pedido X".
 */

/** Template aprovado na Meta para "pedido enviado" quando a organização não escolheu outro. */
export const TEMPLATE_PEDIDO_PADRAO = 'opura_pedido_enviado';

/** Versão da Graph API usada desde a primeira integração (2026-05). */
export const GRAPH_API_VERSAO_PADRAO = 'v20.0';

/** Phone Number ID da Meta: só dígitos (é o id do número, não o telefone). */
export function phoneNumberIdValido(valor: string | null | undefined): boolean {
    return /^[0-9]{5,30}$/.test((valor ?? '').trim());
}

/** Nome de template da Meta: minúsculas, dígitos e `_`, até 512. */
export function nomeDeTemplateValido(valor: string | null | undefined): boolean {
    return /^[a-z0-9_]{1,512}$/.test((valor ?? '').trim());
}

/**
 * Telefone no formato que a Cloud API espera: E.164 sem `+` (ex.: 5511999999999).
 * Sem DDI (até 11 dígitos) assume Brasil. Sem dígito nenhum → '' (quem chama
 * trata como "sem telefone").
 */
export function normalizarTelefoneWhatsapp(telefone: string | null | undefined): string {
    const digitos = (telefone ?? '').replace(/\D/g, '');
    if (!digitos) return '';
    const semZero = digitos.startsWith('0') ? digitos.slice(1) : digitos;
    if (semZero.length >= 12) return semZero;
    return `55${semZero}`;
}

/** `2026-11-20` → `20/11/2026`. Sem data (ou data ilegível) → "A definir". */
export function formatarDataDeEntrega(data: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((data ?? '').trim());
    if (!m) return 'A definir';
    return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatarValorBRL(valor: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(valor) ? valor : 0);
}

export interface DadosDoPedidoParaWhatsapp {
    /** Telefone já normalizado (`normalizarTelefoneWhatsapp`). */
    para: string;
    template: string;
    fornecedor: string;
    numeroDoPedido: string;
    obra: string;
    quantidadeDeItens: number;
    total: number;
    dataDeEntrega?: string | null;
    /** Vai no botão de URL do template (o link público do pedido). */
    shareToken: string;
}

/**
 * Corpo do POST `/{phone-number-id}/messages`. A ordem dos parâmetros é a do
 * template aprovado na Meta (`opura_pedido_enviado`): fornecedor, número, obra,
 * itens, total, entrega — e o share token no botão de URL.
 */
export function montarMensagemDoPedido(d: DadosDoPedidoParaWhatsapp) {
    // A Meta recusa parâmetro de texto vazio — cada um tem um valor de reserva.
    const texto = (v: string | null | undefined, reserva: string) => {
        const t = (v ?? '').trim();
        return t || reserva;
    };
    return {
        messaging_product: 'whatsapp',
        to: d.para,
        type: 'template',
        template: {
            name: d.template,
            language: { code: 'pt_BR' },
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: texto(d.fornecedor, 'Fornecedor') },
                        { type: 'text', text: texto(d.numeroDoPedido, '—') },
                        { type: 'text', text: texto(d.obra, 'Obra') },
                        { type: 'text', text: String(d.quantidadeDeItens) },
                        { type: 'text', text: formatarValorBRL(d.total) },
                        { type: 'text', text: formatarDataDeEntrega(d.dataDeEntrega) },
                    ],
                },
                {
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [{ type: 'text', text: d.shareToken }],
                },
            ],
        },
    };
}
