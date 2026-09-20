/**
 * DWG → DXF pela Edge Function `dwg-converter` (20/09/2026, roadmap E9.1).
 *
 * O navegador manda os bytes do .dwg e recebe o DXF em texto, que entra no
 * MESMO pipeline do DXF (`prepararDxf` → `PainelImportarDxf`). A versão do
 * DWG (cabeçalho "AC1032" → "AutoCAD 2018+") volta nos headers e é mostrada
 * na tela: a pessoa confere com o "salvar como" do CAD dela.
 *
 * Não há exportação para DWG: o libredwg publicado não escreve DWG (ver o
 * cabeçalho da function). Quem precisa levar o desenho ao CAD usa o DXF.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface DxfConvertido {
  /** O DXF em texto, pronto para `prepararDxf`. */
  dxf: string;
  /** Cabeçalho do DWG: "AC1032". */
  versao: string;
  /** "AutoCAD 2018+". */
  release: string;
  /** Tamanho do DWG enviado. */
  bytes: number;
  /** Código do libredwg (0 = limpo; 1–127 = avisos, o DXF saiu inteiro). */
  codigoLibredwg: number;
}

export const MAX_DWG_BYTES = 30 * 1024 * 1024;

/** Antes de mandar: extensão e cabeçalho. Poupa uma ida ao servidor para o arquivo errado. */
export async function conferirDwg(arquivo: File): Promise<string | null> {
  if (arquivo.size === 0) return 'O arquivo está vazio.';
  if (arquivo.size > MAX_DWG_BYTES) return `O DWG tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB; o limite é ${MAX_DWG_BYTES / 1024 / 1024} MB.`;
  const cabeca = new Uint8Array(await arquivo.slice(0, 6).arrayBuffer());
  const s = String.fromCharCode(...cabeca);
  if (!/^AC10\d\d$/.test(s)) return 'Isto não é um DWG (o cabeçalho não começa com AC10xx). Se for DXF, importe direto.';
  return null;
}

/** Versão pelo cabeçalho, sem servidor — o rótulo aparece antes de a conversão voltar. */
export function releaseDoCabecalho(versao: string): string {
  const R: Record<string, string> = {
    AC1006: 'AutoCAD R10',
    AC1009: 'AutoCAD R11/R12',
    AC1012: 'AutoCAD R13',
    AC1014: 'AutoCAD R14',
    AC1015: 'AutoCAD 2000/2002',
    AC1018: 'AutoCAD 2004/2006',
    AC1021: 'AutoCAD 2007/2009',
    AC1024: 'AutoCAD 2010/2012',
    AC1027: 'AutoCAD 2013/2017',
    AC1032: 'AutoCAD 2018+',
  };
  return R[versao] ?? 'desconhecido';
}

export async function converterDwgParaDxf(arquivo: File): Promise<DxfConvertido> {
  const recusa = await conferirDwg(arquivo);
  if (recusa) throw new Error(recusa);
  const corpo = await arquivo.arrayBuffer();
  const { data, error, response } = await supabase.functions.invoke<string | Blob>('dwg-converter', {
    body: corpo,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (error) {
    // A function responde JSON com `error` legível (400/413/422); o resto é infraestrutura.
    let mensagem = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const j = (await error.context.json()) as { error?: string; message?: string };
        mensagem = j.error ?? j.message ?? mensagem;
      } catch {
        // corpo não era JSON: fica a mensagem genérica
      }
    }
    throw new Error(`Conversão DWG → DXF falhou: ${mensagem}`);
  }
  const dxf = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : String(data ?? '');
  if (!dxf.trim()) throw new Error('Conversão DWG → DXF falhou: a resposta veio vazia.');
  const versao = response?.headers.get('x-dwg-version') ?? String.fromCharCode(...new Uint8Array(corpo.slice(0, 6)));
  return {
    dxf,
    versao,
    release: response?.headers.get('x-dwg-release') ?? releaseDoCabecalho(versao),
    bytes: arquivo.size,
    codigoLibredwg: Number(response?.headers.get('x-libredwg-code') ?? 0),
  };
}
