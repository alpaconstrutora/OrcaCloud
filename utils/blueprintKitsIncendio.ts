/**
 * F1 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — O KIT DA PEÇA DE INCÊNDIO.
 *
 * Inserir uma peça de incêndio (à mão ou por uma proposta) lança, NUM lote só (um
 * Ctrl+Z), o que vai com ela:
 *  - a PLACA do equipamento (hidrante, mangotinho, extintor, recalque) — `comPlacas`;
 *  - na VGA: o MANÔMETRO de montante e o de jusante e o REGISTRO de bloqueio, sobre
 *    os tubos que chegam nela (a 30 e a 60 cm dela).
 *
 *  - F6: na LUMINÁRIA DE EMERGÊNCIA, o ponto de ALIMENTAÇÃO dela no circuito de
 *    iluminação do local (ponto elétrico de iluminação, `POTENCIA_DA_LUMINARIA_W`)
 *    — os circuitos automáticos e o quadro de cargas passam a contá-la.
 *
 * O DRENO da VGA não entra como peça: seria um ramal sem destino — a verificação o
 * acusaria como ponta aberta. Ele continua no detalhe típico (E8.3).
 *
 * A VGA fora da rede (nenhum tubo chega à posição dela) não ganha manômetro: o
 * `aviso` diz por quê — sem tubo não há onde medir pressão.
 */
import type { BlueprintModel, Command, Point, Terminal, Trecho } from './blueprintKernel';
import { applyBatch } from './blueprintKernel';
import { comPlacas } from './blueprintSinalizacao';

/** Distâncias do kit da VGA ao longo do tubo, mm: manômetro e, no de montante, o registro de bloqueio. */
const DO_MANOMETRO_MM = 300;
const DO_REGISTRO_MM = 600;

const ehVga = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'VGA';
const ehLuminaria = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'LUMINARIA_EMERGENCIA';
/** F6: a carga da luminária autônoma no circuito de iluminação (carregador da bateria), W — CONFERIR com o fabricante. */
export const POTENCIA_DA_LUMINARIA_W = 10;
export const ROTULO_DA_ALIMENTACAO = 'Alimentação da luminária de emergência';

/**
 * F6: o ponto de alimentação de cada luminária de emergência que ainda não tem (um ponto elétrico a
 * menos de 5 cm dela) — de iluminação, para entrar no circuito de luz do ambiente, não num exclusivo.
 */
export function alimentacaoDasLuminarias(model: BlueprintModel, apenas?: ReadonlySet<string>): Command[] {
  const eletricos = (model.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA');
  return (model.terminais ?? [])
    .filter((t) => ehLuminaria(t) && (!apenas || apenas.has(t.id)))
    .filter((t) => !eletricos.some((e) => e.levelId === t.levelId && Math.hypot(e.at.x - t.at.x, e.at.y - t.at.y) < 50))
    .map(
      (t) =>
        ({ type: 'AddTerminal', levelId: t.levelId, disciplina: 'ELETRICA', tipo: ROTULO_DA_ALIMENTACAO, tipoEletrico: 'ILUMINACAO_PAREDE', at: { x: t.at.x, y: t.at.y }, cotaMm: t.cotaMm, potenciaW: POTENCIA_DA_LUMINARIA_W }) as Command,
    );
}

/** O ponto a `d` mm de `de` ao longo do trecho (rumo à outra ponta), com a cota interpolada. */
function aoLongo(t: Trecho, deA: boolean, d: number): { at: Point; cotaMm: number } | null {
  const [p, q, cp, cq] = deA ? [t.a, t.b, t.cotaAMm, t.cotaBMm] : [t.b, t.a, t.cotaBMm, t.cotaAMm];
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  if (L < d + 100) return null; // tubo curto demais para a peça caber sobre ele
  const k = d / L;
  return { at: { x: Math.round(p.x + (q.x - p.x) * k), y: Math.round(p.y + (q.y - p.y) * k) }, cotaMm: Math.round(cp + (cq - cp) * k) };
}

/** Os comandos do kit da VGA `v` no modelo `m` (a VGA já aplicada). */
function kitDaVga(m: BlueprintModel, v: Terminal): Command[] {
  const tocam = (m.trechos ?? [])
    .filter((t) => t.disciplina === 'INCENDIO' && t.levelId === v.levelId)
    .flatMap((t) => {
      const emA = Math.hypot(t.a.x - v.at.x, t.a.y - v.at.y) < 1 && Math.abs(t.cotaAMm - v.cotaMm) < 1;
      const emB = Math.hypot(t.b.x - v.at.x, t.b.y - v.at.y) < 1 && Math.abs(t.cotaBMm - v.cotaMm) < 1;
      return emA ? [{ t, deA: true }] : emB ? [{ t, deA: false }] : [];
    })
    .filter((x) => Math.hypot(x.t.b.x - x.t.a.x, x.t.b.y - x.t.a.y) >= 1) // o tubo em planta (a vertical não leva peça)
    .slice(0, 2);
  const peca = (tipo: string, p: { at: Point; cotaMm: number }): Command =>
    ({ type: 'AddTerminal', levelId: v.levelId, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: p.at, cotaMm: p.cotaMm }) as Command;
  const lote: Command[] = [];
  tocam.forEach((x, i) => {
    const mano = aoLongo(x.t, x.deA, DO_MANOMETRO_MM);
    if (mano) lote.push(peca('MANOMETRO', mano));
    // O registro de bloqueio, no primeiro tubo (o de montante quando há dois — o desenho não diz o
    // sentido antes do cálculo; o primeiro é o que chega à VGA na ordem do desenho).
    if (i === 0) {
      const reg = aoLongo(x.t, x.deA, DO_REGISTRO_MM);
      if (reg) lote.push(peca('REGISTRO_GAVETA', reg));
    }
  });
  return lote;
}

/**
 * O lote da peça com o kit dela: placas (de quem pede placa) e, de cada VGA criada, os
 * manômetros e o registro. Os ids são previstos aplicando numa cópia (como `comPlacas`).
 */
export function kitDaPeca(model: BlueprintModel, comandos: Command[]): { comandos: Command[]; aviso: string | null } {
  if (!comandos.length) return { comandos, aviso: null };
  const comPlaca = comPlacas(model, comandos);
  let r;
  try {
    r = applyBatch(model, comPlaca);
  } catch {
    return { comandos: comPlaca, aviso: null };
  }
  const antes = new Set((model.terminais ?? []).map((t) => t.id));
  const vgas = (r.model.terminais ?? []).filter((t) => !antes.has(t.id) && ehVga(t));
  const novasLuminarias = new Set((r.model.terminais ?? []).filter((t) => !antes.has(t.id) && ehLuminaria(t)).map((t) => t.id));
  const extras = [...vgas.flatMap((v) => kitDaVga(r.model, v)), ...(novasLuminarias.size ? alimentacaoDasLuminarias(r.model, novasLuminarias) : [])];
  const semRede = vgas.filter((v) => !kitDaVga(r.model, v).length);
  return {
    comandos: [...comPlaca, ...extras],
    aviso: semRede.length ? 'VGA fora da rede: os manômetros e o registro do kit entram quando ela estiver na ponta de um tubo de incêndio.' : null,
  };
}
