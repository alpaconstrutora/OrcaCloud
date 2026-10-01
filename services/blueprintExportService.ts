// services/blueprintExportService.ts
//
// RF-125 — os dois adaptadores de `Desenhista` que tocam o mundo real, e o
// disparo do download.
//
// O desenho em si NÃO mora aqui: ele está em `utils/blueprintExport.ts`, escrito
// uma vez contra a interface. Aqui só se traduz "milímetro de papel" para o que
// cada destino entende — pixel no canvas, ponto no PDF.

import { abaDaPlanilhaDePressoes, calculoDoEstudo, caminhoCritico, planilhaDePressoes } from '../utils/blueprintPlanilhaDePressoes';
import { paraWinAnsi } from './blueprintMemorialHidroService';
import { numeracaoDeIncendio } from '../utils/blueprintNumeracaoIncendio';
import { colunasDoModelo, nomesDasColunas } from '../utils/blueprintEsquemaVertical';
import { DISCIPLINAS_DA_REDE, type RedeDaPrancha } from '../utils/blueprintPranchaHidro';
import { jsPDF } from 'jspdf';
import {
  AVISO_PADRAO,
  desenharElevacao,
  desenharFolhaDeDetalhesHidro,
  desenharFolhaDeIncendio,
  desenharFolhaDePressoesDeIncendio,
  desenharFolhaDoEsquemaVertical,
  desenharFolhaDoEsquemaVerticalEletrico,
  desenharFolhaDaListaDeMateriaisEletrica,
  desenharFolhaDoQuadroDeCargas,
  desenharFolhaDoUnifilar,
  desenharPlanta,
  desenharIndice,
  desenharTabelas,
  AVISO_HUMANIZADA,
  enquadrar,
  enquadrarElevacao,
  manifesto,
  nomeArquivo,
  type Desenhista,
  type Enquadramento,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { desenharCarimboDaFolha } from '../utils/blueprintExport';
import { desenharPlantaTopografica } from '../utils/blueprintPranchaTopografica';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  computeQuantities,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { HIPOTESES_ARMADURA_PADRAO, armaduraDoModelo } from '../utils/blueprintArmadura';
import {
  projetarElevacao,
  type DirecaoElevacao,
  type ProjecaoElevacao,
} from '../utils/blueprintElevation';
import { type ProjecaoCorte, projetarCorte } from '../utils/blueprintCorte';
import { modeloDoPavimento, papelDoTemplate, planejarConjunto, type PranchaPlanejada, type TemplateDePrancha, redesDoTemplate } from '../utils/blueprintPranchas';
import { COBERTURA_DXF, gerarDxf, type TopografiaParaDxf } from '../utils/blueprintDxf';
import { COBERTURA_IFC, gerarIfc, ifcGuidDoProjeto } from '../utils/blueprintIfc';
import { COBERTURA_COLLADA, gerarCollada } from '../utils/blueprintCollada';
import { lodPorUid } from '../utils/blueprintLod';
import { chavesPrivadas, parametrosCalculadosDoModelo } from '../utils/blueprintFormulas';
import { arquivosDoBcf, type TopicoBcf } from '../utils/blueprintBcf';
import {
  lerComponentes,
  lerMarkup,
  type PendenciaImportada,
} from '../utils/blueprintBcfLeitura';
import * as XLSX from 'xlsx';
import { COBERTURA_PLANILHA, abasDoQuantitativo, linhasDeParametros } from '../utils/blueprintPlanilha';

/**
 * As pranchas que a aba Versões pode marcar.
 *
 * As cinco primeiras são fixas; os CORTES são quantos o usuário tiver desenhado,
 * e por isso entram pelo id — a mesma forma de `VistaBlueprint`, e pela mesma
 * razão: sem o id no próprio valor seria preciso uma segunda lista em paralelo
 * dizendo a qual corte cada marcação se refere.
 */
export type PranchaExport =
  | 'planta'
  /** F8: a planta com a camada elétrica + a folha do quadro de cargas. */
  | 'eletrica'
  /** E8.4: a planta HUMANIZADA (venda) — pisos por material, sombra, mobiliário, vegetação; sem cotas, com aviso próprio. */
  | 'humanizada'
  /** E2.1: a planta com a rede de ÁGUA (fria e quente) + a folha de legenda hidrossanitária. */
  | 'hidraulica'
  /** E2.1: a planta com a rede de ESGOTO + a folha de legenda hidrossanitária. */
  | 'sanitaria'
  /** E8.1: a planta com o INCÊNDIO inteiro (hidrantes, sprinklers e preventivo numa folha). */
  | 'incendio'
  | 'frente'
  | 'fundos'
  | 'lateral-esq'
  | 'lateral-dir'
  | `corte:${string}`;

/** O id do corte, quando a prancha é um. `null` para as cinco fixas. */
export function corteDaPrancha(p: PranchaExport): string | null {
  return p.startsWith('corte:') ? p.slice('corte:'.length) : null;
}

const DIRECAO_DA_PRANCHA: Record<string, DirecaoElevacao> = {
  frente: 'FRENTE',
  fundos: 'FUNDOS',
  'lateral-esq': 'LATERAL_ESQUERDA',
  'lateral-dir': 'LATERAL_DIREITA',
};

const ROTULO_FIXO: Record<string, string> = {
  planta: 'Planta',
  eletrica: 'Planta elétrica',
  humanizada: 'Planta humanizada',
  hidraulica: 'Planta hidráulica',
  sanitaria: 'Planta de esgoto',
  incendio: 'Planta de incêndio',
  frente: 'Elevação frente',
  fundos: 'Elevação fundos',
  'lateral-esq': 'Elevação lateral esquerda',
  'lateral-dir': 'Elevação lateral direita',
};

/**
 * O nome que vai no carimbo. Para o corte é a LETRA, e não o id: "Corte AA" é
 * como a prancha se chama na obra, e o id não diz nada a quem lê o papel.
 */
/** A planta humanizada (E8.4) sai SEM cotas e com o aviso de material de venda — independentemente do que o painel marcou. */
function opcoesDaHumanizada(p: PranchaExport): Partial<OpcoesExportacao> {
  return p === 'humanizada' ? { humanizada: true, cotas: false, aviso: AVISO_HUMANIZADA } : {};
}

/** As pranchas que SÃO a planta (com ou sem uma camada por cima) — não têm projeção de elevação. */
export function ehPlantaDaPrancha(p: PranchaExport): boolean {
  return p === 'planta' || p === 'eletrica' || p === 'humanizada' || p === 'hidraulica' || p === 'sanitaria' || p === 'incendio';
}

/** O que cada planta põe por cima da arquitetura (elétrica, rede hidrossanitária, humanizada). */
function opcoesDaCamada(p: PranchaExport): Partial<OpcoesExportacao> {
  return {
    eletrica: p === 'eletrica',
    hidrossanitaria: p === 'hidraulica' ? 'AGUA' : p === 'sanitaria' ? 'ESGOTO' : undefined,
    incendio: p === 'incendio' ? 'TODAS' : undefined,
    ...opcoesDaHumanizada(p),
  };
}

/** As redes das pranchas hidrossanitárias marcadas (E2.3: o esquema vertical mostra só elas). */
function redesDasPranchas(pranchas: PranchaExport[]): RedeDaPrancha[] {
  return [...(pranchas.includes('hidraulica') ? (['AGUA'] as const) : []), ...(pranchas.includes('sanitaria') ? (['ESGOTO'] as const) : [])];
}

function temColuna(model: BlueprintModel, redes: RedeDaPrancha[]): boolean {
  const ds = redes.flatMap((r) => DISCIPLINAS_DA_REDE[r]);
  return colunasDoModelo(model).some((c) => ds.includes(c.disciplina));
}

/** A legenda hidrossanitária sai UMA vez, depois da última planta hidrossanitária marcada. */
function levaLegendaHidro(p: PranchaExport, pranchas: PranchaExport[]): boolean {
  return p === 'sanitaria' || (p === 'hidraulica' && !pranchas.includes('sanitaria'));
}

function rotuloDaPrancha(model: BlueprintModel, p: PranchaExport): string {
  const id = corteDaPrancha(p);
  if (!id) return ROTULO_FIXO[p] ?? p;
  const c = (model.sections ?? []).find((x) => x.id === id);
  return c ? `Corte ${c.rotulo}` : 'Corte';
}

/**
 * A projeção de uma prancha que não é a planta — elevação ou corte.
 *
 * As duas passam pelo MESMO enquadramento e pelo MESMO desenhista, porque o
 * corte é a elevação mais o que o plano atravessa. Um segundo caminho
 * divergiria do primeiro na primeira correção de escala.
 */
function projecaoDaPrancha(
  model: BlueprintModel,
  p: PranchaExport,
  levelIds?: string[],
): ProjecaoElevacao | ProjecaoCorte | null {
  if (ehPlantaDaPrancha(p)) return null;
  const id = corteDaPrancha(p);
  if (id) {
    const corte = (model.sections ?? []).find((x) => x.id === id);
    // Corte apagado com a marcação de pé: a prancha some em vez de explodir.
    // A aba Versões pode ter sido aberta antes da exclusão.
    if (!corte) return null;
    return projetarCorte(model, { corte, levelIds });
  }
  return projetarElevacao(model, { direcao: DIRECAO_DA_PRANCHA[p]!, levelIds });
}

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

  recortar(x: number, y: number, w: number, h: number): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x * this.k, y * this.k, w * this.k, h * this.k);
    this.ctx.clip();
  }
  fimDoRecorte(): void {
    this.ctx.restore();
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

  recortar(x: number, y: number, w: number, h: number): void {
    this.doc.saveGraphicsState();
    this.doc.rect(x, y, w, h, null as unknown as string);
    this.doc.clip();
    this.doc.discardPath();
  }
  fimDoRecorte(): void {
    this.doc.restoreGraphicsState();
  }

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
    // E8.2: as fontes-padrão do jsPDF são WinAnsi — ≥, →, √ viravam lixo em qualquer prancha.
    this.doc.text(paraWinAnsi(texto), x, y);
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

/**
 * Um arquivo PRONTO, antes de se decidir para onde ele vai.
 *
 * ─── POR QUE SEPARAR MONTAR DE BAIXAR ───────────────────────────────────────
 *
 * Até 08/09/2026 cada exportação terminava chamando `baixar`, e o arquivo só
 * existia dentro do navegador de quem clicou. Publicar a mesma planta no GED
 * pediria copiar a montagem inteira num segundo caminho — e dois caminhos que
 * montam "o mesmo" arquivo divergem: um ganha a cobertura, o outro não; um usa
 * o nome com a versão, o outro o nome do `xlsx`.
 *
 * Com o artefato no meio, MONTAR é um só e o destino é escolha de quem chama.
 */
export interface ArtefatoExportado {
  blob: Blob;
  nome: string;
  /** O que este arquivo é, para o GED: `ifc`, `dxf`, `xlsx`, `pdf`, `cobertura`. */
  tipo: string;
}

/** Manda os artefatos para o download do navegador — o destino padrão. */
export function baixarArtefatos(artefatos: ArtefatoExportado[]): void {
  for (const a of artefatos) baixar(a.blob, a.nome);
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
  // `o.cotas` entra aqui: a faixa de cota consome área útil, então ligar cota
  // pode fazer uma escala que cabia deixar de caber. Descobrir isso na hora de
  // desenhar seria tarde — o desenho já teria saído por cima da margem.
  const enq = enquadrar(model, o.denominador, o.papel, o.cotas);
  if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
  return enq;
}

export function montarPdf(model: BlueprintModel, o: OpcoesExportacao): ArtefatoExportado[] {
  const enq = exigirQueCaiba(model, o);

  const doc = new jsPDF({
    unit: 'mm',
    format: [o.papel.larguraMm, o.papel.alturaMm],
    orientation: o.papel.larguraMm > o.papel.alturaMm ? 'landscape' : 'portrait',
  });

  desenharPlanta(new DesenhistaPdf(doc), model, o, enq);
  // `output('blob')` em vez de `save()`: o `save` baixa por conta própria, e
  // aqui quem decide o destino é quem chama.
  return [{ blob: doc.output('blob'), nome: nomeArquivo(o, 'pdf'), tipo: 'pdf' }];
}

export function exportarPdf(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarPdf(model, o));
}

/**
 * PDF de várias pranchas — planta e/ou elevações — uma por página, no mesmo
 * papel e escala. Recusa ANTES de gerar qualquer página se alguma não couber.
 */
export function exportarPranchasPdf(
  model: BlueprintModel,
  o: OpcoesExportacao,
  pranchas: PranchaExport[],
  levelIds?: string[],
): void {
  if (pranchas.length === 0) return;

  type Pagina = {
    p: PranchaExport;
    enq: Enquadramento;
    proj: ProjecaoElevacao | ProjecaoCorte | null;
    /** F8: a segunda página da prancha elétrica — legenda e quadro de cargas. */
    quadroDeCargas?: boolean;
    unifilar?: boolean;
    /** E5.2: a folha da lista de materiais elétricos. */
    materiais?: boolean;
    /** E2.1: a folha de legenda das plantas hidrossanitárias. */
    legendaHidro?: boolean;
    /** E2.3: a folha do esquema vertical, logo depois da legenda. */
    esquemaHidro?: boolean;
  };

  // Enquadra tudo antes: uma página não pode sair e a seguinte falhar.
  const enquadrados = pranchas.flatMap<Pagina>((p) => {
    if (ehPlantaDaPrancha(p)) {
      const enq = enquadrar(model, o.denominador, o.papel, o.cotas);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
      // A prancha elétrica são QUATRO folhas: a planta, o quadro de cargas, o unifilar e (E5.2) a lista de materiais.
      if (p === 'eletrica') return [{ p, enq, proj: null }, { p, enq, proj: null, quadroDeCargas: true }, { p, enq, proj: null, unifilar: true }, { p, enq, proj: null, materiais: true }];
      if (levaLegendaHidro(p, pranchas)) {
        const esquema = temColuna(model, redesDasPranchas(pranchas)) ? [{ p, enq, proj: null, esquemaHidro: true }] : [];
        return [{ p, enq, proj: null }, { p, enq, proj: null, legendaHidro: true }, ...esquema];
      }
      return [{ p, enq, proj: null }];
    }
    const proj = projecaoDaPrancha(model, p, levelIds);
    if (!proj) return [];
    const enq = enquadrarElevacao(proj, o.denominador, o.papel);
    if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
    return [{ p, enq, proj }];
  });
  if (enquadrados.length === 0) return;

  const doc = new jsPDF({
    unit: 'mm',
    format: [o.papel.larguraMm, o.papel.alturaMm],
    orientation: o.papel.larguraMm > o.papel.alturaMm ? 'landscape' : 'portrait',
  });

  enquadrados.forEach(({ p, enq, proj, quadroDeCargas, unifilar, materiais, legendaHidro, esquemaHidro }, i) => {
    if (i > 0) doc.addPage([o.papel.larguraMm, o.papel.alturaMm]);
    const oPagina = {
      ...o,
      // As anotações do corte/elevação viajam nas opções: a folha não recebe o modelo (E8.1).
      anotacoes: model.anotacoes ?? [],
      ...opcoesDaCamada(p),
      titulo: `${o.titulo} — ${quadroDeCargas ? 'Quadro de cargas' : unifilar ? 'Diagrama unifilar' : materiais ? 'Lista de materiais — elétrica' : legendaHidro ? 'Legenda hidrossanitária' : esquemaHidro ? 'Esquema vertical' : rotuloDaPrancha(model, p)}`,
    };
    const desenhista = new DesenhistaPdf(doc);
    if (quadroDeCargas) desenharFolhaDoQuadroDeCargas(desenhista, model, oPagina, enq);
    else if (unifilar) desenharFolhaDoUnifilar(desenhista, model, oPagina, enq);
    else if (materiais) desenharFolhaDaListaDeMateriaisEletrica(desenhista, model, oPagina, enq);
    else if (legendaHidro) desenharFolhaDeDetalhesHidro(desenhista, model, { ...oPagina, denominador: 0 }, enq);
    else if (esquemaHidro) desenharFolhaDoEsquemaVertical(desenhista, model, { ...oPagina, denominador: 0 }, enq, redesDasPranchas(pranchas));
    else if (proj) desenharElevacao(desenhista, proj, { ...oPagina, instalacoesNoCorte: redesDasPranchas(pranchas).length > 0 }, enq);
    else desenharPlanta(desenhista, model, oPagina, enq);
  });

  doc.save(nomeArquivo(o, 'pdf'));
}

/**
 * O CONJUNTO DE PRANCHAS (20/09/2026, E8.3): índice + planta por pavimento +
 * (elétrica, quadro de cargas, unifilar) + cortes + elevações + ampliações +
 * tabelas, num PDF só, cada folha com o carimbo da organização e a numeração.
 *
 * A ESCALA do template é a pedida; quando a folha não cabe, a prancha desce
 * para a maior escala que cabe (a sugerida) e o carimbo diz qual foi — um
 * conjunto não pode falhar na 7ª folha por causa de um pavimento maior.
 *
 * Puro no que importa: `desenharConjunto` recebe o `Desenhista` (o de prova
 * nos testes, o do jsPDF aqui) e devolve o plano executado; `exportarConjuntoPdf`
 * só embrulha no jsPDF e baixa.
 */
export function desenharConjunto(
  model: BlueprintModel,
  o: OpcoesExportacao,
  template: TemplateDePrancha,
  novaFolha: (indice: number) => Desenhista,
): { pranchas: PranchaPlanejada[]; folhas: { prancha: PranchaPlanejada; denominador: number }[] } {
  const pranchas = planejarConjunto(model, template);
  const papel = papelDoTemplate(template);
  const quant = computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION);
  const nomeDoNivel = new Map(model.levels.map((l) => [l.id, l.name]));
  const base: OpcoesExportacao = { ...o, papel, cotas: template.cotas, anotacoes: model.anotacoes ?? [], carimboDaOrg: template.carimbo };
  const folhas: { prancha: PranchaPlanejada; denominador: number }[] = [];
  // E2.3: as colunas numeradas no desenho INTEIRO — cada planta de pavimento recebe o recorte.
  const colunasDoDesenho = nomesDasColunas(model);
  // E8.1: idem para os números de incêndio (H-1, SPK-3).
  const numerosDoDesenho = numeracaoDeIncendio(model);
  // E8.2: o caminho crítico, calculado UMA vez (o cálculo é caro) e só se alguma planta de rede pedir.
  let caminhoCache: string[] | null = null;
  const caminhoDoDesenho = () => {
    if (caminhoCache === null) caminhoCache = o.hipotesesDeIncendio ? caminhoCritico(model, calculoDoEstudo(model, o.hipotesesDeIncendio).calculo).trechos : [];
    return caminhoCache;
  };
  pranchas.forEach((p, i) => {
    const d = novaFolha(i);
    const comPrancha = (denominador: number, extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ ...base, ...extra, denominador, prancha: { numero: p.numero, total: pranchas.length, titulo: p.titulo } });
    switch (p.tipo) {
      case 'INDICE': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharIndice(d, pranchas, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'PLANTA':
      case 'ELETRICA':
      case 'HUMANIZADA': {
        const m = modeloDoPavimento(model, p.levelId!);
        const cotas = p.tipo === 'HUMANIZADA' ? false : template.cotas;
        let enq = enquadrar(m, p.denominador, papel, cotas);
        let den = p.denominador;
        if (!enq.cabe && enq.escalaSugerida) {
          den = enq.escalaSugerida;
          enq = enquadrar(m, den, papel, cotas);
        }
        desenharPlanta(d, m, comPrancha(den, p.tipo === 'HUMANIZADA' ? { humanizada: true, cotas: false, aviso: AVISO_HUMANIZADA } : p.tipo === 'ELETRICA' && p.recorteEletrico ? { eletrica: true, recorteEletrico: p.recorteEletrico } : { eletrica: p.tipo === 'ELETRICA' }), enq);
        folhas.push({ prancha: p, denominador: den });
        break;
      }
      // HIDROSSANITÁRIO (E2.1): a planta do pavimento com a rede por cima.
      case 'HIDRAULICA':
      case 'SANITARIA': {
        const m = modeloDoPavimento(model, p.levelId!);
        let enq = enquadrar(m, p.denominador, papel, template.cotas);
        let den = p.denominador;
        if (!enq.cabe && enq.escalaSugerida) {
          den = enq.escalaSugerida;
          enq = enquadrar(m, den, papel, template.cotas);
        }
        desenharPlanta(d, m, comPrancha(den, { hidrossanitaria: p.tipo === 'HIDRAULICA' ? 'AGUA' : 'ESGOTO', nomesDasColunas: colunasDoDesenho }), enq);
        folhas.push({ prancha: p, denominador: den });
        break;
      }
      // INCÊNDIO (E8.1): a planta do pavimento com a família por cima; a numeração é a do desenho inteiro.
      case 'INCENDIO': {
        const m = modeloDoPavimento(model, p.levelId!);
        let enq = enquadrar(m, p.denominador, papel, template.cotas);
        let den = p.denominador;
        if (!enq.cabe && enq.escalaSugerida) {
          den = enq.escalaSugerida;
          enq = enquadrar(m, den, papel, template.cotas);
        }
        // E8.2: o caminho crítico destacado nas de rede (hidrantes e sprinklers).
        const caminho = p.familiaDeIncendio === 'PREVENTIVO' ? undefined : caminhoDoDesenho();
        desenharPlanta(d, m, comPrancha(den, { incendio: p.familiaDeIncendio, numerosDeIncendio: numerosDoDesenho, caminhoCriticoDeIncendio: caminho }), enq);
        folhas.push({ prancha: p, denominador: den });
        break;
      }
      case 'PRESSOES_INCENDIO': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharFolhaDePressoesDeIncendio(d, model, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'LEGENDA_INCENDIO': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharFolhaDeIncendio(d, model, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'DETALHES_HIDRO': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharFolhaDeDetalhesHidro(d, model, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'ESQUEMA_HIDRO': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharFolhaDoEsquemaVertical(d, model, comPrancha(0), enq, redesDoTemplate(template));
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'QUADRO_DE_CARGAS':
      case 'UNIFILAR':
      case 'ESQUEMA_ELETRICO':
      case 'MATERIAIS_ELETRICA': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        if (p.tipo === 'QUADRO_DE_CARGAS') desenharFolhaDoQuadroDeCargas(d, model, comPrancha(0, { eletrica: true }), enq);
        else if (p.tipo === 'ESQUEMA_ELETRICO') desenharFolhaDoEsquemaVerticalEletrico(d, model, comPrancha(0, { eletrica: true }), enq);
        else if (p.tipo === 'MATERIAIS_ELETRICA') desenharFolhaDaListaDeMateriaisEletrica(d, model, comPrancha(0, { eletrica: true }), enq);
        else desenharFolhaDoUnifilar(d, model, comPrancha(0, { eletrica: true }), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'CORTE':
      case 'ELEVACAO': {
        const corte = p.corteId ? (model.sections ?? []).find((c) => c.id === p.corteId) : null;
        const proj = corte ? projetarCorte(model, { corte }) : p.direcao ? projetarElevacao(model, { direcao: p.direcao }) : null;
        if (!proj) {
          folhas.push({ prancha: p, denominador: 0 });
          break;
        }
        let den = p.denominador;
        let enq = enquadrarElevacao(proj, den, papel);
        if (!enq.cabe && enq.escalaSugerida) {
          den = enq.escalaSugerida;
          enq = enquadrarElevacao(proj, den, papel);
        }
        // E2.4: com prancha hidrossanitária no conjunto, o corte sai com a rede.
        desenharElevacao(d, proj, comPrancha(den, { instalacoesNoCorte: redesDoTemplate(template).length > 0 }), enq);
        folhas.push({ prancha: p, denominador: den });
        break;
      }
      case 'AMPLIACAO': {
        const m = modeloDoPavimento(model, p.levelId!);
        let den = p.denominador;
        let enq = enquadrar(m, den, papel, template.cotas, p.recorte);
        if (!enq.cabe && enq.escalaSugerida) {
          den = enq.escalaSugerida;
          enq = enquadrar(m, den, papel, template.cotas, p.recorte);
        }
        desenharPlanta(d, m, comPrancha(den, { recorte: p.recorte }), enq);
        folhas.push({ prancha: p, denominador: den });
        break;
      }
      case 'INCRA': {
        // A4: a mesma planta, com a tabela dos vértices no padrão do SIGEF.
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharPlantaTopografica(d, model, enq, 2.2, 'INCRA');
        desenharCarimboDaFolha(d, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'TOPOGRAFICA': {
        // A1: a escala é a que faz o lote caber com a tabela ao lado; sai como 0
        // ("variável") no carimbo em vez de um denominador que não mede.
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharPlantaTopografica(d, model, enq);
        desenharCarimboDaFolha(d, comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      case 'TABELAS': {
        const enq = enquadrar(model, template.denominadorPlanta, papel, false);
        desenharTabelas(d, quant, (spaceId) => nomeDoNivel.get(model.spaces.find((s) => s.id === spaceId)?.levelId ?? '') ?? '', comPrancha(0), enq);
        folhas.push({ prancha: p, denominador: 0 });
        break;
      }
      default:
        break;
    }
  });
  return { pranchas, folhas };
}

export function montarConjuntoPdf(model: BlueprintModel, o: OpcoesExportacao, template: TemplateDePrancha): ArtefatoExportado[] {
  const papel = papelDoTemplate(template);
  let doc: jsPDF | null = null;
  const { pranchas } = desenharConjunto(model, o, template, (i) => {
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [papel.larguraMm, papel.alturaMm], orientation: papel.larguraMm > papel.alturaMm ? 'landscape' : 'portrait' });
    else if (i > 0) doc.addPage([papel.larguraMm, papel.alturaMm]);
    return new DesenhistaPdf(doc);
  });
  if (!doc || pranchas.length === 0) return [];
  const blob = (doc as jsPDF).output('blob');
  return [{ nome: nomeArquivoSemEscala({ ...o, papel }, 'pdf').replace(/\.pdf$/, `-conjunto-${pranchas.length}pr.pdf`), blob, tipo: 'pdf' }];
}

export function exportarConjuntoPdf(model: BlueprintModel, o: OpcoesExportacao, template: TemplateDePrancha): void {
  baixarArtefatos(montarConjuntoPdf(model, o, template));
}

/** Um PNG por prancha marcada. Cada arquivo baixa separado. */
export function exportarPranchasPng(
  model: BlueprintModel,
  o: OpcoesExportacao,
  pranchas: PranchaExport[],
  levelIds?: string[],
  dpi = 300,
): void {
  const k = dpi / 25.4;
  for (const p of pranchas) {
    const proj = projecaoDaPrancha(model, p, levelIds);
    if (!ehPlantaDaPrancha(p) && !proj) continue;
    const oArquivo = { ...o, ...opcoesDaCamada(p), titulo: `${o.titulo} — ${rotuloDaPrancha(model, p)}` };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(o.papel.larguraMm * k);
    canvas.height = Math.round(o.papel.alturaMm * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('blueprintExport: canvas 2D indisponível');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (ehPlantaDaPrancha(p)) {
      const enq = enquadrar(model, o.denominador, o.papel, o.cotas);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
      desenharPlanta(new DesenhistaCanvas(ctx, dpi), model, oArquivo, enq);
      if (levaLegendaHidro(p, pranchas)) {
        // E2.1: a folha de legenda hidrossanitária, uma vez só.
        const c2 = document.createElement('canvas');
        c2.width = canvas.width;
        c2.height = canvas.height;
        const ctx2 = c2.getContext('2d');
        if (ctx2) {
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(0, 0, c2.width, c2.height);
          desenharFolhaDeDetalhesHidro(new DesenhistaCanvas(ctx2, dpi), model, { ...oArquivo, denominador: 0, titulo: `${o.titulo} — Legenda hidrossanitária` }, enq);
          const nome2 = nomeArquivo(oArquivo, 'png').replace(/\.png$/, '-legenda-hidrossanitaria.png');
          c2.toBlob((blob) => {
            if (blob) baixar(blob, nome2);
          }, 'image/png');
        }
        // E2.3: e o esquema vertical, quando há coluna.
        const redes = redesDasPranchas(pranchas);
        const c3 = temColuna(model, redes) ? document.createElement('canvas') : null;
        const ctx3 = c3?.getContext('2d');
        if (c3 && ctx3) {
          c3.width = canvas.width;
          c3.height = canvas.height;
          ctx3.fillStyle = '#ffffff';
          ctx3.fillRect(0, 0, c3.width, c3.height);
          desenharFolhaDoEsquemaVertical(new DesenhistaCanvas(ctx3, dpi), model, { ...oArquivo, denominador: 0, titulo: `${o.titulo} — Esquema vertical` }, enq, redes);
          const nome3 = nomeArquivo(oArquivo, 'png').replace(/\.png$/, '-esquema-vertical.png');
          c3.toBlob((blob) => {
            if (blob) baixar(blob, nome3);
          }, 'image/png');
        }
      }
      if (p === 'eletrica') {
        // A segunda folha da prancha elétrica: legenda + quadro de cargas.
        const c2 = document.createElement('canvas');
        c2.width = canvas.width;
        c2.height = canvas.height;
        const ctx2 = c2.getContext('2d');
        if (ctx2) {
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(0, 0, c2.width, c2.height);
          desenharFolhaDoQuadroDeCargas(new DesenhistaCanvas(ctx2, dpi), model, { ...oArquivo, titulo: `${o.titulo} — Quadro de cargas` }, enq);
          const nome2 = nomeArquivo(oArquivo, 'png').replace(/\.png$/, '-quadro-de-cargas.png');
          c2.toBlob((blob) => {
            if (blob) baixar(blob, nome2);
          }, 'image/png');
        }
        // E a terceira: o diagrama unifilar.
        const c3 = document.createElement('canvas');
        c3.width = canvas.width;
        c3.height = canvas.height;
        const ctx3 = c3.getContext('2d');
        if (ctx3) {
          ctx3.fillStyle = '#ffffff';
          ctx3.fillRect(0, 0, c3.width, c3.height);
          desenharFolhaDoUnifilar(new DesenhistaCanvas(ctx3, dpi), model, { ...oArquivo, titulo: `${o.titulo} — Diagrama unifilar` }, enq);
          const nome3 = nomeArquivo(oArquivo, 'png').replace(/\.png$/, '-unifilar.png');
          c3.toBlob((blob) => {
            if (blob) baixar(blob, nome3);
          }, 'image/png');
        }
        // E5.2: e a quarta — a lista de materiais.
        const c4 = document.createElement('canvas');
        c4.width = canvas.width;
        c4.height = canvas.height;
        const ctx4 = c4.getContext('2d');
        if (ctx4) {
          ctx4.fillStyle = '#ffffff';
          ctx4.fillRect(0, 0, c4.width, c4.height);
          desenharFolhaDaListaDeMateriaisEletrica(new DesenhistaCanvas(ctx4, dpi), model, { ...oArquivo, titulo: `${o.titulo} — Lista de materiais — elétrica` }, enq);
          const nome4 = nomeArquivo(oArquivo, 'png').replace(/\.png$/, '-materiais.png');
          c4.toBlob((blob) => {
            if (blob) baixar(blob, nome4);
          }, 'image/png');
        }
      }
    } else {
      const enq = enquadrarElevacao(proj!, o.denominador, o.papel);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
      desenharElevacao(new DesenhistaCanvas(ctx, dpi), proj!, { ...oArquivo, anotacoes: model.anotacoes ?? [], instalacoesNoCorte: redesDasPranchas(pranchas).length > 0 }, enq);
    }

    // `corte:abc` no nome do arquivo NAO desce no Windows: dois-pontos e
    // ilegal, e o download sai sem nome nenhum.
    const sufixo = p.replace(':', '-');
    const nome = nomeArquivo(oArquivo, 'png').replace(/\.png$/, `-${sufixo}.png`);
    canvas.toBlob((blob) => {
      if (blob) baixar(blob, nome);
    }, 'image/png');
  }
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

/**
 * DXF — 1:1, em milímetro real.
 *
 * NÃO recebe escala nem papel de propósito: no CAD o desenho vive em unidades do
 * mundo, e quem define 1:50 é a prancha na hora de plotar. Dividir as
 * coordenadas pela escala produziria um arquivo em que uma parede de 4 m mede
 * 4 cm, e toda medição feita nele sairia errada por duas ordens de grandeza.
 */
export function montarDxf(
  model: BlueprintModel,
  o: OpcoesExportacao,
  vistas?: Exclude<PranchaExport, 'planta'>[],
  levelIds?: string[],
  topografia?: TopografiaParaDxf,
): ArtefatoExportado[] {
  const projetadas = (vistas ?? [])
    .map((p) => projecaoDaPrancha(model, p, levelIds))
    .filter((x): x is ProjecaoElevacao | ProjecaoCorte => x !== null);

  const conteudo = gerarDxf(model, {
    titulo: o.titulo,
    revisao: o.revisao,
    hash: o.hash,
    cotas: o.cotas,
    eletrica: o.eletrica,
    hipotesesEletricas: o.hipotesesEletricas,
    redes: o.redesNoDxf,
    incendio: o.incendioNoDxf,
    // Elevação e corte saem no MESMO fluxo de blocos à direita da planta: numa
    // prancha os dois são vistas, e separá-los em duas faixas só faria o
    // arquivo ter dois espaçamentos diferentes para a mesma coisa.
    elevacoes: projetadas.length ? projetadas : undefined,
    topografia,
  });

  return [
    {
      blob: new Blob([conteudo], { type: 'application/dxf' }),
      nome: nomeArquivoSemEscala(o, 'dxf'),
      tipo: 'dxf',
    },
    coberturaComoArtefato(o, 'dxf', COBERTURA_DXF),
  ];
}

export function exportarDxf(
  model: BlueprintModel,
  o: OpcoesExportacao,
  vistas?: Exclude<PranchaExport, 'planta'>[],
  levelIds?: string[],
  topografia?: TopografiaParaDxf,
): void {
  baixarArtefatos(montarDxf(model, o, vistas, levelIds, topografia));
}

/**
 * IFC parcial — e o "parcial" é a parte que não pode ser omitida.
 *
 * O que um IFC não contém é indistinguível do que não existe: sem portas, quem
 * recebe conclui que a planta não tem portas. Por isso a cobertura vai DENTRO do
 * arquivo (cabeçalho STEP e descrição do projeto) e ainda sai num `.txt` ao
 * lado — o requisito é IFC parcial SOMENTE COM declaração, não IFC parcial.
 */
export function montarIfc(model: BlueprintModel, o: OpcoesExportacao): ArtefatoExportado[] {
  const conteudo = gerarIfc(model, {
    titulo: o.titulo,
    revisao: o.revisao,
    hash: o.hash,
    // Com o estudo, projeto/terreno/edifício têm GUID estável entre revisões.
    studyId: o.studyId,
    // Só vai custo se quem exportou pediu — ver `custoPorUid`.
    custoPorUid: o.custoPorUid,
    // LOD derivado por elemento (backlog P2): sempre vai — é leitura do desenho, não opção.
    // P2.30: com a armadura por peça (hipóteses do estudo), a estrutura chega a 350/400.
    lodPorUid: lodPorUid(model, contextoDeLodDoIfc(model, o)),
    aprovacao: o.aprovacao,
    parametrosCalculadosPorUid: o.definicoesDeParametro ? parametrosCalculadosDoModelo(model, o.definicoesDeParametro) : undefined,
    chavesPrivadas: o.definicoesDeParametro ? chavesPrivadas(o.definicoesDeParametro) : undefined,
    // E7.1: o esquema escolhido e as hipóteses do estudo (IB e demanda calculados no Pset elétrico).
    esquema: o.esquemaIfc,
    hipotesesEletricas: o.hipotesesEletricas,
  });

  return [
    {
      blob: new Blob([conteudo], { type: 'application/x-step' }),
      nome: nomeArquivoSemEscala(o, 'ifc'),
      tipo: 'ifc',
    },
    coberturaComoArtefato(o, 'ifc', COBERTURA_IFC),
  ];
}

/** O contexto do LOD para o IFC: a armadura por peça calculada com as hipóteses que vieram na exportação. */
function contextoDeLodDoIfc(model: BlueprintModel, o: OpcoesExportacao) {
  const hip = o.armadura ?? HIPOTESES_ARMADURA_PADRAO;
  const quant = computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION);
  const arm = armaduraDoModelo(model, quant, hip);
  return { armaduraPorUid: new Map(arm.pecas.map((p) => [p.uid, p])), manualPorUid: hip.porPeca ?? {} };
}

export function exportarIfc(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarIfc(model, o));
}

/**
 * SKETCHUP (backlog P2 — "SKP"): COLLADA .dae, o formato que o SketchUp importa
 * nativamente. Mesma disciplina do IFC: parcial SOMENTE COM declaração — a
 * cobertura vai no cabeçalho do arquivo e num .txt ao lado.
 */
export function montarCollada(model: BlueprintModel, o: OpcoesExportacao): ArtefatoExportado[] {
  const conteudo = gerarCollada(model, { titulo: o.titulo, revisao: o.revisao, hash: o.hash, kernelVersion: KERNEL_VERSION });
  return [
    { blob: new Blob([conteudo], { type: 'model/vnd.collada+xml' }), nome: nomeArquivoSemEscala(o, 'dae'), tipo: 'dae' },
    coberturaComoArtefato(o, 'dae', COBERTURA_COLLADA),
  ];
}

export function exportarCollada(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarCollada(model, o));
}

/** Nome sem a escala: DXF e IFC não têm escala, e citá-la no nome mentiria. */
function nomeArquivoSemEscala(o: OpcoesExportacao, extensao: string): string {
  return nomeArquivo(o, extensao).replace(/-1_\d+\./, '.');
}

/**
 * A cobertura também sai como arquivo ao lado.
 *
 * Ela já vai dentro do DXF (comentário) e do IFC (cabeçalho e descrição do
 * projeto), mas quem recebe o arquivo por e-mail costuma abrir só o desenho. Um
 * `.txt` de nome parecido é o único jeito de a limitação chegar junto.
 */
function coberturaComoArtefato(
  o: OpcoesExportacao,
  tipo: string,
  itens: string[],
): ArtefatoExportado {
  const texto = [
    `COBERTURA DA EXPORTAÇÃO ${tipo.toUpperCase()}`,
    `${o.titulo} — versão ${o.revisao}`,
    `hash ${o.hash}`,
    '',
    ...itens.map((i) => `- ${i}`),
    '',
    AVISO_PADRAO,
    '',
  ].join('\n');

  return {
    blob: new Blob([texto], { type: 'text/plain;charset=utf-8' }),
    nome: nomeArquivoSemEscala(o, `${tipo}.cobertura.txt`),
    tipo: 'cobertura',
  };
}

/**
 * O quantitativo como PLANILHA — o formato em que ele é de fato usado.
 *
 * O número já existia em três lugares (a aba Quantitativos, o de-para do
 * orçamento e o manifesto), e nenhum deles é onde a obra trabalha: quem compra
 * concreto abre uma planilha, filtra por tipo e soma. Sem esta saída, o caminho
 * era copiar da tela à mão, que é onde o número erra.
 *
 * O QUE ENTRA em cada aba é regra pura e mora em `utils/blueprintPlanilha.ts`.
 * Aqui fica só o que depende do browser: virar workbook e baixar.
 *
 * `writeFile` do `xlsx` chama o download sozinho, mas passa por cima do
 * `nomeArquivo` do módulo — que carrega estudo, versão e escala. Por isso o
 * caminho é `write` para buffer e o mesmo `baixar` dos outros formatos: o nome
 * do arquivo é o que liga a planilha à versão que a originou.
 */
export function montarQuantitativoXlsx(
  model: BlueprintModel,
  o: OpcoesExportacao,
): ArtefatoExportado[] {
  const quant = computeQuantities(model, POLITICA_PADRAO, KERNEL_VERSION);
  const abas = abasDoQuantitativo(
    quant,
    {
      titulo: o.titulo,
      revisao: o.revisao,
      hash: o.hash,
      kernelVersion: KERNEL_VERSION,
    },
    armaduraDoModelo(model, quant, o.armadura ?? HIPOTESES_ARMADURA_PADRAO),
    linhasDeParametros(model, o.definicoesDeParametro ? parametrosCalculadosDoModelo(model, o.definicoesDeParametro) : undefined, o.definicoesDeParametro ? chavesPrivadas(o.definicoesDeParametro) : undefined),
  );
  // E8.2: a planilha de pressões de incêndio, quando há rede e as premissas do estudo vieram.
  if (o.hipotesesDeIncendio && (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO')) {
    abas.push(abaDaPlanilhaDePressoes(planilhaDePressoes(model, calculoDoEstudo(model, o.hipotesesDeIncendio).calculo)));
  }

  const wb = XLSX.utils.book_new();
  for (const aba of abas) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba.linhas), aba.nome);
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return [
    {
      blob: new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      nome: nomeArquivoSemEscala(o, 'xlsx'),
      tipo: 'xlsx',
    },
    coberturaComoArtefato(o, 'xlsx', COBERTURA_PLANILHA),
  ];
}

export function exportarQuantitativoXlsx(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarQuantitativoXlsx(model, o));
}

/** Manifesto em JSON, ao lado do desenho. É o que liga o arquivo à versão. */
export function montarManifesto(
  model: BlueprintModel,
  o: OpcoesExportacao,
): ArtefatoExportado[] {
  const dados = manifesto(model, o, KERNEL_VERSION);
  return [
    {
      blob: new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }),
      nome: nomeArquivo(o, 'json'),
      tipo: 'manifesto',
    },
  ];
}

export function exportarManifesto(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarManifesto(model, o));
}

/**
 * O `.bcfzip` — a pendência num formato que sai da empresa.
 *
 * ⚠️ Assíncrona, ao contrário das outras exportações: o `pizzip` entra por
 * `import()` dinâmico, como o `docxRenderService` já faz, para não pesar o
 * bundle de quem nunca exporta BCF.
 *
 * ⚠️ E o BCF NÃO substitui o IFC — ele o acompanha. O tópico aponta o elemento
 * por `IfcGuid` e não o descreve: sem o IFC do mesmo desenho do outro lado, o
 * receptor abre a pendência e não tem o que selecionar. Quem exporta um deve
 * exportar o outro, e a cobertura diz isso.
 */
export async function montarBcf(topicos: TopicoBcf[], o: OpcoesExportacao): Promise<ArtefatoExportado[]> {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip();
  // ⚠️ O `Header/File` só sai com `studyId`: sem ele não há como derivar o GUID
  // do `IfcProject`, e um Header apontando para um projeto inventado seria pior
  // que Header nenhum — o receptor casaria a pendência com o modelo errado.
  const ifcDoPacote = o.studyId
    ? { ifcProjectGuid: ifcGuidDoProjeto(o.studyId), nome: nomeArquivoSemEscala(o, 'ifc') }
    : null;
  for (const arquivo of arquivosDoBcf(topicos, ifcDoPacote)) {
    zip.file(arquivo.caminho, arquivo.conteudo);
  }
  const blob = zip.generate({ type: 'blob', mimeType: 'application/octet-stream' }) as Blob;
  return [
    {
      blob,
      nome: nomeArquivoSemEscala(o, 'bcfzip'),
      tipo: 'bcf',
    },
  ];
}

export async function exportarBcf(topicos: TopicoBcf[], o: OpcoesExportacao): Promise<void> {
  baixarArtefatos(await montarBcf(topicos, o));
}

/**
 * LÊ um `.bcfzip` — o que o projetista devolveu.
 *
 * ⚠️ O viewpoint é achado pelo NOME QUE O MARKUP DECLARA, e não por um nome
 * fixo. O caso de teste oficial do buildingSMART chama o dele
 * `Viewpoint_<guid>.bcfv`; o nosso chama `viewpoint.bcfv`. Procurar um nome fixo
 * acharia só os nossos — e a seleção sumiria dos arquivos de terceiro, sem erro
 * nenhum.
 *
 * ⚠️ E quando o markup não declara nenhum, cai para QUALQUER `.bcfv` da pasta do
 * tópico. É recurso, não regra: sem essa saída, um arquivo levemente fora do
 * padrão perderia os componentes em silêncio.
 */
export async function lerBcfZip(arquivo: File | ArrayBuffer): Promise<PendenciaImportada[]> {
  const { default: PizZip } = await import('pizzip');
  const dados = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  const zip = new PizZip(dados);

  const caminhos = Object.keys(zip.files);
  const saida: PendenciaImportada[] = [];

  for (const caminho of caminhos) {
    if (!/(^|\/)markup\.bcf$/i.test(caminho)) continue;
    const topico = lerMarkup(zip.file(caminho)!.asText());
    if (!topico) continue;

    const pasta = caminho.includes('/') ? caminho.slice(0, caminho.lastIndexOf('/') + 1) : '';
    const declarado = topico.viewpoint ? zip.file(`${pasta}${topico.viewpoint}`) : null;
    const qualquer =
      declarado ??
      zip.file(
        caminhos.find((c) => c.startsWith(pasta) && /\.bcfv$/i.test(c)) ?? '__nada__',
      );

    saida.push({
      ...topico,
      componentes: qualquer ? lerComponentes(qualquer.asText()) : [],
      uidsCasados: [],
    });
  }

  return saida;
}

export { AVISO_PADRAO };

/**
 * TABELAS PERSONALIZADAS (P2.16): uma tabela montada em .xlsx de uma aba só.
 * Devolve o artefato — quem chama baixa (`baixarArtefatos`).
 */
export function artefatoDeTabelaXlsx(nome: string, linhas: (string | number | null)[][]): ArtefatoExportado {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome.slice(0, 31) || 'Tabela');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const limpo = nome.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'tabela';
  return { blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome: `tabela-${limpo}.xlsx`, tipo: 'xlsx' };
}
