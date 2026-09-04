// services/condominioComunicacaoService.ts
// Avisos e documentos do condomínio — o lado ADMIN do que o Portal do Condômino
// exibe. Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F3)
//
// Estas tabelas não reusam `communications` (RH/obra) nem
// `investor_announcements` (investidor): públicos diferentes, ciclos diferentes.
// Misturar comunicado de obra com aviso de síndico na mesma caixa seria pior
// que duplicar a estrutura.
//
// O portal LÊ por RPC SECURITY DEFINER (roda sem sessão); estas funções são o
// caminho autenticado, que passa pela RLS normal.

import { supabase } from '../lib/supabase';

export type AvisoCategoria = 'AVISO' | 'URGENTE' | 'MANUTENCAO' | 'ASSEMBLEIA' | 'OBRA';
export type DocumentoCategoria =
    'CONVENCAO' | 'REGULAMENTO' | 'ATA' | 'MANUAL' | 'LAUDO' | 'SEGURO' | 'OUTRO';

export interface CondominioAviso {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    titulo: string;
    corpo: string;
    categoria: AvisoCategoria;
    /** Nulo = sem prazo. Vencido some do portal, mas continua no histórico. */
    valido_ate?: string | null;
    publicado_em: string;
    publicado_por?: string | null;
    created_at: string;
    updated_at: string;
}

export interface AvisoRow extends CondominioAviso {
    /** Quantos condôminos confirmaram leitura — a razão de o mural existir. */
    _leituras: number;
}

export interface CondominioDocumento {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    titulo: string;
    categoria: DocumentoCategoria;
    /** Endereco externo. Nulo quando o arquivo foi ENVIADO - ai vale `storage_path`. */
    url: string | null;
    /** Caminho no bucket privado. Nulo quando o documento e so um link. */
    storage_path?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
    file_size?: number | null;
    descricao?: string | null;
    visivel_portal: boolean;
    created_at: string;
    updated_at: string;
}

const AVISO_COLS =
    'id, empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate, publicado_em, publicado_por, created_at, updated_at';
const DOC_COLS =
    'id, empreendimento_id, organization_id, titulo, categoria, url, storage_path, file_name, mime_type, file_size, descricao, visivel_portal, created_at, updated_at';

/** Bucket PRIVADO (migration aplicar_20270918000027). So abre por URL assinada. */
export const BUCKET_DOCUMENTOS = 'condominio-documentos';

/** Espelha `allowed_mime_types` do bucket. Existe do lado do cliente para o
 *  arquivo errado ser recusado ANTES de subir 50 MB e voltar um 400 opaco. */
export const MIME_PERMITIDOS = [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** Igual ao `file_size_limit` do bucket. */
export const TAMANHO_MAXIMO_BYTES = 52428800;

/** Para o `accept` do input de arquivo - mesma lista dos MIME acima. */
export const EXTENSOES_ACEITAS = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';

/** `Convencao 2026.PDF` -> `pdf`. Vazio quando o nome nao tem extensao. */
function extensaoDe(nome: string): string {
    const partes = nome.split('.');
    return partes.length > 1 ? partes.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

export const condominioComunicacaoService = {
    // ── Avisos ───────────────────────────────────────────────────────────────
    async listAvisos(empreendimentoId: string): Promise<AvisoRow[]> {
        const { data, error } = await supabase
            .from('condominio_avisos')
            .select(AVISO_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('publicado_em', { ascending: false })
            // Desempate determinístico: publicados no mesmo instante empatam e a
            // ordem oscila entre carregamentos.
            .order('id', { ascending: false });
        if (error) throw new Error(`Falha ao carregar os avisos: ${error.message}`);

        const avisos = (data || []) as CondominioAviso[];
        if (avisos.length === 0) return [];

        // Contagem de leitura numa consulta só — uma por aviso viraria N+1.
        const { data: leituras } = await supabase
            .from('condominio_aviso_leituras')
            .select('aviso_id')
            .in('aviso_id', avisos.map(a => a.id));

        const porAviso = new Map<string, number>();
        for (const l of leituras || []) {
            porAviso.set(l.aviso_id, (porAviso.get(l.aviso_id) || 0) + 1);
        }
        return avisos.map(a => ({ ...a, _leituras: porAviso.get(a.id) || 0 }));
    },

    async createAviso(payload: {
        empreendimento_id: string; organization_id: string;
        titulo: string; corpo: string; categoria: AvisoCategoria;
        valido_ate?: string | null; publicado_por?: string | null;
    }): Promise<CondominioAviso> {
        const { data, error } = await supabase
            .from('condominio_avisos').insert(payload).select(AVISO_COLS).single();
        if (error) throw new Error(`Falha ao publicar o aviso: ${error.message}`);
        return data as CondominioAviso;
    },

    async removeAviso(id: string): Promise<void> {
        const { error } = await supabase.from('condominio_avisos').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir o aviso: ${error.message}`);
    },

    // ── Documentos ───────────────────────────────────────────────────────────
    async listDocumentos(empreendimentoId: string): Promise<CondominioDocumento[]> {
        const { data, error } = await supabase
            .from('condominio_documentos')
            .select(DOC_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('categoria', { ascending: true })
            .order('titulo', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os documentos: ${error.message}`);
        return (data || []) as CondominioDocumento[];
    },

    async createDocumento(payload: {
        empreendimento_id: string; organization_id: string;
        titulo: string; categoria: DocumentoCategoria;
        /** Um dos dois e obrigatorio - o CHECK `condominio_docs_tem_destino` recusa os dois nulos. */
        url?: string | null; storage_path?: string | null;
        file_name?: string | null; mime_type?: string | null; file_size?: number | null;
        descricao?: string | null; visivel_portal?: boolean;
    }): Promise<CondominioDocumento> {
        const { data, error } = await supabase
            .from('condominio_documentos').insert(payload).select(DOC_COLS).single();
        if (error) throw new Error(`Falha ao cadastrar o documento: ${error.message}`);
        return data as CondominioDocumento;
    },

    async setVisibilidade(id: string, visivel: boolean): Promise<CondominioDocumento> {
        const { data, error } = await supabase
            .from('condominio_documentos')
            .update({ visivel_portal: visivel })
            .eq('id', id).select(DOC_COLS).single();
        if (error) throw new Error(`Falha ao alterar a visibilidade: ${error.message}`);
        return data as CondominioDocumento;
    },

    /**
     * Apaga a linha e, quando o arquivo e nosso, o objeto junto.
     *
     * Recebe o documento inteiro e nao so o id justamente por causa do
     * `storage_path`: arquivo que fica no bucket sem linha apontando para ele e
     * orfao invisivel - a tela nunca mais o mostra e ele conta no armazenamento
     * para sempre. E o defeito #5 que a `deleteDocument` do GED ainda tem.
     */
    async removeDocumento(doc: Pick<CondominioDocumento, 'id' | 'storage_path'>): Promise<void> {
        const { error } = await supabase.from('condominio_documentos').delete().eq('id', doc.id);
        if (error) throw new Error(`Falha ao excluir o documento: ${error.message}`);
        // A linha ja foi embora: falhar aqui nao pode virar "erro ao excluir" na
        // tela, sobre algo que de fato foi excluido.
        if (doc.storage_path) {
            const { error: erroArquivo } = await supabase.storage
                .from(BUCKET_DOCUMENTOS).remove([doc.storage_path]);
            if (erroArquivo) console.warn('[condominio] arquivo orfao no bucket:', doc.storage_path, erroArquivo.message);
        }
    },

    /**
     * Sobe o arquivo para `{org}/{empreendimento}/{uuid}.{ext}` e grava a linha.
     *
     * O primeiro segmento e a ORGANIZACAO porque e o que as policies do bucket
     * leem (`foldername(name)[1]`) - inverter a ordem deixaria a RLS de storage
     * cega ao dono do arquivo, que e o defeito do bucket `blueprint_underlays`.
     */
    async uploadDocumento(
        arquivo: File,
        payload: {
            empreendimento_id: string; organization_id: string;
            titulo: string; categoria: DocumentoCategoria;
            descricao?: string | null; visivel_portal?: boolean;
        },
    ): Promise<CondominioDocumento> {
        if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
            throw new Error(
                `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite e ` +
                `${TAMANHO_MAXIMO_BYTES / 1048576} MB.`);
        }
        if (arquivo.type && !(MIME_PERMITIDOS as readonly string[]).includes(arquivo.type)) {
            throw new Error(
                `Tipo de arquivo nao aceito (${arquivo.type}). Aceitos: PDF, Word, Excel e imagem.`);
        }

        const ext = extensaoDe(arquivo.name);
        const caminho =
            `${payload.organization_id}/${payload.empreendimento_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

        const { error: erroUpload } = await supabase.storage
            .from(BUCKET_DOCUMENTOS)
            .upload(caminho, arquivo, {
                cacheControl: '3600', upsert: false,
                contentType: arquivo.type || undefined,
            });
        if (erroUpload) throw new Error(`Falha ao enviar o arquivo: ${erroUpload.message}`);

        try {
            return await this.createDocumento({
                ...payload,
                url: null,
                storage_path: caminho,
                file_name: arquivo.name,
                mime_type: arquivo.type || null,
                file_size: arquivo.size,
            });
        } catch (e) {
            // Sem isto o arquivo fica no bucket sem nenhuma linha apontando para
            // ele - o mesmo orfao descrito em `removeDocumento`.
            const { error: erroLimpeza } = await supabase.storage
                .from(BUCKET_DOCUMENTOS).remove([caminho]);
            if (erroLimpeza) console.warn('[condominio] arquivo orfao no bucket:', caminho, erroLimpeza.message);
            throw e;
        }
    },

    /**
     * Endereco para abrir o documento AGORA - assinado por 15 min quando o
     * arquivo e nosso, o link cru quando e externo.
     *
     * Nunca persista o retorno: URL assinada expira, e URL publica gravada em
     * coluna foi exatamente a armadilha que a privatizacao dos buckets teve de
     * desfazer em quatro tabelas.
     */
    async abrirDocumento(doc: Pick<CondominioDocumento, 'url' | 'storage_path'>): Promise<string> {
        if (doc.storage_path) {
            const { data, error } = await supabase.storage
                .from(BUCKET_DOCUMENTOS)
                .createSignedUrl(doc.storage_path, 900);
            if (error || !data) {
                throw new Error(`Falha ao gerar o link do arquivo: ${error?.message || 'sem resposta'}`);
            }
            return data.signedUrl;
        }
        if (doc.url) return doc.url;
        throw new Error('Documento sem arquivo nem link.');
    },
};
