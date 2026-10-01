/**
 * AS PLANTAS DE INCÊNDIO (01/10/2026, E8.1 do roadmap de incêndio).
 *
 * Por pavimento, três famílias — HIDRANTES (a rede, os hidrantes, o recalque e
 * a casa de bombas), SPRINKLERS (a rede, os sprinklers, a VGA e a chave de
 * fluxo) e PREVENTIVO (extintores, placas, luminárias, detecção e alarme) — e
 * uma folha de LEGENDA com o QUADRO-RESUMO das medidas de segurança (o da E0,
 * no formato do CBMMG). O símbolo é o técnico de prancha (`desenharSimboloDe
 * Incendio`), o número é o da planta (H-1, SPK-3, EXT-2) e a tubulação leva o
 * DN.
 *
 * Tudo derivado do desenho; o quadro-resumo, das premissas do estudo.
 */
import type { BlueprintModel, ObjectId, TipoDePontoHidraulico } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { desenharSimboloDeIncendio } from './blueprintSimbolosIncendio';
import { numeracaoDeIncendio } from './blueprintNumeracaoIncendio';
import type { ExigenciasDaEdificacao, ClassificacaoDaEdificacao } from './blueprintIncendioClassificacao';

export type FamiliaDeIncendio = 'HIDRANTES' | 'SPRINKLERS' | 'PREVENTIVO';
/** A prancha avulsa mostra tudo numa folha só. */
export type RecorteDeIncendio = FamiliaDeIncendio | 'TODAS';

export const ROTULO_DA_FAMILIA_DE_INCENDIO: Record<FamiliaDeIncendio, string> = {
  HIDRANTES: 'Hidrantes',
  SPRINKLERS: 'Chuveiros automáticos (sprinklers)',
  PREVENTIVO: 'Preventivo (extintores, sinalização, iluminação, detecção e alarme)',
};

export const FAMILIA_DO_TIPO: Partial<Record<TipoDePontoHidraulico, FamiliaDeIncendio>> = {
  HIDRANTE_SIMPLES: 'HIDRANTES',
  HIDRANTE_DUPLO: 'HIDRANTES',
  MANGOTINHO: 'HIDRANTES',
  HIDRANTE_RECALQUE: 'HIDRANTES',
  BOMBA_INCENDIO: 'HIDRANTES',
  BOMBA_JOCKEY: 'HIDRANTES',
  PRESSOSTATO: 'HIDRANTES',
  RESERVATORIO: 'HIDRANTES',
  SPRINKLER: 'SPRINKLERS',
  VGA: 'SPRINKLERS',
  CHAVE_FLUXO: 'SPRINKLERS',
  EXTINTOR: 'PREVENTIVO',
  PLACA: 'PREVENTIVO',
  LUMINARIA_EMERGENCIA: 'PREVENTIVO',
  DETECTOR_FUMACA: 'PREVENTIVO',
  DETECTOR_TEMPERATURA: 'PREVENTIVO',
  ACIONADOR_MANUAL: 'PREVENTIVO',
  AVISADOR: 'PREVENTIVO',
  CENTRAL_ALARME: 'PREVENTIVO',
  PREVENTIVO_PERSONALIZADO: 'PREVENTIVO',
};

/** As famílias com TUBO: a rede de incêndio vai nas duas. */
const COM_REDE: readonly FamiliaDeIncendio[] = ['HIDRANTES', 'SPRINKLERS'];

const COR = COR_DA_DISCIPLINA.INCENDIO;
const COR_TEXTO = '#000000';
const COR_FRACA = '#555555';
const TEXTO_MM = 1.8;
const FINA = 0.18;
const MEDIA = 0.35;
const LARGURA_MINIMA_BIFILAR_MM = 0.8;
/** O símbolo no papel: a maior medida da peça na escala, nunca menor que isto. */
const LADO_MINIMO_DO_SIMBOLO_MM = 2.6;
/** E8.2: o caminho crítico na planta. */
export const COR_DO_CAMINHO_CRITICO = '#dc2626';

const daFamilia = (tipo: TipoDePontoHidraulico | null | undefined, r: RecorteDeIncendio) => !!tipo && !!FAMILIA_DO_TIPO[tipo] && (r === 'TODAS' || FAMILIA_DO_TIPO[tipo] === r);

/** O pavimento tem o que pôr nesta prancha? (a rede conta para hidrantes; o resto, pela família das peças) */
export function temIncendioNoPavimento(model: BlueprintModel, levelId: ObjectId, familia: FamiliaDeIncendio): boolean {
  const pecas = (model.terminais ?? []).filter((t) => t.levelId === levelId && t.disciplina === 'INCENDIO');
  if (pecas.some((t) => FAMILIA_DO_TIPO[t.tipoHidraulico!] === familia)) return true;
  // Pavimento só com tubo (passagem da coluna): vai na de hidrantes, para a coluna não sumir — mas não
  // quando o tubo é dos sprinklers do pavimento (a folha de hidrantes sairia só com a rede deles; o
  // harness `prancha-incendio` pegou essa folha a mais).
  if (familia !== 'HIDRANTES') return false;
  const temSprinkler = pecas.some((t) => FAMILIA_DO_TIPO[t.tipoHidraulico!] === 'SPRINKLERS');
  return !temSprinkler && (model.trechos ?? []).some((t) => t.levelId === levelId && t.disciplina === 'INCENDIO');
}

/**
 * Desenha a família por cima da planta. `proj` leva mm do modelo a mm do papel.
 * `numeros` = a numeração do desenho INTEIRO (o pavimento recortado numeraria
 * H-1 em pranchas diferentes) — ausente, calcula no modelo recebido.
 */
export function desenharIncendio(
  d: Desenhista,
  model: BlueprintModel,
  proj: { px: (x: number) => number; py: (y: number) => number },
  recorte: RecorteDeIncendio,
  denominador: number,
  levelId: ObjectId | null,
  numeros: ReadonlyMap<ObjectId, { numero: string }> = numeracaoDeIncendio(model),
  /** E8.2: os trechos do CAMINHO CRÍTICO (fonte → peça mais desfavorável), em destaque. */
  destaque: ReadonlySet<ObjectId> = new Set(),
): void {
  const { px, py } = proj;
  if (recorte === 'TODAS' || COM_REDE.includes(recorte)) {
    for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'INCENDIO' && (!levelId || x.levelId === levelId))) {
      const a = { x: px(t.a.x), y: py(t.a.y) };
      const b = { x: px(t.b.x), y: py(t.b.y) };
      if (Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) < 1) {
        // A coluna: o círculo do diâmetro com o DN.
        const r = Math.max(t.bitolaMm / denominador / 2, 0.8);
        const pts = Array.from({ length: 20 }, (_, i) => ({ x: a.x + r * Math.cos((i / 20) * 2 * Math.PI), y: a.y + r * Math.sin((i / 20) * 2 * Math.PI) }));
        d.poligono(pts, '#ffffff');
        pts.forEach((p, i) => d.linha(p.x, p.y, pts[(i + 1) % 20].x, pts[(i + 1) % 20].y, { espessuraMm: FINA, cor: COR }));
        d.texto(a.x + r + 0.6, a.y + r + 2.2, `DN ${t.bitolaMm}`, TEXTO_MM, COR);
        continue;
      }
      const largura = t.bitolaMm / denominador;
      if (destaque.has(t.id)) {
        // O caminho crítico: um traço grosso vermelho por baixo do tubo.
        d.linha(a.x, a.y, b.x, b.y, { espessuraMm: Math.max(largura, 0.8) + 0.8, cor: COR_DO_CAMINHO_CRITICO });
      }
      if (largura >= LARGURA_MINIMA_BIFILAR_MM) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const n = Math.hypot(dx, dy) || 1;
        const ox = (-dy / n) * (largura / 2);
        const oy = (dx / n) * (largura / 2);
        d.linha(a.x + ox, a.y + oy, b.x + ox, b.y + oy, { espessuraMm: FINA, cor: COR });
        d.linha(a.x - ox, a.y - oy, b.x - ox, b.y - oy, { espessuraMm: FINA, cor: COR });
      } else {
        d.linha(a.x, a.y, b.x, b.y, { espessuraMm: MEDIA, cor: COR });
      }
      if (Math.hypot(b.x - a.x, b.y - a.y) >= 12) d.texto((a.x + b.x) / 2 + 0.6, (a.y + b.y) / 2 - 0.8, `DN ${t.bitolaMm}`, TEXTO_MM, COR);
    }
  }
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'INCENDIO' || !daFamilia(t.tipoHidraulico, recorte) || (levelId && t.levelId !== levelId)) continue;
    const ficha = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!];
    const medida = Math.max(t.larguraMm ?? ficha.medidasMm?.larguraMm ?? 0, t.profundidadeMm ?? ficha.medidasMm?.profundidadeMm ?? 0);
    const lado = Math.max(medida / denominador, LADO_MINIMO_DO_SIMBOLO_MM);
    const c = { x: px(t.at.x), y: py(t.at.y) };
    desenharSimboloDeIncendio(d, t.tipoHidraulico!, c.x, c.y, lado, { espessuraMm: FINA, cor: COR }, t.posicaoSprinkler);
    const numero = numeros.get(t.id)?.numero ?? ficha.sigla;
    const extra = t.tipoHidraulico === 'PLACA' && t.codigoPlaca ? ` (${t.codigoPlaca})` : '';
    d.texto(c.x + lado / 2 + 0.5, c.y - lado / 2 - 0.3, `${numero}${extra}`, TEXTO_MM, COR_TEXTO);
  }
}

// ─── A legenda e o quadro-resumo ─────────────────────────────────────────────

export interface ItemDaLegendaDeIncendio {
  familia: FamiliaDeIncendio;
  tipo: TipoDePontoHidraulico;
  texto: string;
  quantidade: number;
}

/** Só o que existe no desenho, por família, com a quantidade. */
export function itensDaLegendaDeIncendio(model: BlueprintModel): ItemDaLegendaDeIncendio[] {
  const conta = new Map<TipoDePontoHidraulico, number>();
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'INCENDIO' || !t.tipoHidraulico || !FAMILIA_DO_TIPO[t.tipoHidraulico]) continue;
    conta.set(t.tipoHidraulico, (conta.get(t.tipoHidraulico) ?? 0) + 1);
  }
  const ordem = Object.keys(FAMILIA_DO_TIPO) as TipoDePontoHidraulico[];
  return [...conta]
    .sort(([a], [b]) => ordem.indexOf(a) - ordem.indexOf(b))
    .map(([tipo, quantidade]) => {
      const f = FICHA_DO_PONTO_HIDRAULICO[tipo];
      return { familia: FAMILIA_DO_TIPO[tipo]!, tipo, texto: `${f.sigla} — ${f.rotulo}`, quantidade };
    });
}

export interface QuadroResumoDeIncendio {
  classificacao: ClassificacaoDaEdificacao;
  exigencias: ExigenciasDaEdificacao;
}

/**
 * A folha de LEGENDA DE INCÊNDIO: o quadro-resumo (classificação + medidas de
 * segurança com o estado e o motivo — o formato do CBMMG) e a legenda dos
 * símbolos com a quantidade. Devolve a altura usada.
 */
export function desenharLegendaDeIncendio(d: Desenhista, model: BlueprintModel, x0: number, y0: number, larguraMm: number, quadro: QuadroResumoDeIncendio | null): number {
  let y = y0;
  d.texto(x0, y, 'QUADRO-RESUMO DAS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO', 3.0, COR_TEXTO);
  y += 6;
  if (!quadro) {
    d.texto(x0, y, 'Classificação da edificação não informada — preencha a tarefa Incêndio do estudo.', TEXTO_MM * 1.2, '#b91c1c');
    y += 6;
  } else {
    const c = quadro.classificacao;
    const n = (v: number, k = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: k });
    const linhasDaClassificacao = [
      `Ocupação: ${c.divisao.valor ?? '—'}${c.grupo ? ` (${c.grupo.nome})` : ''}`,
      `Altura: ${n(c.altura.valorM)} m (tipo ${c.tipoPorAltura.tipo}: ${c.tipoPorAltura.nome.toLowerCase()})`,
      `Área construída: ${n(c.areaTotalM2, 0)} m² · ${c.pavimentos} pavimento(s)`,
      `Carga de incêndio: ${c.carga.valorMJm2 != null ? `${n(c.carga.valorMJm2, 0)} MJ/m² (${c.carga.nivel?.toLowerCase()})` : '—'}`,
    ];
    for (const l of linhasDaClassificacao) {
      d.texto(x0, y, l, TEXTO_MM * 1.2, COR_TEXTO);
      y += 4;
    }
    y += 2;
    const colMedida = x0;
    const colEstado = x0 + Math.min(70, larguraMm * 0.35);
    const colMotivo = colEstado + 24;
    d.texto(colMedida, y, 'Medida', TEXTO_MM * 1.1, COR_TEXTO);
    d.texto(colEstado, y, 'Exigência', TEXTO_MM * 1.1, COR_TEXTO);
    d.texto(colMotivo, y, 'Motivo', TEXTO_MM * 1.1, COR_TEXTO);
    y += 1.5;
    d.linha(x0, y, x0 + larguraMm, y, { espessuraMm: FINA, cor: COR_FRACA });
    y += 3.5;
    const ROTULO = { EXIGIDA: 'Exigida', DISPENSADA: 'Dispensada', SEM_TABELA: 'Sem tabela' } as const;
    for (const m of quadro.exigencias.medidas) {
      d.texto(colMedida, y, m.nome, TEXTO_MM, COR_TEXTO);
      d.texto(colEstado, y, ROTULO[m.estado], TEXTO_MM, m.estado === 'EXIGIDA' ? COR : COR_FRACA);
      d.texto(colMotivo, y, m.motivo.length > 90 ? `${m.motivo.slice(0, 89)}…` : m.motivo, TEXTO_MM, COR_FRACA);
      y += 3.6;
    }
    if (quadro.exigencias.temRascunho) {
      y += 1;
      d.texto(x0, y, 'Tabelas transcritas de memória — CONFERIR NA IT DO CBMMG antes de aprovar.', TEXTO_MM * 1.1, '#b91c1c');
      y += 4;
    }
  }
  y += 4;
  d.texto(x0, y, 'LEGENDA', 3.0, COR_TEXTO);
  y += 6;
  const itens = itensDaLegendaDeIncendio(model);
  if (!itens.length) {
    d.texto(x0, y, 'Nenhuma peça de incêndio no desenho.', TEXTO_MM * 1.2, COR_FRACA);
    return y + 4 - y0;
  }
  const familias: FamiliaDeIncendio[] = ['HIDRANTES', 'SPRINKLERS', 'PREVENTIVO'];
  const largura = Math.max(60, larguraMm / 3);
  let alturaMax = 0;
  familias.forEach((f, i) => {
    const x = x0 + i * largura;
    let yy = y;
    d.texto(x, yy, ROTULO_DA_FAMILIA_DE_INCENDIO[f].replace(/ \(.+\)$/, ''), TEXTO_MM * 1.2, COR_TEXTO);
    yy += 4.5;
    if (f !== 'PREVENTIVO' && (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO')) {
      d.linha(x, yy - 0.6, x + 6, yy - 0.6, { espessuraMm: MEDIA, cor: COR });
      d.texto(x + 8, yy, 'Tubulação de incêndio (DN)', TEXTO_MM, COR_TEXTO);
      yy += 4.2;
    }
    for (const it of itens.filter((z) => z.familia === f)) {
      desenharSimboloDeIncendio(d, it.tipo, x + 3, yy - 0.8, 3, { espessuraMm: FINA, cor: COR });
      d.texto(x + 8, yy, `${it.texto} (${it.quantidade})`, TEXTO_MM, COR_TEXTO);
      yy += 4.4;
    }
    alturaMax = Math.max(alturaMax, yy - y);
  });
  return y + alturaMax - y0;
}
