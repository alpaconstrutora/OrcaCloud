/**
 * Prédio automático — a ELÉTRICA COLETIVA (PA5a do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026). Os
 * motores da casa (pontos pela norma, centro de cargas, circuitos, DR, entrada), com a regra do prédio:
 *
 * - Pontos pela norma em todos os cômodos do TIPO e do TÉRREO.
 * - Um QD por UNIDADE no tipo (no centro de cargas dela), filho do QGBT e com a unidade — as cópias recebem o QD e os
 *   circuitos pela cópia viva (PA1), e a demanda conta a unidade de cada andar (101, 201, 301…).
 * - Os circuitos de cada unidade só com os pontos DELA: o planejador de circuitos pega os pontos soltos do pavimento, e
 *   recebe aqui uma VISTA do modelo com os pontos de uma unidade só (os ids previstos dos circuitos vêm da lista de
 *   circuitos, que a vista não muda).
 * - No térreo, na sala de medição: o QGBT (trifásico), a entrada de serviço, um MEDIDOR por unidade de cada andar
 *   (`unidadeLevelId`, kernel 0.107.0) e o do condomínio, e o QUADRO DE SERVIÇO (filho do QGBT) com as áreas comuns (as
 *   do térreo e as circulações do tipo), o elevador e as bombas de recalque.
 * - DR de 30 mA onde a NBR 5410 pede (`sugerirDRs`), DPS no QGBT; a ligação de cada QD pela demanda dele.
 *
 * Roda ANTES da marca `copiaInstalacoes` do tipo (a etapa Instalações no tipo): com ela, cada comando no tipo re-deriva as
 * instalações das cópias (21 ms × centenas de pontos no R8); sem ela, a cópia é uma sincronização só, no fim.
 */
import { pointInPolygon } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point, Terminal } from '../blueprintKernel';
import { centroDeCargas } from '../blueprintCentroDeCargas';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, preDimensionarQuadroCompleto, sugerirDPS } from '../blueprintEletricaDimensionamento';
import { entradaDoQuadro, padraoDeEntrada } from '../blueprintEntradaDeEnergia';
import { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from '../blueprintNbr5410';
import { comandosDePontosDoNivel } from '../blueprintPontosEletricosDoNivel';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';

/** As cargas do condomínio que o quadro de serviço leva além das áreas comuns (hipóteses nomeadas, padrões de projeto). */
export const POTENCIA_DO_ELEVADOR_W = 7500;
export const POTENCIA_DA_BOMBA_DE_RECALQUE_W = 2200;
/** Uma luz de teto a cada tantos m² nas salas comuns do térreo e da cobertura (hipótese de projeto). */
export const AREA_POR_LUMINARIA_COMUM_M2 = 20;

export interface EletricaDoPredio {
  comandos: number;
  pontos: { tomadas: number; luzes: number; interruptores: number };
  /** QDs das unidades no tipo (cada cópia repete). */
  quadros: number;
  /** Circuitos das unidades no tipo (cada cópia repete). */
  circuitos: number;
  servico: { circuitos: number; motores: number };
  medidores: number;
  drs: number;
  qgbtId: ObjectId | null;
  avisos: string[];
}

const tipoDe = (c: Command) => (c.type === 'AddTerminal' ? (c as { tipoEletrico?: string | null }).tipoEletrico ?? null : null);

/** A vista do modelo com só os pontos SOLTOS de `levelId` que `ficam` aceita (os dos outros pavimentos ficam). */
function vistaComOsPontos(m: BlueprintModel, levelId: ObjectId, ficam: (t: Terminal) => boolean): BlueprintModel {
  return { ...m, terminais: (m.terminais ?? []).filter((t) => t.levelId !== levelId || t.disciplina !== 'ELETRICA' || t.circuitoId != null || ficam(t)) };
}

/** A ligação do QD pela demanda: a menor categoria do padrão de entrada que comporta, no empate a de menos fases. */
function ligacaoPelaDemanda(m: BlueprintModel, quadroId: ObjectId): Command[] {
  const r = preDimensionarQuadroCompleto(m, quadroId, HIPOTESES_ELETRICAS_PADRAO);
  if (!r) return [];
  const nFases: Record<string, number> = { FN: 1, FF: 2, FFF: 3 };
  const kva = r.sDemandadaVA / 1000;
  const cat = [...padraoDeEntrada(HIPOTESES_ELETRICAS_PADRAO.padraoDeEntrada).categorias].sort((a, b) => a.demandaMaxKva - b.demandaMaxKva || (nFases[a.ligacao] ?? 9) - (nFases[b.ligacao] ?? 9)).find((c) => c.demandaMaxKva >= kva);
  return cat && cat.ligacao !== 'FN' ? [{ type: 'SetQuadroProps', quadroId, ligacao: cat.ligacao }] : [];
}

export function lancarEletrica(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  terreo: { levelId: ObjectId; medicao: Point | null; bombas: Point | null } | null,
  cobertura: { levelId: ObjectId } | null,
): EletricaDoPredio {
  const { tipoLevelId: tipo } = base;
  const avisos: string[] = [];
  let comandos = 0;
  const pe = (id: ObjectId) => ctx.m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 3000;

  // ── Pontos pela norma: o tipo e o térreo.
  // A cobertura também (a área técnica pede luz e tomada — sem ela a 9.5.2.1 acusava falta). No térreo e na cobertura, as
  // salas são grandes (480 m² de área técnica no R8): uma luz a cada `AREA_POR_LUMINARIA_COMUM_M2` — com uma só, a carga
  // mínima da área inteira caía num ponto, e nenhuma seção comportava o circuito dele.
  const lote = [
    ...comandosDePontosDoNivel(ctx.m, tipo, { peDireitoMm: pe(tipo) }),
    ...[...(terreo ? [terreo.levelId] : []), ...(cobertura ? [cobertura.levelId] : [])].flatMap((L) => comandosDePontosDoNivel(ctx.m, L, { peDireitoMm: pe(L), areaPorLuminariaM2: AREA_POR_LUMINARIA_COMUM_M2 })),
  ];
  const pontos = {
    tomadas: lote.filter((c) => tipoDe(c) === 'TUG' || tipoDe(c) === 'TUE').length,
    luzes: lote.filter((c) => /^ILUMINACAO/.test(tipoDe(c) ?? '')).length,
    interruptores: lote.filter((c) => tipoDe(c) === 'INTERRUPTOR').length,
  };
  comandos += ctx.aplicar(lote);

  // ── QGBT e quadro de serviço no térreo (na sala de medição; sem térreo, no tipo — e a medição fica para o projetista).
  const ondeMedicao = terreo?.medicao ?? null;
  const nivelDaMedicao = terreo && ondeMedicao ? terreo.levelId : tipo;
  const pontoDaMedicao = ondeMedicao ?? base.bloco.pontos[0];
  const criar = (c: Command): ObjectId => {
    const antes = new Set(ctx.m.quadros.map((q) => q.id));
    comandos += ctx.aplicar([c]);
    return ctx.m.quadros.find((q) => !antes.has(q.id))!.id;
  };
  const qgbt = criar({ type: 'AddQuadro', levelId: nivelDaMedicao, nome: 'QGBT', at: pontoDaMedicao, cotaMm: 1600, tipo: 'QGBT', ligacao: 'FFF', tensaoV: 220 });
  const qs = criar({ type: 'AddQuadro', levelId: nivelDaMedicao, nome: 'QS — serviço', at: { x: pontoDaMedicao.x + 800, y: pontoDaMedicao.y }, cotaMm: 1600, tipo: 'QD', quadroPaiId: qgbt, ligacao: 'FFF', tensaoV: 220 });
  if (!ondeMedicao) avisos.push('Sem a sala de medição no térreo, o QGBT e o quadro de serviço ficaram no tipo — reposicione e lance os medidores.');

  // ── Um QD por unidade, no centro de cargas dela, com os circuitos só dos pontos dela.
  const dentro = (anel: readonly Point[]) => (t: Terminal) => pointInPolygon(anel as Point[], t.at);
  let quadros = 0;
  let circuitos = 0;
  let drs = 0;
  const qds: ObjectId[] = [];
  for (const u of base.divisao.unidades) {
    const reg = (ctx.m.unidades ?? []).find((x) => x.numero === u.numero);
    const daUnidade = dentro(u.anel);
    const vista = vistaComOsPontos(ctx.m, tipo, daUnidade);
    const c = centroDeCargas({ ...vista, terminais: (vista.terminais ?? []).filter((t) => t.levelId === tipo && daUnidade(t)) }, null);
    if (!c) {
      avisos.push(`Unidade ${u.numero}: nenhum ponto com potência — sem QD.`);
      continue;
    }
    const qd = criar({ type: 'AddQuadro', levelId: tipo, nome: `QD ${u.numero}`, at: c.posicaoSugerida, cotaMm: 1600, tipo: 'QD', quadroPaiId: qgbt, ...(reg ? { unidadeId: reg.id } : {}) });
    qds.push(qd);
    quadros++;
    const plano = planejarCircuitos(vistaComOsPontos(ctx.m, tipo, daUnidade), tipo, qd, HIPOTESES_CIRCUITOS_PADRAO, HIPOTESES_ELETRICAS_PADRAO);
    comandos += ctx.aplicar(plano.comandos);
    circuitos += plano.circuitos.length;
    for (const f of plano.foraDoPlano) if (!/ponto de dados/.test(f.motivo)) avisos.push(`QD ${u.numero}: ${f.motivo}`);
    const dr = comandosDasSugestoesDeDR(sugerirDRs(ctx.m, qd, HIPOTESES_ELETRICAS_PADRAO));
    comandos += ctx.aplicar([...dr, ...ligacaoPelaDemanda(ctx.m, qd)]);
    drs += dr.length;
  }

  // ── Quadro de serviço: o elevador (na cobertura, junto da casa de máquinas) e as bombas de recalque (casa de bombas).
  const motores: Command[] = [];
  const nivelDoElevador = cobertura?.levelId ?? base.ultimoLevelId;
  for (const n of (ctx.m.nucleos ?? []).filter((x) => x.tipo === 'ELEVADOR')) {
    const at = { x: Math.round(n.ring.reduce((s, p) => s + p.x, 0) / n.ring.length), y: Math.round(n.ring.reduce((s, p) => s + p.y, 0) / n.ring.length) };
    motores.push({ type: 'AddTerminal', levelId: nivelDoElevador, disciplina: 'ELETRICA', tipo: 'Ligação direta', at, cotaMm: 1500, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: POTENCIA_DO_ELEVADOR_W, rotulo: n.rotulo ? `Elevador ${n.rotulo}` : 'Elevador', sugerida: true });
  }
  if (terreo?.bombas) {
    for (const [i, dx] of [-500, 500].entries()) {
      motores.push({ type: 'AddTerminal', levelId: terreo.levelId, disciplina: 'ELETRICA', tipo: 'Bomba', at: { x: terreo.bombas.x + dx, y: terreo.bombas.y + 800 }, cotaMm: 300, tipoEletrico: 'MOTOR_BOMBA', potenciaW: POTENCIA_DA_BOMBA_DE_RECALQUE_W, rotulo: i === 0 ? 'Bomba de recalque' : 'Bomba de recalque (reserva)', sugerida: true });
    }
  }
  comandos += ctx.aplicar(motores);
  // As áreas comuns: o térreo, a cobertura e os motores no quadro de serviço; as circulações de cada andar num QUADRO DE
  // SERVIÇO DO ANDAR (QDS) no tipo, filho do QS — a cópia viva dá a cada andar o seu QDS com os seus circuitos. Pendurados
  // direto no QS, os pontos dos 7 andares caíam nos MESMOS circuitos (pai fora do tipo), e a seção não comportava.
  const foraDasUnidades = (t: Terminal) => !base.divisao.unidades.some((u) => dentro(u.anel)(t));
  let servico = 0;
  const comunsDoTipo = vistaComOsPontos(ctx.m, tipo, foraDasUnidades);
  const centroComum = centroDeCargas({ ...comunsDoTipo, terminais: (comunsDoTipo.terminais ?? []).filter((t) => t.levelId === tipo && t.disciplina === 'ELETRICA' && t.circuitoId == null && foraDasUnidades(t)) }, null);
  const qdsDoAndar: ObjectId[] = [];
  if (centroComum) {
    const qds = criar({ type: 'AddQuadro', levelId: tipo, nome: 'QDS — serviço do andar', at: centroComum.posicaoSugerida, cotaMm: 1600, tipo: 'QD', quadroPaiId: qs });
    qdsDoAndar.push(qds);
    const plano = planejarCircuitos(vistaComOsPontos(ctx.m, tipo, foraDasUnidades), tipo, qds, HIPOTESES_CIRCUITOS_PADRAO, HIPOTESES_ELETRICAS_PADRAO);
    comandos += ctx.aplicar(plano.comandos);
    servico += plano.circuitos.length;
  }
  const niveisDoServico: ObjectId[] = [...(terreo ? [terreo.levelId] : []), ...(cobertura ? [cobertura.levelId] : []), ...(nivelDoElevador !== tipo ? [nivelDoElevador] : [])];
  for (const L of [...new Set(niveisDoServico)]) {
    const plano = planejarCircuitos(ctx.m, L, qs, HIPOTESES_CIRCUITOS_PADRAO, HIPOTESES_ELETRICAS_PADRAO);
    comandos += ctx.aplicar(plano.comandos);
    servico += plano.circuitos.length;
  }
  // O elevador é motor TRIFÁSICO: o circuito dele em FFF/220 V (no bifásico, 7,5 kW davam 34 A e a seção não comportava).
  const doElevador = new Set((ctx.m.terminais ?? []).filter((t) => t.tipoEletrico === 'LIGACAO_DIRETA' && /^Elevador/.test(t.rotulo ?? '') && t.circuitoId).map((t) => t.circuitoId!));
  comandos += ctx.aplicar([...doElevador].map((circuitoId): Command => ({ type: 'SetCircuitoProps', circuitoId, ligacao: 'FFF', tensaoV: 220 })));
  // DR onde a NBR 5410 pede também nos quadros de serviço (o do elevador, o das áreas molhadas comuns).
  for (const q of [qs, ...qdsDoAndar]) {
    const dr = comandosDasSugestoesDeDR(sugerirDRs(ctx.m, q, HIPOTESES_ELETRICAS_PADRAO));
    comandos += ctx.aplicar(dr);
    drs += dr.length;
  }

  // ── Medição no térreo: a entrada de serviço, o medidor do condomínio e um por unidade de cada andar.
  let medidores = 0;
  if (terreo && ondeMedicao) {
    const andares = [tipo, ...ctx.m.levels.filter((l) => l.tipoDeId === tipo).sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.id)];
    const unidades = (ctx.m.unidades ?? []).filter((x) => base.divisao.unidades.some((u) => u.numero === x.numero));
    const med: Command[] = [{ type: 'AddTerminal', levelId: terreo.levelId, disciplina: 'ELETRICA', tipo: 'Entrada de serviço', at: { x: ondeMedicao.x - 800, y: ondeMedicao.y }, cotaMm: 1500, tipoEletrico: 'ENTRADA_SERVICO', quadroId: qgbt, sugerida: true }];
    const porLinha = Math.max(1, unidades.length);
    const todos: { unidadeId: ObjectId | null; levelId: ObjectId | null }[] = [{ unidadeId: null, levelId: null }, ...andares.flatMap((L) => unidades.map((u) => ({ unidadeId: u.id, levelId: L === tipo ? null : L })))];
    todos.forEach((x, i) => {
      const at = { x: ondeMedicao.x - 1200 + 300 * (i % (porLinha + 1)), y: ondeMedicao.y - 600 - 300 * Math.floor(i / (porLinha + 1)) };
      med.push({ type: 'AddTerminal', levelId: terreo.levelId, disciplina: 'ELETRICA', tipo: 'Medidor', at, cotaMm: 1500, tipoEletrico: 'MEDIDOR', quadroId: qgbt, ...(x.unidadeId ? { unidadeId: x.unidadeId } : {}), ...(x.levelId ? { unidadeLevelId: x.levelId } : {}), rotulo: x.unidadeId ? null : 'Condomínio', sugerida: true });
    });
    comandos += ctx.aplicar(med);
    medidores = todos.length;
  }
  // DPS no QGBT (a classe da hipótese).
  comandos += ctx.aplicar([{ type: 'SetQuadroProps', quadroId: qgbt, dps: sugerirDPS(HIPOTESES_ELETRICAS_PADRAO) }]);
  return { comandos, pontos, quadros, circuitos, servico: { circuitos: servico, motores: motores.length }, medidores, drs, qgbtId: qgbt, avisos };
}

/** Depois da cópia viva: a entrada do QGBT (demanda pela diversidade, categoria, unidades atendidas × medidas) e a NBR 5410. */
export function conferirEletricaDoPredio(m: BlueprintModel, qgbtId: ObjectId) {
  const e = entradaDoQuadro(m, qgbtId, HIPOTESES_ELETRICAS_PADRAO);
  const nbr = conferirNbr5410(m, null, HIPOTESES_ELETRICAS_PADRAO);
  return { entrada: e, nbr };
}
