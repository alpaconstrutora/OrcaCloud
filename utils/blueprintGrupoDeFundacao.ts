import {
  contornoEmPlanta,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Structural,
} from './blueprintKernel';
import { proximoNumeroDoRotulo } from './blueprintPilaresAutomaticos';

/**
 * GRUPO DE FUNDAÇÃO — o bloco de coroamento e as estacas dele (16/09/2026).
 *
 * Pedido: *"um bloco e estaca forma um grupo. a estaca e seu bloco deve estar
 * agrupado. ao clicar no grupo implementar opção de duplicação de estacas ou
 * campo quantidade"*, com os critérios de distribuição (Bastos/UNESP, Blocos):
 *
 *  3.1 CENTRO DE CARGA — o eixo do pilar coincide com o centro geométrico do
 *      conjunto de estacas;
 *  3.2 ESPAÇAMENTO — entre eixos, ≥ 3φ (bulbos de pressão não se sobrepõem);
 *  3.3 SIMETRIA — esforços iguais em cada estaca.
 *
 * ─── O GRUPO É DERIVADO, NÃO GRAVADO ────────────────────────────────────────
 *
 * O kernel não tem "pai": `Structural` continua sem campo novo e sem bump. A
 * estaca pertence ao bloco cujo contorno em planta contém o centro dela, no
 * mesmo pavimento — a MESMA regra com que `planejarFundacoes` decide "pilar já
 * tem bloco". O pilar do grupo é o que tem o centro dentro do bloco; pode não
 * haver (bloco desenhado à mão). Dois blocos sobrepostos que contenham a mesma
 * estaca: ela é do PRIMEIRO na ordem do modelo — dito aqui, não escondido.
 *
 * ─── OS ARRANJOS ────────────────────────────────────────────────────────────
 *
 * Em unidades de s = 3φ, no referencial do pilar (u = eixo do pilar, v ⟂):
 *   1 centro · 2 linha (±s/2) · 3 triângulo equilátero de lado s (circunraio
 *   s/√3, centroide na origem) · 4 quadrado de lado s · 5 quadrado + centro com
 *   lado s√2 (assim canto–centro = s e o critério 3.2 vale entre TODAS) ·
 *   6 retângulo 2 × 3 · 7 hexágono de raio s + centro · 8 malha 3 × 3 sem o
 *   centro · 9 malha 3 × 3 · 10–12 malha r × c centrada, r = maior divisor
 *   ≤ √n (n primo vira linha, com aviso).
 * Todo arranjo tem centroide (0,0), menor distância entre eixos ≥ s e é
 * simétrico em relação ao eixo do pilar (o triângulo tem três eixos de
 * simetria; os demais também são invariantes por 180°) — é o que o teste
 * confere para n = 1..12.
 *
 * O bloco é o retângulo envolvente das estacas + φ + 15 cm por lado, nunca
 * menor que o pilar + 10 cm por lado, a cada 5 cm — para 1 e 2 estacas dá
 * exatamente o que o lançamento automático já fazia (60 × 60 e 150 × 60 para
 * φ30 sob pilar 19). Bloco triangular não existe no kernel (PONTO é retângulo
 * ou círculo): o de 3 estacas é o envolvente.
 */

/** Espaçamento entre eixos de estacas, em diâmetros (critério 3.2). */
export const ESPACAMENTO_EM_DIAMETROS = 3;
export const QUANTIDADE_MAXIMA_DE_ESTACAS = 12;
/** Os arranjos de uso corrente, em destaque na interface. */
export const ARRANJOS_CANONICOS = [1, 2, 3, 4, 5, 6] as const;

/** Folga do bloco além da estaca (15 cm por lado) e além do pilar (10 cm por lado). */
const FOLGA_DA_ESTACA_MM = 300;
const FOLGA_DO_PILAR_MM = 200;
const PASSO_MM = 50;
const arred5 = (mm: number) => Math.ceil(mm / PASSO_MM) * PASSO_MM;

const DIAMETRO_PADRAO_MM = 300;
const COMPRIMENTO_PADRAO_MM = 8000;

export interface Arranjo {
  /** Posições dos eixos das estacas no referencial (u, v), em mm inteiros. */
  offsets: Point[];
  nome: string;
  espacamentoMm: number;
  aviso: string | null;
}

function malha(linhas: number, colunas: number, s: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < colunas; i++) {
    for (let j = 0; j < linhas; j++) {
      pts.push({ x: (i - (colunas - 1) / 2) * s, y: (j - (linhas - 1) / 2) * s });
    }
  }
  return pts;
}

/** Maior divisor de n que não passa de √n (1 quando n é primo). */
function linhasDaMalha(n: number): number {
  let r = 1;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) r = d;
  return r;
}

export function nomeDoArranjo(n: number): string {
  switch (n) {
    case 1:
      return 'centro';
    case 2:
      return 'linha';
    case 3:
      return 'triângulo';
    case 4:
      return 'quadrado';
    case 5:
      return 'quadrado com centro';
    case 6:
      return 'retângulo 2 × 3';
    case 7:
      return 'hexágono com centro';
    case 8:
      return 'malha 3 × 3 sem o centro';
    case 9:
      return 'malha 3 × 3';
    default: {
      const r = linhasDaMalha(n);
      return r === 1 ? 'linha' : `malha ${r} × ${n / r}`;
    }
  }
}

export function arranjoDeEstacas(n: number, diametroMm: number): Arranjo {
  const q = Math.max(1, Math.min(QUANTIDADE_MAXIMA_DE_ESTACAS, Math.round(n)));
  const s = ESPACAMENTO_EM_DIAMETROS * diametroMm;
  let pts: Point[];
  let aviso: string | null = null;
  switch (q) {
    case 1:
      pts = [{ x: 0, y: 0 }];
      break;
    case 2:
      pts = [{ x: -s / 2, y: 0 }, { x: s / 2, y: 0 }];
      break;
    case 3: {
      const R = s / Math.sqrt(3);
      pts = [{ x: 0, y: R }, { x: -s / 2, y: -R / 2 }, { x: s / 2, y: -R / 2 }];
      break;
    }
    case 4:
      pts = malha(2, 2, s);
      break;
    case 5: {
      const a = s / Math.SQRT2;
      pts = [{ x: -a, y: -a }, { x: a, y: -a }, { x: -a, y: a }, { x: a, y: a }, { x: 0, y: 0 }];
      break;
    }
    case 6:
      pts = malha(2, 3, s);
      break;
    case 7:
      pts = [
        { x: 0, y: 0 },
        ...[0, 60, 120, 180, 240, 300].map((g) => ({ x: s * Math.cos((g * Math.PI) / 180), y: s * Math.sin((g * Math.PI) / 180) })),
      ];
      break;
    case 8:
      pts = malha(3, 3, s).filter((p) => !(p.x === 0 && p.y === 0));
      break;
    case 9:
      pts = malha(3, 3, s);
      break;
    default: {
      const r = linhasDaMalha(q);
      pts = malha(r, q / r, s);
      if (r === 1) aviso = `${q} estacas não fecham malha simétrica — ficam em linha; prefira ${q - 1} ou ${q + 1}`;
    }
  }
  return {
    offsets: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    nome: nomeDoArranjo(q),
    espacamentoMm: s,
    aviso,
  };
}

/**
 * Bloco envolvente do arranjo: extensão das estacas + φ + folga, nunca menor
 * que o pilar + folga em cada eixo (`larguraMm` ao longo de u, `profundidadeMm`
 * ao longo de v — o eixo do pilar), a cada 5 cm.
 */
export function dimensoesDoBloco(
  offsets: readonly Point[],
  diametroMm: number,
  pilar: Pick<Structural, 'larguraMm' | 'profundidadeMm' | 'circular'> | null,
): { larguraMm: number; profundidadeMm: number } {
  const us = offsets.map((p) => p.x);
  const vs = offsets.map((p) => p.y);
  const dU = Math.max(...us) - Math.min(...us);
  const dV = Math.max(...vs) - Math.min(...vs);
  const pilarU = pilar ? pilar.larguraMm : 0;
  const pilarV = pilar ? (pilar.circular ? pilar.larguraMm : pilar.profundidadeMm) : 0;
  return {
    larguraMm: arred5(Math.max(dU + diametroMm + FOLGA_DA_ESTACA_MM, pilarU + FOLGA_DO_PILAR_MM)),
    profundidadeMm: arred5(Math.max(dV + diametroMm + FOLGA_DA_ESTACA_MM, pilarV + FOLGA_DO_PILAR_MM)),
  };
}

/** Leva os offsets (u, v) ao plano: gira pelo eixo do pilar e soma o centro; mm inteiros. */
export function posicionarEstacas(centro: Point, rotacaoDeg: number, offsets: readonly Point[]): Point[] {
  const rad = (rotacaoDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return offsets.map((o) => ({
    x: Math.round(centro.x + o.x * c - o.y * s),
    y: Math.round(centro.y + o.x * s + o.y * c),
  }));
}

// ─── O grupo ────────────────────────────────────────────────────────────────

const contem = (bloco: Structural, p: Point) => pointInPolygon(contornoEmPlanta(bloco), p);

export function estacasDoBloco(model: BlueprintModel, bloco: Structural): Structural[] {
  const anel = contornoEmPlanta(bloco);
  const blocosAntes = (model.structures ?? []).filter((s) => s.kind === 'BLOCO_COROAMENTO' && s.levelId === bloco.levelId);
  return (model.structures ?? []).filter((s) => {
    if (s.kind !== 'ESTACA' || s.levelId !== bloco.levelId) return false;
    if (!pointInPolygon(anel, s.pontos[0])) return false;
    // Blocos sobrepostos: a estaca é do PRIMEIRO que a contém.
    const dono = blocosAntes.find((b) => contem(b, s.pontos[0]));
    return dono?.id === bloco.id;
  });
}

export function blocoDaEstaca(model: BlueprintModel, estaca: Structural): Structural | null {
  return (
    (model.structures ?? []).find(
      (b) => b.kind === 'BLOCO_COROAMENTO' && b.levelId === estaca.levelId && contem(b, estaca.pontos[0]),
    ) ?? null
  );
}

export function pilarDoBloco(model: BlueprintModel, bloco: Structural): Structural | null {
  return (
    (model.structures ?? []).find((p) => p.kind === 'PILAR' && p.levelId === bloco.levelId && contem(bloco, p.pontos[0])) ??
    null
  );
}

export interface GrupoDeFundacao {
  bloco: Structural;
  estacas: Structural[];
  pilar: Structural | null;
}

/** O grupo a que a peça pertence — `id` de bloco ou de estaca. `null` fora de grupo. */
export function grupoDeFundacao(model: BlueprintModel, id: ObjectId): GrupoDeFundacao | null {
  const s = (model.structures ?? []).find((x) => x.id === id);
  if (!s) return null;
  const bloco = s.kind === 'BLOCO_COROAMENTO' ? s : s.kind === 'ESTACA' ? blocoDaEstaca(model, s) : null;
  if (!bloco) return null;
  return { bloco, estacas: estacasDoBloco(model, bloco), pilar: pilarDoBloco(model, bloco) };
}

/** `[bloco, ...estacas]` do grupo da peça, ou `null`. */
export function idsDoGrupo(model: BlueprintModel, id: ObjectId): ObjectId[] | null {
  const g = grupoDeFundacao(model, id);
  return g ? [g.bloco.id, ...g.estacas.map((e) => e.id)] : null;
}

/** O grupo, quando a seleção É exatamente ele (bloco + todas as estacas dele). */
export function grupoDaSelecao(model: BlueprintModel, ids: readonly ObjectId[]): GrupoDeFundacao | null {
  if (ids.length === 0) return null;
  const g = grupoDeFundacao(model, ids[0]);
  if (!g) return null;
  const esperados = new Set([g.bloco.id, ...g.estacas.map((e) => e.id)]);
  if (esperados.size !== ids.length) return null;
  return ids.every((id) => esperados.has(id)) ? g : null;
}

// ─── Redistribuir as estacas do bloco ───────────────────────────────────────

export interface PlanoDeEstacasDoBloco {
  comandos: Command[];
  removidas: ObjectId[];
  previstas: { at: Point; rotulo: string }[];
  bloco: { larguraMm: number; profundidadeMm: number; rotacaoDeg: number };
  diametroMm: number;
  comprimentoMm: number;
  nomeDoArranjo: string;
  espacamentoMm: number;
  aviso: string | null;
  motivo: string | null;
}

/**
 * Refaz as estacas do bloco com `quantidade` no arranjo do critério: apaga as
 * atuais, cria as novas (centro de carga no pilar, 3φ, simétrico) e redimensiona
 * o bloco para envolvê-las. Um lote: Ctrl+Z devolve tudo.
 *
 * Ø e comprimento omitidos herdam das estacas atuais (ou 30 cm × 8 m). Os
 * rótulos `E<n>` das removidas são reaproveitados em ordem; o que faltar
 * continua do maior do modelo.
 */
export function planejarEstacasDoBloco(
  model: BlueprintModel,
  blocoId: ObjectId,
  opts: { quantidade: number; diametroMm?: number; comprimentoMm?: number },
): PlanoDeEstacasDoBloco {
  const vazio = (motivo: string): PlanoDeEstacasDoBloco => ({
    comandos: [],
    removidas: [],
    previstas: [],
    bloco: { larguraMm: 0, profundidadeMm: 0, rotacaoDeg: 0 },
    diametroMm: 0,
    comprimentoMm: 0,
    nomeDoArranjo: '',
    espacamentoMm: 0,
    aviso: null,
    motivo,
  });
  const g = grupoDeFundacao(model, blocoId);
  if (!g || g.bloco.id !== blocoId) return vazio('bloco não encontrado');
  const { bloco, estacas, pilar } = g;
  const atual = estacas[0] ?? null;
  const diametroMm = Math.max(100, Math.round(opts.diametroMm ?? atual?.larguraMm ?? DIAMETRO_PADRAO_MM));
  const comprimentoMm = Math.max(500, Math.round(opts.comprimentoMm ?? atual?.alturaMm ?? COMPRIMENTO_PADRAO_MM));
  const quantidade = Math.max(1, Math.min(QUANTIDADE_MAXIMA_DE_ESTACAS, Math.round(opts.quantidade)));

  const arranjo = arranjoDeEstacas(quantidade, diametroMm);
  // 3.1: o centro do conjunto é o eixo do pilar; sem pilar, o centro do bloco.
  const centro = pilar ? pilar.pontos[0] : bloco.pontos[0];
  const rotacaoDeg = pilar ? pilar.rotacaoDeg : bloco.rotacaoDeg;
  const dims = dimensoesDoBloco(arranjo.offsets, diametroMm, pilar);
  const posicoes = posicionarEstacas(centro, rotacaoDeg, arranjo.offsets);

  // Rótulos: os das removidas, em ordem numérica, depois a continuação.
  const numero = (r: string | null | undefined) => {
    const m = /^E\s*0*(\d+)$/i.exec((r ?? '').trim());
    return m ? Number(m[1]) : null;
  };
  const reaproveitados = estacas
    .map((e) => numero(e.rotulo))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  let proximo = proximoNumeroDoRotulo(model, 'E');
  const rotulos = posicoes.map((_, k) => `E${reaproveitados[k] ?? proximo++}`);

  const baseDaEstaca = bloco.baseMm - comprimentoMm;
  const comandos: Command[] = [
    ...estacas.map((e): Command => ({ type: 'DeleteStructural', structuralId: e.id })),
    ...posicoes.map(
      (at, k): Command => ({
        type: 'AddStructural',
        levelId: bloco.levelId,
        kind: 'ESTACA',
        pontos: [at],
        larguraMm: diametroMm,
        profundidadeMm: diametroMm,
        alturaMm: comprimentoMm,
        baseMm: baseDaEstaca,
        circular: true,
        rotulo: rotulos[k],
      }),
    ),
  ];
  // O bloco acompanha o arranjo: recentrado no pilar (3.1 vale para o bloco
  // também — e é o que garante que as estacas novas continuem DENTRO dele, ou o
  // grupo se desfaria no ato), redimensionado e girado.
  if (bloco.pontos[0].x !== centro.x || bloco.pontos[0].y !== centro.y) {
    comandos.push({ type: 'MoveStructuralVertex', structuralId: bloco.id, index: 0, to: { x: centro.x, y: centro.y } });
  }
  if (dims.larguraMm !== bloco.larguraMm || dims.profundidadeMm !== bloco.profundidadeMm || rotacaoDeg !== bloco.rotacaoDeg) {
    comandos.push({
      type: 'SetStructuralProps',
      structuralId: bloco.id,
      larguraMm: dims.larguraMm,
      profundidadeMm: dims.profundidadeMm,
      rotacaoDeg,
    });
  }
  return {
    comandos,
    removidas: estacas.map((e) => e.id),
    previstas: posicoes.map((at, k) => ({ at, rotulo: rotulos[k] })),
    bloco: { ...dims, rotacaoDeg },
    diametroMm,
    comprimentoMm,
    nomeDoArranjo: arranjo.nome,
    espacamentoMm: arranjo.espacamentoMm,
    aviso: arranjo.aviso,
    motivo: null,
  };
}
