/**
 * PROJEÇÃO EM ELEVAÇÃO — a edificação vista de frente, de fundos e das laterais.
 *
 * ─── POR QUE FORA DE `utils/blueprintKernel/` ───────────────────────────────
 *
 * A regra de ouro do módulo (docs/planos/2026-08-09-estado-e-continuacao.md) é
 * "geometria mora no kernel, o renderer só desenha". Este arquivo obedece: é
 * função PURA, sem React, sem canvas, sem three — testável por golden. Mora ao
 * lado de `blueprintTerreno.ts` e `blueprintCotas.ts`, e não DENTRO do kernel,
 * pelo mesmo motivo que eles: precisa de `medirTerreno` (que vive em
 * `blueprintTerreno.ts`) para achar a divisa de frente, e o kernel não pode
 * importar para fora de si. Nada aqui muda o payload canônico — não há bump de
 * `KERNEL_VERSION`.
 *
 * ─── O QUE É UMA ELEVAÇÃO AQUI ──────────────────────────────────────────────
 *
 * Um plano vertical. O eixo horizontal (`u`) corre ao longo da fachada, para a
 * direita de quem olha; o vertical (`v`) é a COTA: `level.elevationMm` mais a
 * altura dentro do pavimento. Cada parede vira um retângulo `u × v`; cada
 * abertura, um recorte. Não há remoção de linha oculta na v1 — as paredes são
 * pintadas opacas da mais funda para a mais próxima (painter's algorithm), e o
 * renderer sobrepõe o contorno externo do nível por cima.
 */

import {
  type BlueprintModel,
  type BoundaryPapel,
  type Level,
  type ObjectId,
  type Opening,
  type Point,
  type Segment,
  type Structural,
  type StructuralKind,
  type Wall,
  DEFAULT_TOLERANCE_MM,
  cantosDaParede,
  contornoEmPlanta,
  contornoExternoDoNivel,
  extensaoDeCanto,
  faixaDaEstruturaNaParede,
  interiorPoint,
  wallLength,
} from './blueprintKernel';
import { medirTerreno } from './blueprintTerreno';

/** As quatro elevações têm o MESMO vocabulário dos papéis de divisa. */
export type DirecaoElevacao = BoundaryPapel;

export interface BaseElevacao {
  /**
   * `DIVISA_FRENTE` = a base saiu da divisa marcada como FRENTE (decisão do
   * usuário 2026-08-29). `EIXOS_FIXOS` = não há divisa marcada, então vale a
   * convenção de eixos do modelo.
   */
  origem: 'DIVISA_FRENTE' | 'EIXOS_FIXOS';
  /** Versor horizontal da elevação — cresce para a DIREITA de quem olha. */
  u: Point;
  /** Versor da direção de visão — aponta PARA DENTRO do lote. */
  d: Point;
}

export interface RetanguloElevacao {
  wallId: ObjectId;
  levelId: ObjectId;
  /** Extensão ao longo da fachada, em mm. */
  uMin: number;
  uMax: number;
  /** Cota, em mm: `level.elevationMm` .. `+ wall.heightMm`. */
  vMin: number;
  vMax: number;
  /** `dot(meioDoEixo, d)` — só serve para ordenar do fundo para a frente. */
  profundidade: number;
  /** O eixo coincide (± tolerância) com o contorno externo do nível. */
  ehContorno: boolean;
  /** `uMax - uMin < tolerância`: parede quase paralela à direção de visão. */
  degenerada: boolean;
}

export interface AberturaElevacao {
  openingId: ObjectId;
  wallId: ObjectId;
  levelId: ObjectId;
  kind: Opening['kind'];
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  profundidade: number;
}

/**
 * Peça estrutural projetada na elevação.
 *
 * A projeção é a MESMA dos outros dois: a pegada em planta
 * (`contornoEmPlanta`) achatada sobre `u`, e a extensão vertical vindo da cota.
 * Não há caso especial por forma — pilar, viga e laje viram todos um retângulo
 * no plano da fachada, que é exatamente o que uma elevação mostra.
 */
export interface EstruturaElevacao {
  structuralId: ObjectId;
  levelId: ObjectId;
  kind: StructuralKind;
  rotulo: string | null;
  uMin: number;
  uMax: number;
  /** Cota: `level.elevationMm + baseMm` .. `+ alturaMm`. */
  vMin: number;
  vMax: number;
  profundidade: number;
  /**
   * A peça está ABAIXO do piso do pavimento (`baseMm < 0`).
   *
   * O renderer desenha oculto (tracejado), que é a convenção de prancha para o
   * que está enterrado. Sem a marca, o bloco de coroamento e o pilar que ele
   * sustenta ficam indistinguíveis — e eles se sobrepõem quase sempre.
   */
  enterrada: boolean;
  /** `uMax - uMin < tolerância`: peça vista de topo, some na fachada. */
  degenerada: boolean;
}

export interface ProjecaoElevacao {
  direcao: DirecaoElevacao;
  base: BaseElevacao;
  levelIds: ObjectId[];
  /** Paredes ordenadas por `profundidade` DECRESCENTE — fundo primeiro. */
  paredes: RetanguloElevacao[];
  aberturas: AberturaElevacao[];
  /** Estruturas, na mesma ordem de profundidade das paredes. */
  estruturas: EstruturaElevacao[];
  /**
   * A linha de chão: `v` é a menor `elevationMm` dos níveis projetados.
   *
   * ⚠️ NÃO é o fundo do `bbox`. Fundação vive ABAIXO dela, e é isso que uma
   * elevação com fundação mostra: a linha do solo continua sendo o piso, e o
   * desenho desce além dela. Igualar as duas puxaria a linha do terreno para o
   * fundo da estaca, a 9 m de profundidade.
   */
  linhaDoSolo: { uMin: number; uMax: number; v: number };
  bbox: { uMin: number; uMax: number; vMin: number; vMax: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Base ortonormal da elevação
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza `-0` para `0` — senão `toEqual({x:1,y:0})` falha num `-0` invisível. */
const z = (v: number): number => v + 0;
const vec = (x: number, y: number): Point => ({ x: z(x), y: z(y) });
const unit = (p: Point): Point => {
  const c = Math.hypot(p.x, p.y);
  return c === 0 ? { x: 0, y: 0 } : vec(p.x / c, p.y / c);
};
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
/** `u` é sempre `d` girado −90° (Y do modelo cresce para cima). */
const direitaDe = (d: Point): Point => vec(d.y, -d.x);
const gira90 = (d: Point): Point => vec(-d.y, d.x);

/**
 * Direção de visão de cada elevação na convenção de EIXOS FIXOS.
 *
 * "Frente" = a face de menor Y da planta, olhada de baixo para cima — como um
 * projetista lê a fachada frontal. É escolha livre, travada por golden; para
 * inverter, troca-se o sinal aqui e em nenhum outro lugar.
 */
const VISAO_FIXA: Record<DirecaoElevacao, Point> = {
  FRENTE: { x: 0, y: 1 },
  FUNDOS: { x: 0, y: -1 },
  LATERAL_DIREITA: { x: -1, y: 0 },
  LATERAL_ESQUERDA: { x: 1, y: 0 },
};

/**
 * A base da elevação para uma direção.
 *
 * Com uma divisa `papel: 'FRENTE'` no terreno, a base sai da NORMAL INTERNA
 * dessa divisa (quem olha a fachada está fora do lote, olhando para dentro), e
 * as outras três direções são rotações de 90°/180° dela. Sem divisa de frente,
 * vale `VISAO_FIXA`.
 */
export function baseDaElevacao(model: BlueprintModel, direcao: DirecaoElevacao): BaseElevacao {
  const dFrente = frentePelaDivisa(model);
  if (dFrente) {
    const d =
      direcao === 'FRENTE'
        ? dFrente
        : direcao === 'FUNDOS'
          ? vec(-dFrente.x, -dFrente.y)
          : direcao === 'LATERAL_DIREITA'
            ? gira90(dFrente)
            : vec(-gira90(dFrente).x, -gira90(dFrente).y);
    return { origem: 'DIVISA_FRENTE', d, u: direitaDe(d) };
  }
  const d = VISAO_FIXA[direcao];
  return { origem: 'EIXOS_FIXOS', d, u: direitaDe(d) };
}

/** A normal interna da divisa FRENTE, ou `null` se não houver terreno fechado. */
function frentePelaDivisa(model: BlueprintModel): Point | null {
  const terreno = medirTerreno(model.boundaries);
  if (!terreno || terreno.anel.length < 3) return null;

  const idx = terreno.ladosIds.findIndex(
    (id) => model.boundaries.find((b) => b.id === id)?.papel === 'FRENTE',
  );
  if (idx < 0) return null;

  const a = terreno.anel[idx];
  const b = terreno.anel[(idx + 1) % terreno.anel.length];
  const dir = unit({ x: b.x - a.x, y: b.y - a.y });
  if (dir.x === 0 && dir.y === 0) return null;

  // Uma das duas normais; orienta para DENTRO usando um ponto do interior.
  let n = { x: dir.y, y: -dir.x };
  const dentro = interiorPoint(terreno.anel);
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (dot({ x: dentro.x - meio.x, y: dentro.y - meio.y }, n) < 0) {
    n = { x: -n.x, y: -n.y };
  }
  return unit(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Projeção
// ─────────────────────────────────────────────────────────────────────────────

/** Distância de `p` ao segmento `s` — não à reta. */
function distPontoSegmento(p: Point, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return Math.hypot(p.x - s.a.x, p.y - s.a.y);
  let t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / comp2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(s.a.x + t * dx - p.x, s.a.y + t * dy - p.y);
}

/**
 * A edificação projetada num plano vertical, olhando na direção `direcao`.
 *
 * `levelIds` omitido = todos os níveis. Um nível sem parede nenhuma não
 * contribui com retângulo, mas ainda conta para a linha do solo.
 */
export function projetarElevacao(
  model: BlueprintModel,
  opts: { direcao: DirecaoElevacao; levelIds?: ObjectId[] },
): ProjecaoElevacao {
  const base = baseDaElevacao(model, opts.direcao);
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;
  const projD = (p: Point) => p.x * base.d.x + p.y * base.d.y;

  const niveis = model.levels.filter(
    (l) => !opts.levelIds || opts.levelIds.includes(l.id),
  );
  const levelIds = niveis.map((l) => l.id);

  const paredes: RetanguloElevacao[] = [];
  const aberturas: AberturaElevacao[] = [];
  const estruturas: EstruturaElevacao[] = [];

  for (const level of niveis) {
    const contorno = contornoExternoDoNivel(model, level);
    const arestasContorno: Segment[] = [];
    for (const anel of contorno) {
      for (let i = 0; i < anel.length; i++) {
        arestasContorno.push({ a: anel[i], b: anel[(i + 1) % anel.length] });
      }
    }
    const noContorno = (meio: Point) =>
      arestasContorno.some((s) => distPontoSegmento(meio, s) <= DEFAULT_TOLERANCE_MM);

    // Vizinhança do avanço de canto — só o MESMO pavimento. `extensaoDeCanto`
    // compara coordenada e não `levelId`.
    const paredesDoNivel = model.walls.filter((w) => w.levelId === level.id);

    for (const wall of model.walls) {
      if (wall.levelId !== level.id) continue;

      // COM o avanço de canto, como a planta baixa, o 3D e o PDF.
      //
      // Sem ele a parede era projetada de eixo a eixo, e a silhueta da fachada
      // ficava CURTA meia espessura em cada ponta que encontra outra parede: no
      // canto da edificação o contorno abria um degrau que não existe na obra.
      // É o mesmo defeito que o 3D e o IFC tinham (30/08/2026) — a régua é uma
      // só, e mora em `extensaoDeCanto`.
      //
      // Não afeta a detecção de parede vista de topo (`degenerada`): o avanço
      // corre ao longo do EIXO, e numa parede perpendicular à vista o eixo é a
      // direção de profundidade — a largura em `u` continua sendo a espessura.
      const cantos = cantosDaParede(
        wall.a,
        wall.b,
        wall.thicknessMm,
        extensaoDeCanto(paredesDoNivel, wall, 'a'),
        extensaoDeCanto(paredesDoNivel, wall, 'b'),
      );
      if (cantos.length === 0) continue;

      const us = cantos.map(projU);
      const uMin = Math.round(Math.min(...us));
      const uMax = Math.round(Math.max(...us));
      const meio = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
      const profundidade = Math.round(projD(meio));

      paredes.push({
        wallId: wall.id,
        levelId: level.id,
        uMin,
        uMax,
        vMin: level.elevationMm,
        vMax: level.elevationMm + wall.heightMm,
        profundidade,
        ehContorno: noContorno(meio),
        degenerada: uMax - uMin < DEFAULT_TOLERANCE_MM,
      });

      const comp = wallLength(wall);
      if (comp === 0) continue;
      const eixo = unit({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y });
      for (const o of model.openings) {
        if (o.wallId !== wall.id) continue;
        const p0 = { x: wall.a.x + eixo.x * o.offsetMm, y: wall.a.y + eixo.y * o.offsetMm };
        const p1 = {
          x: wall.a.x + eixo.x * (o.offsetMm + o.widthMm),
          y: wall.a.y + eixo.y * (o.offsetMm + o.widthMm),
        };
        const a = Math.round(projU(p0));
        const b = Math.round(projU(p1));
        aberturas.push({
          openingId: o.id,
          wallId: wall.id,
          levelId: level.id,
          kind: o.kind,
          uMin: Math.min(a, b),
          uMax: Math.max(a, b),
          vMin: level.elevationMm + o.sillMm,
          vMax: level.elevationMm + o.sillMm + o.heightMm,
          profundidade,
        });
      }
    }

    // ── Estrutura do nível ────────────────────────────────────────────────
    //
    // UMA conta para as três formas: a pegada em planta achatada sobre `u`. É
    // `contornoEmPlanta` que absorve a diferença entre centro girado, eixo com
    // largura e anel — e é por isso que não há `switch (kind)` aqui.
    //
    // ⚠️ A peça CIRCULAR usa o quadrado envolvente que `contornoEmPlanta`
    // devolve, e nesta vista isso está CERTO: a projeção de um cilindro num
    // plano vertical é exatamente um retângulo de largura igual ao diâmetro.
    // O erro de 27% que o quadrado causaria é de VOLUME, não de silhueta.
    for (const s of model.structures ?? []) {
      if (s.levelId !== level.id) continue;
      const anel = contornoEmPlanta(s);
      if (anel.length === 0) continue;

      const us = anel.map(projU);
      const uMin = Math.round(Math.min(...us));
      const uMax = Math.round(Math.max(...us));
      const centro = {
        x: anel.reduce((t, p) => t + p.x, 0) / anel.length,
        y: anel.reduce((t, p) => t + p.y, 0) / anel.length,
      };

      estruturas.push({
        structuralId: s.id,
        levelId: level.id,
        kind: s.kind,
        rotulo: s.rotulo ?? null,
        uMin,
        uMax,
        vMin: level.elevationMm + s.baseMm,
        vMax: level.elevationMm + s.baseMm + s.alturaMm,
        profundidade: Math.round(projD(centro)),
        enterrada: s.baseMm < 0,
        degenerada: uMax - uMin < DEFAULT_TOLERANCE_MM,
      });
    }
  }

  paredes.sort((x, y) => y.profundidade - x.profundidade || x.uMin - y.uMin);
  aberturas.sort((x, y) => y.profundidade - x.profundidade || x.uMin - y.uMin);
  estruturas.sort((x, y) => y.profundidade - x.profundidade || x.uMin - y.uMin);

  const solidas = paredes.filter((p) => !p.degenerada);
  const pecas = estruturas.filter((e) => !e.degenerada);
  const vSolo = niveis.length ? Math.min(...niveis.map((l) => l.elevationMm)) : 0;

  // O ENQUADRAMENTO INCLUI A ESTRUTURA — em `u` e nos DOIS sentidos de `v`.
  //
  // Uma laje em balanço passa da silhueta das paredes; uma estaca desce 9 m
  // abaixo do piso. Sem entrar no bbox, as duas ficariam desenhadas FORA do
  // quadro que a tela enquadra, e o usuário veria a peça sumir sem explicação.
  // A linha do solo NÃO acompanha: ela continua no piso (ver `linhaDoSolo`).
  const usU = [...solidas.flatMap((p) => [p.uMin, p.uMax]), ...pecas.flatMap((e) => [e.uMin, e.uMax])];
  const uMin = usU.length ? Math.min(...usU) : 0;
  const uMax = usU.length ? Math.max(...usU) : 0;

  const topos = [...solidas.map((p) => p.vMax), ...pecas.map((e) => e.vMax)];
  const fundos = [vSolo, ...pecas.map((e) => e.vMin)];
  const vMax = topos.length ? Math.max(...topos) : vSolo;
  const vMin = Math.min(...fundos);

  return {
    direcao: opts.direcao,
    base,
    levelIds,
    paredes,
    aberturas,
    estruturas,
    linhaDoSolo: { uMin, uMax, v: vSolo },
    bbox: { uMin, uMax, vMin, vMax },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Perfil da parede com vãos — a MESMA conta para o recorte 2D e a extrusão 3D
// ─────────────────────────────────────────────────────────────────────────────

export interface PerfilParede {
  wallId: ObjectId;
  /** Comprimento do eixo, em mm. */
  comprimentoMm: number;
  /** Altura da parede, em mm. */
  alturaMm: number;
  eixo: Segment;
  espessuraMm: number;
  /**
   * Quanto o CORPO da parede avança além do eixo, em cada ponta, em mm.
   *
   * É o que fecha o canto: parada no vértice do eixo, a parede deixa um entalhe
   * de meia espessura na face externa da junção. Vem de `extensaoDeCanto`, a
   * régua do kernel — a MESMA que a planta baixa e a exportação em PDF usam.
   * Não recalcular como "meia espessura": isso só acerta em 90°, e foi
   * exatamente o erro que `extensaoDeCanto` existe para não deixar copiar.
   *
   * Zero em ponta livre. `comprimentoMm` continua sendo o EIXO — o avanço vem
   * separado para quem desenha o corpo somar, sem mudar o significado da medida.
   */
  avancoAMm: number;
  avancoBMm: number;
  /** `level.elevationMm` do nível da parede (0 se o nível sumiu). */
  elevacaoBaseMm: number;
  /**
   * Vãos em coordenada LOCAL da parede: `x` ao longo do eixo (de `a`), `y` a
   * partir do piso do pavimento. Já recortados a `[0, comprimento] × [0, altura]`.
   */
  furos: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    openingId: ObjectId;
    kind: Opening['kind'];
  }[];
  /**
   * Vãos abertos pelo CONCRETO que atravessa a parede — só quando ela cede o
   * volume sobreposto (`Wall.cedeSobreposicao`).
   *
   * Lista SEPARADA de `furos`, e não mais entradas nela, porque as duas coisas
   * não são a mesma: `furos` são aberturas, têm `openingId` e `kind`, e quem
   * consome pode querer desenhar o símbolo da folha. Um pilar embutido não é
   * uma porta sem batente.
   *
   * ⚠️ NÃO recortado a `[0, comprimento]`: o pilar de canto invade a extensão de
   * mitra, e cortar em zero deixaria uma lasca de alvenaria bem na quina. Quem
   * desenha clampa contra o retângulo do perfil, que já inclui o avanço.
   */
  furosEstruturais: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    structuralId: ObjectId;
  }[];
}

/** Perfil frontal de UMA parede com os vãos abertos nela. */
export function perfilDaParedeComVaos(model: BlueprintModel, wall: Wall): PerfilParede {
  const comprimentoMm = wallLength(wall);
  const level = model.levels.find((l) => l.id === wall.levelId);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const furos = model.openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      x0: clamp(o.offsetMm, 0, comprimentoMm),
      x1: clamp(o.offsetMm + o.widthMm, 0, comprimentoMm),
      y0: clamp(o.sillMm, 0, wall.heightMm),
      y1: clamp(o.sillMm + o.heightMm, 0, wall.heightMm),
      openingId: o.id,
      kind: o.kind,
    }))
    .filter((f) => f.x1 > f.x0 && f.y1 > f.y0);

  // Vizinhança do MESMO pavimento, e não `model.walls` inteiro. `isFreeWallEnd`
  // e `extensaoDeCanto` comparam coordenada, não `levelId`: uma parede do 2º
  // pavimento em cima de uma do térreo compartilha o vértice e passaria por
  // vizinha, dando avanço onde a ponta é livre. É o mesmo recorte que a planta
  // baixa faz (`paredesDoNivel`, em BlueprintCanvas).
  const doNivel = model.walls.filter((w) => w.levelId === wall.levelId);

  return {
    wallId: wall.id,
    comprimentoMm,
    alturaMm: wall.heightMm,
    eixo: { a: { ...wall.a }, b: { ...wall.b } },
    espessuraMm: wall.thicknessMm,
    avancoAMm: extensaoDeCanto(doNivel, wall, 'a'),
    avancoBMm: extensaoDeCanto(doNivel, wall, 'b'),
    elevacaoBaseMm: level?.elevationMm ?? 0,
    furos,
    // A parede que CEDEU o volume no quantitativo cede também o espaço no
    // desenho — é a mesma decisão, aplicada às duas saídas. Sem isto, o usuário
    // decide "descontar da alvenaria", o número muda e o 3D segue mostrando o
    // pilar atravessando a parede, como se nada tivesse acontecido (relatado em
    // 01/09/2026, com print).
    //
    // Quando quem cede é o CONCRETO, o desenho não muda: a parede continua
    // inteira, e um pilar menos uma fatia de parede não é mais um retângulo —
    // o modelo não sabe representar essa forma.
    furosEstruturais: wall.cedeSobreposicao
      ? (model.structures ?? [])
          .filter((s) => s.levelId === wall.levelId)
          .map((s) => ({ s, faixa: faixaDaEstruturaNaParede(wall, s) }))
          .filter((r): r is { s: Structural; faixa: NonNullable<typeof r.faixa> } => !!r.faixa)
          .map(({ s, faixa }) => ({ ...faixa, structuralId: s.id }))
      : [],
  };
}
