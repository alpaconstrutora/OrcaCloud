/**
 * TELHADO AUTOMÁTICO da casa (casa automática F5, 15/10/2026 — plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * Cobre o retângulo da casa com a COBERTURA POR EXTRUSÃO do kernel (`AddRoofByExtrusion`, P2.13): um perfil de
 * duas águas (ou uma) extrudado ao longo de um eixo em planta. Cada trecho do perfil vira uma `Agua` retangular
 * com o BEIRAL no lado baixo (`beiralIndex`) — é o lado que a pluvial lê para lançar calha (`planejarCalhas`).
 * Nada de geometria nova: o kernel faz as águas; aqui só se decide o eixo, o vão e as alturas.
 *
 * ─── A GEOMETRIA ────────────────────────────────────────────────────────────
 *
 * No QUADRO DA FRENTE (o mesmo da implantação e da arquitetura — x ao longo da frente, y da frente para os fundos):
 *  - a cobertura avança `meia parede externa + beiral` além do EIXO das paredes externas, nos quatro lados (o
 *    beiral dos oitões é o prolongamento do eixo da extrusão);
 *  - DUAS ÁGUAS: a cumeeira corre ao longo do lado MAIOR (ou como as hipóteses mandarem);
 *  - UMA ÁGUA: o eixo é paralelo à frente e a água cai para os fundos (ou para a frente) — cair para o lado de
 *    um vizinho não é opção que se ofereça sem saber da divisa;
 *  - alturas sobre o piso do pavimento: o TOPO da parede (pé-direito + laje) fica na linha da face externa; a
 *    ponta do beiral desce `(beiral + meia parede) × inclinação`; a cumeeira sobe o meio vão × inclinação.
 * O eixo vai ao mundo por `paraMundo` (lote girado funciona — as águas saem giradas).
 */
import type { Command, ObjectId, Point } from './blueprintKernel';
import { aguasDaExtrusao, perfilDeCobertura, type ParametrosDoPerfil } from './blueprintKernel';
import type { Retangulo } from './blueprintGerador';

export type CumeeiraDoTelhado = 'AO_LONGO_DO_MAIOR' | 'PARALELA_A_FRENTE' | 'PERPENDICULAR_A_FRENTE';
export type CaimentoDaUmaAgua = 'FUNDOS' | 'FRENTE';

export interface HipotesesDoTelhado {
  /** `false` = a casa sai sem cobertura. */
  lancar: boolean;
  tipo: 'DUAS_AGUAS' | 'UMA_AGUA';
  /** Telha cerâmica: 30 a 35 %; fibrocimento: 10 a 15 %. */
  inclinacaoPct: number;
  /** Quanto a cobertura avança além da FACE EXTERNA da parede, mm. */
  beiralMm: number;
  /** Espessura da água (telha + estrutura), mm — entra no 3D e no quantitativo. */
  espessuraMm: number;
  cumeeira: CumeeiraDoTelhado;
  caimentoUmaAgua: CaimentoDaUmaAgua;
}

export const HIPOTESES_DO_TELHADO_PADRAO: HipotesesDoTelhado = {
  lancar: true,
  tipo: 'DUAS_AGUAS',
  inclinacaoPct: 30,
  beiralMm: 600,
  espessuraMm: 50,
  cumeeira: 'AO_LONGO_DO_MAIOR',
  caimentoUmaAgua: 'FUNDOS',
};

/** O quadro da frente (o mesmo de `blueprintCasaAutomatica`): mundo = x·ex + y·ey. */
export interface QuadroDoTelhado {
  ex: Point;
  ey: Point;
}

export interface ResumoDoTelhado {
  aguas: number;
  /** Projeção horizontal da cobertura (com o beiral), m². */
  projecaoM2: number;
  /** Comprimento da cumeeira (ou do lado alto, uma água), m. */
  cumeeiraM: number;
  alturaDoBeiralMm: number;
  alturaDaCumeeiraMm: number;
  /** "ao longo da frente" / "da frente para os fundos". */
  direcao: string;
}

export type PlanoDoTelhado = { ok: true; comandos: Command[]; resumo: ResumoDoTelhado } | { ok: false; motivo: string };

/**
 * O comando da cobertura sobre o retângulo `ret` (EIXO das paredes externas, no quadro da frente).
 * `alturaDoTopoMm` = topo da parede sobre o piso (pé-direito + laje, quando há laje).
 */
export function comandosDoTelhado(
  levelId: ObjectId,
  ret: Retangulo,
  quadro: QuadroDoTelhado,
  alturaDoTopoMm: number,
  meiaParedeExternaMm: number,
  hip: HipotesesDoTelhado = HIPOTESES_DO_TELHADO_PADRAO,
): PlanoDoTelhado {
  const W = ret.x1 - ret.x0;
  const D = ret.y1 - ret.y0;
  if (W <= 0 || D <= 0) return { ok: false, motivo: 'A casa não tem contorno para cobrir.' };
  if (!(hip.inclinacaoPct > 0)) return { ok: false, motivo: 'A inclinação do telhado precisa ser maior que zero.' };
  if (!(hip.beiralMm >= 0)) return { ok: false, motivo: 'O beiral não pode ser negativo.' };
  // Quanto a cobertura passa além do EIXO da parede externa.
  const alem = meiaParedeExternaMm + hip.beiralMm;
  const i = hip.inclinacaoPct / 100;

  // Eixo ao longo de x (paralelo à frente) ou de y (da frente para os fundos).
  const aoLongoDeX = hip.tipo === 'UMA_AGUA' || (hip.cumeeira === 'PARALELA_A_FRENTE' ? true : hip.cumeeira === 'PERPENDICULAR_A_FRENTE' ? false : W >= D);
  const xm = (ret.x0 + ret.x1) / 2;
  const ym = (ret.y0 + ret.y1) / 2;
  // Ao longo de x, A→B com u = (+1, 0) deixa o s = 0 (o lado baixo da uma água) nos FUNDOS (+y) — ver
  // `aguasDaExtrusao`: a normal aponta para −y e s cresce para lá. Caindo para a FRENTE, o eixo inverte.
  const inverter = hip.tipo === 'UMA_AGUA' && hip.caimentoUmaAgua === 'FRENTE';
  let A: Point;
  let B: Point;
  let vao: number;
  let comprimento: number;
  if (aoLongoDeX) {
    A = { x: ret.x0 - alem, y: ym };
    B = { x: ret.x1 + alem, y: ym };
    if (inverter) [A, B] = [B, A];
    vao = D + 2 * alem;
    comprimento = W + 2 * alem;
  } else {
    A = { x: xm, y: ret.y0 - alem };
    B = { x: xm, y: ret.y1 + alem };
    vao = W + 2 * alem;
    comprimento = D + 2 * alem;
  }
  // A face externa da parede fica a `beiral` da ponta: o topo da parede (lá) desce até a ponta do beiral.
  const alturaDoBeiralMm = Math.round(alturaDoTopoMm - hip.beiralMm * i);
  const alturaDaCumeeiraMm = Math.round(alturaDoBeiralMm + (hip.tipo === 'DUAS_AGUAS' ? vao / 2 : vao) * i);
  const parametros: ParametrosDoPerfil = { tipo: hip.tipo, vaoMm: Math.round(vao), alturaBeiralMm: alturaDoBeiralMm, alturaCumeeiraMm: alturaDaCumeeiraMm, flechaMm: 0, dentes: 1 };
  const perfil = perfilDeCobertura(parametros);
  const mundo = (p: Point): Point => ({ x: Math.round(p.x * quadro.ex.x + p.y * quadro.ey.x), y: Math.round(p.x * quadro.ex.y + p.y * quadro.ey.y) });
  const eixoA = mundo(A);
  const eixoB = mundo(B);
  // Confere antes: o kernel recusaria o mesmo perfil com a mesma mensagem.
  let aguas: number;
  try {
    aguas = aguasDaExtrusao(eixoA, eixoB, perfil).aguas.length;
  } catch (e) {
    return { ok: false, motivo: `O perfil do telhado não fecha: ${e instanceof Error ? e.message : String(e)}.` };
  }
  return {
    ok: true,
    comandos: [{ type: 'AddRoofByExtrusion', levelId, eixoA, eixoB, perfil, espessuraMm: hip.espessuraMm }],
    resumo: {
      aguas,
      projecaoM2: Math.round((vao * comprimento) / 10_000) / 100,
      cumeeiraM: Math.round(comprimento / 10) / 100,
      alturaDoBeiralMm,
      alturaDaCumeeiraMm,
      direcao: aoLongoDeX ? 'ao longo da frente' : 'da frente para os fundos',
    },
  };
}
