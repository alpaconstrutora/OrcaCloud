/**
 * E4.3 — ENTRADA DE ÁGUA E ALIMENTADOR PREDIAL (29/09/2026, roadmap
 * hidrossanitário).
 *
 * O caminho da água da RUA até a caixa: o HIDRÔMETRO geral (o cavalete, que o
 * projetista põe no limite do lote) → desce à cota enterrada → encosta na
 * parede mais próxima → corre pelas paredes do pavimento de entrada até a
 * parede sob a caixa → sobe (atravessando os pavimentos) → chega à TORNEIRA DE
 * BOIA. O destino é o reservatório INFERIOR, se houver; senão o superior.
 *
 * Dimensionamento (NBR 5626): o alimentador repõe o consumo diário em 24 h —
 * Q = CD / 86 400 s —, com a velocidade até 1 m/s e o DN mínimo da premissa.
 * E a PRESSÃO que chega à boia: a da rede pública menos o desnível, a perda
 * distribuída (Darcy-Weisbach), as localizadas (um joelho por mudança de
 * direção, o registro) e a do hidrômetro. Se não chega, o aviso diz o que
 * resolve: reservatório inferior e recalque (E4.4).
 *
 * Os trechos nascem SUGERIDOS com o rótulo "Alimentador"; relançar apaga os
 * sugeridos e refaz — o confirmado fica.
 *
 * SEM HIDRÔMETRO NO DESENHO (13/10/2026, docs/planos/2026-10-13-hidro-ancoras-automaticas.md,
 * item 5.1): antes o plano parava em "Coloque o hidrômetro…". Agora ele é
 * PROPOSTO na frente do lote (`pontoNaFrente`, a partir da caixa d'água), no
 * pavimento mais baixo, `sugerido`, na altura de cavalete da ficha acima do
 * terreno ali; o `AddTerminal` vai à frente do lote de comandos. Sem frente
 * conhecida, o motivo pede a frente.
 */
import type { BlueprintModel, Command, ObjectId, Terminal, Trecho, Wall } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL, KPA_POR_MCA, comprimentoEquivalenteM, perdaDistribuida, perdaNoHidrometroKpa } from './blueprintHidraulicaPressao';
import { arvorePelasParedes, encaixarNaParede } from './blueprintRotaPelasParedes';
import { ABAIXO_DA_VIGA_MM, CONTORNO_DO_PILAR_MM, anelDoPilar, foraDaViga, foraDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { pegadaEmPlanta, pointInPolygon } from './blueprintKernel';
import { dimensionarReservacao, type HipotesesDeReservatorio } from './blueprintReservacao';
import { applyBatch } from './blueprintKernel';
import { cotaDoTerrenoEm, pontoNaFrente, type LeitorDoTerreno, type OrigemDaFrente } from './blueprintAncorasHidro';

export const ROTULO_DO_ALIMENTADOR = 'Alimentador';

export interface HipotesesDeAlimentacao {
  /** Pressão disponível na rede pública, no cavalete, kPa. */
  pressaoDaRedePublicaKpa: number;
  /** Cota do alimentador enterrado, mm (relativa ao piso do pavimento de entrada). */
  cotaEnterradaMm: number;
  /** Velocidade máxima no alimentador, m/s. */
  velocidadeMaxMs: number;
  /** DN mínimo do alimentador, mm. */
  dnMinimoMm: number;
  /** Pressão mínima na torneira de boia, kPa. */
  pressaoMinimaNaBoiaKpa: number;
}

export const HIPOTESES_ALIMENTACAO_PADRAO: HipotesesDeAlimentacao = {
  pressaoDaRedePublicaKpa: 100,
  cotaEnterradaMm: -300,
  velocidadeMaxMs: 1,
  dnMinimoMm: 25,
  pressaoMinimaNaBoiaKpa: 10,
};

export interface PlanoDoAlimentador {
  entradaId: ObjectId | null;
  destinoId: ObjectId | null;
  destinoInferior: boolean;
  comandos: Command[];
  /** Trechos de alimentador que o plano APAGA (os sugeridos, para relançar). */
  apagados: number;
  /** Trechos confirmados que já existem (o plano não lança por cima). */
  confirmados: number;
  comprimentoM: number;
  dnMm: number;
  vazaoLs: number;
  velocidadeMs: number;
  desnivelM: number;
  perdaDistribuidaKpa: number;
  perdaLocalizadaKpa: number;
  perdaNoHidrometroKpa: number;
  pressaoNaBoiaKpa: number;
  atende: boolean;
  avisos: string[];
  motivo: string | null;
  /** Sem hidrômetro no desenho, o que o lançamento põe; o `AddTerminal` é o primeiro dos `comandos`. */
  hidrometroProposto?: { levelId: ObjectId; at: P; cotaMm: number; origem: OrigemDaFrente } | null;
}

export const MOTIVO_SEM_FRENTE_PARA_O_HIDROMETRO = 'Marque a divisa da frente do lote (a que dá para a rua): o hidrômetro vai nela, no cavalete.';

type P = { x: number; y: number };
const vazio = (motivo: string): PlanoDoAlimentador => ({
  entradaId: null, destinoId: null, destinoInferior: false, comandos: [], apagados: 0, confirmados: 0, comprimentoM: 0, dnMm: 0, vazaoLs: 0, velocidadeMs: 0,
  desnivelM: 0, perdaDistribuidaKpa: 0, perdaLocalizadaKpa: 0, perdaNoHidrometroKpa: 0, pressaoNaBoiaKpa: 0, atende: false, avisos: [], motivo,
});

export interface PontaDeRota {
  levelId: ObjectId;
  a: P;
  b: P;
  ca: number;
  cb: number;
}

/**
 * A ROTA pelas paredes (E4.3; reusada pelo recalque da E4.4): de `origem`
 * desce/sobe à `cotaDoPercurso` no pavimento dela, encosta na parede mais
 * próxima, corre pelas paredes até a parede sob o `alvo`, sobe atravessando os
 * pavimentos até a cota do alvo e vai até ele. `null` se o alvo está num
 * pavimento abaixo do da origem.
 */
export function rotaPelasParedesAte(
  model: BlueprintModel,
  origem: { levelId: ObjectId; at: P; cotaMm: number },
  cotaDoPercurso: number,
  alvo: { levelId: ObjectId; at: P; cotaMm: number },
): PontaDeRota[] | null {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const i0 = niveis.findIndex((l) => l.id === origem.levelId);
  const id = niveis.findIndex((l) => l.id === alvo.levelId);
  if (i0 < 0 || id < 0 || id < i0) return null;
  const n0 = niveis[i0];
  const nd = niveis[id];
  const paredes0: Wall[] = model.walls.filter((w) => w.levelId === n0.id);
  const pontas: PontaDeRota[] = [];
  const add = (levelId: ObjectId, a: P, ca: number, b: P, cb: number) => {
    if (a.x === b.x && a.y === b.y && ca === cb) return;
    pontas.push({ levelId, a: { ...a }, b: { ...b }, ca, cb });
  };
  add(n0.id, origem.at, origem.cotaMm, origem.at, cotaDoPercurso);
  // F8b (15/10/2026): o percurso pelas paredes CONTORNA os pilares (o anel), e as pontas que caem na parede
  // — a entrada e o pé da subida — já ficam fora do anel (senão a árvore as escorregaria e o tubo abriria).
  const pilares0 = pegadasDePilares(model, n0.id);
  const aneis0 = pilares0.map((g) => anelDoPilar(g, CONTORNO_DO_PILAR_MM));
  const naParedeDe = (p: P, raio: number) => {
    const e = encaixarNaParede(p, paredes0, raio);
    return e ? foraDoPilar(e.q, e.parede, aneis0) : null;
  };
  const sobAChegada = naParedeDe(alvo.at, 3000) ?? { ...alvo.at };
  const naParede = naParedeDe(origem.at, 1e9);
  if (naParede) {
    add(n0.id, origem.at, cotaDoPercurso, naParede, cotaDoPercurso);
    const arvore = arvorePelasParedes({ paredes: paredes0, raiz: naParede, pendentes: [sobAChegada], raioDeEncaixeMm: 50, obstaculos: pilares0, contornoDoPilarMm: CONTORNO_DO_PILAR_MM });
    for (const a of arvore.arestas) add(n0.id, a.de, cotaDoPercurso, a.para, cotaDoPercurso);
  } else {
    add(n0.id, origem.at, cotaDoPercurso, sobAChegada, cotaDoPercurso);
  }
  let pe = sobAChegada;
  if (id === i0) {
    // F8b: a subida corre DENTRO da parede até logo abaixo da viga que está sobre ela, sai para a face da
    // viga e sobe rente a ela (a caixa d'água sobre a laje) — sem furo na viga.
    const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === n0.id && s.baseMm < alvo.cotaMm && s.baseMm + s.alturaMm > cotaDoPercurso);
    const viga = vigas.find((v) => pointInPolygon(pegadaEmPlanta(v), pe));
    const rente = viga ? foraDaViga(pe, vigas, alvo.at, pilares0) : pe;
    if (viga && (rente.x !== pe.x || rente.y !== pe.y)) {
      const z = Math.max(cotaDoPercurso, Math.min(alvo.cotaMm, viga.baseMm - ABAIXO_DA_VIGA_MM));
      add(n0.id, pe, cotaDoPercurso, pe, z);
      add(n0.id, pe, z, rente, z);
      add(n0.id, rente, z, rente, alvo.cotaMm);
      pe = rente;
    } else {
      add(n0.id, pe, cotaDoPercurso, pe, alvo.cotaMm);
    }
  } else {
    add(n0.id, pe, cotaDoPercurso, pe, n0.defaultHeightMm);
    for (let k = i0 + 1; k < id; k++) add(niveis[k].id, pe, 0, pe, niveis[k].defaultHeightMm);
    add(nd.id, pe, 0, pe, alvo.cotaMm);
  }
  add(nd.id, pe, alvo.cotaMm, alvo.at, alvo.cotaMm);
  return pontas;
}

/** Sem hidrômetro: o PROPOSTO na frente do lote, e o alimentador traçado num rascunho que já o tem. */
function comHidrometroProposto(
  model: BlueprintModel,
  hip: HipotesesDeAlimentacao,
  reservatorio: HipotesesDeReservatorio,
  qMaxDoHidrometroM3h: number,
  terreno: LeitorDoTerreno | null,
  destino: Terminal,
): PlanoDoAlimentador {
  const frente = pontoNaFrente(model, destino.at);
  if (!frente) return vazio(MOTIVO_SEM_FRENTE_PARA_O_HIDROMETRO);
  // O cavalete fica no pavimento mais baixo (é a rua), na altura da ficha acima do terreno.
  const terreo = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm)[0];
  const cotaMm = cotaDoTerrenoEm(frente.ponto, terreno) - terreo.elevationMm + (FICHA_DO_PONTO_HIDRAULICO.HIDROMETRO.cotaMm.AGUA_FRIA ?? 600);
  const hidrometro: Command = {
    type: 'AddTerminal', levelId: terreo.id, disciplina: 'AGUA_FRIA', tipo: FICHA_DO_PONTO_HIDRAULICO.HIDROMETRO.rotulo,
    at: { ...frente.ponto }, cotaMm, tipoHidraulico: 'HIDROMETRO', sugerida: true,
  };
  const plano = planejarAlimentador(applyBatch(model, [hidrometro]).model, hip, reservatorio, qMaxDoHidrometroM3h, terreno);
  if (plano.motivo) return { ...plano, entradaId: null };
  return { ...plano, entradaId: null, comandos: [hidrometro, ...plano.comandos], hidrometroProposto: { levelId: terreo.id, at: { ...frente.ponto }, cotaMm, origem: frente.origem } };
}

/** `terreno`: a topografia exibida, quando há — a cota do terreno na frente para o hidrômetro PROPOSTO. */
export function planejarAlimentador(
  model: BlueprintModel,
  hip: HipotesesDeAlimentacao,
  reservatorio: HipotesesDeReservatorio,
  qMaxDoHidrometroM3h: number,
  terreno: LeitorDoTerreno | null = null,
): PlanoDoAlimentador {
  const terminais = model.terminais ?? [];
  const entrada = [...terminais].filter((t) => t.tipoHidraulico === 'HIDROMETRO' && t.disciplina === 'AGUA_FRIA').sort((a, b) => a.id.localeCompare(b.id))[0];
  const caixas = terminais.filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA');
  const destino = caixas.find((c) => c.papelReservatorio === 'INFERIOR') ?? caixas.find((c) => c.papelReservatorio !== 'INFERIOR');
  if (!destino) return vazio("Não há caixa d'água no desenho para o alimentador chegar.");
  if (!entrada) return comHidrometroProposto(model, hip, reservatorio, qMaxDoHidrometroM3h, terreno, destino);

  const nivelPorId = new Map(model.levels.map((l) => [l.id, l]));
  const n0 = nivelPorId.get(entrada.levelId)!;
  const nd = nivelPorId.get(destino.levelId)!;

  // O ALVO: a torneira de boia da caixa (E4.2), senão o alto da caixa.
  const medidas = FICHA_DO_PONTO_HIDRAULICO.RESERVATORIO.medidasMm!;
  const alcance = Math.max(destino.larguraMm ?? medidas.larguraMm, destino.profundidadeMm ?? medidas.profundidadeMm) / 2 + 100;
  const boia = terminais.find((t) => t.levelId === destino.levelId && t.tipoHidraulico === 'TORNEIRA_BOIA' && Math.hypot(t.at.x - destino.at.x, t.at.y - destino.at.y) <= alcance);
  const alvo = boia ? { at: boia.at, cotaMm: boia.cotaMm } : { at: destino.at, cotaMm: destino.cotaMm + (destino.alturaMm ?? medidas.alturaMm) - 100 };

  // O que já existe: sugerido se relança; confirmado fica.
  const existentes = (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR);
  const confirmados = existentes.filter((t) => !t.sugerido).length;
  const avisos: string[] = [];
  if (!boia) avisos.push("A caixa não tem torneira de boia: o alimentador chega ao alto dela (lance as peças da caixa).");

  // ── A ROTA ────────────────────────────────────────────────────────────────
  const rota = rotaPelasParedesAte(model, { levelId: n0.id, at: entrada.at, cotaMm: entrada.cotaMm }, hip.cotaEnterradaMm, { levelId: nd.id, at: alvo.at, cotaMm: alvo.cotaMm });
  if (!rota) return vazio('A caixa está abaixo do pavimento do hidrômetro: o alimentador não é lançado automaticamente.');
  const pontas = rota;

  // ── O DIMENSIONAMENTO ─────────────────────────────────────────────────────
  const consumoDiarioL = dimensionarReservacao(model, reservatorio).consumoDiarioL;
  const vazaoLs = consumoDiarioL / 86400;
  const serie = FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros.map((d) => d.dn).filter((dn) => dn >= hip.dnMinimoMm);
  const comprimentoM = pontas.reduce((s, p) => s + Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, p.cb - p.ca) / 1000, 0);
  const dnMm = serie.find((dn) => perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dn, 1).velocidadeMs <= hip.velocidadeMaxMs + 1e-9) ?? serie[serie.length - 1];
  const dist = perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dnMm, comprimentoM);
  // Localizadas: um joelho por mudança de direção e o registro do cavalete.
  const joelhos = Math.max(0, pontas.length - 1);
  const leq = joelhos * comprimentoEquivalenteM('JOELHO_90', dnMm) + comprimentoEquivalenteM('REGISTRO_GAVETA', dnMm);
  const loc = perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dnMm, leq);
  const perdaNoHidro = perdaNoHidrometroKpa(vazaoLs, qMaxDoHidrometroM3h);
  const desnivelM = (nd.elevationMm + alvo.cotaMm - (n0.elevationMm + entrada.cotaMm)) / 1000;
  const pressaoNaBoiaKpa = hip.pressaoDaRedePublicaKpa - desnivelM * KPA_POR_MCA - dist.perdaMca * KPA_POR_MCA - loc.perdaMca * KPA_POR_MCA - perdaNoHidro;
  const atende = pressaoNaBoiaKpa + 1e-9 >= hip.pressaoMinimaNaBoiaKpa;
  const destinoInferior = destino.papelReservatorio === 'INFERIOR';
  if (!atende) {
    avisos.push(
      destinoInferior
        ? 'A rede pública não chega ao reservatório inferior com a pressão mínima na boia — confira a pressão da concessionária.'
        : 'A rede pública não sobe até a caixa superior com a pressão mínima na boia: use reservatório INFERIOR com recalque.',
    );
  }

  const comandos: Command[] = [];
  let apagados = 0;
  if (confirmados === 0) {
    for (const t of existentes) {
      comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
      apagados++;
    }
    for (const p of pontas) {
      comandos.push({
        type: 'AddTrecho', levelId: p.levelId, disciplina: 'AGUA_FRIA', a: p.a, b: p.b, cotaAMm: p.ca, cotaBMm: p.cb,
        bitolaMm: dnMm, rotulo: ROTULO_DO_ALIMENTADOR, sugerido: true,
      });
    }
  } else {
    avisos.push(`O alimentador já tem ${confirmados} trecho(s) confirmado(s): não é relançado por cima.`);
  }

  return {
    entradaId: entrada.id, destinoId: destino.id, destinoInferior, comandos, apagados, confirmados,
    comprimentoM, dnMm, vazaoLs, velocidadeMs: dist.velocidadeMs, desnivelM,
    perdaDistribuidaKpa: dist.perdaMca * KPA_POR_MCA, perdaLocalizadaKpa: loc.perdaMca * KPA_POR_MCA, perdaNoHidrometroKpa: perdaNoHidro,
    pressaoNaBoiaKpa, atende, avisos, motivo: null,
  };
}

/** Os trechos do alimentador no desenho. */
export function trechosDoAlimentador(model: BlueprintModel): Trecho[] {
  return (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR);
}

/** O hidrômetro que é a entrada (o mesmo critério do plano). */
export function entradaDeAgua(model: BlueprintModel): Terminal | null {
  return [...(model.terminais ?? [])].filter((t) => t.tipoHidraulico === 'HIDROMETRO' && t.disciplina === 'AGUA_FRIA').sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
