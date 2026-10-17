/**
 * CALHAS (29/09/2026, E6.2 do roadmap hidrossanitário, NBR 10844:1989 5.5).
 *
 * A calha é um trecho PLUVIAL com seção (`Trecho.secaoCalha`, kernel 0.67.0):
 * na meia-cana `bitolaMm` é o diâmetro; na retangular, a largura, com
 * `alturaCalhaMm` a altura útil.
 *
 *   - CAPACIDADE por MANNING-STRICKLER (5.5.3): Q = K·(S/n)·Rh^(2/3)·i^(1/2),
 *     K = 60 000 (Q em L/min, S em m², Rh em m, i em m/m). Meia-cana a seção
 *     cheia: S = π·D²/8, Rh = D/4 (a Tabela 3 da norma sai dela: DN 100 a
 *     0,5 % leva 130 L/min). Retangular: S = b·h, Rh = S/(b + 2h);
 *   - DECLIVIDADE mínima de 0,5 % (5.5.1), uniforme;
 *   - o LANÇAMENTO põe uma calha em cada BEIRAL de água do telhado, com o BOCAL
 *     (ralo pluvial) na ponta mais perto da caixa de areia (ou da saída
 *     pluvial) — é dali que o condutor da E6.3 desce. A menor seção comercial
 *     que leva a vazão da água; sem nenhuma, a maior com aviso;
 *   - a VERIFICAÇÃO confere toda calha do desenho (a lançada e a desenhada à
 *     mão): a vazão é a da água sob cujo beiral ela corre, na proporção do
 *     comprimento — a calha que deságua em outra não soma a de montante
 *     (simplificação declarada; o lançamento automático não faz isso).
 *
 * Os coeficientes de rugosidade são os da Tabela 2 da norma.
 */
import type { BlueprintModel, Command, ObjectId, SecaoDeCalha, Trecho } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel';
import { contribuicaoPluvial, type HipotesesPluviais } from './blueprintPluvial';

export const ROTULO_DA_CALHA = 'Calha';
export const ROTULO_DO_BOCAL = 'Bocal';
/** Declividade mínima da calha (NBR 10844, 5.5.1). */
export const DECLIVIDADE_MINIMA_DA_CALHA_PCT = 0.5;
const K_MANNING = 60_000;

/** Rugosidade de Manning por material de calha (NBR 10844, Tabela 2). */
export const RUGOSIDADE_DA_CALHA: Readonly<Record<string, { rotulo: string; n: number }>> = {
  PLASTICO_METAL: { rotulo: 'Plástico, fibrocimento, aço, metal não ferroso', n: 0.011 },
  CONCRETO_ALISADO: { rotulo: 'Ferro fundido, concreto alisado, alvenaria revestida', n: 0.012 },
  CERAMICA: { rotulo: 'Cerâmica, concreto não alisado', n: 0.013 },
  ALVENARIA: { rotulo: 'Alvenaria de tijolos não revestida', n: 0.015 },
};

/** As medidas comerciais: o diâmetro da meia-cana e a largura da retangular (altura útil = metade). */
export const MEDIDAS_DA_CALHA_MM: Readonly<Record<SecaoDeCalha, readonly number[]>> = {
  SEMICIRCULAR: [100, 125, 150, 200],
  RETANGULAR: [100, 150, 200, 250, 300, 400],
};

export interface Secao {
  secao: SecaoDeCalha;
  larguraMm: number;
  /** Só na retangular. */
  alturaMm: number | null;
}

/** Área molhada (m²) e raio hidráulico (m) da seção cheia. */
export function geometriaDaSecao(s: Secao): { areaM2: number; raioHidraulicoM: number } {
  const b = s.larguraMm / 1000;
  if (s.secao === 'SEMICIRCULAR') return { areaM2: (Math.PI * b * b) / 8, raioHidraulicoM: b / 4 };
  const h = (s.alturaMm ?? s.larguraMm / 2) / 1000;
  const area = b * h;
  return { areaM2: area, raioHidraulicoM: area / (b + 2 * h) };
}

/** A capacidade da calha por Manning, em L/min. */
export function capacidadeDaCalhaLMin(s: Secao, n: number, declividadePct: number): number {
  if (declividadePct <= 0) return 0;
  const { areaM2, raioHidraulicoM } = geometriaDaSecao(s);
  return ((K_MANNING * areaM2) / n) * raioHidraulicoM ** (2 / 3) * Math.sqrt(declividadePct / 100);
}

/** A menor seção comercial que leva `vazaoLMin`; `null` se nenhuma leva. */
export function secaoComercial(secao: SecaoDeCalha, vazaoLMin: number, n: number, declividadePct: number): Secao | null {
  for (const largura of MEDIDAS_DA_CALHA_MM[secao]) {
    const s: Secao = { secao, larguraMm: largura, alturaMm: secao === 'RETANGULAR' ? largura / 2 : null };
    if (capacidadeDaCalhaLMin(s, n, declividadePct) + 1e-9 >= vazaoLMin) return s;
  }
  return null;
}

/** A profundidade da seção (mm): o raio na meia-cana, a altura útil na retangular. */
const profundidade = (s: Secao) => (s.secao === 'SEMICIRCULAR' ? s.larguraMm / 2 : (s.alturaMm ?? s.larguraMm / 2));

export const ehCalha = (t: Pick<Trecho, 'secaoCalha'>) => t.secaoCalha != null;

// ─── A verificação ─────────────────────────────────────────────────────────

export interface CalhaVerificada {
  trechoId: ObjectId;
  levelId: ObjectId;
  secao: Secao;
  comprimentoM: number;
  declividadePct: number;
  /** A vazão que a calha leva; `null` fora de qualquer beiral ou sem intensidade. */
  vazaoLMin: number | null;
  capacidadeLMin: number;
  declividadeOk: boolean;
  /** Leva a vazão (sem vazão conhecida, só a declividade conta). */
  atende: boolean;
}

type P = { x: number; y: number };
const distAoSegmento = (p: P, a: P, b: P) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
/** A calha corre sob o beiral: as duas pontas a até 300 mm da aresta (a calha fica um pouco para fora). */
const TOLERANCIA_DO_BEIRAL_MM = 300;
/** F24: até onde da parede o beiral ainda está "sobre a casa" (o corpo dela e o encontro das águas), mm. */
const BEIRAL_SOBRE_A_PAREDE_MM = 150;
/** F24: o menor trecho de beiral livre que ainda leva calha, mm. */
const MENOR_TRECHO_DE_CALHA_MM = 500;

/**
 * F24 da casa automática (17/10/2026): o trecho do beiral que NÃO passa sobre a casa — na casa em L, o beiral de trás
 * do principal corre por cima do anexo (ali as águas se encontram; não há beiral) e a calha atravessava o cômodo dele.
 * O maior trecho livre (amostrado a cada 50 mm); `null` = nenhum com `MENOR_TRECHO_DE_CALHA_MM`.
 */
function trechoDoBeiralForaDaCasa(model: BlueprintModel, levelId: ObjectId, a: P, b: P): { a: P; b: P } | null {
  const espacos = model.spaces.filter((x) => x.levelId === levelId);
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(L / 50));
  const em = (k: number): P => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  const sobre = (q: P) =>
    espacos.some((sp) => pointInPolygon(sp.ring, { x: q.x, y: q.y })) || paredes.some((w) => distAoSegmento(q, w.a, w.b) <= w.thicknessMm / 2 + BEIRAL_SOBRE_A_PAREDE_MM);
  let melhor: [number, number] | null = null;
  let inicio: number | null = null;
  for (let k = 0; k <= n + 1; k++) {
    const livre = k <= n && !sobre(em(k));
    if (livre && inicio === null) inicio = k;
    if (!livre && inicio !== null) {
      if (!melhor || k - 1 - inicio > melhor[1] - melhor[0]) melhor = [inicio, k - 1];
      inicio = null;
    }
  }
  if (!melhor || ((melhor[1] - melhor[0]) * L) / n < MENOR_TRECHO_DE_CALHA_MM) return null;
  if (melhor[0] === 0 && melhor[1] === n) return { a, b };
  const r = (q: P): P => ({ x: Math.round(q.x), y: Math.round(q.y) });
  return { a: r(em(melhor[0])), b: r(em(melhor[1])) };
}

export function verificarCalhas(model: BlueprintModel, hip: HipotesesPluviais): CalhaVerificada[] {
  const c = contribuicaoPluvial(model, hip);
  const aguas = c.superficies.filter((s) => s.beiral);
  const n = RUGOSIDADE_DA_CALHA[hip.materialDaCalha]?.n ?? RUGOSIDADE_DA_CALHA.PLASTICO_METAL.n;
  return (model.trechos ?? [])
    .filter(ehCalha)
    .sort((x, y) => x.id.localeCompare(y.id))
    .map((t) => {
      const secao: Secao = { secao: t.secaoCalha!, larguraMm: t.bitolaMm, alturaMm: t.alturaCalhaMm ?? null };
      const plantaMm = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      const declividadePct = plantaMm > 0 ? (Math.abs(t.cotaAMm - t.cotaBMm) / plantaMm) * 100 : 0;
      const agua = aguas.find((s) => s.levelId === t.levelId && distAoSegmento(t.a, s.beiral!.a, s.beiral!.b) <= TOLERANCIA_DO_BEIRAL_MM && distAoSegmento(t.b, s.beiral!.a, s.beiral!.b) <= TOLERANCIA_DO_BEIRAL_MM);
      const beiralMm = agua ? Math.hypot(agua.beiral!.b.x - agua.beiral!.a.x, agua.beiral!.b.y - agua.beiral!.a.y) : 0;
      const vazaoLMin = agua && agua.vazaoLMin != null && beiralMm > 0 ? agua.vazaoLMin * Math.min(1, plantaMm / beiralMm) : null;
      const capacidadeLMin = capacidadeDaCalhaLMin(secao, n, declividadePct);
      const declividadeOk = declividadePct + 1e-9 >= DECLIVIDADE_MINIMA_DA_CALHA_PCT;
      return {
        trechoId: t.id,
        levelId: t.levelId,
        secao,
        comprimentoM: plantaMm / 1000,
        declividadePct,
        vazaoLMin,
        capacidadeLMin,
        declividadeOk,
        atende: declividadeOk && (vazaoLMin == null || capacidadeLMin + 1e-9 >= vazaoLMin),
      };
    });
}

// ─── O lançamento ──────────────────────────────────────────────────────────

export interface CalhaPlanejada {
  aguaId: ObjectId;
  rotulo: string;
  comprimentoM: number;
  vazaoLMin: number;
  secao: Secao;
  capacidadeLMin: number;
}

export interface PlanoDeCalhas {
  /** Por que não há o que lançar; `null` quando há. */
  motivo: string | null;
  calhas: CalhaPlanejada[];
  /** As águas que já têm calha CONFIRMADA — respeitadas. */
  jaTemCalha: number;
  apagados: number;
  avisos: string[];
  comandos: Command[];
}

export function planejarCalhas(model: BlueprintModel, hip: HipotesesPluviais): PlanoDeCalhas {
  const c = contribuicaoPluvial(model, hip);
  const vazio = (motivo: string): PlanoDeCalhas => ({ motivo, calhas: [], jaTemCalha: 0, apagados: 0, avisos: [], comandos: [] });
  const aguas = c.superficies.filter((s) => s.beiral);
  if (aguas.length === 0) return vazio('Desenhe o telhado (as águas, com o beiral) — a calha corre no beiral.');
  if (c.intensidadeMmH == null) return vazio(c.pendencias[0] ?? 'Sem intensidade pluviométrica.');
  const n = RUGOSIDADE_DA_CALHA[hip.materialDaCalha]?.n ?? RUGOSIDADE_DA_CALHA.PLASTICO_METAL.n;
  const i = Math.max(DECLIVIDADE_MINIMA_DA_CALHA_PCT, hip.declividadeDaCalhaPct);

  // Relançar: as calhas e os bocais SUGERIDOS saem; os confirmados ficam, e a água deles também.
  const comandos: Command[] = [];
  const trechos = model.trechos ?? [];
  const sugeridas = trechos.filter((t) => ehCalha(t) && t.sugerido);
  const bocaisSugeridos = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RALO_PLUVIAL' && t.sugerida && t.rotulo === ROTULO_DO_BOCAL);
  for (const t of sugeridas) comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
  for (const t of bocaisSugeridos) comandos.push({ type: 'DeleteTerminal', terminalId: t.id });
  const confirmadas = trechos.filter((t) => ehCalha(t) && !t.sugerido);
  const temCalhaConfirmada = (s: (typeof aguas)[number]) =>
    confirmadas.some((t) => t.levelId === s.levelId && distAoSegmento(t.a, s.beiral!.a, s.beiral!.b) <= TOLERANCIA_DO_BEIRAL_MM && distAoSegmento(t.b, s.beiral!.a, s.beiral!.b) <= TOLERANCIA_DO_BEIRAL_MM);

  // Para onde a água vai: a caixa de areia ou a saída pluvial mais perto do bocal.
  const destinos = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'CAIXA_AREIA' || t.tipoHidraulico === 'LIGACAO_PLUVIAL');
  const pertoDeDestino = (p: P) => (destinos.length === 0 ? 0 : Math.min(...destinos.map((d) => Math.hypot(d.at.x - p.x, d.at.y - p.y))));

  const aguaPorId = new Map((model.roofs ?? []).map((a) => [a.id, a]));
  const calhas: CalhaPlanejada[] = [];
  const avisos: string[] = [];
  let jaTemCalha = 0;
  for (const s of aguas) {
    if (temCalhaConfirmada(s)) {
      jaTemCalha++;
      continue;
    }
    const agua = aguaPorId.get(s.id)!;
    const livre = trechoDoBeiralForaDaCasa(model, s.levelId, s.beiral!.a, s.beiral!.b);
    if (!livre) {
      avisos.push(`${s.rotulo}: o beiral inteiro passa sobre a casa (o encontro com outra água) — sem calha; confira o rufo`);
      continue;
    }
    const { a, b } = livre;
    // O bocal na ponta mais perto do destino (empate, ou sem destino: a segunda ponta do beiral).
    const [alto, bocal] = pertoDeDestino(a) < pertoDeDestino(b) ? [b, a] : [a, b];
    const Q = s.vazaoLMin!;
    let secao = secaoComercial(hip.secaoDaCalha, Q, n, i);
    if (!secao) {
      const maior = MEDIDAS_DA_CALHA_MM[hip.secaoDaCalha][MEDIDAS_DA_CALHA_MM[hip.secaoDaCalha].length - 1];
      secao = { secao: hip.secaoDaCalha, larguraMm: maior, alturaMm: hip.secaoDaCalha === 'RETANGULAR' ? maior / 2 : null };
      avisos.push(`${s.rotulo}: ${Math.round(Q)} L/min passa da maior calha — divida o beiral em dois bocais ou aumente a declividade`);
    }
    const Lmm = Math.hypot(b.x - a.x, b.y - a.y);
    const cotaAlta = agua.baseMm - Math.round(profundidade(secao) / 2);
    const cotaBaixa = cotaAlta - Math.ceil((Lmm * i) / 100);
    comandos.push({
      type: 'AddTrecho', levelId: s.levelId, disciplina: 'PLUVIAL', a: { x: alto.x, y: alto.y }, b: { x: bocal.x, y: bocal.y },
      cotaAMm: cotaAlta, cotaBMm: cotaBaixa, bitolaMm: secao.larguraMm, rotulo: ROTULO_DA_CALHA,
      secaoCalha: secao.secao, ...(secao.alturaMm != null ? { alturaCalhaMm: secao.alturaMm } : {}), sugerido: true,
    });
    comandos.push({ type: 'AddTerminal', levelId: s.levelId, disciplina: 'PLUVIAL', tipo: ROTULO_DO_BOCAL, at: { x: bocal.x, y: bocal.y }, cotaMm: cotaBaixa, tipoHidraulico: 'RALO_PLUVIAL', rotulo: ROTULO_DO_BOCAL, sugerida: true });
    calhas.push({ aguaId: s.id, rotulo: s.rotulo, comprimentoM: Lmm / 1000, vazaoLMin: Q, secao, capacidadeLMin: capacidadeDaCalhaLMin(secao, n, i) });
  }
  return {
    motivo: calhas.length === 0 && jaTemCalha > 0 ? 'Toda água do telhado já tem calha confirmada.' : null,
    calhas,
    jaTemCalha,
    apagados: sugeridas.length,
    avisos,
    comandos: calhas.length === 0 && sugeridas.length === 0 && bocaisSugeridos.length === 0 ? [] : comandos,
  };
}

/** O nome da linha de compra da calha (quantitativo, planilha): a seção e a medida. */
export function nomeDaCalha(secao: string, larguraMm: number): string {
  return secao === 'SEMICIRCULAR' ? `Calha meia-cana ø${larguraMm}` : `Calha retangular ${larguraMm} mm de largura`;
}
