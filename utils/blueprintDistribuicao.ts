/**
 * DISTRIBUIÇÃO de tomadas ao longo das paredes de um ambiente.
 *
 * ─── O PEDIDO (10/09/2026) ─────────────────────────────────────────────────
 *
 * *"o sistema pode inserir uma tomada no banheiro e o projetista tem o trabalho
 * apenas de mover para o local adequado … um campo para que o usuário possa
 * decidir a quantidade de tomadas por ambiente e por parede"*
 *
 * ─── ⚠️ O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────
 *
 * É um GERADOR DE POSIÇÕES PROVISÓRIAS: dado um contorno (ou um lado dele) e
 * uma quantidade, devolve pontos nas faces, espaçados uniformemente, fora de
 * portas e janelas, com folga de canto. Uniforme porque é o que a própria
 * norma pede — *"espaçados tão uniformemente quanto possível"* (9.5.2.2.1).
 *
 * NÃO decide onde a tomada fica. Quem chama marca os pontos como SUGERIDOS, e
 * mover cada um é o ato de decidir. Sem a marca, isto seria decisão disfarçada
 * de ajuda — ver `Terminal.sugerida`.
 *
 * ─── ⚠️ POR QUE É MÓDULO PURO ──────────────────────────────────────────────
 *
 * Porque a pergunta "onde caem N pontos neste contorno, evitando estes vãos?"
 * tem resposta exata e testável sem tela. Colocar isto no canvas exigiria um
 * contexto 2D para provar que a tomada não caiu no meio da porta.
 */
import {
  anelRecuado,
  areCollinear,
  interiorPoint,
  isBetween,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Opening,
  type Point,
  type Space,
  type SpaceLabel,
  type Terminal,
  type TipoDeAmbiente,
  type Wall,
} from './blueprintKernel';

/**
 * Como cada tipo de ambiente se chama na tela. As classes são as que a NBR 5410
 * distingue em 9.5.2.2.1 — banheiro; cozinha, copa e área de serviço; varanda;
 * sala e dormitório; e os demais.
 */
export const ROTULO_DO_TIPO_DE_AMBIENTE: Record<TipoDeAmbiente, string> = {
  BANHEIRO: 'Banheiro',
  COZINHA_SERVICO: 'Cozinha / copa / área de serviço',
  VARANDA: 'Varanda',
  SALA_DORMITORIO: 'Sala / dormitório',
  OUTRO: 'Outro (hall, corredor, depósito…)',
};

/** A etiqueta que nomeia o ambiente — é nela que o tipo mora. */
export function etiquetaDoAmbiente(
  space: Pick<Space, 'labelUid'>,
  labels: readonly SpaceLabel[],
): SpaceLabel | null {
  if (!space.labelUid) return null;
  return labels.find((l) => l.uid === space.labelUid) ?? null;
}

/**
 * A cota da tomada sugerida: baixa, 300 mm — a mais comum em residência e a
 * mesma de `COTA_USUAL_DO_PONTO_ELETRICO.TUG`. Quem quiser média (bancada)
 * muda no painel do ponto; é o mesmo gesto de mover.
 */
export const COTA_TOMADA_SUGERIDA_MM = 300;

/** Um LADO do contorno de piso — a face interna de uma parede do ambiente. */
export interface LadoDoAmbiente {
  a: Point;
  b: Point;
  /** A parede que esse lado segue. `null` = lado sem parede (contorno aberto). */
  wallId: string | null;
}

/** A parede cujo eixo contém o segmento `a`–`b`, se houver. */
function paredeDoLado(walls: readonly Wall[], a: Point, b: Point): Wall | null {
  for (const w of walls) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w;
  }
  return null;
}

/**
 * Os lados de PISO de um ambiente — o contorno recuado até a FACE de cada
 * parede, com a parede de cada lado identificada.
 *
 * ⚠️ A face, e não o eixo: a tomada fica na face da parede, que é onde a
 * pessoa a vê e onde `orientacaoDaTomada` a faz apontar para dentro. No eixo
 * ela ficaria enterrada no meio da alvenaria e ambígua quanto ao lado.
 */
export function ladosDePiso(space: Space, walls: readonly Wall[]): LadoDoAmbiente[] {
  const n = space.ring.length;
  if (n < 3) return [];
  const paredes = space.ring.map((p, i) => paredeDoLado(walls, p, space.ring[(i + 1) % n]));
  const recuos = paredes.map((w) => (w ? w.thicknessMm / 2 : 0));
  const anel = anelRecuado(space.ring, recuos);
  if (anel.length !== n) return [];
  return anel.map((p, i) => ({
    a: p,
    b: anel[(i + 1) % n],
    wallId: paredes[i]?.id ?? null,
  }));
}

/** Um intervalo [de, ate] em mm ao longo de um lado, medido de `a`. */
interface Intervalo {
  de: number;
  ate: number;
}

/**
 * Os trechos UTILIZÁVEIS de um lado: o comprimento dele menos as aberturas da
 * parede (com folga) e menos a folga de canto nas duas pontas.
 */
function trechosUtilizaveis(
  lado: LadoDoAmbiente,
  walls: readonly Wall[],
  openings: readonly Opening[],
  folgaMm: number,
  ocupados: readonly Point[] = [],
): Intervalo[] {
  const comp = Math.hypot(lado.b.x - lado.a.x, lado.b.y - lado.a.y);
  if (comp <= 2 * folgaMm) return [];

  const bloqueados: Intervalo[] = [];
  // Tomadas que JÁ existem nesta face bloqueiam um trecho em volta: completar
  // pela norma não pode pôr a sugerida colada na que o projetista já pôs.
  if (ocupados.length > 0 && comp > 0) {
    const ux = (lado.b.x - lado.a.x) / comp;
    const uy = (lado.b.y - lado.a.y) / comp;
    for (const o of ocupados) {
      const dx = o.x - lado.a.x;
      const dy = o.y - lado.a.y;
      const ao = dx * ux + dy * uy;
      const perp = Math.abs(dx * uy - dy * ux);
      if (perp > 200 || ao < 0 || ao > comp) continue;
      bloqueados.push({ de: Math.max(0, ao - 2 * folgaMm), ate: Math.min(comp, ao + 2 * folgaMm) });
    }
  }
  const parede = lado.wallId ? walls.find((w) => w.id === lado.wallId) : null;
  if (parede) {
    // A abertura é medida de `wall.a` ao longo do EIXO. O lado de piso corre
    // paralelo ao eixo, mas pode começar em qualquer ponto dele e em qualquer
    // sentido: projeta-se o começo do lado sobre o eixo para converter.
    const ex = parede.b.x - parede.a.x;
    const ey = parede.b.y - parede.a.y;
    const compEixo = Math.hypot(ex, ey);
    if (compEixo > 0) {
      const ux = ex / compEixo;
      const uy = ey / compEixo;
      const posNoEixo = (p: Point) => (p.x - parede.a.x) * ux + (p.y - parede.a.y) * uy;
      const inicio = posNoEixo(lado.a);
      const fim = posNoEixo(lado.b);
      const mesmoSentido = fim >= inicio;
      for (const o of openings) {
        if (o.wallId !== parede.id) continue;
        const de = o.offsetMm - folgaMm;
        const ate = o.offsetMm + o.widthMm + folgaMm;
        // Converte para a régua do LADO (de `lado.a`).
        const ladoDe = mesmoSentido ? de - inicio : inicio - ate;
        const ladoAte = mesmoSentido ? ate - inicio : inicio - de;
        bloqueados.push({ de: Math.max(0, ladoDe), ate: Math.min(comp, ladoAte) });
      }
    }
  }

  // Subtrai os bloqueios do intervalo [folga, comp − folga].
  const livres: Intervalo[] = [];
  let cursor = folgaMm;
  for (const b of bloqueados.filter((x) => x.ate > x.de).sort((x, y) => x.de - y.de)) {
    if (b.de > cursor) livres.push({ de: cursor, ate: Math.min(b.de, comp - folgaMm) });
    cursor = Math.max(cursor, b.ate);
  }
  if (cursor < comp - folgaMm) livres.push({ de: cursor, ate: comp - folgaMm });
  return livres.filter((x) => x.ate - x.de > 0);
}

export interface PontoDistribuido {
  at: Point;
  wallId: string | null;
}

/**
 * Distribui `n` pontos ao longo dos lados, uniformemente pelo comprimento
 * UTILIZÁVEL — o que sobra depois de tirar portas, janelas e cantos.
 *
 * ⚠️ Uniforme pelo comprimento utilizável total, e não "n ÷ lados": um lado de
 * 6 m e outro de 1 m recebem pontos na proporção dos comprimentos, e um lado
 * inteiramente tomado por uma porta não recebe nenhum. Dividir por lado poria
 * uma tomada num pedaço de 40 cm entre a porta e o canto.
 *
 * Devolve MENOS que `n` só se não houver comprimento utilizável nenhum — e aí
 * devolve vazio, para quem chama dizer "sem parede livre" em vez de empilhar n
 * tomadas no mesmo ponto.
 */
export function distribuirAoLongo(
  lados: readonly LadoDoAmbiente[],
  n: number,
  walls: readonly Wall[],
  openings: readonly Opening[],
  folgaMm = 150,
  ocupados: readonly Point[] = [],
): PontoDistribuido[] {
  if (!Number.isInteger(n) || n <= 0) return [];

  const trechos: { lado: LadoDoAmbiente; de: number; ate: number }[] = [];
  for (const lado of lados) {
    for (const t of trechosUtilizaveis(lado, walls, openings, folgaMm, ocupados)) {
      trechos.push({ lado, ...t });
    }
  }
  const total = trechos.reduce((s, t) => s + (t.ate - t.de), 0);
  if (total <= 0) return [];

  const passo = total / n;
  const saida: PontoDistribuido[] = [];
  for (let k = 0; k < n; k++) {
    // No MEIO de cada fatia, e não no começo: n = 1 cai no centro do que há
    // de livre, que é onde uma tomada única faz sentido.
    let alvo = (k + 0.5) * passo;
    for (const t of trechos) {
      const comp = t.ate - t.de;
      if (alvo > comp) {
        alvo -= comp;
        continue;
      }
      const dist = t.de + alvo;
      const L = Math.hypot(t.lado.b.x - t.lado.a.x, t.lado.b.y - t.lado.a.y);
      const f = L > 0 ? dist / L : 0;
      saida.push({
        at: {
          x: Math.round(t.lado.a.x + (t.lado.b.x - t.lado.a.x) * f),
          y: Math.round(t.lado.a.y + (t.lado.b.y - t.lado.a.y) * f),
        },
        wallId: t.lado.wallId,
      });
      break;
    }
  }
  return saida;
}

/** Um lado de piso com o AMBIENTE de que ele é face. */
export interface LadoDaParede extends LadoDoAmbiente {
  spaceId: ObjectId;
  /** O nome do ambiente, para a tela dizer "do lado da Sala". */
  ambiente: string;
}

/**
 * As FACES de uma parede que dão para algum ambiente do nível — uma por
 * ambiente vizinho. A parede entre sala e cozinha tem duas; a externa, uma; a
 * que não fecha ambiente nenhum, nenhuma.
 *
 * ⚠️ É por FACE que se distribui, e não pelo eixo: a tomada fica de um lado da
 * parede, e "N tomadas nesta parede" só faz sentido quando se diz de que lado.
 * Quem chama, com duas faces, pergunta.
 */
export function ladosDaParede(
  model: Pick<BlueprintModel, 'spaces' | 'walls'>,
  wallId: ObjectId,
  levelId: ObjectId,
): LadoDaParede[] {
  const saida: LadoDaParede[] = [];
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  model.spaces
    .filter((s) => s.levelId === levelId)
    .forEach((s, i) => {
      for (const lado of ladosDePiso(s, paredes)) {
        if (lado.wallId !== wallId) continue;
        saida.push({ ...lado, spaceId: s.id, ambiente: s.name ?? `Ambiente ${i + 1}` });
      }
    });
  return saida;
}

/**
 * Os comandos que criam as tomadas SUGERIDAS nos pontos dados — um `AddTerminal`
 * por ponto, TUG, na cota baixa, com a marca `sugerida`.
 *
 * ⚠️ A marca é o que separa ajuda de decisão disfarçada: o ponto nasce
 * tracejado, o painel o conta como pendência, e MOVER limpa a marca — porque
 * mover é o ato de decidir onde a tomada fica. Ver `Terminal.sugerida`.
 *
 * Devolve comandos, não aplica: quem chama os passa num lote só, para que
 * "distribuir 4 tomadas" seja UM passo de desfazer.
 */
export function comandosDeTomadasSugeridas(
  levelId: ObjectId,
  pontos: readonly PontoDistribuido[],
): Command[] {
  return pontos.map((p) => ({
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'TUG — tomada de uso geral',
    tipoEletrico: 'TUG',
    at: p.at,
    cotaMm: COTA_TOMADA_SUGERIDA_MM,
    sugerida: true,
  }));
}

// ─── O MÍNIMO PELA NBR 5410 (9.5.2.2.1) ─────────────────────────────────────
//
// "Fatia 2" (10/09/2026). O que a norma manda, por classe de ambiente:
//
//   a) banheiro — pelo menos 1 ponto junto ao lavatório;
//   b) cozinha, copa, área de serviço, lavanderia — 1 a cada 3,5 m ou fração
//      de perímetro, e acima da bancada da pia pelo menos 2 tomadas;
//   c) varanda — pelo menos 1;
//   d) sala e dormitório — 1 a cada 5 m ou fração de perímetro;
//   e) demais — área ≤ 6 m²: pelo menos 1; área > 6 m²: 1 a cada 5 m ou
//      fração de perímetro.
//
// ⚠️ O que a conta NÃO faz: não fala em potência (9.5.2.2.2 — fica para a
// conferência), não desconta nada, e nunca sugere REMOVER: o mínimo é piso, e
// quem pôs mais do que ele pôs por projeto. Só o DÉFICIT vira sugestão.

/** Cota da tomada de bancada / lavatório — a "média" da NBR 5444 (1,30 m). */
export const COTA_TOMADA_MEDIA_MM = 1300;

export interface MinimoDeTomadas {
  /** Quantos pontos de tomada a norma pede, no mínimo. */
  minimo: number;
  /** Quantos deles precisam estar na altura MÉDIA (bancada / lavatório). */
  medias: number;
  /** A regra aplicada, em texto para a tela: "1 a cada 5 m de 14,2 m". */
  regra: string;
  /** Para a sugerida de altura média: onde o projetista deve levá-la. */
  ondeAMedia: string | null;
}

/**
 * O mínimo da norma para um ambiente de `tipo`, dado o perímetro INTERNO (m)
 * e a área útil (m²).
 *
 * ⚠️ "Ou fração" é teto: 14,2 m ÷ 5 = 2,84 → 3 pontos.
 */
export function minimoDeTomadas(
  tipo: TipoDeAmbiente,
  perimetroM: number,
  areaM2: number,
): MinimoDeTomadas {
  const porPerimetro = (passoM: number) => Math.max(1, Math.ceil(perimetroM / passoM - 1e-9));
  const p = perimetroM.toFixed(1).replace('.', ',');
  switch (tipo) {
    case 'BANHEIRO':
      return { minimo: 1, medias: 1, regra: '1 junto ao lavatório', ondeAMedia: 'junto ao lavatório' };
    case 'COZINHA_SERVICO': {
      const n = porPerimetro(3.5);
      return {
        minimo: Math.max(n, 2),
        medias: 2,
        regra: `1 a cada 3,5 m de ${p} m, 2 delas sobre a bancada`,
        ondeAMedia: 'sobre a bancada da pia',
      };
    }
    case 'VARANDA':
      return { minimo: 1, medias: 0, regra: 'pelo menos 1', ondeAMedia: null };
    case 'SALA_DORMITORIO':
      return { minimo: porPerimetro(5), medias: 0, regra: `1 a cada 5 m de ${p} m`, ondeAMedia: null };
    case 'OUTRO':
      if (areaM2 <= 6) {
        return { minimo: 1, medias: 0, regra: `pelo menos 1 (área ≤ 6 m²)`, ondeAMedia: null };
      }
      return { minimo: porPerimetro(5), medias: 0, regra: `1 a cada 5 m de ${p} m (área > 6 m²)`, ondeAMedia: null };
  }
}

/** O que há e o que falta num ambiente, frente ao mínimo. */
export interface ConferenciaDeTomadas extends MinimoDeTomadas {
  /** Tomadas (TUG/TUE) cujo ponto cai dentro do ambiente. */
  existentes: number;
  /** Das existentes, quantas estão na altura média. */
  existentesMedias: number;
  /** Quantas faltam para o mínimo (nunca negativo). */
  deficit: number;
  /** Quantas de altura média faltam (nunca negativo). */
  deficitMedias: number;
  /** Pontos elétricos SEM tipo dentro do ambiente — não contam, e é dito. */
  semTipo: number;
}

const ehTomada = (t: Terminal) =>
  t.disciplina === 'ELETRICA' && (t.tipoEletrico === 'TUG' || t.tipoEletrico === 'TUE');

/** Terminais elétricos cujo ponto cai dentro do contorno (de EIXO) do ambiente. */
export function terminaisDoAmbiente(space: Space, terminais: readonly Terminal[]): Terminal[] {
  return terminais.filter(
    (t) =>
      t.levelId === space.levelId &&
      t.disciplina === 'ELETRICA' &&
      pointInPolygon(space.ring, t.at) &&
      !space.holes.some((h) => pointInPolygon(h, t.at)),
  );
}

/** O perímetro INTERNO (pelas faces) em metros — o que a norma mede. */
export function perimetroInternoM(space: Space, walls: readonly Wall[]): number {
  const lados = ladosDePiso(space, walls);
  // Sem recuo possível (contorno degenerado), o de eixo — nunca zero.
  if (lados.length === 0) return space.perimeterMm / 1000;
  const mm = lados.reduce((s, l) => s + Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 0);
  return mm / 1000;
}

/**
 * Confere um ambiente contra o mínimo. `null` se o ambiente não tem tipo — a
 * norma conta por classe, e sem classe não há o que conferir.
 */
export function conferirTomadas(
  space: Space,
  tipo: TipoDeAmbiente | null | undefined,
  walls: readonly Wall[],
  terminais: readonly Terminal[],
  areaM2: number,
): ConferenciaDeTomadas | null {
  if (!tipo) return null;
  const minimo = minimoDeTomadas(tipo, perimetroInternoM(space, walls), areaM2);
  const dentro = terminaisDoAmbiente(space, terminais);
  const tomadas = dentro.filter(ehTomada);
  // "Média" pela MESMA fronteira do símbolo (`alturaDaTomada`): 800 ≤ cota < 1650.
  const medias = tomadas.filter((t) => t.cotaMm >= 800 && t.cotaMm < 1650).length;
  return {
    ...minimo,
    existentes: tomadas.length,
    existentesMedias: medias,
    deficit: Math.max(0, minimo.minimo - tomadas.length),
    deficitMedias: Math.max(0, minimo.medias - medias),
    semTipo: dentro.filter((t) => !t.tipoEletrico).length,
  };
}

/**
 * Os comandos que COMPLETAM o ambiente até o mínimo: `deficit` tomadas
 * sugeridas, das quais as primeiras `deficitMedias` na altura média e com o
 * rótulo de onde levá-las ("sobre a bancada da pia").
 *
 * ⚠️ Cria `max(deficit, deficitMedias)`: uma cozinha com 4 baixas e nenhuma
 * média já atende a contagem, mas ainda deve 2 sobre a bancada — e elas
 * nascem. Nunca cria zero em silêncio quando algo falta.
 */
export function comandosParaCompletar(
  levelId: ObjectId,
  pontos: readonly PontoDistribuido[],
  conferencia: ConferenciaDeTomadas,
): Command[] {
  const total = Math.max(conferencia.deficit, conferencia.deficitMedias);
  return pontos.slice(0, total).map((p, i) => {
    const media = i < conferencia.deficitMedias;
    return {
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: 'TUG — tomada de uso geral',
      tipoEletrico: 'TUG',
      at: p.at,
      cotaMm: media ? COTA_TOMADA_MEDIA_MM : COTA_TOMADA_SUGERIDA_MM,
      rotulo: media && conferencia.ondeAMedia ? `Posicione ${conferencia.ondeAMedia}` : null,
      sugerida: true,
    };
  });
}

// ─── ILUMINAÇÃO — NBR 5410 9.5.2.1 ─────────────────────────────────────────
//
// 9.5.2.1.1: em cada cômodo, pelo menos um ponto de luz fixo no TETO,
// comandado por INTERRUPTOR. 9.5.2.1.2: carga mínima de 100 VA até 6 m², e
// mais 60 VA a cada 4 m² inteiros acima disso. Vale para TODO cômodo — não
// depende do tipo do ambiente, e por isso é conferida mesmo no "a classificar".

/** A carga mínima de iluminação para a área útil dada (9.5.2.1.2). */
export function minimoDeIluminacaoVA(areaM2: number): number {
  if (areaM2 <= 6) return 100;
  return 100 + 60 * Math.floor((areaM2 - 6) / 4 + 1e-9);
}

export interface ConferenciaDeIluminacao {
  minimoVA: number;
  /** Pontos de luz de TETO dentro do ambiente. */
  luzesDeTeto: number;
  /** Todos os pontos de luz (teto, arandela, piso) dentro do ambiente. */
  luzes: number;
  interruptores: number;
  /** Soma das potências DECLARADAS dos pontos de luz. */
  declaradoVA: number;
  /** Pontos de luz sem potência — a soma acima não os inclui. */
  semPotencia: number;
  faltaLuzDeTeto: boolean;
  faltaInterruptor: boolean;
  /** Quanto falta para o mínimo (0 quando atende ou quando não dá para saber). */
  deficitVA: number;
}

const ehLuz = (t: Terminal) => t.tipoEletrico?.startsWith('ILUMINACAO') ?? false;

export function conferirIluminacao(
  space: Space,
  terminais: readonly Terminal[],
  areaM2: number,
): ConferenciaDeIluminacao {
  const dentro = terminaisDoAmbiente(space, terminais);
  const luzes = dentro.filter(ehLuz);
  const teto = luzes.filter((t) => t.tipoEletrico === 'ILUMINACAO_TETO');
  const interruptores = dentro.filter((t) => t.tipoEletrico === 'INTERRUPTOR');
  const minimoVA = minimoDeIluminacaoVA(areaM2);
  const comPotencia = luzes.filter((t) => t.potenciaW != null);
  const declaradoVA = comPotencia.reduce((s, t) => s + (t.potenciaW as number), 0);
  const semPotencia = luzes.length - comPotencia.length;
  return {
    minimoVA,
    luzesDeTeto: teto.length,
    luzes: luzes.length,
    interruptores: interruptores.length,
    declaradoVA,
    semPotencia,
    faltaLuzDeTeto: teto.length === 0,
    faltaInterruptor: interruptores.length === 0,
    // Com luz sem potência não se afirma déficit: a soma está incompleta.
    deficitVA: semPotencia > 0 ? 0 : Math.max(0, minimoVA - declaradoVA),
  };
}

/**
 * O ponto da FACE junto à primeira porta do ambiente — 200 mm além da folha,
 * do lado em que há parede —, ou `null` se o ambiente não tem porta.
 * É onde o interruptor vai por hábito; ainda assim nasce sugerido.
 */
export function pontoJuntoAPorta(
  space: Space,
  walls: readonly Wall[],
  openings: readonly Opening[],
  afastamentoMm = 200,
): Point | null {
  for (const lado of ladosDePiso(space, walls)) {
    if (!lado.wallId) continue;
    const parede = walls.find((w) => w.id === lado.wallId);
    if (!parede) continue;
    const porta = openings.find(
      (o) => o.wallId === parede.id && (o.kind === 'door' || o.kind === 'sliding'),
    );
    if (!porta) continue;
    const ex = parede.b.x - parede.a.x;
    const ey = parede.b.y - parede.a.y;
    const compEixo = Math.hypot(ex, ey);
    if (compEixo === 0) continue;
    const ux = ex / compEixo;
    const uy = ey / compEixo;
    const compLado = Math.hypot(lado.b.x - lado.a.x, lado.b.y - lado.a.y);
    const posNoEixo = (p: Point) => (p.x - parede.a.x) * ux + (p.y - parede.a.y) * uy;
    const inicio = posNoEixo(lado.a);
    const fim = posNoEixo(lado.b);
    const mesmoSentido = fim >= inicio;
    // Posição, na régua do LADO, das duas ombreiras da porta.
    const paraLado = (eixo: number) => (mesmoSentido ? eixo - inicio : inicio - eixo);
    const o1 = paraLado(porta.offsetMm);
    const o2 = paraLado(porta.offsetMm + porta.widthMm);
    const [ombreiraA, ombreiraB] = o1 < o2 ? [o1, o2] : [o2, o1];
    // Do lado em que sobra parede; prefere depois da porta.
    const candidatos = [ombreiraB + afastamentoMm, ombreiraA - afastamentoMm].filter(
      (d) => d > 0 && d < compLado,
    );
    if (candidatos.length === 0) continue;
    const f = candidatos[0] / compLado;
    return {
      x: Math.round(lado.a.x + (lado.b.x - lado.a.x) * f),
      y: Math.round(lado.a.y + (lado.b.y - lado.a.y) * f),
    };
  }
  return null;
}

/** A próxima letra de comando livre no ambiente: a, b, c… */
export function proximaLetraDeComando(space: Space, terminais: readonly Terminal[]): string {
  const usadas = new Set(
    terminaisDoAmbiente(space, terminais)
      .map((t) => t.comando?.trim().toLowerCase())
      .filter((c): c is string => !!c),
  );
  for (const letra of 'abcdefghijklmnopqrstuvwxyz') if (!usadas.has(letra)) return letra;
  return 'a';
}

/** Interruptor à altura da mão. */
export const COTA_USUAL_INTERRUPTOR_MM = 1100;

/**
 * Os comandos que COMPLETAM a iluminação do ambiente: a luz de teto no meio
 * do cômodo (na cota do pé-direito, com a carga MÍNIMA da norma já declarada
 * e o rótulo dizendo isso) e o interruptor junto à porta — os dois sugeridos,
 * com a mesma letra de comando.
 *
 * ⚠️ A potência vai preenchida com o mínimo porque ele é FATO da norma, não
 * escolha; o rótulo diz "mínimo da norma — confira" para ninguém achar que
 * alguém dimensionou. Deixar em branco faria o ponto nascer como pendência de
 * "sem potência" — pior que o mínimo explícito.
 */
export function comandosDeIluminacao(
  levelId: ObjectId,
  space: Space,
  walls: readonly Wall[],
  openings: readonly Opening[],
  peDireitoMm: number,
  conferencia: ConferenciaDeIluminacao,
  terminais: readonly Terminal[],
): Command[] {
  const cmds: Command[] = [];
  const letra = proximaLetraDeComando(space, terminais);
  if (conferencia.faltaLuzDeTeto) {
    cmds.push({
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: 'Luz de teto',
      tipoEletrico: 'ILUMINACAO_TETO',
      at: interiorPoint(space.ring, space.holes),
      cotaMm: peDireitoMm,
      comando: letra,
      potenciaW: conferencia.minimoVA,
      rotulo: `${conferencia.minimoVA} VA é o mínimo da norma — confira`,
      sugerida: true,
    });
  }
  if (conferencia.faltaInterruptor) {
    const paredes = walls.filter((w) => w.levelId === space.levelId);
    const junto = pontoJuntoAPorta(space, paredes, openings);
    const at = junto ?? distribuirAoLongo(ladosDePiso(space, paredes), 1, walls, openings)[0]?.at;
    if (at) {
      cmds.push({
        type: 'AddTerminal',
        levelId,
        disciplina: 'ELETRICA',
        tipo: 'Interruptor',
        tipoEletrico: 'INTERRUPTOR',
        at,
        cotaMm: COTA_USUAL_INTERRUPTOR_MM,
        comando: letra,
        rotulo: junto ? null : 'Posicione junto à porta',
        sugerida: true,
      });
    }
  }
  return cmds;
}
