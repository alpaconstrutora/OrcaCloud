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
  desenharElevacao,
  desenharPlanta,
  enquadrar,
  enquadrarElevacao,
  manifesto,
  nomeArquivo,
  type Desenhista,
  type Enquadramento,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import {
  KERNEL_VERSION,
  POLITICA_PADRAO,
  computeQuantities,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  projetarElevacao,
  type DirecaoElevacao,
  type ProjecaoElevacao,
} from '../utils/blueprintElevation';
import { type ProjecaoCorte, projetarCorte } from '../utils/blueprintCorte';
import { COBERTURA_DXF, gerarDxf } from '../utils/blueprintDxf';
import { COBERTURA_IFC, gerarIfc, ifcGuidDoProjeto } from '../utils/blueprintIfc';
import { arquivosDoBcf, type TopicoBcf } from '../utils/blueprintBcf';
import {
  lerComponentes,
  lerMarkup,
  type PendenciaImportada,
} from '../utils/blueprintBcfLeitura';
import * as XLSX from 'xlsx';
import { COBERTURA_PLANILHA, abasDoQuantitativo } from '../utils/blueprintPlanilha';

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
  frente: 'Elevação frente',
  fundos: 'Elevação fundos',
  'lateral-esq': 'Elevação lateral esquerda',
  'lateral-dir': 'Elevação lateral direita',
};

/**
 * O nome que vai no carimbo. Para o corte é a LETRA, e não o id: "Corte AA" é
 * como a prancha se chama na obra, e o id não diz nada a quem lê o papel.
 */
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
  if (p === 'planta') return null;
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
  };

  // Enquadra tudo antes: uma página não pode sair e a seguinte falhar.
  const enquadrados = pranchas.flatMap<Pagina>((p) => {
    if (p === 'planta') {
      const enq = enquadrar(model, o.denominador, o.papel, o.cotas);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
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

  enquadrados.forEach(({ p, enq, proj }, i) => {
    if (i > 0) doc.addPage([o.papel.larguraMm, o.papel.alturaMm]);
    const oPagina = { ...o, titulo: `${o.titulo} — ${rotuloDaPrancha(model, p)}` };
    const desenhista = new DesenhistaPdf(doc);
    if (proj) desenharElevacao(desenhista, proj, oPagina, enq);
    else desenharPlanta(desenhista, model, oPagina, enq);
  });

  doc.save(nomeArquivo(o, 'pdf'));
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
    if (p !== 'planta' && !proj) continue;
    const oArquivo = { ...o, titulo: `${o.titulo} — ${rotuloDaPrancha(model, p)}` };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(o.papel.larguraMm * k);
    canvas.height = Math.round(o.papel.alturaMm * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('blueprintExport: canvas 2D indisponível');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (p === 'planta') {
      const enq = enquadrar(model, o.denominador, o.papel, o.cotas);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
      desenharPlanta(new DesenhistaCanvas(ctx, dpi), model, oArquivo, enq);
    } else {
      const enq = enquadrarElevacao(proj!, o.denominador, o.papel);
      if (!enq.cabe) throw new EscalaNaoCabe(o.denominador, enq.escalaSugerida);
      desenharElevacao(new DesenhistaCanvas(ctx, dpi), proj!, oArquivo, enq);
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
): ArtefatoExportado[] {
  const projetadas = (vistas ?? [])
    .map((p) => projecaoDaPrancha(model, p, levelIds))
    .filter((x): x is ProjecaoElevacao | ProjecaoCorte => x !== null);

  const conteudo = gerarDxf(model, {
    titulo: o.titulo,
    revisao: o.revisao,
    hash: o.hash,
    cotas: o.cotas,
    // Elevação e corte saem no MESMO fluxo de blocos à direita da planta: numa
    // prancha os dois são vistas, e separá-los em duas faixas só faria o
    // arquivo ter dois espaçamentos diferentes para a mesma coisa.
    elevacoes: projetadas.length ? projetadas : undefined,
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
): void {
  baixarArtefatos(montarDxf(model, o, vistas, levelIds));
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
    aprovacao: o.aprovacao,
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

export function exportarIfc(model: BlueprintModel, o: OpcoesExportacao): void {
  baixarArtefatos(montarIfc(model, o));
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
  const abas = abasDoQuantitativo(quant, {
    titulo: o.titulo,
    revisao: o.revisao,
    hash: o.hash,
    kernelVersion: KERNEL_VERSION,
  });

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
