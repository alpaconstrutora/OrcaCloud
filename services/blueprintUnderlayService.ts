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
import {
  DPI_DO_FUNDO,
  type ArcoBezier,
  type ParaPixel,
  type SegmentoVetor,
} from '../utils/blueprintVetor';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const BUCKET = 'blueprint_underlays';

const COLS =
  'id, study_id, organization_id, level_id, storage_path, nome_arquivo, nome, ordem, ' +
  'file_sha256, pdf_pagina, origem_x_mm, origem_y_mm, mm_por_pixel, rotacao_mrad, ' +
  'calib_p1_px, calib_p1_py, calib_p2_px, calib_p2_py, calib_distancia_mm, ' +
  'calib_alinhado, escala_desenho, opacidade, created_at, updated_at';

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
  /**
   * Denominador da escala DECLARADA (100 = 1:100), só para prancha de PDF.
   *
   * Exclusivo com `calib_*` de propósito: ou a escala foi declarada e é exata,
   * ou foi medida por dois cliques e os `calib_*` dizem sobre qual cota. Um par
   * sintético gravado para representar escala declarada mentiria sobre a origem
   * do número para quem for revisar.
   */
  escala_desenho: number | null;
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

export interface SegmentosDaPagina {
  segmentos: SegmentoVetor[];
  /**
   * As curvas cruas da página. O arco de giro da porta é uma delas.
   *
   * Medido na prancha A0 real: 1722 curvas na folha inteira, ~94 KB guardadas
   * inteiras. Por isso NÃO são filtradas aqui — a faixa de raio que
   * caracteriza porta é em MILÍMETRO, e milímetro só existe depois da
   * aferição, que acontece bem depois da importação.
   */
  arcos: ArcoBezier[];
  /**
   * A matriz do pdf.js que leva o espaço do PDF ao pixel do raster, no MESMO
   * dpi da planta de fundo.
   *
   * ⚠️ Vem da biblioteca e não é derivada aqui. A prancha do usuário tem
   * `page.rotate = 270` com MediaBox em retrato: `x` e `y` trocam de lugar e
   * os dois invertem. Uma conta caseira de "espelhar o Y pela altura da
   * página" acerta só a página sem rotação — e erra em silêncio na girada.
   */
  paraPixel: ParaPixel;
  /** Tamanho do VIEWPORT em pontos (já girado). Informativo. */
  larguraPt: number;
  alturaPt: number;
  totalPaginas: number;
}

/**
 * Os traços vetoriais de uma página, com espessura.
 *
 * ─── POR QUE ISTO EXISTE SEPARADO DE `rasterizarPdf` ────────────────────────
 *
 * Rasterizar JOGA O VETOR FORA, e é o vetor que diz onde estão as paredes. A
 * importação da planta de fundo sobe o PNG e não guarda o PDF — decisão de
 * portão consciente, para que a página escolhida fique no registro —, então
 * quem quiser gerar parede precisa do arquivo em mãos outra vez.
 *
 * ─── O QUE A ESPESSURA RESOLVE ──────────────────────────────────────────────
 *
 * Numa prancha real os ~20 mil traços misturam parede, cota, hachura,
 * mobiliário e contorno de letra. O Spike C mediu que a ESPESSURA separa: numa
 * prancha A0 de projeto o grupo de 0,60 pt era exatamente a parede, e
 * 0,00/0,12/0,24 pt eram cota, hachura e letra. Por isso ela é devolvida junto
 * — sem ela não há como escolher o grupo.
 *
 * ⚠️ A espessura sai multiplicada pela escala da CTM: o mesmo `setLineWidth`
 * dentro de um form XObject escalado desenha mais grosso. Ler `larguraLinha`
 * cru agruparia traços que na folha têm espessuras diferentes.
 *
 * ⚠️ Curvas são DESCARTADAS. O arco de porta é curva, e o Spike C mostrou que
 * detectá-lo funciona mas não move o resultado — as paredes são retas, e é
 * delas que se trata aqui.
 */
export async function extrairSegmentosPdf(
  file: Blob,
  pagina = 1,
): Promise<SegmentosDaPagina> {
  const dados = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: dados }).promise;

  if (pagina < 1 || pagina > doc.numPages) {
    throw new Error(`blueprintUnderlay: página ${pagina} fora do PDF (1..${doc.numPages}).`);
  }

  const page = await doc.getPage(pagina);
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  // O MESMO dpi do raster da planta de fundo: é a matriz deste viewport que
  // faz o traço cair sobre a imagem, e ela já resolve rotação e inversão.
  const vp = page.getViewport({ scale: DPI_DO_FUNDO / 72 });

  const mul = (m: number[], n: number[]) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const ap = (m: number[], x: number, y: number) => ({
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  });

  let ctm = [1, 0, 0, 1, 0, 0];
  let larguraLinha = 1;
  const pilha: { ctm: number[]; larguraLinha: number }[] = [];
  const segmentos: SegmentoVetor[] = [];
  const arcos: ArcoBezier[] = [];
  let subpath = 0;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === OPS.save) pilha.push({ ctm: [...ctm], larguraLinha });
    else if (fn === OPS.restore) {
      const e = pilha.pop();
      if (e) {
        ctm = e.ctm;
        larguraLinha = e.larguraLinha;
      }
    } else if (fn === OPS.transform) ctm = mul(args as number[], ctm);
    else if (fn === OPS.setLineWidth) larguraLinha = args[0] as number;
    else if (fn === OPS.constructPath) {
      const [tipos, coords] = args as [number[], number[]];
      let k = 0;
      let atual: { x: number; y: number } | null = null;
      const escalaCtm = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
      const larguraPt = larguraLinha * escalaCtm;

      for (const t of tipos) {
        if (t === OPS.moveTo) {
          subpath += 1;
          atual = ap(ctm, coords[k], coords[k + 1]);
          k += 2;
        } else if (t === OPS.lineTo) {
          const p = ap(ctm, coords[k], coords[k + 1]);
          k += 2;
          if (atual) segmentos.push({ a: atual, b: p, larguraPt, subpath });
          atual = p;
        } else if (t === OPS.curveTo) {
          // A CURVA É O ARCO DE GIRO DA PORTA — ver `gerarPortas`.
          //
          // As rodadas 1 a 4 do Spike C descartavam esta linha inteira, e com
          // ela a única evidência que separa porta de guarda-corpo e de borda
          // de terraço. Guardo a Bézier CRUA, sem ajustar círculo aqui: o
          // ajuste depende da escala, que só existe depois da aferição, e
          // gravar o resultado em vez da entrada é o erro que tornou o formato
          // v1 irrecuperável.
          const c1 = ap(ctm, coords[k], coords[k + 1]);
          const c2 = ap(ctm, coords[k + 2], coords[k + 3]);
          const fim = ap(ctm, coords[k + 4], coords[k + 5]);
          k += 6;
          if (atual) arcos.push({ ini: atual, c1, c2, fim });
          atual = fim;
        } else if (t === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(k, k + 4);
          k += 4;
          subpath += 1;
          const c = [
            ap(ctm, x, y), ap(ctm, x + w, y),
            ap(ctm, x + w, y + h), ap(ctm, x, y + h),
          ];
          for (let j = 0; j < 4; j++) {
            segmentos.push({ a: c[j], b: c[(j + 1) % 4], larguraPt, subpath });
          }
          atual = null;
        } else {
          atual = null;
        }
      }
    }
  }

  return {
    segmentos,
    arcos,
    paraPixel: [...vp.transform] as ParaPixel,
    larguraPt: vp.width,
    alturaPt: vp.height,
    totalPaginas: doc.numPages,
  };
}

/**
 * O vetor da prancha, guardado ao lado da imagem.
 *
 * Formato ACHATADO de propósito: cinco números por segmento numa lista só, em
 * vez de um objeto por segmento. Uma prancha A0 tem ~20 mil traços, e a forma
 * `{a:{x,y},b:{x,y},larguraPt}` gasta mais espaço com nome de campo repetido do
 * que com número — a diferença medida é de alguns megabytes para algumas
 * centenas de kilobytes.
 */
export interface VetorDaPrancha {
  /**
   * Versão do formato.
   *
   * **v1 é REJEITADO de propósito, não migrado.** Ele guardava só a altura da
   * página, e quem lê precisava derivar a conversão espelhando o Y — o que
   * erra em página com rotação, exatamente o caso da prancha que expôs o
   * defeito. Não há como recuperar a matriz de um v1 sem o PDF original, e
   * aceitar o v1 assumindo "sem rotação" reintroduziria o mesmo erro calado.
   * Lido como ausente, a tela pede o PDF e o arquivo volta correto.
   *
   * **v2 é ACEITO**, ao contrário do v1: ele tem a matriz e os segmentos, que é
   * tudo de que a geração de PAREDE precisa. O que lhe falta são os arcos, e
   * essa falta é ADITIVA — nada nele está errado, só incompleto. Por isso a
   * diferença v2/v3 tem de chegar à tela (`temArcos`): sem ela, uma prancha v2
   * responderia "nenhuma porta encontrada" quando a resposta verdadeira é
   * "este vetor é antigo demais para saber". Um zero que parece resultado é o
   * mesmo erro que a recusa por falta de aferição já corrigiu uma vez.
   */
  v: 2 | 3;
  /** A matriz do pdf.js: espaço do PDF → pixel do raster. */
  paraPixel: ParaPixel;
  larguraPt: number;
  alturaPt: number;
  /** ax, ay, bx, by, larguraPt — nesta ordem, repetindo. */
  seg: number[];
  /**
   * ini.x, ini.y, c1.x, c1.y, c2.x, c2.y, fim.x, fim.y — repetindo. Só em v3.
   *
   * Bézier CRUA, e não o círculo já ajustado: o ajuste depende da escala, que
   * só existe depois da aferição. Guardar o resultado em vez da entrada é
   * exatamente o que tornou o v1 irrecuperável.
   */
  arc?: number[];
}

/**
 * Onde fica o vetor de uma prancha, derivado do caminho da imagem.
 *
 * Derivar em vez de guardar numa coluna evita uma migration — e o histórico de
 * migrations deste projeto está furado o bastante para que evitar uma seja
 * vantagem real, não preguiça. O preço é que a ausência do arquivo é a única
 * forma de saber que não há vetor, e por isso quem lê trata 404 como "não
 * tem", nunca como erro.
 */
export function caminhoDoVetor(storagePath: string): string {
  return `${storagePath.replace(/\.png$/i, '')}.vetor.json`;
}

/** Acima disto o vetor não é guardado: ver `salvarVetor`. */
const LIMITE_VETOR_BYTES = 12 * 1024 * 1024;

/**
 * Guarda o vetor ao lado da imagem. Devolve `false` se decidiu não guardar.
 *
 * ⚠️ NUNCA lança. O artefato principal da importação é a planta de fundo; o
 * vetor é conveniência que evita apontar o PDF de novo. Um PDF protegido, com
 * operadores exóticos ou grande demais não pode impedir o usuário de importar
 * a prancha — seria trocar uma funcionalidade que funciona por uma que talvez
 * funcione.
 */
export async function salvarVetor(
  storagePath: string,
  dados: VetorDaPrancha,
): Promise<boolean> {
  try {
    const texto = JSON.stringify(dados);
    if (texto.length > LIMITE_VETOR_BYTES) return false;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminhoDoVetor(storagePath), new Blob([texto], { type: 'application/json' }), {
        upsert: true,
        contentType: 'application/json',
      });
    return !error;
  } catch {
    return false;
  }
}

/** Lê o vetor guardado. `null` quando não existe — que é o caso normal. */
export async function carregarVetor(storagePath: string): Promise<VetorDaPrancha | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(caminhoDoVetor(storagePath), 60 * 60);
    if (error || !data?.signedUrl) return null;

    const r = await fetch(data.signedUrl);
    if (!r.ok) return null;
    const json = (await r.json()) as VetorDaPrancha;
    // v2 e v3 servem para PAREDE; só v3 tem arco. v1 continua rejeitado.
    return (json?.v === 2 || json?.v === 3) &&
      Array.isArray(json.seg) &&
      Array.isArray(json.paraPixel)
      ? json
      : null;
  } catch {
    return null;
  }
}

/** Achata os segmentos para gravar. Duas casas = 0,01 pt ≈ 0,35 mm a 1:100. */
export function achatarSegmentos(
  segmentos: SegmentoVetor[],
  larguraPt: number,
  alturaPt: number,
  paraPixel: ParaPixel,
  arcos: ArcoBezier[] = [],
): VetorDaPrancha {
  const seg: number[] = [];
  const r = (n: number) => Math.round(n * 100) / 100;
  for (const s of segmentos) {
    seg.push(r(s.a.x), r(s.a.y), r(s.b.x), r(s.b.y), r(s.larguraPt));
  }
  const arc: number[] = [];
  for (const a of arcos) {
    arc.push(
      r(a.ini.x), r(a.ini.y),
      r(a.c1.x), r(a.c1.y),
      r(a.c2.x), r(a.c2.y),
      r(a.fim.x), r(a.fim.y),
    );
  }
  return { v: 3, paraPixel, larguraPt, alturaPt, seg, arc };
}

/** Volta da forma achatada para os segmentos. */
export function desachatarSegmentos(v: VetorDaPrancha): SegmentoVetor[] {
  const saida: SegmentoVetor[] = [];
  for (let i = 0; i + 4 < v.seg.length; i += 5) {
    saida.push({
      a: { x: v.seg[i], y: v.seg[i + 1] },
      b: { x: v.seg[i + 2], y: v.seg[i + 3] },
      larguraPt: v.seg[i + 4],
    });
  }
  return saida;
}

/**
 * Volta da forma achatada para os arcos. Lista vazia em v2 — que NÃO é o mesmo
 * que "esta prancha não tem porta"; ver `temArcos`.
 */
export function desachatarArcos(v: VetorDaPrancha): ArcoBezier[] {
  const saida: ArcoBezier[] = [];
  const arc = v.arc ?? [];
  for (let i = 0; i + 7 < arc.length; i += 8) {
    saida.push({
      ini: { x: arc[i], y: arc[i + 1] },
      c1: { x: arc[i + 2], y: arc[i + 3] },
      c2: { x: arc[i + 4], y: arc[i + 5] },
      fim: { x: arc[i + 6], y: arc[i + 7] },
    });
  }
  return saida;
}

/**
 * O vetor guardado sabe de arcos?
 *
 * Distingue "prancha antiga, sem arco guardado" de "prancha com arco e nenhuma
 * porta". A tela precisa das duas respostas separadas — a primeira tem
 * conserto (apontar o PDF de novo), a segunda não.
 */
export function temArcos(v: VetorDaPrancha): boolean {
  return v.v === 3;
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
  /**
   * Denominador da escala declarada. Exclusivo com `calibracao`: quem declara a
   * escala não clicou cota nenhuma, e gravar um par sintético mentiria sobre a
   * origem do número.
   */
  escalaDesenho?: number | null;
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
    escala_desenho: e.escalaDesenho ?? null,
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

/**
 * Apaga a prancha — a linha E os arquivos dela.
 *
 * ─── O QUE FALTAVA ──────────────────────────────────────────────────────────
 *
 * Até 06/09/2026 esta função apagava só a linha do banco. A imagem e o vetor
 * ficavam no bucket para sempre: invisíveis na tela, ocupando espaço, e ainda
 * alcançáveis por quem tivesse o caminho. Dívida registrada e agora fechada.
 *
 * ─── A ORDEM, E POR QUE ESTA ────────────────────────────────────────────────
 *
 * Linha primeiro, arquivos depois. As duas falhas possíveis não são
 * equivalentes: apagar o arquivo antes e falhar ao apagar a linha deixaria uma
 * prancha na lista com a imagem quebrada — visível e confusa. Nesta ordem, a
 * falha no fim deixa um órfão invisível, que é exatamente o estado de hoje.
 * Ou seja: no caminho feliz o problema some, e no caminho ruim nada piora.
 *
 * ─── ⚠️ DUAS LINHAS PODEM APONTAR PARA O MESMO ARQUIVO ──────────────────────
 *
 * O caminho é `<org>/<estudo>/<sha256>.png` — derivado do CONTEÚDO. Subir a
 * mesma imagem duas vezes no mesmo estudo dá o mesmo caminho, e o upload é
 * `upsert`, então ficam duas linhas e um arquivo só. Apagar o arquivo junto com
 * a primeira linha quebraria a segunda, que continua na tela.
 *
 * Por isso o arquivo só é removido quando NENHUMA outra linha o cita.
 */
export async function removerUnderlay(id: string): Promise<void> {
  const { data: alvo } = await supabase
    .from('blueprint_underlays')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('blueprint_underlays').delete().eq('id', id);
  if (error) fail('removerUnderlay', error);

  const caminho = (alvo as { storage_path?: string } | null)?.storage_path;
  if (!caminho) return;

  const { data: aindaUsam } = await supabase
    .from('blueprint_underlays')
    .select('id')
    .eq('storage_path', caminho)
    .limit(1);

  if ((aindaUsam ?? []).length > 0) return;

  // Best-effort: a linha já foi. Um erro aqui volta ao estado antigo (órfão),
  // e derrubar a operação faria a pessoa achar que a prancha não foi apagada
  // quando ela foi.
  await supabase.storage.from(BUCKET).remove([caminho, caminhoDoVetor(caminho)]);
}
