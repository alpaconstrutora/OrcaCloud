/**
 * Prédio automático — a DRENAGEM DA GARAGEM (PA8c do plano docs/planos/2026-11-12-predio-automatico.md, 15/11/2026).
 *
 * O piso da garagem recebe a chuva que desce pela rampa e a lavagem (com óleo e combustível). Em cada subsolo:
 *
 * - RALOS pela área (um a cada `AREA_POR_RALO_DA_GARAGEM_M2`, nos pontos livres de vaga e pilar) e uma CANALETA no pé de
 *   cada rampa;
 * - os do subsolo de cima descem por uma prumada até a área técnica do mais fundo (reservada na PA8a/c antes das vagas);
 * - lá, a CAIXA SEPARADORA de água e óleo (kernel 0.109.0) e, quando o fundo do poço fica abaixo da rede pública (a
 *   profundidade presumida do esgoto), o POÇO DE RECALQUE com duas BOMBAS (uma reserva) no quadro da garagem, e o
 *   RECALQUE subindo até a caixa de inspeção do esgoto no térreo. Acima da rede, a separadora vai por gravidade — fica em
 *   pendência (a ligação depende da cota da rede).
 *
 * Roda depois do esgoto (a caixa de inspeção do térreo já existe) e da elétrica (o QDG de cada subsolo).
 */
import { pointInPolygon, contornoDaVaga, pegadaEmPlanta } from '../blueprintKernel';
import type { Command, ObjectId, Point } from '../blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from '../blueprintHidraulica';
import { HIPOTESES_ESGOTO_PADRAO } from '../blueprintEsgotoAutomatico';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, preDimensionarCircuito } from '../blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, sugerirDRs } from '../blueprintNbr5410';
import type { PendenciaDoPpci } from '../blueprintGeradorPpci';
import type { ContextoDoPredio } from './terreoECobertura';
import { NOME_DA_GARAGEM, type SubsolosLancados } from './garagem';
import { caminhoPorFora, pedacosComCota, pilaresNaFaixa } from './contornoDePilar';

/** Um ralo a cada tantos m² de garagem (hipótese de projeto, PA8c). */
export const AREA_POR_RALO_DA_GARAGEM_M2 = 400;
/** Potência de cada bomba de drenagem (submersível; hipótese de projeto), W. */
export const POTENCIA_DA_BOMBA_DE_DRENAGEM_W = 1100;
/** A rede de drenagem corre sob o piso (na laje de baixo, a 30 cm), com caimento até a área técnica, mm. */
const COTA_SOB_O_PISO_MM = -300;
const COTA_DA_SEPARADORA_MM = -400;
const COTA_DA_CHEGADA_NO_POCO_MM = -900;
const DN_DA_DRENAGEM_MM = 100;
/** O fundo do poço de recalque abaixo do piso do subsolo mais fundo (a altura padrão do poço no kernel), mm. */
const CAIXAS_FUNDO_DO_POCO_MM = 1500;
const DN_DO_RECALQUE_MM = 50;
export const ROTULO_DA_DRENAGEM = 'Drenagem da garagem';
export const ROTULO_DO_RECALQUE_DA_DRENAGEM = 'Recalque da drenagem';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
const engordar = (anel: readonly Point[], mm: number): Point[] => {
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - mm, Math.max(...xs) + mm, Math.min(...ys) - mm, Math.max(...ys) + mm];
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
};
const trecho = (levelId: ObjectId, a: Point, ca: number, b: Point, cb: number, bitolaMm: number, rotulo: string): Command => ({
  type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: ca, cotaBMm: cb, bitolaMm, sugerido: true, rotulo,
});
const ponto = (levelId: ObjectId, tipo: 'RALO_SECO' | 'RALO_LINEAR' | 'CAIXA_SEPARADORA' | 'POCO_DE_RECALQUE', at: Point, cotaMm: number, rotulo: string | null = null): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo, at, cotaMm, tipoHidraulico: tipo, sugerida: true, ...(rotulo ? { rotulo } : {}) }) as Command;

/**
 * A rede de um subsolo em PENTE: um coletor na linha da chegada (o y do destino) e, de cada ralo, um ramal reto até ele
 * (os ralos da mesma coluna em fila, o mais longe primeiro). A cota cai 1 % no sentido do destino (sob o piso, nunca
 * acima de −5 cm); cada ralo desce do piso à cota do seu nó. Sem diagonais cruzando a garagem.
 *
 * PA22b (decisão do usuário 4a, 17/11/2026): cada aresta por fora dos pilares (`pegadas`, crescidas pelo raio e a folga)
 * — a coluna de ralos do R8 corria na linha dos pilares da garagem e atravessava quatro —, com a cota pelo comprimento do
 * contorno (a declividade de 1 % se mantém; os ralos de montante ficam um pouco mais fundos).
 */
function redeEmPente(levelId: ObjectId, ralos: Point[], destino: Point, cotaDoDestino: number, pegadas: readonly Point[][] = []): Command[] {
  if (!ralos.length) return [];
  const yD = destino.y;
  const arestas: [Point, Point][] = [];
  const colunas = new Map<number, Point[]>();
  for (const r of ralos) colunas.set(r.x, [...(colunas.get(r.x) ?? []), r]);
  const juncoes = new Set<number>([destino.x]);
  for (const [x, ps] of colunas) {
    const junta: Point = { x, y: yD };
    juncoes.add(x);
    for (const lado of [ps.filter((p) => p.y > yD), ps.filter((p) => p.y < yD)]) {
      const fila = [...lado].sort((a, b) => Math.abs(b.y - yD) - Math.abs(a.y - yD));
      fila.forEach((p, i) => arestas.push([p, fila[i + 1] ?? junta]));
    }
  }
  // O coletor: das junções mais longe de cada lado até o destino.
  for (const lado of [[...juncoes].filter((x) => x > destino.x), [...juncoes].filter((x) => x < destino.x)]) {
    const fila = [...lado].sort((a, b) => Math.abs(b - destino.x) - Math.abs(a - destino.x));
    fila.forEach((x, i) => arestas.push([{ x, y: yD }, { x: fila[i + 1] ?? destino.x, y: yD }]));
  }
  // O caminho de cada nó até o destino (a rede é árvore: soma as arestas a jusante).
  const chave = (p: Point) => `${p.x},${p.y}`;
  const caminhos = new Map<string, ReturnType<typeof caminhoPorFora>>();
  const caminho = (a: Point, b: Point) => {
    const k = `${chave(a)}|${chave(b)}`;
    let c = caminhos.get(k);
    if (!c) caminhos.set(k, (c = caminhoPorFora(a, b, pegadas)));
    return c;
  };
  const jusante = new Map(arestas.map(([a, b]) => [chave(a), b]));
  const ateODestino = (p: Point): number => {
    let L = 0;
    let q = p;
    for (let g = 0; g < 1000 && chave(q) !== chave(destino); g++) {
      const b = jusante.get(chave(q));
      if (!b) break;
      L += caminho(q, b).mm;
      q = b;
    }
    return L;
  };
  const cota = (p: Point) => Math.round(Math.min(-50, cotaDoDestino + 0.01 * ateODestino(p)));
  const cotaDe = (p: Point) => (chave(p) === chave(destino) ? cotaDoDestino : cota(p));
  return [
    // Cada ralo desce do piso à cota do nó dele (o ramal que chega de cima e o que sai para baixo se encontram ali).
    ...ralos.map((r) => trecho(levelId, r, 0, r, cotaDe(r), DN_DA_DRENAGEM_MM, ROTULO_DA_DRENAGEM)),
    ...arestas.filter(([a, b]) => dist(a, b) > 1).flatMap(([a, b]) => pedacosComCota(caminho(a, b).pts, cotaDe(a), cotaDe(b)).map((x) => trecho(levelId, x.a, x.cotaAMm, x.b, x.cotaBMm, DN_DA_DRENAGEM_MM, ROTULO_DA_DRENAGEM))),
  ];
}

export interface DrenagemDaGaragem {
  comandos: number;
  ralos: number;
  canaletas: number;
  separadora: boolean;
  /** Bombas de drenagem no poço (0 = acima da rede, sem poço). */
  bombas: number;
  recalque: boolean;
  pendencias: PendenciaDoPpci[];
}

export function lancarDrenagemDaGaragem(ctx: ContextoDoPredio, subsolos: SubsolosLancados, terreoLevelId: ObjectId): DrenagemDaGaragem {
  const pendencias: PendenciaDoPpci[] = [];
  const resultado: DrenagemDaGaragem = { comandos: 0, ralos: 0, canaletas: 0, separadora: false, bombas: 0, recalque: false, pendencias };
  const d = subsolos.drenagem;
  if (!d) {
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Garagem: sem a área técnica da drenagem, os ralos, a caixa separadora e o poço ficam para o projetista.' });
    return resultado;
  }
  const nivel = (id: ObjectId) => ctx.m.levels.find((l) => l.id === id)!;
  // Os subsolos de cima para baixo (o mais fundo por último) — os mesmos da PA8a.
  const niveis = subsolos.pisos.map((p) => p.levelId);
  const fila: Command[] = [];

  // ── Os ralos de cada subsolo: um a cada AREA_POR_RALO m², no ponto livre (fora de vaga, pilar, rampa e da área técnica)
  // mais perto do centro de cada célula de uma grade sobre a garagem.
  for (const levelId of niveis) {
    const garagem = ctx.m.spaces.find((s) => s.levelId === levelId && s.name === NOME_DA_GARAGEM);
    if (!garagem) continue;
    const dentro = (p: Point) => pointInPolygon(garagem.ring, p) && !garagem.holes.some((h) => pointInPolygon(h, p));
    const ocupado = [
      ...(ctx.m.vagas ?? []).filter((v) => v.levelId === levelId).map((v) => engordar(contornoDaVaga(v), 150)),
      ...ctx.m.structures.filter((s) => s.levelId === levelId && s.kind === 'PILAR').map((s) => engordar(pegadaEmPlanta(s), 300)),
      ...ctx.m.stairs.filter((e) => e.levelId === levelId || e.ateLevelId === levelId).map((e) => engordar(e.pontos, e.larguraMm / 2 + 300)),
      ...(d.levelId === levelId ? [engordar(d.anel, 300)] : []),
    ];
    const livre = (p: Point) => dentro(p) && !ocupado.some((o) => pointInPolygon(o, p));
    const xs = garagem.ring.map((p) => p.x);
    const ys = garagem.ring.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const n = Math.max(2, Math.ceil(garagem.areaMm2 / 1e6 / AREA_POR_RALO_DA_GARAGEM_M2));
    const colunas = Math.max(1, Math.round(Math.sqrt((n * (x1 - x0)) / Math.max(1, y1 - y0))));
    const linhas = Math.max(1, Math.ceil(n / colunas));
    const candidatos: Point[] = [];
    for (let x = x0 + 500; x <= x1 - 500; x += 1000) for (let y = y0 + 500; y <= y1 - 500; y += 1000) if (livre({ x, y })) candidatos.push({ x, y });
    const ralos: Point[] = [];
    for (let i = 0; i < colunas; i++) {
      for (let j = 0; j < linhas; j++) {
        const alvo = { x: x0 + ((i + 0.5) * (x1 - x0)) / colunas, y: y0 + ((j + 0.5) * (y1 - y0)) / linhas };
        const melhor = candidatos.filter((c) => !ralos.some((r) => dist(r, c) < 3000)).sort((a, b) => dist(a, alvo) - dist(b, alvo) || a.x - b.x || a.y - b.y)[0];
        if (melhor) ralos.push(inteiro(melhor));
      }
    }
    // As canaletas no pé das rampas que chegam embaixo neste subsolo.
    const canaletas = subsolos.pesDasRampas.filter((r) => r.levelId === levelId).map((r) => inteiro(r.at));
    // Para onde a água deste subsolo vai: a separadora (no mais fundo) ou a prumada sobre ela (nos de cima).
    const destino = d.separadora;
    const cotaDoDestino = levelId === d.levelId ? COTA_DA_SEPARADORA_MM : COTA_SOB_O_PISO_MM;
    for (const r of ralos) fila.push(ponto(levelId, 'RALO_SECO', r, 0, 'Ralo da garagem'));
    for (const c of canaletas) fila.push(ponto(levelId, 'RALO_LINEAR', c, 0, 'Canaleta ao pé da rampa'));
    const elev = nivel(levelId).elevationMm;
    fila.push(...redeEmPente(levelId, [...ralos, ...canaletas], destino, cotaDoDestino, pilaresNaFaixa(ctx.m, elev - 1000, elev, DN_DA_DRENAGEM_MM / 2)));
    resultado.ralos += ralos.length;
    resultado.canaletas += canaletas.length;
  }
  // A prumada: de cada subsolo de cima ao de baixo, sobre a separadora (no pavimento de baixo, do teto à rede dele).
  for (let k = 1; k < niveis.length; k++) {
    const L = niveis[k];
    fila.push(trecho(L, d.separadora, nivel(L).defaultHeightMm + COTA_SOB_O_PISO_MM, d.separadora, L === d.levelId ? COTA_DA_SEPARADORA_MM : COTA_SOB_O_PISO_MM, DN_DA_DRENAGEM_MM, ROTULO_DA_DRENAGEM));
  }
  fila.push(ponto(d.levelId, 'CAIXA_SEPARADORA', d.separadora, COTA_DA_SEPARADORA_MM));
  resultado.separadora = true;

  // ── Abaixo da rede? O fundo do poço contra a rede pública (a profundidade presumida do esgoto, a partir do térreo).
  const fundoDoPoco = nivel(d.levelId).elevationMm - CAIXAS_FUNDO_DO_POCO_MM;
  const cotaDaRede = nivel(terreoLevelId).elevationMm - (HIPOTESES_ESGOTO_PADRAO.profundidadeDaRedeMm ?? 1500);
  if (nivel(d.levelId).elevationMm + COTA_DA_SEPARADORA_MM > cotaDaRede) {
    pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Garagem: o piso do subsolo fica acima da rede pública (presumida a ${((HIPOTESES_ESGOTO_PADRAO.profundidadeDaRedeMm ?? 1500) / 1000).toLocaleString('pt-BR')} m): a separadora vai por gravidade — ligue-a ao coletor do térreo à mão, conferindo a cota.` });
  } else {
    fila.push(ponto(d.levelId, 'POCO_DE_RECALQUE', d.poco, -CAIXAS_FUNDO_DO_POCO_MM, 'Poço de recalque — 2 bombas (uma reserva)'), trecho(d.levelId, d.separadora, COTA_DA_SEPARADORA_MM, d.poco, COTA_DA_CHEGADA_NO_POCO_MM, DN_DA_DRENAGEM_MM, ROTULO_DA_DRENAGEM));
    resultado.bombas = 2;
    // O recalque: sobe do poço por cada subsolo (empilhado: −150 → pé-direito − 150) e, no térreo, vai à caixa de inspeção.
    const J = -150;
    for (const L of [...niveis].reverse()) fila.push(trecho(L, d.poco, L === d.levelId ? COTA_DA_CHEGADA_NO_POCO_MM : J, d.poco, nivel(L).defaultHeightMm + J, DN_DO_RECALQUE_MM, ROTULO_DO_RECALQUE_DA_DRENAGEM));
    const ci = (ctx.m.terminais ?? []).filter((t) => t.levelId === terreoLevelId && t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO').sort((a, b) => dist(a.at, d.poco) - dist(b.at, d.poco))[0];
    if (ci) {
      // Em L: primeiro até a linha da caixa, depois ao longo dela — reto, cortaria por baixo da torre.
      const cotaNaCaixa = (ci.cotaMm ?? -600) + 300;
      const canto = inteiro({ x: d.poco.x, y: ci.at.y });
      fila.push(trecho(terreoLevelId, d.poco, J, canto, Math.round((J + cotaNaCaixa) / 2), DN_DO_RECALQUE_MM, ROTULO_DO_RECALQUE_DA_DRENAGEM), trecho(terreoLevelId, canto, Math.round((J + cotaNaCaixa) / 2), ci.at, cotaNaCaixa, DN_DO_RECALQUE_MM, ROTULO_DO_RECALQUE_DA_DRENAGEM));
      resultado.recalque = true;
    } else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Garagem: sem a caixa de inspeção do esgoto no térreo, o recalque da drenagem sobe até o térreo e para — ligue-o à mão.' });
    pendencias.push({ grupo: 'CONFERIR', texto: `Garagem: o fundo do poço (${(fundoDoPoco / 1000).toLocaleString('pt-BR')} m) fica abaixo da rede pública (presumida a ${(cotaDaRede / 1000).toLocaleString('pt-BR')} m): poço de recalque com 2 bombas submersíveis de ${(POTENCIA_DA_BOMBA_DE_DRENAGEM_W / 1000).toLocaleString('pt-BR')} kW (uma reserva) e recalque DN ${DN_DO_RECALQUE_MM} até a caixa de inspeção — confira a vazão, a altura e o volume do poço no catálogo; a separadora pela área de piso (NBR 8160 e a concessionária).` });
  }
  resultado.comandos += ctx.aplicar(fila);

  // ── As bombas no quadro da garagem do subsolo mais fundo (o circuito delas, o DR e a seção pela queda).
  if (resultado.bombas) {
    const qdg = ctx.m.quadros.find((q) => q.levelId === d.levelId && /^QDG/.test(q.nome));
    if (!qdg) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Garagem: sem a elétrica, as bombas de drenagem ficam sem ponto de força — lance-as no quadro de serviço.' });
    else {
      const motores: Command[] = [-450, 450].map((dx, i): Command => ({ type: 'AddTerminal', levelId: d.levelId, disciplina: 'ELETRICA', tipo: 'Bomba', at: inteiro({ x: d.poco.x + dx, y: d.poco.y }), cotaMm: 300, tipoEletrico: 'MOTOR_BOMBA', potenciaW: POTENCIA_DA_BOMBA_DE_DRENAGEM_W, rotulo: i === 0 ? 'Bomba de drenagem' : 'Bomba de drenagem (reserva)', sugerida: true }));
      resultado.comandos += ctx.aplicar(motores);
      const antes = new Set(ctx.m.circuitos.map((c) => c.id));
      const plano = planejarCircuitos(ctx.m, d.levelId, qdg.id, HIPOTESES_CIRCUITOS_PADRAO, HIPOTESES_ELETRICAS_PADRAO);
      resultado.comandos += ctx.aplicar(plano.comandos);
      const novos = ctx.m.circuitos.filter((c) => !antes.has(c.id));
      resultado.comandos += ctx.aplicar([
        ...novos.map((c) => ({ c, s: preDimensionarCircuito(ctx.m, c, HIPOTESES_ELETRICAS_PADRAO).secaoParaQuedaMm2 })).filter((x) => x.s != null).map((x): Command => ({ type: 'SetCircuitoProps', circuitoId: x.c.id, secaoMm2: x.s! })),
      ]);
      resultado.comandos += ctx.aplicar(comandosDasSugestoesDeDR(sugerirDRs(ctx.m, qdg.id, HIPOTESES_ELETRICAS_PADRAO)));
    }
  }
  return resultado;
}
