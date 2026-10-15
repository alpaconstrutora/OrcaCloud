/**
 * E5.4 — VENTILAÇÃO DO ESGOTO (29/09/2026, roadmap hidrossanitário).
 *
 * O que a NBR 8160 pede, derivado do desenho:
 *  - todo DESCONECTOR (bacia sanitária, caixa sifonada, ralo sifonado,
 *    mictório) ventilado a no máximo a distância da tabela, medida PELO TUBO
 *    até o ponto onde a ventilação sai (DN 40 → 1,00 m; 50 → 1,20; 75 → 1,80;
 *    100 → 2,40);
 *  - a COLUNA de ventilação com o DN da tabela de colunas (pelo DN e a UHC do
 *    tubo de queda — ou do ramal, sem TQ — e o comprimento da coluna);
 *  - a coluna subindo 0,30 m ACIMA DA COBERTURA (a água do telhado sobre ela,
 *    ou o topo do último pavimento).
 *
 * ⚠️ As duas tabelas foram transcritas da NBR 8160:1999 (distância máxima do
 * desconector ao tubo ventilador; dimensionamento de colunas e barriletes de
 * ventilação) — CONFERIR NA NORMA antes de emitir. Estão aqui, num lugar só.
 *
 * O LANÇAMENTO (`planejarVentilacao`) estende as colunas que param abaixo da
 * cobertura, corrige o DN das sugeridas e, para o desconector sem ventilação
 * ao alcance, sai do nó logo abaixo dele e sobe até a cobertura. Tudo
 * "Ventilação", sugerido, num lote.
 *
 * ONDE A COLUNA SOBE (15/10/2026, a pendência do sobrado): subia na posição da peça — no meio do banheiro, e no
 * sobrado, pelo meio do dormitório de cima. Agora ela sai do mesmo nó (a distância pelo tubo, que a norma mede, não
 * muda), corre SOB O PISO em aclive de 1 % até a parede mais perto (`ventilacaoAteAParedeMm`) — a que existe em
 * todos os pavimentos que ela atravessa, fora de porta e janela, rente ao pilar e à viga — ou até o shaft, e sobe
 * nela. Sem parede ao alcance, fica a de antes.
 */
import type { BlueprintModel, Command, ObjectId, Point, Terminal, Trecho } from './blueprintKernel';
import { applyBatch, pointInPolygon } from './blueprintKernel';
import { foraDaViga, foraDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { encaixarNaParede, paredesEmComum } from './blueprintRotaPelasParedes';
import { shaftPreferido } from './blueprintNucleoVertical';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { comprimentoMm, distanciasDesde, fazerChave, type Aresta } from './blueprintGrafoDeRede';
import { esgotoTrechoATrecho, type HipotesesDeEsgoto } from './blueprintEsgotoAutomatico';

export const ROTULO_DA_VENTILACAO = 'Ventilação';
/** Quanto a coluna passa da cobertura (telhado não utilizável), mm. */
export const ACIMA_DA_COBERTURA_MM = 300;

/** Os desconectores que a norma manda ventilar. */
export const DESCONECTORES = new Set(['VASO_SANITARIO', 'CAIXA_SIFONADA', 'RALO_SIFONADO', 'MICTORIO']);

/** Distância máxima do desconector ao tubo ventilador, por DN do ramal de descarga (m). CONFERIR NA NORMA. */
export const DISTANCIA_MAXIMA_AO_VENTILADOR_M: Readonly<Record<number, number>> = { 40: 1.0, 50: 1.2, 75: 1.8, 100: 2.4 };
export const distanciaMaximaAoVentiladorM = (dn: number) =>
  DISTANCIA_MAXIMA_AO_VENTILADOR_M[dn] ?? (dn < 40 ? 1.0 : 2.4);

/**
 * Colunas e barriletes de ventilação: por DN do TQ (ou ramal) e UHC, o
 * comprimento máximo (m) de cada DN de coluna. CONFERIR NA NORMA.
 */
export const TABELA_COLUNA_DE_VENTILACAO: readonly { dn: number; uhc: number; comprimentos: Readonly<Record<number, number>> }[] = [
  { dn: 40, uhc: 8, comprimentos: { 40: 46 } },
  { dn: 40, uhc: 10, comprimentos: { 40: 30 } },
  { dn: 50, uhc: 12, comprimentos: { 40: 23, 50: 61 } },
  { dn: 50, uhc: 20, comprimentos: { 40: 15, 50: 46 } },
  { dn: 75, uhc: 10, comprimentos: { 40: 13, 50: 46, 75: 317 } },
  { dn: 75, uhc: 21, comprimentos: { 40: 10, 50: 33, 75: 247 } },
  { dn: 75, uhc: 53, comprimentos: { 40: 8, 50: 29, 75: 207 } },
  { dn: 75, uhc: 102, comprimentos: { 40: 8, 50: 26, 75: 189 } },
  { dn: 100, uhc: 43, comprimentos: { 50: 11, 75: 76, 100: 299 } },
  { dn: 100, uhc: 140, comprimentos: { 50: 8, 75: 61, 100: 229 } },
  { dn: 100, uhc: 320, comprimentos: { 50: 7, 75: 52, 100: 195 } },
  { dn: 100, uhc: 530, comprimentos: { 50: 6, 75: 46, 100: 177 } },
  { dn: 150, uhc: 500, comprimentos: { 75: 10, 100: 40, 150: 305 } },
  { dn: 150, uhc: 1100, comprimentos: { 75: 8, 100: 31, 150: 238 } },
  { dn: 150, uhc: 2000, comprimentos: { 75: 7, 100: 26, 150: 201 } },
  { dn: 150, uhc: 2900, comprimentos: { 75: 6, 100: 23, 150: 183 } },
  { dn: 200, uhc: 1800, comprimentos: { 100: 10, 150: 73, 200: 286 } },
  { dn: 200, uhc: 3400, comprimentos: { 100: 7, 150: 57, 200: 219 } },
  { dn: 200, uhc: 5600, comprimentos: { 100: 6, 150: 49, 200: 186 } },
  { dn: 200, uhc: 7600, comprimentos: { 100: 5, 150: 43, 200: 171 } },
];

/** O DN da coluna de ventilação (nunca abaixo de 50 com bacia sanitária no grupo). */
export function dnDaColunaDeVentilacao(dnDoTubo: number, uhc: number, comprimentoM: number, comBacia: boolean): number {
  const linhas = TABELA_COLUNA_DE_VENTILACAO.filter((l) => l.dn === dnDoTubo);
  const doDn = linhas.length ? linhas : TABELA_COLUNA_DE_VENTILACAO.filter((l) => l.dn === 100);
  const linha = doDn.find((l) => uhc <= l.uhc) ?? doDn[doDn.length - 1];
  const dns = Object.keys(linha.comprimentos).map(Number).sort((a, b) => a - b);
  const dn = dns.find((d) => linha.comprimentos[d] >= comprimentoM - 1e-9) ?? dns[dns.length - 1];
  return Math.max(dn, comBacia ? 50 : 40);
}

/** A cota ABSOLUTA da cobertura sobre o ponto: a água de telhado que o contém, senão o topo do último pavimento. */
export function coberturaNoPontoMm(model: BlueprintModel, p: { x: number; y: number }): number {
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  let melhor = -Infinity;
  for (const r of model.roofs ?? []) {
    if (r.pontos.length < 3 || !pointInPolygon(r.pontos, p)) continue;
    const a = r.pontos[r.beiralIndex % r.pontos.length];
    const b = r.pontos[(r.beiralIndex + 1) % r.pontos.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dist = Math.abs(((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L);
    melhor = Math.max(melhor, (elev.get(r.levelId) ?? 0) + r.baseMm + (dist * r.inclinacaoPct) / 100 + r.espessuraMm);
  }
  if (melhor > -Infinity) return Math.round(melhor);
  const topo = Math.max(...model.levels.map((l) => l.elevationMm + l.defaultHeightMm));
  return Number.isFinite(topo) ? topo : 0;
}

export interface DesconectorVerificado {
  terminalId: ObjectId;
  levelId: ObjectId;
  at: { x: number; y: number };
  sigla: string;
  dnMm: number;
  /** Pelo tubo até a saída de ventilação mais perto; `null` se nenhuma alcança. */
  distanciaM: number | null;
  maximaM: number;
  ventilado: boolean;
}

export interface ColunaDeVentilacao {
  x: number;
  y: number;
  trechoIds: ObjectId[];
  comprimentoM: number;
  dnAtualMm: number;
  dnNecessarioMm: number;
  topoMm: number;
  coberturaMm: number;
  acimaDaCobertura: boolean;
}

export interface VerificacaoDaVentilacao {
  desconectores: DesconectorVerificado[];
  colunas: ColunaDeVentilacao[];
}

const ehVentilacao = (t: Trecho) => t.disciplina === 'ESGOTO' && t.rotulo === ROTULO_DA_VENTILACAO;

export function verificarVentilacao(model: BlueprintModel, hip?: HipotesesDeEsgoto): VerificacaoDaVentilacao {
  const chave = fazerChave(model.levels);
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const esgoto = (model.trechos ?? []).filter((t) => t.disciplina === 'ESGOTO');
  const arestas: Aresta[] = esgoto.map((t) => ({ ref: { existente: t.id }, de: chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), para: chave(t.levelId, t.b.x, t.b.y, t.cotaBMm), mm: comprimentoMm(t) }));
  // Onde a rede é VENTILADA: a ponta de baixo de cada trecho de ventilação e — a
  // ventilação PRIMÁRIA — todo nó do tubo de queda que continua em ventilação na
  // mesma posição (o TQ prolongado acima da cobertura é o tubo ventilador).
  const posicoesVentiladas = new Set(esgoto.filter(ehVentilacao).map((t) => `${t.a.x},${t.a.y}`));
  const saidas = new Set<string>();
  for (const t of esgoto) {
    if (ehVentilacao(t)) saidas.add(t.cotaAMm <= t.cotaBMm ? chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) : chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    else if (t.rotulo === 'TQ' && posicoesVentiladas.has(`${t.a.x},${t.a.y}`)) {
      saidas.add(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm));
      saidas.add(chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    }
  }
  // Não se anda PELA coluna de ventilação para medir a distância.
  const semVentilacao = arestas.filter((a, i) => !ehVentilacao(esgoto[i]));

  const desconectores: DesconectorVerificado[] = (model.terminais ?? [])
    .filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico && DESCONECTORES.has(t.tipoHidraulico))
    .map((t) => {
      const ficha = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!];
      const dnMm = ficha.dnMinimoMm.ESGOTO ?? 40;
      const dist = distanciasDesde(chave(t.levelId, t.at.x, t.at.y, t.cotaMm), semVentilacao);
      let menor: number | null = null;
      for (const s of saidas) {
        const d = dist.get(s);
        if (d != null && (menor == null || d < menor)) menor = d;
      }
      const maximaM = distanciaMaximaAoVentiladorM(dnMm);
      const distanciaM = menor == null ? null : menor / 1000;
      return { terminalId: t.id, levelId: t.levelId, at: { ...t.at }, sigla: ficha.sigla, dnMm, distanciaM, maximaM, ventilado: distanciaM != null && distanciaM <= maximaM + 1e-9 };
    })
    .sort((a, b) => a.terminalId.localeCompare(b.terminalId));

  // As COLUNAS: os trechos VERTICAIS de ventilação no mesmo (x, y) — a perna sob o piso até a parede não é coluna.
  const calc = esgotoTrechoATrecho(model, hip);
  const porPosicao = new Map<string, Trecho[]>();
  for (const t of esgoto.filter((x) => ehVentilacao(x) && x.a.x === x.b.x && x.a.y === x.b.y)) {
    const k = `${t.a.x},${t.a.y}`;
    porPosicao.set(k, [...(porPosicao.get(k) ?? []), t]);
  }
  // A PERNA sob o piso (da peça até a parede onde a coluna sobe): a coluna ventila o que passa na outra ponta dela.
  const pernaAte = new Map<string, Trecho>();
  for (const t of esgoto.filter((x) => ehVentilacao(x) && (x.a.x !== x.b.x || x.a.y !== x.b.y))) {
    const [baixa, alta] = t.cotaAMm <= t.cotaBMm ? [t.a, t.b] : [t.b, t.a];
    pernaAte.set(`${alta.x},${alta.y}`, { ...t, a: baixa, b: alta });
  }
  const colunas: ColunaDeVentilacao[] = [];
  for (const [k, ts] of porPosicao) {
    const [x, y] = k.split(',').map(Number);
    const perna = pernaAte.get(k) ?? null;
    const comprimentoM = (ts.reduce((s, t) => s + comprimentoMm(t), 0) + (perna ? comprimentoMm(perna) : 0)) / 1000;
    const topoMm = Math.max(...ts.map((t) => (elev.get(t.levelId) ?? 0) + Math.max(t.cotaAMm, t.cotaBMm)));
    // O que ela ventila: o TQ nesta posição; sem TQ, o ramal que passa aqui (ou na ponta de baixo da perna).
    const origem = perna ? perna.a : { x, y };
    const aqui = calc.filter((c) => {
      const t = esgoto.find((e) => e.id === c.trechoId)!;
      return [t.a, t.b].some((p) => p.x === origem.x && p.y === origem.y);
    });
    const tqs = aqui.filter((c) => c.papel === 'TUBO_DE_QUEDA');
    const base = tqs.length ? tqs : aqui;
    const dnDoTubo = base.length ? Math.max(...base.map((c) => c.dnAtualMm)) : 100;
    const uhc = base.length ? Math.max(...base.map((c) => c.uhc)) : 0;
    const comBacia = base.some((c) => c.dnAtualMm >= 100) || dnDoTubo >= 100;
    const dnNecessarioMm = dnDaColunaDeVentilacao(dnDoTubo, uhc, comprimentoM, comBacia);
    const coberturaMm = coberturaNoPontoMm(model, { x, y });
    colunas.push({
      x, y, trechoIds: ts.map((t) => t.id).sort(), comprimentoM, dnAtualMm: Math.min(...ts.map((t) => t.bitolaMm)), dnNecessarioMm,
      topoMm, coberturaMm, acimaDaCobertura: topoMm >= coberturaMm + ACIMA_DA_COBERTURA_MM,
    });
  }
  colunas.sort((a, b) => a.x - b.x || a.y - b.y);
  return { desconectores, colunas };
}

/** Ausente nas hipóteses: até onde a coluna nova busca a parede (mm). */
export const VENTILACAO_ATE_A_PAREDE_MM = 1500;
/** O aclive da perna de ventilação sob o piso (NBR 8160: ventilação em aclive, para escoar ao ramal). */
export const ACLIVE_DA_VENTILACAO = 0.01;
/** Folga entre o tubo e a lateral de uma porta ou janela, mm. */
const FOLGA_DA_ABERTURA_MM = 75;

/**
 * Onde a coluna de ventilação de um ponto em `p` sobe: o shaft ao alcance, senão a parede mais perto que existe em
 * TODOS os pavimentos que a coluna atravessa (do dela até o último), fora de porta e janela em cada um, escorregada
 * para fora do pilar e rente à viga. `null` = nenhuma a até `raioMm` (ou `raioMm` 0): sobe no ponto.
 */
export function ondeAColunaSobe(model: BlueprintModel, levelId: ObjectId, p: { x: number; y: number }, raioMm: number): Point | null {
  if (raioMm <= 0) return null;
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return null;
  const acima = model.levels.filter((l) => l.elevationMm >= nivel.elevationMm).sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.id);
  const shaft = shaftPreferido(model, p, levelId, raioMm);
  if (shaft) return { x: Math.round(shaft.x), y: Math.round(shaft.y) };
  const paredesDe = (L: ObjectId) => model.walls.filter((w) => w.levelId === L);
  const outros = acima.filter((L) => L !== levelId).map(paredesDe);
  const candidatas = outros.length ? paredesEmComum(paredesDe(levelId), outros) : paredesDe(levelId);
  const naAbertura = (q: { x: number; y: number }) =>
    acima.some((L) =>
      model.walls.some((w) => {
        if (w.levelId !== L) return false;
        const Lw = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        if (Lw < 1) return false;
        const t = ((q.x - w.a.x) * (w.b.x - w.a.x) + (q.y - w.a.y) * (w.b.y - w.a.y)) / Lw;
        const d = Math.abs((q.x - w.a.x) * (w.b.y - w.a.y) - (q.y - w.a.y) * (w.b.x - w.a.x)) / Lw;
        if (t < -1 || t > Lw + 1 || d > w.thicknessMm / 2 + 5) return false;
        return model.openings.some((o) => o.wallId === w.id && t > o.offsetMm - FOLGA_DA_ABERTURA_MM && t < o.offsetMm + o.widthMm + FOLGA_DA_ABERTURA_MM);
      }),
    );
  const pilares = acima.flatMap((L) => pegadasDePilares(model, L));
  const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && acima.includes(s.levelId));
  // A mais perto que serve: as paredes em ordem de distância; a primeira cujo ponto não cai em porta ou janela.
  const ordem = candidatas
    .map((w) => ({ w, e: encaixarNaParede(p, [w], raioMm) }))
    .filter((x): x is { w: (typeof candidatas)[number]; e: NonNullable<ReturnType<typeof encaixarNaParede>> } => !!x.e)
    .sort((a, b) => a.e.d - b.e.d);
  for (const { w, e } of ordem) {
    const noEixo = foraDoPilar(e.q, w, pilares);
    const q = foraDaViga(noEixo, vigas, p, pilares);
    if (naAbertura(q)) continue;
    return { x: Math.round(q.x), y: Math.round(q.y) };
  }
  return null;
}

export interface PlanoDaVentilacao {
  comandos: Command[];
  /** Colunas novas, estendidas e com DN corrigido. */
  novas: number;
  estendidas: number;
  corrigidas: number;
  resumo: string[];
  avisos: string[];
}

/** Os segmentos de uma coluna vertical em (x, y) do ponto (nível, cota) até a cota ABSOLUTA `topoAbs`, pavimento a pavimento. */
function subirAte(model: BlueprintModel, levelId: ObjectId, x: number, y: number, cotaMm: number, topoAbs: number): { levelId: ObjectId; ca: number; cb: number }[] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  let i = niveis.findIndex((l) => l.id === levelId);
  const seg: { levelId: ObjectId; ca: number; cb: number }[] = [];
  let cota = cotaMm;
  while (i >= 0 && i < niveis.length) {
    const n = niveis[i];
    const ultimo = i === niveis.length - 1 || topoAbs <= niveis[i + 1].elevationMm;
    const alvo = ultimo ? topoAbs - n.elevationMm : n.defaultHeightMm;
    if (alvo > cota) seg.push({ levelId: n.id, ca: cota, cb: Math.round(alvo) });
    if (ultimo) break;
    cota = 0;
    i++;
  }
  return seg;
}

export function planejarVentilacao(model: BlueprintModel, hip?: HipotesesDeEsgoto): PlanoDaVentilacao {
  const v = verificarVentilacao(model, hip);
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const comandos: Command[] = [];
  let estendidas = 0;
  let corrigidas = 0;
  const avisos: string[] = [];
  const add = (levelId: ObjectId, x: number, y: number, ca: number, cb: number, dn: number) =>
    comandos.push({ type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: { x, y }, b: { x, y }, cotaAMm: ca, cotaBMm: cb, bitolaMm: dn, rotulo: ROTULO_DA_VENTILACAO, sugerido: true });

  // 1. As colunas que existem: DN das sugeridas e o prolongamento acima da cobertura.
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  for (const c of v.colunas) {
    for (const id of c.trechoIds) {
      const t = trechoPorId.get(id)!;
      if (t.sugerido && t.bitolaMm < c.dnNecessarioMm) {
        comandos.push({ type: 'SetTrechoProps', trechoId: id, bitolaMm: c.dnNecessarioMm });
        corrigidas++;
      }
      if (!t.sugerido && t.bitolaMm < c.dnNecessarioMm) avisos.push(`Coluna de ventilação confirmada em DN ${t.bitolaMm}; a tabela pede ${c.dnNecessarioMm}.`);
    }
    if (!c.acimaDaCobertura) {
      const topo = c.trechoIds.map((id) => trechoPorId.get(id)!).sort((a, b) => (elev.get(b.levelId) ?? 0) + Math.max(b.cotaAMm, b.cotaBMm) - ((elev.get(a.levelId) ?? 0) + Math.max(a.cotaAMm, a.cotaBMm)))[0];
      const cotaTopo = Math.max(topo.cotaAMm, topo.cotaBMm);
      for (const s of subirAte(model, topo.levelId, c.x, c.y, cotaTopo, c.coberturaMm + ACIMA_DA_COBERTURA_MM)) add(s.levelId, c.x, c.y, s.ca, s.cb, Math.max(c.dnNecessarioMm, c.dnAtualMm));
      estendidas++;
    }
  }

  // 2. O desconector sem ventilação ao alcance: uma coluna do nó logo abaixo dele até a cobertura.
  let novas = 0;
  let ligadas = 0;
  const cobertos = new Set(v.desconectores.filter((d) => d.ventilado).map((d) => d.terminalId));
  const faltam = v.desconectores.filter((d) => !d.ventilado).sort((a, b) => b.dnMm - a.dnMm || a.terminalId.localeCompare(b.terminalId));
  const terminal = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const colunasNovas: { x: number; y: number }[] = [];
  const ventilar = (d: (typeof faltam)[number], poupar: boolean) => {
    if (cobertos.has(d.terminalId)) return;
    const t = terminal.get(d.terminalId) as Terminal;
    // O nó LOGO ABAIXO: a outra ponta da prumada que sai da peça (o ramal sob o piso).
    const prumada = (model.trechos ?? []).find((x) => x.disciplina === 'ESGOTO' && x.levelId === t.levelId && x.a.x === t.at.x && x.a.y === t.at.y && x.b.x === t.at.x && x.b.y === t.at.y && Math.max(x.cotaAMm, x.cotaBMm) === t.cotaMm);
    if (!prumada) {
      avisos.push(`${d.sigla} sem ventilação e sem a prumada que liga ao ramal: ventile à mão.`);
      return;
    }
    // Um desconector perto de uma coluna nova (no mesmo pavimento, dentro do alcance em planta) já fica coberto
    // — na 1ª passada; a 2ª confere PELO TUBO, como a verificação, e ventila quem ficou de fora.
    if (poupar && colunasNovas.some((c) => Math.hypot(c.x - t.at.x, c.y - t.at.y) / 1000 <= d.maximaM)) return;
    const base = Math.min(prumada.cotaAMm, prumada.cotaBMm);
    // Onde ela sobe: na parede (ou no shaft) a até `ventilacaoAteAParedeMm`; a perna sob o piso em aclive de 1 %.
    const sobe = ondeAColunaSobe(model, t.levelId, t.at, hip?.ventilacaoAteAParedeMm ?? VENTILACAO_ATE_A_PAREDE_MM) ?? { x: t.at.x, y: t.at.y };
    const perna = Math.hypot(sobe.x - t.at.x, sobe.y - t.at.y);
    const cotaDaPerna = perna > 0 ? base + Math.max(1, Math.ceil(perna * ACLIVE_DA_VENTILACAO)) : base;
    const topoAbs = coberturaNoPontoMm(model, sobe) + ACIMA_DA_COBERTURA_MM;
    const comprimentoM = (topoAbs - ((elev.get(t.levelId) ?? 0) + base) + perna) / 1000;
    const dn = dnDaColunaDeVentilacao(d.dnMm, FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].uhcNbr8160 ?? 1, comprimentoM, d.dnMm >= 100);
    // Já SOBE uma coluna de ventilação ali, neste pavimento (a da peça empilhada de baixo, que buscou a mesma parede):
    // a perna liga no PÉ dela — sem segunda coluna sobreposta.
    const naParede = [...(model.trechos ?? []), ...comandos.flatMap((c) => (c.type === 'AddTrecho' ? [c as unknown as Trecho] : []))].filter(
      (x) => x.disciplina === 'ESGOTO' && x.rotulo === ROTULO_DA_VENTILACAO && x.levelId === t.levelId && x.a.x === sobe.x && x.a.y === sobe.y && x.b.x === sobe.x && x.b.y === sobe.y,
    );
    const peDaColuna = naParede.length ? Math.min(...naParede.map((x) => Math.min(x.cotaAMm, x.cotaBMm))) : null;
    if (perna > 0) comandos.push({ type: 'AddTrecho', levelId: t.levelId, disciplina: 'ESGOTO', a: { x: t.at.x, y: t.at.y }, b: { ...sobe }, cotaAMm: base, cotaBMm: cotaDaPerna, bitolaMm: dn, rotulo: ROTULO_DA_VENTILACAO, sugerido: true });
    colunasNovas.push({ x: t.at.x, y: t.at.y });
    cobertos.add(d.terminalId);
    if (perna > 0 && peDaColuna != null && cotaDaPerna <= peDaColuna) {
      if (cotaDaPerna < peDaColuna) add(t.levelId, sobe.x, sobe.y, cotaDaPerna, peDaColuna, dn);
      ligadas++;
      return;
    }
    for (const s of subirAte(model, t.levelId, sobe.x, sobe.y, cotaDaPerna, topoAbs)) add(s.levelId, sobe.x, sobe.y, s.ca, s.cb, dn);
    novas++;
  };
  for (const d of faltam) ventilar(d, true);
  // F8b da casa automática (15/10/2026): a economia acima mede em LINHA RETA, a verificação mede PELO TUBO —
  // a caixa sifonada a 1,1 m em planta da coluna do vaso e a 1,57 m pelo tubo ficava sem ventilação.
  if (novas + ligadas > 0) {
    const depois = verificarVentilacao(applyBatch(model, comandos).model, hip);
    for (const d of depois.desconectores.filter((x) => !x.ventilado).sort((a, b) => b.dnMm - a.dnMm || a.terminalId.localeCompare(b.terminalId))) ventilar(d, false);
  }
  const resumo = [
    novas ? `${novas} coluna(s) nova(s)` : '',
    ligadas ? `${ligadas} ramal(is) ligado(s) ao pé de uma coluna que já sobe ali` : '',
    estendidas ? `${estendidas} estendida(s) até ${ACIMA_DA_COBERTURA_MM / 10} cm acima da cobertura` : '',
    corrigidas ? `${corrigidas} trecho(s) com o DN da tabela` : '',
  ].filter(Boolean);
  return { comandos, novas, estendidas, corrigidas, resumo, avisos };
}
