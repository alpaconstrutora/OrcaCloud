import type { OpuraDocument } from '../types/documents';
import type { PartnerRequest } from '../types/partner';

/**
 * "Enviados por você" (Portal do Parceiro › Documentos) — o que o parceiro mandou
 * pela aba, à espera de a construtora revisar e incluir no GED. É uma solicitação
 * `DOCUMENTACAO` com anexo, não um documento do GED.
 *
 * Pedido de 03/10/2026: a tabela desses envios deve ter AS MESMAS COLUNAS da
 * tabela de documentos (a `DocumentsTable` do GED). Então cada envio vira uma
 * linha no formato de `OpuraDocument`, e a tabela é a própria `DocumentsTable`.
 * O que o envio não tem fica vazio e a tabela mostra "-", como no GED:
 *   Documento        → nome do arquivo (sem o prefixo numérico do upload);
 *                      a observação do parceiro vai numa linha abaixo do nome
 *   Extensão         → da extensão do arquivo
 *   Autor            → o parceiro (nome do fornecedor do workspace)
 *   Emissão          → a data do envio
 *   Status           → "Aguardando revisão" / "Incluído no GED" (`sentDocumentStatus`)
 *   Nº Doc. Fornecedor, Tipo / Categoria, Revisão, Obra Vinculada, Validade → "-"
 *
 * Não existe vínculo gravado entre a solicitação e o documento que a construtora
 * cria ao incluir no GED (`partner_requests` não tem coluna para isso), então
 * mesmo "Incluído no GED" não herda os metadados do documento final.
 */

/** O envio de documento é a solicitação DOCUMENTACAO com pelo menos um anexo. */
export const isSentDocument = (req: PartnerRequest): boolean =>
  req.type === 'DOCUMENTACAO' && !!req.attachment_paths && req.attachment_paths.length > 0;

/** Nome do arquivo do primeiro anexo, sem pasta e sem o prefixo `123456_` do upload. */
export const sentDocumentFileName = (req: PartnerRequest): string =>
  (req.attachment_paths?.[0]?.split('/').pop() || '').replace(/^\d+_/, '') || req.title;

/** Status do envio na linguagem do parceiro — texto colorido, sem pílula (§8). */
export const sentDocumentStatus = (req: PartnerRequest): { label: string; className: string } =>
  req.status === 'CONCLUIDO'
    ? { label: 'Incluído no GED', className: 'text-green-600' }
    : { label: 'Aguardando revisão', className: 'text-amber-600' };

const diaLocalAoMeioDia = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00`;
};

/** Linha da `DocumentsTable` para um envio. `id` = id da solicitação. */
export const sentDocumentAsRow = (
  req: PartnerRequest,
  ctx: { supplierName?: string; organizationId?: string | null },
): OpuraDocument => {
  const fileName = sentDocumentFileName(req);
  return {
    id: req.id,
    organization_id: ctx.organizationId || '',
    nome: fileName,
    descricao: req.description || undefined,
    categoria: 'engenharia',
    tipo_documento: '-',
    autor: ctx.supplierName || undefined,
    // Emissão = dia do envio NO FUSO DE QUEM VÊ (o card antigo mostrava
    // `new Date(created_at).toLocaleDateString()`): um envio às 23h30 de Brasília
    // é 02h30 UTC do dia seguinte, e cortar o ISO no 'T' mostraria o dia errado.
    // Ancorado ao meio-dia local para a tabela, que formata com `new Date(...)`.
    data_emissao: req.created_at ? diaLocalAoMeioDia(req.created_at) : undefined,
    status: req.status === 'CONCLUIDO' ? 'ativo' : 'pendente_aprovacao',
    alerta_dias_antecedencia: 0,
    tags: [],
    criado_por: req.created_by_email,
    created_at: req.created_at,
    updated_at: req.updated_at,
    active_version: req.attachment_paths?.[0]
      ? { storage_path: req.attachment_paths[0], mime_type: '' }
      : undefined,
  } as OpuraDocument;
};
