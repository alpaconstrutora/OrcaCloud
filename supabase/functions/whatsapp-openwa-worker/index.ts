// whatsapp-openwa-worker — a MÁQUINA (worker ao lado do OpenWA) ↔ a FILA (wa_mensagens).
//
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §1 e §3; Task 4).
// O OpenWA não é acessível pela internet: é o worker da máquina que liga para cá.
// Esta function é a única ponte — pega o que está na fila, recebe o resultado do
// envio e o "estou vivo" com o estado da sessão. A chave do OpenWA nunca chega aqui.
//
// Ações (POST, corpo JSON { acao, ... }):
//   • pegar { limite? } → { itens: [{ id, chat_id, texto, comando_id }] }
//       — wa_pegar_pendentes(limite): pendentes vencidas + presas em enviando com a
//         trava vencida (criadas há < 23 h); marca enviando, trava 2 min e soma 1 em
//         `tentativas`. Presa com > 23 h vira incerta lá dentro (não volta).
//   • reportar { resultados: [{ id, httpStatus, erro, messageId }] }
//       → { aplicados: [{ id, status }], ignorados: [{ id, motivo }] }
//       — planoDoReporte (utils/whatsappOpenwa.ts) decide; só mexe em linha que está
//         `enviando` (UPDATE condicionado a status = 'enviando'): relato atrasado ou
//         repetido de linha que já andou volta em `ignorados` e não regride nada.
//         Espera da retentativa: `tentativas` já conta a atual → esperaAposFalha(tentativas - 1)
//         (1ª falha = 30 s). Sem espera → incerta ("esgotou as tentativas").
//         Espelho em notification_log (linha com metadata.wa_mensagem_id, gravada pela
//         whatsapp-openwa): aceita → 'sent' + wa_message_id/aceita_em; falhou → 'failed'
//         + error legível; incerta → continua 'pending' + metadata.confirmacao='pendente'.
//   • vivo { estado_bruto, numero?, sessao? } → { estado }
//       — wa_conexoes.visto_em = now(), estado normalizado (estadoDaConexao), estado_bruto,
//         numero_exibicao (quando veio). Sessão: `sessao` (sessao_remota) ou, sem ela, a
//         conexão da plataforma (a primeira, como wa_situacao). Também espelha no
//         notification_log as linhas que o próprio wa_pegar_pendentes virou incerta
//         (no máximo 50 por chamada; roda a cada 60 s).
//
// REGRA #7, pergunta 3: verify_jwt = false (supabase/config.toml) — o worker não tem
// JWT de usuário. O gate é o código: `Authorization: Bearer <WA_WORKER_SECRET>`,
// comparado em tempo constante (chamadaComSegredo, _shared/auth.ts) ANTES de criar o
// cliente ou ler o corpo. WA_WORKER_SECRET ausente ou com < 32 caracteres → 503
// (fail-closed: nunca aceita "Bearer " vazio). Sem header → 401. Depois de publicar,
// provar o 401 sem header contra o bundle publicado.
// Logs: nunca texto, telefone nem o segredo.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chamadaComSegredo, segredoConfigurado } from "../_shared/auth.ts"
import {
    estadoDaConexao, lerResultadoDoWorker, planoDoReporte,
    type PlanoDoReporte, type StatusSaida,
} from "../../../utils/whatsappOpenwa.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;

const SEGREDO = 'WA_WORKER_SECRET';
const RESULTADOS_MAX = 100;
const SINCRONIZAR_MAX = 50;
const TEXTO_CURTO_MAX = 100;

interface LinhaDaFila {
    id: string;
    status: StatusSaida;
    tentativas: number;
    criado_em: string;
    direcao: string;
}

interface LinhaDoLog {
    id: string;
    status: string;
    metadata: Record<string, unknown> | null;
}

/** Texto curto de uma linha (estado bruto, número): sem quebra, até 100 caracteres. */
function curto(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.replace(/\s+/g, ' ').trim().slice(0, TEXTO_CURTO_MAX);
    return t || null;
}

/** Linhas de notification_log da(s) mensagem(ns) da fila, ainda pendentes. */
async function logsPendentes(admin: Admin, mensagemIds: string[]): Promise<(LinhaDoLog & { wa: string })[]> {
    if (mensagemIds.length === 0) return [];
    const { data, error } = await admin
        .from('notification_log')
        .select('id, status, metadata')
        .eq('channel', 'whatsapp')
        .eq('status', 'pending')
        .in('metadata->>wa_mensagem_id', mensagemIds);
    if (error) {
        console.error('[whatsapp-openwa-worker] leitura do notification_log falhou:', error.message);
        return [];
    }
    return ((data ?? []) as LinhaDoLog[])
        .map((l) => ({ ...l, wa: String(l.metadata?.wa_mensagem_id ?? '') }));
}

/** Espelha no notification_log o desfecho final de uma mensagem (merge do metadata). */
async function espelharNoLog(admin: Admin, mensagemId: string, plano: PlanoDoReporte, agoraIso: string): Promise<void> {
    if (plano.tipo !== 'aceita' && plano.tipo !== 'falhou' && plano.tipo !== 'incerta') return;
    const logs = await logsPendentes(admin, [mensagemId]);
    for (const log of logs) {
        const metadata = { ...(log.metadata ?? {}) };
        let mudanca: Record<string, unknown>;
        if (plano.tipo === 'aceita') {
            metadata.wa_message_id = plano.providerMessageId;
            metadata.aceita_em = agoraIso;
            mudanca = { status: 'sent', error: null, metadata };
        } else if (plano.tipo === 'falhou') {
            mudanca = { status: 'failed', error: plano.erro, metadata };
        } else {
            metadata.confirmacao = 'pendente';
            mudanca = { error: plano.erro, metadata };
        }
        const { error } = await admin.from('notification_log').update(mudanca).eq('id', log.id).eq('status', 'pending');
        if (error) console.error('[whatsapp-openwa-worker] espelho no notification_log falhou:', error.message);
    }
}

/**
 * Linhas que o wa_pegar_pendentes virou `incerta` sozinho (presas em enviando há
 * > 23 h) não passam pelo reportar: o log delas ficaria 'pending' sem a marca de
 * confirmação. Recentes primeiro, no máximo 50 por chamada.
 */
async function sincronizarIncertas(admin: Admin, agoraIso: string): Promise<number> {
    const desde = new Date(Date.parse(agoraIso) - 2 * 86400_000).toISOString();
    const { data, error } = await admin
        .from('wa_mensagens')
        .select('id, erro')
        .eq('direcao', 'saida')
        .eq('status', 'incerta')
        .gte('atualizado_em', desde)
        .order('atualizado_em', { ascending: false })
        .limit(SINCRONIZAR_MAX);
    if (error) {
        console.error('[whatsapp-openwa-worker] leitura das incertas falhou:', error.message);
        return 0;
    }
    const incertas = (data ?? []) as { id: string; erro: string | null }[];
    const erroDe = new Map(incertas.map((m) => [m.id, m.erro]));
    const logs = (await logsPendentes(admin, incertas.map((m) => m.id)))
        .filter((l) => l.metadata?.confirmacao === undefined || l.metadata?.confirmacao === null);
    let n = 0;
    for (const log of logs) {
        const metadata = { ...(log.metadata ?? {}), confirmacao: 'pendente' };
        const { error: e } = await admin
            .from('notification_log')
            .update({ metadata, error: erroDe.get(log.wa) ?? 'Confirmação pendente: confira no celular do número antes de reenviar.' })
            .eq('id', log.id)
            .eq('status', 'pending');
        if (e) console.error('[whatsapp-openwa-worker] espelho da incerta falhou:', e.message);
        else n++;
    }
    return n;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // Gate ANTES de tudo (corpo, cliente, banco). Segredo mal configurado → 503,
    // nunca "aberto": sem a guarda, secret vazio aceitaria o header "Bearer ".
    if (!segredoConfigurado(SEGREDO)) {
        console.error('[whatsapp-openwa-worker] WA_WORKER_SECRET ausente ou com menos de 32 caracteres.');
        return json({ error: 'Serviço indisponível: segredo do worker não configurado.' }, 503);
    }
    if (!chamadaComSegredo(req, SEGREDO)) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as {
        acao?: 'pegar' | 'reportar' | 'vivo';
        limite?: unknown;
        resultados?: unknown;
        estado_bruto?: unknown;
        numero?: unknown;
        sessao?: unknown;
    };

    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── pegar ─────────────────────────────────────────────────────────
    if (body.acao === 'pegar') {
        const n = Number(body.limite);
        const limite = Number.isInteger(n) ? Math.min(Math.max(n, 1), 100) : 10;
        const { data, error } = await admin.rpc('wa_pegar_pendentes', { p_limite: limite });
        if (error) return json({ error: `Erro ao pegar a fila: ${error.message}` }, 500);
        const itens = ((data ?? []) as { id: string; chat_id_remoto: string; texto: string | null; comando_id: string }[])
            .map((l) => ({ id: l.id, chat_id: l.chat_id_remoto, texto: l.texto ?? '', comando_id: l.comando_id }));
        return json({ itens });
    }

    // ─── reportar ──────────────────────────────────────────────────────
    if (body.acao === 'reportar') {
        if (!Array.isArray(body.resultados)) return json({ error: 'resultados é obrigatório (lista).' }, 400);
        if (body.resultados.length > RESULTADOS_MAX) {
            return json({ error: `No máximo ${RESULTADOS_MAX} resultados por chamada.` }, 400);
        }

        const aplicados: { id: string; status: StatusSaida }[] = [];
        const ignorados: { id: string | null; motivo: string }[] = [];

        // Um relato por id (o primeiro); fora do formato não entra.
        const porId = new Map<string, NonNullable<ReturnType<typeof lerResultadoDoWorker>>>();
        for (const bruto of body.resultados) {
            const r = lerResultadoDoWorker(bruto);
            if (!r) {
                const id = (bruto as { id?: unknown } | null)?.id;
                ignorados.push({ id: typeof id === 'string' ? id.slice(0, 64) : null, motivo: 'formato_invalido' });
                continue;
            }
            const chave = r.id.toLowerCase();
            if (porId.has(chave)) {
                ignorados.push({ id: r.id, motivo: 'repetido' });
                continue;
            }
            porId.set(chave, r);
        }
        if (porId.size === 0) return json({ aplicados, ignorados });

        const { data: linhas, error: eLer } = await admin
            .from('wa_mensagens')
            .select('id, status, tentativas, criado_em, direcao')
            .in('id', [...porId.keys()]);
        if (eLer) return json({ error: `Erro ao ler a fila: ${eLer.message}` }, 500);
        const linhaDe = new Map(((linhas ?? []) as LinhaDaFila[]).map((l) => [l.id.toLowerCase(), l]));

        const agoraMs = Date.now();
        const agoraIso = new Date(agoraMs).toISOString();
        for (const [chave, r] of porId) {
            const linha = linhaDe.get(chave);
            if (!linha || linha.direcao !== 'saida') {
                ignorados.push({ id: r.id, motivo: 'nao_encontrada' });
                continue;
            }
            const plano = planoDoReporte(
                { status: linha.status, tentativas: linha.tentativas, criadoEm: linha.criado_em }, r, agoraMs,
            );
            if (plano.tipo === 'ignorar') {
                ignorados.push({ id: linha.id, motivo: `status_${linha.status}` });
                continue;
            }

            const mudanca: Record<string, unknown> = { status: plano.status, trava_ate: null };
            if (plano.tipo === 'aceita') {
                mudanca.provider_message_id = plano.providerMessageId;
                mudanca.erro = null;
            } else if (plano.tipo === 'repetir') {
                mudanca.proxima_tentativa_em = plano.proximaTentativaEm;
                mudanca.erro = plano.erro;
            } else {
                mudanca.erro = plano.erro;
            }

            // Condicionado a 'enviando': se outro relato (ou o webhook) mexeu na linha
            // entre a leitura e aqui, nada é sobrescrito.
            const { data: gravada, error: eGravar } = await admin
                .from('wa_mensagens')
                .update(mudanca)
                .eq('id', linha.id)
                .eq('status', 'enviando')
                .select('id')
                .maybeSingle();
            if (eGravar) {
                // 23505: o mesmo provider_message_id já está noutra linha do mesmo chat.
                console.error('[whatsapp-openwa-worker] gravar o resultado falhou:', eGravar.code, eGravar.message);
                ignorados.push({ id: linha.id, motivo: 'erro_ao_gravar' });
                continue;
            }
            if (!gravada) {
                ignorados.push({ id: linha.id, motivo: 'status_mudou' });
                continue;
            }
            aplicados.push({ id: linha.id, status: plano.status });
            await espelharNoLog(admin, linha.id, plano, agoraIso);
        }
        return json({ aplicados, ignorados });
    }

    // ─── vivo ──────────────────────────────────────────────────────────
    if (body.acao === 'vivo') {
        const estadoBruto = curto(body.estado_bruto);
        const estado = estadoDaConexao(estadoBruto);
        const mudanca: Record<string, unknown> = {
            visto_em: new Date().toISOString(),
            estado,
            estado_bruto: estadoBruto,
        };
        // Só registra; não apaga (outro ponto pode ter gravado o último erro).
        if (estado === 'erro') mudanca.ultimo_erro = `sessão do OpenWA em falha (${estadoBruto ?? 'sem estado'})`;
        // Desconectado o OpenWA pode não dizer o número: mantém o último conhecido.
        const numero = curto(body.numero);
        if (numero) mudanca.numero_exibicao = numero;

        const sessao = curto(body.sessao);
        let alvo = admin.from('wa_conexoes').update(mudanca);
        if (sessao) {
            alvo = alvo.eq('sessao_remota', sessao);
        } else {
            const { data: primeira, error: eCon } = await admin
                .from('wa_conexoes').select('id').order('criado_em').order('id').limit(1).maybeSingle();
            if (eCon) return json({ error: `Erro ao ler a conexão: ${eCon.message}` }, 500);
            if (!primeira) return json({ error: 'Nenhuma conexão de WhatsApp cadastrada.' }, 404);
            alvo = alvo.eq('id', primeira.id);
        }
        const { data: gravada, error: eVivo } = await alvo.select('id');
        if (eVivo) return json({ error: `Erro ao gravar o estado: ${eVivo.message}` }, 500);
        if (!gravada || gravada.length === 0) return json({ error: 'Sessão desconhecida.' }, 404);

        const sincronizadas = await sincronizarIncertas(admin, new Date().toISOString());
        return json({ estado, sincronizadas });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
});
