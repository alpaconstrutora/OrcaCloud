// services/blueprintExportService.ts
//
// RF-125 — os dois adaptadores de `Desenhista` que tocam o mundo real, e o
// disparo do download.
//
// O desenho em si NÃO mora aqui: ele está em `utils/blueprintExport.ts`, escrito
// uma vez contra a interface. Aqui só se traduz "milímetro de papel" para o que
// cada destino entende — pixel no canvas, ponto no PDF.

import { jsPDF } from 'jspdf';
import {
  AVISO_PADRAO,
  desenharPlanta,
  enquadrar,
  manifesto,
  nomeArquivo,
  type Desenhista,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { KERNEL_VERSION, type BlueprintModel } from '../utils/blueprintKernel';

/**
 * Canvas, para PNG.
 *
 * O fator mm→px vem do DPI pedido, e não de um número arbitrário: 300 dpi é o
 * mínimo para impressão, e é o que faz o PNG ter a MESMA escala física do PDF
 * quando impresso no tamanho original.
 */
class DesenhistaCanvas implements Desenhista {
  private readonly k: number;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    dpi: number,
  ) {
    this.k = dpi / 25.4;
  }

  linha(x1: number, y1: number, x2: number, y2: number, e: EstiloTraco): void {
    this.ctx.strokeStyle = e.cor;
    // Traço de espessura zero some; meio pixel é o mínimo que ainda aparece.
    this.ctx.lineWidth = Math.max(0.5, e.espessuraMm * this.k);
    this.ctx.lineCap = 'butt';
    this.ctx.beginPath();
    this.ctx.moveTo(x1 * this.k, y1 * this.k);
    this.ctx.lineTo(x2 * this.k, y2 * this.k);
    this.ctx.stroke();
  }

  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    if (pontos.length < 3) return;
    this.ctx.fillStyle = preenchimento;
    this.ctx.beginPath();
    this.ctx.moveTo(pontos[0].x * this.k, pontos[0].y * this.k);
    for (const p of pontos.slice(1)) this.ctx.lineTo(p.x * this.k, p.y * this.k);
    this.ctx.closePath();
    this.ctx.fill();
  }

  texto(x: number, y: number, texto: string, alturaMm: number, cor = '#000000'): void {
    this.ctx.fillStyle = cor;
    this.ctx.font = `${alturaMm * this.k}px sans-serif`;
    this.ctx.textAlign = 'left';
    this.ctx.fillText(texto, x * this.k, y * this.k);
  }

  retangulo(x: number, y: number, w: number, h: number, e: EstiloTraco): void {
    // Retângulo com cor de traço branca é preenchimento (a barra da escala
    // gráfica alterna preto e branco); com cor preta é contorno.
    if (e.cor === '#ffffff') {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x * this.k, y * this.k, w * this.k, h * this.k);
      return;
    }
    this.ctx.strokeStyle = e.cor;
    this.ctx.lineWidth = Math.max(0.5, e.espessuraMm * this.k);
    this.ctx.strokeRect(x * this.k, y * this.k, w * this.k, h * this.k);
  }
}

/** jsPDF, com o documento já em milímetros — daí não haver conversão nenhuma. */
class DesenhistaPdf implements Desenhista {
  constructor(private readonly doc: jsPDF) {}

  linha(x1: number, y1: number, x2: number, y2: number, e: EstiloTraco): void {
    this.doc.setDrawColor(e.cor);
    this.doc.setLineWidth(Math.max(0.05, e.espessuraMm));
    this.doc.setLineCap('butt');
    this.doc.line(x1, y1, x2, y2);
  }

  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    if (pontos.length < 3) return;
    this.doc.setFillColor(preenchimento);
    const deltas = pontos
      .slice(1)
      .map((p, i) => [p.x - pontos[i].x, p.y - pontos[i].y] as [number, number]);
    this.doc.lines(deltas, pontos[0].x, pontos[0].y, [1, 1], 'F', true);
  }

  texto(x: number, y: number, texto: string, alturaMm: number, cor = '#000000'): void {
    this.doc.setTextColor(cor);
    // pt = mm × 72/25.4. jsPDF mede fonte em pontos mesmo com o doc em mm.
    this.doc.setFontSize(alturaMm * 2.834);
    this.doc.text(texto, x, y);
  }

  retangulo(x: number, y: number, w: number, h: number, e: EstiloTraco): void {
    if (e.cor === '#ffffff') {
      this.doc.setFillColor('#ffffff');
      this.doc.rect(x, y, w, h, 'F');
      return;
    }
    this.doc.setDrawColor(e.cor);
    this.doc.setLineWidth(Math.max(0.05, e.espessuraMm));
    this.doc.rect(x, y, w, h, 'S');
  }
}

function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export class EscalaNaoCabe extends Error {
  constructor(
    readonly denominador: number,
    readonly sugerida: number | null,
  ) {
    super(
      sugerida
        ? `O desenho não cabe em 1:${denominador} neste papel. A partir de 1:${sugerida} cabe.`
        : `O desenho não cabe em 1:${denominador} e nenhuma escala da lista serve — use um papel maior.`,
    );
    this.name = 'EscalaNaoCabe';
  }
}

/**
 * Falha ANTES de gerar qualquer coisa quando a escala não cabe.
 *
 * Encolher para caber produziria uma folha que diz 1:100 e mede outra coisa. É
 * pior do que não exportar: o erro sai da tela e vira papel.
 */
function exigirQueCaiba(model: BlueprintModel, o: OpcoesExportacao) {
  const enq = enquadrar(model, o.denominador, o.papel);
  if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
  return enq;
}

export function exportarPdf(model: BlueprintModel, o: OpcoesExportacao): void {
  const enq = exigirQueCaiba(model, o);

  const doc = new jsPDF({
    unit: 'mm',
    format: [o.papel.larguraMm, o.papel.alturaMm],
    orientation: o.papel.larguraMm > o.papel.alturaMm ? 'landscape' : 'portrait',
  });

  desenharPlanta(new DesenhistaPdf(doc), model, o, enq);
  doc.save(nomeArquivo(o, 'pdf'));
}

export function exportarPng(model: BlueprintModel, o: OpcoesExportacao, dpi = 300): void {
  const enq = exigirQueCaiba(model, o);

  const k = dpi / 25.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(o.papel.larguraMm * k);
  canvas.height = Math.round(o.papel.alturaMm * k);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('blueprintExport: canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  desenharPlanta(new DesenhistaCanvas(ctx, dpi), model, o, enq);

  canvas.toBlob((blob) => {
    if (blob) baixar(blob, nomeArquivo(o, 'png'));
  }, 'image/png');
}

/** Manifesto em JSON, ao lado do desenho. É o que liga o arquivo à versão. */
export function exportarManifesto(model: BlueprintModel, o: OpcoesExportacao): void {
  const dados = manifesto(model, o, KERNEL_VERSION);
  baixar(
    new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }),
    nomeArquivo(o, 'json'),
  );
}

export { AVISO_PADRAO };
