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

const COLUNAS_CONTA = 'id, organization_id, provedor, host, porta, usuario, status, modo, data_inicial, modo_piloto, last_sync_at, ultimo_erro, created_by_email, created_at';
const COLUNAS_REMETENTE = 'id, organization_id, account_id, supplier_id, nome, tipo, email, dominio, palavras_chave, importacao, exigir_dmarc, ativo, pdf_senha_atualizada_em, created_at';
const COLUNAS_MENSAGEM = 'id, organization_id, account_id, remetente, assunto, data_email, documento_nome, resultado, motivo, erro, tentativas, boleto_id, auth_results, created_at';

/** Rótulos — a tela mostra exatamente estes textos (e o filtro avançado compara com eles). */
export const ROTULO_STATUS_CONTA: Record<StatusConta, string> = {
    ativa: 'Ativa', pausada: 'Pausada', reautenticar: 'Reconectar', desconectada: 'Desconectada',
};
export const ROTULO_MODO: Record<ModoCaptura, string> = {
    favoritos: 'Só remetentes monitorados', todos: 'Todos os remetentes', hibrido: 'Híbrido',
};
export const ROTULO_RESULTADO: Record<ResultadoMensagem, string> = {
    processando: 'Processando', criado: 'Boleto criado', duplicado: 'Duplicado', ignorado: 'Ignorado', erro: 'Falhou',
};

/** Mensagem útil de uma Edge Function: a resposta 4xx chega como erro com a Response em `context`. */
async function erroDaFunction(error: unknown, padrao: string): Promise<Error> {
    const ctx = (error as { context?: Response } | null)?.context;
    const corpo = await ctx?.json?.().catch(() => null) as { error?: string; motivo?: string } | null;
    return new Error(corpo?.error ?? corpo?.motivo ?? (error as Error)?.message ?? padrao);
}

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
    async listarMensagens(organizationId: string | null, limite = 300): Promise<MensagemCaptura[]> {
        let q = supabase.from('email_capture_messages').select(COLUNAS_MENSAGEM)
            .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limite);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as MensagemCaptura[];
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

    async sincronizarAgora(accountId: string): Promise<{ mensagens: number; criados: number; duplicados: number; ignorados: number; erros: number }> {
        return chamar('email-capture-sync', { modo: 'agora', accountId }, 'Não foi possível sincronizar a caixa.');
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
