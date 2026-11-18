/**
 * Limpeza do token do WhatsApp que ficava no localStorage (achado F75, 18/11/2026).
 *
 * Até 18/11/2026 a tela Configurações › WhatsApp gravava o token permanente da
 * Meta em `localStorage['whatsapp_config']`, em texto puro: sobrevivia ao "Sair",
 * voltava preenchido (com botão de revelar) para o próximo usuário do navegador
 * e valia para todas as organizações. Hoje o token mora no Vault, por
 * organização, e só a Edge Function `whatsapp-cloud` o lê.
 *
 * No boot (`index.tsx`) a chave antiga é APAGADA — e nada do conteúdo dela vai a
 * lugar nenhum: nem para o servidor, nem para log, nem para outra chave. Não dá
 * para migrar sozinho (o servidor não lê o navegador, e mandar o token de um
 * navegador para uma organização seria adivinhar de qual organização ele era).
 *
 * O que sobra é só um AVISO, sem dado nenhum: "este navegador tinha um token".
 * A tela de configuração mostra o aviso para o gestor recadastrar uma vez, e o
 * pedido marcado como Enviado avisa que o WhatsApp automático não saiu.
 */

/** Chave antiga — `{ phoneNumberId, accessToken }` em JSON. Nunca mais é gravada. */
export const CHAVE_TOKEN_LEGADO = 'whatsapp_config';

/** Só a data em que o token antigo foi apagado. Sem prefixo `orca_`/`sb-` de propósito: precisa
 *  sobreviver ao "Sair" até um gestor (que pode entrar depois) ver o aviso. */
export const CHAVE_AVISO_TOKEN_LEGADO = 'whatsapp_token_local_removido';

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function armazenamentoPadrao(): Armazenamento | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null; // navegação privada com storage bloqueado
    }
}

/**
 * Apaga o token antigo, se houver. Devolve `true` quando apagou algo.
 * Registra o aviso só se havia um token de verdade (não um objeto vazio).
 */
export function limparTokenWhatsappLegado(armazenamento: Armazenamento | null = armazenamentoPadrao()): boolean {
    if (!armazenamento) return false;
    let bruto: string | null = null;
    try {
        bruto = armazenamento.getItem(CHAVE_TOKEN_LEGADO);
    } catch {
        return false;
    }
    if (bruto === null) return false;

    let tinhaToken = false;
    try {
        const valor = JSON.parse(bruto) as { accessToken?: unknown } | null;
        tinhaToken = typeof valor?.accessToken === 'string' && valor.accessToken.trim() !== '';
    } catch {
        tinhaToken = bruto.trim() !== ''; // ilegível: apaga do mesmo jeito, e avisa
    }

    try {
        armazenamento.removeItem(CHAVE_TOKEN_LEGADO);
    } catch {
        return false;
    }
    if (tinhaToken) {
        try {
            armazenamento.setItem(CHAVE_AVISO_TOKEN_LEGADO, new Date().toISOString());
        } catch { /* sem aviso, mas o token já saiu */ }
    }
    return true;
}

/** Data (ISO) em que um token antigo foi apagado deste navegador, ou null. */
export function avisoDeTokenLegado(armazenamento: Armazenamento | null = armazenamentoPadrao()): string | null {
    try {
        return armazenamento?.getItem(CHAVE_AVISO_TOKEN_LEGADO) ?? null;
    } catch {
        return null;
    }
}

export function descartarAvisoDeTokenLegado(armazenamento: Armazenamento | null = armazenamentoPadrao()): void {
    try {
        armazenamento?.removeItem(CHAVE_AVISO_TOKEN_LEGADO);
    } catch { /* nada a fazer */ }
}
