// utils/documentosDoSindico.ts
//
// Portal do Síndico › Documentos (G5, 26/11/2026). A parte pura.
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_documento_*`, migration aplicar_20271126950300) e a
// Edge `sindico-portal-documentos` sobe/tira o arquivo; isto existe para o botão desligado
// dizer o motivo ANTES do clique.
import type { DocumentoCategoria } from '../services/condominioComunicacaoService';

/** Um documento como `sindico_portal_documentos` devolve. */
export interface DocumentoDoPredio {
    id: string;
    titulo: string;
    categoria: DocumentoCategoria;
    descricao: string | null;
    visivelPortal: boolean;
    arquivo: string | null;
    tamanho: number | null;
    /** Cadastrado como endereço externo (sem arquivo no bucket). */
    link: boolean;
    criadoEm: string;
    /** Ata ou procuração de assembleia: fica com a assembleia (não sai, a procuração não vai ao portal). */
    motivoPreso: string | null;
}

export const ROTULO_CATEGORIA_DOCUMENTO: Record<DocumentoCategoria, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata', MANUAL: 'Manual',
    LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

/** Espelha `MIME_PERMITIDOS` da Edge (= o bucket): o `accept` do seletor de arquivo. */
export const ACEITA_ARQUIVO = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';
export const TAMANHO_MAXIMO_MB = 50;

export function motivoNaoEnvia(f: { titulo: string; arquivo: { size: number } | null }): string | null {
    if (!f.arquivo) return 'Escolha o arquivo.';
    if (f.arquivo.size > TAMANHO_MAXIMO_MB * 1048576) return `O arquivo passa do limite de ${TAMANHO_MAXIMO_MB} MB.`;
    if (!f.titulo.trim()) return 'Informe o título do documento.';
    return null;
}

export function motivoNaoRemoveDocumento(d: Pick<DocumentoDoPredio, 'motivoPreso'>, base: string | null): string | null {
    return base ?? d.motivoPreso;
}

/** Procuração de assembleia nunca vai ao portal (mesma frase do banco). */
export function motivoNaoMostra(d: Pick<DocumentoDoPredio, 'motivoPreso' | 'visivelPortal'>, base: string | null): string | null {
    if (base) return base;
    if (!d.visivelPortal && d.motivoPreso?.startsWith('Esta é a procuração')) return 'Procuração tem dados pessoais e não vai ao portal do morador.';
    return null;
}

/** Título sugerido a partir do nome do arquivo: "laudo_spda-2026.pdf" → "laudo spda 2026". */
export function tituloDoArquivo(nome: string): string {
    return nome.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
