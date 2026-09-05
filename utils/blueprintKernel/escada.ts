import { point, polygonArea, type Point } from './geom';
import { roundToMm } from './units';
import { contornoEmPlanta, type BlueprintModel, type Escada, type Level, type ObjectId } from './model';
import { recorteComum } from './sobreposicao';

/**
 * ESCADA E RAMPA — a geometria derivada do percurso e do desnível.
 *
 * ─── O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ─────────────────────────────────
 *
 * Uma escada que não chega ao piso de cima. É o erro clássico do desenho
 * paramétrico de escada, e ele não se denuncia: os degraus aparecem todos, a
 * planta fica bonita, e o último espelho tem 210 mm porque alguém digitou "20
 * degraus" numa altura que pedia 22. No corte a escada encosta na laje por um
 * canto e ninguém repara.
 *
 * A cura é não deixar o número ser digitado. O modelo guarda o ALVO de espelho;
 * a contagem e o espelho REAL saem daqui, e `espelho × n = desnível` fecha por
 * construção — não por conferência.
 *
 * ─── FONTE ÚNICA DOS DEGRAUS ────────────────────────────────────────────────
 *
 * `degrausDaEscada` serve a planta, a elevação, o corte, o 3D e o IFC. As cinco
 * reimplementariam a mesma distribuição ao longo de uma polilinha, cada uma com
 * o seu jeito de errar o último degrau — e o desenho passaria a discordar de si
 * mesmo entre duas vistas da mesma escada.
 */

/** Faixa de Blondel: `2 × espelho + piso`, em mm. Fora dela a escada cansa. */
export const BLONDEL_MIN_MM = 630;
export const BLONDEL_MAX_MM = 650;

/** Espelho confortável pela NBR 9050, em mm. */
export const ESPELHO_MIN_MM = 160;
export const ESPELHO_MAX_MM = 180;

/** Inclinação máxima de rampa acessível pela NBR 9050, em por cento. */
export const RAMPA_INCLINACAO_MAX_PCT = 8.33;

/** Um espelho do lance, já posicionado no percurso. */
export interface DegrauDaEscada {
  /** 0-based. O espelho `i` sobe de `i × espelho` até `(i+1) × espelho`. */
  indice: number;
  /** Distância percorrida em planta até o pé deste espelho, em mm. */
  uMm: number;
  /** Cota do PISO deste degrau — o topo do espelho —, relativa ao pavimento. */
  cotaMm: number;
  /** As duas pontas da linha transversal, de uma borda à outra da escada. */
  a: Point;
  b: Point;
}

export interface MedidaEscada {
  /** Altura vencida, em mm. Vem do pavimento de CIMA — ver `nivelDeChegada`. */
  desnivelMm: number;
  /** Para onde ela sobe. `null` = não há pavimento acima; caiu no pé-direito. */
  nivelDeChegada: Level | null;
  /** Número de ESPELHOS. Sempre ≥ 2. Zero na rampa. */
  degraus: number;
  /** Espelho REAL: `desnivel / degraus`. Fecha exato, por construção. */
  espelhoMm: number;
  /** Piso (a pisada): `comprimento / (degraus − 1)`. Zero na rampa. */
  pisoMm: number;
  /** Comprimento do percurso em PLANTA, em mm. */
  comprimentoMm: number;
  /**
   * Comprimento REAL da rampa de subida — a hipotenusa.
   *
   * Não é o comprimento em planta, pelo mesmo motivo de `areaRealM2` no
   * telhado: quem executa percorre a inclinada, e é ela que entra no
   * quantitativo de guarda-corpo e de acabamento.
   */
  comprimentoInclinadoMm: number;
  /** Inclinação média em por cento. É o número que rege a RAMPA. */
  inclinacaoPct: number;
  /** `2 × espelho + piso`. Zero na rampa. */
  blondelMm: number;
  /** Pegada em planta, como polígono fechado. */
  contorno: Point[];
  areaPlantaMm2: number;
  /**
   * O que está fora da norma, em português, pronto para a tela.
   *
   * O texto mora no kernel pela razão de `nomeDoTipoEstrutural`: escrito à mão
   * em cada tela, o mesmo aviso aparece com número diferente em metade delas.
   * São AVISOS, não recusas — ver o cabeçalho dos invariantes em `model.ts`.
   */
  avisos: string[];
}

/**
 * O pavimento imediatamente ACIMA do de partida.
 *
 * "Imediatamente" é por `elevationMm`, e não pela ordem do array: a lista de
 * pavimentos é editável e nada garante que ela esteja ordenada por cota. `null`
 * quando não há nenhum acima.
 */
export function nivelDeChegada(model: BlueprintModel, escada: Escada): Level | null {
  const partida = model.levels.find((l) => l.id === escada.levelId);
  if (!partida) return null;

  let melhor: Level | null = null;
  for (const l of model.levels) {
    if (l.elevationMm <= partida.elevationMm) continue;
    if (!melhor || l.elevationMm < melhor.elevationMm) melhor = l;
  }
  return melhor;
}

/**
 * A altura a vencer.
 *
 * Com pavimento acima, é a diferença de cota entre os dois pisos. SEM pavimento
 * acima, cai no pé-direito do de partida — que é o palpite honesto: a escada
 * está subindo para um andar que ainda não foi desenhado, e o pé-direito é a
 * altura que o próprio pavimento declara.
 */
export function desnivelDaEscada(model: BlueprintModel, escada: Escada): number {
  const partida = model.levels.find((l) => l.id === escada.levelId);
  if (!partida) return 0;
  const chegada = nivelDeChegada(model, escada);
  return chegada ? chegada.elevationMm - partida.elevationMm : partida.defaultHeightMm;
}

/** Comprimento do percurso em planta. */
export function comprimentoDoPercurso(pontos: Point[]): number {
  let total = 0;
  for (let i = 0; i + 1 < pontos.length; i++) {
    total += Math.hypot(pontos[i + 1].x - pontos[i].x, pontos[i + 1].y - pontos[i].y);
  }
  return total;
}

/** Onde um `u` do percurso cai, e para onde o percurso aponta ali. */
function noPercurso(pontos: Point[], u: number): { p: Point; dir: Point } {
  let restante = Math.max(0, u);
  for (let i = 0; i + 1 < pontos.length; i++) {
    const dx = pontos[i + 1].x - pontos[i].x;
    const dy = pontos[i + 1].y - pontos[i].y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    // `<=` e não `<`: no fim exato de um trecho a resposta é a ponta dele, com
    // a direção DELE. Com `<`, o último degrau — que cai exatamente no fim do
    // percurso — cairia no laço seguinte e sairia sem trecho nenhum.
    if (restante <= comp || i + 2 === pontos.length) {
      return { p: { x: pontos[i].x + dir.x * restante, y: pontos[i].y + dir.y * restante }, dir };
    }
    restante -= comp;
  }
  return { p: pontos[0], dir: { x: 1, y: 0 } };
}

/** Cruzamento de duas retas dadas por ponto e direção. `null` se quase paralelas. */
function cruzamento(p: Point, u: Point, q: Point, v: Point): Point | null {
  const den = u.x * v.y - u.y * v.x;
  // Os dois vetores já vêm unitários, então o denominador É o seno do ângulo —
  // comparável com uma tolerância fixa, o que o produto cru não seria.
  if (Math.abs(den) < 0.05) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den;
  return { x: p.x + t * u.x, y: p.y + t * u.y };
}

/**
 * A PEGADA em planta: o percurso engrossado pela largura, com os cantos
 * mitrados.
 *
 * Mitra, e não a união dos retângulos de cada trecho: no patamar em L a união
 * deixa um entalhe no canto interno e uma sobra no externo, e o desenho mostra
 * uma escada com um degrau faltando bem onde ela vira. A mitra é o que o
 * desenho de arquitetura mostra, e é o que `cantosDaParede` já faz na parede
 * pela mesma razão.
 *
 * Quase paralelo cai no ponto deslocado simples: ali a mitra vai para o
 * infinito, e um vértice a 40 m de distância é pior que um canto quadrado.
 */
export function contornoDaEscada(escada: Escada): Point[] {
  const { esquerda, direita } = bordasDaEscada(escada);
  if (esquerda.length === 0) return [];
  // Esquerda na ida, direita na volta: o anel fecha sem cruzar a si mesmo.
  return [...esquerda, ...direita.slice().reverse()];
}

/**
 * As duas BORDAS do percurso, uma de cada lado do eixo, com um ponto por
 * vértice do eixo — `esquerda[k]` e `direita[k]` são os dois lados do vértice
 * `pontos[k]`. É essa correspondência por índice que permite fatiar a escada em
 * prismas (ver `fatiasDaEscada`) sem reconstruir a mitra.
 */
export function bordasDaEscada(escada: Escada): { esquerda: Point[]; direita: Point[] } {
  const pts = escada.pontos;
  const meia = escada.larguraMm / 2;

  const trechos: { p: Point; dir: Point; n: Point }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const dir = { x: dx / comp, y: dy / comp };
    trechos.push({ p: pts[i], dir, n: { x: -dir.y, y: dir.x } });
  }
  if (trechos.length === 0) return { esquerda: [], direita: [] };

  const borda = (lado: 1 | -1): Point[] => {
    const saida: Point[] = [];
    const desloca = (p: Point, n: Point) => ({ x: p.x + n.x * meia * lado, y: p.y + n.y * meia * lado });

    saida.push(desloca(trechos[0].p, trechos[0].n));
    for (let i = 0; i + 1 < trechos.length; i++) {
      const a = trechos[i];
      const b = trechos[i + 1];
      const pa = desloca(a.p, a.n);
      const pb = desloca(b.p, b.n);
      saida.push(cruzamento(pa, a.dir, pb, b.dir) ?? pb);
    }
    const ultimo = trechos[trechos.length - 1];
    saida.push(desloca(pts[pts.length - 1], ultimo.n));
    return saida.map((p) => point(roundToMm(p.x), roundToMm(p.y)));
  };

  return { esquerda: borda(1), direita: borda(-1) };
}

/**
 * Os espelhos do lance, distribuídos ao longo do percurso.
 *
 * São `n` linhas transversais, em `u = 0, piso, 2·piso, …, (n−1)·piso` — a
 * última exatamente no fim do percurso, porque o topo do último espelho É o
 * piso de cima. Rampa não tem degrau: devolve lista vazia.
 */
export function degrausDaEscada(model: BlueprintModel, escada: Escada): DegrauDaEscada[] {
  if (escada.tipo === 'RAMPA') return [];

  const m = medirEscada(model, escada);
  if (m.degraus < 2) return [];

  const meia = escada.larguraMm / 2;
  const saida: DegrauDaEscada[] = [];
  for (let i = 0; i < m.degraus; i++) {
    const u = i * m.pisoMm;
    const { p, dir } = noPercurso(escada.pontos, u);
    const n = { x: -dir.y, y: dir.x };
    saida.push({
      indice: i,
      uMm: u,
      cotaMm: (i + 1) * m.espelhoMm,
      a: { x: p.x + n.x * meia, y: p.y + n.y * meia },
      b: { x: p.x - n.x * meia, y: p.y - n.y * meia },
    });
  }
  return saida;
}

/**
 * Tudo o que se deriva de uma escada ou rampa.
 *
 * ⚠️ `espelhoMm` e `pisoMm` NÃO são arredondados para milímetro inteiro. É
 * deliberado: `espelho × degraus` tem de dar o desnível EXATO, e arredondar
 * cada espelho para o milímetro faria o lance errar o piso de cima por até
 * meio milímetro vezes o número de degraus. Quem mostra na tela arredonda ali;
 * quem desenha usa o número cheio.
 */
export function medirEscada(model: BlueprintModel, escada: Escada): MedidaEscada {
  const desnivelMm = desnivelDaEscada(model, escada);
  const comprimentoMm = comprimentoDoPercurso(escada.pontos);
  const contorno = contornoDaEscada(escada);
  const chegada = nivelDeChegada(model, escada);

  const inclinacaoPct = comprimentoMm > 0 ? (desnivelMm / comprimentoMm) * 100 : 0;
  const comprimentoInclinadoMm = Math.hypot(comprimentoMm, desnivelMm);
  const avisos: string[] = [];

  if (escada.tipo === 'RAMPA') {
    if (inclinacaoPct > RAMPA_INCLINACAO_MAX_PCT) {
      avisos.push(
        `Inclinação de ${inclinacaoPct.toFixed(1).replace('.', ',')}% passa dos ` +
          `${String(RAMPA_INCLINACAO_MAX_PCT).replace('.', ',')}% que a NBR 9050 admite — ` +
          `alongue a rampa ou acrescente patamar.`,
      );
    }
    return {
      desnivelMm,
      nivelDeChegada: chegada,
      degraus: 0,
      espelhoMm: 0,
      pisoMm: 0,
      comprimentoMm,
      comprimentoInclinadoMm,
      inclinacaoPct,
      blondelMm: 0,
      contorno,
      areaPlantaMm2: contorno.length >= 3 ? Math.round(polygonArea(contorno)) : 0,
      avisos,
    };
  }

  // ── A CONTA QUE FECHA POR CONSTRUÇÃO ─────────────────────────────────────
  //
  // `n` é o número de espelhos, arredondado a partir do alvo; `espelho` é o que
  // sobra da divisão, e por isso `espelho × n === desnivel` sem folga. O piso
  // divide o percurso por `n − 1` porque o topo do último espelho É o piso de
  // cima: um lance de `n` espelhos tem `n − 1` pisadas.
  const degraus = Math.max(2, Math.round(desnivelMm / escada.alvoEspelhoMm) || 2);
  const espelhoMm = desnivelMm / degraus;
  const pisoMm = comprimentoMm / (degraus - 1);
  const blondelMm = 2 * espelhoMm + pisoMm;

  if (espelhoMm < ESPELHO_MIN_MM || espelhoMm > ESPELHO_MAX_MM) {
    avisos.push(
      `Espelho de ${Math.round(espelhoMm)} mm fora da faixa de ` +
        `${ESPELHO_MIN_MM} a ${ESPELHO_MAX_MM} mm da NBR 9050.`,
    );
  }
  if (blondelMm < BLONDEL_MIN_MM || blondelMm > BLONDEL_MAX_MM) {
    avisos.push(
      `Blondel em ${Math.round(blondelMm)} mm — a escada fica ` +
        `${blondelMm < BLONDEL_MIN_MM ? 'curta e apressada' : 'esticada e cansativa'}. ` +
        `O confortável é de ${BLONDEL_MIN_MM} a ${BLONDEL_MAX_MM} mm ` +
        `(2 × espelho + piso); ${blondelMm < BLONDEL_MIN_MM ? 'alongue' : 'encurte'} o percurso.`,
    );
  }

  return {
    desnivelMm,
    nivelDeChegada: chegada,
    degraus,
    espelhoMm,
    pisoMm,
    comprimentoMm,
    comprimentoInclinadoMm,
    inclinacaoPct,
    blondelMm,
    contorno,
    areaPlantaMm2: contorno.length >= 3 ? Math.round(polygonArea(contorno)) : 0,
    avisos,
  };
}

/** Quanto de uma laje a escada tira, e de qual. */
export interface FuroDaEscada {
  escadaId: ObjectId;
  /** A peça `LAJE` atravessada. */
  structuralId: ObjectId;
  /** Área do furo em planta, em mm². */
  areaMm2: number;
  /** O contorno do furo — a interseção das duas pegadas. */
  contorno: Point[];
}

/**
 * O FURO NA LAJE: onde a escada passa, não há laje.
 *
 * ─── DERIVADO A CADA LEITURA, NUNCA GRAVADO ─────────────────────────────────
 *
 * É a regra que `sobreposicao.ts` já escreveu para o pilar dentro da parede: a
 * DECISÃO vive no modelo, o NÚMERO não. Um furo gravado ficaria obsoleto no
 * instante em que alguém movesse a escada — e um desconto obsoleto não some da
 * tela, vira um número plausível, que é a pior espécie de erro num orçamento.
 *
 * ─── QUAL LAJE ──────────────────────────────────────────────────────────────
 *
 * A que está ACIMA do piso de partida e não passa do de chegada, medida em cota
 * ABSOLUTA. Absoluta porque a laje de teto tanto é desenhada no pavimento de
 * baixo com base no pé-direito quanto no de cima com base zero, e as duas
 * convenções aparecem em projeto real — comparar cota relativa acertaria uma e
 * erraria a outra.
 *
 * A laje de PISO fica de fora pela mesma conta: a base dela está NO piso de
 * partida, não acima dele. A escada apoia nela, não a atravessa.
 *
 * ⚠️ NÃO há "quem cede" aqui, ao contrário do par parede/pilar. Onde passa a
 * escada não há laje — não é disputa de volume entre dois componentes que
 * coexistem, é ausência. Por isso a escada não tem `cedeSobreposicao`.
 */
export function furosDaEscada(model: BlueprintModel): FuroDaEscada[] {
  const lajes = (model.structures ?? []).filter((s) => s.kind === 'LAJE');
  if (lajes.length === 0) return [];

  const cotaDoNivel = (levelId: ObjectId): number | null =>
    model.levels.find((l) => l.id === levelId)?.elevationMm ?? null;

  const saida: FuroDaEscada[] = [];
  for (const escada of model.stairs ?? []) {
    const partida = cotaDoNivel(escada.levelId);
    if (partida === null) continue;
    const chegada = partida + desnivelDaEscada(model, escada);
    const pegada = contornoDaEscada(escada);
    if (pegada.length < 3) continue;

    for (const laje of lajes) {
      const base = cotaDoNivel(laje.levelId);
      if (base === null) continue;
      const cotaDaLaje = base + laje.baseMm;
      if (cotaDaLaje <= partida || cotaDaLaje > chegada) continue;

      const contorno = recorteComum(pegada, contornoEmPlanta(laje));
      if (contorno.length < 3) continue;
      const areaMm2 = Math.round(polygonArea(contorno));
      if (areaMm2 <= 0) continue;

      saida.push({ escadaId: escada.id, structuralId: laje.id, areaMm2, contorno });
    }
  }
  return saida;
}

/**
 * Um PRISMA da escada: quatro cantos em planta, base no piso e uma cota de topo
 * por canto.
 *
 * Na escada, cada fatia é um DEGRAU (topo plano: as quatro cotas iguais). Na
 * rampa, cada fatia é um TRECHO do percurso (topo inclinado: a cota sobe ao
 * longo do caminho). Nos dois casos o sólido é CONVEXO, e é isso que as vistas
 * exploram — a silhueta de um prisma convexo em qualquer direção é o fecho
 * convexo dos oito cantos projetados, sem caso especial.
 */
export interface FatiaDaEscada {
  indice: number;
  /** Cantos em planta, em ordem de anel. */
  cantos: Point[];
  /** Cota do topo em cada canto, relativa ao piso do pavimento. Mesma ordem. */
  cotasMm: number[];
}

/** A cota do percurso a `u` mm do início, relativa ao piso. Só a rampa a usa. */
function cotaNoPercurso(desnivelMm: number, comprimentoMm: number, u: number): number {
  if (comprimentoMm <= 0) return 0;
  return (desnivelMm * Math.max(0, Math.min(comprimentoMm, u))) / comprimentoMm;
}

/**
 * FONTE ÚNICA dos sólidos da escada — a elevação, o corte e o 3D partem daqui.
 *
 * A escada sólida é a união de `n − 1` caixas: o degrau `i` ocupa o trecho entre
 * o espelho `i` e o `i + 1`, do piso até a cota do topo do espelho `i`. O último
 * espelho não tem caixa própria: o topo dele É o piso de cima.
 *
 * A rampa é um prisma por trecho do eixo, com os cantos vindos das bordas
 * mitradas (`bordasDaEscada`) — no patamar em L os dois trechos dividem o
 * vértice mitrado, então a união fecha sem fresta e sem sobra.
 */
export function fatiasDaEscada(model: BlueprintModel, escada: Escada): FatiaDaEscada[] {
  const m = medirEscada(model, escada);

  if (escada.tipo === 'RAMPA') {
    const { esquerda, direita } = bordasDaEscada(escada);
    if (esquerda.length < 2) return [];
    const saida: FatiaDaEscada[] = [];
    let u = 0;
    for (let k = 0; k + 1 < escada.pontos.length; k++) {
      const trecho = Math.hypot(
        escada.pontos[k + 1].x - escada.pontos[k].x,
        escada.pontos[k + 1].y - escada.pontos[k].y,
      );
      const cotaA = cotaNoPercurso(m.desnivelMm, m.comprimentoMm, u);
      const cotaB = cotaNoPercurso(m.desnivelMm, m.comprimentoMm, u + trecho);
      saida.push({
        indice: k,
        cantos: [esquerda[k], esquerda[k + 1], direita[k + 1], direita[k]],
        cotasMm: [cotaA, cotaB, cotaB, cotaA],
      });
      u += trecho;
    }
    return saida;
  }

  const degraus = degrausDaEscada(model, escada);
  const saida: FatiaDaEscada[] = [];
  for (let i = 0; i + 1 < degraus.length; i++) {
    const de = degraus[i];
    const ate = degraus[i + 1];
    saida.push({
      indice: i,
      cantos: [de.a, ate.a, ate.b, de.b],
      cotasMm: [de.cotaMm, de.cotaMm, de.cotaMm, de.cotaMm],
    });
  }
  return saida;
}
