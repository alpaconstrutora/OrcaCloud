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
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_ID_MAX = 300;

/** Valida um item de `reportar.resultados`. Fora do formato → `null` (a function não aplica). */
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

    return { id: o.id, httpStatus: s as number | null, erro: erro as ResultadoDoWorker['erro'], messageId: messageId || null };
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
    | { tipo: 'repetir'; status: 'pendente'; proximaTentativaEm: string; erro: string }
    | { tipo: 'falhou'; status: 'falhou'; erro: string }
    | { tipo: 'incerta'; status: 'incerta'; erro: string };

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
 */
export function planoDoReporte(
    linha: { status: StatusSaida; tentativas: number; criadoEm: string },
    r: { httpStatus: number | null; erro: 'recusada' | 'timeout' | null; messageId: string | null },
    agoraMs: number,
): PlanoDoReporte {
    if (linha.status !== 'enviando') return { tipo: 'ignorar' };

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
 *   · `5511…@c.us` → o próprio número;
 *   · `…@lid` (id anônimo, sem telefone) → `senderPhone`, se o OpenWA resolveu
 *     (`RESOLVE_LID_TO_PHONE=true`);
 *   · grupo, lista de transmissão, canal ou sem telefone → `''`.
 */
export function telefoneDoRemetente(data: { from?: string; senderPhone?: string | null }): string {
    const from = (data.from ?? '').trim().toLowerCase();
    if (from.endsWith('@g.us') || from.endsWith('@broadcast') || from.endsWith('@newsletter')) return '';
    const digitos = (v: string) => v.split('@')[0].replace(/\D/g, '');
    if (from.endsWith('@c.us')) return digitos(from);
    return digitos(data.senderPhone ?? '');
}

/**
 * O OpenWA às vezes manda o id serializado (`true_5511…@c.us_3EB0AB`, e em
 * grupo com `_<participante>` no fim) e às vezes só o id curto (`3EB0AB`).
 */
function idCurtoDaMensagem(id: string): string {
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

/**
 * A qual pedido (e organização) pertence a resposta do fornecedor.
 * `candidatos` = mensagens de pedido enviadas àquele telefone dentro da janela.
 *   1. respondeu citando uma mensagem nossa → o pedido dela;
 *   2. senão, uma só organização na lista → o pedido mais recente dela;
 *   3. senão (nenhuma ou mais de uma) → sem vínculo (triagem do superadmin).
 * Citação que não casa com nenhum candidato → sem vínculo (não cai na regra 2).
 */
export function escolherVinculo(candidatos: Candidato[], citadoId: string | null): Vinculo {
    if (citadoId) {
        const citado = candidatos.find((c) => c.providerMessageId && idsDeMensagemIguais(c.providerMessageId, citadoId));
        if (citado) return { tipo: 'citacao', organizationId: citado.organizationId, orderId: citado.orderId };
        // Citou algo que não está na lista (ex.: pedido de outra org fora da janela):
        // a resposta é sobre outra coisa — cair na regra 2 seria vincular por palpite.
        return { tipo: 'sem_vinculo' };
    }
    const orgs = new Set(candidatos.map((c) => c.organizationId));
    if (orgs.size !== 1) return { tipo: 'sem_vinculo' };
    const instante = (c: Candidato) => {
        const t = Date.parse(c.enviadoEm);
        return Number.isFinite(t) ? t : -Infinity;
    };
    const maisRecente = candidatos.reduce((a, b) => (instante(b) > instante(a) ? b : a));
    return { tipo: 'unico', organizationId: maisRecente.organizationId, orderId: maisRecente.orderId };
}
