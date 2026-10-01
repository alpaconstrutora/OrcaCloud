/**
 * FASE B (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — A CASA DE BOMBAS,
 * O RECALQUE E A RESERVA TÉCNICA propostos (o que o gerador de PPCI "não decidia").
 *
 * Decisões do usuário (01/10/2026):
 *  - D-1 · sem lugar para a casa de bombas no desenho, **o relatório pede** — o
 *    motor não inventa onde fica a casa de bombas;
 *  - D-2 · sem bomba no catálogo, **lança a bomba** assim mesmo (sem curva; a
 *    conferência deixa a curva NÃO AVALIADA e o relatório diz o ponto de projeto);
 *  - D-3 · a reserva nos **dois** arranjos × as **duas** alimentações, por
 *    premissa (`HipotesesDoBombeamento.reserva` / `.alimentacao`):
 *      PROPRIA  — reservatório só de incêndio (disciplina INCENDIO);
 *      PARCELA  — a parcela `volumeRtiL` da caixa de água fria;
 *      BOMBA    — a bomba principal é a fonte da rede;
 *      GRAVIDADE — a caixa elevada é a fonte (a coluna desce dela).
 *
 * Três passos, porque o volume depende do cálculo e o cálculo depende da fonte:
 *  1. `proporFonte` (ANTES da rede): bomba + jockey + pressostatos no lugar da
 *     casa de bombas, ou a caixa elevada de incêndio (provisória no volume);
 *  2. `proporRecalque` (DEPOIS da rede): o registro no passeio, junto à porta da
 *     rua do pavimento de descarga, ligado ao nó da rede mais perto;
 *  3. `proporReserva` (DEPOIS do DN): o volume exigido pelo cálculo (vazão ×
 *     autonomia), no módulo comercial acima — e, com catálogo, a curva da bomba.
 */
import type { BlueprintModel, Command, ObjectId, Point, Terminal } from './blueprintKernel';
import { applyBatch, pointInPolygon } from './blueprintKernel';
import { candidatosDoAmbiente } from './blueprintRotaDeFuga';
import { bombasQueAtendem, type BombaCandidata } from './blueprintBombeamentoIncendio';
import type { HipotesesIncendio } from './blueprintIncendioClassificacao';
import { pavimentoDeDescarga } from './blueprintIncendioClassificacao';
import { calculoDoEstudo } from './blueprintPlanilhaDePressoes';

export type ArranjoDaReserva = 'PROPRIA' | 'PARCELA';
export type AlimentacaoDaRede = 'BOMBA' | 'GRAVIDADE';
export const ROTULO_DO_ARRANJO: Record<ArranjoDaReserva, string> = { PROPRIA: 'Reservatório próprio de incêndio', PARCELA: 'Parcela da caixa de água fria' };
export const ROTULO_DA_ALIMENTACAO: Record<AlimentacaoDaRede, string> = { BOMBA: 'Com bomba', GRAVIDADE: 'Por gravidade (caixa elevada)' };

/** Nome de ambiente que diz "casa de bombas". */
const NOME_DA_CASA_DE_BOMBAS = /casa\s+de\s+bombas/i;
/** Nome de ambiente que diz onde fica a caixa elevada. */
const NOME_DA_CAIXA_ELEVADA = /reservat[oó]rio|caixa\s*d['’]?\s*[aá]gua|barrilete/i;
/** Afastamentos da casa de bombas, mm (lado a lado, como o detalhe típico da E8.3). */
const PASSO_NA_CASA_MM = 900;

const ehDoTipo = (t: Terminal, tipo: string) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === tipo;
const centroDe = (s: { ring: Point[] }) => {
  const c = candidatosDoAmbiente(s as never).centro;
  return { x: Math.round(c.x), y: Math.round(c.y) };
};

/** O lugar da casa de bombas: a bomba já lançada, senão o ambiente "Casa de bombas". `null` = o relatório pede. */
export function lugarDaCasaDeBombas(model: BlueprintModel): { levelId: ObjectId; at: Point } | null {
  const bomba = (model.terminais ?? []).find((t) => ehDoTipo(t, 'BOMBA_INCENDIO'));
  if (bomba) return { levelId: bomba.levelId, at: { ...bomba.at } };
  const s = model.spaces.find((x) => NOME_DA_CASA_DE_BOMBAS.test(x.name ?? ''));
  return s ? { levelId: s.levelId, at: centroDe(s) } : null;
}

/** O lugar da caixa elevada: o ambiente "Reservatório / Caixa d'água / Barrilete" do pavimento MAIS ALTO que o tenha. */
export function lugarDaCaixaElevada(model: BlueprintModel): { levelId: ObjectId; at: Point } | null {
  const ordem = new Map([...model.levels].sort((a, b) => b.elevationMm - a.elevationMm).map((l, i) => [l.id, i]));
  const s = model.spaces.filter((x) => NOME_DA_CAIXA_ELEVADA.test(x.name ?? '')).sort((a, b) => (ordem.get(a.levelId) ?? 0) - (ordem.get(b.levelId) ?? 0))[0];
  return s ? { levelId: s.levelId, at: centroDe(s) } : null;
}

/** Volume no módulo comercial acima: até 5.000 L, de 500 em 500; acima, de 1.000 em 1.000 (convenção — CONFERIR com o fornecedor). */
export function moduloComercialL(litros: number): number {
  if (!(litros > 0)) return 0;
  return litros <= 5000 ? Math.ceil(litros / 500) * 500 : Math.ceil(litros / 1000) * 1000;
}

export interface PropostaDaCasaDeBombas {
  comandos: Command[];
  /** O que ficou para o projeto (vai para o relatório do gerador como "não decide"). */
  pendencias: string[];
}

const peca = (levelId: ObjectId, tipo: string, at: Point, cotaMm: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: { x: Math.round(at.x), y: Math.round(at.y) }, cotaMm, ...extra }) as Command;

/**
 * 1 · A FONTE, antes da rede. BOMBA: principal (se não há), a jockey ligada a ela e
 * um pressostato por bomba, lado a lado na casa de bombas. GRAVIDADE: a caixa
 * elevada (PRÓPRIA: um reservatório de incêndio provisório, o volume vem no passo 3;
 * PARCELA: a caixa de água fria existente é a fonte — nada a lançar aqui).
 */
export function proporFonte(model: BlueprintModel, hip: HipotesesIncendio): PropostaDaCasaDeBombas {
  const { alimentacao, reserva } = hip.bombeamento;
  const comandos: Command[] = [];
  const pendencias: string[] = [];
  const ts = model.terminais ?? [];
  if (alimentacao === 'GRAVIDADE') {
    if (reserva === 'PARCELA') {
      const caixa = ts.find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA');
      if (!caixa) pendencias.push("Reserva por gravidade na caixa de água fria: o desenho não tem caixa de água fria — lance-a (no alto) e gere de novo.");
      // A caixa compartilhada só é FONTE da rede com uma parcela de incêndio: provisória aqui, o volume certo no passo 3.
      // ⚠️ A parcela provisória SOMA à caixa — tirada do volume, ela comia o consumo de água fria.
      else if (!(caixa.volumeRtiL ?? 0)) comandos.push({ type: 'SetTerminalProps', terminalId: caixa.id, volumeRtiL: 1000, ...(caixa.volumeL != null ? { volumeL: caixa.volumeL + 1000 } : {}) } as Command);
      return { comandos, pendencias };
    }
    if (ts.some((t) => ehDoTipo(t, 'RESERVATORIO'))) return { comandos, pendencias };
    const lugar = lugarDaCaixaElevada(model);
    if (!lugar) {
      pendencias.push("Caixa elevada de incêndio: o desenho não diz onde — crie o ambiente \"Reservatório\" (ou \"Caixa d'água\", \"Barrilete\") no alto e gere de novo.");
      return { comandos, pendencias };
    }
    comandos.push(peca(lugar.levelId, 'RESERVATORIO', lugar.at, 0, { volumeL: 1000, papelReservatorio: 'SUPERIOR' }));
    return { comandos, pendencias };
  }
  // BOMBA.
  const lugar = lugarDaCasaDeBombas(model);
  if (!lugar) {
    pendencias.push('Casa de bombas: o desenho não diz onde — crie o ambiente "Casa de bombas" (ou lance a bomba) e gere de novo.');
    return { comandos, pendencias };
  }
  let m = model;
  const aplicar = (lote: Command[]) => {
    if (!lote.length) return;
    m = applyBatch(m, lote).model;
    comandos.push(...lote);
  };
  let principal = (m.terminais ?? []).find((t) => ehDoTipo(t, 'BOMBA_INCENDIO'));
  if (!principal) {
    aplicar([peca(lugar.levelId, 'BOMBA_INCENDIO', lugar.at, 300)]);
    principal = (m.terminais ?? []).find((t) => ehDoTipo(t, 'BOMBA_INCENDIO'))!;
  }
  // Peça "de nó" solta vira "fora da rede" na conferência: a jockey entra LIGADA à principal (o
  // barrilete), os pressostatos SOBRE esse trecho e a reserva própria pela sucção.
  // NÃO sugeridos: o relançamento da rede de hidrantes apaga todo trecho sugerido de incêndio.
  const tubo = (a: Point, ca: number, b: Point, cb: number): Command => ({ type: 'AddTrecho', levelId: principal!.levelId, disciplina: 'INCENDIO', a: { ...a }, b: { ...b }, cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const temJockey = (m.terminais ?? []).some((t) => ehDoTipo(t, 'BOMBA_JOCKEY') && t.bombaPrincipalId === principal!.id);
  const pJockey = { x: principal.at.x + PASSO_NA_CASA_MM, y: principal.at.y };
  if (!temJockey) aplicar([peca(principal.levelId, 'BOMBA_JOCKEY', pJockey, principal.cotaMm, { bombaPrincipalId: principal.id }), tubo(pJockey, principal.cotaMm, principal.at, principal.cotaMm)]);
  const bombas = (m.terminais ?? []).filter((t) => ehDoTipo(t, 'BOMBA_INCENDIO') || ehDoTipo(t, 'BOMBA_JOCKEY')).length;
  const pressostatos = (m.terminais ?? []).filter((t) => ehDoTipo(t, 'PRESSOSTATO')).length;
  const faltam = Math.max(0, bombas - pressostatos);
  aplicar(Array.from({ length: faltam }, (_, k) => peca(principal!.levelId, 'PRESSOSTATO', { x: principal!.at.x + ((k + 1) * PASSO_NA_CASA_MM) / (faltam + 1), y: principal!.at.y }, principal!.cotaMm)));
  // F1: o manômetro do barrilete, sobre o tubo da jockey (quando foi este passo que o lançou).
  if (!temJockey && !(m.terminais ?? []).some((t) => ehDoTipo(t, 'MANOMETRO') && t.levelId === principal!.levelId)) {
    aplicar([peca(principal.levelId, 'MANOMETRO', { x: principal.at.x + Math.round(PASSO_NA_CASA_MM / 6), y: principal.at.y }, principal.cotaMm)]);
  }
  // A reserva PRÓPRIA da bomba: o reservatório de incêndio ao lado da casa de bombas, ligado pela
  // sucção (volume no passo 3).
  if (reserva === 'PROPRIA' && !(m.terminais ?? []).some((t) => ehDoTipo(t, 'RESERVATORIO'))) {
    const pRes = { x: principal.at.x - 2 * PASSO_NA_CASA_MM, y: principal.at.y };
    aplicar([peca(principal.levelId, 'RESERVATORIO', pRes, 0, { volumeL: 1000, papelReservatorio: 'INFERIOR' }), tubo(pRes, 0, principal.at, 0), tubo(principal.at, 0, principal.at, principal.cotaMm)]);
  }
  if (reserva === 'PARCELA' && !(m.terminais ?? []).some((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA')) {
    pendencias.push('Reserva técnica na caixa de água fria: o desenho não tem caixa de água fria — lance-a e gere de novo.');
  }
  return { comandos, pendencias };
}

/**
 * 2 · O REGISTRO DE RECALQUE, depois da rede: no passeio, 1 m para FORA da porta
 * da rua do pavimento de descarga, a −0,30 m, ligado ao nó da rede de incêndio
 * mais perto naquele pavimento (um trecho enterrado e a subida).
 */
export function proporRecalque(model: BlueprintModel, hip: HipotesesIncendio): PropostaDaCasaDeBombas {
  const pendencias: string[] = [];
  const ts = model.terminais ?? [];
  if (ts.some((t) => ehDoTipo(t, 'HIDRANTE_RECALQUE'))) return { comandos: [], pendencias };
  const descarga = pavimentoDeDescarga(model, hip.classificacao.pisoDeDescargaLevelId);
  if (!descarga) return { comandos: [], pendencias: ['Registro de recalque: sem pavimento de descarga.'] };
  const espacos = model.spaces.filter((s) => s.levelId === descarga.id);
  const fora = (p: Point) => !espacos.some((s) => pointInPolygon(s.ring, p));
  let lugar: Point | null = null;
  for (const o of model.openings) {
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w || w.levelId !== descarga.id || (o.kind !== 'door' && o.kind !== 'sliding' && o.kind !== 'passage')) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const n = { x: -u.y, y: u.x };
    const p = { x: w.a.x + u.x * (o.offsetMm + o.widthMm / 2), y: w.a.y + u.y * (o.offsetMm + o.widthMm / 2) };
    const lado = w.thicknessMm / 2 + 200;
    for (const s of [1, -1]) {
      const teste = { x: p.x + n.x * lado * s, y: p.y + n.y * lado * s };
      const outro = { x: p.x - n.x * lado * s, y: p.y - n.y * lado * s };
      if (fora(teste) && !fora(outro)) lugar = { x: Math.round(p.x + n.x * 1000 * s), y: Math.round(p.y + n.y * 1000 * s) };
    }
    if (lugar) break;
  }
  if (!lugar) return { comandos: [], pendencias: ['Registro de recalque: o pavimento de descarga não tem porta para a rua — marque o lugar no passeio e gere de novo.'] };
  const nos = (model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.levelId === descarga.id).flatMap((t) => [{ p: t.a, cota: t.cotaAMm }, { p: t.b, cota: t.cotaBMm }]);
  if (!nos.length) return { comandos: [], pendencias: ['Registro de recalque: sem rede de incêndio no pavimento de descarga para ligá-lo.'] };
  const no = nos.reduce((a, b) => (Math.hypot(b.p.x - lugar!.x, b.p.y - lugar!.y) < Math.hypot(a.p.x - lugar!.x, a.p.y - lugar!.y) ? b : a));
  const cota = -300;
  // NÃO sugerido (o relançamento da rede apagaria a ligação do recalque).
  const trecho = (a: Point, ca: number, b: Point, cb: number): Command => ({ type: 'AddTrecho', levelId: descarga.id, disciplina: 'INCENDIO', a: { ...a }, b: { ...b }, cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  return {
    comandos: [peca(descarga.id, 'HIDRANTE_RECALQUE', lugar, cota), trecho(lugar, cota, no.p, cota), trecho(no.p, cota, no.p, no.cota)],
    pendencias,
  };
}

/**
 * 3 · O VOLUME, depois do DN: a RTI exigida pelo cálculo (vazão na fonte ×
 * autonomia) no módulo comercial acima — no reservatório de incêndio (PRÓPRIA) ou
 * como `volumeRtiL` da caixa de água fria (PARCELA; a caixa cresce para caber o
 * consumo que já tinha + a RTI). E a CURVA da bomba sem curva, se o catálogo tem
 * uma que atende o ponto de projeto; senão, o relatório diz o ponto.
 */
export function proporReserva(model: BlueprintModel, hip: HipotesesIncendio, catalogo: readonly BombaCandidata[] = []): PropostaDaCasaDeBombas {
  const comandos: Command[] = [];
  const pendencias: string[] = [];
  const { calculo, bomba } = calculoDoEstudo(model, hip);
  const exigida = calculo.rti.exigidaL;
  const ts = model.terminais ?? [];
  if (exigida == null) {
    pendencias.push(`Reserva técnica: o cálculo não fechou (${calculo.motivo ?? 'sem cenário'}) — o volume não foi dimensionado.`);
  } else {
    const alvo = moduloComercialL(exigida);
    if (hip.bombeamento.reserva === 'PROPRIA') {
      const caixa = ts.find((t) => ehDoTipo(t, 'RESERVATORIO'));
      if (caixa && (caixa.volumeL ?? 0) < exigida) comandos.push({ type: 'SetTerminalProps', terminalId: caixa.id, volumeL: alvo } as Command);
    } else {
      const caixa = ts.find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA');
      if (caixa && (caixa.volumeRtiL ?? 0) < exigida) {
        const consumo = Math.max(0, (caixa.volumeL ?? 0) - (caixa.volumeRtiL ?? 0));
        const total = Math.max(caixa.volumeL ?? 0, moduloComercialL(consumo + alvo));
        comandos.push({ type: 'SetTerminalProps', terminalId: caixa.id, volumeL: total, volumeRtiL: alvo } as Command);
      }
    }
  }
  // A curva: só da bomba que ainda não tem.
  const principal = ts.find((t) => ehDoTipo(t, 'BOMBA_INCENDIO'));
  if (principal && !principal.curvaBomba && hip.bombeamento.alimentacao === 'BOMBA') {
    const projeto = bomba?.projeto ?? null;
    const escolhida = projeto ? bombasQueAtendem(catalogo, projeto)[0] : undefined;
    if (escolhida) comandos.push({ type: 'SetTerminalProps', terminalId: principal.id, tipo: escolhida.candidata.nome, curvaBomba: escolhida.candidata.curva } as Command);
    else {
      const ponto = projeto ? `${Math.round(projeto.vazaoLmin)} L/min a ${projeto.alturaM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mca` : 'sem ponto de projeto (o cálculo não fechou)';
      pendencias.push(`Bomba de incêndio: curva a escolher — ponto de projeto ${ponto}${catalogo.length ? '; nenhuma bomba do catálogo atende' : '; o catálogo da organização não tem bomba de incêndio'}.`);
    }
  }
  return { comandos, pendencias };
}
