/**
 * INCÊNDIO E8.3 (01/10/2026): o ISOMÉTRICO da rede de incêndio e os DETALHES
 * TÍPICOS (abrigo de hidrante, VGA, casa de bombas) da folha de detalhes.
 *
 * O isométrico do hidrossanitário é por AMBIENTE molhado (o detalhe do
 * banheiro). O de incêndio é a REDE INTEIRA — bomba, coluna, ramais e
 * hidrantes em todos os pavimentos —, que é o que o AltoQi entrega e o que o
 * analista do CBMMG lê. Mesma projeção e mesmo desenho (`desenharIsometrico`).
 *
 * Os detalhes são PARAMÉTRICOS e saem só do que o desenho TEM: o abrigo com as
 * medidas da ficha (ou as do terminal) e a mangueira das premissas; a VGA com
 * o DN dela; a casa de bombas com as bombas, a jockey e os pressostatos que
 * existem. São "detalhe típico, sem escala" — as medidas e alturas exigidas
 * são da IT do CBMMG/NBR 13714/10897 — CONFERIR NA NORMA.
 */
import type { BlueprintModel, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { conexoesDerivadas } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FAMILIA_DO_TIPO } from './blueprintPranchaIncendio';
import { numeracaoDeIncendio } from './blueprintNumeracaoIncendio';
import { ROTULO_DA_REDE, type IsometricoDePrancha } from './blueprintIsometricoPrancha';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO, type HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';

/** Acima disto os sprinklers saem sem rótulo no isométrico (a malha vira borrão de texto). */
export const SPRINKLERS_ROTULADOS_NO_ISOMETRICO = 30;

/** O isométrico da rede de incêndio INTEIRA (todos os pavimentos). `null` sem tubo de incêndio. */
export function isometricoDeIncendio(model: BlueprintModel): IsometricoDePrancha | null {
  const trechos = (model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO');
  if (trechos.length === 0) return null;
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const segmentos: IsometricoDePrancha['segmentos'] = trechos.map((t) => {
    const z0 = elevacao.get(t.levelId) ?? 0;
    return { trechoId: t.id, disciplina: t.disciplina, bitolaMm: t.bitolaMm, a: { x: t.a.x, y: t.a.y, z: z0 + t.cotaAMm }, b: { x: t.b.x, y: t.b.y, z: z0 + t.cotaBMm } };
  });
  // As peças da REDE (hidrantes, sprinklers, casa de bombas) — o preventivo não está ligado a tubo.
  const daRede = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && FAMILIA_DO_TIPO[t.tipoHidraulico] && FAMILIA_DO_TIPO[t.tipoHidraulico] !== 'PREVENTIVO');
  const sprinklers = daRede.filter((t) => t.tipoHidraulico === 'SPRINKLER').length;
  const rotulados = sprinklers > SPRINKLERS_ROTULADOS_NO_ISOMETRICO ? daRede.filter((t) => t.tipoHidraulico !== 'SPRINKLER') : daRede;
  const numeros = numeracaoDeIncendio(model);
  const ids = new Set(trechos.map((t) => t.id));
  const nos: IsometricoDePrancha['nos'] = conexoesDerivadas(model)
    .conexoes.filter((c) => c.disciplina === 'INCENDIO' && c.trechoIds.some((id) => ids.has(id)))
    .flatMap((c) => {
      // O z vem da PONTA do tubo (o nó da laje leva o levelId de baixo) — a mesma regra do isométrico do hidro.
      const estimado = (elevacao.get(c.levelId) ?? 0) + c.cotaMm;
      const pontas = segmentos
        .filter((s) => c.trechoIds.includes(s.trechoId))
        .flatMap((s) => [s.a, s.b])
        .filter((q) => Math.hypot(q.x - c.no.x, q.y - c.no.y) < 1)
        .sort((q, r) => Math.abs(q.z - estimado) - Math.abs(r.z - estimado));
      return pontas.length ? [{ p: { ...pontas[0] }, disciplina: c.disciplina, tipo: c.tipo }] : [];
    });
  const xs = segmentos.flatMap((s) => [s.a.x, s.b.x]);
  const ys = segmentos.flatMap((s) => [s.a.y, s.b.y]);
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const primeiro = niveis.find((l) => trechos.some((t) => t.levelId === l.id)) ?? niveis[0];
  return {
    chave: 'INCENDIO',
    titulo: `${ROTULO_DA_REDE.INCENDIO} — rede completa${sprinklers > SPRINKLERS_ROTULADOS_NO_ISOMETRICO ? ` (${sprinklers} sprinklers sem rótulo)` : ''}`,
    rede: 'INCENDIO',
    levelId: primeiro.id,
    recorte: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    segmentos,
    pontos: rotulados.map((t) => ({
      terminalId: t.id,
      sigla: numeros.get(t.id)?.numero ?? FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].sigla,
      cotaMm: t.cotaMm,
      p: { x: t.at.x, y: t.at.y, z: (elevacao.get(t.levelId) ?? 0) + t.cotaMm },
      disciplina: t.disciplina,
    })),
    nos,
  };
}

// ─── Detalhes típicos ────────────────────────────────────────────────────────

export type DetalheDeIncendio = 'ABRIGO' | 'VGA' | 'CASA_DE_BOMBAS';

const COR = '#000000';
const COR_FRACA = '#555555';
const COR_DA_REDE = '#ea580c';
const TEXTO_MM = 1.8;
const FINA = 0.18;
const MEDIA = 0.35;

const pecas = (model: BlueprintModel, tipos: TipoDePontoHidraulico[]) => (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && tipos.includes(t.tipoHidraulico));

/** Os detalhes que o desenho pede, na ordem da folha — só o que existe. */
export function detalhesDoModelo(model: BlueprintModel): DetalheDeIncendio[] {
  const d: DetalheDeIncendio[] = [];
  if (pecas(model, ['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO']).length) d.push('ABRIGO');
  if (pecas(model, ['VGA']).length) d.push('VGA');
  if (pecas(model, ['BOMBA_INCENDIO', 'BOMBA_JOCKEY']).length) d.push('CASA_DE_BOMBAS');
  return d;
}

/** O DN do tubo que passa pela peça (na ponta ou no meio — a VGA fica no meio do tubo), o maior se houver vários. */
function dnNoPonto(model: BlueprintModel, t: Terminal): number | null {
  const noTubo = (model.trechos ?? []).filter((r) => {
    if (r.disciplina !== 'INCENDIO' || r.levelId !== t.levelId) return false;
    const dx = r.b.x - r.a.x;
    const dy = r.b.y - r.a.y;
    const l2 = dx * dx + dy * dy;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((t.at.x - r.a.x) * dx + (t.at.y - r.a.y) * dy) / l2));
    return Math.hypot(r.a.x + dx * k - t.at.x, r.a.y + dy * k - t.at.y) < 1;
  });
  return noTubo.length ? Math.max(...noTubo.map((r) => r.bitolaMm)) : null;
}

const cm = (mm: number) => (mm / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const m2 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function circulo(d: Desenhista, cx: number, cy: number, r: number, cor = COR, espessuraMm = FINA): void {
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2;
    const a1 = ((i + 1) / 20) * Math.PI * 2;
    d.linha(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1), { espessuraMm, cor });
  }
}

/** Registro (gaveta) no tubo: a gravata — dois triângulos opostos. `vertical` = tubo em pé. */
function registro(d: Desenhista, cx: number, cy: number, s: number, vertical: boolean): void {
  const pts = vertical
    ? [[cx - s, cy - s], [cx + s, cy - s], [cx - s, cy + s], [cx + s, cy + s]]
    : [[cx - s, cy - s], [cx - s, cy + s], [cx + s, cy - s], [cx + s, cy + s]];
  const [a, b, c, e] = pts;
  d.linha(a[0], a[1], b[0], b[1], { espessuraMm: FINA, cor: COR });
  d.linha(b[0], b[1], c[0], c[1], { espessuraMm: FINA, cor: COR });
  d.linha(c[0], c[1], e[0], e[1], { espessuraMm: FINA, cor: COR });
  d.linha(e[0], e[1], a[0], a[1], { espessuraMm: FINA, cor: COR });
}

/** Retenção no tubo horizontal: o registro com uma barra no lado de saída. */
function retencao(d: Desenhista, cx: number, cy: number, s: number): void {
  registro(d, cx, cy, s, false);
  d.linha(cx + s, cy - s, cx + s, cy + s, { espessuraMm: MEDIA, cor: COR });
}

function manometro(d: Desenhista, cx: number, cy: number, r: number): void {
  circulo(d, cx, cy, r);
  d.texto(cx - r * 0.45, cy + r * 0.45, 'M', r * 1.1, COR);
}

function caixa(d: Desenhista, x: number, y: number, w: number, h: number, titulo: string): void {
  d.retangulo(x, y, w, h, { espessuraMm: FINA, cor: COR_FRACA });
  d.texto(x + 2, y + 4, titulo, 2.2, COR);
  d.texto(x + 2, y + 7, 'Detalhe típico, sem escala — medidas e alturas: CONFERIR NA IT do CBMMG', TEXTO_MM * 0.85, COR_FRACA);
}

function lista(d: Desenhista, x: number, y: number, linhas: string[]): void {
  linhas.forEach((l, i) => d.texto(x, y + i * 3.2, l, TEXTO_MM, COR));
}

/** O abrigo do hidrante (ou mangotinho), em vista: medidas da peça, válvula, mangueira e esguicho. */
export function desenharDetalheDoAbrigo(d: Desenhista, model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, x: number, y: number, w: number, h: number): void {
  const t = pecas(model, ['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO'])[0] as Terminal | undefined;
  if (!t) return;
  const tipo = t.tipoHidraulico!;
  const ficha = FICHA_DO_PONTO_HIDRAULICO[tipo];
  const L = t.larguraMm ?? ficha.medidasMm?.larguraMm ?? 900;
  const A = t.alturaMm ?? ficha.medidasMm?.alturaMm ?? 600;
  const P = t.profundidadeMm ?? ficha.medidasMm?.profundidadeMm ?? 170;
  const mangotinho = tipo === 'MANGOTINHO';
  const dMangueira = mangotinho ? hip.diametroMangueiraMangotinhoMm : hip.diametroMangueiraHidranteMm;
  const lMangueira = mangotinho ? hip.comprimentoMangueiraMangotinhoM : hip.comprimentoMangueiraHidranteM;
  const dn = dnNoPonto(model, t) ?? ficha.dnMinimoMm?.INCENDIO ?? 65;
  caixa(d, x, y, w, h, `${mangotinho ? 'MANGOTINHO' : 'ABRIGO DE HIDRANTE'} — vista frontal`);

  // A vista: piso embaixo, abrigo centrado na válvula, em escala própria.
  const larguraDoDesenho = w * 0.48;
  const alturaDoDesenho = h - 16;
  const altoMm = Math.max(t.cotaMm + A / 2 + 200, A + 400);
  const esc = Math.max(L / (larguraDoDesenho - 6), altoMm / alturaDoDesenho);
  const piso = y + 10 + alturaDoDesenho;
  const xa = x + 6;
  const ya = piso - (t.cotaMm + A / 2) / esc;
  const la = L / esc;
  const aa = A / esc;
  d.linha(x + 3, piso, x + 3 + larguraDoDesenho, piso, { espessuraMm: MEDIA, cor: COR });
  for (let k = x + 4; k < x + 3 + larguraDoDesenho; k += 2) d.linha(k, piso, k - 1.2, piso + 1.2, { espessuraMm: FINA, cor: COR_FRACA });
  d.retangulo(xa, ya, la, aa, { espessuraMm: MEDIA, cor: COR });
  // Visor de vidro com "INCÊNDIO".
  d.retangulo(xa + la * 0.08, ya + aa * 0.1, la * 0.84, aa * 0.8, { espessuraMm: FINA, cor: COR_FRACA });
  // Válvula angular à esquerda, na cota dela; mangueira aduchada; esguicho.
  const yv = piso - t.cotaMm / esc;
  d.linha(xa - 3, yv, xa + la * 0.18, yv, { espessuraMm: 0.6, cor: COR_DA_REDE });
  circulo(d, xa + la * 0.18, yv, Math.max(0.8, la * 0.04), COR);
  const rMang = Math.min(la * 0.22, aa * 0.36);
  circulo(d, xa + la * 0.55, ya + aa / 2, rMang, COR_DA_REDE, MEDIA);
  circulo(d, xa + la * 0.55, ya + aa / 2, rMang * 0.55, COR_DA_REDE, MEDIA);
  d.linha(xa + la * 0.8, ya + aa * 0.25, xa + la * 0.8, ya + aa * 0.75, { espessuraMm: 0.6, cor: COR });
  // A cota da válvula.
  d.linha(xa + la + 2, piso, xa + la + 2, yv, { espessuraMm: FINA, cor: COR_FRACA });
  d.linha(xa + la + 1, yv, xa + la + 3, yv, { espessuraMm: FINA, cor: COR_FRACA });
  d.texto(xa + la + 3, (piso + yv) / 2, `${m2(t.cotaMm)} m`, TEXTO_MM, COR);

  const n = pecas(model, [tipo]).length;
  lista(d, x + w * 0.52, y + 14, [
    `${ficha.rotulo} (${n} no desenho)`,
    `Abrigo ${cm(L)} × ${cm(A)} × ${cm(P)} cm (L × A × P)`,
    `Válvula angular DN ${dn} a ${m2(t.cotaMm)} m do piso`,
    `Mangueira ø${dMangueira} mm · ${lMangueira.toLocaleString('pt-BR')} m`,
    mangotinho ? 'Carretel com mangueira semirrígida' : 'Esguicho regulável e chave de mangueira',
    'Placa de sinalização acima do abrigo',
    'Porta com visor e a inscrição "INCÊNDIO"',
  ]);
}

/** A VGA: a montagem da válvula na entrada da rede de sprinklers, em esquema. */
export function desenharDetalheDaVga(d: Desenhista, model: BlueprintModel, x: number, y: number, w: number, h: number): void {
  const vgas = pecas(model, ['VGA']);
  if (!vgas.length) return;
  const t = vgas[0];
  const dn = dnNoPonto(model, t) ?? FICHA_DO_PONTO_HIDRAULICO.VGA.dnMinimoMm?.INCENDIO ?? 100;
  const chaves = pecas(model, ['CHAVE_FLUXO']).length;
  caixa(d, x, y, w, h, 'VÁLVULA DE GOVERNO E ALARME (VGA) — esquema');
  // O tubo em pé, de baixo (alimentação) para cima (sprinklers).
  const cx = x + w * 0.22;
  const y0 = y + h - 6;
  const y1 = y + 12;
  const passo = (y0 - y1) / 6;
  const s = Math.min(2.2, passo * 0.3);
  d.linha(cx, y0, cx, y1, { espessuraMm: 0.6, cor: COR_DA_REDE });
  d.texto(cx + 2, y0 - 0.5, 'da bomba / alimentação', TEXTO_MM * 0.9, COR_FRACA);
  d.texto(cx + 2, y1 + 1.5, 'para os sprinklers', TEXTO_MM * 0.9, COR_FRACA);
  // 1: registro de bloqueio (supervisionado)
  registro(d, cx, y0 - passo, s, true);
  // 2: manômetro a montante
  d.linha(cx, y0 - passo * 1.8, cx - 5, y0 - passo * 1.8, { espessuraMm: FINA, cor: COR });
  manometro(d, cx - 6.5, y0 - passo * 1.8, 1.5);
  // 3: a VGA
  const yv = y0 - passo * 3;
  d.poligono([{ x: cx - s * 1.4, y: yv - s * 1.4 }, { x: cx + s * 1.4, y: yv - s * 1.4 }, { x: cx + s * 1.4, y: yv + s * 1.4 }, { x: cx - s * 1.4, y: yv + s * 1.4 }], '#ffffff');
  d.retangulo(cx - s * 1.4, yv - s * 1.4, s * 2.8, s * 2.8, { espessuraMm: MEDIA, cor: COR });
  d.texto(cx - s * 1.1, yv + 0.6, 'VGA', TEXTO_MM * 0.8, COR);
  // 4: câmara de retardo e gongo hidráulico pelo lado
  d.linha(cx + s * 1.4, yv, cx + 10, yv, { espessuraMm: FINA, cor: COR });
  d.retangulo(cx + 10, yv - 1.8, 3.6, 3.6, { espessuraMm: FINA, cor: COR });
  d.linha(cx + 13.6, yv, cx + 18, yv, { espessuraMm: FINA, cor: COR });
  circulo(d, cx + 20, yv, 2);
  d.texto(cx + 19.2, yv + 0.7, 'G', TEXTO_MM, COR);
  // 5: dreno e teste
  d.linha(cx, yv + s * 2.2, cx - 8, yv + s * 2.2, { espessuraMm: FINA, cor: COR });
  registro(d, cx - 5, yv + s * 2.2, 1.2, false);
  // 6: manômetro a jusante
  d.linha(cx, y0 - passo * 4.2, cx - 5, y0 - passo * 4.2, { espessuraMm: FINA, cor: COR });
  manometro(d, cx - 6.5, y0 - passo * 4.2, 1.5);
  lista(d, x + w * 0.5, y + 14, [
    `VGA DN ${dn} (${vgas.length} no desenho)`,
    '1 · Registro de bloqueio supervisionado',
    '2 · Manômetro a montante',
    '3 · Válvula de governo e alarme',
    '4 · Câmara de retardo e gongo hidráulico (G)',
    '5 · Dreno e teste, com registro',
    '6 · Manômetro a jusante',
    chaves ? `Chave de fluxo: ${chaves} no desenho` : 'Chave de fluxo: nenhuma no desenho',
  ]);
}

/** A casa de bombas em esquema: RTI → sucção → bombas → recalque → rede, com o que o desenho tem. */
export function desenharDetalheDaCasaDeBombas(d: Desenhista, model: BlueprintModel, x: number, y: number, w: number, h: number): void {
  const principais = pecas(model, ['BOMBA_INCENDIO']);
  const jockeys = pecas(model, ['BOMBA_JOCKEY']);
  if (!principais.length && !jockeys.length) return;
  const pressostatos = pecas(model, ['PRESSOSTATO']).length;
  const comCurva = principais.filter((t) => (t.curvaBomba ?? []).length >= 2).length;
  caixa(d, x, y, w, h, 'CASA DE BOMBAS — esquema');
  const larg = w * 0.55;
  const xr = x + 4;
  const yTopo = y + 12;
  const linhas = [...principais.map(() => 'BI'), ...jockeys.map(() => 'BJ')].slice(0, 4);
  const altura = h - 18;
  const passo = altura / Math.max(linhas.length, 1);
  // A RTI à esquerda, da altura das bombas.
  d.retangulo(xr, yTopo, 10, altura, { espessuraMm: MEDIA, cor: COR });
  d.texto(xr + 2, yTopo + altura / 2, 'RTI', TEXTO_MM * 1.1, COR);
  const xBarrilete = xr + larg - 8;
  linhas.forEach((sigla, i) => {
    const yl = yTopo + passo * (i + 0.5);
    d.linha(xr + 10, yl, xBarrilete, yl, { espessuraMm: sigla === 'BI' ? 0.6 : 0.4, cor: COR_DA_REDE });
    registro(d, xr + 15, yl, 1.3, false);
    const xb = xr + 10 + (larg - 18) * 0.45;
    circulo(d, xb, yl, 2.6, COR, MEDIA);
    d.texto(xb - 1.8, yl + 0.7, sigla, TEXTO_MM, COR);
    retencao(d, xb + 7, yl, 1.3);
    registro(d, xb + 12, yl, 1.3, false);
  });
  // O barrilete e a saída para a rede.
  const yA = yTopo + passo * 0.5;
  const yB = yTopo + passo * (linhas.length - 0.5);
  d.linha(xBarrilete, yA, xBarrilete, yB, { espessuraMm: 0.6, cor: COR_DA_REDE });
  d.linha(xBarrilete, yA, xBarrilete + 6, yA, { espessuraMm: 0.6, cor: COR_DA_REDE });
  d.texto(xBarrilete + 1, yA - 1.5, 'rede', TEXTO_MM * 0.9, COR_FRACA);
  if (pressostatos) {
    d.linha(xBarrilete, yB, xBarrilete + 4, yB + 3, { espessuraMm: FINA, cor: COR });
    d.texto(xBarrilete + 4.5, yB + 3.6, 'PS', TEXTO_MM, COR);
  }
  manometro(d, xBarrilete + 3.5, (yA + yB) / 2 + 0.01, 1.5);
  lista(d, x + w * 0.6, y + 14, [
    `Bomba principal (BI): ${principais.length}${comCurva ? ` · ${comCurva} com curva` : ''}`,
    `Bomba jockey (BJ): ${jockeys.length}`,
    `Pressostatos (PS): ${pressostatos}`,
    'Sucção com registro; recalque com',
    'retenção e registro; manômetro',
    'no barrilete',
    'Ponto de operação: folha de pressões',
  ]);
}

/**
 * Os detalhes típicos numa faixa do papel, lado a lado. Devolve quantos
 * desenhou (0 = o desenho não tem abrigo, VGA nem bomba).
 */
export function desenharDetalhesDeIncendio(d: Desenhista, model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio | undefined, x: number, y: number, w: number, h: number): number {
  const lista = detalhesDoModelo(model);
  if (!lista.length) return 0;
  const GAP = 3;
  const cw = (w - GAP * (lista.length - 1)) / lista.length;
  lista.forEach((det, i) => {
    const xi = x + i * (cw + GAP);
    if (det === 'ABRIGO') desenharDetalheDoAbrigo(d, model, hip ?? HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO, xi, y, cw, h);
    else if (det === 'VGA') desenharDetalheDaVga(d, model, xi, y, cw, h);
    else desenharDetalheDaCasaDeBombas(d, model, xi, y, cw, h);
  });
  return lista.length;
}
