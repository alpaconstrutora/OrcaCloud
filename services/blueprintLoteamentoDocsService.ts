// services/blueprintLoteamentoDocsService.ts
//
// OS DOCUMENTOS DO LOTEAMENTO (fase B4): o conjunto que vai à prefeitura e ao
// cartório, gerado do desenho.
//
//   • a planta geral do loteamento;
//   • uma planta individual POR LOTE, cotada e com os confrontantes;
//   • a folha de tabelas (quadro de lotes e resumo por quadra);
//   • o memorial descritivo em texto — abertura, cada lote, as áreas públicas;
//   • os pontos de locação em CSV, para levar à estação total.
//
// Tudo sai do modelo publicado; nada é gravado. Quem decide o destino (baixar ou
// mandar ao GED) é quem chama, como nas outras exportações.
import jsPDF from 'jspdf';
import type { BlueprintModel } from '../utils/blueprintKernel';
import { snapshotHash } from '../utils/blueprintKernel';
import { PAPEIS, orientar, MARGEM_MM, CARIMBO_MM, desenharCarimboDaFolha, type Desenhista, type EstiloTraco, type Enquadramento, type OpcoesExportacao, type Papel } from '../utils/blueprintExport';
import { desenharLote, desenharLoteamento, desenharTabelasDoLoteamento } from '../utils/blueprintPranchaLoteamento';
import { documentoDoLoteamento, csvDeLocacao, memoriaisDoLoteamento, type DadosDoLoteamento } from '../utils/blueprintMemorialLote';
import type { ArtefatoExportado } from './blueprintExportService';

/** O desenhista do jsPDF. Mesmo contrato do usado na exportação de plantas. */
class DesenhistaPdfDoLoteamento implements Desenhista {
  constructor(private readonly doc: jsPDF) {}

  linha(x1: number, y1: number, x2: number, y2: number, e: EstiloTraco): void {
    this.doc.setLineWidth(e.espessuraMm);
    this.doc.setDrawColor(e.cor);
    this.doc.line(x1, y1, x2, y2);
  }

  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    if (pontos.length < 3) return;
    this.doc.setFillColor(preenchimento);
    const [primeiro, ...resto] = pontos;
    this.doc.moveTo(primeiro.x, primeiro.y);
    for (const p of resto) this.doc.lineTo(p.x, p.y);
    this.doc.lineTo(primeiro.x, primeiro.y);
    this.doc.fill();
  }

  texto(x: number, y: number, texto: string, alturaMm: number, cor = '#0f172a'): void {
    this.doc.setFontSize(alturaMm * 2.83); // mm → pt
    this.doc.setTextColor(cor);
    this.doc.text(texto, x, y, { align: 'center' });
  }

  retangulo(x: number, y: number, w: number, h: number, e: EstiloTraco): void {
    this.doc.setLineWidth(e.espessuraMm);
    this.doc.setDrawColor(e.cor);
    this.doc.rect(x, y, w, h);
  }
}

export interface OpcoesDosDocumentos {
  dados: DadosDoLoteamento;
  /** Área da gleba em mm², para o quadro de áreas. */
  areaDaGlebaMm2: number | null;
  /** A3 paisagem é o usual de loteamento; A4 serve para a planta individual. */
  papelId?: 'A4' | 'A3' | 'A2' | 'A1' | 'A0';
  paisagem?: boolean;
  /** Uma folha por lote. Em loteamento grande, isso são dezenas de páginas. */
  umaFolhaPorLote?: boolean;
  carimboDaOrg?: OpcoesExportacao['carimboDaOrg'];
  /**
   * O que o carimbo liga à versão: o hash do desenho e a revisão. Ausentes, sai
   * o hash do desenho ATUAL (o que se imprime) e revisão 0 — antes da A5 o
   * carimbo lia `o.hash.slice` sem ele e o PDF do loteamento quebrava ao gerar.
   */
  hash?: string;
  revisao?: number;
}

function papelDe(o: OpcoesDosDocumentos): Papel {
  // `PAPEIS` é LISTA, não mapa: buscar por id evita depender da ordem dela.
  const id = o.papelId ?? 'A3';
  const base = PAPEIS.find((p) => p.id === id) ?? PAPEIS[1];
  return orientar(base, o.paisagem !== false);
}

/** A área útil da folha, descontadas margens e carimbo. */
function areaUtil(papel: Papel): Enquadramento {
  const utilLarguraMm = papel.larguraMm - MARGEM_MM * 2;
  const utilAlturaMm = papel.alturaMm - MARGEM_MM * 2 - CARIMBO_MM;
  return {
    cabe: true,
    vazio: false,
    ocupacao: 1,
    desenhoLarguraMm: utilLarguraMm,
    desenhoAlturaMm: utilAlturaMm,
    utilLarguraMm,
    utilAlturaMm,
    offsetXMm: MARGEM_MM,
    offsetYMm: MARGEM_MM,
    escalaSugerida: null,
  };
}

/**
 * O CONJUNTO EM PDF.
 *
 * A escala de cada folha é a que faz o desenho caber — e por isso ela sai
 * ESCRITA como "variável" no carimbo em vez de um denominador redondo. Dizer
 * 1:500 numa folha que mede outra coisa é pior do que não dizer escala: o erro
 * sai da tela e vira papel (é a mesma razão do `EscalaNaoCabe` das plantas).
 */
export function montarPdfDoLoteamento(model: BlueprintModel, o: OpcoesDosDocumentos): ArtefatoExportado[] {
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  const papel = papelDe(o);
  const enq = areaUtil(papel);
  const hashDoDesenho = snapshotHash(model);

  const folhas: { titulo: string; desenhar: (d: Desenhista) => void }[] = [];
  folhas.push({
    titulo: `${o.dados.nome} — Planta geral`,
    desenhar: (d) => desenharLoteamento(d, model, enq),
  });
  if (o.umaFolhaPorLote !== false) {
    for (const lote of lotes) {
      const quadra = lote.quadraId != null ? (model.quadras ?? []).find((q) => q.id === lote.quadraId) : undefined;
      folhas.push({
        titulo: quadra ? `Quadra ${quadra.nome} — Lote ${lote.numero}` : `Lote ${lote.numero}`,
        desenhar: (d) => desenharLote(d, model, lote, enq),
      });
    }
  }
  folhas.push({
    titulo: `${o.dados.nome} — Quadro de áreas`,
    desenhar: (d) => desenharTabelasDoLoteamento(d, model, o.areaDaGlebaMm2, enq),
  });

  const doc = new jsPDF({
    unit: 'mm',
    format: [papel.larguraMm, papel.alturaMm],
    orientation: papel.larguraMm > papel.alturaMm ? 'landscape' : 'portrait',
  });

  folhas.forEach((folha, i) => {
    if (i > 0) doc.addPage([papel.larguraMm, papel.alturaMm], papel.larguraMm > papel.alturaMm ? 'landscape' : 'portrait');
    const d = new DesenhistaPdfDoLoteamento(doc);
    folha.desenhar(d);
    desenharCarimboDaFolha(d, {
      papel,
      denominador: 0,
      cotas: false,
      titulo: folha.titulo,
      carimboDaOrg: o.carimboDaOrg,
      hash: o.hash ?? hashDoDesenho,
      revisao: o.revisao ?? 0,
      prancha: { numero: `L-${String(i + 1).padStart(2, '0')}`, total: folhas.length, titulo: folha.titulo },
    } as OpcoesExportacao, enq);
  });

  const base = nomeBase(o.dados.nome);
  return [{ blob: doc.output('blob'), nome: `${base}-pranchas.pdf`, tipo: 'pdf' }];
}

/** O memorial em texto e o CSV de locação — os dois arquivos de acompanhamento. */
export function montarMemoriaisDoLoteamento(model: BlueprintModel, o: OpcoesDosDocumentos): ArtefatoExportado[] {
  const base = nomeBase(o.dados.nome);
  const memorial = documentoDoLoteamento(model, o.areaDaGlebaMm2, o.dados);
  const locacao = csvDeLocacao(model);
  return [
    { blob: new Blob([memorial], { type: 'text/plain;charset=utf-8' }), nome: `${base}-memorial.txt`, tipo: 'memorial' },
    { blob: new Blob([locacao], { type: 'text/csv;charset=utf-8' }), nome: `${base}-locacao.csv`, tipo: 'locacao' },
  ];
}

/** Tudo de uma vez: pranchas, memorial e locação. */
export function montarDocumentosDoLoteamento(model: BlueprintModel, o: OpcoesDosDocumentos): ArtefatoExportado[] {
  return [...montarPdfDoLoteamento(model, o), ...montarMemoriaisDoLoteamento(model, o)];
}

/** Quantas folhas e quantos memoriais sairiam — para o botão dizer antes. */
export function previaDosDocumentos(model: BlueprintModel): { folhas: number; memoriais: number; pontosDeLocacao: number } {
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  const memoriais = memoriaisDoLoteamento(model);
  return {
    // planta geral + uma por lote + tabelas
    folhas: 2 + lotes.length,
    memoriais: memoriais.length,
    pontosDeLocacao: lotes.reduce((s, l) => s + l.pontos.length, 0),
  };
}

function nomeBase(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'loteamento'
  );
}
