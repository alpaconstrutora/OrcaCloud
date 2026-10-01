/**
 * DISTRIBUIÇÃO AUTOMÁTICA DE SPRINKLERS (01/10/2026, E5.3 do roadmap de incêndio).
 *
 * Um ambiente vira ramais paralelos com sprinklers a espaçamento regular,
 * respeitando o espaçamento máximo, a área máxima por sprinkler (do critério da
 * E5.1), meio espaçamento até a parede e a distância do defletor ao teto. A
 * PRÉVIA traz alternativas (sentido dos ramais × espaçamento) com contagem e
 * comprimento, para escolher antes de confirmar; confirmar é um lote só (um
 * Ctrl+Z). A tubulação (ramal → subgeral → geral) é a E5.4.
 *
 * Como: no referencial do ramal (u ao longo, v através), o retângulo
 * envolvente é dividido em células iguais — su × sv ≤ área máxima, su e sv ≤ o
 * espaçamento máximo — e cada célula que toca o ambiente leva um sprinkler: no
 * centro, se o centro cai dentro; senão no ponto interior da parte da célula que
 * fica dentro (o ambiente em L não perde cobertura no canto). Sprinkler sob viga
 * anda através do ramal até sair dela.
 *
 * ⚠️ NORMA (CONFERIR NA NBR 10897): espaçamento máximo de 4,6 m nos riscos leve e
 * ordinário e 3,7 m no extraordinário; mínimo de 1,8 m entre sprinklers; até a
 * parede, no máximo meio espaçamento e no mínimo 10 cm — os valores do spray
 * padrão da NFPA 13, em que a NBR se baseia, transcritos de memória.
 */
import {
  contornoEmPlanta,
  interiorPoint,
  pointInPolygon,
  polygonArea,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type RiscoDeSprinkler,
} from './blueprintKernel';
import { DISTANCIA_AO_TETO_PADRAO_MM, type CriterioDeSprinklers, type HipotesesDeSprinklers } from './blueprintSprinklersIncendio';
import { recortar } from './blueprintAreaDeOperacao';

/** CONFERIR NA NORMA — ver o cabeçalho. */
export const ESPACAMENTO_MAXIMO_MM: Record<RiscoDeSprinkler, number> = { LEVE: 4600, ORDINARIO_1: 4600, ORDINARIO_2: 4600, EXTRA_1: 3700, EXTRA_2: 3700 };
export const ESPACAMENTO_MINIMO_MM = 1800;
export const DISTANCIA_MINIMA_A_PAREDE_MM = 100;

export type SentidoDosRamais = 'X' | 'Y';
type Modo = 'MAXIMO' | 'QUADRADO';

export interface AlternativaDeDistribuicao {
  chave: string;
  rotulo: string;
  sentido: SentidoDosRamais;
  espacamentoNoRamalMm: number;
  espacamentoEntreRamaisMm: number;
  /** su × sv, m² — a área de cada célula. */
  areaPorSprinklerM2: number;
  pontos: Point[];
  /** Os ramais, sprinkler a sprinkler (só a geometria; os tubos são a E5.4). */
  ramais: { a: Point; b: Point }[];
  /** E5.4: os sprinklers de cada ramal, na ordem ao longo dele — o traçado parte daqui. */
  linhas: Point[][];
  contagem: number;
  comprimentoDosRamaisM: number;
  /** Quantos andaram para sair de baixo de viga. */
  deslocadosPorViga: number;
}

export interface PlanoDeSprinklers {
  spaceId: ObjectId;
  levelId: ObjectId;
  /** Cota do defletor (do piso do pavimento): pé-direito − distância ao teto. */
  cotaMm: number;
  /** Da que tem menos sprinklers para a que tem mais; no empate, a de ramais mais curtos. */
  alternativas: AlternativaDeDistribuicao[];
  motivo: string | null;
}

const troca = (p: Point): Point => ({ x: p.y, y: p.x });

/** Uma alternativa: sentido × modo de espaçamento. */
function alternativa(ring: Point[], holes: Point[][], vigas: Point[][], sentido: SentidoDosRamais, modo: Modo, S: number, amaxMm2: number): AlternativaDeDistribuicao | null {
  // Referencial do ramal: no sentido Y, troca x e y (é uma reflexão: distância e área não mudam).
  const ida = sentido === 'X' ? (p: Point) => p : troca;
  const anel = ring.map(ida);
  const furos = holes.map((h) => h.map(ida));
  const obst = vigas.map((v) => v.map(ida));
  const us = anel.map((p) => p.x);
  const vs = anel.map((p) => p.y);
  const u0 = Math.min(...us);
  const v0 = Math.min(...vs);
  const Lu = Math.max(...us) - u0;
  const Lv = Math.max(...vs) - v0;
  if (Lu <= 0 || Lv <= 0) return null;
  let nu: number;
  let nv: number;
  if (modo === 'MAXIMO') {
    // O ramal o mais espaçado que a norma deixa; entre ramais, o que a área ainda permite.
    nu = Math.ceil(Lu / S - 1e-9);
    nv = Math.ceil(Lv / Math.min(S, amaxMm2 / (Lu / nu)) - 1e-9);
  } else {
    const s0 = Math.min(S, Math.sqrt(amaxMm2));
    nu = Math.ceil(Lu / s0 - 1e-9);
    nv = Math.ceil(Lv / s0 - 1e-9);
  }
  const su = Lu / nu;
  const sv = Lv / nv;
  const dentro = (p: Point) => pointInPolygon(anel, p) && !furos.some((h) => pointInPolygon(h, p));
  const sobViga = (p: Point) => obst.some((o) => pointInPolygon(o, p));
  const linhas: Point[][] = [];
  let deslocados = 0;
  for (let j = 0; j < nv; j++) {
    const linha: Point[] = [];
    for (let i = 0; i < nu; i++) {
      const c = { x: u0 + (i + 0.5) * su, y: v0 + (j + 0.5) * sv };
      let p: Point | null = null;
      if (dentro(c)) p = c;
      else {
        // A célula toca o ambiente? Um sprinkler no ponto interior da parte de dentro.
        const cel = [
          { x: u0 + i * su, y: v0 + j * sv },
          { x: u0 + (i + 1) * su, y: v0 + j * sv },
          { x: u0 + (i + 1) * su, y: v0 + (j + 1) * sv },
          { x: u0 + i * su, y: v0 + (j + 1) * sv },
        ];
        const parte = recortar(anel, cel);
        if (parte.length >= 3 && polygonArea(parte) > 0.05 * su * sv) {
          const q = interiorPoint(parte);
          if (dentro(q)) p = q;
        }
      }
      if (!p) continue;
      if (sobViga(p)) {
        // Anda através do ramal, de 10 em 10 cm, até meio espaçamento, para sair de baixo da viga.
        let achou: Point | null = null;
        for (let d = 100; d <= sv / 2 && !achou; d += 100) {
          for (const sinal of [1, -1]) {
            const q = { x: p.x, y: p.y + sinal * d };
            if (dentro(q) && !sobViga(q)) {
              achou = q;
              break;
            }
          }
        }
        if (achou) {
          p = achou;
          deslocados++;
        }
      }
      linha.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
    if (linha.length) linhas.push(linha);
  }
  const volta = sentido === 'X' ? (p: Point) => p : troca;
  const pontos = linhas.flat().map(volta);
  const ramais = linhas.flatMap((l) => l.slice(1).map((b, k) => ({ a: volta(l[k]), b: volta(b) })));
  const comprimentoDosRamaisM = ramais.reduce((s, r) => s + Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y), 0) / 1000;
  const rotulo = `Ramais em ${sentido === 'X' ? 'x' : 'y'} · ${modo === 'MAXIMO' ? 'espaçamento máximo' : 'malha quadrada'}`;
  return {
    chave: `${sentido}|${modo}`,
    rotulo,
    sentido,
    espacamentoNoRamalMm: Math.round(su),
    espacamentoEntreRamaisMm: Math.round(sv),
    areaPorSprinklerM2: (su * sv) / 1e6,
    pontos,
    ramais,
    linhas: linhas.map((l) => l.map(volta)),
    contagem: pontos.length,
    comprimentoDosRamaisM,
    deslocadosPorViga: deslocados,
  };
}

/** As alternativas de distribuição no ambiente `spaceId`. */
export function distribuirSprinklers(model: BlueprintModel, spaceId: ObjectId, criterio: CriterioDeSprinklers, hs: HipotesesDeSprinklers): PlanoDeSprinklers {
  const space = model.spaces.find((s) => s.id === spaceId);
  const vazio = (motivo: string): PlanoDeSprinklers => ({ spaceId, levelId: space?.levelId ?? '', cotaMm: 0, alternativas: [], motivo });
  if (!space) return vazio('ambiente inexistente');
  if (!criterio.risco || !criterio.areaPorSprinkler) return vazio('sem o risco dos sprinklers — declare-o nas premissas');
  const nivel = model.levels.find((l) => l.id === space.levelId)!;
  const cotaMm = nivel.defaultHeightMm - (hs.distanciaAoTetoMm ?? DISTANCIA_AO_TETO_PADRAO_MM);
  const S = ESPACAMENTO_MAXIMO_MM[criterio.risco.valor];
  const amax = criterio.areaPorSprinkler.valorM2 * 1e6;
  const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === space.levelId).map(contornoEmPlanta);
  const todas: AlternativaDeDistribuicao[] = [];
  for (const sentido of ['X', 'Y'] as const) {
    for (const modo of ['MAXIMO', 'QUADRADO'] as const) {
      const a = alternativa(space.ring, space.holes, vigas, sentido, modo, S, amax);
      // Mesma posição E mesmo sentido = a mesma alternativa (o sentido muda os ramais).
      if (a && a.contagem && !todas.some((b) => b.sentido === a.sentido && b.contagem === a.contagem && b.pontos.every((p, k) => p.x === a.pontos[k].x && p.y === a.pontos[k].y))) todas.push(a);
    }
  }
  todas.sort((a, b) => a.contagem - b.contagem || a.comprimentoDosRamaisM - b.comprimentoDosRamaisM || a.chave.localeCompare(b.chave));
  return { spaceId, levelId: space.levelId, cotaMm, alternativas: todas, motivo: todas.length ? null : 'o ambiente é pequeno demais para a malha' };
}

/** Os comandos da alternativa escolhida: um sprinkler por ponto, na cota do plano (um lote, um Ctrl+Z). */
export function comandosDaDistribuicao(plano: PlanoDeSprinklers, alt: AlternativaDeDistribuicao, fatorK?: number): Command[] {
  return alt.pontos.map(
    (at) =>
      ({
        type: 'AddTerminal',
        levelId: plano.levelId,
        disciplina: 'INCENDIO',
        tipo: 'SPRINKLER',
        tipoHidraulico: 'SPRINKLER',
        at: { ...at },
        cotaMm: plano.cotaMm,
        ...(fatorK != null ? { fatorK } : {}),
      }) as Command,
  );
}
