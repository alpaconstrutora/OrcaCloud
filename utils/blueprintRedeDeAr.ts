/**
 * A REDE DE AR (05/10/2026, E7.2–E7.4 do roadmap de climatização): vazão por
 * terminal, dimensionamento dos dutos, perda de carga, balanceamento, renovação e
 * exaustão, e o traçado automático no forro.
 *
 *  - E7.2 VAZÃO E PERDA DE CARGA. A vazão de cada terminal é a DECLARADA
 *    (`Terminal.vazaoM3h`, kernel 0.93.0) ou a DERIVADA do ambiente: o calor
 *    sensível da carga térmica ÷ (ρ·cp·ΔT de insuflamento), nunca menos que a
 *    renovação, repartida entre os terminais de insuflamento do ambiente; o
 *    retorno devolve o mesmo; a tomada de ar exterior traz a renovação; o
 *    exaustor, a exaustão do uso. A rede é lida a partir da RAIZ (evaporadora
 *    dutada ou caixa de distribuição) pelo grafo dos trechos MECANICA: a vazão a
 *    jusante de cada trecho, a velocidade, a perda por atrito (Darcy com o fator
 *    de Swamee-Jain, diâmetro hidráulico na seção retangular) e as localizadas
 *    (curva e tê, pelas conexões derivadas), a perda de cada caminho até o
 *    terminal e o BALANCEAMENTO (o quanto o damper de cada terminal tem de
 *    absorver para igualar o caminho crítico — o "vai além").
 *  - E7.3 RENOVAÇÃO E EXAUSTÃO por ambiente (uso pelo nome, como a E0): o
 *    banheiro, a cozinha e a garagem SEM janela exigem exaustor; o ambiente
 *    climatizado sem janela nem tomada de ar exterior fica avisado.
 *  - E7.4 TRAÇADO: uma ESPINHA no forro (a espinha dos sprinklers): o tronco
 *    passa pela raiz na direção em que os terminais mais se espalham, e cada
 *    terminal ganha um ramal perpendicular; a cota é a do fundo da viga mais
 *    baixa (ou do teto) menos a folga e meia altura do duto. Cada trecho nasce
 *    com a seção do método escolhido para a vazão a jusante dele. As conexões
 *    (curva, tê) são DERIVADAS (`conexoesDerivadas` já cobre a MECANICA).
 *
 * Tudo DERIVADO, nada gravado além do que o lote do traçado/dimensionamento cria.
 * Física (ar a ~20 °C): ρ = 1,2 kg/m³, ν = 1,5·10⁻⁵ m²/s, cp = 1005 J/kg·K.
 */
import type { BlueprintModel, Command, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { applyBatch } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel/geom';
import { conexoesDerivadas } from './blueprintKernel/conexoes';
import { comprimentoMm, fazerChave, type No } from './blueprintGrafoDeRede';
import { fundoDaVigaMaisBaixaMm } from './blueprintObstaculosEstruturais';
import { lote } from './blueprintLinhaFrigorigena';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import type { CargaTermicaDoNivel, CargaDoAmbiente } from './blueprintCargaTermica';
import type { HipotesesDoAr } from './blueprintClimatizacao';
import type { ItemConferido } from './blueprintConferenciaClimatizacao';

export const ROTULO_DA_REDE_DE_AR = 'Rede de ar';
export const RHO_AR = 1.2;
export const NU_AR = 1.5e-5;
export const CP_AR = 1005;

/** Quem é RAIZ da rede (sopra/recolhe o ar) e quem é TERMINAL com vazão. */
export const RAIZES_DA_REDE_DE_AR = ['EVAPORADORA_DUTADA', 'CAIXA_DISTRIBUICAO_AR'] as const;
export const TERMINAIS_DE_INSUFLAMENTO = ['DIFUSOR', 'GRELHA_INSUFLAMENTO', 'BOCAL_AR'] as const;
export const TERMINAIS_DA_REDE_DE_AR = [...TERMINAIS_DE_INSUFLAMENTO, 'GRELHA_RETORNO', 'TOMADA_AR_EXTERIOR'] as const;

const ehDe = (lista: readonly string[], t: Terminal) => !!t.tipoHidraulico && lista.includes(t.tipoHidraulico);

// ─── Física ──────────────────────────────────────────────────────────────────

export interface Secao {
  /** Diâmetro (redondo) ou largura (retangular), mm. */
  bitolaMm: number;
  /** Altura do retangular; `null` = redondo. */
  alturaDutoMm: number | null;
}

export const areaM2 = (s: Secao) => (s.alturaDutoMm != null ? (s.bitolaMm / 1000) * (s.alturaDutoMm / 1000) : (Math.PI * (s.bitolaMm / 1000) ** 2) / 4);
export const diametroHidraulicoM = (s: Secao) => (s.alturaDutoMm != null ? (2 * s.bitolaMm * s.alturaDutoMm) / (s.bitolaMm + s.alturaDutoMm) / 1000 : s.bitolaMm / 1000);
export const secaoDoTrecho = (t: Pick<Trecho, 'bitolaMm' | 'alturaDutoMm'>): Secao => ({ bitolaMm: t.bitolaMm, alturaDutoMm: t.alturaDutoMm ?? null });
export const nomeDaSecao = (s: Secao) => (s.alturaDutoMm != null ? `${s.bitolaMm}×${s.alturaDutoMm}` : `Ø${s.bitolaMm}`);

/** Velocidade, m/s. */
export const velocidadeMs = (vazaoM3h: number, s: Secao) => vazaoM3h / 3600 / areaM2(s);

/** Fator de atrito de Darcy pela fórmula explícita de Swamee-Jain (regime turbulento). */
export function fatorDeAtrito(re: number, rugosidadeMm: number, dhM: number): number {
  if (re <= 0) return 0;
  if (re < 2300) return 64 / re;
  return 0.25 / Math.log10(rugosidadeMm / 1000 / (3.7 * dhM) + 5.74 / re ** 0.9) ** 2;
}

/** Perda por atrito no trecho, Pa: f · (L/Dh) · ρv²/2. */
export function perdaPorAtritoPa(vazaoM3h: number, s: Secao, comprimentoM: number, rugosidadeMm: number): number {
  const v = velocidadeMs(vazaoM3h, s);
  const dh = diametroHidraulicoM(s);
  const f = fatorDeAtrito((v * dh) / NU_AR, rugosidadeMm, dh);
  return f * (comprimentoM / dh) * ((RHO_AR * v * v) / 2);
}

export const pressaoDinamicaPa = (v: number) => (RHO_AR * v * v) / 2;

/** A rugosidade do material do trecho (sem material declarado = chapa galvanizada, como hipótese). */
export const rugosidadeDoTrecho = (t: Pick<Trecho, 'material'>): number => FICHA_DO_MATERIAL[t.material && t.material in FICHA_DO_MATERIAL ? t.material : 'CHAPA_GALVANIZADA'].rugosidadeMm;

const DIAMETROS_REDONDOS = FICHA_DO_MATERIAL.CHAPA_GALVANIZADA.diametros.map((d) => d.dn);
const acima = (x: number, passo: number) => Math.ceil(x / passo - 1e-9) * passo;

/** A seção com a área pedida, na forma padrão: redonda comercial, ou retangular com a altura padrão e largura de 50 em 50 mm. */
function secaoComArea(area: number, hip: HipotesesDoAr): Secao {
  if (hip.secaoPadrao === 'REDONDA') {
    const d = Math.sqrt((4 * area) / Math.PI) * 1000;
    return { bitolaMm: DIAMETROS_REDONDOS.find((x) => x + 1e-9 >= d) ?? DIAMETROS_REDONDOS[DIAMETROS_REDONDOS.length - 1], alturaDutoMm: null };
  }
  const h = hip.alturaPadraoMm;
  return { bitolaMm: Math.max(100, acima((area / (h / 1000)) * 1000, 50)), alturaDutoMm: h };
}

/**
 * A seção PROPOSTA para a vazão: por velocidade (tronco quando o trecho serve mais
 * de um terminal, ramal quando serve um só) ou por igual atrito (a menor seção da
 * forma padrão cuja perda por metro fica ≤ a pedida).
 */
export function secaoProposta(vazaoM3h: number, tronco: boolean, hip: HipotesesDoAr): Secao {
  if (vazaoM3h <= 0) return secaoComArea(0, hip);
  if (hip.metodo === 'VELOCIDADE') return secaoComArea(vazaoM3h / 3600 / (tronco ? hip.velocidadeTroncoMs : hip.velocidadeRamalMs), hip);
  // Igual atrito: cresce a seção até a perda por metro caber.
  let area = vazaoM3h / 3600 / 20;
  for (let i = 0; i < 400; i++) {
    const s = secaoComArea(area, hip);
    if (perdaPorAtritoPa(vazaoM3h, s, 1, FICHA_DO_MATERIAL.CHAPA_GALVANIZADA.rugosidadeMm) <= hip.perdaPorAtritoPaM + 1e-9) return s;
    area *= 1.05;
  }
  return secaoComArea(area, hip);
}

// ─── E7.2/E7.3: a vazão de cada terminal ─────────────────────────────────────

export type OrigemDaVazao = 'DECLARADA' | 'DERIVADA' | 'SEM';
export interface VazaoDoTerminal {
  vazaoM3h: number;
  origem: OrigemDaVazao;
  /** De onde veio a derivada, em uma frase. */
  memoria: string;
}

const usoDe = (a: CargaDoAmbiente) => a.premissas.uso;
const ehBanheiro = (a: CargaDoAmbiente) => usoDe(a) === 'BANHEIRO' || usoDe(a) === 'LAVABO';

/** A renovação de ar do ambiente, m³/h: (Fp·pessoas + Fa·área) L/s. */
export const renovacaoM3h = (a: CargaDoAmbiente, hip: HipotesesDoAr) => Math.round((hip.renovacaoPorPessoaLs * a.premissas.pessoas.valor + hip.renovacaoPorAreaLsM2 * a.areaPisoM2) * 3.6);

/** A vazão de insuflamento pelo calor sensível, m³/h: Ps ÷ (ρ·cp·ΔT). */
export const insuflamentoM3h = (a: CargaDoAmbiente, hip: HipotesesDoAr) => Math.round((a.sensivelW / (RHO_AR * CP_AR * hip.dtInsuflamentoK)) * 3600);

/** A exaustão mínima pelo uso (0 = o uso não pede). */
export function exaustaoM3h(a: CargaDoAmbiente, hip: HipotesesDoAr): number {
  if (ehBanheiro(a)) return hip.exaustaoBanheiroM3h;
  if (usoDe(a) === 'COZINHA') return hip.exaustaoCozinhaM3h;
  if (usoDe(a) === 'GARAGEM') return Math.round(hip.exaustaoGaragemTrocasH * a.volumeM3);
  return 0;
}

const ambienteDoTerminal = (carga: CargaTermicaDoNivel, model: BlueprintModel, t: Terminal): CargaDoAmbiente | null => {
  for (const a of carga.ambientes) {
    const s = model.spaces.find((x) => x.id === a.spaceId);
    if (s && pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at))) return a;
  }
  return null;
};

/** A vazão de cada terminal da rede de ar e de cada exaustor do pavimento. */
export function vazoesDosTerminais(model: BlueprintModel, carga: CargaTermicaDoNivel, hip: HipotesesDoAr): Map<ObjectId, VazaoDoTerminal> {
  const saida = new Map<ObjectId, VazaoDoTerminal>();
  const doNivel = (model.terminais ?? []).filter((t) => t.levelId === carga.levelId && (ehDe(TERMINAIS_DA_REDE_DE_AR, t) || t.tipoHidraulico === 'EXAUSTOR_AR'));
  const porAmbiente = new Map<string, Terminal[]>();
  const ambienteDe = new Map<ObjectId, CargaDoAmbiente | null>();
  for (const t of doNivel) {
    const a = ambienteDoTerminal(carga, model, t);
    ambienteDe.set(t.id, a);
    if (a) porAmbiente.set(a.spaceId, [...(porAmbiente.get(a.spaceId) ?? []), t]);
  }
  for (const t of doNivel) {
    if (t.vazaoM3h != null) {
      saida.set(t.id, { vazaoM3h: t.vazaoM3h, origem: 'DECLARADA', memoria: 'declarada na peça' });
      continue;
    }
    const a = ambienteDe.get(t.id) ?? null;
    if (!a) {
      saida.set(t.id, { vazaoM3h: 0, origem: 'SEM', memoria: 'fora de ambiente — declare a vazão' });
      continue;
    }
    const irmaos = (porAmbiente.get(a.spaceId) ?? []).filter((x) => x.vazaoM3h == null);
    const mesmos = (lista: readonly string[]) => Math.max(1, irmaos.filter((x) => ehDe(lista, x)).length);
    const ren = renovacaoM3h(a, hip);
    const projeto = a.climatizado ? Math.max(insuflamentoM3h(a, hip), ren) : ren;
    if (ehDe(TERMINAIS_DE_INSUFLAMENTO, t)) {
      saida.set(t.id, projeto > 0 ? { vazaoM3h: Math.round(projeto / mesmos(TERMINAIS_DE_INSUFLAMENTO)), origem: 'DERIVADA', memoria: `${a.nome}: ${projeto} m³/h (${a.climatizado ? 'calor sensível ou renovação, o maior' : 'renovação'}) ÷ ${mesmos(TERMINAIS_DE_INSUFLAMENTO)} terminal(is)` } : { vazaoM3h: 0, origem: 'SEM', memoria: `${a.nome}: sem carga nem renovação — declare a vazão` });
    } else if (t.tipoHidraulico === 'GRELHA_RETORNO') {
      saida.set(t.id, projeto > 0 ? { vazaoM3h: Math.round(projeto / mesmos(['GRELHA_RETORNO'])), origem: 'DERIVADA', memoria: `${a.nome}: o retorno devolve o insuflamento (${projeto} m³/h)` } : { vazaoM3h: 0, origem: 'SEM', memoria: 'declare a vazão' });
    } else if (t.tipoHidraulico === 'TOMADA_AR_EXTERIOR') {
      saida.set(t.id, ren > 0 ? { vazaoM3h: Math.round(ren / mesmos(['TOMADA_AR_EXTERIOR'])), origem: 'DERIVADA', memoria: `${a.nome}: renovação ${ren} m³/h` } : { vazaoM3h: 0, origem: 'SEM', memoria: 'declare a vazão' });
    } else {
      const ex = exaustaoM3h(a, hip);
      saida.set(t.id, ex > 0 ? { vazaoM3h: Math.round(ex / mesmos(['EXAUSTOR_AR'])), origem: 'DERIVADA', memoria: `${a.nome}: exaustão do uso` } : { vazaoM3h: 0, origem: 'SEM', memoria: `${a.nome}: o uso não pede exaustão — declare a vazão` });
    }
  }
  return saida;
}

// ─── E7.2: a análise da rede existente ───────────────────────────────────────

export interface TrechoDeAr {
  trechoId: ObjectId;
  vazaoM3h: number;
  /** Terminais a jusante (1 = ramal). */
  terminais: number;
  secao: Secao;
  velocidadeMs: number;
  atritoPa: number;
  proposta: Secao;
  velocidadeAlta: boolean;
}

export interface TerminalDeAr {
  terminalId: ObjectId;
  nome: string;
  vazao: VazaoDoTerminal;
  /** Perda do caminho raiz → terminal (atrito + localizadas + terminal), Pa. */
  perdaPa: number;
  /** O que o damper deste terminal absorve para igualar o caminho crítico, Pa. */
  excessoPa: number;
}

export interface RedeDeAr {
  raiz: Terminal;
  terminais: TerminalDeAr[];
  trechos: TrechoDeAr[];
  vazaoTotalM3h: number;
  perdaCriticaPa: number;
  pressaoDisponivelPa: number;
  atende: boolean;
  semVazao: ObjectId[];
}

/** As redes de ar do pavimento: uma por raiz, o que ela alcança pelos trechos MECANICA. */
export function analisarRedesDeAr(model: BlueprintModel, levelId: ObjectId, vazoes: Map<ObjectId, VazaoDoTerminal>, hip: HipotesesDoAr): RedeDeAr[] {
  const chave = fazerChave(model.levels);
  const noDe = (t: Terminal) => chave(t.levelId, t.at.x, t.at.y, t.cotaMm);
  const viz = new Map<No, { para: No; trecho: Trecho }[]>();
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'MECANICA')) {
    const a = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
    const b = chave(t.levelId, t.b.x, t.b.y, t.cotaBMm);
    viz.set(a, [...(viz.get(a) ?? []), { para: b, trecho: t }]);
    viz.set(b, [...(viz.get(b) ?? []), { para: a, trecho: t }]);
  }
  // O tipo de cada nó pelas conexões derivadas: curva ou tê (as localizadas).
  const tipoDoNo = new Map<No, string>();
  for (const c of conexoesDerivadas(model).conexoes) if (c.disciplina === 'MECANICA') tipoDoNo.set(chave(c.levelId, c.no.x, c.no.y, c.cotaMm), c.tipo);
  const terminaisDoNivel = (model.terminais ?? []).filter((t) => t.levelId === levelId);
  const redes: RedeDeAr[] = [];
  for (const raiz of terminaisDoNivel.filter((t) => ehDe(RAIZES_DA_REDE_DE_AR, t)).sort((a, b) => a.id.localeCompare(b.id))) {
    // BFS a partir da raiz (árvore: o primeiro a chegar é o pai).
    const r = noDe(raiz);
    const veio = new Map<No, { de: No; trecho: Trecho }>();
    const vistos = new Set<No>([r]);
    const fila: No[] = [r];
    while (fila.length) {
      const k = fila.shift()!;
      for (const v of viz.get(k) ?? []) {
        if (vistos.has(v.para)) continue;
        vistos.add(v.para);
        veio.set(v.para, { de: k, trecho: v.trecho });
        fila.push(v.para);
      }
    }
    const alcancados = terminaisDoNivel.filter((t) => ehDe(TERMINAIS_DA_REDE_DE_AR, t) && vistos.has(noDe(t)) && noDe(t) !== r);
    if (alcancados.length === 0) continue;
    const vazaoNoTrecho = new Map<ObjectId, number>();
    const contagem = new Map<ObjectId, number>();
    const trechoPorId = new Map<ObjectId, Trecho>();
    const caminhos = new Map<ObjectId, { trecho: Trecho; noDeSaida: No }[]>();
    for (const t of alcancados) {
      const q = vazoes.get(t.id)?.vazaoM3h ?? 0;
      const passos: { trecho: Trecho; noDeSaida: No }[] = [];
      let k = noDe(t);
      for (let guarda = 0; guarda < 100_000 && k !== r; guarda++) {
        const v = veio.get(k)!;
        vazaoNoTrecho.set(v.trecho.id, (vazaoNoTrecho.get(v.trecho.id) ?? 0) + q);
        contagem.set(v.trecho.id, (contagem.get(v.trecho.id) ?? 0) + 1);
        trechoPorId.set(v.trecho.id, v.trecho);
        passos.push({ trecho: v.trecho, noDeSaida: v.de });
        k = v.de;
      }
      caminhos.set(t.id, passos.reverse());
    }
    const trechos: TrechoDeAr[] = [...vazaoNoTrecho.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([trechoId, q]) => {
        const t = trechoPorId.get(trechoId)!;
        const s = secaoDoTrecho(t);
        const n = contagem.get(trechoId) ?? 1;
        const v = velocidadeMs(q, s);
        return { trechoId, vazaoM3h: q, terminais: n, secao: s, velocidadeMs: v, atritoPa: perdaPorAtritoPa(q, s, comprimentoMm(t) / 1000, rugosidadeDoTrecho(t)), proposta: secaoProposta(q, n > 1, hip), velocidadeAlta: v > (n > 1 ? hip.velocidadeTroncoMs : hip.velocidadeRamalMs) * 1.25 };
      });
    const porTrecho = new Map(trechos.map((x) => [x.trechoId, x]));
    const terminais: TerminalDeAr[] = alcancados.map((t) => {
      let perda = hip.perdaTerminalPa;
      for (const p of caminhos.get(t.id)!) {
        const tr = porTrecho.get(p.trecho.id)!;
        perda += tr.atritoPa;
        const tipo = tipoDoNo.get(p.noDeSaida);
        if (tipo === 'JOELHO_90' || tipo === 'JOELHO_45') perda += hip.kCurva * pressaoDinamicaPa(tr.velocidadeMs);
        else if (tipo === 'TE' || tipo === 'JUNCAO_45' || tipo === 'CRUZETA') perda += hip.kTe * pressaoDinamicaPa(tr.velocidadeMs);
      }
      return { terminalId: t.id, nome: t.tipo, vazao: vazoes.get(t.id) ?? { vazaoM3h: 0, origem: 'SEM', memoria: 'sem vazão' }, perdaPa: perda, excessoPa: 0 };
    });
    const critica = Math.max(...terminais.map((t) => t.perdaPa));
    for (const t of terminais) t.excessoPa = critica - t.perdaPa;
    redes.push({
      raiz,
      terminais,
      trechos,
      vazaoTotalM3h: alcancados.reduce((acc, t) => acc + (vazoes.get(t.id)?.vazaoM3h ?? 0), 0),
      perdaCriticaPa: critica,
      pressaoDisponivelPa: hip.pressaoDisponivelPa,
      atende: critica <= hip.pressaoDisponivelPa + 1e-9,
      semVazao: terminais.filter((t) => t.vazao.origem === 'SEM').map((t) => t.terminalId),
    });
  }
  return redes;
}

/** E7.2: os comandos que levam cada trecho da rede à seção proposta (um lote, um Ctrl+Z). */
export function comandosDeDimensionamento(redes: readonly RedeDeAr[]): Command[] {
  const vistos = new Set<ObjectId>();
  const cmds: Command[] = [];
  for (const r of redes) {
    for (const t of r.trechos) {
      if (vistos.has(t.trechoId)) continue;
      vistos.add(t.trechoId);
      if (t.secao.bitolaMm === t.proposta.bitolaMm && t.secao.alturaDutoMm === t.proposta.alturaDutoMm) continue;
      cmds.push({ type: 'SetTrechoProps', trechoId: t.trechoId, bitolaMm: t.proposta.bitolaMm, alturaDutoMm: t.proposta.alturaDutoMm } as Command);
    }
  }
  return cmds;
}

// ─── E7.3: renovação e exaustão por ambiente ─────────────────────────────────

export interface VentilacaoDoAmbiente {
  spaceId: ObjectId;
  nome: string;
  uso: string | null;
  temJanela: boolean;
  exaustores: number;
  tomadasDeAr: number;
  exaustaoM3h: number;
  renovacaoM3h: number;
  climatizado: boolean;
  /** O que falta, em uma frase; `null` se nada. */
  falta: string | null;
  aviso: string | null;
}

export function ventilacaoDoNivel(model: BlueprintModel, carga: CargaTermicaDoNivel, hip: HipotesesDoAr): VentilacaoDoAmbiente[] {
  const doNivel = (model.terminais ?? []).filter((t) => t.levelId === carga.levelId);
  return carga.ambientes.map((a) => {
    const s = model.spaces.find((x) => x.id === a.spaceId);
    const dentro = (t: Terminal) => !!s && pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at));
    const temJanela = a.exposicao.faces.some((f) => f.vaos.some((v) => v.kind === 'window'));
    const exaustores = doNivel.filter((t) => t.tipoHidraulico === 'EXAUSTOR_AR' && dentro(t)).length;
    const tomadasDeAr = doNivel.filter((t) => t.tipoHidraulico === 'TOMADA_AR_EXTERIOR' && dentro(t)).length;
    const ex = exaustaoM3h(a, hip);
    const ren = renovacaoM3h(a, hip);
    const precisaExaustao = ex > 0 && !temJanela;
    const falta = precisaExaustao && exaustores === 0 ? `${a.nome} sem janela: exige exaustão mecânica (${ex} m³/h)` : null;
    const aviso = a.climatizado && !temJanela && tomadasDeAr === 0 ? `${a.nome} climatizado sem janela nem tomada de ar exterior: renovação de ${ren} m³/h sem origem` : null;
    return { spaceId: a.spaceId, nome: a.nome, uso: a.premissas.uso, temJanela, exaustores, tomadasDeAr, exaustaoM3h: ex, renovacaoM3h: ren, climatizado: a.climatizado, falta, aviso };
  });
}

// ─── A conferência ───────────────────────────────────────────────────────────

export function conferenciaDaRedeDeAr(redes: readonly RedeDeAr[], ventilacao: readonly VentilacaoDoAmbiente[], hip: HipotesesDoAr): ItemConferido[] {
  const itens: ItemConferido[] = [];
  const faltas = ventilacao.filter((v) => v.falta);
  itens.push({ codigo: 'EXAUSTAO', item: 'Exaustão mecânica onde não há janela (banheiro, cozinha, garagem — hipótese, CONFERIR no código de obras)', estado: faltas.length ? 'FALTA' : 'OK', obtido: faltas.length ? faltas.map((v) => v.falta).join('; ') : `${ventilacao.filter((v) => v.exaustaoM3h > 0).length} ambiente(s) com exaustão pedida, todos atendidos`, spaceIds: faltas.map((v) => v.spaceId) });
  const avisos = ventilacao.filter((v) => v.aviso);
  itens.push({ codigo: 'RENOVACAO', item: 'Renovação de ar do ambiente climatizado (NBR 16401-3 — CONFERIR)', estado: avisos.length ? 'AVISO' : 'OK', obtido: avisos.length ? avisos.map((v) => v.aviso).join('; ') : 'climatizados com janela ou tomada de ar exterior', spaceIds: avisos.map((v) => v.spaceId) });
  if (redes.length === 0) {
    itens.push({ codigo: 'REDE', item: 'Rede de dutos (raiz → terminais)', estado: 'NAO_AVALIADO', obtido: 'nenhuma rede de dutos ligada a evaporadora dutada ou caixa de distribuição', spaceIds: [] });
    return itens;
  }
  const semVazao = redes.flatMap((r) => r.semVazao);
  itens.push({ codigo: 'VAZAO', item: 'Vazão de cada terminal (declarada ou derivada do ambiente)', estado: semVazao.length ? 'FALTA' : 'OK', obtido: semVazao.length ? `${semVazao.length} terminal(is) sem vazão — declare no painel da peça` : `${redes.reduce((acc, r) => acc + r.terminais.length, 0)} terminal(is) com vazão`, spaceIds: [] });
  const altas = redes.flatMap((r) => r.trechos.filter((t) => t.velocidadeAlta));
  itens.push({ codigo: 'VELOCIDADE', item: `Velocidade no duto (tronco ${hip.velocidadeTroncoMs} m/s, ramal ${hip.velocidadeRamalMs} m/s, +25 % de tolerância)`, estado: altas.length ? 'AVISO' : 'OK', obtido: altas.length ? `${altas.length} trecho(s) acima — "Ajustar seções" leva à proposta` : 'dentro', spaceIds: [] });
  const naoAtende = redes.filter((r) => !r.atende);
  const um = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  itens.push({ codigo: 'PRESSAO', item: `Perda do caminho crítico ≤ pressão disponível (${hip.pressaoDisponivelPa} Pa — CONFERIR com o catálogo)`, estado: naoAtende.length ? 'FALTA' : 'OK', obtido: redes.map((r) => `${r.raiz.tipo}: ${um(r.perdaCriticaPa)} Pa`).join('; '), spaceIds: [] });
  return itens;
}

// ─── E7.4: o traçado em espinha no forro ─────────────────────────────────────

export interface RedeDeArPlanejada {
  raizId: ObjectId;
  nome: string;
  terminais: number;
  vazaoM3h: number;
  cotaMm: number;
  avisos: string[];
}

export interface PlanoDaRedeDeAr {
  comandos: Command[];
  aCriar: RedeDeArPlanejada[];
  jaLigados: string[];
  semLugar: { nome: string; motivo: string }[];
  apagados: number;
  motivo: string | null;
  resumo: string[];
}

/** A cota do eixo do duto no forro: o fundo da viga mais baixa (ou o teto) − folga − meia altura. */
export function cotaDoDutoNoForro(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDoAr): number {
  const nivel = model.levels.find((l) => l.id === levelId);
  const teto = nivel?.defaultHeightMm ?? 2800;
  const fundo = fundoDaVigaMaisBaixaMm(model, levelId, teto) ?? teto;
  return Math.round(fundo - hip.folgaSobVigaMm - hip.alturaPadraoMm / 2);
}

export function planejarRedeDeAr(model: BlueprintModel, levelId: ObjectId, vazoes: Map<ObjectId, VazaoDoTerminal>, hip: HipotesesDoAr): PlanoDaRedeDeAr {
  const vazio = (motivo: string, apagar: Command[] = []): PlanoDaRedeDeAr => ({ comandos: apagar, aCriar: [], jaLigados: [], semLugar: [], apagados: apagar.length, motivo, resumo: [] });
  const sugeridos = (model.trechos ?? []).filter((t) => t.levelId === levelId && !!t.sugerido && t.disciplina === 'MECANICA' && t.rotulo === ROTULO_DA_REDE_DE_AR);
  const apagar = sugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }) as Command);
  const ids = new Set(sugeridos.map((t) => t.id));
  const base: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)) };
  const terminais = (base.terminais ?? []).filter((t) => t.levelId === levelId);
  const raizes = terminais.filter((t) => ehDe(RAIZES_DA_REDE_DE_AR, t)).sort((a, b) => a.id.localeCompare(b.id));
  if (raizes.length === 0) return vazio('nenhuma evaporadora dutada nem caixa de distribuição de ar neste pavimento — insira uma (Climatização — equipamentos / terminais de ar)', apagar);
  // Os terminais que alguma rede CONFIRMADA já alcança ficam; os outros vão para a raiz mais perto.
  const jaAlcancados = new Set(analisarRedesDeAr(base, levelId, vazoes, hip).flatMap((r) => r.terminais.map((t) => t.terminalId)));
  const soltos = terminais.filter((t) => ehDe(TERMINAIS_DA_REDE_DE_AR, t) && !jaAlcancados.has(t.id));
  const jaLigados = raizes.filter((r) => analisarRedesDeAr(base, levelId, vazoes, hip).some((x) => x.raiz.id === r.id)).map((r) => r.tipo);
  if (soltos.length === 0) return { ...vazio(jaLigados.length ? 'todos os terminais de ar já estão ligados por rede confirmada' : 'nenhum terminal de ar (difusor, grelha, bocal, tomada de ar) neste pavimento', apagar), jaLigados };
  const grupos = new Map<ObjectId, Terminal[]>();
  for (const t of soltos) {
    const r = raizes.reduce((m, x) => (Math.hypot(x.at.x - t.at.x, x.at.y - t.at.y) < Math.hypot(m.at.x - t.at.x, m.at.y - t.at.y) ? x : m));
    grupos.set(r.id, [...(grupos.get(r.id) ?? []), t]);
  }
  const cota = cotaDoDutoNoForro(base, levelId, hip);
  const l = lote(base);
  const aCriar: RedeDeArPlanejada[] = [];
  for (const raiz of raizes) {
    const ts = grupos.get(raiz.id);
    if (!ts?.length) continue;
    const avisos: string[] = [];
    // A espinha na direção em que os terminais mais se espalham, passando pela raiz.
    const xs = ts.map((t) => t.at.x);
    const ys = ts.map((t) => t.at.y);
    const emX = Math.max(...xs, raiz.at.x) - Math.min(...xs, raiz.at.x) >= Math.max(...ys, raiz.at.y) - Math.min(...ys, raiz.at.y);
    const ao = (u: number, w: number) => (emX ? { x: u, y: w } : { x: w, y: u });
    const u0 = emX ? raiz.at.x : raiz.at.y;
    const w0 = emX ? raiz.at.y : raiz.at.x;
    const uDe = (t: Terminal) => (emX ? t.at.x : t.at.y);
    const wDe = (t: Terminal) => (emX ? t.at.y : t.at.x);
    // Arestas orientadas da raiz para fora, em planta, na cota do forro.
    const arestas: { de: { x: number; y: number }; para: { x: number; y: number } }[] = [];
    const us = [...new Set([u0, ...ts.map(uDe)])].sort((a, b) => a - b);
    const esquerda = us.filter((u) => u < u0).reverse();
    const direita = us.filter((u) => u > u0);
    for (const lado of [esquerda, direita]) {
      let atual = u0;
      for (const u of lado) {
        arestas.push({ de: ao(atual, w0), para: ao(u, w0) });
        atual = u;
      }
    }
    // Os ramais: por posição na espinha e por lado, do mais perto ao mais longe, encadeados.
    const porU = new Map<number, Terminal[]>();
    for (const t of ts) porU.set(uDe(t), [...(porU.get(uDe(t)) ?? []), t]);
    for (const [u, lista] of porU) {
      for (const sinal of [1, -1]) {
        const doLado = lista.filter((t) => Math.sign(wDe(t) - w0) === sinal).sort((a, b) => Math.abs(wDe(a) - w0) - Math.abs(wDe(b) - w0));
        let w = w0;
        for (const t of doLado) {
          arestas.push({ de: ao(u, w), para: ao(u, wDe(t)) });
          w = wDe(t);
        }
      }
    }
    // A vazão a jusante de cada ponto (pós-ordem da árvore orientada) e quantos terminais.
    const k = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    const filhos = new Map<string, { x: number; y: number }[]>();
    for (const a of arestas) filhos.set(k(a.de), [...(filhos.get(k(a.de)) ?? []), a.para]);
    const qNoPonto = new Map<string, { q: number; n: number }>();
    for (const t of ts) {
      const v = vazoes.get(t.id)?.vazaoM3h ?? 0;
      const atual = qNoPonto.get(k(t.at)) ?? { q: 0, n: 0 };
      qNoPonto.set(k(t.at), { q: atual.q + v, n: atual.n + 1 });
      if (v <= 0) avisos.push(`${t.tipo} sem vazão — a seção sai pela mínima`);
    }
    const memo = new Map<string, { q: number; n: number }>();
    const jusante = (p: { x: number; y: number }, guarda = 0): { q: number; n: number } => {
      const kk = k(p);
      if (memo.has(kk)) return memo.get(kk)!;
      const proprio = qNoPonto.get(kk) ?? { q: 0, n: 0 };
      const soma = (filhos.get(kk) ?? []).reduce((acc, f) => {
        const j = guarda > 10_000 ? { q: 0, n: 0 } : jusante(f, guarda + 1);
        return { q: acc.q + j.q, n: acc.n + j.n };
      }, proprio);
      memo.set(kk, soma);
      return soma;
    };
    const total = jusante(raiz.at);
    const baseDe = (q: number, n: number) => {
      const s = secaoProposta(q, n > 1, hip);
      return { levelId, disciplina: 'MECANICA' as const, bitolaMm: s.bitolaMm, ...(s.alturaDutoMm != null ? { alturaDutoMm: s.alturaDutoMm } : {}), rotulo: ROTULO_DA_REDE_DE_AR, sugerido: true };
    };
    l.add(baseDe(total.q, total.n), raiz.at, raiz.cotaMm, raiz.at, cota);
    for (const a of arestas) {
      const j = jusante(a.para);
      l.add(baseDe(j.q, j.n), a.de, cota, a.para, cota);
    }
    for (const t of ts) l.add(baseDe(vazoes.get(t.id)?.vazaoM3h ?? 0, 1), t.at, cota, t.at, t.cotaMm);
    aCriar.push({ raizId: raiz.id, nome: raiz.tipo, terminais: ts.length, vazaoM3h: total.q, cotaMm: cota, avisos: [...new Set(avisos)] });
  }
  const comandos = [...apagar, ...l.comandos];
  try {
    applyBatch(model, comandos);
  } catch (err) {
    return vazio(`o plano não aplica: ${err instanceof Error ? err.message : String(err)}`, apagar);
  }
  const resumo = aCriar.map((p) => `${p.nome}: ${p.terminais} terminal(is), ${p.vazaoM3h.toLocaleString('pt-BR')} m³/h, duto no forro a ${(p.cotaMm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m${p.avisos.length ? ` — ${p.avisos.join('; ')}` : ''}`);
  return { comandos, aCriar, jaLigados, semLugar: [], apagados: apagar.length, motivo: null, resumo };
}
