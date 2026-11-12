/**
 * Casa automática — parte `escolhaEShaft` do motor (etapa D2, 11/11/2026: `utils/blueprintCasaAutomatica.ts` dividido sem mudar
 * o que gera; o marco das casas de referência prova). Ver o cabeçalho de `orquestrador.ts`.
 */
import { conflitosDoModelo, pavimentosDoNucleo, point, pointInPolygon } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point } from '../blueprintKernel';
import { comandosDeAplicacao, gerar } from '../blueprintGerador';
import type { ResultadoDoGerador } from '../blueprintGerador';
import { ALEM_MM } from '../blueprintPavimentoTipoDaMassa';
import { medirTerreno } from '../blueprintTerreno';
import { paraMundo } from './quadroEImplantacao';
import type { QuadroDaFrente } from './quadroEImplantacao';

/** F18: quanto o início do condutor pluvial sobe a cada volta para passar por cima do esgoto, mm. */
export const PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM = 60;

/** F18: os encontros (conflito de rede) entre o pluvial enterrado e o esgoto — o cruzamento e a passagem rente. */
export function pluvialRenteAoEsgoto(m: BlueprintModel): number {
  const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
  return conflitosDoModelo(m).filter((c) => {
    if (c.classe !== 'REDE') return false;
    const par = [porId.get(c.trechoId)?.disciplina, porId.get(c.outroId)?.disciplina].sort().join('×');
    return par === 'ESGOTO×PLUVIAL';
  }).length;
}

/** Por que o botão "Gerar casa" não roda — `null` = pode. */
export function motivoParaNaoGerar(model: BlueprintModel, levelId: ObjectId | null): string | null {
  if (!levelId || !model.levels.some((l) => l.id === levelId)) return 'Abra um pavimento para gerar a casa.';
  if (model.walls.some((w) => w.levelId === levelId)) return 'O pavimento já tem paredes — a casa automática nasce num pavimento vazio (crie uma alternativa ou limpe o pavimento).';
  // F10: o lote e a frente, ANTES de gerar — o botão diz, em vez de a prévia sair vazia com "implantação não rodou".
  const divisas = model.boundaries.filter((b) => b.levelId === levelId && b.kind === 'TERRENO');
  if (divisas.length === 0) return 'Desenhe o lote (as divisas do terreno) neste pavimento — a casa se implanta dentro dele.';
  if (!medirTerreno(divisas)?.fechado) return 'Feche o lote: as divisas do terreno precisam formar um contorno.';
  if (!divisas.some((b) => b.papel === 'FRENTE')) return 'Marque a divisa da FRENTE do lote (a que dá para a rua) — a casa se implanta a partir dela.';
  return null;
}

/** Os avisos do E6.2 que tornam a planta pior que outra semente sem eles. */
export const GRAVE = /sem acesso|abaixo da área mínima|ficou sem lado externo|sem fachada|não coube|sem porta direta|só tem acesso passando/i;

/**
 * Problemas graves de uma alternativa: os avisos acima + as regras de AMBIENTE de severidade ERRO
 * violadas (largura e área mínimas, iluminação). Achado de 14/10/2026: o E6.2 dá à faixa íntima uma
 * profundidade só e divide a largura — banheiro de 0,80 × 5,75 m — em TODAS as sementes de um lote
 * de 9 m; escolher pela nota sozinha deixava a pior.
 */
export function problemasGraves(r: ResultadoDoGerador): number {
  return r.avisos.filter((a) => GRAVE.test(a)).length + r.regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO' && x.regra.escopo === 'AMBIENTE').length;
}

export function escolherSemente(resultados: ResultadoDoGerador[]): { r: ResultadoDoGerador; texto: string } {
  const g = new Map(resultados.map((r) => [r, problemasGraves(r)]));
  const ordem = [...resultados].sort((a, b) => g.get(a)! - g.get(b)! || (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.semente - b.semente);
  const r = ordem[0];
  const contagem = resultados.map((x) => g.get(x)!);
  const texto = `semente ${r.semente} de ${resultados.length} tentada(s): ${g.get(r) ? `${g.get(r)} problema(s) grave(s) — o menor entre ${Math.min(...contagem)} e ${Math.max(...contagem)}` : 'sem problema grave'}; nota ${r.avaliacao.notaGeral ?? '—'}`;
  return { r, texto };
}

/** O norte do desenho visto do quadro da frente (mesma convenção de `direcaoDoSol`: norte = (sen θ, cos θ)). */
export function norteNoQuadro(q: QuadroDaFrente, rotacaoNorteDeg: number | null): number | null {
  const th = ((rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const n = { x: Math.sin(th), y: Math.cos(th) };
  const local = Math.round(((Math.atan2(n.x * q.ex.x + n.y * q.ex.y, n.x * q.ey.x + n.y * q.ey.y) * 180) / Math.PI) * 1000) / 1000;
  return rotacaoNorteDeg == null && Math.abs(local) < 1e-9 ? null : local === 0 ? 0 : local;
}

/**
 * As paredes, aberturas e nomes do E6.2 (no quadro da frente) levados ao mundo, nos três
 * comandos de lote. Exata quando a frente cai num eixo; girada, estica as pontas em T.
 */
export function comandosNoMundo(r: ResultadoDoGerador, levelId: ObjectId, q: QuadroDaFrente, exataNoDesenho: boolean): Command[] {
  return comandosLocaisNoMundo(comandosDeAplicacao(r, levelId), q, exataNoDesenho);
}

/** F12: o mesmo para qualquer lote de comandos no quadro da frente (o pavimento com o núcleo, a escada). */
export function comandosLocaisNoMundo(base: readonly Command[], q: QuadroDaFrente, exataNoDesenho: boolean): Command[] {
  const mundo = (p: Point): Point => {
    const m = paraMundo(q, p);
    return point(Math.round(m.x), Math.round(m.y));
  };
  const walls = base.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  const pontas = walls.flatMap((w) => [w.a, w.b]);
  const compartilhada = (p: Point, propria: number) => pontas.some((o, k) => Math.floor(k / 2) !== propria && Math.abs(o.x - p.x) < 1 && Math.abs(o.y - p.y) < 1);
  // Quanto a ponta `a` de cada parede andou para trás (o offset das aberturas cresce o mesmo).
  const andouA = new Map<string, number>();
  const novas = walls.map((w, i) => {
    let a = w.a;
    let b = w.b;
    if (!exataNoDesenho) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / L;
      const uy = (b.y - a.y) / L;
      if (!compartilhada(a, i)) {
        a = { x: a.x - ux * ALEM_MM, y: a.y - uy * ALEM_MM };
        if (w.uid) andouA.set(w.uid, ALEM_MM);
      }
      if (!compartilhada(b, i)) b = { x: b.x + ux * ALEM_MM, y: b.y + uy * ALEM_MM };
    }
    return { ...w, a: mundo(a), b: mundo(b) };
  });
  const out: Command[] = [];
  for (const c of base) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: novas });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: c.openings.map((o) => ({ ...o, offsetMm: Math.round(o.offsetMm + (o.wallUid ? (andouA.get(o.wallUid) ?? 0) : 0)) })) });
    else if (c.type === 'PlaceSpaceLabels') out.push({ type: 'PlaceSpaceLabels', labels: c.labels.map((l) => ({ ...l, at: mundo(l.at) })) });
    else if (c.type === 'AddEscada') out.push({ ...c, pontos: c.pontos.map(mundo) });
    else out.push(c);
  }
  return out;
}

/**
 * F14c: as peças de esgoto de cima agrupadas como o esgoto agrupa os tubos de queda — a até `raioMm` umas das outras e
 * no MESMO cômodo ("um tubo de queda por banheiro de cima"). O passo do shaft e a previsão da laje rebaixada usam isto.
 */
export function gruposDoTuboDeQueda<T extends { at: Point }>(model: BlueprintModel, levelId: ObjectId, pecas: readonly T[], raioMm: number): T[][] {
  const comodos = model.spaces.filter((sp) => sp.levelId === levelId);
  const comodoDe = (p: Point) => comodos.find((sp) => pointInPolygon(sp.ring, p))?.id ?? null;
  const grupos: T[][] = [];
  for (const t of pecas) {
    const perto = grupos.filter((g) => g.some((u) => Math.hypot(u.at.x - t.at.x, u.at.y - t.at.y) <= raioMm && comodoDe(u.at) === comodoDe(t.at)));
    for (const g of perto) grupos.splice(grupos.indexOf(g), 1);
    grupos.push([t, ...perto.flat()]);
  }
  return grupos;
}

/** F14c: quanto o coletor do box sai além da face do shaft, mm (o raio da caixa sifonada e a folga). */
export const COLETOR_ALEM_DO_SHAFT_MM = 150;

/** F14c: o coletor do box (caixa sifonada, ralo) do lote que cai DENTRO de um shaft sai dele (`foraDoShaft`). */
export function coletoresForaDoShaft(model: BlueprintModel, lote: Command[]): Command[] {
  return lote.map((c) => {
    if (c.type !== 'AddTerminal' || (c.tipoHidraulico !== 'CAIXA_SIFONADA' && c.tipoHidraulico !== 'RALO_SIFONADO')) return c;
    const fora = foraDoShaft(model, c.levelId, c.at, COLETOR_ALEM_DO_SHAFT_MM);
    return fora ? ({ ...c, at: fora } as Command) : c;
  });
}

/**
 * F14c: o ponto `at` caiu dentro de um SHAFT do pavimento? Devolve o mais perto fora dele — o pé em cada lado, `alemMm`
 * para fora — que fica no mesmo cômodo e fora de outro shaft; `null` se não caiu (ou não há para onde ir).
 */
export function foraDoShaft(model: BlueprintModel, levelId: ObjectId, at: Point, alemMm: number): Point | null {
  const shafts = (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT' && pavimentosDoNucleo(model, n).some((l) => l.id === levelId)).map((n) => n.ring);
  const comodo = model.spaces.find((sp) => sp.levelId === levelId && pointInPolygon(sp.ring, at))?.ring ?? null;
  return foraDoPoligono(shafts, at, comodo, alemMm);
}

/**
 * F14c: pontos ao longo do contorno dos cômodos (a cada 20 cm) onde a parede fica sob a laje REBAIXADA do pavimento —
 * o ponto 25 cm para dentro do cômodo cai nela. Entram nos `ocupados` da distribuição das tomadas.
 */
export function paredesSobORebaixo(model: BlueprintModel, levelId: ObjectId): Point[] {
  const teto = model.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? Infinity;
  const rebaixos = (model.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === levelId && x.baseMm < teto - 1).map((x) => x.pontos as Point[]);
  if (!rebaixos.length) return [];
  const saida: Point[] = [];
  for (const sp of model.spaces.filter((x) => x.levelId === levelId && x.ring.length >= 3)) {
    const horario = sp.ring.reduce((acc, p, i) => acc + p.x * sp.ring[(i + 1) % sp.ring.length].y - sp.ring[(i + 1) % sp.ring.length].x * p.y, 0) < 0;
    for (let i = 0; i < sp.ring.length; i++) {
      const a = sp.ring[i];
      const b = sp.ring[(i + 1) % sp.ring.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      // A normal para dentro do cômodo.
      const n = horario ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
      for (let d = 0; d <= L; d += 200) {
        const q = { x: a.x + u.x * d, y: a.y + u.y * d };
        if (rebaixos.some((g) => pointInPolygon(g, { x: q.x + n.x * 250, y: q.y + n.y * 250 } as Point))) saida.push({ x: Math.round(q.x), y: Math.round(q.y) } as Point);
      }
    }
  }
  return saida;
}

/** F14c: quanto a luz de teto sai além da borda da laje rebaixada, mm (o eletroduto sobe ali, no plenum). */
export const LUZ_ALEM_DO_REBAIXO_MM = 300;

/** F18: a luz de teto a até isto da face do pilar conta como dentro dele (o raio do eletroduto e a folga), mm. */
export const LUZ_FORA_DO_PILAR_MM = 50;

/**
 * F14c: o ponto `at` caiu dentro de um dos `poligonos` (convexos)? Devolve o mais perto fora dele — o pé em cada lado,
 * `alemMm` para fora — que fica no `comodo` e fora dos outros; `null` se não caiu (ou não há para onde ir).
 */
export function foraDoPoligono(poligonos: readonly (readonly Point[])[], at: Point, comodo: readonly Point[] | null, alemMm: number): Point | null {
  const sh = poligonos.find((g) => pointInPolygon(g as Point[], at));
  if (!sh) return null;
  const c = { x: sh.reduce((a, p) => a + p.x, 0) / sh.length, y: sh.reduce((a, p) => a + p.y, 0) / sh.length };
  let melhor: { p: Point; d: number } | null = null;
  for (let i = 0; i < sh.length; i++) {
    const a = sh[i];
    const b = sh[(i + 1) % sh.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const t = Math.max(0, Math.min(L, (at.x - a.x) * u.x + (at.y - a.y) * u.y));
    const pe = { x: a.x + u.x * t, y: a.y + u.y * t };
    // A normal para FORA (do centro do polígono para o lado).
    let n = { x: -u.y, y: u.x };
    if ((pe.x - c.x) * n.x + (pe.y - c.y) * n.y < 0) n = { x: u.y, y: -u.x };
    const q = { x: Math.round(pe.x + n.x * alemMm), y: Math.round(pe.y + n.y * alemMm) } as Point;
    if (comodo && !pointInPolygon(comodo as Point[], q)) continue;
    if (poligonos.some((g) => pointInPolygon(g as Point[], q))) continue;
    const d = Math.hypot(q.x - at.x, q.y - at.y);
    if (!melhor || d < melhor.d) melhor = { p: q, d };
  }
  return melhor?.p ?? null;
}

/** F22: entre a subida do eletroduto do pressurizador e os tubos, além dos raios, mm. */
export const FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM = 20;
