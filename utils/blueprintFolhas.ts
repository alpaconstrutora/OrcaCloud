/**
 * ESQUADRIA CONFIGURÁVEL — a GEOMETRIA das folhas (11/10/2026, kernel 0.98.0 — F8
 * do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * Um lugar só para as três saídas da planta (canvas, PDF, DXF) e um para o 3D:
 * o símbolo sai em SEGMENTOS no mm do modelo, e quem desenha só converte para a
 * sua tela. Com duas cópias da conta, a janela da tela e a do PDF divergem na
 * primeira correção — o defeito que `linhasDoPadrao` (F6) já evitou para a hachura.
 *
 * Só vale para abertura COM `configuracao`. Sem ela, cada saída segue com o
 * desenho de sempre (porta: folha + arco; janela: linha no eixo), byte a byte.
 *
 * ─── A CONVENÇÃO ────────────────────────────────────────────────────────────
 *
 * As folhas vão da ponta da dobradiça para a outra (`hingeAtStart` = começam em
 * `wall.a + offsetMm`); `swingReversed` diz para que lado da parede elas abrem.
 *
 *   FIXA        a linha do vidro no eixo;
 *   ABRIR       folha a 90° + arco de giro, dobradiça na ponta de FORA (folhas da
 *               primeira metade giram na ponta inicial; as da segunda, na final —
 *               duas folhas de abrir fazem a porta dupla que se encontra no meio);
 *   CORRER      a folha num dos dois trilhos (alternados), passando um pouco da
 *               divisão — a sobreposição é o que diz "corre";
 *   PIVOTANTE   a posição fechada tracejada + a folha girada 90° pelo meio;
 *   BASCULANTE  o vidro + a projeção tracejada para OS DOIS lados (gira no meio);
 *   MAXIM_AR    o vidro + a projeção tracejada para o lado em que abre;
 *   CAMARAO     o zigue-zague da folha dobrada.
 *
 * A bandeira fica acima do plano de corte e não aparece na planta (como no
 * papel); aparece no 3D e no quadro de esquadrias.
 */
import { MAX_FOLHAS_DA_ESQUADRIA, MIN_ALTURA_DA_BANDEIRA_MM, MIN_ALTURA_SOB_A_BANDEIRA_MM, MIN_LARGURA_DA_FOLHA_PCT, folhasIguais } from './blueprintKernel';
import type { BandeiraDaEsquadria, ConfiguracaoDaEsquadria, FolhaDaEsquadria, Opening, Point, Wall } from './blueprintKernel';

export interface SegmentoDaFolha {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Posição projetada ou escondida — tracejada nas três saídas. */
  tracejado?: boolean;
}

type AberturaComFolhas = Pick<Opening, 'kind' | 'offsetMm' | 'widthMm' | 'heightMm' | 'sillMm' | 'hingeAtStart' | 'swingReversed'> & {
  configuracao?: ConfiguracaoDaEsquadria;
};
type ParedeDaAbertura = Pick<Wall, 'a' | 'b' | 'thicknessMm'>;

/** Onde cada folha começa e termina, em mm a partir da ponta da dobradiça. */
export function trechosDasFolhas(folhas: readonly FolhaDaEsquadria[], larguraMm: number): { folha: FolhaDaEsquadria; de: number; ate: number }[] {
  let acumulado = 0;
  return folhas.map((folha) => {
    const de = (acumulado * larguraMm) / 100;
    acumulado += folha.larguraPct;
    return { folha, de, ate: (acumulado * larguraMm) / 100 };
  });
}

/** O referencial do vão: origem na ponta da dobradiça, `dir` ao longo do vão, `n` atravessando a parede. */
function referencial(w: ParedeDaAbertura, o: AberturaComFolhas, offsetMm: number) {
  const comp = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (comp <= 0) return null;
  const ux = (w.b.x - w.a.x) / comp;
  const uy = (w.b.y - w.a.y) / comp;
  const inicio = offsetMm + (o.hingeAtStart ? 0 : o.widthMm);
  const origem = { x: w.a.x + ux * inicio, y: w.a.y + uy * inicio };
  const dir = o.hingeAtStart ? { x: ux, y: uy } : { x: -ux, y: -uy };
  const n = { x: -uy, y: ux };
  const lado = o.swingReversed ? -1 : 1;
  /** Ponto a `s` mm ao longo do vão e `c` mm através da parede (no sentido de `n`). */
  const P = (s: number, c: number) => ({ x: origem.x + dir.x * s + n.x * c, y: origem.y + dir.y * s + n.y * c });
  return { P, dir, n, lado, meia: w.thicknessMm / 2, giro: -Math.atan2(uy, ux) };
}

/** O SÍMBOLO de planta das folhas, em segmentos no mm do modelo. `[]` sem configuração. */
export function simboloDasFolhas(o: AberturaComFolhas, w: ParedeDaAbertura, offsetMm = o.offsetMm): SegmentoDaFolha[] {
  const c = o.configuracao;
  if (!c || (o.kind !== 'door' && o.kind !== 'window')) return [];
  const r = referencial(w, o, offsetMm);
  if (!r) return [];
  const { P, lado, meia } = r;
  const W = o.widthMm;
  const saida: SegmentoDaFolha[] = [];
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, tracejado = false) => saida.push(tracejado ? { a, b, tracejado } : { a, b });
  const trechos = trechosDasFolhas(c.folhas, W);
  const N = trechos.length;

  // Os montantes entre folhas: um traço curto atravessando o eixo.
  for (let i = 1; i < N; i++) seg(P(trechos[i].de, -meia * 0.6), P(trechos[i].de, meia * 0.6));

  trechos.forEach(({ folha, de, ate }, i) => {
    const largura = ate - de;
    switch (folha.mecanismo) {
      case 'FIXA':
        seg(P(de, 0), P(ate, 0));
        break;
      case 'ABRIR': {
        // Dobradiça na ponta de FORA: primeira metade na inicial, segunda na final.
        const naInicial = i < N / 2;
        const h = naInicial ? de : ate;
        const sentido = naInicial ? 1 : -1; // de `h` para a outra ponta, ao longo do vão
        const piv = P(h, meia * lado);
        const aberta = P(h, meia * lado + largura * lado);
        seg(piv, aberta);
        const K = 12;
        let anterior = P(h + sentido * largura, meia * lado);
        for (let k = 1; k <= K; k++) {
          const t = (k / K) * (Math.PI / 2);
          const p = P(h + sentido * largura * Math.cos(t), meia * lado + largura * lado * Math.sin(t));
          seg(anterior, p);
          anterior = p;
        }
        break;
      }
      case 'CORRER': {
        // Dois trilhos alternados; a folha passa um pouco da divisão (o "corre").
        const trilho = (i % 2 === 0 ? 1 : -1) * meia * 0.3;
        const passa = Math.min(largura * 0.08, 60);
        seg(P(Math.max(0, de - passa), trilho), P(Math.min(W, ate + passa), trilho));
        break;
      }
      case 'PIVOTANTE': {
        const meio = (de + ate) / 2;
        seg(P(de, 0), P(ate, 0), true);
        seg(P(meio, -largura / 2), P(meio, largura / 2));
        break;
      }
      case 'BASCULANTE':
      case 'MAXIM_AR': {
        seg(P(de, 0), P(ate, 0));
        const projecao = Math.min(largura * 0.35, 300);
        const lados = folha.mecanismo === 'BASCULANTE' ? [1, -1] : [lado];
        for (const l of lados) {
          const face = meia * l;
          const longe = (meia + projecao) * l;
          seg(P(de, face), P(de, longe), true);
          seg(P(de, longe), P(ate, longe), true);
          seg(P(ate, longe), P(ate, face), true);
        }
        break;
      }
      case 'CAMARAO': {
        const amplitude = Math.min(largura / 4, 250) * lado;
        const pts = [P(de, 0), P(de + largura / 4, amplitude), P(de + largura / 2, 0), P(de + (3 * largura) / 4, amplitude), P(ate, 0)];
        for (let k = 1; k < pts.length; k++) seg(pts[k - 1], pts[k]);
        break;
      }
    }
  });
  return saida;
}

export type MaterialDaPecaDaEsquadria = 'CAIXILHO' | 'VIDRO' | 'FOLHA';
/** Uma caixa do 3D: centro em planta (mm do modelo), altura do centro a partir do PISO do pavimento, medidas e giro (o da parede). */
export interface PecaDaEsquadria3D {
  centro: Point;
  centroAlturaMm: number;
  comprimentoMm: number;
  alturaMm: number;
  espessuraMm: number;
  /** Giro em Y no mundo do 3D (`-atan2` da parede — a convenção de `blueprint3dPecas`). */
  giro: number;
  material: MaterialDaPecaDaEsquadria;
}

/** Perfil do caixilho e do montante, e as espessuras de vidro e folha, em mm. */
export const MEDIDAS_DO_CAIXILHO = { perfilMm: 50, montanteMm: 40, profundidadeMm: 70, vidroMm: 8, folhaMm: 35 } as const;

/**
 * As PEÇAS do 3D: caixilho (batentes, verga e — na janela — o peitoril do
 * quadro), montantes entre folhas, a travessa da bandeira, e o pano de cada
 * folha (vidro; na porta, folha opaca, salvo a FIXA, que é vidro lateral). A
 * folha de correr anda num dos dois trilhos, como na planta.
 */
export function pecas3dDasFolhas(o: AberturaComFolhas, w: ParedeDaAbertura): PecaDaEsquadria3D[] {
  const c = o.configuracao;
  if (!c || (o.kind !== 'door' && o.kind !== 'window')) return [];
  const r = referencial(w, o, o.offsetMm);
  if (!r) return [];
  const { P, giro } = r;
  const M = MEDIDAS_DO_CAIXILHO;
  const W = o.widthMm;
  const prof = Math.min(M.profundidadeMm, w.thicknessMm);
  const y0 = o.sillMm;
  const y1 = o.sillMm + o.heightMm;
  const janela = o.kind === 'window';
  const saida: PecaDaEsquadria3D[] = [];
  const caixa = (s0: number, s1: number, h0: number, h1: number, espessuraMm: number, material: MaterialDaPecaDaEsquadria, atravessa = 0) => {
    if (s1 - s0 <= 0 || h1 - h0 <= 0) return;
    saida.push({ centro: P((s0 + s1) / 2, atravessa) as Point, centroAlturaMm: (h0 + h1) / 2, comprimentoMm: s1 - s0, alturaMm: h1 - h0, espessuraMm, giro, material });
  };
  // Caixilho.
  caixa(0, M.perfilMm, y0, y1, prof, 'CAIXILHO');
  caixa(W - M.perfilMm, W, y0, y1, prof, 'CAIXILHO');
  caixa(M.perfilMm, W - M.perfilMm, y1 - M.perfilMm, y1, prof, 'CAIXILHO');
  if (janela) caixa(M.perfilMm, W - M.perfilMm, y0, y0 + M.perfilMm, prof, 'CAIXILHO');
  // Bandeira.
  const yBandeira = c.bandeira ? y1 - c.bandeira.alturaMm : null;
  if (yBandeira != null) {
    caixa(M.perfilMm, W - M.perfilMm, yBandeira - M.montanteMm / 2, yBandeira + M.montanteMm / 2, prof, 'CAIXILHO');
    caixa(M.perfilMm, W - M.perfilMm, yBandeira + M.montanteMm / 2, y1 - M.perfilMm, M.vidroMm, 'VIDRO');
  }
  // Folhas.
  const f0 = janela ? y0 + M.perfilMm : y0;
  const f1 = yBandeira != null ? yBandeira - M.montanteMm / 2 : y1 - M.perfilMm;
  const trechos = trechosDasFolhas(c.folhas, W);
  trechos.forEach(({ folha, de, ate }, i) => {
    if (i > 0) caixa(de - M.montanteMm / 2, de + M.montanteMm / 2, f0, f1, prof, 'CAIXILHO');
    const ini = i === 0 ? M.perfilMm : de + M.montanteMm / 2;
    const fim = i === trechos.length - 1 ? W - M.perfilMm : ate - M.montanteMm / 2;
    const opaca = !janela && folha.mecanismo !== 'FIXA';
    const trilho = folha.mecanismo === 'CORRER' ? (i % 2 === 0 ? 1 : -1) * (prof / 4) : 0;
    caixa(ini, fim, f0, f1, opaca ? M.folhaMm : M.vidroMm, opaca ? 'FOLHA' : 'VIDRO', trilho);
  });
  return saida;
}

// ─── EDIÇÃO (o painel só chama isto) ─────────────────────────────────────────

/** A configuração com que "Configurar folhas" começa: porta de 1 folha de abrir; janela de 2 de correr. */
export function configuracaoPadrao(kind: Opening['kind']): ConfiguracaoDaEsquadria | null {
  if (kind === 'door') return { folhas: folhasIguais(1, 'ABRIR') };
  if (kind === 'window') return { folhas: folhasIguais(2, 'CORRER') };
  return null;
}

/**
 * Muda a largura da folha `i` tirando (ou dando) a diferença da VIZINHA — a da
 * direita, ou a da esquerda quando `i` é a última. Devolve o MOTIVO quando não dá
 * (a soma tem de continuar 100 e nenhuma folha fica abaixo do mínimo).
 */
export function mudarLarguraDaFolha(folhas: readonly FolhaDaEsquadria[], i: number, pct: number): FolhaDaEsquadria[] | string {
  if (folhas.length < 2) return 'Com uma folha só, ela ocupa o vão inteiro (100 %)';
  if (!Number.isInteger(pct)) return 'A largura é em % inteiro';
  const j = i === folhas.length - 1 ? i - 1 : i + 1;
  const vizinha = folhas[j].larguraPct - (pct - folhas[i].larguraPct);
  if (pct < MIN_LARGURA_DA_FOLHA_PCT || vizinha < MIN_LARGURA_DA_FOLHA_PCT) {
    const max = folhas[i].larguraPct + folhas[j].larguraPct - MIN_LARGURA_DA_FOLHA_PCT;
    return `Cabe de ${MIN_LARGURA_DA_FOLHA_PCT} a ${max} % (a folha ${j + 1} cede a diferença)`;
  }
  return folhas.map((f, k) => (k === i ? { ...f, larguraPct: pct } : k === j ? { ...f, larguraPct: vizinha } : { ...f }));
}

/** Mais uma folha (com o mecanismo da última), todas redivididas por igual. `null` no máximo. */
export function acrescentarFolha(folhas: readonly FolhaDaEsquadria[]): FolhaDaEsquadria[] | null {
  if (folhas.length >= MAX_FOLHAS_DA_ESQUADRIA) return null;
  const mecanismos = [...folhas.map((f) => f.mecanismo), folhas[folhas.length - 1]?.mecanismo ?? 'FIXA'];
  return folhasIguais(mecanismos.length, 'FIXA').map((f, k) => ({ ...f, mecanismo: mecanismos[k] }));
}

/** Tira a folha `i`; a largura dela vai para a vizinha. `null` quando é a única. */
export function removerFolha(folhas: readonly FolhaDaEsquadria[], i: number): FolhaDaEsquadria[] | null {
  if (folhas.length < 2) return null;
  const j = i === folhas.length - 1 ? i - 1 : i + 1;
  return folhas.flatMap((f, k) => (k === i ? [] : k === j ? [{ ...f, larguraPct: f.larguraPct + folhas[i].larguraPct }] : [{ ...f }]));
}

/** A faixa de altura da bandeira neste vão; `null` quando o vão é baixo demais para ter uma. */
export function faixaDaBandeira(heightMm: number): { min: number; max: number } | null {
  const max = heightMm - MIN_ALTURA_SOB_A_BANDEIRA_MM;
  return max >= MIN_ALTURA_DA_BANDEIRA_MM ? { min: MIN_ALTURA_DA_BANDEIRA_MM, max } : null;
}

/** "Pôr bandeira": 400 mm (ou o que couber), basculante. `null` quando não cabe. */
export function bandeiraPadrao(heightMm: number): BandeiraDaEsquadria | null {
  const faixa = faixaDaBandeira(heightMm);
  return faixa ? { alturaMm: Math.min(400, faixa.max), mecanismo: 'BASCULANTE' } : null;
}
