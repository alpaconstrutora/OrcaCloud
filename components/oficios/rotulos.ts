import type { OpuraDocumentCategoria } from '../../types/documents';
import type { DocGenModeloStatus } from '../../types/docGen';

/** Mesmos rótulos das abas do GED (OpuraDocsModule › CATEGORIES). */
export const CATEGORIA_GED_LABEL: Record<OpuraDocumentCategoria, string> = {
    engenharia: 'Projetos',
    juridico: 'Contratos',
    compliance: 'Licenças & Alvarás',
    financeiro: 'Financeiro',
    comercial: 'Comercial',
};

export const CATEGORIAS_GED: OpuraDocumentCategoria[] = ['juridico', 'engenharia', 'compliance', 'financeiro', 'comercial'];

/** §8 — texto colorido simples, sem pílula. */
export const STATUS_MODELO: Record<DocGenModeloStatus, { label: string; className: string }> = {
    rascunho: { label: 'Rascunho', className: 'text-gray-600' },
    ativo: { label: 'Ativo', className: 'text-green-700' },
    inativo: { label: 'Inativo', className: 'text-red-600' },
};

export const formatarDataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
