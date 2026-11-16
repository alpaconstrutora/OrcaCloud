/**
 * Prédio automático — a ÁGUA NO FORRO REBAIXADO, abaixo dos ramais de esgoto do andar de cima (PA10b e PA12 do plano
 * docs/planos/2026-11-12-predio-automatico.md, 16/11/2026).
 *
 * A água de cada andar corre no forro (a faixa da casa, 20 cm abaixo do teto); os ramais de esgoto do andar de CIMA
 * correm sob a laje dele — no andar de baixo, de 15 a 40 cm abaixo do teto. Na casa não há andar de cima; no prédio as
 * duas redes se cruzavam no forro (252 cruzamentos no R8). Primeiro tentado: o desvio só no cruzamento (a água desce num
 * "U" sob o ramal) — resolveu ~5 %: os cruzamentos ficam colados nos NÓS da rede de água dentro das áreas molhadas, e a
 * perna do "U" descia justo onde passa o ramal.
 *
 * PA10b (a prática de obra, aprovada pelo usuário): o FORRO REBAIXADO nos banheiros, lavabos e área de serviço (o
 * programa admite 2,30 m de pé-direito neles): ali a água corre abaixo da faixa do esgoto de cima.
 *
 * PA12 (decisão do usuário, "água abaixo do ramal"): o que sobrava era o ramal de cima atravessando cômodo SECO a caminho
 * do shaft (cozinha, circulação, sala, dormitórios). Nos cômodos secos por onde passa ramal do andar de cima — que já
 * pedem forro ali para escondê-lo —, a água desce para logo abaixo dele, deixando 2,50 m livres (o mínimo da NBR 15575);
 * nos outros cômodos segue na faixa e desce na parede ao entrar no cômodo rebaixado. E a água rebaixada que passaria por
 * um tubo vertical de esgoto (o tubo de queda dentro do banheiro, que sobe até o ramal de cima) contorna-o em planta.
 *
 * Roda no TIPO, depois do esgoto e antes da marca `copiaInstalacoes`: cada andar repete pela cópia viva. O ramal "do andar
 * de cima" é o do próprio tipo, sob o piso (cota negativa): o andar de cima é cópia dele.
 */
import { pointInPolygon } from '../blueprintKernel';
import type { Command, ObjectId, Point, Space, Trecho } from '../blueprintKernel';
import { desvioDoPilar } from '../blueprintObstaculosEstruturais';
import { usoDoNome } from '../blueprintPrograma';
import type { ContextoDoPredio } from './terreoECobertura';

/** A água nas áreas molhadas: tanto abaixo do teto (abaixo da faixa do esgoto do andar de cima, 15–40 cm), mm. */
export const AGUA_NO_FORRO_MOLHADO_ABAIXO_DO_TETO_MM = 520;
/**
 * PA12: a água nos cômodos SECOS sob o ramal do andar de cima: tanto abaixo do teto, mm — 2,57 m num pé-direito de 3 m. O
 * fundo do ramal fica acima de 2,61 m em 95 % dos trechos dos prédios de referência; a água (até DN 40) acima de 2,55 m
 * deixa 2,50 m livres sob o forro (NBR 15575).
 */
export const AGUA_SOB_O_RAMAL_ABAIXO_DO_TETO_MM = 430;
/** PA12: a folga além dos dois raios com que a água rebaixada contorna um tubo vertical de esgoto, mm. */
export const FOLGA_DO_CONTORNO_DO_TUBO_MM = 30;
const USOS_MOLHADOS = new Set(['BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO']);

export interface RebaixoDaAgua {
  comandos: number;
  /** Cômodos molhados do tipo com a água rebaixada. */
  comodos: number;
  /** PA12: cômodos secos do tipo por onde passa ramal do andar de cima (a água abaixo dele). */
  comodosSecos: number;
  /** Trechos de água trocados ou rebaixados no tipo. */
  trechos: number;
  /** A cota da água rebaixada nos molhados, mm acima do piso. */
  cotaMm: number;
  /** PA12: a cota da água nos cômodos secos sob o ramal, mm acima do piso. */
  cotaSecoMm: number;
  /** PA12: pedaços de água rebaixada que contornam em planta um tubo vertical de esgoto. */
  contornos: number;
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

/** O segmento AB passa pelo cômodo (uma ponta dentro, ou cruza a borda)? */
const passaPor = (s: Space, A: Point, B: Point) => dentroDe(s, A) || dentroDe(s, B) || cortes(A, B, [s.ring as Point[]]).length > 0;

export function rebaixarAguaNoForro(ctx: ContextoDoPredio, tipoLevelId: ObjectId): RebaixoDaAgua {
  const pe = ctx.m.levels.find((l) => l.id === tipoLevelId)?.defaultHeightMm ?? 3000;
  const zMolhado = pe - AGUA_NO_FORRO_MOLHADO_ABAIXO_DO_TETO_MM;
  const zSeco = pe - AGUA_SOB_O_RAMAL_ABAIXO_DO_TETO_MM;
  const resultado: RebaixoDaAgua = { comandos: 0, comodos: 0, comodosSecos: 0, trechos: 0, cotaMm: zMolhado, cotaSecoMm: zSeco, contornos: 0 };
  const doNivel = ctx.m.spaces.filter((s) => s.levelId === tipoLevelId);
  const ehMolhado = (s: Space) => USOS_MOLHADOS.has(usoDoNome(s.name ?? '') ?? '');
  const molhados = doNivel.filter(ehMolhado);
  const esgotoDoTipo = (ctx.m.trechos ?? []).filter((t) => t.levelId === tipoLevelId && t.disciplina === 'ESGOTO');
  // O ramal do andar de cima: o do tipo sob o piso (as duas pontas abaixo de 0), com extensão em planta.
  const ramaisDeCima = esgotoDoTipo.filter((t) => t.cotaAMm < 0 && t.cotaBMm < 0 && Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) > 1);
  const secos = doNivel.filter((s) => !ehMolhado(s) && ramaisDeCima.some((t) => passaPor(s, t.a, t.b)));
  resultado.comodos = molhados.length;
  resultado.comodosSecos = secos.length;
  if (!molhados.length && !secos.length) return resultado;
  const aneis = [...molhados, ...secos].map((s) => s.ring as Point[]);
  /** A cota da água rebaixada no ponto: a do cômodo molhado, a do seco sob o ramal, ou nenhuma. */
  const alvoDe = (p: Point): number | null => (molhados.some((s) => dentroDe(s, p)) ? zMolhado : secos.some((s) => dentroDe(s, p)) ? zSeco : null);
  const baixar = (p: Point, z: number) => {
    const a = alvoDe(p);
    return a != null && a < z ? a : z;
  };
  // PA12: os tubos verticais de esgoto do tipo (o tubo de queda no banheiro, a ventilação), com a faixa de cotas.
  const tubos = esgotoDoTipo
    .filter((t) => t.cotaAMm !== t.cotaBMm && Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) <= 1)
    .map((t) => ({ p: t.a, r: t.bitolaMm / 2, zLo: Math.min(t.cotaAMm, t.cotaBMm), zHi: Math.max(t.cotaAMm, t.cotaBMm) }));
  /** O quadrado em volta dos tubos que a água (raio `ra`) na cota `z` alcançaria. */
  const tubosNaCota = (z: number, ra: number): Point[][] =>
    tubos
      .filter((u) => z + ra > u.zLo && z - ra < u.zHi)
      .map((u) => {
        const h = u.r + ra + FOLGA_DO_CONTORNO_DO_TUBO_MM;
        return [
          { x: u.p.x - h, y: u.p.y - h },
          { x: u.p.x + h, y: u.p.y - h },
          { x: u.p.x + h, y: u.p.y + h },
          { x: u.p.x - h, y: u.p.y + h },
        ] as Point[];
      });
  const doTipo = (ctx.m.trechos ?? []).filter((t) => t.levelId === tipoLevelId && t.disciplina === 'AGUA_FRIA');
  // No forro: na metade de cima do pavimento e acima da cota rebaixada mais baixa.
  const noForro = (z: number) => z > pe / 2 && z > zMolhado;
  // 1) Os trechos horizontais no forro, cortados nas paredes dos cômodos rebaixados: o pedaço dentro deles desce à cota
  //    do cômodo. Os que não mudam entram também — o nó que eles dividem com um pedaço rebaixado pede a descida.
  type Pedaco = { A: Point; B: Point; cota: number; via: Point[] };
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
      .map((s1, i) => ({ A: em(ts[i]), B: em(s1), cota: baixar(em((ts[i] + s1) / 2), z), via: [] as Point[] }))
      .filter((p) => Math.hypot(p.B.x - p.A.x, p.B.y - p.A.y) > 0);
    for (const p of pedacos) {
      no(p.A, z, p.cota, t);
      no(p.B, z, p.cota, t);
    }
    if (!pedacos.some((p) => p.cota !== z)) continue;
    // PA12: o pedaço rebaixado que passaria por um tubo vertical de esgoto contorna-o em planta (pelos cantos).
    for (const p of pedacos) {
      if (p.cota === z) continue;
      const obst = tubosNaCota(p.cota, t.bitolaMm / 2);
      if (!obst.length) continue;
      const desvio = desvioDoPilar(p.A, p.B, obst);
      if (desvio?.length) {
        p.via = desvio.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y) }) as Point);
        resultado.contornos++;
      }
    }
    resultado.trechos++;
    // Inteiro dentro de um cômodo rebaixado e reto: só desce (o mesmo trecho). Cortado ou contornando: troca pelos pedaços.
    if (pedacos.length === 1 && !pedacos[0].via.length) {
      lote.push({ type: 'SetTrechoProps', trechoId: t.id, cotaAMm: pedacos[0].cota, cotaBMm: pedacos[0].cota });
      continue;
    }
    const props = trechoComo(t);
    lote.push({ type: 'DeleteTrecho', trechoId: t.id });
    for (const p of pedacos) {
      const pontos = [p.A, ...p.via, p.B];
      for (let i = 1; i < pontos.length; i++) lote.push({ ...props, a: pontos[i - 1], b: pontos[i], cotaAMm: p.cota, cotaBMm: p.cota });
    }
  }
  // 2) As descidas (verticais) com a ponta no forro: num nó de uma cota só, a ponta vai a ela; num nó misto, à mais alta
  //    (as descidas do nó, abaixo, ligam as cotas); sem horizontal no nó, segue o cômodo.
  for (const t of verticais) {
    const pontaNova = (p: Point, cota: number) => {
      if (!noForro(cota)) return cota;
      const n = nos.get(`${p.x},${p.y},${cota}`);
      if (n) return Math.max(...n.cotas);
      return baixar(p, cota);
    };
    const cotaA = pontaNova(t.a, t.cotaAMm);
    const cotaB = pontaNova(t.b, t.cotaBMm);
    if (cotaA === t.cotaAMm && cotaB === t.cotaBMm) continue;
    if (cotaA === cotaB) lote.push({ type: 'DeleteTrecho', trechoId: t.id });
    else lote.push({ type: 'SetTrechoProps', trechoId: t.id, cotaAMm: cotaA, cotaBMm: cotaB });
    resultado.trechos++;
  }
  // 3) As descidas em cada nó em que se encontram pedaços em cotas diferentes (a parede do cômodo rebaixado): de cada cota
  //    à seguinte, de cima para baixo.
  for (const n of nos.values()) {
    if (n.cotas.size < 2) continue;
    const cotas = [...n.cotas].sort((a, b) => b - a);
    for (let i = 1; i < cotas.length; i++) lote.push({ ...trechoComo(n.t), a: n.p, b: n.p, cotaAMm: cotas[i - 1], cotaBMm: cotas[i] });
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
