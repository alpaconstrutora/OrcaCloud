/**
 * Prédio automático — a CLIMATIZAÇÃO no quadro da unidade, os ELETRODUTOS e a PRUMADA no shaft (PA5b do plano
 * docs/planos/2026-11-12-predio-automatico.md, 14/11/2026). Os motores da casa (gerador de climatização, planejador de
 * eletrodutos), com a regra do prédio:
 *
 * - Climatização SÓ no tipo (`niveis`): as cópias recebem os splits, as linhas e os circuitos pela cópia viva. Cada ponto
 *   de ar vai ao QD da unidade onde caiu (`quadroDoPonto`); a condensadora na fachada, fora da fatia, vai à unidade mais
 *   perto.
 * - Eletrodutos por quadro: os QDs e o QDS do tipo (vão às cópias); o diâmetro pela ocupação. O QS fica com o projetista.
 * - A prumada dos alimentadores no SHAFT: um trecho vertical no térreo e no tipo (as cópias repetem) — contínua do térreo
 *   ao último andar, no lugar que o shaft reserva à elétrica (`lugarNoShaft`).
 *
 * Roda antes da marca `copiaInstalacoes` do tipo, como a elétrica (PA5a).
 */
import { pointInPolygon } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point } from '../blueprintKernel';
import type { HipotesesClimatizacao } from '../blueprintClimatizacao';
import type { ContextoDaCarga } from '../blueprintCargaTermica';
import type { ModeloDoCatalogo } from '../blueprintSelecaoClimatizacao';
import { HIPOTESES_CIRCUITOS_PADRAO } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO } from '../blueprintEletricaDimensionamento';
import { GRAFO_DO_FORRO_DO_PREDIO_ATE_NOS, HIPOTESES_ELETRODUTO_PADRAO, comandosDeBitolaPelaOcupacao, planejarEletrodutos, type HipotesesDeEletroduto } from '../blueprintEletrodutos';
import { forroDaEletrica } from '../casaAutomatica/forroEPressao';
import { HIPOTESES_DO_FORRO_DA_CASA_PADRAO } from '../casaAutomatica/hipoteses';
import { escolhasDoEletroduto } from '../blueprintEscolhasDoEletroduto';
import { comandoDeRegistro } from '../blueprintRegistroDeLancamento';
import { gerarClimatizacao } from '../blueprintGeradorClimatizacao';
import { lugarNoShaft } from '../blueprintNucleoVertical';
import type { PendenciaDoPpci } from '../blueprintGeradorPpci';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';

/** O que a climatização lê fora do desenho — o mesmo que a casa recebe do editor. */
export interface ClimatizacaoDoPedido {
  hip: HipotesesClimatizacao;
  modelos: ModeloDoCatalogo[];
  carga: ContextoDaCarga;
}

/** O diâmetro reservado à prumada dos alimentadores (eletrocalha/eletroduto), mm — hipótese até o dimensionamento dela. */
export const BITOLA_DA_PRUMADA_MM = 100;

const centro = (pts: readonly Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

export interface ClimatizacaoLancada {
  comandos: number;
  equipamentos: number;
  pendencias: PendenciaDoPpci[];
  motivo: string | null;
}

export function lancarClimatizacao(ctx: ContextoDoPredio, base: BaseDoPredio, pedido: ClimatizacaoDoPedido | null): ClimatizacaoLancada {
  if (!pedido || pedido.modelos.length === 0) return { comandos: 0, equipamentos: 0, pendencias: [], motivo: 'sem catálogo de evaporadoras — cadastre os modelos (Catálogo de tipos) para escolher os splits' };
  const { tipoLevelId: tipo } = base;
  // O QD de cada unidade no tipo, pelo nome que a elétrica dá ("QD 101").
  const qds = base.divisao.unidades
    .map((u) => ({ anel: u.anel as Point[], c: centro(u.anel), qd: (ctx.m.quadros ?? []).find((q) => q.levelId === tipo && q.nome === `QD ${u.numero}`)?.id ?? null }))
    .filter((x): x is { anel: Point[]; c: Point; qd: ObjectId } => !!x.qd);
  const quadroDoPonto = (_m: unknown, t: { at: Point; levelId: ObjectId }): ObjectId | null => {
    if (t.levelId !== tipo || qds.length === 0) return null;
    const dentro = qds.find((x) => pointInPolygon(x.anel, t.at));
    if (dentro) return dentro.qd;
    return [...qds].sort((a, b) => Math.hypot(a.c.x - t.at.x, a.c.y - t.at.y) - Math.hypot(b.c.x - t.at.x, b.c.y - t.at.y))[0].qd;
  };
  const plano = gerarClimatizacao(ctx.m, pedido.hip, {
    modelos: pedido.modelos,
    carga: pedido.carga,
    circuitos: { hip: HIPOTESES_CIRCUITOS_PADRAO, eletricas: HIPOTESES_ELETRICAS_PADRAO },
    niveis: [tipo],
    quadroDoPonto,
    condensadorasSeparadas: true,
  });
  const comandos = ctx.aplicar(plano.comandos);
  const equipamentos = plano.comandos.filter((c) => c.type === 'AddTerminal' && (c as { tipoEletrico?: string | null }).tipoEletrico === 'AR_CONDICIONADO').length;
  // PA10b: os conflitos de trecho (abertura, estrutura, rede, equipamento) e os encostos de 0 mm saem no relatório de
  // compatibilização do prédio inteiro (`compatibilizacao.ts`), contados e com o local — aqui eram uma linha por trecho.
  const deTrecho = (x: PendenciaDoPpci) => x.grupo === 'CONFLITO' && /^[a-z ]+: trecho \S+ × /.test(x.texto);
  const pendencias: PendenciaDoPpci[] = plano.pendencias.filter((x) => !deTrecho(x)).map((x) => ({ ...x, texto: `Climatização: ${x.texto}` }));
  const travou = plano.etapas.find((e) => e.situacao === 'NAO_RODOU');
  return { comandos, equipamentos, pendencias, motivo: comandos ? null : (travou?.nota ?? 'nada a climatizar') };
}

export interface RedeEletricaLancada {
  comandos: number;
  eletrodutos: number;
  bitolasAumentadas: number;
  prumadas: number;
  avisos: string[];
}

/**
 * PA13: o pavimento de cima do tipo é a 1ª cópia dele, ainda SEM as instalações (a cópia viva entra no fim do plano). O
 * eletroduto junto da laje desvia dos ramais de esgoto do andar de cima e das descidas das louças pela laje
 * (`ramaisDaLajeDeCima`, a descida do forro) — então o planejador lê, no pavimento de cima, o que o tipo tem sob o piso:
 * exatamente o que a cópia vai ter. Só para planejar; os comandos valem no modelo de verdade.
 */
export function comOAndarDeCima(m: BlueprintModel, tipoLevelId: ObjectId): BlueprintModel {
  const niveis = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const i = niveis.findIndex((l) => l.id === tipoLevelId);
  const acima = i >= 0 ? niveis[i + 1] : undefined;
  // Com a cópia viva das instalações já ligada, a cópia tem os próprios trechos — nada a espelhar.
  if (!acima || acima.tipoDeId !== tipoLevelId || niveis[i].copiaInstalacoes) return m;
  const sobOPiso = (m.trechos ?? []).filter((t) => t.levelId === tipoLevelId && t.disciplina !== 'ELETRICA' && Math.min(t.cotaAMm, t.cotaBMm) < 0);
  // E as peças de climatização no piso (o ponto de dreno): o eletroduto junto da laje passava por elas.
  const noPiso = (m.terminais ?? []).filter((t) => t.levelId === tipoLevelId && t.disciplina !== 'ELETRICA' && !!t.tipoHidraulico && t.cotaMm < 200);
  if (!sobOPiso.length && !noPiso.length) return m;
  return {
    ...m,
    trechos: [...(m.trechos ?? []), ...sobOPiso.map((t, k) => ({ ...t, id: `${t.id}__de_cima_${k}`, uid: `${t.uid}__de_cima`, levelId: acima.id }))],
    terminais: [...(m.terminais ?? []), ...noPiso.map((t, k) => ({ ...t, id: `${t.id}__de_cima_${k}`, uid: `${t.uid}__de_cima`, levelId: acima.id }))],
  };
}

/** PA13: o eletroduto do prédio — o padrão, na faixa da elétrica do forro da casa (junto da laje). */
export const HIPOTESES_ELETRODUTO_DO_PREDIO: HipotesesDeEletroduto = { ...HIPOTESES_ELETRODUTO_PADRAO, noForro: { ...forroDaEletrica(HIPOTESES_DO_FORRO_DA_CASA_PADRAO), grafoAteNos: GRAFO_DO_FORRO_DO_PREDIO_ATE_NOS } };

export function lancarEletrodutosEPrumada(ctx: ContextoDoPredio, base: BaseDoPredio, terreoLevelId: ObjectId | null): RedeEletricaLancada {
  const { tipoLevelId: tipo } = base;
  const avisos: string[] = [];
  let comandos = 0;
  // Os quadros do TIPO cujos circuitos ficam TODOS no tipo (os QDs das unidades, o QDS — vão às cópias). O que alimenta
  // outro pavimento (o QS: cobertura, elevador — e, sem térreo, o próprio QGBT) fica de fora: o planejador levaria o
  // eletroduto pelos andares do meio, trecho lançado direto nas cópias, que a cópia viva recusa. Sobem pela prumada.
  const foraDoTipo = new Set((ctx.m.terminais ?? []).filter((t) => t.circuitoId && t.levelId !== tipo).map((t) => t.circuitoId!));
  const alimentaOutroPavimento = (qId: ObjectId) => (ctx.m.circuitos ?? []).some((c) => c.quadroId === qId && foraDoTipo.has(c.id));
  const quadros = (ctx.m.quadros ?? []).filter((q) => q.levelId === tipo && !alimentaOutroPavimento(q.id));
  if ((ctx.m.quadros ?? []).some((q) => (q.levelId === tipo || q.levelId === terreoLevelId) && q.tipo !== 'QGBT' && !quadros.includes(q))) avisos.push('Os eletrodutos do quadro de serviço (térreo, cobertura e elevador) ficam para o projetista — os circuitos da cobertura sobem pela prumada no shaft.');
  // PA13 (decisão do usuário, "eletroduto junto da laje"): a rede na faixa da elétrica do forro da casa (4,5 cm abaixo do
  // teto) — acima da linha frigorígena e do duto de ar (que correm a 2,35 m, sob a viga, onde a rede corria antes), da
  // água e do esgoto do andar de cima; a viga é atravessada pelas travessias previstas, como na casa.
  const hip = HIPOTESES_ELETRODUTO_DO_PREDIO;
  const escolhas = escolhasDoEletroduto(hip, HIPOTESES_ELETRICAS_PADRAO);
  let eletrodutos = 0;
  for (const q0 of quadros) {
    const q = (ctx.m.quadros ?? []).find((x) => x.id === q0.id)!;
    const p = planejarEletrodutos(comOAndarDeCima(ctx.m, tipo), q, hip, HIPOTESES_ELETRICAS_PADRAO);
    for (const a of p.avisos) avisos.push(`${q.nome}: ${a}`);
    if (!p.comandos.length) continue;
    eletrodutos += p.comandos.filter((c) => c.type === 'AddTrecho').length;
    comandos += ctx.aplicar([...p.comandos, comandoDeRegistro('ELETRODUTOS', q.id, escolhas)]);
  }
  const bitolas = comandosDeBitolaPelaOcupacao(ctx.m, HIPOTESES_ELETRICAS_PADRAO);
  comandos += ctx.aplicar(bitolas);

  // A prumada no shaft: térreo e tipo (as cópias repetem pela cópia viva).
  let prumadas = 0;
  const shaft = (ctx.m.nucleos ?? []).find((n) => n.tipo === 'SHAFT' && !n.disciplina);
  if (!shaft) avisos.push('Sem shaft no núcleo — a prumada dos alimentadores ficou para o projetista.');
  else {
    const niveis = [...(terreoLevelId ? [terreoLevelId] : []), tipo];
    const at = lugarNoShaft(ctx.m, centro(shaft.ring), null, 'ELETRICA', BITOLA_DA_PRUMADA_MM / 2, niveis);
    const lote: Command[] = niveis.map((L) => {
      const pe = ctx.m.levels.find((l) => l.id === L)?.defaultHeightMm ?? 3000;
      return { type: 'AddTrecho', levelId: L, disciplina: 'ELETRICA', a: { ...at }, b: { ...at }, cotaAMm: 0, cotaBMm: pe, bitolaMm: BITOLA_DA_PRUMADA_MM, rotulo: 'Prumada elétrica — alimentadores dos QDs' };
    });
    comandos += ctx.aplicar(lote);
    prumadas = lote.length;
  }
  return { comandos, eletrodutos, bitolasAumentadas: bitolas.length, prumadas, avisos };
}
