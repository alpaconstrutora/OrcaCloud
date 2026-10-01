/**
 * E4.4 — RECALQUE (29/09/2026, roadmap hidrossanitário).
 *
 * Com reservatório INFERIOR e SUPERIOR, a água sobe por bomba. O que o projeto
 * precisa dizer, derivado do desenho e das premissas:
 *
 *  - VAZÃO de recalque: o consumo diário em `horasDeFuncionamento` (6 h = 17 %
 *    do consumo por hora; a NBR 5626 recomenda ao menos 15 %).
 *  - DIÂMETRO pela fórmula de FORCHHEIMER: D = 1,3 · √Q · X^¼ (D em m, Q em
 *    m³/s, X = horas/24); o DN comercial imediatamente ≥ D no recalque e UM
 *    acima na sucção (a prática que afasta a cavitação).
 *  - ALTURA MANOMÉTRICA: o desnível geométrico (do fundo do inferior à chegada
 *    no superior) + as perdas na sucção e no recalque (Darcy-Weisbach e
 *    comprimentos equivalentes da Etapa 1).
 *  - POTÊNCIA: P = γ·Q·Hman / η, e o motor comercial imediatamente acima (cv).
 *
 * O lançamento põe a BOMBA ao lado do inferior voltado para o superior, a
 * SUCÇÃO do fundo dele até a bomba e o RECALQUE subindo na bomba e seguindo
 * pelas paredes (`rotaPelasParedesAte`, a 2,20 m) até a
 * chegada no superior — a torneira de boia dele, se houver, senão o alto da
 * caixa. Tudo sugerido, num lote; relançar refaz os sugeridos.
 */
import type { BlueprintModel, Command, ObjectId, Terminal } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL, G, KPA_POR_MCA, comprimentoEquivalenteM, perdaDistribuida } from './blueprintHidraulicaPressao';
import { rotaPelasParedesAte, type PontaDeRota } from './blueprintAlimentador';
import { dimensionarReservacao, type HipotesesDeReservatorio } from './blueprintReservacao';

export const ROTULO_DA_SUCCAO = 'Sucção';
export const ROTULO_DO_RECALQUE = 'Recalque';

export interface HipotesesDeRecalque {
  /** Horas de funcionamento da bomba por dia. */
  horasDeFuncionamento: number;
  /** Rendimento do conjunto motor-bomba (0–1). */
  rendimento: number;
  /** Cota em que o recalque corre pelas paredes, mm (acima das portas). */
  cotaDoPercursoMm: number;
}

export const HIPOTESES_RECALQUE_PADRAO: HipotesesDeRecalque = { horasDeFuncionamento: 6, rendimento: 0.5, cotaDoPercursoMm: 2200 };

/** Motores comerciais, cv. */
export const MOTORES_CV = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 7.5, 10] as const;
const W_POR_CV = 735.5;

export interface PlanoDoRecalque {
  inferiorId: ObjectId | null;
  superiorId: ObjectId | null;
  comandos: Command[];
  apagados: number;
  confirmados: number;
  vazaoLs: number;
  /** Diâmetro teórico de Forchheimer, mm. */
  diametroForchheimerMm: number;
  dnRecalqueMm: number;
  dnSuccaoMm: number;
  comprimentoRecalqueM: number;
  comprimentoSuccaoM: number;
  velocidadeRecalqueMs: number;
  desnivelGeometricoM: number;
  perdasMca: number;
  alturaManometricaM: number;
  potenciaCv: number;
  motorCv: number;
  avisos: string[];
  motivo: string | null;
}

type P = { x: number; y: number };
const vazio = (motivo: string | null): PlanoDoRecalque => ({
  inferiorId: null, superiorId: null, comandos: [], apagados: 0, confirmados: 0, vazaoLs: 0, diametroForchheimerMm: 0, dnRecalqueMm: 0, dnSuccaoMm: 0,
  comprimentoRecalqueM: 0, comprimentoSuccaoM: 0, velocidadeRecalqueMs: 0, desnivelGeometricoM: 0, perdasMca: 0, alturaManometricaM: 0, potenciaCv: 0, motorCv: 0,
  avisos: [], motivo,
});

/** Forchheimer: D (m) = 1,3 · √Q(m³/s) · (h/24)^¼. */
export function diametroDeForchheimerMm(vazaoLs: number, horas: number): number {
  return 1.3 * Math.sqrt(Math.max(0, vazaoLs) / 1000) * (horas / 24) ** 0.25 * 1000;
}

const comprimento = (pontas: PontaDeRota[]) => pontas.reduce((s, p) => s + Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, p.cb - p.ca) / 1000, 0);

export function planejarRecalque(model: BlueprintModel, hip: HipotesesDeRecalque, reservatorio: HipotesesDeReservatorio): PlanoDoRecalque {
  const terminais = model.terminais ?? [];
  const caixas = terminais.filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA');
  const inferior = caixas.find((c) => c.papelReservatorio === 'INFERIOR');
  const superior = caixas.find((c) => c.papelReservatorio !== 'INFERIOR');
  if (!inferior) return vazio(null); // sem inferior não há recalque — e não é pendência
  if (!superior) return vazio('Há reservatório inferior mas não há o superior para onde recalcar.');

  const medidas = FICHA_DO_PONTO_HIDRAULICO.RESERVATORIO.medidasMm!;
  const larguraInf = inferior.larguraMm ?? medidas.larguraMm;
  // A BOMBA: do lado do inferior VOLTADO para o superior, 600 mm além da parede, no
  // fundo dele (afogada). Do outro lado, o recalque voltaria por cima da sucção
  // (e o kernel acusaria a curva de 0° no nó da bomba).
  const d0 = { x: superior.at.x - inferior.at.x, y: superior.at.y - inferior.at.y };
  const n0 = Math.hypot(d0.x, d0.y);
  const u = n0 > 0 ? { x: d0.x / n0, y: d0.y / n0 } : { x: 1, y: 0 };
  const posBomba: P = { x: Math.round(inferior.at.x + u.x * (larguraInf / 2 + 600)), y: Math.round(inferior.at.y + u.y * (larguraInf / 2 + 600)) };
  const bombaExistente = terminais.find((t) => t.tipoHidraulico === 'BOMBA' && t.levelId === inferior.levelId && Math.hypot(t.at.x - inferior.at.x, t.at.y - inferior.at.y) <= larguraInf / 2 + 1500);
  const bomba: Pick<Terminal, 'at' | 'cotaMm' | 'levelId'> = bombaExistente ?? { at: posBomba, cotaMm: inferior.cotaMm, levelId: inferior.levelId };

  // A CHEGADA no superior: a boia dele, senão o alto da caixa.
  const alcance = Math.max(superior.larguraMm ?? medidas.larguraMm, superior.profundidadeMm ?? medidas.profundidadeMm) / 2 + 100;
  const boia = terminais.find((t) => t.levelId === superior.levelId && t.tipoHidraulico === 'TORNEIRA_BOIA' && Math.hypot(t.at.x - superior.at.x, t.at.y - superior.at.y) <= alcance);
  const chegada = boia ? { at: boia.at, cotaMm: boia.cotaMm } : { at: superior.at, cotaMm: superior.cotaMm + (superior.alturaMm ?? medidas.alturaMm) - 100 };
  const avisos: string[] = [];
  if (!boia) avisos.push('O superior não tem torneira de boia: o recalque chega ao alto da caixa (lance as peças da caixa).');

  // Sucção: do fundo do inferior (o nó da caixa) até a bomba, na cota do fundo.
  const succao: PontaDeRota[] = [{ levelId: inferior.levelId, a: { ...inferior.at }, b: { ...bomba.at }, ca: inferior.cotaMm, cb: bomba.cotaMm }];
  // O recalque SOBE na bomba (90° com a sucção) e corre pelas paredes acima das portas.
  const recalque = rotaPelasParedesAte(model, { levelId: bomba.levelId, at: bomba.at, cotaMm: bomba.cotaMm }, hip.cotaDoPercursoMm, { levelId: superior.levelId, at: chegada.at, cotaMm: chegada.cotaMm });
  if (!recalque) return vazio('O superior está abaixo do inferior: o recalque não é lançado automaticamente.');

  // ── Dimensionamento ────────────────────────────────────────────────────────
  const cd = dimensionarReservacao(model, reservatorio).consumoDiarioL;
  const vazaoLs = cd / (hip.horasDeFuncionamento * 3600);
  const serie = FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros.map((d) => d.dn);
  const dForch = diametroDeForchheimerMm(vazaoLs, hip.horasDeFuncionamento);
  const dnRecalqueMm = serie.find((dn) => FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros.find((d) => d.dn === dn)!.internoMm >= dForch - 1e-9) ?? serie[serie.length - 1];
  const dnSuccaoMm = serie.find((dn) => dn > dnRecalqueMm) ?? dnRecalqueMm;
  const Lr = comprimento(recalque);
  const Ls = comprimento(succao);
  // Localizadas: recalque — joelhos nas mudanças de direção, retenção e registro; sucção — entrada, joelho e registro.
  const leqR = Math.max(0, recalque.length - 1) * comprimentoEquivalenteM('JOELHO_90', dnRecalqueMm) + comprimentoEquivalenteM('VALVULA_RETENCAO', dnRecalqueMm) + comprimentoEquivalenteM('REGISTRO_GAVETA', dnRecalqueMm) + comprimentoEquivalenteM('SAIDA', dnRecalqueMm);
  const leqS = comprimentoEquivalenteM('ENTRADA', dnSuccaoMm) + comprimentoEquivalenteM('JOELHO_90', dnSuccaoMm) + comprimentoEquivalenteM('REGISTRO_GAVETA', dnSuccaoMm);
  const pr = perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dnRecalqueMm, Lr + leqR);
  const ps = perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dnSuccaoMm, Ls + leqS);
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const desnivelGeometricoM = ((elev.get(superior.levelId) ?? 0) + chegada.cotaMm - ((elev.get(inferior.levelId) ?? 0) + inferior.cotaMm)) / 1000;
  const perdasMca = pr.perdaMca + ps.perdaMca;
  const alturaManometricaM = desnivelGeometricoM + perdasMca;
  const potenciaW = (1000 * G * (vazaoLs / 1000) * alturaManometricaM) / hip.rendimento;
  const potenciaCv = potenciaW / W_POR_CV;
  const motorCv = MOTORES_CV.find((m) => m >= potenciaCv - 1e-9) ?? MOTORES_CV[MOTORES_CV.length - 1];
  if (pr.velocidadeMs > 3) avisos.push(`Velocidade no recalque de ${pr.velocidadeMs.toFixed(2).replace('.', ',')} m/s — acima de 3 m/s.`);

  // ── Comandos ───────────────────────────────────────────────────────────────
  const existentes = (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DA_SUCCAO || t.rotulo === ROTULO_DO_RECALQUE);
  const confirmados = existentes.filter((t) => !t.sugerido).length;
  const comandos: Command[] = [];
  let apagados = 0;
  if (confirmados === 0) {
    for (const t of existentes) {
      comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
      apagados++;
    }
    if (!bombaExistente) {
      comandos.push({ type: 'AddTerminal', levelId: inferior.levelId, disciplina: 'AGUA_FRIA', tipo: 'Bomba de recalque', at: posBomba, cotaMm: inferior.cotaMm, tipoHidraulico: 'BOMBA', sugerida: true });
    }
    const trecho = (p: PontaDeRota, dn: number, rotulo: string): Command => ({
      type: 'AddTrecho', levelId: p.levelId, disciplina: 'AGUA_FRIA', a: p.a, b: p.b, cotaAMm: p.ca, cotaBMm: p.cb, bitolaMm: dn, rotulo, sugerido: true,
    });
    for (const p of succao) comandos.push(trecho(p, dnSuccaoMm, ROTULO_DA_SUCCAO));
    for (const p of recalque) comandos.push(trecho(p, dnRecalqueMm, ROTULO_DO_RECALQUE));
  } else {
    avisos.push(`Sucção/recalque já têm ${confirmados} trecho(s) confirmado(s): não são relançados por cima.`);
  }

  return {
    inferiorId: inferior.id, superiorId: superior.id, comandos, apagados, confirmados, vazaoLs, diametroForchheimerMm: dForch,
    dnRecalqueMm, dnSuccaoMm, comprimentoRecalqueM: Lr, comprimentoSuccaoM: Ls, velocidadeRecalqueMs: pr.velocidadeMs,
    desnivelGeometricoM, perdasMca, alturaManometricaM, potenciaCv, motorCv, avisos, motivo: null,
  };
}

/** A altura manométrica em kPa, para quem prefere a pressão. */
export const hmanKpa = (p: PlanoDoRecalque) => p.alturaManometricaM * KPA_POR_MCA;
