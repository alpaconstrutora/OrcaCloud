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
import { contornoEmPlanta, extensaoDeCanto, isFreeWallEnd, wallLength } from './blueprintKernel';
import type { ProjecaoElevacao } from './blueprintElevation';
import {
  AFASTAMENTO_COTA,
  AVISO_COTA_POR_FACE,
  cadeiasDoModelo,
  pontoDaCota,
  type SegmentoDeCota,
} from './blueprintCotas';

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

/**
 * Denominadores usuais em arquitetura.
 *
 * As quatro primeiras são de DETALHE e ampliação, não de planta baixa. Elas
 * faltavam, e o comentário que as excluía ("planta não se imprime 1:1") julgava
 * só o caso da planta inteira — mas o que se exporta nem sempre é a planta
 * inteira. Um trecho publicado sozinho não cabia em escala nenhuma da lista:
 * 1:20 já era a maior, e mesmo nela o desenho saía com 3% da folha. Quem
 * exportava recebia uma folha quase branca e nenhuma saída.
 *
 * Ampliar a lista foi preferido a permitir escala livre: escala tem de ser um
 * número que se lê no escalímetro. 1:37,4 preenche a folha e não se mede.
 */
export const ESCALAS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500];

/** A partir daqui é planta; abaixo é detalhe ou ampliação. Só para rotular. */
export const MENOR_ESCALA_DE_PLANTA = 20;

export function orientar(papel: Papel, paisagem: boolean): Papel {
  return paisagem
    ? { ...papel, larguraMm: papel.alturaMm, alturaMm: papel.larguraMm }
    : papel;
}

export const MARGEM_MM = 12;
/** Faixa inferior do carimbo: legenda, versão, escala e aviso. */
export const CARIMBO_MM = 26;
/** Faixa reservada para a cadeia de cotas, em milímetro de PAPEL. */
export const FAIXA_COTA_MM = 14;

export interface Enquadramento {
  cabe: boolean;
  /** Não há geometria publicada — a folha sairia só com o carimbo. */
  vazio: boolean;
  /**
   * Fração da área útil que o desenho ocupa, na dimensão mais apertada. `1` é
   * um desenho que preenche a folha; `0,02` é um risco no meio do branco.
   */
  ocupacao: number;
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
  comCotas = false,
): Enquadramento {
  // A faixa de cota é fixa em MILÍMETRO DE PAPEL, não em escala: texto de cota
  // tem o mesmo tamanho em 1:50 e em 1:200. Por isso ela ENCOLHE a área útil,
  // em vez de crescer junto com o desenho.
  const faixa = comCotas ? FAIXA_COTA_MM : 0;

  const utilLarguraMm = papel.larguraMm - 2 * MARGEM_MM - faixa;
  const utilAlturaMm = papel.alturaMm - 2 * MARGEM_MM - CARIMBO_MM - faixa;

  const bb = boundingBox(model);
  const folgaMm = Math.max(0, ...model.walls.map((w) => w.thicknessMm)) / 2;

  const larguraRealMm = bb ? bb.maxX - bb.minX + 2 * folgaMm : 0;
  const alturaRealMm = bb ? bb.maxY - bb.minY + 2 * folgaMm : 0;

  const desenhoLarguraMm = larguraRealMm / denominador;
  const desenhoAlturaMm = alturaRealMm / denominador;

  const cabe = desenhoLarguraMm <= utilLarguraMm && desenhoAlturaMm <= utilAlturaMm;

  // A lista está em ordem crescente de denominador, então a PRIMEIRA que cabe é
  // a que produz o MAIOR desenho possível. Serve para as duas direções: sugerir
  // quando não cabe, e sugerir quando sobra folha demais.
  const escalaSugerida =
    ESCALAS.find(
      (d) => larguraRealMm / d <= utilLarguraMm && alturaRealMm / d <= utilAlturaMm,
    ) ?? null;

  return {
    cabe,
    // Sem geometria publicada não há desenho nenhum, e "ocupa 0% da folha"
    // mandaria a pessoa mexer na escala para resolver um problema que não é de
    // escala. São dois avisos diferentes.
    vazio: bb === null,
    // Quanto da área útil o desenho usa, na dimensão mais apertada das duas.
    //
    // Existe porque o painel só sabia reclamar numa direção. Desenho grande
    // demais recebia aviso e sugestão; desenho pequeno demais saía numa folha
    // quase branca, calado — e quem exporta não tem como adivinhar que bastava
    // trocar 1:100 por 1:20.
    ocupacao:
      utilLarguraMm > 0 && utilAlturaMm > 0
        ? Math.max(desenhoLarguraMm / utilLarguraMm, desenhoAlturaMm / utilAlturaMm)
        : 0,
    desenhoLarguraMm,
    desenhoAlturaMm,
    utilLarguraMm,
    utilAlturaMm,
    // Centralizado na área útil. Centralizar não altera a escala — mexe só em
    // onde o desenho começa.
    // A cadeia vertical fica à ESQUERDA e a horizontal ABAIXO, então o desenho
    // desloca para a direita e a faixa de baixo sai do espaço já descontado.
    offsetXMm: MARGEM_MM + faixa + Math.max(0, (utilLarguraMm - desenhoLarguraMm) / 2),
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
  /** Cadeias de cota externas. O enquadramento precisa saber ANTES: elas
   *  consomem uma faixa fixa de papel. */
  cotas?: boolean;
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
  //
  // O DETALHE QUE FAZ O CANTO FUNCIONAR: estender a pincelada além do eixo na
  // ponta que encontra outra parede.
  //
  // Com corte reto terminando no eixo, o traço de cada parede cobre uma faixa
  // centrada no próprio eixo — e no canto externo sobra um vazio que nenhuma
  // das duas cobre. É o degrau que apareceu na primeira exportação.
  //
  // QUANTO estender depende do ÂNGULO do canto, e a conta vive no kernel
  // (`extensaoDeCanto`). Aqui havia uma cópia dela — meia espessura sempre —
  // igual à que estava no canvas: certa em 90°, errada em qualquer outro
  // ângulo. Regra de geometria copiada é regra que diverge, e esta divergia
  // dos dois lados ao mesmo tempo.
  const tracos = model.walls.map((w) => {
    const ax = px(w.a.x);
    const ay = py(w.a.y);
    const bx = px(w.b.x);
    const by = py(w.b.y);
    const comp = Math.hypot(bx - ax, by - ay);
    const ux = comp > 0 ? (bx - ax) / comp : 0;
    const uy = comp > 0 ? (by - ay) / comp : 0;
    const cheia = w.thicknessMm / opcoes.denominador;
    // Em MILÍMETRO DE MODELO no kernel, em milímetro de PAPEL aqui — mesma
    // divisão pelo denominador da escala que a espessura já sofre.
    const extA = extensaoDeCanto(model.walls, w, 'a') / opcoes.denominador;
    const extB = extensaoDeCanto(model.walls, w, 'b') / opcoes.denominador;

    return { cheia, ax, ay, bx, by, ux, uy, comp, extA, extB };
  });

  // Passada 1 — silhueta, já estendida.
  for (const t of tracos) {
    d.linha(
      t.ax - t.ux * t.extA,
      t.ay - t.uy * t.extA,
      t.bx + t.ux * t.extB,
      t.by + t.uy * t.extB,
      { espessuraMm: t.cheia, cor: COR_TRACO },
    );
  }

  // Passada 2 — escavar o miolo.
  for (const t of tracos) {
    const miolo = t.cheia - 2 * ESPESSURA_FINA_MM;
    // Abaixo do mínimo imprimível a passada branca não vira nada no papel — ou
    // pior, vira artefato. Parede fina demais para a escala sai SÓLIDA, que é a
    // convenção quando o corte é pequeno demais para mostrar espessura.
    if (miolo < MIOLO_MINIMO_MM) continue;

    // O MIOLO AVANÇA UMA ESPESSURA DE TRAÇO A MENOS QUE A SILHUETA.
    //
    // É daqui que vinha o canto aberto, e a silhueta estava certa o tempo todo.
    // Estendendo o branco tanto quanto o preto, a escavação de uma parede
    // alcança a borda EXTERNA da outra e apaga a linha dela — o canto fica com
    // um pedaço de contorno faltando.
    //
    // A mesma conta serve para a ponta LIVRE, onde `ext` é 0: o resultado fica
    // negativo, o branco RECUA e sobra borda fechando a extremidade.
    const recA = t.extA - ESPESSURA_FINA_MM;
    const recB = t.extB - ESPESSURA_FINA_MM;
    if (t.comp + recA + recB <= 0) continue;

    d.linha(
      t.ax - t.ux * recA,
      t.ay - t.uy * recA,
      t.bx + t.ux * recB,
      t.by + t.uy * recB,
      { espessuraMm: miolo, cor: '#ffffff' },
    );
  }

  // ── Estrutura: contorno da peça, por cima da alvenaria ────────────────────
  //
  // Só o CONTORNO, sem preencher. No papel a parede já é um traço grosso, e um
  // pilar preenchido de preto dentro dela viraria uma mancha em que não se
  // distingue mais o que é vedação do que é concreto. O rótulo ao lado é que
  // carrega a informação.
  //
  // A peça de fundação sai FINA, porque está abaixo do plano de corte — é a
  // aproximação possível do tracejado que o `Desenhista` não oferece.
  for (const s of model.structures ?? []) {
    const anel = contornoEmPlanta(s).map((p) => ({ x: px(p.x), y: py(p.y) }));
    if (anel.length === 0) continue;
    const espessura = s.baseMm < 0 ? ESPESSURA_FINA_MM : ESPESSURA_FINA_MM * 2;
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      d.linha(a.x, a.y, b.x, b.y, { espessuraMm: espessura, cor: COR_TRACO });
    }
    if (s.rotulo) {
      const cx = anel.reduce((t, p) => t + p.x, 0) / anel.length;
      const cy = anel.reduce((t, p) => t + p.y, 0) / anel.length;
      d.texto(cx, cy, s.rotulo, ESPESSURA_TEXTO_MM * 0.8);
    }
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

  if (opcoes.cotas) desenharCotas(d, model, opcoes, enq, px, py);

  desenharCarimbo(d, opcoes, enq);
}

// ─────────────────────────────────────────────────────────────────────────────
// Elevações — a MESMA interface `Desenhista`, o mesmo carimbo, papel próprio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enquadra UMA elevação. A caixa vem de `projecao.bbox`, já em (u, v) mm reais —
 * a projeção é função pura do kernel (`utils/blueprintElevation.ts`), então o
 * enquadramento aqui não recalcula geometria nenhuma.
 */
export function enquadrarElevacao(
  projecao: ProjecaoElevacao,
  denominador: number,
  papel: Papel,
): Enquadramento {
  const utilLarguraMm = papel.larguraMm - 2 * MARGEM_MM;
  const utilAlturaMm = papel.alturaMm - 2 * MARGEM_MM - CARIMBO_MM;

  const vazio = projecao.paredes.every((p) => p.degenerada);
  const larguraRealMm = projecao.bbox.uMax - projecao.bbox.uMin;
  const alturaRealMm = projecao.bbox.vMax - projecao.bbox.vMin;

  const desenhoLarguraMm = larguraRealMm / denominador;
  const desenhoAlturaMm = alturaRealMm / denominador;
  const cabe =
    !vazio && desenhoLarguraMm <= utilLarguraMm && desenhoAlturaMm <= utilAlturaMm;

  const escalaSugerida =
    ESCALAS.find(
      (d) => larguraRealMm / d <= utilLarguraMm && alturaRealMm / d <= utilAlturaMm,
    ) ?? null;

  return {
    cabe,
    vazio,
    ocupacao:
      utilLarguraMm > 0 && utilAlturaMm > 0
        ? Math.max(desenhoLarguraMm / utilLarguraMm, desenhoAlturaMm / utilAlturaMm)
        : 0,
    desenhoLarguraMm,
    desenhoAlturaMm,
    utilLarguraMm,
    utilAlturaMm,
    offsetXMm: MARGEM_MM + Math.max(0, (utilLarguraMm - desenhoLarguraMm) / 2),
    offsetYMm: MARGEM_MM + Math.max(0, (utilAlturaMm - desenhoAlturaMm) / 2),
    escalaSugerida,
  };
}

const COR_ELEV_PAREDE = '#e8e8e8';
/** Concreto: mais escuro que a alvenaria, a hierarquia de sempre. */
const COR_ELEV_ESTRUTURA = '#b8b8b8';
/** Fundação: mais clara que o concreto aparente, porque está enterrada. */
const COR_ELEV_FUNDACAO = '#d8d0c4';

/**
 * Desenha uma elevação no papel: linha do solo e tudo o mais numa passada só,
 * do fundo para a frente (painter's algorithm, a MESMA ordenação do renderer de
 * tela).
 *
 * Não é remoção de linha oculta de verdade — ninguém recorta aresta contra
 * superfície. É o algoritmo do pintor feito direito: como tudo aqui é opaco,
 * ordenar uma vez e pintar em ordem dá o mesmo resultado visível. O que fica de
 * fora é o caso que exige recorte — peça que atravessa PARCIALMENTE outra.
 */
export function desenharElevacao(
  d: Desenhista,
  projecao: ProjecaoElevacao,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  const bb = projecao.bbox;
  const px = (u: number) => enq.offsetXMm + (u - bb.uMin) / opcoes.denominador;
  // v (cota) cresce para cima; o papel, para baixo.
  const py = (v: number) =>
    enq.offsetYMm + (enq.desenhoAlturaMm - (v - bb.vMin) / opcoes.denominador);

  // Linha do solo.
  d.linha(px(bb.uMin), py(projecao.linhaDoSolo.v), px(bb.uMax), py(projecao.linhaDoSolo.v), {
    espessuraMm: 0.3,
    cor: COR_TRACO,
  });

  // UMA PASSADA SÓ, DO FUNDO PARA A FRENTE — a mesma ordenação da tela, e pela
  // mesma razão. Três passes independentes (paredes, estruturas, vãos) faziam
  // cada um reordenar a profundidade do zero, então o que era pintado depois
  // cobria o que estava na frente: o vão da parede do FUNDO furava a parede da
  // frente, e a viga de trás aparecia por cima dela. O papel repetia o defeito
  // da tela.
  //
  // A ABERTURA VAI COLADA NA PAREDE QUE A HOSPEDA, e não como item próprio: ela
  // é um furo NAQUELA parede, não um objeto solto no espaço. Solta na ordenação,
  // um empate de profundidade poderia pô-la antes da própria parede — e o furo
  // sumiria sob o preenchimento dela.
  const itens: { profundidade: number; pintar: () => void }[] = [];
  const caixa = (uMin: number, uMax: number, vMin: number, vMax: number) => ({
    x: px(uMin),
    y: py(vMax),
    w: (uMax - uMin) / opcoes.denominador,
    h: (vMax - vMin) / opcoes.denominador,
  });
  const preencher = (c: { x: number; y: number; w: number; h: number }, cor: string) =>
    d.poligono(
      [
        { x: c.x, y: c.y },
        { x: c.x + c.w, y: c.y },
        { x: c.x + c.w, y: c.y + c.h },
        { x: c.x, y: c.y + c.h },
      ],
      cor,
    );

  for (const p of projecao.paredes) {
    if (p.degenerada) continue;
    const vaos = projecao.aberturas.filter((a) => a.wallId === p.wallId);
    itens.push({
      profundidade: p.profundidade,
      pintar: () => {
        const c = caixa(p.uMin, p.uMax, p.vMin, p.vMax);
        preencher(c, COR_ELEV_PAREDE);
        d.retangulo(c.x, c.y, c.w, c.h, {
          espessuraMm: p.ehContorno ? 0.35 : ESPESSURA_FINA_MM,
          cor: COR_TRACO,
        });
        for (const a of vaos) {
          const v = caixa(a.uMin, a.uMax, a.vMin, a.vMax);
          d.retangulo(v.x, v.y, v.w, v.h, { espessuraMm: 0, cor: '#ffffff' });
          d.retangulo(v.x, v.y, v.w, v.h, { espessuraMm: ESPESSURA_FINA_MM, cor: COR_TRACO });
        }
      },
    });
  }

  for (const e of projecao.estruturas) {
    if (e.degenerada) continue;
    itens.push({
      profundidade: e.profundidade,
      pintar: () => {
        const c = caixa(e.uMin, e.uMax, e.vMin, e.vMax);
        preencher(c, e.enterrada ? COR_ELEV_FUNDACAO : COR_ELEV_ESTRUTURA);
        d.retangulo(c.x, c.y, c.w, c.h, { espessuraMm: ESPESSURA_FINA_MM, cor: COR_TRACO });
      },
    });
  }

  // Fundo primeiro: `profundidade` é `dot(centro, direçãoDeVisão)`, então MAIOR
  // = mais longe de quem olha.
  itens.sort((a, b) => b.profundidade - a.profundidade);
  for (const i of itens) i.pintar();

  desenharCarimbo(d, opcoes, enq);
}

const COR_COTA = '#333333';
const TEXTO_COTA_MM = 2.0;

/**
 * Cadeias de cota externas, uma por direção, mais a cota total por fora.
 *
 * O TRAÇO DE COTA É FINO E CINZA de propósito: ele não pode competir com a
 * parede. Numa planta em que a cota tem o mesmo peso do corte, o olho perde a
 * geometria — e é a geometria que se lê primeiro.
 */
function desenharCotas(
  d: Desenhista,
  model: BlueprintModel,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  const fino = { espessuraMm: 0.1, cor: COR_COTA };

  // Distâncias em MILÍMETRO DE PAPEL: a cota tem o mesmo tamanho em qualquer
  // escala, senão em 1:200 ela vira um risco e em 1:25 domina a folha.
  const PASSO = 5;
  const FOLGA = 4;
  const TIQUE = 1.2;

  for (const c of cadeiasDoModelo(model)) {
    // A DIREÇÃO PARA FORA, deduzida no espaço do PAPEL.
    //
    // O papel pode inverter o Y em relação ao modelo, então a normal do kernel
    // não serve direto aqui. Deduzi-la mapeando dois pontos — um no eixo do
    // lado, outro já afastado — funciona qualquer que seja a convenção do
    // enquadramento, e não duplica a regra de "que lado é fora".
    const base = pontoDaCota(c.lado, 0, 0);
    const fora = pontoDaCota(c.lado, 0, 1000);
    const bx = px(base.x);
    const by = py(base.y);
    const fx = px(fora.x) - bx;
    const fy = py(fora.y) - by;
    const norma = Math.hypot(fx, fy) || 1;
    const nx = fx / norma;
    const ny = fy / norma;

    const desenhar = (
      segmentos: { de: number; ate: number; rotulo: string; vao?: boolean }[],
      nivel: number,
    ) => {
      const afasta = FOLGA + PASSO * nivel;
      for (const seg of segmentos) {
        const pa = pontoDaCota(c.lado, seg.de, 0);
        const pb = pontoDaCota(c.lado, seg.ate, 0);
        const x1 = px(pa.x) + nx * afasta;
        const y1 = py(pa.y) + ny * afasta;
        const x2 = px(pb.x) + nx * afasta;
        const y2 = py(pb.y) + ny * afasta;

        d.linha(x1, y1, x2, y2, fino);

        // Tique a 45° — a marca de fim de cota do desenho de arquitetura.
        for (const [tx, ty] of [[x1, y1], [x2, y2]]) {
          d.linha(tx - TIQUE / 2, ty + TIQUE / 2, tx + TIQUE / 2, ty - TIQUE / 2, fino);
        }

        // Texto centrado e deitado: o `Desenhista` não gira texto, e número
        // deitado continua legível. Fica ao LADO da linha, deslocado pela
        // normal, para não montar em cima dela.
        const mx = (x1 + x2) / 2 + nx * 2;
        const my = (y1 + y2) / 2 + ny * 2;
        d.texto(mx - seg.rotulo.length * 0.55, my, seg.rotulo, TEXTO_COTA_MM, COR_COTA);
      }
    };

    desenhar(c.aberturas, AFASTAMENTO_COTA.aberturas - 1);
    desenhar(c.internas, AFASTAMENTO_COTA.internas - 1);
    desenhar(c.parcial, AFASTAMENTO_COTA.parcial - 1);
    desenhar([c.total], AFASTAMENTO_COTA.total - 1);

    // Linhas de chamada, ligando o desenho à cota mais externa.
    const limite = FOLGA + PASSO * (AFASTAMENTO_COTA.total - 1);
    const quebras = new Set<number>([c.total.de, c.total.ate, ...c.parcial.flatMap((s: SegmentoDeCota) => [s.de, s.ate])]);
    for (const t of quebras) {
      const p = pontoDaCota(c.lado, t, 0);
      const qx = px(p.x);
      const qy = py(p.y);
      d.linha(qx, qy, qx + nx * limite, qy + ny * limite, {
        espessuraMm: 0.08,
        cor: '#999999',
      });
    }
  }
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
  d.texto(MARGEM_MM + 3, topo + 20, o.aviso ?? AVISO_PADRAO, 2.2, '#000000');
  // COTA SEM DIZER DE ONDE É MEDIDA ENGANA. Quem mede a face vai achar meia
  // espessura a menos de cada lado, e vai achar que o desenho está errado.
  if (o.cotas) d.texto(MARGEM_MM + 3, topo + 23.5, AVISO_COTA_POR_FACE, 1.9, '#555555');

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
