// services/transcricaoDocumentoService.ts
// Transcrição do texto de documentos do GED (23/11/2026).
// Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
//
// Tudo roda NO NAVEGADOR e é gratuito: o arquivo não sai da máquina.
//  - página de PDF com texto → texto do próprio PDF (pdf.js), exato;
//  - página escaneada ou imagem → OCR com Tesseract.js em português. Só o
//    modelo de idioma é baixado do CDN do Tesseract (jsDelivr), uma vez.
//
// O resultado é gravado por VERSÃO do arquivo em opura_document_transcricoes.
import { supabase } from '../lib/supabase';
import { documentService } from './documentService';
import { carregarPdfjs } from '../utils/carregarPdfjs';
import {
  juntarPaginas, linhasDoTextoDoPdf, paginaTemTexto, podeTranscrever,
  type LinhaTranscrita, type OrigemTranscricao, type Transcricao,
} from '../utils/transcricaoDocumento';

const TABELA = 'opura_document_transcricoes';

/** 300 dpi: a resolução medida no teste das escrituras (23/11/2026). */
const ESCALA_OCR = 300 / 72;
/** Teto do lado maior da imagem (prancha A1 a 300 dpi passaria de 9 mil px). */
const LADO_MAXIMO_PX = 4200;

export interface ProgressoTranscricao {
  /** Página que está sendo lida pelo OCR (1-based) e o total do documento. */
  pagina: number;
  total: number;
  /** 0–1 do trabalho de OCR inteiro. */
  fracao: number;
}

export interface ResultadoTranscricao {
  origem: OrigemTranscricao;
  paginas: number;
  linhas: LinhaTranscrita[];
}

/** O documento tem mais páginas escaneadas do que o limite pedido. Nada foi lido. */
export class TranscricaoGrandeDemais extends Error {
  constructor(public paginasEscaneadas: number) {
    super(`O documento tem ${paginasEscaneadas} páginas escaneadas.`);
    this.name = 'TranscricaoGrandeDemais';
  }
}

export function ehCancelamento(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function falharSeCancelado(sinal?: AbortSignal) {
  if (sinal?.aborted) throw new DOMException('Transcrição cancelada.', 'AbortError');
}

/**
 * Worker do Tesseract criado na primeira página que precisa de OCR (PDF com
 * texto nunca baixa o modelo). Cancelar encerra o worker no meio da página.
 */
function criarOcr(sinal: AbortSignal | undefined, aoProgredir: (p: number) => void) {
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
  const encerrar = () => { worker?.terminate().catch(() => { /* já encerrado */ }); worker = null; };
  sinal?.addEventListener('abort', encerrar, { once: true });

  return {
    async ler(imagem: HTMLCanvasElement | Blob): Promise<LinhaTranscrita[]> {
      if (!worker) {
        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('por', 1, {
          logger: m => { if (m.status === 'recognizing text') aoProgredir(m.progress); },
        });
        falharSeCancelado(sinal);
      }
      try {
        const { data } = await worker.recognize(imagem, {}, { blocks: true });
        return (data.blocks ?? [])
          .flatMap(b => b.paragraphs.flatMap(p => p.lines))
          .map(l => ({ t: l.text.trimEnd(), c: Math.round(l.confidence) }))
          .filter(l => l.t.trim() !== '');
      } catch (err) {
        falharSeCancelado(sinal); // worker encerrado pelo cancelamento: o erro é o cancelamento
        throw err;
      }
    },
    encerrar() {
      sinal?.removeEventListener('abort', encerrar);
      encerrar();
    },
  };
}

async function renderizarPagina(pagina: any): Promise<HTMLCanvasElement> {
  const base = pagina.getViewport({ scale: 1 });
  const escala = Math.min(ESCALA_OCR, LADO_MAXIMO_PX / Math.max(base.width, base.height));
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu desenhar a página para ler.');
  // Fundo branco: página com transparência viraria preto no OCR.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function transcreverPdf(
  arquivo: Blob,
  opcoes: { onProgresso?: (p: ProgressoTranscricao) => void; sinal?: AbortSignal; limitePaginasOcr?: number },
): Promise<ResultadoTranscricao> {
  const { onProgresso, sinal, limitePaginasOcr } = opcoes;
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  try {
    const total: number = pdf.numPages;

    // 1ª passada (rápida): o texto que o PDF já tem.
    const porPagina: Array<LinhaTranscrita[] | null> = [];
    for (let n = 1; n <= total; n++) {
      falharSeCancelado(sinal);
      const pagina = await pdf.getPage(n);
      // Itens de marcação (TextMarkedContent) não têm `str`: ficam de fora.
      const itens = (await pagina.getTextContent()).items.filter((i: any) => typeof i.str === 'string');
      const linhas = linhasDoTextoDoPdf(itens);
      porPagina.push(paginaTemTexto(linhas) ? linhas : null);
    }

    const escaneadas = porPagina.map((l, i) => (l ? -1 : i + 1)).filter(n => n > 0);
    if (limitePaginasOcr !== undefined && escaneadas.length > limitePaginasOcr) {
      throw new TranscricaoGrandeDemais(escaneadas.length);
    }

    // 2ª passada: OCR só nas páginas sem texto.
    let feitas = 0;
    let paginaAtual = 0;
    const ocr = criarOcr(sinal, p => onProgresso?.({ pagina: paginaAtual, total, fracao: (feitas + p) / escaneadas.length }));
    try {
      for (const n of escaneadas) {
        falharSeCancelado(sinal);
        paginaAtual = n;
        onProgresso?.({ pagina: n, total, fracao: feitas / escaneadas.length });
        const pagina = await pdf.getPage(n);
        const canvas = await renderizarPagina(pagina);
        porPagina[n - 1] = await ocr.ler(canvas);
        canvas.width = 0; // solta a memória da imagem já
        pagina.cleanup();
        feitas++;
      }
    } finally {
      ocr.encerrar();
    }

    return {
      origem: escaneadas.length > 0 ? 'OCR' : 'TEXTO_DO_PDF',
      paginas: total,
      linhas: juntarPaginas(porPagina.map(l => l ?? [])),
    };
  } finally {
    pdf.destroy();
  }
}

async function transcreverImagem(
  arquivo: Blob,
  opcoes: { onProgresso?: (p: ProgressoTranscricao) => void; sinal?: AbortSignal },
): Promise<ResultadoTranscricao> {
  const { onProgresso, sinal } = opcoes;
  onProgresso?.({ pagina: 1, total: 1, fracao: 0 });
  const ocr = criarOcr(sinal, p => onProgresso?.({ pagina: 1, total: 1, fracao: p }));
  try {
    return { origem: 'OCR', paginas: 1, linhas: await ocr.ler(arquivo) };
  } finally {
    ocr.encerrar();
  }
}

async function emailDoUsuario(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export const transcricaoDocumentoService = {
  /**
   * Lê o texto do arquivo. `limitePaginasOcr`: acima disto de páginas
   * escaneadas, desiste antes de começar (`TranscricaoGrandeDemais`).
   */
  async transcrever(
    arquivo: Blob,
    nome: string,
    opcoes: { onProgresso?: (p: ProgressoTranscricao) => void; sinal?: AbortSignal; limitePaginasOcr?: number } = {},
  ): Promise<ResultadoTranscricao> {
    const tipo = podeTranscrever(nome, arquivo.type);
    if (tipo === 'pdf') return transcreverPdf(arquivo, opcoes);
    if (tipo === 'imagem') return transcreverImagem(arquivo, opcoes);
    throw new Error('Só dá para transcrever PDF e imagem (PNG, JPG, WEBP).');
  },

  /** Arquivo de uma versão já guardada no GED (documento anexado antes). */
  async baixarArquivo(storagePath: string): Promise<Blob> {
    const url = await documentService.generateDownloadUrl(storagePath);
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Não foi possível baixar o arquivo (HTTP ${resposta.status}).`);
    return resposta.blob();
  },

  async ler(versionId: string): Promise<Transcricao | null> {
    const { data, error } = await supabase.from(TABELA).select('*').eq('version_id', versionId).maybeSingle();
    if (error) throw new Error(`Erro ao carregar a transcrição: ${error.message}`);
    return (data as Transcricao | null) ?? null;
  },

  async salvar(dados: Pick<Transcricao, 'version_id' | 'organization_id' | 'origem' | 'paginas' | 'linhas'>): Promise<Transcricao> {
    const { data, error } = await supabase
      .from(TABELA)
      .upsert({ ...dados, atualizado_por: await emailDoUsuario() }, { onConflict: 'version_id' })
      .select('*')
      .single();
    if (error) throw new Error(`Erro ao salvar a transcrição: ${error.message}`);
    return data as Transcricao;
  },
};
