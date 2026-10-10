import { supabase } from '../lib/supabase';
import type {
    DocGenDocumento, DocGenDocumentoRascunho, DocGenDocumentoStatus, DocGenDocumentoVersao, DocGenModelo,
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
 */
const COLUNAS = [
    'id', 'organization_id', 'company_id', 'modelo_id', 'modelo_versao', 'tipo_documental', 'status', 'numero', 'assunto',
    'data_documento', 'cidade', 'department_id', 'destinatario_tipo', 'destinatario_id', 'destinatario_snapshot',
    'project_id', 'empreendimento_id', 'contract_id', 'client_id', 'supplier_id', 'valores', 'conteudo', 'signatarios',
    'anexos', 'documento_relacionado_id', 'resposta_esperada_ate', 'versao', 'ged_document_id', 'ged_version_id',
    'emitido_por', 'emitido_em', 'created_by', 'created_at', 'updated_at',
].join(', ');

/** Linha da lista: sem os blocos pesados (conteúdo e valores). */
const COLUNAS_LISTA = [
    'id', 'organization_id', 'company_id', 'modelo_id', 'modelo_versao', 'tipo_documental', 'status', 'numero', 'assunto',
    'data_documento', 'cidade', 'department_id', 'destinatario_tipo', 'destinatario_id', 'destinatario_snapshot',
    'project_id', 'empreendimento_id', 'contract_id', 'client_id', 'supplier_id', 'signatarios', 'anexos',
    'documento_relacionado_id', 'resposta_esperada_ate', 'versao', 'ged_document_id', 'emitido_por', 'emitido_em',
    'created_by', 'created_at', 'updated_at',
].join(', ');

function normalizar(row: Record<string, unknown>): DocGenDocumento {
    const objeto = <T>(v: unknown, padrao: T): T => (v && typeof v === 'object' ? (v as T) : padrao);
    return {
        ...(row as unknown as DocGenDocumento),
        valores: objeto(row.valores, {} as Record<string, string>),
        conteudo: objeto(row.conteudo, {} as DocGenDocumento['conteudo']),
        signatarios: Array.isArray(row.signatarios) ? (row.signatarios as DocGenDocumento['signatarios']) : [],
        anexos: Array.isArray(row.anexos) ? (row.anexos as DocGenDocumento['anexos']) : [],
    };
}

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

    /** Emitido → cancelado (a única transição que o congelamento aceita). */
    async cancelar(id: string): Promise<DocGenDocumento> {
        const { data, error } = await supabase.from('doc_gen_documentos')
            .update({ status: 'CANCELADO' })
            .eq('id', id)
            .eq('status', 'EMITIDO')
            .select(COLUNAS);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Só documento emitido pode ser cancelado.');
        return normalizar(data[0] as unknown as Record<string, unknown>);
    },

    /** Quantos documentos usam o modelo — para a exclusão de modelo explicar a recusa. */
    async contarPorModelo(modeloId: string): Promise<number> {
        const { count, error } = await supabase.from('doc_gen_documentos').select('id', { count: 'exact', head: true }).eq('modelo_id', modeloId);
        if (error) throw error;
        return count ?? 0;
    },
};
