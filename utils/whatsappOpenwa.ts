import { normalizarTelefoneWhatsapp, formatarValorBRL, formatarDataDeEntrega } from './whatsappPedido.ts'; // .ts: também roda no Deno (Edge Functions)

/**
 * WhatsApp pelo OpenWA — regras puras do envio do pedido ao fornecedor.
 *
 * Roda nos dois lados: nas Edge Functions `whatsapp-openwa`,
 * `whatsapp-openwa-worker` e `whatsapp-openwa-webhook` (Deno, importam por
 * `../../../utils/whatsappOpenwa.ts`) e nos testes/tela do app. Por isso não
 * usa `Deno.*` nem API só do Node: o HMAC vai por `globalThis.crypto.subtle`.
 *
 * O número do OpenWA é UM só, compartilhado por todas as organizações. Daí
 * duas regras que moram aqui e não podem ser decididas em cada ponta:
 *   · a mensagem sempre diz de qual empresa é o pedido (primeira linha);
 *   · a resposta do fornecedor só é vinculada a um pedido quando a organização
 *     é certa (citação, ou uma só organização falou com aquele telefone) —
 *     nunca por palpite, que vazaria a mensagem de uma empresa para outra.
 *
 * Retentativa: o OpenWA guarda o `Idempotency-Key` por 24 h. Todo envio leva o
 * `comando_id` como chave, então repetir dentro de 23 h é seguro; passou disso,
 * a mensagem fica "incerta" e só sai de novo por um reenvio consciente na tela.
 */

/** Status de uma mensagem de saída em `wa_mensagens`. */
export type StatusSaida = 'pendente' | 'enviando' | 'aceita' | 'entregue' | 'lida' | 'falhou' | 'incerta' | 'cancelada';

export interface DadosTextoPedido {
    /** Nome da organização DONA do pedido — o número é de todas as empresas. */
    empresa: string;
    fornecedor: string;
    numero: string;
    obra: string;
    quantidadeDeItens: number;
    total: number;
    dataDeEntrega: string | null;
    /** Link público do pedido (share token). */
    link: string;
}

/** Campo numa linha só (sem quebra que crie linha falsa na mensagem); vazio → reserva. */
function campo(valor: string | null | undefined, reserva = '—'): string {
    const t = (valor ?? '').replace(/\s+/g, ' ').trim();
    return t || reserva;
}

/**
 * Texto livre do pedido (o OpenWA não usa template da Meta). Montado no
 * servidor a partir do pedido gravado — o navegador não escolhe texto.
 */
export function montarTextoDoPedido(d: DadosTextoPedido): string {
    return [
        `*${campo(d.empresa)}* — Pedido de compra nº ${campo(d.numero)}`,
        '',
        `Fornecedor: ${campo(d.fornecedor)}`,
        `Obra: ${campo(d.obra)}`,
        `Itens: ${Number.isFinite(d.quantidadeDeItens) ? d.quantidadeDeItens : 0} · Total: ${formatarValorBRL(d.total)}`,
        `Entrega: ${formatarDataDeEntrega(d.dataDeEntrega)}`,
        '',
        `Ver o pedido completo: ${campo(d.link, '')}`,
    ].join('\n');
}

/** Telefone → chatId do OpenWA (`5511999990000@c.us`). `''` = sem telefone. */
export function chatIdDoTelefone(telefone: string | null | undefined): string {
    const numero = normalizarTelefoneWhatsapp(telefone);
    return numero ? `${numero}@c.us` : '';
}

/**
 * Chave de idempotência do envio automático ao marcar Enviado: uma por
 * transição (o `updated_at` do pedido no momento). Retentativa ou gatilho
 * repetido da mesma transição não duplica a mensagem.
 */
export function comandoIdEnvioAutomatico(orderId: string, atualizadoEm: string): string {
    return `pedido:${orderId}:enviado:${atualizadoEm}`;
}

/** `data.status` do evento `message.ack`/`message.failed` → status de saída. `null` = ignorar. */
export function statusDoAck(status: string): StatusSaida | null {
    switch ((status ?? '').trim().toLowerCase()) {
        case 'sent': return 'aceita';
        case 'delivered': return 'entregue';
        case 'read':
        case 'played': return 'lida';
        case 'failed': return 'falhou';
        default: return null;
    }
}

/**
 * Ordem do status: maior vence, evento atrasado não regride.
 * `falhou` fica acima de `aceita` (o gateway aceitou e o WhatsApp recusou
 * depois) mas abaixo de `entregue` (prova de que chegou vence a falha).
 * `incerta` fica abaixo de `aceita` (um ack posterior confirma o envio).
 * Voltar de `falhou`/`incerta` para `pendente` (reenviar) não passa por aqui:
 * é uma ação explícita, não um evento.
 */
const ORDEM_STATUS: Record<Exclude<StatusSaida, 'cancelada'>, number> = {
    pendente: 0, enviando: 1, incerta: 2, aceita: 3, falhou: 4, entregue: 5, lida: 6,
};

/** Aplica um status novo sem regredir. `cancelada` é final; só se cancela o que não saiu. */
export function avancarStatus(atual: StatusSaida, novo: StatusSaida): StatusSaida {
    if (atual === 'cancelada') return 'cancelada';
    if (novo === 'cancelada') {
        return atual === 'aceita' || atual === 'entregue' || atual === 'lida' ? atual : 'cancelada';
    }
    return ORDEM_STATUS[novo] > ORDEM_STATUS[atual] ? novo : atual;
}

export type Desfecho = 'aceita' | 'repetir' | 'falhou' | 'incerta';

/** Até quando repetir com a mesma chave: o OpenWA guarda a chave por 24 h; folga de 1 h. */
const LIMITE_REPETIR_MS = 23 * 3600_000;

/**
 * Resultado de uma tentativa de envio → o que fazer.
 *   · 2xx → aceita.
 *   · Passageiro (sem conexão, timeout, 408/409/425/429, 5xx menos 501) →
 *     repetir com a mesma chave enquanto o comando tem até 23 h; depois →
 *     incerta (pode ter saído; sem reenvio automático).
 *   · Demais 4xx e 501 → falhou (o gateway recusou; repetir não muda nada).
 *   · Sem resposta e sem erro conhecido → incerta.
 */
export function classificarEnvio(
    r: { httpStatus: number | null; erro: 'recusada' | 'timeout' | null },
    idadeDoComandoMs: number,
): Desfecho {
    // Idade ilegível (NaN/Infinity) falha fechado: incerta, nunca repetir sem saber.
    const repetirOuIncerta = (): Desfecho => (!(idadeDoComandoMs <= LIMITE_REPETIR_MS) ? 'incerta' : 'repetir');
    if (r.erro === 'recusada' || r.erro === 'timeout') return repetirOuIncerta();
    const s = r.httpStatus;
    if (s === null || !Number.isFinite(s)) return 'incerta';
    if (s >= 200 && s < 300) return 'aceita';
    if (s === 408 || s === 409 || s === 425 || s === 429) return repetirOuIncerta();
    if (s === 501) return 'falhou';
    if (s >= 500 && s < 600) return repetirOuIncerta();
    if (s >= 400 && s < 500) return 'falhou';
    return 'incerta';
}

/** Espera antes da próxima tentativa, pela quantidade de falhas já tidas. */
export const ESPERAS_MS: readonly number[] = Object.freeze([30e3, 60e3, 120e3, 300e3, 600e3, 1800e3]);

/** `tentativas` = falhas já registradas. `null` = desistir. */
export function esperaAposFalha(tentativas: number): number | null {
    const i = Math.max(0, Math.floor(Number.isFinite(tentativas) ? tentativas : 0));
    return i < ESPERAS_MS.length ? ESPERAS_MS[i] : null;
}

/** Estado normalizado de `wa_conexoes.estado` (o que a tela mostra). */
export type EstadoConexao = 'maquina_fora' | 'desconectado' | 'aguardando_qr' | 'conectado' | 'erro';

/**
 * Estado bruto da sessão no OpenWA (o worker manda no "estou vivo") → estado
 * normalizado. Desconhecido ou ausente → `desconectado`: nunca dizer
 * "conectado" sem o OpenWA ter dito `ready`. (`maquina_fora` não vem daqui: é a
 * falta de "estou vivo" há 3 min, conferida na tela.)
 */
export function estadoDaConexao(estadoBruto: unknown): EstadoConexao {
    switch (typeof estadoBruto === 'string' ? estadoBruto.trim().toLowerCase() : '') {
        case 'ready': return 'conectado';
        case 'qr_ready':
        case 'authenticating': return 'aguardando_qr';
        case 'failed': return 'erro';
        default: return 'desconectado'; // disconnected, action_required e o que não se conhece
    }
}

/** Resultado de um envio, como o worker informa em `reportar`. */
export interface ResultadoDoWorker {
    id: string;
    httpStatus: number | null;
    erro: 'recusada' | 'timeout' | null;
    messageId: string | null;
    /** `code` do corpo de erro do OpenWA (ex.: `SEND_PACING_LIMITED`); null sem corpo ou sem code. */
    codigo: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_ID_MAX = 300;
/** Formato do `code` de erro do OpenWA que a function aceita (o worker filtra igual). */
const CODIGO_OPENWA_RE = /^[A-Z0-9_]{1,64}$/;

/**
 * Valida um item de `reportar.resultados`. Fora do formato → `null` (a function não aplica).
 * `codigo` é opcional e não derruba o relato: fora de `[A-Z0-9_]{1,64}` vira null (o
 * status HTTP continua valendo e a regra comum, mais conservadora, decide).
 */
export function lerResultadoDoWorker(v: unknown): ResultadoDoWorker | null {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || !UUID_RE.test(o.id)) return null;

    const s = o.httpStatus ?? null;
    if (s !== null && !(typeof s === 'number' && Number.isInteger(s) && s >= 100 && s <= 599)) return null;

    const erro = o.erro ?? null;
    if (erro !== null && erro !== 'recusada' && erro !== 'timeout') return null;

    const mid = o.messageId ?? null;
    if (mid !== null && typeof mid !== 'string') return null;
    const messageId = typeof mid === 'string' ? mid.trim() : '';
    if (messageId.length > MESSAGE_ID_MAX) return null;

    const codigo = typeof o.codigo === 'string' && CODIGO_OPENWA_RE.test(o.codigo) ? o.codigo : null;

    return {
        id: o.id, httpStatus: s as number | null, erro: erro as ResultadoDoWorker['erro'], messageId: messageId || null, codigo,
    };
}

/** O que aconteceu na tentativa, em português, para `wa_mensagens.erro` e o log. */
function descreverTentativa(r: { httpStatus: number | null; erro: 'recusada' | 'timeout' | null }): string {
    if (r.erro === 'recusada') return 'o OpenWA não atendeu (conexão recusada na máquina)';
    if (r.erro === 'timeout') return 'o OpenWA não respondeu a tempo';
    if (r.httpStatus === null) return 'o OpenWA não deu resposta';
    return `o OpenWA respondeu HTTP ${r.httpStatus}`;
}

export type PlanoDoReporte =
    | { tipo: 'ignorar' }
    | { tipo: 'aceita'; status: 'aceita'; providerMessageId: string | null }
    | {
        tipo: 'repetir'; status: 'pendente'; proximaTentativaEm: string; erro: string;
        /** Quando vem: gravar em `tentativas` (o 429 de aquecimento devolve a tentativa da pega). */
        tentativas?: number;
    }
    | { tipo: 'falhou'; status: 'falhou'; erro: string }
    | { tipo: 'incerta'; status: 'incerta'; erro: string };

/** 429 do aquecimento do número (send pacing) — recusa ANTES de enviar. */
export const CODIGO_LIMITE_DE_AQUECIMENTO = 'SEND_PACING_LIMITED';
/** Espera depois de um 429 de aquecimento. */
export const ESPERA_LIMITE_DE_AQUECIMENTO_MS = 15 * 60_000;
/** Passado isso desde o comando, o 429 de aquecimento vira `falhou` (reenvio consciente na tela). */
const LIMITE_AQUECIMENTO_MS = 24 * 3600_000;

/**
 * Relato do worker sobre uma linha → o que gravar nela.
 *
 *   · Só vale para linha em `enviando` (a que foi pega): relato atrasado ou
 *     repetido de linha que já andou → `ignorar` (não regride status).
 *   · `tentativas` JÁ CONTA a tentativa atual (`wa_pegar_pendentes` soma 1 a
 *     cada pega). Falhas até aqui = `tentativas`, então a espera é
 *     `esperaAposFalha(tentativas - 1)`: a 1ª falha espera ESPERAS_MS[0] (30 s)
 *     e a N-ésima, ESPERAS_MS[N-1]. Sem espera (`null`) → `incerta`, não
 *     `falhou`: uma falha passageira (timeout, 503) pode ter saído.
 *   · Recusa definitiva do gateway (4xx, 501) → `falhou`, mesmo no limite.
 *   · 429 com `codigo` SEND_PACING_LIMITED (aquecimento do número): o OpenWA recusou
 *     ANTES de entregar ao WhatsApp e liberou a chave (docs/06, "Idempotent sends") —
 *     nada saiu. Repetir em 15 min SEM consumir tentativa: o plano devolve
 *     `tentativas - 1` (a pega já tinha somado 1), então esse 429 nunca leva a
 *     "esgotou as tentativas"/`incerta`, e uma linha que só levou 429 de aquecimento
 *     continua com `tentativas = 0` (o wa_pegar_pendentes não a confunde com uma que
 *     pode ter saído). Comando com mais de 24 h (ou idade ilegível) → `falhou`
 *     ("reenviar mais tarde"). Repetir depois de 23 h com a mesma chave só é seguro
 *     AQUI, porque o 429 de aquecimento garante que nada saiu. O 429 sem esse code
 *     (limitador global do OpenWA) segue a regra comum.
 */
export function planoDoReporte(
    linha: { status: StatusSaida; tentativas: number; criadoEm: string },
    r: { httpStatus: number | null; erro: 'recusada' | 'timeout' | null; messageId: string | null; codigo?: string | null },
    agoraMs: number,
): PlanoDoReporte {
    if (linha.status !== 'enviando') return { tipo: 'ignorar' };

    if (r.httpStatus === 429 && r.codigo === CODIGO_LIMITE_DE_AQUECIMENTO) {
        const idade = agoraMs - Date.parse(linha.criadoEm);
        if (!(idade <= LIMITE_AQUECIMENTO_MS)) {
            return {
                tipo: 'falhou', status: 'falhou',
                erro: 'O OpenWA segurou o envio por mais de 24 h: limite de aquecimento do número; reenviar mais tarde. '
                    + 'Nada saiu.',
            };
        }
        const tentativas = Number.isFinite(linha.tentativas) ? Math.max(0, Math.floor(linha.tentativas) - 1) : 0;
        return {
            tipo: 'repetir', status: 'pendente',
            proximaTentativaEm: new Date(agoraMs + ESPERA_LIMITE_DE_AQUECIMENTO_MS).toISOString(),
            erro: 'O OpenWA segurou o envio (limite de aquecimento do número); nada saiu. Nova tentativa em 15 min.',
            tentativas,
        };
    }

    const desfecho = classificarEnvio(r, agoraMs - Date.parse(linha.criadoEm));
    const oQue = descreverTentativa(r);
    switch (desfecho) {
        case 'aceita':
            return { tipo: 'aceita', status: 'aceita', providerMessageId: r.messageId };
        case 'falhou':
            return { tipo: 'falhou', status: 'falhou', erro: `O WhatsApp não aceitou a mensagem: ${oQue}.` };
        case 'repetir': {
            const espera = esperaAposFalha(linha.tentativas - 1);
            if (espera === null) {
                return {
                    tipo: 'incerta', status: 'incerta',
                    erro: `Confirmação pendente: esgotou as tentativas (${linha.tentativas}); na última, ${oQue}. `
                        + 'Pode ter saído — confira no celular do número antes de reenviar.',
                };
            }
            return {
                tipo: 'repetir', status: 'pendente',
                proximaTentativaEm: new Date(agoraMs + espera).toISOString(),
                erro: `Tentativa ${linha.tentativas} sem sucesso: ${oQue}. Nova tentativa em ${Math.round(espera / 1000)} s.`,
            };
        }
        default:
            return {
                tipo: 'incerta', status: 'incerta',
                erro: `Confirmação pendente: ${oQue}. Pode ter saído — confira no celular do número antes de reenviar.`,
            };
    }
}

export type EspelhoDoLog =
    | { acao: 'nada' }
    | { acao: 'sent'; waMessageId: string | null }
    | { acao: 'failed'; erro: string }
    | { acao: 'confirmacao_pendente'; erro: string };

/**
 * Reparo do `notification_log` a partir da mensagem da fila (varredura do
 * `vivo`). O espelho feito no `reportar` é best-effort e pode não achar o log
 * (a fila entra antes do log na whatsapp-openwa); esta regra conserta depois.
 *   · log que já saiu de `pending` → nada (nunca sobrescreve);
 *   · aceita/entregue/lida → `sent`; falhou → `failed` com o erro;
 *   · incerta → continua `pending` com confirmação pendente (uma vez só);
 *   · pendente/enviando/cancelada → nada.
 */
export function espelhoDoLog(
    msg: { status: StatusSaida; providerMessageId: string | null; erro: string | null },
    log: { status: string; metadata: Record<string, unknown> | null },
): EspelhoDoLog {
    if (log.status !== 'pending') return { acao: 'nada' };
    switch (msg.status) {
        case 'aceita':
        case 'entregue':
        case 'lida':
            return { acao: 'sent', waMessageId: msg.providerMessageId };
        case 'falhou':
            return { acao: 'failed', erro: msg.erro?.trim() || 'O WhatsApp não aceitou a mensagem.' };
        case 'incerta': {
            const marcada = log.metadata?.confirmacao !== undefined && log.metadata?.confirmacao !== null;
            if (marcada) return { acao: 'nada' };
            return {
                acao: 'confirmacao_pendente',
                erro: msg.erro?.trim() || 'Confirmação pendente: confira no celular do número antes de reenviar.',
            };
        }
        default:
            return { acao: 'nada' };
    }
}

/**
 * Confere `X-OpenWA-Signature: sha256=<hex>` — HMAC-SHA256 dos BYTES ORIGINAIS
 * do corpo (não do JSON reparseado) com o segredo da conexão. Comparação em
 * tempo constante. Qualquer coisa fora do formato → false.
 */
export async function assinaturaConfere(corpo: Uint8Array, cabecalho: string | null, segredo: string): Promise<boolean> {
    const prefixo = 'sha256=';
    const recebido = (cabecalho ?? '').trim();
    if (!segredo || !recebido.startsWith(prefixo)) return false;
    const hexRecebido = recebido.slice(prefixo.length).toLowerCase();
    try {
        const enc = new TextEncoder();
        const chave = await globalThis.crypto.subtle.importKey(
            'raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        // Cópia num ArrayBuffer próprio: `corpo` pode ser uma vista sobre um buffer maior.
        const assinatura = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', chave, new Uint8Array(corpo)));
        const esperado = Array.from(assinatura, (b) => b.toString(16).padStart(2, '0')).join('');
        if (hexRecebido.length !== esperado.length) return false;
        let diferenca = 0;
        for (let i = 0; i < esperado.length; i++) {
            diferenca |= esperado.charCodeAt(i) ^ hexRecebido.charCodeAt(i);
        }
        return diferenca === 0;
    } catch {
        return false;
    }
}

/**
 * Telefone de quem mandou (`message.received`), só dígitos com DDI.
 *   · `5511…@c.us` ou `5511…@s.whatsapp.net` (forma do Baileys) → o próprio número;
 *   · `…@lid` (id anônimo, sem telefone) → `senderPhone`, se o OpenWA resolveu
 *     (`RESOLVE_LID_TO_PHONE=true`);
 *   · grupo, lista de transmissão, canal ou sem telefone → `''`.
 */
export function telefoneDoRemetente(data: { from?: string; senderPhone?: string | null }): string {
    const from = (data.from ?? '').trim().toLowerCase();
    if (from.endsWith('@g.us') || from.endsWith('@broadcast') || from.endsWith('@newsletter')) return '';
    const digitos = (v: string) => v.split('@')[0].replace(/\D/g, '');
    if (from.endsWith('@c.us') || from.endsWith('@s.whatsapp.net')) return digitos(from);
    return digitos(data.senderPhone ?? '');
}

/**
 * O OpenWA às vezes manda o id serializado (`true_5511…@c.us_3EB0AB`, e em
 * grupo com `_<participante>` no fim) e às vezes só o id curto (`3EB0AB`).
 */
export function idCurtoDaMensagem(id: string): string {
    const t = (id ?? '').trim();
    const m = /^(?:true|false)_[^_]+_([^_]+)/.exec(t);
    return m ? m[1] : t;
}

export function idsDeMensagemIguais(a: string, b: string): boolean {
    const x = idCurtoDaMensagem(a);
    return x !== '' && x === idCurtoDaMensagem(b);
}

export interface Candidato {
    organizationId: string;
    orderId: string;
    providerMessageId: string | null;
    enviadoEm: string;
}

export type Vinculo = { tipo: 'citacao' | 'unico'; organizationId: string; orderId: string } | { tipo: 'sem_vinculo' };

/** Quantos dias para trás procurar pedidos enviados àquele telefone (quem chama filtra). */
export const JANELA_VINCULO_DIAS = 60;

/** Status de saída que podem receber a resposta (o fornecedor de fato recebeu a mensagem). */
export const STATUS_ALVO_DE_VINCULO: readonly StatusSaida[] = Object.freeze(['aceita', 'entregue', 'lida'] as StatusSaida[]);
/**
 * Status de saída que CONTAM a organização na regra "uma só organização":
 * também pendente/enviando/incerta — o fornecedor pode ter recebido (incerta) ou
 * estar para receber a mensagem de outra empresa; contar só as aceitas
 * vincularia a resposta dela a outra organização.
 */
export const STATUS_QUE_CONTAM_ORG: readonly StatusSaida[] = Object.freeze(
    ['pendente', 'enviando', 'incerta', 'aceita', 'entregue', 'lida'] as StatusSaida[],
);

/**
 * A qual pedido (e organização) pertence a resposta do fornecedor.
 * `candidatos` = mensagens de pedido enviadas àquele telefone dentro da janela.
 *   1. respondeu citando uma mensagem nossa → o pedido dela;
 *   2. senão, uma só organização na lista → o pedido mais recente dela;
 *   3. senão (nenhuma ou mais de uma) → sem vínculo (triagem do superadmin).
 * Citação que não casa com nenhum candidato → sem vínculo (não cai na regra 2).
 * `outrasOrgs` = organizações com saída àquele telefone na janela em status que
 * não é alvo de vínculo (pendente/enviando/incerta — STATUS_QUE_CONTAM_ORG):
 * não recebem a resposta, mas contam na regra 2 — uma segunda organização ali
 * → sem vínculo. A citação (regra 1) continua vencendo.
 */
export function escolherVinculo(candidatos: Candidato[], citadoId: string | null, outrasOrgs: Iterable<string> = []): Vinculo {
    if (citadoId) {
        const citado = candidatos.find((c) => c.providerMessageId && idsDeMensagemIguais(c.providerMessageId, citadoId));
        if (citado) return { tipo: 'citacao', organizationId: citado.organizationId, orderId: citado.orderId };
        // Citou algo que não está na lista (ex.: pedido de outra org fora da janela):
        // a resposta é sobre outra coisa — cair na regra 2 seria vincular por palpite.
        return { tipo: 'sem_vinculo' };
    }
    if (candidatos.length === 0) return { tipo: 'sem_vinculo' };
    const orgs = new Set(candidatos.map((c) => c.organizationId));
    for (const o of outrasOrgs) orgs.add(o);
    if (orgs.size !== 1) return { tipo: 'sem_vinculo' };
    const instante = (c: Candidato) => {
        const t = Date.parse(c.enviadoEm);
        return Number.isFinite(t) ? t : -Infinity;
    };
    const maisRecente = candidatos.reduce((a, b) => (instante(b) > instante(a) ? b : a));
    return { tipo: 'unico', organizationId: maisRecente.organizationId, orderId: maisRecente.orderId };
}

// ─── Webhook do OpenWA (whatsapp-openwa-webhook, Task 5) ──────────────────────

/** Corpo máximo aceito pelo webhook: a mídia inline vai até 5 MiB (~6,7 MiB em base64) + o envelope. */
export const CORPO_WEBHOOK_MAX_BYTES = 8 * 1024 * 1024;
/** Mídia inline gravada no bucket: até 5 MiB decodificada. */
export const MIDIA_MAX_BYTES = 5 * 1024 * 1024;
/** Texto recebido guardado e mostrado no chat (o resto é cortado). */
export const TEXTO_RECEBIDO_MAX = 4096;

/** Tipos de arquivo do fornecedor que vão para o bucket `whatsapp-midia` (o bucket tem a mesma lista). */
export const TIPOS_DE_MIDIA_ACEITOS: readonly string[] = Object.freeze([
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'video/mp4',
]);

const EXTENSAO_DO_TIPO: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4',
};

/** Uma linha só (sem quebra), aparada e cortada em `max`; vazio → ''. */
function umaLinha(v: unknown, max: number): string {
    return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Variantes de um telefone brasileiro por causa do nono dígito: o WhatsApp de
 * celular antigo ainda aparece com 8 dígitos (`55 DD NNNNNNNN`, 12 com DDI) e o
 * cadastro do fornecedor costuma ter 9 (`55 DD 9NNNNNNNN`, 13) — ou o contrário.
 * Só celular (primeiro dígito do número antigo 6–9): fixo (2–5) e celular novo
 * (9 seguido de 1–5) não têm a outra forma, e inventá-la poderia casar com o
 * número de outra pessoa. Primeiro sempre o próprio número.
 */
export function variantesDoTelefoneBR(digitos: string): string[] {
    const d = (digitos ?? '').replace(/\D/g, '');
    if (!d) return [];
    if (d.startsWith('55') && d.length === 12 && /[6-9]/.test(d[4])) return [d, `${d.slice(0, 4)}9${d.slice(4)}`];
    if (d.startsWith('55') && d.length === 13 && d[4] === '9' && /[6-9]/.test(d[5])) return [d, d.slice(0, 4) + d.slice(5)];
    return [d];
}

/** `audio/ogg; codecs=opus` → `audio/ogg`. Fora do formato tipo/subtipo → ''. */
export function normalizarMimetype(v: unknown): string {
    const t = (typeof v === 'string' ? v : '').split(';')[0].trim().toLowerCase();
    return t.length <= 100 && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(t) ? t : '';
}

/** Base64 sem o prefixo `data:…;base64,` e sem espaços. */
function base64Limpo(b64: string): string {
    return b64.replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, '');
}

/** Bytes que o base64 vira, sem decodificar. Vazio ou fora do alfabeto → null. */
export function tamanhoDoBase64(b64: unknown): number | null {
    if (typeof b64 !== 'string') return null;
    const s = base64Limpo(b64);
    if (!s || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
    const semPad = s.replace(/=+$/, '');
    if (semPad.length % 4 === 1) return null;
    return Math.floor((semPad.length * 3) / 4);
}

/**
 * Nome de arquivo seguro para o caminho no bucket: só o último pedaço (sem
 * pasta), sem a extensão do remetente (`Orcamento.pdf.exe` → `Orcamento_pdf`),
 * só `[A-Za-z0-9_-]`, e a extensão SEMPRE a do tipo (EXTENSAO_DO_TIPO) — o nome
 * escolhido por quem manda não decide como o arquivo abre. Até 100 caracteres.
 * Vazio → `arquivo.<extensão do tipo>`.
 */
export function nomeSeguroDoArquivo(nome: unknown, mimetype: string): string {
    const ext = EXTENSAO_DO_TIPO[mimetype] ?? 'bin';
    const ultimo = (typeof nome === 'string' ? nome : '').split(/[\\/]/).pop() ?? '';
    const semExtensao = ultimo.replace(/\.[^.]*$/, '');
    const base = semExtensao.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^[_-]+/, '');
    if (!base || !/[A-Za-z0-9]/.test(base)) return `arquivo.${ext}`;
    return `${base.slice(0, 100 - ext.length - 1)}.${ext}`;
}

function comeca(b: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
    if (b.length < deslocamento + assinatura.length) return false;
    return assinatura.every((v, i) => b[deslocamento + i] === v);
}

/**
 * O conteúdo bate com o tipo declarado? Confere a assinatura (magic bytes) do
 * começo do arquivo para cada tipo de TIPOS_DE_MIDIA_ACEITOS. Tipo fora da
 * lista → false. O mimetype quem escolhe é o remetente; o conteúdo, não.
 */
export function conteudoConfereComTipo(bytes: Uint8Array, mimetype: string): boolean {
    switch (mimetype) {
        case 'application/pdf': return comeca(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
        case 'image/jpeg': return comeca(bytes, [0xff, 0xd8, 0xff]);
        case 'image/png': return comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        case 'image/webp': // RIFF....WEBP
            return comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8);
        case 'audio/ogg': return comeca(bytes, [0x4f, 0x67, 0x67, 0x53]); // OggS
        case 'audio/mpeg': // ID3, ou direto no frame (sincronismo de 11 bits: FF Ex / FF Fx)
            return comeca(bytes, [0x49, 0x44, 0x33]) || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
        case 'video/mp4': return comeca(bytes, [0x66, 0x74, 0x79, 0x70], 4); // 'ftyp' no byte 4
        default: return false;
    }
}

/** Primeiros bytes (até 18) do base64, sem decodificar o resto. Ilegível → vazio. */
function primeirosBytesDoBase64(b64: string): Uint8Array {
    try {
        let pedaco = b64.slice(0, 24);
        if (pedaco.length % 4 !== 0) pedaco = pedaco.padEnd(pedaco.length + (4 - (pedaco.length % 4)), '=');
        const bin = globalThis.atob(pedaco);
        return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    } catch {
        return new Uint8Array(0);
    }
}

export type DecisaoDeMidia =
    | { acao: 'gravar'; mimetype: string; base64: string; bytes: number; nome: string }
    | { acao: 'grande'; mimetype: string }
    | { acao: 'tipo_nao_aceito'; mimetype: string }
    | { acao: 'indisponivel'; mimetype: string };

/**
 * `data.media` do `message.received` → o que fazer. O OpenWA não é alcançável
 * de fora (sem túnel), então não há como buscar depois o que não veio inline.
 *   · ausente → null;
 *   · tipo fora de TIPOS_DE_MIDIA_ACEITOS → tipo_nao_aceito (vem antes do tamanho);
 *   · `omitted` (acima do limite do OpenWA) ou acima de 5 MiB → grande;
 *   · sem dado ou base64 ilegível → indisponivel;
 *   · começo do arquivo não bate com o tipo (conteudoConfereComTipo) → tipo_nao_aceito;
 *   · senão → gravar.
 */
export function decidirMidia(media: unknown): DecisaoDeMidia | null {
    if (!media || typeof media !== 'object') return null;
    const m = media as Record<string, unknown>;
    const mimetype = normalizarMimetype(m.mimetype) || 'desconhecido';
    if (!TIPOS_DE_MIDIA_ACEITOS.includes(mimetype)) return { acao: 'tipo_nao_aceito', mimetype };
    if (m.omitted === true) return { acao: 'grande', mimetype };
    const bytes = tamanhoDoBase64(m.data);
    if (bytes === null) return { acao: 'indisponivel', mimetype };
    if (bytes > MIDIA_MAX_BYTES) return { acao: 'grande', mimetype };
    const base64 = base64Limpo(m.data as string);
    if (!conteudoConfereComTipo(primeirosBytesDoBase64(base64), mimetype)) return { acao: 'tipo_nao_aceito', mimetype };
    return { acao: 'gravar', mimetype, base64, bytes, nome: nomeSeguroDoArquivo(m.filename, mimetype) };
}

function rotuloDoTipo(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'imagem';
    if (mimetype === 'application/pdf') return 'PDF';
    if (mimetype.startsWith('audio/')) return 'áudio';
    if (mimetype.startsWith('video/')) return 'vídeo';
    return mimetype;
}

/** A linha do chat do pedido que conta que veio um arquivo. */
export function linhaDaMidia(d: DecisaoDeMidia): string {
    switch (d.acao) {
        // Ainda não há link assinado no chat para abrir o arquivo gravado: até
        // existir, a linha manda abrir no celular, como as demais.
        case 'gravar': return `Fornecedor enviou um arquivo (${rotuloDoTipo(d.mimetype)}); abrir no celular do número.`;
        case 'grande': return `Fornecedor enviou um arquivo (${d.mimetype}) maior que 5 MB; abrir no celular do número.`;
        case 'tipo_nao_aceito': return `Fornecedor enviou um arquivo (${d.mimetype}) de tipo não aceito; abrir no celular do número.`;
        default: return `Fornecedor enviou um arquivo (${d.mimetype}) que não chegou; abrir no celular do número.`;
    }
}

export type EventoRecebido =
    | { tipo: 'ignorar'; motivo: 'formato' | 'grupo' | 'nossa' | 'nao_1a1' | 'sem_telefone' }
    | {
        tipo: 'mensagem';
        /** Só dígitos com DDI. */
        telefone: string;
        /** `<telefone>@c.us` — a mesma forma do chat das saídas. */
        chatIdRemoto: string;
        providerMessageId: string | null;
        citadoId: string | null;
        /** O que vai para `wa_mensagens.texto` e para o chat do pedido. */
        texto: string;
        midia: DecisaoDeMidia | null;
    };

/**
 * `data` do `message.received` → mensagem 1:1 a gravar, ou ignorar.
 * Ignora grupo (`isGroup`, `@g.us`), lista de transmissão, canal, mensagem
 * nossa (`fromMe`) e remetente sem telefone (`@lid` sem `senderPhone`).
 * Texto: com arquivo → a linha do arquivo e, embaixo, a legenda; sem texto e
 * sem arquivo (localização, figurinha…) → linha que manda abrir no celular.
 */
export function classificarEventoRecebido(data: unknown): EventoRecebido {
    if (!data || typeof data !== 'object') return { tipo: 'ignorar', motivo: 'formato' };
    const d = data as Record<string, unknown>;
    if (d.isGroup === true) return { tipo: 'ignorar', motivo: 'grupo' };
    if (d.fromMe === true) return { tipo: 'ignorar', motivo: 'nossa' };
    const from = typeof d.from === 'string' ? d.from.trim() : '';
    if (/@(g\.us|broadcast|newsletter)$/i.test(from)) return { tipo: 'ignorar', motivo: 'nao_1a1' };
    const telefone = telefoneDoRemetente({ from, senderPhone: typeof d.senderPhone === 'string' ? d.senderPhone : null });
    if (telefone.length < 8 || telefone.length > 15) return { tipo: 'ignorar', motivo: 'sem_telefone' };

    const id = typeof d.id === 'string' ? d.id.trim() : '';
    const quoted = d.quotedMessage && typeof d.quotedMessage === 'object' ? (d.quotedMessage as Record<string, unknown>) : null;
    const citado = typeof quoted?.id === 'string' ? quoted.id.trim() : '';
    const midia = decidirMidia(d.media);

    let corpo = typeof d.body === 'string' ? d.body.trim() : '';
    // Em mídia, versões do whatsapp-web.js põem o próprio base64 no body: não é legenda.
    if (midia && /^[A-Za-z0-9+/=]{200,}$/.test(corpo)) corpo = '';
    const tipoMsg = (typeof d.type === 'string' ? d.type.toLowerCase().replace(/[^a-z0-9_]/g, '') : '').slice(0, 30);

    const texto = midia
        ? linhaDaMidia(midia) + (corpo ? `\n${corpo}` : '')
        : corpo || `Fornecedor enviou uma mensagem sem texto (${tipoMsg || 'desconhecido'}); abrir no celular do número.`;

    return {
        tipo: 'mensagem',
        telefone,
        chatIdRemoto: `${telefone}@c.us`,
        providerMessageId: id && id.length <= 300 ? id : null,
        citadoId: citado && citado.length <= 300 ? citado : null,
        texto: texto.slice(0, TEXTO_RECEBIDO_MAX),
        midia,
    };
}

/**
 * A mensagem de saída por trás do vínculo — de quem é o aviso da resposta
 * (`criado_por` dela). Citação → a própria mensagem citada; único → a mais
 * recente daquele pedido; sem vínculo → null.
 */
export function candidatoDoVinculo<T extends Candidato>(candidatos: T[], vinculo: Vinculo, citadoId: string | null): T | null {
    if (vinculo.tipo === 'sem_vinculo') return null;
    const doPedido = candidatos.filter((c) => c.organizationId === vinculo.organizationId && c.orderId === vinculo.orderId);
    if (vinculo.tipo === 'citacao' && citadoId) {
        return doPedido.find((c) => c.providerMessageId && idsDeMensagemIguais(c.providerMessageId, citadoId)) ?? null;
    }
    if (doPedido.length === 0) return null;
    const instante = (c: T) => {
        const t = Date.parse(c.enviadoEm);
        return Number.isFinite(t) ? t : -Infinity;
    };
    return doPedido.reduce((a, b) => (instante(b) > instante(a) ? b : a));
}

export type MudancaNoLog = { status?: 'sent' | 'failed'; error?: string | null; metadata: Record<string, unknown> };

/**
 * Espelho do status da mensagem (já depois do ack) no `notification_log` (aba
 * Logs de envio). Idempotente: a mesma entrada devolve null na segunda vez.
 *   · entregue/lida → `sent`, `metadata.entrega` = o status e SEM
 *     `metadata.confirmacao` (entrega confirmada não é "confirmação pendente");
 *     vence até um `failed` anterior (prova de que chegou);
 *   · aceita → `sent` só se o log ainda está `pending`;
 *   · falhou → `failed` com o erro e `metadata.entrega = 'falhou'`;
 *   · os demais → null.
 */
export function espelhoDoAckNoLog(
    log: { status: string; metadata: Record<string, unknown> | null },
    statusDaMensagem: StatusSaida,
    erro: string | null,
): MudancaNoLog | null {
    const antes = log.metadata ?? {};
    const tinhaConfirmacao = antes.confirmacao !== undefined;
    const metadata: Record<string, unknown> = { ...antes };
    delete metadata.confirmacao;
    switch (statusDaMensagem) {
        case 'entregue':
        case 'lida':
            metadata.entrega = statusDaMensagem;
            if (log.status !== 'sent') return { status: 'sent', error: null, metadata };
            if (antes.entrega === statusDaMensagem && !tinhaConfirmacao) return null;
            return { metadata };
        case 'aceita':
            return log.status === 'pending' ? { status: 'sent', error: null, metadata } : null;
        case 'falhou':
            metadata.entrega = 'falhou';
            if (log.status !== 'failed') {
                return { status: 'failed', error: erro?.trim() || 'O WhatsApp não entregou a mensagem.', metadata };
            }
            if (antes.entrega === 'falhou' && !tinhaConfirmacao) return null;
            return { metadata };
        default:
            return null;
    }
}

/** `session.status` / `session.disconnected` → estado da conexão. Outro evento → null. */
export function estadoDoEventoDeSessao(
    evento: string, data: unknown,
): { estado: EstadoConexao; estadoBruto: string | null; motivo: string | null } | null {
    const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    if (evento === 'session.disconnected') {
        return { estado: 'desconectado', estadoBruto: 'disconnected', motivo: umaLinha(d.reason, 100) || null };
    }
    if (evento === 'session.status') {
        const bruto = umaLinha(d.status, 100) || null;
        return { estado: estadoDaConexao(bruto), estadoBruto: bruto, motivo: null };
    }
    return null;
}

/**
 * Avisa os superadmins que o número caiu? Quando o estado vira `desconectado`
 * — ou quando o evento é a própria desconexão, mesmo com o estado já
 * `desconectado` (o "vivo" do worker pode ter gravado antes de o evento chegar).
 * Repetição em sequência é contida por quem chama (janela de minutos).
 */
export function deveAvisarDesconexao(a: { evento: string; anterior: string | null; novo: EstadoConexao }): boolean {
    return a.novo === 'desconectado' && (a.evento === 'session.disconnected' || a.anterior !== 'desconectado');
}

const IDADE_MAXIMA_DO_EVENTO_MS = 7 * 86400_000;

/**
 * Evento com `timestamp` de mais de 7 dias: corpo assinado antigo sendo
 * reenviado (a deduplicação expira em 30 dias). Ilegível → false (não trava
 * por mudança de formato; a assinatura já foi conferida).
 */
export function eventoVelhoDemais(timestamp: unknown, agoraMs: number): boolean {
    const t = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    return Number.isFinite(t) && agoraMs - t > IDADE_MAXIMA_DO_EVENTO_MS;
}

/** Título e texto do aviso no sino quando o fornecedor responde pelo WhatsApp. */
export function avisoDaResposta(d: { fornecedor: string; numero: string; texto: string }): { title: string; message: string } {
    const nome = umaLinha(d.fornecedor, 60) || 'Fornecedor';
    const numero = umaLinha(d.numero, 30) || '—';
    let trecho = umaLinha(d.texto, 1000);
    if (trecho.length > 140) trecho = `${trecho.slice(0, 139)}…`;
    return {
        title: 'Resposta do fornecedor no WhatsApp',
        message: trecho ? `${nome} respondeu o pedido nº ${numero}: "${trecho}"` : `${nome} respondeu o pedido nº ${numero}.`,
    };
}
