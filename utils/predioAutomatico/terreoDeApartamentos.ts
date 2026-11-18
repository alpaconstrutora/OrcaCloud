/**
 * Prédio pelo Empreendimento — O TÉRREO DE APARTAMENTOS (PE4a do plano docs/planos/2026-11-18-predio-pelo-empreendimento.md,
 * 18/11/2026, decisão do usuário "Técnico na garagem").
 *
 * Quando a ficha põe apartamento no andar 0 (o térreo da Torre A do Garden: 002 e 004, mais a área comum), o motor monta
 * o andar 0 só com o esqueleto durante as etapas (a garagem o lê e edita) e põe o técnico do condomínio na garagem mais
 * alta. No FIM, depois da marca das instalações, este passo:
 *   1. liga o andar 0 como CÓPIA do tipo (a cópia viva traz paredes, plantas e instalações) e o desvincula;
 *   2. tira dele o que é dos apartamentos que a ficha não tem — paredes internas, rótulos, pontos, quadros com os
 *      circuitos e os trechos deles —, e deixa o que só passa (tubos de queda, colunas, prumadas);
 *   3. poda as pontas soltas que sobram nos corredores (o ramal do hidrômetro que ia ao apartamento tirado);
 *   4. nomeia o espaço livre: o hall de entrada (o da frente) e a área comum, e abre a porta para a rua.
 * O espaço que sobra é o dos apartamentos que a ficha não tem no andar 0 — o hall nasce onde um deles ia.
 */
import { pointInPolygon } from '../blueprintKernel';
import type { Command, ObjectId, Point, Trecho } from '../blueprintKernel';
import { chaveDaUnidade, type UnidadeDoPiso } from '../blueprintEstruturaDaTorre';
import type { AndarDoEmpreendimento } from './andaresDoEmpreendimento';
import { abrirPortaDeEntrada, SALA_COMUM, SALA_HALL, type BaseDoPredio, type ContextoDoPredio } from './terreoECobertura';
import type { HipotesesDoPredio } from './hipoteses';
import { ROTULO_DA_COLUNA_DE_VENTILACAO, ROTULO_DO_TUBO_DE_QUEDA } from './esgoto';
import { ROTULO_DA_COLUNA_DE_AGUA, ROTULO_DO_BARRILETE } from './agua';

/** Os trechos verticais que só PASSAM pelo andar (de cima para baixo) — ficam mesmo onde o apartamento sai. */
const ROTULOS_QUE_PASSAM = new Set<string>([ROTULO_DO_TUBO_DE_QUEDA, ROTULO_DA_COLUNA_DE_VENTILACAO, ROTULO_DA_COLUNA_DE_AGUA, ROTULO_DO_BARRILETE]);
const centro = (pts: readonly Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }) as Point;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function distanciaAoSegmento(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}
/** O anel encolhido `d` em direção ao centro (o que está DENTRO da fatia, longe das paredes do contorno dela). */
const encolher = (anel: readonly Point[], d: number): Point[] => {
  const c = centro(anel);
  return anel.map((p) => {
    const l = dist(p, c) || 1;
    return { x: p.x + ((c.x - p.x) * d) / l, y: p.y + ((c.y - p.y) * d) / l } as Point;
  });
};

export interface TerreoDeApartamentos {
  comandos: number;
  /** Os números (da ficha) dos apartamentos do tipo que o andar 0 manteve e dos que tirou. */
  mantidos: string[];
  tirados: string[];
  acesso: boolean;
  avisos: string[];
  /** PE4b: os números das unidades do kernel criadas no andar 0 (os da ficha) e os medidores acrescentados para elas. */
  unidades: string[];
  medidores: number;
}

/**
 * Casa cada apartamento da ficha do andar 0 com a fatia do tipo que o recebe: a mesma tipologia; sem tipologia, a
 * mesma posição e a área mais perto. Devolve, por fatia do tipo (o número dela), o apartamento do andar 0 ou nada.
 */
export function fatiasDoAndarZero(
  fatias: readonly { numero: string; ficha: UnidadeDoPiso | null }[],
  andarZero: AndarDoEmpreendimento,
): Map<string, UnidadeDoPiso | null> {
  const livres = [...fatias];
  const casadas = new Map<string, UnidadeDoPiso | null>(fatias.map((f) => [f.numero, null]));
  for (const u of andarZero.unidades) {
    const tipologia = (u.tipologia ?? '').trim().toLocaleLowerCase('pt-BR');
    const posicao = (u.posicao ?? '').toUpperCase();
    const nota = (f: (typeof fatias)[number]) => {
      const t = (f.ficha?.tipologia ?? '').trim().toLocaleLowerCase('pt-BR');
      const igualTipo = tipologia && t === tipologia ? 0 : 1;
      const igualPos = posicao && (f.ficha?.posicao ?? '').toUpperCase() === posicao ? 0 : 1;
      return igualTipo * 1e6 + igualPos * 1e5 + Math.abs((f.ficha?.areaPrivativaM2 ?? 0) - (u.areaPrivativaM2 ?? 0));
    };
    const f = [...livres].sort((a, b) => nota(a) - nota(b))[0];
    if (!f) break;
    casadas.set(f.numero, u);
    livres.splice(livres.indexOf(f), 1);
  }
  return casadas;
}

export function concluirTerreoDeApartamentos(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  hip: HipotesesDoPredio,
  zeroLevelId: ObjectId,
  tipo: AndarDoEmpreendimento,
  andarZero: AndarDoEmpreendimento,
): TerreoDeApartamentos {
  const avisos: string[] = [];
  let n = 0;
  // 1. A cópia do tipo, desvinculada: o andar 0 fica com tudo o que o tipo tem.
  // Os pontos que as etapas de incêndio puseram no andar 0 (extintor, placa, detector, hidrante…) saem: a cópia traz os do
  // tipo, um por andar — e o kernel não liga ao tipo um andar com instalação própria.
  const proprios = (ctx.m.terminais ?? []).filter((t) => t.levelId === zeroLevelId);
  if (proprios.length) n += ctx.aplicar(proprios.map((t): Command => ({ type: 'DeleteTerminal', terminalId: t.id })));
  n += ctx.aplicar([{ type: 'SetLevelProps', levelId: zeroLevelId, tipoDeId: base.tipoLevelId } as Command]);
  n += ctx.aplicar([{ type: 'SetLevelProps', levelId: zeroLevelId, tipoDeId: null } as Command]);

  // 2. As fatias do tipo e o apartamento da ficha do andar 0 que cada uma recebe.
  const fichaDoTipo = new Map(tipo.unidades.map((u) => [`emp:${chaveDaUnidade(u)}`, u]));
  const fatias = base.divisao.unidades.map((f) => ({ numero: f.numero, anel: f.anel, ficha: fichaDoTipo.get(f.tipologiaId) ?? null }));
  const casadas = fatiasDoAndarZero(fatias, andarZero);
  const tiradas = fatias.filter((f) => !casadas.get(f.numero));
  const mantidos = fatias.filter((f) => casadas.get(f.numero)).map((f) => f.numero);
  const m = ctx.m;
  const dentro = (anel: readonly Point[], p: { x: number; y: number }) => pointInPolygon(encolher(anel, 120), p as Point);
  const naTirada = (p: { x: number; y: number }) => tiradas.some((f) => dentro(f.anel, p));
  const unidadesTiradas = new Set((m.unidades ?? []).filter((u) => tiradas.some((f) => f.numero === u.numero)).map((u) => u.id));
  const quadrosTirados = (m.quadros ?? []).filter((q) => q.levelId === zeroLevelId && ((q.unidadeId && unidadesTiradas.has(q.unidadeId)) || naTirada(q.at)));
  const circuitosTirados = new Set((m.circuitos ?? []).filter((c) => quadrosTirados.some((q) => q.id === c.quadroId)).map((c) => c.id));
  const doCircuitoTirado = (x: { circuitoId?: ObjectId | null; circuitoIds?: ObjectId[] | null }) => (x.circuitoId ? circuitosTirados.has(x.circuitoId) : false) || (x.circuitoIds ?? []).some((id) => circuitosTirados.has(id));
  const passa = (t: Trecho) => t.a.x === t.b.x && t.a.y === t.b.y && ROTULOS_QUE_PASSAM.has(t.rotulo ?? '');
  const lote: Command[] = [];
  for (const t of m.trechos ?? []) {
    if (t.levelId !== zeroLevelId || passa(t)) continue;
    if (doCircuitoTirado(t as never) || naTirada(t.a) || naTirada(t.b)) lote.push({ type: 'DeleteTrecho', trechoId: t.id });
  }
  for (const t of m.terminais ?? []) {
    if (t.levelId !== zeroLevelId) continue;
    if ((t.unidadeId && unidadesTiradas.has(t.unidadeId)) || doCircuitoTirado(t as never) || naTirada(t.at)) lote.push({ type: 'DeleteTerminal', terminalId: t.id });
  }
  for (const c of circuitosTirados) lote.push({ type: 'DeleteCircuito', circuitoId: c } as Command);
  for (const q of quadrosTirados) lote.push({ type: 'DeleteQuadro', quadroId: q.id } as Command);
  for (const w of m.walls) {
    if (w.levelId !== zeroLevelId) continue;
    // As paredes internas do apartamento tirado — o meio dentro da fatia (as do contorno dela têm o meio na borda).
    const meio = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    if (naTirada(meio)) lote.push({ type: 'DeleteWall', wallId: w.id });
  }
  n += ctx.aplicar(lote);

  // 3. As pontas soltas: o trecho com uma ponta que não toca outro trecho nem um ponto (o ramal do hidrômetro tirado).
  for (let volta = 0; volta < 6; volta++) {
    const doAndar = (ctx.m.trechos ?? []).filter((t) => t.levelId === zeroLevelId && (t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE' || t.disciplina === 'ESGOTO'));
    const chave = (p: { x: number; y: number }, z: number) => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(z)}`;
    const grau = new Map<string, number>();
    for (const t of doAndar) for (const k of [chave(t.a, t.cotaAMm), chave(t.b, t.cotaBMm)]) grau.set(k, (grau.get(k) ?? 0) + 1);
    const pontos = new Set((ctx.m.terminais ?? []).filter((x) => x.levelId === zeroLevelId).map((x) => `${Math.round(x.at.x)},${Math.round(x.at.y)}`));
    const solta = (p: { x: number; y: number }, z: number) => grau.get(chave(p, z)) === 1 && !pontos.has(`${Math.round(p.x)},${Math.round(p.y)}`);
    const podar = doAndar.filter((t) => !passa(t) && (solta(t.a, t.cotaAMm) || solta(t.b, t.cotaBMm)) && naTiradaOuCorredor(t));
    if (!podar.length) break;
    n += ctx.aplicar(podar.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })));
  }
  function naTiradaOuCorredor(t: Trecho) {
    // Só o que sai do apartamento tirado ou corre fora das fatias mantidas (o corredor) — nunca dentro de um mantido.
    const mantidas = fatias.filter((f) => casadas.get(f.numero));
    return !mantidas.some((f) => dentro(f.anel, t.a) && dentro(f.anel, t.b));
  }

  // 4. O espaço livre: o hall de entrada na fatia tirada mais voltada para a rua; as outras, área comum. A porta para a rua.
  const rua = base.rua;
  const ordem = [...tiradas].sort((a, b) => (rua ? (centro(b.anel).x * rua.x + centro(b.anel).y * rua.y) - (centro(a.anel).x * rua.x + centro(a.anel).y * rua.y) : 0));
  const nomes: Command[] = [];
  let acesso = false;
  ordem.forEach((f, i) => {
    const espaco = () => ctx.m.spaces.find((x) => x.levelId === zeroLevelId && pointInPolygon(x.ring, centro(f.anel)));
    const s = espaco();
    if (!s) {
      avisos.push(`Andar 0: a fatia do ${f.numero} não fechou um ambiente — ficou sem nome.`);
      return;
    }
    // Os rótulos dos cômodos do apartamento tirado (sala, dormitórios…): NameSpace vazio apaga um de cada vez.
    for (let k = 0; k < 40; k++) {
      const e = espaco();
      if (!e || !(ctx.m.labels ?? []).some((l) => l.levelId === zeroLevelId && pointInPolygon(e.ring, l.at))) break;
      n += ctx.aplicar([{ type: 'NameSpace', spaceId: e.id, name: '' }]);
    }
    const e = espaco();
    if (e) n += ctx.aplicar([{ type: 'NameSpace', spaceId: e.id, name: i === 0 ? SALA_HALL : SALA_COMUM }]);
  });
  n += ctx.aplicar(nomes);
  const hall = ordem[0] ? ctx.m.spaces.find((x) => x.levelId === zeroLevelId && pointInPolygon(x.ring, centro(ordem[0].anel))) : null;
  if (hall) {
    // As janelas do apartamento tirado na fachada do hall saem — a porta de entrada vai nesse trecho.
    const janelas = ctx.m.openings.filter((o) => {
      if (o.kind === 'door') return false;
      const w = ctx.m.walls.find((x) => x.id === o.wallId);
      if (!w || w.levelId !== zeroLevelId) return false;
      const L = dist(w.a, w.b) || 1;
      const s = o.offsetMm + o.widthMm / 2;
      const p = { x: w.a.x + ((w.b.x - w.a.x) * s) / L, y: w.a.y + ((w.b.y - w.a.y) * s) / L };
      return dentro(ordem[0].anel, p) || pointInPolygon(hall.ring, p as Point) || hall.ring.some((q, i) => distanciaAoSegmento(p, q, hall.ring[(i + 1) % hall.ring.length]) < w.thicknessMm);
    });
    if (janelas.length) n += ctx.aplicar(janelas.map((o): Command => ({ type: 'DeleteOpening', openingId: o.id })));
    const r = abrirPortaDeEntrada(ctx, base, hip, zeroLevelId, hall.ring);
    n += r.comandos;
    acesso = r.acesso;
  }
  if (!acesso) avisos.push(`Andar 0: a porta de entrada de ${hip.larguraDoAcessoMm} mm não coube na fachada do hall — desenhe o acesso.`);
  // O lance da escada do andar 0 ao tipo (a cópia não o traz: a escada do tipo parte dele) — como no térreo de sempre.
  if (!ctx.m.stairs.some((e) => e.levelId === zeroLevelId)) {
    const doTipo = ctx.m.stairs.filter((e) => e.levelId === base.tipoLevelId);
    n += ctx.aplicar(doTipo.map((e): Command => ({ type: 'AddEscada', levelId: zeroLevelId, pontos: e.pontos.map((p) => ({ ...p })), tipo: e.tipo, larguraMm: e.larguraMm, alvoEspelhoMm: e.alvoEspelhoMm, rotulo: e.rotulo ?? null })));
  }
  if (!tiradas.length) avisos.push('Andar 0: a ficha tem nele os mesmos apartamentos do tipo — não sobra espaço para o hall de entrada; desenhe o acesso.');

  // 5. (PE4b) Os apartamentos que ficaram viram UNIDADES do kernel, com os números da ficha (002, 004): as etiquetas do
  // andar 0 dentro da fatia; o QD e o hidrômetro copiados do tipo passam a ser deles (apontavam o 102/104 do tipo, que
  // contariam duas vezes); e um medidor para cada um na medição, ao lado dos outros.
  const novas: { id: ObjectId; numero: string }[] = [];
  for (const f of fatias) {
    const daFicha = casadas.get(f.numero);
    if (!daFicha) continue;
    const doTipo = (ctx.m.unidades ?? []).find((u) => u.numero === f.numero);
    const numero = daFicha.nome.trim();
    if (!numero || (ctx.m.unidades ?? []).some((u) => u.numero === numero)) {
      avisos.push(`Andar 0: o apartamento "${daFicha.nome}" da ficha não virou unidade (número vazio ou repetido) — crie-a à mão.`);
      continue;
    }
    const labelIds = (ctx.m.labels ?? []).filter((l) => l.levelId === zeroLevelId && dentro(f.anel, l.at)).map((l) => l.id);
    n += ctx.aplicar([{ type: 'AddUnidade', numero, tipologia: doTipo?.tipologia ?? daFicha.tipologia ?? null, pcd: doTipo?.pcd ?? false, labelIds }]);
    const nova = (ctx.m.unidades ?? []).find((u) => u.numero === numero)!;
    novas.push({ id: nova.id, numero });
    if (!doTipo) continue;
    const religar: Command[] = [
      ...(ctx.m.quadros ?? []).filter((q) => q.levelId === zeroLevelId && q.unidadeId === doTipo.id).map((q): Command => ({ type: 'SetQuadroProps', quadroId: q.id, unidadeId: nova.id })),
      ...(ctx.m.terminais ?? [])
        .filter((t) => t.levelId === zeroLevelId && t.unidadeId === doTipo.id)
        .map((t): Command => ({ type: 'SetTerminalProps', terminalId: t.id, unidadeId: nova.id, ...(t.tipoHidraulico === 'HIDROMETRO' ? { rotulo: `Hidrômetro ${numero}` } : {}) })),
    ];
    n += ctx.aplicar(religar);
  }
  const medidores = (ctx.m.terminais ?? []).filter((t) => t.tipoEletrico === 'MEDIDOR');
  let medidoresNovos = 0;
  if (novas.length && medidores.length) {
    // Uma linha nova abaixo das outras (os medidores crescem para −y a partir do condomínio).
    const x0 = Math.min(...medidores.map((t) => t.at.x));
    const y0 = Math.min(...medidores.map((t) => t.at.y)) - 300;
    const ref = medidores[0];
    n += ctx.aplicar(
      novas.map((u, i): Command => ({
        type: 'AddTerminal', levelId: ref.levelId, disciplina: 'ELETRICA', tipo: 'Medidor', at: { x: x0 + 300 * i, y: y0 }, cotaMm: ref.cotaMm, tipoEletrico: 'MEDIDOR',
        ...(ref.quadroId ? { quadroId: ref.quadroId } : {}), unidadeId: u.id, sugerida: true,
      }) as Command),
    );
    medidoresNovos = novas.length;
  } else if (novas.length) avisos.push(`Andar 0: sem a medição no modelo — os medidores de ${novas.map((u) => u.numero).join(', ')} ficam para o projetista.`);
  return { comandos: n, mantidos, tirados: tiradas.map((f) => f.numero), acesso, avisos, unidades: novas.map((u) => u.numero), medidores: medidoresNovos };
}
