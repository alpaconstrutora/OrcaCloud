/**
 * A PLANTA DE CLIMATIZAÇÃO (07/10/2026, E8.1 do roadmap de climatização).
 *
 * Uma por pavimento (a de incêndio separa em famílias; aqui linha, dreno e duto
 * convivem numa folha, cada um com a cor e o traço da disciplina): a linha
 * frigorígena com os dois diâmetros (líquido/sucção), o dreno com o DN, o duto
 * bifilar com Ø ou L×A, e cada peça com o SÍMBOLO de prancha
 * (`desenharSimboloDeClimatizacao`), o NÚMERO do desenho (EV-1, CD-2, DF-3) e a
 * TAG da capacidade (BTU/h) ou da vazão (m³/h) quando declarada. A folha de
 * LEGENDA traz o quadro-resumo (equipamentos e capacidade instalada por
 * pavimento) e os símbolos que existem no desenho, com a quantidade.
 *
 * Tudo derivado do desenho; nada é gravado.
 */
import type { BlueprintModel, DisciplinaDeRede, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO, TIPOS_DE_CONDENSADORA, TIPOS_DE_EVAPORADORA } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { desenharSimboloDeClimatizacao } from './blueprintSimbolosClimatizacao';
import { numeracaoDeClimatizacao } from './blueprintNumeracaoClimatizacao';

/** As disciplinas da climatização na prancha. */
export const DISCIPLINAS_DA_CLIMATIZACAO: readonly DisciplinaDeRede[] = ['FRIGORIGENA', 'DRENO_AC', 'MECANICA'];

const COR_TEXTO = '#000000';
const COR_FRACA = '#555555';
const COR_EQUIPAMENTO = COR_DA_DISCIPLINA.FRIGORIGENA;
const TEXTO_MM = 1.8;
const FINA = 0.18;
const MEDIA = 0.35;
const LARGURA_MINIMA_BIFILAR_MM = 0.8;
const LADO_MINIMO_DO_SIMBOLO_MM = 2.6;

const ehDaClimatizacao = (t: Pick<Terminal, 'tipoHidraulico'>) => !!t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico);
const n0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/** O rótulo do trecho na prancha: Ø líquido/sucção na linha, DN no dreno, Ø ou L×A no duto. */
export function rotuloDoTrechoDeClimatizacao(t: { disciplina: DisciplinaDeRede; bitolaMm: number; bitolaSuccaoMm?: number | null; alturaDutoMm?: number | null }): string {
  if (t.disciplina === 'FRIGORIGENA') return `Ø${t.bitolaMm}/${t.bitolaSuccaoMm ?? t.bitolaMm}`;
  if (t.disciplina === 'DRENO_AC') return `DN ${t.bitolaMm}`;
  return t.alturaDutoMm != null ? `${t.bitolaMm}×${t.alturaDutoMm}` : `Ø${t.bitolaMm}`;
}

/** A tag da peça: o número do desenho e, quando declaradas, a capacidade e a vazão. */
export function tagDaPecaDeClimatizacao(t: Terminal, numeros: ReadonlyMap<ObjectId, { numero: string }>): string {
  const numero = numeros.get(t.id)?.numero ?? FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].sigla;
  const partes = [numero];
  if (t.capacidadeBtuH != null) partes.push(`${n0(t.capacidadeBtuH)} BTU/h`);
  if (t.vazaoM3h != null) partes.push(`${n0(t.vazaoM3h)} m³/h`);
  return partes.join(' · ');
}

/** O pavimento tem o que pôr na planta de climatização? (trecho de linha/dreno/duto ou peça de climatização) */
export function temClimatizacaoNoPavimento(model: BlueprintModel, levelId: ObjectId): boolean {
  return (
    (model.trechos ?? []).some((t) => t.levelId === levelId && DISCIPLINAS_DA_CLIMATIZACAO.includes(t.disciplina)) ||
    (model.terminais ?? []).some((t) => t.levelId === levelId && ehDaClimatizacao(t))
  );
}

/**
 * Desenha a climatização por cima da planta. `proj` leva mm do modelo a mm do
 * papel; `numeros` = a numeração do desenho INTEIRO (o pavimento recortado
 * numeraria EV-1 em pranchas diferentes) — ausente, calcula no modelo recebido.
 */
export function desenharClimatizacao(
  d: Desenhista,
  model: BlueprintModel,
  proj: { px: (x: number) => number; py: (y: number) => number },
  denominador: number,
  levelId: ObjectId | null,
  numeros: ReadonlyMap<ObjectId, { numero: string }> = numeracaoDeClimatizacao(model),
): void {
  const { px, py } = proj;
  // As ETIQUETAS fogem umas das outras e dos símbolos (o harness da E8.1 pegou a tag da condensadora por
  // cima da da evaporadora: o split nasce com as duas peças coladas, uma de cada lado da parede).
  const ocupadas: Caixa[] = [];
  const etiquetas: { candidatos: P[]; texto: string; cor: string }[] = [];
  // O nome e a área do ambiente (a planta escreve no centroide do contorno, 2,2 mm) também ocupam lugar.
  for (const sp of model.spaces) {
    if (levelId && sp.levelId !== levelId) continue;
    const cx = px(sp.ring.reduce((soma, q) => soma + q.x, 0) / sp.ring.length);
    const cy = py(sp.ring.reduce((soma, q) => soma + q.y, 0) / sp.ring.length);
    ocupadas.push({ x0: cx, y0: cy - 2.2, x1: cx + Math.max((sp.name ?? '').length * 2.2 * 0.55, 9), y1: cy + 2.2 * 1.1 });
  }
  for (const t of (model.trechos ?? []).filter((x) => DISCIPLINAS_DA_CLIMATIZACAO.includes(x.disciplina) && (!levelId || x.levelId === levelId))) {
    const cor = COR_DA_DISCIPLINA[t.disciplina];
    const a = { x: px(t.a.x), y: py(t.a.y) };
    const b = { x: px(t.b.x), y: py(t.b.y) };
    const rotulo = rotuloDoTrechoDeClimatizacao(t);
    if (Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) < 1) {
      // A prumada (subida/descida no lugar): o círculo, e o rótulo só quando passa de 1 m.
      const r = Math.max(t.bitolaMm / denominador / 2, 0.8);
      const pts = Array.from({ length: 20 }, (_, i) => ({ x: a.x + r * Math.cos((i / 20) * 2 * Math.PI), y: a.y + r * Math.sin((i / 20) * 2 * Math.PI) }));
      d.poligono(pts, '#ffffff');
      pts.forEach((p, i) => d.linha(p.x, p.y, pts[(i + 1) % 20].x, pts[(i + 1) % 20].y, { espessuraMm: FINA, cor }));
      if (Math.abs(t.cotaBMm - t.cotaAMm) >= 1000) etiquetas.push({ candidatos: [{ x: a.x + r + 0.6, y: a.y + r + 2.2 }, { x: a.x + r + 0.6, y: a.y - r - 0.6 }, { x: a.x - r - 0.6 - larguraDoTexto(rotulo), y: a.y + r + 2.2 }], texto: rotulo, cor });
      continue;
    }
    // O duto e o tubo grosso saem BIFILARES na largura real; o resto, num traço só.
    const largura = t.bitolaMm / denominador;
    if (largura >= LARGURA_MINIMA_BIFILAR_MM) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const n = Math.hypot(dx, dy) || 1;
      const ox = (-dy / n) * (largura / 2);
      const oy = (dx / n) * (largura / 2);
      d.linha(a.x + ox, a.y + oy, b.x + ox, b.y + oy, { espessuraMm: FINA, cor });
      d.linha(a.x - ox, a.y - oy, b.x - ox, b.y - oy, { espessuraMm: FINA, cor });
    } else {
      d.linha(a.x, a.y, b.x, b.y, { espessuraMm: t.disciplina === 'DRENO_AC' ? FINA : MEDIA, cor });
    }
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 12) {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      etiquetas.push({ candidatos: [{ x: m.x + 0.6, y: m.y - 0.8 }, { x: m.x + 0.6, y: m.y + TEXTO_MM + 0.8 }, { x: m.x - 0.6 - larguraDoTexto(rotulo), y: m.y - 0.8 }, { x: m.x - 0.6 - larguraDoTexto(rotulo), y: m.y + TEXTO_MM + 0.8 }], texto: rotulo, cor });
    }
  }
  const tags: typeof etiquetas = [];
  for (const t of model.terminais ?? []) {
    if (!ehDaClimatizacao(t) || (levelId && t.levelId !== levelId)) continue;
    const ficha = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!];
    const medida = Math.max(t.larguraMm ?? ficha.medidasMm?.larguraMm ?? 0, t.profundidadeMm ?? ficha.medidasMm?.profundidadeMm ?? 0);
    const lado = Math.max(medida / denominador, LADO_MINIMO_DO_SIMBOLO_MM);
    const c = { x: px(t.at.x), y: py(t.at.y) };
    desenharSimboloDeClimatizacao(d, t.tipoHidraulico!, c.x, c.y, lado, { espessuraMm: FINA, cor: COR_DA_DISCIPLINA[t.disciplina] ?? COR_EQUIPAMENTO });
    ocupadas.push({ x0: c.x - lado / 2, y0: c.y - lado / 2, x1: c.x + lado / 2, y1: c.y + lado / 2 });
    const tag = tagDaPecaDeClimatizacao(t, numeros);
    const w = larguraDoTexto(tag);
    const h = lado / 2;
    tags.push({
      candidatos: [
        { x: c.x + h + 0.5, y: c.y - h - 0.3 },
        { x: c.x + h + 0.5, y: c.y + h + TEXTO_MM + 0.3 },
        { x: c.x - h - 0.5 - w, y: c.y - h - 0.3 },
        { x: c.x - h - 0.5 - w, y: c.y + h + TEXTO_MM + 0.3 },
        { x: c.x - w / 2, y: c.y - h - 0.6 },
        { x: c.x - w / 2, y: c.y + h + TEXTO_MM + 0.6 },
      ],
      texto: tag,
      cor: COR_TEXTO,
    });
  }
  // As tags das peças antes dos rótulos das redes: o número da peça é o que mais importa achar.
  for (const e of [...tags, ...etiquetas]) {
    const p = posicaoLivre(e.candidatos, e.texto, ocupadas);
    ocupadas.push(caixaDoTexto(p, e.texto));
    d.texto(p.x, p.y, e.texto, TEXTO_MM, e.cor);
  }
}

interface P {
  x: number;
  y: number;
}
interface Caixa {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** Largura aproximada do texto em Helvetica no tamanho da prancha (mm de papel). */
const larguraDoTexto = (texto: string) => texto.length * TEXTO_MM * 0.55;
const caixaDoTexto = (p: P, texto: string): Caixa => ({ x0: p.x, y0: p.y - TEXTO_MM, x1: p.x + larguraDoTexto(texto), y1: p.y + TEXTO_MM * 0.25 });
const colide = (a: Caixa, b: Caixa) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** O primeiro candidato que não cobre nada já posto; sem nenhum livre, o primeiro empurrado para baixo até sair. */
export function posicaoLivre(candidatos: readonly P[], texto: string, ocupadas: readonly Caixa[]): P {
  for (const c of candidatos) if (!ocupadas.some((o) => colide(caixaDoTexto(c, texto), o))) return c;
  for (let k = 1; k <= 8; k++) {
    const c = { x: candidatos[0].x, y: candidatos[0].y + k * TEXTO_MM * 1.3 };
    if (!ocupadas.some((o) => colide(caixaDoTexto(c, texto), o))) return c;
  }
  return candidatos[0];
}

// ─── A legenda e o quadro-resumo ─────────────────────────────────────────────

export interface ItemDaLegendaDeClimatizacao {
  tipo: TipoDePontoHidraulico;
  texto: string;
  quantidade: number;
}

/** Só o que existe no desenho, na ordem da taxonomia, com a quantidade. */
export function itensDaLegendaDeClimatizacao(model: BlueprintModel): ItemDaLegendaDeClimatizacao[] {
  const conta = new Map<TipoDePontoHidraulico, number>();
  for (const t of model.terminais ?? []) if (ehDaClimatizacao(t)) conta.set(t.tipoHidraulico!, (conta.get(t.tipoHidraulico!) ?? 0) + 1);
  const ordem = TIPOS_DE_CLIMATIZACAO as readonly TipoDePontoHidraulico[];
  return [...conta]
    .sort(([a], [b]) => ordem.indexOf(a) - ordem.indexOf(b))
    .map(([tipo, quantidade]) => ({ tipo, texto: `${FICHA_DO_PONTO_HIDRAULICO[tipo].sigla} — ${FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo}`, quantidade }));
}

export interface LinhaDoResumoDeClimatizacao {
  levelId: ObjectId;
  pavimento: string;
  evaporadoras: number;
  condensadoras: number;
  /** Soma das capacidades DECLARADAS das evaporadoras; `null` se alguma não declarou. */
  capacidadeBtuH: number | null;
}

/** O quadro-resumo: por pavimento, quantas unidades e quanto de capacidade instalada. */
export function resumoDaClimatizacao(model: BlueprintModel): LinhaDoResumoDeClimatizacao[] {
  const ehEv = (t: Terminal) => !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico);
  const ehCd = (t: Terminal) => !!t.tipoHidraulico && (TIPOS_DE_CONDENSADORA as readonly string[]).includes(t.tipoHidraulico);
  return [...model.levels]
    .sort((a, b) => a.elevationMm - b.elevationMm)
    .map((l) => {
      const doNivel = (model.terminais ?? []).filter((t) => t.levelId === l.id);
      const evs = doNivel.filter(ehEv);
      return {
        levelId: l.id,
        pavimento: l.name,
        evaporadoras: evs.length,
        condensadoras: doNivel.filter(ehCd).length,
        capacidadeBtuH: evs.some((e) => e.capacidadeBtuH == null) ? null : evs.reduce((acc, e) => acc + (e.capacidadeBtuH ?? 0), 0),
      };
    })
    .filter((r) => r.evaporadoras + r.condensadoras > 0);
}

const ROTULO_DA_LINHA_DA_LEGENDA: Partial<Record<DisciplinaDeRede, string>> = {
  FRIGORIGENA: 'Linha frigorígena (Ø líquido/sucção, mm)',
  DRENO_AC: 'Dreno de condensado (DN, mm)',
  MECANICA: 'Duto de ar (Ø ou largura × altura, mm)',
};

/**
 * A folha de LEGENDA DA CLIMATIZAÇÃO: o quadro-resumo (unidades e capacidade
 * instalada por pavimento) e a legenda — os traços das três redes que existem e
 * os símbolos das peças, com a quantidade. Devolve a altura usada.
 */
export function desenharLegendaDeClimatizacao(d: Desenhista, model: BlueprintModel, x0: number, y0: number, larguraMm: number): number {
  let y = y0;
  d.texto(x0, y, 'QUADRO-RESUMO DA CLIMATIZAÇÃO', 3.0, COR_TEXTO);
  y += 6;
  const resumo = resumoDaClimatizacao(model);
  if (!resumo.length) {
    d.texto(x0, y, 'Nenhum equipamento de climatização no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    y += 6;
  } else {
    const col = [x0, x0 + Math.min(60, larguraMm * 0.3), x0 + Math.min(90, larguraMm * 0.45), x0 + Math.min(120, larguraMm * 0.6)];
    ['Pavimento', 'Evaporadoras', 'Condensadoras', 'Capacidade instalada'].forEach((h, i) => d.texto(col[i], y, h, TEXTO_MM * 1.1, COR_TEXTO));
    y += 1.5;
    d.linha(x0, y, x0 + larguraMm, y, { espessuraMm: FINA, cor: COR_FRACA });
    y += 3.5;
    for (const r of resumo) {
      d.texto(col[0], y, r.pavimento, TEXTO_MM, COR_TEXTO);
      d.texto(col[1], y, String(r.evaporadoras), TEXTO_MM, COR_TEXTO);
      d.texto(col[2], y, String(r.condensadoras), TEXTO_MM, COR_TEXTO);
      d.texto(col[3], y, r.capacidadeBtuH == null ? 'capacidade não declarada' : `${n0(r.capacidadeBtuH)} BTU/h`, TEXTO_MM, r.capacidadeBtuH == null ? '#b91c1c' : COR_TEXTO);
      y += 3.6;
    }
  }
  y += 4;
  d.texto(x0, y, 'LEGENDA', 3.0, COR_TEXTO);
  y += 6;
  let linhas = 0;
  for (const disciplina of DISCIPLINAS_DA_CLIMATIZACAO) {
    if (!(model.trechos ?? []).some((t) => t.disciplina === disciplina)) continue;
    linhas++;
    d.linha(x0, y - 0.6, x0 + 6, y - 0.6, { espessuraMm: disciplina === 'DRENO_AC' ? FINA : MEDIA, cor: COR_DA_DISCIPLINA[disciplina] });
    d.texto(x0 + 8, y, ROTULO_DA_LINHA_DA_LEGENDA[disciplina]!, TEXTO_MM, COR_TEXTO);
    y += 4.2;
  }
  const itens = itensDaLegendaDeClimatizacao(model);
  if (!itens.length && linhas === 0) {
    d.texto(x0, y, 'Nenhuma peça nem rede de climatização no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    return y + 4 - y0;
  }
  // Os símbolos em duas colunas, para a folha não descer demais.
  const colunas = 2;
  const largura = Math.max(70, larguraMm / colunas);
  const porColuna = Math.ceil(itens.length / colunas) || 1;
  let alturaMax = 0;
  for (let c = 0; c < colunas; c++) {
    let yy = y;
    for (const it of itens.slice(c * porColuna, (c + 1) * porColuna)) {
      desenharSimboloDeClimatizacao(d, it.tipo, x0 + c * largura + 3, yy - 0.8, 3, { espessuraMm: FINA, cor: COR_EQUIPAMENTO });
      d.texto(x0 + c * largura + 8, yy, `${it.texto} (${it.quantidade})`, TEXTO_MM, COR_TEXTO);
      yy += 4.4;
    }
    alturaMax = Math.max(alturaMax, yy - y);
  }
  return y + alturaMax - y0;
}
