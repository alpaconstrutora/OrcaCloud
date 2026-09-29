/**
 * A PRANCHA HIDROSSANITÁRIA (28/09/2026, Etapa 2 do roadmap hidrossanitário —
 * `docs/planos/2026-09-28-hidrossanitario-roadmap.md`). Molde: a prancha
 * elétrica (`blueprintPranchaEletrica.ts`).
 *
 * E2.1 — a planta de ÁGUA (fria e quente) e a de ESGOTO por pavimento, por
 * cima da arquitetura: o tubo na largura real quando ela passa de 0,8 mm no
 * papel (bifilar: duas bordas e o miolo claro), senão um traço; as CONEXÕES
 * derivadas (a bolsa de cada boca e o disco no nó), os pontos com a sigla, as
 * caixas de esgoto com tampa/grelha, o ø (e o i % no esgoto) junto do tubo e
 * as prumadas (TQ, ventilação, colunas) como círculo com o nome. A LEGENDA não
 * vai na planta (convenção da elétrica): sai numa folha própria, "Legenda e
 * detalhes hidrossanitários", com o que EXISTE no desenho — conduto por rede ×
 * material × DN, peças e símbolos.
 *
 * Tudo em mm de PAPEL; a projeção (`proj`) é a da planta (`desenharPlanta`).
 */
import type { BlueprintModel, DisciplinaDeRede, MaterialDeTubo, ObjectId } from './blueprintKernel';
import { ROTULO_DA_CONEXAO, materialDoTrecho } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA, ROTULO_DA_DISCIPLINA } from './blueprintRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import { COR_DO_CONTORNO_DA_PECA, corDaConexao, pegadaDaCaixa2D, rotuloDoTrecho2D, simbolosDasConexoes2D } from './blueprintIsometrico';

export type RedeDaPrancha = 'AGUA' | 'ESGOTO';
type P = { x: number; y: number };
type Proj = { px: (x: number) => number; py: (y: number) => number };

const COR = '#000000';
const COR_FRACA = '#555555';
const TEXTO_MM = 1.8;
const FINA = 0.18;
const MEDIA = 0.35;
/** Abaixo desta largura no papel o tubo vira traço — bifilar de 0,5 mm é borrão. */
const LARGURA_MINIMA_BIFILAR_MM = 0.8;

export const DISCIPLINAS_DA_REDE: Record<RedeDaPrancha, DisciplinaDeRede[]> = {
  AGUA: ['AGUA_FRIA', 'AGUA_QUENTE'],
  ESGOTO: ['ESGOTO'],
};

/** Tem instalação desta rede no pavimento? (trecho ou ponto) — é o que põe a prancha no conjunto. */
export function temRedeNoPavimento(model: BlueprintModel, levelId: ObjectId, rede: RedeDaPrancha): boolean {
  const ds = DISCIPLINAS_DA_REDE[rede];
  return (
    (model.trechos ?? []).some((t) => t.levelId === levelId && ds.includes(t.disciplina)) ||
    (model.terminais ?? []).some((t) => t.levelId === levelId && ds.includes(t.disciplina) && t.tipoHidraulico != null)
  );
}

function circulo(d: Desenhista, c: P, r: number, estilo: { cheio?: string; traco: number; cor?: string }): void {
  const pts: P[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  if (estilo.cheio) d.poligono(pts, estilo.cheio);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d.linha(a.x, a.y, b.x, b.y, { espessuraMm: estilo.traco, cor: estilo.cor ?? COR });
  }
}

function faixa(p: P, q: P, largura: number): P[] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const n = Math.hypot(dx, dy);
  if (n === 0) return null;
  const ox = (-dy / n) * (largura / 2);
  const oy = (dx / n) * (largura / 2);
  return [
    { x: p.x + ox, y: p.y + oy },
    { x: q.x + ox, y: q.y + oy },
    { x: q.x - ox, y: q.y - oy },
    { x: p.x - ox, y: p.y - oy },
  ];
}

/**
 * Onde escrever o rótulo de um tubo sem o texto cruzar o próprio tubo: do lado
 * de CIMA (ou à direita, se o tubo é vertical), afastado `folga` mm do eixo; e,
 * se o tubo SOBE para a direita, o texto termina no meio em vez de começar
 * nele — senão a linha atravessa as letras. Largura do texto estimada (0,55 da
 * altura por caractere, Helvetica).
 */
export function posicaoDoRotulo(a: P, b: P, folga: number, texto: string): P {
  const n0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / n0;
  const uy = (b.y - a.y) / n0;
  let nx = -uy;
  let ny = ux;
  if (ny > 1e-9 || (Math.abs(ny) <= 1e-9 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const x = (a.x + b.x) / 2 + nx * folga;
  const y = (a.y + b.y) / 2 + ny * folga;
  const sobeParaADireita = ux * uy < -1e-9 && Math.abs(ux) > 0.2;
  return { x: sobeParaADireita ? x - texto.length * TEXTO_MM * 0.55 : x, y };
}

/** Clareia a cor em `quanto` (0–1) — o miolo do tubo bifilar. */
function clarear(hex: string, quanto: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.round(v + (255 - v) * quanto).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/**
 * A INSTALAÇÃO da rede sobre a planta. `denominador` converte mm reais em mm de
 * papel para a largura do tubo; o resto do desenho vem de `proj`.
 */
export function desenharHidrossanitaria(d: Desenhista, model: BlueprintModel, proj: Proj, rede: RedeDaPrancha, denominador: number, levelId: ObjectId | null): void {
  const { px, py } = proj;
  const ds = DISCIPLINAS_DA_REDE[rede];
  const trechos = (model.trechos ?? []).filter((t) => ds.includes(t.disciplina) && (!levelId || t.levelId === levelId));

  // ── Tubos ────────────────────────────────────────────────────────────────
  for (const t of trechos) {
    const a = { x: px(t.a.x), y: py(t.a.y) };
    const b = { x: px(t.b.x), y: py(t.b.y) };
    const cor = COR_DA_DISCIPLINA[t.disciplina];
    const larguraPapel = t.bitolaMm / denominador;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.2) {
      // Prumada: a seção do tubo, cheia, com o nome (TQ, Ventilação) ao lado.
      circulo(d, a, Math.max(larguraPapel / 2, 0.8), { cheio: clarear(cor, 0.7), traco: FINA, cor });
      if (t.rotulo) d.texto(a.x + Math.max(larguraPapel / 2, 0.8) + 0.8, a.y - 0.6, `${t.rotulo} ø${t.bitolaMm}`, TEXTO_MM, cor);
      continue;
    }
    const f = larguraPapel >= LARGURA_MINIMA_BIFILAR_MM ? faixa(a, b, larguraPapel) : null;
    if (f) {
      d.poligono(f, clarear(cor, 0.82));
      d.linha(f[0].x, f[0].y, f[1].x, f[1].y, { espessuraMm: FINA, cor });
      d.linha(f[3].x, f[3].y, f[2].x, f[2].y, { espessuraMm: FINA, cor });
    } else {
      d.linha(a.x, a.y, b.x, b.y, { espessuraMm: t.disciplina === 'ESGOTO' ? MEDIA * 1.4 : MEDIA, cor });
    }
    // O ø (e o i %) junto do meio, quando o tubo tem papel para isso.
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 12) {
      const r = posicaoDoRotulo(a, b, Math.max(larguraPapel / 2, 0.4) + 0.7, rotuloDoTrecho2D(t));
      d.texto(r.x, r.y, rotuloDoTrecho2D(t), TEXTO_MM, cor);
    }
  }

  // ── Conexões derivadas ───────────────────────────────────────────────────
  for (const sc of simbolosDasConexoes2D(model, levelId)) {
    const disciplina = sc.chave.split('|')[0] as DisciplinaDeRede;
    if (!ds.includes(disciplina)) continue;
    const cor = corDaConexao(disciplina);
    for (const bolsa of sc.bolsas) {
      const f = faixa({ x: px(bolsa.de.x), y: py(bolsa.de.y) }, { x: px(bolsa.para.x), y: py(bolsa.para.y) }, Math.max(bolsa.larguraMm / denominador, 0.6));
      if (!f) continue;
      d.poligono(f, cor);
      for (let i = 0; i < 4; i++) d.linha(f[i].x, f[i].y, f[(i + 1) % 4].x, f[(i + 1) % 4].y, { espessuraMm: FINA, cor: COR_DO_CONTORNO_DA_PECA });
    }
    if (sc.raioDoCorpoMm != null) circulo(d, { x: px(sc.no.x), y: py(sc.no.y) }, Math.max(sc.raioDoCorpoMm / denominador, 0.45), { cheio: cor, traco: FINA, cor: COR_DO_CONTORNO_DA_PECA });
  }

  // ── Pontos e caixas ──────────────────────────────────────────────────────
  for (const t of model.terminais ?? []) {
    if (!ds.includes(t.disciplina) || !t.tipoHidraulico || (levelId && t.levelId !== levelId)) continue;
    const c = { x: px(t.at.x), y: py(t.at.y) };
    const ficha = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico];
    // Caixa de esgoto pela ficha; reservatório (e o que mais tiver medida) pela medida gravada.
    const pegada = pegadaDaCaixa2D(t) ?? (t.larguraMm && t.profundidadeMm ? { forma: 'PRISMA' as const, larguraMm: t.larguraMm, profundidadeMm: t.profundidadeMm } : null);
    if (pegada) {
      const l = pegada.larguraMm / denominador;
      const p = pegada.profundidadeMm / denominador;
      if (pegada.forma === 'PRISMA') {
        d.retangulo(c.x - l / 2, c.y - p / 2, l, p, { espessuraMm: MEDIA, cor: COR });
        const i = Math.min(120 / denominador, l * 0.2);
        d.retangulo(c.x - l / 2 + i, c.y - p / 2 + i, l - 2 * i, p - 2 * i, { espessuraMm: FINA, cor: COR_FRACA });
      } else {
        circulo(d, c, l / 2, { traco: MEDIA });
        circulo(d, c, (l / 2) * 0.7, { traco: FINA, cor: COR_FRACA });
      }
      d.texto(c.x + l / 2 + 0.6, c.y - p / 2 - 0.4, ficha.sigla, TEXTO_MM, COR);
      continue;
    }
    circulo(d, c, 0.9, { cheio: COR_DA_DISCIPLINA[t.disciplina], traco: FINA });
    d.texto(c.x + 1.3, c.y - 1.0, ficha.sigla, TEXTO_MM, COR);
  }
}

// ─── A legenda ───────────────────────────────────────────────────────────────

export interface ItemDaLegendaHidro {
  grupo: 'Condutos' | 'Conexões' | 'Pontos e peças';
  texto: string;
  /** A cor da amostra (a da rede), quando o item é conduto. */
  cor?: string;
}

/** As linhas da LEGENDA — só o que existe no desenho, em ordem estável. */
export function itensDaLegendaHidro(model: BlueprintModel): ItemDaLegendaHidro[] {
  const hidraulicas: DisciplinaDeRede[] = ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'];
  const condutos = new Map<string, ItemDaLegendaHidro>();
  for (const t of model.trechos ?? []) {
    if (!hidraulicas.includes(t.disciplina)) continue;
    const material = materialDoTrecho(t);
    const nomeMaterial = material ? ` · ${FICHA_DO_MATERIAL[material as MaterialDeTubo].rotulo}` : ' · PVC esgoto (NBR 5688)';
    const k = `${hidraulicas.indexOf(t.disciplina)}|${material ?? ''}|${String(t.bitolaMm).padStart(4, '0')}`;
    condutos.set(k, { grupo: 'Condutos', texto: `${ROTULO_DA_DISCIPLINA[t.disciplina]}${nomeMaterial} · ø${t.bitolaMm} mm`, cor: COR_DA_DISCIPLINA[t.disciplina] });
  }
  const conexoes = new Set<string>();
  for (const sc of simbolosDasConexoes2D(model, null)) {
    if (hidraulicas.includes(sc.chave.split('|')[0] as DisciplinaDeRede)) conexoes.add(ROTULO_DA_CONEXAO[sc.tipo]);
  }
  const pecas = new Map<string, string>();
  for (const t of model.terminais ?? []) {
    if (!hidraulicas.includes(t.disciplina) || !t.tipoHidraulico) continue;
    const f = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico];
    pecas.set(f.sigla, `${f.sigla} — ${f.rotulo}`);
  }
  return [
    ...[...condutos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
    ...[...conexoes].sort().map((texto) => ({ grupo: 'Conexões' as const, texto })),
    ...[...pecas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, texto]) => ({ grupo: 'Pontos e peças' as const, texto })),
  ];
}

/**
 * A LEGENDA desenhada a partir de (x0, y0), em colunas por grupo. Devolve a
 * altura ocupada — a folha de detalhes empilha o que vem depois (isométricos).
 */
export function desenharLegendaHidro(d: Desenhista, model: BlueprintModel, x0: number, y0: number, larguraMm: number): number {
  const itens = itensDaLegendaHidro(model);
  let y = y0;
  d.texto(x0, y, 'LEGENDA', 3.0, COR);
  y += 6;
  if (itens.length === 0) {
    d.texto(x0, y, 'Nenhuma instalação hidrossanitária no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    return y + 4 - y0;
  }
  const grupos: ItemDaLegendaHidro['grupo'][] = ['Condutos', 'Conexões', 'Pontos e peças'];
  const larguraColuna = Math.max(60, larguraMm / 3);
  let alturaMax = 0;
  grupos.forEach((g, i) => {
    const x = x0 + i * larguraColuna;
    let yy = y;
    d.texto(x, yy, g, TEXTO_MM * 1.2, COR);
    yy += 4.5;
    for (const it of itens.filter((z) => z.grupo === g)) {
      if (it.cor) {
        d.poligono([{ x, y: yy - 1.4 }, { x: x + 8, y: yy - 1.4 }, { x: x + 8, y: yy + 0.2 }, { x, y: yy + 0.2 }], clarear(it.cor, 0.6));
        d.retangulo(x, yy - 1.4, 8, 1.6, { espessuraMm: FINA, cor: it.cor });
        d.texto(x + 10, yy, it.texto, TEXTO_MM, COR);
      } else d.texto(x, yy, it.texto, TEXTO_MM, COR);
      yy += 3.4;
    }
    alturaMax = Math.max(alturaMax, yy - y);
  });
  return y + alturaMax - y0;
}
