import { supabase } from '../lib/supabase';
import {
  OpuraDocument,
  OpuraDocumentInsert,
  OpuraDocumentUpdate,
  OpuraDocumentVersion,
  OpuraFolder,
  OpuraFolderInsert,
  OpuraDocumentCategoria,
  OpuraDocumentApproval,
  OpuraDocumentApprovalInsert,
  OpuraDocumentApprovalStatus,
  OpuraDocumentAuditLog,
  OpuraDocumentMarkup,
} from '../types';
import { notificationService } from './notificationService';

function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


function normalizeProjectName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\b(igreja|obra|reforma|condominio|edificio|residencial|casa|lote|galpao|terreno|projeto|de|da|do)\b/g, '') // remove stop words comuns de obras
    .replace(/\s+/g, ' ') // normaliza espaços
    .trim();
}

export const documentService = {
  // ─── LISTAGEM DE DOCUMENTOS ─────────────────────────────────
  async listDocuments(
    organizationId?: string,
    filters?: {
      projectId?: string;
      categoria?: string;
      search?: string;
      status?: string;
      folderId?: string | null;
    }
  ): Promise<OpuraDocument[]> {
    if (!organizationId) {
      // Regra 1: Não retorna array vazio de forma silenciosa se puder usar RLS
      // Porém para a query ser correta, selecionamos tudo e o RLS filtra.
    }

    let targetProjectIds: string[] = [];
    if (filters?.projectId && organizationId) {
      targetProjectIds.push(filters.projectId);
      try {
        const { data: currentProj } = await supabase
          .from('projects')
          .select('name')
          .eq('id', filters.projectId)
          .maybeSingle();

        if (currentProj?.name) {
          const normTarget = normalizeProjectName(currentProj.name);
          
          if (normTarget) {
            const { data: allProjects } = await supabase
              .from('projects')
              .select('id, name')
              .eq('organization_id', organizationId);

            if (allProjects && allProjects.length > 0) {
              const matchedSiblings = allProjects.filter((p: any) => {
                const normSibling = normalizeProjectName(p.name);
                return normSibling === normTarget || normSibling.includes(normTarget) || normTarget.includes(normSibling);
              });
              if (matchedSiblings.length > 0) {
                targetProjectIds = matchedSiblings.map((s: any) => s.id);
              }
            }
          } else {
            const { data: siblings } = await supabase
              .from('projects')
              .select('id')
              .eq('organization_id', organizationId)
              .ilike('name', currentProj.name);

            if (siblings && siblings.length > 0) {
              targetProjectIds = siblings.map((s: any) => s.id);
            }
          }
        }
      } catch (e) {
        console.error('[DocumentService] Erro ao buscar projetos irmãos por nome normalizado:', e);
      }
    }

    let query = supabase
      .from('opura_documents')
      .select('*, active_version:opura_document_versions!fk_active_version(*)');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    if (targetProjectIds.length > 0) {
      query = query.in('project_id', targetProjectIds);
    } else if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    if (filters?.categoria) {
      query = query.eq('categoria', filters.categoria);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters && 'folderId' in filters) {
      if (filters.folderId === null) {
        query = query.is('folder_id', null);
      } else {
        query = query.eq('folder_id', filters.folderId);
      }
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
        if (targetProjectIds.length > 0) {
          contractQuery = contractQuery.in('project_id', targetProjectIds);
        } else if (filters?.projectId) {
          contractQuery = contractQuery.eq('project_id', filters.projectId);
        }

        const { data: contractsData, error: contractsError } = await contractQuery;

        if (!contractsError && contractsData) {
          const mappedContracts: OpuraDocument[] = contractsData.map((c) => {
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
              tags: ['Suprimentos', c.number ? `Nº ${c.number}` : '', !fileUrl ? 'Sem Arquivo' : ''].filter(Boolean),
              criado_por: c.responsible_email || 'sistema',
              created_at: c.created_at || new Date().toISOString(),
              updated_at: c.created_at || new Date().toISOString(),
              project_id: c.project_id || undefined,
              is_integrated: true,
              active_version: fileUrl ? {
                id: `ver-${c.id}`,
                document_id: c.id,
                version_number: activeMinuta?.v || 1,
                storage_path: fileUrl,
                tamanho: 0,
                mime_type: 'application/pdf',
                criado_por: c.responsible_email || 'sistema',
                created_at: c.created_at || new Date().toISOString(),
              } : undefined,
            };
          });

          result = [...result, ...mappedContracts];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar contratos no Docs:', err);
      }
    }

    // SE A CATEGORIA FOR FINANCEIRO, INTEGRA NOTAS FISCAIS
    if (!filters?.categoria || filters.categoria === 'financeiro') {
      try {
        let invoiceQuery = supabase
          .from('invoices')
          .select(`
            id,
            file_name,
            file_path,
            amount,
            status,
            created_at,
            purchase_orders!inner (
              project_id,
              organization_id
            )
          `);

        if (organizationId) {
          invoiceQuery = invoiceQuery.eq('purchase_orders.organization_id', organizationId);
        }

        if (targetProjectIds.length > 0) {
          invoiceQuery = invoiceQuery.in('purchase_orders.project_id', targetProjectIds);
        } else if (filters?.projectId) {
          invoiceQuery = invoiceQuery.eq('purchase_orders.project_id', filters.projectId);
        }

        const { data: invoicesData, error: invoicesError } = await invoiceQuery;

        if (!invoicesError && invoicesData) {
          const mappedInvoices: OpuraDocument[] = invoicesData.map((inv: any) => ({
            id: inv.id,
            organization_id: organizationId || '',
            nome: inv.file_name || `Nota Fiscal ${inv.id}`,
            descricao: `Nota Fiscal integrada via Financeiro (Valor: R$ ${inv.amount})`,
            categoria: 'financeiro',
            tipo_documento: 'Nota Fiscal',
            status: inv.status === 'Paid' || inv.status === 'Pago' ? 'ativo' : 'arquivado',
            data_emissao: inv.created_at || undefined,
            alerta_dias_antecedencia: 30,
            tags: ['Financeiro', 'Nota Fiscal', inv.amount ? `R$ ${inv.amount}` : ''].filter(Boolean),
            criado_por: 'sistema',
            created_at: inv.created_at || new Date().toISOString(),
            updated_at: inv.created_at || new Date().toISOString(),
            project_id: inv.purchase_orders?.project_id || undefined,
            is_integrated: true,
            active_version: inv.file_path ? {
              id: `ver-${inv.id}`,
              document_id: inv.id,
              version_number: 1,
              storage_path: `invoices:${inv.file_path}`,
              tamanho: 0,
              mime_type: 'application/pdf',
              criado_por: 'sistema',
              created_at: inv.created_at || new Date().toISOString(),
            } : undefined,
          }));

          result = [...result, ...mappedInvoices];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar Notas Fiscais no Docs:', err);
      }
    }

    // SE A CATEGORIA FOR COMPLIANCE, INTEGRA LAUDOS/PROGRAMAS SST E CATS
    if (!filters?.categoria || filters.categoria === 'compliance') {
      try {
        // 1. PGR/APR (Avaliações de Risco)
        let riskQuery = supabase
          .from('risk_assessments')
          .select(`
            id,
            titulo,
            tipo,
            status,
            data_avaliacao,
            documento_url,
            created_at,
            org_id,
            project_id
          `);

        if (organizationId) {
          riskQuery = riskQuery.eq('org_id', organizationId);
        }
        if (targetProjectIds.length > 0) {
          riskQuery = riskQuery.in('project_id', targetProjectIds);
        } else if (filters?.projectId) {
          riskQuery = riskQuery.eq('project_id', filters.projectId);
        }

        const { data: riskData, error: riskError } = await riskQuery;

        if (!riskError && riskData) {
          const mappedRisks: OpuraDocument[] = riskData
            .filter((r) => r.documento_url)
            .map((r) => ({
              id: r.id,
              organization_id: organizationId || r.org_id,
              nome: r.titulo || `${r.tipo} - Avaliação de Risco`,
              descricao: `Programa/Laudo de SST integrado via Segurança e Saúde (${r.tipo})`,
              categoria: 'compliance',
              tipo_documento: 'Licença / Alvará',
              status: r.status === 'VIGENTE' ? 'ativo' : 'arquivado',
              data_emissao: r.data_avaliacao || undefined,
              alerta_dias_antecedencia: 30,
              tags: ['Compliance', 'SST', r.tipo].filter(Boolean),
              criado_por: 'sistema',
              created_at: r.created_at || new Date().toISOString(),
              updated_at: r.created_at || new Date().toISOString(),
              project_id: r.project_id || undefined,
              is_integrated: true,
              active_version: {
                id: `ver-${r.id}`,
                document_id: r.id,
                version_number: 1,
                storage_path: r.documento_url,
                tamanho: 0,
                mime_type: 'application/pdf',
                criado_por: 'sistema',
                created_at: r.created_at || new Date().toISOString(),
              },
            }));

          result = [...result, ...mappedRisks];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar laudos SST no Docs:', err);
      }

      try {
        // 2. CATs (Acidentes de Trabalho com PDF)
        let accidentQuery = supabase
          .from('accidents')
          .select(`
            id,
            descricao,
            cat_numero,
            cat_emitida,
            cat_data_emissao,
            cat_url,
            created_at,
            org_id,
            project_id
          `)
          .eq('cat_emitida', true);

        if (organizationId) {
          accidentQuery = accidentQuery.eq('org_id', organizationId);
        }
        if (targetProjectIds.length > 0) {
          accidentQuery = accidentQuery.in('project_id', targetProjectIds);
        } else if (filters?.projectId) {
          accidentQuery = accidentQuery.eq('project_id', filters.projectId);
        }

        const { data: accidentData, error: accidentError } = await accidentQuery;

        if (!accidentError && accidentData) {
          const mappedAccidents: OpuraDocument[] = accidentData
            .filter((a) => a.cat_url)
            .map((a) => ({
              id: a.id,
              organization_id: organizationId || a.org_id,
              nome: a.cat_numero ? `CAT nº ${a.cat_numero}` : `CAT - Comunicação de Acidente de Trabalho`,
              descricao: `CAT integrada via Segurança e Saúde (${a.descricao})`,
              categoria: 'compliance',
              tipo_documento: 'Licença / Alvará',
              status: 'ativo',
              data_emissao: a.cat_data_emissao || undefined,
              alerta_dias_antecedencia: 30,
              tags: ['Compliance', 'SST', 'CAT'].filter(Boolean),
              criado_por: 'sistema',
              created_at: a.created_at || new Date().toISOString(),
              updated_at: a.created_at || new Date().toISOString(),
              project_id: a.project_id || undefined,
              is_integrated: true,
              active_version: {
                id: `ver-${a.id}`,
                document_id: a.id,
                version_number: 1,
                storage_path: a.cat_url,
                tamanho: 0,
                mime_type: 'application/pdf',
                criado_por: 'sistema',
                created_at: a.created_at || new Date().toISOString(),
              },
            }));

          result = [...result, ...mappedAccidents];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar CATs no Docs:', err);
      }
    }

    // SE A CATEGORIA FOR COMERCIAL, INTEGRA PROPOSTAS E DOCUMENTOS COMERCIAIS
    if (!filters?.categoria || filters.categoria === 'comercial') {
      try {
        // 1. Propostas comerciais
        const { data: proposalsData, error: proposalsError } = await supabase
          .from('services_proposals')
          .select(`
            id,
            proposal_number,
            total_value,
            pdf_storage_path,
            created_at,
            services_opportunities!inner (
              organization_id,
              converted_project_id,
              engineering_project_id
            )
          `)
          .eq('services_opportunities.organization_id', organizationId);

        if (!proposalsError && proposalsData) {
          let filteredProposals = proposalsData;
          if (targetProjectIds.length > 0) {
            filteredProposals = proposalsData.filter((p: any) => {
              const opp = p.services_opportunities;
              return opp && (
                targetProjectIds.includes(opp.converted_project_id) || 
                targetProjectIds.includes(opp.engineering_project_id)
              );
            });
          }

          const mappedProposals: OpuraDocument[] = filteredProposals.map((p: any) => ({
            id: p.id,
            organization_id: organizationId || '',
            nome: `Proposta Comercial nº ${p.proposal_number}`,
            descricao: `Proposta de Serviço Comercial (Valor: R$ ${p.total_value})`,
            categoria: 'comercial',
            tipo_documento: 'Proposta Comercial',
            status: 'ativo',
            data_emissao: p.created_at || undefined,
            alerta_dias_antecedencia: 30,
            tags: ['Comercial', 'Vendas', p.proposal_number ? `Nº ${p.proposal_number}` : ''].filter(Boolean),
            criado_por: 'sistema',
            created_at: p.created_at || new Date().toISOString(),
            updated_at: p.created_at || new Date().toISOString(),
            project_id: p.services_opportunities?.converted_project_id || p.services_opportunities?.engineering_project_id || undefined,
            is_integrated: true,
            active_version: p.pdf_storage_path ? {
              id: `ver-${p.id}`,
              document_id: p.id,
              version_number: 1,
              storage_path: `organization-assets:${p.pdf_storage_path}`,
              tamanho: 0,
              mime_type: 'application/pdf',
              criado_por: 'sistema',
              created_at: p.created_at || new Date().toISOString(),
            } : undefined,
          }));

          result = [...result, ...mappedProposals];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar propostas no Docs:', err);
      }

      try {
        // 2. Documentos de oportunidade
        const { data: oppDocsData, error: oppDocsError } = await supabase
          .from('opportunity_documents')
          .select(`
            id,
            name,
            description,
            file_path,
            mime_type,
            created_at,
            uploaded_by,
            investor_opportunities!inner (
              organization_id,
              project_id
            )
          `)
          .eq('investor_opportunities.organization_id', organizationId);

        if (!oppDocsError && oppDocsData) {
          let filteredOppDocs = oppDocsData;
          if (targetProjectIds.length > 0) {
            filteredOppDocs = oppDocsData.filter((od: any) => {
              const opp = od.investor_opportunities;
              return opp && targetProjectIds.includes(opp.project_id);
            });
          }

          const mappedOppDocs: OpuraDocument[] = filteredOppDocs.map((od: any) => ({
            id: od.id,
            organization_id: organizationId || '',
            nome: od.name || `Documento Comercial ${od.id}`,
            descricao: od.description || `Documento de Oportunidade Comercial`,
            categoria: 'comercial',
            tipo_documento: 'Documento Comercial',
            status: 'ativo',
            data_emissao: od.created_at || undefined,
            alerta_dias_antecedencia: 30,
            tags: ['Comercial', 'Oportunidade'].filter(Boolean),
            criado_por: od.uploaded_by || 'sistema',
            created_at: od.created_at || new Date().toISOString(),
            updated_at: od.created_at || new Date().toISOString(),
            project_id: od.investor_opportunities?.project_id || undefined,
            is_integrated: true,
            active_version: od.file_path ? {
              id: `ver-${od.id}`,
              document_id: od.id,
              version_number: 1,
              storage_path: `opportunity-dataroom:${od.file_path}`,
              tamanho: 0,
              mime_type: od.mime_type || 'application/pdf',
              criado_por: od.uploaded_by || 'sistema',
              created_at: od.created_at || new Date().toISOString(),
            } : undefined,
          }));

          result = [...result, ...mappedOppDocs];
        }
      } catch (err) {
        console.error('[DocumentService] Erro ao integrar documentos de oportunidade no Docs:', err);
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
      .select('*, active_version:opura_document_versions!fk_active_version(*), versions:opura_document_versions!opura_document_versions_document_id_fkey(*)')
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
    file: File,
    uploadedByEmail?: string
  ): Promise<OpuraDocument> {
    // 1. Criar o registro do documento na base (sem active_version_id inicialmente)
    const { data: newDoc, error: docError } = await supabase
      .from('opura_documents')
      .insert({
        organization_id: docData.organization_id,
        nome: docData.nome,
        criado_por: uploadedByEmail || 'sistema',
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
        folder_id: docData.folder_id || null,
      })
      .select()
      .single();

    if (docError) {
      console.error('[DocumentService] Erro ao registrar documento:', docError);
      throw new Error(`Erro ao registrar documento: ${docError.message}`);
    }

    const documentId = newDoc.id;
    const versionId = generateUUID();
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
          criado_por: uploadedByEmail || 'sistema',
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

      // Registrar auditoria (Onda 4)
      await this.logDocumentAction(
        docData.organization_id,
        documentId,
        (newDoc as any).criado_por || 'sistema',
        'criado',
        `Arquivo inicial: ${file.name}`
      );

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
    file: File,
    uploadedByEmail: string
  ): Promise<OpuraDocumentVersion> {
    const versionId = generateUUID();
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
          criado_por: uploadedByEmail,
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

      // Registrar auditoria (Onda 4)
      await this.logDocumentAction(
        organizationId,
        documentId,
        uploadedByEmail,
        'versao_enviada',
        `Nova versão física R${nextVersionNumber} enviada: ${file.name}`
      );

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
  async generateDownloadUrl(
    storagePath: string,
    organizationId?: string,
    documentId?: string,
    email?: string
  ): Promise<string> {
    if (!storagePath) {
      throw new Error('Caminho de armazenamento do arquivo é nulo ou indefinido');
    }
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    let bucket = 'opura-docs';
    let cleanPath = storagePath;

    if (storagePath.includes(':')) {
      const parts = storagePath.split(':');
      bucket = parts[0];
      cleanPath = parts[1];
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(cleanPath, 60 * 15); // Link válido por 15 minutos

    if (error) {
      console.error(`[DocumentService] Erro ao gerar link assinado para o bucket ${bucket}:`, error);
      throw new Error(`Erro ao gerar link de download: ${error.message}`);
    }

    // Registrar auditoria se os dados do operador forem passados (Onda 4)
    if (organizationId && documentId && email) {
      await this.logDocumentAction(
        organizationId,
        documentId,
        email,
        'download',
        `Download iniciado do arquivo físico: ${cleanPath.split('/').pop()}`
      );
    }

    return data.signedUrl;
  },

  // ─── GERENCIAMENTO DE PASTAS VIRTUAIS ────────────────────────
  async listFolders(
    organizationId: string,
    categoria: OpuraDocumentCategoria,
    projectId?: string
  ): Promise<OpuraFolder[]> {
    let query = supabase
      .from('opura_folders')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('categoria', categoria);

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', projectId);
    } else {
      query = query.is('project_id', null);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      console.error('[DocumentService] Erro ao listar pastas:', error);
      throw new Error(`Erro ao listar pastas: ${error.message}`);
    }

    return (data || []) as OpuraFolder[];
  },

  async createFolder(folder: OpuraFolderInsert): Promise<OpuraFolder> {
    const { data, error } = await supabase
      .from('opura_folders')
      .insert(folder)
      .select()
      .single();

    if (error) {
      console.error('[DocumentService] Erro ao criar pasta:', error);
      throw new Error(`Erro ao criar pasta: ${error.message}`);
    }

    return data as OpuraFolder;
  },

  async updateFolder(id: string, updates: Partial<OpuraFolderInsert>): Promise<OpuraFolder> {
    const { data, error } = await supabase
      .from('opura_folders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[DocumentService] Erro ao atualizar pasta:', error);
      throw new Error(`Erro ao atualizar pasta: ${error.message}`);
    }

    return data as OpuraFolder;
  },

  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_folders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DocumentService] Erro ao excluir pasta:', error);
      throw new Error(`Erro ao excluir pasta: ${error.message}`);
    }
  },

  async moveDocumentToFolder(
    documentId: string,
    folderId: string | null,
    organizationId: string,
    email: string
  ): Promise<void> {
    const { error } = await supabase
      .from('opura_documents')
      .update({ folder_id: folderId })
      .eq('id', documentId);

    if (error) {
      console.error('[DocumentService] Erro ao mover documento:', error);
      throw new Error(`Erro ao mover documento: ${error.message}`);
    }

    // Registrar auditoria (Onda 4)
    await this.logDocumentAction(
      organizationId,
      documentId,
      email,
      'movido_pasta',
      folderId ? `Movido para pasta ID: ${folderId}` : 'Movido para o diretório raiz'
    );
  },

  // ─── FLUXO DE APROVAÇÃO E WORKFLOWS ──────────────────────────
  async submitForApproval(
    documentId: string,
    requestedByEmail: string,
    approverEmail: string
  ): Promise<OpuraDocumentApproval> {
    // 1. Atualizar o status do documento para 'pendente'
    const { error: docError } = await supabase
      .from('opura_documents')
      .update({ approval_status: 'pendente' })
      .eq('id', documentId);

    if (docError) {
      console.error('[DocumentService] Erro ao atualizar status de aprovação do documento:', docError);
      throw new Error(`Erro ao solicitar aprovação: ${docError.message}`);
    }

    // 2. Criar o registro de aprovação
    const { data: approval, error: approvalError } = await supabase
      .from('opura_document_approvals')
      .insert({
        document_id: documentId,
        requested_by: requestedByEmail,
        approver_email: approverEmail,
        status: 'pendente',
      })
      .select()
      .single();

    if (approvalError) {
      console.error('[DocumentService] Erro ao registrar aprovação:', approvalError);
      // Rollback status do documento
      await supabase
        .from('opura_documents')
        .update({ approval_status: 'rascunho' })
        .eq('id', documentId);
      throw new Error(`Erro ao registrar aprovação: ${approvalError.message}`);
    }

    // 3. Disparar notificação em tempo real
    try {
      const { data: doc } = await supabase
        .from('opura_documents')
        .select('nome, categoria, organization_id')
        .eq('id', documentId)
        .single();

      if (doc) {
        // Registrar auditoria (Onda 4)
        await this.logDocumentAction(
          doc.organization_id,
          documentId,
          requestedByEmail,
          'status_alterado',
          `Solicitada revisão de aprovação ao revisor: ${approverEmail}`
        );

        await notificationService.sendNotification({
          recipientEmail: approverEmail,
          title: 'Aprovação de Documento Pendente',
          message: `Você tem uma solicitação de aprovação pendente para o documento "${doc.nome}" enviada por ${requestedByEmail}.`,
          link: `#/documentos?tab=${doc.categoria}&docId=${documentId}&pending=true`,
          type: 'solicitacao_aprovacao'
        });
      }
    } catch (notifErr) {
      console.error('[DocumentService] Erro ao enviar notificação de aprovação pendente:', notifErr);
    }

    return approval as OpuraDocumentApproval;
  },

  async approveDocument(approvalId: string, feedback?: string): Promise<void> {
    // 1. Atualizar a aprovação para 'aprovado'
    const { data: approval, error: approvalError } = await supabase
      .from('opura_document_approvals')
      .update({
        status: 'aprovado',
        feedback: feedback || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .select()
      .single();

    if (approvalError || !approval) {
      console.error('[DocumentService] Erro ao aprovar documento no histórico:', approvalError);
      throw new Error(`Erro ao registrar aprovação: ${approvalError?.message || 'Histórico não encontrado'}`);
    }

    // 2. Atualizar o status final do documento para 'aprovado'
    const { error: docError } = await supabase
      .from('opura_documents')
      .update({ approval_status: 'aprovado' })
      .eq('id', approval.document_id);

    if (docError) {
      console.error('[DocumentService] Erro ao atualizar status do documento para aprovado:', docError);
      throw new Error(`Erro ao atualizar status do documento: ${docError.message}`);
    }

    // 3. Disparar notificação em tempo real
    try {
      const { data: doc } = await supabase
        .from('opura_documents')
        .select('nome, categoria, organization_id')
        .eq('id', approval.document_id)
        .single();

      if (doc) {
        // Registrar auditoria (Onda 4)
        await this.logDocumentAction(
          doc.organization_id,
          approval.document_id,
          approval.approver_email,
          'status_alterado',
          `Documento Aprovado. Comentários: ${feedback || 'Sem observações'}`
        );

        await notificationService.sendNotification({
          recipientEmail: approval.requested_by,
          title: 'Documento Aprovado',
          message: `O revisor ${approval.approver_email} aprovou o seu documento "${doc.nome}".${feedback ? ` Comentários: "${feedback}"` : ''}`,
          link: `#/documentos?tab=${doc.categoria}&docId=${approval.document_id}`,
          type: 'documento_aprovado'
        });
      }
    } catch (notifErr) {
      console.error('[DocumentService] Erro ao disparar notificação de aprovação:', notifErr);
    }
  },

  async rejectDocument(approvalId: string, feedback: string): Promise<void> {
    if (!feedback || !feedback.trim()) {
      throw new Error('O feedback (justificativa) é obrigatório ao rejeitar um documento.');
    }

    // 1. Atualizar a aprovação para 'rejeitado'
    const { data: approval, error: approvalError } = await supabase
      .from('opura_document_approvals')
      .update({
        status: 'rejeitado',
        feedback: feedback.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .select()
      .single();

    if (approvalError || !approval) {
      console.error('[DocumentService] Erro ao rejeitar documento no histórico:', approvalError);
      throw new Error(`Erro ao registrar rejeição: ${approvalError?.message || 'Histórico não encontrado'}`);
    }

    // 2. Atualizar o status final do documento para 'rejeitado'
    const { error: docError } = await supabase
      .from('opura_documents')
      .update({ approval_status: 'rejeitado' })
      .eq('id', approval.document_id);

    if (docError) {
      console.error('[DocumentService] Erro ao atualizar status do documento para rejeitado:', docError);
      throw new Error(`Erro ao atualizar status do documento: ${docError.message}`);
    }

    // 3. Disparar notificação em tempo real
    try {
      const { data: doc } = await supabase
        .from('opura_documents')
        .select('nome, categoria, organization_id')
        .eq('id', approval.document_id)
        .single();

      if (doc) {
        // Registrar auditoria (Onda 4)
        await this.logDocumentAction(
          doc.organization_id,
          approval.document_id,
          approval.approver_email,
          'status_alterado',
          `Documento Rejeitado. Justificativa: ${feedback.trim()}`
        );

        await notificationService.sendNotification({
          recipientEmail: approval.requested_by,
          title: 'Documento Rejeitado',
          message: `O revisor ${approval.approver_email} rejeitou o seu documento "${doc.nome}". Justificativa: "${feedback.trim()}"`,
          link: `#/documentos?tab=${doc.categoria}&docId=${approval.document_id}`,
          type: 'documento_rejeitado'
        });
      }
    } catch (notifErr) {
      console.error('[DocumentService] Erro ao disparar notificação de rejeição:', notifErr);
    }
  },

  async listPendingApprovals(approverEmail: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('opura_document_approvals')
      .select('*, document:opura_documents(*)')
      .eq('approver_email', approverEmail)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DocumentService] Erro ao listar aprovações pendentes:', error);
      throw new Error(`Erro ao listar aprovações pendentes: ${error.message}`);
    }

    return data || [];
  },

  async listOrganizationMembers(organizationId: string): Promise<{ name: string; email: string }[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('name, email')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[DocumentService] Erro ao listar membros da organização:', error);
      throw new Error(`Erro ao listar membros: ${error.message}`);
    }

    return data || [];
  },

  async listApprovalsForDocument(documentId: string): Promise<OpuraDocumentApproval[]> {
    const { data, error } = await supabase
      .from('opura_document_approvals')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DocumentService] Erro ao obter histórico de aprovações do documento:', error);
      throw new Error(`Erro ao obter histórico de aprovações: ${error.message}`);
    }

    return (data || []) as OpuraDocumentApproval[];
  },

  async logDocumentAction(
    organizationId: string,
    documentId: string,
    email: string,
    action: 'criado' | 'versao_enviada' | 'download' | 'visualizado' | 'movido_pasta' | 'status_alterado',
    details?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('opura_document_audit_logs')
      .insert({
        organization_id: organizationId,
        document_id: documentId,
        user_email: email,
        action,
        details: details || null
      });

    if (error) {
      console.error('[DocumentService] Erro ao registrar log de auditoria do documento:', error);
    }
  },

  async listAuditLogsForDocument(documentId: string): Promise<OpuraDocumentAuditLog[]> {
    const { data, error } = await supabase
      .from('opura_document_audit_logs')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DocumentService] Erro ao carregar logs de auditoria:', error);
      throw new Error(`Erro ao carregar histórico: ${error.message}`);
    }

    return (data || []) as OpuraDocumentAuditLog[];
  },

  async saveDocumentMarkup(
    documentId: string,
    versionId: string,
    userEmail: string,
    markupData: any
  ): Promise<OpuraDocumentMarkup> {
    const { data, error } = await supabase
      .from('opura_document_markups')
      .insert({
        document_id: documentId,
        version_id: versionId,
        user_email: userEmail,
        markup_data: markupData,
      })
      .select()
      .single();

    if (error) {
      console.error('[DocumentService] Erro ao salvar marcação do documento:', error);
      throw new Error(`Erro ao salvar marcações: ${error.message}`);
    }

    return data as OpuraDocumentMarkup;
  },

  async listDocumentMarkups(
    documentId: string,
    versionId: string
  ): Promise<OpuraDocumentMarkup[]> {
    const { data, error } = await supabase
      .from('opura_document_markups')
      .select('*')
      .eq('document_id', documentId)
      .eq('version_id', versionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DocumentService] Erro ao carregar marcações do documento:', error);
      throw new Error(`Erro ao obter marcações: ${error.message}`);
    }

    return (data || []) as OpuraDocumentMarkup[];
  },

  async getPublicDocumentStatus(docId: string): Promise<{
    document_name: string;
    category: string;
    active_version_id: string;
    active_version_number: number;
    active_version_created_at: string;
    active_version_storage_path: string;
    status: string;
  } | null> {
    const { data, error } = await supabase
      .rpc('fn_get_document_status_public', { doc_id: docId });

    if (error) {
      console.error('[DocumentService] Erro ao verificar status público do documento:', error);
      throw new Error(`Erro ao checar status público: ${error.message}`);
    }

    if (!data || data.length === 0) return null;
    return data[0];
  },
};
