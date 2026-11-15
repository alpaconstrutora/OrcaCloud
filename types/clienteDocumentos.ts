// types/clienteDocumentos.ts
// Documentos do cliente (Meus Clientes › aba Documentos), 15/11/2026.
// Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
//
// O ARQUIVO mora no GED (opura_documents, client_id = cliente). Meus Clientes é
// a casa; o comercial (checklist da negociação, DealModal) lê e grava os mesmos
// documentos.
//
// O tipo do documento vai em `opura_documents.metadados.documento_cliente`, com
// as MESMAS chaves do checklist da negociação (commercial_deals.doc_checklist).
// É por ela, não pelo rótulo, que o checklist acha o arquivo — rótulo pode
// mudar, chave não.
import type { OpuraDocument } from './documents';
import { diasEntre, hojeISO } from '../utils/empreendimentoDocumentos';

export interface TipoDocumentoCliente { key: string; label: string }

/** Checklist de documentos exigidos do cliente/comprador, por tipo de pessoa.
 * As chaves (`key`) são o que fica gravado em commercial_deals.doc_checklist e em
 * opura_documents.metadados.documento_cliente — NÃO renomear sem migração de
 * dados. Rótulos podem mudar livremente. (Veio do DealModal, DEAL_DOC_CHECKLIST.) */
export const TIPOS_DOCUMENTO_CLIENTE: Record<'PF' | 'PJ', TipoDocumentoCliente[]> = {
    PF: [
        { key: 'rg_cnh', label: 'RG / CNH' },
        { key: 'cpf', label: 'CPF' },
        { key: 'certidao_estado_civil', label: 'Certidão de estado civil' },
        { key: 'comprovante_residencia', label: 'Comprovante de residência' },
        { key: 'declaracao_irpf', label: 'Declaração IRPF (último ano)' },
        { key: 'certidao_negativa_federal', label: 'Certidão negativa federal' },
        { key: 'comprovante_renda', label: 'Comprovante de renda (3 últimos)' },
        { key: 'extratos_bancarios', label: 'Extratos bancários (3 meses)' },
    ],
    PJ: [
        { key: 'cnpj', label: 'CNPJ' },
        { key: 'contrato_social', label: 'Contrato social ou estatuto atualizado (última alteração)' },
        { key: 'docs_socios', label: 'Documentos dos sócios/administradores' },
        { key: 'certidoes_negativas_empresa', label: 'Certidões negativas da empresa' },
        { key: 'balanco_dre_faturamento', label: 'Balanço, DRE ou faturamento' },
        { key: 'procuracao', label: 'Procuração, se houver representante' },
    ],
};

/** Qualquer outro documento do cliente — o rótulo é o que o usuário escrever. */
export const TIPO_DOCUMENTO_CLIENTE_OUTRO: TipoDocumentoCliente = { key: 'outro', label: 'Outro documento' };

/** Tipos oferecidos para um cliente PF/PJ, mais "Outro" no fim. */
export function tiposDoCliente(tipoPessoa?: string | null): TipoDocumentoCliente[] {
    return [...TIPOS_DOCUMENTO_CLIENTE[tipoPessoa === 'PJ' ? 'PJ' : 'PF'], TIPO_DOCUMENTO_CLIENTE_OUTRO];
}

/** Rótulo de uma chave, procurando nas duas listas (um PF que virou PJ não perde o rótulo). */
export function rotuloDoTipo(key?: string | null): string | null {
    if (!key) return null;
    if (key === TIPO_DOCUMENTO_CLIENTE_OUTRO.key) return TIPO_DOCUMENTO_CLIENTE_OUTRO.label;
    const achado = [...TIPOS_DOCUMENTO_CLIENTE.PF, ...TIPOS_DOCUMENTO_CLIENTE.PJ].find(t => t.key === key);
    return achado?.label ?? null;
}

/** Chave do tipo gravada no documento do GED; `null` se não for documento de cliente tipado. */
export function chaveDoDocumento(doc: Pick<OpuraDocument, 'metadados'>): string | null {
    const v = doc.metadados?.documento_cliente;
    return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * O documento que atende o item `key` do checklist para o cliente `clientId`:
 * o mais recente desse tipo (renovou o comprovante de residência → vale o novo).
 */
export function documentoDoItem(
    docs: Pick<OpuraDocument, 'client_id' | 'metadados' | 'created_at'>[],
    clientId: string,
    key: string,
): typeof docs[number] | null {
    let melhor: typeof docs[number] | null = null;
    for (const d of docs) {
        if (d.client_id !== clientId || chaveDoDocumento(d) !== key) continue;
        if (!melhor || (d.created_at ?? '') > (melhor.created_at ?? '')) melhor = d;
    }
    return melhor;
}

export type SituacaoValidade = 'sem_validade' | 'ok' | 'vencendo' | 'vencido';

/**
 * Situação da validade. `data_validade` é data pura (`YYYY-MM-DD`), comparada
 * com o "hoje" LOCAL — `new Date('2026-11-15')` seria meia-noite UTC, que no
 * Brasil ainda é o dia 14.
 */
export function situacaoDaValidade(
    doc: Pick<OpuraDocument, 'data_validade' | 'alerta_dias_antecedencia'>,
    hoje: string = hojeISO(),
): { situacao: SituacaoValidade; dias: number | null } {
    if (!doc.data_validade) return { situacao: 'sem_validade', dias: null };
    const dias = diasEntre(hoje, doc.data_validade);
    if (dias < 0) return { situacao: 'vencido', dias };
    if (dias <= Math.max(0, doc.alerta_dias_antecedencia ?? 30)) return { situacao: 'vencendo', dias };
    return { situacao: 'ok', dias };
}

/** Dados que a aba e o checklist pedem ao enviar ou editar um documento do cliente. */
export interface MetaDocumentoCliente {
    /** Chave de TIPOS_DOCUMENTO_CLIENTE ou 'outro'. */
    tipo: string;
    nome: string;
    /** Só para tipo 'outro': o que é o documento. Vazio = "Outro documento". */
    tipoLivre?: string;
    data_validade?: string | null;
}

/** Rótulo que vai em `opura_documents.tipo_documento` (o que o GED mostra na coluna Tipo). */
export function tipoDocumentoNoGed(meta: Pick<MetaDocumentoCliente, 'tipo' | 'tipoLivre'>): string {
    if (meta.tipo === TIPO_DOCUMENTO_CLIENTE_OUTRO.key) return meta.tipoLivre?.trim() || TIPO_DOCUMENTO_CLIENTE_OUTRO.label;
    return rotuloDoTipo(meta.tipo) ?? 'Documento do cliente';
}

/**
 * Payload do INSERT no GED para um documento do cliente. Puro, para o teste
 * provar o que vai ao banco: organização DO CLIENTE (não a do seletor do topo),
 * client_id e a chave do tipo em metadados.
 */
export function payloadDoDocumentoCliente(
    cliente: { id: string; organization_id: string },
    meta: MetaDocumentoCliente,
) {
    return {
        doc: {
            organization_id: cliente.organization_id,
            client_id: cliente.id,
            nome: meta.nome.trim(),
            categoria: 'comercial' as const,
            tipo_documento: tipoDocumentoNoGed(meta),
            status: 'ativo' as const,
            data_validade: meta.data_validade || undefined,
            alerta_dias_antecedencia: 30,
            tags: ['cliente', meta.tipo],
        },
        metadados: { documento_cliente: meta.tipo },
    };
}
