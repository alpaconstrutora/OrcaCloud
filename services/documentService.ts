import { supabase } from '../lib/supabase';
import {
  OpuraDocument,
  OpuraDocumentInsert,
  OpuraDocumentUpdate,
  OpuraDocumentVersion,
} from '../types';

export const documentService = {
  // ─── LISTAGEM DE DOCUMENTOS ─────────────────────────────────
  async listDocuments(
    organizationId?: string,
    filters?: {
      projectId?: string;
      categoria?: string;
      search?: string;
      status?: string;
    }
  ): Promise<OpuraDocument[]> {
    if (!organizationId) {
      // Regra 1: Não retorna array vazio de forma silenciosa se puder usar RLS
      // Porém para a query ser correta, selecionamos tudo e o RLS filtra.
    }

    let query = supabase
      .from('opura_documents')
      .select('*, active_version:opura_document_versions!fk_active_version(*)');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    if (filters?.categoria) {
      query = query.eq('categoria', filters.categoria);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[DocumentService] Erro ao listar documentos:', error);
      throw new Error(`Erro ao listar documentos: ${error.message}`);
    }

    let result = (data || []) as OpuraDocument[];

    // SE A CATEGORIA FOR CONTRATOS (juridico), INTEGRA OS CONTRATOS DA TABELA contracts
    if (!filters?.categoria || filters.categoria === 'juridico') {
      try {
        let contractQuery = supabase
          .from('contracts')
          .select('id, title, number, contract_type, status, start_date, end_date, signed_contract_url, minuta_versions, responsible_email, created_at, project_id, organization_id');

        if (organizationId) {
          contractQuery = contractQuery.eq('organization_id', organizationId);
        }
        if (filters?.projectId) {
          contractQuery = contractQuery.eq('project_id', filters.projectId);
        }

        const { data: contractsData, error: contractsError } = await contractQuery;

        if (!contractsError && contractsData) {
          const mappedContracts: OpuraDocument[] = contractsData
            .filter((c) => c.signed_contract_url || (c.minuta_versions && Array.isArray(c.minuta_versions) && c.minuta_versions.length > 0))
            .map((c) => {
              const activeMinuta = c.minuta_versions && Array.isArray(c.minuta_versions) && c.minuta_versions.length > 0
                ? c.minuta_versions[c.minuta_versions.length - 1]
                : null;

              const fileUrl = c.signed_contract_url || activeMinuta?.url || '';

              return {
                id: c.id,
                organization_id: c.organization_id,
                nome: c.title || `Contrato Nº ${c.number}`,
                descricao: `Contrato de Serviço cadastrado via Suprimentos (Nº ${c.number})`,
                categoria: 'juridico',
                tipo_documento: c.contract_type || 'Contrato de Serviço',
                status: c.status === 'Ativo' || c.status === 'Assinado' ? 'ativo' : 'arquivado',
                data_emissao: c.start_date || undefined,
                data_validade: c.end_date || undefined,
                alerta_dias_antecedencia: 30,
                tags: ['Suprimentos', c.number ? `Nº ${c.number}` : ''].filter(Boolean),
                criado_por: c.responsible_email || 'sistema',
                created_at: c.created_at || new Date().toISOString(),
                updated_at: c.created_at || new Date().toISOString(),
                project_id: c.project_id || undefined,
                active_version: {
                  id: `ver-${c.id}`,
                  document_id: c.id,
                  version_number: activeMinuta?.v || 1,
                  storage_path: fileUrl,
                  tamanho: 0,
                  mime_type: 'application/pdf',
                  criado_por: c.responsible_email || 'sistema',
                  created_at: c.created_at || new Date().toISOString(),
                },
              };
            });

          result = [...result, ...mappedContracts];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar contratos no Docs:', err);
      }
    }

    // Ordena por data de criação de forma descendente
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Busca de texto simples no frontend para compatibilidade inicial (Sem OCR)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.nome.toLowerCase().includes(searchLower) ||
          (doc.descricao && doc.descricao.toLowerCase().includes(searchLower)) ||
          doc.tipo_documento.toLowerCase().includes(searchLower) ||
          doc.tags.some((t) => t.toLowerCase().includes(searchLower))
      );
    }

    return result;
  },

  // ─── LEITURA COMPLETA (INCLUINDO HISTÓRICO DE VERSÕES) ───────
  async getDocumentById(id: string): Promise<OpuraDocument | null> {
    const { data, error } = await supabase
      .from('opura_documents')
      .select('*, active_version:opura_document_versions!fk_active_version(*), versions:opura_document_versions(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[DocumentService] Erro ao obter documento por ID:', error);
      throw new Error(`Erro ao obter documento: ${error.message}`);
    }

    if (data && data.versions) {
      // Ordena as versões de forma descendente pelo número da versão
      data.versions.sort((a: any, b: any) => b.version_number - a.version_number);
    }

    return data as OpuraDocument | null;
  },

  // ─── UPLOAD DE DOCUMENTO (NOVO REGISTRO + V1 DO ARQUIVO) ──────
  async uploadNewDocument(
    docData: OpuraDocumentInsert,
    file: File
  ): Promise<OpuraDocument> {
    // 1. Criar o registro do documento na base (sem active_version_id inicialmente)
    const { data: newDoc, error: docError } = await supabase
      .from('opura_documents')
      .insert({
        organization_id: docData.organization_id,
        nome: docData.nome,
        descricao: docData.descricao,
        categoria: docData.categoria,
        tipo_documento: docData.tipo_documento,
        status: docData.status || 'ativo',
        data_emissao: docData.data_emissao || null,
        data_validade: docData.data_validade || null,
        alerta_dias_antecedencia: docData.alerta_dias_antecedencia || 30,
        tags: docData.tags || [],
        project_id: docData.project_id || null,
        company_id: docData.company_id || null,
        contract_id: docData.contract_id || null,
        supplier_id: docData.supplier_id || null,
        client_id: docData.client_id || null,
        investor_id: docData.investor_id || null,
      })
      .select()
      .single();

    if (docError) {
      console.error('[DocumentService] Erro ao registrar documento:', docError);
      throw new Error(`Erro ao registrar documento: ${docError.message}`);
    }

    const documentId = newDoc.id;
    const versionId = crypto.randomUUID();
    // Caminho físico estruturado: "orgId/docId/versionId_filename"
    const storagePath = `${docData.organization_id}/${documentId}/${versionId}_${file.name}`;

    try {
      // 2. Upload do arquivo para o Storage
      const { error: uploadError } = await supabase.storage
        .from('opura-docs')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Registrar a versão V1
      const { data: newVersion, error: versionError } = await supabase
        .from('opura_document_versions')
        .insert({
          id: versionId,
          document_id: documentId,
          version_number: 1,
          storage_path: storagePath,
          tamanho: file.size,
          mime_type: file.type || 'application/octet-stream',
        })
        .select()
        .single();

      if (versionError) throw versionError;

      // 4. Vincular a versão V1 como ativa
      const { data: finalDoc, error: updateError } = await supabase
        .from('opura_documents')
        .update({ active_version_id: newVersion.id })
        .eq('id', documentId)
        .select('*, active_version:opura_document_versions!fk_active_version(*)')
        .single();

      if (updateError) throw updateError;

      return finalDoc as OpuraDocument;
    } catch (err: any) {
      console.error('[DocumentService] Erro no upload/processamento, executando rollback:', err);
      // Rollback manual para não deixar lixo no banco
      await supabase.from('opura_documents').delete().eq('id', documentId);
      await supabase.storage.from('opura-docs').remove([storagePath]);
      throw new Error(`Erro ao realizar upload do documento: ${err.message || err}`);
    }
  },

  // ─── UPLOAD DE NOVA VERSÃO (HISTÓRICO / RENOVACAÇÃO) ──────────
  async uploadNewVersion(
    documentId: string,
    organizationId: string,
    nextVersionNumber: number,
    file: File
  ): Promise<OpuraDocumentVersion> {
    const versionId = crypto.randomUUID();
    const storagePath = `${organizationId}/${documentId}/${versionId}_${file.name}`;

    // 1. Upload do arquivo físico
    const { error: uploadError } = await supabase.storage
      .from('opura-docs')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[DocumentService] Erro no upload de nova versão:', uploadError);
      throw new Error(`Erro ao enviar nova versão do arquivo: ${uploadError.message}`);
    }

    try {
      // 2. Registrar no banco a nova versão
      const { data: newVersion, error: versionError } = await supabase
        .from('opura_document_versions')
        .insert({
          id: versionId,
          document_id: documentId,
          version_number: nextVersionNumber,
          storage_path: storagePath,
          tamanho: file.size,
          mime_type: file.type || 'application/octet-stream',
        })
        .select()
        .single();

      if (versionError) throw versionError;

      // 3. Atualizar o ponteiro de versão ativa e alterar status se necessário (ex: de vencido para ativo)
      const { error: updateError } = await supabase
        .from('opura_documents')
        .update({
          active_version_id: newVersion.id,
          status: 'ativo', // Ao renovar o documento, ele volta a ficar ativo por padrão
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (updateError) throw updateError;

      return newVersion as OpuraDocumentVersion;
    } catch (err: any) {
      console.error('[DocumentService] Erro ao registrar nova versão, executando rollback:', err);
      await supabase.storage.from('opura-docs').remove([storagePath]);
      throw new Error(`Erro ao registrar nova versão do documento: ${err.message || err}`);
    }
  },

  // ─── ATUALIZAR METADADOS DO DOCUMENTO ───────────────────────
  async updateDocument(
    id: string,
    updates: OpuraDocumentUpdate
  ): Promise<OpuraDocument> {
    const { data, error } = await supabase
      .from('opura_documents')
      .update(updates)
      .eq('id', id)
      .select('*, active_version:opura_document_versions!fk_active_version(*)')
      .single();

    if (error) {
      console.error('[DocumentService] Erro ao atualizar documento:', error);
      throw new Error(`Erro ao atualizar documento: ${error.message}`);
    }

    return data as OpuraDocument;
  },

  // ─── DELETAR DOCUMENTO COMPLETO (BANCO + STORAGE) ────────────
  async deleteDocument(id: string, organizationId: string): Promise<void> {
    // 1. Obter todas as versões existentes para saber os caminhos no Storage
    const { data: versions, error: versionsError } = await supabase
      .from('opura_document_versions')
      .select('storage_path')
      .eq('document_id', id);

    if (versionsError) {
      console.error('[DocumentService] Erro ao buscar versões para deleção:', versionsError);
      throw new Error(`Erro ao buscar versões para deleção: ${versionsError.message}`);
    }

    // 2. Deletar os arquivos físicos do storage
    if (versions && versions.length > 0) {
      const pathsToDelete = versions.map((v) => v.storage_path);
      const { error: storageError } = await supabase.storage
        .from('opura-docs')
        .remove(pathsToDelete);

      if (storageError) {
        console.error('[DocumentService] Aviso: Erro ao deletar arquivos físicos:', storageError);
        // Prosseguimos para deletar a referência do banco mesmo se falhar no storage físico
      }
    }

    // 3. Deletar do banco (o ON DELETE CASCADE cuidará das linhas em opura_document_versions)
    const { error: deleteError } = await supabase
      .from('opura_documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[DocumentService] Erro ao deletar documento do banco:', deleteError);
      throw new Error(`Erro ao deletar documento: ${deleteError.message}`);
    }
  },

  // ─── GERAR LINK DE DOWNLOAD ASSINADO SEGURO ─────────────────
  async generateDownloadUrl(storagePath: string): Promise<string> {
    if (!storagePath) {
      throw new Error('Caminho de armazenamento do arquivo é nulo ou indefinido');
    }
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    const { data, error } = await supabase.storage
      .from('opura-docs')
      .createSignedUrl(storagePath, 60 * 15); // Link válido por 15 minutos

    if (error) {
      console.error('[DocumentService] Erro ao gerar link assinado:', error);
      throw new Error(`Erro ao gerar link de download: ${error.message}`);
    }

    return data.signedUrl;
  },
};
