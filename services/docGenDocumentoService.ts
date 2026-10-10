import { supabase } from '../lib/supabase';
import { approvalService, type RoleLabels } from './approvalService';
import type {
    DocGenAssinatura, DocGenDocumento, DocGenDocumentoRascunho, DocGenDocumentoStatus, DocGenDocumentoVersao, DocGenEvento, DocGenModelo,
    DocGenSituacaoTramitacao, DocGenVinculo, DocGenVinculoTipo,
} from '../types/docGen';

/**
 * Documentos gerados (Documentos › Ofícios) — F2: rascunho.
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * - O documento nasce RASCUNHO e SEM número (número só na emissão, F3).
 * - Cada `salvar` sobe `versao` e guarda o rascunho inteiro em
 *   `doc_gen_documento_versoes` — "v1 João 10:32, v2 Maria 11:14".
 * - REGRA #5: `list(orgId)` só aplica `.eq` quando há organização.
 * - Emitido não se edita por aqui (a trava de banco vem na F3; aqui a recusa
 *   é do serviço, para a tela nunca gravar por cima de um emitido).
 * - F4: aprovação (approvalService, entidade `doc_gen_documento`), assinatura
 *   (`doc_gen_assinar`), tramitação (`doc_gen_tramitar`), histórico e vínculos.
 *   As regras valem no banco; aqui só se chama e se explica.
 */
const COLUNAS = [
    'id', 'organization_id', 'company_id', 'modelo_id', 'modelo_versao', 'tipo_documental', 'status', 'numero', 'assunto',
    'data_documento', 'cidade', 'department_id', 'destinatario_tipo', 'destinatario_id', 'destinatario_snapshot',
    'project_id', 'empreendimento_id', 'contract_id', 'client_id', 'supplier_id', 'valores', 'conteudo', 'signatarios',
    'anexos', 'documento_relacionado_id', 'resposta_esperada_ate', 'versao', 'ged_document_id', 'ged_version_id',
    'emitido_por', 'emitido_em', 'approval_status', 'approval_chain', 'approval_required_levels',
    'created_by', 'created_at', 'updated_at',
].join(', ');

/** Linha da lista: sem os blocos pesados (conteúdo e valores). */
const COLUNAS_LISTA = [
    'id', 'organization_id', 'company_id', 'modelo_id', 'modelo_versao', 'tipo_documental', 'status', 'numero', 'assunto',
    'data_documento', 'cidade', 'department_id', 'destinatario_tipo', 'destinatario_id', 'destinatario_snapshot',
    'project_id', 'empreendimento_id', 'contract_id', 'client_id', 'supplier_id', 'signatarios', 'anexos',
    'documento_relacionado_id', 'resposta_esperada_ate', 'versao', 'ged_document_id', 'ged_version_id', 'emitido_por', 'emitido_em',
    'approval_status', 'approval_chain', 'approval_required_levels', 'created_by', 'created_at', 'updated_at',
].join(', ');

const COLUNAS_VINCULO = 'id, organization_id, de_documento_id, de_ged_id, para_documento_id, para_ged_id, tipo, observacao, created_by, created_at';

function normalizar(row: Record<string, unknown>): DocGenDocumento {
    const objeto = <T>(v: unknown, padrao: T): T => (v && typeof v === 'object' ? (v as T) : padrao);
    return {
        ...(row as unknown as DocGenDocumento),
        valores: objeto(row.valores, {} as Record<string, string>),
        conteudo: objeto(row.conteudo, {} as DocGenDocumento['conteudo']),
        signatarios: Array.isArray(row.signatarios) ? (row.signatarios as DocGenDocumento['signatarios']) : [],
        anexos: Array.isArray(row.anexos) ? (row.anexos as DocGenDocumento['anexos']) : [],
        approval_status: (row.approval_status as DocGenDocumento['approval_status']) ?? 'RASCUNHO',
        approval_chain: Array.isArray(row.approval_chain) ? (row.approval_chain as DocGenDocumento['approval_chain']) : [],
        approval_required_levels: Number(row.approval_required_levels) || 1,
    };
}

/** O rascunho (o que o formulário edita) a partir do documento gravado. */
export function rascunhoDoDocumento(doc: DocGenDocumento): DocGenDocumentoRascunho {
    const {
        id: _id, status: _s, numero: _n, versao: _v, ged_document_id: _g, ged_version_id: _gv, emitido_por: _ep, emitido_em: _ee,
        approval_status: _as, approval_chain: _ac, approval_required_levels: _al, created_by: _cb, created_at: _ca, updated_at: _ua,
        ...resto
    } = doc;
    return resto;
}

/** Situações em que o ofício emitido ainda espera resposta. */
export const SITUACOES_EM_CURSO: DocGenDocumentoStatus[] = ['EMITIDO', 'ENVIADO', 'RECEBIDO'];

/** Para onde cada situação pode ir (espelha `doc_gen_tramitar`; quem decide é o banco). */
export const TRANSICOES: Record<DocGenDocumentoStatus, DocGenSituacaoTramitacao[]> = {
    RASCUNHO: [],
    EMITIDO: ['ENVIADO', 'RECEBIDO', 'RESPONDIDO', 'ENCERRADO', 'CANCELADO'],
    ENVIADO: ['RECEBIDO', 'RESPONDIDO', 'ENCERRADO', 'CANCELADO'],
    RECEBIDO: ['RESPONDIDO', 'ENCERRADO', 'CANCELADO'],
    RESPONDIDO: ['ENCERRADO'],
    ENCERRADO: [],
    CANCELADO: [],
};

/** Mensagem do erro do PostgREST/RPC (o banco já escreve em português). */
const mensagem = (e: { message?: string } | null | undefined, padrao: string) => e?.message?.trim() || padrao;

async function emailDaSessao(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
}

/** Rascunho vazio a partir de um modelo — o que "Novo ofício" abre. */
export function rascunhoDoModelo(modelo: DocGenModelo, extras?: Partial<DocGenDocumentoRascunho>): DocGenDocumentoRascunho {
    return {
        organization_id: modelo.organization_id,
        company_id: null,
        modelo_id: modelo.id,
        modelo_versao: modelo.versao,
        tipo_documental: modelo.tipo_documental,
        assunto: '',
        data_documento: null,
        cidade: null,
        department_id: modelo.department_id,
        destinatario_tipo: null,
        destinatario_id: null,
        destinatario_snapshot: null,
        project_id: null,
        empreendimento_id: null,
        contract_id: null,
        client_id: null,
        supplier_id: null,
        valores: {},
        conteudo: {},
        signatarios: [],
        anexos: [],
        documento_relacionado_id: null,
        resposta_esperada_ate: null,
        ...extras,
    };
}

/** O que vai para o banco (e para a versão): só os campos editáveis. */
function payloadDe(r: DocGenDocumentoRascunho): DocGenDocumentoRascunho {
    return {
        organization_id: r.organization_id,
        company_id: r.company_id,
        modelo_id: r.modelo_id,
        modelo_versao: r.modelo_versao,
        tipo_documental: r.tipo_documental,
        assunto: r.assunto ?? '',
        data_documento: r.data_documento || null,
        cidade: r.cidade?.trim() || null,
        department_id: r.department_id,
        destinatario_tipo: r.destinatario_tipo,
        destinatario_id: r.destinatario_tipo === 'MANUAL' ? null : r.destinatario_id,
        destinatario_snapshot: r.destinatario_snapshot,
        project_id: r.project_id,
        empreendimento_id: r.empreendimento_id,
        contract_id: r.contract_id,
        client_id: r.client_id,
        supplier_id: r.supplier_id,
        valores: Object.fromEntries(Object.entries(r.valores ?? {}).filter(([, v]) => v && v.trim())),
        conteudo: r.conteudo ?? {},
        signatarios: r.signatarios ?? [],
        anexos: r.anexos ?? [],
        documento_relacionado_id: r.documento_relacionado_id,
        resposta_esperada_ate: r.resposta_esperada_ate || null,
    };
}

export const docGenDocumentoService = {
    async list(organizationId?: string | null, opts?: { status?: DocGenDocumentoStatus }): Promise<DocGenDocumento[]> {
        let q = supabase.from('doc_gen_documentos').select(COLUNAS_LISTA).order('updated_at', { ascending: false }).order('id');
        if (organizationId) q = q.eq('organization_id', organizationId);
        if (opts?.status) q = q.eq('status', opts.status);
        const { data, error } = await q;
        if (error) throw error;
        return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizar);
    },

    async get(id: string): Promise<DocGenDocumento | null> {
        const { data, error } = await supabase.from('doc_gen_documentos').select(COLUNAS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? normalizar(data as unknown as Record<string, unknown>) : null;
    },

    /** Cria o rascunho e a versão 1. */
    async create(rascunho: DocGenDocumentoRascunho): Promise<DocGenDocumento> {
        const email = await emailDaSessao();
        const payload = payloadDe(rascunho);
        const { data, error } = await supabase.from('doc_gen_documentos')
            .insert({ ...payload, created_by: email, versao: 1 })
            .select(COLUNAS)
            .single();
        if (error) throw error;
        const doc = normalizar(data as unknown as Record<string, unknown>);
        const { error: errV } = await supabase.from('doc_gen_documento_versoes').insert({
            documento_id: doc.id, organization_id: doc.organization_id, versao: 1, snapshot: payload, autor: email,
        });
        if (errV) console.error('[docGenDocumentoService] versão 1 não gravada:', errV);
        return doc;
    },

    /**
     * Salva o rascunho: sobe `versao` e guarda o estado novo como versão.
     * O UPDATE é condicionado a `status = RASCUNHO` E à versão lida — se outra
     * aba salvou antes, 0 linhas voltam e a tela avisa em vez de sobrescrever.
     */
    async salvar(atual: DocGenDocumento, rascunho: DocGenDocumentoRascunho): Promise<DocGenDocumento> {
        if (atual.status !== 'RASCUNHO') throw new Error('Documento emitido não pode ser alterado — gere uma nova revisão.');
        if (atual.approval_status === 'PENDENTE') throw new Error('Ofício em aprovação não pode ser alterado — retire da aprovação para editar.');
        const email = await emailDaSessao();
        const payload = payloadDe(rascunho);
        const versao = atual.versao + 1;
        const { data, error } = await supabase.from('doc_gen_documentos')
            .update({ ...payload, versao })
            .eq('id', atual.id)
            .eq('status', 'RASCUNHO')
            .eq('versao', atual.versao)
            .select(COLUNAS);
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('O documento foi alterado em outra janela (ou não é mais rascunho). Reabra para ver a versão atual.');
        }
        const doc = normalizar(data[0] as unknown as Record<string, unknown>);
        const { error: errV } = await supabase.from('doc_gen_documento_versoes').insert({
            documento_id: doc.id, organization_id: doc.organization_id, versao, snapshot: payload, autor: email,
        });
        if (errV && errV.code !== '23505') console.error('[docGenDocumentoService] versão não gravada:', errV);
        return doc;
    },

    /** Só rascunho (a policy também exige). */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase.from('doc_gen_documentos').delete().eq('id', id).eq('status', 'RASCUNHO').select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Só rascunho pode ser excluído.');
    },

    async listVersoes(documentoId: string): Promise<DocGenDocumentoVersao[]> {
        const { data, error } = await supabase.from('doc_gen_documento_versoes')
            .select('id, documento_id, organization_id, versao, snapshot, autor, congelada, created_at')
            .eq('documento_id', documentoId)
            .order('versao', { ascending: false });
        if (error) throw error;
        return (data ?? []) as DocGenDocumentoVersao[];
    },

    /**
     * Registra o PDF arquivado no GED (F3). O gatilho de congelamento deixa
     * gravar só estes dois campos num documento emitido, e uma vez só.
     */
    async registrarArquivo(id: string, gedDocumentId: string, gedVersionId: string): Promise<void> {
        const { data, error } = await supabase.from('doc_gen_documentos')
            .update({ ged_document_id: gedDocumentId, ged_version_id: gedVersionId })
            .eq('id', id)
            .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Não foi possível registrar o arquivo do GED no documento.');
    },

    // ─── F4: tramitação ─────────────────────────────────────────────────────

    /**
     * Muda a situação de um documento emitido (ENVIADO, RECEBIDO, RESPONDIDO,
     * ENCERRADO, CANCELADO). `dados` vai para o histórico (canal, protocolo,
     * quem recebeu, motivo…). O banco valida a transição.
     */
    async tramitar(id: string, para: DocGenSituacaoTramitacao, dados: Record<string, unknown> = {}): Promise<DocGenDocumento> {
        const limpos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined && v !== null && v !== ''));
        const { error } = await supabase.rpc('doc_gen_tramitar', { p_documento_id: id, p_para: para, p_dados: limpos });
        if (error) throw new Error(mensagem(error, 'Não foi possível mudar a situação do documento.'));
        const doc = await this.get(id);
        if (!doc) throw new Error('Documento não encontrado.');
        return doc;
    },

    /** Emitido → cancelado (pela tramitação, que registra o motivo no histórico). */
    async cancelar(id: string, motivo?: string): Promise<DocGenDocumento> {
        return this.tramitar(id, 'CANCELADO', { motivo });
    },

    /** Prazo de resposta — editável também depois da emissão (o congelamento o deixa livre). */
    async definirPrazo(id: string, data: string | null): Promise<void> {
        const { data: linhas, error } = await supabase.from('doc_gen_documentos')
            .update({ resposta_esperada_ate: data || null }).eq('id', id).select('id');
        if (error) throw new Error(mensagem(error, 'Não foi possível gravar o prazo de resposta.'));
        if (!linhas || linhas.length === 0) throw new Error('Documento não encontrado.');
    },

    async listEventos(documentoId: string): Promise<DocGenEvento[]> {
        const { data, error } = await supabase.from('doc_gen_eventos')
            .select('id, documento_id, tipo, dados, autor, created_at')
            .eq('documento_id', documentoId)
            .order('created_at', { ascending: true })
            .order('id');
        if (error) throw error;
        return (data ?? []) as DocGenEvento[];
    },

    // ─── F4: assinatura ─────────────────────────────────────────────────────

    async listAssinaturas(documentoId: string): Promise<DocGenAssinatura[]> {
        const { data, error } = await supabase.from('doc_gen_assinaturas')
            .select('id, documento_id, member_id, nome, email, versao, assinado_em')
            .eq('documento_id', documentoId)
            .order('assinado_em', { ascending: true });
        if (error) throw error;
        return (data ?? []) as DocGenAssinatura[];
    },

    /** O usuário da sessão assina a versão SALVA do rascunho (só se for signatário). */
    async assinar(documentoId: string): Promise<string> {
        const { data, error } = await supabase.rpc('doc_gen_assinar', { p_documento_id: documentoId });
        if (error) throw new Error(mensagem(error, 'Não foi possível assinar.'));
        return String(data);
    },

    // ─── F4: aprovação (primitiva única) ────────────────────────────────────
    // Ofício não tem valor: `amount: 0` + `semFaixa: 'exigir1'` — toda
    // solicitação pede ao menos o nível 1 (mesma regra da Solicitação de Compra).

    async enviarParaAprovacao(doc: DocGenDocumento): Promise<DocGenDocumento> {
        if (doc.status !== 'RASCUNHO') throw new Error('Só rascunho vai para aprovação.');
        await approvalService.submit('doc_gen_documento', doc.id, {}, { organizationId: doc.organization_id, amount: 0, semFaixa: 'exigir1' });
        return (await this.get(doc.id)) ?? doc;
    },

    /** Tira da fila para poder editar (volta a RASCUNHO; a cadeia fica como histórico). */
    async retirarDaAprovacao(doc: DocGenDocumento): Promise<DocGenDocumento> {
        const { data, error } = await supabase.from('doc_gen_documentos')
            .update({ approval_status: 'RASCUNHO' })
            .eq('id', doc.id).eq('approval_status', 'PENDENTE')
            .select(COLUNAS);
        if (error) throw new Error(mensagem(error, 'Não foi possível retirar da aprovação.'));
        if (!data || data.length === 0) throw new Error('O ofício não está mais em aprovação.');
        return normalizar(data[0] as unknown as Record<string, unknown>);
    },

    async aprovar(id: string, level: 1 | 2, aprovadoPor: string, labels: RoleLabels, notas?: string): Promise<void> {
        await approvalService.approve('doc_gen_documento', id, level, aprovadoPor, labels, notas);
    },

    async rejeitar(id: string, rejeitadoPor: string, motivo: string): Promise<void> {
        await approvalService.reject('doc_gen_documento', id, rejeitadoPor, motivo);
    },

    // ─── F4: vínculos ───────────────────────────────────────────────────────

    /** Vínculos em que o ofício aparece, nas duas pontas. */
    async listVinculosDoDocumento(documentoId: string): Promise<DocGenVinculo[]> {
        const { data, error } = await supabase.from('doc_gen_vinculos')
            .select(COLUNAS_VINCULO)
            .or(`de_documento_id.eq.${documentoId},para_documento_id.eq.${documentoId}`)
            .order('created_at');
        if (error) throw error;
        return (data ?? []) as DocGenVinculo[];
    },

    /** Vínculos que tocam documentos do GED (ofícios recebidos). */
    async listVinculosDoGed(gedIds: string[]): Promise<DocGenVinculo[]> {
        if (gedIds.length === 0) return [];
        const lista = gedIds.join(',');
        const { data, error } = await supabase.from('doc_gen_vinculos')
            .select(COLUNAS_VINCULO)
            .or(`de_ged_id.in.(${lista}),para_ged_id.in.(${lista})`);
        if (error) throw error;
        return (data ?? []) as DocGenVinculo[];
    },

    async vincular(v: {
        organization_id: string;
        de: { documentoId?: string | null; gedId?: string | null };
        para: { documentoId?: string | null; gedId?: string | null };
        tipo: DocGenVinculoTipo;
        observacao?: string | null;
    }): Promise<DocGenVinculo> {
        const email = await emailDaSessao();
        const { data, error } = await supabase.from('doc_gen_vinculos').insert({
            organization_id: v.organization_id,
            de_documento_id: v.de.documentoId ?? null,
            de_ged_id: v.de.gedId ?? null,
            para_documento_id: v.para.documentoId ?? null,
            para_ged_id: v.para.gedId ?? null,
            tipo: v.tipo,
            observacao: v.observacao?.trim() || null,
            created_by: email,
        }).select(COLUNAS_VINCULO).single();
        if (error) {
            if (error.code === '23505') throw new Error('Esses documentos já estão vinculados assim.');
            throw new Error(mensagem(error, 'Não foi possível vincular os documentos.'));
        }
        return data as DocGenVinculo;
    },

    async desvincular(id: string): Promise<void> {
        const { data, error } = await supabase.from('doc_gen_vinculos').delete().eq('id', id).select('id');
        if (error) throw new Error(mensagem(error, 'Não foi possível desfazer o vínculo.'));
        if (!data || data.length === 0) throw new Error('O "em resposta a" de um ofício emitido foi impresso no PDF e não se desfaz.');
    },

    // ─── F4: prazo de resposta → tarefa ─────────────────────────────────────

    /**
     * Tarefa "cobrar a resposta" para o usuário da sessão, com o prazo.
     * Idempotente: o índice `uq_tasks_source_open` ignora a segunda enquanto a
     * primeira estiver aberta — e aí só a data da aberta é acertada.
     */
    async garantirTarefaDePrazo(p: {
        id: string; organizationId: string; titulo: string; prazo: string; descricao?: string;
        tipo?: 'doc_gen_documento' | 'oficio_recebido';
    }): Promise<void> {
        const { data: sessao } = await supabase.auth.getUser();
        const userId = sessao.user?.id;
        if (!userId) return;
        const tipo = p.tipo ?? 'doc_gen_documento';
        const due = `${p.prazo}T12:00:00-03:00`;
        const { error } = await supabase.rpc('create_task', {
            p_user_id: userId,
            p_org_id: p.organizationId,
            p_title: p.titulo,
            p_due: due,
            p_source_module: 'oficios',
            p_source_ref: { type: tipo, id: p.id, route: 'opura-oficios' },
            p_priority: 2,
            p_description: p.descricao ?? null,
        });
        if (error) throw new Error(mensagem(error, 'Não foi possível criar a tarefa do prazo.'));
        const { error: errData } = await supabase.from('tasks').update({ due_date: due })
            .eq('source_module', 'oficios').eq('status', 'open')
            .eq('source_ref->>type', tipo).eq('source_ref->>id', p.id);
        if (errData) console.warn('[docGenDocumentoService] data da tarefa do prazo não acertada:', errData.message);
    },

    /** Respondido/encerrado/cancelado: a tarefa de cobrar a resposta acabou. */
    async concluirTarefaDePrazo(id: string, tipo: 'doc_gen_documento' | 'oficio_recebido' = 'doc_gen_documento'): Promise<void> {
        const { error } = await supabase.from('tasks').update({ status: 'done' })
            .eq('source_module', 'oficios').eq('status', 'open')
            .eq('source_ref->>type', tipo).eq('source_ref->>id', id);
        if (error) console.warn('[docGenDocumentoService] tarefa do prazo não concluída:', error.message);
    },

    /** Quantos documentos usam o modelo — para a exclusão de modelo explicar a recusa. */
    async contarPorModelo(modeloId: string): Promise<number> {
        const { count, error } = await supabase.from('doc_gen_documentos').select('id', { count: 'exact', head: true }).eq('modelo_id', modeloId);
        if (error) throw error;
        return count ?? 0;
    },
};
