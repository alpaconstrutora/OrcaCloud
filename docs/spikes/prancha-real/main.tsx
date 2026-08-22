/**
 * Planta de fundo com PRANCHA REAL, em navegador de verdade.
 *
 * O harness de `docs/spikes/medicoes/` já prova a matemática — mas com uma
 * imagem FABRICADA de 400×300. Ele não responde nada sobre uma prancha A0 de
 * projeto, que é o que o usuário importa:
 *
 *   1. um A0 rasteriza no navegador, ou estoura o canvas?
 *   2. recém-importada (`mmPorPixel = 1`, como o app grava), o que aparece
 *      na tela?
 *   3. depois de aferida, a imagem fica ALINHADA com o que se traça por cima?
 *   4. ela sai ESPELHADA na vertical?
 *
 * O caminho é o de produção: `rasterizarPdf` do serviço, `calibrar` do utils,
 * `BlueprintCanvas` do editor. O que o harness substitui é só o storage — o PDF
 * chega em base64 pelo driver, em vez de subir para o bucket.
 *
 * A FEIÇÃO DE REFERÊNCIA VEM DA PRÓPRIA PRANCHA. Não há retângulo fabricado
 * para comparar: o harness acha a caixa da tinta no raster (a moldura impressa
 * da folha) e traça uma medição exatamente sobre ela. Fundo no lugar = as duas
 * caixas coincidem na tela.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  achatarSegmentos,
  desachatarSegmentos,
  extrairSegmentosPdf,
  rasterizarPdf,
} from '../../../services/blueprintUnderlayService';
import { gerarParedes, mmPorPt, ptParaModelo } from '../../../utils/blueprintVetor';
import {
  UNDERLAY_NEUTRO,
  calibrar,
  pixelParaModelo,
  type Underlay,
} from '../../../utils/blueprintUnderlay';
import { emptyModel, type Point } from '../../../utils/blueprintKernel';
import type { FormaMedida } from '../../../utils/blueprintMedicoes';

/**
 * Milímetro REAL por pixel do raster, a 150 dpi e escala 1:100.
 *
 * 1 px = 25,4/150 mm de PAPEL; a 1:100 isso é 100× no mundo. O 1:100 não é
 * chute: o Spike C mediu o traço de parede desta mesma prancha em 36,4 pt
 * médios, que a 1:100 dá 1,28 m — espessura de parede, não de cota.
 * Ver `docs/planos/2026-08-08-spike-c-digitalizador.md`.
 */
const MM_POR_PX_1_100 = (25.4 / 150) * 100;

const params = new URLSearchParams(location.search);
const cena = params.get('cena') ?? 'importada';
/**
 * Defeito reintroduzido de propósito. Medição que aprova o caso certo E o
 * defeituoso não mede nada — no harness irmão de `medicoes/` isso aconteceu
 * quatro vezes no mesmo dia.
 *
 * `escala`        — afere 10% errado: imagem e traçado saem de sincronia.
 * `espelho`       — entrega a imagem virada na vertical, com o traçado no
 *                   lugar. É o defeito que o cabeçalho de
 *                   `blueprintUnderlay.ts` descreve como o que "só aparece
 *                   quando a porta está do lado errado, já na obra".
 * `sem-enquadrar` — omite `enquadrarPrancha`, que é como o editor se
 *                   comportava até 22/08/2026: a prancha A0 nascia como uma
 *                   mancha encostada no rodapé.
 */
const defeito = params.get('defeito');

type Caixa = { x1: number; y1: number; x2: number; y2: number };

/**
 * Caixa da tinta no raster, e onde fica o "peso" dela.
 *
 * Feito numa cópia REDUZIDA da imagem: um A0 a 150 dpi tem ~35 milhões de
 * pixels, e `getImageData` na resolução cheia devolveria 140 MB só para
 * descobrir uma caixa.
 *
 * O PERFIL DE LINHAS não é enfeite — é o que separa ENQUADRAMENTO de
 * ORIENTAÇÃO. Uma moldura de folha é praticamente simétrica: espelhada na
 * vertical ela ocupa a MESMA caixa. É a versão, tirada da própria prancha, da
 * marca vermelha que o harness de `medicoes/` teve de fabricar.
 *
 * Por que perfil e não centróide: a tela reduz a prancha ~90×, esta amostra
 * reduz ~10×, e cada redução perde traço fino de um jeito. O centróide, um
 * número só, embaralha essa diferença com a orientação — mediu 48,7% na tela
 * contra 60,8% aqui e não decidiu nada. O perfil compara o FORMATO da
 * distribuição, normalizado, que é o que sobrevive a reduções diferentes.
 */
function tintaDaImagem(img: HTMLImageElement) {
  const larguraAmostra = 700;
  const k = larguraAmostra / img.naturalWidth;
  const c = document.createElement('canvas');
  c.width = larguraAmostra;
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  let n = 0;
  const linhas: number[] = new Array(c.height).fill(0);

  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      // A redução borra o traço fino: um limiar de preto puro perderia quase
      // tudo. 160 pega o traço acinzentado da reamostragem e ainda ignora o
      // fundo branco do papel.
      if (d[i] < 160 && d[i + 1] < 160 && d[i + 2] < 160) {
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x > x2) x2 = x;
        if (y > y2) y2 = y;
        linhas[y] += 1;
        n += 1;
      }
    }
  }

  if (n === 0) return null;

  return {
    caixa: { x1: x1 / k, y1: y1 / k, x2: x2 / k, y2: y2 / k } as Caixa,
    pixels: n,
    perfil: perfilDeLinhas(linhas, y1, y2),
  };
}

/** Quantas faixas o perfil tem. 24 descreve o formato sem virar ruído. */
export const FAIXAS_DO_PERFIL = 24;

/**
 * Distribuição da tinta ao longo da altura, em 24 faixas somando 1.
 *
 * Normalizar é o ponto: a tela e a amostra têm resoluções e limiares
 * diferentes, então a QUANTIDADE de tinta não é comparável entre as duas — só
 * o formato da distribuição é.
 */
export function perfilDeLinhas(porLinha: number[], y1: number, y2: number): number[] {
  const faixas = new Array(FAIXAS_DO_PERFIL).fill(0);
  const altura = y2 - y1 + 1;
  let total = 0;
  for (let y = y1; y <= y2; y++) {
    const f = Math.min(FAIXAS_DO_PERFIL - 1, Math.floor(((y - y1) / altura) * FAIXAS_DO_PERFIL));
    faixas[f] += porLinha[y] ?? 0;
    total += porLinha[y] ?? 0;
  }
  return total === 0 ? faixas : faixas.map((v) => v / total);
}

/**
 * O contorno traçado sobre a caixa da tinta.
 *
 * É uma LINHA fechada à mão (o primeiro ponto repetido no fim), e não um
 * POLÍGONO, por um motivo de MEDIÇÃO: o canvas preenche polígono com
 * `${cor}22` (BlueprintCanvas:1769), e esse véu azul de 13% tinge toda a
 * prancha por baixo. O traço preto vira azulado, o leitor de pixel perde a
 * neutralidade que usa para separar as camadas, e a caixa da tinta some.
 * Aconteceu: a medição acusou 222 px de afastamento numa prancha que a captura
 * mostrava encaixada no canto certo.
 */
function medicaoSobre(caixa: Caixa, u: Underlay): FormaMedida {
  const pontos = (
    [
      { px: caixa.x1, py: caixa.y1 },
      { px: caixa.x2, py: caixa.y1 },
      { px: caixa.x2, py: caixa.y2 },
      { px: caixa.x1, py: caixa.y2 },
      { px: caixa.x1, py: caixa.y1 },
    ] as const
  ).map((p) => {
    const m = pixelParaModelo(u, p);
    return { x: Math.round(m.x), y: Math.round(m.y) } as Point;
  });

  return {
    id: 'moldura',
    tipo: 'LINHA',
    pontos,
    nome: 'Moldura da prancha',
    itemCode: null,
    underlayId: 'u1',
    camada: 'Geral',
    cor: '#2563eb',
  };
}

/**
 * Devolve a imagem virada de cabeça para baixo — o defeito, encenado.
 *
 * Vira a IMAGEM e deixa o traçado onde está, que é exatamente o que se vê
 * quando a inversão de Y é esquecida: a caixa continua a mesma, a prancha é
 * que fica de ponta-cabeça dentro dela.
 */
function virarNaVertical(img: HTMLImageElement): Promise<HTMLImageElement> {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.translate(0, c.height);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (!b) return reject(new Error('não deu para virar a imagem'));
      const v = new Image();
      v.onload = () => resolve(v);
      v.src = URL.createObjectURL(b);
    }, 'image/png');
  });
}

function Harness({
  imagem,
  underlay,
  medicoes,
}: {
  imagem: HTMLImageElement;
  underlay: Underlay;
  medicoes: FormaMedida[];
}) {
  return (
    <BlueprintCanvas
      model={emptyModel()}
      tool="selecionar"
      levelId={null}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => null}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      // Grade de 1 mm = grade NENHUMA nestes zooms: o canvas só desenha a
      // grade quando o passo passa de 3 px de tela, e 1 mm nunca passa. Não é
      // truque — é o caminho que o próprio componente já tem para o zoom
      // afastado.
      //
      // Precisa sumir porque a grade antisserrilhada sobre branco produz
      // cinza quase NEUTRO, indistinguível do traço da prancha reduzida 90×.
      // Com ela ligada, a caixa da tinta virava a tela inteira e a medição
      // acusava 222 px de afastamento numa prancha alinhada.
      passoGradeMm={1}
      // A cena `aferida` NÃO enquadra de propósito: ela mede o alinhamento
      // ao longo do zoom afastado, e para isso o zoom precisa acontecer.
      enquadrarPrancha={cena === 'importada' && defeito !== 'sem-enquadrar' ? 'u1' : null}
      // Opacidade 1 de propósito: o padrão do app é 0,55, e a tinta lavada
      // não passaria do limiar do leitor de pixel. Aqui se mede geometria,
      // não a aparência do controle de opacidade.
      fundo={{ imagem, underlay, opacidade: 1 }}
      medicoes={medicoes}
      onMedicaoPronta={() => {}}
    />
  );
}

async function principal() {
  const b64 = (window as unknown as Record<string, string>).__PDF_B64;
  if (!b64) throw new Error('driver não injetou __PDF_B64');

  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const t0 = performance.now();
  // A FUNÇÃO DE PRODUÇÃO, não uma cópia: se ela engasgar num A0, é o app que
  // engasga.
  const r = await rasterizarPdf(new Blob([bytes], { type: 'application/pdf' }), 1);
  const msRaster = Math.round(performance.now() - t0);

  let img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('a página rasterizada não carregou como imagem'));
    img.src = URL.createObjectURL(r.blob);
  });

  const tinta = tintaDaImagem(img);
  if (!tinta) throw new Error('nenhuma tinta encontrada no raster');

  // Cena "importada": exatamente o que o app grava ao importar — sem aferição.
  let underlay = UNDERLAY_NEUTRO;
  let medicoes: FormaMedida[] = [];

  if (cena === 'aferida') {
    // Afere sobre a borda SUPERIOR da tinta, declarando o comprimento real que
    // ela tem a 1:100. É o gesto de "Aferir escala": dois cliques e a distância.
    const larguraPx = tinta.caixa.x2 - tinta.caixa.x1;
    underlay = calibrar({
      p1: { px: tinta.caixa.x1, py: tinta.caixa.y1 },
      p2: { px: tinta.caixa.x2, py: tinta.caixa.y1 },
      distanciaMm: larguraPx * MM_POR_PX_1_100,
    });

    // O traçado nasce da aferição CERTA; o defeito de escala entra só depois,
    // na imagem. É assim que se separa "o fundo saiu do lugar" de "o traçado
    // saiu do lugar" — os dois dariam afastamento, por causas opostas.
    medicoes = [medicaoSobre(tinta.caixa, underlay)];
    if (defeito === 'escala') underlay = { ...underlay, mmPorPixel: underlay.mmPorPixel * 1.1 };
  }

  if (defeito === 'espelho') img = await virarNaVertical(img);

  // ── Cena `vetor`: o caminho de gerar parede, NO NAVEGADOR ─────────────────
  //
  // O algoritmo já é medido duas vezes fora daqui: por teste de unidade e pelo
  // spike em Node. O que NENHUM dos dois cobre é `extrairSegmentosPdf` rodando
  // com o pdfjs do NAVEGADOR — o spike usa o build `legacy` e o app usa o
  // normal, e é exatamente o tipo de diferença que passa despercebida até um
  // usuário abrir a tela.
  //
  // Confere contra número conhecido: a mesma região da PLANTA PAV. 02 que o
  // spike mede, que deu 58 eixos com 20/15/10 cm dominantes.
  if (cena === 'vetor') {
    const t1 = performance.now();
    const vetor = await extrairSegmentosPdf(
      new Blob([bytes], { type: 'application/pdf' }),
      1,
    );
    const msVetor = Math.round(performance.now() - t1);

    // Aferição 1:100, a mesma da cena `aferida`.
    const larguraPx = tinta.caixa.x2 - tinta.caixa.x1;
    const u = calibrar({
      p1: { px: tinta.caixa.x1, py: tinta.caixa.y1 },
      p2: { px: tinta.caixa.x2, py: tinta.caixa.y1 },
      distanciaMm: larguraPx * MM_POR_PX_1_100,
    });

    // A região do spike, em pt do PDF, convertida para milímetro do modelo.
    const cantos = [
      { x: 1780, y: 1840 },
      { x: 2330, y: 2270 },
    ].map((p) => ptParaModelo(u, p, vetor.alturaPt));
    const limites = {
      x0: Math.min(cantos[0].x, cantos[1].x),
      x1: Math.max(cantos[0].x, cantos[1].x),
      y0: Math.min(cantos[0].y, cantos[1].y),
      y1: Math.max(cantos[0].y, cantos[1].y),
    };

    const doGrupo = vetor.segmentos.filter((s) => Math.abs(s.larguraPt - 0.6) < 0.01);
    const paredes = gerarParedes(doGrupo, u, vetor.alturaPt, limites);

    // ── A VOLTA PELO ARQUIVO GUARDADO ────────────────────────────────────
    //
    // A Fase 2 grava o vetor achatado, com as coordenadas arredondadas em
    // 0,01 pt. Isso é 0,35 mm a 1:100 — abaixo de qualquer tolerância do
    // pareamento em teoria. Mas "em teoria" é como se perde precisão sem
    // perceber: o agrupamento de colineares compara offsets com uma casa
    // decimal, e um arredondamento anterior pode empurrar um traço para o
    // grupo vizinho. Aqui se mede se empurra.
    const achatado = achatarSegmentos(vetor.segmentos, vetor.larguraPt, vetor.alturaPt);
    const bytesGuardados = new Blob([JSON.stringify(achatado)]).size;
    const devolta = desachatarSegmentos(achatado);
    const paredesDaVolta = gerarParedes(
      devolta.filter((s) => Math.abs(s.larguraPt - 0.6) < 0.01),
      u,
      vetor.alturaPt,
      limites,
    );

    const porEsp: Record<number, number> = {};
    for (const p of paredes) porEsp[p.espessuraMm] = (porEsp[p.espessuraMm] ?? 0) + 1;

    (window as unknown as Record<string, unknown>).__vetor = {
      msVetor,
      totalSegmentos: vetor.segmentos.length,
      paginaPt: { largura: vetor.larguraPt, altura: vetor.alturaPt },
      doGrupo: doGrupo.length,
      paredes: paredes.length,
      mmPorPt: mmPorPt(u),
      espessuras: Object.entries(porEsp)
        .map(([mm, n]) => ({ mm: Number(mm), n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5),
      comprimentoTotalM:
        Math.round(paredes.reduce((t, p) => t + p.comprimentoMm, 0) / 100) / 10,
      guardado: {
        kb: Math.round(bytesGuardados / 1024),
        segmentos: devolta.length,
        paredes: paredesDaVolta.length,
        // Diferença de comprimento total entre gerar do vetor cru e gerar do
        // que voltou do arquivo. Zero é o esperado; qualquer coisa acima de
        // um milímetro por parede indica que o arredondamento mordeu.
        difComprimentoMm: Math.abs(
          paredes.reduce((t, p) => t + p.comprimentoMm, 0) -
            paredesDaVolta.reduce((t, p) => t + p.comprimentoMm, 0),
        ),
      },
    };
  }

  const diag = {
    cena,
    msRaster,
    larguraPx: r.larguraPx,
    alturaPx: r.alturaPx,
    totalPaginas: r.totalPaginas,
    megapixels: +((r.larguraPx * r.alturaPx) / 1e6).toFixed(1),
    /** Tamanho do papel deduzido do raster, em mm — A0 é 841 × 1189. */
    papelMm: {
      largura: +((r.larguraPx / 150) * 25.4).toFixed(0),
      altura: +((r.alturaPx / 150) * 25.4).toFixed(0),
    },
    blobKb: Math.round(r.blob.size / 1024),
    tinta,
    underlay,
  };
  (window as unknown as Record<string, unknown>).__diag = diag;

  createRoot(document.getElementById('raiz')!).render(
    <Harness imagem={img} underlay={underlay} medicoes={medicoes} />,
  );
  document.body.setAttribute('data-pronto', '1');
}

principal().catch((e) => {
  (window as unknown as Record<string, unknown>).__erro = String(e?.message ?? e);
  document.body.setAttribute('data-pronto', 'erro');
});
