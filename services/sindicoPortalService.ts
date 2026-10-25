import { supabase } from '../lib/supabase';
import type {
    PortalAvisoCondominio, PortalCondominio, PortalCotaCondominio, PortalDocumentoCondominio,
    PortalOcupante, PortalOrdemCondominio, PortalRateioCondominio, PortalUnidadeCondominio,
} from './clientPortalService';
import type { EstadoDoSindico } from '../utils/acessoDoSindico';
import type { ContaDoCondominio, TituloDoCondominio } from '../utils/financeiroDoSindico';
import type { LinhaPagamentoAvulso } from '../utils/pagamentoAvulso';
import type {
    CotaParaGerar, CriterioDoRateio, PagadorDaCota, PreviaDoRateio, TipoDoRateio,
} from '../utils/rateioDoSindico';
import { linhasParaImportar, type CandidatoDoMovimento, type MovimentoDoExtrato } from '../utils/extratoDoSindico';

/**
 * Portal do Síndico — leitura e gestão do acesso.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Tudo por RPC `sindico_portal_*` (SECURITY DEFINER): o síndico não é membro da
 * organização, e leitura direta de tabela devolveria [] sem erro. A identidade
 * vai em UM de dois campos — `token` (link ou login por e-mail, que entrega o
 * mesmo token) ou `clientId` (prévia do admin, só leitura) — e quem decide se
 * vale é `fn_sindico_resolver`, no banco.
 *
 * O formato é o da aba Condomínio do Portal do Cliente (`PortalCondominio`),
 * com os acréscimos que só o síndico vê: contato dos ocupantes, custo das OS,
 * documentos internos, leituras dos avisos e a situação do título de cada cota.
 */

export type IdentidadeDoSindico = { token: string; clientId?: undefined } | { clientId: string; token?: undefined };

export interface OcupanteParaSindico extends PortalOcupante {
    clientId: string;
    email: string | null;
    telefone: string | null;
    desde: string | null;
}

export interface UnidadeParaSindico extends Omit<PortalUnidadeCondominio, 'ocupacoes'> {
    ocupacoes: OcupanteParaSindico[];
}

export interface AvisoParaSindico extends PortalAvisoCondominio {
    publicadoPor: string | null;
    validoAte: string | null;
    vigente: boolean;
    condominioId: string;
    leituras: number;
    /** Publicado pelo próprio síndico — só esses ele encerra (F2). */
    meu: boolean;
}

export interface DocumentoParaSindico extends PortalDocumentoCondominio {
    visivelPortal: boolean;
}

export interface OrdemParaSindico extends PortalOrdemCondominio {
    custo: number | null;
}

export interface CotaParaSindico extends PortalCotaCondominio {
    tituloStatus: string | null;
    tituloNegocio: string | null;
    vencimento: string | null;
    pagoEm: string | null;
}

export interface RateioParaSindico extends Omit<PortalRateioCondominio, 'cotas'> {
    condominioId: string;
    cotas: CotaParaSindico[];
    /** Decisão do síndico (F3). `desatualizada` = o rateio mudou depois dela. */
    aprovacao?: {
        status: 'APROVADO' | 'DEVOLVIDO' | null;
        em: string | null;
        porNome: string | null;
        observacao: string | null;
        desatualizada: boolean;
    };
}

export interface EventoDoChamado {
    autorTipo: 'EQUIPE' | 'SINDICO' | 'MORADOR' | 'SISTEMA';
    autorNome: string | null;
    mensagem: string | null;
    statusAnterior: string | null;
    statusNovo: string | null;
    criadoEm: string;
}

/** Chamado de morador numa unidade do prédio (F2). */
export interface ChamadoParaSindico {
    id: string;
    titulo: string;
    descricao: string | null;
    categoria: string;
    prioridade: string;
    status: string;
    abertoEm: string;
    resolvidoEm: string | null;
    notaDaEquipe: string | null;
    unitId: string;
    unidade: string;
    torre: string | null;
    morador: string | null;
    moradorEmail: string | null;
    moradorTelefone: string | null;
    condominioId: string;
    condominioNome: string;
    eventos: EventoDoChamado[];
}

/** Vocabulário do CHECK de `client_requests.status`. */
export const SITUACOES_DO_CHAMADO = ['Aberto', 'Em Andamento', 'Aguardando', 'Resolvido', 'Cancelado'] as const;
/** Vocabulário do CHECK de `condominio_avisos.categoria`. */
export const CATEGORIAS_DE_AVISO = [
    { id: 'AVISO', label: 'Aviso' }, { id: 'URGENTE', label: 'Urgente' }, { id: 'MANUTENCAO', label: 'Manutenção' },
    { id: 'ASSEMBLEIA', label: 'Assembleia' }, { id: 'OBRA', label: 'Obra' },
] as const;

export interface CondominioDoSindico {
    id: string;
    codigo: string | null;
    nome: string;
    cnpj: string | null;
    razaoSocial: string | null;
    cidade: string | null;
    mandatoInicio: string | null;
    mandatoFim: string | null;
    /** Fechar rateio exige a aprovação do síndico (F3). */
    exigeAprovacao?: boolean;
}

export interface PortalSindico extends Omit<PortalCondominio, 'unidades' | 'avisos' | 'documentos' | 'ordens' | 'rateios'> {
    sindico: { clientId: string; nome: string; email: string | null } | null;
    condominios: CondominioDoSindico[];
    unidades: UnidadeParaSindico[];
    avisos: AvisoParaSindico[];
    documentos: DocumentoParaSindico[];
    ordens: OrdemParaSindico[];
    rateios: RateioParaSindico[];
    chamados: ChamadoParaSindico[];
}

// ── Financeiro do condomínio (24/10/2026) ───────────────────────────────────
// Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md

/** Cadastros que o formulário de lançamento usa, por condomínio (a org de cada um). */
export interface CondominioDoFinanceiro {
    id: string;
    nome: string;
    codigo: string | null;
    /** Só condomínio com organização própria grava pelo portal. */
    podeOperar: boolean;
    motivoNaoOpera: string | null;
    centros: { id: string; code: string; name: string; parentId: string | null }[];
    categorias: { id: string; name: string; parentId: string | null; nature: string | null }[];
    planos: { id: string; code: string | null; name: string }[];
    contas: { id: string; name: string; bank: string | null }[];
    fornecedores: { id: string; name: string; nickname: string | null; document: string | null; category: string | null }[];
}

export interface FinanceiroDoSindico {
    /** 'YYYY-MM-01' */
    competencia: string;
    /** 'YYYY-MM-DD' em Brasília, do banco. */
    hoje: string;
    condominios: CondominioDoFinanceiro[];
    titulos: TituloDoCondominio[];
}

/** Código e nome do arquivo de origem de um título (o caminho fica no servidor). */
export interface DocumentoDoTitulo { codigo: string | null; nome: string | null }

/** Campos de UMA linha de título que o síndico informa (o resto o banco força). */
export type LinhaDoSindico = Pick<LinhaPagamentoAvulso,
    'description' | 'amount' | 'due_date' | 'competencia_date' | 'supplier_id' | 'party_name'
    | 'cost_center_id' | 'plano_de_contas_id' | 'category_id' | 'payment_type' | 'payment_account_id' | 'installment_type'>;

export interface AnexoEnviado { path: string; nome: string }

export interface FornecedorNovo {
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    contact_name?: string;
    category?: string;
    pix_key?: string;
    pix_key_type?: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
    bank_name?: string;
    agency?: string;
    account?: string;
}

const params = (id: IdentidadeDoSindico) => ({ p_token: id.token ?? null, p_client_id: id.clientId ?? null });

const FN_FINANCEIRO = 'sindico-portal-financeiro';

/** RPC de escrita: `{ok:false, motivo}` vira erro com o motivo do banco. */
async function escrever(rpc: string, args: Record<string, unknown>, padrao: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (!r.ok) throw new Error(r.motivo || padrao);
    return r as Record<string, unknown>;
}

/** Motivo do corpo de uma Edge Function que respondeu 4xx (o supabase-js só diz "non-2xx"). */
async function motivoDaFunction(error: unknown, padrao: string): Promise<string> {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return corpo?.error || padrao;
}

export const sindicoPortalService = {
    /** Os dados do portal. `ok:false` traz o `motivo` que a tela mostra. */
    async getDados(id: IdentidadeDoSindico): Promise<PortalSindico> {
        const { data, error } = await supabase.rpc('sindico_portal_dados', params(id));
        if (error) throw new Error(error.message);
        return data as PortalSindico;
    },

    /** Endereço de um documento (assinado quando é arquivo do bucket). */
    async abrirDocumento(id: IdentidadeDoSindico, documentoId: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('client-portal-condominio-download', {
            body: { portal: 'sindico', ...id, documentoId },
        });
        if (error) throw new Error(await motivoDaFunction(error, 'Não foi possível abrir o documento.'));
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    },

    /** Comprovantes de um rateio, já assinados, para o PDF anexar. */
    async comprovantesDoRateio(id: IdentidadeDoSindico, rateioId: string): Promise<{ despesaId: string; url: string; nome: string }[]> {
        const { data, error } = await supabase.functions.invoke('client-portal-rateio-comprovantes', {
            body: { portal: 'sindico', ...id, rateioId },
        });
        if (error) throw new Error(await motivoDaFunction(error, 'o serviço de comprovantes não respondeu'));
        if (!Array.isArray(data?.comprovantes)) throw new Error(data?.error || 'Não foi possível buscar os comprovantes.');
        return data.comprovantes;
    },

    // ── Escritas do síndico (F2) — modo 'escrever': token ou o próprio síndico
    //    logado; a prévia do admin NÃO grava (o banco recusa membro).

    async publicarAviso(id: IdentidadeDoSindico, aviso: {
        condominioId: string; titulo: string; corpo: string; categoria: string; validoAte: string | null;
    }): Promise<void> {
        await escrever('sindico_portal_publicar_aviso', {
            ...params(id), p_empreendimento_id: aviso.condominioId, p_titulo: aviso.titulo,
            p_corpo: aviso.corpo, p_categoria: aviso.categoria, p_valido_ate: aviso.validoAte || null,
        }, 'Não foi possível publicar o aviso.');
    },

    async encerrarAviso(id: IdentidadeDoSindico, avisoId: string): Promise<void> {
        await escrever('sindico_portal_encerrar_aviso', { ...params(id), p_aviso_id: avisoId }, 'Não foi possível encerrar o aviso.');
    },

    async responderChamado(id: IdentidadeDoSindico, chamadoId: string, mensagem: string, novoStatus: string | null): Promise<void> {
        await escrever('sindico_portal_responder_chamado', {
            ...params(id), p_request_id: chamadoId, p_mensagem: mensagem, p_novo_status: novoStatus,
        }, 'Não foi possível responder o chamado.');
    },

    /** Aprovar/devolver (F3). O banco exige LOGIN (modo 'sessao'): pelo link
     *  sem senha a RPC recusa, e a tela já diz isso antes. */
    async decidirRateio(id: IdentidadeDoSindico, rateioId: string, decisao: 'APROVADO' | 'DEVOLVIDO', observacao: string): Promise<void> {
        await escrever('sindico_portal_decidir_rateio', {
            ...params(id), p_rateio_id: rateioId, p_decisao: decisao, p_observacao: observacao,
        }, 'Não foi possível registrar a decisão.');
    },

    // ── Financeiro do condomínio (24/10/2026) ───────────────────────────────
    //    Leitura no modo 'ler' (link, login e prévia); escrita no modo 'sessao'
    //    (só o síndico logado) — o banco recusa o resto com o motivo.

    async getFinanceiro(id: IdentidadeDoSindico, competencia: string): Promise<FinanceiroDoSindico> {
        const { data, error } = await supabase.rpc('sindico_portal_financeiro', { ...params(id), p_competencia: competencia });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as FinanceiroDoSindico & { ok?: boolean; motivo?: string };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível carregar o financeiro.');
        return { competencia: r.competencia, hoje: r.hoje, condominios: r.condominios ?? [], titulos: r.titulos ?? [] };
    },

    /** Código e nome do documento de cada título — a lista não traz caminho de arquivo. */
    async documentosDosTitulos(id: IdentidadeDoSindico, ids: string[]): Promise<Record<string, DocumentoDoTitulo>> {
        if (ids.length === 0) return {};
        const { data, error } = await supabase.functions.invoke(FN_FINANCEIRO, { body: { acao: 'documentos', ...id, ids } });
        if (error) throw new Error(await motivoDaFunction(error, 'Não foi possível ler os documentos.'));
        return (data?.documentos ?? {}) as Record<string, DocumentoDoTitulo>;
    },

    async abrirDocumentoDoTitulo(id: IdentidadeDoSindico, tituloId: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke(FN_FINANCEIRO, { body: { acao: 'abrir', ...id, tituloId } });
        if (error) throw new Error(await motivoDaFunction(error, 'Não foi possível abrir o documento.'));
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    },

    /** Sobe o anexo para a pasta do síndico na org do condomínio (só com login). */
    async enviarAnexo(id: IdentidadeDoSindico, condominioId: string, arquivo: File): Promise<AnexoEnviado> {
        const form = new FormData();
        if (id.token) form.append('token', id.token);
        if (id.clientId) form.append('clientId', id.clientId);
        form.append('empreendimentoId', condominioId);
        form.append('file', arquivo);
        const { data, error } = await supabase.functions.invoke(FN_FINANCEIRO, { body: form });
        if (error) throw new Error(await motivoDaFunction(error, 'Não foi possível enviar o anexo.'));
        if (!data?.path) throw new Error(data?.error || 'Não foi possível enviar o anexo.');
        return { path: data.path as string, nome: (data.nome as string) || arquivo.name };
    },

    /** Apaga um anexo enviado cujo lançamento foi recusado. Best-effort. */
    async descartarAnexo(id: IdentidadeDoSindico, condominioId: string, path: string): Promise<void> {
        await supabase.functions.invoke(FN_FINANCEIRO, { body: { acao: 'descartar', ...id, empreendimentoId: condominioId, path } })
            .catch(() => undefined);
    },

    async lancarPagar(id: IdentidadeDoSindico, condominioId: string, parcelas: LinhaDoSindico[], opcoes: {
        documento?: AnexoEnviado | null; jaPago?: boolean; dataPagamento?: string | null;
    } = {}): Promise<string[]> {
        const r = await escrever('sindico_portal_lancar_pagar', {
            ...params(id), p_empreendimento_id: condominioId, p_parcelas: parcelas,
            p_documento: opcoes.documento ?? null, p_ja_pago: !!opcoes.jaPago, p_data_pagamento: opcoes.dataPagamento || null,
        }, 'Não foi possível lançar a conta.');
        return (r.ids as string[]) ?? [];
    },

    async editarTitulo(id: IdentidadeDoSindico, tituloId: string, dados: LinhaDoSindico, anexo: {
        novo?: AnexoEnviado | null; remover?: boolean;
    } = {}): Promise<void> {
        await escrever('sindico_portal_editar_titulo', {
            ...params(id), p_titulo_id: tituloId, p_dados: dados,
            p_documento: anexo.novo ?? null, p_remover_documento: !!anexo.remover,
        }, 'Não foi possível salvar o título.');
    },

    async cancelarTitulo(id: IdentidadeDoSindico, tituloId: string, motivo: string): Promise<void> {
        await escrever('sindico_portal_cancelar_titulo', { ...params(id), p_titulo_id: tituloId, p_motivo: motivo },
            'Não foi possível cancelar o título.');
    },

    async baixarTitulo(id: IdentidadeDoSindico, tituloId: string, pagamento: {
        data: string; forma: string | null; contaId: string | null;
    }): Promise<void> {
        await escrever('sindico_portal_baixar_titulo', {
            ...params(id), p_titulo_id: tituloId, p_data: pagamento.data, p_forma: pagamento.forma, p_conta: pagamento.contaId,
        }, 'Não foi possível dar baixa.');
    },

    /** `existente` = CPF/CNPJ já cadastrado (passa a valer neste condomínio, sem duplicar). */
    async salvarFornecedor(id: IdentidadeDoSindico, condominioId: string, dados: FornecedorNovo): Promise<{ id: string; nome: string; existente: boolean }> {
        const r = await escrever('sindico_portal_salvar_fornecedor', {
            ...params(id), p_empreendimento_id: condominioId, p_dados: dados,
        }, 'Não foi possível cadastrar o fornecedor.');
        return { id: r.id as string, nome: r.nome as string, existente: !!r.existente };
    },

    // ── Conta bancária e recebimentos (G2a, 24/10/2026) ─────────────────────

    async getContas(id: IdentidadeDoSindico, condominioId: string): Promise<ContaDoCondominio[]> {
        const { data, error } = await supabase.rpc('sindico_portal_contas', { ...params(id), p_empreendimento_id: condominioId });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { ok?: boolean; motivo?: string; contas?: ContaDoCondominio[] };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível carregar as contas.');
        return r.contas ?? [];
    },

    /** `contaId` vazio = conta nova. */
    async salvarConta(id: IdentidadeDoSindico, condominioId: string, contaId: string | null, dados: {
        nome: string; tipo: 'banco' | 'caixa'; banco: string; agencia: string; numero: string; descricao: string;
        saldoInicial: number; saldoInicialEm: string | null; ativa: boolean;
    }): Promise<string> {
        const r = await escrever('sindico_portal_salvar_conta', {
            ...params(id), p_empreendimento_id: condominioId, p_conta_id: contaId, p_dados: dados,
        }, 'Não foi possível salvar a conta.');
        return r.id as string;
    },

    async receberTitulo(id: IdentidadeDoSindico, tituloId: string, recebimento: {
        data: string; forma: string | null; contaId: string | null;
    }): Promise<void> {
        await escrever('sindico_portal_receber_titulo', {
            ...params(id), p_titulo_id: tituloId, p_data: recebimento.data, p_forma: recebimento.forma, p_conta: recebimento.contaId,
        }, 'Não foi possível registrar o recebimento.');
    },

    async desfazerBaixa(id: IdentidadeDoSindico, tituloId: string, motivo: string): Promise<void> {
        await escrever('sindico_portal_desfazer_baixa', { ...params(id), p_titulo_id: tituloId, p_motivo: motivo },
            'Não foi possível desfazer a baixa.');
    },

    async lancarReceber(id: IdentidadeDoSindico, condominioId: string, linha: {
        description: string; amount: number; due_date: string; competencia_date: string | null;
        cost_center_id: string; category_id: string; plano_de_contas_id: string | null;
        client_id: string | null; party_name: string | null; payment_type: string | null; payment_account_id: string | null;
    }, opcoes: { jaRecebido: boolean; dataRecebimento: string | null }): Promise<string> {
        const r = await escrever('sindico_portal_lancar_receber', {
            ...params(id), p_empreendimento_id: condominioId, p_linha: linha,
            p_ja_recebido: opcoes.jaRecebido, p_data_recebimento: opcoes.dataRecebimento,
        }, 'Não foi possível lançar a receita.');
        return r.id as string;
    },

    // ── Extrato e conciliação (G2b, 25/10/2026) ─────────────────────────────

    async getExtrato(id: IdentidadeDoSindico, contaId: string, inicio: string, fim: string): Promise<{
        movimentos: MovimentoDoExtrato[];
        importacoes: { arquivo: string; formato: string; em: string; lidas: number; inseridas: number; repetidas: number;
            inicio: string | null; fim: string | null; saldoBanco: number | null; saldoEm: string | null }[];
        temMovimento: boolean;
    }> {
        const { data, error } = await supabase.rpc('sindico_portal_extrato', {
            ...params(id), p_conta_id: contaId, p_inicio: inicio, p_fim: fim,
        });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { ok?: boolean; motivo?: string; linhas?: MovimentoDoExtrato[]; importacoes?: []; temMovimento?: boolean };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível carregar o extrato.');
        return { movimentos: r.linhas ?? [], importacoes: r.importacoes ?? [], temMovimento: !!r.temMovimento };
    },

    /**
     * Lê o arquivo NO NAVEGADOR (o mesmo `parseStatementFile` do admin) e manda
     * as linhas; o banco recalcula assinatura e duplicidade. Recusa antes, com o
     * motivo, o arquivo de OUTRA conta (número do OFX × número cadastrado).
     */
    async importarExtrato(id: IdentidadeDoSindico, conta: { id: string; numero: string | null; nome: string }, arquivo: File): Promise<{
        inseridas: number; jaExistiam: number; outroFormato: number; lidas: number; descartadas: number;
    }> {
        const { parseStatementFile, accountMatches } = await import('./bankStatementParsers');
        const lido = await parseStatementFile(arquivo);
        if (accountMatches(lido.header.acctId, conta.numero) === false) {
            throw new Error(`O arquivo é da conta ${lido.header.acctId}, mas a conta escolhida é "${conta.nome}" (${conta.numero}). Nada foi importado.`);
        }
        if (lido.transactions.length === 0) {
            throw new Error(lido.avisos.length > 0 ? lido.avisos.join(' ') : 'O arquivo não tem movimentos.');
        }
        const r = await escrever('sindico_portal_extrato_importar', {
            ...params(id), p_conta_id: conta.id,
            p_arquivo: {
                nome: arquivo.name, formato: lido.format, acctId: lido.header.acctId ?? null,
                saldo: lido.header.ledgerBalance ?? null, saldoEm: lido.header.ledgerBalanceDate ?? null,
                inicio: lido.header.dtStart ?? null, fim: lido.header.dtEnd ?? null, descartadas: lido.skipped,
            },
            p_linhas: linhasParaImportar(lido.transactions),
        }, 'Não foi possível importar o extrato.');
        return {
            inseridas: Number(r.inseridas) || 0, jaExistiam: Number(r.jaExistiam) || 0, outroFormato: Number(r.outroFormato) || 0,
            lidas: Number(r.lidas) || 0, descartadas: lido.skipped,
        };
    },

    async candidatosDoMovimento(id: IdentidadeDoSindico, movimentoId: string): Promise<CandidatoDoMovimento[]> {
        const { data, error } = await supabase.rpc('sindico_portal_extrato_candidatos', { ...params(id), p_bank_id: movimentoId });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { ok?: boolean; motivo?: string; candidatos?: CandidatoDoMovimento[] };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível buscar os títulos.');
        return r.candidatos ?? [];
    },

    async conciliarMovimento(id: IdentidadeDoSindico, movimentoId: string, tituloId: string, categoriaAjuste: string | null): Promise<void> {
        await escrever('sindico_portal_extrato_conciliar', {
            ...params(id), p_bank_id: movimentoId, p_titulo_id: tituloId, p_categoria_ajuste: categoriaAjuste,
        }, 'Não foi possível conciliar.');
    },

    async desfazerVinculo(id: IdentidadeDoSindico, matchId: string): Promise<void> {
        await escrever('sindico_portal_extrato_desfazer', { ...params(id), p_match_id: matchId }, 'Não foi possível desfazer o vínculo.');
    },

    async ignorarMovimento(id: IdentidadeDoSindico, movimentoId: string, motivo: string | null, restaurar: boolean): Promise<void> {
        await escrever('sindico_portal_extrato_ignorar', {
            ...params(id), p_bank_id: movimentoId, p_motivo: motivo, p_restaurar: restaurar,
        }, restaurar ? 'Não foi possível restaurar o movimento.' : 'Não foi possível ignorar o movimento.');
    },

    /** Cria o título a partir do movimento (valor, data e sentido vêm do extrato) e concilia. */
    async lancarDoMovimento(id: IdentidadeDoSindico, movimentoId: string, linha: {
        description: string; cost_center_id: string; category_id: string; plano_de_contas_id: string | null;
        supplier_id: string | null; party_name: string | null;
    }): Promise<void> {
        await escrever('sindico_portal_extrato_lancar', { ...params(id), p_bank_id: movimentoId, p_linha: linha },
            'Não foi possível lançar e conciliar.');
    },

    // ── Rateio pelo síndico (G1, 24/10/2026) ────────────────────────────────
    //    O banco recalcula tudo (`fn_rateio_calcular`); daqui só vão os
    //    parâmetros e o texto podado das despesas.
    //    Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md

    async rateioPrevia(id: IdentidadeDoSindico, condominioId: string, p: {
        competencia: string; criterio: CriterioDoRateio; pagador: PagadorDaCota; grupo: string[]; valorFixo: number | null;
    }): Promise<PreviaDoRateio> {
        const { data, error } = await supabase.rpc('sindico_portal_rateio_previa', {
            ...params(id), p_empreendimento_id: condominioId, p_competencia: p.competencia, p_criterio: p.criterio,
            p_pagador: p.pagador, p_grupo: p.grupo, p_valor_fixo: p.valorFixo,
        });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as PreviaDoRateio & { ok?: boolean; motivo?: string };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível calcular a prévia.');
        return r;
    },

    async rateioSalvar(id: IdentidadeDoSindico, condominioId: string, p: {
        competencia: string; tipo: TipoDoRateio; criterio: CriterioDoRateio; pagador: PagadorDaCota;
        grupo: string[]; valorFixo: number | null; descricoes: Record<string, string>; observacoes: string;
    }): Promise<string> {
        const r = await escrever('sindico_portal_rateio_salvar', {
            ...params(id), p_empreendimento_id: condominioId, p_competencia: p.competencia, p_tipo: p.tipo,
            p_criterio: p.criterio, p_pagador: p.pagador, p_grupo: p.grupo, p_valor_fixo: p.valorFixo,
            p_descricoes: p.descricoes, p_observacoes: p.observacoes || null,
        }, 'Não foi possível salvar o rateio.');
        return r.id as string;
    },

    async rateioFechar(id: IdentidadeDoSindico, rateioId: string): Promise<string> {
        const r = await escrever('sindico_portal_rateio_fechar', { ...params(id), p_rateio_id: rateioId, p_descricoes: {} },
            'Não foi possível fechar o rateio.');
        return r.numero as string;
    },

    async rateioCancelar(id: IdentidadeDoSindico, rateioId: string, motivo: string): Promise<void> {
        await escrever('sindico_portal_rateio_cancelar', { ...params(id), p_rateio_id: rateioId, p_motivo: motivo },
            'Não foi possível cancelar o rateio.');
    },

    async rateioCotas(id: IdentidadeDoSindico, rateioId: string, pagador: PagadorDaCota): Promise<CotaParaGerar[]> {
        const { data, error } = await supabase.rpc('sindico_portal_rateio_cotas', { ...params(id), p_rateio_id: rateioId, p_pagador: pagador });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { ok?: boolean; motivo?: string; cotas?: CotaParaGerar[] };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível carregar as cotas.');
        return r.cotas ?? [];
    },

    async rateioGerarCotas(id: IdentidadeDoSindico, rateioId: string, vencimento: string, pagador: PagadorDaCota): Promise<{
        criados: number; pulados: number; falhas: { unitLabel: string; motivo: string }[];
    }> {
        const r = await escrever('sindico_portal_rateio_gerar_cotas', {
            ...params(id), p_rateio_id: rateioId, p_vencimento: vencimento, p_pagador: pagador,
        }, 'Não foi possível gerar as cotas.');
        return {
            criados: Number(r.criados) || 0,
            pulados: Number(r.pulados) || 0,
            falhas: (r.falhas as { unitLabel: string; motivo: string }[]) ?? [],
        };
    },

    // ── Admin (Portais › Portal do Condomínio) ──────────────────────────────

    /** Quem é o síndico, o mandato e o estado do link. O token só vem para gestor. */
    async estado(empreendimentoId: string): Promise<EstadoDoSindico & { ok: boolean; motivo?: string; podeGerir: boolean }> {
        const { data, error } = await supabase.rpc('sindico_portal_estado', { p_empreendimento_id: empreendimentoId });
        if (error) throw new Error(error.message);
        const r = data as EstadoDoSindico & { ok: boolean; motivo?: string; podeGerir: boolean };
        return { ...r, sindico: r.sindico ?? null, acesso: r.acesso ?? null };
    },

    /** `renovar=false` reaproveita o link vivo; `true` troca e invalida o anterior. */
    async gerarLink(empreendimentoId: string, renovar = false): Promise<string> {
        const { data, error } = await supabase.rpc('sindico_portal_gerar_token', {
            p_empreendimento_id: empreendimentoId, p_renovar: renovar,
        });
        if (error) throw new Error(error.message);
        const r = data as { ok: boolean; token?: string; motivo?: string };
        if (!r.ok || !r.token) throw new Error(r.motivo || 'Não foi possível gerar o link.');
        return `${window.location.origin}/portal-sindico?token=${r.token}`;
    },

    async revogar(clientId: string): Promise<void> {
        const { data, error } = await supabase.rpc('sindico_portal_revogar_token', { p_client_id: clientId });
        if (error) throw new Error(error.message);
        const r = data as { ok: boolean; motivo?: string };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível revogar o acesso.');
    },
};
