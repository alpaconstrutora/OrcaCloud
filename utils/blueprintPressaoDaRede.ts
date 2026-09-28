/**
 * A PRESSÃO EM CADA PONTO DA REDE DE ÁGUA (28/09/2026, E1.3 do roadmap
 * hidrossanitário — NBR 5626:2020).
 *
 * Percorre a rede de uma ORIGEM (caixa d'água → água fria; aquecedor → água
 * quente) em árvore, da origem para os pontos, e em cada trecho:
 *
 *   carga a jusante = carga a montante + desnível − perda distribuída
 *                     − perda localizada (conexão no nó de montante, peças
 *                       sobre o trecho) − perda do hidrômetro
 *
 * em metros de coluna d'água. A VAZÃO do trecho é a de projeto dos pontos a
 * jusante (Q = 0,3·√ΣP, a mesma do dimensionamento); a perda, a de
 * `blueprintHidraulicaPressao` (Darcy-Weisbach + Swamee-Jain; comprimento
 * equivalente). O TÊ perde como passagem direta quando o trecho de saída segue
 * alinhado com o de chegada, e como saída lateral senão.
 *
 * ORIGEM: na caixa d'água, a carga é a LÂMINA d'água acima do fundo (hipótese;
 * zero = nível mínimo, o conservador). No aquecedor, é a pressão que a rede FRIA
 * entrega a ele menos a perda do aparelho (hipótese). A PRESSÃO ESTÁTICA é o
 * desnível sem perdas — a NBR 5626 limita a 400 kPa. A VRP limita a pressão a
 * jusante ao ajuste (hipótese), dinâmica e estática.
 *
 * Ponto sem caminho até a origem: NÃO AVALIADO (e não "zero", que pareceria
 * número conferido).
 */
import type { BlueprintModel, Command, DisciplinaDeRede, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { applyBatch, applyCommand, conexoesDerivadas, materialDoTrecho } from './blueprintKernel';
import { fazerChave, comprimentoMm } from './blueprintGrafoDeRede';
import { DIAMETROS, origensDeAgua, pesoDoPonto, pontosDeAgua, redeDaOrigem, vazaoDeProjetoLs, type PlanoDeAgua } from './blueprintAguaAutomatica';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import {
  KPA_POR_MCA,
  VISCOSIDADE_20C,
  VISCOSIDADE_60C,
  perdaDistribuida,
  perdaLocalizadaMca,
  perdaNoHidrometroKpa,
  type PecaDePerda,
} from './blueprintHidraulicaPressao';

export interface HipotesesDePressao {
  /** Lâmina d'água acima do fundo da caixa usada no cálculo, mm (0 = nível mínimo). */
  laminaDaguaMm: number;
  /** Perda de carga no aquecedor, kPa (aquecedor de passagem a gás: 20 a 50 usual). */
  perdaDoAquecedorKpa: number;
  /** Pressão a jusante de uma VRP, kPa. */
  ajusteDaVrpKpa: number;
  /** Vazão máxima do hidrômetro, m³/h (Qn 1,5 → Qmáx 3). */
  qMaxDoHidrometroM3h: number;
  /** Pressão dinâmica mínima geral, kPa (NBR 5626:2020). */
  pressaoMinimaKpa: number;
  /** Pressão estática máxima, kPa (NBR 5626). */
  estaticaMaximaKpa: number;
}

export const HIPOTESES_PRESSAO_PADRAO: HipotesesDePressao = {
  laminaDaguaMm: 0,
  perdaDoAquecedorKpa: 20,
  ajusteDaVrpKpa: 200,
  qMaxDoHidrometroM3h: 3,
  pressaoMinimaKpa: 10,
  estaticaMaximaKpa: 400,
};

export type EstadoDaPressao = 'OK' | 'INSUFICIENTE' | 'EXCESSIVA' | 'NAO_AVALIADO';

export interface PressaoNoPonto {
  terminalId: ObjectId;
  levelId: ObjectId;
  at: { x: number; y: number };
  nome: string;
  disponivelKpa: number | null;
  minimaKpa: number;
  estaticaKpa: number | null;
  estado: EstadoDaPressao;
  motivo?: string;
}

export interface TrechoCalculado {
  trechoId: ObjectId;
  vazaoLs: number;
  velocidadeMs: number;
  perdaDistribuidaMca: number;
  perdaLocalizadaMca: number;
  /** Pressão dinâmica na ponta de jusante, kPa. */
  pressaoJusanteKpa: number;
}

export interface PressoesDaRede {
  origemId: ObjectId;
  disciplina: DisciplinaDeRede;
  pontos: PressaoNoPonto[];
  trechos: TrechoCalculado[];
  /** O ponto de MENOR folga (disponível − mínima) — o que manda na rede. */
  criticoId: ObjectId | null;
  motivo: string | null;
  /** Os trechos da origem até cada ponto, na ordem da água (E1.4 usa para escolher o que aumentar). */
  caminhos: Record<ObjectId, ObjectId[]>;
  /** Avisos do cálculo (hidrômetro acima da vazão máxima…). */
  avisos: string[];
}

type P3 = [number, number, number];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norma = (a: P3) => Math.hypot(a[0], a[1], a[2]);
/** Os dois vetores estão ALINHADOS (colineares, mesmo sentido) — ângulo < 10°. */
const alinhados = (a: P3, b: P3) => {
  const na = norma(a);
  const nb = norma(b);
  if (na === 0 || nb === 0) return false;
  return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb) > Math.cos((10 * Math.PI) / 180);
};

/** Peças sobre o trecho que perdem carga, pelo tipo hidráulico do terminal. */
const PECA_DO_TERMINAL: Partial<Record<string, PecaDePerda>> = {
  REGISTRO_GAVETA: 'REGISTRO_GAVETA',
  REGISTRO_PRESSAO: 'REGISTRO_PRESSAO',
  REGISTRO_ESFERA: 'REGISTRO_ESFERA',
  VALVULA_RETENCAO: 'VALVULA_RETENCAO',
};

/** O terminal fica sobre o trecho (em planta, a ≤ 1,5 mm do segmento, mesmo pavimento)? */
function sobreOTrecho(term: Terminal, t: Trecho): boolean {
  if (term.levelId !== t.levelId) return false;
  const dx = t.b.x - t.a.x;
  const dy = t.b.y - t.a.y;
  const c2 = dx * dx + dy * dy;
  const u = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((term.at.x - t.a.x) * dx + (term.at.y - t.a.y) * dy) / c2));
  return Math.hypot(term.at.x - (t.a.x + u * dx), term.at.y - (t.a.y + u * dy)) <= 1.5;
}

/**
 * As pressões da rede de UMA origem. `cargaInicialMca` sobrescreve a carga na
 * origem (é por onde o aquecedor recebe o que a rede fria entrega).
 */
export function pressoesDaOrigem(
  model: BlueprintModel,
  origem: Terminal,
  hip: HipotesesDePressao = HIPOTESES_PRESSAO_PADRAO,
  cargaInicialMca?: { dinamica: number; estatica: number } | null,
): PressoesDaRede {
  const disciplina: DisciplinaDeRede = origem.tipoHidraulico === 'AQUECEDOR' ? 'AGUA_QUENTE' : 'AGUA_FRIA';
  const viscosidade = disciplina === 'AGUA_QUENTE' ? VISCOSIDADE_60C : VISCOSIDADE_20C;
  const chave = fazerChave(model.levels);
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const rede = redeDaOrigem(model, origem, disciplina);
  const pontos = pontosDeAgua(model, origem, disciplina);
  const vazio = (motivo: string): PressoesDaRede => ({
    origemId: origem.id, disciplina, trechos: [], criticoId: null, motivo, caminhos: {}, avisos: [],
    pontos: pontos.map((p) => ({ terminalId: p.id, levelId: p.levelId, at: { ...p.at }, nome: nomeDoPonto(p), disponivelKpa: null, estaticaKpa: null, minimaKpa: minimaDe(p, hip), estado: 'NAO_AVALIADO', motivo })),
  });
  if (cargaInicialMca === null) return vazio('a rede fria não chega ao aquecedor — a pressão da quente depende dela');
  if (rede.length === 0) return vazio('a origem ainda não tem rede');

  // ── Nós: posição absoluta (mm) e adjacência ─────────────────────────────
  const pos = new Map<string, P3>();
  const adj = new Map<string, { t: Trecho; outro: string }[]>();
  const ponta = (t: Trecho, qual: 'a' | 'b') => {
    const p = qual === 'a' ? t.a : t.b;
    const cota = qual === 'a' ? t.cotaAMm : t.cotaBMm;
    const k = chave(t.levelId, p.x, p.y, cota);
    pos.set(k, [p.x, p.y, (elev.get(t.levelId) ?? 0) + cota]);
    return k;
  };
  for (const t of rede) {
    const a = ponta(t, 'a');
    const b = ponta(t, 'b');
    adj.set(a, [...(adj.get(a) ?? []), { t, outro: b }]);
    adj.set(b, [...(adj.get(b) ?? []), { t, outro: a }]);
  }
  const raiz = chave(origem.levelId, origem.at.x, origem.at.y, origem.cotaMm);
  if (!adj.has(raiz)) return vazio('a rede não sai da posição da origem');

  // ── Árvore a partir da origem ────────────────────────────────────────────
  const pai = new Map<string, { de: string; t: Trecho }>();
  const ordem: string[] = [raiz];
  const vistos = new Set([raiz]);
  for (let i = 0; i < ordem.length; i++) {
    for (const { t, outro } of adj.get(ordem[i]) ?? []) {
      if (vistos.has(outro)) continue;
      vistos.add(outro);
      pai.set(outro, { de: ordem[i], t });
      ordem.push(outro);
    }
  }

  // ── Peso a jusante de cada nó ────────────────────────────────────────────
  const pesoNoNo = new Map<string, number>();
  for (const p of pontos) {
    const k = chave(p.levelId, p.at.x, p.at.y, p.cotaMm);
    pesoNoNo.set(k, (pesoNoNo.get(k) ?? 0) + pesoDoPonto(model, p, disciplina));
  }
  const pesoAJusante = new Map<string, number>();
  for (let i = ordem.length - 1; i >= 0; i--) {
    const k = ordem[i];
    pesoAJusante.set(k, (pesoAJusante.get(k) ?? 0) + (pesoNoNo.get(k) ?? 0));
    const p = pai.get(k);
    if (p) pesoAJusante.set(p.de, (pesoAJusante.get(p.de) ?? 0) + pesoAJusante.get(k)!);
  }

  // ── Conexões por nó e peças sobre cada trecho ────────────────────────────
  const conexaoNoNo = new Map(
    conexoesDerivadas(model).conexoes.filter((c) => c.disciplina === disciplina).map((c) => [`${c.levelId}|${c.no.x},${c.no.y}|${c.cotaMm}`, c]),
  );
  const pecasDe = (t: Trecho) => (model.terminais ?? []).filter((x) => x.disciplina === disciplina && x.tipoHidraulico && sobreOTrecho(x, t));

  // ── A caminhada ──────────────────────────────────────────────────────────
  const cargaMca = new Map<string, number>([[raiz, cargaInicialMca?.dinamica ?? hip.laminaDaguaMm / 1000]]);
  const estaticaMca = new Map<string, number>([[raiz, cargaInicialMca?.estatica ?? hip.laminaDaguaMm / 1000]]);
  const trechos: TrechoCalculado[] = [];
  const avisos: string[] = [];
  for (const k of ordem.slice(1)) {
    const { de, t } = pai.get(k)!;
    const q = vazaoDeProjetoLs(pesoAJusante.get(k) ?? 0);
    const material = materialDoTrecho(t) ?? 'PVC_SOLDAVEL';
    const dist = perdaDistribuida(q, material, t.bitolaMm, comprimentoMm(t) / 1000, viscosidade);
    // Peça no nó de MONTANTE, vista pela água que entra neste trecho.
    let pecaNoNo: PecaDePerda | null = null;
    if (de === raiz) pecaNoNo = 'ENTRADA';
    else {
      const c = conexaoNoNo.get(de);
      if (c) {
        if (c.tipo === 'JOELHO_90') pecaNoNo = 'JOELHO_90';
        else if (c.tipo === 'JOELHO_45') pecaNoNo = 'JOELHO_45';
        else if (c.tipo === 'LUVA') pecaNoNo = 'LUVA';
        else if (c.tipo === 'REDUCAO') pecaNoNo = 'REDUCAO';
        else {
          // Tê, junção, cruzeta: passagem se a saída segue a chegada.
          const avo = pai.get(de)!.de;
          const chegada = sub(pos.get(de)!, pos.get(avo)!);
          const saida = sub(pos.get(k)!, pos.get(de)!);
          pecaNoNo = alinhados(chegada, saida) ? 'TE_PASSAGEM' : 'TE_LATERAL';
        }
      }
    }
    let local = pecaNoNo ? perdaLocalizadaMca(pecaNoNo, q, material, t.bitolaMm, viscosidade) : 0;
    let vrp = false;
    for (const pc of pecasDe(t)) {
      const peca = PECA_DO_TERMINAL[pc.tipoHidraulico!];
      if (peca) local += perdaLocalizadaMca(peca, q, material, t.bitolaMm, viscosidade);
      if (pc.tipoHidraulico === 'HIDROMETRO') {
        local += perdaNoHidrometroKpa(q, hip.qMaxDoHidrometroM3h) / KPA_POR_MCA;
        // VAZÃO SUPORTADA (E1.4): acima da máxima o hidrômetro não mede nem aguenta.
        if (q > hip.qMaxDoHidrometroM3h / 3.6) {
          avisos.push(`hidrômetro com vazão de projeto ${q.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L/s acima da máxima dele (${(hip.qMaxDoHidrometroM3h / 3.6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L/s = ${hip.qMaxDoHidrometroM3h} m³/h) — troque por um maior`);
        }
      }
      if (pc.tipoHidraulico === 'VRP') vrp = true;
    }
    const desnivel = (pos.get(de)![2] - pos.get(k)![2]) / 1000;
    let h = cargaMca.get(de)! + desnivel - dist.perdaMca - local;
    let s = estaticaMca.get(de)! + desnivel;
    if (vrp) {
      h = Math.min(h, hip.ajusteDaVrpKpa / KPA_POR_MCA);
      s = Math.min(s, hip.ajusteDaVrpKpa / KPA_POR_MCA);
    }
    cargaMca.set(k, h);
    estaticaMca.set(k, s);
    trechos.push({
      trechoId: t.id, vazaoLs: q, velocidadeMs: dist.velocidadeMs,
      perdaDistribuidaMca: dist.perdaMca, perdaLocalizadaMca: local, pressaoJusanteKpa: h * KPA_POR_MCA,
    });
  }

  // ── Os pontos ────────────────────────────────────────────────────────────
  const resultado: PressaoNoPonto[] = pontos.map((p) => {
    const k = chave(p.levelId, p.at.x, p.at.y, p.cotaMm);
    const base = { terminalId: p.id, levelId: p.levelId, at: { ...p.at }, nome: nomeDoPonto(p), minimaKpa: minimaDe(p, hip) };
    if (!cargaMca.has(k)) return { ...base, disponivelKpa: null, estaticaKpa: null, estado: 'NAO_AVALIADO' as const, motivo: 'ponto não ligado à rede desta origem' };
    const disponivel = cargaMca.get(k)! * KPA_POR_MCA;
    const estatica = estaticaMca.get(k)! * KPA_POR_MCA;
    const estado: EstadoDaPressao = disponivel < base.minimaKpa ? 'INSUFICIENTE' : estatica > hip.estaticaMaximaKpa ? 'EXCESSIVA' : 'OK';
    return { ...base, disponivelKpa: disponivel, estaticaKpa: estatica, estado };
  });
  const caminhos: Record<ObjectId, ObjectId[]> = {};
  for (const p of pontos) {
    let k = chave(p.levelId, p.at.x, p.at.y, p.cotaMm);
    if (!cargaMca.has(k)) continue;
    const ids: ObjectId[] = [];
    for (let e = pai.get(k); e; e = pai.get(k)) {
      ids.push(e.t.id);
      k = e.de;
    }
    caminhos[p.id] = ids.reverse();
  }
  const avaliados = resultado.filter((r) => r.disponivelKpa != null);
  const critico = avaliados.sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa))[0] ?? null;
  return {
    origemId: origem.id, disciplina, trechos, criticoId: critico?.terminalId ?? null, motivo: null, caminhos, avisos,
    pontos: resultado.sort((a, b) => a.nome.localeCompare(b.nome) || a.terminalId.localeCompare(b.terminalId)),
  };
}

function minimaDe(p: Terminal, hip: HipotesesDePressao): number {
  return (p.tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[p.tipoHidraulico].pressaoMinimaKpa : undefined) ?? hip.pressaoMinimaKpa;
}

function nomeDoPonto(p: Terminal): string {
  return p.rotulo || (p.tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[p.tipoHidraulico].rotulo : p.tipo);
}

/**
 * Todas as redes de água do modelo: primeiro as FRIAS (de cada caixa d'água),
 * depois as QUENTES, cada uma partindo do que a fria entrega ao aquecedor (o
 * terminal de água fria do aquecedor a até 600 mm do de água quente).
 */
export function pressoesDoModelo(model: BlueprintModel, hip: HipotesesDePressao = HIPOTESES_PRESSAO_PADRAO): PressoesDaRede[] {
  const origens = origensDeAgua(model);
  const frias = origens.filter((o) => o.disciplina === 'AGUA_FRIA').map((o) => pressoesDaOrigem(model, o.origem, hip));
  const quentes = origens
    .filter((o) => o.disciplina === 'AGUA_QUENTE')
    .map((o) => {
      const aq = o.origem;
      const entrada = frias
        .flatMap((f) => f.pontos)
        .find((p) => p.disponivelKpa != null && p.levelId === aq.levelId && Math.hypot(p.at.x - aq.at.x, p.at.y - aq.at.y) <= 600 &&
          (model.terminais ?? []).some((t) => t.id === p.terminalId && t.tipoHidraulico === 'AQUECEDOR'));
      const carga = entrada
        ? {
            dinamica: (entrada.disponivelKpa! - hip.perdaDoAquecedorKpa) / KPA_POR_MCA,
            estatica: entrada.estaticaKpa! / KPA_POR_MCA,
          }
        : null;
      return pressoesDaOrigem(model, aq, hip, carga);
    });
  return [...frias, ...quentes];
}

// ─── E1.4 — DIMENSIONAR POR PRESSÃO ──────────────────────────────────────────

/** Limite de passos do ajuste — cada passo aumenta UM trecho em UM DN. */
const MAX_PASSOS_DO_AJUSTE = 80;

/**
 * DIMENSIONAR POR PRESSÃO (28/09/2026, E1.4 — NBR 5626:2020): o DN deixa de
 * ser só "velocidade ≤ limite". Enquanto houver ponto INSUFICIENTE, no caminho
 * do de menor folga aumenta-se em UM DN comercial o trecho SUGERIDO de maior
 * perda por metro (é onde o ganho é maior), e recalcula-se. Determinístico.
 *
 * Não mexe em trecho CONFIRMADO (quem aceitou decidiu) — avisa. E não tenta o
 * impossível: se nem a pressão ESTÁTICA (o desnível sem perda nenhuma) chega à
 * mínima, nenhum diâmetro resolve, e o aviso diz o que resolve (elevar a caixa
 * ou pressurizar).
 */
export function ajustarDnPorPressao(
  model: BlueprintModel,
  origemId: ObjectId,
  hip: HipotesesDePressao = HIPOTESES_PRESSAO_PADRAO,
): { comandos: Extract<Command, { type: 'SetTrechoProps' }>[]; avisos: string[] } {
  let m = model;
  const novoDn = new Map<ObjectId, number>();
  const avisos: string[] = [];
  const desistidos = new Set<ObjectId>();
  const kpa = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  for (let passo = 0; passo < MAX_PASSOS_DO_AJUSTE; passo++) {
    const r = pressoesDoModelo(m, hip).find((x) => x.origemId === origemId);
    if (!r) break;
    const ruim = r.pontos
      .filter((p) => p.estado === 'INSUFICIENTE' && !desistidos.has(p.terminalId))
      .sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa) || a.terminalId.localeCompare(b.terminalId))[0];
    if (!ruim) break;
    if (ruim.estaticaKpa! < ruim.minimaKpa) {
      desistidos.add(ruim.terminalId);
      avisos.push(`${ruim.nome}: o desnível até a caixa dá só ${kpa(ruim.estaticaKpa!)} kPa, abaixo da mínima de ${kpa(ruim.minimaKpa)} — nenhum diâmetro resolve; eleve a caixa ou pressurize`);
      continue;
    }
    const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
    const calculado = new Map(r.trechos.map((t) => [t.trechoId, t]));
    const candidato = (r.caminhos[ruim.terminalId] ?? [])
      .map((id) => porId.get(id)!)
      .filter((t) => t && t.sugerido)
      .map((t) => {
        const tabela = DIAMETROS[materialDoTrecho(t) ?? 'PVC_SOLDAVEL'];
        const proximo = tabela.find((l) => l.dn > t.bitolaMm)?.dn ?? null;
        const c = calculado.get(t.id);
        const metros = Math.max(Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm) / 1000, 0.001);
        return { t, proximo, porMetro: c ? (c.perdaDistribuidaMca + c.perdaLocalizadaMca) / metros : 0 };
      })
      .filter((x) => x.proximo != null)
      .sort((a, b) => b.porMetro - a.porMetro || a.t.id.localeCompare(b.t.id))[0];
    if (!candidato) {
      desistidos.add(ruim.terminalId);
      avisos.push(`${ruim.nome}: ${kpa(ruim.disponivelKpa!)} < ${kpa(ruim.minimaKpa)} kPa e o caminho não tem trecho sugerido para aumentar (confirmados, ou já no maior DN) — aumente à mão`);
      continue;
    }
    novoDn.set(candidato.t.id, candidato.proximo!);
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: candidato.t.id, bitolaMm: candidato.proximo! }).model;
  }
  return {
    comandos: [...novoDn.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([trechoId, bitolaMm]) => ({ type: 'SetTrechoProps' as const, trechoId, bitolaMm })),
    avisos,
  };
}

/**
 * O PLANO DA ÁGUA com o ajuste por pressão (E1.4): aplica o plano numa cópia,
 * ajusta e devolve o mesmo plano com os `SetTrechoProps` no fim — UM lote, um
 * Ctrl+Z. Os ids dos trechos novos são os que o editor vai dar ao aplicar o
 * mesmo lote no mesmo modelo (o kernel é determinístico).
 */
export function comAjusteDePressao(model: BlueprintModel, plano: PlanoDeAgua, hip: HipotesesDePressao = HIPOTESES_PRESSAO_PADRAO): PlanoDeAgua & { ajustadosPorPressao: number } {
  let aplicado: BlueprintModel;
  try {
    aplicado = applyBatch(model, plano.comandos).model;
  } catch {
    return { ...plano, ajustadosPorPressao: 0 };
  }
  const { comandos, avisos } = ajustarDnPorPressao(aplicado, plano.origemId, hip);
  if (comandos.length === 0 && avisos.length === 0) return { ...plano, ajustadosPorPressao: 0 };
  const dnFinal = Math.max(plano.dnMaximoMm, ...comandos.map((c) => c.bitolaMm ?? 0));
  return {
    ...plano,
    comandos: [...plano.comandos, ...comandos],
    dnMaximoMm: dnFinal,
    avisos: [
      ...plano.avisos,
      ...(comandos.length > 0 ? [`${comandos.length} trecho(s) com o DN aumentado para atender a pressão mínima (NBR 5626)`] : []),
      ...avisos,
    ],
    motivo: comandos.length > 0 ? null : plano.motivo,
    ajustadosPorPressao: comandos.length,
  };
}

