// whatsapp-openwa-webhook — o OPENWA (máquina do escritório) → o APP.
//
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §3; Task 5).
// O OpenWA faz POST aqui de cada evento, assinado. Entrega "pelo menos uma vez":
// o mesmo evento pode chegar várias vezes (dedup por idempotencyKey).
//
// Envelope: { event, timestamp, sessionId, idempotencyKey, deliveryId, data }.
// Eventos tratados:
//   • message.ack / message.failed — recibo das NOSSAS mensagens: casa
//       data.messageId com wa_mensagens.provider_message_id (idsDeMensagemIguais:
//       id serializado ou curto), aplica avancarStatus (status só avança: "delivered"
//       depois de "read" continua lida) e espelha no notification_log
//       (espelhoDoAckNoLog: entregue/lida → sent + metadata.entrega, sem
//       metadata.confirmacao; falhou → failed). Mensagem desconhecida → 200 sem efeito,
//       menos quando há envio 'enviando' para o mesmo chatId (o ack chegou antes do
//       relato do worker) → 500, e o OpenWA repete depois.
//   • message.received — resposta do fornecedor (classificarEventoRecebido: grupo,
//       transmissão, canal, @lid sem telefone → ignora). Saídas de pedido para o
//       mesmo telefone (variantesDoTelefoneBR: com e sem o nono dígito) nos últimos
//       JANELA_VINCULO_DIAS, de TODAS as organizações (o número é um só): alvo de
//       vínculo só aceita|entregue|lida; pendente|enviando|incerta só CONTAM a
//       organização (outra org ali → sem vínculo, salvo citação). escolherVinculo
//       decide — nunca por palpite.
//         – com vínculo → wa_mensagens (entrada, org do pedido) + order_chats
//           (sender_role supplier, canal whatsapp, sender_name = fornecedor,
//           sender_email '') + aviso no sino para quem enviou (criado_por da saída).
//         – sem vínculo → wa_mensagens com organization_id NULL, sem chat e sem
//           aviso a nenhuma organização (triagem do superadmin na whatsapp-openwa).
//       Mídia inline aceita (tipo na lista, ≤ 5 MiB) → bucket privado whatsapp-midia
//       em <org|sem-org>/<wa_mensagens.id>/<nome seguro, extensão sempre a do tipo>;
//       referência em wa_mensagens.midia. Conteúdo cujo começo não bate com o tipo
//       declarado (conteudoConfereComTipo: magic bytes) conta como tipo não aceito.
//       Omitida/grande ou tipo não aceito → só a linha no chat
//       mandando abrir no celular (o OpenWA não é alcançável de fora: sem túnel).
//   • session.status / session.disconnected → wa_conexoes.estado (estadoDaConexao);
//       virou desconectado → aviso no sino para os superadmins (no máximo 1 a cada
//       10 min).
//   • qualquer outro → 200 sem efeito.
//
// Ordem e garantias:
//   1. Método POST; segredo OPENWA_WEBHOOK_SECRET ausente ou < 32 caracteres → 503
//      (fail-closed, nunca "aberto").
//   2. Corpo lido em bytes, com teto de 8 MiB (Content-Length primeiro, depois a
//      contagem real enquanto lê) → 413.
//   3. X-OpenWA-Signature = sha256=HMAC dos BYTES ORIGINAIS (assinaturaConfere) →
//      senão 401, ANTES de qualquer parse ou consulta.
//   4. JSON inválido ou envelope sem event/idempotencyKey/sessionId → 400.
//      timestamp com mais de 7 dias → 200 sem efeito (reenvio de corpo antigo).
//   5. sessionId ≠ wa_conexoes.sessao_remota → 403.
//   6. Dedup: INSERT em wa_eventos_recebidos (organization_id sempre NULL — a
//      chave única é (NULL, idempotencyKey) com NULLS NOT DISTINCT; gravar a org
//      depois deixaria a repetição passar). Conflito → 200 "duplicado", sem efeito.
//      A dedup é gravada ANTES do processamento: se uma gravação posterior falhar, a
//      linha de dedup é APAGADA antes do 500, para a repetição do OpenWA processar
//      de novo. Cada passo desfaz o que gravou (mensagem, arquivo) quando o passo
//      seguinte falha. Avisos no sino são best-effort (falha vai para o console; não
//      desfaz a resposta gravada).
//   7. 2xx só depois das gravações; erro de banco → 500 (o OpenWA repete).
//
// ⚠️ RISCO ACEITO NO PILOTO — dedup órfã em morte dura do isolate:
//   O QUE PODE ACONTECER: se o isolate for morto (limite de CPU/memória/tempo,
//   redeploy, queda do runtime) DEPOIS do INSERT da dedup e ANTES de terminar, o
//   catch não roda, a linha de dedup fica e toda repetição do OpenWA recebe 200
//   "duplicado" — o evento se perde em silêncio (resposta do fornecedor fora do
//   chat do pedido; ack sem efeito; estado da sessão desatualizado).
//   POR QUE ACEITO: é raro (o processamento é curto, e o pior caso é a mídia de
//   5 MiB), a resposta continua no celular do número, e o ack/estado se corrigem
//   no próximo evento ou no "vivo" do worker. Corrigir de verdade pede gravação
//   transacional (RPC única) ou dedup com estado "processando" + expiração —
//   fica para depois do piloto.
//   COMO DETECTAR: comparar o log de entregas do OpenWA (eventos message.received
//   entregues com 200) com wa_mensagens (direcao='entrada', provider_message_id =
//   data.id): evento entregue sem linha correspondente = perdido; a chave dele
//   está em wa_eventos_recebidos.chave_evento.
//
// REGRA #7, pergunta 3: verify_jwt = false (supabase/config.toml) — o OpenWA não tem
// JWT. O gate é o código: HMAC-SHA256 do corpo com OPENWA_WEBHOOK_SECRET, conferido
// em tempo constante antes de tudo. Depois de publicar, provar contra o bundle
// publicado: sem header → 401; assinatura errada → 401.
// Logs: nunca texto, telefone, id de mensagem nem o segredo.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    CORPO_WEBHOOK_MAX_BYTES, JANELA_VINCULO_DIAS, MIDIA_MAX_BYTES, STATUS_ALVO_DE_VINCULO, STATUS_QUE_CONTAM_ORG,
    assinaturaConfere, avancarStatus, avisoDaResposta, candidatoDoVinculo, classificarEventoRecebido,
    deveAvisarDesconexao, escolherVinculo, espelhoDoAckNoLog, estadoDoEventoDeSessao, eventoVelhoDemais,
    idCurtoDaMensagem, idsDeMensagemIguais, statusDoAck, variantesDoTelefoneBR,
    type Candidato, type StatusSaida, type Vinculo,
} from "../../../utils/whatsappOpenwa.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

const SEGREDO = 'OPENWA_WEBHOOK_SECRET';
const BUCKET = 'whatsapp-midia';
const LOG = '[whatsapp-openwa-webhook]';
/** Teto de candidatos lidos por telefone; batendo nele, "único" vira sem vínculo (a lista pode estar cortada). */
const CANDIDATOS_MAX = 1000;
/** Janela em que um 2º aviso de desconexão aos superadmins é contido. */
const AVISO_DESCONEXAO_JANELA_MS = 10 * 60_000;
const ERRO_FALHOU = 'O WhatsApp não entregou a mensagem (falha informada pelo OpenWA depois de aceitar).';

interface Envelope {
    event: string;
    timestamp?: unknown;
    sessionId: string;
    idempotencyKey: string;
    data?: unknown;
}

interface Conexao {
    id: string;
    estado: string | null;
    numero_exibicao: string | null;
}

/** Erro de gravação/leitura: vira 500 e a dedup é desfeita (o OpenWA repete). */
class FalhaDeBanco extends Error {}

function falha(onde: string, e: { code?: string; message?: string } | null | undefined): never {
    throw new FalhaDeBanco(`${onde}: ${e?.code ?? ''} ${e?.message ?? 'erro desconhecido'}`.trim());
}

/** Corpo em bytes, sem passar de `max` (Content-Length e contagem real). null = grande demais. */
async function lerCorpo(req: Request, max: number): Promise<Uint8Array | null> {
    const declarado = Number(req.headers.get('content-length') ?? '');
    if (Number.isFinite(declarado) && declarado > max) return null;
    if (!req.body) return new Uint8Array(0);
    const leitor = req.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            try { await leitor.cancel(); } catch { /* já fechado */ }
            return null;
        }
        partes.push(value);
    }
    const corpo = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { corpo.set(p, pos); pos += p.byteLength; }
    return corpo;
}

function lerEnvelope(corpo: Uint8Array): Envelope | null {
    let v: unknown;
    try { v = JSON.parse(new TextDecoder().decode(corpo)); } catch { return null; }
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const texto = (x: unknown, max: number) => (typeof x === 'string' && x.trim().length >= 1 && x.trim().length <= max ? x.trim() : null);
    const event = texto(o.event, 100);
    const sessionId = texto(o.sessionId, 200);
    const idempotencyKey = texto(o.idempotencyKey, 300);
    if (!event || !sessionId || !idempotencyKey) return null;
    return { event, sessionId, idempotencyKey, timestamp: o.timestamp, data: o.data };
}

function decodificarBase64(b64: string): Uint8Array | null {
    try {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

function texto(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

// ─── message.ack / message.failed ─────────────────────────────────────────────

/** Aplica o status novo sem regredir; UPDATE condicionado ao status lido (re-lê se mudou no meio). */
async function avancarLinha(admin: Admin, id: string, atualLido: StatusSaida, novo: StatusSaida): Promise<StatusSaida> {
    let atual = atualLido;
    for (let i = 0; i < 3; i++) {
        const final = avancarStatus(atual, novo);
        if (final === atual) return atual;
        const mudanca: Record<string, unknown> = { status: final };
        if (final === 'falhou') mudanca.erro = ERRO_FALHOU;
        if (final === 'entregue' || final === 'lida') mudanca.erro = null; // chegou: some "confirmação pendente"
        const { data: gravada, error } = await admin
            .from('wa_mensagens').update(mudanca).eq('id', id).eq('status', atual).select('id').maybeSingle();
        if (error) falha('atualizar o status da mensagem', error);
        if (gravada) return final;
        const { data: relida, error: eRe } = await admin.from('wa_mensagens').select('status').eq('id', id).maybeSingle();
        if (eRe) falha('reler a mensagem', eRe);
        if (!relida) return atual;
        atual = relida.status as StatusSaida;
    }
    return atual;
}

/**
 * Espelho no notification_log pelo status FINAL da linha (não pelo do evento):
 * idempotente, então a repetição do OpenWA depois de um 500 conserta o log.
 */
async function espelharNoLog(admin: Admin, mensagemId: string, status: StatusSaida): Promise<void> {
    const { data, error } = await admin
        .from('notification_log').select('id, status, metadata')
        .eq('channel', 'whatsapp').eq('metadata->>wa_mensagem_id', mensagemId);
    if (error) falha('ler o notification_log', error);
    for (const log of (data ?? []) as { id: string; status: string; metadata: Record<string, unknown> | null }[]) {
        const mudanca = espelhoDoAckNoLog(log, status, ERRO_FALHOU);
        if (!mudanca) continue;
        const { error: e } = await admin.from('notification_log').update(mudanca).eq('id', log.id).eq('status', log.status);
        if (e) falha('espelhar no notification_log', e);
    }
}

async function processarAck(admin: Admin, env: Envelope): Promise<Record<string, unknown>> {
    const d = (env.data && typeof env.data === 'object' ? env.data : {}) as Record<string, unknown>;
    const mid = texto(d.messageId) || texto(d.id);
    const novo = statusDoAck(env.event === 'message.failed' ? 'failed' : texto(d.status));
    if (!mid || mid.length > 300 || !novo) return { ignorado: 'ack_sem_efeito' };

    // O ack pode trazer o id curto ou o serializado: busca pelo fim do id e confere
    // com idsDeMensagemIguais. Id curto fora do alfabeto esperado → só igualdade exata.
    const curto = idCurtoDaMensagem(mid);
    const desde = new Date(Date.now() - JANELA_VINCULO_DIAS * 86400_000).toISOString();
    let q = admin.from('wa_mensagens').select('id, status, provider_message_id')
        .eq('direcao', 'saida').not('provider_message_id', 'is', null).gte('criado_em', desde);
    q = /^[A-Za-z0-9-]{1,128}$/.test(curto) ? q.like('provider_message_id', `%${curto}`) : q.eq('provider_message_id', mid);
    const { data, error } = await q.limit(20);
    if (error) falha('procurar a mensagem do ack', error);
    const linhas = ((data ?? []) as { id: string; status: StatusSaida; provider_message_id: string }[])
        .filter((l) => idsDeMensagemIguais(l.provider_message_id, mid));
    if (linhas.length === 0) {
        // O ack pode chegar antes de o worker relatar o envio (a linha ainda está
        // 'enviando', sem provider_message_id). Havendo envio em curso para o mesmo
        // chat, 500 → o OpenWA repete depois do relato. Senão (mensagem mandada pelo
        // celular, ou de fora do app) → 200 sem efeito.
        const chatId = texto(d.chatId);
        if (chatId && chatId.length <= 200) {
            const { data: emCurso, error: eCurso } = await admin.from('wa_mensagens').select('id')
                .eq('direcao', 'saida').eq('status', 'enviando').eq('chat_id_remoto', chatId).limit(1);
            if (eCurso) falha('procurar envio em curso', eCurso);
            if ((emCurso ?? []).length > 0) throw new FalhaDeBanco('ack antes do relato do worker; o OpenWA repete');
        }
        return { ignorado: 'mensagem_desconhecida' };
    }

    const resultado: { id: string; status: StatusSaida }[] = [];
    for (const l of linhas) {
        const final = await avancarLinha(admin, l.id, l.status, novo);
        await espelharNoLog(admin, l.id, final);
        resultado.push({ id: l.id, status: final });
    }
    return { mensagens: resultado };
}

// ─── message.received ─────────────────────────────────────────────────────────

type CandidatoComAutor = Candidato & { id: string; criadoPor: string | null };

async function avisarQuemEnviou(
    admin: Admin, criadoPor: string | null, org: string, pedido: { id: string; number: string | null },
    fornecedor: string, textoRecebido: string,
): Promise<void> {
    if (!criadoPor) return;
    try {
        const { data, error } = await admin.auth.admin.getUserById(criadoPor);
        const email = (data?.user?.email ?? '').trim().toLowerCase();
        if (error || !email) {
            console.error(LOG, 'sem e-mail de quem enviou o pedido; aviso não sai.', error?.message ?? '');
            return;
        }
        const aviso = avisoDaResposta({ fornecedor, numero: pedido.number || pedido.id, texto: textoRecebido });
        const { error: e } = await admin.from('notifications').insert({
            recipient_email: email,
            title: aviso.title,
            message: aviso.message,
            link: `/supplies-orders?pedido=${pedido.id}`,
            type: 'whatsapp_resposta_pedido',
            organization_id: org,
        });
        if (e) console.error(LOG, 'aviso da resposta não gravou:', e.code, e.message);
    } catch (e) {
        console.error(LOG, 'aviso da resposta falhou:', (e as Error).message);
    }
}

async function processarRecebida(admin: Admin, env: Envelope): Promise<Record<string, unknown>> {
    const ev = classificarEventoRecebido(env.data);
    if (ev.tipo === 'ignorar') return { ignorado: ev.motivo };

    // Saídas de TODAS as organizações: o número é um só. Quem decide é escolherVinculo.
    // Lidas em STATUS_QUE_CONTAM_ORG (inclui pendente/enviando/incerta): só
    // aceita|entregue|lida são alvo de vínculo, mas toda org com envio àquele
    // telefone conta — senão a resposta ao pedido "incerto" da org B cairia na org A.
    const desde = new Date(Date.now() - JANELA_VINCULO_DIAS * 86400_000).toISOString();
    const { data: saidas, error: eCand } = await admin
        .from('wa_mensagens')
        .select('id, organization_id, entidade_id, provider_message_id, criado_em, criado_por, status')
        .eq('direcao', 'saida')
        .eq('entidade_tipo', 'purchase_order')
        .in('status', STATUS_QUE_CONTAM_ORG)
        .in('telefone', variantesDoTelefoneBR(ev.telefone))
        .gte('criado_em', desde)
        .not('entidade_id', 'is', null)
        .order('criado_em', { ascending: false })
        .limit(CANDIDATOS_MAX);
    if (eCand) falha('procurar os pedidos enviados ao telefone', eCand);
    const linhas = (saidas ?? []) as {
        id: string; organization_id: string; entidade_id: string; provider_message_id: string | null;
        criado_em: string; criado_por: string | null; status: StatusSaida;
    }[];
    const alvos = linhas.filter((l) => STATUS_ALVO_DE_VINCULO.includes(l.status));
    const outrasOrgs = linhas.filter((l) => !STATUS_ALVO_DE_VINCULO.includes(l.status)).map((l) => l.organization_id);
    const candidatos: CandidatoComAutor[] = alvos.map((l) => ({
        id: l.id, criadoPor: l.criado_por, organizationId: l.organization_id, orderId: l.entidade_id,
        providerMessageId: l.provider_message_id, enviadoEm: l.criado_em,
    }));

    let vinculo: Vinculo = escolherVinculo(candidatos, ev.citadoId, outrasOrgs);
    // Lista cortada no teto: outra organização pode ter ficado de fora → "único" não é certo.
    if (vinculo.tipo === 'unico' && linhas.length >= CANDIDATOS_MAX) vinculo = { tipo: 'sem_vinculo' };

    // O pedido ainda existe e é da organização da mensagem? Senão, sem vínculo.
    let pedido: { id: string; number: string | null } | null = null;
    let fornecedor = '';
    if (vinculo.tipo !== 'sem_vinculo') {
        const { data: p, error: eP } = await admin
            .from('purchase_orders').select('id, number, organization_id, supplier_id').eq('id', vinculo.orderId).maybeSingle();
        if (eP) falha('ler o pedido', eP);
        if (!p || (p.organization_id && p.organization_id !== vinculo.organizationId)) {
            vinculo = { tipo: 'sem_vinculo' };
        } else {
            pedido = { id: p.id, number: p.number ?? null };
            if (p.supplier_id) {
                const { data: f, error: eF } = await admin.from('suppliers').select('name').eq('id', p.supplier_id).maybeSingle();
                if (eF) falha('ler o fornecedor', eF);
                fornecedor = (f?.name ?? '').trim();
            }
        }
    }
    const org = vinculo.tipo === 'sem_vinculo' ? null : vinculo.organizationId;
    const mensagemId = crypto.randomUUID();

    // Arquivo primeiro (o caminho usa o id da mensagem, gerado aqui); se a mensagem
    // não gravar, o arquivo é removido.
    let midia: Record<string, unknown> | null = null;
    let caminho: string | null = null;
    if (ev.midia?.acao === 'gravar') {
        const bytes = decodificarBase64(ev.midia.base64);
        if (!bytes || bytes.byteLength > MIDIA_MAX_BYTES) {
            midia = { mimetype: ev.midia.mimetype, situacao: 'ilegivel' };
        } else {
            caminho = `${org ?? 'sem-org'}/${mensagemId}/${ev.midia.nome}`;
            const { error: eUp } = await admin.storage.from(BUCKET)
                .upload(caminho, bytes, { contentType: ev.midia.mimetype, upsert: false });
            if (eUp) falha('gravar o arquivo no bucket', { message: eUp.message });
            midia = { bucket: BUCKET, caminho, mimetype: ev.midia.mimetype, bytes: bytes.byteLength, nome: ev.midia.nome };
        }
    } else if (ev.midia) {
        midia = { mimetype: ev.midia.mimetype, situacao: ev.midia.acao };
    }
    const removerArquivo = async () => {
        if (!caminho) return;
        const { error } = await admin.storage.from(BUCKET).remove([caminho]);
        if (error) console.error(LOG, 'arquivo órfão não removido:', error.message);
    };

    const { error: eIns } = await admin.from('wa_mensagens').insert({
        id: mensagemId,
        organization_id: org,
        direcao: 'entrada',
        telefone: ev.telefone,
        chat_id_remoto: ev.chatIdRemoto,
        texto: ev.texto,
        midia,
        status: 'recebida',
        provider_message_id: ev.providerMessageId,
        entidade_tipo: pedido ? 'purchase_order' : null,
        entidade_id: pedido?.id ?? null,
    });
    if (eIns) {
        await removerArquivo();
        // A mesma mensagem já entrou (outro evento com o mesmo id do WhatsApp).
        if (eIns.code === '23505') return { duplicado: 'mensagem' };
        falha('gravar a mensagem recebida', eIns);
    }

    if (!pedido || !org) return { vinculo: 'sem_vinculo', mensagem_id: mensagemId };

    const { error: eChat } = await admin.from('order_chats').insert({
        order_id: pedido.id,
        sender_email: '',
        sender_name: fornecedor || 'Fornecedor',
        sender_role: 'supplier',
        message: ev.texto,
        is_system: false,
        canal: 'whatsapp',
    });
    if (eChat) {
        // Sem a linha no chat ninguém da organização veria a resposta: desfaz e o OpenWA repete.
        const { error: eDel } = await admin.from('wa_mensagens').delete().eq('id', mensagemId);
        if (eDel) console.error(LOG, 'mensagem sem chat não foi desfeita:', eDel.message);
        await removerArquivo();
        falha('gravar no chat do pedido', eChat);
    }

    const autor = candidatoDoVinculo(candidatos, vinculo, ev.citadoId);
    await avisarQuemEnviou(admin, autor?.criadoPor ?? null, org, pedido, fornecedor, ev.texto);
    return { vinculo: vinculo.tipo, mensagem_id: mensagemId };
}

// ─── session.status / session.disconnected ────────────────────────────────────

async function avisarSuperadmins(admin: Admin, conexao: Conexao, motivo: string | null): Promise<void> {
    try {
        const desde = new Date(Date.now() - AVISO_DESCONEXAO_JANELA_MS).toISOString();
        const { data: recente, error: eRec } = await admin
            .from('notifications').select('id').eq('type', 'whatsapp_desconectado').gte('created_at', desde).limit(1);
        if (eRec) { console.error(LOG, 'não leu os avisos recentes:', eRec.message); return; }
        if ((recente ?? []).length > 0) return;

        const { data: sas, error: eSa } = await admin.from('superadmins').select('email');
        if (eSa) { console.error(LOG, 'não leu os superadmins:', eSa.message); return; }
        const emails = [...new Set(((sas ?? []) as { email: string | null }[])
            .map((s) => (s.email ?? '').trim().toLowerCase()).filter(Boolean))];
        if (emails.length === 0) return;

        const numero = (conexao.numero_exibicao ?? '').trim();
        const message = `O número do WhatsApp${numero ? ` (${numero})` : ''} desconectou${motivo ? ` (${motivo})` : ''}. `
            + 'Pedidos não saem nem respostas chegam até reconectar: confira a máquina do OpenWA e, se pedir, leia o QR code de novo.';
        const { error } = await admin.from('notifications').insert(emails.map((email) => ({
            recipient_email: email,
            title: 'WhatsApp do ÒPURA desconectado',
            message,
            link: '/settings',
            type: 'whatsapp_desconectado',
            organization_id: null, // aviso pessoal: só o destinatário vê
        })));
        if (error) console.error(LOG, 'aviso de desconexão não gravou:', error.code, error.message);
    } catch (e) {
        console.error(LOG, 'aviso de desconexão falhou:', (e as Error).message);
    }
}

async function processarSessao(admin: Admin, env: Envelope, conexao: Conexao): Promise<Record<string, unknown>> {
    const plano = estadoDoEventoDeSessao(env.event, env.data);
    if (!plano) return { ignorado: 'evento' };
    const mudanca: Record<string, unknown> = { estado: plano.estado, estado_bruto: plano.estadoBruto };
    if (plano.motivo) mudanca.ultimo_erro = `sessão desconectada (${plano.motivo})`;
    else if (plano.estado === 'erro') mudanca.ultimo_erro = `sessão do OpenWA em falha (${plano.estadoBruto ?? 'sem estado'})`;
    const { error } = await admin.from('wa_conexoes').update(mudanca).eq('id', conexao.id);
    if (error) falha('gravar o estado da conexão', error);

    if (deveAvisarDesconexao({ evento: env.event, anterior: conexao.estado, novo: plano.estado })) {
        await avisarSuperadmins(admin, conexao, plano.motivo);
    }
    return { estado: plano.estado };
}

// ─── entrada ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // Fail-closed: sem segredo forte configurado, ninguém passa.
    const segredo = Deno.env.get(SEGREDO) ?? '';
    if (segredo.length < 32) {
        console.error(LOG, 'OPENWA_WEBHOOK_SECRET ausente ou com menos de 32 caracteres — recusando tudo.');
        return json({ error: 'Serviço indisponível: segredo do webhook não configurado.' }, 503);
    }

    const corpo = await lerCorpo(req, CORPO_WEBHOOK_MAX_BYTES);
    if (!corpo) return json({ error: 'Corpo maior que 8 MiB.' }, 413);

    // Assinatura dos bytes originais ANTES de qualquer parse ou consulta.
    if (!(await assinaturaConfere(corpo, req.headers.get('x-openwa-signature'), segredo))) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const env = lerEnvelope(corpo);
    if (!env) return json({ error: 'Envelope inválido (event, sessionId e idempotencyKey são obrigatórios).' }, 400);
    if (eventoVelhoDemais(env.timestamp, Date.now())) return json({ ok: true, ignorado: 'evento_antigo' });

    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: conexao, error: eCon } = await admin
        .from('wa_conexoes').select('id, estado, numero_exibicao').eq('sessao_remota', env.sessionId).maybeSingle();
    if (eCon) {
        console.error(LOG, 'leitura da conexão falhou:', eCon.code, eCon.message);
        return json({ error: 'Erro ao ler a conexão.' }, 500);
    }
    if (!conexao) return json({ error: 'Sessão desconhecida.' }, 403);

    // Dedup primeiro; desfeita se o processamento falhar (ver cabeçalho, item 6).
    const { data: dedup, error: eDedup } = await admin
        .from('wa_eventos_recebidos')
        .insert({ chave_evento: env.idempotencyKey, tipo: env.event })
        .select('id')
        .single();
    if (eDedup?.code === '23505') return json({ ok: true, duplicado: true });
    if (eDedup || !dedup?.id) {
        console.error(LOG, 'dedup falhou:', eDedup?.code, eDedup?.message);
        return json({ error: 'Erro ao registrar o evento.' }, 500);
    }

    try {
        let resultado: Record<string, unknown>;
        switch (env.event) {
            case 'message.ack':
            case 'message.failed':
                resultado = await processarAck(admin, env);
                break;
            case 'message.received':
                resultado = await processarRecebida(admin, env);
                break;
            case 'session.status':
            case 'session.disconnected':
                resultado = await processarSessao(admin, env, conexao as Conexao);
                break;
            default:
                resultado = { ignorado: 'evento' };
        }
        return json({ ok: true, ...resultado });
    } catch (e) {
        console.error(LOG, `falha ao processar ${env.event}:`, (e as Error).message);
        // Desfaz a dedup para a repetição do OpenWA processar de novo.
        const { error: eDesfaz } = await admin.from('wa_eventos_recebidos').delete().eq('id', dedup.id);
        if (eDesfaz) console.error(LOG, 'dedup não foi desfeita; a repetição será ignorada:', eDesfaz.message);
        return json({ error: 'Erro ao processar o evento; o OpenWA vai repetir.' }, 500);
    }
});
