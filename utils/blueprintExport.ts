/**
 * RF-125 — exportação com escala, legenda, versão e aviso de finalidade.
 *
 * ─── A ESCALA É O REQUISITO, NÃO UM ENFEITE ─────────────────────────────────
 *
 * 1:100 quer dizer que 1 metro real mede 10 mm no papel. Alguém vai imprimir
 * esta folha e medir com escalímetro. Se o desenho for encolhido para caber e a
 * legenda continuar dizendo 1:100, o papel MENTE — e o erro só aparece na obra.
 *
 * Por isso a escala é ENTRADA, nunca resultado. Quando o desenho não cabe, a
 * função não ajusta em silêncio: recusa e informa qual escala caberia. Ajustar
 * para caber é justamente o que transforma um desenho técnico em ilustração.
 *
 * ─── DESENHAR UMA VEZ SÓ ────────────────────────────────────────────────────
 *
 * O desenho é escrito contra a interface `Desenhista`, em MILÍMETROS DE PAPEL.
 * Três implementações: canvas (PNG), jsPDF (PDF) e uma que só grava as chamadas
 * — é ela que torna a exportação testável sem comparar pixel, que é o tipo de
 * teste que ninguém mantém.
 *
 * Este NÃO é o renderizador da tela, de propósito. Tela e papel têm exigências
 * diferentes: a tela tem grade, seleção e cor de destaque; o papel tem traço
 * preto, espessura em milímetros e carimbo. Reaproveitar um no outro obrigaria
 * os dois a carregar condicional do outro.
 */

import type { BlueprintModel, Point, Wall } from './blueprintKernel';
import { wallLength } from './blueprintKernel';

// ─────────────────────────────────────────────────────────────────────────────
// Papel e escala
// ─────────────────────────────────────────────────────────────────────────────

export interface Papel {
  id: string;
  larguraMm: number;
  alturaMm: number;
}

/** Série A, em retrato. Paisagem sai trocando os lados em `orientar`. */
export const PAPEIS: Papel[] = [
  { id: 'A4', larguraMm: 210, alturaMm: 297 },
  { id: 'A3', larguraMm: 297, alturaMm: 420 },
  { id: 'A2', larguraMm: 420, alturaMm: 594 },
  { id: 'A1', larguraMm: 594, alturaMm: 841 },
  { id: 'A0', larguraMm: 841, alturaMm: 1189 },
];

/** Denominadores usuais em arquitetura. 1:1 não entra: planta não se imprime 1:1. */
export const ESCALAS = [20, 25, 50, 75, 100, 125, 200, 250, 500];

export function orientar(papel: Papel, paisagem: boolean): Papel {
  return paisagem
    ? { ...papel, larguraMm: papel.alturaMm, alturaMm: papel.larguraMm }
    : papel;
}

export const MARGEM_MM = 12;
/** Faixa inferior do carimbo: legenda, versão, escala e aviso. */
export const CARIMBO_MM = 26;

export interface Enquadramento {
  cabe: boolean;
  /** Tamanho que o desenho ocupa no papel, já na escala pedida. */
  desenhoLarguraMm: number;
  desenhoAlturaMm: number;
  /** Área útil, descontadas margens e carimbo. */
  utilLarguraMm: number;
  utilAlturaMm: number;
  /** Canto superior esquerdo da área de desenho, em mm de papel. */
  offsetXMm: number;
  offsetYMm: number;
  /** Menor denominador da lista que caberia. `null` se nenhum couber. */
  escalaSugerida: number | null;
}

/** Caixa envolvente do modelo, em mm reais. */
export function boundingBox(model: BlueprintModel): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const pontos: Point[] = [
    ...model.walls.flatMap((w) => [w.a, w.b]),
    ...model.boundaries.flatMap((b) => [b.a, b.b]),
  ];
  if (pontos.length === 0) return null;

  return {
    minX: Math.min(...pontos.map((p) => p.x)),
    minY: Math.min(...pontos.map((p) => p.y)),
    maxX: Math.max(...pontos.map((p) => p.x)),
    maxY: Math.max(...pontos.map((p) => p.y)),
  };
}

/**
 * Decide se o desenho cabe na escala pedida — e NÃO ajusta se não couber.
 *
 * A folga de meia espessura de parede em cada lado existe porque a caixa
 * envolvente é medida sobre os EIXOS: a parede desenhada avança meia espessura
 * para fora dela, e sem essa folga o traço externo sairia cortado na borda.
 */
export function enquadrar(
  model: BlueprintModel,
  denominador: number,
  papel: Papel,
): Enquadramento {
  const utilLarguraMm = papel.larguraMm - 2 * MARGEM_MM;
  const utilAlturaMm = papel.alturaMm - 2 * MARGEM_MM - CARIMBO_MM;

  const bb = boundingBox(model);
  const folgaMm = Math.max(0, ...model.walls.map((w) => w.thicknessMm)) / 2;

  const larguraRealMm = bb ? bb.maxX - bb.minX + 2 * folgaMm : 0;
  const alturaRealMm = bb ? bb.maxY - bb.minY + 2 * folgaMm : 0;

  const desenhoLarguraMm = larguraRealMm / denominador;
  const desenhoAlturaMm = alturaRealMm / denominador;

  const cabe = desenhoLarguraMm <= utilLarguraMm && desenhoAlturaMm <= utilAlturaMm;

  const escalaSugerida =
    ESCALAS.find(
      (d) => larguraRealMm / d <= utilLarguraMm && alturaRealMm / d <= utilAlturaMm,
    ) ?? null;

  return {
    cabe,
    desenhoLarguraMm,
    desenhoAlturaMm,
    utilLarguraMm,
    utilAlturaMm,
    // Centralizado na área útil. Centralizar não altera a escala — mexe só em
    // onde o desenho começa.
    offsetXMm: MARGEM_MM + Math.max(0, (utilLarguraMm - desenhoLarguraMm) / 2),
    offsetYMm: MARGEM_MM + Math.max(0, (utilAlturaMm - desenhoAlturaMm) / 2),
    escalaSugerida,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Desenhista
// ─────────────────────────────────────────────────────────────────────────────

export interface EstiloTraco {
  espessuraMm: number;
  cor: string;
}

/** Tudo em MILÍMETROS DE PAPEL. Quem converte de mm real é o chamador. */
export interface Desenhista {
  linha(x1: number, y1: number, x2: number, y2: number, estilo: EstiloTraco): void;
  poligono(pontos: { x: number; y: number }[], preenchimento: string): void;
  texto(x: number, y: number, texto: string, alturaMm: number, cor?: string): void;
  retangulo(x: number, y: number, w: number, h: number, estilo: EstiloTraco): void;
}

/** Registra as chamadas em vez de pintar. É como a exportação vira testável. */
export class DesenhistaDeProva implements Desenhista {
  readonly chamadas: {
    tipo: 'linha' | 'poligono' | 'texto' | 'retangulo';
    args: unknown[];
  }[] = [];

  linha(x1: number, y1: number, x2: number, y2: number, estilo: EstiloTraco): void {
    this.chamadas.push({ tipo: 'linha', args: [x1, y1, x2, y2, estilo] });
  }
  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    this.chamadas.push({ tipo: 'poligono', args: [pontos, preenchimento] });
  }
  texto(x: number, y: number, texto: string, alturaMm: number, cor?: string): void {
    this.chamadas.push({ tipo: 'texto', args: [x, y, texto, alturaMm, cor] });
  }
  retangulo(x: number, y: number, w: number, h: number, estilo: EstiloTraco): void {
    this.chamadas.push({ tipo: 'retangulo', args: [x, y, w, h, estilo] });
  }

  textos(): string[] {
    return this.chamadas.filter((c) => c.tipo === 'texto').map((c) => String(c.args[2]));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Desenho
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcoesExportacao {
  denominador: number;
  papel: Papel;
  /** Nome da planta, para o carimbo. */
  titulo: string;
  revisao: number;
  hash: string;
  /** Aviso de finalidade. O PRD o exige; o padrão está em `AVISO_PADRAO`. */
  aviso?: string;
  data?: Date;
}

/**
 * RF-125 exige "aviso de finalidade". Não é formalidade jurídica: uma planta
 * gerada por estudo não passou por projetista responsável, e sair da tela sem
 * dizer isso é o caminho mais curto para virar documento de obra.
 */
export const AVISO_PADRAO =
  'ESTUDO PRELIMINAR — sem responsável técnico. Não substitui projeto executivo ' +
  'nem vale para aprovação legal ou execução.';

const COR_TRACO = '#000000';
const COR_AMBIENTE = '#f2f2f2';
const ESPESSURA_FINA_MM = 0.13;
const ESPESSURA_TEXTO_MM = 2.2;
/** Abaixo disto nenhuma impressora resolve o traço. */
const MIOLO_MINIMO_MM = 0.1;

/**
 * Desenha o modelo no papel, na escala pedida.
 *
 * A parede sai VAZADA (duas passadas: silhueta preta e miolo branco mais fino),
 * que é a convenção de planta baixa e a mesma escolha do renderizador de tela.
 * O miolo avança uma espessura de traço A MENOS que a silhueta — sem isso ele
 * come a borda externa do vizinho no canto, defeito que já apareceu em uso.
 */
export function desenharPlanta(
  d: Desenhista,
  model: BlueprintModel,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  const bb = boundingBox(model);
  const folgaMm = Math.max(0, ...model.walls.map((w) => w.thicknessMm)) / 2;

  /** mm real → mm de papel. É AQUI que a escala acontece, num lugar só. */
  const px = (x: number) => enq.offsetXMm + (x - (bb?.minX ?? 0) + folgaMm) / opcoes.denominador;
  // Y do papel cresce para baixo; o do modelo, para cima.
  const py = (y: number) =>
    enq.offsetYMm + (enq.desenhoAlturaMm - (y - (bb?.minY ?? 0) + folgaMm) / opcoes.denominador);

  // ── Ambientes, primeiro: fundo de tudo ────────────────────────────────────
  for (const s of model.spaces) {
    d.poligono(
      s.ring.map((p) => ({ x: px(p.x), y: py(p.y) })),
      COR_AMBIENTE,
    );
  }

  // ── Paredes, vazadas ──────────────────────────────────────────────────────
  const espessuraPapel = (w: Wall) => w.thicknessMm / opcoes.denominador;

  for (const w of model.walls) {
    d.linha(px(w.a.x), py(w.a.y), px(w.b.x), py(w.b.y), {
      espessuraMm: espessuraPapel(w),
      cor: COR_TRACO,
    });
  }
  for (const w of model.walls) {
    const miolo = espessuraPapel(w) - 2 * ESPESSURA_FINA_MM;
    // Abaixo do mínimo imprimível a passada branca não vira nada no papel — ou
    // pior, vira artefato. Parede fina demais para a escala sai SÓLIDA, que é a
    // convenção quando o corte é pequeno demais para mostrar espessura.
    if (miolo < MIOLO_MINIMO_MM) continue;
    d.linha(px(w.a.x), py(w.a.y), px(w.b.x), py(w.b.y), {
      espessuraMm: miolo,
      cor: '#ffffff',
    });
  }

  // ── Limites sem material: tracejado seria melhor, fino resolve por ora ────
  for (const b of model.boundaries) {
    d.linha(px(b.a.x), py(b.a.y), px(b.b.x), py(b.b.y), {
      espessuraMm: ESPESSURA_FINA_MM,
      cor: '#888888',
    });
  }

  // ── Nome e área do ambiente ───────────────────────────────────────────────
  for (const s of model.spaces) {
    const cx = s.ring.reduce((soma, p) => soma + p.x, 0) / s.ring.length;
    const cy = s.ring.reduce((soma, p) => soma + p.y, 0) / s.ring.length;
    const area = (s.areaMm2 / 1_000_000).toFixed(2).replace('.', ',');

    if (s.name) d.texto(px(cx), py(cy), s.name, ESPESSURA_TEXTO_MM);
    d.texto(px(cx), py(cy) + ESPESSURA_TEXTO_MM, `${area} m²`, ESPESSURA_TEXTO_MM * 0.8);
  }

  desenharCarimbo(d, opcoes, enq);
}

/** Legenda, escala, versão e aviso — a faixa inferior da folha. */
function desenharCarimbo(d: Desenhista, o: OpcoesExportacao, enq: Enquadramento): void {
  const topo = MARGEM_MM + enq.utilAlturaMm;
  const largura = enq.utilLarguraMm;

  d.retangulo(MARGEM_MM, topo, largura, CARIMBO_MM, {
    espessuraMm: 0.25,
    cor: COR_TRACO,
  });

  const data = (o.data ?? new Date()).toLocaleDateString('pt-BR');

  d.texto(MARGEM_MM + 3, topo + 6, o.titulo, 3.2);
  d.texto(
    MARGEM_MM + 3,
    topo + 11,
    `Escala 1:${o.denominador}  ·  ${o.papel.id}  ·  Versão ${o.revisao}  ·  ${data}`,
    2.4,
  );
  // O hash é o que liga o papel à versão publicada. Sem ele, duas impressões
  // parecidas são indistinguíveis, e é sempre a errada que vai para a obra.
  d.texto(MARGEM_MM + 3, topo + 15.5, `Hash ${o.hash.slice(0, 16)}`, 2.0, '#555555');
  d.texto(MARGEM_MM + 3, topo + 21, o.aviso ?? AVISO_PADRAO, 2.2, '#000000');

  desenharEscalaGrafica(d, o, MARGEM_MM + largura - 45, topo + 20);
}

/**
 * Escala GRÁFICA, além da numérica.
 *
 * Não é redundância: fotocópia e "ajustar à página" na impressora mudam o
 * tamanho do papel e a escala numérica passa a mentir. A barra encolhe junto com
 * o desenho e continua verdadeira — por isso desenho técnico traz as duas.
 */
function desenharEscalaGrafica(
  d: Desenhista,
  o: OpcoesExportacao,
  x: number,
  y: number,
): void {
  // Um metro real, na escala, em mm de papel.
  const metroMm = 1000 / o.denominador;
  const metros = metroMm >= 8 ? 4 : 10;
  const passo = metroMm >= 8 ? 1 : 5;

  for (let i = 0; i < metros; i += passo) {
    d.retangulo(x + i * metroMm, y, passo * metroMm, 1.5, {
      espessuraMm: 0.2,
      cor: i % (passo * 2) === 0 ? '#000000' : '#ffffff',
    });
  }
  d.texto(x, y + 4.5, `0`, 1.8);
  d.texto(x + metros * metroMm - 4, y + 4.5, `${metros} m`, 1.8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifesto
// ─────────────────────────────────────────────────────────────────────────────

export interface ManifestoExportacao {
  planta: string;
  revisao: number;
  hash: string;
  kernel: string;
  escala: string;
  papel: string;
  exportadoEm: string;
  aviso: string;
  ambientes: number;
  paredes: number;
  aberturas: number;
}

/**
 * Manifesto que acompanha a exportação.
 *
 * O PDF é para humano; o manifesto é para conferência. Ele responde "de qual
 * versão saiu esta folha?" sem depender de alguém ter lido o carimbo — e é o que
 * permite reencontrar o snapshot no banco a partir de um arquivo solto.
 */
export function manifesto(
  model: BlueprintModel,
  o: OpcoesExportacao,
  kernelVersion: string,
): ManifestoExportacao {
  return {
    planta: o.titulo,
    revisao: o.revisao,
    hash: o.hash,
    kernel: kernelVersion,
    escala: `1:${o.denominador}`,
    papel: `${o.papel.id} ${o.papel.larguraMm}×${o.papel.alturaMm} mm`,
    exportadoEm: (o.data ?? new Date()).toISOString(),
    aviso: o.aviso ?? AVISO_PADRAO,
    ambientes: model.spaces.length,
    paredes: model.walls.length,
    aberturas: model.openings.length,
  };
}

/** Nome de arquivo previsível: ordena por planta e versão em qualquer pasta. */
export function nomeArquivo(o: OpcoesExportacao, extensao: string): string {
  const limpo = o.titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

  return `${limpo || 'planta'}-v${o.revisao}-1_${o.denominador}.${extensao}`;
}

/** Metros lineares de parede — usado na conferência rápida do carimbo. */
export function totalParedesM(model: BlueprintModel): number {
  return model.walls.reduce((s, w) => s + wallLength(w), 0) / 1000;
}
