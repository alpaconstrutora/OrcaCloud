// utils/transcricaoDocumento.ts
// Regras puras da transcrição de documentos (23/11/2026).
// Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
//
// Uma transcrição é uma lista de linhas `{ t, c }`: `t` é o texto e `c` a
// confiança do OCR (0–100) enquanto ninguém revisou. `c = null` = a linha veio
// do texto do próprio PDF (exata) ou foi revisada por alguém.

export interface LinhaTranscrita {
  t: string;
  c: number | null;
}

export type OrigemTranscricao = 'TEXTO_DO_PDF' | 'OCR';

export interface Transcricao {
  version_id: string;
  organization_id: string;
  origem: OrigemTranscricao;
  paginas: number;
  linhas: LinhaTranscrita[];
  atualizado_por: string | null;
  updated_at: string;
}

/**
 * Abaixo disto a linha do OCR é destacada para revisão. Medido em 23/11/2026 em
 * duas escrituras escaneadas: o texto datilografado fica acima de 70; carimbo,
 * selo, assinatura e manuscrito ficam abaixo — junto com linhas boas cortadas
 * por carimbo, por isso destacar e não esconder (decisão do usuário).
 */
export const LIMIAR_LINHA_DUVIDOSA = 70;

/** Acima disto de páginas escaneadas a transcrição não começa sozinha (~10 s por página). */
export const MAX_PAGINAS_OCR_AUTOMATICO = 20;

/**
 * Página de PDF com menos que isto de texto conta como escaneada. Scanner às vezes
 * grava um número de página ou espaços como texto invisível.
 */
const MIN_CARACTERES_PAGINA_COM_TEXTO = 30;

export function linhaDuvidosa(l: LinhaTranscrita): boolean {
  return l.c !== null && l.c < LIMIAR_LINHA_DUVIDOSA && l.t.trim() !== '';
}

export function contarDuvidosas(linhas: LinhaTranscrita[]): number {
  return linhas.reduce((n, l) => n + (linhaDuvidosa(l) ? 1 : 0), 0);
}

export function textoDaTranscricao(linhas: LinhaTranscrita[]): string {
  return linhas.map(l => l.t).join('\n');
}

/**
 * Texto revisado → linhas. A linha que ficou igual a uma original mantém a
 * confiança dela (continua destacada se era duvidosa); a alterada ou nova é
 * revisada (`c = null`). Cada original só empresta a confiança uma vez.
 */
export function aplicarEdicao(originais: LinhaTranscrita[], texto: string): LinhaTranscrita[] {
  const confiancas = new Map<string, Array<number | null>>();
  for (const l of originais) {
    const chave = l.t.trimEnd();
    const fila = confiancas.get(chave);
    if (fila) fila.push(l.c);
    else confiancas.set(chave, [l.c]);
  }

  const linhas = texto.split(/\r?\n/).map(t => t.trimEnd());
  while (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();

  return linhas.map(t => {
    const fila = confiancas.get(t);
    const c = fila && fila.length > 0 ? fila.shift()! : null;
    return { t, c };
  });
}

export function marcarRevisada(linhas: LinhaTranscrita[]): LinhaTranscrita[] {
  return linhas.map(l => ({ t: l.t, c: null }));
}

/** Itens do `getTextContent()` do pdf.js → linhas (quebra no `hasEOL`). */
export function linhasDoTextoDoPdf(itens: Array<{ str: string; hasEOL?: boolean }>): LinhaTranscrita[] {
  const linhas: LinhaTranscrita[] = [];
  let atual = '';
  const fechar = () => {
    const t = atual.trim();
    if (t) linhas.push({ t, c: null });
    atual = '';
  };
  for (const item of itens) {
    atual += item.str;
    if (item.hasEOL) fechar();
  }
  fechar();
  return linhas;
}

export function paginaTemTexto(linhas: LinhaTranscrita[]): boolean {
  const caracteres = linhas.reduce((n, l) => n + l.t.replace(/\s/g, '').length, 0);
  return caracteres >= MIN_CARACTERES_PAGINA_COM_TEXTO;
}

/** Páginas → uma lista só, com uma linha em branco entre páginas. */
export function juntarPaginas(paginas: LinhaTranscrita[][]): LinhaTranscrita[] {
  const comTexto = paginas.filter(p => p.length > 0);
  return comTexto.flatMap((p, i) => (i === 0 ? p : [{ t: '', c: null }, ...p]));
}

const EXTENSOES_DE_IMAGEM = ['png', 'jpg', 'jpeg', 'webp'];

/** O que dá para transcrever: PDF e imagem. Word, Excel, DWG e ZIP não. */
export function podeTranscrever(nome: string, mime?: string | null): 'pdf' | 'imagem' | null {
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (EXTENSOES_DE_IMAGEM.includes(ext) || (mime && /^image\/(png|jpe?g|webp)$/.test(mime))) return 'imagem';
  return null;
}
