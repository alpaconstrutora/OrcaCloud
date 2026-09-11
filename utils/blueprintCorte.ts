/**
 * PROJEÇÃO EM CORTE — a edificação seccionada por um plano vertical.
 *
 * Irmão de `blueprintElevation.ts`, e fora do kernel pela mesma razão: é função
 * PURA (sem React, sem canvas), mas é VISTA, não geometria do modelo. A linha
 * de corte em si mora no kernel (`Corte` em `model.ts`), porque ela é conteúdo
 * do desenho e precisa sobreviver ao snapshot.
 *
 * ─── O QUE UM CORTE MOSTRA, EM TRÊS DESTINOS ────────────────────────────────
 *
 * O plano parte o mundo em dois. Quem olha está de um lado; o que se desenha é:
 *
 *   1. o que o plano ATRAVESSA — sai CHEIO, é a face cortada;
 *   2. o que está ATRÁS do plano — sai como elevação, exatamente como numa
 *      fachada;
 *   3. o que está NA FRENTE — é a metade removida, e simplesmente some.
 *
 * O terceiro é o que separa um corte de uma elevação, e é o que faz o corte
 * mostrar o pé-direito, a escada e a inclinação do telhado ao mesmo tempo.
 *
 * ─── A CLASSIFICAÇÃO É PELA PEGADA, NUNCA PELO CENTRO ───────────────────────
 *
 * Para cada peça, o MÍNIMO e o MÁXIMO da profundidade sobre os vértices da
 * pegada em planta. Sinais opostos = o plano atravessa. Testar o CENTRO seria
 * mais barato e erraria exatamente na peça longa e quase paralela ao plano —
 * que é onde o corte decide o que mostrar. Uma fachada de 12 m com o centro na
 * frente do plano sumiria inteira, levando junto a metade dela que estava atrás.
 *
 * ─── O PLANO É INFINITO ─────────────────────────────────────────────────────
 *
 * O segmento que o usuário traça é a MARCA — a linha com as setas e a letra que
 * aparece em planta. A classificação usa o plano infinito que passa por ela. É
 * o que "corte" significa, e é a regra que não depende de alguém ter esticado a
 * linha até o fim da casa.
 */

import { segmentosDoEletroduto } from './blueprintRede';
import {
  distanciaAoAnelComAresta,
  pontoAtrasDeMuro,
  superficieDeProjeto,
  type ParametrosDeTerraplenagem,
} from './blueprintTopografiaAnalises';
import {
  alturaNaAgua,
  cantosDaParede,
  pointInPolygon,
  contornoDaEscada,
  contornoEmPlanta,
  extensaoDeCanto,
  fatiasDaEscada,
  normalDaAgua,
  wallLength,
  type Agua,
  type BlueprintModel,
  type Corte,
  type Escada,
  type ObjectId,
  type Point,
  type Structural,
  type Wall,
  type Trecho,
} from './blueprintKernel';
import {
  projetarElevacao,
  type AberturaElevacao,
  type AguaElevacao,
  type EscadaElevacao,
  type TrechoElevacao,
  type BaseElevacao,
  type EstruturaElevacao,
  type RetanguloElevacao,
} from './blueprintElevation';

/**
 * A base do corte: `u` corre ao longo da linha, `d` aponta para onde se olha.
 *
 * Com `olharPara: 'ESQUERDA'`, `d` é a normal esquerda de `a → b` e o `u` que
 * dela se deriva (`direitaDe(d)`) cai EXATAMENTE sobre `a → b` — quem traçou da
 * esquerda para a direita vê o corte na mesma mão em que desenhou. Olhar para a
 * direita espelha o desenho, que é o correto: é a mesma casa vista do outro
 * lado.
 */
export function baseDoCorte(corte: Corte): BaseElevacao {
  const dx = corte.b.x - corte.a.x;
  const dy = corte.b.y - corte.a.y;
  const comp = Math.hypot(dx, dy);
  // `assertModelInvariants` já recusa corte de comprimento zero; o guarda aqui
  // existe para quem monta um `Corte` à mão em teste.
  const t = comp === 0 ? { x: 1, y: 0 } : { x: dx / comp, y: dy / comp };
  // `+ 0` normaliza `-0` para `0`. É a mesma armadilha que `blueprintElevation`
  // já documenta: um `-0` invisível reprova `toEqual({ x: 0, y: 1 })` e manda
  // quem lê a falha procurar um erro de sinal que não existe.
  const z = (v: number) => v + 0;
  const d =
    corte.olharPara === 'ESQUERDA'
      ? { x: z(-t.y), y: z(t.x) }
      : { x: z(t.y), y: z(-t.x) };
  return { origem: 'LINHA_DE_CORTE', d, u: { x: z(d.y), y: z(-d.x) } };
}

/** Onde uma peça está em relação ao plano. */
export type DestinoNoCorte = 'CORTADO' | 'ATRAS' | 'FRENTE';

/**
 * Classifica uma pegada em planta contra o plano.
 *
 * `folga` absorve o vértice que cai exatamente sobre o plano: sem ela, uma
 * parede que ENCOSTA no plano sem atravessá-lo (mín = 0) seria classificada
 * como cortada e sairia cheia, com espessura zero — um risco preto no meio do
 * desenho, vindo de uma parede que o corte não toca.
 */
export function classificarNoCorte(
  pegada: Point[],
  base: BaseElevacao,
  origem: Point,
  folga = 1,
): DestinoNoCorte {
  if (pegada.length === 0) return 'FRENTE';
  const fs = pegada.map((p) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y);
  const min = Math.min(...fs);
  const max = Math.max(...fs);
  if (min < -folga && max > folga) return 'CORTADO';
  return min >= -folga ? 'ATRAS' : 'FRENTE';
}

/**
 * Os TRECHOS em que o plano atravessa um polígono, em coordenada `u`.
 *
 * Devolve PARES ordenados, e não um único mín–máx: num contorno em "L" o plano
 * pode entrar e sair duas vezes, e o mín–máx costuraria os dois pedaços num só,
 * preenchendo o vazio entre eles com massa que não existe.
 */
export function trechosCortados(
  pegada: Point[],
  base: BaseElevacao,
  origem: Point,
): { uMin: number; uMax: number }[] {
  const f = (p: Point) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y;
  // ⚠️ `u` é ABSOLUTO — `p · u`, sem subtrair a origem —, e `f` NÃO. São coisas
  // diferentes: a profundidade se mede a partir do PLANO (que passa por
  // `origem`), mas o eixo horizontal do desenho tem de ser o MESMO que
  // `projetarElevacao` usa, senão o que é cortado e o que está atrás saem
  // deslocados um do outro no mesmo desenho — por `origem · u`, que é um número
  // qualquer.
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;

  const cruzamentos: number[] = [];
  for (let i = 0; i < pegada.length; i++) {
    const p = pegada[i];
    const q = pegada[(i + 1) % pegada.length];
    const fp = f(p);
    const fq = f(q);
    if (fp === fq) continue;
    // Meio-aberto (`fp <= 0 < fq` ou o inverso): um vértice exatamente sobre o
    // plano contaria DUAS vezes se as duas arestas o incluíssem, e os pares
    // sairiam trocados.
    const cruza = (fp <= 0 && fq > 0) || (fq <= 0 && fp > 0);
    if (!cruza) continue;
    const t = fp / (fp - fq);
    cruzamentos.push(projU({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
  }

  cruzamentos.sort((x, y) => x - y);
  const trechos: { uMin: number; uMax: number }[] = [];
  for (let i = 0; i + 1 < cruzamentos.length; i += 2) {
    trechos.push({ uMin: cruzamentos[i], uMax: cruzamentos[i + 1] });
  }
  return trechos;
}

/** Uma peça ATRAVESSADA pelo plano — a face cortada, desenhada cheia. */
export interface ItemCortado {
  id: ObjectId;
  familia: 'PAREDE' | 'ESTRUTURA' | 'TELHADO' | 'ESCADA' | 'REDE';
  /** Contorno da face cortada no plano `(u, v)`, fechado pela ordem. */
  pontos: { u: number; v: number }[];
  /**
   * Vãos recortados DENTRO da face — só parede, e só quando o plano passa pela
   * abertura. É o motivo de se escolher onde cortar: passar pela porta.
   */
  vaos: { uMin: number; uMax: number; vMin: number; vMax: number }[];
  /** Abaixo do piso: o renderer traceja, como na elevação. */
  enterrada: boolean;
  rotulo: string | null;
  /**
   * A disciplina, só em `REDE`.
   *
   * ⚠️ Vem na projeção em vez de o renderer buscá-la no modelo: a face cortada
   * guarda só o id, e obrigar quem desenha a voltar ao modelo criaria uma
   * segunda leitura do mesmo dado — que é como duas verdades começam.
   */
  disciplina?: string;
}

export interface ProjecaoCorte {
  corteId: ObjectId;
  rotulo: string;
  base: BaseElevacao;
  levelIds: ObjectId[];
  /** O que o plano atravessa. Pintado por CIMA da vista. */
  cortados: ItemCortado[];
  /** O que está ATRÁS do plano — os mesmos tipos da elevação. */
  paredes: RetanguloElevacao[];
  aberturas: AberturaElevacao[];
  estruturas: EstruturaElevacao[];
  telhados: AguaElevacao[];
  escadas: EscadaElevacao[];
  /** Instalações ATRÁS do plano — as que ele atravessa vão em `cortados`. */
  redes: TrechoElevacao[];
  linhaDoSolo: { uMin: number; uMax: number; v: number };
  bbox: { uMin: number; uMax: number; vMin: number; vMax: number };
  /**
   * O terreno NATURAL ao longo do plano de corte, em pedaços `(u, v)`.
   *
   * Ausente quando o estudo não tem topografia. Pedaços, e não uma polilinha:
   * onde a grade não tem cota (`nodata`, fora do lote) a linha PARA em vez de
   * interpolar — é o mesmo critério das curvas de nível.
   *
   * ⚠️ Não é `linhaDoSolo`. Aquela é o PISO do pavimento mais baixo e continua
   * sendo; esta é o chão de verdade, que pode estar 2 m acima ou abaixo dele.
   */
  perfilDoTerreno?: { u: number; v: number }[][];
  /** A linha do platô de terraplenagem, nos trechos em que o plano o atravessa. */
  platoNoCorte?: { u: number; v: number }[][];
}

/**
 * O que o corte precisa saber do terreno — e é tudo o que ele sabe.
 *
 * Vem de FORA do modelo (a topografia não vive no payload canônico), como um
 * amostrador: dado um ponto do desenho, a cota absoluta em metros, ou `null`
 * onde não há dado. `cotaZeroM` é a cota absoluta do zero do desenho
 * (`Georreferencia.elevacaoM`, ou a cota média quando ela não foi informada):
 * é o que põe a curva de 1.083 m no mesmo eixo `v` que a parede de 2,80 m.
 */
export interface TerrenoParaCorte {
  cotaEmM: (p: Point) => number | null;
  cotaZeroM: number;
  /** Passo de amostragem ao longo do plano. Padrão 250 mm. */
  passoMm?: number;
  /**
   * Vértices do lote: os `u` deles entram na amostragem para a quebra da
   * divisa cair exata, e não meio passo antes.
   */
  vertices?: Point[];
  /**
   * O platô de terraplenagem (fase 2): uma cota única sobre um anel. Sai no
   * corte como a linha do PROJETO, contra a do terreno natural — é a leitura
   * que diz "aqui corta, ali aterra".
   */
  plato?: {
    cotaM: number;
    anel: Point[];
    /**
     * Taludes 1:h (fase 3). Com eles, a linha do projeto não termina na borda
     * do platô: sobe (corte) ou desce (aterro) a partir dela até encontrar o
     * terreno. Sem eles, a linha é só o platô, como na fase 2.
     */
    taludeCorteH?: number;
    taludeAterroH?: number;
    /**
     * Fase 4: os parâmetros inteiros (banqueta, via, talude por aresta). Com
     * eles, a linha do projeto sai em degraus e respeita o `h` de cada lado;
     * sem eles, valem só `taludeCorteH`/`taludeAterroH`.
     */
    parametros?: ParametrosDeTerraplenagem;
  } | null;
}

/** A pegada em planta de uma parede — o CORPO, com o avanço de canto. */
function pegadaDaParede(paredesDoNivel: Wall[], w: Wall): Point[] {
  return cantosDaParede(
    w.a,
    w.b,
    w.thicknessMm,
    extensaoDeCanto(paredesDoNivel, w, 'a'),
    extensaoDeCanto(paredesDoNivel, w, 'b'),
  );
}

/** Retângulo `(u, v)` como contorno fechado. */
function caixa(uMin: number, uMax: number, vMin: number, vMax: number) {
  return [
    { u: uMin, v: vMin },
    { u: uMax, v: vMin },
    { u: uMax, v: vMax },
    { u: uMin, v: vMax },
  ];
}

/**
 * A face cortada de um TRECHO de instalação.
 *
 * ─── ⚠️ A PRUMADA É O CASO QUE QUEBRA UMA IMPLEMENTAÇÃO INGÊNUA ─────────────
 *
 * Reusar a pegada de parede (`cantosDaParede`) resolve o trecho horizontal: ele
 * é um retângulo de largura igual à bitola. Mas a PRUMADA tem as duas pontas no
 * MESMO ponto em planta — a pegada degenera, e a peça mais comum de uma
 * instalação sumiria do corte sem erro nenhum.
 *
 * Por isso a prumada é tratada à parte: em planta ela é um PONTO, e o plano a
 * atravessa quando passa a menos de meia bitola dele. A face cortada vai da
 * cota de baixo à de cima — que é exatamente o que se quer ver num corte.
 */
function faceCortadaDoTrecho(
  t: Trecho,
  elevacaoNivelMm: number,
  base: BaseElevacao,
  origem: Point,
): ItemCortado[] {
  const raio = t.bitolaMm / 2;
  const vA = elevacaoNivelMm + t.cotaAMm;
  const vB = elevacaoNivelMm + t.cotaBMm;
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;

  // ── PRUMADA ─────────────────────────────────────────────────────────────
  if (t.a.x === t.b.x && t.a.y === t.b.y) {
    const dist = Math.abs(
      (t.a.x - origem.x) * base.d.x + (t.a.y - origem.y) * base.d.y,
    );
    if (dist > raio) return [];
    const u = projU(t.a);
    return [
      {
        id: t.id,
        familia: 'REDE',
        pontos: caixa(u - raio, u + raio, Math.min(vA, vB), Math.max(vA, vB)),
        vaos: [],
        enterrada: Math.min(vA, vB) < elevacaoNivelMm,
        rotulo: t.rotulo ?? null,
        disciplina: t.disciplina,
      },
    ];
  }

  // ── TRECHO COM PERCURSO EM PLANTA ───────────────────────────────────────
  const pegada = cantosDaParede(t.a, t.b, t.bitolaMm);
  if (classificarNoCorte(pegada, base, origem) !== 'CORTADO') return [];

  const comprimento = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  return trechosCortados(pegada, base, origem).map((faixa) => {
    // ⚠️ A COTA É INTERPOLADA no ponto do cruzamento, e não tomada da ponta:
    // um esgoto com caimento cortado no meio está entre as duas cotas, e usar
    // `cotaAMm` o desenharia no lugar errado — plausivelmente, que é o pior.
    const meioU = (faixa.uMin + faixa.uMax) / 2;
    const uA = projU(t.a);
    const uB = projU(t.b);
    const fracao = uA === uB ? 0.5 : Math.min(1, Math.max(0, (meioU - uA) / (uB - uA)));
    const v = vA + (vB - vA) * fracao;
    void comprimento;
    return {
      id: t.id,
      familia: 'REDE' as const,
      pontos: caixa(faixa.uMin, faixa.uMax, v - raio, v + raio),
      vaos: [],
      enterrada: v < elevacaoNivelMm,
      rotulo: t.rotulo ?? null,
      disciplina: t.disciplina,
    };
  });
}

export function projetarCorte(
  model: BlueprintModel,
  opts: { corte: Corte; levelIds?: ObjectId[]; terreno?: TerrenoParaCorte | null },
): ProjecaoCorte {
  const { corte } = opts;
  const base = baseDoCorte(corte);
  const origem = corte.a;

  // A vista do que está ATRÁS sai da MESMA máquina da elevação, com a base do
  // corte injetada. `direcao` vai só porque a assinatura pede; com `base`
  // presente ela não é lida.
  const vista = projetarElevacao(model, {
    direcao: 'FRENTE',
    levelIds: opts.levelIds,
    base,
  });

  const niveis = model.levels.filter((l) => !opts.levelIds || opts.levelIds.includes(l.id));
  const idsDeNivel = new Set(niveis.map((l) => l.id));
  // ABSOLUTO, como o da elevação — ver `trechosCortados`.
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;

  const cortados: ItemCortado[] = [];
  const destino = new Map<ObjectId, DestinoNoCorte>();

  // ── Paredes ───────────────────────────────────────────────────────────────
  for (const level of niveis) {
    const paredesDoNivel = model.walls.filter((w) => w.levelId === level.id);
    for (const w of paredesDoNivel) {
      const pegada = pegadaDaParede(paredesDoNivel, w);
      const dest = classificarNoCorte(pegada, base, origem);
      destino.set(w.id, dest);
      if (dest !== 'CORTADO') continue;

      const vMin = level.elevationMm;
      const vMax = level.elevationMm + w.heightMm;

      // Onde, ao longo do eixo da parede, o plano passa — é o que decide quais
      // aberturas o corte atravessa.
      const comp = wallLength(w);
      const fa = (w.a.x - origem.x) * base.d.x + (w.a.y - origem.y) * base.d.y;
      const fb = (w.b.x - origem.x) * base.d.x + (w.b.y - origem.y) * base.d.y;
      const sNoEixo = fa === fb ? null : (fa / (fa - fb)) * comp;

      for (const trecho of trechosCortados(pegada, base, origem)) {
        const vaos =
          sNoEixo === null
            ? []
            : model.openings
                .filter(
                  (o) =>
                    o.wallId === w.id &&
                    sNoEixo >= o.offsetMm &&
                    sNoEixo <= o.offsetMm + o.widthMm,
                )
                // O vão atravessa a espessura inteira: no corte ele ocupa TODO
                // o trecho, não uma fatia dele.
                .map((o) => ({
                  uMin: trecho.uMin,
                  uMax: trecho.uMax,
                  vMin: vMin + o.sillMm,
                  vMax: vMin + o.sillMm + o.heightMm,
                }));

        cortados.push({
          id: w.id,
          familia: 'PAREDE',
          pontos: caixa(trecho.uMin, trecho.uMax, vMin, vMax),
          vaos,
          enterrada: false,
          rotulo: null,
        });
      }
    }

    // ── Estrutura ───────────────────────────────────────────────────────────
    for (const s of (model.structures ?? []).filter((x) => x.levelId === level.id)) {
      const pegada = contornoEmPlanta(s);
      const dest = classificarNoCorte(pegada, base, origem);
      destino.set(s.id, dest);
      if (dest !== 'CORTADO') continue;

      const vMin = level.elevationMm + s.baseMm;
      const vMax = vMin + s.alturaMm;
      for (const trecho of trechosCortados(pegada, base, origem)) {
        cortados.push({
          id: s.id,
          familia: 'ESTRUTURA',
          pontos: caixa(trecho.uMin, trecho.uMax, vMin, vMax),
          vaos: [],
          enterrada: s.baseMm < 0,
          rotulo: s.rotulo ?? null,
        });
      }
    }

    // ── Telhado ─────────────────────────────────────────────────────────────
    //
    // A ÚNICA face cortada que não é retângulo: a água é inclinada, e o corte
    // dela é um paralelogramo. É por isso que o corte é o desenho em que a
    // inclinação se lê — e um retângulo aqui apagaria justamente isso.
    for (const r of (model.roofs ?? []).filter((x) => x.levelId === level.id)) {
      const dest = classificarNoCorte(r.pontos, base, origem);
      destino.set(r.id, dest);
      if (dest !== 'CORTADO') continue;
      cortados.push(...faceCortadaDaAgua(r, level.elevationMm, base, origem, projU));
    }

    // ── Escada e rampa ──────────────────────────────────────────────────────
    //
    // É AQUI que a escada paga o que custou: o corte é o desenho em que o
    // espelho, o piso e o pé-direito se leem na mesma imagem. A classificação é
    // pela pegada inteira; a face cortada sai fatia a fatia, porque cada degrau
    // é um prisma e o plano corta cada um num retângulo próprio.
    for (const e of (model.stairs ?? []).filter((x) => x.levelId === level.id)) {
      const pegada = contornoDaEscada(e);
      if (pegada.length < 3) continue;
      const dest = classificarNoCorte(pegada, base, origem);
      destino.set(e.id, dest);
      if (dest !== 'CORTADO') continue;
      cortados.push(...faceCortadaDaEscada(model, e, level.elevationMm, base, origem, projU));
    }

    // ── Instalações ─────────────────────────────────────────────────────────
    // ⚠️ Pelos SEGMENTOS do caminho real, e não pela diagonal: o eletroduto que
    // sobe pela parede e corre pelo teto atravessa o plano de corte em lugares
    // diferentes dos que a diagonal atravessaria — e é o corte que mostra se
    // ele passa por cima da viga. A mesma função do 3D decide o "L".
    for (const t of (model.trechos ?? []).filter((x) => x.levelId === level.id)) {
      for (const seg of segmentosDoEletroduto(t, level.defaultHeightMm)) {
        cortados.push(...faceCortadaDoTrecho({ ...t, ...seg }, level.elevationMm, base, origem));
      }
    }
  }

  const idsCortados = new Set(cortados.map((c) => c.id));
  const noCorte = (id: ObjectId) => destino.get(id) ?? 'ATRAS';
  const paredes = vista.paredes.filter((p) => idsDeNivel.has(p.levelId) && noCorte(p.wallId) === 'ATRAS');
  const idsDeParedeAtras = new Set(paredes.map((p) => p.wallId));

  const proj: ProjecaoCorte = {
    corteId: corte.id,
    rotulo: corte.rotulo,
    base,
    levelIds: vista.levelIds,
    cortados,
    paredes,
    aberturas: vista.aberturas.filter((o) => idsDeParedeAtras.has(o.wallId)),
    estruturas: vista.estruturas.filter((e) => noCorte(e.structuralId) === 'ATRAS'),
    telhados: (vista.telhados ?? []).filter((t) => noCorte(t.aguaId) === 'ATRAS'),
    escadas: (vista.escadas ?? []).filter((e) => noCorte(e.escadaId) === 'ATRAS'),
    // ⚠️ O que o plano ATRAVESSA já foi para `cortados` — aqui fica só o que
    // está atrás dele. Um trecho nos dois lugares apareceria duas vezes: uma
    // como face cortada e outra como linha, no mesmo ponto.
    redes: (vista.redes ?? []).filter((r) => !idsCortados.has(r.trechoId)),
    linhaDoSolo: vista.linhaDoSolo,
    bbox: vista.bbox,
  };

  const bbox = bboxDoCorte(proj);
  if (!opts.terreno) return { ...proj, bbox };

  // O perfil é amostrado DEPOIS da caixa, porque é ela que diz de onde a onde
  // vale a pena olhar o chão — e depois entra na caixa, porque um terreno 3 m
  // acima do piso sairia cortado no topo do quadro.
  const perfil = perfilDoTerreno(corte, base, bbox, opts.terreno);
  const plato = opts.terreno.plato ? platoNoCorte(corte, base, bbox, opts.terreno, opts.terreno.plato) : undefined;
  return {
    ...proj,
    bbox: bboxComPerfil(bbox, [...perfil, ...(plato ?? [])]),
    perfilDoTerreno: perfil,
    ...(plato ? { platoNoCorte: plato } : {}),
  };
}

/**
 * Onde o plano de corte atravessa o platô: os trechos de `u` cujo ponto em
 * planta cai dentro do anel do platô, na cota do platô. A mesma inversão
 * `u → ponto` do perfil; amostrado no mesmo passo, para as duas linhas terem
 * a mesma resolução na tela.
 */
function platoNoCorte(
  corte: Corte,
  base: BaseElevacao,
  bbox: ProjecaoCorte['bbox'],
  terreno: TerrenoParaCorte,
  plato: NonNullable<TerrenoParaCorte['plato']>,
): { u: number; v: number }[][] {
  if (plato.anel.length < 3) return [];
  const passo = Math.max(50, terreno.passoMm ?? 250);
  const largura = bbox.uMax - bbox.uMin;
  const folga = Math.max(2000, largura * 0.2);
  const fa = corte.a.x * base.d.x + corte.a.y * base.d.y;
  const pontoEmU = (u: number): Point => ({
    x: u * base.u.x + fa * base.d.x,
    y: u * base.u.y + fa * base.d.y,
  });
  const vDe = (cotaM: number) => Math.round((cotaM - terreno.cotaZeroM) * 1000);
  const v = vDe(plato.cotaM);
  const hc = plato.taludeCorteH;
  const ha = plato.taludeAterroH;
  // O intervalo cobre a caixa E o anel do platô: num estudo só com lote a
  // caixa é vazia, e sem isto a linha do platô (e o talude) nem era percorrida.
  const usDoAnel = plato.anel.map((p) => p.x * base.u.x + p.y * base.u.y);
  // Com talude, o alcance vai além da folga: a 1:1,5, 30 m cobrem 20 m de
  // desnível — mais do que qualquer lote pede. Sem talude, a folga basta.
  const alcance = hc || ha || plato.parametros ? 30_000 : 0;
  const uMin = Math.min(bbox.uMin - folga, Math.min(...usDoAnel) - folga - alcance);
  const uMax = Math.max(bbox.uMax + folga, Math.max(...usDoAnel) + folga + alcance);
  const pedacos: { u: number; v: number }[][] = [];
  let atual: { u: number; v: number }[] = [];
  // Muro de arrimo (fase 6): ao sair do platô para trás de um muro, a linha
  // desce (ou sobe) na VERTICAL até o terreno — o muro é isso no corte.
  const vDoTerreno = (p: Point): number | null => {
    const t = terreno.cotaEmM(p);
    return t === null ? null : vDe(t);
  };
  let dentroAntes = false;
  let muroAntes = false;
  let uAnterior = uMin;
  for (let u = uMin; u <= uMax; u += passo) {
    const p = pontoEmU(u);
    if (pointInPolygon(plato.anel, p)) {
      if (!dentroAntes && muroAntes) {
        // Entrando no platô vindo de trás de um muro: a face do muro primeiro,
        // no MESMO u — é vertical, não uma rampa de um passo.
        const vt = vDoTerreno(p);
        if (vt !== null && vt !== v) atual.push({ u: Math.round(u), v: vt });
      }
      atual.push({ u: Math.round(u), v });
      dentroAntes = true;
      muroAntes = false;
      uAnterior = u;
      continue;
    }
    if (plato.parametros) {
      const proximidade = distanciaAoAnelComAresta(p, plato.anel);
      if (pontoAtrasDeMuro(plato.parametros, proximidade)) {
        if (dentroAntes) {
          // Saindo do platô para trás do muro: a face desce no u do último
          // ponto interno (a borda), até o terreno logo atrás.
          const vt = vDoTerreno(p);
          if (vt !== null && vt !== v) atual.push({ u: Math.round(uAnterior), v: vt });
        }
        uAnterior = u;
        if (atual.length >= 2) pedacos.push(atual);
        atual = [];
        dentroAntes = false;
        muroAntes = true;
        continue;
      }
    }
    dentroAntes = false;
    muroAntes = false;
    uAnterior = u;
    // Fora do platô: o talude, se houver, até encontrar o terreno natural — a
    // MESMA conta de `terraplenagemComTalude`, ponto a ponto (`superficieDeProjeto`
    // com banqueta, via e talude por aresta; ou a reta simples com só os `h`).
    let vTalude: number | null = null;
    if (hc || ha || plato.parametros) {
      const t = terreno.cotaEmM(p);
      if (t !== null) {
        const proximidade = distanciaAoAnelComAresta(p, plato.anel);
        const parametros: ParametrosDeTerraplenagem = plato.parametros ?? {
          taludeCorteH: hc ?? 1e9,
          taludeAterroH: ha ?? 1e9,
          empolamentoPct: 0,
          contracaoPct: 0,
        };
        const s = superficieDeProjeto(plato.cotaM, proximidade.dMm, proximidade, parametros);
        if (s.naVia) vTalude = v;
        else if ((hc || plato.parametros) && t > s.corteM) vTalude = vDe(s.corteM);
        else if ((ha || plato.parametros) && t < s.aterroM) vTalude = vDe(s.aterroM);
      }
    }
    if (vTalude !== null) {
      atual.push({ u: Math.round(u), v: vTalude });
    } else if (atual.length > 0) {
      if (atual.length >= 2) pedacos.push(atual);
      atual = [];
    }
  }
  if (atual.length >= 2) pedacos.push(atual);
  return pedacos;
}

/**
 * O chão ao longo do plano de corte.
 *
 * ─── A INVERSÃO `u → ponto em planta` É EXATA ───────────────────────────────
 *
 * `u` e `d` são ortonormais, e todo ponto do plano satisfaz `p·d = a·d`. Então
 * `p = u·base.u + (a·d)·base.d` — sem parametrizar por `a + t·(b − a)`, que só
 * vale DENTRO do segmento desenhado, e o plano é infinito (o perfil precisa
 * passar além das paredes para mostrar o talude ao lado da casa).
 *
 * Respeita a armadilha nº 1 do plano de 05/09: `u` é ABSOLUTO (`p·u`), o mesmo
 * das paredes cortadas — senão a curva sairia deslocada de `a·u` em relação a
 * elas.
 */
function perfilDoTerreno(
  corte: Corte,
  base: BaseElevacao,
  bbox: ProjecaoCorte['bbox'],
  terreno: TerrenoParaCorte,
): { u: number; v: number }[][] {
  const passo = Math.max(50, terreno.passoMm ?? 250);
  const largura = bbox.uMax - bbox.uMin;
  // Um quinto para cada lado, e nunca menos de 2 m: é o talude ao lado da casa.
  const folga = Math.max(2000, largura * 0.2);
  // Cobre também os vértices do lote: o perfil de um estudo só com lote (caixa
  // vazia) tem de atravessar o lote inteiro, não 2 m em volta da origem.
  const usDosVertices = (terreno.vertices ?? []).map((p) => p.x * base.u.x + p.y * base.u.y);
  const uMin = Math.min(bbox.uMin - folga, ...usDosVertices.map((u) => u - folga));
  const uMax = Math.max(bbox.uMax + folga, ...usDosVertices.map((u) => u + folga));

  const fa = corte.a.x * base.d.x + corte.a.y * base.d.y;
  const pontoEmU = (u: number): Point => ({
    x: u * base.u.x + fa * base.d.x,
    y: u * base.u.y + fa * base.d.y,
  });

  const us = new Set<number>();
  for (let u = uMin; u <= uMax; u += passo) us.add(Math.round(u));
  us.add(Math.round(uMax));
  for (const v of terreno.vertices ?? []) {
    const u = v.x * base.u.x + v.y * base.u.y;
    if (u >= uMin && u <= uMax) us.add(Math.round(u));
  }

  const pedacos: { u: number; v: number }[][] = [];
  let atual: { u: number; v: number }[] = [];
  for (const u of [...us].sort((m, n) => m - n)) {
    const cota = terreno.cotaEmM(pontoEmU(u));
    if (cota === null) {
      if (atual.length >= 2) pedacos.push(atual);
      atual = [];
      continue;
    }
    atual.push({ u, v: Math.round((cota - terreno.cotaZeroM) * 1000) });
  }
  if (atual.length >= 2) pedacos.push(atual);
  return pedacos;
}

function bboxComPerfil(
  bbox: ProjecaoCorte['bbox'],
  perfil: { u: number; v: number }[][],
): ProjecaoCorte['bbox'] {
  const pontos = perfil.flat();
  if (pontos.length === 0) return bbox;
  return {
    uMin: Math.min(bbox.uMin, ...pontos.map((p) => p.u)),
    uMax: Math.max(bbox.uMax, ...pontos.map((p) => p.u)),
    vMin: Math.min(bbox.vMin, ...pontos.map((p) => p.v)),
    vMax: Math.max(bbox.vMax, ...pontos.map((p) => p.v)),
  };
}

/**
 * A face cortada de uma água: um paralelogramo por trecho.
 *
 * A aresta de CIMA são os dois pontos do trecho na cota que a água tem ali; a
 * de baixo é a mesma deslocada de uma espessura ao longo da normal do plano
 * inclinado. Como essa normal tem componente horizontal, o deslocamento anda
 * também em `u` — desenhar a face como um retângulo de altura `espessura`
 * mostraria uma laje horizontal onde há uma rampa.
 */
function faceCortadaDaAgua(
  r: Agua,
  elevacaoDoNivelMm: number,
  base: BaseElevacao,
  origem: Point,
  projU: (p: Point) => number,
): ItemCortado[] {
  const f = (p: Point) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y;
  const n = normalDaAgua(r);
  const duPorEspessura = -(n.x * base.u.x + n.y * base.u.y);
  const dvPorEspessura = -n.z;

  // Os cruzamentos em PLANTA, para poder ler a cota de cada um.
  const pontos: Point[] = [];
  for (let i = 0; i < r.pontos.length; i++) {
    const p = r.pontos[i];
    const q = r.pontos[(i + 1) % r.pontos.length];
    const fp = f(p);
    const fq = f(q);
    if (fp === fq) continue;
    if (!((fp <= 0 && fq > 0) || (fq <= 0 && fp > 0))) continue;
    const t = fp / (fp - fq);
    pontos.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  }
  pontos.sort((a, b) => projU(a) - projU(b));

  const saida: ItemCortado[] = [];
  for (let i = 0; i + 1 < pontos.length; i += 2) {
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const topo = [p1, p2].map((p) => ({
      u: projU(p),
      v: elevacaoDoNivelMm + alturaNaAgua(r, p),
    }));
    const baixo = topo.map((t) => ({
      u: t.u + duPorEspessura * r.espessuraMm,
      v: t.v + dvPorEspessura * r.espessuraMm,
    }));
    // Ordem que fecha o paralelogramo: topo da esquerda → topo da direita →
    // baixo da direita → baixo da esquerda.
    saida.push({
      id: r.id,
      familia: 'TELHADO',
      pontos: [topo[0], topo[1], baixo[1], baixo[0]],
      vaos: [],
      enterrada: false,
      rotulo: `${r.inclinacaoPct}%`,
    });
  }
  return saida;
}

/**
 * A face cortada de uma escada ou rampa: um polígono por fatia atravessada.
 *
 * Para cada prisma, o plano cruza a pegada em planta num segmento `[p1, p2]`
 * (o mesmo cruzamento de `trechosCortados`, aqui com a cota lida no ponto).
 * A face é o quadrilátero do piso até o topo em cada ponta. No degrau o topo é
 * plano, e sai um retângulo; na rampa a cota varia ao longo do trecho, e sai o
 * trapézio inclinado — que é exatamente o que distingue as duas no corte.
 *
 * ⚠️ Cota por interpolação BILINEAR nos quatro cantos, e não "a média do
 * prisma": a rampa cortada em diagonal tem cotas diferentes nas duas pontas do
 * segmento, e achatar as duas na média desenharia um degrau onde há rampa.
 */
function faceCortadaDaEscada(
  model: BlueprintModel,
  e: Escada,
  elevacaoDoNivelMm: number,
  base: BaseElevacao,
  origem: Point,
  projU: (p: Point) => number,
): ItemCortado[] {
  const f = (p: Point) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y;
  const saida: ItemCortado[] = [];

  for (const fatia of fatiasDaEscada(model, e)) {
    // Os cruzamentos do plano com o anel de quatro cantos, com a cota
    // interpolada ao longo da aresta cruzada.
    const cruz: { p: Point; cota: number }[] = [];
    const n = fatia.cantos.length;
    for (let i = 0; i < n; i++) {
      const p = fatia.cantos[i];
      const q = fatia.cantos[(i + 1) % n];
      const fp = f(p);
      const fq = f(q);
      if (fp === fq) continue;
      if (!((fp <= 0 && fq > 0) || (fq <= 0 && fp > 0))) continue;
      const t = fp / (fp - fq);
      cruz.push({
        p: { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t },
        cota: fatia.cotasMm[i] + (fatia.cotasMm[(i + 1) % n] - fatia.cotasMm[i]) * t,
      });
    }
    if (cruz.length < 2) continue;
    cruz.sort((a, b) => projU(a.p) - projU(b.p));
    const a = cruz[0];
    const b = cruz[cruz.length - 1];
    const ua = projU(a.p);
    const ub = projU(b.p);
    if (Math.abs(ub - ua) < 1) continue;

    saida.push({
      id: e.id,
      familia: 'ESCADA',
      pontos: [
        { u: ua, v: elevacaoDoNivelMm },
        { u: ua, v: elevacaoDoNivelMm + a.cota },
        { u: ub, v: elevacaoDoNivelMm + b.cota },
        { u: ub, v: elevacaoDoNivelMm },
      ],
      vaos: [],
      enterrada: false,
      rotulo: null,
    });
  }
  return saida;
}

/**
 * O enquadramento do CORTE — e ele NÃO é o da elevação.
 *
 * `projetarElevacao` mediu a caixa com a edificação inteira, inclusive a metade
 * que o corte descarta. Reaproveitá-la deixaria o desenho encolhido num canto,
 * com o vazio da metade removida ocupando o resto do papel.
 */
function bboxDoCorte(proj: ProjecaoCorte): ProjecaoCorte['bbox'] {
  const us: number[] = [];
  const vs: number[] = [];
  for (const c of proj.cortados) {
    for (const p of c.pontos) {
      us.push(p.u);
      vs.push(p.v);
    }
  }
  for (const p of proj.paredes) {
    if (p.degenerada) continue;
    us.push(p.uMin, p.uMax);
    vs.push(p.vMin, p.vMax);
  }
  for (const e of proj.estruturas) {
    if (e.degenerada) continue;
    us.push(e.uMin, e.uMax);
    vs.push(e.vMin, e.vMax);
  }
  for (const t of proj.telhados) {
    if (t.degenerada) continue;
    us.push(t.uMin, t.uMax);
    vs.push(t.vMin, t.vMax);
  }
  for (const e of proj.escadas ?? []) {
    if (e.degenerada) continue;
    us.push(e.uMin, e.uMax);
    vs.push(e.vMin, e.vMax);
  }
  if (us.length === 0) return proj.bbox;
  return {
    uMin: Math.min(...us),
    uMax: Math.max(...us),
    // O solo entra sempre: um corte que só pega o telhado ainda se lê a partir
    // do chão, e sem ele o desenho flutuaria.
    vMin: Math.min(proj.linhaDoSolo.v, ...vs),
    vMax: Math.max(...vs),
  };
}
