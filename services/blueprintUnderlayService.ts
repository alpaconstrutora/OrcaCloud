// services/blueprintUnderlayService.ts
//
// Planta de fundo: upload, aferição gravada e URL assinada.
//
// A matemática da calibração NÃO mora aqui — está em `utils/blueprintUnderlay.ts`,
// pura e testável. Aqui só há ida e volta ao banco e ao storage.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import type { Underlay } from '../utils/blueprintUnderlay';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const BUCKET = 'blueprint_underlays';

const COLS =
  'id, study_id, organization_id, level_id, storage_path, nome_arquivo, nome, ordem, ' +
  'file_sha256, pdf_pagina, origem_x_mm, origem_y_mm, mm_por_pixel, rotacao_mrad, ' +
  'calib_p1_px, calib_p1_py, calib_p2_px, calib_p2_py, calib_distancia_mm, ' +
  'calib_alinhado, opacidade, created_at, updated_at';

export interface UnderlayRow {
  id: string;
  study_id: string;
  organization_id: string;
  level_id: string | null;
  storage_path: string;
  nome_arquivo: string;
  /** Como a prancha aparece na lista. Sem ele a barra vira "planta.pdf" três vezes. */
  nome: string;
  ordem: number;
  file_sha256: string | null;
  pdf_pagina: number | null;
  origem_x_mm: number;
  origem_y_mm: number;
  mm_por_pixel: number;
  rotacao_mrad: number;
  calib_p1_px: number | null;
  calib_p1_py: number | null;
  calib_p2_px: number | null;
  calib_p2_py: number | null;
  calib_distancia_mm: number | null;
  calib_alinhado: boolean;
  opacidade: number;
  created_at: string;
  updated_at: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintUnderlay/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

/** Converte a linha do banco no posicionamento que o desenho consome. */
export function underlayDaLinha(r: UnderlayRow): Underlay {
  return {
    origemXMm: r.origem_x_mm,
    origemYMm: r.origem_y_mm,
    mmPorPixel: r.mm_por_pixel,
    rotacaoMrad: r.rotacao_mrad,
  };
}

/**
 * sha256 do arquivo, por WebCrypto.
 *
 * Aqui é o lugar certo para `crypto.subtle`, ao contrário do payload canônico —
 * que usa uma implementação própria justamente porque precisa ser idêntica no
 * navegador e no servidor POR CONSTRUÇÃO. Um arquivo é o mesmo arquivo dos dois
 * lados; a única exigência é o algoritmo padrão.
 */
export async function sha256Arquivo(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PaginaRasterizada {
  blob: Blob;
  larguraPx: number;
  alturaPx: number;
  totalPaginas: number;
}

/**
 * Rasteriza uma página do PDF.
 *
 * `dpiAlvo` decide a nitidez do fundo e o peso do arquivo. 150 dpi numa prancha
 * A1 dá ~3500 px de largura, que é o suficiente para enxergar cota e ainda
 * carregar rápido. Subir para 300 quadruplica o número de pixels e raramente
 * muda o que dá para ler.
 *
 * ATENÇÃO: a página rasterizada perde a precisão vetorial. O Spike C mediu
 * 0,2–0,3% de erro extraindo do vetor; depois de virar imagem, a aferição passa
 * a depender de o usuário clicar no pixel certo.
 */
export async function rasterizarPdf(
  file: Blob,
  pagina = 1,
  dpiAlvo = 150,
): Promise<PaginaRasterizada> {
  const dados = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: dados }).promise;

  if (pagina < 1 || pagina > doc.numPages) {
    throw new Error(`blueprintUnderlay: página ${pagina} fora do PDF (1..${doc.numPages}).`);
  }

  const page = await doc.getPage(pagina);
  // O viewport em escala 1 vem em pontos (72 por polegada).
  const escala = dpiAlvo / 72;
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('blueprintUnderlay: canvas 2D indisponível');

  // Fundo branco: PDF sem fundo vira PNG transparente, e transparente sobre o
  // branco do editor some.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('blueprintUnderlay: falha ao gerar a imagem da página');

  return {
    blob,
    larguraPx: canvas.width,
    alturaPx: canvas.height,
    totalPaginas: doc.numPages,
  };
}

/** Quantas páginas o PDF tem, sem rasterizar nenhuma. */
export async function contarPaginasPdf(file: Blob): Promise<number> {
  const dados = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: dados }).promise;
  return doc.numPages;
}

export async function uploadUnderlay(
  blob: Blob,
  organizationId: string,
  studyId: string,
  nomeArquivo: string,
): Promise<{ storagePath: string; sha256: string }> {
  const sha256 = await sha256Arquivo(blob);
  // O caminho começa pela organização: facilita auditar e apagar por org, e
  // deixa a colisão de nome impossível entre estudos.
  const storagePath = `${organizationId}/${studyId}/${sha256.slice(0, 16)}.png`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { upsert: true, contentType: 'image/png' });

  if (error) fail('uploadUnderlay', error);
  return { storagePath, sha256 };
}

export async function urlAssinada(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) fail('urlAssinada', error);
  return data.signedUrl;
}

/**
 * As pranchas do nível, em ordem.
 *
 * Substituiu um `getUnderlay` que fazia `maybeSingle`. Não foi só conveniência:
 * removida a chave única, `maybeSingle` passaria a ERRAR assim que houvesse a
 * segunda prancha — e o levantamento com térreo, cobertura, corte e fachada é o
 * caso comum, não a exceção.
 */
export async function listarUnderlays(
  studyId: string,
  levelId: string | null,
): Promise<UnderlayRow[]> {
  let query = supabase
    .from('blueprint_underlays')
    .select(COLS)
    .eq('study_id', studyId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });

  query = levelId === null ? query.is('level_id', null) : query.eq('level_id', levelId);

  const { data, error } = await query;
  if (error) fail('listarUnderlays', error);
  return (data ?? []) as unknown as UnderlayRow[];
}

export interface SalvarUnderlay {
  /** Presente = atualiza a prancha. Ausente = ACRESCENTA uma nova. */
  id?: string;
  study_id: string;
  organization_id: string;
  level_id: string | null;
  storage_path: string;
  nome_arquivo: string;
  nome: string;
  ordem: number;
  file_sha256: string;
  pdf_pagina: number | null;
  underlay: Underlay;
  calibracao?: {
    p1: { px: number; py: number };
    p2: { px: number; py: number };
    distanciaMm: number;
    alinhado: boolean;
  };
  opacidade: number;
}

export async function salvarUnderlay(e: SalvarUnderlay): Promise<UnderlayRow> {
  const linha = {
    study_id: e.study_id,
    organization_id: e.organization_id,
    level_id: e.level_id,
    storage_path: e.storage_path,
    nome_arquivo: e.nome_arquivo,
    nome: e.nome,
    ordem: e.ordem,
    file_sha256: e.file_sha256,
    pdf_pagina: e.pdf_pagina,
    origem_x_mm: e.underlay.origemXMm,
    origem_y_mm: e.underlay.origemYMm,
    mm_por_pixel: e.underlay.mmPorPixel,
    rotacao_mrad: e.underlay.rotacaoMrad,
    // A aferição vai junto, não só o resultado dela.
    calib_p1_px: e.calibracao?.p1.px ?? null,
    calib_p1_py: e.calibracao?.p1.py ?? null,
    calib_p2_px: e.calibracao?.p2.px ?? null,
    calib_p2_py: e.calibracao?.p2.py ?? null,
    calib_distancia_mm: e.calibracao?.distanciaMm ?? null,
    calib_alinhado: e.calibracao?.alinhado ?? false,
    opacidade: e.opacidade,
    updated_at: new Date().toISOString(),
  };

  // IMPORTAR ACRESCENTA. Antes havia um `upsert` no par (estudo, nível), que
  // fazia a segunda importação SUBSTITUIR a primeira — e junto com ela a
  // aferição, que é o trabalho manual que não se recupera. Com a chave única
  // removida (migration 000014), quem decide entre inserir e atualizar é a
  // presença do `id`: aferir de novo é atualizar, importar é acrescentar.
  const query = e.id
    ? supabase.from('blueprint_underlays').update(linha).eq('id', e.id)
    : supabase.from('blueprint_underlays').insert(linha);

  const { data, error } = await query.select(COLS).single();

  if (error) fail('salvarUnderlay', error);
  return data as unknown as UnderlayRow;
}

export async function removerUnderlay(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_underlays').delete().eq('id', id);
  if (error) fail('removerUnderlay', error);
}
