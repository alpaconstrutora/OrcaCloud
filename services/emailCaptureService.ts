/**
 * Captura de boletos por e-mail — leitura das caixas, remetentes e mensagens, e
 * as ações que passam pelas Edge Functions.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.1).
 *
 * REGRA #5: `organizationId` null = "Todas" — o service só aplica `.eq` quando
 * há org; a RLS (is_org_member) recorta o resto. A conta tem org DONA: conectar
 * pede uma org específica (`useOrgWriteTarget('single')` na tela).
 *
 * A senha de app trafega só em `conectar`/`reautenticar`, direto para a Edge
 * Function, e nunca volta: nenhuma leitura daqui devolve `vault_secret_id`.
 */
import { supabase } from '../lib/supabase';

export type ModoCaptura = 'favoritos' | 'todos' | 'hibrido';
export type StatusConta = 'ativa' | 'pausada' | 'reautenticar' | 'desconectada';
export type ResultadoMensagem = 'processando' | 'criado' | 'duplicado' | 'ignorado' | 'erro';

export interface ContaCaptura {
    id: string;
    organization_id: string;
    provedor: 'imap';
    host: string;
    porta: number;
    usuario: string;
    status: StatusConta;
    modo: ModoCaptura;
    data_inicial: string;
    modo_piloto: boolean;
    last_sync_at: string | null;
    ultimo_erro: string | null;
    created_by_email: string | null;
    created_at: string;
}

export interface RemetenteCaptura {
    id: string;
    organization_id: string;
    account_id: string;
    supplier_id: string | null;
    nome: string | null;
    tipo: 'exato' | 'dominio';
    email: string | null;
    dominio: string | null;
    palavras_chave: string[];
    importacao: 'automatica' | 'revisao';
    exigir_dmarc: boolean;
    ativo: boolean;
    /** Quando a senha dos PDFs foi gravada (null = sem senha). A senha em si nunca volta à tela. */
    pdf_senha_atualizada_em: string | null;
    created_at: string;
}

export type RemetenteRascunho = Omit<RemetenteCaptura, 'id' | 'created_at' | 'pdf_senha_atualizada_em'>;

export interface MensagemCaptura {
    id: string;
    organization_id: string;
    account_id: string;
    remetente: string | null;
    assunto: string | null;
    data_email: string | null;
    documento_nome: string | null;
    resultado: ResultadoMensagem;
    motivo: string | null;
    erro: string | null;
    tentativas: number;
    boleto_id: string | null;
    auth_results: { spf?: string; dkim?: string; dmarc?: string } | null;
    created_at: string;
}

export type StatusBusca = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada' | 'erro';

/** Busca retroativa de e-mails por período numa caixa (email_capture_buscas). */
export interface BuscaPeriodo {
    id: string;
    organization_id: string;
    account_id: string;
    data_de: string;
    data_ate: string;
    status: StatusBusca;
    total_mensagens: number | null;
    mensagens_processadas: number;
    criados: number;
    duplicados: number;
    ignorados: number;
    erros: number;
    ultimo_erro: string | null;
    pedida_por: string | null;
    /** Remetentes escolhidos (e-mails ou domínios). null = todos, conforme a regra da caixa. */
    remetentes: string[] | null;
    created_at: string;
    concluida_em: string | null;
}

export const ROTULO_STATUS_BUSCA: Record<StatusBusca, string> = {
    pendente: 'Na fila', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada', erro: 'Com erro',
};

/** Percentual de uma busca (null enquanto ninguém contou as mensagens do período). */
export function progressoDaBusca(b: Pick<BuscaPeriodo, 'status' | 'total_mensagens' | 'mensagens_processadas'>): number | null {
    if (b.status === 'concluida') return 100;
    if (b.total_mensagens == null) return null;
    if (b.total_mensagens === 0) return 100;
    return Math.min(100, Math.round((b.mensagens_processadas / b.total_mensagens) * 100));
}

const COLUNAS_CONTA = 'id, organization_id, provedor, host, porta, usuario, status, modo, data_inicial, modo_piloto, last_sync_at, ultimo_erro, created_by_email, created_at';
const COLUNAS_REMETENTE = 'id, organization_id, account_id, supplier_id, nome, tipo, email, dominio, palavras_chave, importacao, exigir_dmarc, ativo, pdf_senha_atualizada_em, created_at';
const COLUNAS_MENSAGEM = 'id, organization_id, account_id, remetente, assunto, data_email, documento_nome, resultado, motivo, erro, tentativas, boleto_id, auth_results, created_at';

/** Rótulos — a tela mostra exatamente estes textos (e o filtro avançado compara com eles). */
export const ROTULO_STATUS_CONTA: Record<StatusConta, string> = {
    ativa: 'Ativa', pausada: 'Pausada', reautenticar: 'Reconectar', desconectada: 'Desconectada',
};
export const ROTULO_MODO: Record<ModoCaptura, string> = {
    favoritos: 'Só remetentes monitorados', hibrido: 'Monitorados + boletos', todos: 'Todos os PDFs',
};
/** O que cada modo traz — o PDF sem linha digitável de remetente avulso só entra em "todos" (16/10/2026). */
export const AJUDA_MODO: Record<ModoCaptura, string> = {
    favoritos: 'Só e-mails dos remetentes monitorados. Boleto de quem não está cadastrado fica de fora.',
    hibrido: 'Tudo dos remetentes monitorados e, dos demais, só PDF com linha digitável — nota fiscal, fatura de cartão e escaneado ficam de fora.',
    todos: 'Qualquer PDF de qualquer remetente vai para a revisão.',
};
/** Regras que a tela oferece (16/10/2026, pedido do usuário: "ler somente remetentes
 *  cadastrados e o modelo atual"). "todos" continua válido no banco e na função,
 *  mas não é oferecido — caixa que já esteja nele continua mostrando. */
export const MODOS_OFERECIDOS: ModoCaptura[] = ['favoritos', 'hibrido'];
export const ROTULO_RESULTADO: Record<ResultadoMensagem, string> = {
    processando: 'Processando', criado: 'Boleto criado', duplicado: 'Duplicado', ignorado: 'Ignorado', erro: 'Falhou',
};

/** Mensagem útil de uma Edge Function: a resposta 4xx chega como erro com a Response em `context`. */
async function erroDaFunction(error: unknown, padrao: string): Promise<Error> {
    const ctx = (error as { context?: Response } | null)?.context;
    const corpo = await ctx?.json?.().catch(() => null) as { error?: string; motivo?: string } | null;
    return new Error(corpo?.error ?? corpo?.motivo ?? (error as Error)?.message ?? padrao);
}

export interface ResultadoSincronizacao {
    mensagens: number;
    criados: number;
    duplicados: number;
    ignorados: number;
    erros: number;
    /** Acabou o lote e ainda há e-mails na fila (segue no automático, a cada 15 min). */
    pendente: boolean;
}

/** Recorte do histórico: datas LOCAIS AAAA-MM-DD, as duas inclusivas. */
export interface PeriodoHistorico { de: string; ate: string }
export type AtalhoPeriodo = '7' | '30' | '90' | '365' | 'tudo';
export const ROTULO_ATALHO_PERIODO: Record<AtalhoPeriodo, string> = {
    '7': 'Últimos 7 dias', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias', '365': 'Últimos 12 meses', tudo: 'Todo o histórico',
};

/** Atalho → período terminando hoje (dias corridos, hoje incluído). "tudo" = sem recorte. */
export function periodoDoAtalho(atalho: AtalhoPeriodo, hojeLocal: string): PeriodoHistorico | null {
    if (atalho === 'tudo') return null;
    const [a, m, d] = hojeLocal.split('-').map(Number);
    const ini = new Date(Date.UTC(a, m - 1, d - (Number(atalho) - 1)));
    return { de: ini.toISOString().slice(0, 10), ate: hojeLocal };
}

/** Filtro PostgREST do período: pela data do e-mail e, quando o e-mail não tem
 *  data, pela data de leitura. Fronteiras na meia-noite LOCAL; o último dia entra inteiro. */
export function filtroDoPeriodo(p: PeriodoHistorico): string {
    const ini = new Date(`${p.de}T00:00:00`).toISOString();
    const fimDate = new Date(`${p.ate}T00:00:00`);
    fimDate.setDate(fimDate.getDate() + 1);
    const fim = fimDate.toISOString();
    return `and(data_email.gte."${ini}",data_email.lt."${fim}"),and(data_email.is.null,created_at.gte."${ini}",created_at.lt."${fim}")`;
}

const COLUNAS_BUSCA = 'id, organization_id, account_id, data_de, data_ate, status, total_mensagens, mensagens_processadas, criados, duplicados, ignorados, erros, ultimo_erro, pedida_por, remetentes, created_at, concluida_em';

async function chamar<T>(nome: 'email-capture-accounts' | 'email-capture-sync', body: Record<string, unknown>, padrao: string): Promise<T> {
    const { data, error } = await supabase.functions.invoke(nome, { body });
    if (error) throw await erroDaFunction(error, padrao);
    return data as T;
}

export const emailCaptureService = {
    async listarContas(organizationId: string | null): Promise<ContaCaptura[]> {
        let q = supabase.from('email_capture_accounts').select(COLUNAS_CONTA).order('created_at');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ContaCaptura[];
    },

    async listarRemetentes(organizationId: string | null): Promise<RemetenteCaptura[]> {
        let q = supabase.from('email_capture_senders').select(COLUNAS_REMETENTE).order('created_at');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as RemetenteCaptura[];
    },

    /** Últimas mensagens processadas (histórico da captura), mais recentes primeiro. */
    /** Histórico do período (data do e-mail), inteiro: pagina por `.range()` até a
     *  página vir incompleta — sem `.limit` fixo, que cortava em 300 sem avisar
     *  (guia §6.7, 16/10/2026). `periodo` null = tudo. */
    async listarMensagens(organizationId: string | null, periodo: PeriodoHistorico | null): Promise<MensagemCaptura[]> {
        const PAGINA = 1000;
        const todas: MensagemCaptura[] = [];
        for (let desde = 0; ; desde += PAGINA) {
            let q = supabase.from('email_capture_messages').select(COLUNAS_MENSAGEM)
                .order('created_at', { ascending: false }).order('id', { ascending: false })
                .range(desde, desde + PAGINA - 1);
            if (organizationId) q = q.eq('organization_id', organizationId);
            if (periodo) q = q.or(filtroDoPeriodo(periodo));
            const { data, error } = await q;
            if (error) throw error;
            todas.push(...((data ?? []) as MensagemCaptura[]));
            if (!data || data.length < PAGINA) break;
        }
        return todas;
    },

    /** Contadores das abas: buscas em andamento e falhas ainda sem resolver. Nunca
     *  derruba a tela — sem resposta, as abas ficam sem contador. */
    async resumoDasAbas(organizationId: string | null): Promise<{ buscasEmAndamento: number; falhas: number }> {
        try {
            let qb = supabase.from('email_capture_buscas').select('id', { count: 'exact', head: true })
                .in('status', ['pendente', 'em_andamento']);
            let qf = supabase.from('email_capture_messages').select('id', { count: 'exact', head: true })
                .eq('resultado', 'erro');
            if (organizationId) {
                qb = qb.eq('organization_id', organizationId);
                qf = qf.eq('organization_id', organizationId);
            }
            const [b, f] = await Promise.all([qb, qf]);
            return { buscasEmAndamento: b.count ?? 0, falhas: f.count ?? 0 };
        } catch {
            return { buscasEmAndamento: 0, falhas: 0 };
        }
    },

    /** Mensagem de origem de um boleto capturado (para "Recebido de …" no formulário). */
    async mensagemDoBoleto(emailMessageId: string): Promise<MensagemCaptura | null> {
        const { data, error } = await supabase.from('email_capture_messages').select(COLUNAS_MENSAGEM)
            .eq('id', emailMessageId).maybeSingle();
        if (error) throw error;
        return (data ?? null) as MensagemCaptura | null;
    },

    async conectar(p: { organizationId: string; usuario: string; senha: string; modo: ModoCaptura; dataInicial: string }): Promise<ContaCaptura> {
        const r = await chamar<{ conta: ContaCaptura }>('email-capture-accounts', {
            acao: 'conectar', organizationId: p.organizationId, usuario: p.usuario, senha: p.senha,
            modo: p.modo, data_inicial: p.dataInicial,
        }, 'Não foi possível conectar a caixa.');
        return r.conta;
    },

    async reautenticar(accountId: string, senha: string): Promise<ContaCaptura> {
        const r = await chamar<{ conta: ContaCaptura }>('email-capture-accounts', { acao: 'reautenticar', accountId, senha }, 'Não foi possível reconectar a caixa.');
        return r.conta;
    },

    async testar(accountId: string): Promise<{ ok: boolean; motivo?: string }> {
        return chamar('email-capture-accounts', { acao: 'testar', accountId }, 'Não foi possível testar a caixa.');
    },

    async desconectar(accountId: string): Promise<void> {
        await chamar('email-capture-accounts', { acao: 'desconectar', accountId }, 'Não foi possível desconectar a caixa.');
    },

    /** A função trabalha em lotes curtos quando a chamada vem da tela (~15 s) e
     *  diz se ficou fila (`pendente`); repete até `maxRodadas` e soma (16/10/2026). */
    async sincronizarAgora(accountId: string, maxRodadas = 6): Promise<ResultadoSincronizacao> {
        const soma: ResultadoSincronizacao = { mensagens: 0, criados: 0, duplicados: 0, ignorados: 0, erros: 0, pendente: false };
        for (let i = 0; i < maxRodadas; i++) {
            const r = await chamar<Partial<ResultadoSincronizacao>>('email-capture-sync', { modo: 'agora', accountId }, 'Não foi possível sincronizar a caixa.');
            soma.mensagens += r.mensagens ?? 0;
            soma.criados += r.criados ?? 0;
            soma.duplicados += r.duplicados ?? 0;
            soma.ignorados += r.ignorados ?? 0;
            soma.erros += r.erros ?? 0;
            soma.pendente = !!r.pendente;
            if (!soma.pendente) break;
        }
        return soma;
    },

    /** Buscas por período mais recentes (ativas primeiro na tela). */
    async listarBuscas(organizationId: string | null, limite = 20): Promise<BuscaPeriodo[]> {
        let q = supabase.from('email_capture_buscas').select(COLUNAS_BUSCA).order('created_at', { ascending: false }).limit(limite);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as BuscaPeriodo[];
    },

    /** Cria a busca do período (de/até AAAA-MM-DD) e já processa a primeira parte.
     *  `remetentes` (e-mails ou domínios) restringe a busca; vazio = todos. */
    async buscarPeriodo(accountId: string, de: string, ate: string, remetentes: string[] = []): Promise<BuscaPeriodo | null> {
        const corpo: Record<string, unknown> = { modo: 'periodo', accountId, de, ate };
        if (remetentes.length) corpo.remetentes = remetentes;
        const r = await chamar<{ busca: BuscaPeriodo | null }>('email-capture-sync', corpo, 'Não foi possível iniciar a busca.');
        return r.busca;
    },

    /** Processa a próxima parte da busca ativa da caixa. */
    async continuarBusca(accountId: string): Promise<BuscaPeriodo | null> {
        const r = await chamar<{ busca: BuscaPeriodo | null }>('email-capture-sync', { modo: 'periodo', accountId }, 'Não foi possível continuar a busca.');
        return r.busca;
    },

    async cancelarBusca(buscaId: string): Promise<BuscaPeriodo> {
        const r = await chamar<{ busca: BuscaPeriodo }>('email-capture-sync', { modo: 'cancelar_busca', buscaId }, 'Não foi possível cancelar a busca.');
        return r.busca;
    },

    /** Configuração que o gestor altera direto (a RLS só deixa gestor; GRANT só nestas colunas). */
    async atualizarConta(id: string, patch: Partial<Pick<ContaCaptura, 'modo' | 'data_inicial' | 'modo_piloto' | 'status'>>): Promise<void> {
        const { error } = await supabase.from('email_capture_accounts')
            .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
    },

    async salvarRemetente(id: string | null, r: RemetenteRascunho): Promise<RemetenteCaptura> {
        // Colunas por NOME: o banco só concede INSERT/UPDATE destas (a data da
        // senha é da RPC; id/created_at não se regravam). Espalhar o objeto do
        // formulário mandaria `id` e `pdf_senha_atualizada_em` e levaria 42501.
        const linha = {
            organization_id: r.organization_id,
            account_id: r.account_id,
            supplier_id: r.supplier_id,
            nome: r.nome,
            tipo: r.tipo,
            importacao: r.importacao,
            exigir_dmarc: r.exigir_dmarc,
            ativo: r.ativo,
            email: r.tipo === 'exato' ? (r.email ?? '').trim().toLowerCase() || null : null,
            dominio: r.tipo === 'dominio' ? (r.dominio ?? '').trim().toLowerCase().replace(/^@/, '') || null : null,
            palavras_chave: r.palavras_chave.map(p => p.trim()).filter(Boolean),
        };
        const q = id
            ? supabase.from('email_capture_senders').update(linha).eq('id', id)
            : supabase.from('email_capture_senders').insert(linha);
        const { data, error } = await q.select(COLUNAS_REMETENTE).single();
        if (error) {
            if (error.code === '23505') throw new Error('Este remetente já está cadastrado nesta caixa.');
            if (error.code === '42501') throw new Error('Só gestores da organização podem marcar importação automática.');
            throw error;
        }
        return data as RemetenteCaptura;
    },

    /**
     * Senha dos PDFs do remetente — vai para o cofre (Vault) pela RPC e nunca
     * volta. Vazio/null remove. Concessionárias costumam usar dígitos do
     * CPF/CNPJ do titular da conta.
     */
    async definirSenhaPdf(remetenteId: string, senha: string | null): Promise<void> {
        const { error } = await supabase.rpc('email_capture_definir_senha_pdf', { p_sender: remetenteId, p_senha: senha ?? '' });
        if (error) throw error;
    },

    async excluirRemetente(id: string): Promise<void> {
        const { error } = await supabase.from('email_capture_senders').delete().eq('id', id);
        if (error) throw error;
    },
};
