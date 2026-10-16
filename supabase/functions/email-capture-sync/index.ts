/**
 * email-capture-sync — lê as caixas monitoradas e cria boletos.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 3.3).
 *
 * O conector é um PRODUTOR DE UPLOADS: termina quando a linha em `boletos`
 * existe (origem = 'email'). Revisão, fornecedor, aprovação, alçada e
 * pagamento são os do módulo Boletos a Pagar. Nada aqui cria título.
 *
 * Entradas (POST, JSON):
 *   { modo: 'agendado' }                    — pg_cron, Authorization: Bearer CRON_SECRET
 *   { modo: 'agora', accountId }            — botão "Sincronizar agora"; membro da org DONA da conta
 *   { modo: 'periodo', accountId, de, ate } — cria a busca retroativa do período e já avança
 *   { modo: 'periodo', accountId }          — continua a busca ativa da caixa
 *   { modo: 'cancelar_busca', buscaId }     — cancela a busca (membro da org dona)
 *
 * REGRA #7 pergunta 3: publicada com --no-verify-jwt; o gate é deste código
 * (chamadaDeCron / exigirMembro). Sem header nenhum → 401.
 *
 * Por anexo PDF, em ordem:
 *   linha em email_capture_messages ('processando'; a UNIQUE da mensagem é a
 *   idempotência) → bytes → SHA-256 → duplicado por arquivo? → bucket `boletos`
 *   no mesmo caminho do upload manual → texto (unpdf) → leitura (boletoTexto,
 *   a MESMA do navegador) → duplicado por linha digitável? → fornecedor na org
 *   → decidirDestino → INSERT boletos → auditoria → mensagem 'criado'.
 */
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamadaDeCron, exigirMembro, respostaDeErro } from "../_shared/auth.ts";
import { novoClienteImap, falhaDeAutenticacao, mensagemDeErroImap, lerTudo, type ClienteImap } from "../_shared/imapCaptura.ts";
// ⚠️ MESMOS arquivos que o navegador carrega — não são cópias. Leitura do
// boleto e regras de destino têm uma verdade só.
import { extractFromPdfText, colunasDaExtracao, findBeneficiarioCnpj, resultadoPdfComSenha } from "../../../utils/boletoTexto.ts";
import { abrirPdf, ordemDasSenhas } from "./pdf.ts";
import { onlyDigits } from "../../../utils/febrabanRules.ts";
import {
    parseAuthenticationResults,
    extrairEndereco,
    remetenteCasa,
    deveProcessar,
    decidirDestino,
    proximaTentativa,
    CONFIANCA_MINIMA_CNPJ,
    normalizarFiltroRemetente,
    remetenteNoFiltro,
    criterioImapDosRemetentes,
    MAX_FILTROS_REMETENTE,
    type RemetenteMonitorado,
    type ModoCaptura,
} from "../../../utils/emailCaptureRegras.ts";
import {
    encontrarPdfs,
    valoresDoCabecalho,
    caminhoNoStorage,
    criterioDeBusca,
    uidsNovos,
    hexDoHash,
    LIMITE_PDF_BYTES,
    type ParteDaMensagem,
} from "./logica.ts";

declare const Deno: { env: { get(key: string): string | undefined } };
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Anexos por execução. O cron passa a cada 15 min; o resto fica para a próxima. */
const MAX_ANEXOS_POR_EXECUCAO = 20;
/** Busca por período: mais anexos por chamada (o painel chama de novo até acabar). */
const MAX_ANEXOS_BUSCA = 40;
/** Mensagens com metadados lidos de uma vez numa busca (o resto fica para a próxima chamada). */
const LOTE_BUSCA = 150;
/** Não começa anexo novo depois disto (a Edge Function tem tempo limitado). */
const PRAZO_MS = 100_000;
const BUCKET = 'boletos';

interface Conta {
    id: string;
    organization_id: string;
    host: string;
    porta: number;
    usuario: string;
    status: string;
    modo: ModoCaptura;
    data_inicial: string;
    modo_piloto: boolean;
    uid_validity: number | null;
    last_uid: number | null;
}

interface Totais { contas: number; mensagens: number; criados: number; duplicados: number; ignorados: number; erros: number; reprocessados: number }

interface AnexoParaProcessar {
    uid: number;
    indice: number;
    parte: string;
    nome: string;
    tamanho: number;
    messageId: string | null;
    remetente: string | null;
    assunto: string | null;
    data: string | null;
    authHeaders: string[];
    /** Linha existente em email_capture_messages (retentativa). */
    mensagemId?: string;
    tentativas?: number;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin: SupabaseLike = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    let body: { modo?: string; accountId?: string; de?: string; ate?: string; buscaId?: string; remetentes?: string[] } = {};
    try { body = await req.json(); } catch { /* corpo vazio */ }

    let contas: Conta[] = [];
    let buscaPrimeiro = false;
    let maxAnexos = MAX_ANEXOS_POR_EXECUCAO;
    if (body.modo === 'cancelar_busca' && body.buscaId) {
        if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);
        const { data: b } = await admin.from('email_capture_buscas').select('id, organization_id, status').eq('id', body.buscaId).maybeSingle();
        const vinculo = await exigirMembro(req, b?.organization_id ?? '00000000-0000-0000-0000-000000000000');
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!b) return json({ error: 'Busca não encontrada' }, 404);
        if (!['pendente', 'em_andamento'].includes(b.status)) return json({ error: 'A busca já terminou.' }, 409);
        const { data: cancelada } = await admin.from('email_capture_buscas')
            .update({ status: 'cancelada', concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', b.id).select('*').single();
        return json({ busca: cancelada });
    }
    if (body.modo === 'periodo' && body.accountId) {
        if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);
        const { data: conta } = await admin.from('email_capture_accounts').select('*').eq('id', body.accountId).maybeSingle();
        const vinculo = await exigirMembro(req, conta?.organization_id ?? '00000000-0000-0000-0000-000000000000');
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!conta) return json({ error: 'Conta não encontrada' }, 404);
        if (conta.status !== 'ativa') return json({ error: `A caixa está "${conta.status}" — reative ou reconecte antes de buscar.` }, 409);

        const { data: ativa } = await admin.from('email_capture_buscas').select('id, data_de, data_ate')
            .eq('account_id', conta.id).in('status', ['pendente', 'em_andamento']).maybeSingle();
        if (body.de || body.ate) {
            const v = validarPeriodo(body.de, body.ate);
            if (v) return json({ error: v }, 400);
            // Filtro de remetentes (opcional): e-mails exatos ou domínios, normalizados.
            const brutos = Array.isArray(body.remetentes) ? body.remetentes.map(String).filter(x => x.trim()) : [];
            if (brutos.length > MAX_FILTROS_REMETENTE) return json({ error: `No máximo ${MAX_FILTROS_REMETENTE} remetentes por busca.` }, 400);
            const filtros: string[] = [];
            for (const x of brutos) {
                const f = normalizarFiltroRemetente(x);
                if (!f) return json({ error: `Remetente inválido: "${x}". Use um e-mail ou um domínio (ex.: fornecedor.com.br).` }, 400);
                if (!filtros.includes(f.valor)) filtros.push(f.valor);
            }
            if (ativa) return json({ error: `Já há uma busca em andamento nesta caixa (${ativa.data_de} a ${ativa.data_ate}). Continue ou cancele antes.` }, 409);
            const { error: insErr } = await admin.from('email_capture_buscas').insert({
                organization_id: conta.organization_id, account_id: conta.id,
                data_de: body.de, data_ate: body.ate, status: 'pendente', pedida_por: vinculo.email,
                remetentes: filtros.length ? filtros : null,
            });
            if (insErr) return json({ error: insErr.code === '23505' ? 'Já há uma busca em andamento nesta caixa.' : insErr.message }, insErr.code === '23505' ? 409 : 500);
        } else if (!ativa) {
            return json({ error: 'Nenhuma busca em andamento nesta caixa.' }, 404);
        }
        contas = [conta];
        buscaPrimeiro = true;
        maxAnexos = MAX_ANEXOS_BUSCA;
    } else if (body.modo === 'agendado') {
        if (!chamadaDeCron(req)) return json({ error: 'Unauthorized' }, 401);
        const { data, error } = await admin.from('email_capture_accounts').select('*').eq('status', 'ativa');
        if (error) return json({ error: error.message }, 500);
        contas = data ?? [];
    } else if (body.modo === 'agora' && body.accountId) {
        // Sem Authorization nenhum: 401 antes de qualquer leitura.
        if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);
        const { data: conta } = await admin.from('email_capture_accounts').select('*').eq('id', body.accountId).maybeSingle();
        // A org vem da LINHA, nunca do corpo. Conta inexistente responde como sem acesso.
        const vinculo = await exigirMembro(req, conta?.organization_id ?? '00000000-0000-0000-0000-000000000000');
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        if (!conta) return json({ error: 'Conta não encontrada' }, 404);
        if (conta.status !== 'ativa') return json({ error: `A caixa está "${conta.status}" — reative ou reconecte antes de sincronizar.` }, 409);
        contas = [conta];
    } else {
        // Sem modo reconhecido: não revela nada além de "não autorizado" a quem não é o cron.
        if (!chamadaDeCron(req) && !req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);
        return json({ error: 'modo deve ser "agendado", "agora" ou "periodo" (com accountId), ou "cancelar_busca" (com buscaId).' }, 400);
    }

    const inicio = Date.now();
    const totais: Totais = { contas: 0, mensagens: 0, criados: 0, duplicados: 0, ignorados: 0, erros: 0, reprocessados: 0 };
    const orcamento = { anexos: maxAnexos, prazo: inicio + PRAZO_MS };

    for (const conta of contas) {
        if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) break;
        totais.contas++;
        await sincronizarConta(admin, conta, totais, orcamento, buscaPrimeiro).catch(async (e) => {
            totais.erros++;
            await admin.from('email_capture_accounts').update({
                ultimo_erro: String((e as Error)?.message ?? e).slice(0, 500),
                updated_at: new Date().toISOString(),
            }).eq('id', conta.id);
        });
    }

    if (body.modo === 'periodo' && contas[0]) {
        // Devolve a busca como ficou (a mais recente da caixa) para o painel mostrar o progresso.
        const { data: busca } = await admin.from('email_capture_buscas').select('*')
            .eq('account_id', contas[0].id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        return json({ ...totais, ms: Date.now() - inicio, busca });
    }
    return json({ ...totais, ms: Date.now() - inicio });
});

/** De/até em AAAA-MM-DD, de ≤ até, até ≤ hoje. Devolve a mensagem de erro, ou null. */
function validarPeriodo(de?: string, ate?: string): string | null {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!de || !ate || !re.test(de) || !re.test(ate)) return 'Informe as datas inicial e final.';
    if (de > ate) return 'A data inicial é depois da final.';
    if (ate > new Date().toISOString().slice(0, 10)) return 'A data final não pode estar no futuro.';
    if (de < '2000-01-01') return 'Data inicial fora do intervalo aceito.';
    return null;
}

async function sincronizarConta(admin: SupabaseLike, conta: Conta, totais: Totais, orcamento: { anexos: number; prazo: number }, buscaPrimeiro = false) {
    const { data: senha, error: errSenha } = await admin.rpc('email_capture_ler_segredo', { p_account: conta.id });
    if (errSenha || !senha) {
        await marcarConta(admin, conta.id, { status: 'reautenticar', ultimo_erro: 'Senha da caixa não encontrada no cofre — reconecte.' });
        return;
    }

    const { data: remetentesBrutos } = await admin
        .from('email_capture_senders')
        .select('id, tipo, email, dominio, palavras_chave, importacao, exigir_dmarc, ativo, supplier_id, pdf_senha_atualizada_em')
        .eq('account_id', conta.id);
    const remetentes = (remetentesBrutos ?? []) as Array<RemetenteMonitorado & { pdf_senha_atualizada_em: string | null }>;

    // Senhas dos PDFs (Vault, só service_role). Remetente sem senha não entra.
    const senhas = new Map<string, string>();
    for (const r of remetentes.filter(x => x.pdf_senha_atualizada_em)) {
        const { data } = await admin.rpc('email_capture_ler_senha_pdf', { p_sender: r.id });
        if (data) senhas.set(r.id, String(data));
    }
    const ultimaSenha = remetentes.map(r => r.pdf_senha_atualizada_em).filter(Boolean).sort().pop() ?? null;
    if (senhas.size && ultimaSenha) {
        await reprocessarParados(admin, conta, remetentes, senhas, ultimaSenha, totais, orcamento);
    }

    const cliente: ClienteImap = novoClienteImap({ host: conta.host, porta: conta.porta, usuario: conta.usuario, senha });
    try {
        await cliente.connect();
    } catch (e) {
        const autenticacao = falhaDeAutenticacao(e);
        await marcarConta(admin, conta.id, {
            ...(autenticacao ? { status: 'reautenticar' } : {}),
            ultimo_erro: mensagemDeErroImap(e),
        });
        return;
    }

    const lock = await cliente.getMailboxLock('INBOX');
    try {
        const uidValidity = Number(cliente.mailbox?.uidValidity ?? 0);
        // Busca por período pedida agora vem antes; no cron, depois da leitura
        // das novas (que é o serviço contínuo).
        if (buscaPrimeiro) {
            await continuarBusca(admin, cliente, conta, uidValidity, remetentes, senhas, totais, orcamento);
            await lerNovas(admin, cliente, conta, uidValidity, remetentes, senhas, totais, orcamento);
        } else {
            await lerNovas(admin, cliente, conta, uidValidity, remetentes, senhas, totais, orcamento);
            await continuarBusca(admin, cliente, conta, uidValidity, remetentes, senhas, totais, orcamento);
        }
    } finally {
        lock.release();
        await cliente.logout().catch(() => undefined);
    }
}

type Orcamento = { anexos: number; prazo: number };
type Meta = { uid: number; envelope: any; bodyStructure: ParteDaMensagem; headers: Uint8Array };

async function buscarMetas(cliente: ClienteImap, uids: number[]): Promise<Meta[]> {
    if (!uids.length) return [];
    // Metadados primeiro (o imapflow não aceita outro comando no meio do fetch).
    const metas: Meta[] = [];
    for await (const msg of cliente.fetch(uids.join(','), {
        uid: true, envelope: true, bodyStructure: true, headers: ['authentication-results', 'message-id'],
    }, { uid: true })) {
        metas.push({ uid: Number(msg.uid), envelope: msg.envelope, bodyStructure: msg.bodyStructure, headers: msg.headers });
    }
    return metas.sort((a, b) => a.uid - b.uid);
}

/**
 * Uma mensagem: acha os PDFs, aplica o modo da caixa e processa cada anexo.
 * 'pulada' = sem PDF ou fora do modo; 'interrompida' = acabou o orçamento no meio.
 */
async function processarMeta(
    admin: SupabaseLike, cliente: ClienteImap, conta: Conta, uidValidity: number, meta: Meta,
    remetentes: RemetenteMonitorado[], senhas: Map<string, string>, totais: Totais, orcamento: Orcamento,
    retryDaMensagem?: Array<{ id: string; indice: number; tentativas: number }>,
    /** Busca com remetentes escolhidos: substitui a regra (modo) da caixa. */
    filtroRemetentes?: string[] | null,
): Promise<'pulada' | 'completa' | 'interrompida'> {
    const de = meta.envelope?.from?.[0];
    const remetente = de?.address ? (de.name ? `${de.name} <${de.address}>` : de.address) : null;
    const assunto = meta.envelope?.subject ?? null;
    const pdfs = encontrarPdfs(meta.bodyStructure);

    const casado = remetenteCasa(remetente, [assunto ?? '', ...pdfs.map(p => p.nome)].join(' '), remetentes);
    if (!retryDaMensagem) {
        if (!pdfs.length) return 'pulada';
        if (filtroRemetentes?.length) {
            // Escolha explícita do usuário vale mais que o modo da caixa; mas o
            // IMAP filtra por trecho, então confere o endereço exato aqui.
            if (!remetenteNoFiltro(remetente, filtroRemetentes)) return 'pulada';
        } else if (!deveProcessar(conta.modo, casado)) {
            return 'pulada';
        }
    }
    totais.mensagens++;

    const base = {
        uid: meta.uid,
        messageId: valoresDoCabecalho(meta.headers, 'message-id')[0] ?? null,
        remetente,
        assunto,
        data: meta.envelope?.date ? new Date(meta.envelope.date).toISOString() : null,
        authHeaders: valoresDoCabecalho(meta.headers, 'authentication-results'),
    };
    const anexos: AnexoParaProcessar[] = pdfs
        .filter(p => !retryDaMensagem || retryDaMensagem.some(r => r.indice === p.indice))
        .map(p => {
            const r = retryDaMensagem?.find(x => x.indice === p.indice);
            return { ...base, indice: p.indice, parte: p.parte, nome: p.nome, tamanho: p.tamanho, mensagemId: r?.id, tentativas: r?.tentativas };
        });

    for (const anexo of anexos) {
        if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) return 'interrompida';
        orcamento.anexos--;
        await processarAnexo(admin, cliente, conta, uidValidity, anexo, remetentes, senhas, totais);
    }
    return 'completa';
}

/** Leitura contínua: retentativas vencidas + mensagens depois do `last_uid` da caixa. */
async function lerNovas(
    admin: SupabaseLike, cliente: ClienteImap, conta: Conta, uidValidity: number,
    remetentes: RemetenteMonitorado[], senhas: Map<string, string>, totais: Totais, orcamento: Orcamento,
) {
    // UIDVALIDITY mudou: os UIDs antigos não valem mais — recomeça da data
    // inicial. A UNIQUE de email_capture_messages + o hash do arquivo impedem
    // boleto duplicado.
    let lastUid = conta.uid_validity === uidValidity ? (conta.last_uid ?? 0) : 0;

    // 1. Retentativas vencidas desta conta (mesma uid_validity).
    const { data: retry } = await admin
        .from('email_capture_messages')
        .select('id, uid, attachment_index, tentativas')
        .eq('account_id', conta.id)
        .eq('uid_validity', uidValidity)
        .eq('resultado', 'erro')
        .lte('next_retry_at', new Date().toISOString())
        .lt('tentativas', 3)
        .order('next_retry_at')
        .limit(Math.max(1, orcamento.anexos));
    const retryPorUid = new Map<number, Array<{ id: string; indice: number; tentativas: number }>>();
    for (const r of retry ?? []) {
        const lista = retryPorUid.get(Number(r.uid)) ?? [];
        lista.push({ id: r.id, indice: r.attachment_index, tentativas: r.tentativas });
        retryPorUid.set(Number(r.uid), lista);
    }

    // 2. Mensagens novas.
    const busca = criterioDeBusca(lastUid, conta.data_inicial);
    const encontrados: number[] = await cliente.search({ uid: busca.uid, since: busca.since }, { uid: true }) || [];
    const novos = uidsNovos(encontrados, lastUid);

    const alvo = [...new Set([...retryPorUid.keys(), ...novos])].sort((a, b) => a - b);
    for (const meta of await buscarMetas(cliente, alvo)) {
        const ehRetry = retryPorUid.has(meta.uid);
        const r = await processarMeta(admin, cliente, conta, uidValidity, meta, remetentes, senhas, totais, orcamento, retryPorUid.get(meta.uid));
        if (r === 'interrompida') break;
        if (!ehRetry || novos.includes(meta.uid)) lastUid = Math.max(lastUid, meta.uid);
    }

    await marcarConta(admin, conta.id, { uid_validity: uidValidity, last_uid: lastUid, last_sync_at: new Date().toISOString(), ultimo_erro: null });
}

/**
 * Busca retroativa ativa da caixa (email_capture_buscas): lê o período por
 * partes, a partir do `cursor_uid` dela. Não toca no `last_uid` da caixa.
 */
async function continuarBusca(
    admin: SupabaseLike, cliente: ClienteImap, conta: Conta, uidValidity: number,
    remetentes: RemetenteMonitorado[], senhas: Map<string, string>, totais: Totais, orcamento: Orcamento,
) {
    const { data: b } = await admin.from('email_capture_buscas').select('*')
        .eq('account_id', conta.id).in('status', ['pendente', 'em_andamento']).maybeSingle();
    if (!b) return;
    if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) return;

    const agora = () => new Date().toISOString();
    try {
        const cursorInicial = b.uid_validity === uidValidity ? Number(b.cursor_uid ?? 0) : 0;
        const fimExclusivo = new Date(`${b.data_ate}T00:00:00Z`);
        fimExclusivo.setUTCDate(fimExclusivo.getUTCDate() + 1);
        const filtro: string[] | null = b.remetentes?.length ? b.remetentes : null;
        const todos: number[] = (await cliente.search({
            since: new Date(`${b.data_de}T00:00:00Z`), before: fimExclusivo, ...criterioImapDosRemetentes(filtro),
        }, { uid: true }) || [])
            .map(Number).sort((x: number, y: number) => x - y);
        const pendentes = todos.filter(u => u > cursorInicial);

        const antes = { ...totais };
        let cursor = cursorInicial;
        for (const meta of await buscarMetas(cliente, pendentes.slice(0, LOTE_BUSCA))) {
            const r = await processarMeta(admin, cliente, conta, uidValidity, meta, remetentes, senhas, totais, orcamento, undefined, filtro);
            if (r === 'interrompida') break;
            cursor = meta.uid;
        }
        const acabou = !todos.length || cursor >= todos[todos.length - 1];
        await admin.from('email_capture_buscas').update({
            status: acabou ? 'concluida' : 'em_andamento',
            uid_validity: uidValidity,
            cursor_uid: cursor,
            total_mensagens: todos.length,
            mensagens_processadas: todos.filter(u => u <= cursor).length,
            criados: (b.criados ?? 0) + (totais.criados - antes.criados),
            duplicados: (b.duplicados ?? 0) + (totais.duplicados - antes.duplicados),
            ignorados: (b.ignorados ?? 0) + (totais.ignorados - antes.ignorados),
            erros: (b.erros ?? 0) + (totais.erros - antes.erros),
            ultimo_erro: null,
            concluida_em: acabou ? agora() : null,
            updated_at: agora(),
        }).eq('id', b.id);
    } catch (e) {
        await admin.from('email_capture_buscas').update({
            ultimo_erro: String((e as Error)?.message ?? e).slice(0, 500), updated_at: agora(),
        }).eq('id', b.id);
        throw e;
    }
}

async function processarAnexo(
    admin: SupabaseLike,
    cliente: ClienteImap,
    conta: Conta,
    uidValidity: number,
    a: AnexoParaProcessar,
    remetentes: RemetenteMonitorado[],
    senhas: Map<string, string>,
    totais: Totais,
) {
    const auth = parseAuthenticationResults(a.authHeaders);

    // 1. Linha da mensagem — a UNIQUE (conta, uid_validity, uid, anexo) é a idempotência.
    let mensagemId = a.mensagemId;
    if (!mensagemId) {
        const { data: nova, error } = await admin.from('email_capture_messages').insert({
            organization_id: conta.organization_id,
            account_id: conta.id,
            uid_validity: uidValidity,
            uid: a.uid,
            attachment_index: a.indice,
            message_id: a.messageId,
            remetente: a.remetente,
            assunto: a.assunto?.slice(0, 500) ?? null,
            data_email: a.data,
            auth_results: auth,
            documento_nome: a.nome,
            resultado: 'processando',
        }).select('id').single();
        if (error) {
            if (error.code !== '23505') throw error;
            // Já existe. Só retoma se ficou preso em 'processando' (execução que
            // caiu no meio) há mais de 10 min; senão outra execução cuidou dele.
            const { data: existente } = await admin.from('email_capture_messages')
                .select('id, resultado, updated_at')
                .eq('account_id', conta.id).eq('uid_validity', uidValidity)
                .eq('uid', a.uid).eq('attachment_index', a.indice).maybeSingle();
            const preso = existente?.resultado === 'processando'
                && Date.now() - new Date(existente.updated_at).getTime() > 10 * 60_000;
            if (!preso) {
                // Já lido antes (busca por período sobre dias já lidos): conta como
                // "já existia" — senão o painel mostra tudo zerado e parece que
                // a busca não achou nada.
                if (existente && ['criado', 'duplicado'].includes(existente.resultado)) totais.duplicados++;
                return;
            }
            mensagemId = existente.id;
        } else {
            mensagemId = nova.id;
        }
    }

    const fechar = (patch: Record<string, unknown>) =>
        admin.from('email_capture_messages').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', mensagemId);

    let pathEnviado: string | null = null;
    try {
        if (a.tamanho > LIMITE_PDF_BYTES) {
            totais.ignorados++;
            await fechar({ resultado: 'ignorado', motivo: `Anexo maior que ${LIMITE_PDF_BYTES / 1024 / 1024} MB.` });
            return;
        }

        // 2. Bytes e hash
        const { content } = await cliente.download(String(a.uid), a.parte, { uid: true });
        const bytes = await lerTudo(content, LIMITE_PDF_BYTES);
        const hash = hexDoHash(await crypto.subtle.digest('SHA-256', bytes));
        await fechar({ sha256: hash });

        // 3. Mesmo ARQUIVO já é um boleto desta org
        const { data: mesmoArquivo } = await admin.from('boletos').select('id, numero')
            .eq('organization_id', conta.organization_id).eq('documento_hash', hash).maybeSingle();
        if (mesmoArquivo) {
            totais.duplicados++;
            await fechar({ resultado: 'duplicado', boleto_id: mesmoArquivo.id, motivo: `Mesmo arquivo do boleto nº ${mesmoArquivo.numero ?? '?'}.` });
            return;
        }

        // 4. Texto e leitura — a MESMA do navegador. PDF com senha: tenta as
        //    senhas cadastradas (a do remetente casado primeiro).
        const remetente = remetenteCasa(a.remetente, [a.assunto ?? '', a.nome].join(' '), remetentes);
        const aberto = await abrirPdf(bytes, ordemDasSenhas(remetente?.id ?? null, senhas));
        const texto = aberto.texto;
        const extracao = aberto.semSenhaCerta ? resultadoPdfComSenha() : extractFromPdfText(texto, aberto.paginas);
        const paginas = aberto.paginas;
        const colunas = colunasDaExtracao(extracao);

        // 5. Mesma LINHA DIGITÁVEL já é um boleto desta org
        const linha = onlyDigits(colunas.linha_digitavel ?? '');
        if (linha.length >= 44) {
            const { data: mesmaLinha } = await admin.from('boletos').select('id, numero')
                .eq('organization_id', conta.organization_id).eq('linha_digitavel', linha).limit(1).maybeSingle();
            if (mesmaLinha) {
                totais.duplicados++;
                await fechar({ resultado: 'duplicado', boleto_id: mesmaLinha.id, motivo: `Mesma linha digitável do boleto nº ${mesmaLinha.numero ?? '?'}.` });
                return;
            }
        }

        // 6. Fornecedor na org (só com CNPJ confiável)
        // Também sem linha digitável: a revisão já abre com o fornecedor sugerido.
        const cnpj = findBeneficiarioCnpj(texto);
        const cnpjConfianca = cnpj?.confidence ?? 0;
        if (!colunas.beneficiario_cnpj && cnpj && cnpjConfianca >= CONFIANCA_MINIMA_CNPJ) {
            colunas.beneficiario_cnpj = cnpj.valor;
        }
        let fornecedores: string[] = [];
        if (cnpj && cnpjConfianca >= CONFIANCA_MINIMA_CNPJ) {
            const { data } = await admin.rpc('find_supplier_in_org_by_document', {
                p_organization_id: conta.organization_id, p_document: cnpj.valor,
            });
            fornecedores = ((data ?? []) as Array<{ id: string }>).map(f => f.id);
        }

        // 7. Destino
        const destino = decidirDestino({
            modoPiloto: conta.modo_piloto,
            remetente,
            auth,
            dominioFrom: extrairEndereco(a.remetente)?.dominio ?? null,
            checksumValido: !!colunas.checksum_valido && linha.length >= 44,
            // `colunas.vencimento` já passou por vencimentoPlausivel (null se implausível).
            vencimento: colunas.vencimento ?? null,
            fornecedoresDoCnpj: fornecedores,
            cnpjConfianca,
        });

        // 8. Arquivo no bucket — mesmo caminho do upload manual
        pathEnviado = caminhoNoStorage(conta.organization_id, a.nome);
        const { error: upErr } = await admin.storage.from(BUCKET).upload(pathEnviado, bytes, {
            contentType: 'application/pdf', upsert: false,
        });
        if (upErr) { pathEnviado = null; throw upErr; }

        // 9. O boleto
        const errosValidacao = [...(colunas.erros_validacao ?? []), ...destino.motivos.map(m => `Captura: ${m}`)];
        const { data: boleto, error: insErr } = await admin.from('boletos').insert({
            organization_id: conta.organization_id,
            documento_path: pathEnviado,
            documento_nome: a.nome,
            documento_hash: hash,
            documento_mime: 'application/pdf',
            documento_tamanho: bytes.byteLength,
            documento_paginas: paginas || null,
            ...colunas,
            erros_validacao: errosValidacao.length ? errosValidacao : null,
            status: destino.status,
            supplier_id: destino.supplierId,
            sugestao_supplier_id: destino.sugestaoSupplierId,
            sugestao_confianca: destino.sugestaoSupplierId ? 95 : null,
            origem: 'email',
            email_message_id: mensagemId,
            created_by_email: conta.usuario,
        }).select('id, numero').single();

        if (insErr) {
            await admin.storage.from(BUCKET).remove([pathEnviado]).catch(() => undefined);
            pathEnviado = null;
            if (insErr.code === '23505') {
                // Corrida com o upload manual ou outra execução: o boleto já existe.
                totais.duplicados++;
                await fechar({ resultado: 'duplicado', motivo: 'Boleto já cadastrado (mesmo arquivo ou linha digitável).' });
                return;
            }
            throw insErr;
        }

        await admin.from('boletos_auditoria').insert({
            boleto_id: boleto.id,
            organization_id: conta.organization_id,
            acao: 'upload',
            metodo: 'sistema',
            usuario_email: conta.usuario,
            valor_depois: {
                origem: 'email',
                remetente: a.remetente,
                assunto: a.assunto,
                autenticacao: { spf: auth.spf, dkim: auth.dkim, dmarc: auth.dmarc },
                status: destino.status,
                motivos: destino.motivos,
                confidence: extracao.confidence_score,
            },
        });

        totais.criados++;
        const avisoSenha = aberto.semSenhaCerta
            ? [senhas.size ? 'PDF com senha: nenhuma senha cadastrada abriu.' : 'PDF com senha: cadastre a senha no remetente monitorado.']
            : [];
        await fechar({ resultado: 'criado', boleto_id: boleto.id, motivo: [...avisoSenha, ...destino.motivos].join(' ') || null, erro: null, next_retry_at: null });
    } catch (e) {
        if (pathEnviado) await admin.storage.from(BUCKET).remove([pathEnviado]).catch(() => undefined);
        totais.erros++;
        const tentativas = (a.tentativas ?? 0) + 1;
        const proxima = proximaTentativa(tentativas);
        await fechar({
            resultado: 'erro',
            erro: String((e as Error)?.message ?? e).slice(0, 500),
            tentativas,
            next_retry_at: proxima ? proxima.toISOString() : null,
        });
    }
}

/**
 * Boletos que entraram sem leitura porque o PDF tinha senha (ou antes de a
 * senha existir) são lidos de novo quando uma senha de remetente da caixa muda
 * depois da última tentativa (`reprocessado_em`). Só mexe em boleto ainda em
 * revisão/rascunho e SEM linha digitável — nunca no que alguém já preencheu.
 */
async function reprocessarParados(
    admin: SupabaseLike,
    conta: Conta,
    remetentes: Array<RemetenteMonitorado & { pdf_senha_atualizada_em: string | null }>,
    senhas: Map<string, string>,
    ultimaSenha: string,
    totais: Totais,
    orcamento: { anexos: number; prazo: number },
) {
    const { data: candidatas } = await admin.from('email_capture_messages')
        .select('id, boleto_id, remetente, assunto, documento_nome, auth_results, reprocessado_em')
        .eq('account_id', conta.id).eq('resultado', 'criado').not('boleto_id', 'is', null)
        .or(`reprocessado_em.is.null,reprocessado_em.lt."${ultimaSenha}"`)
        .order('created_at', { ascending: false })
        .limit(Math.max(0, Math.min(10, orcamento.anexos)));

    for (const m of candidatas ?? []) {
        if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) break;
        const agora = new Date().toISOString();
        const { data: b } = await admin.from('boletos').select('*').eq('id', m.boleto_id).maybeSingle();
        await admin.from('email_capture_messages').update({ reprocessado_em: agora, updated_at: agora }).eq('id', m.id);
        // Relê boleto em revisão/rascunho que ainda não tem linha OU vencimento.
        if (!b || !['revisao', 'rascunho'].includes(b.status) || (b.linha_digitavel && b.vencimento)) continue;

        orcamento.anexos--;
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(b.documento_path);
        if (dlErr || !blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());

        const remetente = remetenteCasa(m.remetente, [m.assunto ?? '', m.documento_nome ?? ''].join(' '), remetentes);
        const aberto = await abrirPdf(bytes, ordemDasSenhas(remetente?.id ?? null, senhas));
        if (!aberto.texto) continue;

        const extracao = extractFromPdfText(aberto.texto, aberto.paginas);
        const colunas = colunasDaExtracao(extracao);
        const linha = onlyDigits(colunas.linha_digitavel ?? '');

        const cnpj = findBeneficiarioCnpj(aberto.texto);
        const cnpjConfianca = cnpj?.confidence ?? 0;
        if (!colunas.beneficiario_cnpj && cnpj && cnpjConfianca >= CONFIANCA_MINIMA_CNPJ) colunas.beneficiario_cnpj = cnpj.valor;
        let fornecedores: string[] = [];
        if (cnpj && cnpjConfianca >= CONFIANCA_MINIMA_CNPJ) {
            const { data } = await admin.rpc('find_supplier_in_org_by_document', { p_organization_id: conta.organization_id, p_document: cnpj.valor });
            fornecedores = ((data ?? []) as Array<{ id: string }>).map(f => f.id);
        }
        const auth = (m.auth_results ?? { spf: 'none', dkim: 'none', dmarc: 'none', headerFrom: null, servidor: null }) as Parameters<typeof decidirDestino>[0]['auth'];
        const destino = decidirDestino({
            modoPiloto: conta.modo_piloto,
            remetente,
            auth,
            dominioFrom: extrairEndereco(m.remetente)?.dominio ?? null,
            checksumValido: !!colunas.checksum_valido && linha.length >= 44,
            vencimento: colunas.vencimento ?? null,
            fornecedoresDoCnpj: fornecedores,
            cnpjConfianca,
        });

        const errosValidacao = [...(colunas.erros_validacao ?? []), ...destino.motivos.map(x => `Captura: ${x}`)];
        // Só preenche o que está VAZIO no boleto: o que alguém já digitou na
        // revisão (valor, vencimento, beneficiário…) nunca é sobrescrito.
        const vazios = Object.fromEntries(Object.entries(colunas).filter(([k]) => {
            const atual = (b as Record<string, unknown>)[k];
            return atual === null || atual === undefined || atual === '';
        }));
        const patch: Record<string, unknown> = {
            ...vazios,
            documento_paginas: b.documento_paginas ?? (aberto.paginas || null),
            erros_validacao: errosValidacao.length ? errosValidacao : null,
            supplier_id: b.supplier_id ?? destino.supplierId,
            sugestao_supplier_id: b.sugestao_supplier_id ?? destino.sugestaoSupplierId,
            sugestao_confianca: (b.sugestao_supplier_id ?? destino.sugestaoSupplierId) ? 95 : null,
            status: b.status === 'revisao' && destino.status === 'rascunho' ? 'rascunho' : b.status,
        };
        const { error: upErr } = await admin.from('boletos').update(patch).eq('id', b.id);
        if (upErr) {
            // 23505: a linha digitável já é de outro boleto desta org — este é duplicado.
            const aviso = upErr.code === '23505' ? 'Lido com a senha, mas a linha digitável já pertence a outro boleto (duplicado).' : `Releitura falhou: ${upErr.message}`;
            await admin.from('email_capture_messages').update({ motivo: aviso, updated_at: agora }).eq('id', m.id);
            continue;
        }
        await admin.from('boletos_auditoria').insert({
            boleto_id: b.id, organization_id: conta.organization_id, acao: 'reprocessamento', metodo: 'sistema',
            usuario_email: conta.usuario,
            valor_depois: { motivo: 'Releitura do PDF (senha cadastrada no remetente)', campos_preenchidos: Object.keys(vazios).filter(k => vazios[k] !== null && vazios[k] !== undefined), linha_digitavel: patch.linha_digitavel ?? b.linha_digitavel, valor: patch.valor ?? b.valor, vencimento: patch.vencimento ?? b.vencimento, motivos: destino.motivos },
        });
        await admin.from('email_capture_messages').update({ motivo: ['Lido de novo com a senha do PDF.', ...destino.motivos].join(' '), updated_at: agora }).eq('id', m.id);
        totais.reprocessados++;
    }
}

async function marcarConta(admin: SupabaseLike, id: string, patch: Record<string, unknown>) {
    await admin.from('email_capture_accounts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}
