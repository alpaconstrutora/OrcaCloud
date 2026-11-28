// Worker do OpenWA — roda ao lado do gateway, na máquina do escritório (WSL2 + Docker).
//
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Task 9). Instalação: ../LEIA-ME.md.
//
// O que faz (só conexões de SAÍDA; nada escuta porta):
//   • Assina a campainha (Realtime broadcast, tópico `wa-campainha`, evento `fila`, canal
//     público, payload vazio) com a anon key. Tocou → ciclo, no máximo um a cada 5 s
//     (fila.campainha: o tópico é público e pode ser inundado; toque no intervalo é adiado,
//     não perdido).
//   • A cada 60 s roda o ciclo mesmo sem campainha (rede de segurança: se a assinatura
//     cair, só fica um aviso no log — nunca derruba o processo).
//   • Ciclo: confere a sessão no OpenWA (`ready`?) → `pegar` na Edge Function
//     whatsapp-openwa-worker → envia um por vez (timeout 30 s) → `reportar` cada resultado.
//     Nunca dois ciclos ao mesmo tempo (criarCoalescedor).
//   • A cada 60 s → `vivo` com o status da sessão e o número pareado.
//
// Logs: nunca texto da mensagem, telefone, chat id nem segredo. Só id da fila (UUID),
// status HTTP e o `code` do OpenWA quando houver.

import { createClient } from '@supabase/supabase-js';
import {
    OPENWA_BASE_PADRAO, criarCoalescedor, eventoDaCampainha, idDaSessaoPorNome, leituraDaSessao, podeEnviar,
    requisicaoDeEnvio, resultadoDoEnvio,
} from './nucleo.mjs';

const INTERVALO_MS = 60_000;
const TIMEOUT_ENVIO_MS = 30_000;
const TIMEOUT_CONSULTA_MS = 10_000;
const TIMEOUT_FUNCAO_MS = 25_000;
const LIMITE_PEGAR = 5; // trava de 2 min na fila: 5 × (≤30 s) cabe com folga
const REPORTES_PENDENTES_MAX = 100;
const RECONECTAR_CAMPAINHA_MS = 60_000;

const faltando = [];
function exigir(nome) {
    const v = (process.env[nome] ?? '').trim();
    if (!v) faltando.push(nome);
    return v;
}

function log(nivel, msg, extra) {
    const linha = { t: new Date().toISOString(), nivel, msg, ...(extra ?? {}) };
    (nivel === 'erro' ? console.error : console.log)(JSON.stringify(linha));
}

const SUPABASE_URL = exigir('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = exigir('SUPABASE_ANON_KEY');
const WA_WORKER_SECRET = exigir('WA_WORKER_SECRET');
const OPENWA_API_KEY = exigir('OPENWA_API_KEY');
const OPENWA_URL = (process.env.OPENWA_URL ?? '').trim().replace(/\/+$/, '') || OPENWA_BASE_PADRAO;
const SESSAO_NOME = (process.env.OPENWA_SESSAO_NOME ?? '').trim() || 'opura';
const URL_FUNCAO = `${SUPABASE_URL}/functions/v1/whatsapp-openwa-worker`;

// Configuração incompleta: avisa e ESPERA (sem sair) — sair faria o Docker reiniciar em
// laço. Preencher o .env e rodar `docker compose up -d` recria o container com o valor.
if (faltando.length > 0) {
    const avisar = () => log('erro', 'configuração incompleta — preencha no .env e rode `docker compose up -d` (ver LEIA-ME)', { faltando });
    avisar();
    setInterval(avisar, 10 * 60_000);
    const sair = () => process.exit(0);
    process.on('SIGTERM', sair);
    process.on('SIGINT', sair);
    await new Promise(() => {});
}

let parando = false;
let sessaoId = null; // id (UUID) da sessão no OpenWA; achado pelo nome e guardado
const reportesPendentes = []; // resultados que não chegaram à Edge Function; vão no próximo ciclo

// ─── OpenWA ─────────────────────────────────────────────────────────────────

async function openwaGet(caminho) {
    const resp = await fetch(`${OPENWA_URL}${caminho}`, {
        headers: { 'X-API-Key': OPENWA_API_KEY },
        signal: AbortSignal.timeout(TIMEOUT_CONSULTA_MS),
    });
    const corpo = await resp.json().catch(() => null);
    return { status: resp.status, corpo };
}

/**
 * Lê a sessão no OpenWA. Devolve { id, sessao, estado_bruto, numero } — `id` é o da sessão
 * que foi de fato conferida — ou { falha } (motivo curto, sem dado sensível).
 * O `vivo` roda em paralelo ao ciclo e pode zerar/trocar `sessaoId` no meio; por isso o
 * id lido aqui é local e devolvido, e o ciclo envia com ele (não com a variável global).
 */
async function lerSessao() {
    try {
        let id = sessaoId;
        if (!id) {
            const r = await openwaGet(`/api/sessions?name=${encodeURIComponent(SESSAO_NOME)}`);
            if (r.status === 401 || r.status === 403) return { falha: `openwa_chave_recusada_${r.status}` };
            if (r.status !== 200) return { falha: `openwa_http_${r.status}` };
            id = idDaSessaoPorNome(r.corpo, SESSAO_NOME);
            if (!id) return { falha: 'sessao_inexistente' };
            sessaoId = id;
            log('info', 'sessão do OpenWA encontrada pelo nome', { sessao: SESSAO_NOME, id });
        }
        const r = await openwaGet(`/api/sessions/${encodeURIComponent(id)}`);
        if (r.status === 404) {
            if (sessaoId === id) sessaoId = null; // apagada/recriada: procura pelo nome de novo no próximo
            return { falha: 'sessao_inexistente' };
        }
        if (r.status !== 200) return { falha: `openwa_http_${r.status}` };
        return { id, sessao: r.corpo, ...leituraDaSessao(r.corpo) };
    } catch (e) {
        return { falha: 'openwa_inacessivel', codigo: codigoCurto(e) };
    }
}

function codigoCurto(e) {
    return (e && (e.cause?.code || e.code || e.name)) || 'erro';
}

/** `sid` = id da sessão capturado no ciclo (nunca o `sessaoId` global, que o vivo pode zerar). */
async function enviar(item, sid) {
    const req = requisicaoDeEnvio(item, sid, OPENWA_API_KEY, OPENWA_URL);
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS);
    try {
        const resp = await fetch(req.url, {
            method: 'POST',
            headers: req.headers,
            body: JSON.stringify(req.corpo),
            signal: ctrl.signal,
        });
        // Abort no meio do corpo: já temos o status; sem corpo, messageId e codigo ficam null.
        const corpo = await resp.json().catch(() => null);
        // `resultado.codigo` (o `code` do OpenWA, ex.: SEND_PACING_LIMITED) vai no reportar.
        const resultado = resultadoDoEnvio({ status: resp.status, corpo });
        return { resultado, codigo: resultado.codigo ?? undefined };
    } catch (erro) {
        // Erro de rede: o código (ECONNRESET…) só vai para o log; o reportar leva codigo null.
        return { resultado: resultadoDoEnvio({ erro }), codigo: codigoCurto(erro) };
    } finally {
        clearTimeout(relogio);
    }
}

// ─── Edge Function ──────────────────────────────────────────────────────────

async function chamarFuncao(corpo) {
    const resp = await fetch(URL_FUNCAO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WA_WORKER_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_FUNCAO_MS),
    });
    const dados = await resp.json().catch(() => null);
    if (!resp.ok) {
        const e = new Error(`edge function respondeu HTTP ${resp.status}`);
        e.httpStatus = resp.status;
        throw e;
    }
    return dados ?? {};
}

async function reportar(resultados) {
    if (resultados.length === 0) return true;
    try {
        const r = await chamarFuncao({ acao: 'reportar', resultados });
        const ignorados = Array.isArray(r.ignorados) ? r.ignorados : [];
        if (ignorados.length) {
            log('aviso', 'reportar: itens ignorados pela Edge Function', {
                ignorados: ignorados.map((i) => ({ id: i?.id ?? null, motivo: i?.motivo ?? null })),
            });
        }
        return true;
    } catch (e) {
        log('aviso', 'reportar falhou; tento de novo no próximo ciclo', { http: e.httpStatus ?? null, codigo: codigoCurto(e) });
        return false;
    }
}

async function esvaziarReportesPendentes() {
    if (reportesPendentes.length === 0) return;
    const lote = reportesPendentes.splice(0, reportesPendentes.length);
    if (!(await reportar(lote))) reportesPendentes.unshift(...lote);
}

function guardarReporte(r) {
    reportesPendentes.push(r);
    if (reportesPendentes.length > REPORTES_PENDENTES_MAX) {
        // Os mais antigos ficam em `enviando` e a fila os retoma (trava vencida) com o
        // mesmo Idempotency-Key — o OpenWA devolve a resposta original, não reenvia.
        reportesPendentes.splice(0, reportesPendentes.length - REPORTES_PENDENTES_MAX);
    }
}

// ─── ciclo ──────────────────────────────────────────────────────────────────

async function ciclo() {
    if (parando) return undefined;
    await esvaziarReportesPendentes();

    const s = await lerSessao();
    // O id da sessão é capturado UMA vez por ciclo (o que acabou de ser conferido `ready`) e
    // vai para cada envio: o vivo, em paralelo, pode zerar `sessaoId` (404) no meio do laço,
    // e enviar com null mandaria para /api/sessions/null — 4xx = falha definitiva.
    const sid = s.id ?? null;
    if (!sid) {
        log('info', 'fila fica para depois: sessão do OpenWA sem id', { estado: s.falha ?? null });
        return undefined;
    }
    if (!s.sessao || !podeEnviar(s.estado_bruto)) {
        log('info', 'fila fica para depois: sessão não está pronta', { estado: s.estado_bruto ?? s.falha ?? null });
        return undefined;
    }

    let itens;
    try {
        const r = await chamarFuncao({ acao: 'pegar', limite: LIMITE_PEGAR });
        itens = Array.isArray(r.itens) ? r.itens : [];
    } catch (e) {
        log('aviso', 'pegar falhou', { http: e.httpStatus ?? null, codigo: codigoCurto(e) });
        return undefined;
    }
    if (itens.length === 0) return undefined;
    log('info', 'itens pegos na fila', { n: itens.length });

    for (const item of itens) {
        // Parando no meio: os que sobraram voltam sozinhos (trava de 2 min vence).
        if (parando) break;
        const { resultado, codigo } = await enviar(item, sid);
        log('info', 'envio', { id: item.id, http: resultado.httpStatus, erro: resultado.erro, codigo });
        const r = { id: item.id, ...resultado };
        if (!(await reportar([r]))) guardarReporte(r);
    }
    return itens.length >= LIMITE_PEGAR && !parando ? 'de_novo' : undefined;
}

const fila = criarCoalescedor(ciclo, (e) => log('erro', 'ciclo falhou', { codigo: codigoCurto(e) }));

// ─── vivo ───────────────────────────────────────────────────────────────────

let vivoRodando = false;
async function vivo() {
    if (parando || vivoRodando) return;
    vivoRodando = true;
    try {
        const s = await lerSessao();
        const estado_bruto = s.estado_bruto ?? s.falha ?? 'desconhecido';
        const corpo = { acao: 'vivo', estado_bruto, numero: s.numero ?? null };
        // A Edge Function acha a conexão por wa_conexoes.sessao_remota = id da sessão do OpenWA
        // (o mesmo que o webhook traz em `sessionId`). Sem id ainda → sem `sessao`
        // (ela usa a conexão da plataforma).
        const sid = s.id ?? sessaoId;
        if (sid) corpo.sessao = sid;
        try {
            await chamarFuncao(corpo);
        } catch (e) {
            if (e.httpStatus === 404 && sid) {
                log('aviso', 'vivo: a Edge Function não conhece esta sessão — wa_conexoes.sessao_remota precisa ser o id da sessão do OpenWA (LEIA-ME, passo "Ligar a sessão ao banco")', { id: sid });
            } else {
                log('aviso', 'vivo falhou', { http: e.httpStatus ?? null, codigo: codigoCurto(e) });
            }
        }
    } finally {
        vivoRodando = false;
    }
}

// ─── campainha ──────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
let canal = null;
let religar = null;
let ultimoAvisoCampainha = 0;

function assinarCampainha() {
    if (parando) return;
    try {
        const ch = supabase
            .channel('wa-campainha', { config: { broadcast: { self: false } } })
            .on('broadcast', { event: 'fila' }, () => { if (ch === canal) fila.campainha(); });
        canal = ch;
        ch.subscribe((status, err) => {
            // Só o canal ATUAL decide (eventoDaCampainha): o CLOSED que o removeChannel
            // dispara no canal velho não pode re-armar a reassinatura.
            switch (eventoDaCampainha({ status, canal: ch, canalAtual: canal, parando })) {
                case 'assinada':
                    log('info', 'campainha assinada');
                    fila.tocar(); // pode ter entrado algo enquanto estava fora
                    break;
                case 'reassinar':
                    log('aviso', 'campainha fechou; varredura de 60 s segue; nova assinatura em 60 s');
                    agendarReassinatura();
                    break;
                case 'avisar': {
                    // TIMED_OUT / CHANNEL_ERROR: o realtime-js tenta de novo sozinho. Aviso no
                    // máximo a cada 5 min para não inundar o log com a Realtime fora.
                    const agora = Date.now();
                    if (agora - ultimoAvisoCampainha >= 5 * 60_000) {
                        ultimoAvisoCampainha = agora;
                        log('aviso', 'campainha com problema; varredura de 60 s segue', { status, motivo: err?.message ?? null });
                    }
                    break;
                }
                default:
                    break; // canal velho ou parando
            }
        });
    } catch (e) {
        log('aviso', 'não deu para assinar a campainha; varredura de 60 s segue', { codigo: codigoCurto(e) });
        agendarReassinatura();
    }
}

function agendarReassinatura() {
    if (parando || religar) return;
    religar = setTimeout(async () => {
        religar = null;
        // Solta o canal ANTES de remover: o CLOSED que o removeChannel dispara chega com
        // canalAtual = null e é ignorado.
        const velho = canal;
        canal = null;
        try { if (velho) await supabase.removeChannel(velho); } catch { /* já fechado */ }
        assinarCampainha();
    }, RECONECTAR_CAMPAINHA_MS);
}

// ─── início e parada ────────────────────────────────────────────────────────

process.on('unhandledRejection', (e) => log('erro', 'promessa rejeitada sem tratamento', { codigo: codigoCurto(e) }));

log('info', 'worker do OpenWA subindo', { openwa: OPENWA_URL, sessao: SESSAO_NOME });
assinarCampainha();
const varredura = setInterval(() => { fila.tocar(); }, INTERVALO_MS);
const batimento = setInterval(() => { vivo(); }, INTERVALO_MS);
vivo();
fila.tocar();

async function parar(sinal) {
    if (parando) return;
    parando = true;
    log('info', 'parando', { sinal });
    clearInterval(varredura);
    clearInterval(batimento);
    if (religar) clearTimeout(religar);
    const velho = canal;
    canal = null;
    try { if (velho) await supabase.removeChannel(velho); } catch { /* segue */ }
    // O envio em curso termina (≤ 30 s) e é reportado; não aborta no meio (desfecho incerto).
    const limite = new Promise((r) => setTimeout(r, 35_000));
    await Promise.race([fila.rodando() ? fila.tocar() : Promise.resolve(), limite]);
    await esvaziarReportesPendentes().catch(() => {});
    log('info', 'parado');
    process.exit(0);
}
process.on('SIGTERM', () => { parar('SIGTERM'); });
process.on('SIGINT', () => { parar('SIGINT'); });
