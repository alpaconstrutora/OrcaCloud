/**
 * Prédio automático — a GARAGEM NO SUBSOLO (PA8a do plano docs/planos/2026-11-12-predio-automatico.md, 15/11/2026).
 *
 * O subsolo do estudo é o bloco de GARAGEM abaixo do solo (o gerador de massa o põe no retângulo do lote, `SUBSOLO_1`/
 * `SUBSOLO_2`) que contém a torre. Ele vira pavimentos de verdade, com os mesmos uids do "Lançar vagas" do painel do bloco
 * (`uidDoPisoDaGaragem` — um não lança por cima do outro), e recebe, de cima para baixo:
 *
 * - as paredes de contenção no contorno;
 * - o NÚCLEO descendo: os elevadores e o shaft passam a partir do subsolo mais fundo, a escada desce lance a lance e o
 *   hall do núcleo do térreo é fechado em cada subsolo, com a porta no mesmo lugar;
 * - a malha da TORRE (os pilares e as vigas do térreo, em prumada até a fundação) e, fora da projeção da torre, os mesmos
 *   eixos estendidos com vão de até `vaoDaGaragemMm` (a laje sobre o subsolo apoia neles);
 * - a RAMPA de veículos junto à frente: da calçada ao 1º subsolo e, com mais subsolos, em vaivém (a de baixo ao lado da
 *   de cima, no sentido contrário). Ela foge dos pilares da torre e do núcleo; os pilares estendidos fogem dela;
 * - a laje de cada subsolo (o teto dele) no contorno, com o vão da rampa que sai dele para cima;
 * - as VAGAS pelo lançador da E2.5, que contorna paredes, pilares, núcleo, escada e rampas — inclusive a rampa que chega
 *   de baixo, que fura o piso.
 *
 * Fica para a PA8b: iluminação e exaustão no quadro de serviço, drenagem, caixa separadora e bombas.
 */
import { applyBatch, contornoDaEscada, contornoDaVaga, pegadaEmPlanta, pointInPolygon, polygonArea, recorteComum } from '../blueprintKernel';
import type { BlueprintModel, Bloco, Command, ObjectId, Point, TipoDeVaga } from '../blueprintKernel';
import { garagemLancada, nomeDoPiso, uidDoPisoDaGaragem, vagasDoContorno } from '../blueprintGaragemDaMassa';
import { HIPOTESES_VAGAS_PADRAO, planejarVagas } from '../blueprintVagasAutomaticas';
import type { PendenciaDoPpci } from '../blueprintGeradorPpci';
import type { HipotesesDoPredio } from './hipoteses';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';

/** Espessura da laje sobre cada subsolo (o piso do térreo e o jardim sobre a garagem), mm. */
export const ESPESSURA_DA_LAJE_DO_SUBSOLO_MM = 150;
/** Espessura das paredes de contenção no contorno do subsolo, mm (a mesma do "Lançar vagas" do painel). */
const PAREDE_DE_CONTENCAO_MM = 200;
/** Afastamento livre em volta de pilar, núcleo e escada que a rampa respeita, mm. */
const FOLGA_DA_RAMPA_MM = 300;
/** Entre as duas faixas da rampa em vaivém (a mureta), mm. */
const MURETA_ENTRE_RAMPAS_MM = 200;
/** A área livre na ponta da rampa que encosta num piso (o carro sai dela e manobra), mm. */
const CHEGADA_DA_RAMPA_MM = 5000;
/** Entre a parede da frente e as rampas de baixo do vaivém: o patamar onde o carro vira de uma faixa para a outra, mm. */
const PATAMAR_DO_VAIVEM_MM = 5500;

/** Uma rampa lançada, no quadro da frente: a faixa (u), o percurso (v) e as áreas de chegada nas pontas. */
interface Rampa {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  anel: Point[];
  /** O pavimento de partida (a ponta baixa). */
  doLevelId: ObjectId;
  /** O pavimento da ponta alta; `null` = a calçada (a rampa de entrada). */
  paraLevelId: ObjectId | null;
  chegadaEmBaixo: [number, number];
  chegadaEmCima: [number, number] | null;
  cmd: Extract<Command, { type: 'AddEscada' }>;
}

export const NOME_DA_GARAGEM = 'Garagem';
export const NOME_DO_HALL_DO_SUBSOLO = 'Hall do subsolo (escada e elevadores)';

interface Local {
  u: number;
  v: number;
}
/** O quadro da frente do subsolo: origem numa ponta da borda da frente, `u` ao longo dela, `v` para dentro. */
interface QuadroDaFrente {
  o: Point;
  u: Point;
  v: Point;
  largura: number;
  profundidade: number;
}

const centro = (pts: readonly Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const paraMundo = (q: QuadroDaFrente, p: Local): Point => inteiro({ x: q.o.x + q.u.x * p.u + q.v.x * p.v, y: q.o.y + q.u.y * p.u + q.v.y * p.v });
const paraLocal = (q: QuadroDaFrente, p: Point): Local => {
  const dx = p.x - q.o.x;
  const dy = p.y - q.o.y;
  return { u: dx * q.u.x + dy * q.u.y, v: dx * q.v.x + dy * q.v.y };
};
const retangulo = (q: QuadroDaFrente, u0: number, u1: number, v0: number, v1: number): Point[] => [paraMundo(q, { u: u0, v: v0 }), paraMundo(q, { u: u1, v: v0 }), paraMundo(q, { u: u1, v: v1 }), paraMundo(q, { u: u0, v: v1 })];
/** O ponto está no ambiente — dentro do anel e fora dos furos dele. */
const noAmbiente = (s: { ring: Point[]; holes: Point[][] }, p: Point) => pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p));
const sobrepoe = (a: Point[], b: Point[]) => Math.abs(polygonArea(recorteComum(a, b))) > 1;
const engordar = (anel: readonly Point[], mm: number): Point[] => {
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - mm, Math.max(...xs) + mm, Math.min(...ys) - mm, Math.max(...ys) + mm];
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
};

/** O contorno é um retângulo (4 vértices em ângulo reto)? É o subsolo do gerador de massa. */
function ehRetangulo(anel: readonly Point[]): boolean {
  if (anel.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % 4];
    const c = anel[(i + 2) % 4];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    if (Math.abs(ab.x * bc.x + ab.y * bc.y) > 1e-3 * Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y)) return false;
  }
  return true;
}

/** O quadro da frente: a borda do contorno mais voltada para a rua (sem rua, a mais longa). */
function quadroDaFrente(anel: readonly Point[], rua: Point | null): QuadroDaFrente {
  const c = centro(anel);
  let melhor = { nota: -Infinity, i: 0, n: { x: 0, y: 0 } };
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const L = dist(a, b);
    if (L <= 0) continue;
    let n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
    if (n.x * ((a.x + b.x) / 2 - c.x) + n.y * ((a.y + b.y) / 2 - c.y) < 0) n = { x: -n.x, y: -n.y };
    const nota = rua ? n.x * rua.x + n.y * rua.y + L * 1e-9 : L;
    if (nota > melhor.nota + 1e-12) melhor = { nota, i, n };
  }
  const a = anel[melhor.i];
  const b = anel[(melhor.i + 1) % anel.length];
  const L = dist(a, b);
  const q: QuadroDaFrente = { o: a, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, v: { x: -melhor.n.x, y: -melhor.n.y }, largura: L, profundidade: 0 };
  q.profundidade = Math.max(...anel.map((p) => paraLocal(q, p).v));
  return q;
}

/** O bloco de garagem abaixo do solo que contém a torre (o subsolo do estudo); `null` = o prédio não tem subsolo. */
export function subsoloDaTorre(model: BlueprintModel, torre: Bloco): Bloco | null {
  const areaDaTorre = Math.abs(polygonArea(torre.pontos as Point[]));
  return (
    (model.blocos ?? []).find(
      (g) => g.id !== torre.id && g.uso === 'GARAGEM' && g.levelId === torre.levelId && g.cotaBaseMm < 0 && Math.abs(polygonArea(recorteComum(torre.pontos as Point[], g.pontos as Point[]))) >= 0.99 * areaDaTorre,
    ) ?? null
  );
}

export interface PisoDoSubsolo {
  levelId: ObjectId;
  nome: string;
  vagas: number;
  porTipo: Record<TipoDeVaga, number>;
}

export interface SubsolosLancados {
  comandos: number;
  /** De cima para baixo: o 1º subsolo primeiro. */
  pisos: PisoDoSubsolo[];
  /** O subsolo mais fundo — onde a fundação assenta. */
  maisFundoLevelId: ObjectId;
  vagas: number;
  /** As vagas que o contorno levaria sem nenhum obstáculo (o número do "Lançar vagas" do painel). */
  teto: number;
  rampas: number;
  pilaresDaTorre: number;
  pilaresDaGaragem: number;
  pendencias: PendenciaDoPpci[];
}

/**
 * Lança os subsolos do bloco de garagem `g` sob a torre: pavimentos, contenção, núcleo, malha, rampas, lajes e vagas.
 * Roda DEPOIS da estrutura (a malha do térreo desce) e ANTES da fundação (ela assenta no subsolo mais fundo).
 */
export function lancarSubsolos(ctx: ContextoDoPredio, base: BaseDoPredio, g: Bloco, terreoLevelId: ObjectId, hip: HipotesesDoPredio): SubsolosLancados {
  const pendencias: PendenciaDoPpci[] = [];
  if (garagemLancada(ctx.m, g).length) throw new Error(`as vagas de "${g.nome}" já estão lançadas — remova esses pavimentos para o prédio lançar o subsolo`);
  const elevRef = ctx.m.levels.find((l) => l.id === g.levelId)?.elevationMm ?? 0;
  const indices = Array.from({ length: g.pavimentos }, (_, i) => i).filter((i) => elevRef + g.cotaBaseMm + i * g.peDireitoMm < 0);
  if (indices.length < g.pavimentos) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Garagem: ${g.pavimentos - indices.length} pavimento(s) de "${g.nome}" acima do solo não são lançados pelo prédio — lance pelo painel do bloco.` });
  const topo = elevRef + g.cotaBaseMm + (indices[indices.length - 1] + 1) * g.peDireitoMm;
  const terreo = ctx.m.levels.find((l) => l.id === terreoLevelId)!;
  if (Math.abs(topo - terreo.elevationMm) > 1) pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: o teto do 1º subsolo fica a ${(topo / 1000).toLocaleString('pt-BR')} m e o piso do térreo a ${(terreo.elevationMm / 1000).toLocaleString('pt-BR')} m — ajuste a cota ou o pé-direito do bloco "${g.nome}".` });
  let comandos = 0;

  // ── Os pavimentos, de cima para baixo (o 1º subsolo é o mais perto do solo).
  const ordem = [...indices].reverse();
  comandos += ctx.aplicar(ordem.map((i): Command => ({ type: 'AddLevel', name: nomeDoPiso(g, i).nome.slice(0, 60), elevationMm: elevRef + g.cotaBaseMm + i * g.peDireitoMm, defaultHeightMm: g.peDireitoMm, uid: uidDoPisoDaGaragem(g, i) })));
  const pisos = ordem.map((i) => ({ i, levelId: ctx.m.levels.find((l) => l.uid === uidDoPisoDaGaragem(g, i))!.id, ...nomeDoPiso(g, i) }));
  const maisFundo = pisos[pisos.length - 1].levelId;

  // ── O hall do núcleo do térreo (o ambiente onde a escada está) — fechado igual em cada subsolo.
  const escadas = ctx.m.stairs.filter((e) => e.levelId === terreoLevelId);
  const hall = escadas.length ? ctx.m.spaces.find((s) => s.levelId === terreoLevelId && noAmbiente(s, inteiro(centro(escadas[0].pontos)))) ?? null : null;
  const anelDoHall = hall ? simplificar(hall.ring) : null;

  // ── As paredes: a contenção no contorno e o hall do núcleo.
  const contorno = g.pontos as Point[];
  const paredes: Command[] = [];
  for (const p of pisos) {
    contorno.forEach((a, k) => paredes.push({ type: 'AddWall', levelId: p.levelId, a, b: contorno[(k + 1) % contorno.length], thicknessMm: PAREDE_DE_CONTENCAO_MM, heightMm: g.peDireitoMm }));
    if (anelDoHall) anelDoHall.forEach((a, k) => paredes.push({ type: 'AddWall', levelId: p.levelId, a, b: anelDoHall[(k + 1) % anelDoHall.length], thicknessMm: 150, heightMm: g.peDireitoMm }));
  }
  comandos += ctx.aplicar(paredes);
  if (!anelDoHall) pendencias.push({ grupo: 'VERIFICACAO', texto: 'Garagem: o núcleo do térreo não fecha um ambiente — o hall da escada e dos elevadores nos subsolos fica aberto; feche-o à mão (a escada de emergência é enclausurada).' });

  // ── As portas do hall (no mesmo lugar das do térreo) e as paredes que cedem aos pilares.
  const lote: Command[] = [];
  const paredesDoTerreo = ctx.m.walls.filter((w) => w.levelId === terreoLevelId);
  for (const p of pisos) {
    const doPiso = ctx.m.walls.filter((w) => w.levelId === p.levelId);
    for (const w of doPiso) lote.push({ type: 'SetCedeSobreposicao', id: w.id, cede: true });
    if (!anelDoHall) continue;
    let portas = 0;
    const doHall = doPiso.filter((w) => w.thicknessMm === 150);
    for (const w of doHall) {
      const L = dist(w.a, w.b);
      const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      for (const t of paredesDoTerreo) {
        // Colinear (a menos de 50 mm do eixo nas duas pontas).
        const fora = (q: Point) => Math.abs((q.x - w.a.x) * u.y - (q.y - w.a.y) * u.x);
        if (fora(t.a) > 50 || fora(t.b) > 50) continue;
        const Lt = dist(t.a, t.b);
        const ut = { x: (t.b.x - t.a.x) / Lt, y: (t.b.y - t.a.y) / Lt };
        for (const o of ctx.m.openings.filter((x) => x.wallId === t.id && (x.kind === 'door' || x.kind === 'passage'))) {
          const meio = { x: t.a.x + ut.x * (o.offsetMm + o.widthMm / 2), y: t.a.y + ut.y * (o.offsetMm + o.widthMm / 2) };
          const s = (meio.x - w.a.x) * u.x + (meio.y - w.a.y) * u.y;
          if (s - o.widthMm / 2 < 50 || s + o.widthMm / 2 > L - 50) continue;
          lote.push({ type: 'AddOpening', wallId: w.id, kind: 'door', offsetMm: Math.round(s - o.widthMm / 2), widthMm: o.widthMm, heightMm: o.heightMm, sillMm: 0 });
          portas++;
        }
      }
    }
    if (!portas && doHall.length) {
      // Sem porta para copiar: no meio da parede mais longa do hall.
      const w = [...doHall].sort((a, b) => dist(b.a, b.b) - dist(a.a, a.b))[0];
      lote.push({ type: 'AddOpening', wallId: w.id, kind: 'door', offsetMm: Math.round(dist(w.a, w.b) / 2 - 450), widthMm: 900, heightMm: 2100, sillMm: 0 });
    }
  }

  // ── O núcleo desce: uma peça por elevador e shaft a partir do subsolo mais fundo (as do térreo saem); a escada, lance a
  // lance (cada subsolo sobe ao de cima; o 1º, ao térreo da torre — explícito: o desenho tem outro pavimento na cota 0).
  const doTerreo = (ctx.m.nucleos ?? []).filter((x) => x.levelId === terreoLevelId);
  for (const x of doTerreo) {
    lote.push({
      type: 'AddNucleo',
      levelId: maisFundo,
      tipo: x.tipo,
      ring: x.ring.map((p) => ({ ...p })),
      ateLevelId: x.ateLevelId ?? null,
      rotulo: x.rotulo ?? null,
      ...(x.disciplina ? { disciplina: x.disciplina } : {}),
      ...(x.tipo === 'ELEVADOR' ? { pocoMm: x.pocoMm ?? null, casaDeMaquinasMm: x.casaDeMaquinasMm ?? null, capacidade: x.capacidade ?? null } : {}),
    });
  }
  lote.push(...doTerreo.map((x): Command => ({ type: 'DeleteNucleo', nucleoId: x.id })));
  const chegada = new Map(pisos.map((p, k) => [p.levelId, k === 0 ? terreoLevelId : pisos[k - 1].levelId]));
  for (const p of pisos) for (const e of escadas) lote.push({ type: 'AddEscada', levelId: p.levelId, pontos: e.pontos.map((q) => ({ ...q })), tipo: e.tipo, larguraMm: e.larguraMm, alvoEspelhoMm: e.alvoEspelhoMm, rotulo: e.rotulo ?? null });

  // ── A malha da torre: os pilares do térreo, em prumada, em cada subsolo. Sem as vigas: o teto do subsolo é laje lisa
  // apoiada nos pilares (a da garagem, que poupa altura e deixa a rampa atravessar o vão sem cortar viga).
  const pilaresDoTerreo = ctx.m.structures.filter((s) => s.levelId === terreoLevelId && s.kind === 'PILAR');
  if (pilaresDoTerreo.length) for (const p of pisos) lote.push({ type: 'DuplicateEntities', levelId: p.levelId, wallIds: [], boundaryIds: [], structuralIds: pilaresDoTerreo.map((s) => s.id), openings: [], delta: { x: 0, y: 0 } });

  // ── A rampa (junto à frente, fugindo dos pilares da torre, do núcleo e da escada) — no retângulo do subsolo. A de
  // entrada desce da calçada (a parede da frente) para dentro; com mais subsolos, as de baixo vão em vaivém na faixa ao
  // lado, afastadas da frente por um patamar de manobra — o carro chega e vira. Na ponta de cada rampa que encosta num
  // piso fica a área de chegada (`CHEGADA_DA_RAMPA_MM`), sem vaga nem pilar.
  const q = quadroDaFrente(contorno, base.rua);
  const rampas: Rampa[] = [];
  const meia = PAREDE_DE_CONTENCAO_MM / 2;
  const obstaculosDaRampa = [
    ...pilaresDoTerreo.map((s) => engordar(pegadaEmPlanta(s), FOLGA_DA_RAMPA_MM)),
    ...doTerreo.map((x) => engordar(x.ring, FOLGA_DA_RAMPA_MM)),
    ...escadas.map((e) => engordar(contornoDaEscada(e), FOLGA_DA_RAMPA_MM)),
    ...(anelDoHall ? [engordar(anelDoHall, FOLGA_DA_RAMPA_MM)] : []),
  ];
  const desnivel = terreo.elevationMm - ctx.m.levels.find((l) => l.id === pisos[0].levelId)!.elevationMm;
  const comprimento = Math.ceil(desnivel / (hip.rampaDeVeiculosMaxPct / 100) / 10) * 10;
  const W = hip.larguraDaRampaMm;
  const faixas = pisos.length > 1 ? 2 : 1;
  const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  // O percurso de cada rampa no fundo (v): a de entrada encosta na frente; as de baixo, depois do patamar.
  const percurso = (k: number) => {
    const ini = k === 0 ? meia : meia + PATAMAR_DO_VAIVEM_MM;
    const fim = ini + comprimento;
    // k par: o alto na frente (a entrada sobe à calçada; a 3ª sobe ao patamar do 2º); k ímpar: o alto no fundo.
    return k % 2 === 0 ? { vAlto: ini, vBaixo: fim } : { vAlto: fim, vBaixo: ini };
  };
  const ocupacao = (k: number) => {
    const { vAlto, vBaixo } = percurso(k);
    const sentido = Math.sign(vBaixo - vAlto);
    const vs = [vAlto, vBaixo, vBaixo + sentido * CHEGADA_DA_RAMPA_MM, ...(k > 0 ? [vAlto - sentido * CHEGADA_DA_RAMPA_MM] : [])];
    return { v0: Math.max(meia, Math.min(...vs)), v1: Math.max(...vs) };
  };
  const alcance = Math.max(...pisos.map((_, k) => ocupacao(k).v1));
  const ks = (par: boolean) => pisos.map((_, k) => k).filter((k) => (k % 2 === 0) === par);
  /**
   * A faixa (u) onde as rampas `ks` cabem sem tocar obstáculo nem as faixas `evitar`; em ordem de preferência: junto a uma
   * parede lateral, ou o mais perto de `perto` (a 2ª faixa do vaivém, o mais perto da 1ª).
   */
  const acharFaixa = (lista: number[], evitar: Point[][], perto: number | null): [number, number] | null => {
    const ini = meia;
    const fim = q.largura - meia - W;
    const candidatos: number[] = [];
    for (let x = ini; x <= fim + 1e-6; x += 250) candidatos.push(x);
    if (candidatos.length && candidatos[candidatos.length - 1] < fim - 1e-6) candidatos.push(fim);
    const nota = (x: number) => (perto == null ? Math.min(x - ini, fim - x) : Math.abs(x + W / 2 - perto));
    candidatos.sort((a, b) => nota(a) - nota(b) || a - b);
    for (const u0 of candidatos) {
      const livre = lista.every((k) => {
        const o = ocupacao(k);
        const r = retangulo(q, u0, u0 + W, o.v0, o.v1);
        return ![...obstaculosDaRampa, ...evitar].some((x) => sobrepoe(r, x));
      });
      if (livre) return [u0, u0 + W];
    }
    return null;
  };
  let escolha: [number, number][] | null = null;
  if (!ehRetangulo(contorno)) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Garagem: o contorno de "${g.nome}" não é um retângulo — a rampa de veículos e a laje sobre o subsolo ficam para o projetista.` });
  else if (alcance > q.profundidade - meia) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Garagem: a rampa a ${pct(hip.rampaDeVeiculosMaxPct)} % precisa de ${pct(comprimento / 1000)} m (mais a chegada${faixas > 1 ? ' e o patamar do vaivém' : ''}) e o subsolo tem ${pct(q.profundidade / 1000)} m de fundo — desenhe-a à mão.` });
  else {
    const f1 = acharFaixa(ks(true), [], null);
    const f2 = f1 && faixas > 1 ? acharFaixa(ks(false), [retangulo(q, f1[0] - MURETA_ENTRE_RAMPAS_MM, f1[1] + MURETA_ENTRE_RAMPAS_MM, 0, q.profundidade)], (f1[0] + f1[1]) / 2) : null;
    escolha = f1 && (faixas === 1 || f2) ? [f1, ...(f2 ? [f2] : [])] : null;
    if (!escolha) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Garagem: a rampa de veículos (${pct(W / 1000)} m × ${pct(comprimento / 1000)} m a ${pct(hip.rampaDeVeiculosMaxPct)} %) não coube junto à frente sem tocar pilar, escada ou núcleo da torre — desenhe-a à mão.` });
    else {
      pisos.forEach((p, k) => {
        // A rampa que SAI do subsolo k para cima: a 1ª vai à calçada; as seguintes, em vaivém, ao subsolo de cima.
        const [u0, u1] = escolha![k % 2];
        const um = (u0 + u1) / 2;
        const { vAlto, vBaixo } = percurso(k);
        // Os pontos vão do BAIXO para o ALTO, como em toda escada.
        const pontos = [paraMundo(q, { u: um, v: vBaixo }), paraMundo(q, { u: um, v: vAlto })];
        const cmd: Extract<Command, { type: 'AddEscada' }> =
          k === 0
            ? { type: 'AddEscada', levelId: p.levelId, pontos, tipo: 'RAMPA', veicular: true, larguraMm: W, alvoEspelhoMm: 175, rotulo: 'Rampa da garagem', desdeCotaMm: terreo.elevationMm }
            : { type: 'AddEscada', levelId: p.levelId, pontos, tipo: 'RAMPA', veicular: true, larguraMm: W, alvoEspelhoMm: 175, rotulo: `Rampa ${nomeDoPiso(g, p.i).prefixo.replace('-', '')}–${nomeDoPiso(g, pisos[k - 1].i).prefixo.replace('-', '')}` };
        const sentido = Math.sign(vBaixo - vAlto);
        const chegada = (v: number, para: number): [number, number] => {
          const fimDaChegada = Math.max(meia, Math.min(q.profundidade - meia, v + para * CHEGADA_DA_RAMPA_MM));
          return [Math.min(v, fimDaChegada), Math.max(v, fimDaChegada)];
        };
        rampas.push({
          u0,
          u1,
          v0: Math.min(vAlto, vBaixo),
          v1: Math.max(vAlto, vBaixo),
          anel: retangulo(q, u0, u1, Math.min(vAlto, vBaixo), Math.max(vAlto, vBaixo)),
          doLevelId: p.levelId,
          paraLevelId: k === 0 ? null : pisos[k - 1].levelId,
          chegadaEmBaixo: chegada(vBaixo, sentido),
          chegadaEmCima: k === 0 ? null : chegada(vAlto, -sentido),
          cmd,
        });
        lote.push(cmd);
      });
      pendencias.push({ grupo: 'CONFERIR', texto: `Garagem: rampa de veículos de mão única (${pct(W / 1000)} m) a ${pct(hip.rampaDeVeiculosMaxPct)} %, ${pct(comprimento / 1000)} m por subsolo${faixas > 1 ? (Math.abs(escolha[1][0] - escolha[0][1]) <= MURETA_ENTRE_RAMPAS_MM + 1 || Math.abs(escolha[0][0] - escolha[1][1]) <= MURETA_ENTRE_RAMPAS_MM + 1 ? ', em vaivém' : ', em vaivém com as faixas separadas (a de baixo entre os pilares da torre)') : ''} — confira no código de obras a inclinação, as curvas de concordância e se o número de vagas pede mão dupla.` });
    }
  }
  /** O que a rampa ocupa num pavimento: ela (se parte dele ou chega nele) e a área de chegada na ponta que encosta nele. */
  const ocupadoPelaRampa = (r: Rampa, levelId: ObjectId): Point[][] => {
    const out: Point[][] = [];
    if (r.doLevelId === levelId || r.paraLevelId === levelId) out.push(r.anel);
    if (r.doLevelId === levelId) out.push(retangulo(q, r.u0, r.u1, r.chegadaEmBaixo[0], r.chegadaEmBaixo[1]));
    if (r.paraLevelId === levelId && r.chegadaEmCima) out.push(retangulo(q, r.u0, r.u1, r.chegadaEmCima[0], r.chegadaEmCima[1]));
    return out;
  };

  // ── Fora da projeção da torre: os eixos dela estendidos ao contorno, com vão de até `vaoDaGaragemMm`.
  const extensao: Point[] = [];
  let tiradosDaRampa = 0;
  if (pilaresDoTerreo.length && ehRetangulo(contorno)) {
    const locais = pilaresDoTerreo.map((s) => paraLocal(q, s.pontos[0]));
    const linhas = (vals: number[], max: number) => {
      const torre = agrupar(vals);
      const todas = [...torre];
      const estender = (de: number, ate: number) => {
        const n = Math.ceil(Math.abs(ate - de) / hip.vaoDaGaragemMm);
        for (let k = 1; k <= n; k++) todas.push(de + ((ate - de) * k) / n);
      };
      estender(torre[0], 0);
      estender(torre[torre.length - 1], max);
      return ralear(agrupar(todas), hip.vaoDaGaragemMm);
    };
    const us = linhas(locais.map((p) => p.u), q.largura);
    const vs = linhas(locais.map((p) => p.v), q.profundidade);
    const torre = engordar(base.bloco.pontos as Point[], 600);
    const noHall = anelDoHall ? engordar(anelDoHall, FOLGA_DA_RAMPA_MM) : null;
    for (const u of us) {
      for (const v of vs) {
        const p = paraMundo(q, { u, v });
        if (pointInPolygon(torre, p)) continue;
        if (pilaresDoTerreo.some((s) => dist(s.pontos[0], p) < 1200)) continue;
        if (noHall && pointInPolygon(noHall, p)) continue;
        if (rampas.some((r) => pisos.some((x) => ocupadoPelaRampa(r, x.levelId).some((o) => pointInPolygon(engordar(o, FOLGA_DA_RAMPA_MM), p))))) {
          tiradosDaRampa++;
          continue;
        }
        extensao.push(p);
      }
    }
  }
  const secao = pilaresDoTerreo[0] ?? null;
  for (const p of pisos) {
    extensao.forEach((at, k) =>
      lote.push({
        type: 'AddStructural',
        levelId: p.levelId,
        kind: 'PILAR',
        pontos: [at],
        larguraMm: secao?.larguraMm ?? 190,
        profundidadeMm: secao?.profundidadeMm ?? 190,
        alturaMm: g.peDireitoMm,
        baseMm: 0,
        circular: false,
        rotacaoDeg: secao?.rotacaoDeg ?? 0,
        rotulo: `PS${k + 1}`,
      }),
    );
  }
  if (extensao.length) pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: fora da projeção da torre, os eixos dela estendidos ao contorno com vão de até ${pct(hip.vaoDaGaragemMm / 1000)} m (${extensao.length} pilar(es) por subsolo${tiradosDaRampa ? `, ${tiradosDaRampa} tirado(s) da rampa` : ''}) — pré-dimensionamento: a laje sobre o subsolo (jardim, acesso, viatura) e os pilares dela exigem cálculo.` });

  // ── A laje de cada subsolo (o teto dele), no contorno, com o vão da rampa que sai dele.
  if (ehRetangulo(contorno)) {
    for (const p of pisos) {
      const r = rampas.find((x) => x.doLevelId === p.levelId);
      const pedacos = r ? lajeComVao(q, r) : [contorno.map((x) => ({ ...x }))];
      const rot = `L-${nomeDoPiso(g, p.i).prefixo.replace('-', '')}`;
      pedacos.forEach((anel, n) => lote.push({ type: 'AddStructural', levelId: p.levelId, kind: 'LAJE', pontos: anel, alturaMm: ESPESSURA_DA_LAJE_DO_SUBSOLO_MM, baseMm: g.peDireitoMm, rotulo: pedacos.length > 1 ? `${rot}.${n + 1}` : rot }));
    }
  }
  comandos += ctx.aplicar(lote);

  // ── A chegada de cada escada e rampa entre pavimentos, explícita (o 1º subsolo sobe ao térreo da torre — o desenho tem
  // outro pavimento na cota 0, o de referência da massa); e os nomes: o hall e a garagem (o ambiente maior de cada subsolo).
  const nomes: Command[] = ctx.m.stairs.filter((e) => chegada.has(e.levelId) && e.desdeCotaMm == null).map((e): Command => ({ type: 'SetEscadaProps', escadaId: e.id, ateLevelId: chegada.get(e.levelId)! }));
  const garagens = new Map<ObjectId, ObjectId>();
  for (const p of pisos) {
    const doPiso = ctx.m.spaces.filter((s) => s.levelId === p.levelId);
    const h = anelDoHall ? doPiso.find((s) => noAmbiente(s, inteiro(centro(escadas[0].pontos)))) : null;
    if (h) nomes.push({ type: 'NameSpace', spaceId: h.id, name: NOME_DO_HALL_DO_SUBSOLO });
    const gar = [...doPiso].filter((s) => s.id !== h?.id).sort((a, b) => b.areaMm2 - a.areaMm2)[0];
    if (gar) {
      nomes.push({ type: 'NameSpace', spaceId: gar.id, name: NOME_DA_GARAGEM });
      garagens.set(p.levelId, gar.id);
    }
  }
  comandos += ctx.aplicar(nomes);

  // ── As vagas: o lançador da E2.5 em cada subsolo. A rampa que CHEGA de baixo fura o piso — na vista, ela entra como
  // obstáculo deste pavimento (o lançador só olha as escadas que partem dele).
  const hipVagas = { ...HIPOTESES_VAGAS_PADRAO, pcdPct: 2, idosoPct: 5, motoPct: 0, exigenciaManual: null, vagasPorUnidade: null };
  const vagas: Command[] = [];
  const saida: PisoDoSubsolo[] = [];
  pisos.forEach((p, k) => {
    // Cada área como uma rampa de mentira no eixo dela (o lançador só contorna as escadas que partem do pavimento).
    const falsas: Command[] = rampas.flatMap((r) =>
      ocupadoPelaRampa(r, p.levelId).map((anel): Command => {
        const l = anel.map((x) => paraLocal(q, x));
        const um = (r.u0 + r.u1) / 2;
        const [v0, v1] = [Math.min(...l.map((x) => x.v)), Math.max(...l.map((x) => x.v))];
        return { type: 'AddEscada', levelId: p.levelId, pontos: [paraMundo(q, { u: um, v: v0 }), paraMundo(q, { u: um, v: v1 })], tipo: 'RAMPA', larguraMm: r.u1 - r.u0, alvoEspelhoMm: 175 };
      }),
    );
    const vista = falsas.length ? applyBatch(ctx.m, falsas).model : ctx.m;
    const spaceId = garagens.get(p.levelId);
    const plano = planejarVagas(vista, p.levelId, hipVagas, spaceId ? { tipo: 'AMBIENTE', spaceId } : { tipo: 'PAVIMENTO' });
    const porTipo: Record<TipoDeVaga, number> = { COMUM: 0, PCD: 0, IDOSO: 0, MOTO: 0 };
    plano.vagas.forEach((v, n) => {
      porTipo[v.tipo]++;
      vagas.push({ type: 'AddVaga', levelId: p.levelId, at: v.at, tipo: v.tipo, larguraMm: v.larguraMm, comprimentoMm: v.comprimentoMm, rotacaoGraus: v.rotacaoGraus, numero: `${p.prefixo}${n + 1}`, sugerida: false });
    });
    if (!plano.vagas.length) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Garagem: nenhuma vaga coube no ${p.nome}${plano.motivo ? ` (${plano.motivo})` : ''}.` });
    saida.push({ levelId: p.levelId, nome: p.nome, vagas: plano.vagas.length, porTipo });
  });
  comandos += ctx.aplicar(vagas);
  // Conferência do "pronto": nenhum pilar sobre vaga ou rampa (o lançador já foge; isto pega a malha estendida).
  for (const p of pisos) {
    const doPiso = ctx.m.structures.filter((s) => s.levelId === p.levelId && s.kind === 'PILAR').map((s) => pegadaEmPlanta(s));
    const ocupado = [...(ctx.m.vagas ?? []).filter((v) => v.levelId === p.levelId).map((v) => contornoDaVaga(v)), ...rampas.flatMap((r) => ocupadoPelaRampa(r, p.levelId))];
    const n = doPiso.filter((pp) => ocupado.some((o) => sobrepoe(pp, o))).length;
    if (n) pendencias.push({ grupo: 'VERIFICACAO', texto: `Garagem: ${n} pilar(es) sobre vaga ou rampa no ${p.nome} — confira.` });
  }
  pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Garagem: a iluminação, a exaustão, a drenagem com a caixa separadora e as bombas do subsolo ainda não são lançadas pelo prédio automático (PA8b).' });
  const total = saida.reduce((s, p) => s + p.vagas, 0);
  return {
    comandos,
    pisos: saida,
    maisFundoLevelId: maisFundo,
    vagas: total,
    teto: vagasDoContorno(contorno).length * pisos.length,
    rampas: rampas.length,
    pilaresDaTorre: pilaresDoTerreo.length,
    pilaresDaGaragem: extensao.length,
    pendencias,
  };
}

/** Vértices sem repetição e sem os colineares (o anel do ambiente traz os nós das paredes que encostam). */
function simplificar(anel: readonly Point[]): Point[] {
  let r = anel.filter((p, i) => dist(p, anel[(i + 1) % anel.length]) > 1);
  let mudou = true;
  while (mudou && r.length > 3) {
    mudou = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i - 1 + r.length) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cruz) <= 1e-6 * dist(a, b) * dist(b, c) + 1) {
        r = r.filter((_, j) => j !== i);
        mudou = true;
        break;
      }
    }
  }
  return r.map((p) => ({ x: p.x, y: p.y }));
}

/** Os valores agrupados a menos de 300 mm (a média de cada grupo), em ordem. */
function agrupar(vals: number[]): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const v of s) {
    const g = grupos[grupos.length - 1];
    if (g && v - g[g.length - 1] < 300) g.push(v);
    else grupos.push([v]);
  }
  return grupos.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length));
}

/** Das linhas, só as que mantêm o vão até `vao` com o mínimo delas (a 1ª e a última ficam). */
function ralear(linhas: number[], vao: number): number[] {
  if (linhas.length <= 2) return linhas;
  const r = [linhas[0]];
  let i = 0;
  while (i < linhas.length - 1) {
    let j = i + 1;
    while (j + 1 < linhas.length && linhas[j + 1] - linhas[i] <= vao + 1) j++;
    r.push(linhas[j]);
    i = j;
  }
  return r;
}

/**
 * O retângulo do subsolo menos o vão da rampa, em pedaços retangulares (a laje é um polígono sem furo): a faixa da
 * frente, a do fundo e as dos lados do vão. Vão encostado numa parede some com o pedaço daquele lado.
 */
function lajeComVao(q: QuadroDaFrente, r: Pick<Rampa, 'u0' | 'u1' | 'v0' | 'v1'>): Point[][] {
  const encosta = (x: number, borda: number) => Math.abs(x - borda) <= PAREDE_DE_CONTENCAO_MM;
  const a = encosta(r.u0, 0) ? 0 : r.u0;
  const b = encosta(r.u1, q.largura) ? q.largura : r.u1;
  const h0 = encosta(r.v0, 0) ? 0 : r.v0;
  const h1 = encosta(r.v1, q.profundidade) ? q.profundidade : r.v1;
  const pedacos: [number, number, number, number][] = [
    [0, q.largura, 0, h0],
    [0, q.largura, h1, q.profundidade],
    [0, a, h0, h1],
    [b, q.largura, h0, h1],
  ];
  return pedacos.filter(([u0, u1, v0, v1]) => u1 - u0 > 1 && v1 - v0 > 1).map(([u0, u1, v0, v1]) => retangulo(q, u0, u1, v0, v1));
}
