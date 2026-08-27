/**
 * Quantitativos derivados da geometria (PRD §8.7, RF-120 a RF-122).
 *
 * ÁREA DE EIXO × ÁREA DE PISO — a distinção que este módulo existe para fazer.
 *
 * O arranjo planar deriva o ambiente a partir dos EIXOS das paredes, porque é o
 * eixo que forma o grafo. Então `Space.areaMm2` inclui meia espessura de parede
 * em toda a volta. Numa sala de 4 × 3 m com parede de 150 mm isso dá 12,00 m²,
 * enquanto o piso que se assenta mede 3,85 × 2,85 = 10,97 m² — 9,4% a mais.
 *
 * Para desenhar, a área de eixo serve. Para orçar, não: 9% em piso, revestimento
 * e rodapé é diferença que aparece na obra. Aqui a área de piso é calculada
 * recuando o contorno em meia espessura de cada parede que o compõe.
 *
 * RASTREABILIDADE (RF-121). Todo resultado carrega fórmula, entradas e versão da
 * política. Um número de quantitativo que não diz de onde veio não pode ser
 * conferido, e o PRD §22.1 exige que a importação para o orçamento continue
 * ligada ao snapshot que a originou.
 */

import type { BlueprintModel, Level, Opening, Space, Wall } from './model';
import { wallLength } from './model';
import { contornoExternoDoNivel } from './arrangement';
import { areCollinear, isBetween, polygonPerimeter, type Point } from './geom';

/** Política de cálculo. Versionada: mudar a política cria outro resultado. */
export interface QuantityPolicy {
  version: string;
  /** Altura do rodapé, em mm. Só afeta a área de rodapé, não o comprimento. */
  alturaRodapeMm: number;
  /**
   * Perda aplicada a piso e revestimento, em fração (0.10 = 10%).
   * Fica na política, e não embutida na fórmula, porque varia por empresa e por
   * material — e porque o valor SEM perda precisa continuar visível.
   */
  perdaRevestimento: number;
  /**
   * Casas decimais na APRESENTAÇÃO. O cálculo não arredonda em momento algum.
   *
   * O PRD §9.2 pede "persistir valor bruto e exibido". Aqui o bruto é guardado
   * com precisão inteira e o exibido é função pura de (bruto, política) — o que
   * é mais forte do que guardar os dois: uma cópia do valor exibido pode
   * divergir do bruto depois de uma edição, esta não pode.
   *
   * Arredondar durante o cálculo era pior ainda: somar valores já arredondados
   * acumula o erro de cada parcela no total.
   */
  casas: number;
}

/**
 * `version` NÃO É DECORAÇÃO — é a chave do cache do quantitativo.
 *
 * `computeAndStoreQuantities` é idempotente por `(snapshot, version)`: com a
 * mesma versão ele devolve o registro gravado e NÃO recalcula. Então toda
 * mudança de FÓRMULA obriga a subir a versão, senão todo estudo já quantificado
 * serve o número velho para sempre e a correção fica invisível — pior que não
 * ter corrigido, porque parece corrigida.
 *
 * Trocar a versão cria um registro novo e preserva o antigo, que é o que mantém
 * auditável o número que um orçamento já citou.
 *
 * 1.0.0 → 1.1.0 (15/08/2026): o rodapé passou a ser interrompido por peitoril
 * zero, e não por `kind === 'door'`. Corrige a porta-janela, que contava rodapé
 * ao longo de um vão sem parede.
 *
 * 1.1.0 → 1.2.0 (24/08/2026): entrou `totais.areaConstruidaM2`. Acrescentar
 * campo ao resultado É mudança de resultado — sem subir a versão, todo estudo
 * já quantificado continuaria servindo o registro velho, sem o campo novo, e a
 * área construída apareceria vazia sem nada explicando.
 */
export const POLITICA_PADRAO: QuantityPolicy = {
  version: 'quant-1.2.0',
  alturaRodapeMm: 100,
  perdaRevestimento: 0.1,
  casas: 2,
};

export interface QuantidadeAmbiente {
  spaceId: string;
  nome?: string;
  /** Área do polígono de eixo. É a primitiva geométrica, não o piso. */
  areaEixoM2: number;
  /** Área útil de piso: contorno recuado em meia espessura de cada parede. */
  areaPisoM2: number;
  areaPisoComPerdaM2: number;
  perimetroEixoM: number;
  /** Perímetro descontando os vãos de porta que dão para o ambiente. */
  comprimentoRodapeM: number;
  areaRodapeM2: number;
  /** Explica de onde saiu a área de piso, para conferência. */
  formulaAreaPiso: string;
}

export interface QuantidadeParede {
  wallId: string;
  comprimentoM: number;
  alturaM: number;
  espessuraM: number;
  /** Uma face, sem desconto. */
  areaFaceBrutaM2: number;
  areaAberturasM2: number;
  /** Uma face, já descontadas as aberturas. */
  areaFaceLiquidaM2: number;
  /** Alvenaria: comprimento × altura × espessura, menos o vazio das aberturas. */
  volumeM3: number;
}

export interface QuantidadeAbertura {
  openingId: string;
  tipo: 'door' | 'window' | 'passage' | 'sliding';
  larguraM: number;
  alturaM: number;
  areaM2: number;
}

export interface Quantitativos {
  policy: QuantityPolicy;
  kernelVersion: string;
  ambientes: QuantidadeAmbiente[];
  paredes: QuantidadeParede[];
  aberturas: QuantidadeAbertura[];
  totais: {
    areaPisoM2: number;
    /**
     * ÁREA CONSTRUÍDA — o contorno externo, pela FACE das paredes.
     *
     * Não é a soma das áreas de piso: entre os cômodos está a alvenaria, que
     * ocupa lugar e é o que separa "o que se habita" de "o que se constrói".
     * É o número de laje e cobertura, e o que a NBR 12721 chama de área real.
     */
    areaConstruidaM2: number;
    areaPisoComPerdaM2: number;
    /** Duas faces por parede — é o que se reveste e se pinta. */
    areaParedeDuasFacesM2: number;
    volumeAlvenariaM3: number;
    comprimentoRodapeM: number;
    portas: number;
    janelas: number;
    /** Vãos livres — sem esquadria, então contados à parte de porta e janela. */
    vaosLivres: number;
    /** Correr é contada à parte de `portas`: preço e detalhe são outros. */
    portasDeCorrer: number;
    areaAberturasM2: number;
  };
}

const MM2_PARA_M2 = 1_000_000;
const MM3_PARA_M3 = 1_000_000_000;

/** Apresentação. Chamada pela UI, nunca dentro do cálculo. */
export function formatarQuantidade(v: number, policy: QuantityPolicy): string {
  return v.toFixed(policy.casas);
}

/**
 * Espessura da parede que sustenta um trecho do contorno.
 *
 * Devolve 0 quando nenhuma parede corresponde — é o caso do `Boundary`, que
 * divide ambiente sem ter material. Recuar por causa dele seria errado: não há
 * espessura para descontar.
 */
function espessuraDoTrecho(walls: Wall[], a: Point, b: Point): number {
  for (const w of walls) {
    if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
    if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
    return w.thicknessMm;
  }
  return 0;
}

/**
 * Área do contorno recuado para dentro, aresta a aresta.
 *
 * A' = A − Σ(dᵢ · Lᵢ) + Σ(dᵢ² · tan(giroᵢ / 2))
 *
 * O termo linear tira a faixa de parede de cada lado. O termo dos cantos corrige
 * a sobreposição — sem ele, o canto seria descontado duas vezes. `tan(giro/2)`
 * vale 1 num canto reto convexo e −1 num reentrante, que é o que faz a conta
 * fechar EXATAMENTE em planta ortogonal, o caso comum.
 *
 * `sentido = -1` INVERTE o recuo e a fórmula passa a EXPANDIR — é como se obtém
 * a área pela face externa a partir do contorno de eixo. Conferido na álgebra e
 * fixado em teste: num retângulo de eixo W×H com parede `t`, recuar dá
 * (W−t)(H−t) e expandir dá (W+t)(H+t).
 *
 * ⚠️ É a MESMA fórmula nos dois sentidos, de propósito. Uma `areaExpandida`
 * própria seria a segunda cópia da regra de espessura — e a primeira coisa que
 * diverge quando alguém corrigir o termo de canto num lugar só.
 */
export function areaRecuada(
  ring: Point[],
  walls: Wall[],
  sentido: 1 | -1 = 1,
): { areaMm2: number; formula: string } {
  const n = ring.length;
  if (n < 3) return { areaMm2: 0, formula: 'contorno degenerado' };

  // Área do polígono de eixo (laço do agrimensor).
  let duasVezes = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    duasVezes += p.x * q.y - q.x * p.y;
  }
  const areaEixo = Math.abs(duasVezes / 2);

  let termoLinear = 0;
  let termoCanto = 0;
  const espessuras: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const d = (espessuraDoTrecho(walls, a, b) / 2) * sentido;
    espessuras.push(d);
    termoLinear += d * L;
  }

  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    const ux = c.x - p.x;
    const uy = c.y - p.y;
    const vx = q.x - c.x;
    const vy = q.y - c.y;
    const giro = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    // Recuo do canto: média das duas arestas que nele chegam. Exato quando as
    // duas têm a mesma espessura, que é a planta comum.
    const d = (espessuras[(i - 1 + n) % n] + espessuras[i]) / 2;
    termoCanto += d * d * Math.tan(giro / 2);
  }

  return {
    areaMm2: Math.max(0, areaEixo - termoLinear + termoCanto),
    formula: 'A_eixo − Σ(espessura/2 × comprimento) + Σ(recuo² × tan(giro/2))',
  };
}

/**
 * ÁREA CONSTRUÍDA do nível — medida pela FACE EXTERNA das paredes.
 *
 * É o par da área de piso: piso é o que se assenta por dentro, área construída é
 * o que a edificação ocupa por fora. Nenhuma das duas é a "área de eixo" que o
 * arranjo planar produz, e é por isso que as três coexistem em vez de uma
 * substituir a outra.
 *
 * Sai do contorno externo (que `buildArrangement` descarta) expandido por meia
 * espessura, com a MESMA fórmula da área recuada — ver `areaRecuada`.
 *
 * Vários componentes conexos SOMAM: duas construções soltas no mesmo nível
 * ocupam as duas áreas. Fundir os contornos inventaria uma edificação só.
 */
export function areaConstruidaMm2(model: BlueprintModel, level: Level): number {
  const contornos = contornoExternoDoNivel(model, level);
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  return contornos.reduce(
    (soma, anel) => soma + areaRecuada(anel, paredes, -1).areaMm2,
    0,
  );
}

/** Aberturas hospedadas em paredes que compõem o contorno deste ambiente. */
function aberturasDoAmbiente(
  space: Space,
  walls: Wall[],
  openings: Opening[],
): Opening[] {
  const idsNoContorno = new Set<string>();
  const n = space.ring.length;
  for (let i = 0; i < n; i++) {
    const a = space.ring[i];
    const b = space.ring[(i + 1) % n];
    for (const w of walls) {
      if (!areCollinear(w.a, w.b, a) || !areCollinear(w.a, w.b, b)) continue;
      if (!isBetween(w.a, w.b, a) || !isBetween(w.a, w.b, b)) continue;
      idsNoContorno.add(w.id);
    }
  }
  return openings.filter((o) => idsNoContorno.has(o.wallId));
}

export function computeQuantities(
  model: BlueprintModel,
  policy: QuantityPolicy = POLITICA_PADRAO,
  kernelVersion = '',
): Quantitativos {
  // ── Paredes ───────────────────────────────────────────────────────────────
  const paredes: QuantidadeParede[] = model.walls.map((w) => {
    const compMm = wallLength(w);
    const aberturas = model.openings.filter((o) => o.wallId === w.id);
    const areaAberturasMm2 = aberturas.reduce((s, o) => s + o.widthMm * o.heightMm, 0);
    const bruta = compMm * w.heightMm;

    return {
      wallId: w.id,
      comprimentoM: (compMm / 1000),
      alturaM: (w.heightMm / 1000),
      espessuraM: (w.thicknessMm / 1000),
      areaFaceBrutaM2: (bruta / MM2_PARA_M2),
      areaAberturasM2: (areaAberturasMm2 / MM2_PARA_M2),
      areaFaceLiquidaM2: ((bruta - areaAberturasMm2) / MM2_PARA_M2),
      volumeM3: (((bruta - areaAberturasMm2) * w.thicknessMm) / MM3_PARA_M3),
    };
  });

  // ── Aberturas ─────────────────────────────────────────────────────────────
  const aberturas: QuantidadeAbertura[] = model.openings.map((o) => ({
    openingId: o.id,
    tipo: o.kind,
    larguraM: (o.widthMm / 1000),
    alturaM: (o.heightMm / 1000),
    areaM2: ((o.widthMm * o.heightMm) / MM2_PARA_M2),
  }));

  // ── Ambientes ─────────────────────────────────────────────────────────────
  const ambientes: QuantidadeAmbiente[] = model.spaces.map((s) => {
    const { areaMm2: pisoMm2, formula } = areaRecuada(s.ring, model.walls);

    // Buracos (ilhas) saem da área de piso: não se assenta piso ali.
    const buracosMm2 = s.holes.reduce((soma, h) => {
      const { areaMm2 } = areaRecuada(h, model.walls);
      return soma + areaMm2;
    }, 0);
    const pisoLiquidoMm2 = Math.max(0, pisoMm2 - buracosMm2);

    // Rodapé: perímetro menos o que INTERROMPE o rodapé.
    //
    // O QUE INTERROMPE É O VÃO QUE CHEGA AO PISO — `sillMm === 0`, e só isso. O
    // tipo não entra na conta, e essa é a correção de 15/08/2026: a regra
    // anterior perguntava `kind === 'door'`, então a PORTA-JANELA (janela com
    // peitoril zero, que se atravessa a pé) contava rodapé ao longo de um vão
    // onde não existe parede para pregá-lo. Vinha rodapé a mais no orçamento,
    // calado, e o desenho na tela estava certo o tempo todo.
    //
    // A regra por peitoril cobre os três tipos sem enumerá-los, e continua
    // correta para os casos que já estavam certos: porta nasce com peitoril
    // zero e segue interrompendo; janela normal (peitoril 900) não interrompe,
    // o rodapé passa por baixo; passa-prato — vão sem esquadria com peitoril
    // alto — também não.
    const interrompemRodape = aberturasDoAmbiente(s, model.walls, model.openings).filter(
      (o) => o.sillMm === 0,
    );
    const vaoPortasMm = interrompemRodape.reduce((soma, o) => soma + o.widthMm, 0);
    const rodapeMm = Math.max(0, s.perimeterMm - vaoPortasMm);

    return {
      spaceId: s.id,
      nome: s.name,
      areaEixoM2: (s.areaMm2 / MM2_PARA_M2),
      areaPisoM2: (pisoLiquidoMm2 / MM2_PARA_M2),
      areaPisoComPerdaM2: ((pisoLiquidoMm2 * (1 + policy.perdaRevestimento)) / MM2_PARA_M2),
      perimetroEixoM: (s.perimeterMm / 1000),
      comprimentoRodapeM: (rodapeMm / 1000),
      areaRodapeM2: ((rodapeMm * policy.alturaRodapeMm) / MM2_PARA_M2),
      formulaAreaPiso: formula,
    };
  });

  // ── Totais ────────────────────────────────────────────────────────────────
  const somaPiso = ambientes.reduce((s, a) => s + a.areaPisoM2, 0);
  const somaFace = paredes.reduce((s, p) => s + p.areaFaceLiquidaM2, 0);
  // Somando os níveis: num sobrado a área construída é a dos dois pavimentos.
  const somaConstruida = model.levels.reduce(
    (soma, nivel) => soma + areaConstruidaMm2(model, nivel) / MM2_PARA_M2,
    0,
  );

  return {
    policy,
    kernelVersion,
    ambientes,
    paredes,
    aberturas,
    totais: {
      areaPisoM2: (somaPiso),
      areaConstruidaM2: (somaConstruida),
      areaPisoComPerdaM2: (somaPiso * (1 + policy.perdaRevestimento)),
      // Duas faces: é o que se reveste e se pinta dos dois lados.
      areaParedeDuasFacesM2: (somaFace * 2),
      volumeAlvenariaM3: (paredes.reduce((s, p) => s + p.volumeM3, 0)),
      comprimentoRodapeM: (ambientes.reduce((s, a) => s + a.comprimentoRodapeM, 0)),
      portas: aberturas.filter((o) => o.tipo === 'door').length,
      janelas: aberturas.filter((o) => o.tipo === 'window').length,
      vaosLivres: aberturas.filter((o) => o.tipo === 'passage').length,
      // Contada à PARTE de `portas`: correr e abrir têm preço e detalhe
      // diferentes, e somá-las devolveria um número que não serve para
      // comprar nada.
      portasDeCorrer: aberturas.filter((o) => o.tipo === 'sliding').length,
      areaAberturasM2: (aberturas.reduce((s, o) => s + o.areaM2, 0)),
    },
  };
}
