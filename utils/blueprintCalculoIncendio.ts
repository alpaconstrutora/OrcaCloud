/**
 * O CÁLCULO DA REDE DE INCÊNDIO (30/09/2026, E2.3 do roadmap de incêndio):
 * o desenho vira a rede do solver (`blueprintHidraulicaIncendio.resolverRede`)
 * e dela saem os números que o AltoQi entrega — os hidrantes mais
 * desfavoráveis, os N simultâneos abertos, o ponto de equilíbrio, a carga que a
 * bomba tem de dar, a vazão, a pressão e a velocidade em cada trecho.
 *
 * Tudo DERIVADO: nada aqui é gravado. As premissas (vazão e pressão mínimas,
 * mangueira, simultaneidade) são do ESTUDO (`blueprint_study_incendio`).
 *
 * ⚠️ NORMA. Os valores-padrão são PONTOS DE PARTIDA e estão marcados CONFERIR:
 * a vazão por tipo de sistema e a simultaneidade vêm da NBR 13714 e da IT do
 * CBMMG, cujo texto ainda não está no repositório. A pressão máxima de 1000 kPa
 * e a velocidade de 5 m/s são os limites usuais da NBR 13714 — CONFERIR.
 *
 * Como a peça entra na rede:
 *  - FONTE: a bomba de incêndio (`BOMBA_INCENDIO`), com carga = cota + a carga
 *    que se procura. Sem bomba não há o que calcular (a RTI por gravidade é a E3).
 *  - HIDRANTE e MANGOTINHO abertos: a MANGUEIRA (Hazen-Williams com C da
 *    mangueira) até o ESGUICHO, e o esguicho como EMISSOR, com K = Qmín/√Pmín —
 *    o bocal que dá exatamente a vazão mínima na pressão mínima.
 *  - SPRINKLER aberto: emissor com o K dele (`Terminal.fatorK` ou o da ficha).
 *  - CONEXÕES derivadas (joelho, tê): comprimento equivalente somado aos tubos;
 *    no tê, a saída LATERAL vai para o ramal perpendicular e a passagem se
 *    divide entre os dois colineares. Registro e retenção sobre o trecho somam
 *    no trecho; a VGA, como retenção (hipótese, CONFERIR o catálogo).
 */
import {
  applyBatch,
  conexoesDerivadas,
  materialDoTrecho,
  type BlueprintModel,
  type Command,
  type MaterialDeTubo,
  type ObjectId,
  type Terminal,
  type Trecho,
} from './blueprintKernel';
import { comprimentoMm, fazerChave } from './blueprintGrafoDeRede';
import { areaDoContornoM2, criterioDaArea, sprinklersDaArea, type CriterioDeSprinklers } from './blueprintSprinklersIncendio';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL, comprimentoEquivalenteM, type PecaDePerda } from './blueprintHidraulicaPressao';
import {
  KPA_POR_MCA_INC,
  eloDeEmissor,
  eloDeTubo,
  kInternoDoEmissor,
  perdaNoTubo,
  perdaUnitaria,
  resolverRede,
  type EloHidraulico,
  type FormulaDePerda,
  type NoHidraulico,
} from './blueprintHidraulicaIncendio';

// ─── Premissas ───────────────────────────────────────────────────────────────

/** D1.2: a reserva de incêndio dada por TABELA do regulamento (MG: IT 17, Tabela 4), em litros. */
export interface ReservaDeTabela {
  litros: number;
  /** "tipo 2, reserva de 8 m³" — o porquê, para a tela e o memorial. */
  descricao: string;
  fonte: string;
}

export interface HipotesesHidraulicasDeIncendio {
  formula: FormulaDePerda;
  /** Quantos hidrantes (ou mangotinhos) funcionam ao mesmo tempo — CONFERIR NA IT. */
  hidrantesSimultaneos: number;
  /** Hidrante: vazão e pressão mínimas no ESGUICHO mais desfavorável — CONFERIR NA NBR 13714/IT. */
  vazaoMinimaHidranteLmin: number;
  pressaoMinimaHidranteKpa: number;
  comprimentoMangueiraHidranteM: number;
  diametroMangueiraHidranteMm: number;
  /** Mangotinho: idem. */
  vazaoMinimaMangotinhoLmin: number;
  pressaoMinimaMangotinhoKpa: number;
  comprimentoMangueiraMangotinhoM: number;
  diametroMangueiraMangotinhoMm: number;
  /** C de Hazen-Williams da mangueira (revestida). */
  cMangueira: number;
  /** Sprinkler: pressão mínima no bico. */
  pressaoMinimaSprinklerKpa: number;
  /**
   * E5.1: a vazão mínima no sprinkler mais desfavorável (densidade × área por
   * sprinkler). DERIVADA do critério pelo `calculoDeIncendio` — não é premissa
   * gravada (o leitor da coluna nem a lê). Ausente = só a pressão mínima.
   */
  vazaoMinimaSprinklerLmin?: number;
  /** Limites da rede. */
  pressaoMaximaKpa: number;
  velocidadeMaxMs: number;
  /** E3.2: tempo de funcionamento que a RTI tem de garantir, min — CONFERIR NA IT. */
  autonomiaMin: number;
  /** E3.3: o jato além da mangueira, para a cobertura por alcance, m. D1.2: a IT 17 do CBMMG (5.8.2) o DESCONSIDERA — padrão 0. */
  alcanceDoJatoM: number;
}

export const HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO: HipotesesHidraulicasDeIncendio = {
  formula: 'HAZEN_WILLIAMS',
  hidrantesSimultaneos: 2,
  vazaoMinimaHidranteLmin: 300,
  pressaoMinimaHidranteKpa: 300,
  comprimentoMangueiraHidranteM: 30,
  diametroMangueiraHidranteMm: 40,
  vazaoMinimaMangotinhoLmin: 100,
  pressaoMinimaMangotinhoKpa: 300,
  comprimentoMangueiraMangotinhoM: 30,
  diametroMangueiraMangotinhoMm: 25,
  cMangueira: 140,
  pressaoMinimaSprinklerKpa: 50,
  pressaoMaximaKpa: 1000,
  velocidadeMaxMs: 5,
  autonomiaMin: 60,
  alcanceDoJatoM: 0,
};

/** As premissas gravadas, completadas com o padrão — só entra número finito e positivo. */
export function hipotesesHidraulicasDaColuna(raw: unknown): HipotesesHidraulicasDeIncendio {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO;
  const saida = { ...p } as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) {
    const x = r[k];
    if (typeof v === 'number' && typeof x === 'number' && Number.isFinite(x) && x > 0) saida[k] = x;
  }
  if (r.formula === 'HAZEN_WILLIAMS' || r.formula === 'UNIVERSAL' || r.formula === 'FAIR_WHIPPLE_HSIAO') saida.formula = r.formula;
  saida.hidrantesSimultaneos = Math.max(1, Math.round(saida.hidrantesSimultaneos as number));
  return saida as unknown as HipotesesHidraulicasDeIncendio;
}

// ─── Montagem da rede ────────────────────────────────────────────────────────

const HIDRANTES: readonly string[] = ['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO'];
const ehDeCombate = (t: Terminal) => t.disciplina === 'INCENDIO' && !!t.tipoHidraulico && HIDRANTES.includes(t.tipoHidraulico);
const ehSprinkler = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'SPRINKLER';

/** O tubo da rede, com o comprimento equivalente das peças já somado. */
export interface TuboDaRede {
  trecho: Trecho;
  material: MaterialDeTubo;
  de: string;
  para: string;
  lM: number;
  leqM: number;
}

export interface RedeDeIncendio {
  tubos: TuboDaRede[];
  /** Cota de cada nó (m), tirada da PONTA do tubo — não da chave da laje, que erra a espessura dela. */
  cota: Map<string, number>;
  /** O nó de cada terminal de incêndio que encosta na rede. */
  noDoTerminal: Map<ObjectId, string>;
  /** Só os que consomem água (hidrante, mangotinho, sprinkler) — o papel do trecho conta estes. */
  consumidores: Map<ObjectId, string>;
  fonte: Terminal | null;
  noDaFonte: string | null;
  /** E3.2: a bomba (carga a calcular) ou a caixa de incêndio (gravidade: a carga é a cota do fundo). */
  tipoDaFonte: 'BOMBA' | 'GRAVIDADE' | null;
}

const ROTULO_DA_PECA: Partial<Record<string, PecaDePerda>> = { JOELHO_90: 'JOELHO_90', JOELHO_45: 'JOELHO_45', REDUCAO: 'REDUCAO', LUVA: 'LUVA' };

function sobreOTrecho(term: Terminal, t: Trecho): boolean {
  if (term.levelId !== t.levelId) return false;
  const dx = t.b.x - t.a.x;
  const dy = t.b.y - t.a.y;
  const c2 = dx * dx + dy * dy;
  const u = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((term.at.x - t.a.x) * dx + (term.at.y - t.a.y) * dy) / c2));
  return Math.hypot(term.at.x - (t.a.x + u * dx), term.at.y - (t.a.y + u * dy)) <= 1.5;
}

/** A rede de incêndio do desenho, pronta para o solver. */
export function redeDeIncendio(model: BlueprintModel): RedeDeIncendio {
  const chave = fazerChave(model.levels);
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const cota = new Map<string, number>();
  const tubos: TuboDaRede[] = [];
  const trechos = (model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO');
  for (const t of trechos) {
    const de = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
    const para = chave(t.levelId, t.b.x, t.b.y, t.cotaBMm);
    if (!cota.has(de)) cota.set(de, ((elev.get(t.levelId) ?? 0) + t.cotaAMm) / 1000);
    if (!cota.has(para)) cota.set(para, ((elev.get(t.levelId) ?? 0) + t.cotaBMm) / 1000);
    tubos.push({ trecho: t, material: materialDoTrecho(t) ?? 'ACO_GALVANIZADO', de, para, lM: comprimentoMm(t) / 1000, leqM: 0 });
  }
  const porId = new Map(tubos.map((x) => [x.trecho.id, x]));
  const somar = (trechoId: ObjectId, peca: PecaDePerda, fracao = 1) => {
    const x = porId.get(trechoId);
    if (x) x.leqM += fracao * comprimentoEquivalenteM(peca, x.trecho.bitolaMm, x.material);
  };

  // Conexões derivadas.
  for (const c of conexoesDerivadas(model).conexoes.filter((x) => x.disciplina === 'INCENDIO')) {
    const p = ROTULO_DA_PECA[c.tipo];
    if (p) {
      for (const id of c.trechoIds) somar(id, p, 1 / c.trechoIds.length);
      continue;
    }
    // Tê, junção, cruzeta: quem tem um colinear OPOSTO é passagem; o resto é saída lateral.
    const ramais = c.ramais ?? [];
    for (const r of ramais) {
      const passagem = ramais.some((o) => o !== r && r.u[0] * o.u[0] + r.u[1] * o.u[1] + r.u[2] * o.u[2] < -0.98);
      somar(r.trechoId, passagem ? 'TE_PASSAGEM' : 'TE_LATERAL', passagem ? 0.5 : 1);
    }
  }

  // Peças sobre o trecho e a VGA no nó.
  const terminais = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico);
  for (const pc of terminais) {
    const tipo = pc.tipoHidraulico!;
    const peca: PecaDePerda | null = tipo === 'REGISTRO_GAVETA' || tipo === 'CHAVE_FLUXO' ? 'REGISTRO_GAVETA' : tipo === 'VALVULA_RETENCAO' ? 'VALVULA_RETENCAO' : null;
    if (peca) for (const x of tubos) if (sobreOTrecho(pc, x.trecho)) somar(x.trecho.id, peca);
  }

  const noDoTerminal = new Map<ObjectId, string>();
  for (const t of terminais) {
    const k = chave(t.levelId, t.at.x, t.at.y, t.cotaMm);
    if (cota.has(k)) noDoTerminal.set(t.id, k);
  }
  // Fase B (plano pós-roadmap, D-3 "parcela + gravidade"): a caixa de água fria COM parcela de
  // incêndio (`volumeRtiL`) ligada à rede é fonte por gravidade, como a caixa só de incêndio.
  const compartilhadas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && (t.volumeRtiL ?? 0) > 0);
  for (const t of compartilhadas) {
    const k = chave(t.levelId, t.at.x, t.at.y, t.cotaMm);
    if (cota.has(k)) noDoTerminal.set(t.id, k);
  }
  for (const vga of terminais.filter((t) => t.tipoHidraulico === 'VGA')) {
    const k = noDoTerminal.get(vga.id);
    if (!k) continue;
    const tocam = tubos.filter((x) => x.de === k || x.para === k);
    for (const x of tocam) somar(x.trecho.id, 'VALVULA_RETENCAO', 1 / tocam.length);
  }

  // A bomba manda; sem ela, a caixa SÓ de incêndio é a fonte por gravidade (E3.2).
  const bomba = terminais.find((t) => t.tipoHidraulico === 'BOMBA_INCENDIO' && noDoTerminal.has(t.id)) ?? null;
  const caixa = terminais.find((t) => t.tipoHidraulico === 'RESERVATORIO' && noDoTerminal.has(t.id)) ?? compartilhadas.find((t) => noDoTerminal.has(t.id)) ?? null;
  const fonte = bomba ?? caixa;
  const consumidores = new Map([...noDoTerminal].filter(([id]) => {
    // A caixa de água fria com parcela de incêndio (Fase B) está no mapa de nós, mas não é peça de incêndio.
    const t = terminais.find((x) => x.id === id);
    return !!t && (ehDeCombate(t) || ehSprinkler(t));
  }));
  return { tubos, cota, noDoTerminal, consumidores, fonte, noDaFonte: fonte ? noDoTerminal.get(fonte.id)! : null, tipoDaFonte: bomba ? 'BOMBA' : caixa ? 'GRAVIDADE' : null };
}

// ─── Um cenário com a carga dada ─────────────────────────────────────────────

export interface TerminalCalculado {
  terminalId: ObjectId;
  tipo: string;
  vazaoLmin: number;
  /** Pressão no nó da rede (a válvula do hidrante; o bico do sprinkler), kPa. */
  pressaoNoKpa: number;
  /** Pressão no esguicho (hidrante/mangotinho), kPa; no sprinkler = a do nó. */
  pressaoNoBicoKpa: number;
  exigidoLmin: number | null;
  exigidoKpa: number | null;
  atende: boolean;
}

export interface TrechoDoCalculo {
  trechoId: ObjectId;
  vazaoLmin: number;
  velocidadeMs: number;
  perdaMca: number;
  lM: number;
  leqM: number;
  dn: number;
  material: MaterialDeTubo;
  pressaoDeKpa: number;
  pressaoParaKpa: number;
}

export interface CenarioCalculado {
  convergiu: boolean;
  motivo: string | null;
  cargaNaFonteM: number;
  vazaoNaFonteLmin: number;
  terminais: TerminalCalculado[];
  trechos: TrechoDoCalculo[];
}

const exigencias = (t: Terminal, hip: HipotesesHidraulicasDeIncendio) => {
  if (t.tipoHidraulico === 'MANGOTINHO')
    return { q: hip.vazaoMinimaMangotinhoLmin, p: hip.pressaoMinimaMangotinhoKpa, l: hip.comprimentoMangueiraMangotinhoM, d: hip.diametroMangueiraMangotinhoMm };
  return { q: hip.vazaoMinimaHidranteLmin, p: hip.pressaoMinimaHidranteKpa, l: hip.comprimentoMangueiraHidranteM, d: hip.diametroMangueiraHidranteMm };
};

/** Perda na mangueira por Hazen-Williams com o C e o diâmetro dela. */
const jDaMangueira = (dMm: number, c: number) => (q: number) => {
  const D = dMm / 1000;
  const k = 10.67 / (Math.pow(c, 1.852) * Math.pow(D, 4.87));
  const Q = Math.abs(q);
  return { j: k * Math.pow(Q, 1.852), dj: 1.852 * k * Math.pow(Q, 0.852) };
};

/** Resolve a rede com os terminais `abertos` e a fonte na carga dada (m acima da bomba). */
export function calcularCenario(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, abertos: readonly ObjectId[], cargaNaFonteM: number, rede = redeDeIncendio(model)): CenarioCalculado {
  const vazio = (motivo: string): CenarioCalculado => ({ convergiu: false, motivo, cargaNaFonteM, vazaoNaFonteLmin: 0, terminais: [], trechos: [] });
  if (!rede.fonte || !rede.noDaFonte) return vazio('sem bomba de incêndio nem caixa de incêndio ligada à rede — é ela a origem do cálculo');
  const nos: NoHidraulico[] = [...rede.cota].map(([id, z]) => ({ id, zM: z, ...(id === rede.noDaFonte ? { cargaFixaM: z + cargaNaFonteM } : {}) }));
  const elos: EloHidraulico[] = rede.tubos.map((x) =>
    eloDeTubo(x.trecho.id, x.de, x.para, (q) => perdaUnitaria(hip.formula, x.material, x.trecho.bitolaMm, q), x.lM + x.leqM),
  );
  const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const abertosNaRede = abertos.map((id) => porId.get(id)).filter((t): t is Terminal => !!t && rede.noDoTerminal.has(t.id));
  for (const t of abertosNaRede) {
    const no = rede.noDoTerminal.get(t.id)!;
    const z = rede.cota.get(no)!;
    if (ehSprinkler(t)) {
      const k = t.fatorK ?? FICHA_DO_PONTO_HIDRAULICO.SPRINKLER.fatorK ?? 80;
      nos.push({ id: `atm:${t.id}`, zM: z, cargaFixaM: z });
      elos.push(eloDeEmissor(`emissor:${t.id}`, no, `atm:${t.id}`, kInternoDoEmissor(k)));
    } else if (ehDeCombate(t)) {
      const ex = exigencias(t, hip);
      const kBocal = ex.q / Math.sqrt(ex.p / 100);
      nos.push({ id: `esg:${t.id}`, zM: z }, { id: `atm:${t.id}`, zM: z, cargaFixaM: z });
      elos.push(eloDeTubo(`mangueira:${t.id}`, no, `esg:${t.id}`, jDaMangueira(ex.d, hip.cMangueira), ex.l));
      elos.push(eloDeEmissor(`emissor:${t.id}`, `esg:${t.id}`, `atm:${t.id}`, kInternoDoEmissor(kBocal)));
    }
  }
  const s = resolverRede(nos, elos);
  if (!s.convergiu) return vazio(s.motivo ?? 'o cálculo não convergiu');
  const pressao = (no: string) => ((s.carga.get(no) ?? 0) - (rede.cota.get(no) ?? 0)) * KPA_POR_MCA_INC;
  const terminais: TerminalCalculado[] = abertosNaRede.map((t) => {
    const no = rede.noDoTerminal.get(t.id)!;
    const q = (s.vazao.get(`emissor:${t.id}`) ?? 0) * 60000;
    if (ehSprinkler(t)) {
      const p = pressao(no);
      const qMin = hip.vazaoMinimaSprinklerLmin ?? 0;
      return { terminalId: t.id, tipo: t.tipoHidraulico!, vazaoLmin: q, pressaoNoKpa: p, pressaoNoBicoKpa: p, exigidoLmin: qMin > 0 ? qMin : null, exigidoKpa: hip.pressaoMinimaSprinklerKpa, atende: p >= hip.pressaoMinimaSprinklerKpa - 1e-6 && q >= qMin * (1 - 1e-6) };
    }
    const ex = exigencias(t, hip);
    const zEsg = rede.cota.get(no)!;
    const pBico = ((s.carga.get(`esg:${t.id}`) ?? 0) - zEsg) * KPA_POR_MCA_INC;
    return { terminalId: t.id, tipo: t.tipoHidraulico!, vazaoLmin: q, pressaoNoKpa: pressao(no), pressaoNoBicoKpa: pBico, exigidoLmin: ex.q, exigidoKpa: ex.p, atende: q >= ex.q * (1 - 1e-6) };
  });
  const trechos: TrechoDoCalculo[] = rede.tubos
    .filter((x) => s.vazao.has(x.trecho.id))
    .map((x) => {
      const q = s.vazao.get(x.trecho.id)!;
      const r = perdaNoTubo(hip.formula, x.material, x.trecho.bitolaMm, q, x.lM + x.leqM);
      return { trechoId: x.trecho.id, vazaoLmin: Math.abs(q) * 60000, velocidadeMs: r.velocidadeMs, perdaMca: r.hfMca, lM: x.lM, leqM: x.leqM, dn: x.trecho.bitolaMm, material: x.material, pressaoDeKpa: pressao(x.de), pressaoParaKpa: pressao(x.para) };
    });
  const vazaoNaFonteLmin = terminais.reduce((a, t) => a + t.vazaoLmin, 0);
  return { convergiu: true, motivo: null, cargaNaFonteM: cargaNaFonteM, vazaoNaFonteLmin, terminais, trechos };
}

// ─── A carga que a bomba tem de dar ──────────────────────────────────────────

const CARGA_MAXIMA_M = 600;
/** E5.1: a carga com que cada sprinkler, aberto sozinho, é comparado aos outros. */
const CARGA_DE_ORDENACAO_M = 100;

/** A folga do pior terminal aberto: ≥ 0 = todos atendem. Razão, para comparar vazão e pressão. */
function folga(c: CenarioCalculado): number {
  if (!c.convergiu || c.terminais.length === 0) return -Infinity;
  const pela = (x: number, min: number) => x / min - 1;
  return Math.min(
    ...c.terminais.map((t) => {
      // O sprinkler tem de dar as DUAS: a vazão (densidade) e a pressão mínimas.
      if (t.tipo === 'SPRINKLER') return Math.min(t.exigidoLmin != null ? pela(t.vazaoLmin, t.exigidoLmin) : Infinity, pela(t.pressaoNoBicoKpa, t.exigidoKpa ?? 1));
      return t.exigidoLmin != null ? pela(t.vazaoLmin, t.exigidoLmin) : pela(t.pressaoNoBicoKpa, t.exigidoKpa ?? 1);
    }),
  );
}

/**
 * A MENOR carga na fonte (m acima da bomba) com que todos os `abertos` atendem —
 * por bisseção (a rede é monotônica na carga). `null` se nem 600 m bastam.
 */
export function cargaNecessaria(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, abertos: readonly ObjectId[], rede = redeDeIncendio(model)): { cargaM: number; cenario: CenarioCalculado } | null {
  const alto = calcularCenario(model, hip, abertos, CARGA_MAXIMA_M, rede);
  if (folga(alto) < 0) return null;
  let lo = 0;
  let hi = CARGA_MAXIMA_M;
  for (let i = 0; i < 60 && hi - lo > 0.005; i++) {
    const m = (lo + hi) / 2;
    if (folga(calcularCenario(model, hip, abertos, m, rede)) >= 0) hi = m;
    else lo = m;
  }
  return { cargaM: hi, cenario: calcularCenario(model, hip, abertos, hi, rede) };
}

// ─── O cálculo completo ──────────────────────────────────────────────────────

export type PapelDoTrecho = 'GERAL' | 'COLUNA' | 'RAMAL' | 'SUB_RAMAL' | 'ANEL';
export const ROTULO_DO_PAPEL: Record<PapelDoTrecho, string> = { GERAL: 'Geral', COLUNA: 'Coluna', RAMAL: 'Ramal', SUB_RAMAL: 'Sub-ramal', ANEL: 'Anel' };

export type SistemaDeIncendio = 'HIDRANTES' | 'SPRINKLERS' | 'COMBINADO';

/** O cenário de projeto de UM sistema (E5.1). */
export interface ResultadoDoSistema {
  /** Os que abrem juntos — vazio quando falta o critério (o motivo diz). */
  abertos: ObjectId[];
  cargaNecessariaM: number | null;
  cenario: CenarioCalculado | null;
  motivo: string | null;
  /** O tempo que a RTI tem de garantir para este sistema, min. */
  autonomiaMin: number;
  /** E5.2: sprinklers — o critério e as premissas efetivas deste cenário (a área pode ter risco próprio). */
  criterio?: CriterioDeSprinklers;
  hip?: HipotesesHidraulicasDeIncendio;
}

/** E5.2: o cenário de cada Área de Operação desenhada. */
export interface ResultadoDaArea {
  areaId: ObjectId;
  criterio: CriterioDeSprinklers;
  /** A área do contorno desenhado, m² — confere com a exigida pelo critério. */
  areaDesenhadaM2: number;
  resultado: ResultadoDoSistema;
}

export interface CalculoDeIncendio {
  motivo: string | null;
  /** Hidrantes e mangotinhos ligados à rede, do mais ao menos desfavorável (carga que cada um sozinho exige). */
  desfavoraveis: { terminalId: ObjectId; cargaM: number | null }[];
  /** Os N simultâneos abertos no cálculo. */
  abertos: ObjectId[];
  cargaNecessariaM: number | null;
  cenario: CenarioCalculado | null;
  /** Terminais de incêndio fora da rede da bomba (sem tubo chegando neles). */
  desligados: ObjectId[];
  papel: Map<ObjectId, PapelDoTrecho>;
  /** Pressão ESTÁTICA (sem vazão) com a carga de projeto, por hidrante: a verificação dos demais. */
  estaticaKpa: Map<ObjectId, number>;
  /**
   * E3.2: por GRAVIDADE (caixa de incêndio sem bomba) a carga não se escolhe —
   * é a cota do fundo. Aí `cargaNecessariaM` diz quanto ACIMA do fundo a água
   * teria de estar, e o cenário é o que a caixa entrega de fato.
   */
  porGravidade: boolean;
  /**
   * E3.2: a reserva técnica — exigida e a desenhada. Exigida = vazão × autonomia do sistema que
   * governa; D1.2: com a reserva de TABELA (MG: IT 17, Tabela 4) ela é o volume da tabela — e, se
   * os sprinklers entram, o maior entre a tabela e a vazão × duração deles.
   */
  rti: { exigidaL: number | null; autonomiaMin: number; porTabela: ReservaDeTabela | null; disponivelL: number; caixas: ObjectId[] };
  /** E5.1: as premissas EFETIVAS (com a vazão mínima por sprinkler do critério) — a bomba usa estas. */
  hip: HipotesesHidraulicasDeIncendio;
  criterio: CriterioDeSprinklers | null;
  /** E5.1: o sistema que governa a bomba — `cenario`, `abertos` e `cargaNecessariaM` acima são dele. */
  sistema: SistemaDeIncendio | null;
  /** E5.4: `combinado` = os sprinklers da área e os hidrantes abertos JUNTOS (a demanda somada). */
  porSistema: { hidrantes: ResultadoDoSistema | null; sprinklers: ResultadoDoSistema | null; combinado: ResultadoDoSistema | null };
  /** E5.2: uma linha por Área de Operação desenhada; vazio = os N mais desfavoráveis (E5.1). */
  areas: ResultadoDaArea[];
}

/** A RTI desenhada: a reserva das caixas de água fria compartilhadas + o volume das caixas só de incêndio. */
export function rtiDoDesenho(model: BlueprintModel): { disponivelL: number; caixas: ObjectId[] } {
  const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && ((t.disciplina === 'AGUA_FRIA' && (t.volumeRtiL ?? 0) > 0) || t.disciplina === 'INCENDIO'));
  const volume = (t: Terminal) => {
    if (t.disciplina === 'AGUA_FRIA') return t.volumeRtiL ?? 0;
    if (t.volumeL != null && t.volumeL > 0) return t.volumeL;
    if (t.larguraMm && t.profundidadeMm && t.alturaMm) return Math.round((t.larguraMm * t.profundidadeMm * t.alturaMm) / 1e6);
    return 0;
  };
  return { disponivelL: caixas.reduce((s, t) => s + volume(t), 0), caixas: caixas.map((t) => t.id) };
}

/** O papel de cada trecho, pela árvore de menor caminho a partir da fonte. */
export function papelDosTrechos(rede: RedeDeIncendio): Map<ObjectId, PapelDoTrecho> {
  const papel = new Map<ObjectId, PapelDoTrecho>();
  if (!rede.noDaFonte) return papel;
  const adj = new Map<string, TuboDaRede[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), x]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), x]);
  }
  // Dijkstra pelo comprimento.
  const dist = new Map<string, number>([[rede.noDaFonte, 0]]);
  const pai = new Map<string, TuboDaRede>();
  const abertos = new Set([rede.noDaFonte]);
  while (abertos.size) {
    let u = '';
    let du = Infinity;
    for (const a of abertos) if ((dist.get(a) ?? Infinity) < du) (u = a, du = dist.get(a)!);
    abertos.delete(u);
    for (const x of adj.get(u) ?? []) {
      const v = x.de === u ? x.para : x.de;
      const nd = du + x.lM;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        pai.set(v, x);
        abertos.add(v);
      }
    }
  }
  const naArvore = new Set([...pai.values()].map((x) => x.trecho.id));
  // Terminais a jusante de cada tubo da árvore.
  const terminaisNoNo = new Map<string, number>();
  for (const [, no] of rede.consumidores) terminaisNoNo.set(no, (terminaisNoNo.get(no) ?? 0) + 1);
  const ordem = [...dist.keys()].sort((a, b) => dist.get(b)! - dist.get(a)!);
  const aJusante = new Map<string, number>();
  for (const no of ordem) {
    const total = (aJusante.get(no) ?? 0) + (terminaisNoNo.get(no) ?? 0);
    aJusante.set(no, total);
    const x = pai.get(no);
    if (x) {
      const cima = x.de === no ? x.para : x.de;
      aJusante.set(cima, (aJusante.get(cima) ?? 0) + total);
    }
  }
  const filhos = new Map<string, number>();
  for (const [no, x] of pai) {
    const cima = x.de === no ? x.para : x.de;
    filhos.set(cima, (filhos.get(cima) ?? 0) + 1);
  }
  for (const x of rede.tubos) {
    if (!naArvore.has(x.trecho.id)) {
      papel.set(x.trecho.id, 'ANEL');
      continue;
    }
    const vertical = x.trecho.a.x === x.trecho.b.x && x.trecho.a.y === x.trecho.b.y;
    const baixo = pai.get(x.para) === x ? x.para : x.de;
    const n = aJusante.get(baixo) ?? 0;
    // GERAL: da fonte até a primeira bifurcação.
    let geral = true;
    for (let no = x.de === baixo ? x.para : x.de; no !== rede.noDaFonte; ) {
      if ((filhos.get(no) ?? 0) > 1) {
        geral = false;
        break;
      }
      const p = pai.get(no);
      if (!p) break;
      no = p.de === no ? p.para : p.de;
    }
    // A bifurcação NA bomba também conta: dois tubos saindo dela não são "o geral".
    if ((filhos.get(rede.noDaFonte) ?? 0) > 1) geral = false;
    papel.set(x.trecho.id, vertical ? 'COLUNA' : geral && (filhos.get(baixo) ?? 0) !== 0 ? 'GERAL' : n <= 1 ? 'SUB_RAMAL' : 'RAMAL');
  }
  return papel;
}

/**
 * O cálculo do AltoQi: cada SISTEMA ligado à rede dá o seu cenário de projeto.
 *  - HIDRANTES: cada um sozinho dá a carga que exigiria; os N mais exigentes são
 *    os mais DESFAVORÁVEIS e abrem juntos; a carga necessária é a menor com que
 *    todos atendem, e o resultado já traz o ponto de equilíbrio.
 *  - SPRINKLERS (E5.1): abrem os N mais desfavoráveis, N = ⌈área de operação ÷
 *    área por sprinkler⌉ do critério, cada um com a vazão mínima densidade ×
 *    área por sprinkler. A ordem é a pressão de cada um aberto sozinho com a
 *    mesma carga (uma resolução por sprinkler). A Área de Operação desenhada
 *    substitui essa escolha na E5.2.
 * O que GOVERNA a bomba (o `cenario`/`abertos`/`cargaNecessariaM` de cima) é o
 * sistema de maior potência hidráulica Q × H; um sistema que não fecha governa,
 * para a tela dizer o porquê. A demanda SOMADA (sprinkler + mangueiras na mesma
 * bomba) é a E5.4.
 */
export function calculoDeIncendio(
  model: BlueprintModel,
  hipDoEstudo: HipotesesHidraulicasDeIncendio,
  criterio: CriterioDeSprinklers | null = null,
  /** D1.2: a reserva de tabela do regulamento (MG: IT 17, Tabela 4) — `calculoDoEstudo` a passa. */
  reservaDeTabela: ReservaDeTabela | null = null,
): CalculoDeIncendio {
  const hip: HipotesesHidraulicasDeIncendio = criterio?.vazaoPorSprinklerLmin != null ? { ...hipDoEstudo, vazaoMinimaSprinklerLmin: criterio.vazaoPorSprinklerLmin } : hipDoEstudo;
  const rede = redeDeIncendio(model);
  const terminais = model.terminais ?? [];
  const desligados = terminais.filter((t) => (ehDeCombate(t) || ehSprinkler(t)) && !rede.noDoTerminal.has(t.id)).map((t) => t.id);
  const papel = papelDosTrechos(rede);
  const rtiDesenhada = rtiDoDesenho(model);
  const base: CalculoDeIncendio = {
    motivo: null, desfavoraveis: [], abertos: [], cargaNecessariaM: null, cenario: null, desligados, papel, estaticaKpa: new Map(),
    porGravidade: rede.tipoDaFonte === 'GRAVIDADE', rti: { exigidaL: reservaDeTabela?.litros ?? null, autonomiaMin: hip.autonomiaMin, porTabela: reservaDeTabela, ...rtiDesenhada },
    hip, criterio, sistema: null, porSistema: { hidrantes: null, sprinklers: null, combinado: null }, areas: [],
  };
  if (!rede.fonte) return { ...base, motivo: 'sem bomba de incêndio nem caixa de incêndio ligada à rede — lance uma das duas e ligue-a à tubulação' };
  const naRede = terminais.filter((t) => ehDeCombate(t) && rede.noDoTerminal.has(t.id));
  const spkNaRede = terminais.filter((t) => ehSprinkler(t) && rede.noDoTerminal.has(t.id));
  if (naRede.length === 0 && spkNaRede.length === 0) return { ...base, motivo: 'nenhum hidrante, mangotinho ou sprinkler ligado à rede' };

  const resolver = (abertos: ObjectId[], autonomiaMin: number, quem: string, h = hip): ResultadoDoSistema => {
    const r = cargaNecessaria(model, h, abertos, rede);
    if (base.porGravidade) {
      // A caixa entrega o que a cota dela dá: o cenário é com carga ZERO acima do fundo.
      const cenario = calcularCenario(model, h, abertos, 0, rede);
      return { abertos, cargaNecessariaM: r?.cargaM ?? null, cenario: cenario.convergiu ? cenario : null, motivo: cenario.convergiu ? null : cenario.motivo, autonomiaMin };
    }
    if (!r) return { abertos, cargaNecessariaM: null, cenario: null, motivo: `nem ${CARGA_MAXIMA_M} m de carga na bomba atendem os ${quem} abertos — a rede está subdimensionada`, autonomiaMin };
    return { abertos, cargaNecessariaM: r.cargaM, cenario: r.cenario, motivo: null, autonomiaMin };
  };

  const desfavoraveis = naRede
    .map((t) => ({ terminalId: t.id, cargaM: cargaNecessaria(model, hip, [t.id], rede)?.cargaM ?? null }))
    .sort((a, b) => (b.cargaM ?? Infinity) - (a.cargaM ?? Infinity) || a.terminalId.localeCompare(b.terminalId));
  const hidrantes = naRede.length
    ? resolver(desfavoraveis.slice(0, Math.min(hip.hidrantesSimultaneos, desfavoraveis.length)).map((d) => d.terminalId), hip.autonomiaMin, 'hidrantes')
    : null;

  // Quem governa: o que não fecha; senão o de maior Q × H (por gravidade, a maior carga exigida).
  const peso = (r: ResultadoDoSistema) => {
    if (base.porGravidade) return r.cargaNecessariaM ?? Infinity;
    return r.cenario && r.cargaNecessariaM != null ? r.cenario.vazaoNaFonteLmin * r.cargaNecessariaM : Infinity;
  };
  const hipDoCriterio = (cr: CriterioDeSprinklers): HipotesesHidraulicasDeIncendio =>
    cr.vazaoPorSprinklerLmin != null ? { ...hipDoEstudo, vazaoMinimaSprinklerLmin: cr.vazaoPorSprinklerLmin } : hipDoEstudo;

  let sprinklers: ResultadoDoSistema | null = null;
  const areas: ResultadoDaArea[] = [];
  const desenhadas = model.areasDeOperacao ?? [];
  if (spkNaRede.length && criterio && desenhadas.length) {
    // E5.2: cada área desenhada abre os sprinklers DELA, com o critério dela.
    for (const a of desenhadas) {
      const cr = criterioDaArea(criterio, a);
      const h = hipDoCriterio(cr);
      const ids = sprinklersDaArea(model, a).filter((t) => rede.noDoTerminal.has(t.id)).map((t) => t.id);
      const vazio = (motivo: string): ResultadoDoSistema => ({ abertos: [], cargaNecessariaM: null, cenario: null, motivo, autonomiaMin: hip.autonomiaMin });
      const r = !cr.risco
        ? vazio('sem o risco dos sprinklers — declare-o na área, nas premissas, ou a divisão da edificação')
        : ids.length === 0
          ? vazio('nenhum sprinkler ligado à rede dentro da área')
          : resolver(ids, cr.duracaoMin ?? hip.autonomiaMin, 'sprinklers da área', h);
      areas.push({ areaId: a.id, criterio: cr, areaDesenhadaM2: areaDoContornoM2(a), resultado: { ...r, criterio: cr, hip: h } });
    }
    const comAbertos = areas.filter((x) => x.resultado.abertos.length > 0);
    sprinklers = comAbertos.length ? comAbertos.reduce((a, b) => (peso(b.resultado) > peso(a.resultado) ? b : a)).resultado : areas[0].resultado;
  } else if (spkNaRede.length) {
    const n = criterio?.sprinklersNaArea ?? null;
    if (n == null) {
      sprinklers = { abertos: [], cargaNecessariaM: null, cenario: null, motivo: 'sem o risco dos sprinklers — declare-o nas premissas, ou a divisão da edificação na classificação', autonomiaMin: hip.autonomiaMin };
    } else {
      const ordem = spkNaRede
        .map((t) => {
          const cen = calcularCenario(model, hip, [t.id], CARGA_DE_ORDENACAO_M, rede);
          return { id: t.id, p: cen.convergiu && cen.terminais.length ? cen.terminais[0].pressaoNoBicoKpa : -Infinity };
        })
        .sort((a, b) => a.p - b.p || a.id.localeCompare(b.id));
      sprinklers = { ...resolver(ordem.slice(0, Math.min(n, ordem.length)).map((o) => o.id), criterio!.duracaoMin ?? hip.autonomiaMin, 'sprinklers'), criterio: criterio!, hip };
    }
  }

  // E5.4: a demanda SOMADA — a área de operação e os hidrantes abertos juntos, com as exigências dos dois.
  let combinado: ResultadoDoSistema | null = null;
  if (hidrantes?.abertos.length && sprinklers?.abertos.length && (criterio?.hipoteses.demandaCombinada ?? true)) {
    const h = sprinklers.hip ?? hip;
    combinado = {
      ...resolver([...sprinklers.abertos, ...hidrantes.abertos], Math.max(sprinklers.autonomiaMin, hidrantes.autonomiaMin), 'sprinklers e hidrantes', h),
      ...(sprinklers.criterio ? { criterio: sprinklers.criterio } : {}),
      hip: h,
    };
  }
  const pares: [SistemaDeIncendio, ResultadoDoSistema | null][] = [['HIDRANTES', hidrantes], ['SPRINKLERS', sprinklers], ['COMBINADO', combinado]];
  const candidatos = pares.filter((x): x is [SistemaDeIncendio, ResultadoDoSistema] => !!x[1] && x[1].abertos.length > 0);
  const porSistema = { hidrantes, sprinklers, combinado };
  if (candidatos.length === 0) return { ...base, desfavoraveis, porSistema, areas, motivo: sprinklers?.motivo ?? 'nada a calcular' };
  const [sistema, g] = candidatos.reduce((a, b) => (peso(b[1]) > peso(a[1]) ? b : a));
  const comum: CalculoDeIncendio = { ...base, hip: g.hip ?? hip, desfavoraveis, porSistema, areas, sistema, abertos: g.abertos, cargaNecessariaM: g.cargaNecessariaM, cenario: g.cenario, motivo: g.motivo };
  if (!g.cenario) return comum;
  const zFonte = rede.cota.get(rede.noDaFonte!)!;
  const carga = base.porGravidade ? 0 : g.cargaNecessariaM!;
  const estaticaKpa = new Map([...naRede, ...spkNaRede].map((t) => [t.id, (zFonte + carga - rede.cota.get(rede.noDoTerminal.get(t.id)!)!) * KPA_POR_MCA_INC]));
  const porVazao = g.cenario.vazaoNaFonteLmin * g.autonomiaMin;
  // D1.2: com a tabela, hidrante sozinho = o volume da tabela; com sprinklers, o maior dos dois.
  const exigidaL = reservaDeTabela ? (sistema === 'HIDRANTES' ? reservaDeTabela.litros : Math.max(reservaDeTabela.litros, porVazao)) : porVazao;
  return { ...comum, estaticaKpa, rti: { ...base.rti, autonomiaMin: g.autonomiaMin, exigidaL } };
}

// ─── DN automático ───────────────────────────────────────────────────────────

/**
 * Sobe o DN dos trechos com velocidade acima da máxima, um DN comercial por vez,
 * e recalcula — até nenhum passar ou 8 rodadas. Devolve os comandos (um lote,
 * desfazível) e quantos trechos mudaram.
 */
export function ajustarDnDeIncendio(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, criterio: CriterioDeSprinklers | null = null): { comandos: Command[]; alterados: number; motivo: string | null } {
  let m = model;
  const novoDn = new Map<ObjectId, number>();
  for (let rodada = 0; rodada < 8; rodada++) {
    const c = calculoDeIncendio(m, hip, criterio);
    if (!c.cenario) return { comandos: [], alterados: 0, motivo: c.motivo };
    const rapidos = c.cenario.trechos.filter((t) => t.velocidadeMs > hip.velocidadeMaxMs + 1e-9);
    if (rapidos.length === 0) break;
    const lote: Command[] = [];
    for (const t of rapidos) {
      const prox = FICHA_DO_MATERIAL[t.material].diametros.map((d) => d.dn).find((dn) => dn > t.dn);
      if (prox == null) continue;
      novoDn.set(t.trechoId, prox);
      lote.push({ type: 'SetTrechoProps', trechoId: t.trechoId, bitolaMm: prox } as Command);
    }
    if (lote.length === 0) break;
    m = applyBatch(m, lote).model;
  }
  const comandos = [...novoDn].map(([trechoId, bitolaMm]) => ({ type: 'SetTrechoProps', trechoId, bitolaMm }) as Command);
  return { comandos, alterados: comandos.length, motivo: null };
}
