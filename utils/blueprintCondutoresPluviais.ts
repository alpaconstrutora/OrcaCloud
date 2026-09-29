/**
 * CONDUTORES DE ÁGUAS PLUVIAIS — verticais e horizontais (29/09/2026, E6.3 do roadmap hidrossanitário,
 * NBR 10844:1989 5.6 e 5.7).
 *
 * ⚠️ Não confundir com `blueprintCondutores.ts` — os condutores ELÉTRICOS (fios) do eletroduto.
 *
 * Do bocal da calha (ou do ralo pluvial de piso) à caixa de areia e à saída
 * para a sarjeta ou a galeria pluvial:
 *
 *   - CONDUTOR VERTICAL: desce na posição do bocal, pavimento a pavimento (a
 *     laje é o encontro), até a profundidade do condutor enterrado. Diâmetro
 *     mínimo de 70 mm (5.6.3) — o comercial é 75. A capacidade sai da fórmula
 *     de Wyly–Eaton com ocupação de 1/3 (a da EN 12056-3):
 *     Q = 2,5·10⁻⁴·k^(−1/6)·d^(8/3)·f^(5/3) L/s, k = 0,25 mm, f = 0,33. ⚠️ A
 *     NBR 10844 dimensiona pelo ÁBACO da Figura 3 (vazão × altura da lâmina na
 *     calha × comprimento do condutor), que não é transcrível com segurança —
 *     CONFERIR NO ÁBACO antes de emitir;
 *   - CONDUTOR HORIZONTAL: Manning com lâmina de 2/3 do diâmetro (5.7.3) — a
 *     conta reproduz a Tabela 4 da norma (DN 100, n 0,011, 0,5 % → 204 L/min,
 *     teste); declividade mínima de 0,5 % (5.7.2). Do pé do condutor vertical
 *     à caixa de areia mais perto (ou, sem caixa, à saída), e de cada caixa à
 *     saída pluvial;
 *   - o DN do horizontal nunca é menor que o do vertical que o alimenta, nem o
 *     de saída da caixa menor que o de quem chega a ela.
 *
 * A VAZÃO do bocal é a das calhas que terminam nele (E6.2); a do ralo de piso,
 * zero — a área de piso descoberto ainda não entra na contribuição. A
 * VERIFICAÇÃO acumula a vazão pela rede inteira (a lançada e a desenhada à
 * mão), por gravidade: cada trecho leva o que vem de cima.
 */
import type { BlueprintModel, Command, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { extensaoVerticalDaCaixa } from './blueprintKernel';
import { fazerChave, type No } from './blueprintGrafoDeRede';
import { RUGOSIDADE_DA_CALHA, ehCalha, verificarCalhas } from './blueprintCalhas';
import type { HipotesesPluviais } from './blueprintPluvial';

export const ROTULO_DO_CONDUTOR_VERTICAL = 'Condutor vertical';
export const ROTULO_DO_CONDUTOR_HORIZONTAL = 'Condutor horizontal';
/** Os DN comerciais dos condutores (PVC série R). */
export const DN_DOS_CONDUTORES_MM: readonly number[] = [75, 100, 150, 200, 250, 300];
/** Diâmetro mínimo do condutor vertical (NBR 10844, 5.6.3: 70 mm → 75 comercial). */
export const DN_MINIMO_DO_VERTICAL_MM = 75;
export const DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT = 0.5;
const K_MANNING = 60_000;

/** Capacidade do condutor horizontal (L/min): Manning com lâmina de 2/3 do diâmetro. */
export function capacidadeDoHorizontalLMin(dnMm: number, n: number, declividadePct: number): number {
  if (declividadePct <= 0) return 0;
  const D = dnMm / 1000;
  const teta = 2 * Math.acos(1 - 2 * (2 / 3)); // ângulo central da lâmina a 2/3
  const area = ((D * D) / 8) * (teta - Math.sin(teta));
  const rh = area / ((D * teta) / 2);
  return ((K_MANNING * area) / n) * rh ** (2 / 3) * Math.sqrt(declividadePct / 100);
}

/** Capacidade do condutor vertical (L/min): Wyly–Eaton, ocupação 1/3 (EN 12056-3). CONFERIR NO ÁBACO DA NBR 10844. */
export function capacidadeDoVerticalLMin(dnMm: number): number {
  return 2.5e-4 * 0.25 ** (-1 / 6) * dnMm ** (8 / 3) * 0.33 ** (5 / 3) * 60;
}

const menorDn = (cabe: (dn: number) => boolean, minimo: number) => DN_DOS_CONDUTORES_MM.find((dn) => dn >= minimo && cabe(dn)) ?? DN_DOS_CONDUTORES_MM[DN_DOS_CONDUTORES_MM.length - 1];
export const dnDoVertical = (vazaoLMin: number) => menorDn((dn) => capacidadeDoVerticalLMin(dn) + 1e-9 >= vazaoLMin, DN_MINIMO_DO_VERTICAL_MM);
export const dnDoHorizontal = (vazaoLMin: number, n: number, declividadePct: number, minimo = DN_DOS_CONDUTORES_MM[0]) =>
  menorDn((dn) => capacidadeDoHorizontalLMin(dn, n, declividadePct) + 1e-9 >= vazaoLMin, minimo);

const ehCondutor = (t: Trecho) => t.disciplina === 'PLUVIAL' && !ehCalha(t);
const rugosidade = (hip: HipotesesPluviais) => RUGOSIDADE_DA_CALHA[hip.materialDaCalha]?.n ?? 0.011;

/** A vazão que chega a cada bocal: a das calhas cuja ponta BAIXA está nele. */
function vazaoDosBocais(model: BlueprintModel, hip: HipotesesPluviais): Map<ObjectId, number> {
  const calhas = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const porBocal = new Map<ObjectId, number>();
  const bocais = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RALO_PLUVIAL');
  for (const b of bocais) porBocal.set(b.id, 0);
  for (const c of verificarCalhas(model, hip)) {
    const t = calhas.get(c.trechoId)!;
    const baixa = t.cotaAMm <= t.cotaBMm ? t.a : t.b;
    const b = bocais.find((x) => x.levelId === t.levelId && x.at.x === baixa.x && x.at.y === baixa.y);
    if (b && c.vazaoLMin != null) porBocal.set(b.id, (porBocal.get(b.id) ?? 0) + c.vazaoLMin);
  }
  return porBocal;
}

// ─── A verificação ─────────────────────────────────────────────────────────

export interface CondutorVerificado {
  trechoId: ObjectId;
  levelId: ObjectId;
  vertical: boolean;
  dnMm: number;
  vazaoLMin: number;
  capacidadeLMin: number;
  /** `null` no vertical. */
  declividadePct: number | null;
  declividadeOk: boolean;
  atende: boolean;
}

/** Toda a rede pluvial (fora as calhas), com a vazão acumulada por gravidade. */
export function verificarCondutores(model: BlueprintModel, hip: HipotesesPluviais): CondutorVerificado[] {
  const trechos = (model.trechos ?? []).filter(ehCondutor).sort((a, b) => a.id.localeCompare(b.id));
  if (trechos.length === 0) return [];
  const chave = fazerChave(model.levels);
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const n = rugosidade(hip);
  // Caixas de areia e saídas: todo nó no xy delas (dentro da caixa) é o MESMO nó.
  const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'CAIXA_AREIA' || t.tipoHidraulico === 'LIGACAO_PLUVIAL');
  const noDe = (levelId: ObjectId, x: number, y: number, cota: number): No => {
    for (const c of caixas) {
      if (c.at.x !== x || c.at.y !== y) continue;
      const ext = extensaoVerticalDaCaixa(c) ?? { fundoMm: c.cotaMm, topoMm: c.cotaMm };
      if (chave(levelId, x, y, 0) === chave(c.levelId, x, y, 0) && cota >= ext.fundoMm - 1 && cota <= ext.topoMm + 1) return `caixa|${c.id}`;
    }
    return chave(levelId, x, y, cota);
  };
  const z = (levelId: ObjectId, cota: number) => (elev.get(levelId) ?? 0) + cota;
  // Cada trecho de cima para baixo (a ponta mais alta é a de montante).
  const arestas = trechos.map((t) => {
    const aAlta = z(t.levelId, t.cotaAMm) >= z(t.levelId, t.cotaBMm);
    return {
      t,
      de: aAlta ? noDe(t.levelId, t.a.x, t.a.y, t.cotaAMm) : noDe(t.levelId, t.b.x, t.b.y, t.cotaBMm),
      para: aAlta ? noDe(t.levelId, t.b.x, t.b.y, t.cotaBMm) : noDe(t.levelId, t.a.x, t.a.y, t.cotaAMm),
      zDe: Math.max(z(t.levelId, t.cotaAMm), z(t.levelId, t.cotaBMm)),
    };
  });
  // As fontes: a vazão de cada bocal entra no nó dele.
  const entrada = new Map<No, number>();
  const porBocal = vazaoDosBocais(model, hip);
  for (const b of (model.terminais ?? []).filter((x) => x.tipoHidraulico === 'RALO_PLUVIAL')) {
    const k = noDe(b.levelId, b.at.x, b.at.y, b.cotaMm);
    entrada.set(k, (entrada.get(k) ?? 0) + (porBocal.get(b.id) ?? 0));
  }
  // Por gravidade: o nó mais alto primeiro; o que entra num nó sai, dividido, pelas arestas que descem dele.
  const ordem = [...arestas].sort((x, y) => y.zDe - x.zDe || x.t.id.localeCompare(y.t.id));
  const saidas = new Map<No, number>();
  for (const a of arestas) saidas.set(a.de, (saidas.get(a.de) ?? 0) + 1);
  const vazao = new Map<ObjectId, number>();
  for (const a of ordem) {
    const q = (entrada.get(a.de) ?? 0) / (saidas.get(a.de) ?? 1);
    vazao.set(a.t.id, q);
    entrada.set(a.para, (entrada.get(a.para) ?? 0) + q);
  }
  return trechos.map((t) => {
    const plantaMm = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    const vertical = plantaMm === 0;
    const declividadePct = vertical ? null : (Math.abs(t.cotaAMm - t.cotaBMm) / plantaMm) * 100;
    const capacidadeLMin = vertical ? capacidadeDoVerticalLMin(t.bitolaMm) : capacidadeDoHorizontalLMin(t.bitolaMm, n, declividadePct!);
    const q = vazao.get(t.id) ?? 0;
    const declividadeOk = vertical || declividadePct! + 1e-9 >= DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT;
    const dnOk = !vertical || t.bitolaMm >= DN_MINIMO_DO_VERTICAL_MM;
    return { trechoId: t.id, levelId: t.levelId, vertical, dnMm: t.bitolaMm, vazaoLMin: q, capacidadeLMin, declividadePct, declividadeOk, atende: declividadeOk && dnOk && capacidadeLMin + 1e-9 >= q };
  });
}

// ─── O lançamento ──────────────────────────────────────────────────────────

export interface PlanoDeCondutores {
  motivo: string | null;
  /** Bocais e ralos ligados por este plano. */
  fontes: number;
  verticais: number;
  horizontais: number;
  apagados: number;
  avisos: string[];
  comandos: Command[];
}

export function planejarCondutores(model: BlueprintModel, hip: HipotesesPluviais): PlanoDeCondutores {
  const vazio = (motivo: string): PlanoDeCondutores => ({ motivo, fontes: 0, verticais: 0, horizontais: 0, apagados: 0, avisos: [], comandos: [] });
  const terminais = model.terminais ?? [];
  const fontes = terminais.filter((t) => t.tipoHidraulico === 'RALO_PLUVIAL').sort((a, b) => a.id.localeCompare(b.id));
  if (fontes.length === 0) return vazio('Lance as calhas (o condutor desce do bocal) ou ponha um ralo pluvial.');
  const caixasDeAreia = terminais.filter((t) => t.tipoHidraulico === 'CAIXA_AREIA').sort((a, b) => a.id.localeCompare(b.id));
  const saidas = terminais.filter((t) => t.tipoHidraulico === 'LIGACAO_PLUVIAL').sort((a, b) => a.id.localeCompare(b.id));
  if (caixasDeAreia.length === 0 && saidas.length === 0) return vazio('Coloque a caixa de areia ou a saída pluvial (sarjeta ou galeria) — é para lá que os condutores correm.');

  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const indice = new Map(niveis.map((l, i) => [l.id, i]));
  const destinoNivel = (caixasDeAreia[0] ?? saidas[0]).levelId;
  const idxDestino = indice.get(destinoNivel) ?? 0;
  const n = rugosidade(hip);
  const i = Math.max(DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT, hip.declividadeDoCondutorPct);
  const enterrado = -Math.abs(hip.profundidadeDoCondutorMm);

  // Relançar: os condutores SUGERIDOS saem; os confirmados ficam, e a fonte que eles já ligam também.
  const comandos: Command[] = [];
  const trechos = model.trechos ?? [];
  const sugeridos = trechos.filter((t) => ehCondutor(t) && t.sugerido);
  for (const t of sugeridos) comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
  const confirmados = trechos.filter((t) => ehCondutor(t) && !t.sugerido);
  const jaLigada = (f: Terminal) => confirmados.some((t) => t.levelId === f.levelId && ((t.a.x === f.at.x && t.a.y === f.at.y && t.cotaAMm === f.cotaMm) || (t.b.x === f.at.x && t.b.y === f.at.y && t.cotaBMm === f.cotaMm)));

  const add = (levelId: ObjectId, a: { x: number; y: number }, cotaA: number, b: { x: number; y: number }, cotaB: number, dn: number, rotulo: string) =>
    comandos.push({ type: 'AddTrecho', levelId, disciplina: 'PLUVIAL', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm: dn, rotulo, sugerido: true });

  const porBocal = vazaoDosBocais(model, hip);
  const avisos: string[] = [];
  let verticais = 0;
  let horizontais = 0;
  let ligadas = 0;
  /** O que cada caixa de areia recebe: a vazão e o maior DN que chega. */
  const naCaixa = new Map<ObjectId, { q: number; dn: number }>();
  const m1 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  for (const f of fontes) {
    if (jaLigada(f)) continue;
    const idx = indice.get(f.levelId) ?? 0;
    if (idx < idxDestino) {
      avisos.push(`${f.rotulo || 'Ralo pluvial'} abaixo do pavimento da caixa — ligue à mão`);
      continue;
    }
    const q = porBocal.get(f.id) ?? 0;
    const dnV = dnDoVertical(q);
    // ── O vertical: do bocal ao pé, enterrado, no pavimento do destino ──
    if (idx === idxDestino) {
      add(f.levelId, f.at, f.cotaMm, f.at, enterrado, dnV, ROTULO_DO_CONDUTOR_VERTICAL);
    } else {
      add(f.levelId, f.at, f.cotaMm, f.at, 0, dnV, ROTULO_DO_CONDUTOR_VERTICAL);
      for (let k = idx - 1; k > idxDestino; k--) add(niveis[k].id, f.at, niveis[k].defaultHeightMm, f.at, 0, dnV, ROTULO_DO_CONDUTOR_VERTICAL);
      add(destinoNivel, f.at, niveis[idxDestino].defaultHeightMm, f.at, enterrado, dnV, ROTULO_DO_CONDUTOR_VERTICAL);
    }
    verticais++;
    // ── O horizontal: do pé à caixa de areia mais perto (sem caixa, à saída mais perto) ──
    const alvos = caixasDeAreia.length > 0 ? caixasDeAreia : saidas;
    const alvo = [...alvos].sort((a, b) => Math.hypot(a.at.x - f.at.x, a.at.y - f.at.y) - Math.hypot(b.at.x - f.at.x, b.at.y - f.at.y) || a.id.localeCompare(b.id))[0];
    const L = Math.hypot(alvo.at.x - f.at.x, alvo.at.y - f.at.y);
    const dnH = dnDoHorizontal(q, n, i, dnV);
    if (alvo.tipoHidraulico === 'CAIXA_AREIA') {
      const chegada = enterrado - Math.ceil((L * i) / 100);
      const ext = extensaoVerticalDaCaixa(alvo)!;
      if (chegada < ext.fundoMm) avisos.push(`o condutor chega a ${m1(chegada)} m, abaixo do fundo da caixa de areia (${m1(ext.fundoMm)} m) — aprofunde a caixa`);
      if (L > 0) add(destinoNivel, f.at, enterrado, alvo.at, Math.max(chegada, ext.fundoMm), dnH, ROTULO_DO_CONDUTOR_HORIZONTAL);
      const atual = naCaixa.get(alvo.id) ?? { q: 0, dn: 0 };
      naCaixa.set(alvo.id, { q: atual.q + q, dn: Math.max(atual.dn, dnH) });
    } else {
      const decl = L > 0 ? ((enterrado - alvo.cotaMm) / L) * 100 : 0;
      if (decl + 1e-9 < DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT) avisos.push(`a saída pluvial está alta demais para o condutor chegar por gravidade (${decl.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %)`);
      if (L > 0) add(destinoNivel, f.at, enterrado, alvo.at, alvo.cotaMm, dnH, ROTULO_DO_CONDUTOR_HORIZONTAL);
    }
    horizontais++;
    ligadas++;
  }
  // ── De cada caixa de areia que recebeu, à saída pluvial mais perto ──
  const saiDaCaixa = (c: Terminal) => confirmados.some((t) => t.levelId === c.levelId && ((t.a.x === c.at.x && t.a.y === c.at.y) || (t.b.x === c.at.x && t.b.y === c.at.y)) && Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) > 0 && (t.a.x === c.at.x && t.a.y === c.at.y ? t.cotaAMm : t.cotaBMm) === extensaoVerticalDaCaixa(c)!.fundoMm);
  if (saidas.length > 0) {
    for (const c of caixasDeAreia) {
      const recebe = naCaixa.get(c.id);
      if (!recebe || saiDaCaixa(c)) continue;
      const s = [...saidas].sort((a, b) => Math.hypot(a.at.x - c.at.x, a.at.y - c.at.y) - Math.hypot(b.at.x - c.at.x, b.at.y - c.at.y) || a.id.localeCompare(b.id))[0];
      const L = Math.hypot(s.at.x - c.at.x, s.at.y - c.at.y);
      const fundo = extensaoVerticalDaCaixa(c)!.fundoMm;
      const decl = L > 0 ? ((fundo - s.cotaMm) / L) * 100 : 0;
      if (decl + 1e-9 < DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT) avisos.push(`a saída pluvial está alta demais para a caixa de areia chegar por gravidade (${decl.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %)`);
      if (L > 0) add(c.levelId, c.at, fundo, s.at, s.cotaMm, dnDoHorizontal(recebe.q, n, Math.max(decl, DECLIVIDADE_MINIMA_DO_HORIZONTAL_PCT), recebe.dn), ROTULO_DO_CONDUTOR_HORIZONTAL);
      horizontais++;
    }
  } else {
    avisos.push('sem a saída pluvial (sarjeta ou galeria): a caixa de areia fica sem destino');
  }
  return {
    motivo: ligadas === 0 && sugeridos.length === 0 ? 'Todo bocal e ralo pluvial já tem condutor confirmado.' : null,
    fontes: ligadas,
    verticais,
    horizontais,
    apagados: sugeridos.length,
    avisos,
    comandos,
  };
}
