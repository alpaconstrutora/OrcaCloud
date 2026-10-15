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
 *   { modo: 'agendado' }               — pg_cron, Authorization: Bearer CRON_SECRET
 *   { modo: 'agora', accountId }       — botão "Sincronizar agora"; membro da org DONA da conta
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
// @ts-ignore — pacote npm sem tipos no Deno
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { chamadaDeCron, exigirMembro, respostaDeErro } from "../_shared/auth.ts";
import { novoClienteImap, falhaDeAutenticacao, mensagemDeErroImap, lerTudo, type ClienteImap } from "../_shared/imapCaptura.ts";
// ⚠️ MESMOS arquivos que o navegador carrega — não são cópias. Leitura do
// boleto e regras de destino têm uma verdade só.
import { extractFromPdfText, colunasDaExtracao, findBeneficiarioCnpj } from "../../../utils/boletoTexto.ts";
import { onlyDigits } from "../../../utils/febrabanRules.ts";
import {
    parseAuthenticationResults,
    extrairEndereco,
    remetenteCasa,
    deveProcessar,
    decidirDestino,
    proximaTentativa,
    CONFIANCA_MINIMA_CNPJ,
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

interface Totais { contas: number; mensagens: number; criados: number; duplicados: number; ignorados: number; erros: number }

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

    let body: { modo?: string; accountId?: string } = {};
    try { body = await req.json(); } catch { /* corpo vazio */ }

    let contas: Conta[] = [];
    if (body.modo === 'agendado') {
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
        return json({ error: 'modo deve ser "agendado" ou "agora" (com accountId).' }, 400);
    }

    const inicio = Date.now();
    const totais: Totais = { contas: 0, mensagens: 0, criados: 0, duplicados: 0, ignorados: 0, erros: 0 };
    const orcamento = { anexos: MAX_ANEXOS_POR_EXECUCAO, prazo: inicio + PRAZO_MS };

    for (const conta of contas) {
        if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) break;
        totais.contas++;
        await sincronizarConta(admin, conta, totais, orcamento).catch(async (e) => {
            totais.erros++;
            await admin.from('email_capture_accounts').update({
                ultimo_erro: String((e as Error)?.message ?? e).slice(0, 500),
                updated_at: new Date().toISOString(),
            }).eq('id', conta.id);
        });
    }

    return json({ ...totais, ms: Date.now() - inicio });
});

async function sincronizarConta(admin: SupabaseLike, conta: Conta, totais: Totais, orcamento: { anexos: number; prazo: number }) {
    const { data: senha, error: errSenha } = await admin.rpc('email_capture_ler_segredo', { p_account: conta.id });
    if (errSenha || !senha) {
        await marcarConta(admin, conta.id, { status: 'reautenticar', ultimo_erro: 'Senha da caixa não encontrada no cofre — reconecte.' });
        return;
    }

    const { data: remetentesBrutos } = await admin
        .from('email_capture_senders')
        .select('id, tipo, email, dominio, palavras_chave, importacao, exigir_dmarc, ativo, supplier_id')
        .eq('account_id', conta.id);
    const remetentes = (remetentesBrutos ?? []) as RemetenteMonitorado[];

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
        // UIDVALIDITY mudou: os UIDs antigos não valem mais — recomeça da data
        // inicial. A UNIQUE de email_capture_messages + o hash do arquivo impedem
        // boleto duplicado.
        let lastUid = conta.uid_validity === uidValidity ? (conta.last_uid ?? 0) : 0;

        // 1. Retentativas vencidas desta conta (mesma uid_validity).
        const { data: retry } = await admin
            .from('email_capture_messages')
            .select('id, uid, attachment_index, tentativas, documento_nome, message_id, remetente, assunto, data_email, auth_results')
            .eq('account_id', conta.id)
            .eq('uid_validity', uidValidity)
            .eq('resultado', 'erro')
            .lte('next_retry_at', new Date().toISOString())
            .lt('tentativas', 3)
            .order('next_retry_at')
            .limit(orcamento.anexos);
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
        if (!alvo.length) {
            await marcarConta(admin, conta.id, { uid_validity: uidValidity, last_uid: lastUid, last_sync_at: new Date().toISOString(), ultimo_erro: null });
            return;
        }

        // Metadados primeiro (o imapflow não aceita outro comando no meio do fetch).
        const metas: Array<{ uid: number; envelope: any; bodyStructure: ParteDaMensagem; headers: Uint8Array }> = [];
        for await (const msg of cliente.fetch(alvo.join(','), {
            uid: true, envelope: true, bodyStructure: true, headers: ['authentication-results', 'message-id'],
        }, { uid: true })) {
            metas.push({ uid: Number(msg.uid), envelope: msg.envelope, bodyStructure: msg.bodyStructure, headers: msg.headers });
        }
        metas.sort((a, b) => a.uid - b.uid);

        for (const meta of metas) {
            const de = meta.envelope?.from?.[0];
            const remetente = de?.address ? (de.name ? `${de.name} <${de.address}>` : de.address) : null;
            const assunto = meta.envelope?.subject ?? null;
            const pdfs = encontrarPdfs(meta.bodyStructure);
            const ehRetry = retryPorUid.has(meta.uid);

            const casado = remetenteCasa(remetente, [assunto ?? '', ...pdfs.map(p => p.nome)].join(' '), remetentes);
            if (!ehRetry && (!pdfs.length || !deveProcessar(conta.modo, casado))) {
                lastUid = Math.max(lastUid, meta.uid);
                continue;
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
            const retryDaMensagem = retryPorUid.get(meta.uid);
            const anexos: AnexoParaProcessar[] = pdfs
                .filter(p => !retryDaMensagem || retryDaMensagem.some(r => r.indice === p.indice))
                .map(p => {
                    const r = retryDaMensagem?.find(x => x.indice === p.indice);
                    return { ...base, indice: p.indice, parte: p.parte, nome: p.nome, tamanho: p.tamanho, mensagemId: r?.id, tentativas: r?.tentativas };
                });

            let completa = true;
            for (const anexo of anexos) {
                if (Date.now() > orcamento.prazo || orcamento.anexos <= 0) { completa = false; break; }
                orcamento.anexos--;
                await processarAnexo(admin, cliente, conta, uidValidity, anexo, remetentes, totais);
            }
            if (!completa) break;
            if (!ehRetry || novos.includes(meta.uid)) lastUid = Math.max(lastUid, meta.uid);
        }

        await marcarConta(admin, conta.id, { uid_validity: uidValidity, last_uid: lastUid, last_sync_at: new Date().toISOString(), ultimo_erro: null });
    } finally {
        lock.release();
        await cliente.logout().catch(() => undefined);
    }
}

async function processarAnexo(
    admin: SupabaseLike,
    cliente: ClienteImap,
    conta: Conta,
    uidValidity: number,
    a: AnexoParaProcessar,
    remetentes: RemetenteMonitorado[],
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
            if (!preso) return;
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

        // 4. Texto e leitura — a MESMA do navegador
        let texto = '';
        let paginas = 0;
        try {
            const pdf = await getDocumentProxy(new Uint8Array(bytes));
            const r = await extractText(pdf, { mergePages: true });
            texto = String(r.text ?? '');
            paginas = Number(r.totalPages ?? 0);
        } catch (e) {
            texto = '';
            console.warn('[email-capture-sync] PDF ilegível', a.nome, (e as Error)?.message);
        }
        const extracao = extractFromPdfText(texto, paginas);
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
        const remetente = remetenteCasa(a.remetente, [a.assunto ?? '', a.nome].join(' '), remetentes);
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
        await fechar({ resultado: 'criado', boleto_id: boleto.id, motivo: destino.motivos.join(' ') || null, erro: null, next_retry_at: null });
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

async function marcarConta(admin: SupabaseLike, id: string, patch: Record<string, unknown>) {
    await admin.from('email_capture_accounts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}
