/**
 * ESGOTO AUTOMÁTICO (18/09/2026, F5 da hidráulica: *"esgoto: pontos → caixa de
 * inspeção"*).
 *
 * ─── O MODELO DE REDE ────────────────────────────────────────────────────────
 *
 *   1. o DESTINO é a CAIXA DE INSPEÇÃO (`CAIXA_INSPECAO`) do pavimento mais
 *      baixo — a mais próxima, em planta, de cada ponto. Sem CI não há rede.
 *   2. a TOPOLOGIA é a de uma casa comum:
 *        - lavatório, chuveiro, ralo, tanque e máquina → o COLETOR do próprio
 *          ambiente (caixa sifonada; senão ralo sifonado); sem coletor, vão
 *          direto ao destino, com aviso;
 *        - vaso sanitário → DIRETO ao destino (DN 100), nunca pela caixa sifonada;
 *        - pia de cozinha → CAIXA DE GORDURA mais próxima do pavimento → destino;
 *          sem caixa de gordura, direto, com aviso;
 *        - coletores e caixa de gordura → destino.
 *   3. cada ramal corre SOB O PISO (`cotaMinimaSobPisoMm`, −150) e DESCE com o
 *      caimento da NBR 8160 — 2 % até DN 75, 1 % em DN 100 —, das folhas para
 *      a raiz: a cota de um nó é a menor das chegadas, e o trecho seguinte
 *      parte dela. Do aparelho ao ramal, uma prumada na posição dele.
 *   4. o DN de cada trecho sai das UHC (unidades Hunter de contribuição, NBR
 *      8160) acumuladas a montante: ≤3 → 40, ≤6 → 50, ≤20 → 75, mais → 100 —
 *      nunca abaixo do ramal de descarga do aparelho (ficha: vaso 100, pia 50…).
 *   5. PAVIMENTO SUPERIOR: os ramais do andar correm sob o piso dele (que é o
 *      teto do térreo — a chave do nó já enxerga isso) até um TUBO DE QUEDA
 *      (DN 100) na posição do ponto de maior UHC do andar (o vaso, em geral);
 *      o TQ desce pelo térreo até a cota do ramal ali e entra na árvore do
 *      térreo como uma fonte; uma COLUNA DE VENTILAÇÃO (DN 50) sobe do TQ ao
 *      teto do andar.
 *   6. chegada na CI abaixo do FUNDO declarado dela → aviso "aprofundar".
 *   7. JUNÇÃO 45° (27/09/2026, pedido com print de isométrico): na árvore que
 *      vai à CI (ou ao tubo de queda), o ramal pode entrar NO MEIO de um trecho
 *      já traçado, no ponto em que chega a 45° a favor do fluxo — o trecho é
 *      partido ali e o encontro vira a junção em Y da NBR 8160, não um tê de
 *      90° nem um ângulo qualquer. Na caixa sifonada e na de gordura cada
 *      aparelho entra direto na caixa (é para isso que ela existe).
 *
 *   8. PILAR (F8b da casa automática, 15/10/2026): o trecho em reta que atravessa
 *      um pilar contorna pelo canto (`desvioDoPilar`, o do eletroduto), com o
 *      mesmo desnível repartido pelo caminho — desde que o caimento continue na
 *      mínima; senão fica reto e a verificação acusa.
 *
 * Idempotente: ponto que já tem trecho de esgoto na sua posição está ligado.
 * Relançar apaga os sugeridos da rede da CI; refazer apaga tudo. Não há
 * desvio de fundação, viga ou laje — só de pilar (item 8). É
 * pré-dimensionamento; o executivo é do projetista.
 */
import { dnDoRamalDeEsgoto, dnDoSubcoletor, dnDoTuboDeQueda, type PapelNoEsgoto } from './blueprintNbr8160';
import type { BlueprintModel, Command, ObjectId, Point, Space, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { CATALOGO_DE_COMPONENTES, applyBatch, envelopeDoTrecho, pointInPolygon } from './blueprintKernel';
import {
  arvoreComRotaLimitada,
  comprimentoMm,
  fazerChave,
  type Aresta,
  type No,
  type Ponto2,
} from './blueprintGrafoDeRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { lugarNoShaft, shaftPreferido } from './blueprintNucleoVertical';
import { redeDaOrigem } from './blueprintAguaAutomatica';
import { pontosDaLouca } from './blueprintPontosHidraulicos';
import { pontoNaFrente } from './blueprintAncorasHidro';
import { anelDoPilar, desvioDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';

export interface HipotesesDeEsgoto {
  /** Caimento mínimo, em %, para DN até 75 e para DN 100 ou mais (NBR 8160). */
  caimentoPctAte75: number;
  caimentoPctDe100: number;
  /** Cota em que o ramal começa sob o piso, mm (negativa). */
  cotaMinimaSobPisoMm: number;
  dnTuboQuedaMm: number;
  dnVentilacaoMm: number;
  rotaMaximaVezes: number | null;
  /** Raio em que um SHAFT (E2.4) atrai o tubo de queda. Ausente = 3000. */
  raioDoShaftMm?: number;
  /**
   * Até onde a coluna de ventilação nova vai, SOB O PISO e em aclive, buscar uma parede (ou o shaft) para subir
   * nela — em vez de subir no ponto da peça, no meio do cômodo (e, no sobrado, pelo meio do cômodo de cima).
   * Ausente = 1500; 0 = sobe na posição da peça, como antes.
   */
  ventilacaoAteAParedeMm?: number;
  /**
   * F27 item 5 da casa automática (decisão do usuário, 19/10/2026: "válvula de admissão de ar"): a peça cuja coluna
   * não acha parede que exista em todos os pavimentos de cima (a do térreo sob o TERRAÇO da casa de 3 — a coluna mais
   * perto ficava a 7–12 m) é ventilada por uma VÁLVULA DE ADMISSÃO DE AR: a ventilação sobe rente à parede só no
   * pavimento dela até a válvula. `false` = sobe no ponto, como antes. Ausente = true.
   */
  valvulaDeAdmissaoDeAr?: boolean;
  /** F27 item 5: a válvula de admissão de ar abaixo do teto do pavimento (acima do transbordamento da peça), mm. Ausente = 300. */
  valvulaAbaixoDoTetoMm?: number;
  /**
   * F14a da casa automática ("forro com faixas"): a FAIXA do esgoto — deslocamento (no mundo, mm) do tubo de queda e
   * das colunas de ventilação em relação ao ponto que eles teriam (o centro do shaft, o eixo da parede), para não
   * dividirem o lugar com as colunas de água. Ausente = sem deslocamento.
   */
  faixa?: { x: number; y: number } | null;
  /**
   * F14c da casa automática (16/10/2026): um tubo de queda por GRUPO de peças do pavimento de cima — as que ficam a
   * até esta distância umas das outras (o banheiro), cada grupo no shaft mais perto. Com um TQ só por pavimento, o
   * banheiro da suíte despejava no TQ do outro banheiro, a 7 m, num ramal que cruzava o forro do térreo. Ausente = um
   * TQ por pavimento (como antes).
   */
  tuboDeQuedaPorGrupoMm?: number | null;
  /** Quanto a caixa de inspeção AUTOMÁTICA fica para fora da fachada, mm (13/10/2026). Ausente = 1000. */
  afastamentoDaCiMm?: number;
  /**
   * S5 da casa automática (20/10/2026): a distância mínima do centro da caixa proposta a um tubo de água ENTERRADO (o
   * alimentador), mm — a caixa anda paralela à frente até ter. Na mesma reta, a caixa e o coletor corriam a 2 cm do
   * alimentador até a rua (10 × 30, 4 dorm., 3 pavimentos). Ausente = 600.
   */
  afastamentoDaCiAAguaMm?: number;
  /**
   * Profundidade presumida da rede pública (geratriz inferior) abaixo do terreno
   * na frente, mm (13/10/2026): a cota ESTIMADA da ligação posta pelo esgoto
   * automático, até alguém confirmar com a concessionária. Ausente = 1500.
   */
  profundidadeDaRedeMm?: number;
  /**
   * Para onde o esgoto vai (14/10/2026, `docs/planos/2026-10-14-esgoto-destino-rede-ou-tratamento.md`):
   * ausente = REDE PÚBLICA (ligação + coletor); `'TRATAMENTO'` = tanque séptico → (filtro) → sumidouro.
   * Fica FORA de `HIPOTESES_ESGOTO_PADRAO` e "rede pública" grava o campo AUSENTE de propósito: o hash
   * da ART (`hashDaBaseHidro`) cobre todas as hipóteses, e `stableStringify` ignora `undefined` — um
   * campo novo com padrão mudaria o hash de todo estudo já emitido.
   */
  destino?: DestinoDoEsgoto;
  /** NBR 8160: a 1ª caixa intermediária a no máximo esta distância da ligação, mm. Ausente = 15 000. */
  distanciaAteALigacaoMm?: number;
  /** NBR 8160: distância máxima entre caixas no coletor, mm. Ausente = 25 000. */
  distanciaEntreCaixasMm?: number;
}

export type DestinoDoEsgoto = 'REDE_PUBLICA' | 'TRATAMENTO';
export const DESTINOS_DO_ESGOTO: readonly DestinoDoEsgoto[] = ['REDE_PUBLICA', 'TRATAMENTO'];
/** O destino em vigor (ausente = rede pública). */
export const destinoDoEsgoto = (hip: Pick<HipotesesDeEsgoto, 'destino'>): DestinoDoEsgoto => (hip.destino === 'TRATAMENTO' ? 'TRATAMENTO' : 'REDE_PUBLICA');

export const HIPOTESES_ESGOTO_PADRAO: HipotesesDeEsgoto = {
  caimentoPctAte75: 2,
  caimentoPctDe100: 1,
  cotaMinimaSobPisoMm: -150,
  dnTuboQuedaMm: 100,
  dnVentilacaoMm: 50,
  rotaMaximaVezes: 1.5,
  raioDoShaftMm: 3000,
  afastamentoDaCiMm: 1000,
  profundidadeDaRedeMm: 1500,
};

/** DN do ramal pelas UHC acumuladas (NBR 8160, simplificado). */
export function dnPorUhc(uhc: number): number {
  if (uhc <= 3) return 40;
  if (uhc <= 6) return 50;
  if (uhc <= 20) return 75;
  return 100;
}

export const caimentoPct = (dn: number, hip: HipotesesDeEsgoto) => (dn >= 100 ? hip.caimentoPctDe100 : hip.caimentoPctAte75);

export interface PavimentoDoPlanoDeEsgoto {
  levelId: ObjectId;
  nome: string;
  fontes: number;
  ligadas: number;
  aLigar: number;
  tuboDeQueda: boolean;
}

export interface PlanoDeEsgoto {
  destinoId: ObjectId | null;
  pavimentos: PavimentoDoPlanoDeEsgoto[];
  fontes: number;
  ligadas: number;
  aLigar: number;
  uhcTotal: number;
  dnMaximoMm: number;
  /** A cota (mm, do piso do térreo) em que a rede chega à CI. */
  cotaDeChegadaMm: number | null;
  sugeridos: number;
  trechosDaRede: number;
  comandos: Command[];
  metrosPrevistos: number;
  avisos: string[];
  motivo: string | null;
  /**
   * Sem caixa de inspeção no desenho, a que o lançamento PÕE (13/10/2026): o
   * `AddTerminal` dela é o primeiro dos `comandos`. `destinoId` continua null
   * até o lançamento — a conferência do executivo lê null como "sem caixa", e
   * uma caixa só proposta não existe. Ausente = a caixa já está no desenho.
   */
  caixaProposta?: CaixaProposta | null;
}

export interface CaixaProposta {
  levelId: ObjectId;
  at: Ponto2;
  cotaMm: number;
  /** De onde veio a direção: a frente do lote (e qual regra a achou) ou, sem frente, a fachada mais perto. */
  rumo: 'PAPEL' | 'TESTADA' | 'VIA' | 'FACHADA';
}

/**
 * F14c: as peças do pavimento em grupos por proximidade (encadeada: entra no grupo quem está a até `raioMm` de alguma
 * peça dele) — a caixa sifonada fica no grupo das peças que despejam nela. `null` = um grupo só.
 */
function gruposDeTuboDeQueda<F extends { terminal: { id: string; at: { x: number; y: number } }; destino: { id: string } | null }>(
  fontes: readonly F[],
  raioMm: number | null,
  comodoDe: (p: { x: number; y: number }) => string | null = () => null,
): F[][] {
  if (!raioMm || fontes.length <= 1) return [fontes.slice()];
  const grupo = fontes.map((_, i) => i);
  const raiz = (i: number): number => (grupo[i] === i ? i : (grupo[i] = raiz(grupo[i])));
  const unir = (i: number, j: number) => {
    const a = raiz(i);
    const b = raiz(j);
    if (a !== b) grupo[Math.max(a, b)] = Math.min(a, b);
  };
  for (let i = 0; i < fontes.length; i++) {
    for (let j = i + 1; j < fontes.length; j++) {
      const a = fontes[i].terminal.at;
      const b = fontes[j].terminal.at;
      const despeja = fontes[i].destino?.id === fontes[j].terminal.id || fontes[j].destino?.id === fontes[i].terminal.id;
      // F14c: só no MESMO cômodo ("um tubo de queda por banheiro de cima"): a caixa sifonada do banheiro social a 2,5 m
      // do da suíte descia no shaft dele, e o ramal cortava o cômodo entre os dois, fora da laje rebaixada.
      if (despeja || (Math.hypot(a.x - b.x, a.y - b.y) <= raioMm && comodoDe(a) === comodoDe(b))) unir(i, j);
    }
  }
  const porRaiz = new Map<number, F[]>();
  fontes.forEach((f, i) => porRaiz.set(raiz(i), [...(porRaiz.get(raiz(i)) ?? []), f]));
  return [...porRaiz.keys()].sort((a, b) => a - b).map((k) => porRaiz.get(k)!);
}

type Fonte = {
  terminal: Terminal;
  uhc: number;
  dnMinimo: number;
  destino: Terminal | null;
  /** A prumada da fonte até o ramal leva este rótulo/DN — é como o tubo de queda entra no térreo. */
  prumada?: { rotulo: string; dnMm: number };
};

const COLETORES: TipoDePontoHidraulico[] = ['CAIXA_SIFONADA', 'RALO_SIFONADO', 'RALO_LINEAR'];

/** Afastamento mínimo da junção às pontas do trecho partido, e do ramal ao trecho, mm. */
export const FOLGA_DA_JUNCAO_MM = 150;
/**
 * A junção ganha do nó existente se o ramal dela não passar de 1,25 × o ramal
 * até o nó: o Y a 45° é a ligação certa no esgoto (NBR 8160), e pendurar o
 * ramal no ponto de outro aparelho é o que fazia os ângulos tortos.
 */
export const PREFERENCIA_DA_JUNCAO = 1.25;

/** Aresta dirigida em planta: `de` é JUSANTE (rumo à caixa), `para` é MONTANTE. */
export interface ArestaDeEsgoto {
  de: Ponto2;
  para: Ponto2;
}

/**
 * A árvore da caixa de inspeção COM JUNÇÕES A 45° — como se traça à mão:
 *
 *   1. o TRONCO sai do aparelho MAIS DISTANTE da raiz, reto até ela;
 *   2. cada um dos outros, do mais distante ao mais perto, entra num trecho já
 *      traçado por uma junção a 45° a favor do fluxo, ou direto na raiz (a caixa
 *      recebe várias entradas) — o que for mais curto, com a junção valendo
 *      `PREFERENCIA_DA_JUNCAO` × e a rota limitada (`limite` × a reta) valendo
 *      para as duas;
 *   3. aparelho EM CIMA de um trecho (a menos de `FOLGA_DA_JUNCAO_MM` da reta)
 *      parte o trecho ali: o tubo passa por ele.
 *
 * Nunca pendura um ramal no ponto de OUTRO aparelho nem numa caixa
 * intermediária: era isso que fazia os ângulos tortos (e o vaso entrando pela
 * caixa sifonada). A junção Q: com `h` a distância de P à reta do trecho e `s`
 * a projeção de P a partir da ponta de MONTANTE, Q fica a `s + h` dela — o
 * ramal anda `h` para o lado e `h` a favor do fluxo; Q cai dentro do trecho, a
 * `FOLGA_DA_JUNCAO_MM` das pontas. Determinístico.
 */
export function arvoreComJuncoes45(opts: {
  raiz: Ponto2;
  pendentes: readonly Ponto2[];
  limite: number | null;
}): ArestaDeEsgoto[] {
  const k = (p: Ponto2) => `${p.x},${p.y}`;
  const arestas: ArestaDeEsgoto[] = [];
  /** Caminho em planta de cada nó até a raiz, mm. */
  const rota = new Map<string, number>([[k(opts.raiz), 0]]);
  const ordem = [...new Map(opts.pendentes.map((p) => [k(p), p])).values()]
    .filter((p) => k(p) !== k(opts.raiz))
    .sort((p, q) => distancia(q, opts.raiz) - distancia(p, opts.raiz) || p.x - q.x || p.y - q.y);
  for (const p of ordem) {
    const reta = distancia(p, opts.raiz);
    const cabe = (r: number) => opts.limite == null || r <= opts.limite * reta + 1;
    // Direto na raiz: sempre cabe.
    let melhor: { custo: number; rota: number; parte: { aresta: number; q: Ponto2 } | null } = { custo: reta, rota: reta, parte: null };
    arestas.forEach((a, ia) => {
      const L = distancia(a.de, a.para);
      if (L < 2 * FOLGA_DA_JUNCAO_MM) return;
      const f = { x: (a.de.x - a.para.x) / L, y: (a.de.y - a.para.y) / L };
      const w = { x: p.x - a.para.x, y: p.y - a.para.y };
      const s = w.x * f.x + w.y * f.y;
      const h = Math.abs(w.x * f.y - w.y * f.x);
      const rotaDe = rota.get(k(a.de)) ?? Infinity;
      if (h < FOLGA_DA_JUNCAO_MM) {
        // Em cima do trecho: o tubo passa pelo aparelho (ou pela projeção dele).
        if (s < FOLGA_DA_JUNCAO_MM || s > L - FOLGA_DA_JUNCAO_MM) return;
        const q = h <= 1 ? p : { x: Math.round(a.para.x + s * f.x), y: Math.round(a.para.y + s * f.y) };
        const r = rotaDe + (L - s) + h;
        if (cabe(r) && h < melhor.custo) melhor = { custo: h, rota: r, parte: { aresta: ia, q } };
        return;
      }
      const t = s + h;
      if (t < FOLGA_DA_JUNCAO_MM || t > L - FOLGA_DA_JUNCAO_MM) return;
      const q = { x: Math.round(a.para.x + t * f.x), y: Math.round(a.para.y + t * f.y) };
      if (rota.has(k(q))) return;
      const d = distancia(p, q);
      const r = rotaDe + (L - t) + d;
      if (cabe(r) && d / PREFERENCIA_DA_JUNCAO < melhor.custo) melhor = { custo: d / PREFERENCIA_DA_JUNCAO, rota: r, parte: { aresta: ia, q } };
    });
    if (!melhor.parte) {
      arestas.push({ de: opts.raiz, para: p });
    } else {
      const { aresta, q } = melhor.parte;
      const a = arestas[aresta];
      arestas.splice(aresta, 1, { de: a.de, para: q }, { de: q, para: a.para });
      rota.set(k(q), (rota.get(k(a.de)) ?? 0) + distancia(a.de, q));
      if (k(q) !== k(p)) arestas.push({ de: q, para: p });
    }
    rota.set(k(p), melhor.rota);
  }
  return arestas;
}
const APARELHOS_DO_COLETOR: TipoDePontoHidraulico[] = ['LAVATORIO', 'CHUVEIRO', 'RALO_SECO', 'TANQUE', 'MAQUINA_LAVAR', 'DUCHA_HIGIENICA', 'TORNEIRA', 'BIDE', 'BANHEIRA'];

const uhcDe = (t: Terminal) => (t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].uhcNbr8160 ?? 0) : 0);
const dnFichaDe = (t: Terminal) => (t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].dnMinimoMm.ESGOTO ?? 40) : 40);
const distancia = (a: Ponto2, b: Ponto2) => Math.hypot(a.x - b.x, a.y - b.y);

function espacoDe(model: BlueprintModel, t: Terminal): Space | null {
  return (
    model.spaces.find((s) => s.levelId === t.levelId && pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at))) ?? null
  );
}

/** O que NÃO é fonte de esgoto: as caixas de passagem e os destinos. */
const PASSAGEM_OU_DESTINO = new Set(['CAIXA_INSPECAO', 'LIGACAO_ESGOTO', 'TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO']);

/** Os pontos de esgoto tipados do desenho (fora as caixas de inspeção). */
export function fontesDeEsgoto(model: BlueprintModel): Terminal[] {
  // A ligação à rede pública (E5.3) é destino, não fonte; o tratamento individual (E7.1) é passagem e destino.
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico != null && !PASSAGEM_OU_DESTINO.has(t.tipoHidraulico));
}

/**
 * Os DESTINOS finais do esgoto, antes das caixas de inspeção: a ligação à rede
 * pública (E5.3) e, sem rede, o sumidouro do tratamento individual (E7.1).
 */
export function destinosDoEsgoto(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && (t.tipoHidraulico === 'LIGACAO_ESGOTO' || t.tipoHidraulico === 'SUMIDOURO'));
}

/** As unidades do tratamento individual por onde o esgoto passa (E7.1). */
export function unidadesDeTratamento(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && (t.tipoHidraulico === 'TANQUE_SEPTICO' || t.tipoHidraulico === 'FILTRO_ANAEROBIO' || t.tipoHidraulico === 'SUMIDOURO'));
}

export function caixasDeInspecao(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO');
}

/**
 * O PLANO DO ESGOTO, já com os DN das TABELAS da NBR 8160 (E5.1, 29/09/2026).
 *
 * O traçado (abaixo, `planejarEsgotoTracado`) escolhe os DN pelo degrau do
 * ramal; aqui o plano é aplicado numa cópia, o cálculo por PAPEL
 * (`esgotoTrechoATrecho`: tubo de queda pela tabela 6, subcoletor pela 7, DN
 * mínimo 100) diz onde falta diâmetro, e o DN é corrigido NO PRÓPRIO
 * `AddTrecho` — sem depender dos ids que o kernel dará (relançar apaga antes).
 */
export function planejarEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  return caixasDeInspecao(model).length > 0 ? planejarEsgotoComDn(model, hip) : comCaixaProposta(model, hip);
}

// ─── A CAIXA DE INSPEÇÃO AUTOMÁTICA (13/10/2026) ─────────────────────────────
//
// Plano `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 2.1. Antes,
// sem CI o esgoto automático parava em "coloque uma caixa de inspeção" — um
// passo manual num botão que se chama automático. A caixa nasce `sugerida`;
// mover apaga a marca, e o plano recalcula sobre a posição nova.

/** As 8 direções da busca pela fachada mais perto, quando o lote não diz onde é a rua. */
const OITO_RUMOS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: Math.round(Math.cos((k * Math.PI) / 4) * 1e6) / 1e6, y: Math.round(Math.sin((k * Math.PI) / 4) * 1e6) / 1e6 }));

/**
 * Até onde o raio que sai de `de` no rumo `u` ainda cruza parede do pavimento:
 * a ÚLTIMA parede cruzada, mais meia espessura dela. null = não cruza nenhuma.
 */
function saidaDasParedes(model: BlueprintModel, levelId: ObjectId, de: Ponto2, u: Ponto2, alcanceMm: number): number | null {
  let ultima: number | null = null;
  for (const w of model.walls) {
    if (w.levelId !== levelId) continue;
    const ex = w.b.x - w.a.x;
    const ey = w.b.y - w.a.y;
    const den = u.x * ey - u.y * ex;
    if (Math.abs(den) < 1e-9) continue; // paralela ao raio
    const wx = w.a.x - de.x;
    const wy = w.a.y - de.y;
    const t = (wx * ey - wy * ex) / den; // ao longo do raio
    const s = (wx * u.y - wy * u.x) / den; // ao longo da parede
    if (t <= 0 || t > alcanceMm || s < 0 || s > 1) continue;
    const fim = t + w.thicknessMm / 2;
    if (ultima == null || fim > ultima) ultima = fim;
  }
  return ultima;
}

/**
 * ONDE a caixa automática fica: a SAÍDA do esgoto (a fonte de maior UHC — o
 * vaso, em geral, que é também onde o tubo de queda desce) levada no rumo da
 * frente do lote até passar a última parede, mais `afastamentoDaCiMm`. Com o
 * prédio colado na frente, a caixa fica entre a fachada e a divisa. Sem frente
 * conhecida, a fachada mais perto da saída. null = não há fonte de esgoto.
 */
export function posicaoDaCaixaProposta(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): Omit<CaixaProposta, 'cotaMm'> | null {
  const fontes = fontesDeEsgoto(model);
  if (fontes.length === 0) return null;
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const nivelId = [...fontes].sort((a, b) => (elevacao.get(a.levelId) ?? 0) - (elevacao.get(b.levelId) ?? 0))[0].levelId;
  const saida = [...fontes].sort((a, b) => uhcDe(b) - uhcDe(a) || a.id.localeCompare(b.id))[0].at;
  const afastamento = hip.afastamentoDaCiMm ?? 1000;
  const no = (u: Ponto2, d: number) => ({ x: Math.round(saida.x + u.x * d), y: Math.round(saida.y + u.y * d) });

  const frente = pontoNaFrente(model, saida);
  if (frente) {
    const ate = distancia(saida, frente.ponto);
    if (ate < 1) return { levelId: nivelId, at: { ...frente.ponto }, rumo: frente.origem };
    const u = { x: (frente.ponto.x - saida.x) / ate, y: (frente.ponto.y - saida.y) / ate };
    const fachada = saidaDasParedes(model, nivelId, saida, u, ate) ?? 0;
    // Cabe o afastamento antes da divisa? Senão, o meio do caminho entre a fachada e ela.
    const d = fachada + afastamento <= ate ? fachada + afastamento : (fachada + ate) / 2;
    return { levelId: nivelId, at: longeDaAguaEnterrada(model, nivelId, no(u, d), { x: -u.y, y: u.x }, hip.afastamentoDaCiAAguaMm ?? 600), rumo: frente.origem };
  }
  let melhor: { u: Ponto2; d: number } | null = null;
  for (const u of OITO_RUMOS) {
    const d = saidaDasParedes(model, nivelId, saida, u, 1e9);
    if (d != null && (!melhor || d < melhor.d - 1e-6)) melhor = { u, d };
  }
  // Sem parede nenhuma no pavimento: ao lado da saída, para o sul.
  const r = melhor ?? { u: { x: 0, y: -1 }, d: 0 };
  return { levelId: nivelId, at: no(r.u, r.d + afastamento), rumo: 'FACHADA' };
}

/**
 * S5: a caixa proposta que cairia a menos de `folgaMm` de um tubo de água enterrado do pavimento (o alimentador, traçado
 * antes) anda ao longo de `n` (paralela à frente), de 10 em 10 cm até 2 m, para o lado mais perto que fica livre — e
 * ainda com a frente do lote diante dela. Nenhum livre: fica onde estava.
 */
function longeDaAguaEnterrada(model: BlueprintModel, levelId: ObjectId, p: Ponto2, n: Ponto2, folgaMm: number): Ponto2 {
  const enterrados = (model.trechos ?? []).filter((t) => t.levelId === levelId && t.disciplina === 'AGUA_FRIA' && Math.max(t.cotaAMm, t.cotaBMm) < 0 && (t.a.x !== t.b.x || t.a.y !== t.b.y));
  const dSeg = (q: Ponto2, a: Ponto2, b: Ponto2) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
  };
  const livre = (q: Ponto2) => enterrados.every((t) => dSeg(q, t.a, t.b) >= folgaMm);
  if (livre(p)) return p;
  for (let d = 100; d <= 2000; d += 100)
    for (const s of [1, -1]) {
      const q = { x: Math.round(p.x + n.x * d * s), y: Math.round(p.y + n.y * d * s) };
      if (livre(q) && pontoNaFrente(model, q as Point)) return q;
    }
  return p;
}

/** O plano com a caixa PROPOSTA: traça sobre um rascunho que já a tem, e a caixa vai à frente no lote de comandos. */
function comCaixaProposta(model: BlueprintModel, hip: HipotesesDeEsgoto): PlanoDeEsgoto {
  // Sem fonte não há caixa a propor — mas o traçado roda assim mesmo, num rascunho
  // com uma caixa no térreo, para o motivo dizer o que falta de VERDADE (a louça sem
  // ponto, o aparelho só na água fria), e não "coloque uma caixa de inspeção".
  const terreo = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm)[0];
  if (!terreo) return planejarEsgotoComDn(model, hip);
  const pos = posicaoDaCaixaProposta(model, hip) ?? { levelId: terreo.id, at: { x: 0, y: 0 }, rumo: 'FACHADA' as const };
  const cotaDaFicha = FICHA_DO_PONTO_HIDRAULICO.CAIXA_INSPECAO.cotaMm.ESGOTO ?? -600;
  const caixa = (cotaMm: number): Extract<Command, { type: 'AddTerminal' }> => ({
    type: 'AddTerminal', levelId: pos.levelId, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO.CAIXA_INSPECAO.rotulo,
    at: { ...pos.at }, cotaMm, tipoHidraulico: 'CAIXA_INSPECAO', sugerida: true,
  });
  const tracar = (cotaMm: number) => planejarEsgotoComDn(applyBatch(model, [caixa(cotaMm)]).model, hip);
  let cotaMm = cotaDaFicha;
  let plano = tracar(cotaMm);
  // A chegada da rede não depende da cota da caixa: se ela chega mais funda que a
  // ficha, a caixa automática é assentada ali — nasce sem o aviso "aprofunde a caixa".
  if (plano.cotaDeChegadaMm != null && plano.cotaDeChegadaMm < cotaMm) {
    cotaMm = plano.cotaDeChegadaMm;
    plano = tracar(cotaMm);
  }
  // Nada a ligar (sem aparelho, louça sem ponto…): o motivo do traçado vale, e não se propõe caixa vazia.
  if (plano.comandos.length === 0) return { ...plano, destinoId: null, trechosDaRede: 0, sugeridos: 0, caixaProposta: null };
  return { ...plano, destinoId: null, comandos: [caixa(cotaMm), ...plano.comandos], caixaProposta: { ...pos, cotaMm } };
}

/** O plano sobre uma CI que já está no desenho: o traçado e o DN pelas tabelas (E5.1). */
function planejarEsgotoComDn(model: BlueprintModel, hip: HipotesesDeEsgoto): PlanoDeEsgoto {
  const plano = planejarEsgotoTracado(model, hip);
  const indices = plano.comandos.map((c, i) => (c.type === 'AddTrecho' ? i : -1)).filter((i) => i >= 0);
  if (indices.length === 0) return plano;
  let aplicado: BlueprintModel;
  let criados: string[];
  try {
    const r = applyBatch(model, plano.comandos);
    aplicado = r.model;
    criados = r.diff.created.filter((id) => (aplicado.trechos ?? []).some((t) => t.id === id));
  } catch {
    return plano;
  }
  if (criados.length !== indices.length) return plano;
  const indiceDoTrecho = new Map(criados.map((id, k) => [id, indices[k]]));
  const novoDn = new Map<number, number>();
  for (const c of esgotoTrechoATrecho(aplicado, hip)) {
    const i = indiceDoTrecho.get(c.trechoId);
    if (i != null && c.dnAtualMm < c.dnNecessarioMm) novoDn.set(i, c.dnNecessarioMm);
  }
  if (novoDn.size === 0) return plano;
  const comandos = plano.comandos.map((c, i) => (novoDn.has(i) && c.type === 'AddTrecho' ? { ...c, bitolaMm: novoDn.get(i)! } : c));
  return {
    ...plano,
    comandos,
    dnMaximoMm: Math.max(plano.dnMaximoMm, ...novoDn.values()),
    avisos: [...plano.avisos, `${novoDn.size} trecho(s) com o DN pelas tabelas da NBR 8160 (tubo de queda, subcoletor)`],
  };
}

/** O TRAÇADO do esgoto (antes de E5.1, `planejarEsgoto`): caminhos, cotas e o DN pelo degrau do ramal. */
function planejarEsgotoTracado(model: BlueprintModel, hip: HipotesesDeEsgoto): PlanoDeEsgoto {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const indice = new Map(niveis.map((l, i) => [l.id, i]));
  const cis = caixasDeInspecao(model);
  const avisos: string[] = [];
  const vazio = (motivo: string | null, extra: Partial<PlanoDeEsgoto> = {}): PlanoDeEsgoto => ({
    destinoId: null, pavimentos: [], fontes: 0, ligadas: 0, aLigar: 0, uhcTotal: 0, dnMaximoMm: 0, cotaDeChegadaMm: null,
    sugeridos: 0, trechosDaRede: 0, comandos: [], metrosPrevistos: 0, avisos, motivo, ...extra,
  });
  if (cis.length === 0) return vazio('coloque uma caixa de inspeção (Hidráulica › esgoto) — é o destino da rede');
  // O destino fica no pavimento mais baixo que tem CI.
  const nivelDoDestino = niveis.find((l) => cis.some((c) => c.levelId === l.id))!;
  const cisDoTerreo = cis.filter((c) => c.levelId === nivelDoDestino.id);
  const idxDestino = indice.get(nivelDoDestino.id) ?? 0;
  const rede = cisDoTerreo.flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO'));
  const sugeridos = rede.filter((t) => t.sugerido).length;

  const todas = fontesDeEsgoto(model).filter((t) => (indice.get(t.levelId) ?? 0) >= idxDestino);
  // O motivo diz O QUE FAZER, não só o que falta. Os casos comuns: a LOUÇA
  // desenhada sem ponto (desenhada antes de 27/09/2026, quando a peça passou a
  // lançar os seus), o aparelho só na água fria (cada rede tem o seu ponto) e o
  // ponto sem tipo.
  const loucasSemEsgoto = (model.componentes ?? [])
    .filter((c) => (indice.get(c.levelId) ?? 0) >= idxDestino && pontosDaLouca(model, c).some((p) => p.disciplina === 'ESGOTO'));
  const nomesDasLoucas = [...new Set(loucasSemEsgoto.map((c) => c.rotulo || CATALOGO_DE_COMPONENTES[c.tipoId].rotulo))].join(', ');
  if (todas.length === 0) return vazio(loucasSemEsgoto.length > 0
    ? `${loucasSemEsgoto.length === 1 ? 'a louça desenhada' : `${loucasSemEsgoto.length} louças desenhadas`} (${nomesDasLoucas}) ainda sem ponto de esgoto — selecione a peça e clique em "Lançar os pontos"`
    : 'coloque os aparelhos na rede de esgoto — no menu Hidráulica, os itens "· esgoto" (Vaso sanitário · esgoto, Chuveiro · esgoto…); o mesmo aparelho na água fria, ou o ponto de esgoto sem tipo, não conta', { sugeridos, trechosDaRede: rede.length, destinoId: cisDoTerreo[0].id });

  // Ligados: já há trecho de esgoto encostando na posição.
  const pontas = new Map<ObjectId, Set<string>>();
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'ESGOTO')) {
    const s = pontas.get(t.levelId) ?? new Set<string>();
    s.add(`${t.a.x},${t.a.y}`);
    s.add(`${t.b.x},${t.b.y}`);
    pontas.set(t.levelId, s);
  }
  const ligada = (t: Terminal) => pontas.get(t.levelId)?.has(`${t.at.x},${t.at.y}`) ?? false;

  // ── Quem vai para onde ────────────────────────────────────────────────────
  const coletores = todas.filter((t) => COLETORES.includes(t.tipoHidraulico!));
  const gorduras = todas.filter((t) => t.tipoHidraulico === 'CAIXA_GORDURA');
  const maisProxima = (de: Terminal, entre: Terminal[]) =>
    entre.filter((x) => x.levelId === de.levelId && x.id !== de.id).sort((a, b) => distancia(a.at, de.at) - distancia(b.at, de.at))[0] ?? null;
  const fontes: Fonte[] = todas.map((t) => {
    const tipo = t.tipoHidraulico!;
    let destino: Terminal | null = null;
    if (APARELHOS_DO_COLETOR.includes(tipo)) {
      const espaco = espacoDe(model, t);
      const noAmbiente = coletores.filter((c) => c.id !== t.id && (espaco ? pointInPolygon(espaco.ring, c.at) && c.levelId === t.levelId : false));
      const caixa = noAmbiente.find((c) => c.tipoHidraulico === 'CAIXA_SIFONADA') ?? noAmbiente[0] ?? null;
      // F14c: com um TQ por grupo (casa automática), o aparelho longe da caixa sifonada (o lavatório na outra ponta do
      // banheiro comprido) vai direto ao tubo de queda pelo sifão dele — preso à caixa, amarrava as duas pontas num grupo
      // só e o esgoto corria 5 m sob o piso, mais que o enchimento da laje rebaixada comporta.
      if (caixa && hip.tuboDeQuedaPorGrupoMm && distancia(caixa.at, t.at) > hip.tuboDeQuedaPorGrupoMm) {
        avisos.push(`${FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo} em ${espaco?.name ?? 'ambiente sem nome'} a ${(distancia(caixa.at, t.at) / 1000).toFixed(1).replace('.', ',')} m da caixa sifonada — ligado direto ao tubo de queda pelo sifão dele`);
      } else if (caixa) destino = caixa;
      else avisos.push(`${FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo} em ${espaco?.name ?? 'ambiente sem nome'} sem caixa sifonada — ligado direto à caixa de inspeção`);
    } else if (tipo === 'PIA_COZINHA') {
      const cg = maisProxima(t, gorduras);
      if (cg) destino = cg;
      else avisos.push('pia de cozinha sem caixa de gordura — ligada direto à caixa de inspeção');
    }
    return { terminal: t, uhc: uhcDe(t), dnMinimo: dnFichaDe(t), destino };
  });

  // ── Pavimentos, TQ e a árvore de cada um ─────────────────────────────────
  const chave = fazerChave(model.levels);
  const novos: Extract<Command, { type: 'AddTrecho' }>[] = [];
  const arestas: Aresta[] = [];
  /** Aresta dirigida do grafo em planta: `de` é jusante (rumo à CI), `para` é montante. */
  const dirigidas: { levelId: ObjectId; de: Ponto2; para: Ponto2; deKey: string; paraKey: string }[] = [];
  const k2 = (levelId: ObjectId, p: Ponto2) => `${levelId}|${p.x},${p.y}`;
  const pendentesPorNivel = new Map<ObjectId, Fonte[]>();
  for (const f of fontes) pendentesPorNivel.set(f.terminal.levelId, [...(pendentesPorNivel.get(f.terminal.levelId) ?? []), f]);

  const pavimentos: PavimentoDoPlanoDeEsgoto[] = [];
  /** As fontes que entram na árvore do térreo vindas de cima: o TQ de cada andar (posição, UHC, DN, cota do topo no térreo). */
  const chegadasDeCima: { pos: Ponto2; uhc: number; dnMinimo: number; topoNoTerreoMm: number }[] = [];
  const cotaPorNo = new Map<string, number>();
  const uhcPorNo = new Map<string, number>();
  const dnMinPorNo = new Map<string, number>();
  let dnMaximoMm = 0;

  const construirArvoreDoNivel = (
    levelId: ObjectId,
    raiz: Ponto2,
    doNivel: Fonte[],
    cotaDaRaizMinima: number | null,
  ): { cotaRaiz: number; uhc: number; dnMinimo: number } => {
    const raizKey = k2(levelId, raiz);
    // 1) Subárvores dos destinos intermediários (coletor, caixa de gordura).
    const intermediarios = doNivel.filter((f) => doNivel.some((g) => g.destino?.id === f.terminal.id));
    const ligarEmPlanta = (de: Ponto2, para: Ponto2) => {
      dirigidas.push({ levelId, de, para, deKey: k2(levelId, de), paraKey: k2(levelId, para) });
    };
    for (const inter of intermediarios) {
      const filhas = doNivel.filter((f) => f.destino?.id === inter.terminal.id);
      const alcancados = new Map<No, Ponto2>([[k2(levelId, inter.terminal.at), inter.terminal.at]]);
      const rota = new Map<No, number>([[k2(levelId, inter.terminal.at), 0]]);
      const pend = new Map<No, Ponto2>(filhas.filter((f) => f.terminal.id !== inter.terminal.id).map((f) => [k2(levelId, f.terminal.at), f.terminal.at]));
      arvoreComRotaLimitada({ alcancados, rota, pendentes: pend, retaAteRaiz: (p) => distancia(p, inter.terminal.at), limite: hip.rotaMaximaVezes, ligar: (de, para) => ligarEmPlanta(de.pos, para.pos) });
    }
    // 2) Árvore principal: raiz ← intermediários + diretas, com JUNÇÕES A 45°.
    const diretas = doNivel.filter((f) => f.destino == null || !doNivel.some((g) => g.terminal.id === f.destino!.id));
    const pend = new Map<string, Ponto2>();
    for (const f of diretas) if (k2(levelId, f.terminal.at) !== raizKey) pend.set(k2(levelId, f.terminal.at), f.terminal.at);
    for (const a of arvoreComJuncoes45({ raiz, pendentes: [...pend.values()], limite: hip.rotaMaximaVezes })) ligarEmPlanta(a.de, a.para);
    // F24 da casa automática (17/10/2026): a JUNÇÃO a 45° que cai dentro de um pilar (três trechos chegavam nela no L de
    // 3 dormitórios — com a ponta lá dentro, nenhum desvio resolve) escorrega para fora dele pelo lado mais perto. As
    // peças e a raiz ficam onde estão.
    {
      const fixos = new Set([raizKey, ...doNivel.map((f) => k2(levelId, f.terminal.at))]);
      const pegadas = pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, RAIO_DO_MAIOR_RAMAL_MM + FOLGA_DA_JUNCAO_AO_PILAR_MM) as Point[]);
      const movido = new Map<string, Ponto2>();
      const paraFora = (p: Ponto2): Ponto2 | null => {
        const g = pegadas.find((x) => pointInPolygon(x, p as Point));
        if (!g) return null;
        const xs = g.map((q) => q.x);
        const ys = g.map((q) => q.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const op = [{ x: Math.floor(x0) - 1, y: p.y }, { x: Math.ceil(x1) + 1, y: p.y }, { x: p.x, y: Math.floor(y0) - 1 }, { x: p.x, y: Math.ceil(y1) + 1 }].filter((q) => !pegadas.some((x) => pointInPolygon(x, q as Point)));
        return op.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ?? null;
      };
      for (const d of dirigidas) {
        if (d.levelId !== levelId) continue;
        for (const lado of ['de', 'para'] as const) {
          const key = lado === 'de' ? d.deKey : d.paraKey;
          if (fixos.has(key)) continue;
          if (!movido.has(key)) {
            const q = paraFora(lado === 'de' ? d.de : d.para);
            if (!q) continue;
            movido.set(key, q);
          }
          const q = movido.get(key)!;
          if (lado === 'de') Object.assign(d, { de: q, deKey: k2(levelId, q) });
          else Object.assign(d, { para: q, paraKey: k2(levelId, q) });
        }
      }
    }

    // 3) UHC e DN mínimo a montante de cada nó (recursão da raiz para as folhas).
    const filhosDe = new Map<string, typeof dirigidas>();
    for (const d of dirigidas.filter((x) => x.levelId === levelId)) filhosDe.set(d.deKey, [...(filhosDe.get(d.deKey) ?? []), d]);
    const proprio = (key: string) => {
      let uhc = 0;
      let dn = 40;
      for (const f of doNivel) {
        if (k2(levelId, f.terminal.at) !== key) continue;
        uhc += f.uhc;
        dn = Math.max(dn, f.dnMinimo);
      }
      return { uhc, dn };
    };
    const acumular = (key: string): { uhc: number; dn: number } => {
      const memo = uhcPorNo.get(key);
      if (memo != null) return { uhc: memo, dn: dnMinPorNo.get(key) ?? 40 };
      let { uhc, dn } = proprio(key);
      for (const d of filhosDe.get(key) ?? []) {
        const sub = acumular(d.paraKey);
        uhc += sub.uhc;
        dn = Math.max(dn, sub.dn);
      }
      uhcPorNo.set(key, uhc);
      dnMinPorNo.set(key, dn);
      return { uhc, dn };
    };
    const total = acumular(raizKey);

    // 4) Cotas das folhas para a raiz: cada trecho desce com o caimento do seu DN.
    // O tubo, não só o eixo: a pegada do pilar crescida pelo raio dele (o DN 100 encostava no pilar com o eixo fora).
    // F20: a queda pedaço a pedaço (cada um para cima, nos vértices já em mm) — a MESMA que `contornarPilar` distribui.
    // Pelo comprimento total, com um arredondamento só, um pedaço do contorno ficava com 0,97 % (12 × 30 a 0°).
    const quedaComContorno = (a: Ponto2, b: Ponto2, dn: number): number => {
      const desvio = a.x === b.x && a.y === b.y ? null : desvioDoPilar(a, b, obstaculosDoRamal(model, levelId, dn / 2));
      return quedasDoCaminho(caminhoDoContorno(a, b, desvio), caimentoPct(dn, hip)).reduce((s, q) => s + q, 0);
    };
    const dnDaAresta = (d: (typeof dirigidas)[number]) => Math.max(dnPorUhc(uhcPorNo.get(d.paraKey) ?? 0), dnMinPorNo.get(d.paraKey) ?? 40);
    const cotaDe = (key: string): number => {
      const memo = cotaPorNo.get(key);
      if (memo != null) return memo;
      let cota = hip.cotaMinimaSobPisoMm;
      for (const d of filhosDe.get(key) ?? []) {
        const dn = dnDaAresta(d);
        // Para CIMA (28/09/2026, achado pelo memorial E3.1): com `round`, 0,72 m a 2 % davam
        // 14 mm de queda = 1,94 % — abaixo da mínima que o próprio lançamento promete.
        // F18: pelo comprimento COM o contorno do pilar (o mesmo de `contornarPilar`, adiante) — em reta, o trecho no
        // caimento exato perdia a mínima ao contornar, ficava reto e atravessava o pilar (10 × 30, 4 dorm.).
        const queda = Math.max(1, quedaComContorno(d.de, d.para, dn));
        cota = Math.min(cota, cotaDe(d.paraKey) - queda);
      }
      if (key === raizKey && cotaDaRaizMinima != null) cota = Math.min(cota, cotaDaRaizMinima);
      cotaPorNo.set(key, cota);
      return cota;
    };
    const cotaRaiz = cotaDe(raizKey);

    // 5) Os comandos: trechos em planta com as cotas, e a prumada de cada fonte até o seu nó.
    const addTrecho = (a: Ponto2, cotaA: number, b: Ponto2, cotaB: number, bitolaMm: number, rotulo?: string) => {
      const de = chave(levelId, a.x, a.y, cotaA);
      const para = chave(levelId, b.x, b.y, cotaB);
      if (de === para) return;
      if (arestas.some((x) => (x.de === de && x.para === para) || (x.de === para && x.para === de))) return;
      novos.push({ type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: { ...a }, b: { ...b }, cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm, sugerido: true, ...(rotulo ? { rotulo } : {}) });
      arestas.push({ ref: { novo: novos.length - 1 }, de, para, mm: comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB }) });
      dnMaximoMm = Math.max(dnMaximoMm, bitolaMm);
    };
    for (const d of dirigidas.filter((x) => x.levelId === levelId)) {
      const dn = dnDaAresta(d);
      // De montante (para) para jusante (de): a cota cai no sentido do fluxo.
      addTrecho(d.para, cotaDe(d.paraKey), d.de, cotaDe(d.deKey), dn);
    }
    for (const f of doNivel) {
      const key = k2(levelId, f.terminal.at);
      const cotaNo = cotaDe(key);
      if (f.terminal.cotaMm !== cotaNo) {
        addTrecho(f.terminal.at, f.terminal.cotaMm, f.terminal.at, cotaNo, f.prumada?.dnMm ?? Math.max(f.dnMinimo, dnPorUhc(f.uhc)), f.prumada?.rotulo);
      }
    }
    return { cotaRaiz, uhc: total.uhc, dnMinimo: total.dn };
  };

  // Pavimentos de cima para baixo: o TQ de cada andar vira chegada no térreo.
  const niveisComFontes = niveis.filter((l) => (pendentesPorNivel.get(l.id) ?? []).length > 0 && (indice.get(l.id) ?? 0) > idxDestino).reverse();
  for (const nivel of niveisComFontes) {
    const doNivel = (pendentesPorNivel.get(nivel.id) ?? []).filter((f) => !ligada(f.terminal));
    const todasDoNivel = pendentesPorNivel.get(nivel.id) ?? [];
    if (doNivel.length === 0) {
      pavimentos.push({ levelId: nivel.id, nome: nivel.name, fontes: todasDoNivel.length, ligadas: todasDoNivel.length, aLigar: 0, tuboDeQueda: false });
      continue;
    }
    // F14c: um TQ por grupo de peças próximas (o banheiro), quando pedido; senão um só por pavimento.
    const comodosDoNivel = model.spaces.filter((sp) => sp.levelId === nivel.id);
    const comodoDe = (p: { x: number; y: number }) => comodosDoNivel.find((sp) => pointInPolygon(sp.ring, p as Point))?.id ?? null;
    // F14c: os grupos que caem no MESMO tubo de queda (o mesmo lugar do shaft) viram um só — dois grupos com a raiz no
    // mesmo ponto dividiam a cota dela (a árvore guarda a cota por posição): o ramal DN 50 da caixa sifonada herdava a
    // do vaso, a 1 % (sobrado a 30°), e a ventilação saía dobrada.
    const porTq = new Map<string, { tq: { x: number; y: number }; grupo: typeof doNivel }>();
    for (const grupo of gruposDeTuboDeQueda(doNivel, hip.tuboDeQuedaPorGrupoMm ?? null, comodoDe)) {
      // O TQ na posição do ponto de maior UHC do grupo (o vaso, em geral); um TQ já
      // desenhado (rótulo "TQ") na mesma posição é reaproveitado pela idempotência.
      const maior = [...grupo].sort((a, b) => b.uhc - a.uhc || a.terminal.at.x - b.terminal.at.x || a.terminal.at.y - b.terminal.at.y)[0];
      // NÚCLEO VERTICAL (E2.4): com um shaft ao alcance, o TQ desce por ele.
      const noShaft = shaftPreferido(model, { x: maior.terminal.at.x, y: maior.terminal.at.y }, nivel.id, hip.raioDoShaftMm ?? 3000);
      // F14a: no shaft, o TQ na faixa do esgoto (as colunas de água ficam no centro e na faixa delas). F14c: girada, se
      // um tubo de outra rede já passa ali (o barrilete da fria sobre o shaft).
      // F27 item 5: no canto do shaft virado para as peças do grupo (o ramal não atravessa o shaft).
      const centroDoGrupo = { x: Math.round(grupo.reduce((s, f) => s + f.terminal.at.x, 0) / grupo.length), y: Math.round(grupo.reduce((s, f) => s + f.terminal.at.y, 0) / grupo.length) } as Point;
      const tq = noShaft ? lugarNoShaft(model, noShaft as Point, hip.faixa ?? null, 'ESGOTO', hip.dnTuboQuedaMm / 2, model.levels.map((l) => l.id), centroDoGrupo) : { x: maior.terminal.at.x, y: maior.terminal.at.y };
      const chaveDoTq = `${tq.x},${tq.y}`;
      const ja = porTq.get(chaveDoTq);
      if (ja) ja.grupo = [...ja.grupo, ...grupo];
      else porTq.set(chaveDoTq, { tq, grupo });
    }
    for (const { tq, grupo } of porTq.values()) {
      const { cotaRaiz, uhc, dnMinimo } = construirArvoreDoNivel(nivel.id, tq, grupo, null);
      // Ventilação: do nó do TQ ao teto do andar.
      novos.push({ type: 'AddTrecho', levelId: nivel.id, disciplina: 'ESGOTO', a: { ...tq }, b: { ...tq }, cotaAMm: cotaRaiz, cotaBMm: nivel.defaultHeightMm, bitolaMm: hip.dnVentilacaoMm, sugerido: true, rotulo: 'Ventilação' });
      arestas.push({ ref: { novo: novos.length - 1 }, de: chave(nivel.id, tq.x, tq.y, cotaRaiz), para: chave(nivel.id, tq.x, tq.y, nivel.defaultHeightMm), mm: nivel.defaultHeightMm - cotaRaiz });
      // A chegada no pavimento de baixo: o TQ começa onde o ramal do andar termina
      // (sob o piso dele = teto do de baixo + cotaRaiz, negativa) e desce até o
      // ramal do térreo — a árvore do térreo o recebe como fonte na posição do TQ.
      // F27-D4 (casa automática, 19/10/2026): do 2º pavimento para cima, o TQ ATRAVESSA os pavimentos do meio — um trecho
      // em cada um, do teto (ou da chegada do ramal, no logo abaixo da fonte) ao piso; a cota 0 é o teto do de baixo
      // (`fazerChave`). Sem eles a prumada saltava o 1º: a ponta de cima do TQ do térreo ficava aberta e o esgoto do 2º,
      // sem destino.
      const i = indice.get(nivel.id) ?? 1;
      for (let j = i - 1; j > idxDestino; j--) {
        const Lj = niveis[j];
        const de = j === i - 1 ? Lj.defaultHeightMm + cotaRaiz : Lj.defaultHeightMm;
        novos.push({ type: 'AddTrecho', levelId: Lj.id, disciplina: 'ESGOTO', a: { ...tq }, b: { ...tq }, cotaAMm: de, cotaBMm: 0, bitolaMm: Math.max(dnMinimo, hip.dnTuboQuedaMm), sugerido: true, rotulo: 'TQ' });
        arestas.push({ ref: { novo: novos.length - 1 }, de: chave(Lj.id, tq.x, tq.y, 0), para: chave(Lj.id, tq.x, tq.y, de), mm: de });
      }
      const abaixo = niveis[i - 1];
      const topoNoTerreoMm = i - 1 > idxDestino ? niveis[idxDestino].defaultHeightMm : abaixo.defaultHeightMm + cotaRaiz;
      chegadasDeCima.push({ pos: tq, uhc, dnMinimo: Math.max(dnMinimo, hip.dnTuboQuedaMm), topoNoTerreoMm });
    }
    pavimentos.push({ levelId: nivel.id, nome: nivel.name, fontes: todasDoNivel.length, ligadas: todasDoNivel.length - doNivel.length, aLigar: doNivel.length, tuboDeQueda: true });
  }

  // O térreo: destino = CI mais próxima do conjunto (uma CI por plano; a mais central).
  const doTerreo = (pendentesPorNivel.get(nivelDoDestino.id) ?? []).filter((f) => !ligada(f.terminal));
  const todasDoTerreo = pendentesPorNivel.get(nivelDoDestino.id) ?? [];
  const candidatos = [...doTerreo.map((f) => f.terminal.at), ...chegadasDeCima.map((c) => c.pos)];
  const centro = candidatos.length > 0
    ? { x: candidatos.reduce((s, p) => s + p.x, 0) / candidatos.length, y: candidatos.reduce((s, p) => s + p.y, 0) / candidatos.length }
    : cisDoTerreo[0].at;
  const ci = [...cisDoTerreo].sort((a, b) => distancia(a.at, centro) - distancia(b.at, centro))[0];
  const fontesDoTerreo: Fonte[] = [
    ...doTerreo,
    // As chegadas de cima entram como fontes "virtuais" na posição do TQ: a
    // prumada delas até o ramal É o tubo de queda.
    ...chegadasDeCima.map<Fonte>((c) => ({
      terminal: { ...ci, id: `tq-${c.pos.x}-${c.pos.y}`, at: c.pos, cotaMm: c.topoNoTerreoMm, tipoHidraulico: null } as Terminal,
      uhc: c.uhc, dnMinimo: c.dnMinimo, destino: null,
      prumada: { rotulo: 'TQ', dnMm: Math.max(hip.dnTuboQuedaMm, c.dnMinimo) },
    })),
  ];
  let cotaDeChegadaMm: number | null = null;
  if (fontesDoTerreo.length > 0) {
    const { cotaRaiz } = construirArvoreDoNivel(nivelDoDestino.id, ci.at, fontesDoTerreo, null);
    cotaDeChegadaMm = cotaRaiz;
    // Da chegada ao fundo da CI: a prumada final até a cota da peça.
    if (cotaRaiz !== ci.cotaMm) {
      const dn = Math.max(dnPorUhc(uhcPorNo.get(k2(nivelDoDestino.id, ci.at)) ?? 0), dnMinPorNo.get(k2(nivelDoDestino.id, ci.at)) ?? 40);
      novos.push({ type: 'AddTrecho', levelId: nivelDoDestino.id, disciplina: 'ESGOTO', a: { ...ci.at }, b: { ...ci.at }, cotaAMm: cotaRaiz, cotaBMm: ci.cotaMm, bitolaMm: dn, sugerido: true });
      dnMaximoMm = Math.max(dnMaximoMm, dn);
    }
    if (cotaRaiz < ci.cotaMm) avisos.push(`a rede chega à caixa de inspeção a ${cotaRaiz} mm, abaixo do fundo declarado (${ci.cotaMm} mm) — aprofunde a caixa`);
  }
  pavimentos.push({ levelId: nivelDoDestino.id, nome: nivelDoDestino.name, fontes: todasDoTerreo.length, ligadas: todasDoTerreo.length - doTerreo.length, aLigar: doTerreo.length, tuboDeQueda: false });
  pavimentos.reverse();

  const aLigar = pavimentos.reduce((n, p) => n + p.aLigar, 0);
  const ligadas = pavimentos.reduce((n, p) => n + p.ligadas, 0);
  const uhcTotal = fontes.reduce((s, f) => s + f.uhc, 0);
  const comandos: Command[] = novos.flatMap((c) => contornarPilar(model, c, hip));
  if (comandos.length === 0) return vazio('todos os pontos de esgoto já estão ligados', { destinoId: ci.id, pavimentos, fontes: todas.length, ligadas, sugeridos, trechosDaRede: rede.length, uhcTotal });
  const metros = comandos.reduce((s, c) => s + (c.type === 'AddTrecho' ? comprimentoMm(c) : 0), 0);
  return {
    destinoId: ci.id, pavimentos, fontes: todas.length, ligadas, aLigar, uhcTotal, dnMaximoMm, cotaDeChegadaMm,
    sugeridos, trechosDaRede: rede.length, comandos, metrosPrevistos: Math.round(metros / 100) / 10, avisos, motivo: null,
  };
}

/**
 * F8b: o trecho em reta que atravessa um pilar vira o contorno pelo canto, com o desnível repartido pelo
 * comprimento (cada pedaço com o mesmo caimento). Fica reto se o caimento cairia abaixo da mínima.
 */
/** F24: o raio do maior ramal enterrado (DN 100) e a folga da junção ao pilar, mm — a junção fica fora disso. */
const RAIO_DO_MAIOR_RAMAL_MM = 50;
const FOLGA_DA_JUNCAO_AO_PILAR_MM = 20;

/** F27 item 5: a folga do ramal à coluna de outra rede que atravessa o piso, mm. */
const FOLGA_DO_RAMAL_A_COLUNA_MM = 10;

/**
 * O que o ramal sob o piso contorna: os PILARES (crescidos pelo raio do tubo) e — F27 item 5 da casa automática
 * (19/10/2026) — as COLUNAS de outra rede que atravessam o piso do pavimento (a fria e a quente que sobem do de baixo
 * pelo shaft, o alimentador): um quadrado com o raio delas, o do tubo e a folga. O ramal do banheiro de cima que chega ao
 * tubo de queda pelo lado oposto do shaft cortava as colunas de água no meio dele (R1-A de 3 pavimentos: 7 encontros).
 */
const obstaculosDoRamalJaFeitos = new WeakMap<BlueprintModel, Map<string, Point[][]>>();
function obstaculosDoRamal(model: BlueprintModel, levelId: ObjectId, raioMm: number): Point[][] {
  let doModelo = obstaculosDoRamalJaFeitos.get(model);
  if (!doModelo) obstaculosDoRamalJaFeitos.set(model, (doModelo = new Map()));
  const chave = `${levelId}|${raioMm}`;
  const feito = doModelo.get(chave);
  if (feito) return feito;
  const novo = obstaculosDoRamalSemGuardar(model, levelId, raioMm);
  doModelo.set(chave, novo);
  return novo;
}

function obstaculosDoRamalSemGuardar(model: BlueprintModel, levelId: ObjectId, raioMm: number): Point[][] {
  const pilares = pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, raioMm) as Point[]);
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const i = niveis.findIndex((l) => l.id === levelId);
  const deBaixo = i > 0 ? niveis[i - 1] : null;
  const colunas = (model.trechos ?? []).filter((t) => {
    if (t.disciplina === 'ESGOTO' || t.a.x !== t.b.x || t.a.y !== t.b.y) return false;
    if (t.levelId === levelId) return Math.min(t.cotaAMm, t.cotaBMm) <= 0 && Math.max(t.cotaAMm, t.cotaBMm) > 0;
    return !!deBaixo && t.levelId === deBaixo.id && Math.max(t.cotaAMm, t.cotaBMm) >= deBaixo.defaultHeightMm;
  });
  const vistos = new Set<string>();
  const quadrados: Point[][] = [];
  for (const t of colunas) {
    const env = envelopeDoTrecho(t);
    const h = Math.ceil(Math.max(env.raioPlantaMm, env.raioVerticalMm) + raioMm + FOLGA_DO_RAMAL_A_COLUNA_MM);
    const k = `${t.a.x},${t.a.y},${h}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const { x, y } = t.a;
    quadrados.push([{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }] as Point[]);
  }
  return [...pilares, ...quadrados];
}

function contornarPilar(model: BlueprintModel, c: Extract<Command, { type: 'AddTrecho' }>, hip: HipotesesDeEsgoto): Extract<Command, { type: 'AddTrecho' }>[] {
  if (c.a.x === c.b.x && c.a.y === c.b.y) return [c];
  // F18: com a pegada crescida pelo raio do tubo (o mesmo da queda, na árvore). F27 item 5: e as colunas que atravessam o piso.
  const desvio = desvioDoPilar(c.a, c.b, obstaculosDoRamal(model, c.levelId, c.bitolaMm / 2));
  if (!desvio || desvio.length === 0) return [c];
  const pts = caminhoDoContorno(c.a, c.b, desvio);
  const comp = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = comp.reduce((s, x) => s + x, 0);
  const queda = c.cotaAMm - c.cotaBMm;
  if ((Math.abs(queda) / total) * 100 + 1e-9 < caimentoPct(c.bitolaMm, hip)) return [c];
  // F20: cada pedaço com a SUA queda mínima (para cima); o último leva o que sobrar até a cota de jusante. Interpolada e
  // arredondada vértice a vértice, um pedaço perdia até 0,5 mm e ficava abaixo da mínima.
  const quedas = quedasDoCaminho(pts, caimentoPct(c.bitolaMm, hip));
  const cabe = quedas.reduce((s, q) => s + q, 0) <= queda;
  let feito = 0;
  let cotaAtual = c.cotaAMm;
  return pts.slice(1).map((b, i) => {
    const cotaA = cotaAtual;
    feito += comp[i];
    const cotaB = i === pts.length - 2 ? c.cotaBMm : cabe ? cotaA - quedas[i] : Math.round(c.cotaAMm - (queda * feito) / total);
    cotaAtual = cotaB;
    return { ...c, a: { x: pts[i].x, y: pts[i].y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB };
  });
}

/** F20: o caminho de `a` a `b` pelo contorno do pilar, com os vértices em mm. */
function caminhoDoContorno(a: Ponto2, b: Ponto2, desvio: readonly Ponto2[] | null): Ponto2[] {
  return [a, ...(desvio ?? []).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), b].filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
}

/** F20: a queda mínima de cada pedaço do caminho, mm inteiros para cima (o pedaço nunca abaixo da declividade). */
function quedasDoCaminho(pts: readonly Ponto2[], caimento: number): number[] {
  return pts.slice(1).map((p, i) => Math.ceil((Math.hypot(p.x - pts[i].x, p.y - pts[i].y) * caimento) / 100 - 1e-9));
}

/** RELANÇAR: apaga os trechos SUGERIDOS ligados às caixas de inspeção e refaz. */
export function relancarEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const sugeridos = caixasDeInspecao(model).flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO')).filter((t) => t.sugerido);
  const ids = new Set(sugeridos.map((t) => t.id));
  if (ids.size === 0) return planejarEsgoto(model, hip);
  const plano = planejarEsgoto({ ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)) }, hip);
  const remocoes: Command[] = [...ids].map((id) => ({ type: 'DeleteTrecho', trechoId: id }));
  return { ...plano, sugeridos: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** REFAZER: apaga TODA a rede de esgoto ligada às caixas de inspeção e lança de novo. */
export function refazerEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const daRede = caixasDeInspecao(model).flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO'));
  const ids = new Set(daRede.map((t) => t.id));
  if (ids.size === 0) return planejarEsgoto(model, hip);
  const plano = planejarEsgoto({ ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)) }, hip);
  const remocoes: Command[] = [...ids].map((id) => ({ type: 'DeleteTrecho', trechoId: id }));
  return { ...plano, sugeridos: 0, trechosDaRede: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/**
 * E5.2: os trechos de esgoto (fora a ventilação) que NÃO chegam a nenhuma caixa
 * de inspeção — o esgoto deles não tem para onde ir.
 */
export function trechosDeEsgotoSemDestino(model: BlueprintModel): string[] {
  const raizes = [...destinosDoEsgoto(model), ...caixasDeInspecao(model)];
  const ligados = new Set(raizes.flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO')).map((t) => t.id));
  return (model.trechos ?? [])
    .filter((t) => t.disciplina === 'ESGOTO' && t.rotulo !== 'Ventilação' && !ligados.has(t.id))
    .map((t) => t.id)
    .sort();
}

// ─── VERIFICAÇÃO DO DN (28/09/2026, Etapa 0.1 do roadmap hidrossanitário) ────

export interface DnForaDoNecessario {
  trechoId: ObjectId;
  levelId: ObjectId;
  /** O meio do trecho em planta — onde o desenho escreve o aviso. */
  meio: { x: number; y: number };
  dnAtualMm: number;
  dnNecessarioMm: number;
  uhc: number;
  tipo: 'MENOR' | 'MAIOR';
}

/**
 * O DN de CADA trecho da rede de esgoto — inclusive o desenhado à mão — contra
 * o que ele recebe: as UHC acumuladas a montante (NBR 8160) e o maior ramal de
 * descarga que passa por ele (vaso 100…), pela MESMA regra do lançamento
 * (`dnPorUhc` + ficha). Antes só a água avisava, e só DN menor em trecho
 * confirmado ("Aviso de diâmetro inferior ou superior ao necessário", E).
 *
 * A montante é o lado mais longe da caixa de inspeção pela rede (BFS a partir
 * dela). O tubo de queda passa DN ≥ 100 adiante (é o que o lançamento faz) e
 * nunca é "maior que o necessário"; trecho sem UHC a montante (ventilação,
 * ponta morta) não é avaliado.
 */
export function verificarDnDoEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): DnForaDoNecessario[] {
  return esgotoTrechoATrecho(model, hip)
    .filter((c) => c.tipo !== null)
    .map((c) => ({ trechoId: c.trechoId, levelId: c.levelId, meio: c.meio, dnAtualMm: c.dnAtualMm, dnNecessarioMm: c.dnNecessarioMm, uhc: c.uhc, tipo: c.tipo! }));
}

/**
 * O CÁLCULO do esgoto trecho a trecho (E3.1, 28/09/2026): o mesmo percurso da
 * verificação acima — UHC acumuladas a montante, DN necessário, o que o trecho
 * tem — mais a declividade e as cotas, para o memorial de cálculo. A
 * verificação é este cálculo filtrado; os dois não podem divergir.
 */
export interface TrechoDeEsgotoCalculado extends Omit<DnForaDoNecessario, 'tipo'> {
  tipo: DnForaDoNecessario['tipo'] | null;
  /** A caixa de inspeção a que o trecho leva. */
  caixaId: ObjectId;
  rotulo: string | null;
  comprimentoM: number;
  /** Cotas (relativas ao pavimento) da ponta de montante e da de jusante, mm. */
  cotaMontanteMm: number;
  cotaJusanteMm: number;
  /** Declividade do trecho, % (null na prumada). */
  declividadePct: number | null;
  declividadeMinimaPct: number;
  /** O papel na árvore (E5.1) — decide a tabela da NBR 8160. */
  papel: PapelNoEsgoto;
  /**
   * E5.2: a água SOBE para chegar à caixa — a ponta de jusante (pela árvore até a
   * CI) está mais alta que a de montante. O sentido não se grava: é o da árvore.
   */
  contrafluxo: boolean;
  /** E5.2: o maior DN dos trechos que chegam à ponta de montante (sem a ventilação); `null` sem nenhum. */
  dnMontanteMaxMm: number | null;
}

export function esgotoTrechoATrecho(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): TrechoDeEsgotoCalculado[] {
  const chave = fazerChave(model.levels);
  // O que chega a cada nó (E5.1): UHC, o maior DN de aparelho, quantas fontes, de
  // quais ambientes e quanta UHC por pavimento — é o que decide o PAPEL do trecho.
  type Carga = { uhc: number; dn: number; fontes: number; ambientes: Set<string>; porNivel: Map<ObjectId, number>; temTQ: boolean };
  const nova = (): Carga => ({ uhc: 0, dn: 40, fontes: 0, ambientes: new Set(), porNivel: new Map(), temTQ: false });
  const fontes = new Map<string, Carga>();
  for (const f of fontesDeEsgoto(model)) {
    const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
    const atual = fontes.get(k) ?? nova();
    atual.uhc += uhcDe(f);
    atual.dn = Math.max(atual.dn, dnFichaDe(f));
    atual.fontes += 1;
    atual.ambientes.add(espacoDe(model, f)?.id ?? `fora|${f.levelId}`);
    atual.porNivel.set(f.levelId, (atual.porNivel.get(f.levelId) ?? 0) + uhcDe(f));
    fontes.set(k, atual);
  }
  const pavimentos = model.levels.length;
  const saida: TrechoDeEsgotoCalculado[] = [];
  const vistos = new Set<ObjectId>();
  // E5.3: a LIGAÇÃO à rede pública é a primeira raiz — o sentido vai até a rede,
  // passando pelas caixas; sem ela, cada CI é raiz como antes.
  // E7.1: o sumidouro também é destino final, e o tanque e o filtro são caixas de passagem.
  const ligacoes = destinosDoEsgoto(model);
  const nosDeCaixa = new Set([...caixasDeInspecao(model), ...unidadesDeTratamento(model)].map((c) => chave(c.levelId, c.at.x, c.at.y, c.cotaMm)));
  for (const ci of [...ligacoes, ...caixasDeInspecao(model)]) {
    // A VENTILAÇÃO não leva esgoto (E5.4): fora da árvore do fluxo — uma coluna que
    // atravessa o andar de cima criaria um atalho e trocaria o sentido dos ramais.
    const rede = redeDaOrigem(model, ci, 'ESGOTO').filter((t) => t.rotulo !== 'Ventilação');
    const adj = new Map<string, { t: (typeof rede)[number]; outro: string }[]>();
    for (const t of rede) {
      const a = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
      const b = chave(t.levelId, t.b.x, t.b.y, t.cotaBMm);
      adj.set(a, [...(adj.get(a) ?? []), { t, outro: b }]);
      adj.set(b, [...(adj.get(b) ?? []), { t, outro: a }]);
    }
    const raiz = chave(ci.levelId, ci.at.x, ci.at.y, ci.cotaMm);
    const filhos = new Map<string, { t: (typeof rede)[number]; filho: string }[]>();
    const visitados = new Set<string>([raiz]);
    const fila = [raiz];
    while (fila.length > 0) {
      const n = fila.shift()!;
      for (const { t, outro } of adj.get(n) ?? []) {
        if (visitados.has(outro)) continue;
        visitados.add(outro);
        filhos.set(n, [...(filhos.get(n) ?? []), { t, filho: outro }]);
        fila.push(outro);
      }
    }
    const acumular = (n: string): Carga => {
      const base = fontes.get(n);
      const soma: Carga = base
        ? { ...base, ambientes: new Set(base.ambientes), porNivel: new Map(base.porNivel) }
        : nova();
      for (const { t, filho } of filhos.get(n) ?? []) {
        const sub = acumular(filho);
        const ehTQ = t.rotulo === 'TQ';
        const passa = ehTQ ? Math.max(sub.dn, hip.dnTuboQuedaMm) : sub.dn;
        if (sub.uhc > 0 && !vistos.has(t.id)) {
          vistos.add(t.id);
          const plantaMm = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
          const montanteA = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) === filho;
          const decl = plantaMm < 1 ? null : (((montanteA ? t.cotaAMm : t.cotaBMm) - (montanteA ? t.cotaBMm : t.cotaAMm)) / plantaMm) * 100;
          // O PAPEL (E5.1) e a tabela da NBR 8160 que vale para ele.
          const papel: PapelNoEsgoto = ehTQ
            ? 'TUBO_DE_QUEDA'
            : t.rotulo === 'Coletor predial'
              ? 'COLETOR_PREDIAL'
            : sub.temTQ || n === raiz || nosDeCaixa.has(n) || sub.ambientes.size >= 2
              ? 'SUBCOLETOR'
              : sub.fontes <= 1
                ? 'RAMAL_DE_DESCARGA'
                : 'RAMAL_DE_ESGOTO';
          const daTabela =
            papel === 'TUBO_DE_QUEDA'
              ? dnDoTuboDeQueda(sub.uhc, Math.max(0, ...sub.porNivel.values()), pavimentos)
              : papel === 'SUBCOLETOR' || papel === 'COLETOR_PREDIAL'
                ? dnDoSubcoletor(sub.uhc, decl)
                : papel === 'RAMAL_DE_ESGOTO'
                  ? dnDoRamalDeEsgoto(sub.uhc)
                  : 0; // ramal de descarga: o DN do aparelho (`passa`)
          const necessario = Math.max(daTabela, passa);
          const tipo = t.bitolaMm < necessario ? 'MENOR' : t.bitolaMm > necessario && t.rotulo !== 'TQ' ? 'MAIOR' : null;
          // Montante = a ponta do FILHO (mais longe da caixa); jusante = a do nó `n`.
          const montanteEhA = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) === filho;
          const cotaMontanteMm = montanteEhA ? t.cotaAMm : t.cotaBMm;
          const cotaJusanteMm = montanteEhA ? t.cotaBMm : t.cotaAMm;
          const planta = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
          const acima = (filhos.get(filho) ?? []).filter((x) => x.t.rotulo !== 'Ventilação').map((x) => x.t.bitolaMm);
          saida.push({
            contrafluxo: cotaMontanteMm < cotaJusanteMm,
            dnMontanteMaxMm: acima.length ? Math.max(...acima) : null,
            trechoId: t.id, levelId: t.levelId, meio: { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 },
            dnAtualMm: t.bitolaMm, dnNecessarioMm: necessario, uhc: sub.uhc, tipo,
            caixaId: ci.id, rotulo: t.rotulo ?? null,
            comprimentoM: Math.hypot(planta, t.cotaBMm - t.cotaAMm) / 1000,
            cotaMontanteMm, cotaJusanteMm,
            declividadePct: planta < 1 ? null : ((cotaMontanteMm - cotaJusanteMm) / planta) * 100,
            declividadeMinimaPct: caimentoPct(t.bitolaMm, hip),
            papel,
          });
        }
        soma.uhc += sub.uhc;
        soma.dn = Math.max(soma.dn, passa);
        soma.fontes += sub.fontes;
        for (const a of sub.ambientes) soma.ambientes.add(a);
        for (const [l, u] of sub.porNivel) soma.porNivel.set(l, (soma.porNivel.get(l) ?? 0) + u);
        soma.temTQ = soma.temTQ || sub.temTQ || ehTQ;
      }
      return soma;
    };
    acumular(raiz);
  }
  return saida.sort((x, y) => x.trechoId.localeCompare(y.trechoId));
}
