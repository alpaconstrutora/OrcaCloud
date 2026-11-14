// services/empreendimentoDocumentosService.ts
// Aba Documentos do empreendimento (12/11/2026).
// Plano: docs/planos/2026-11-12-empreendimento-aba-documentos.md
//
// O arquivo mora SÓ no GED (opura_documents + bucket opura-docs). Este serviço
// não sobe arquivo por conta própria: delega a documentService (mesmo
// versionamento, auditoria e URL assinada), no molde de cnoService.uploadAndAttach.
//
// Duas listas:
//  - documentos LEGAIS: checklist em empreendimento_documentos_legais, cada item
//    com document_id apontando para o GED (ou nada, enquanto pendente);
//  - OUTROS documentos: opura_documents com empreendimento_id e fora do checklist.
//
// Dono da DATA: o checklist. Quando o item tem documento no GED, emissão,
// validade e alerta são copiados para lá — é o que faz o cron de vencimento do
// GED (fn_opura_docs_vencimento_alerts) avisar.
import { supabase } from '../lib/supabase';
import { documentService } from './documentService';
import type { Empreendimento } from '../types/empreendimento';
import type { OpuraDocument, OpuraDocumentCategoria } from '../types/documents';
import {
  infoDoTipo,
  type DocumentoLegal, type DocumentoLegalInsert, type DocumentoLegalUpdate,
} from '../types/empreendimentoDocumentos';
import { faltantesDaListaPadrao } from '../utils/empreendimentoDocumentos';

const TABELA = 'empreendimento_documentos_legais';

/** Mesmo teto do bucket opura-docs (file_size_limit = 50 MiB). */
export const TAMANHO_MAXIMO_BYTES = 50 * 1024 * 1024;
export const EXTENSOES_ACEITAS = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip';

/** Campos que, mudando no item, precisam ser copiados para o documento do GED. */
const CAMPOS_DE_DATA = ['data_emissao', 'data_validade', 'alerta_dias_antecedencia'] as const;

function validarArquivo(arquivo: File) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error(`O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB — o limite é ${TAMANHO_MAXIMO_BYTES / 1048576} MB.`);
  }
  const ext = arquivo.name.includes('.') ? `.${arquivo.name.split('.').pop()!.toLowerCase()}` : '';
  if (!EXTENSOES_ACEITAS.split(',').includes(ext)) {
    throw new Error(`Tipo de arquivo não aceito (${ext || 'sem extensão'}). Aceitos: ${EXTENSOES_ACEITAS.replace(/,/g, ', ')}.`);
  }
}

async function emailDoUsuario(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? undefined;
}

/**
 * UPDATE em opura_documents aceitando `null` (limpar data). O tipo
 * `OpuraDocumentUpdate` do GED só tem `string | undefined` nas datas, e o
 * supabase-js OMITE campo `undefined` — limpar por ele não limpa nada.
 */
async function atualizarNoGed(
  id: string,
  campos: Partial<{
    nome: string; categoria: OpuraDocumentCategoria; tipo_documento: string;
    data_emissao: string | null; data_validade: string | null; alerta_dias_antecedencia: number;
  }>,
): Promise<OpuraDocument> {
  const { data, error } = await supabase
    .from('opura_documents')
    .update(campos)
    .eq('id', id)
    .select('*, active_version:opura_document_versions!fk_active_version(*)')
    .single();
  if (error) throw new Error(`Erro ao atualizar o documento no GED: ${error.message}`);
  return data as OpuraDocument;
}

/** Próxima versão de um documento do GED (o número vem do maior já gravado). */
async function subirNovaVersao(doc: Pick<OpuraDocument, 'id' | 'organization_id'>, arquivo: File, email?: string) {
  const { data: versoes, error } = await supabase
    .from('opura_document_versions')
    .select('version_number')
    .eq('document_id', doc.id)
    .order('version_number', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Erro ao ler as versões do documento: ${error.message}`);
  const proxima = ((versoes?.[0]?.version_number as number | undefined) ?? 0) + 1;
  return documentService.uploadNewVersion(doc.id, doc.organization_id, proxima, arquivo, email || 'sistema');
}

export interface ResultadoDoItem {
  item: DocumentoLegal;
  /** Preenchido quando o item gravou mas a cópia das datas para o GED falhou. */
  avisoGed?: string;
}

export const empreendimentoDocumentosService = {
  // ─── Checklist legal ──────────────────────────────────────────────────────

  /** Só leitura: abrir a aba nunca grava nada. */
  async listarLegais(empreendimentoId: string): Promise<DocumentoLegal[]> {
    const { data, error } = await supabase
      .from(TABELA)
      .select('*')
      .eq('empreendimento_id', empreendimentoId)
      .order('sort_order', { ascending: true })
      .order('titulo', { ascending: true });
    if (error) throw new Error(`Erro ao carregar os documentos legais: ${error.message}`);
    return (data ?? []) as DocumentoLegal[];
  },

  /**
   * Insere só os tipos da lista padrão que ainda faltam. Relê o banco antes
   * (outra pessoa pode ter carregado no meio-tempo) e o índice único parcial
   * (empreendimento_id, tipo) segura a corrida que sobrar.
   */
  async carregarListaPadrao(e: Pick<Empreendimento, 'id' | 'organization_id'>): Promise<DocumentoLegal[]> {
    const existentes = await this.listarLegais(e.id);
    const novos = faltantesDaListaPadrao(existentes, { organization_id: e.organization_id, empreendimento_id: e.id });
    if (novos.length === 0) return [];
    const { data, error } = await supabase.from(TABELA).insert(novos).select('*');
    if (error) throw new Error(`Erro ao carregar a lista padrão: ${error.message}`);
    return (data ?? []) as DocumentoLegal[];
  },

  async criarLegal(payload: DocumentoLegalInsert): Promise<DocumentoLegal> {
    const { data, error } = await supabase.from(TABELA).insert(payload).select('*').single();
    if (error) {
      if (error.code === '23505') throw new Error('Este documento já está no checklist. Edite o item existente.');
      throw new Error(`Erro ao criar o documento: ${error.message}`);
    }
    return data as DocumentoLegal;
  },

  async atualizarLegal(item: DocumentoLegal, updates: DocumentoLegalUpdate): Promise<ResultadoDoItem> {
    const { data, error } = await supabase.from(TABELA).update(updates).eq('id', item.id).select('*').single();
    if (error) {
      if (error.code === '23505') throw new Error('Já existe um item deste tipo no checklist.');
      throw new Error(`Erro ao salvar o documento: ${error.message}`);
    }
    const salvo = data as DocumentoLegal;

    const mudouData = CAMPOS_DE_DATA.some(c => c in updates && updates[c] !== item[c]);
    if (salvo.document_id && mudouData) {
      try {
        // `null` vai como null: apagar a validade aqui tem de apagar lá, senão o
        // cron do GED continua avisando de um vencimento que não existe mais.
        await atualizarNoGed(salvo.document_id, {
          data_emissao: salvo.data_emissao,
          data_validade: salvo.data_validade,
          alerta_dias_antecedencia: salvo.alerta_dias_antecedencia,
        });
      } catch (err) {
        return {
          item: salvo,
          avisoGed: `Salvo no checklist, mas a validade não foi copiada para o GED (${err instanceof Error ? err.message : 'erro'}). O alerta de vencimento do GED pode não disparar.`,
        };
      }
    }
    return { item: salvo };
  },

  /** Tira o item do checklist. O documento no GED, se houver, continua lá. */
  async excluirLegal(id: string): Promise<void> {
    const { error } = await supabase.from(TABELA).delete().eq('id', id);
    if (error) throw new Error(`Erro ao excluir o documento: ${error.message}`);
  },

  /**
   * Envia o arquivo do item. Sem documento no GED: cria um (V1). Já com
   * documento: sobe uma NOVA VERSÃO dele — o GED guarda o histórico (renovação
   * de alvará, matrícula atualizada).
   */
  async anexarArquivo(
    e: Pick<Empreendimento, 'id' | 'project_id'>,
    item: DocumentoLegal,
    arquivo: File,
  ): Promise<DocumentoLegal> {
    validarArquivo(arquivo);
    const email = await emailDoUsuario();
    const info = infoDoTipo(item.tipo);

    let documentId: string;
    let storagePath: string | null;

    // Documento do item sumiu do GED (excluído lá)? Cai no ramo de criar um novo.
    const existente = item.document_id ? await documentService.getDocumentById(item.document_id).catch(() => null) : null;

    if (existente) {
      const versao = await subirNovaVersao(existente, arquivo, email);
      documentId = existente.id;
      storagePath = versao.storage_path;
    } else {
      const doc = await documentService.uploadNewDocument(
        {
          organization_id: item.organization_id,
          empreendimento_id: e.id,
          project_id: e.project_id || undefined,
          nome: item.titulo,
          categoria: info.categoria,
          tipo_documento: item.tipo === 'OUTRO' ? item.titulo : info.rotulo,
          numero_documento_fornecedor: item.numero || undefined,
          status: 'ativo',
          data_emissao: item.data_emissao || undefined,
          data_validade: item.data_validade || undefined,
          alerta_dias_antecedencia: item.alerta_dias_antecedencia,
          tags: ['empreendimento', item.tipo.toLowerCase()],
        },
        arquivo,
        email,
      );
      documentId = doc.id;
      storagePath = doc.active_version?.storage_path ?? null;
    }

    const { data, error } = await supabase
      .from(TABELA)
      .update({
        document_id: documentId,
        storage_path: storagePath,
        ...(item.situacao === 'PENDENTE' ? { situacao: 'EMITIDO' } : {}),
      })
      .eq('id', item.id)
      .select('*')
      .single();
    if (error) throw new Error(`Arquivo enviado ao GED, mas o checklist não foi atualizado: ${error.message}`);
    return data as DocumentoLegal;
  },

  /**
   * Liga o item a um documento que JÁ está no GED. Se o documento ainda não
   * pertence a nenhum empreendimento, passa a pertencer a este — assim ele
   * aparece no filtro "Empreendimento" do GED.
   */
  async vincularDoGed(e: Pick<Empreendimento, 'id'>, item: DocumentoLegal, doc: OpuraDocument): Promise<DocumentoLegal> {
    if (doc.is_integrated) throw new Error('Este documento vem de outro módulo (contrato, nota fiscal…) e não pode ser vinculado aqui.');
    if (!doc.empreendimento_id) {
      try {
        await documentService.updateDocument(doc.id, { empreendimento_id: e.id });
      } catch {
        // Sem permissão de editar o documento no GED: o vínculo do checklist vale mesmo assim.
      }
    }
    const { data, error } = await supabase
      .from(TABELA)
      .update({
        document_id: doc.id,
        storage_path: doc.active_version?.storage_path ?? null,
        ...(item.situacao === 'PENDENTE' ? { situacao: 'EMITIDO' } : {}),
      })
      .eq('id', item.id)
      .select('*')
      .single();
    if (error) throw new Error(`Erro ao vincular o documento: ${error.message}`);
    return data as DocumentoLegal;
  },

  /** Solta o arquivo do item. O documento continua no GED. */
  async desvincular(item: DocumentoLegal): Promise<DocumentoLegal> {
    const { data, error } = await supabase
      .from(TABELA)
      .update({ document_id: null, storage_path: null })
      .eq('id', item.id)
      .select('*')
      .single();
    if (error) throw new Error(`Erro ao desvincular: ${error.message}`);
    return data as DocumentoLegal;
  },

  // ─── Outros documentos (direto do GED) ────────────────────────────────────

  /**
   * Todos os documentos do GED deste empreendimento — inclusive os do checklist.
   * Quem separa "outros" é a aba (em memória), para as duas consultas rodarem
   * em paralelo.
   */
  async listarDoGed(empreendimentoId: string): Promise<OpuraDocument[]> {
    const { data, error } = await supabase
      .from('opura_documents')
      .select('*, active_version:opura_document_versions!fk_active_version(*)')
      .eq('empreendimento_id', empreendimentoId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Erro ao carregar os documentos: ${error.message}`);
    return (data ?? []) as OpuraDocument[];
  },

  async enviarOutro(
    e: Pick<Empreendimento, 'id' | 'organization_id' | 'project_id'>,
    arquivo: File,
    meta: { nome: string; categoria: OpuraDocumentCategoria; tipo_documento: string; data_validade?: string | null },
  ): Promise<OpuraDocument> {
    validarArquivo(arquivo);
    const email = await emailDoUsuario();
    return documentService.uploadNewDocument(
      {
        organization_id: e.organization_id,
        empreendimento_id: e.id,
        project_id: e.project_id || undefined,
        nome: meta.nome,
        categoria: meta.categoria,
        tipo_documento: meta.tipo_documento,
        status: 'ativo',
        data_validade: meta.data_validade || undefined,
        alerta_dias_antecedencia: 30,
        tags: ['empreendimento'],
      },
      arquivo,
      email,
    );
  },

  /**
   * id → nome dos empreendimentos citados nos documentos do GED (filtro
   * "Empreendimento" e o nome sob o documento). Uma consulta só, pelos ids que
   * aparecem na tela — não a lista inteira da organização.
   */
  /**
   * Edita os dados de um documento do GED pela aba. Com `arquivo`, sobe uma nova
   * versão antes (o GED guarda a anterior). Devolve o documento relido, com a
   * versão ativa nova.
   */
  async atualizarOutro(
    doc: OpuraDocument,
    meta: { nome: string; categoria: OpuraDocumentCategoria; tipo_documento: string; data_validade?: string | null },
    arquivo?: File | null,
  ): Promise<OpuraDocument> {
    if (arquivo) {
      validarArquivo(arquivo);
      await subirNovaVersao(doc, arquivo, await emailDoUsuario());
    }
    return atualizarNoGed(doc.id, {
      nome: meta.nome,
      categoria: meta.categoria,
      tipo_documento: meta.tipo_documento,
      data_validade: meta.data_validade || null, // vazio limpa a validade
    });
  },

  /**
   * Apaga o documento do GED (todas as versões e os arquivos). O GED recusa
   * documento emitido (versão congelada) antes de tocar no armazenamento.
   */
  async excluirOutro(doc: Pick<OpuraDocument, 'id' | 'organization_id'>): Promise<void> {
    await documentService.deleteDocument(doc.id, doc.organization_id);
  },

  async nomesDosEmpreendimentos(ids: string[]): Promise<Record<string, string>> {
    const unicos = Array.from(new Set(ids.filter(Boolean)));
    if (unicos.length === 0) return {};
    const { data, error } = await supabase.from('empreendimentos').select('id, name').in('id', unicos);
    if (error) throw new Error(`Erro ao carregar os empreendimentos: ${error.message}`);
    return Object.fromEntries((data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  },

  /** URL assinada (15 min) — delega ao GED. */
  async urlDoArquivo(storagePath: string): Promise<string> {
    return documentService.generateDownloadUrl(storagePath);
  },
};
