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
import type { BlueprintModel, Command, ObjectId, Point, Terminal, Trecho, Wall } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL, KPA_POR_MCA, comprimentoEquivalenteM, perdaDistribuida, perdaNoHidrometroKpa } from './blueprintHidraulicaPressao';
import { arvorePelasParedes, encaixarNaParede } from './blueprintRotaPelasParedes';
import { ABAIXO_DA_VIGA_MM, CONTORNO_DO_PILAR_MM, anelDoPilar, desvioDoPilar, foraDaViga, foraDoPilar, fracaoDentro, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { cantosDaParede, pegadaEmPlanta, pointInPolygon } from './blueprintKernel';
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
  /**
   * F8c (15/10/2026): o pé da subida fica AO LADO do baldrame, com o eixo a isto da face dele. Ausente =
   * `FOLGA_DO_BALDRAME_MM` (50).
   */
  folgaDoBaldrameMm?: number;
  /** F8c: a subida entra na parede a isto acima do topo do baldrame. Ausente = `ENTRADA_NA_PAREDE_MM` (100). */
  entradaNaParedeMm?: number;
  /**
   * F17 da casa automática (16/10/2026, decisão do usuário "sobe pela fachada"): onde o alimentador SOBE. 'FACHADA' =
   * na parede mais perto do hidrômetro (a da frente): enterrado só até ela, sobe dentro dela até a cota da boia e corre
   * sobre a laje até a caixa — nunca sob o piso, não cruza o esgoto enterrado nem o baldrame. 'SOB_A_CAIXA' = na parede
   * sob a caixa, com o percurso enterrado por baixo da casa (o de antes). Ausente = 'SOB_A_CAIXA'.
   */
  subida?: 'FACHADA' | 'SOB_A_CAIXA';
}

/** F8c: o eixo do tubo que sobe ao lado do baldrame fica a isto da face dele. */
export const FOLGA_DO_BALDRAME_MM = 50;
/** F17: até esta distância do ponto da subida, a parede do pavimento de cima conta como a mesma (a subida pela fachada). */
const PAREDE_DA_SUBIDA_EM_CIMA_MM = 60;
/** F14d: a folga entre a subida do alimentador e o batente do vão, mm. */
const FOLGA_DA_SUBIDA_AO_VAO_MM = 50;
/** F8c: a subida entra na parede a isto acima do topo do baldrame. */
export const ENTRADA_NA_PAREDE_MM = 100;

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
 *
 * F8c (15/10/2026): com o percurso ENTERRADO na faixa do baldrame (a viga de fundação sob as paredes), "pelas
 * paredes" punha o tubo DENTRO dele por metros. Aí o percurso vai pelo SOLO: em reta ou em "L" (no rumo da
 * parede da subida) — a que corre menos dentro de baldrame, que fica só atravessado —, contornando pilar pelo
 * canto; o pé da subida fica ao lado do baldrame, sobe até logo acima dele e entra na parede.
 */
export function rotaPelasParedesAte(
  model: BlueprintModel,
  origem: { levelId: ObjectId; at: P; cotaMm: number },
  cotaDoPercurso: number,
  alvo: { levelId: ObjectId; at: P; cotaMm: number },
  opcoes: Pick<HipotesesDeAlimentacao, 'folgaDoBaldrameMm' | 'entradaNaParedeMm' | 'subida'> = {},
  avisos: string[] = [],
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
  // F14d: e a SUBIDA fica fora do vão de porta ou janela de todo pavimento que ela atravessa (no sobrado, subia pela
  // janela alta do banheiro de cima).
  const atravessados = new Set(niveis.slice(i0, id + 1).map((l) => l.id));
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  const vaos: Point[][] = model.openings.flatMap((o) => {
    const w = paredePorId.get(o.wallId);
    if (!w || !atravessados.has(w.levelId)) return [];
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const p0 = { x: w.a.x + u.x * (o.offsetMm - FOLGA_DA_SUBIDA_AO_VAO_MM), y: w.a.y + u.y * (o.offsetMm - FOLGA_DA_SUBIDA_AO_VAO_MM) } as Point;
    const p1 = { x: w.a.x + u.x * (o.offsetMm + o.widthMm + FOLGA_DA_SUBIDA_AO_VAO_MM), y: w.a.y + u.y * (o.offsetMm + o.widthMm + FOLGA_DA_SUBIDA_AO_VAO_MM) } as Point;
    return [cantosDaParede(p0, p1, w.thicknessMm + 2 * FOLGA_DA_SUBIDA_AO_VAO_MM) as Point[]];
  });
  // F17: pela FACHADA, a subida é o ponto da parede mais perto do hidrômetro — fora de pilar e de vão — desde que haja
  // parede ali em todo pavimento que ela atravessa (senão, a de sob a caixa, dito).
  const naFachada = (() => {
    if (opcoes.subida !== 'FACHADA') return null;
    const e = encaixarNaParede(origem.at, paredes0, 1e9);
    if (!e) return null;
    const q = foraDoPilar(e.q, e.parede, [...aneis0, ...vaos]);
    const semParede = niveis.slice(i0 + 1, id + 1).find((l) => !encaixarNaParede(q, model.walls.filter((w) => w.levelId === l.id), PAREDE_DA_SUBIDA_EM_CIMA_MM));
    if (semParede) {
      avisos.push(`A fachada não tem parede em ${semParede.name} sobre o ponto da subida: o alimentador sobe sob a caixa, enterrado por baixo da casa.`);
      return null;
    }
    return q;
  })();
  const chegada = encaixarNaParede(alvo.at, paredes0, 3000);
  const sobAChegada = naFachada ?? (chegada ? foraDoPilar(chegada.q, chegada.parede, [...aneis0, ...vaos]) : { ...alvo.at });
  let zPe = cotaDoPercurso;
  const baldrames = (model.structures ?? []).filter((s) => s.kind === 'VIGA_FUNDACAO' && s.levelId === n0.id && s.baseMm < cotaDoPercurso && s.baseMm + s.alturaMm > cotaDoPercurso);
  const naParede = baldrames.length > 0 ? null : naParedeDe(origem.at, 1e9);
  if (baldrames.length > 0) {
    // ── F8c: pelo SOLO, fora do baldrame ──────────────────────────────────
    const pegadasB = baldrames.map((b) => pegadaEmPlanta(b));
    const doPe = baldrames.find((b) => pointInPolygon(pegadaEmPlanta(b), sobAChegada));
    const peNoSolo = doPe ? foraDaViga(sobAChegada, baldrames, origem.at, pilares0, opcoes.folgaDoBaldrameMm ?? FOLGA_DO_BALDRAME_MM) : sobAChegada;
    const a = origem.at;
    const b = peNoSolo;
    const parede = encaixarNaParede(sobAChegada, paredes0, 3000)?.parede;
    const L = parede ? Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y) || 1 : 1;
    const u = parede ? { x: (parede.b.x - parede.a.x) / L, y: (parede.b.y - parede.a.y) / L } : { x: 1, y: 0 };
    const v = { x: -u.y, y: u.x };
    const quina = (w: P) => {
      const k = (b.x - a.x) * w.x + (b.y - a.y) * w.y;
      return { x: Math.round(a.x + w.x * k), y: Math.round(a.y + w.y * k) };
    };
    const dentroMm = (pts: P[]) => pts.slice(1).reduce((s, q, i) => s + fracaoDentro(pts[i], q, pegadasB) * Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
    const compMm = (pts: P[]) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
    const opcoesDeRota = [[a, b], [a, quina(u), b], [a, quina(v), b]].map((pts) => pts.filter((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y));
    const melhor = opcoesDeRota
      .map((pts) => ({ pts, dentro: dentroMm(pts), mm: compMm(pts) }))
      .sort((x, y) => x.dentro - y.dentro || x.mm - y.mm)[0].pts;
    for (let i = 1; i < melhor.length; i++) {
      const desvio = desvioDoPilar(melhor[i - 1], melhor[i], pilares0) ?? [];
      const passos = [melhor[i - 1], ...desvio, melhor[i]];
      for (let k = 1; k < passos.length; k++) add(n0.id, passos[k - 1], cotaDoPercurso, passos[k], cotaDoPercurso);
    }
    if (doPe && (peNoSolo.x !== sobAChegada.x || peNoSolo.y !== sobAChegada.y)) {
      // Ao lado do baldrame até logo acima dele, e para dentro da parede.
      zPe = doPe.baseMm + doPe.alturaMm + (opcoes.entradaNaParedeMm ?? ENTRADA_NA_PAREDE_MM);
      add(n0.id, peNoSolo, cotaDoPercurso, peNoSolo, zPe);
      add(n0.id, peNoSolo, zPe, sobAChegada, zPe);
    }
  } else if (naParede) {
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
    const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === n0.id && s.baseMm < alvo.cotaMm && s.baseMm + s.alturaMm > zPe);
    const viga = vigas.find((v) => pointInPolygon(pegadaEmPlanta(v), pe));
    const rente = viga ? foraDaViga(pe, vigas, alvo.at, pilares0) : pe;
    if (viga && (rente.x !== pe.x || rente.y !== pe.y)) {
      const z = Math.max(zPe, Math.min(alvo.cotaMm, viga.baseMm - ABAIXO_DA_VIGA_MM));
      add(n0.id, pe, zPe, pe, z);
      add(n0.id, pe, z, rente, z);
      add(n0.id, rente, z, rente, alvo.cotaMm);
      pe = rente;
    } else {
      add(n0.id, pe, zPe, pe, alvo.cotaMm);
    }
  } else {
    add(n0.id, pe, zPe, pe, n0.defaultHeightMm);
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
  const rota = rotaPelasParedesAte(model, { levelId: n0.id, at: entrada.at, cotaMm: entrada.cotaMm }, hip.cotaEnterradaMm, { levelId: nd.id, at: alvo.at, cotaMm: alvo.cotaMm }, hip, avisos);
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
