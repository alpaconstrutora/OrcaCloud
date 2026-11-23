/**
 * Por onde o pedido vai ao fornecedor pelo WhatsApp, e como a tela lê o envio.
 * Piloto WhatsApp pelo OpenWA (23/11/2026), Tarefa 7.
 * Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §4 › Pedido).
 *
 * Regras puras (a tela e o orderService só consultam):
 *   · `escolherCanalDoPedido` — o botão do WhatsApp no pedido;
 *   · `rotuloDaEntrega` / `entregaDoLog` / `rotuloDoLogWhatsapp` — a linha de
 *     WhatsApp no Histórico de Notificações (aba Comunicação);
 *   · `ultimaDoFornecedorPeloWhatsapp` — a caixa "Enviar também pelo WhatsApp" do chat;
 *   · `avisoDoEnvioAutomatico` — o aviso ao marcar Enviado.
 *
 * Quem libera o envio é o banco (`wa_pode_usar`, `wa_uso_por_org`) e a Edge
 * Function `whatsapp-openwa`: a tela só escolhe o caminho e explica.
 */
import type { StatusSaida } from './whatsappOpenwa';
import { MOTIVO_SEM_WHATSAPP_EMPRESA } from './permissaoWhatsappEmpresa';

export type CanalDoPedido =
    | { tipo: 'openwa' }
    | { tipo: 'api_oficial' }
    | { tipo: 'whatsapp_pessoal'; dica?: string }
    | { tipo: 'sem_telefone' };

export const DICA_NUMERO_DESCONECTADO =
    'O número do ÒPURA está desconectado (falta ler o QR no painel do OpenWA na máquina). Enquanto isso, o envio é pelo seu WhatsApp.';

/**
 * Ordem das decisões:
 *   1. org NÃO usa o OpenWA → API oficial se ativa; senão o WhatsApp de quem
 *      clica (plano B de hoje, sem dica) — nada muda para ela;
 *   2. usa, mas o usuário não tem "Usar o WhatsApp da empresa" → API oficial se
 *      ativa (ninguém perde o que tem hoje); senão WhatsApp pessoal COM a dica
 *      da permissão;
 *   3. usa e pode, número no ar ou máquina fora (a fila espera, nada se perde)
 *      → `openwa` se o fornecedor tem telefone, senão `sem_telefone`;
 *   4. usa e pode, mas o NÚMERO caiu (desconectado/QR/erro com o worker vivo):
 *      a mensagem só sairia depois de alguém ler o QR → API oficial se ativa;
 *      senão pessoal com a dica do número desconectado.
 */
export function escolherCanalDoPedido(a: {
    orgUsaOpenwa: boolean;
    conexaoConectadaOuFora: boolean;
    podeUsar: boolean;
    apiOficialAtiva: boolean;
    fornecedorTemTelefone: boolean;
}): CanalDoPedido {
    if (!a.orgUsaOpenwa) return a.apiOficialAtiva ? { tipo: 'api_oficial' } : { tipo: 'whatsapp_pessoal' };
    if (!a.podeUsar) {
        return a.apiOficialAtiva ? { tipo: 'api_oficial' } : { tipo: 'whatsapp_pessoal', dica: MOTIVO_SEM_WHATSAPP_EMPRESA };
    }
    if (a.conexaoConectadaOuFora) return a.fornecedorTemTelefone ? { tipo: 'openwa' } : { tipo: 'sem_telefone' };
    return a.apiOficialAtiva ? { tipo: 'api_oficial' } : { tipo: 'whatsapp_pessoal', dica: DICA_NUMERO_DESCONECTADO };
}

/** Sem "estou vivo" do worker há mais que isto = máquina fora (mesma conta da tela de Configurações). */
export const SEM_SINAL_DO_WORKER_MS = 3 * 60 * 1000;

/**
 * A conexão aceita um envio agora? Sim quando o número está conectado ou quando
 * a MÁQUINA está fora (estado gravado `maquina_fora`, ou sem sinal do worker há
 * mais de 3 min — aí o estado gravado é velho e não se sabe do número): o envio
 * espera na fila e sai quando ela voltar. Não quando o worker está vivo e diz
 * que o número caiu (desconectado, lendo QR, erro). Sem conexão nenhuma: não.
 */
export function conexaoAceitaEnvio(
    s: { estado: string | null; vistoEm: string | null } | null | undefined,
    agoraMs: number,
): boolean {
    if (!s || !s.estado) return false;
    if (s.estado === 'conectado' || s.estado === 'maquina_fora') return true;
    const visto = s.vistoEm ? Date.parse(s.vistoEm) : NaN;
    if (!Number.isFinite(visto)) return true;
    return agoraMs - visto > SEM_SINAL_DO_WORKER_MS;
}

/**
 * Rótulo de uma mensagem de saída:
 *   pendente | enviando → 'Na fila'      aceita  → 'Enviada'
 *   entregue → 'Entregue'                lida    → 'Lida'
 *   falhou   → 'Falhou'                  incerta → 'Confirmação pendente'
 *   cancelada → 'Cancelada'
 * `confirmacaoPendente` só pesa enquanto a mensagem não tem desfecho (na fila /
 * incerta): um desfecho (enviada, entregue, lida, falhou) vence uma marca de
 * confirmação que ficou para trás.
 */
export function rotuloDaEntrega(status: StatusSaida, confirmacaoPendente: boolean): string {
    switch (status) {
        case 'pendente':
        case 'enviando':
            return confirmacaoPendente ? 'Confirmação pendente' : 'Na fila';
        case 'incerta':
            return 'Confirmação pendente';
        case 'aceita':
            return 'Enviada';
        case 'entregue':
            return 'Entregue';
        case 'lida':
            return 'Lida';
        case 'falhou':
            return 'Falhou';
        case 'cancelada':
            return 'Cancelada';
    }
}

/**
 * O que a tela tem é a linha do `notification_log`, não a da fila. Tradução:
 *   pending → 'pendente', com `confirmacaoPendente` = `metadata.confirmacao` presente;
 *   sent    → `metadata.entrega` ('entregue' | 'lida') ou 'aceita';
 *   failed  → 'falhou'.
 * `metadata.confirmacao` só conta com o log em `pending`: o espelho do ack pode
 * deixar uma marca velha num log que já virou `sent` (achado da Tarefa 4).
 * Sem `metadata` (visão do fornecedor), sent = 'aceita'.
 */
export function entregaDoLog(log: { status: string; metadata?: Record<string, unknown> | null }): {
    status: StatusSaida;
    confirmacaoPendente: boolean;
} {
    const m = log.metadata ?? {};
    if (log.status === 'sent') {
        const entrega = m.entrega;
        return { status: entrega === 'lida' || entrega === 'entregue' ? entrega : 'aceita', confirmacaoPendente: false };
    }
    if (log.status === 'failed') return { status: 'falhou', confirmacaoPendente: false };
    return { status: 'pendente', confirmacaoPendente: m.confirmacao !== undefined && m.confirmacao !== null };
}

export function rotuloDoLogWhatsapp(log: { status: string; metadata?: Record<string, unknown> | null }): string {
    const e = entregaDoLog(log);
    return rotuloDaEntrega(e.status, e.confirmacaoPendente);
}

/** A última mensagem do FORNECEDOR no chat veio pelo WhatsApp? (caixa já marcada) */
export function ultimaDoFornecedorPeloWhatsapp(mensagens: { senderRole: string; canal?: string | null }[]): boolean {
    for (let i = mensagens.length - 1; i >= 0; i--) {
        if (mensagens[i].senderRole === 'supplier') return mensagens[i].canal === 'whatsapp';
    }
    return false;
}

/** Aviso ao usuário depois do envio automático (marcar Enviado). O pedido já está salvo. */
export function avisoDoEnvioAutomatico(
    r: { ok: true } | { ok: false; codigo: string | null; mensagem: string },
): string {
    if (r.ok) return 'Pedido marcado como Enviado. A mensagem ao fornecedor está na fila do WhatsApp do ÒPURA.';
    if (r.codigo === 'sem_telefone') {
        return 'Pedido marcado como Enviado, mas o WhatsApp não saiu: fornecedor sem telefone cadastrado. Adicione o telefone em Minha organização › Fornecedores e envie pelo botão do WhatsApp.';
    }
    return `Pedido marcado como Enviado, mas o WhatsApp não entrou na fila: ${r.mensagem}`;
}
