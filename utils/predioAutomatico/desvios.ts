/**
 * Prédio automático — a ÁGUA NO FORRO REBAIXADO DAS ÁREAS MOLHADAS (PA10b do plano
 * docs/planos/2026-11-12-predio-automatico.md, 16/11/2026).
 *
 * A água de cada andar corre no forro (a faixa da casa, 20 cm abaixo do teto); os ramais de esgoto do andar de CIMA
 * correm sob a laje dele — no andar de baixo, de 15 a 40 cm abaixo do teto, nos cômodos MOLHADOS (é onde estão as louças
 * de cima, empilhadas). Na casa não há andar de cima; no prédio as duas redes se cruzavam no forro (252 cruzamentos no
 * R8). Primeiro tentado: o desvio só no cruzamento (a água desce num "U" sob o ramal) — resolveu ~5 %: os cruzamentos
 * ficam colados nos NÓS da rede de água dentro das áreas molhadas, e a perna do "U" descia justo onde passa o ramal.
 *
 * O que ficou (a prática de obra, aprovada pelo usuário): o FORRO REBAIXADO nos banheiros, lavabos e área de serviço
 * (o programa admite 2,30 m de pé-direito neles): ali a água corre abaixo da faixa do esgoto de cima; nos outros cômodos
 * segue na faixa e desce na parede ao entrar no cômodo molhado. A cozinha fica de fora (pé-direito de 2,50 m).
 *
 * Roda no TIPO, depois do esgoto e antes da marca `copiaInstalacoes`: cada andar repete pela cópia viva.
 */
import { pointInPolygon } from '../blueprintKernel';
import type { Command, ObjectId, Point, Space, Trecho } from '../blueprintKernel';
import { usoDoNome } from '../blueprintPrograma';
import type { ContextoDoPredio } from './terreoECobertura';

/** A água nas áreas molhadas: tanto abaixo do teto (abaixo da faixa do esgoto do andar de cima, 15–40 cm), mm. */
export const AGUA_NO_FORRO_MOLHADO_ABAIXO_DO_TETO_MM = 520;
const USOS_MOLHADOS = new Set(['BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO']);

export interface RebaixoDaAgua {
  comandos: number;
  /** Cômodos molhados do tipo com a água rebaixada. */
  comodos: number;
  /** Trechos de água trocados ou rebaixados no tipo. */
  trechos: number;
  /** A cota da água rebaixada, mm acima do piso. */
  cotaMm: number;
}

const dentroDe = (s: Space, p: Point) => pointInPolygon(s.ring as Point[], p) && !s.holes.some((h) => pointInPolygon(h as Point[], p));

/** Os parâmetros (0..1) em que o segmento AB cruza as bordas dos anéis. */
function cortes(A: Point, B: Point, aneis: readonly (readonly Point[])[]): number[] {
  const out: number[] = [];
  const d = { x: B.x - A.x, y: B.y - A.y };
  for (const anel of aneis) {
    for (let i = 0; i < anel.length; i++) {
      const C = anel[i];
      const D = anel[(i + 1) % anel.length];
      const e = { x: D.x - C.x, y: D.y - C.y };
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((C.x - A.x) * e.y - (C.y - A.y) * e.x) / den;
      const u = ((C.x - A.x) * d.y - (C.y - A.y) * d.x) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t);
    }
  }
  return [...new Set(out.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
}

export function rebaixarAguaNasAreasMolhadas(ctx: ContextoDoPredio, tipoLevelId: ObjectId): RebaixoDaAgua {
  const pe = ctx.m.levels.find((l) => l.id === tipoLevelId)?.defaultHeightMm ?? 3000;
  const zMolhado = pe - AGUA_NO_FORRO_MOLHADO_ABAIXO_DO_TETO_MM;
  const resultado: RebaixoDaAgua = { comandos: 0, comodos: 0, trechos: 0, cotaMm: zMolhado };
  const molhados = ctx.m.spaces.filter((s) => s.levelId === tipoLevelId && USOS_MOLHADOS.has(usoDoNome(s.name ?? '') ?? ''));
  resultado.comodos = molhados.length;
  if (!molhados.length) return resultado;
  const aneis = molhados.map((s) => s.ring as Point[]);
  const molhado = (p: Point) => molhados.some((s) => dentroDe(s, p));
  const doTipo = (ctx.m.trechos ?? []).filter((t) => t.levelId === tipoLevelId && t.disciplina === 'AGUA_FRIA');
  // No forro: na metade de cima do pavimento e acima da cota rebaixada.
  const noForro = (z: number) => z > pe / 2 && z > zMolhado;
  // 1) Os trechos horizontais no forro, cortados nas paredes dos cômodos molhados: o pedaço dentro deles desce à cota
  //    rebaixada. Os que não mudam entram também — o nó que eles dividem com um pedaço rebaixado pede a descida.
  type Pedaco = { A: Point; B: Point; z: number; rebaixado: boolean };
  const lote: Command[] = [];
  // Cada nó guarda as cotas dos pedaços que chegam nele e o trecho mais grosso (a bitola da descida).
  const nos = new Map<string, { p: Point; z: number; cotas: Set<number>; t: Trecho }>();
  const no = (p: Point, z: number, cota: number, t: Trecho) => {
    const k = `${p.x},${p.y},${z}`;
    const n = nos.get(k) ?? { p, z, cotas: new Set<number>(), t };
    n.cotas.add(cota);
    if (t.bitolaMm > n.t.bitolaMm) n.t = t;
    nos.set(k, n);
  };
  const verticais: Trecho[] = [];
  for (const t of doTipo) {
    // Vertical: parada em planta, com as cotas diferentes. Horizontal: a cota constante, por menor que seja (o "jogo" de
    // 1 mm que a rede faz para casar duas pontas também é horizontal — tratado como vertical, sumia e partia a rede).
    const comp = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    if (t.cotaAMm !== t.cotaBMm) {
      if (comp <= 1) verticais.push(t);
      continue;
    }
    if (comp === 0 || !noForro(t.cotaAMm)) continue;
    const z = t.cotaAMm;
    // O corte a menos de 5 mm da ponta não corta: o pedaço minúsculo sairia, e a ponta arredondada não bateria com o resto
    // da rede (a ligação é pela ponta exata).
    const ts = [0, ...cortes(t.a, t.b, aneis).filter((u) => u * comp > 5 && (1 - u) * comp > 5), 1];
    const em = (s: number): Point => (s === 0 ? t.a : s === 1 ? t.b : { x: Math.round(t.a.x + (t.b.x - t.a.x) * s), y: Math.round(t.a.y + (t.b.y - t.a.y) * s) });
    const pedacos: Pedaco[] = ts
      .slice(1)
      .map((s1, i) => ({ A: em(ts[i]), B: em(s1), z, rebaixado: molhado(em((ts[i] + s1) / 2)) }))
      .filter((p) => Math.hypot(p.B.x - p.A.x, p.B.y - p.A.y) > 0);
    for (const p of pedacos) {
      const cota = p.rebaixado ? zMolhado : z;
      no(p.A, z, cota, t);
      no(p.B, z, cota, t);
    }
    if (!pedacos.some((p) => p.rebaixado)) continue;
    resultado.trechos++;
    // Inteiro dentro do cômodo molhado: só desce (o mesmo trecho). Cortado: troca pelos pedaços.
    if (pedacos.length === 1) {
      lote.push({ type: 'SetTrechoProps', trechoId: t.id, cotaAMm: zMolhado, cotaBMm: zMolhado });
      continue;
    }
    const props = trechoComo(t);
    lote.push({ type: 'DeleteTrecho', trechoId: t.id });
    for (const p of pedacos) {
      const cota = p.rebaixado ? zMolhado : z;
      lote.push({ ...props, a: p.A, b: p.B, cotaAMm: cota, cotaBMm: cota });
    }
  }
  // 2) As descidas (verticais) com a ponta no forro: num nó só de pedaços rebaixados, a ponta desce junto; num nó misto,
  //    fica (a descida do nó, abaixo, liga as duas cotas); sem horizontal no nó, segue o cômodo.
  for (const t of verticais) {
    const pontaNova = (p: Point, cota: number) => {
      if (!noForro(cota)) return cota;
      const n = nos.get(`${p.x},${p.y},${cota}`);
      if (n) return n.cotas.size === 1 && n.cotas.has(zMolhado) ? zMolhado : cota;
      return molhado(p) ? zMolhado : cota;
    };
    const cotaA = pontaNova(t.a, t.cotaAMm);
    const cotaB = pontaNova(t.b, t.cotaBMm);
    if (cotaA === t.cotaAMm && cotaB === t.cotaBMm) continue;
    if (cotaA === cotaB) lote.push({ type: 'DeleteTrecho', trechoId: t.id });
    else lote.push({ type: 'SetTrechoProps', trechoId: t.id, cotaAMm: cotaA, cotaBMm: cotaB });
    resultado.trechos++;
  }
  // 3) A descida em cada nó em que se encontram pedaços nas duas cotas (a parede do cômodo molhado).
  for (const n of nos.values()) {
    if (n.cotas.size < 2) continue;
    lote.push({ ...trechoComo(n.t), a: n.p, b: n.p, cotaAMm: n.z, cotaBMm: zMolhado });
  }
  resultado.comandos = ctx.aplicar(lote);
  return resultado;
}

/** O AddTrecho com as propriedades do trecho trocado (sem as pontas). */
function trechoComo(t: Trecho): Omit<Extract<Command, { type: 'AddTrecho' }>, 'a' | 'b' | 'cotaAMm' | 'cotaBMm'> {
  return {
    type: 'AddTrecho',
    levelId: t.levelId,
    disciplina: t.disciplina,
    bitolaMm: t.bitolaMm,
    ...(t.itemCode != null ? { itemCode: t.itemCode } : {}),
    ...(t.rotulo != null ? { rotulo: t.rotulo } : {}),
    ...(t.material != null ? { material: t.material } : {}),
    ...(t.isolamentoMm != null ? { isolamentoMm: t.isolamentoMm } : {}),
    ...(t.sugerido != null ? { sugerido: t.sugerido } : {}),
  } as Omit<Extract<Command, { type: 'AddTrecho' }>, 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>;
}
