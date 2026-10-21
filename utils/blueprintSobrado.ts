/**
 * O SOBRADO DA CASA AUTOMÁTICA (F12a, 15/10/2026) — a arquitetura dos dois pavimentos e a escada que os liga.
 *
 * O gerador E6.2 faz UM pavimento por chamada, não aceita cômodo fixo nem furo e não conhece escada. Medido em
 * 15/10: reservar o núcleo da escada como um ENTALHE no contorno antes de gerar desarruma o pavimento de cima
 * (sem quartos na frente, o corredor vai para a fachada e o entalhe come a repartição). O que funciona é o que um
 * projetista faz:
 *
 *  1. o PROGRAMA dividido: o térreo leva o social, o serviço, o lavabo e a garagem; o superior, os dormitórios,
 *     as suítes, os banhos e a circulação. No superior, os DORMITÓRIOS vão para a faixa da frente (a privacidade
 *     só para o zoneamento do gerador) — o corredor fica no MEIO, de lado a lado, e a suíte nos fundos;
 *  2. os dois pavimentos gerados no MESMO retângulo;
 *  3. o NÚCLEO recortado DEPOIS, na ponta do corredor de cima, encostado na fachada lateral: as paredes do gerador
 *     que o atravessam são cortadas na borda dele (as aberturas que caíam no trecho cortado saem), o núcleo ganha
 *     as suas paredes, e as portas: no superior, do patamar para o corredor; no térreo, para o melhor vizinho;
 *  4. a ESCADA em U dentro do núcleo: o patamar de partida/chegada (1,0 m) alinhado com o corredor de cima, os dois
 *     lances lado a lado e a virada do outro lado. O núcleo cresce para os fundos ou para a frente a partir do
 *     corredor — vale o lado que parte menos cômodos do térreo.
 *
 * Tudo no QUADRO LOCAL da frente (o mesmo do gerador): quem chama leva ao mundo com `comandosNoMundoDe`.
 */
import type { BlueprintModel, Command, ObjectId, Point, Wall } from './blueprintKernel';
import { applyBatch, contornoDoComponente, pavimentosDoNucleo, point, pointInPolygon, signedArea, uidDeterministico } from './blueprintKernel';
import { semEspiculas } from './blueprintDistribuicao';
import { HIPOTESES_PILARES_PADRAO, idsPrevistosDeEstrutura, pilaresExistentesNoNivel, planejarPilares, proximoNumeroDePilar, proximoNumeroDoRotulo, type HipotesesDePilares } from './blueprintPilaresAutomaticos';
import { alturaDaViga, HIPOTESES_VIGAS_PADRAO, type HipotesesDeVigas } from './blueprintVigasLajesAutomaticas';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO, sugerirGuardaCorpos } from './blueprintGuardaCorpo';
import { usoDoNome, type Programa, type UsoDoAmbiente } from './blueprintPrograma';
import type { AmbienteGerado, Retangulo } from './blueprintGerador';

/** O que vai para o térreo; o resto (dormitórios, suítes, banhos, circulação) sobe. */
export const USOS_DO_TERREO: ReadonlySet<string> = new Set<UsoDoAmbiente>(['SALA', 'COZINHA', 'AREA_DE_SERVICO', 'LAVABO', 'VARANDA', 'GARAGEM', 'ESCRITORIO'] as UsoDoAmbiente[]);

export interface HipotesesDoSobrado {
  /** Espessura da laje entre os pavimentos — o superior fica em pé-direito + laje. */
  lajeEntrePavimentosMm: number;
  /** O núcleo da escada (eixos das paredes): largura ao longo da fachada lateral × profundidade. */
  nucleoLarguraMm: number;
  nucleoProfundidadeMm: number;
  /** Espessura das paredes do núcleo. */
  paredeDoNucleoMm: number;
  /** A faixa do patamar de partida e chegada (alinhada com o corredor de cima). */
  patamarMm: number;
  /** Cada lance da escada em U (ao longo da profundidade do núcleo). */
  lanceMm: number;
  larguraDaEscadaMm: number;
  alvoEspelhoMm: number;
  larguraDaPortaMm: number;
  alturaDaPortaMm: number;
  /** Abaixo disto (% da área gerada) o ambiente que o núcleo come conta como PERDIDO na escolha do núcleo. */
  sobraMinimaDoAmbientePct: number;
  /** F12c: o lado do shaft das instalações junto do banheiro de cima, mm. */
  shaftMm: number;
  /** F14c: as peças de cima a até isto umas das outras descem pelo mesmo tubo de queda (um TQ por banheiro), mm. */
  grupoDoTuboDeQuedaMm: number;
  /** F14c: o shaft fica a até isto do centro das peças que despejam nele; mais longe, ganha um shaft junto delas, mm. */
  shaftAteAsPecasMm: number;
  /**
   * F14c (decisão do usuário, 16/10/2026: "laje rebaixada"): quanto a laje sob cada banheiro de cima desce, mm — o
   * esgoto dele corre no enchimento do piso até o tubo de queda, sem entrar no forro do térreo. 0 = sem rebaixo.
   * 22 cm: a laje rebaixada ainda fica ACIMA do forro do térreo (2,567 m com o padrão), que não precisa descer — nem
   * sob a cozinha, de 2,50 m; o tubo de queda colado nas peças deixa o ramal curto o bastante para o enchimento.
   */
  rebaixoDaLajeDoBanheiroMm: number;
  /**
   * F14c: o rebaixo cobre só a ÁREA MOLHADA — o retângulo das peças de esgoto do grupo mais esta margem (o shaft colado
   * nelas e o caimento do ramal), recortado pelo banheiro. Sob o banheiro inteiro, o rebaixo tirava do térreo faixas
   * de forro onde a água precisava passar (o banheiro da suíte cobria os fundos da casa e o aquecedor). mm.
   */
  margemDoRebaixoMm: number;
  /**
   * F14c: até onde o esgoto de cima busca o shaft para o tubo de queda, mm. O shaft junto das peças fica onde a parede
   * e os móveis deixam (no banheiro da suíte, comprido, o vaso e o lavatório tomam a ponta: 3,5 m) — com os 3 m de
   * antes, o tubo de queda descia no vaso, pelo meio da cozinha de baixo.
   */
  tuboDeQuedaAteOShaftMm: number;
  /**
   * F27-D2 (decisão do usuário, 18/10/2026: "recuado com terraço"): a faixa de terraço mais estreita que vale a pena —
   * o 2º pavimento que deixaria uma sobra menor que isto (na frente ou ao lado) ocupa a laje inteira naquele sentido, mm.
   */
  faixaMinimaDoTerracoMm: number;
  /**
   * F27 item 5.3 (decisão do usuário, 19/10/2026: "recuar o 1º também"): o 1º da casa de 3 recua só em PROFUNDIDADE
   * (a largura toda do térreo — as fachadas laterais sobre as dele, sem viga de transição nelas); `false` = como o 2º
   * (a proporção da casa). Ausente = true.
   */
  primeiroRecuaSoNaProfundidade?: boolean;
  /**
   * S5 da casa automática (20/10/2026): o lado do lavabo movido (`lavaboForaDoNucleo`) que encosta no cômodo seco ao
   * lado (a cozinha) tem ao menos isto — a porta interna e as folgas dos cantos —, para a porta dele ir para lá e não
   * para a área de serviço, mm. Ausente = o padrão.
   */
  ladoDoLavaboComAPortaMm?: number;
}

export const HIPOTESES_DO_SOBRADO_PADRAO: HipotesesDoSobrado = {
  lajeEntrePavimentosMm: 100,
  nucleoLarguraMm: 2400,
  nucleoProfundidadeMm: 3600,
  paredeDoNucleoMm: 150,
  patamarMm: 1000,
  lanceMm: 1820,
  larguraDaEscadaMm: 1000,
  alvoEspelhoMm: 175,
  larguraDaPortaMm: 900,
  alturaDaPortaMm: 2100,
  sobraMinimaDoAmbientePct: 50,
  shaftMm: 400,
  grupoDoTuboDeQuedaMm: 2500,
  shaftAteAsPecasMm: 2000,
  rebaixoDaLajeDoBanheiroMm: 220,
  margemDoRebaixoMm: 600,
  tuboDeQuedaAteOShaftMm: 4000,
  faixaMinimaDoTerracoMm: 1500,
  ladoDoLavaboComAPortaMm: 1150,
};

/** O programa repartido pelos pavimentos (as relações ficam só entre itens do mesmo pavimento). */
export function dividirPrograma(p: Programa): { terreo: Programa; superior: Programa } {
  const embaixo = p.itens.filter((i) => USOS_DO_TERREO.has(i.uso));
  // No superior, os dormitórios na faixa da FRENTE: o zoneamento do gerador põe o íntimo ao fundo e o resto à
  // frente; com tudo íntimo, o corredor iria para a fachada. Só o zoneamento muda — o item continua dormitório.
  const emCima = p.itens.filter((i) => !USOS_DO_TERREO.has(i.uso)).map((i) => (i.uso === 'DORMITORIO' ? { ...i, privacidade: 'SOCIAL' as const } : i));
  const so = (itens: typeof p.itens) => {
    const ids = new Set(itens.map((i) => i.id));
    return { ...p, itens, relacoes: p.relacoes.filter((r) => ids.has(r.a) && ids.has(r.b)) };
  };
  return { terreo: so(embaixo), superior: so(emCima) };
}

/**
 * F27-D da casa automática (decisão do usuário, 18/10/2026: "social embaixo, íntimo em cima"): o programa em TRÊS
 * pavimentos — o térreo com o social e o serviço (sem o escritório); o 2º com a suíte PRINCIPAL (a maior), o banheiro
 * dela (a relação obrigatória) e o escritório; o 1º com o resto (os dormitórios, as outras suítes, os banheiros). Sem
 * suíte, UM dormitório vai ao 2º (o item de quantidade N fica com N − 1 no 1º). A CIRCULAÇÃO existe nos dois de cima (a escada chega no corredor de cada um): no
 * 2º, uma cópia com id próprio (e as relações dela copiadas). Os dormitórios do 1º na faixa da frente, como no
 * sobrado (só o zoneamento muda); o do 2º fica no íntimo, atrás do corredor.
 */
export function dividirEmTres(p: Programa): { terreo: Programa; primeiro: Programa; segundo: Programa } {
  const noTerreo = (i: Programa['itens'][number]) => USOS_DO_TERREO.has(i.uso) && i.uso !== 'ESCRITORIO';
  const embaixo = p.itens.filter(noTerreo);
  const cima = p.itens.filter((i) => !noTerreo(i)).map((i) => (i.uso === 'DORMITORIO' ? { ...i, privacidade: 'SOCIAL' as const } : i));
  const area = (i: Programa['itens'][number]) => i.areaIdealM2 * Math.max(1, i.quantidade);
  const obrigatoria = (a: string, b: string) => p.relacoes.some((r) => r.tipo === 'OBRIGATORIA' && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  const suite = [...cima.filter((i) => i.uso === 'SUITE')].sort((a, b) => area(b) - area(a))[0];
  const principal = suite ?? [...cima.filter((i) => i.uso === 'DORMITORIO')].sort((a, b) => area(b) - area(a))[0];
  const banhoDela = principal ? cima.find((i) => i.uso === 'BANHEIRO' && obrigatoria(i.id, principal.id)) : undefined;
  // Um item com quantidade > 1 (os dormitórios simples) sobe com UMA unidade: no 2º, uma cópia de quantidade 1.
  const sobeInteiro = (i: Programa['itens'][number] | undefined) => !!i && Math.max(1, i.quantidade) === 1;
  const doSegundo = new Set([principal, banhoDela, ...cima.filter((i) => i.uso === 'ESCRITORIO')].filter(sobeInteiro).map((i) => i!.id));
  const circulacoes = cima.filter((i) => i.uso === 'CIRCULACAO');
  const umaUnidade = principal && !sobeInteiro(principal) ? principal : undefined;
  const copiadas = new Set([...circulacoes, ...(umaUnidade ? [umaUnidade] : [])].map((c) => c.id));
  // No 2º o dormitório volta ao íntimo (atrás do corredor, como a suíte): a faixa da frente é a do escritório — e do terraço.
  const doOriginal = (i: Programa['itens'][number]) => p.itens.find((o) => o.id === i.id) ?? i;
  const segundo = [
    ...cima.filter((i) => doSegundo.has(i.id)).map(doOriginal),
    ...(umaUnidade ? [{ ...doOriginal(umaUnidade), id: `${umaUnidade.id}:2`, quantidade: 1 }] : []),
    ...circulacoes.map((c) => ({ ...c, id: `${c.id}:2` })),
  ];
  const primeiro = cima.filter((i) => !doSegundo.has(i.id)).map((i) => (i === umaUnidade ? { ...i, quantidade: i.quantidade - 1 } : i));
  // As relações dos itens de cada pavimento; no 2º, as da circulação (e do dormitório que subiu) passam para a cópia.
  const so = (itens: typeof p.itens, renomear: (id: string) => string = (id) => id) => {
    const ids = new Set(itens.map((i) => i.id));
    const relacoes = p.relacoes.map((r) => ({ ...r, a: renomear(r.a), b: renomear(r.b) })).filter((r) => ids.has(r.a) && ids.has(r.b));
    return { ...p, itens, relacoes };
  };
  return { terreo: so(embaixo), primeiro: so(primeiro), segundo: so(segundo, (id) => (copiadas.has(id) ? `${id}:2` : id)) };
}

export interface NucleoDaEscada {
  ret: Retangulo;
  /** Em que fachada lateral o núcleo encosta. */
  lado: 'DIREITA' | 'ESQUERDA';
  /** `true` = a escada sobe para os fundos (o patamar na frente do núcleo, junto do corredor). */
  paraOsFundos: boolean;
  /** Ambientes (dos dois pavimentos) que o núcleo PARTE em dois. */
  partidos: string[];
  /** Ambientes que ficam abaixo da área mínima com o núcleo. */
  perdidos: string[];
  /** A pontuação da escolha (menor é melhor) — perdidos pesam 100; partidos, 10; o resto, a fração comida. */
  custo: number;
}

const areaDe = (r: Retangulo) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const sobreposicao = (a: Retangulo, b: Retangulo) => areaDe({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
/** O núcleo PARTE o ambiente em dois (a faixa dele atravessa o ambiente de um lado ao outro)? */
const parte = (n: Retangulo, a: Retangulo) => sobreposicao(n, a) > 0 && ((a.y0 < n.y0 && a.y1 > n.y1) || (a.x0 < n.x0 && a.x1 > n.x1));

/** Os pedaços de `a` fora do núcleo (até 4: à esquerda, à direita, à frente e aos fundos dele), o maior primeiro. */
export function pedacosFora(a: Retangulo, n: Retangulo): Retangulo[] {
  if (sobreposicao(a, n) <= 0) return [a];
  const ps: Retangulo[] = [
    { x0: a.x0, y0: a.y0, x1: Math.min(a.x1, n.x0), y1: a.y1 },
    { x0: Math.max(a.x0, n.x1), y0: a.y0, x1: a.x1, y1: a.y1 },
    { x0: Math.max(a.x0, n.x0), y0: a.y0, x1: Math.min(a.x1, n.x1), y1: Math.min(a.y1, n.y0) },
    { x0: Math.max(a.x0, n.x0), y0: Math.max(a.y0, n.y1), x1: Math.min(a.x1, n.x1), y1: a.y1 },
  ];
  return ps.filter((r) => r.x1 - r.x0 > 1 && r.y1 - r.y0 > 1).sort((p, q) => areaDe(q) - areaDe(p));
}

/**
 * Onde o núcleo fica: encostado numa fachada lateral (direita ou esquerda) do retângulo da casa, com o patamar sobre o
 * corredor de cima; cresce para os fundos ou para a frente. Das 4 opções, a que menos estraga os DOIS pavimentos: um
 * ambiente que fica abaixo da área mínima pesa 100; um partido em dois, 10; o resto, a fração comida (empate: direita, fundos).
 * `null` sem corredor no superior ou sem espaço. F27-D2: `sentidos` restringe para onde a escada sobe — na casa de 3
 * pavimentos, só para os fundos: o patamar fica na FRENTE do núcleo, onde o corredor do 2º (na frente do retângulo
 * recuado, quando não há escritório) o encontra; subindo para a frente, o núcleo ficava à frente do corredor de cima.
 */
export function escolherNucleo(
  casa: Retangulo,
  corredor: Retangulo | null,
  terreo: readonly AmbienteGerado[],
  superior: readonly AmbienteGerado[],
  hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO,
  sentidos: readonly boolean[] = [true, false],
): NucleoDaEscada | null {
  if (!corredor) return null;
  const cw = hip.nucleoLarguraMm;
  const cd = hip.nucleoProfundidadeMm;
  if (casa.x1 - casa.x0 < cw + 3000) return null;
  const opcoes: NucleoDaEscada[] = [];
  for (const lado of ['DIREITA', 'ESQUERDA'] as const) {
    const x0 = lado === 'DIREITA' ? casa.x1 - cw : casa.x0;
    for (const paraOsFundos of sentidos) {
      const y0 = paraOsFundos ? corredor.y0 : corredor.y1 - cd;
      const ret = { x0, y0, x1: x0 + cw, y1: y0 + cd };
      if (ret.y0 < casa.y0 || ret.y1 > casa.y1) continue;
      const partidos: string[] = [];
      const perdidos: string[] = [];
      let custo = 0;
      for (const a of [...terreo, ...superior]) {
        if (a.item.uso === 'CIRCULACAO') continue;
        const ov = sobreposicao(ret, a.ret);
        if (ov <= 0) continue;
        // Partido, só o maior pedaço continua sendo o ambiente; senão, o que sobra em volta do núcleo.
        const partido = parte(ret, a.ret);
        const resto = partido ? areaDe(pedacosFora(a.ret, ret)[0] ?? { x0: 0, y0: 0, x1: 0, y1: 0 }) : areaDe(a.ret) - ov;
        if (resto < Math.max(a.item.areaMinM2 * 1e6, (areaDe(a.ret) * hip.sobraMinimaDoAmbientePct) / 100)) {
          perdidos.push(a.nome);
          custo += 100;
        } else if (partido) {
          partidos.push(a.nome);
          custo += 10;
        } else custo += ov / areaDe(a.ret);
      }
      opcoes.push({ ret, lado, paraOsFundos, partidos, perdidos, custo });
    }
  }
  return opcoes.sort((a, b) => a.custo - b.custo)[0] ?? null;
}

type ParedeLocal = Extract<Command, { type: 'AddWalls' }>['walls'][number];
type AberturaLocal = Extract<Command, { type: 'AddOpenings' }>['openings'][number];

/** O intervalo de t (0–1) do segmento a→b DENTRO do retângulo aberto (encostar na borda não conta). */
function dentro(a: Point, b: Point, r: Retangulo): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  const lados: [number, number, number][] = [
    [-d.x, a.x - r.x0, 0],
    [d.x, r.x1 - a.x, 0],
    [-d.y, a.y - r.y0, 0],
    [d.y, r.y1 - a.y, 0],
  ];
  for (const [p, q] of lados) {
    if (Math.abs(p) < 1e-9) {
      if (q <= 0.5) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  const L = Math.hypot(d.x, d.y);
  return (t1 - t0) * L > 1 ? [t0, t1] : null;
}

/**
 * F27-D2 (decisão do usuário, 18/10/2026: "recuado com terraço"): o retângulo do 2º pavimento, no quadro da casa — nos
 * FUNDOS (o terraço fica na frente, para a rua) e encostado na fachada lateral do núcleo da escada (a sobra ao lado
 * também é terraço). A área é a do programa do 2º com o núcleo; a proporção, a da casa. Nunca mais estreito que o núcleo
 * mais 3 m (o mínimo de `escolherNucleo`), nem mais raso que o núcleo; a sobra menor que `faixaMinimaDoTerracoMm` não
 * vira terraço — o 2º toma a laje inteira naquele sentido.
 */
export function retanguloDoSegundo(casa: Retangulo, n: Pick<NucleoDaEscada, 'lado'>, areaM2: number, proporcaoFrenteFundo: number, hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO, malhaMm = 50, larguraToda = false): Retangulo {
  const naMalha = (v: number) => Math.round(v / malhaMm) * malhaMm;
  const W = casa.x1 - casa.x0;
  const D = casa.y1 - casa.y0;
  const A = areaM2 * 1e6;
  // F27 item 5.3: `larguraToda` — o 1º recuado só em profundidade.
  let w = larguraToda ? W : Math.min(W, Math.max(hip.nucleoLarguraMm + 3000, naMalha(Math.sqrt(A * proporcaoFrenteFundo))));
  if (W - w < hip.faixaMinimaDoTerracoMm) w = W;
  let d = Math.min(D, Math.max(hip.nucleoProfundidadeMm, naMalha(A / w)));
  if (D - d < hip.faixaMinimaDoTerracoMm) d = D;
  const x0 = n.lado === 'DIREITA' ? casa.x1 - w : casa.x0;
  return { x0, y0: casa.y1 - d, x1: x0 + w, y1: casa.y1 };
}

/**
 * F27-D5 (decisão do usuário, 18/10/2026: "recuado com terraço"): o CONTORNO do terraço que leva guarda-corpo — o
 * perímetro da casa (a laje do 1º) menos o que o 2º cobre com as paredes dele (os lados do retângulo recuado na borda da
 * casa) e menos o núcleo da escada encostado na fachada (as paredes dele sobem ao 2º). Polilinhas no quadro da casa, na
 * ordem do perímetro; vazio quando o 2º cobre a laje inteira.
 */
export function contornoDoTerraco(casa: Retangulo, segundo: Retangulo, nucleo: Retangulo | null = null): Point[][] {
  const cantos = [point(casa.x0, casa.y0), point(casa.x1, casa.y0), point(casa.x1, casa.y1), point(casa.x0, casa.y1)];
  const cobre = (r: Retangulo) => [
    { fixo: 'y' as const, valor: r.y0, de: r.x0, ate: r.x1 },
    { fixo: 'x' as const, valor: r.x1, de: r.y0, ate: r.y1 },
    { fixo: 'y' as const, valor: r.y1, de: r.x0, ate: r.x1 },
    { fixo: 'x' as const, valor: r.x0, de: r.y0, ate: r.y1 },
  ];
  const cobertos = [...cobre(segundo), ...(nucleo ? cobre(nucleo) : [])];
  const trechos: [Point, Point][] = [];
  for (let i = 0; i < 4; i++) {
    const a = cantos[i];
    const b = cantos[(i + 1) % 4];
    const fixo = a.y === b.y ? 'y' : 'x';
    const valor = fixo === 'y' ? a.y : a.x;
    const [p0, p1] = fixo === 'y' ? [a.x, b.x] : [a.y, b.y];
    const lo = Math.min(p0, p1);
    const hi = Math.max(p0, p1);
    const tirar = cobertos.filter((c) => c.fixo === fixo && Math.abs(c.valor - valor) < 1).map((c) => [Math.max(lo, c.de), Math.min(hi, c.ate)] as [number, number]).filter(([x, y]) => y > x).sort((u, v) => u[0] - v[0]);
    let ini = lo;
    const livres: [number, number][] = [];
    for (const [x, y] of tirar) {
      if (x > ini) livres.push([ini, x]);
      ini = Math.max(ini, y);
    }
    if (hi > ini) livres.push([ini, hi]);
    const crescente = p1 >= p0;
    for (const [x, y] of crescente ? livres : [...livres].reverse()) {
      const [s, e] = crescente ? [x, y] : [y, x];
      trechos.push(fixo === 'y' ? [point(s, valor), point(e, valor)] : [point(valor, s), point(valor, e)]);
    }
  }
  // Os trechos que se encontram (a quina do perímetro) viram uma polilinha só; a última pode emendar na primeira.
  const linhas: Point[][] = [];
  for (const [a, b] of trechos) {
    const ult = linhas[linhas.length - 1];
    if (ult && ult[ult.length - 1].x === a.x && ult[ult.length - 1].y === a.y) ult.push(b);
    else linhas.push([a, b]);
  }
  if (linhas.length > 1) {
    const [pri, ult] = [linhas[0], linhas[linhas.length - 1]];
    if (ult[ult.length - 1].x === pri[0].x && ult[ult.length - 1].y === pri[0].y) {
      linhas[0] = [...ult, ...pri.slice(1)];
      linhas.pop();
    }
  }
  return linhas.filter((l) => l.length >= 2);
}

/**
 * F27-D5: o 2º abre para o terraço — se nenhuma porta dele dá para o terraço (as paredes do retângulo recuado que não
 * ficam na borda da casa), a maior janela de cômodo seco nessas paredes vira PORTA DE CORRER (a mesma largura, do piso
 * à altura da porta). Na planta invertida a "entrada" do gerador fica nos fundos e a frente só tinha janelas. Devolve os
 * comandos (no quadro da casa) e o cômodo que ganhou a porta (`null` = já havia porta, ou não há janela que sirva).
 */
export function portaParaOTerraco(
  cmds: readonly Command[],
  casa: Retangulo,
  ambientes: readonly AmbienteGerado[],
  alturaDaPortaMm: number,
): { comandos: Command[]; comodo: string | null } {
  const paredes = cmds.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  const naBorda = (w: ParedeLocal) => (w.a.x === w.b.x && (w.a.x === casa.x0 || w.a.x === casa.x1)) || (w.a.y === w.b.y && (w.a.y === casa.y0 || w.a.y === casa.y1));
  // As paredes externas do 2º (as do retângulo dele) que dão para o terraço: no contorno do 2º e fora da borda da casa.
  const xs = paredes.flatMap((w) => [w.a.x, w.b.x]);
  const ys = paredes.flatMap((w) => [w.a.y, w.b.y]);
  const doContorno = (w: ParedeLocal) => (w.a.x === w.b.x && (w.a.x === Math.min(...xs) || w.a.x === Math.max(...xs))) || (w.a.y === w.b.y && (w.a.y === Math.min(...ys) || w.a.y === Math.max(...ys)));
  const paraOTerraco = new Map(paredes.filter((w) => doContorno(w) && !naBorda(w)).map((w) => [w.uid, w]));
  const aberturas = cmds.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : []));
  if (aberturas.some((o) => (o.kind === 'door' || o.kind === 'sliding') && paraOTerraco.has(o.wallUid ?? ''))) return { comandos: [...cmds], comodo: null };
  const ondeFica = (o: AberturaLocal) => {
    const w = paraOTerraco.get(o.wallUid ?? '')!;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const t = o.offsetMm + o.widthMm / 2;
    return { x: w.a.x + ((w.b.x - w.a.x) * t) / L, y: w.a.y + ((w.b.y - w.a.y) * t) / L };
  };
  const seco = (o: AberturaLocal) => {
    const p = ondeFica(o);
    const a = ambientes.find((x) => p.x >= x.ret.x0 - 200 && p.x <= x.ret.x1 + 200 && p.y >= x.ret.y0 - 200 && p.y <= x.ret.y1 + 200);
    return a && !['BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO', 'COZINHA'].includes(a.item.uso) ? a : null;
  };
  const janela = aberturas.filter((o) => o.kind === 'window' && paraOTerraco.has(o.wallUid ?? '') && seco(o)).sort((p, q) => q.widthMm - p.widthMm)[0];
  if (!janela) return { comandos: [...cmds], comodo: null };
  const comodo = seco(janela)!.nome;
  const comandos = cmds.map((c) => (c.type === 'AddOpenings' ? { ...c, openings: c.openings.map((o) => (o === janela ? { ...o, kind: 'sliding', sillMm: 0, heightMm: alturaDaPortaMm } : o)) } : c)) as Command[];
  return { comandos, comodo };
}

/**
 * F27-D4 (decisão do usuário, 19/10/2026: "colado na escada"): o banheiro da suíte do 2º além da PONTA do núcleo — na
 * faixa do núcleo (a largura dele, encostada na fachada), da parede de topo dele até o fim da faixa da suíte. O shaft
 * desce encostado nessa parede de topo, que existe igual nos três pavimentos e não tem janela (a porta do núcleo é na
 * parede de dentro). A suíte fica com a faixa ao lado, na profundidade toda, encostada no corredor. Só quando a suíte e o
 * banheiro formam um retângulo (um atrás do outro, na largura toda) do lado do corredor para onde o núcleo avança, e
 * os dois ficam acima das medidas mínimas; senão nada muda (`false`).
 */
export function banheiroAlemDoNucleo(ambientes: AmbienteGerado[], n: Pick<NucleoDaEscada, 'ret' | 'lado' | 'paraOsFundos'>): boolean {
  const suite = ambientes.find((a) => a.item.uso === 'SUITE');
  const banho = ambientes.find((a) => a.item.uso === 'BANHEIRO');
  if (!suite || !banho) return false;
  const [s, b] = [suite.ret, banho.ret];
  if (s.x0 !== b.x0 || s.x1 !== b.x1 || (s.y1 !== b.y0 && b.y1 !== s.y0)) return false;
  const z: Retangulo = { x0: s.x0, x1: s.x1, y0: Math.min(s.y0, b.y0), y1: Math.max(s.y1, b.y1) };
  const r = n.ret;
  // O núcleo na beirada da faixa, do lado da fachada dele, e avançando para dentro dela.
  if (n.lado === 'DIREITA' ? r.x1 !== z.x1 : r.x0 !== z.x0) return false;
  const ponta = n.paraOsFundos ? r.y1 : r.y0;
  if (!(ponta > z.y0 && ponta < z.y1)) return false;
  const novoBanho: Retangulo = { x0: r.x0, x1: r.x1, y0: n.paraOsFundos ? ponta : z.y0, y1: n.paraOsFundos ? z.y1 : ponta };
  const novaSuite: Retangulo = n.lado === 'DIREITA' ? { x0: z.x0, x1: r.x0, y0: z.y0, y1: z.y1 } : { x0: r.x1, x1: z.x1, y0: z.y0, y1: z.y1 };
  const lado = (q: Retangulo) => Math.min(q.x1 - q.x0, q.y1 - q.y0);
  const area = (q: Retangulo) => ((q.x1 - q.x0) * (q.y1 - q.y0)) / 1e6;
  if (lado(novoBanho) < banho.item.larguraMinMm || area(novoBanho) < banho.item.areaMinM2) return false;
  if (lado(novaSuite) < suite.item.larguraMinMm || area(novaSuite) < suite.item.areaMinM2) return false;
  for (const [a, q] of [[banho, novoBanho], [suite, novaSuite]] as const) {
    a.ret = q;
    a.areaM2 = Math.round(area(q) * 100) / 100;
    a.larguraMinM = lado(q) / 1000;
  }
  return true;
}

/**
 * F27 item 5 da casa automática (decisão do usuário, 19/10/2026: "mover o lavabo"): o lavabo do térreo que o núcleo da
 * escada espreme (o que sobra dele fica abaixo da largura ou da área mínima — 10 × 30, 4 dorm., 3 pavimentos: 0,65 m e
 * 1,33 m² livres) troca de ponta com o vizinho com quem forma um retângulo (a área de serviço, um atrás do outro): o
 * vizinho fica do lado do núcleo, que come só o começo dele, e o lavabo vai para a outra ponta, com a área ideal (nunca
 * menos que a largura mínima mais a parede). A tira ao lado do núcleo, estreita demais para qualquer um dos dois, vai
 * para o cômodo que encosta nela na altura toda do par (a cozinha). Só com o núcleo cobrindo o par de lado a lado a
 * partir de uma ponta, e com os três acima das medidas mínimas; senão nada muda (`false`).
 */
export function lavaboForaDoNucleo(ambientes: AmbienteGerado[], n: Pick<NucleoDaEscada, 'ret'>, hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO, malhaMm = 50): boolean {
  const lav = ambientes.find((a) => a.item.uso === 'LAVABO');
  if (!lav || sobreposicao(n.ret, lav.ret) <= 0) return false;
  const f = hip.paredeDoNucleoMm;
  const lado = (q: Retangulo) => Math.min(q.x1 - q.x0, q.y1 - q.y0);
  const cabe = (a: AmbienteGerado, q: Retangulo) => lado(q) - f >= a.item.larguraMinMm && areaDe(q) >= a.item.areaMinM2 * 1e6;
  const sobra = pedacosFora(lav.ret, n.ret)[0];
  if (sobra && cabe(lav, sobra)) return false;
  // Tudo no quadro em que o par se empilha em y (o outro, transposto).
  const tr = (q: Retangulo): Retangulo => ({ x0: q.y0, y0: q.x0, x1: q.y1, y1: q.x1 });
  for (const viz of ambientes) {
    if (viz === lav || viz.item.uso === 'CIRCULACAO') continue;
    for (const transposto of [false, true]) {
      const t = (q: Retangulo) => (transposto ? tr(q) : q);
      const [L, X, N] = [t(lav.ret), t(viz.ret), t(n.ret)];
      if (L.x0 !== X.x0 || L.x1 !== X.x1 || (L.y1 !== X.y0 && X.y1 !== L.y0)) continue;
      const Z: Retangulo = { x0: L.x0, x1: L.x1, y0: Math.min(L.y0, X.y0), y1: Math.max(L.y1, X.y1) };
      // O núcleo encosta num lado do par (em x) e cobre uma ponta dele (em y).
      const encostaNoFim = N.x1 >= Z.x1 && N.x0 > Z.x0;
      const encostaNoInicio = N.x0 <= Z.x0 && N.x1 < Z.x1;
      const cobreTudoEmX = N.x0 <= Z.x0 && N.x1 >= Z.x1;
      if (!encostaNoFim && !encostaNoInicio && !cobreTudoEmX) continue;
      const pontaDeCima = N.y0 <= Z.y0 && N.y1 > Z.y0 && N.y1 < Z.y1;
      const pontaDeBaixo = N.y1 >= Z.y1 && N.y0 < Z.y1 && N.y0 > Z.y0;
      if (!pontaDeCima && !pontaDeBaixo) continue;
      // A tira ao lado do núcleo e quem a absorve: o cômodo que encosta nela na altura toda do par.
      const tira: Retangulo | null = cobreTudoEmX ? null : encostaNoFim ? { x0: Z.x0, x1: N.x0, y0: Z.y0, y1: Z.y1 } : { x0: N.x1, x1: Z.x1, y0: Z.y0, y1: Z.y1 };
      const dono = tira
        ? ambientes.find((c) => {
            if (c === lav || c === viz || c.item.uso === 'CIRCULACAO') return false;
            const C = t(c.ret);
            return C.y0 === Z.y0 && C.y1 === Z.y1 && (encostaNoFim ? C.x1 === Z.x0 : C.x0 === Z.x1);
          })
        : null;
      if (tira && !dono) continue;
      const col: Retangulo = tira ? (encostaNoFim ? { ...Z, x0: N.x0 } : { ...Z, x1: N.x1 }) : Z;
      const largura = col.x1 - col.x0;
      // S5: com o cômodo seco ao lado (o dono da tira, a cozinha), o lado do lavabo encostado nele comporta a porta.
      const ladoDaPorta = dono ? (hip.ladoDoLavaboComAPortaMm ?? HIPOTESES_DO_SOBRADO_PADRAO.ladoDoLavaboComAPortaMm ?? 0) : 0;
      const prof = Math.ceil(Math.max(lav.item.areaIdealM2 * 1e6 / largura, lav.item.larguraMinMm + f, ladoDaPorta) / malhaMm) * malhaMm;
      const novoLav: Retangulo = pontaDeCima ? { ...col, y0: col.y1 - prof } : { ...col, y1: col.y0 + prof };
      const novoViz: Retangulo = pontaDeCima ? { ...col, y1: novoLav.y0 } : { ...col, y0: novoLav.y1 };
      const restoDoViz: Retangulo = pontaDeCima ? { ...novoViz, y0: Math.max(novoViz.y0, N.y1) } : { ...novoViz, y1: Math.min(novoViz.y1, N.y0) };
      if (sobreposicao(N, novoLav) > 0 || restoDoViz.y1 <= restoDoViz.y0) continue;
      if (!cabe(lav, novoLav) || !cabe(viz, restoDoViz)) continue;
      const novoDono: Retangulo | null = dono && tira ? (encostaNoFim ? { ...t(dono.ret), x1: tira.x1 } : { ...t(dono.ret), x0: tira.x0 }) : null;
      for (const [a, q] of [[lav, novoLav], [viz, novoViz], ...(dono && novoDono ? [[dono, novoDono]] : [])] as [AmbienteGerado, Retangulo][]) {
        a.ret = t(q);
        a.areaM2 = Math.round(areaDe(q) / 1e4) / 100;
        a.larguraMinM = lado(q) / 1000;
      }
      return true;
    }
  }
  return false;
}

/**
 * F27-D2: o 2º pavimento com o CORREDOR no patamar da escada. O gerador põe o corredor numa faixa de lado a lado do
 * retângulo e a planta só se desloca com ele (a malha é a mesma): gerado no lugar inicial, o retângulo ANDA até o meio
 * do patamar cair no corredor; a sobra menor que `faixaMinimaDoTerracoMm` (na frente ou nos fundos) o 2º toma, o que
 * muda a planta — aí gera de novo. Nunca encolhe (a área é a do programa): o que sairia da casa troca o sentido da
 * planta (`invertida` — o íntimo à frente do corredor, o que o gerador chama de frente nos fundos). O núcleo pode sobrar
 * fora do retângulo: `pavimentoComNucleo` fecha os lados dele que nenhuma parede cobre, a fachada inclusive.
 * `null` = nenhum dos dois sentidos fechou em `voltas`.
 */
export function alinharSegundoAoPatamar<R extends { ambientes: readonly AmbienteGerado[] }>(
  gerarEm: (ret: Retangulo, invertida: boolean) => R | null,
  casa: Retangulo,
  inicial: Retangulo,
  n: Pick<NucleoDaEscada, 'ret' | 'paraOsFundos'>,
  hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO,
  malhaMm = 50,
  voltas = 4,
  sentidos: readonly boolean[] = [false, true],
): { r: R; ret: Retangulo; invertida: boolean } | null {
  const meio = n.paraOsFundos ? n.ret.y0 + hip.patamarMm / 2 : n.ret.y1 - hip.patamarMm / 2;
  for (const invertida of sentidos) {
    let ret = inicial;
    for (let v = 0; v < voltas; v++) {
      const r = gerarEm(ret, invertida);
      const cor = r?.ambientes.find((a) => a.item.uso === 'CIRCULACAO')?.ret;
      if (!r || !cor) break;
      if (cor.y0 < meio && meio < cor.y1) return { r, ret, invertida };
      const desloca = Math.round((meio - (cor.y0 + cor.y1) / 2) / malhaMm) * malhaMm;
      let y0 = ret.y0 + desloca;
      let y1 = ret.y1 + desloca;
      if (y0 < casa.y0 || y1 > casa.y1) break;
      // A sobra que não chega a terraço (frente ou fundos) o 2º toma — como em `retanguloDoSegundo`.
      if (casa.y1 - y1 < hip.faixaMinimaDoTerracoMm) y1 = casa.y1;
      if (y0 - casa.y0 < hip.faixaMinimaDoTerracoMm) y0 = casa.y0;
      ret = { ...ret, y0, y1 };
    }
  }
  return null;
}

/** Folga entre a porta que anda na lateral do núcleo e o núcleo ou outra abertura da parede, mm. */
const FOLGA_DA_PORTA_NA_LATERAL_MM = 150;

/**
 * Pendência antiga da casa automática (21/10/2026): a PORTA que caiu na lateral do núcleo, no trecho dele, passa a abrir
 * para a escada — e o cômodo que o núcleo comeu perde a porta (a cozinha e o serviço do 10 × 30 de 4 dorm., 3 pav.: a
 * relação obrigatória sem porta direta). Ela anda pela mesma parede para fora do trecho do núcleo, onde o cômodo continua,
 * sem encostar noutra abertura; sem lugar, fica.
 */
function naLateralDoNucleo(o: AberturaLocal, paredes: readonly ParedeLocal[], todas: readonly AberturaLocal[], n: Retangulo): AberturaLocal {
  if (o.kind !== 'door') return o;
  const w = paredes.find((x) => x.uid && x.uid === o.wallUid);
  if (!w) return o;
  const vertical = Math.abs(w.a.x - w.b.x) < 1;
  const horizontal = Math.abs(w.a.y - w.b.y) < 1;
  const naLateral = (vertical && (Math.abs(w.a.x - n.x0) < 1 || Math.abs(w.a.x - n.x1) < 1)) || (horizontal && (Math.abs(w.a.y - n.y0) < 1 || Math.abs(w.a.y - n.y1) < 1));
  if (!naLateral) return o;
  const ao = vertical ? 'y' : 'x';
  const crescente = w.b[ao] >= w.a[ao];
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  // O trecho do núcleo na régua da parede (offset a partir de `a`).
  const naRegua = (v: number) => (crescente ? v - w.a[ao] : w.a[ao] - v);
  const [n0, n1] = [naRegua(vertical ? n.y0 : n.x0), naRegua(vertical ? n.y1 : n.x1)].sort((x, y) => x - y);
  if (o.offsetMm + o.widthMm <= n0 || o.offsetMm >= n1) return o;
  const f = FOLGA_DA_PORTA_NA_LATERAL_MM;
  const daParede = todas.filter((x) => x !== o && x.wallUid === o.wallUid);
  const outras = daParede.map((x) => [x.offsetMm - f, x.offsetMm + x.widthMm + f] as const);
  // E sem atravessar o encontro com outra parede (o começo de outro cômodo: a porta do serviço abria também para o lavabo).
  const encontros = paredes
    .filter((x) => x !== w)
    .flatMap((x) => [x.a, x.b])
    .filter((p) => (vertical ? Math.abs(p.x - w.a.x) < 1 : Math.abs(p.y - w.a.y) < 1))
    .map((p) => naRegua(p[ao]))
    .filter((d) => d > 1 && d < L - 1);
  const cabe = (off: number) =>
    off >= f && off + o.widthMm <= L - f && !(off < n1 + f && off + o.widthMm > n0 - f) && !outras.some(([a, b]) => off < b && off + o.widthMm > a) && !encontros.some((d) => d > off - f && d < off + o.widthMm + f);
  // Como no gerador (F20), junto das outras PORTAS da parede — o resto dela fica livre para as peças do cômodo (o tanque
  // e a máquina do serviço iam para a parede do núcleo, sob a viga de transição, e a fria passava pelo pilar dela). Sem
  // outra porta, o mais perto de onde estava.
  const portas = daParede.filter((x) => x.kind === 'door').map((x) => x.offsetMm + x.widthMm / 2);
  const custo = (off: number) => (portas.length ? Math.min(...portas.map((m) => Math.abs(off + o.widthMm / 2 - m))) : Math.abs(off - o.offsetMm));
  let melhor: number | null = null;
  for (let off = 0; off + o.widthMm <= L; off += 50) if (cabe(off) && (melhor == null || custo(off) < custo(melhor))) melhor = off;
  return melhor != null ? { ...o, offsetMm: Math.round(melhor) } : o;
}

/**
 * As paredes e aberturas do pavimento com o núcleo recortado: a parede que o atravessa vira um ou dois pedaços (o
 * segundo com uid novo, derivado do antigo); a abertura que caía no trecho cortado sai; a do segundo pedaço é
 * re-ancorada (uid e offset).
 */
export function recortarNucleo(cmds: readonly Command[], nucleo: Retangulo): Command[] {
  const novasParedes: ParedeLocal[] = [];
  const reancora = new Map<string, { inicio: number; fim: number; uid: string; deslocamento: number }[]>();
  for (const c of cmds) {
    if (c.type !== 'AddWalls') continue;
    for (const w of c.walls) {
      const r = dentro(w.a, w.b, nucleo);
      if (!r) {
        novasParedes.push(w);
        continue;
      }
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const em = (t: number) => point(Math.round(w.a.x + (w.b.x - w.a.x) * t), Math.round(w.a.y + (w.b.y - w.a.y) * t));
      const pedacos: { inicio: number; fim: number; uid: string; deslocamento: number }[] = [];
      if (r[0] * L > 1) {
        novasParedes.push({ ...w, b: em(r[0]) });
        pedacos.push({ inicio: 0, fim: r[0] * L, uid: w.uid ?? '', deslocamento: 0 });
      }
      if ((1 - r[1]) * L > 1) {
        const uid = w.uid ? uidDeterministico(`${w.uid}:alem-do-nucleo`) : undefined;
        novasParedes.push({ ...w, a: em(r[1]), uid });
        pedacos.push({ inicio: r[1] * L, fim: L, uid: uid ?? '', deslocamento: r[1] * L });
      }
      if (w.uid) reancora.set(w.uid, pedacos);
    }
  }
  const novasAberturas: AberturaLocal[] = [];
  const todasAsAberturas = cmds.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : []));
  for (const c of cmds) {
    if (c.type !== 'AddOpenings') continue;
    for (const o of c.openings) {
      const pedacos = o.wallUid ? reancora.get(o.wallUid) : undefined;
      if (!pedacos) {
        novasAberturas.push(naLateralDoNucleo(o, novasParedes, todasAsAberturas, nucleo));
        continue;
      }
      const p = pedacos.find((x) => o.offsetMm >= x.inicio - 0.5 && o.offsetMm + o.widthMm <= x.fim + 0.5);
      if (p) novasAberturas.push({ ...o, wallUid: p.uid, offsetMm: Math.round(o.offsetMm - p.deslocamento) });
    }
  }
  const out: Command[] = [];
  for (const c of cmds) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: novasParedes });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: novasAberturas });
    else out.push(c);
  }
  return out;
}

/** Os trechos da linha [de, ate] (ao longo de um eixo) que nenhuma parede colinear já cobre. */
function descobertos(paredes: readonly ParedeLocal[], fixo: 'x' | 'y', valor: number, de: number, ate: number): [number, number][] {
  const ao = fixo === 'x' ? 'y' : 'x';
  const cobertos = paredes
    .filter((w) => Math.abs(w.a[fixo] - valor) < 1 && Math.abs(w.b[fixo] - valor) < 1)
    .map((w) => [Math.min(w.a[ao], w.b[ao]), Math.max(w.a[ao], w.b[ao])] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const livres: [number, number][] = [];
  let cur = de;
  for (const [s, e] of cobertos) {
    if (e <= cur || s >= ate) continue;
    if (s > cur + 1) livres.push([cur, Math.min(s, ate)]);
    cur = Math.max(cur, e);
  }
  if (cur < ate - 1) livres.push([cur, ate]);
  return livres;
}

/** A parede colinear que contém o trecho [p0, p1] da linha, e o offset do começo do trecho medido do `a` dela. */
function paredeQueContem(paredes: readonly ParedeLocal[], fixo: 'x' | 'y', valor: number, p0: number, p1: number): { uid: string; offsetMm: number } | null {
  const ao = fixo === 'x' ? 'y' : 'x';
  for (const w of paredes) {
    if (Math.abs(w.a[fixo] - valor) >= 1 || Math.abs(w.b[fixo] - valor) >= 1 || !w.uid) continue;
    const lo = Math.min(w.a[ao], w.b[ao]);
    const hi = Math.max(w.a[ao], w.b[ao]);
    if (p0 < lo - 0.5 || p1 > hi + 0.5) continue;
    const crescente = w.b[ao] >= w.a[ao];
    return { uid: w.uid, offsetMm: Math.round(crescente ? p0 - w.a[ao] : w.a[ao] - p1) };
  }
  return null;
}

/** Os vizinhos preferidos para a porta do núcleo no térreo (o primeiro que encosta vence). */
const PREFERENCIA_NO_TERREO: string[] = ['SALA', 'VARANDA', 'COZINHA', 'ESCRITORIO', 'AREA_DE_SERVICO', 'GARAGEM', 'LAVABO'];

export interface PavimentoDoSobrado {
  /** Os comandos do pavimento, no quadro local, com o núcleo recortado, as paredes e a porta dele. */
  comandos: Command[];
  /** Onde ficou a porta do núcleo (`null` = nenhum vizinho servia — vira pendência). */
  porta: { vizinho: string; lado: 'DENTRO' | 'FRENTE' | 'FUNDOS' } | null;
}

/**
 * O pavimento com o núcleo: recorta, fecha os lados do núcleo que nenhuma parede cobre e abre a porta. No superior
 * (`corredor` dado), a porta é do patamar para o corredor, na parede de dentro; no térreo, para o melhor vizinho do
 * patamar (sala antes de tudo), na parede de dentro ou na face do patamar.
 */
export function pavimentoComNucleo(
  cmds: readonly Command[],
  levelId: ObjectId,
  n: NucleoDaEscada,
  ambientes: readonly AmbienteGerado[],
  chaveDoPavimento: string,
  alturaDaParedeMm: number,
  hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO,
  corredor: Retangulo | null = null,
): PavimentoDoSobrado {
  const r = n.ret;
  // As etiquetas: a do ambiente cujo centro caiu no núcleo (ou nas paredes dele — o kernel a daria ao núcleo) vai
  // para o maior pedaço que sobrou dele; o núcleo ganha a sua.
  const f = hip.paredeDoNucleoMm;
  const realocadas = cmds.map((c) => {
    if (c.type !== 'PlaceSpaceLabels') return c;
    return {
      ...c,
      labels: [
        ...c.labels.map((l) => {
          if (!(l.at.x > r.x0 - f && l.at.x < r.x1 + f && l.at.y > r.y0 - f && l.at.y < r.y1 + f)) return l;
          const a = ambientes.find((x) => x.nome === l.name);
          const pedaco = a ? pedacosFora(a.ret, r)[0] : undefined;
          return pedaco ? { ...l, at: point(Math.round((pedaco.x0 + pedaco.x1) / 2), Math.round((pedaco.y0 + pedaco.y1) / 2)) } : l;
        }),
        { levelId, at: point(Math.round((r.x0 + r.x1) / 2), Math.round((r.y0 + r.y1) / 2)), name: 'Escada', uso: 'CIRCULACAO' },
      ],
    } as Command;
  });
  const recortado = recortarNucleo(realocadas, r);
  const existentes = recortado.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  // Os lados do núcleo: o de dentro, frente e fundos — só o que falta.
  const xDentro = n.lado === 'DIREITA' ? r.x0 : r.x1;
  const novas: ParedeLocal[] = [];
  // F27-D2: a fachada também — no 2º recuado o núcleo pode sobrar fora do retângulo; no térreo e no 1º a parede externa
  // a cobre inteira e nada nasce ali.
  const xFora = n.lado === 'DIREITA' ? r.x1 : r.x0;
  const lados: { fixo: 'x' | 'y'; valor: number; de: number; ate: number; nome: string }[] = [
    { fixo: 'x', valor: xFora, de: r.y0, ate: r.y1, nome: 'fac' },
    { fixo: 'x', valor: xDentro, de: r.y0, ate: r.y1, nome: 'esq' },
    { fixo: 'y', valor: r.y0, de: r.x0, ate: r.x1, nome: 'fre' },
    { fixo: 'y', valor: r.y1, de: r.x0, ate: r.x1, nome: 'fun' },
  ];
  for (const l of lados) {
    for (const [s, e] of descobertos(existentes, l.fixo, l.valor, l.de, l.ate)) {
      const a = l.fixo === 'x' ? point(l.valor, s) : point(s, l.valor);
      const b = l.fixo === 'x' ? point(l.valor, e) : point(e, l.valor);
      novas.push({ levelId, a, b, thicknessMm: hip.paredeDoNucleoMm, heightMm: alturaDaParedeMm, uid: uidDeterministico(`nucleo:${chaveDoPavimento}:${l.nome}:${s}`) } as ParedeLocal);
    }
  }
  const todas = [...existentes, ...novas];
  // A faixa do patamar: a ponta do núcleo junto do corredor.
  const patamar = n.paraOsFundos ? { y0: r.y0, y1: r.y0 + hip.patamarMm } : { y0: r.y1 - hip.patamarMm, y1: r.y1 };
  const w = hip.larguraDaPortaMm;
  const meio = Math.round((patamar.y0 + patamar.y1) / 2);
  const candidatas: { lado: 'DENTRO' | 'FRENTE' | 'FUNDOS'; fixo: 'x' | 'y'; valor: number; p0: number; p1: number; sonda: Point }[] = [
    { lado: 'DENTRO', fixo: 'x', valor: xDentro, p0: meio - w / 2, p1: meio + w / 2, sonda: point(n.lado === 'DIREITA' ? xDentro - 300 : xDentro + 300, meio) },
  ];
  // No térreo, a face do patamar (frente ou fundos do núcleo), na metade de cima da escada (a partida).
  if (!corredor) {
    // A partida da escada é a metade da FACHADA (ver `comandoDaEscada`).
    const xm = n.lado === 'DIREITA' ? Math.round(r.x1 - hip.paredeDoNucleoMm / 2 - hip.larguraDaEscadaMm / 2) : Math.round(r.x0 + hip.paredeDoNucleoMm / 2 + hip.larguraDaEscadaMm / 2);
    const yFace = n.paraOsFundos ? r.y0 : r.y1;
    candidatas.push({ lado: n.paraOsFundos ? 'FRENTE' : 'FUNDOS', fixo: 'y', valor: yFace, p0: xm - w / 2, p1: xm + w / 2, sonda: point(xm, n.paraOsFundos ? yFace - 300 : yFace + 300) });
  }
  const vizinhoEm = (p: Point) => ambientes.find((a) => p.x > a.ret.x0 && p.x < a.ret.x1 && p.y > a.ret.y0 && p.y < a.ret.y1) ?? null;
  const ordem = (a: AmbienteGerado | null) => (a ? (corredor ? (a.item.uso === 'CIRCULACAO' ? 0 : 99) : (PREFERENCIA_NO_TERREO.indexOf(a.item.uso) + 1 || 99)) : 999);
  const melhor = candidatas.map((c) => ({ c, viz: vizinhoEm(c.sonda) })).sort((a, b) => ordem(a.viz) - ordem(b.viz))[0];
  let porta: PavimentoDoSobrado['porta'] = null;
  const aberturas: AberturaLocal[] = [];
  if (melhor && melhor.viz && ordem(melhor.viz) < 99) {
    const alvo = paredeQueContem(todas, melhor.c.fixo, melhor.c.valor, melhor.c.p0, melhor.c.p1);
    if (alvo) {
      // F22: com o peitoril (0) — sem ele, a conferência de vão comparava cotas com `undefined` e acusava o barrilete que
      // corre sobre a laje, 3 m acima da porta (sobrado 10 × 30).
      aberturas.push({ wallId: '', wallUid: alvo.uid, kind: 'door', offsetMm: alvo.offsetMm, widthMm: w, heightMm: hip.alturaDaPortaMm, sillMm: 0 } as AberturaLocal);
      porta = { vizinho: melhor.viz.nome, lado: melhor.c.lado };
    }
  }
  const out: Command[] = [];
  for (const c of recortado) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: todas });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: [...c.openings, ...aberturas] });
    else out.push(c);
  }
  if (!recortado.some((c) => c.type === 'AddOpenings') && aberturas.length) out.splice(1, 0, { type: 'AddOpenings', openings: aberturas });
  return { comandos: out, porta };
}

/**
 * A escada em U do núcleo (no térreo; chega no pavimento de cima): o primeiro lance na metade da fachada, saindo do
 * patamar; a virada no outro extremo; o segundo lance na metade de dentro, chegando ao patamar de cima — que fica
 * sobre o corredor.
 */
export function comandoDaEscada(levelId: ObjectId, n: NucleoDaEscada, hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO): Command {
  const r = n.ret;
  const meiaParede = hip.paredeDoNucleoMm / 2;
  const meia = hip.larguraDaEscadaMm / 2;
  const xFora = n.lado === 'DIREITA' ? r.x1 - meiaParede - meia : r.x0 + meiaParede + meia;
  const xDentro = n.lado === 'DIREITA' ? r.x0 + meiaParede + meia : r.x1 - meiaParede - meia;
  const s = n.paraOsFundos ? 1 : -1;
  const yPartida = n.paraOsFundos ? r.y0 + hip.patamarMm : r.y1 - hip.patamarMm;
  const yVirada = yPartida + s * hip.lanceMm;
  return {
    type: 'AddEscada',
    levelId,
    pontos: [point(xFora, yPartida), point(xFora, yVirada), point(xDentro, yVirada), point(xDentro, yPartida)],
    larguraMm: hip.larguraDaEscadaMm,
    alvoEspelhoMm: hip.alvoEspelhoMm,
    rotulo: 'Escada',
  } as Command;
}

/** Os uids das paredes (e das aberturas que as referenciam) trocados por uids do pavimento — o gerador repete os seus. */
export function comUidsDoPavimento(cmds: readonly Command[], chave: string): Command[] {
  const novo = (uid: string | undefined | null) => (uid ? uidDeterministico(`${uid}:${chave}`) : uid);
  return cmds.map((c) =>
    c.type === 'AddWalls'
      ? { ...c, walls: c.walls.map((w) => ({ ...w, uid: novo(w.uid) ?? undefined })) }
      : c.type === 'AddOpenings'
        ? { ...c, openings: c.openings.map((o) => ({ ...o, wallUid: novo(o.wallUid) ?? undefined })) }
        : c,
  ) as Command[];
}

/** Sem a porta de ENTRADA (porta em parede externa do retângulo): o superior não tem porta para a rua. */
export function semPortaDeEntrada(cmds: readonly Command[], casa: Retangulo): Command[] {
  const naBorda = (w: ParedeLocal) =>
    (w.a.x === w.b.x && (w.a.x === casa.x0 || w.a.x === casa.x1)) || (w.a.y === w.b.y && (w.a.y === casa.y0 || w.a.y === casa.y1));
  const externas = new Set(cmds.flatMap((c) => (c.type === 'AddWalls' ? c.walls.filter(naBorda).map((w) => w.uid) : [])));
  return cmds.map((c) => (c.type === 'AddOpenings' ? { ...c, openings: c.openings.filter((o) => !((o.kind === 'door' || o.kind === 'sliding') && externas.has(o.wallUid ?? undefined))) } : c)) as Command[];
}

// ─── F12b: a estrutura dos dois pavimentos ─────────────────────────────────

/** Folga além da meia espessura para um ponto contar como "sobre a parede". */
const FOLGA_SOBRE_PAREDE_MM = 5;
/** Folga entre a face do pilar e a lateral de uma porta ou janela. */
const FOLGA_DA_ABERTURA_MM = 50;

function projetar(p: Point, a: Point, b: Point): { t: number; L: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1) return { t: 0, L: 0, d: Math.hypot(p.x - a.x, p.y - a.y) };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  return { t, L, d: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L };
}

/**
 * A parede do pavimento que tem o ponto no corpo (eixo a menos de meia espessura), longe das portas e janelas dela
 * (`meioComprimentoMm` = meia peça ao longo da parede + folga). `null` = não há onde a peça apoiar.
 */
export function paredeSobOPonto(model: BlueprintModel, levelId: ObjectId, p: Point, meioComprimentoMm = 0, ignorarAberturas = false): Wall | null {
  for (const w of model.walls) {
    if (w.levelId !== levelId) continue;
    const pr = projetar(p, w.a, w.b);
    if (pr.L < 1 || pr.t < -1 || pr.t > pr.L + 1 || pr.d > w.thicknessMm / 2 + FOLGA_SOBRE_PAREDE_MM) continue;
    const naAbertura = model.openings.some((o) => o.wallId === w.id && pr.t > o.offsetMm - meioComprimentoMm - FOLGA_DA_ABERTURA_MM && pr.t < o.offsetMm + o.widthMm + meioComprimentoMm + FOLGA_DA_ABERTURA_MM);
    if (!naAbertura || ignorarAberturas) return w;
  }
  return null;
}

const pilarPerto = (model: BlueprintModel, levelId: ObjectId, p: Point, mm: number) =>
  pilaresExistentesNoNivel(model, levelId).some((x) => Math.hypot(x.pontos[0].x - p.x, x.pontos[0].y - p.y) <= mm);

export interface PilaresDoSobrado {
  comandos: Command[];
  motivo: string | null;
  avisos: string[];
  foraDoPlano: string[];
  /** Pilares novos no térreo (do planejador + os que descem do superior). */
  terreo: number;
  /** Pilares novos no superior (os que sobem do térreo + os do planejador que têm apoio). */
  superior: number;
  /** Do térreo que continuam no superior (há parede em cima). */
  sobem: number;
  /** Do superior que descem ao térreo (há parede embaixo, fora de porta e janela). */
  descem: number;
  /** Do superior que nascem numa viga de transição do térreo (sem parede embaixo, mas com a viga). */
  nascemEmViga: number;
  /** Do superior que ficaram fora: sem parede nem viga de transição embaixo, o pilar nasceria no meio de um cômodo. */
  semApoio: number;
  /** Onde ficaram os que saíram. */
  semApoioEm: Point[];
  /** Dos que saíram, quantos caíam sobre porta ou janela do térreo (a parede está lá, aberta). */
  sobreAbertura: number;
}

/** F23: o padrão de `HipotesesDePilares.deslizeSobreAberturaMm`. */
const DESLIZE_SOBRE_ABERTURA_MM = 1200;

/**
 * Os pilares do sobrado, ALINHADOS: um pilar é uma prumada. O térreo pelo planejador de sempre; cada pilar do térreo
 * que tem parede do superior em cima CONTINUA no superior (a mesma seção, no mesmo ponto); o planejador do superior
 * completa o que falta (encontros e vãos), e cada pilar novo dele DESCE ao térreo quando há parede embaixo fora de
 * porta e janela. O que não tem parede embaixo sai: um pilar não nasce no meio do cômodo de baixo sem viga de
 * transição — fica dito, e a viga do superior vence o vão maior.
 */
export function pilaresDoSobrado(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  hip: HipotesesDePilares = HIPOTESES_PILARES_PADRAO,
  transicao: readonly TrechoDeTransicao[] = [],
): PilaresDoSobrado {
  const comandos: Command[] = [];
  const cedem = new Set<ObjectId>();
  let m = model;
  const lancar = (lote: Command[]) => {
    if (!lote.length) return;
    m = applyBatch(m, lote).model;
    comandos.push(...lote);
  };
  const ceder = (w: Wall, lote: Command[]) => {
    if (w.cedeSobreposicao === true || cedem.has(w.id)) return;
    cedem.add(w.id);
    lote.push({ type: 'SetCedeSobreposicao', id: w.id, cede: true });
  };
  const altura = (id: ObjectId) => m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 2800;
  const copia = (x: { at: Point; larguraMm: number; profundidadeMm: number; circular: boolean; rotacaoDeg: number; rotulo: string | null }, levelId: ObjectId): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [x.at],
    larguraMm: x.larguraMm,
    profundidadeMm: x.profundidadeMm,
    alturaMm: altura(levelId),
    baseMm: 0,
    circular: x.circular,
    rotacaoDeg: x.rotacaoDeg,
    rotulo: x.rotulo,
  });
  const meio = (x: { larguraMm: number; profundidadeMm: number }) => Math.max(x.larguraMm, x.profundidadeMm) / 2;

  // 1. O térreo.
  const pT = planejarPilares(m, T, hip);
  lancar(pT.comandos);
  const terreoDoPlanejador = pT.pilares.length;

  // 2. Os do térreo que sobem.
  const sobem: Command[] = [];
  for (const x of pilaresExistentesNoNivel(m, T)) {
    const at = x.pontos[0];
    const w = paredeSobOPonto(m, S, at, meio(x));
    if (!w || pilarPerto(m, S, at, meio(x))) continue;
    sobem.push(copia({ at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: x.circular, rotacaoDeg: x.rotacaoDeg, rotulo: x.rotulo ?? null }, S));
    ceder(w, sobem);
  }
  lancar(sobem);
  const nSobem = sobem.filter((c) => c.type === 'AddStructural').length;

  // 3. O superior completa; cada novo desce ou sai.
  const pS = planejarPilares(m, S, hip);
  const manter: Command[] = [];
  const descer: Command[] = [];
  let semApoio = 0;
  const semApoioEm: Point[] = [];
  let nascemEmViga = 0;
  let n = proximoNumeroDePilar(m);
  for (const x0 of pS.pilares) {
    // F23 da casa automática (17/10/2026): o pilar do superior que cairia sobre uma porta ou janela do térreo escorrega pela
    // parede de cima (fora das aberturas dela) até ter parede cheia embaixo — descartado, a viga de cima vencia o vão maior.
    // Tenta cada parede do pilar (no T, a primeira pode ser a interna, sem parede embaixo) — o menor deslocamento vence.
    let x = x0;
    if (!paredeSobOPonto(m, T, x.at, meio(x)) && paredeSobOPonto(m, T, x.at, 0, true)) {
      const sentidos = x.wallIds.flatMap((id) => {
        const w = m.walls.find((y) => y.id === id);
        const L = w ? Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : 0;
        return w && L > 1 ? [{ x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }] : [];
      });
      const alcance = hip.deslizeSobreAberturaMm ?? DESLIZE_SOBRE_ABERTURA_MM;
      for (let d = 50; d <= alcance; d += 50) {
        const q = sentidos
          .flatMap((u) => [d, -d].map((k) => point(Math.round(x.at.x + u.x * k), Math.round(x.at.y + u.y * k))))
          .find((q) => paredeSobOPonto(m, T, q, meio(x)) && paredeSobOPonto(m, S, q, meio(x)));
        if (q) {
          x = { ...x, at: q };
          break;
        }
      }
    }
    const embaixo = paredeSobOPonto(m, T, x.at, meio(x));
    const naViga = !embaixo && sobreAlgumTrecho(transicao, x.at);
    if (!embaixo && !naViga) {
      semApoio++;
      semApoioEm.push(x.at);
      continue;
    }
    const rotulo = `P${n++}`;
    manter.push(copia({ at: x.at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: false, rotacaoDeg: x.rotacaoDeg, rotulo }, S));
    for (const id of x.wallIds) {
      const w = m.walls.find((y) => y.id === id);
      if (w) ceder(w, manter);
    }
    if (naViga) {
      nascemEmViga++;
      continue;
    }
    if (embaixo && !pilarPerto(m, T, x.at, meio(x))) {
      descer.push(copia({ at: x.at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: false, rotacaoDeg: x.rotacaoDeg, rotulo }, T));
      ceder(embaixo, descer);
    }
  }
  lancar(manter);
  lancar(descer);
  const nManter = manter.filter((c) => c.type === 'AddStructural').length;
  const nDescer = descer.filter((c) => c.type === 'AddStructural').length;

  const foraDoPlano = [...pT.foraDoPlano.map((f) => `térreo: ${f.motivo}`), ...pS.foraDoPlano.map((f) => `superior: ${f.motivo}`)];
  const sobreAbertura = semApoioEm.filter((p) => paredeSobOPonto(m, T, p, 0, true)).length;
  const noVazio = semApoio - sobreAbertura;
  if (sobreAbertura) foraDoPlano.push(`${sobreAbertura} pilar(es) do superior cairiam sobre porta ou janela do térreo e ficaram fora — a viga do superior vence o vão maior; confira com o calculista (ou mude a abertura)`);
  if (noVazio) foraDoPlano.push(`${noVazio} pilar(es) do superior sem parede nem viga embaixo ficaram fora (nasceriam no meio de um cômodo do térreo) — a viga do superior vence o vão maior; confira com o calculista`);
  return {
    comandos,
    motivo: comandos.length ? null : (pT.motivo ?? pS.motivo),
    avisos: [...pT.avisos.map((a) => `térreo: ${a}`), ...pS.avisos.map((a) => `superior: ${a}`)],
    foraDoPlano,
    terreo: terreoDoPlanejador + nDescer,
    superior: nSobem + nManter,
    sobem: nSobem,
    descem: nDescer,
    nascemEmViga,
    semApoio,
    semApoioEm,
    sobreAbertura,
  };
}

export interface PilaresDoTerceiro {
  comandos: Command[];
  avisos: string[];
  foraDoPlano: string[];
  /** Pilares novos no 2º (os que sobem do 1º + os do planejador que têm apoio). */
  segundo: number;
  /** Do 1º que continuam no 2º. */
  sobem: number;
  /** Cópias novas embaixo dos pilares do 2º: no 1º e no térreo. */
  descemAoPrimeiro: number;
  descemAoTerreo: number;
  /** Do 2º (ou da cópia dele no 1º) que nascem numa viga de transição. */
  nascemEmViga: number;
  /** Do 2º que ficaram fora: a prumada não chegava ao chão (sem parede nem viga embaixo, em algum nível). */
  semApoio: number;
}

/**
 * F27-D2/D3 (decisão do usuário, 18/10/2026: 3 pavimentos): o 2º pavimento sobre o sobrado já em prumada
 * (`pilaresDoSobrado` no térreo e no 1º). Cada pilar do 1º com parede do 2º em cima CONTINUA; o planejador do 2º
 * completa, e cada pilar novo DESCE a prumada inteira — ao 1º (parede embaixo, ou nasce na viga de transição do 1º) e ao
 * térreo (parede embaixo, ou nasce na viga de transição do térreo). A prumada que não chega ao chão sai: um pilar não
 * nasce no meio do cômodo de baixo. A mesma escorregada da F23 sobre porta ou janela, contra as paredes dos dois de baixo.
 */
export function pilaresDoTerceiro(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  G: ObjectId,
  hip: HipotesesDePilares = HIPOTESES_PILARES_PADRAO,
  transicaoDoTerreo: readonly TrechoDeTransicao[] = [],
  transicaoDoPrimeiro: readonly TrechoDeTransicao[] = [],
): PilaresDoTerceiro {
  const comandos: Command[] = [];
  const cedem = new Set<ObjectId>();
  let m = model;
  const lancar = (lote: Command[]) => {
    if (!lote.length) return;
    m = applyBatch(m, lote).model;
    comandos.push(...lote);
  };
  const ceder = (w: Wall | null, lote: Command[]) => {
    if (!w || w.cedeSobreposicao === true || cedem.has(w.id)) return;
    cedem.add(w.id);
    lote.push({ type: 'SetCedeSobreposicao', id: w.id, cede: true });
  };
  const altura = (id: ObjectId) => m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 2800;
  const copia = (x: { at: Point; larguraMm: number; profundidadeMm: number; circular: boolean; rotacaoDeg: number; rotulo: string | null }, levelId: ObjectId): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [x.at],
    larguraMm: x.larguraMm,
    profundidadeMm: x.profundidadeMm,
    alturaMm: altura(levelId),
    baseMm: 0,
    circular: x.circular,
    rotacaoDeg: x.rotacaoDeg,
    rotulo: x.rotulo,
  });
  const meio = (x: { larguraMm: number; profundidadeMm: number }) => Math.max(x.larguraMm, x.profundidadeMm) / 2;

  // 1. Os do 1º que sobem ao 2º.
  const sobem: Command[] = [];
  for (const x of pilaresExistentesNoNivel(m, S)) {
    const at = x.pontos[0];
    const w = paredeSobOPonto(m, G, at, meio(x));
    if (!w || pilarPerto(m, G, at, meio(x))) continue;
    sobem.push(copia({ at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: x.circular, rotacaoDeg: x.rotacaoDeg, rotulo: x.rotulo ?? null }, G));
    ceder(w, sobem);
  }
  lancar(sobem);
  const nSobem = sobem.filter((c) => c.type === 'AddStructural').length;

  // 2. O 2º completa; cada novo desce a prumada ou sai.
  const pG = planejarPilares(m, G, hip);
  const manter: Command[] = [];
  const descer: Command[] = [];
  let semApoio = 0;
  let nascemEmViga = 0;
  let aoPrimeiro = 0;
  let aoTerreo = 0;
  let n = proximoNumeroDePilar(m);
  /** Até onde a prumada desce de `at`: 'CHAO' (parede no 1º e no térreo), 'VIGA_1' / 'VIGA_T' (nasce na transição), ou null. */
  const prumada = (at: Point, r: number): 'CHAO' | 'VIGA_1' | 'VIGA_T' | null => {
    if (!paredeSobOPonto(m, S, at, r)) return sobreAlgumTrecho(transicaoDoPrimeiro, at) ? 'VIGA_1' : null;
    if (!paredeSobOPonto(m, T, at, r)) return sobreAlgumTrecho(transicaoDoTerreo, at) ? 'VIGA_T' : null;
    return 'CHAO';
  };
  for (const x0 of pG.pilares) {
    let x = x0;
    if (!prumada(x.at, meio(x)) && paredeSobOPonto(m, S, x.at, 0, true)) {
      const sentidos = x.wallIds.flatMap((id) => {
        const w = m.walls.find((y) => y.id === id);
        const L = w ? Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : 0;
        return w && L > 1 ? [{ x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }] : [];
      });
      const alcance = hip.deslizeSobreAberturaMm ?? DESLIZE_SOBRE_ABERTURA_MM;
      for (let d = 50; d <= alcance; d += 50) {
        const q = sentidos
          .flatMap((u) => [d, -d].map((k) => point(Math.round(x.at.x + u.x * k), Math.round(x.at.y + u.y * k))))
          .find((q) => paredeSobOPonto(m, G, q, meio(x)) && prumada(q, meio(x)) === 'CHAO');
        if (q) {
          x = { ...x, at: q };
          break;
        }
      }
    }
    const ate = prumada(x.at, meio(x));
    if (!ate) {
      semApoio++;
      continue;
    }
    const rotulo = `P${n++}`;
    const pilar = { at: x.at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: false, rotacaoDeg: x.rotacaoDeg, rotulo };
    manter.push(copia(pilar, G));
    for (const id of x.wallIds) ceder(m.walls.find((y) => y.id === id) ?? null, manter);
    if (ate === 'VIGA_1') {
      nascemEmViga++;
      continue;
    }
    if (!pilarPerto(m, S, x.at, meio(x))) {
      descer.push(copia(pilar, S));
      ceder(paredeSobOPonto(m, S, x.at, meio(x)), descer);
      aoPrimeiro++;
    }
    if (ate === 'VIGA_T') {
      nascemEmViga++;
      continue;
    }
    if (!pilarPerto(m, T, x.at, meio(x))) {
      descer.push(copia(pilar, T));
      ceder(paredeSobOPonto(m, T, x.at, meio(x)), descer);
      aoTerreo++;
    }
  }
  lancar(manter);
  lancar(descer);
  const nManter = manter.filter((c) => c.type === 'AddStructural').length;
  const foraDoPlano = pG.foraDoPlano.map((f) => `2º pavimento: ${f.motivo}`);
  if (semApoio) foraDoPlano.push(`${semApoio} pilar(es) do 2º pavimento sem prumada até o chão ficaram fora (sem parede nem viga embaixo em algum nível) — a viga do 2º vence o vão maior; confira com o calculista`);
  return { comandos, avisos: pG.avisos.map((a) => `2º pavimento: ${a}`), foraDoPlano, segundo: nSobem + nManter, sobem: nSobem, descemAoPrimeiro: aoPrimeiro, descemAoTerreo: aoTerreo, nascemEmViga, semApoio };
}

/** Um trecho de parede do superior sem parede embaixo: onde a viga de transição do térreo passa. */
export interface TrechoDeTransicao {
  a: Point;
  b: Point;
  larguraMm: number;
}

const apoiadaEmBaixo = (p: Point, debaixo: readonly Wall[]) =>
  debaixo.some((d) => {
    const pr = projetar(p, d.a, d.b);
    return pr.L >= 1 && pr.t >= -1 && pr.t <= pr.L + 1 && pr.d <= d.thicknessMm / 2 + FOLGA_SOBRE_PAREDE_MM;
  });

function sobreAlgumTrecho(trechos: readonly TrechoDeTransicao[], p: Point): boolean {
  return trechos.some((t) => {
    const pr = projetar(p, t.a, t.b);
    return pr.L >= 1 && pr.t >= -t.larguraMm && pr.t <= pr.L + t.larguraMm && pr.d <= t.larguraMm / 2 + FOLGA_SOBRE_PAREDE_MM;
  });
}

/**
 * Os trechos das paredes do superior que não têm parede do térreo embaixo, de face a face das paredes do térreo
 * que cruzam (cada uma é um apoio), emendados quando colineares. Abaixo de `minimoMm` não vira viga.
 */
export function trechosDeTransicao(model: BlueprintModel, T: ObjectId, S: ObjectId, minimoMm = 300, passoMm = 50): TrechoDeTransicao[] {
  const debaixo = model.walls.filter((w) => w.levelId === T);
  const brutos: TrechoDeTransicao[] = [];
  for (const w of model.walls) {
    if (w.levelId !== S) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const n = Math.max(1, Math.round(L / passoMm));
    const em = (t: number) => point(Math.round(w.a.x + (w.b.x - w.a.x) * t), Math.round(w.a.y + (w.b.y - w.a.y) * t));
    let ini: number | null = null;
    for (let k = 0; k <= n; k++) {
      const solta = k < n && !apoiadaEmBaixo({ x: w.a.x + ((w.b.x - w.a.x) * (k + 0.5)) / n, y: w.a.y + ((w.b.y - w.a.y) * (k + 0.5)) / n }, debaixo);
      if (solta && ini === null) ini = k;
      if (!solta && ini !== null) {
        brutos.push({ a: em(ini / n), b: em(k / n), larguraMm: w.thicknessMm });
        ini = null;
      }
    }
  }
  // Emendar os colineares que se tocam (a parede do superior partida em duas no encontro em T).
  const out = brutos.map((t) => ({ ...t }));
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (let i = 0; i < out.length && !mudou; i++) {
      for (let j = i + 1; j < out.length && !mudou; j++) {
        const p = out[i];
        const q = out[j];
        const ux = p.b.x - p.a.x;
        const uy = p.b.y - p.a.y;
        const col = (r: Point) => Math.abs(ux * (r.y - p.a.y) - uy * (r.x - p.a.x)) / (Math.hypot(ux, uy) || 1) < 1;
        if (!col(q.a) || !col(q.b)) continue;
        const pontas = [p.a, p.b, q.a, q.b];
        const toca = [p.a, p.b].some((x) => [q.a, q.b].some((y) => Math.hypot(x.x - y.x, x.y - y.y) <= 2));
        if (!toca) continue;
        const L = Math.hypot(ux, uy) || 1;
        const t = (r: Point) => ((r.x - p.a.x) * ux + (r.y - p.a.y) * uy) / L;
        const ord = pontas.slice().sort((x, y) => t(x) - t(y));
        out[i] = { a: ord[0], b: ord[3], larguraMm: Math.max(p.larguraMm, q.larguraMm) };
        out.splice(j, 1);
        mudou = true;
      }
    }
  }
  return out.filter((t) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= minimoMm).sort((p, q) => p.a.x - q.a.x || p.a.y - q.a.y || p.b.x - q.b.x || p.b.y - q.b.y);
}

/**
 * As VIGAS DE TRANSIÇÃO: no térreo, sob cada trecho de parede do superior sem parede embaixo — de apoio a apoio
 * (as paredes do térreo que ela cruza, com a viga delas). O mesmo pré-dimensionamento das vigas automáticas (vão ÷
 * divisor, mínimo, largura da parede), topo no pé-direito do térreo; cede o volume como as outras.
 */
export function vigasDeTransicao(
  model: BlueprintModel,
  T: ObjectId,
  trechos: readonly TrechoDeTransicao[],
  hip: HipotesesDeVigas = HIPOTESES_VIGAS_PADRAO,
): { comandos: Command[]; vigas: number; metros: number; maiorVaoMm: number; motivo: string | null; foraDoPlano: { motivo: string }[] } {
  const nivel = model.levels.find((l) => l.id === T);
  if (!nivel || trechos.length === 0) return { comandos: [], vigas: 0, metros: 0, maiorVaoMm: 0, motivo: null, foraDoPlano: [] };
  const n0 = proximoNumeroDoRotulo(model, 'V');
  const ids = idsPrevistosDeEstrutura(model, trechos.length);
  const comandos: Command[] = [];
  let mm = 0;
  let maior = 0;
  trechos.forEach((t, k) => {
    const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    mm += L;
    maior = Math.max(maior, L);
    const h = alturaDaViga(L, hip);
    comandos.push({ type: 'AddStructural', levelId: T, kind: 'VIGA', pontos: [t.a, t.b], larguraMm: Math.max(hip.larguraMinimaMm, t.larguraMm), alturaMm: h, baseMm: nivel.defaultHeightMm - h, rotulo: `V${n0 + k}` });
  });
  comandos.push(...ids.map((id): Command => ({ type: 'SetCedeSobreposicao', id, cede: true })));
  return { comandos, vigas: trechos.length, metros: Math.round(mm / 100) / 10, maiorVaoMm: Math.round(maior), motivo: null, foraDoPlano: [] };
}

/**
 * O guarda-corpo e os corrimãos da escada em U do núcleo. Corrimão dos dois lados dos LANCES (o sugeridor do app;
 * o segmento da virada fica de fora — o corrimão dele atravessaria os lances). Guarda-corpo no superior, na borda do
 * furo sobre o primeiro lance: quem chega ao patamar de cima tem o vão do lance que sai do térreo ao lado. F27-D3: sem
 * `comGuardaDoFuro` no pavimento do meio da casa de 3 — ali o lance que sobe ao 2º sai justamente da borda do furo.
 */
export function guardaCorpoDaEscada(model: BlueprintModel, T: ObjectId, S: ObjectId, comGuardaDoFuro = true): Command[] {
  const e = (model.stairs ?? []).find((x) => x.levelId === T && x.pontos.length === 4);
  if (!e) return [];
  const corrimaos = sugerirGuardaCorpos(model, T, HIPOTESES_DE_GUARDA_CORPO_PADRAO)
    .sugestoes.filter((x) => x.origem === 'ESCADA' && x.origemId === e.id && !/lance 2$/.test(x.rotulo))
    .map((x) => x.comando);
  const [p0, , , p3] = e.pontos;
  const L = Math.hypot(p0.x - p3.x, p0.y - p3.y) || 1;
  const u = { x: (p0.x - p3.x) / L, y: (p0.y - p3.y) / L };
  const meio = point(Math.round((p0.x + p3.x) / 2), Math.round((p0.y + p3.y) / 2));
  const fora = point(Math.round(p0.x + (u.x * e.larguraMm) / 2), Math.round(p0.y + (u.y * e.larguraMm) / 2));
  if (!comGuardaDoFuro) return corrimaos;
  return [
    ...corrimaos,
    { type: 'AddGuardaCorpo', levelId: S, tipo: 'GUARDA_CORPO', pontos: [meio, fora], alturaMm: HIPOTESES_DE_GUARDA_CORPO_PADRAO.alturaGuardaCorpoMm, material: 'METALICO', rotulo: `${e.rotulo || 'Escada'} · guarda-corpo do furo`, sugerido: true },
  ];
}

// ─── F12c: o SHAFT das instalações ─────────────────────────────────────────

/** Onde o shaft prefere cair no térreo (o primeiro que serve vence): área molhada e de serviço antes de sala. */
const PREFERENCIA_DO_SHAFT_NO_TERREO: string[] = ['AREA_DE_SERVICO', 'LAVABO', 'COZINHA', 'GARAGEM', 'ESCRITORIO', 'VARANDA', 'SALA'];
/** F14c: onde o shaft pode ser CAIXA no canto do cômodo de baixo (sem parede do térreo sob a face). */
const USOS_QUE_ACEITAM_CAIXA_DE_SHAFT = new Set(['AREA_DE_SERVICO', 'GARAGEM', 'CIRCULACAO', 'BANHEIRO', 'LAVABO', 'DEPOSITO']);

export interface ShaftDoSobrado {
  ring: Point[];
  /** O banheiro de cima que ele atende e o cômodo do térreo onde ele desce. */
  banheiro: string;
  noTerreo: string | null;
}

/**
 * O SHAFT de cada banheiro do superior (o tubo de queda e as colunas de água descem por ele — `shaftPreferido` do
 * esgoto e da água, num raio de 3 m): um quadrado de `ladoMm` dentro do banheiro, encostado numa parede que TEM
 * parede do térreo embaixo, fora de porta e janela (nos dois pavimentos), de pilar e do núcleo da escada. No
 * térreo ele vira um enchimento junto da mesma parede — no cômodo de serviço antes da sala. Um shaft a até
 * `raioMm` de outro banheiro já o atende.
 */
export function shaftsDoSobrado(model: BlueprintModel, T: ObjectId, S: ObjectId, nucleo: Point[] | null, ladoMm = 400, raioMm = 2500, intermediarios: readonly ObjectId[] = []): ShaftDoSobrado[] {
  const banheiros = model.spaces
    .filter((x) => x.levelId === S && usoDoNome(x.name) === 'BANHEIRO' && x.ring.length >= 3)
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  const saida: ShaftDoSobrado[] = [];
  for (const ban of banheiros) {
    const cb = centroDoAnel(ban.ring);
    if (saida.some((x) => Math.hypot(centroDoAnel(x.ring).x - cb.x, centroDoAnel(x.ring).y - cb.y) <= raioMm)) continue;
    const melhor = lugarDoShaft(
      model,
      T,
      S,
      ban.ring,
      nucleo,
      ladoMm,
      (c, embaixo) => {
        const pref = embaixo ? PREFERENCIA_DO_SHAFT_NO_TERREO.indexOf(usoDoNome(embaixo.name) ?? '') : -1;
        return (pref < 0 ? 50 : pref * 5) + Math.hypot(c.x - cb.x, c.y - cb.y) / 1000;
      },
      intermediarios,
    );
    if (melhor) saida.push({ ring: melhor.ring, banheiro: ban.name ?? 'Banheiro', noTerreo: melhor.noTerreo });
  }
  return saida;
}

const distanciaAoLado = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const centroDoAnel = (r: readonly Point[]) => ({ x: r.reduce((a, p) => a + p.x, 0) / r.length, y: r.reduce((a, p) => a + p.y, 0) / r.length });

/**
 * O melhor lugar de um shaft (quadrado de `ladoMm`) encostado numa parede de dentro do `anel` do pavimento de cima —
 * pelo `custo` (menor ganha). Duas passadas (F14c, 16/10/2026): a 1ª exige parede do térreo embaixo da face; sem lugar
 * assim (o banheiro da suíte sobre a área de serviço ficava SEM shaft e despejava a 7 m), a 2ª aceita o shaft como
 * CAIXA no canto do cômodo de baixo, se ele não for de permanência (garagem, serviço, circulação, banheiro, depósito).
 * F27-D4: `intermediarios` são os pavimentos entre T e S (casa de 3: o 1º, para o shaft do 2º) — o shaft os atravessa e
 * vale ali o mesmo que no térreo: parede embaixo da face (1ª passada) ou caixa em cômodo que aceita (2ª), sem pilar nem
 * peça.
 */
function lugarDoShaft(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  anel: readonly Point[],
  nucleo: Point[] | null,
  ladoMm: number,
  custo: (c: { x: number; y: number }, embaixo: BlueprintModel['spaces'][number] | null) => number,
  intermediarios: readonly ObjectId[] = [],
): { ring: Point[]; custo: number; noTerreo: string | null } | null {
  const debaixo = [T, ...intermediarios];
  const atravessados = new Set<ObjectId>([...debaixo, S]);
  const pilares = (model.structures ?? []).filter((x) => x.kind === 'PILAR' && atravessados.has(x.levelId));
  const shafts = (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT');
  // F14c: as peças já postas nos dois pavimentos (louças, aquecedor, caixa sifonada, móveis) — o shaft junto das peças,
  // que nasce depois delas, cobria o aquecedor do térreo e a caixa sifonada de cima (sobrado a 30°). Só a peça DENTRO
  // do shaft o recusa: encostada do lado de fora é o bom, o vaso despeja direto no tubo de queda (com 2 cm de folga, o
  // ralo do vaso a 5 mm da face deixava o banheiro da suíte sem shaft e o tubo de queda descia no meio da cozinha).
  const pecas = (model.terminais ?? []).filter((x) => atravessados.has(x.levelId)).map((x) => x.at);
  const moveis = (model.componentes ?? []).filter((x) => atravessados.has(x.levelId)).map((x) => contornoDoComponente(x));
  const cobrePeca = (ring: Point[]) => {
    if (pecas.some((p) => pointInPolygon(ring, p))) return true;
    const c = centroDoAnel(ring) as Point;
    return moveis.some((m) => pointInPolygon(m, c) || ring.some((q) => pointInPolygon(m, q)) || m.some((q) => pointInPolygon(ring, q)));
  };
  let melhor: { ring: Point[]; custo: number; noTerreo: string | null } | null = null;
  for (const exigente of [true, false]) {
    if (melhor) break;
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < ladoMm + 400) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      // A normal para DENTRO do banheiro.
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let n = { x: -u.y, y: u.x };
      if (!pointInPolygon(anel as Point[], { x: meio.x + n.x * 50, y: meio.y + n.y * 50 } as Point)) n = { x: u.y, y: -u.x };
      const wS = paredeSobOPonto(model, S, meio, 0, true);
      if (!wS) continue;
      const recuo = wS.thicknessMm / 2;
      for (let t = 200; t + ladoMm <= L - 200; t += 100) {
        const p0 = { x: a.x + u.x * t, y: a.y + u.y * t };
        const p1 = { x: a.x + u.x * (t + ladoMm), y: a.y + u.y * (t + ladoMm) };
        const pm = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        // Parede do térreo embaixo em toda a face, e nenhuma porta ou janela no trecho — nos dois pavimentos.
        if (exigente && !debaixo.every((L) => [p0, pm, p1].every((q) => paredeSobOPonto(model, L, q, 0, true)))) continue;
        if ((exigente && !debaixo.every((L) => paredeSobOPonto(model, L, pm, ladoMm / 2))) || !paredeSobOPonto(model, S, pm, ladoMm / 2)) continue;
        const ring = [
          { x: p0.x + n.x * recuo, y: p0.y + n.y * recuo },
          { x: p1.x + n.x * recuo, y: p1.y + n.y * recuo },
          { x: p1.x + n.x * (recuo + ladoMm), y: p1.y + n.y * (recuo + ladoMm) },
          { x: p0.x + n.x * (recuo + ladoMm), y: p0.y + n.y * (recuo + ladoMm) },
        ].map((q) => point(Math.round(q.x), Math.round(q.y)));
        const c = centroDoAnel(ring);
        if (!ring.every((q) => pointInPolygon(anel as Point[], q) || Math.hypot(q.x - c.x, q.y - c.y) < 1)) continue;
        if (nucleo && (ring.some((q) => pointInPolygon(nucleo, q)) || pointInPolygon(nucleo, c as Point))) continue;
        if (pilares.some((x) => Math.hypot(x.pontos[0].x - c.x, x.pontos[0].y - c.y) < ladoMm / 2 + Math.max(x.larguraMm, x.profundidadeMm) / 2 + 30)) continue;
        // Não em cima de outro shaft.
        if (shafts.some((sh) => pointInPolygon(sh.ring, c as Point) || ring.some((q) => pointInPolygon(sh.ring, q)))) continue;
        if (cobrePeca(ring)) continue;
        const embaixo = model.spaces.find((x) => x.levelId === T && pointInPolygon(x.ring, c as Point)) ?? null;
        // Na 2ª passada, o shaft é caixa no cômodo de baixo: todo o anel dentro dele, e ele não é de permanência — em cada
        // pavimento que ele atravessa.
        const aceitaCaixa = (L: ObjectId) => {
          const sp = model.spaces.find((x) => x.levelId === L && pointInPolygon(x.ring, c as Point));
          return !!sp && USOS_QUE_ACEITAM_CAIXA_DE_SHAFT.has(usoDoNome(sp.name) ?? '') && ring.every((q) => pointInPolygon(sp.ring, q));
        };
        if (!exigente && !debaixo.every(aceitaCaixa)) continue;
        const k = custo(c, embaixo);
        if (!melhor || k < melhor.custo) melhor = { ring, custo: k, noTerreo: embaixo?.name ?? null };
      }
    }
  }
  return melhor;
}

/**
 * F14c: o shaft JUNTO DAS PEÇAS de um banheiro de cima — o mais perto de `alvo` (o centro das peças que despejam
 * nele). O shaft do F12c nasce antes do mobiliário e vai para a ponta preferida do banheiro; no banheiro comprido (o
 * da suíte, 6,5 × 1,4 m) as peças ficavam a 5 m dele. `null` = sem lugar.
 */
export function shaftJuntoDasPecas(model: BlueprintModel, T: ObjectId, S: ObjectId, banheiro: readonly Point[], alvo: { x: number; y: number }, nucleo: Point[] | null, ladoMm = 400, intermediarios: readonly ObjectId[] = []): ShaftDoSobrado | null {
  const melhor = lugarDoShaft(model, T, S, banheiro, nucleo, ladoMm, (c) => Math.hypot(c.x - alvo.x, c.y - alvo.y), intermediarios);
  return melhor ? { ring: melhor.ring, banheiro: '', noTerreo: melhor.noTerreo } : null;
}

/**
 * F27 da casa automática (18/10/2026): a área molhada recortada pelo banheiro em L (a escada entra nele — sobrado
 * 10 × 30): recortar pelos lados, como num convexo, deixava só o braço estreito (os lados da quina interna cortavam o
 * largo), e a laje parava a 20 cm da face do shaft — o esgoto corria dali pelo forro do térreo, cruzando os eletrodutos.
 * Banheiro ortogonal e não convexo: em retângulos (faixas no quadro dele, as vizinhas de mesma largura juntas), e a área
 * vira a parte dela em cada um. Convexo, ou com lado oblíquo: a área como veio (o recorte de sempre).
 */
function recortadaPeloBanheiro(zona: Point[], banheiro: readonly Point[]): Point[][] {
  const b = anelLimpo(banheiro as Point[]);
  // O recorte de sempre (pelos lados): certo no convexo.
  const peloContorno = (): Point[][] => {
    let r = zona;
    for (let i = 0; i < b.length && r.length >= 3; i++) r = recortarNoSemiplano(r, b[i], b[(i + 1) % b.length], true);
    const v = r.length >= 3 ? pecaValida(r, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
    return v ? [v] : [];
  };
  if (b.length <= 4) return peloContorno();
  const L = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) || 1;
  const u = { x: (b[1].x - b[0].x) / L, y: (b[1].y - b[0].y) / L };
  const n = { x: -u.y, y: u.x };
  const em = (p: { x: number; y: number }) => ({ s: p.x * u.x + p.y * u.y, t: p.x * n.x + p.y * n.y });
  const de = (s0: number, t0: number) => ({ x: Math.round(s0 * u.x + t0 * n.x), y: Math.round(s0 * u.y + t0 * n.y) }) as Point;
  const bs = b.map(em);
  const ortogonal = bs.every((q, k) => {
    const r = bs[(k + 1) % bs.length];
    return Math.abs(q.s - r.s) < 1 || Math.abs(q.t - r.t) < 1;
  });
  if (!ortogonal) return peloContorno();
  const zs = zona.map(em);
  const [zs0, zs1, zt0, zt1] = [Math.min(...zs.map((q) => q.s)), Math.max(...zs.map((q) => q.s)), Math.min(...zs.map((q) => q.t)), Math.max(...zs.map((q) => q.t))];
  const ts = [...new Set(bs.map((q) => Math.round(q.t)))].sort((a, c) => a - c);
  const partes: { s0: number; s1: number; t0: number; t1: number }[] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const tm = (ts[k] + ts[k + 1]) / 2;
    const xs: number[] = [];
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      const c = bs[(i + 1) % bs.length];
      if ((a.t <= tm && c.t > tm) || (c.t <= tm && a.t > tm)) xs.push(a.s + ((tm - a.t) / (c.t - a.t)) * (c.s - a.s));
    }
    xs.sort((a, c) => a - c);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const ant = partes.find((p) => Math.abs(p.s0 - xs[m]) < 1 && Math.abs(p.s1 - xs[m + 1]) < 1 && Math.abs(p.t1 - ts[k]) < 1);
      if (ant) ant.t1 = ts[k + 1];
      else partes.push({ s0: xs[m], s1: xs[m + 1], t0: ts[k], t1: ts[k + 1] });
    }
  }
  const saida: Point[][] = [];
  for (const p of partes) {
    const [s0, s1, t0, t1] = [Math.max(zs0, p.s0), Math.min(zs1, p.s1), Math.max(zt0, p.t0), Math.min(zt1, p.t1)];
    if (s1 - s0 < 1 || t1 - t0 < 1) continue;
    let r: Point[] = [de(s0, t0), de(s1, t0), de(s1, t1), de(s0, t1)];
    if (signedArea(r) < 0) r = r.reverse();
    const v = pecaValida(r, AREA_MINIMA_DA_PECA_DE_LAJE_MM2);
    if (v) saida.push(v);
  }
  return saida;
}

/**
 * F14c: as ÁREAS MOLHADAS de um grupo num banheiro — `zonaMolhadaDoBanheiro`, mas com as peças em volta do shaft
 * repartidas pela FACE dele que cada uma enxerga (a de maior afastamento): uma área por face, cada uma parando nela.
 * No banheiro da suíte do sobrado a 30°, o vaso e o lavatório ficam de um lado e a caixa sifonada de outro, em "L":
 * com uma área só, o shaft ficava dentro dela e a água de baixo não chegava às colunas; assim, as faces sem peça
 * ficam fora do rebaixo.
 */
export function zonasMolhadasDoBanheiro(
  banheiro: readonly Point[],
  pontos: readonly { x: number; y: number }[],
  margemMm: number,
  shaft: readonly Point[] | null,
  caminho: readonly { x: number; y: number }[] = [],
): Point[][] {
  const uma = () => {
    const z = zonaMolhadaDoBanheiro(banheiro, pontos, margemMm, shaft ? [shaft] : [], caminho, true);
    return z ? recortadaPeloBanheiro(z, banheiro) : [];
  };
  const b = anelLimpo(banheiro as Point[]);
  if (!shaft || b.length < 3 || pontos.length < 2) return uma();
  const L = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) || 1;
  const u = { x: (b[1].x - b[0].x) / L, y: (b[1].y - b[0].y) / L };
  const n = { x: -u.y, y: u.x };
  const em = (p: { x: number; y: number }) => ({ s: p.x * u.x + p.y * u.y, t: p.x * n.x + p.y * n.y });
  const es = shaft.map(em);
  const [a0, a1] = [Math.min(...es.map((q) => q.s)), Math.max(...es.map((q) => q.s))];
  const [b0, b1] = [Math.min(...es.map((q) => q.t)), Math.max(...es.map((q) => q.t))];
  /** A face que o ponto enxerga (0: antes em s, 1: depois em s, 2: antes em t, 3: depois em t), ou −1 (dentro). */
  const face = (p: { x: number; y: number }) => {
    const q = em(p);
    const afast = [a0 - q.s, q.s - a1, b0 - q.t, q.t - b1];
    const k = afast.indexOf(Math.max(...afast));
    return afast[k] >= 0 ? k : -1;
  };
  const fora = pontos.filter((p) => face(p) >= 0);
  const faces = [...new Set(fora.map(face))];
  if (faces.length <= 1) return uma();
  const zonas: Point[][] = [];
  for (const f of faces.sort()) {
    const z = zonaMolhadaDoBanheiro(banheiro, fora.filter((p) => face(p) === f), margemMm, [shaft], caminho.filter((p) => face(p) === f), true);
    if (z) zonas.push(...recortadaPeloBanheiro(z, banheiro));
  }
  return zonas;
}

/**
 * F14c: o shaft que atende um grupo de peças de cima (o banheiro) — decisão do usuário: *"um tubo de queda por
 * banheiro de cima, no shaft colado nele"*. Vale o shaft que já existe DENTRO do banheiro (ou colado nele: um canto a
 * até 5 cm do contorno) a até `ateMm` do centro das peças; senão, um novo junto delas (`novo`). Antes valia qualquer
 * shaft a até 2 m — o de outro banheiro, do outro lado da parede, e o esgoto corria fora da laje rebaixada, no forro de
 * baixo (sobrado a 30°: 2,4 m). A previsão da laje rebaixada e o passo do shaft chamam esta mesma função.
 */
export function shaftDoGrupo(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  banheiro: readonly Point[],
  alvo: { x: number; y: number },
  nucleo: Point[] | null,
  ladoMm: number,
  ateMm: number,
  intermediarios: readonly ObjectId[] = [],
): { ring: Point[]; novo: boolean; noTerreo: string | null; estender?: ObjectId } | null {
  const doBanheiro = (n: { ring: Point[] }) =>
    n.ring.some((q) => pointInPolygon(banheiro as Point[], q) || banheiro.some((b, i) => distanciaAoLado(q, banheiro[(i + banheiro.length - 1) % banheiro.length], b) <= 50));
  const existente = (model.nucleos ?? [])
    .filter((n) => n.tipo === 'SHAFT' && doBanheiro(n))
    .map((n) => ({ n, d: Math.hypot(centroDoAnel(n.ring).x - alvo.x, centroDoAnel(n.ring).y - alvo.y) }))
    .filter((x) => x.d <= ateMm)
    .sort((a, b) => a.d - b.d)[0];
  // S4 (20/10/2026): o shaft que não chega ao pavimento do banheiro (o térreo → 1º sob o banheiro do 2º) é ESTENDIDO até
  // ele — o esgoto só desce por shaft que atravessa o pavimento das peças: ia buscar outro a 3 m, fora da laje rebaixada,
  // e o ramal cruzava o eletroduto no forro do 1º (R1-A de 3 pavimentos). Um shaft novo ao lado enchia o banheiro do 1º.
  if (existente) return { ring: existente.n.ring, novo: false, noTerreo: null, ...(pavimentosDoNucleo(model, existente.n).some((l) => l.id === S) ? {} : { estender: existente.n.id }) };
  const sh = shaftJuntoDasPecas(model, T, S, banheiro, alvo, nucleo, ladoMm, intermediarios);
  return sh ? { ring: sh.ring, novo: true, noTerreo: sh.noTerreo } : null;
}

/**
 * As PRUMADAS que atravessam um cômodo de outro pavimento: trecho vertical que encosta no piso do pavimento (vem de
 * baixo ou desce para baixo), com pelo menos `minimoMm`, fora de parede e de shaft. O que sobra depois do shaft e da
 * parede sobre parede (a ventilação de uma peça do térreo sobe na posição dela) — vira pendência com o cômodo.
 */
/** Até isto além da face, a prumada está rente à parede (no enchimento, e na faixa da disciplina — F14a), não no meio do cômodo. */
const RENTE_A_PAREDE_MM = 100;

export function prumadasPeloMeioDoComodo(model: BlueprintModel, minimoMm = 1500): { disciplina: string; rotulo: string | null; nivel: string; comodo: string }[] {
  const saida: { disciplina: string; rotulo: string | null; nivel: string; comodo: string }[] = [];
  for (const t of model.trechos ?? []) {
    if (Math.abs(t.a.x - t.b.x) >= 1 || Math.abs(t.a.y - t.b.y) >= 1) continue;
    if (Math.min(t.cotaAMm, t.cotaBMm) !== 0 || Math.abs(t.cotaAMm - t.cotaBMm) < minimoMm) continue;
    // Rente à parede conta como na parede (a coluna que desce a 3 cm da face da viga — F8b — fica no enchimento).
    const rente = model.walls.some((w) => {
      if (w.levelId !== t.levelId) return false;
      const pr = projetar(t.a, w.a, w.b);
      return pr.L >= 1 && pr.t >= -1 && pr.t <= pr.L + 1 && pr.d <= w.thicknessMm / 2 + RENTE_A_PAREDE_MM;
    });
    if (rente || (model.nucleos ?? []).some((n) => pointInPolygon(n.ring, t.a))) continue;
    const comodo = model.spaces.find((x) => x.levelId === t.levelId && pointInPolygon(x.ring, t.a));
    if (!comodo) continue;
    saida.push({ disciplina: t.disciplina, rotulo: t.rotulo ?? null, nivel: model.levels.find((l) => l.id === t.levelId)?.name ?? '', comodo: comodo.name ?? 'cômodo sem nome' });
  }
  return saida;
}

// ─── F14c: a laje rebaixada sob os banheiros de cima ─────────────────────────────────────────────────────────────

/** O anel sem pontas repetidas nem vértices colineares, no sentido anti-horário. */
function anelLimpo(anel: readonly Point[]): Point[] {
  let r = semEspiculas(anel).map((p) => ({ x: p.x, y: p.y })) as Point[];
  for (let mudou = true; mudou && r.length > 3; ) {
    mudou = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i + r.length - 1) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      if (L < 1 || Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / L <= 2) {
        r.splice(i, 1);
        mudou = true;
        break;
      }
    }
  }
  if (signedArea(r) < 0) r = r.reverse();
  return r;
}

/** O polígono recortado pelo semiplano à ESQUERDA de a→b (`esquerda`) ou à direita (Sutherland–Hodgman). */
function recortarNoSemiplano(poli: readonly Point[], a: Point, b: Point, esquerda: boolean): Point[] {
  const lado = (p: Point) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * (esquerda ? 1 : -1);
  const saida: Point[] = [];
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i];
    const q = poli[(i + 1) % poli.length];
    const lp = lado(p);
    const lq = lado(q);
    if (lp >= 0) saida.push(p);
    if ((lp >= 0) !== (lq >= 0)) {
      const t = lp / (lp - lq);
      saida.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t } as Point);
    }
  }
  return saida;
}

/** O polígono no inteiro do mm, sem repetidos; `null` se sobrar menos que uma faixa útil. */
function pecaValida(poli: readonly Point[], areaMinimaMm2: number): Point[] | null {
  const r: Point[] = [];
  for (const p of poli) {
    const q = point(Math.round(p.x), Math.round(p.y));
    if (!r.length || r[r.length - 1].x !== q.x || r[r.length - 1].y !== q.y) r.push(q);
  }
  while (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop();
  if (r.length < 3) return null;
  const limpo = anelLimpo(r);
  return limpo.length >= 3 && Math.abs(signedArea(limpo)) >= areaMinimaMm2 ? limpo : null;
}

/** Abaixo disto a sobra da laje recortada some (a faixa debaixo da parede), mm². */
const AREA_MINIMA_DA_PECA_DE_LAJE_MM2 = 100_000;

/**
 * F14c (decisão do usuário, 16/10/2026: "laje rebaixada"): as lajes do térreo (o piso de cima) recortadas em volta de
 * cada banheiro de cima — a peça sob o banheiro desce `rebaixoMm` (o esgoto dele corre no enchimento do piso até o
 * tubo de queda, fora do forro do térreo), o resto continua no nível. Os banheiros são convexos (retângulos do
 * gerador): a laje fora de cada um sai em até 4 peças sem sobreposição (a de cada lado do banheiro), a de dentro é a
 * rebaixada. As bordas do rebaixo ficam sob as paredes do banheiro (viga ou parede do térreo embaixo — F12b).
 */
export function lajesComRebaixo(cmds: readonly Command[], levelId: ObjectId, banheiros: readonly (readonly Point[])[], rebaixoMm: number): { comandos: Command[]; rebaixadas: number } {
  if (rebaixoMm <= 0 || banheiros.length === 0) return { comandos: [...cmds], rebaixadas: 0 };
  const convexos = banheiros.map((b) => anelLimpo(b as Point[])).filter((b) => b.length >= 3 && b.every((p, i) => {
    const a = b[(i + b.length - 1) % b.length];
    const c = b[(i + 1) % b.length];
    return (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x) >= 0;
  }));
  const saida: Command[] = [];
  let rebaixadas = 0;
  for (const c of cmds) {
    const laje = c as Extract<Command, { type: 'AddStructural' }>;
    // A laje sem base explícita (a do kernel por padrão) fica como está: não há de onde descer o rebaixo.
    if (c.type !== 'AddStructural' || laje.kind !== 'LAJE' || laje.levelId !== levelId || laje.baseMm == null) {
      saida.push(c);
      continue;
    }
    const base = laje.baseMm;
    let pecas: { anel: Point[]; rebaixada: boolean }[] = [{ anel: anelLimpo(laje.pontos as Point[]), rebaixada: false }];
    for (const b of convexos) {
      const novas: typeof pecas = [];
      for (const p of pecas) {
        if (p.rebaixada) {
          novas.push(p);
          continue;
        }
        let dentro: Point[] = p.anel;
        for (let i = 0; i < b.length && dentro.length >= 3; i++) dentro = recortarNoSemiplano(dentro, b[i], b[(i + 1) % b.length], true);
        const dentroValida = dentro.length >= 3 ? pecaValida(dentro, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
        if (!dentroValida) {
          novas.push(p);
          continue;
        }
        // Fora do banheiro: à direita do lado i e à esquerda dos anteriores.
        for (let i = 0; i < b.length; i++) {
          let fora: Point[] = recortarNoSemiplano(p.anel, b[i], b[(i + 1) % b.length], false);
          for (let j = 0; j < i && fora.length >= 3; j++) fora = recortarNoSemiplano(fora, b[j], b[(j + 1) % b.length], true);
          const v = fora.length >= 3 ? pecaValida(fora, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
          if (v) novas.push({ anel: v, rebaixada: false });
        }
        novas.push({ anel: dentroValida, rebaixada: true });
      }
      pecas = novas;
    }
    if (pecas.length === 1 && !pecas[0].rebaixada) {
      saida.push(c);
      continue;
    }
    pecas.forEach((p, k) => {
      if (p.rebaixada) rebaixadas++;
      saida.push({
        ...laje,
        pontos: p.anel.map((q) => ({ x: q.x, y: q.y })),
        baseMm: p.rebaixada ? base - rebaixoMm : base,
        rotulo: laje.rotulo ? `${laje.rotulo}${p.rebaixada ? 'r' : ''}${String.fromCharCode(97 + k)}` : laje.rotulo,
      } as Command);
    });
  }
  return { comandos: saida, rebaixadas };
}

/**
 * F14c: a ÁREA MOLHADA de um banheiro de cima — o retângulo das peças (no quadro do próprio banheiro: a direção do 1º
 * lado e a normal), aumentado de `margemMm` e recortado pelo banheiro (convexo). `null` se não sobra área.
 *
 * Com os `shafts` para onde o esgoto das peças corre, a área vai ATÉ A FACE de cada um, do lado das peças — o esgoto
 * entra no shaft por ela — e para ali: o shaft fica fora da laje rebaixada, para a água do pavimento de baixo chegar
 * às colunas dele pelo forro (com o shaft dentro, sob a laje rebaixada sobravam 3 cm de plenum e a água ia em reta).
 * O shaft cercado pelas peças (nenhuma face com todas do mesmo lado) entra inteiro. `caminho`: pontos do esgoto até o
 * shaft (a reta de cada peça ao tubo de queda, a parte dentro deste banheiro) — entram no retângulo, não na escolha da
 * face; sem peça no banheiro (o esgoto do vizinho só passa por ele), valem como peças.
 */
export function zonaMolhadaDoBanheiro(
  banheiro: readonly Point[],
  pontos: readonly { x: number; y: number }[],
  margemMm: number,
  shafts: readonly (readonly Point[])[] = [],
  caminho: readonly { x: number; y: number }[] = [],
  /** F27: o retângulo antes do recorte pelo banheiro (quem recorta é `recortadaPeloBanheiro`). */
  semRecorte = false,
): Point[] | null {
  const b = anelLimpo(banheiro as Point[]);
  if (pontos.length === 0) [pontos, caminho] = [caminho, []];
  if (b.length < 3 || pontos.length === 0) return null;
  const L = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) || 1;
  const u = { x: (b[1].x - b[0].x) / L, y: (b[1].y - b[0].y) / L };
  const n = { x: -u.y, y: u.x };
  const em = (p: { x: number; y: number }) => ({ s: p.x * u.x + p.y * u.y, t: p.x * n.x + p.y * n.y });
  const ss = pontos.map((p) => em(p).s);
  const ts = pontos.map((p) => em(p).t);
  const cs = [...ss, ...caminho.map((p) => em(p).s)];
  const ct = [...ts, ...caminho.map((p) => em(p).t)];
  let [s0, s1, t0, t1] = [Math.min(...cs) - margemMm, Math.max(...cs) + margemMm, Math.min(...ct) - margemMm, Math.max(...ct) + margemMm];
  for (const sh of shafts) {
    // A peça que caiu DENTRO do shaft (sai dele no lançamento) não conta na escolha da face.
    const fora = pontos.filter((p) => !pointInPolygon(sh as Point[], p as Point));
    const fs = (fora.length ? fora : pontos).map((p) => em(p));
    const [ps0, ps1, pt0, pt1] = [Math.min(...fs.map((q) => q.s)), Math.max(...fs.map((q) => q.s)), Math.min(...fs.map((q) => q.t)), Math.max(...fs.map((q) => q.t))];
    const es = sh.map((q) => em(q));
    const [a0, a1] = [Math.min(...es.map((q) => q.s)), Math.max(...es.map((q) => q.s))];
    const [b0, b1] = [Math.min(...es.map((q) => q.t)), Math.max(...es.map((q) => q.t))];
    // A face do shaft que deixa TODAS as peças do outro lado: a área vai até ela e para.
    if (ps1 <= a0) s1 = a0;
    else if (ps0 >= a1) s0 = a1;
    else if (pt1 <= b0) t1 = b0;
    else if (pt0 >= b1) t0 = b1;
    else {
      [s0, s1, t0, t1] = [Math.min(s0, a0), Math.max(s1, a1), Math.min(t0, b0), Math.max(t1, b1)];
      continue;
    }
    // E a área cobre a face inteira na outra direção (o esgoto entra no shaft em qualquer ponto dela).
    if (ps1 <= a0 || ps0 >= a1) [t0, t1] = [Math.min(t0, b0), Math.max(t1, b1)];
    else [s0, s1] = [Math.min(s0, a0), Math.max(s1, a1)];
  }
  const de = (s: number, t: number) => ({ x: s * u.x + t * n.x, y: s * u.y + t * n.y }) as Point;
  let r: Point[] = [de(s0, t0), de(s1, t0), de(s1, t1), de(s0, t1)];
  if (signedArea(r) < 0) r = r.reverse();
  if (semRecorte) return r;
  for (let i = 0; i < b.length && r.length >= 3; i++) r = recortarNoSemiplano(r, b[i], b[(i + 1) % b.length], true);
  return r.length >= 3 ? pecaValida(r, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
}


/**
 * F27 da casa automática (18/10/2026): as JANELAS do superior alinhadas com as do térreo, na mesma fachada. Os dois
 * pavimentos saem do gerador cada um com o seu arranjo, e as janelas de cima ficavam desencontradas das de baixo — o
 * pilar intermediário do térreo (entre duas janelas) caía, em cima, no meio de uma janela, e ficava fora (sobrado
 * 12 × 30: 2 pilares; "a viga do superior vence o vão maior"). Cada janela de cima vai para o centro da janela de baixo
 * mais perto (até `alcanceMm`, uma de baixo para cada de cima), se ali ela continua inteira na parede, a `folgaMm` das
 * pontas e das outras aberturas, e sem atravessar o encontro com uma parede interna (fica no mesmo cômodo — a
 * iluminação de 1/6 dele não muda). Devolve os `MoveOpening`.
 */
export function alinharJanelasDoSuperior(model: BlueprintModel, T: ObjectId, S: ObjectId, alcanceMm = 1500, folgaMm = 300): Command[] {
  const doNivel = (L: ObjectId) => model.walls.filter((w) => w.levelId === L);
  const paredesT = doNivel(T);
  const paredesS = doNivel(S);
  const comandos: Command[] = [];
  for (const ws of paredesS) {
    const L = Math.hypot(ws.b.x - ws.a.x, ws.b.y - ws.a.y);
    if (L < 1) continue;
    const u = { x: (ws.b.x - ws.a.x) / L, y: (ws.b.y - ws.a.y) / L };
    const ao = (p: Point) => (p.x - ws.a.x) * u.x + (p.y - ws.a.y) * u.y;
    const perp = (p: Point) => Math.abs((p.x - ws.a.x) * u.y - (p.y - ws.a.y) * u.x);
    const janelas = model.openings.filter((o) => o.wallId === ws.id && o.kind === 'window').sort((a, b) => a.offsetMm - b.offsetMm);
    if (!janelas.length) continue;
    // As janelas de baixo na MESMA linha (paredes do térreo colineares): o centro de cada uma, ao longo desta parede.
    const centros: number[] = [];
    for (const wt of paredesT) {
      if (perp(wt.a) > 5 || perp(wt.b) > 5) continue;
      const Lt = Math.hypot(wt.b.x - wt.a.x, wt.b.y - wt.a.y) || 1;
      for (const o of model.openings.filter((x) => x.wallId === wt.id && x.kind === 'window')) {
        const t = o.offsetMm + o.widthMm / 2;
        centros.push(ao({ x: wt.a.x + ((wt.b.x - wt.a.x) / Lt) * t, y: wt.a.y + ((wt.b.y - wt.a.y) / Lt) * t } as Point));
      }
    }
    if (!centros.length) continue;
    // Os encontros com paredes internas ao longo desta (a ponta de outra parede de cima sobre ela): não atravessar.
    const encontros = paredesS
      .filter((w) => w.id !== ws.id)
      .flatMap((w) => [w.a, w.b])
      .filter((p) => perp(p) < 1 && ao(p) > 1 && ao(p) < L - 1)
      .map((p) => ao(p));
    const meia = ws.thicknessMm / 2;
    const ocupados = model.openings.filter((o) => o.wallId === ws.id).map((o) => ({ id: o.id, de: o.offsetMm, ate: o.offsetMm + o.widthMm }));
    const usados = new Set<number>();
    for (const j of janelas) {
      const atual = j.offsetMm + j.widthMm / 2;
      const k = centros.map((c, i) => ({ c, i })).filter(({ i }) => !usados.has(i)).sort((p, q) => Math.abs(p.c - atual) - Math.abs(q.c - atual))[0];
      if (!k || Math.abs(k.c - atual) > alcanceMm || Math.abs(k.c - atual) < 1) continue;
      const de = Math.round(k.c - j.widthMm / 2);
      const ate = de + j.widthMm;
      if (de < folgaMm || ate > L - folgaMm) continue;
      // O cômodo: entre os mesmos encontros de antes (nenhum encontro entre a posição velha e a nova, nem dentro dela).
      const [lo, hi] = [Math.min(de, j.offsetMm), Math.max(ate, j.offsetMm + j.widthMm)];
      if (encontros.some((e) => e > lo - meia - folgaMm && e < hi + meia + folgaMm)) continue;
      if (ocupados.some((o) => o.id !== j.id && de < o.ate + folgaMm && ate > o.de - folgaMm)) continue;
      const eu = ocupados.find((o) => o.id === j.id)!;
      eu.de = de;
      eu.ate = ate;
      usados.add(k.i);
      comandos.push({ type: 'MoveOpening', openingId: j.id, offsetMm: de });
    }
  }
  return comandos;
}
