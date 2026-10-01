/**
 * E2.3 — O ESQUEMA VERTICAL (28/09/2026, roadmap hidrossanitário).
 *
 * As COLUNAS do desenho — água fria (AF), água quente (AQ), tubo de queda (TQ)
 * e a ventilação dele (CV) — num corte esquemático com os pavimentos, e a
 * legenda das colunas. É o que o executivo chama de "esquema vertical".
 *
 * ─── O QUE É UMA COLUNA ─────────────────────────────────────────────────────
 *
 * O kernel não tem "coluna": tem trecho VERTICAL (mesmo x, y nas duas pontas,
 * cotas diferentes). Os planejadores empilham esses trechos na mesma posição
 * — a coluna de água do eixo da parede, o TQ na posição do vaso de cima e a
 * ventilação por cima dele. Coluna = os trechos verticais da mesma disciplina
 * no mesmo (x, y), em qualquer pavimento. Fica de fora a DESCIDA AO PONTO
 * (vertical com uma ponta na cota de um ponto da rede ali): ela é parte do
 * ramal, não da coluna — senão cada chuveiro de sobrado viraria uma "AF".
 *
 * O nome sai do desenho INTEIRO (AF-1, AF-2… por x e depois y), e a planta de
 * cada pavimento recebe o mesmo nome: a prancha do 2º andar diz "AF-2" e o
 * esquema também.
 */
import type { BlueprintModel, DisciplinaDeRede, ObjectId } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA, ROTULO_DA_DISCIPLINA } from './blueprintRede';
import { DISCIPLINAS_DA_REDE, chaveDaColuna, type RedeDaPrancha } from './blueprintPranchaHidro';

/** E8.3: CI = coluna de incêndio (hidrantes e sprinklers). */
export type SiglaDaColuna = 'AF' | 'AQ' | 'TQ' | 'CI';

const SIGLA: Partial<Record<DisciplinaDeRede, SiglaDaColuna>> = { AGUA_FRIA: 'AF', AGUA_QUENTE: 'AQ', ESGOTO: 'TQ', INCENDIO: 'CI' };
const ORDEM: SiglaDaColuna[] = ['AF', 'AQ', 'TQ', 'CI'];
const ORIGENS_DA_COLUNA_DE_INCENDIO = new Set<string>(['BOMBA_INCENDIO', 'BOMBA_JOCKEY']);
/**
 * Até onde a vertical ainda é a descida de um ponto: o ponto fica na FACE da
 * parede e a descida no EIXO (parede de até 30 cm). Coluna de verdade nunca
 * termina na cota de um ponto — então a folga não engole coluna.
 */
const DESCIDA_AO_PONTO_MM = 200;
/** Os rótulos que o planejador de esgoto põe no tubo de queda e na ventilação. */
export const ROTULO_DO_TQ = 'TQ';
export const ROTULO_DA_VENTILACAO = 'Ventilação';

export interface SegmentoDaColuna {
  trechoId: ObjectId;
  levelId: ObjectId;
  /** Cotas ABSOLUTAS (elevação do pavimento + cota do trecho), mm; zA ≤ zB. */
  zA: number;
  zB: number;
  bitolaMm: number;
  ventilacao: boolean;
}

export interface ColunaHidro {
  /** "AF-1", "TQ-2"… */
  nome: string;
  /** "CV-2" quando o TQ tem ventilação. */
  nomeDaVentilacao: string | null;
  sigla: SiglaDaColuna;
  disciplina: DisciplinaDeRede;
  x: number;
  y: number;
  segmentos: SegmentoDaColuna[];
  /** Os pavimentos que a coluna atravessa, de baixo para cima. */
  niveis: ObjectId[];
}


export function colunasDoModelo(model: BlueprintModel): ColunaHidro[] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const ordemDoNivel = new Map([...model.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l, i) => [l.id, i]));
  const grupos = new Map<string, { disciplina: DisciplinaDeRede; x: number; y: number; segmentos: SegmentoDaColuna[] }>();
  // E8.3: a BOMBA de incêndio é a origem da coluna (o recalque sobe dela), não um ponto de consumo —
  // o tubo que sai dela até o teto é coluna, não "descida ao ponto".
  const pontos = (model.terminais ?? []).filter((t) => t.tipoHidraulico && !(t.disciplina === 'INCENDIO' && ORIGENS_DA_COLUNA_DE_INCENDIO.has(t.tipoHidraulico)));
  const teto = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm]));
  for (const t of model.trechos ?? []) {
    if (!SIGLA[t.disciplina] || Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= 1 || t.cotaAMm === t.cotaBMm) continue;
    // A DESCIDA AO PONTO — uma ponta na cota de um ponto da mesma rede ali — é ramal, não coluna.
    // Exceções: no esgoto, o que o planejador chamou de TQ ou de ventilação; na água, o que
    // chega ao teto ou ao piso do pavimento (a coluna que desce direto até o vaso do térreo
    // é coluna — atravessa a laje).
    // E8.3: no incêndio, a descida ao hidrante (ou ao sprinkler) é ramal, como a da água.
    const ds = t.disciplina === 'ESGOTO' ? ['ESGOTO'] : t.disciplina === 'INCENDIO' ? ['INCENDIO'] : ['AGUA_FRIA', 'AGUA_QUENTE'];
    const alto = Math.max(t.cotaAMm, t.cotaBMm);
    const baixo = Math.min(t.cotaAMm, t.cotaBMm);
    const daColuna =
      t.disciplina === 'ESGOTO'
        ? t.rotulo === ROTULO_DO_TQ || t.rotulo === ROTULO_DA_VENTILACAO
        : alto >= (teto.get(t.levelId) ?? Infinity) - 1 || Math.abs(baixo) <= 1;
    const descidaAoPonto = !daColuna && pontos.some(
      (p) => p.levelId === t.levelId && ds.includes(p.disciplina) && Math.hypot(p.at.x - t.a.x, p.at.y - t.a.y) <= DESCIDA_AO_PONTO_MM && (Math.abs(p.cotaMm - t.cotaAMm) < 1 || Math.abs(p.cotaMm - t.cotaBMm) < 1),
    );
    if (descidaAoPonto) continue;
    const k = chaveDaColuna(t.disciplina, t.a.x, t.a.y);
    const g = grupos.get(k) ?? { disciplina: t.disciplina, x: Math.round(t.a.x), y: Math.round(t.a.y), segmentos: [] };
    const z0 = elevacao.get(t.levelId) ?? 0;
    g.segmentos.push({
      trechoId: t.id,
      levelId: t.levelId,
      zA: z0 + Math.min(t.cotaAMm, t.cotaBMm),
      zB: z0 + Math.max(t.cotaAMm, t.cotaBMm),
      bitolaMm: t.bitolaMm,
      ventilacao: t.rotulo === ROTULO_DA_VENTILACAO,
    });
    grupos.set(k, g);
  }
  const colunas: Omit<ColunaHidro, 'nome' | 'nomeDaVentilacao'>[] = [];
  for (const g of grupos.values()) {
    const niveis = [...new Set(g.segmentos.map((s) => s.levelId))].sort((a, b) => (ordemDoNivel.get(a) ?? 0) - (ordemDoNivel.get(b) ?? 0));
    g.segmentos.sort((a, b) => a.zA - b.zA || a.zB - b.zB);
    colunas.push({ sigla: SIGLA[g.disciplina]!, disciplina: g.disciplina, x: g.x, y: g.y, segmentos: g.segmentos, niveis });
  }
  colunas.sort((a, b) => ORDEM.indexOf(a.sigla) - ORDEM.indexOf(b.sigla) || a.x - b.x || a.y - b.y);
  const contagem = new Map<SiglaDaColuna, number>();
  return colunas.map((c) => {
    const n = (contagem.get(c.sigla) ?? 0) + 1;
    contagem.set(c.sigla, n);
    return { ...c, nome: `${c.sigla}-${n}`, nomeDaVentilacao: c.segmentos.some((s) => s.ventilacao) ? `CV-${n}` : null };
  });
}

/** O nome de cada coluna pela chave da posição — o que a planta do pavimento usa. */
export function nomesDasColunas(model: BlueprintModel): Map<string, string> {
  return new Map(colunasDoModelo(model).map((c) => [chaveDaColuna(c.disciplina, c.x, c.y), c.nomeDaVentilacao ? `${c.nome} · ${c.nomeDaVentilacao}` : c.nome]));
}

const metros = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** As linhas da LEGENDA DAS COLUNAS, na ordem do esquema. */
export function linhasDaLegendaDeColunas(model: BlueprintModel, colunas: ColunaHidro[]): string[] {
  const nome = new Map(model.levels.map((l) => [l.id, l.name]));
  const linhas: string[] = [];
  for (const c of colunas) {
    const tubo = c.segmentos.filter((s) => !s.ventilacao);
    const dns = [...new Set(tubo.map((s) => s.bitolaMm))].sort((a, b) => b - a);
    const trecho = c.niveis.length > 1 ? `${nome.get(c.niveis[0])} → ${nome.get(c.niveis[c.niveis.length - 1])}` : nome.get(c.niveis[0]) ?? '';
    const papel = c.sigla === 'TQ' ? 'Tubo de queda' : c.sigla === 'CI' ? 'Coluna de incêndio' : ROTULO_DA_DISCIPLINA[c.disciplina];
    if (tubo.length) linhas.push(`${c.nome} — ${papel} · ø${dns.join('/')} mm · ${trecho}`);
    const vent = c.segmentos.filter((s) => s.ventilacao);
    if (c.nomeDaVentilacao && vent.length) {
      linhas.push(`${c.nomeDaVentilacao} — Coluna de ventilação do ${c.nome} · ø${Math.max(...vent.map((s) => s.bitolaMm))} mm · sai acima da cobertura`);
    }
  }
  return linhas;
}

const ESCALAS = [25, 50, 75, 100, 125, 200, 250] as const;
const TEXTO_MM = 1.8;
const COR = '#000000';
const COR_FRACA = '#666666';

function tracejado(d: Desenhista, x: number, y1: number, y2: number, espessuraMm: number, cor: string): void {
  const passo = 1.6;
  for (let y = y1; y < y2; y += passo * 2) d.linha(x, y, x, Math.min(y + passo, y2), { espessuraMm, cor });
}

/**
 * O ESQUEMA na caixa `(x0, y0, w, h)`: pavimentos como linhas de nível com
 * nome e cota, uma vertical por coluna (ventilação tracejada), o ø em cada
 * mudança, a saída de cada ramal e o nome no topo; a legenda das colunas à
 * direita. Só as colunas das `redes` pedidas. Devolve quantas desenhou.
 */
export function desenharEsquemaVertical(d: Desenhista, model: BlueprintModel, redes: RedeDaPrancha[], x0: number, y0: number, w: number, h: number): number {
  const ds = redes.flatMap((r) => DISCIPLINAS_DA_REDE[r]);
  const colunas = colunasDoModelo(model).filter((c) => ds.includes(c.disciplina));
  if (colunas.length === 0) {
    d.texto(x0, y0 + 4, 'Nenhuma coluna (prumada) no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    return 0;
  }
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const topo = niveis.length ? niveis[niveis.length - 1].elevationMm + niveis[niveis.length - 1].defaultHeightMm : 0;
  const zs = colunas.flatMap((c) => c.segmentos.flatMap((s) => [s.zA, s.zB]));
  const zMin = Math.min(0, ...zs) - 300;
  const zMax = Math.max(topo, ...zs) + 300;

  const larguraDaLegenda = Math.min(110, w * 0.4);
  const larguraDoEsquema = w - larguraDaLegenda - 8;
  const MARGEM_ESQ = 34; // nome e cota do pavimento
  const altura = h - 18; // nome da coluna em cima, escala embaixo
  const den = ESCALAS.find((e) => (zMax - zMin) / e <= altura) ?? Math.ceil((zMax - zMin) / altura / 50) * 50;
  const yDe = (z: number) => y0 + 10 + (zMax - z) / den;
  const passo = Math.min(28, Math.max(12, (larguraDoEsquema - MARGEM_ESQ) / colunas.length));
  const xDe = (i: number) => x0 + MARGEM_ESQ + passo * (i + 0.5);
  const xFim = x0 + MARGEM_ESQ + passo * colunas.length;

  // ── Pavimentos ───────────────────────────────────────────────────────────
  for (const n of niveis) {
    const y = yDe(n.elevationMm);
    d.linha(x0, y, xFim, y, { espessuraMm: 0.25, cor: COR_FRACA });
    d.texto(x0, y - 1.2, n.name, TEXTO_MM, COR);
    d.texto(x0, y + 2.6, metros(n.elevationMm), TEXTO_MM * 0.9, COR_FRACA);
  }
  const yTopo = yDe(topo);
  for (let x = x0; x < xFim; x += 3) d.linha(x, yTopo, Math.min(x + 1.5, xFim), yTopo, { espessuraMm: 0.2, cor: COR_FRACA });
  d.texto(x0, yTopo - 1.2, 'Cobertura', TEXTO_MM, COR);
  d.texto(x0, yTopo + 2.6, metros(topo), TEXTO_MM * 0.9, COR_FRACA);

  // ── Colunas ──────────────────────────────────────────────────────────────
  const horizontais = (model.trechos ?? []).filter((t) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= 1);
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  colunas.forEach((c, i) => {
    const x = xDe(i);
    const cor = COR_DA_DISCIPLINA[c.disciplina];
    let dnAnterior: number | null = null;
    let anterior: SegmentoDaColuna | null = null;
    for (const s of c.segmentos) {
      const espessura = c.disciplina === 'ESGOTO' ? 0.6 : 0.45;
      // A travessia da laje: entre o piso de cima e o teto de baixo o modelo não tem trecho; o tubo tem.
      if (anterior && s.zA > anterior.zB && s.zA - anterior.zB <= 300) {
        if (s.ventilacao && anterior.ventilacao) tracejado(d, x, yDe(s.zA), yDe(anterior.zB), espessura * 0.8, cor);
        else d.linha(x, yDe(s.zA), x, yDe(anterior.zB), { espessuraMm: espessura, cor });
      }
      anterior = s;
      if (s.ventilacao) tracejado(d, x, yDe(s.zB), yDe(s.zA), espessura * 0.8, cor);
      else d.linha(x, yDe(s.zB), x, yDe(s.zA), { espessuraMm: espessura, cor });
      if (s.bitolaMm !== dnAnterior && yDe(s.zA) - yDe(s.zB) >= 5) {
        d.texto(x + 1.2, (yDe(s.zA) + yDe(s.zB)) / 2, `ø${s.bitolaMm}`, TEXTO_MM * 0.9, cor);
        dnAnterior = s.bitolaMm;
      }
    }
    // A saída de cada ramal: um toco para o lado onde houver trecho horizontal nesse nó.
    const nos = new Set<number>();
    for (const t of horizontais) {
      if (t.disciplina !== c.disciplina) continue;
      const z0 = elevacao.get(t.levelId) ?? 0;
      for (const [p, cota] of [[t.a, t.cotaAMm], [t.b, t.cotaBMm]] as const) {
        const z = z0 + cota;
        // Só o nó que a coluna desenhada alcança (a descida ao ponto, fora dela, não conta).
        if (Math.hypot(p.x - c.x, p.y - c.y) < 1 && c.segmentos.some((s) => s.levelId === t.levelId && z >= s.zA - 1 && z <= s.zB + 1)) nos.add(z);
      }
    }
    for (const z of nos) {
      const y = yDe(z);
      d.linha(x, y, x + passo * 0.35, y, { espessuraMm: 0.3, cor });
      d.poligono(Array.from({ length: 10 }, (_, k) => ({ x: x + 0.55 * Math.cos((k / 10) * Math.PI * 2), y: y + 0.55 * Math.sin((k / 10) * Math.PI * 2) })), cor);
    }
    const zTopoDaColuna = Math.max(...c.segmentos.map((s) => s.zB));
    d.texto(x - 3, yDe(zTopoDaColuna) - 2, c.nome, TEXTO_MM * 1.1, COR);
    if (c.nomeDaVentilacao) d.texto(x - 3, yDe(zTopoDaColuna) - 5, c.nomeDaVentilacao, TEXTO_MM, COR_FRACA);
  });
  d.texto(x0, y0 + h - 2, `Esquema vertical · escala vertical 1:${den} · colunas sem escala na horizontal`, TEXTO_MM, COR_FRACA);

  // ── Legenda das colunas ──────────────────────────────────────────────────
  const xl = x0 + w - larguraDaLegenda;
  let yl = y0 + 10;
  d.texto(xl, yl, 'LEGENDA DAS COLUNAS', 2.4, COR);
  yl += 5;
  for (const l of linhasDaLegendaDeColunas(model, colunas)) {
    d.texto(xl, yl, l, TEXTO_MM, COR);
    yl += 3.6;
  }
  yl += 2;
  d.linha(xl, yl, xl + 8, yl, { espessuraMm: 0.45, cor: COR });
  d.texto(xl + 10, yl + 0.6, 'tubo', TEXTO_MM, COR_FRACA);
  yl += 3.6;
  tracejado(d, xl + 4, yl - 1.8, yl + 1.8, 0.4, COR);
  d.texto(xl + 10, yl + 0.6, 'ventilação', TEXTO_MM, COR_FRACA);
  yl += 3.6;
  d.poligono(Array.from({ length: 10 }, (_, k) => ({ x: xl + 4 + 0.55 * Math.cos((k / 10) * Math.PI * 2), y: yl + 0.55 * Math.sin((k / 10) * Math.PI * 2) })), COR);
  d.linha(xl + 4, yl, xl + 8, yl, { espessuraMm: 0.3, cor: COR });
  d.texto(xl + 10, yl + 0.6, 'saída de ramal no pavimento', TEXTO_MM, COR_FRACA);
  return colunas.length;
}
