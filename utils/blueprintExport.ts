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

import type { Anotacao, BlueprintModel, Point, Wall } from './blueprintKernel';
import { contornoDaNuvem, cotaAngularDesenhada, dataDaRevisaoBr, linhasDaHachura, pontaDaSeta, posicaoDaEtiquetaDaNuvem, revisoesDasAnotacoes, revisoesDoModelo, COR_PADRAO_DA_ANOTACAO, type RevisaoDaPrancha } from './blueprintAnotacoes';
import { contornoEmPlanta, extensaoDeCanto, isFreeWallEnd, wallLength } from './blueprintKernel';
import { copa, COR_SOMBRA_OPACA, COR_VEGETACAO, pisosHumanizados, simboloNoMundo, sombraDaParede, tramaDoPiso, vegetacaoSimbolica } from './blueprintHumanizada';
import type { ProjecaoElevacao } from './blueprintElevation';
import type { ProjecaoCorte } from './blueprintCorte';
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
  recorte?: { minX: number; minY: number; maxX: number; maxY: number },
): Enquadramento {
  // A faixa de cota é fixa em MILÍMETRO DE PAPEL, não em escala: texto de cota
  // tem o mesmo tamanho em 1:50 e em 1:200. Por isso ela ENCOLHE a área útil,
  // em vez de crescer junto com o desenho.
  const faixa = comCotas ? FAIXA_COTA_MM : 0;

  const utilLarguraMm = papel.larguraMm - 2 * MARGEM_MM - faixa;
  const utilAlturaMm = papel.alturaMm - 2 * MARGEM_MM - CARIMBO_MM - faixa;

  const bb = recorte ?? boundingBox(model);
  // No recorte a folga já está no retângulo pedido.
  const folgaMm = recorte ? 0 : Math.max(0, ...model.walls.map((w) => w.thicknessMm)) / 2;

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
  /** RECORTE (E8.3): tudo desenhado entre os dois fica dentro do retângulo (mm de papel). Opcional: quem não implementa desenha sem recortar. */
  recortar?(x: number, y: number, w: number, h: number): void;
  fimDoRecorte?(): void;
}

/** Registra as chamadas em vez de pintar. É como a exportação vira testável. */
export class DesenhistaDeProva implements Desenhista {
  readonly chamadas: {
    tipo: 'linha' | 'poligono' | 'texto' | 'retangulo' | 'recortar' | 'fimDoRecorte';
    args: unknown[];
  }[] = [];

  recortar(x: number, y: number, w: number, h: number): void {
    this.chamadas.push({ tipo: 'recortar', args: [x, y, w, h] });
  }
  fimDoRecorte(): void {
    this.chamadas.push({ tipo: 'fimDoRecorte', args: [] });
  }

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

/** O aviso da planta HUMANIZADA (E8.4): é material de venda, não documento técnico. */
export const AVISO_HUMANIZADA = 'PLANTA HUMANIZADA — ilustrativa. Mobiliário, acabamentos e vegetação são sugestão; medidas aproximadas. Não vale para execução nem para aprovação legal.';

export interface OpcoesExportacao {
  /**
   * PRANCHAS (E8.3): recorte do modelo em mm (a AMPLIAÇÃO) — a planta desenha
   * só este retângulo, a escala maior, e recorta o que passar da borda.
   */
  recorte?: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * PLANTA HUMANIZADA (E8.4): pisos com cor e trama do material, sombra das
   * paredes, paredes cheias, mobiliário colorido por família e vegetação
   * simbólica. É a planta de VENDA: quem a pede também tira as cotas e troca o
   * aviso (`AVISO_HUMANIZADA`).
   */
  humanizada?: boolean;
  /** PRANCHAS (E8.3): carimbo da organização e a numeração da folha no conjunto. */
  carimboDaOrg?: { empresa: string; responsavel: string; registro: string; cliente: string; endereco: string; camposExtras: { rotulo: string; valor: string }[] };
  prancha?: { numero: string; total: number; titulo: string };
  /**
   * ANOTAÇÕES (E8.1) do modelo, para as folhas que não recebem o modelo
   * (elevação e corte). A planta lê do próprio modelo.
   */
  anotacoes?: Anotacao[];
  denominador: number;
  papel: Papel;
  /** Nome da planta, para o carimbo. */
  titulo: string;
  revisao: number;
  hash: string;
  /**
   * Id do estudo. O IFC o usa para dar GUID estável a projeto/terreno/edifício
   * entre revisões e para a procedência em `Pset_OpuraPlanta`. As demais
   * saídas o ignoram.
   */
  studyId?: string;
  /**
   * Carimbo de aprovação da revisão, quando ela tem um.
   *
   * Só o IFC o usa hoje. Ausente = o arquivo NÃO fala de aprovação: emitir
   * "não aprovado" afirmaria que alguém olhou e recusou.
   */
  aprovacao?: { status: string; aprovadoPor: string | null; aprovadoEm: string | null };
  /** Aviso de finalidade. O PRD o exige; o padrão está em `AVISO_PADRAO`. */
  aviso?: string;
  /** Cadeias de cota externas. O enquadramento precisa saber ANTES: elas
   *  consomem uma faixa fixa de papel. */
  cotas?: boolean;
  data?: Date;
  /**
   * Custo por `uid` — só o IFC usa, e só quando quem exporta pede.
   *
   * ⚠️ Ausente é o PADRÃO, e é o padrão certo: um IFC sai da empresa, e embutir
   * custo nele é embutir preço de venda num anexo de e-mail. Ver `custoPorUid`
   * em `blueprintIfc.ts`.
   */
  custoPorUid?: ReadonlyMap<string, number>;
  /**
   * Hipóteses da ARMADURA esquemática do estudo (16/09/2026). Só a planilha
   * de quantitativos as usa (aba "Armadura"). Ausente = as hipóteses padrão —
   * o kg sai igual, com fck 25, CAA II e as taxas de referência de fábrica.
   */
  armadura?: import('./blueprintArmadura').HipotesesDeArmadura;
  /**
   * PRANCHA ELÉTRICA (F8, 13/09/2026): desenha os símbolos elétricos por cima
   * da planta e, na página seguinte, legenda + quadro de cargas. Ausente =
   * planta arquitetônica, como sempre foi.
   */
  eletrica?: boolean;
  /** Hipóteses do pré-dimensionamento, para o quadro de cargas da prancha. */
  hipotesesEletricas?: HipotesesEletricas;
  /**
   * As definições de parâmetro COM FÓRMULA da organização (E1.5). Com elas, o
   * IFC e a planilha levam também os valores calculados — a ficha completa da
   * peça, não só o que foi digitado. Ausente = só os gravados.
   */
  definicoesDeParametro?: readonly { chave: string; formula: string; familia: import('./blueprintKernel').FamiliaComParametros | null }[];
}

/**
 * RF-125 exige "aviso de finalidade". Não é formalidade jurídica: uma planta
 * gerada por estudo não passou por projetista responsável, e sair da tela sem
 * dizer isso é o caminho mais curto para virar documento de obra.
 */
export const AVISO_PADRAO =
  'ESTUDO PRELIMINAR — sem responsável técnico. Não substitui projeto executivo ' +
  'nem vale para aprovação legal ou execução.';

import { desenharEletrica, desenharQuadroDeCargas } from './blueprintPranchaEletrica';
import { desenharUnifilar, medidasDoUnifilar, montarUnifilar, rodapeDoUnifilar } from './blueprintUnifilar';
import type { HipotesesEletricas } from './blueprintEletricaDimensionamento';

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
  const bb = opcoes.recorte ?? boundingBox(model);
  const folgaMm = opcoes.recorte ? 0 : Math.max(0, ...model.walls.map((w) => w.thicknessMm)) / 2;
  // AMPLIAÇÃO (E8.3): o que passar do retângulo é recortado no papel.
  if (opcoes.recorte && bb) {
    d.recortar?.(enq.offsetXMm, enq.offsetYMm, (bb.maxX - bb.minX) / opcoes.denominador, (bb.maxY - bb.minY) / opcoes.denominador);
  }

  /** mm real → mm de papel. É AQUI que a escala acontece, num lugar só. */
  const px = (x: number) => enq.offsetXMm + (x - (bb?.minX ?? 0) + folgaMm) / opcoes.denominador;
  // Y do papel cresce para baixo; o do modelo, para cima.
  const py = (y: number) =>
    enq.offsetYMm + (enq.desenhoAlturaMm - (y - (bb?.minY ?? 0) + folgaMm) / opcoes.denominador);

  // ── Ambientes, primeiro: fundo de tudo ────────────────────────────────────
  // HUMANIZADA (E8.4): a cor do piso e a trama (já recortada pelo ambiente, em mm).
  const pisos = opcoes.humanizada ? pisosHumanizados(model) : undefined;
  for (const s of model.spaces) {
    const piso = pisos?.get(s.id);
    d.poligono(
      s.ring.map((p) => ({ x: px(p.x), y: py(p.y) })),
      piso?.cor ?? COR_AMBIENTE,
    );
    if (piso && piso.moduloMm > 0) {
      for (const seg of tramaDoPiso(s, piso)) d.linha(px(seg.a.x), py(seg.a.y), px(seg.b.x), py(seg.b.y), { espessuraMm: 0.1, cor: piso.corDoTraco });
    }
  }

  // HUMANIZADA: a sombra das paredes, sob as paredes e sobre os pisos. Opaca, porque o papel não compõe alfa.
  if (opcoes.humanizada) {
    for (const w of model.walls) {
      const anel = sombraDaParede(model.walls, w);
      if (anel.length === 4) d.poligono(anel.map((p) => ({ x: px(p.x), y: py(p.y) })), COR_SOMBRA_OPACA);
    }
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

  // Passada 2 — escavar o miolo. Na HUMANIZADA a parede sai CHEIA (não se escava).
  for (const t of opcoes.humanizada ? [] : tracos) {
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

  // ── Aberturas (E8.4): o vão aberto, os batentes e o símbolo — porta com folha e arco, janela no eixo, correr recolhida ──
  desenharAberturas(d, model, px, py, opcoes.denominador);

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

  // ── HUMANIZADA (E8.4): mobiliário por família e vegetação simbólica ──────
  if (opcoes.humanizada) {
    for (const c of model.componentes ?? []) {
      const { contorno, tracos: linhas, cores } = simboloNoMundo(c);
      d.poligono(contorno.map((p) => ({ x: px(p.x), y: py(p.y) })), cores.fundo);
      const fechado = [...contorno, contorno[0]];
      for (let i = 0; i + 1 < fechado.length; i++) d.linha(px(fechado[i].x), py(fechado[i].y), px(fechado[i + 1].x), py(fechado[i + 1].y), { espessuraMm: ESPESSURA_FINA_MM, cor: cores.traco });
      for (const poli of linhas) for (let i = 0; i + 1 < poli.length; i++) d.linha(px(poli[i].x), py(poli[i].y), px(poli[i + 1].x), py(poli[i + 1].y), { espessuraMm: 0.12, cor: cores.traco });
    }
    // Uma vegetação por pavimento: a planta exportada pode ter mais de um (a prancha por pavimento recorta antes).
    for (const nivel of model.levels) {
      for (const v of vegetacaoSimbolica(model, nivel.id)) {
        const anel = copa(v).map((p) => ({ x: px(p.x), y: py(p.y) }));
        d.poligono(anel, v.tipo === 'ARVORE' ? COR_VEGETACAO.copa : COR_VEGETACAO.arbusto);
        const fechado = [...anel, anel[0]];
        for (let i = 0; i + 1 < fechado.length; i++) d.linha(fechado[i].x, fechado[i].y, fechado[i + 1].x, fechado[i + 1].y, { espessuraMm: 0.15, cor: COR_VEGETACAO.traco });
        if (v.tipo === 'ARVORE') {
          for (let i = 0; i < 8; i++) {
            const g = (i / 8) * Math.PI * 2 + 0.3;
            d.linha(px(v.at.x + v.raioMm * 0.35 * Math.cos(g)), py(v.at.y + v.raioMm * 0.35 * Math.sin(g)), px(v.at.x + v.raioMm * 0.95 * Math.cos(g)), py(v.at.y + v.raioMm * 0.95 * Math.sin(g)), { espessuraMm: 0.12, cor: COR_VEGETACAO.traco });
          }
        }
      }
    }
  }

  // ── Nome e área do ambiente ───────────────────────────────────────────────
  for (const s of model.spaces) {
    const cx = s.ring.reduce((soma, p) => soma + p.x, 0) / s.ring.length;
    const cy = s.ring.reduce((soma, p) => soma + p.y, 0) / s.ring.length;
    const area = (s.areaMm2 / 1_000_000).toFixed(2).replace('.', ',');

    if (s.name) d.texto(px(cx), py(cy), s.name, ESPESSURA_TEXTO_MM);
    d.texto(px(cx), py(cy) + ESPESSURA_TEXTO_MM, `${area} m²`, ESPESSURA_TEXTO_MM * 0.8);
  }

  // A camada elétrica vem DEPOIS da arquitetura e ANTES das cotas: símbolo
  // por cima da parede, cota por cima de tudo — a ordem da prancha.
  if (opcoes.eletrica) desenharEletrica(d, model, { px, py });

  if (opcoes.cotas) desenharCotas(d, model, opcoes, enq, px, py);

  // ANOTAÇÕES (E8.1) da planta, por cima de tudo — a última camada, como na tela.
  desenharAnotacoes(d, (model.anotacoes ?? []).filter((a) => a.vista.tipo === 'PLANTA'), opcoes.denominador, px, py);
  const revisoesDaPlanta = revisoesDoModelo(model);

  if (opcoes.recorte && bb) {
    d.fimDoRecorte?.();
    // A moldura da ampliação: o leitor vê onde o recorte termina.
    d.retangulo(enq.offsetXMm, enq.offsetYMm, (bb.maxX - bb.minX) / opcoes.denominador, (bb.maxY - bb.minY) / opcoes.denominador, { espessuraMm: 0.35, cor: COR_TRACO });
  }

  desenharCarimbo(d, opcoes, enq, revisoesDaPlanta);
}

/**
 * ABERTURAS na planta (20/09/2026, E8.4 — a planta humanizada exigiu, e a
 * técnica ganhou junto: até aqui o PDF saía com a parede fechada onde há
 * porta). A mesma geometria do canvas: vão aberto (polígono branco sobre a
 * parede), batentes, e o símbolo — porta: folha a 90° + arco de giro em 12
 * segmentos (o `Desenhista` não tem arco); janela: linha no eixo; correr:
 * folha recolhida; vão livre: só os batentes.
 */
export function desenharAberturas(d: Desenhista, model: BlueprintModel, px: (x: number) => number, py: (y: number) => number, denominador: number): void {
  const espessura = ESPESSURA_FINA_MM;
  for (const o of model.openings) {
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const comp = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (comp === 0) continue;
    const ux = (w.b.x - w.a.x) / comp;
    const uy = (w.b.y - w.a.y) / comp;
    const nx = -uy;
    const ny = ux;
    const meia = w.thicknessMm / 2;
    const ini = { x: w.a.x + ux * o.offsetMm, y: w.a.y + uy * o.offsetMm };
    const fim = { x: w.a.x + ux * (o.offsetMm + o.widthMm), y: w.a.y + uy * (o.offsetMm + o.widthMm) };
    const P = (p: { x: number; y: number }) => ({ x: px(p.x), y: py(p.y) });
    const c1 = { x: ini.x + nx * meia, y: ini.y + ny * meia };
    const c2 = { x: ini.x - nx * meia, y: ini.y - ny * meia };
    const c3 = { x: fim.x - nx * meia, y: fim.y - ny * meia };
    const c4 = { x: fim.x + nx * meia, y: fim.y + ny * meia };
    // 1. o vão: branco sobre a parede (também sobre a parede CHEIA da humanizada).
    d.poligono([P(c1), P(c2), P(c3), P(c4)], '#ffffff');
    // 2. batentes.
    const linha = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const A = P(a);
      const B = P(b);
      d.linha(A.x, A.y, B.x, B.y, { espessuraMm: espessura, cor: COR_TRACO });
    };
    linha(c1, c2);
    linha(c3, c4);
    // Abaixo de 2 mm de papel o símbolo vira borrão.
    if (o.widthMm / denominador < 2) continue;
    // 3. símbolo.
    if (o.kind === 'passage') continue;
    if (o.kind === 'window') {
      linha(ini, fim);
      continue;
    }
    if (o.kind === 'sliding') {
      const borda = o.hingeAtStart ? ini : fim;
      const recuo = o.hingeAtStart ? -1 : 1;
      const desloc = o.embutida ? 0 : (o.swingReversed ? -1 : 1) * (meia + 45);
      linha({ x: borda.x + nx * desloc, y: borda.y + ny * desloc }, { x: borda.x + recuo * ux * o.widthMm + nx * desloc, y: borda.y + recuo * uy * o.widthMm + ny * desloc });
      continue;
    }
    // Porta: pivô na dobradiça, folha para dentro, arco da posição fechada à aberta.
    const lado = o.swingReversed ? -1 : 1;
    const piv = o.hingeAtStart ? { x: ini.x + nx * meia * lado, y: ini.y + ny * meia * lado } : { x: fim.x + nx * meia * lado, y: fim.y + ny * meia * lado };
    const eixo = { x: o.hingeAtStart ? ux : -ux, y: o.hingeAtStart ? uy : -uy };
    const folha = { x: nx * lado, y: ny * lado };
    const r = o.widthMm;
    linha(piv, { x: piv.x + folha.x * r, y: piv.y + folha.y * r });
    const N = 12;
    let anterior = { x: piv.x + eixo.x * r, y: piv.y + eixo.y * r };
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * (Math.PI / 2);
      const p = { x: piv.x + (eixo.x * Math.cos(t) + folha.x * Math.sin(t)) * r, y: piv.y + (eixo.y * Math.cos(t) + folha.y * Math.sin(t)) * r };
      linha(anterior, p);
      anterior = p;
    }
  }
}

/**
 * ÍNDICE DE PRANCHAS (E8.3): a primeira folha do conjunto — número, título e
 * escala de cada prancha, com o carimbo. Cabe 40 linhas por coluna; passa
 * disso, abre a segunda coluna.
 */
export function desenharIndice(
  d: Desenhista,
  pranchas: readonly { numero: string; titulo: string; denominador: number }[],
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  const x0 = MARGEM_MM + 4;
  let y = MARGEM_MM + 10;
  d.texto(x0, y, `${opcoes.titulo} — índice de pranchas`, 5);
  y += 8;
  d.texto(x0, y, `${pranchas.length} prancha(s) · versão ${opcoes.revisao} · hash ${opcoes.hash.slice(0, 12)}`, 2.6, '#555555');
  y += 8;
  const linhaMm = 6;
  const porColuna = Math.max(10, Math.floor((enq.utilAlturaMm - 30) / linhaMm));
  const larguraColuna = Math.min(140, enq.utilLarguraMm / Math.max(1, Math.ceil(pranchas.length / porColuna)));
  pranchas.forEach((p, i) => {
    const col = Math.floor(i / porColuna);
    const lin = i % porColuna;
    const x = x0 + col * larguraColuna;
    const yy = y + lin * linhaMm;
    if (lin === 0) {
      d.texto(x, yy - 1.5, 'Nº', 2.4, '#555555');
      d.texto(x + 16, yy - 1.5, 'Prancha', 2.4, '#555555');
      d.texto(x + larguraColuna - 22, yy - 1.5, 'Escala', 2.4, '#555555');
      d.linha(x, yy, x + larguraColuna - 6, yy, { espessuraMm: 0.2, cor: COR_TRACO });
    }
    d.texto(x, yy + 4.2, p.numero, 3);
    d.texto(x + 16, yy + 4.2, p.titulo, 3);
    d.texto(x + larguraColuna - 22, yy + 4.2, p.denominador > 0 ? `1:${p.denominador}` : '—', 3);
  });
  desenharCarimbo(d, opcoes, enq);
}

/**
 * TABELAS (E8.3): quadro de áreas (ambiente, pavimento, área de piso, perímetro
 * interno) com total e quadro de esquadrias (nome, tipo, L × A, quantidade).
 * Os números são os do quantitativo publicado — os mesmos da aba Quantitativos.
 */
export function desenharTabelas(
  d: Desenhista,
  quant: { ambientes: { nome?: string; spaceId: string; areaPisoM2: number; perimetroEixoM: number }[]; totais: { areaPisoM2: number; porEsquadria: { nome: string; tipo: string; larguraM: number; alturaM: number; quantidade: number }[] } },
  pavimentoDe: (spaceId: string) => string,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  const x0 = MARGEM_MM + 4;
  let y = MARGEM_MM + 10;
  const linhaMm = 5.2;
  d.texto(x0, y, 'Quadro de áreas', 4.2);
  y += 6;
  const cab = (cols: [string, number][], yy: number) => {
    let x = x0;
    for (const [rotulo, w] of cols) {
      d.texto(x, yy, rotulo, 2.4, '#555555');
      x += w;
    }
    d.linha(x0, yy + 1.2, x, yy + 1.2, { espessuraMm: 0.2, cor: COR_TRACO });
  };
  const larg: [string, number][] = [['Ambiente', 60], ['Pavimento', 34], ['Área de piso (m²)', 32], ['Perímetro (m)', 28]];
  cab(larg, y);
  y += linhaMm;
  const maxLinhas = Math.floor((enq.utilAlturaMm - 40) / linhaMm);
  const ambientes = quant.ambientes.slice(0, maxLinhas);
  for (const a of ambientes) {
    d.texto(x0, y, a.nome ?? 'Ambiente', 2.8);
    d.texto(x0 + 60, y, pavimentoDe(a.spaceId), 2.8);
    d.texto(x0 + 94, y, fmt(a.areaPisoM2), 2.8);
    d.texto(x0 + 126, y, fmt(a.perimetroEixoM), 2.8);
    y += linhaMm;
  }
  d.linha(x0, y - 3.6, x0 + 154, y - 3.6, { espessuraMm: 0.2, cor: COR_TRACO });
  d.texto(x0, y, `Total de piso: ${fmt(quant.totais.areaPisoM2)} m²${quant.ambientes.length > ambientes.length ? ` · ${quant.ambientes.length - ambientes.length} ambiente(s) omitido(s) por falta de espaço` : ''}`, 3);
  // Quadro de esquadrias, à direita quando cabe; abaixo quando não.
  const aDireita = enq.utilLarguraMm >= 320;
  let x1 = aDireita ? x0 + 170 : x0;
  let y1 = aDireita ? MARGEM_MM + 10 : y + 12;
  d.texto(x1, y1, 'Quadro de esquadrias', 4.2);
  y1 += 6;
  const cols2: [string, number][] = [['Nome', 30], ['Tipo', 36], ['L × A (m)', 34], ['Qtd.', 16]];
  let x = x1;
  for (const [rotulo, w] of cols2) {
    d.texto(x, y1, rotulo, 2.4, '#555555');
    x += w;
  }
  d.linha(x1, y1 + 1.2, x, y1 + 1.2, { espessuraMm: 0.2, cor: COR_TRACO });
  y1 += linhaMm;
  const ROTULO_TIPO: Record<string, string> = { door: 'Porta', window: 'Janela', sliding: 'Porta de correr' };
  for (const e of quant.totais.porEsquadria) {
    d.texto(x1, y1, e.nome, 2.8);
    d.texto(x1 + 30, y1, ROTULO_TIPO[e.tipo] ?? e.tipo, 2.8);
    d.texto(x1 + 66, y1, `${fmt(e.larguraM)} × ${fmt(e.alturaM)}`, 2.8);
    d.texto(x1 + 100, y1, String(e.quantidade), 2.8);
    y1 += linhaMm;
  }
  if (quant.totais.porEsquadria.length === 0) d.texto(x1, y1, 'Sem esquadrias no desenho.', 2.8, '#555555');
  x1 = 0;
  desenharCarimbo(d, opcoes, enq);
}

/**
 * As anotações de UMA vista, em mm de papel. `px`/`py` são a transformação da
 * vista (planta: x/y do modelo; corte/elevação: u/v). A geometria é a de
 * `blueprintAnotacoes.ts` — a mesma da tela e do DXF. A altura do texto vem do
 * modelo dividida pela escala, nunca abaixo de 1,5 mm (legível).
 */
export function desenharAnotacoes(
  d: Desenhista,
  anotacoes: readonly Anotacao[],
  denominador: number,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  for (const a of anotacoes) {
    const cor = a.cor || COR_PADRAO_DA_ANOTACAO;
    const alturaPapel = Math.max(1.5, a.alturaMm / denominador);
    const estilo: EstiloTraco = { espessuraMm: 0.25, cor };
    const P = (p: Point) => ({ x: px(p.x), y: py(p.y) });
    const linha = (p: Point, q: Point) => {
      const tp = P(p);
      const tq = P(q);
      d.linha(tp.x, tp.y, tq.x, tq.y, estilo);
    };
    switch (a.tipo) {
      case 'TEXTO': {
        const t = P(a.pontos[0]);
        (a.texto ?? '').split('\n').forEach((l, i) => d.texto(t.x, t.y + i * alturaPapel * 1.25, l, alturaPapel, cor));
        break;
      }
      case 'LEADER': {
        for (let i = 1; i < a.pontos.length; i++) linha(a.pontos[i - 1], a.pontos[i]);
        const [w1, w2] = pontaDaSeta(a.pontos[1], a.pontos[0], a.alturaMm);
        d.poligono([P(a.pontos[0]), P(w1), P(w2)], cor);
        const fim = P(a.pontos[a.pontos.length - 1]);
        (a.texto ?? '').split('\n').forEach((l, i) => d.texto(fim.x + 1, fim.y - 0.5 + i * alturaPapel * 1.25, l, alturaPapel, cor));
        break;
      }
      case 'LINHA':
        for (let i = 1; i < a.pontos.length; i++) linha(a.pontos[i - 1], a.pontos[i]);
        break;
      case 'HACHURA': {
        for (let i = 0; i < a.pontos.length; i++) linha(a.pontos[i], a.pontos[(i + 1) % a.pontos.length]);
        if (a.hachura === 'SOLIDA') d.poligono(a.pontos.map(P), cor);
        else for (const [p, q] of linhasDaHachura(a.pontos, a.hachura ?? 'DIAGONAL', a.alturaMm)) linha(p, q);
        if (a.texto) {
          const cx = a.pontos.reduce((s, p) => s + p.x, 0) / a.pontos.length;
          const cy = a.pontos.reduce((s, p) => s + p.y, 0) / a.pontos.length;
          d.texto(px(cx), py(cy), a.texto, alturaPapel, cor);
        }
        break;
      }
      case 'COTA_ANGULAR': {
        linha(a.pontos[0], a.pontos[1]);
        linha(a.pontos[0], a.pontos[2]);
        const c = cotaAngularDesenhada(a);
        if (c) {
          for (let i = 1; i < c.arco.length; i++) linha(c.arco[i - 1], c.arco[i]);
          const r = P(c.posicaoDoRotulo);
          d.texto(r.x, r.y, c.rotulo, alturaPapel, cor);
        }
        break;
      }
      // NUVEM DE REVISÃO (P2.15): o mesmo contorno recortado da tela, e o triângulo com o número.
      case 'NUVEM': {
        const nuvem = contornoDaNuvem(a.pontos, a.alturaMm);
        for (let i = 0; i < nuvem.length; i++) linha(nuvem[i], nuvem[(i + 1) % nuvem.length]);
        const e = P(posicaoDaEtiquetaDaNuvem(a.pontos, a.alturaMm));
        const lado = Math.max(3, alturaPapel * 1.4);
        d.linha(e.x, e.y - lado * 0.6, e.x - lado / 2, e.y + lado * 0.45, estilo);
        d.linha(e.x - lado / 2, e.y + lado * 0.45, e.x + lado / 2, e.y + lado * 0.45, estilo);
        d.linha(e.x + lado / 2, e.y + lado * 0.45, e.x, e.y - lado * 0.6, estilo);
        d.texto(e.x - alturaPapel * 0.3, e.y + lado * 0.3, String(a.revisao?.numero ?? ''), alturaPapel * 0.9, cor);
        if (a.texto) d.texto(e.x + lado * 0.7, e.y + lado * 0.3, a.texto, alturaPapel, cor);
        break;
      }
      default:
        break;
    }
  }
}

/**
 * A FOLHA do quadro de cargas (F8): legenda, tabela por quadro, alimentador e
 * hipóteses — mesmo papel e mesmo carimbo da planta.
 */
export function desenharFolhaDoQuadroDeCargas(
  d: Desenhista,
  model: BlueprintModel,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  desenharQuadroDeCargas(d, model, opcoes, enq, opcoes.hipotesesEletricas);
  desenharCarimbo(d, opcoes, enq);
}

/**
 * A FOLHA do diagrama unifilar (15/09/2026): um quadro por bloco, empilhados;
 * um quadro mais largo que a folha é ENCOLHIDO para caber (o barramento é um
 * só, não quebra linha). O rodapé lista só os símbolos que aparecem.
 */
export function desenharFolhaDoUnifilar(
  d: Desenhista,
  model: BlueprintModel,
  opcoes: OpcoesExportacao,
  enq: Enquadramento,
): void {
  const x0 = enq.offsetXMm - Math.max(0, (enq.utilLarguraMm - enq.desenhoLarguraMm) / 2);
  let y = enq.offsetYMm - Math.max(0, (enq.utilAlturaMm - enq.desenhoAlturaMm) / 2) + 6;
  d.texto(x0, y, 'DIAGRAMA UNIFILAR', 3.2);
  y += 7;
  const diagramas = montarUnifilar(model, opcoes.hipotesesEletricas);
  if (diagramas.length === 0) d.texto(x0, y, 'Sem quadro de distribuição neste desenho.', 2.2, '#555555');
  for (const dg of diagramas) {
    const { larguraMm, alturaMm } = medidasDoUnifilar(dg);
    const k = Math.min(1, enq.utilLarguraMm / larguraMm);
    desenharUnifilar(d, dg, x0, y, k);
    y += alturaMm * k + 8;
  }
  y += 2;
  for (const l of rodapeDoUnifilar(diagramas)) {
    d.texto(x0, y, l, 1.9, '#555555');
    y += 3.6;
  }
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
  projecao: ProjecaoElevacao | ProjecaoCorte,
  denominador: number,
  papel: Papel,
): Enquadramento {
  const utilLarguraMm = papel.larguraMm - 2 * MARGEM_MM;
  const utilAlturaMm = papel.alturaMm - 2 * MARGEM_MM - CARIMBO_MM;

  // VAZIO significa "nao ha o que desenhar", e num corte isso inclui o que o
  // plano atravessa: um corte por um pavimento so de pilares nao tem parede
  // atras nenhuma, e recusar a prancha por isso seria recusar o desenho certo.
  const vazio =
    projecao.paredes.every((p) => p.degenerada) &&
    (!('cortados' in projecao) || projecao.cortados.length === 0);
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
/** Telhado: tom de telha, o único item que sai como polígono (é inclinado). */
const COR_ELEV_TELHADO = '#d9b8a3';

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
  projecao: ProjecaoElevacao | ProjecaoCorte,
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

  // TELHADO: polígono, não caixa — a água é inclinada e a caixa envolvente
  // desenharia um bloco onde a fachada mostra a rampa. Mesma decisão do
  // `ElevationCanvas`.
  for (const a of projecao.telhados ?? []) {
    if (a.degenerada) continue;
    itens.push({
      profundidade: a.profundidade,
      pintar: () => {
        const pts = a.pontos.map((p) => ({ x: px(p.u), y: py(p.v) }));
        d.poligono(pts, COR_ELEV_TELHADO);
        for (let i = 0; i < pts.length; i++) {
          const q = pts[(i + 1) % pts.length];
          d.linha(pts[i].x, pts[i].y, q.x, q.y, { espessuraMm: 0.35, cor: COR_TRACO });
        }
      },
    });
  }

  // ESCADA E RAMPA: uma silhueta por fatia, na ordem de subida — a mesma
  // decisão do `ElevationCanvas`, e pela mesma razão (ver `EscadaElevacao`).
  for (const e of projecao.escadas ?? []) {
    if (e.degenerada) continue;
    itens.push({
      profundidade: e.profundidade,
      pintar: () => {
        for (const fatia of e.fatias) {
          if (fatia.length < 3) continue;
          const pts = fatia.map((p) => ({ x: px(p.u), y: py(p.v) }));
          d.poligono(pts, COR_ELEV_ESCADA);
          for (let i = 0; i < pts.length; i++) {
            const q = pts[(i + 1) % pts.length];
            d.linha(pts[i].x, pts[i].y, q.x, q.y, { espessuraMm: ESPESSURA_FINA_MM, cor: COR_TRACO });
          }
        }
      },
    });
  }

  // Fundo primeiro: `profundidade` é `dot(centro, direçãoDeVisão)`, então MAIOR
  // = mais longe de quem olha.
  itens.sort((a, b) => b.profundidade - a.profundidade);
  for (const i of itens) i.pintar();

  // ── O QUE O PLANO CORTA — por cima de tudo, fora da ordenacao ──────────────
  //
  // A mesma regra da tela, e pela mesma razao: a face cortada E o plano, e tudo
  // o que a vista mostra esta atras dele. Poe-la na fila de profundidade seria
  // pedir a um empate que decidisse o que ja esta decidido.
  //
  // O TRACO E GROSSO porque numa prancha a espessura da linha e o que separa o
  // que foi cortado do que e vista. Sem ela o corte se le como uma elevacao com
  // paredes a mais, e o desenho perde exatamente a informacao que o justifica.
  if ('cortados' in projecao) {
    for (const c of projecao.cortados) {
      const pts = c.pontos.map((q) => ({ x: px(q.u), y: py(q.v) }));
      d.poligono(
        pts,
        c.familia === 'TELHADO'
          ? COR_CORTE_TELHADO
          : c.familia === 'ESTRUTURA'
            ? COR_CORTE_ESTRUTURA
            : c.familia === 'ESCADA'
              ? COR_CORTE_ESCADA
              : COR_CORTE_PAREDE,
      );
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(i + 1) % pts.length];
        d.linha(pts[i].x, pts[i].y, q.x, q.y, { espessuraMm: 0.5, cor: COR_TRACO });
      }
      // O vao do que foi cortado: branco por cima, com moldura fina. E o que faz
      // a porta atravessada aparecer — e e por isso que se escolhe onde passar a
      // linha de corte.
      for (const v of c.vaos) {
        const cx = caixa(v.uMin, v.uMax, v.vMin, v.vMax);
        d.retangulo(cx.x, cx.y, cx.w, cx.h, { espessuraMm: 0, cor: '#ffffff' });
        d.retangulo(cx.x, cx.y, cx.w, cx.h, { espessuraMm: ESPESSURA_FINA_MM, cor: COR_TRACO });
      }
    }
  }

  // ANOTAÇÕES (E8.1) desta vista: as do corte (por id) ou da elevação (por direção).
  const daVista = (opcoes.anotacoes ?? []).filter((a) =>
    'corteId' in projecao ? a.vista.tipo === 'CORTE' && a.vista.corteId === projecao.corteId : a.vista.tipo === 'ELEVACAO' && a.vista.direcao === projecao.direcao,
  );
  desenharAnotacoes(d, daVista, opcoes.denominador, px, py);

  desenharCarimbo(d, opcoes, enq, revisoesDasAnotacoes(daVista));
}

/** O que o plano de CORTE atravessa — cheio, como manda a prancha. */
const COR_CORTE_PAREDE = '#94a3b8';
const COR_CORTE_ESTRUTURA = '#475569';
const COR_CORTE_TELHADO = '#9a3412';
const COR_CORTE_ESCADA = '#64748b';
/** Escada e rampa em vista: o cinza da pedra, entre a parede e o concreto. */
const COR_ELEV_ESCADA = '#cbd5e1';

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
function desenharCarimbo(d: Desenhista, o: OpcoesExportacao, enq: Enquadramento, revisoes: RevisaoDaPrancha[] = []): void {
  const topo = MARGEM_MM + enq.utilAlturaMm;
  const largura = enq.utilLarguraMm;
  // NUVENS DE REVISÃO (P2.15): a tabela de revisões — as 4 mais recentes, à
  // esquerda do número da prancha (ou da escala gráfica), do mais novo para o
  // mais velho. É o que liga o "Δ3" da nuvem à data e à descrição.
  if (revisoes.length > 0) {
    const xTab = MARGEM_MM + largura - (o.prancha ? 104 : 48) - 78;
    d.linha(xTab - 3, topo, xTab - 3, topo + CARIMBO_MM, { espessuraMm: 0.25, cor: COR_TRACO });
    d.texto(xTab, topo + 4, 'Rev.  Data        Descrição', 2.0, '#555555');
    [...revisoes].reverse().slice(0, 4).forEach((r, i) => {
      const desc = r.descricoes.join('; ') || `${r.nuvens} nuvem(ns)`;
      d.texto(xTab, topo + 8 + i * 4.2, `Δ${r.numero}   ${dataDaRevisaoBr(r.data)}   ${desc.length > 34 ? desc.slice(0, 33) + '…' : desc}`, 2.0);
    });
  }

  d.retangulo(MARGEM_MM, topo, largura, CARIMBO_MM, {
    espessuraMm: 0.25,
    cor: COR_TRACO,
  });

  const data = (o.data ?? new Date()).toLocaleDateString('pt-BR');

  // CARIMBO DA ORGANIZAÇÃO (E8.3): bloco à esquerda com empresa, responsável,
  // cliente e endereço; o número da prancha, grande, à direita. O título, a
  // escala, o hash e o aviso continuam no lugar de sempre, deslocados.
  const deslocamento = o.carimboDaOrg ? 70 : 0;
  if (o.carimboDaOrg) {
    const c = o.carimboDaOrg;
    const x = MARGEM_MM + 3;
    d.linha(MARGEM_MM + 68, topo, MARGEM_MM + 68, topo + CARIMBO_MM, { espessuraMm: 0.25, cor: COR_TRACO });
    if (c.empresa) d.texto(x, topo + 5, c.empresa, 3.2);
    if (c.responsavel || c.registro) d.texto(x, topo + 9.5, [c.responsavel, c.registro].filter(Boolean).join(' · '), 2.3);
    if (c.cliente) d.texto(x, topo + 13.5, `Cliente: ${c.cliente}`, 2.3);
    if (c.endereco) d.texto(x, topo + 17.5, c.endereco, 2.1, '#555555');
    c.camposExtras.slice(0, 2).forEach((campo, i) => d.texto(x, topo + 21.5 + i * 3.2, `${campo.rotulo}: ${campo.valor}`, 2.0, '#555555'));
  }
  if (o.prancha) {
    const xNum = MARGEM_MM + largura - 100;
    d.linha(xNum - 4, topo, xNum - 4, topo + CARIMBO_MM, { espessuraMm: 0.25, cor: COR_TRACO });
    d.texto(xNum, topo + 6, 'Prancha', 2.2, '#555555');
    d.texto(xNum, topo + 15, o.prancha.numero, 8);
    d.texto(xNum, topo + 20, `de ${o.prancha.total}`, 2.6, '#555555');
  }

  d.texto(MARGEM_MM + 3 + deslocamento, topo + 6, o.prancha ? `${o.titulo} — ${o.prancha.titulo}` : o.titulo, 3.2);
  d.texto(
    MARGEM_MM + 3 + deslocamento,
    topo + 11,
    `${o.denominador > 0 ? `Escala 1:${o.denominador}` : 'Sem escala'}  ·  ${o.papel.id}  ·  Versão ${o.revisao}  ·  ${data}`,
    2.4,
  );
  // O hash é o que liga o papel à versão publicada. Sem ele, duas impressões
  // parecidas são indistinguíveis, e é sempre a errada que vai para a obra.
  d.texto(MARGEM_MM + 3 + deslocamento, topo + 15.5, `Hash ${o.hash.slice(0, 16)}`, 2.0, '#555555');
  d.texto(MARGEM_MM + 3 + deslocamento, topo + 20, o.aviso ?? AVISO_PADRAO, 2.2, '#000000');
  // COTA SEM DIZER DE ONDE É MEDIDA ENGANA. Quem mede a face vai achar meia
  // espessura a menos de cada lado, e vai achar que o desenho está errado.
  if (o.cotas) d.texto(MARGEM_MM + 3 + deslocamento, topo + 23.5, AVISO_COTA_POR_FACE, 1.9, '#555555');

  if (o.denominador > 0) desenharEscalaGrafica(d, o, MARGEM_MM + largura - 45, topo + 20);
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
