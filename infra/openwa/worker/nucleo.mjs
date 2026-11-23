// Núcleo puro do worker do OpenWA — sem rede, sem relógio, sem process.
// Testado em __tests__/openwaWorkerNucleo.test.ts (Vitest importa este .mjs).
//
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Task 9).
// Contrato com o OpenWA (v0.31.0, docs/06 §6.4): o `:sessionId` das rotas é o ID
// da sessão (UUID dado pelo POST /api/sessions), NÃO o nome — por isso o worker
// acha o id pelo nome (`idDaSessaoPorNome`) antes de enviar.

/** Base do OpenWA na rede do Compose (nome do serviço). Nunca exposto fora da máquina. */
export const OPENWA_BASE_PADRAO = 'http://openwa:2785';

/** Códigos de erro de rede em que o pedido NÃO chegou ao OpenWA → seguro repetir. */
const NAO_CHEGOU = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

/**
 * Item da fila (`pegar`) → requisição do send-text do OpenWA.
 * `Idempotency-Key` = comando_id: retentativa do mesmo comando (até 24 h) não manda
 * duas vezes. `linkPreview: false`: no Baileys o preview faria o gateway buscar a
 * página antes de enviar; mensagem de pedido não precisa.
 */
export function requisicaoDeEnvio(item, sessao, chaveApi, base = OPENWA_BASE_PADRAO) {
    const raiz = String(base).replace(/\/+$/, '');
    return {
        url: `${raiz}/api/sessions/${encodeURIComponent(sessao)}/messages/send-text`,
        headers: {
            'X-API-Key': chaveApi,
            'Idempotency-Key': item.comando_id,
            'Content-Type': 'application/json',
        },
        corpo: { chatId: item.chat_id, text: item.texto, linkPreview: false },
    };
}

/** Código de erro de rede do Node: no próprio erro ou na `cause` (o fetch embrulha). */
function codigoDoErro(erro) {
    if (!erro || typeof erro !== 'object') return null;
    if (typeof erro.code === 'string') return erro.code;
    const causa = erro.cause;
    if (causa && typeof causa === 'object' && typeof causa.code === 'string') return causa.code;
    return null;
}

/**
 * Desfecho de um envio → item de `reportar.resultados` (sem o id).
 *   · erro de rede em que o pedido não saiu (ECONNREFUSED, nome que não resolve) → `recusada`;
 *   · abort do nosso timeout (AbortError/TimeoutError) → `timeout`;
 *   · qualquer outro erro de rede (ex.: ECONNRESET no meio) → sem status e sem erro:
 *     pode ter saído — a Edge Function marca incerta, nunca repete às cegas;
 *   · resposta HTTP → o status; `messageId` só em 2xx com o campo do OpenWA.
 * Quem decide aceita/repetir/falhou/incerta é a Edge Function (planoDoReporte).
 */
export function resultadoDoEnvio({ status = null, corpo = null, erro = null } = {}) {
    if (erro) {
        const nome = erro && typeof erro === 'object' ? erro.name : null;
        if (nome === 'AbortError' || nome === 'TimeoutError') {
            return { httpStatus: null, erro: 'timeout', messageId: null };
        }
        if (NAO_CHEGOU.has(codigoDoErro(erro))) {
            return { httpStatus: null, erro: 'recusada', messageId: null };
        }
        return { httpStatus: null, erro: null, messageId: null };
    }
    const httpStatus = Number.isInteger(status) ? status : null;
    const ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
    const mid = ok && corpo && typeof corpo === 'object' && typeof corpo.messageId === 'string'
        ? corpo.messageId.trim()
        : '';
    return { httpStatus, erro: null, messageId: mid || null };
}

/**
 * Junta campainha + varredura num só fluxo de ciclos:
 *   · nunca dois ciclos ao mesmo tempo;
 *   · toque(s) durante um ciclo → exatamente UM ciclo a mais depois dele;
 *   · ciclo que devolve 'de_novo' (fila veio cheia) → roda outra vez;
 *   · ciclo que lança → `aoFalhar(erro)` e o coalescedor segue livre.
 * `tocar()` devolve a promessa do laço em curso (termina quando não há mais ciclo a rodar).
 */
export function criarCoalescedor(ciclo, aoFalhar = () => {}) {
    let atual = null;
    let deNovo = false;

    async function laco() {
        try {
            do {
                deNovo = false;
                let r;
                try {
                    r = await ciclo();
                } catch (e) {
                    try { aoFalhar(e); } catch { /* o log não derruba o laço */ }
                }
                if (r === 'de_novo') deNovo = true;
            } while (deNovo);
        } finally {
            atual = null;
        }
    }

    return {
        tocar() {
            if (atual) {
                deNovo = true;
                return atual;
            }
            atual = laco();
            return atual;
        },
        rodando: () => atual !== null,
    };
}

/** Lista do GET /api/sessions?name=… → id da sessão com esse nome exato (ou null). */
export function idDaSessaoPorNome(lista, nome) {
    if (!Array.isArray(lista)) return null;
    const s = lista.find((x) => x && typeof x === 'object' && x.name === nome && typeof x.id === 'string' && x.id);
    return s ? s.id : null;
}

/**
 * GET /api/sessions/:id → o que vai no "estou vivo": `estado_bruto` = `status` do
 * OpenWA (created | initializing | qr_ready | authenticating | ready | disconnected |
 * action_required | failed) e `numero` = `phone` da conta pareada (só dígitos → "+…").
 */
export function leituraDaSessao(sessao) {
    if (!sessao || typeof sessao !== 'object') return { estado_bruto: null, numero: null };
    const estado = typeof sessao.status === 'string' && sessao.status.trim() ? sessao.status.trim() : null;
    const fone = typeof sessao.phone === 'string' ? sessao.phone.trim() : '';
    return { estado_bruto: estado, numero: /^\d{8,15}$/.test(fone) ? `+${fone}` : null };
}

/**
 * Só pega a fila com a sessão `ready`. Fora disso o send-text responde 400 ("session
 * not active") e a Edge Function trataria 4xx como falha definitiva — a mensagem
 * morreria por o celular estar desconectado. Melhor deixá-la pendente na fila.
 */
export function podeEnviar(status) {
    return status === 'ready';
}

/**
 * Evento de status da assinatura da campainha → o que fazer.
 *   · evento de um canal que NÃO é mais o atual → 'ignorar'. O removeChannel(velho) do
 *     realtime-js chama unsubscribe(), que dispara de novo o callback do canal velho com
 *     CLOSED; sem esta guarda ele re-armava a reassinatura, que derrubava o canal novo
 *     (sadio), e assim para sempre a cada 60 s;
 *   · parando → 'ignorar';
 *   · canal atual: SUBSCRIBED → 'assinada'; CLOSED de verdade → 'reassinar' (em 60 s);
 *     CHANNEL_ERROR / TIMED_OUT → 'avisar' (o realtime-js tenta de novo sozinho).
 */
export function eventoDaCampainha({ status, canal, canalAtual, parando }) {
    if (parando || !canalAtual || canal !== canalAtual) return 'ignorar';
    if (status === 'SUBSCRIBED') return 'assinada';
    if (status === 'CLOSED') return 'reassinar';
    return 'avisar';
}
